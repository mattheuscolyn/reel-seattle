"""Discrete-time remaining-run survival model.

Training/backtest live here. Production inference loads the frozen JSON
artifact via ``leaving_soon_frozen`` and must not refit on new outcomes.
"""

from __future__ import annotations

import csv
import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from reel_seattle.analysis.amc_run_lifecycle import (
    FEATURE_FIELDS,
    LABEL_FIELDS,
    QUALITY_HIGH_CONFIDENCE_PIT,
    QUALITY_USABLE_14DAY,
)

SCHEMA_VERSION = "1.0.0"
RANDOM_SEED = 42
PRIMARY_IDENTITY = "source_film_id"
ACCEPTABLE_QUALITY = frozenset({QUALITY_USABLE_14DAY, QUALITY_HIGH_CONFIDENCE_PIT})
ACCEPTABLE_OUTCOME = frozenset({"observed", "right_censored"})
NORMAL_FIRST_RUN = "probable_normal_first_run"
DEFAULT_HORIZON_DAYS = 21
DEFAULT_BIN_SIZE = 1
DEFAULT_TRAIN_END = date(2026, 7, 27)
DEFAULT_VAL_END = date(2026, 8, 14)

FORBIDDEN_MODEL_INPUTS = LABEL_FIELDS | {
    "run_end_date",
    "true_run_length_days",
    "remaining_days",
    "event_observed",
    "right_censored",
    "outcome_quality",
    "last_seen_date",
    "last_seen_at",
}

CONTINUOUS_FEATURES = (
    "days_since_run_start",
    "observations_since_run_start",
    "theater_count",
    "showtime_count",
    "days_with_announced_showtimes",
    "announced_horizon_days",
    "showtimes_per_active_day",
    "weekend_showtime_count",
    "prime_time_showtime_count",
    "premium_format_count",
    "premium_format_share",
    "weekend_share",
    "prime_share",
    "delta_theater_count",
    "delta_showtime_count",
    "farthest_show_date_delta",
    "days_to_wednesday",
)

BINARY_FEATURES = (
    "left_truncated",
    "lost_theater_since_prior",
    "lost_weekend_coverage",
    "lost_prime_time_coverage",
    "missing_prior",
    "horizon_at_ceiling",
    "has_weekend",
    "low_footprint",
    "is_special",
    "is_first_week",
)

RUN_TYPE_GROUPS = ("first_run", "rerelease", "event_or_special")

FEATURE_FAMILIES = {
    "age": ("days_since_run_start", "observations_since_run_start", "left_truncated", "is_first_week"),
    "footprint": (
        "theater_count",
        "showtime_count",
        "days_with_announced_showtimes",
        "announced_horizon_days",
        "showtimes_per_active_day",
        "weekend_showtime_count",
        "prime_time_showtime_count",
        "premium_format_count",
        "premium_format_share",
        "weekend_share",
        "prime_share",
        "horizon_at_ceiling",
        "has_weekend",
        "low_footprint",
    ),
    "trajectory": (
        "delta_theater_count",
        "delta_showtime_count",
        "farthest_show_date_delta",
        "lost_theater_since_prior",
        "lost_weekend_coverage",
        "lost_prime_time_coverage",
        "missing_prior",
    ),
    "run_type": ("is_special", "grp_first_run", "grp_rerelease", "grp_event_or_special"),
    "calendar": ("days_to_wednesday", "weekday"),
}

ABLATION_SEQUENCE = (
    "age",
    "age+footprint",
    "age+footprint+trajectory",
    "age+footprint+trajectory+run_type",
    "age+footprint+trajectory+run_type+calendar",
)


@dataclass
class SurvivalObservation:
    observation_date: date
    run_id: str
    product_id: str
    title: str
    run_type: str
    identity_kind: str
    identity_confidence: str
    observation_quality: str
    outcome_quality: str
    remaining_days: int | None
    event_observed: bool
    right_censored: bool
    left_truncated: bool
    historical_horizon_truncated: bool
    announced_horizon_days: int
    days_since_run_start: int
    observations_since_run_start: int
    theater_count: int
    showtime_count: int
    days_with_announced_showtimes: int
    showtimes_per_active_day: float
    weekend_showtime_count: int
    prime_time_showtime_count: int
    premium_format_count: int
    premium_format_share: float
    delta_theater_count: int | None
    delta_showtime_count: int | None
    farthest_show_date_delta: int | None
    lost_theater_since_prior: bool
    lost_weekend_coverage: bool
    lost_prime_time_coverage: bool
    raw: dict[str, str] = field(default_factory=dict)

    @property
    def is_special(self) -> bool:
        return self.run_type != NORMAL_FIRST_RUN

    @property
    def run_type_group(self) -> str:
        if self.run_type == NORMAL_FIRST_RUN:
            return "first_run"
        if self.run_type == "rerelease_anniversary":
            return "rerelease"
        return "event_or_special"


@dataclass
class PersonPeriod:
    observation_date: date
    run_id: str
    period: int
    event: int
    features: dict[str, float]
    is_special: bool
    event_observed: bool
    remaining_days: int | None
    follow_up_days: int


@dataclass
class SurvivalCurve:
    hazards: list[float]
    survival: list[float]
    bin_size: int
    horizon_days: int
    p_end_within: dict[int, float]
    median_remaining_days: float | None
    expected_remaining_days: float | None
    median_beyond_horizon: bool


@dataclass
class SplitBundle:
    train: list[SurvivalObservation]
    val: list[SurvivalObservation]
    test: list[SurvivalObservation]
    train_end: date
    val_end: date
    as_of: date


def _parse_bool(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def _parse_opt_int(value: Any) -> int | None:
    text = str(value).strip() if value is not None else ""
    if not text:
        return None
    return int(float(text))


def _parse_opt_float(value: Any) -> float | None:
    text = str(value).strip() if value is not None else ""
    if not text:
        return None
    return float(text)


def _parse_date(value: Any) -> date:
    return date.fromisoformat(str(value).strip()[:10])


def days_to_wednesday(observation_date: date) -> int:
    """Days until the next Wednesday; 0 on Wednesday."""
    return (2 - observation_date.weekday()) % 7


def follow_up_days(row: SurvivalObservation, as_of: date) -> int:
    """Days of known survival after T for discrete-time expansion."""
    if row.event_observed and row.remaining_days is not None:
        return row.remaining_days
    return max(0, (as_of - row.observation_date).days)


def run_type_group(run_type: str) -> str:
    if run_type == NORMAL_FIRST_RUN:
        return "first_run"
    if run_type == "rerelease_anniversary":
        return "rerelease"
    return "event_or_special"


def observation_from_mapping(raw: Mapping[str, Any]) -> SurvivalObservation:
    remaining = _parse_opt_int(raw.get("remaining_days"))
    event_observed = _parse_bool(raw.get("event_observed"))
    return SurvivalObservation(
        observation_date=_parse_date(raw["observation_date"]),
        run_id=str(raw.get("run_id") or ""),
        product_id=str(raw.get("product_id") or ""),
        title=str(raw.get("title") or ""),
        run_type=str(raw.get("run_type") or "unknown_other_special"),
        identity_kind=str(raw.get("identity_kind") or ""),
        identity_confidence=str(raw.get("identity_confidence") or ""),
        observation_quality=str(raw.get("observation_quality") or ""),
        outcome_quality=str(raw.get("outcome_quality") or ""),
        remaining_days=remaining,
        event_observed=event_observed,
        right_censored=_parse_bool(raw.get("right_censored")),
        left_truncated=_parse_bool(raw.get("left_truncated")),
        historical_horizon_truncated=_parse_bool(raw.get("historical_horizon_truncated")),
        announced_horizon_days=int(_parse_opt_int(raw.get("announced_horizon_days")) or 0),
        days_since_run_start=int(_parse_opt_int(raw.get("days_since_run_start")) or 0),
        observations_since_run_start=int(_parse_opt_int(raw.get("observations_since_run_start")) or 1),
        theater_count=int(_parse_opt_int(raw.get("theater_count")) or 0),
        showtime_count=int(_parse_opt_int(raw.get("showtime_count")) or 0),
        days_with_announced_showtimes=int(_parse_opt_int(raw.get("days_with_announced_showtimes")) or 0),
        showtimes_per_active_day=float(_parse_opt_float(raw.get("showtimes_per_active_day")) or 0.0),
        weekend_showtime_count=int(_parse_opt_int(raw.get("weekend_showtime_count")) or 0),
        prime_time_showtime_count=int(_parse_opt_int(raw.get("prime_time_showtime_count")) or 0),
        premium_format_count=int(_parse_opt_int(raw.get("premium_format_count")) or 0),
        premium_format_share=float(_parse_opt_float(raw.get("premium_format_share")) or 0.0),
        delta_theater_count=_parse_opt_int(raw.get("delta_theater_count")),
        delta_showtime_count=_parse_opt_int(raw.get("delta_showtime_count")),
        farthest_show_date_delta=_parse_opt_int(raw.get("farthest_show_date_delta")),
        lost_theater_since_prior=_parse_bool(raw.get("lost_theater_since_prior")),
        lost_weekend_coverage=_parse_bool(raw.get("lost_weekend_coverage")),
        lost_prime_time_coverage=_parse_bool(raw.get("lost_prime_time_coverage")),
        raw={str(k): "" if v is None else str(v) for k, v in raw.items()},
    )


def make_observation(**kwargs: Any) -> SurvivalObservation:
    """Test helper with leakage-safe defaults."""
    obs_date = kwargs.pop("observation_date", date(2026, 7, 10))
    if isinstance(obs_date, str):
        obs_date = date.fromisoformat(obs_date)
    payload = {
        "observation_date": obs_date.isoformat(),
        "run_id": kwargs.pop("run_id", "100#01"),
        "product_id": kwargs.pop("product_id", "100"),
        "title": kwargs.pop("title", "Normal Film"),
        "run_type": kwargs.pop("run_type", NORMAL_FIRST_RUN),
        "identity_kind": kwargs.pop("identity_kind", PRIMARY_IDENTITY),
        "identity_confidence": kwargs.pop("identity_confidence", "high"),
        "observation_quality": kwargs.pop("observation_quality", QUALITY_USABLE_14DAY),
        "outcome_quality": kwargs.pop("outcome_quality", "observed"),
        "remaining_days": kwargs.pop("remaining_days", 7),
        "event_observed": kwargs.pop("event_observed", True),
        "right_censored": kwargs.pop("right_censored", False),
        "left_truncated": kwargs.pop("left_truncated", False),
        "historical_horizon_truncated": kwargs.pop("historical_horizon_truncated", True),
        "announced_horizon_days": kwargs.pop("announced_horizon_days", 13),
        "days_since_run_start": kwargs.pop("days_since_run_start", 5),
        "observations_since_run_start": kwargs.pop("observations_since_run_start", 3),
        "theater_count": kwargs.pop("theater_count", 4),
        "showtime_count": kwargs.pop("showtime_count", 12),
        "days_with_announced_showtimes": kwargs.pop("days_with_announced_showtimes", 7),
        "showtimes_per_active_day": kwargs.pop("showtimes_per_active_day", 1.7),
        "weekend_showtime_count": kwargs.pop("weekend_showtime_count", 4),
        "prime_time_showtime_count": kwargs.pop("prime_time_showtime_count", 6),
        "premium_format_count": kwargs.pop("premium_format_count", 1),
        "premium_format_share": kwargs.pop("premium_format_share", 0.1),
        "delta_theater_count": kwargs.pop("delta_theater_count", 0),
        "delta_showtime_count": kwargs.pop("delta_showtime_count", -1),
        "farthest_show_date_delta": kwargs.pop("farthest_show_date_delta", 1),
        "lost_theater_since_prior": kwargs.pop("lost_theater_since_prior", False),
        "lost_weekend_coverage": kwargs.pop("lost_weekend_coverage", False),
        "lost_prime_time_coverage": kwargs.pop("lost_prime_time_coverage", False),
    }
    payload.update(kwargs)
    return observation_from_mapping(payload)


def load_observations_csv(path: Path) -> list[SurvivalObservation]:
    rows: list[SurvivalObservation] = []
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            rows.append(observation_from_mapping(raw))
    return rows


def filter_primary_observations(
    rows: Sequence[SurvivalObservation],
) -> tuple[list[SurvivalObservation], list[dict[str, Any]]]:
    """Apply the v1 fit filter and return kept rows plus an accounting table."""
    accounting: list[dict[str, Any]] = [{"step": "all_observations", "dropped": 0, "remaining": len(rows)}]
    kept = list(rows)

    def _drop(step: str, predicate) -> None:
        nonlocal kept
        before = len(kept)
        kept = [row for row in kept if not predicate(row)]
        accounting.append({"step": step, "dropped": before - len(kept), "remaining": len(kept)})

    _drop("not_source_film_id_identity", lambda row: row.identity_kind != PRIMARY_IDENTITY)
    _drop(
        "title_fallback_or_title_prefix",
        lambda row: row.identity_kind != PRIMARY_IDENTITY or str(row.product_id).startswith("title:"),
    )
    _drop("observation_quality_not_pit", lambda row: row.observation_quality not in ACCEPTABLE_QUALITY)
    _drop("outcome_not_observed_or_censored", lambda row: row.outcome_quality not in ACCEPTABLE_OUTCOME)
    _drop("uncensored_missing_remaining_days", lambda row: row.event_observed and row.remaining_days is None)
    return kept, accounting


def summarize_cohort(rows: Sequence[SurvivalObservation]) -> dict[str, Any]:
    return {
        "rows": len(rows),
        "unique_runs": len({row.run_id for row in rows}),
        "observed_events": sum(1 for row in rows if row.event_observed),
        "censored_rows": sum(1 for row in rows if row.right_censored),
        "left_truncated_rows": sum(1 for row in rows if row.left_truncated),
        "horizon_truncated_rows": sum(1 for row in rows if row.historical_horizon_truncated),
        "normal_first_run_rows": sum(1 for row in rows if not row.is_special),
        "special_rows": sum(1 for row in rows if row.is_special),
        "identity_kind": dict(Counter(row.identity_kind for row in rows)),
        "observation_quality": dict(Counter(row.observation_quality for row in rows)),
        "run_type": dict(Counter(row.run_type for row in rows)),
        "min_observation_date": min((row.observation_date for row in rows), default=None),
        "max_observation_date": max((row.observation_date for row in rows), default=None),
    }


def dataset_as_of(rows: Sequence[SurvivalObservation]) -> date:
    if not rows:
        raise ValueError("cannot infer as_of from empty observations")
    return max(row.observation_date for row in rows)


def split_by_observation_date(
    rows: Sequence[SurvivalObservation],
    *,
    train_end: date = DEFAULT_TRAIN_END,
    val_end: date = DEFAULT_VAL_END,
) -> SplitBundle:
    """Strict temporal split on observation_date. Train < val < test."""
    if not (train_end < val_end):
        raise ValueError("train_end must be strictly before val_end")
    train = [row for row in rows if row.observation_date <= train_end]
    val = [row for row in rows if train_end < row.observation_date <= val_end]
    test = [row for row in rows if row.observation_date > val_end]
    return SplitBundle(
        train=train,
        val=val,
        test=test,
        train_end=train_end,
        val_end=val_end,
        as_of=dataset_as_of(rows) if rows else val_end,
    )


def assert_temporal_split_integrity(bundle: SplitBundle) -> None:
    """Fail if a later observation appears in an earlier split."""
    if bundle.train and bundle.val:
        if max(row.observation_date for row in bundle.train) > bundle.train_end:
            raise AssertionError("train contains dates after train_end")
        if min(row.observation_date for row in bundle.val) <= bundle.train_end:
            raise AssertionError("val leaks into train window")
    if bundle.val and bundle.test:
        if max(row.observation_date for row in bundle.val) > bundle.val_end:
            raise AssertionError("val contains dates after val_end")
        if min(row.observation_date for row in bundle.test) <= bundle.val_end:
            raise AssertionError("test leaks into validation window")
    for earlier, later in (
        (bundle.train, bundle.val),
        (bundle.val, bundle.test),
        (bundle.train, bundle.test),
    ):
        if not earlier or not later:
            continue
        if max(row.observation_date for row in earlier) >= min(row.observation_date for row in later):
            raise AssertionError("temporal splits overlap")


def covariate_dict(row: SurvivalObservation) -> dict[str, float]:
    """Leakage-safe covariates at T (no remaining_days / run_end)."""
    showtime_count = max(row.showtime_count, 0)
    missing_prior = row.delta_theater_count is None
    weekend_share = (row.weekend_showtime_count / showtime_count) if showtime_count else 0.0
    prime_share = (row.prime_time_showtime_count / showtime_count) if showtime_count else 0.0
    group = row.run_type_group
    values: dict[str, float] = {
        "days_since_run_start": float(row.days_since_run_start),
        "observations_since_run_start": float(row.observations_since_run_start),
        "theater_count": float(row.theater_count),
        "showtime_count": float(row.showtime_count),
        "days_with_announced_showtimes": float(row.days_with_announced_showtimes),
        "announced_horizon_days": float(row.announced_horizon_days),
        "showtimes_per_active_day": float(row.showtimes_per_active_day),
        "weekend_showtime_count": float(row.weekend_showtime_count),
        "prime_time_showtime_count": float(row.prime_time_showtime_count),
        "premium_format_count": float(row.premium_format_count),
        "premium_format_share": float(row.premium_format_share),
        "weekend_share": float(weekend_share),
        "prime_share": float(prime_share),
        "delta_theater_count": float(row.delta_theater_count or 0),
        "delta_showtime_count": float(row.delta_showtime_count or 0),
        "farthest_show_date_delta": float(row.farthest_show_date_delta or 0),
        "days_to_wednesday": float(days_to_wednesday(row.observation_date)),
        "weekday": float(row.observation_date.weekday()),
        "left_truncated": 1.0 if row.left_truncated else 0.0,
        "lost_theater_since_prior": 1.0 if row.lost_theater_since_prior else 0.0,
        "lost_weekend_coverage": 1.0 if row.lost_weekend_coverage else 0.0,
        "lost_prime_time_coverage": 1.0 if row.lost_prime_time_coverage else 0.0,
        "missing_prior": 1.0 if missing_prior else 0.0,
        "horizon_at_ceiling": 1.0 if row.announced_horizon_days >= 13 else 0.0,
        "has_weekend": 1.0 if row.weekend_showtime_count > 0 else 0.0,
        "low_footprint": 1.0 if row.theater_count <= 2 else 0.0,
        "is_special": 1.0 if row.is_special else 0.0,
        "is_first_week": 1.0 if row.days_since_run_start < 7 else 0.0,
        "is_special_x_theater_count": (1.0 if row.is_special else 0.0) * float(row.theater_count),
        "is_special_x_run_age": (1.0 if row.is_special else 0.0) * float(row.days_since_run_start),
    }
    for name in RUN_TYPE_GROUPS:
        values[f"grp_{name}"] = 1.0 if group == name else 0.0
    overlap = set(values) & FORBIDDEN_MODEL_INPUTS
    if overlap:
        raise AssertionError(f"label fields leaked into covariates: {sorted(overlap)}")
    return values


def n_bins(horizon_days: int, bin_size: int) -> int:
    if bin_size < 1 or horizon_days < 0:
        raise ValueError("horizon_days and bin_size must be non-negative, bin_size >= 1")
    return horizon_days // bin_size + (1 if horizon_days % bin_size else 0) or 1


def expand_person_periods(
    row: SurvivalObservation,
    *,
    as_of: date,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    bin_size: int = DEFAULT_BIN_SIZE,
) -> list[PersonPeriod]:
    """Expand one observation into discrete-time hazard rows.

    Observed event at remaining_days=r contributes event=1 in the bin containing r
    and event=0 in earlier bins. Censored rows contribute event=0 for bins fully
    elapsed before follow-up, and never an event=1.
    """
    bins = n_bins(horizon_days, bin_size)
    covariates = covariate_dict(row)
    follow = follow_up_days(row, as_of)
    periods: list[PersonPeriod] = []

    def _features_for(period: int) -> dict[str, float]:
        feats = dict(covariates)
        feats["period"] = float(period)
        for idx in range(bins):
            feats[f"period_{idx}"] = 1.0 if idx == period else 0.0
        bad = set(feats) & FORBIDDEN_MODEL_INPUTS
        if bad:
            raise AssertionError(f"label fields leaked into person-period features: {sorted(bad)}")
        return feats

    if row.event_observed and row.remaining_days is not None:
        event_bin = row.remaining_days // bin_size
        if event_bin >= bins:
            last = bins - 1
            for period in range(last + 1):
                periods.append(
                    PersonPeriod(
                        observation_date=row.observation_date,
                        run_id=row.run_id,
                        period=period,
                        event=0,
                        features=_features_for(period),
                        is_special=row.is_special,
                        event_observed=True,
                        remaining_days=row.remaining_days,
                        follow_up_days=follow,
                    )
                )
            return periods
        for period in range(event_bin + 1):
            periods.append(
                PersonPeriod(
                    observation_date=row.observation_date,
                    run_id=row.run_id,
                    period=period,
                    event=1 if period == event_bin else 0,
                    features=_features_for(period),
                    is_special=row.is_special,
                    event_observed=True,
                    remaining_days=row.remaining_days,
                    follow_up_days=follow,
                )
            )
        return periods

    last_event_free_day = follow - 1
    last_complete = -1
    for period in range(bins):
        bin_end_day = (period + 1) * bin_size - 1
        if last_event_free_day >= bin_end_day:
            last_complete = period
        else:
            break
    for period in range(0, last_complete + 1):
        periods.append(
            PersonPeriod(
                observation_date=row.observation_date,
                run_id=row.run_id,
                period=period,
                event=0,
                features=_features_for(period),
                is_special=row.is_special,
                event_observed=False,
                remaining_days=None,
                follow_up_days=follow,
            )
        )
    return periods


def expand_rows(
    rows: Sequence[SurvivalObservation],
    *,
    as_of: date,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    bin_size: int = DEFAULT_BIN_SIZE,
) -> list[PersonPeriod]:
    expanded: list[PersonPeriod] = []
    for row in rows:
        expanded.extend(
            expand_person_periods(row, as_of=as_of, horizon_days=horizon_days, bin_size=bin_size)
        )
    return expanded


def survival_from_hazards(
    hazards: Sequence[float],
    *,
    bin_size: int,
    horizon_days: int,
) -> SurvivalCurve:
    """Monotone survival curve from discrete hazards in [0, 1]."""
    clipped = [min(1.0, max(0.0, float(h))) for h in hazards]
    survival = [1.0]
    running = 1.0
    for hazard in clipped:
        running *= 1.0 - hazard
        running = min(1.0, max(0.0, running))
        survival.append(running)
    for idx in range(1, len(survival)):
        if survival[idx] > survival[idx - 1]:
            survival[idx] = survival[idx - 1]

    def _survive_past_day(day_inclusive: int) -> float:
        """P(remaining_days > day_inclusive)."""
        if day_inclusive < 0:
            return 1.0
        bin_idx = day_inclusive // bin_size
        if bin_idx >= len(clipped):
            return survival[-1]
        return survival[bin_idx + 1]

    p_end = {}
    for horizon in (3, 7, 14, 21):
        p_end[horizon] = 1.0 - _survive_past_day(horizon - 1)

    median = None
    beyond = True
    for day in range(0, horizon_days + 1):
        if _survive_past_day(day) <= 0.5:
            median = float(day)
            beyond = False
            break
    expected = 0.0
    for day in range(0, horizon_days + 1):
        expected += _survive_past_day(day)
    return SurvivalCurve(
        hazards=clipped,
        survival=survival,
        bin_size=bin_size,
        horizon_days=horizon_days,
        p_end_within=p_end,
        median_remaining_days=median,
        expected_remaining_days=float(expected),
        median_beyond_horizon=beyond,
    )


def feature_matrix(
    periods: Sequence[PersonPeriod],
    columns: Sequence[str],
) -> list[list[float]]:
    matrix: list[list[float]] = []
    for period in periods:
        matrix.append([float(period.features.get(name, 0.0)) for name in columns])
    return matrix


def default_feature_columns(n_period_bins: int, families: Sequence[str] | None = None) -> list[str]:
    selected = set()
    active_families = families or ("age", "footprint", "trajectory", "run_type", "calendar")
    for family in active_families:
        selected.update(FEATURE_FAMILIES[family])
    selected.add("is_special_x_theater_count")
    selected.add("is_special_x_run_age")
    columns = [name for name in CONTINUOUS_FEATURES + BINARY_FEATURES if name in selected]
    for name in RUN_TYPE_GROUPS:
        key = f"grp_{name}"
        if key in selected:
            columns.append(key)
    if "is_special_x_theater_count" not in columns:
        if "run_type" in active_families:
            columns.extend(["is_special_x_theater_count", "is_special_x_run_age"])
    columns.append("period")
    for idx in range(n_period_bins):
        columns.append(f"period_{idx}")
    if set(columns) & FORBIDDEN_MODEL_INPUTS:
        raise AssertionError("default feature columns include label fields")
    # de-dupe preserving order
    seen: set[str] = set()
    ordered: list[str] = []
    for name in columns:
        if name in seen:
            continue
        seen.add(name)
        ordered.append(name)
    return ordered


def _require_sklearn():
    try:
        from sklearn.ensemble import HistGradientBoostingClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:  # pragma: no cover - exercised when sklearn missing
        raise RuntimeError(
            "scikit-learn is required for the remaining-run survival experiment"
        ) from exc
    return LogisticRegression, StandardScaler, HistGradientBoostingClassifier


class DiscreteHazardModel:
    """Regularized logistic discrete-time hazard, scaler fit on train only."""

    def __init__(
        self,
        *,
        columns: Sequence[str],
        horizon_days: int = DEFAULT_HORIZON_DAYS,
        bin_size: int = DEFAULT_BIN_SIZE,
        C: float = 1.0,
        seed: int = RANDOM_SEED,
        model_kind: str = "logistic",
    ) -> None:
        self.columns = list(columns)
        self.horizon_days = horizon_days
        self.bin_size = bin_size
        self.C = C
        self.seed = seed
        self.model_kind = model_kind
        self._scaler = None
        self._model = None
        self._continuous_idx = [
            i for i, name in enumerate(self.columns) if name in CONTINUOUS_FEATURES or name == "period"
        ]

    @property
    def n_period_bins(self) -> int:
        return n_bins(self.horizon_days, self.bin_size)

    def fit(self, periods: Sequence[PersonPeriod]) -> DiscreteHazardModel:
        LogisticRegression, StandardScaler, HistGradientBoostingClassifier = _require_sklearn()
        matrix = feature_matrix(periods, self.columns)
        labels = [period.event for period in periods]
        if not matrix:
            raise ValueError("no person-period rows to fit")
        import numpy as np

        x = np.asarray(matrix, dtype=float)
        y = np.asarray(labels, dtype=int)
        self._scaler = StandardScaler()
        x_fit = x.copy()
        if self._continuous_idx:
            x_fit[:, self._continuous_idx] = self._scaler.fit_transform(x[:, self._continuous_idx])
        if self.model_kind == "hgb":
            self._model = HistGradientBoostingClassifier(
                max_depth=3,
                learning_rate=0.08,
                max_iter=80,
                random_state=self.seed,
            )
            self._model.fit(x_fit, y)
        else:
            self._model = LogisticRegression(
                C=self.C,
                solver="lbfgs",
                max_iter=1000,
                random_state=self.seed,
            )
            self._model.fit(x_fit, y)
        return self

    def _transform(self, matrix: list[list[float]]):
        import numpy as np

        x = np.asarray(matrix, dtype=float)
        if self._scaler is not None and self._continuous_idx:
            x = x.copy()
            x[:, self._continuous_idx] = self._scaler.transform(x[:, self._continuous_idx])
        return x

    def predict_hazards_for_row(self, row: SurvivalObservation) -> list[float]:
        if self._model is None:
            raise RuntimeError("model is not fitted")
        covariates = covariate_dict(row)
        import numpy as np

        matrix = []
        for period in range(self.n_period_bins):
            feats = dict(covariates)
            feats["period"] = float(period)
            for idx in range(self.n_period_bins):
                feats[f"period_{idx}"] = 1.0 if idx == period else 0.0
            matrix.append([float(feats.get(name, 0.0)) for name in self.columns])
        x = self._transform(matrix)
        proba = self._model.predict_proba(x)
        if getattr(self._model, "classes_", None) is not None and 1 in list(self._model.classes_):
            class_index = list(self._model.classes_).index(1)
            hazards = [float(row_p[class_index]) for row_p in proba]
        else:
            hazards = [0.0] * self.n_period_bins
        _ = np
        return hazards

    def predict_curve(self, row: SurvivalObservation) -> SurvivalCurve:
        return survival_from_hazards(
            self.predict_hazards_for_row(row),
            bin_size=self.bin_size,
            horizon_days=self.horizon_days,
        )

    def linear_export(self) -> dict[str, Any]:
        """Export scaler + logistic weights for sklearn-free production inference."""
        if self.model_kind != "logistic" or self._model is None or self._scaler is None:
            raise RuntimeError("linear export requires a fitted logistic hazard model")
        coef = getattr(self._model, "coef_", None)
        intercept = getattr(self._model, "intercept_", None)
        if coef is None or intercept is None:
            raise RuntimeError("fitted logistic model is missing coefficients")
        mean = getattr(self._scaler, "mean_", None)
        scale = getattr(self._scaler, "scale_", None)
        if mean is None or scale is None:
            raise RuntimeError("fitted scaler is missing mean_/scale_")
        return {
            "columns": list(self.columns),
            "continuous_idx": list(self._continuous_idx),
            "scaler_mean": [float(v) for v in mean],
            "scaler_scale": [float(v) if float(v) else 1.0 for v in scale],
            "coefficients": [float(v) for v in coef[0]],
            "intercept": float(intercept[0]),
            "horizon_days": int(self.horizon_days),
            "bin_size": int(self.bin_size),
            "C": float(self.C),
            "seed": int(self.seed),
        }

    def standardized_coefficients(self) -> list[dict[str, Any]]:
        if self.model_kind != "logistic" or self._model is None:
            return []
        coef = getattr(self._model, "coef_", None)
        if coef is None:
            return []
        weights = coef[0]
        rows = [
            {"feature": name, "coefficient": float(weight)}
            for name, weight in zip(self.columns, weights)
        ]
        rows.sort(key=lambda item: abs(item["coefficient"]), reverse=True)
        return rows


def binary_outcome(row: SurvivalObservation, *, horizon: int, as_of: date) -> int | None:
    """1 if remaining_days < horizon, 0 if survived horizon, None if unknown."""
    if row.event_observed and row.remaining_days is not None:
        return 1 if row.remaining_days < horizon else 0
    follow = follow_up_days(row, as_of)
    if follow >= horizon:
        return 0
    return None


def confusion(y_true: Sequence[int], y_hat: Sequence[int]) -> dict[str, int]:
    tp = sum(1 for y, p in zip(y_true, y_hat) if y == 1 and p == 1)
    fp = sum(1 for y, p in zip(y_true, y_hat) if y == 0 and p == 1)
    tn = sum(1 for y, p in zip(y_true, y_hat) if y == 0 and p == 0)
    fn = sum(1 for y, p in zip(y_true, y_hat) if y == 1 and p == 0)
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn}


def _safe_div(num: float, den: float) -> float:
    return float(num) / float(den) if den else 0.0


def classification_metrics(y_true: Sequence[int], scores: Sequence[float], *, threshold: float = 0.5) -> dict[str, float]:
    y_hat = [1 if score >= threshold else 0 for score in scores]
    counts = confusion(y_true, y_hat)
    prec = _safe_div(counts["tp"], counts["tp"] + counts["fp"])
    rec = _safe_div(counts["tp"], counts["tp"] + counts["fn"])
    base = _safe_div(sum(y_true), len(y_true)) if y_true else 0.0
    return {
        **{k: float(v) for k, v in counts.items()},
        "precision": prec,
        "recall": rec,
        "f1": _safe_div(2 * prec * rec, prec + rec) if (prec + rec) else 0.0,
        "base_rate": base,
        "lift": _safe_div(prec, base) if base else 0.0,
        "n": float(len(y_true)),
        "threshold": float(threshold),
        "roc_auc": roc_auc(y_true, scores),
        "pr_auc": pr_auc(y_true, scores),
        "brier": brier_score(y_true, scores),
    }


def roc_auc(y_true: Sequence[int], scores: Sequence[float]) -> float:
    positives = [s for y, s in zip(y_true, scores) if y == 1]
    negatives = [s for y, s in zip(y_true, scores) if y == 0]
    if not positives or not negatives:
        return float("nan")
    greater = 0.0
    ties = 0.0
    for p in positives:
        for n in negatives:
            if p > n:
                greater += 1
            elif p == n:
                ties += 1
    return (greater + 0.5 * ties) / (len(positives) * len(negatives))


def pr_auc(y_true: Sequence[int], scores: Sequence[float]) -> float:
    pairs = sorted(zip(scores, y_true), reverse=True)
    tp = 0
    fp = 0
    n_pos = sum(y_true)
    if not n_pos or n_pos == len(y_true):
        return float("nan")
    prev_recall = 0.0
    auc = 0.0
    last_prec = 1.0
    for _score, label in pairs:
        if label == 1:
            tp += 1
        else:
            fp += 1
        prec = tp / (tp + fp)
        rec = tp / n_pos
        auc += (rec - prev_recall) * (prec + last_prec) / 2.0
        prev_recall = rec
        last_prec = prec
    return float(auc)


def brier_score(y_true: Sequence[int], scores: Sequence[float]) -> float:
    if not y_true:
        return float("nan")
    return sum((s - y) ** 2 for y, s in zip(y_true, scores)) / len(y_true)


def reliability_table(y_true: Sequence[int], scores: Sequence[float], *, bins: int = 5) -> list[dict[str, float]]:
    if not y_true:
        return []
    rows = []
    for idx in range(bins):
        lo = idx / bins
        hi = (idx + 1) / bins
        members = [(y, s) for y, s in zip(y_true, scores) if (s >= lo and s < hi) or (idx == bins - 1 and s == 1)]
        if not members:
            continue
        rows.append(
            {
                "bin": idx,
                "lo": lo,
                "hi": hi,
                "n": float(len(members)),
                "mean_predicted": sum(s for _y, s in members) / len(members),
                "mean_observed": sum(y for y, _s in members) / len(members),
            }
        )
    return rows


def threshold_for_precision(
    y_true: Sequence[int],
    scores: Sequence[float],
    *,
    min_precision: float,
) -> dict[str, float]:
    """Highest-recall threshold on this set with precision >= min_precision."""
    candidates = sorted(set(scores), reverse=True)
    best = {"threshold": 1.1, "precision": 0.0, "recall": 0.0, "coverage": 0.0, "n_predicted_positive": 0.0}
    for threshold in candidates:
        metrics = classification_metrics(y_true, scores, threshold=threshold)
        if metrics["precision"] + 1e-12 >= min_precision and metrics["recall"] >= best["recall"]:
            best = {
                "threshold": float(threshold),
                "precision": float(metrics["precision"]),
                "recall": float(metrics["recall"]),
                "coverage": float(metrics["recall"]),
                "n_predicted_positive": float(metrics["tp"] + metrics["fp"]),
            }
    return best


def concordance_index(
    times: Sequence[float],
    events: Sequence[int],
    predicted_remaining: Sequence[float],
) -> float:
    """Harrell-style C: higher predicted remaining should pair with longer times."""
    n = len(times)
    concordant = 0.0
    comparable = 0.0
    for i in range(n):
        for j in range(i + 1, n):
            t_i, t_j = times[i], times[j]
            e_i, e_j = events[i], events[j]
            if e_i and t_i < t_j:
                comparable += 1
                if predicted_remaining[i] < predicted_remaining[j]:
                    concordant += 1
                elif predicted_remaining[i] == predicted_remaining[j]:
                    concordant += 0.5
            elif e_j and t_j < t_i:
                comparable += 1
                if predicted_remaining[j] < predicted_remaining[i]:
                    concordant += 1
                elif predicted_remaining[i] == predicted_remaining[j]:
                    concordant += 0.5
    return concordant / comparable if comparable else float("nan")


def remaining_error_metrics(
    rows: Sequence[SurvivalObservation],
    predicted: Sequence[float | None],
) -> dict[str, float]:
    abs_err: list[float] = []
    by_age: dict[str, list[float]] = defaultdict(list)
    for row, pred in zip(rows, predicted):
        if not row.event_observed or row.remaining_days is None or pred is None:
            continue
        err = abs(pred - row.remaining_days)
        abs_err.append(err)
        if row.days_since_run_start < 7:
            by_age["age_0_6"].append(err)
        elif row.days_since_run_start < 14:
            by_age["age_7_13"].append(err)
        else:
            by_age["age_14_plus"].append(err)
    return {
        "n_uncensored": float(len(abs_err)),
        "mae": statistics.fmean(abs_err) if abs_err else float("nan"),
        "median_ae": float(statistics.median(abs_err)) if abs_err else float("nan"),
        **{f"mae_{bucket}": statistics.fmean(vals) for bucket, vals in by_age.items() if vals},
    }


def kaplan_meier(times: Sequence[int], events: Sequence[int]) -> dict[int, float]:
    n = len(times)
    if not n:
        return {0: 1.0}
    by_time: dict[int, list[int]] = defaultdict(list)
    for time, event in zip(times, events):
        by_time[int(time)].append(int(event))
    at_risk = n
    survival = 1.0
    curve = {0: 1.0}
    for time in sorted(by_time):
        died = sum(by_time[time])
        if at_risk > 0:
            survival *= 1.0 - died / at_risk
        curve[time] = survival
        at_risk -= len(by_time[time])
    return curve


def km_median(curve: Mapping[int, float], *, horizon: int) -> float | None:
    for day in range(0, horizon + 1):
        s = 1.0
        for t, value in sorted(curve.items()):
            if t <= day:
                s = value
            else:
                break
        if s <= 0.5:
            return float(day)
    return None


def _age_bucket(days_since_start: int) -> str:
    if days_since_start < 4:
        return "0_3"
    if days_since_start < 8:
        return "4_7"
    if days_since_start < 15:
        return "8_14"
    return "15_plus"


def _footprint_bucket(theater_count: int) -> str:
    if theater_count <= 1:
        return "1"
    if theater_count == 2:
        return "2"
    if theater_count <= 4:
        return "3_4"
    return "5_plus"


class AgeOnlyBaseline:
    def __init__(self, *, horizon_days: int = DEFAULT_HORIZON_DAYS) -> None:
        self.horizon_days = horizon_days
        self.medians: dict[str, float] = {}
        self.global_median: float = 7.0

    def fit(self, rows: Sequence[SurvivalObservation]) -> AgeOnlyBaseline:
        buckets: dict[str, list[int]] = defaultdict(list)
        all_times: list[int] = []
        for row in rows:
            if row.event_observed and row.remaining_days is not None:
                buckets[_age_bucket(row.days_since_run_start)].append(row.remaining_days)
                all_times.append(row.remaining_days)
        self.medians = {key: float(statistics.median(vals)) for key, vals in buckets.items() if vals}
        self.global_median = float(statistics.median(all_times)) if all_times else 7.0
        return self

    def predict_median(self, row: SurvivalObservation) -> float:
        return self.medians.get(_age_bucket(row.days_since_run_start), self.global_median)


class FootprintBaseline:
    def __init__(self) -> None:
        self.medians: dict[str, float] = {}
        self.global_median = 7.0

    def fit(self, rows: Sequence[SurvivalObservation]) -> FootprintBaseline:
        buckets: dict[str, list[int]] = defaultdict(list)
        all_times: list[int] = []
        for row in rows:
            if row.event_observed and row.remaining_days is not None:
                key = f"{_footprint_bucket(row.theater_count)}:{1 if row.weekend_showtime_count else 0}"
                buckets[key].append(row.remaining_days)
                all_times.append(row.remaining_days)
        self.medians = {key: float(statistics.median(vals)) for key, vals in buckets.items() if vals}
        self.global_median = float(statistics.median(all_times)) if all_times else 7.0
        return self

    def predict_median(self, row: SurvivalObservation) -> float:
        key = f"{_footprint_bucket(row.theater_count)}:{1 if row.weekend_showtime_count else 0}"
        return self.medians.get(key, self.global_median)

    def exit_score(self, row: SurvivalObservation) -> float:
        """Higher = more near-term exit risk. Not a probability."""
        return (
            -2.0 * row.theater_count
            - 0.05 * row.showtime_count
            - 3.0 * (1.0 if row.weekend_showtime_count else 0.0)
            - 1.0 * row.days_with_announced_showtimes
        )


class SegmentKMBaseline:
    def __init__(self, *, horizon_days: int = DEFAULT_HORIZON_DAYS) -> None:
        self.horizon_days = horizon_days
        self.curves: dict[str, dict[int, float]] = {}

    def _key(self, row: SurvivalObservation) -> str:
        special = "special" if row.is_special else "first_run"
        return f"{special}|{_age_bucket(row.days_since_run_start)}"

    def fit(self, rows: Sequence[SurvivalObservation], *, as_of: date) -> SegmentKMBaseline:
        grouped: dict[str, list[tuple[int, int]]] = defaultdict(list)
        for row in rows:
            grouped[self._key(row)].append(
                (follow_up_days(row, as_of), 1 if row.event_observed else 0)
            )
        for key, pairs in grouped.items():
            times = [t for t, _e in pairs]
            events = [e for _t, e in pairs]
            self.curves[key] = kaplan_meier(times, events)
        return self

    def predict_median(self, row: SurvivalObservation) -> float | None:
        curve = self.curves.get(self._key(row), {})
        median = km_median(curve, horizon=self.horizon_days)
        return median

    def p_end_within(self, row: SurvivalObservation, horizon: int) -> float:
        curve = self.curves.get(self._key(row), {0: 1.0})
        survival = 1.0
        for time, value in sorted(curve.items()):
            if time <= horizon - 1:
                survival = value
        return 1.0 - survival


def low_footprint_not_first_week(row: SurvivalObservation) -> int:
    """Adapted weekly Leaving Soon heuristic as a binary near-term exit flag."""
    return int(row.theater_count <= 2 and row.days_since_run_start >= 7 and not row.is_special)


def platt_calibrator(scores: Sequence[float], y_true: Sequence[int]):
    """Fit a 1-D logistic map on validation scores only."""
    LogisticRegression, _scaler, _hgb = _require_sklearn()
    import numpy as np

    if len(set(y_true)) < 2:
        return None
    model = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000, random_state=RANDOM_SEED)
    x = np.asarray(scores, dtype=float).reshape(-1, 1)
    y = np.asarray(y_true, dtype=int)
    model.fit(x, y)
    return model


def platt_linear_export(model) -> dict[str, float] | None:
    """Export 1-D Platt logistic parameters. ``None`` if calibrator was skipped."""
    if model is None:
        return None
    coef = getattr(model, "coef_", None)
    intercept = getattr(model, "intercept_", None)
    if coef is None or intercept is None:
        return None
    return {
        "coefficient": float(coef[0][0]),
        "intercept": float(intercept[0]),
    }


def apply_platt(model, scores: Sequence[float]) -> list[float]:
    import numpy as np

    if model is None:
        return [float(s) for s in scores]
    x = np.asarray(scores, dtype=float).reshape(-1, 1)
    proba = model.predict_proba(x)
    class_index = list(model.classes_).index(1) if 1 in list(model.classes_) else -1
    return [float(row[class_index]) for row in proba]


def conformal_residual_interval(
    residuals: Sequence[float],
    *,
    alpha: float = 0.2,
) -> dict[str, float]:
    """Split-conformal half-width from absolute residuals (uncensored only)."""
    if not residuals:
        return {"n": 0.0, "alpha": alpha, "half_width": float("nan"), "defensible": 0.0}
    ordered = sorted(abs(float(r)) for r in residuals)
    q_level = math.ceil((len(ordered) + 1) * (1 - alpha)) / len(ordered)
    q_level = min(1.0, q_level)
    index = min(len(ordered) - 1, max(0, math.ceil(q_level * len(ordered)) - 1))
    return {
        "n": float(len(ordered)),
        "alpha": float(alpha),
        "half_width": float(ordered[index]),
        "empirical_quantile": q_level,
        "defensible": 0.0,
        "note": "Uncensored residuals only; formal coverage is not claimed.",
    }


def evaluate_binary_horizon(
    rows: Sequence[SurvivalObservation],
    probabilities: Sequence[float],
    *,
    horizon: int,
    as_of: date,
    threshold: float = 0.5,
) -> dict[str, Any]:
    y: list[int] = []
    p: list[float] = []
    for row, prob in zip(rows, probabilities):
        label = binary_outcome(row, horizon=horizon, as_of=as_of)
        if label is None:
            continue
        y.append(label)
        p.append(prob)
    metrics = classification_metrics(y, p, threshold=threshold)
    metrics["reliability"] = reliability_table(y, p)
    metrics["horizon"] = horizon
    return metrics


def json_ready(value: Any) -> Any:
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_ready(item) for item in value]
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value
