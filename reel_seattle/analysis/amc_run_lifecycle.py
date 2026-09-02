"""AMC theatrical-run lifecycle audit for remaining-days / time-to-event modeling.

Reconstructs Seattle-area AMC network runs from point-in-time snapshots,
measures disappear/return gaps, and builds leakage-safe observation rows.

Does not train a model. Does not assign UI buckets. Labels may use future
occurred showtimes; features at observation T must not.
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
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.amc_footprint import (
    MATINEE_END_MIN,
    PRIME_END_MIN,
    ParsedSnapshot,
    _amc_movie_id_from_record,
    parse_snapshot_timestamp,
)
from reel_seattle.analysis.amc_wwm_release_audit import classify_product_category
from reel_seattle.analysis.special_screening_flags import classify_run_type
from reel_seattle.normalize import (
    parse_csv_date,
    parse_format_tags,
    parse_show_date,
    parse_time_to_minutes,
    resolve_theater,
    showtime_film_key,
)
from reel_seattle.source_identity import source_film_id_from_history_row

SCHEMA_VERSION = "1.0.0"
SOURCE = "amc"
DEFAULT_GAP_THRESHOLD_DAYS = 14
SENSITIVITY_THRESHOLDS = (1, 2, 7, 14, 21)
LEGACY_FETCH_HORIZON_DAYS = 14
WEEKDAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)

GAP_BUCKETS: tuple[tuple[str, int | None, int | None], ...] = (
    ("1_day", 1, 1),
    ("2_day", 2, 2),
    ("3_to_7_days", 3, 7),
    ("8_to_14_days", 8, 14),
    ("15_to_21_days", 15, 21),
    ("22_to_30_days", 22, 30),
    ("over_30_days", 31, None),
)

RUN_TYPES = (
    "probable_normal_first_run",
    "rerelease_anniversary",
    "family_holiday",
    "anime_event",
    "concert_live_event",
    "awards_limited",
    "qa_fan_mystery",
    "accessibility_special_presentation",
    "unknown_other_special",
)

CATALOG_CATEGORY_TO_RUN_TYPE = {
    "standard": "probable_normal_first_run",
    "q_and_a": "qa_fan_mystery",
    "special_introduction": "qa_fan_mystery",
    "sensory_friendly": "accessibility_special_presentation",
    "open_caption": "accessibility_special_presentation",
    "dubbed_or_subtitled": "unknown_other_special",
    "anniversary_or_rerelease": "rerelease_anniversary",
    "mystery_screening": "qa_fan_mystery",
    "concert_or_event": "concert_live_event",
    "marathon_or_multi_feature": "unknown_other_special",
    "other_special": "unknown_other_special",
}

TITLE_RUN_TYPE_TO_LIFECYCLE = {
    "normal_first_run": "probable_normal_first_run",
    "family_holiday_title": "family_holiday",
    "holiday_re_release": "rerelease_anniversary",
    "anniversary_re_release": "rerelease_anniversary",
    "classic_revival": "rerelease_anniversary",
    "fan_event": "qa_fan_mystery",
    "opening_night": "qa_fan_mystery",
    "concert_live_encore": "concert_live_event",
    "anime_special_engagement": "anime_event",
    "awards_season_limited": "awards_limited",
    "foreign_language_limited": "awards_limited",
    "sensory_friendly": "accessibility_special_presentation",
    "double_feature": "unknown_other_special",
    "special_event": "unknown_other_special",
    "unknown": "unknown_other_special",
}

PREMIUM_FORMAT_SLUGS = {
    "imax",
    "imax-3d",
    "dolby",
    "dolby-cinema",
    "dolby-atmos",
    "prime",
    "reald-3d",
    "3d",
}

QUALITY_HIGH_CONFIDENCE_PIT = "high_confidence_pit"
QUALITY_USABLE_14DAY = "usable_14day_truncated"
QUALITY_USABLE_14DAY_TITLE = "usable_14day_truncated_title_identity"
QUALITY_RECONSTRUCTED = "reconstructed_partial"
QUALITY_UNSUITABLE = "unsuitable_tte"

LABEL_FIELDS = frozenset(
    {
        "remaining_days",
        "event_observed",
        "right_censored",
        "run_end_date",
        "outcome_quality",
        "true_run_length_days",
    }
)

FEATURE_FIELDS = frozenset(
    {
        "theater_count",
        "showtime_count",
        "days_with_announced_showtimes",
        "earliest_announced_show_date",
        "farthest_announced_show_date",
        "announced_horizon_days",
        "showtimes_per_active_day",
        "weekend_showtime_count",
        "prime_time_showtime_count",
        "premium_format_count",
        "premium_format_share",
        "theater_ids",
        "prior_theater_count",
        "delta_theater_count",
        "prior_showtime_count",
        "delta_showtime_count",
        "lost_theater_since_prior",
        "lost_weekend_coverage",
        "lost_prime_time_coverage",
        "farthest_show_date_delta",
        "days_since_run_start",
        "observations_since_run_start",
        "first_seen_at",
        "run_type",
        "identity_confidence",
    }
)

LEAKAGE_RULES = {
    "safe_at_observation_T": sorted(FEATURE_FIELDS),
    "label_only_may_use_future_occurred_dates": sorted(LABEL_FIELDS),
    "unsafe_as_features": [
        "future snapshots after T",
        "final run length / true_run_length_days",
        "future last_seen_date / run_end_date",
        "theater removals learned after T",
        "post-observation catalog metadata unless historical-as-of state exists",
        "remaining_days (target)",
        "event_observed / right_censored (target helpers)",
    ],
    "catalog_run_type": (
        "Current AMC source-catalog presentation.category is the latest refresh, "
        "not an as-of-T snapshot. Use title-derived run_type as the safe feature; "
        "keep catalog_run_type for audit description only."
    ),
}

OBSERVATION_FIELDNAMES = [
    "observation_at",
    "observation_date",
    "source_film_id",
    "source_release_id",
    "product_id",
    "run_id",
    "run_sequence",
    "title",
    "run_type",
    "catalog_run_type",
    "identity_kind",
    "identity_confidence",
    "theater_count",
    "showtime_count",
    "days_with_announced_showtimes",
    "earliest_announced_show_date",
    "farthest_announced_show_date",
    "announced_horizon_days",
    "showtimes_per_active_day",
    "weekend_showtime_count",
    "prime_time_showtime_count",
    "premium_format_count",
    "premium_format_share",
    "theater_ids",
    "prior_theater_count",
    "delta_theater_count",
    "prior_showtime_count",
    "delta_showtime_count",
    "lost_theater_since_prior",
    "lost_weekend_coverage",
    "lost_prime_time_coverage",
    "farthest_show_date_delta",
    "days_since_run_start",
    "observations_since_run_start",
    "first_seen_at",
    "remaining_days",
    "event_observed",
    "right_censored",
    "left_truncated",
    "run_end_date",
    "run_start_date",
    "true_run_length_days",
    "outcome_quality",
    "observation_quality",
    "historical_horizon_truncated",
    "announced_beyond_legacy_horizon",
    "identity_fallback",
    "catalog_not_historical",
]


@dataclass(frozen=True)
class ShowtimeFact:
    """One enabled-AMC showtime visible in a point-in-time snapshot."""

    observation_date: date
    observation_at: str | None
    show_date: date
    title: str
    source_film_id: str
    source_release_id: str
    theater_id: str
    theater_name: str
    minutes: int | None
    canceled: bool
    premium: bool
    snapshot_format: str
    title_key: str


@dataclass(frozen=True)
class OccurredPerformance:
    """A calendar date that had at least one AMC showtime for a product."""

    show_date: date
    product_id: str
    source_film_id: str
    source_release_id: str
    title: str
    title_key: str
    theater_id: str
    identity_kind: str


@dataclass(frozen=True)
class CatalogProduct:
    source_film_id: str
    source_release_id: str
    title: str
    category: str
    is_special: bool


@dataclass(frozen=True)
class ProductIdentity:
    product_id: str
    identity_kind: str
    identity_confidence: str
    source_film_id: str
    source_release_id: str
    title: str
    title_key: str


@dataclass(frozen=True)
class RunRecord:
    product_id: str
    run_sequence: int
    run_id: str
    source_film_id: str
    source_release_id: str
    title: str
    title_key: str
    identity_kind: str
    identity_confidence: str
    run_type: str
    catalog_run_type: str
    start_date: date
    end_date: date
    occurred_dates: tuple[date, ...]
    theater_ids: tuple[str, ...]
    showtime_count: int
    right_censored: bool
    left_truncated: bool
    one_day: bool
    one_showtime: bool


@dataclass
class GapRecord:
    product_id: str
    title: str
    run_type: str
    identity_kind: str
    source_film_id: str
    source_release_id: str
    previous_date: date
    next_date: date
    dark_days: int
    bucket: str
    overlaps_missing_snapshot: bool
    possibly_missing_snapshot: bool


@dataclass
class ObservationRow:
    observation_at: str | None
    observation_date: date
    source_film_id: str
    source_release_id: str
    product_id: str
    run_id: str
    run_sequence: int
    title: str
    run_type: str
    catalog_run_type: str
    identity_kind: str
    identity_confidence: str
    theater_count: int
    showtime_count: int
    days_with_announced_showtimes: int
    earliest_announced_show_date: date
    farthest_announced_show_date: date
    announced_horizon_days: int
    showtimes_per_active_day: float
    weekend_showtime_count: int
    prime_time_showtime_count: int
    premium_format_count: int
    premium_format_share: float
    theater_ids: tuple[str, ...]
    prior_theater_count: int | None
    delta_theater_count: int | None
    prior_showtime_count: int | None
    delta_showtime_count: int | None
    lost_theater_since_prior: bool
    lost_weekend_coverage: bool
    lost_prime_time_coverage: bool
    farthest_show_date_delta: int | None
    days_since_run_start: int
    observations_since_run_start: int
    first_seen_at: str | None
    remaining_days: int | None
    event_observed: bool
    right_censored: bool
    left_truncated: bool
    run_end_date: date | None
    run_start_date: date
    true_run_length_days: int | None
    outcome_quality: str
    observation_quality: str
    historical_horizon_truncated: bool
    announced_beyond_legacy_horizon: bool
    identity_fallback: bool
    catalog_not_historical: bool
    feature_payload: dict[str, Any] = field(default_factory=dict)

    def to_csv_dict(self) -> dict[str, str]:
        def _opt_int(value: int | None) -> str:
            return "" if value is None else str(value)

        def _opt_date(value: date | None) -> str:
            return "" if value is None else value.isoformat()

        return {
            "observation_at": self.observation_at or "",
            "observation_date": self.observation_date.isoformat(),
            "source_film_id": self.source_film_id,
            "source_release_id": self.source_release_id,
            "product_id": self.product_id,
            "run_id": self.run_id,
            "run_sequence": str(self.run_sequence),
            "title": self.title,
            "run_type": self.run_type,
            "catalog_run_type": self.catalog_run_type,
            "identity_kind": self.identity_kind,
            "identity_confidence": self.identity_confidence,
            "theater_count": str(self.theater_count),
            "showtime_count": str(self.showtime_count),
            "days_with_announced_showtimes": str(self.days_with_announced_showtimes),
            "earliest_announced_show_date": self.earliest_announced_show_date.isoformat(),
            "farthest_announced_show_date": self.farthest_announced_show_date.isoformat(),
            "announced_horizon_days": str(self.announced_horizon_days),
            "showtimes_per_active_day": f"{self.showtimes_per_active_day:.4f}",
            "weekend_showtime_count": str(self.weekend_showtime_count),
            "prime_time_showtime_count": str(self.prime_time_showtime_count),
            "premium_format_count": str(self.premium_format_count),
            "premium_format_share": f"{self.premium_format_share:.4f}",
            "theater_ids": "|".join(self.theater_ids),
            "prior_theater_count": _opt_int(self.prior_theater_count),
            "delta_theater_count": _opt_int(self.delta_theater_count),
            "prior_showtime_count": _opt_int(self.prior_showtime_count),
            "delta_showtime_count": _opt_int(self.delta_showtime_count),
            "lost_theater_since_prior": _bool(self.lost_theater_since_prior),
            "lost_weekend_coverage": _bool(self.lost_weekend_coverage),
            "lost_prime_time_coverage": _bool(self.lost_prime_time_coverage),
            "farthest_show_date_delta": _opt_int(self.farthest_show_date_delta),
            "days_since_run_start": str(self.days_since_run_start),
            "observations_since_run_start": str(self.observations_since_run_start),
            "first_seen_at": self.first_seen_at or "",
            "remaining_days": _opt_int(self.remaining_days),
            "event_observed": _bool(self.event_observed),
            "right_censored": _bool(self.right_censored),
            "left_truncated": _bool(self.left_truncated),
            "run_end_date": _opt_date(self.run_end_date),
            "run_start_date": self.run_start_date.isoformat(),
            "true_run_length_days": _opt_int(self.true_run_length_days),
            "outcome_quality": self.outcome_quality,
            "observation_quality": self.observation_quality,
            "historical_horizon_truncated": _bool(self.historical_horizon_truncated),
            "announced_beyond_legacy_horizon": _bool(self.announced_beyond_legacy_horizon),
            "identity_fallback": _bool(self.identity_fallback),
            "catalog_not_historical": _bool(self.catalog_not_historical),
        }


@dataclass
class LifecycleAuditResult:
    as_of: date
    dataset_start: date
    gap_threshold_days: int
    snapshot_dates: tuple[date, ...]
    missing_snapshot_dates: tuple[date, ...]
    identities: dict[str, ProductIdentity]
    runs: list[RunRecord]
    gaps: list[GapRecord]
    observations: list[ObservationRow]
    gap_summary: dict[str, Any]
    run_type_stats: dict[str, Any]
    wednesday_cadence: dict[str, Any]
    observation_quality_counts: dict[str, int]


def _bool(value: bool) -> str:
    return "true" if value else "false"


def _percentile(values: Sequence[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(float(v) for v in values)
    if len(ordered) == 1:
        return ordered[0]
    idx = (len(ordered) - 1) * q
    lo = int(math.floor(idx))
    hi = min(lo + 1, len(ordered) - 1)
    frac = idx - lo
    return ordered[lo] * (1.0 - frac) + ordered[hi] * frac


def _mean(values: Sequence[float]) -> float | None:
    if not values:
        return None
    return statistics.fmean(values)


def _median(values: Sequence[float]) -> float | None:
    if not values:
        return None
    return float(statistics.median(values))


def gap_bucket(dark_days: int) -> str | None:
    """Return the named bucket for a positive dark-day gap, else None."""
    if dark_days < 1:
        return None
    for name, lo, hi in GAP_BUCKETS:
        if dark_days < lo:
            continue
        if hi is None or dark_days <= hi:
            return name
    return "over_30_days"


def remaining_days(observation_date: date, run_end_date: date) -> int:
    """Calendar days from observation date until the run's final show date.

    Same-day final showtimes yield 0. Uses local calendar dates, not timestamps.
    """
    return (run_end_date - observation_date).days


def resolve_product_identity(
    *,
    source_film_id: str = "",
    source_release_id: str = "",
    title: str = "",
    title_key: str = "",
) -> ProductIdentity:
    """Prefer AMC movieId; title slug is fallback only and never merges products."""
    sid = str(source_film_id or "").strip()
    release_id = str(source_release_id or "").strip()
    key = str(title_key or "").strip() or (showtime_film_key(title) or "unknown")
    clean_title = str(title or "").strip()
    if sid:
        return ProductIdentity(
            product_id=sid,
            identity_kind="source_film_id",
            identity_confidence="high",
            source_film_id=sid,
            source_release_id=release_id,
            title=clean_title,
            title_key=key,
        )
    return ProductIdentity(
        product_id=f"title:{key}",
        identity_kind="title_fallback",
        identity_confidence="low",
        source_film_id="",
        source_release_id=release_id,
        title=clean_title,
        title_key=key,
    )


def classify_lifecycle_run_type(
    title: str,
    *,
    catalog_category: str = "",
    attribute_codes: Sequence[str] = (),
) -> tuple[str, str]:
    """Return (safe_title_or_catalog_run_type, catalog_run_type).

    Catalog category wins when present and not unknown. Title patterns remain
    the leakage-safe default because the committed catalog is current-as-of,
    not historical-as-of T.
    """
    catalog_run_type = ""
    mapped = CATALOG_CATEGORY_TO_RUN_TYPE.get(str(catalog_category or "").strip())
    if mapped:
        catalog_run_type = mapped
    elif not catalog_category and attribute_codes:
        category = classify_product_category(
            name=title,
            source_title=title,
            attribute_codes=attribute_codes,
            attribute_names=(),
            preferred_media_type=None,
        )
        catalog_run_type = CATALOG_CATEGORY_TO_RUN_TYPE.get(category, "")

    title_type = TITLE_RUN_TYPE_TO_LIFECYCLE.get(
        classify_run_type(title),
        "unknown_other_special",
    )
    # Accessibility / Q&A product titles should not collapse into parent first-run.
    if catalog_run_type and catalog_run_type != "probable_normal_first_run":
        return catalog_run_type, catalog_run_type
    if catalog_run_type:
        return catalog_run_type, catalog_run_type
    return title_type, ""


def classify_observation_quality(
    *,
    snapshot_format: str,
    has_source_film_id: bool,
    announced_horizon_days: int,
) -> str:
    fmt = (snapshot_format or "json").strip()
    if fmt in {"history_restate", "history"}:
        return QUALITY_UNSUITABLE
    if fmt in {"daily_csv", "archive_csv"}:
        return QUALITY_RECONSTRUCTED
    beyond_legacy = announced_horizon_days > LEGACY_FETCH_HORIZON_DAYS
    if beyond_legacy:
        return QUALITY_HIGH_CONFIDENCE_PIT if has_source_film_id else QUALITY_USABLE_14DAY_TITLE
    if has_source_film_id:
        return QUALITY_USABLE_14DAY
    return QUALITY_USABLE_14DAY_TITLE


def segment_occurred_dates(
    occurred_dates: Sequence[date],
    *,
    gap_threshold_days: int,
) -> list[tuple[date, ...]]:
    """Split a sorted occurred-date sequence when dark_days >= threshold."""
    ordered = sorted(set(occurred_dates))
    if not ordered:
        return []
    segments: list[list[date]] = [[ordered[0]]]
    for current in ordered[1:]:
        dark_days = (current - segments[-1][-1]).days - 1
        if dark_days >= gap_threshold_days:
            segments.append([current])
        else:
            segments[-1].append(current)
    return [tuple(segment) for segment in segments]


def _is_premium(format_raw: str | None, attributes: Mapping[str, Any] | None) -> bool:
    tags = set(parse_format_tags(format_raw) or ())
    attrs = attributes or {}
    premium_raw = attrs.get("premium_format_raw") or attrs.get("premiumFormat")
    if premium_raw:
        tags.update(parse_format_tags(str(premium_raw)) or ())
    return bool(tags & PREMIUM_FORMAT_SLUGS)


def _release_id_from_attrs(attributes: Mapping[str, Any] | None) -> str:
    attrs = attributes or {}
    for key in ("wwm_release_number", "wwmReleaseNumber", "source_release_id"):
        value = attrs.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def facts_from_snapshots(
    snapshots: Sequence[ParsedSnapshot],
    *,
    theater_index: Any,
    snapshot_format: str = "json",
) -> list[ShowtimeFact]:
    """Convert parsed snapshots into enabled-AMC showtime facts."""
    facts: list[ShowtimeFact] = []
    for snapshot in snapshots:
        for record in snapshot.records:
            if record.canceled:
                continue
            show_date = parse_show_date(record.date_raw, reference_date=snapshot.snapshot_date)
            if show_date is None:
                continue
            resolution = resolve_theater(record.theater_name_raw, theater_index)
            if resolution is None:
                continue
            entry = theater_index.theaters_by_id.get(resolution.theater_id)
            if entry is None or entry.get("source") != "amc" or entry.get("enabled") is False:
                continue
            title = (record.title_raw or "").strip()
            title_key = showtime_film_key(title) or "unknown"
            movie_id = _amc_movie_id_from_record(record)
            facts.append(
                ShowtimeFact(
                    observation_date=snapshot.snapshot_date,
                    observation_at=snapshot.snapshot_timestamp,
                    show_date=show_date,
                    title=title,
                    source_film_id=movie_id,
                    source_release_id=_release_id_from_attrs(record.attributes),
                    theater_id=resolution.theater_id,
                    theater_name=str(entry.get("name") or record.theater_name_raw),
                    minutes=parse_time_to_minutes(record.time_raw),
                    canceled=False,
                    premium=_is_premium(record.format_raw, record.attributes),
                    snapshot_format=snapshot_format,
                    title_key=title_key,
                )
            )
    facts.sort(
        key=lambda item: (
            item.observation_date,
            item.source_film_id or item.title_key,
            item.show_date,
            item.theater_id,
            item.minutes or 0,
        )
    )
    return facts


def make_fact(
    observation_date: date,
    show_date: date,
    *,
    source_film_id: str = "100",
    source_release_id: str = "",
    title: str = "Normal Film",
    theater_id: str = "amc-pacific-place-11",
    theater_name: str = "AMC Pacific Place 11",
    minutes: int | None = 19 * 60,
    canceled: bool = False,
    premium: bool = False,
    snapshot_format: str = "json",
    observation_at: str | None = None,
    title_key: str = "",
) -> ShowtimeFact:
    """Test/helper constructor for a single snapshot showtime fact."""
    key = title_key or showtime_film_key(title) or "unknown"
    stamp = observation_at
    if stamp is None:
        stamp = f"{observation_date.isoformat()}T12:00:00-07:00"
    return ShowtimeFact(
        observation_date=observation_date,
        observation_at=stamp,
        show_date=show_date,
        title=title,
        source_film_id=source_film_id,
        source_release_id=source_release_id,
        theater_id=theater_id,
        theater_name=theater_name,
        minutes=minutes,
        canceled=canceled,
        premium=premium,
        snapshot_format=snapshot_format,
        title_key=key,
    )


def occurred_from_facts(
    facts: Sequence[ShowtimeFact],
    *,
    as_of: date,
) -> list[OccurredPerformance]:
    """Occurred calendar = announced show dates on or before as_of."""
    rows: list[OccurredPerformance] = []
    seen: set[tuple[str, date, str]] = set()
    for fact in facts:
        if fact.canceled or fact.show_date > as_of:
            continue
        identity = resolve_product_identity(
            source_film_id=fact.source_film_id,
            source_release_id=fact.source_release_id,
            title=fact.title,
            title_key=fact.title_key,
        )
        key = (identity.product_id, fact.show_date, fact.theater_id)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            OccurredPerformance(
                show_date=fact.show_date,
                product_id=identity.product_id,
                source_film_id=identity.source_film_id,
                source_release_id=identity.source_release_id,
                title=identity.title,
                title_key=identity.title_key,
                theater_id=fact.theater_id,
                identity_kind=identity.identity_kind,
            )
        )
    return rows


def load_occurred_from_history(
    path: Path,
    *,
    theater_index: Any,
    as_of: date,
) -> list[OccurredPerformance]:
    """Load past AMC performances from history (forward restated window excluded)."""
    rows: list[OccurredPerformance] = []
    if not path.is_file():
        return rows
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            if str(raw.get("source", "")).strip() != SOURCE:
                continue
            show_date = parse_csv_date(raw.get("Date"))
            if show_date is None or show_date > as_of:
                continue
            if str(raw.get("isCanceled", "")).strip().lower() in {"true", "1", "yes"}:
                continue
            theater_id = str(raw.get("theater_id", "")).strip()
            if theater_id:
                entry = theater_index.theaters_by_id.get(theater_id)
            else:
                resolution = resolve_theater(str(raw.get("Theater", "")), theater_index)
                entry = (
                    theater_index.theaters_by_id.get(resolution.theater_id)
                    if resolution is not None
                    else None
                )
                theater_id = resolution.theater_id if resolution is not None else ""
            if entry is None or entry.get("source") != "amc" or entry.get("enabled") is False:
                continue
            title = str(raw.get("source_title") or raw.get("Film") or "").strip()
            title_key = str(raw.get("showtime_film_key") or "").strip() or (
                showtime_film_key(title) or "unknown"
            )
            source_film_id = source_film_id_from_history_row(raw) or ""
            identity = resolve_product_identity(
                source_film_id=source_film_id,
                title=title,
                title_key=title_key,
            )
            rows.append(
                OccurredPerformance(
                    show_date=show_date,
                    product_id=identity.product_id,
                    source_film_id=identity.source_film_id,
                    source_release_id="",
                    title=title,
                    title_key=title_key,
                    theater_id=theater_id,
                    identity_kind=identity.identity_kind,
                )
            )
    return rows


def load_catalog_index(path: Path) -> dict[str, CatalogProduct]:
    if not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    products = payload.get("products") if isinstance(payload, dict) else None
    if not isinstance(products, list):
        return {}
    index: dict[str, CatalogProduct] = {}
    for item in products:
        if not isinstance(item, dict):
            continue
        film_id = str(item.get("source_film_id") or "").strip()
        if not film_id:
            continue
        presentation = item.get("presentation") if isinstance(item.get("presentation"), dict) else {}
        index[film_id] = CatalogProduct(
            source_film_id=film_id,
            source_release_id=str(item.get("source_release_id") or "").strip(),
            title=str(item.get("source_title") or "").strip(),
            category=str(presentation.get("category") or "unknown"),
            is_special=bool(presentation.get("is_special_presentation")),
        )
    return index


def calendar_dates_between(start: date, end: date) -> list[date]:
    if end < start:
        return []
    days: list[date] = []
    current = start
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def missing_dates_from_snapshots(snapshot_dates: Sequence[date]) -> list[date]:
    ordered = sorted(set(snapshot_dates))
    if not ordered:
        return []
    present = set(ordered)
    missing: list[date] = []
    for day in calendar_dates_between(ordered[0], ordered[-1]):
        if day not in present:
            missing.append(day)
    return missing


def _product_meta_from_facts(
    facts: Sequence[ShowtimeFact],
    catalog: Mapping[str, CatalogProduct],
) -> dict[str, ProductIdentity]:
    identities: dict[str, ProductIdentity] = {}
    titles: dict[str, str] = {}
    releases: dict[str, str] = {}
    for fact in facts:
        identity = resolve_product_identity(
            source_film_id=fact.source_film_id,
            source_release_id=fact.source_release_id,
            title=fact.title,
            title_key=fact.title_key,
        )
        current = identities.get(identity.product_id)
        if current is None or (
            current.identity_kind == "title_fallback" and identity.identity_kind == "source_film_id"
        ):
            identities[identity.product_id] = identity
        if identity.title:
            titles[identity.product_id] = identity.title
        if identity.source_release_id:
            releases[identity.product_id] = identity.source_release_id
    for product_id, identity in list(identities.items()):
        catalog_hit = catalog.get(identity.source_film_id)
        release_id = releases.get(product_id) or (
            catalog_hit.source_release_id if catalog_hit else identity.source_release_id
        )
        title = titles.get(product_id) or (catalog_hit.title if catalog_hit else identity.title)
        identities[product_id] = ProductIdentity(
            product_id=identity.product_id,
            identity_kind=identity.identity_kind,
            identity_confidence=identity.identity_confidence,
            source_film_id=identity.source_film_id,
            source_release_id=release_id,
            title=title,
            title_key=identity.title_key,
        )
    return identities


def _run_type_for_product(
    identity: ProductIdentity,
    catalog: Mapping[str, CatalogProduct],
) -> tuple[str, str]:
    catalog_hit = catalog.get(identity.source_film_id)
    category = catalog_hit.category if catalog_hit else ""
    return classify_lifecycle_run_type(identity.title, catalog_category=category)


def measure_gaps(
    occurred_by_product: Mapping[str, Sequence[date]],
    identities: Mapping[str, ProductIdentity],
    *,
    catalog: Mapping[str, CatalogProduct] | None = None,
    missing_snapshot_dates: Sequence[date] = (),
) -> list[GapRecord]:
    catalog = catalog or {}
    missing = set(missing_snapshot_dates)
    gaps: list[GapRecord] = []
    for product_id, dates in occurred_by_product.items():
        ordered = sorted(set(dates))
        identity = identities.get(
            product_id,
            resolve_product_identity(title=product_id, title_key=product_id),
        )
        run_type, _catalog_type = _run_type_for_product(identity, catalog)
        for previous, nxt in zip(ordered, ordered[1:]):
            dark_days = (nxt - previous).days - 1
            if dark_days < 1:
                continue
            dark = calendar_dates_between(previous + timedelta(days=1), nxt - timedelta(days=1))
            overlaps = any(day in missing for day in dark)
            possibly = bool(dark) and all(day in missing for day in dark)
            gaps.append(
                GapRecord(
                    product_id=product_id,
                    title=identity.title,
                    run_type=run_type,
                    identity_kind=identity.identity_kind,
                    source_film_id=identity.source_film_id,
                    source_release_id=identity.source_release_id,
                    previous_date=previous,
                    next_date=nxt,
                    dark_days=dark_days,
                    bucket=gap_bucket(dark_days) or "1_day",
                    overlaps_missing_snapshot=overlaps,
                    possibly_missing_snapshot=possibly,
                )
            )
    gaps.sort(key=lambda item: (item.dark_days, item.product_id, item.previous_date.isoformat()))
    return gaps


def summarize_gaps(gaps: Sequence[GapRecord], product_count: int) -> dict[str, Any]:
    bucket_counts = {name: 0 for name, _lo, _hi in GAP_BUCKETS}
    for gap in gaps:
        bucket_counts[gap.bucket] = bucket_counts.get(gap.bucket, 0) + 1
    products_with_return = {gap.product_id for gap in gaps}
    returns_per_product = Counter(gap.product_id for gap in gaps)
    repeated_returns = sum(1 for _pid, count in returns_per_product.items() if count > 1)
    by_type: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    same_film_id = 0
    same_release = 0
    identity_title = 0
    artifactual = 0
    for gap in gaps:
        by_type[gap.run_type][gap.bucket] += 1
        if gap.source_film_id:
            same_film_id += 1
        if gap.source_release_id:
            same_release += 1
        if gap.identity_kind == "title_fallback":
            identity_title += 1
        if gap.possibly_missing_snapshot:
            artifactual += 1
    examples: dict[str, list[dict[str, str]]] = {name: [] for name, _lo, _hi in GAP_BUCKETS}
    for gap in gaps:
        bucket_examples = examples.setdefault(gap.bucket, [])
        if len(bucket_examples) >= 5:
            continue
        bucket_examples.append(
            {
                "product_id": gap.product_id,
                "title": gap.title,
                "run_type": gap.run_type,
                "previous_date": gap.previous_date.isoformat(),
                "next_date": gap.next_date.isoformat(),
                "dark_days": str(gap.dark_days),
                "possibly_missing_snapshot": _bool(gap.possibly_missing_snapshot),
            }
        )
    return {
        "product_count": product_count,
        "gap_count": len(gaps),
        "bucket_counts": bucket_counts,
        "bucket_rates_of_gaps": {
            name: (count / len(gaps) if gaps else 0.0) for name, count in bucket_counts.items()
        },
        "products_with_any_return": len(products_with_return),
        "share_products_with_return": (
            len(products_with_return) / product_count if product_count else 0.0
        ),
        "products_with_repeated_returns": repeated_returns,
        "gaps_with_source_film_id": same_film_id,
        "gaps_with_source_release_id": same_release,
        "gaps_title_fallback_identity": identity_title,
        "possibly_missing_snapshot_gaps": artifactual,
        "by_run_type": {run_type: dict(counts) for run_type, counts in sorted(by_type.items())},
        "examples": examples,
    }


def build_runs(
    occurred: Sequence[OccurredPerformance],
    identities: Mapping[str, ProductIdentity],
    *,
    gap_threshold_days: int,
    as_of: date,
    dataset_start: date,
    catalog: Mapping[str, CatalogProduct] | None = None,
    active_product_ids_at_as_of: set[str] | None = None,
) -> list[RunRecord]:
    catalog = catalog or {}
    by_product: dict[str, list[OccurredPerformance]] = defaultdict(list)
    for row in occurred:
        by_product[row.product_id].append(row)
    active_at_end = active_product_ids_at_as_of or set()
    runs: list[RunRecord] = []
    for product_id, rows in sorted(by_product.items()):
        identity = identities.get(product_id)
        if identity is None:
            sample = rows[0]
            identity = resolve_product_identity(
                source_film_id=sample.source_film_id,
                source_release_id=sample.source_release_id,
                title=sample.title,
                title_key=sample.title_key,
            )
        run_type, catalog_run_type = _run_type_for_product(identity, catalog)
        dates = sorted({row.show_date for row in rows})
        theaters_by_date: dict[date, set[str]] = defaultdict(set)
        show_count_by_date: dict[date, int] = Counter()
        for row in rows:
            theaters_by_date[row.show_date].add(row.theater_id)
            show_count_by_date[row.show_date] += 1
        segments = segment_occurred_dates(dates, gap_threshold_days=gap_threshold_days)
        for sequence, segment in enumerate(segments, start=1):
            start_date = segment[0]
            end_date = segment[-1]
            theaters: set[str] = set()
            showtime_count = 0
            for day in segment:
                theaters.update(theaters_by_date.get(day, ()))
                showtime_count += show_count_by_date.get(day, 0)
            right_censored = product_id in active_at_end and sequence == len(segments)
            if right_censored:
                end_for_length = None
            else:
                end_for_length = end_date
            runs.append(
                RunRecord(
                    product_id=product_id,
                    run_sequence=sequence,
                    run_id=f"{product_id}#{sequence:02d}",
                    source_film_id=identity.source_film_id,
                    source_release_id=identity.source_release_id,
                    title=identity.title,
                    title_key=identity.title_key,
                    identity_kind=identity.identity_kind,
                    identity_confidence=identity.identity_confidence,
                    run_type=run_type,
                    catalog_run_type=catalog_run_type,
                    start_date=start_date,
                    end_date=end_date,
                    occurred_dates=segment,
                    theater_ids=tuple(sorted(theaters)),
                    showtime_count=showtime_count,
                    right_censored=right_censored,
                    left_truncated=start_date <= dataset_start,
                    one_day=len(segment) == 1,
                    one_showtime=showtime_count <= 1,
                )
            )
            _ = end_for_length
    runs.sort(key=lambda item: (item.product_id, item.run_sequence))
    return runs


def _assign_run(
    runs: Sequence[RunRecord],
    *,
    observation_date: date,
    announced_dates: Sequence[date],
) -> RunRecord | None:
    future = [day for day in announced_dates if day >= observation_date]
    if not future:
        return None
    anchor = min(future)
    for run in runs:
        if run.start_date <= anchor <= run.end_date:
            return run
    last = runs[-1]
    if anchor >= last.start_date:
        return last
    return None


def _feature_snapshot(facts: Sequence[ShowtimeFact], observation_date: date) -> dict[str, Any]:
    active = [fact for fact in facts if not fact.canceled and fact.show_date >= observation_date]
    if not active:
        return {}
    theaters = sorted({fact.theater_id for fact in active})
    announced_dates = sorted({fact.show_date for fact in active})
    weekend = sum(1 for fact in active if fact.show_date.weekday() >= 5)
    prime = sum(
        1
        for fact in active
        if fact.minutes is not None and MATINEE_END_MIN <= fact.minutes < PRIME_END_MIN
    )
    premium = sum(1 for fact in active if fact.premium)
    farthest = announced_dates[-1]
    earliest = announced_dates[0]
    return {
        "theater_count": len(theaters),
        "showtime_count": len(active),
        "days_with_announced_showtimes": len(announced_dates),
        "earliest_announced_show_date": earliest,
        "farthest_announced_show_date": farthest,
        "announced_horizon_days": (farthest - observation_date).days,
        "showtimes_per_active_day": len(active) / len(announced_dates),
        "weekend_showtime_count": weekend,
        "prime_time_showtime_count": prime,
        "premium_format_count": premium,
        "premium_format_share": (premium / len(active)) if active else 0.0,
        "theater_ids": tuple(theaters),
        "announced_dates": tuple(announced_dates),
        "snapshot_format": active[0].snapshot_format,
        "observation_at": next((fact.observation_at for fact in facts if fact.observation_at), None),
        "has_source_film_id": any(fact.source_film_id for fact in facts),
        "title": next((fact.title for fact in facts if fact.title), ""),
        "source_release_id": next((fact.source_release_id for fact in facts if fact.source_release_id), ""),
    }


def observation_feature_dict(row: ObservationRow) -> dict[str, Any]:
    """Return only leakage-safe feature fields from an observation row."""
    return {
        "theater_count": row.theater_count,
        "showtime_count": row.showtime_count,
        "days_with_announced_showtimes": row.days_with_announced_showtimes,
        "earliest_announced_show_date": row.earliest_announced_show_date.isoformat(),
        "farthest_announced_show_date": row.farthest_announced_show_date.isoformat(),
        "announced_horizon_days": row.announced_horizon_days,
        "showtimes_per_active_day": row.showtimes_per_active_day,
        "weekend_showtime_count": row.weekend_showtime_count,
        "prime_time_showtime_count": row.prime_time_showtime_count,
        "premium_format_count": row.premium_format_count,
        "premium_format_share": row.premium_format_share,
        "theater_ids": row.theater_ids,
        "prior_theater_count": row.prior_theater_count,
        "delta_theater_count": row.delta_theater_count,
        "prior_showtime_count": row.prior_showtime_count,
        "delta_showtime_count": row.delta_showtime_count,
        "lost_theater_since_prior": row.lost_theater_since_prior,
        "lost_weekend_coverage": row.lost_weekend_coverage,
        "lost_prime_time_coverage": row.lost_prime_time_coverage,
        "farthest_show_date_delta": row.farthest_show_date_delta,
        "days_since_run_start": row.days_since_run_start,
        "observations_since_run_start": row.observations_since_run_start,
        "first_seen_at": row.first_seen_at,
        "run_type": row.run_type,
        "identity_confidence": row.identity_confidence,
    }


def build_observations(
    facts: Sequence[ShowtimeFact],
    runs: Sequence[RunRecord],
    identities: Mapping[str, ProductIdentity],
    *,
    as_of: date,
    catalog: Mapping[str, CatalogProduct] | None = None,
) -> list[ObservationRow]:
    catalog = catalog or {}
    by_obs_product: dict[tuple[date, str], list[ShowtimeFact]] = defaultdict(list)
    for fact in facts:
        if fact.canceled:
            continue
        identity = resolve_product_identity(
            source_film_id=fact.source_film_id,
            source_release_id=fact.source_release_id,
            title=fact.title,
            title_key=fact.title_key,
        )
        by_obs_product[(fact.observation_date, identity.product_id)].append(fact)

    runs_by_product: dict[str, list[RunRecord]] = defaultdict(list)
    for run in runs:
        runs_by_product[run.product_id].append(run)
    for product_runs in runs_by_product.values():
        product_runs.sort(key=lambda item: item.run_sequence)

    rows: list[ObservationRow] = []
    prior_by_run: dict[str, ObservationRow] = {}
    obs_count_by_run: dict[str, int] = defaultdict(int)
    first_seen_by_run: dict[str, str | None] = {}

    for (observation_date, product_id), group in sorted(
        by_obs_product.items(),
        key=lambda item: (item[0][0], item[0][1]),
    ):
        features = _feature_snapshot(group, observation_date)
        if not features:
            continue
        product_runs = runs_by_product.get(product_id)
        if not product_runs:
            continue
        run = _assign_run(
            product_runs,
            observation_date=observation_date,
            announced_dates=features["announced_dates"],
        )
        if run is None:
            continue
        run_type = run.run_type
        catalog_run_type = run.catalog_run_type
        event_observed = not run.right_censored
        remaining = None if run.right_censored else remaining_days(observation_date, run.end_date)
        run_end_date = None if run.right_censored else run.end_date
        true_length = None if run.right_censored else (run.end_date - run.start_date).days + 1
        obs_count_by_run[run.run_id] += 1
        first_seen_by_run.setdefault(run.run_id, features["observation_at"])
        prior = prior_by_run.get(run.run_id)
        prior_theaters = set(prior.theater_ids) if prior else set()
        current_theaters = set(features["theater_ids"])
        lost_theater = bool(prior_theaters - current_theaters) if prior else False
        lost_weekend = bool(prior and prior.weekend_showtime_count > 0 and features["weekend_showtime_count"] == 0)
        lost_prime = bool(
            prior and prior.prime_time_showtime_count > 0 and features["prime_time_showtime_count"] == 0
        )
        farthest_delta = None
        if prior is not None:
            farthest_delta = (
                features["farthest_announced_show_date"] - prior.farthest_announced_show_date
            ).days
        horizon = features["announced_horizon_days"]
        quality = classify_observation_quality(
            snapshot_format=features["snapshot_format"],
            has_source_film_id=bool(run.source_film_id or features["has_source_film_id"]),
            announced_horizon_days=horizon,
        )
        if run.right_censored:
            outcome = "right_censored"
        elif remaining is not None and remaining < 0:
            outcome = "unreliable_negative_remaining"
        else:
            outcome = "observed"
        row = ObservationRow(
            observation_at=features["observation_at"],
            observation_date=observation_date,
            source_film_id=run.source_film_id,
            source_release_id=run.source_release_id or features["source_release_id"],
            product_id=product_id,
            run_id=run.run_id,
            run_sequence=run.run_sequence,
            title=run.title or features["title"],
            run_type=run_type,
            catalog_run_type=catalog_run_type,
            identity_kind=run.identity_kind,
            identity_confidence=run.identity_confidence,
            theater_count=features["theater_count"],
            showtime_count=features["showtime_count"],
            days_with_announced_showtimes=features["days_with_announced_showtimes"],
            earliest_announced_show_date=features["earliest_announced_show_date"],
            farthest_announced_show_date=features["farthest_announced_show_date"],
            announced_horizon_days=horizon,
            showtimes_per_active_day=features["showtimes_per_active_day"],
            weekend_showtime_count=features["weekend_showtime_count"],
            prime_time_showtime_count=features["prime_time_showtime_count"],
            premium_format_count=features["premium_format_count"],
            premium_format_share=features["premium_format_share"],
            theater_ids=features["theater_ids"],
            prior_theater_count=prior.theater_count if prior else None,
            delta_theater_count=(
                features["theater_count"] - prior.theater_count if prior else None
            ),
            prior_showtime_count=prior.showtime_count if prior else None,
            delta_showtime_count=(
                features["showtime_count"] - prior.showtime_count if prior else None
            ),
            lost_theater_since_prior=lost_theater,
            lost_weekend_coverage=lost_weekend,
            lost_prime_time_coverage=lost_prime,
            farthest_show_date_delta=farthest_delta,
            days_since_run_start=(observation_date - run.start_date).days,
            observations_since_run_start=obs_count_by_run[run.run_id],
            first_seen_at=first_seen_by_run[run.run_id],
            remaining_days=remaining,
            event_observed=event_observed,
            right_censored=run.right_censored,
            left_truncated=run.left_truncated,
            run_end_date=run_end_date,
            run_start_date=run.start_date,
            true_run_length_days=true_length,
            outcome_quality=outcome,
            observation_quality=quality,
            historical_horizon_truncated=horizon >= LEGACY_FETCH_HORIZON_DAYS - 1,
            announced_beyond_legacy_horizon=horizon > LEGACY_FETCH_HORIZON_DAYS,
            identity_fallback=run.identity_kind == "title_fallback",
            catalog_not_historical=bool(catalog_run_type),
        )
        row.feature_payload = observation_feature_dict(row)
        rows.append(row)
        prior_by_run[run.run_id] = row
    return rows


def run_type_lifecycle_stats(runs: Sequence[RunRecord]) -> dict[str, Any]:
    grouped: dict[str, list[RunRecord]] = defaultdict(list)
    for run in runs:
        grouped[run.run_type].append(run)
    stats: dict[str, Any] = {}
    for run_type in RUN_TYPES:
        group = grouped.get(run_type, [])
        lengths = [
            (run.end_date - run.start_date).days + 1
            for run in group
            if not run.right_censored
        ]
        theater_counts = [len(run.theater_ids) for run in group]
        one_day = sum(1 for run in group if run.one_day)
        one_show = sum(1 for run in group if run.one_showtime)
        multi_seq_products = {
            run.product_id for run in group if run.run_sequence > 1
        }
        max_footprint = max(theater_counts) if theater_counts else 0
        stats[run_type] = {
            "run_count": len(group),
            "completed_run_count": len(lengths),
            "right_censored_run_count": sum(1 for run in group if run.right_censored),
            "median_run_length_days": _median(lengths),
            "mean_run_length_days": _mean(lengths),
            "p25_run_length_days": _percentile(lengths, 0.25),
            "p75_run_length_days": _percentile(lengths, 0.75),
            "one_day_share": (one_day / len(group)) if group else 0.0,
            "one_showtime_share": (one_show / len(group)) if group else 0.0,
            "median_theater_count": _median(theater_counts),
            "mean_theater_count": _mean(theater_counts),
            "max_theater_count": max_footprint,
            "products_with_multiple_runs": len(multi_seq_products),
        }
    stats["all"] = {
        "run_count": len(runs),
        "completed_run_count": sum(1 for run in runs if not run.right_censored),
        "right_censored_run_count": sum(1 for run in runs if run.right_censored),
        "left_truncated_run_count": sum(1 for run in runs if run.left_truncated),
        "products": len({run.product_id for run in runs}),
        "products_split_into_multiple_runs": len(
            {run.product_id for run in runs if run.run_sequence > 1}
        ),
    }
    return stats


def summarize_wednesday_cadence(observations: Sequence[ObservationRow]) -> dict[str, Any]:
    by_product: dict[str, list[ObservationRow]] = defaultdict(list)
    for row in observations:
        by_product[row.product_id].append(row)
    extensions: list[dict[str, Any]] = []
    horizon_by_weekday: dict[str, list[int]] = defaultdict(list)
    for row in observations:
        horizon_by_weekday[WEEKDAY_NAMES[row.observation_date.weekday()]].append(
            row.announced_horizon_days
        )
    weekday_extension_counts: Counter[str] = Counter()
    weekday_extension_days: dict[str, list[int]] = defaultdict(list)
    first_run_ext = 0
    special_ext = 0
    for _product_id, rows in by_product.items():
        ordered = sorted(rows, key=lambda item: item.observation_date)
        for previous, current in zip(ordered, ordered[1:]):
            delta = (
                current.farthest_announced_show_date - previous.farthest_announced_show_date
            ).days
            if delta <= 0:
                continue
            weekday = WEEKDAY_NAMES[current.observation_date.weekday()]
            weekday_extension_counts[weekday] += 1
            weekday_extension_days[weekday].append(delta)
            if current.run_type == "probable_normal_first_run":
                first_run_ext += 1
            else:
                special_ext += 1
            extensions.append(
                {
                    "product_id": current.product_id,
                    "title": current.title,
                    "observation_date": current.observation_date.isoformat(),
                    "weekday": weekday,
                    "extension_days": delta,
                    "run_type": current.run_type,
                }
            )
    dominant = None
    if weekday_extension_counts:
        dominant = weekday_extension_counts.most_common(1)[0][0]
    snapshot_weekdays = Counter(
        WEEKDAY_NAMES[row.observation_date.weekday()] for row in observations
    )
    return {
        "extension_event_count": len(extensions),
        "extensions_by_weekday": dict(weekday_extension_counts),
        "mean_extension_days_by_weekday": {
            day: _mean(values) for day, values in sorted(weekday_extension_days.items())
        },
        "mean_announced_horizon_by_weekday": {
            day: _mean(values) for day, values in sorted(horizon_by_weekday.items())
        },
        "observation_rows_by_weekday": dict(snapshot_weekdays),
        "dominant_extension_weekday": dominant,
        "wednesday_is_dominant": dominant == "Wednesday",
        "normal_first_run_extensions": first_run_ext,
        "special_or_other_extensions": special_ext,
        "enough_pre_post_wednesday_snapshots": (
            snapshot_weekdays.get("Tuesday", 0) >= 3 and snapshot_weekdays.get("Wednesday", 0) >= 3
        ),
        "examples": extensions[:8],
    }


def sensitivity_analysis(
    facts: Sequence[ShowtimeFact],
    occurred: Sequence[OccurredPerformance],
    identities: Mapping[str, ProductIdentity],
    *,
    as_of: date,
    dataset_start: date,
    catalog: Mapping[str, CatalogProduct] | None = None,
    active_product_ids_at_as_of: set[str] | None = None,
    thresholds: Sequence[int] = SENSITIVITY_THRESHOLDS,
    baseline_threshold: int = DEFAULT_GAP_THRESHOLD_DAYS,
) -> dict[str, Any]:
    catalog = catalog or {}
    baseline = None
    reports: dict[str, Any] = {}
    for threshold in thresholds:
        runs = build_runs(
            occurred,
            identities,
            gap_threshold_days=threshold,
            as_of=as_of,
            dataset_start=dataset_start,
            catalog=catalog,
            active_product_ids_at_as_of=active_product_ids_at_as_of,
        )
        observations = build_observations(
            facts, runs, identities, as_of=as_of, catalog=catalog
        )
        completed = [run for run in runs if not run.right_censored]
        lengths = [(run.end_date - run.start_date).days + 1 for run in completed]
        split_products = {run.product_id for run in runs if run.run_sequence > 1}
        first_run = [run for run in runs if run.run_type == "probable_normal_first_run"]
        special = [run for run in runs if run.run_type != "probable_normal_first_run"]
        # Suspicious merges: dark gaps just below the threshold that still join runs.
        occurred_by_product: dict[str, list[date]] = defaultdict(list)
        for row in occurred:
            occurred_by_product[row.product_id].append(row.show_date)
        suspicious_merges = 0
        suspicious_splits = 0
        for product_id, dates in occurred_by_product.items():
            ordered = sorted(set(dates))
            for previous, nxt in zip(ordered, ordered[1:]):
                dark = (nxt - previous).days - 1
                if threshold > 1 and (threshold - 3) <= dark < threshold:
                    suspicious_merges += 1
                if dark >= threshold and dark <= threshold + 2 and threshold <= 7:
                    suspicious_splits += 1
        payload = {
            "gap_threshold_days": threshold,
            "run_count": len(runs),
            "products": len({run.product_id for run in runs}),
            "products_split_into_multiple_runs": len(split_products),
            "median_run_length_days": _median(lengths),
            "mean_run_length_days": _mean(lengths),
            "suspicious_merges": suspicious_merges,
            "suspicious_splits": suspicious_splits,
            "normal_first_run_count": len(first_run),
            "special_or_other_run_count": len(special),
            "observation_count": len(observations),
            "observed_targets": sum(1 for row in observations if row.event_observed),
            "right_censored_targets": sum(1 for row in observations if row.right_censored),
        }
        if threshold == baseline_threshold:
            baseline = {
                "observations": observations,
                "runs": runs,
            }
        reports[str(threshold)] = payload

    if baseline is not None:
        baseline_obs = {
            (row.observation_date, row.product_id): (row.run_id, row.remaining_days, row.event_observed)
            for row in baseline["observations"]
        }
        for threshold in thresholds:
            if threshold == baseline_threshold:
                reports[str(threshold)]["observations_changed_vs_baseline"] = 0
                continue
            alt_runs = build_runs(
                occurred,
                identities,
                gap_threshold_days=threshold,
                as_of=as_of,
                dataset_start=dataset_start,
                catalog=catalog,
                active_product_ids_at_as_of=active_product_ids_at_as_of,
            )
            alt_obs = build_observations(
                facts, alt_runs, identities, as_of=as_of, catalog=catalog
            )
            changed = 0
            alt_keys = {(row.observation_date, row.product_id) for row in alt_obs}
            for row in alt_obs:
                key = (row.observation_date, row.product_id)
                previous = baseline_obs.get(key)
                if previous is None:
                    changed += 1
                    continue
                if previous != (row.run_id, row.remaining_days, row.event_observed):
                    changed += 1
            for key in baseline_obs:
                if key not in alt_keys:
                    changed += 1
            reports[str(threshold)]["observations_changed_vs_baseline"] = changed
    reports["baseline_threshold_days"] = baseline_threshold
    reports["recommended_threshold_days"] = baseline_threshold
    return reports


def identity_change_cases(facts: Sequence[ShowtimeFact]) -> list[dict[str, Any]]:
    """Titles that map to more than one product_id in the snapshot window."""
    by_title: dict[str, set[str]] = defaultdict(set)
    titles: dict[str, str] = {}
    for fact in facts:
        identity = resolve_product_identity(
            source_film_id=fact.source_film_id,
            source_release_id=fact.source_release_id,
            title=fact.title,
            title_key=fact.title_key,
        )
        by_title[identity.title_key].add(identity.product_id)
        titles[identity.title_key] = identity.title
    cases = []
    for title_key, product_ids in sorted(by_title.items()):
        if len(product_ids) < 2:
            continue
        cases.append(
            {
                "title_key": title_key,
                "title": titles.get(title_key, ""),
                "product_ids": sorted(product_ids),
            }
        )
    return cases


def active_product_ids(
    facts: Sequence[ShowtimeFact],
    *,
    as_of: date,
) -> set[str]:
    active: set[str] = set()
    for fact in facts:
        if fact.canceled or fact.observation_date != as_of:
            continue
        if fact.show_date < as_of:
            continue
        identity = resolve_product_identity(
            source_film_id=fact.source_film_id,
            source_release_id=fact.source_release_id,
            title=fact.title,
            title_key=fact.title_key,
        )
        active.add(identity.product_id)
    return active


def build_lifecycle_audit(
    facts: Sequence[ShowtimeFact],
    *,
    gap_threshold_days: int = DEFAULT_GAP_THRESHOLD_DAYS,
    as_of: date | None = None,
    dataset_start: date | None = None,
    missing_snapshot_dates: Sequence[date] = (),
    extra_occurred: Sequence[OccurredPerformance] = (),
    catalog: Mapping[str, CatalogProduct] | None = None,
) -> LifecycleAuditResult:
    """Build runs, gaps, and modeling observations from snapshot facts."""
    catalog = catalog or {}
    if not facts:
        today = date(1970, 1, 1)
        return LifecycleAuditResult(
            as_of=today,
            dataset_start=today,
            gap_threshold_days=gap_threshold_days,
            snapshot_dates=(),
            missing_snapshot_dates=tuple(missing_snapshot_dates),
            identities={},
            runs=[],
            gaps=[],
            observations=[],
            gap_summary=summarize_gaps([], 0),
            run_type_stats=run_type_lifecycle_stats([]),
            wednesday_cadence=summarize_wednesday_cadence([]),
            observation_quality_counts={},
        )

    snapshot_dates = tuple(sorted({fact.observation_date for fact in facts}))
    as_of = as_of or snapshot_dates[-1]
    dataset_start = dataset_start or snapshot_dates[0]
    missing = tuple(missing_snapshot_dates) or tuple(missing_dates_from_snapshots(snapshot_dates))
    identities = _product_meta_from_facts(facts, catalog)
    occurred = occurred_from_facts(facts, as_of=as_of)
    if extra_occurred:
        seen = {(row.product_id, row.show_date, row.theater_id) for row in occurred}
        for row in extra_occurred:
            identities.setdefault(
                row.product_id,
                resolve_product_identity(
                    source_film_id=row.source_film_id,
                    source_release_id=row.source_release_id,
                    title=row.title,
                    title_key=row.title_key,
                ),
            )
            key = (row.product_id, row.show_date, row.theater_id)
            if key not in seen:
                occurred.append(row)
                seen.add(key)

    occurred_by_product: dict[str, list[date]] = defaultdict(list)
    for row in occurred:
        occurred_by_product[row.product_id].append(row.show_date)
    gaps = measure_gaps(
        occurred_by_product,
        identities,
        catalog=catalog,
        missing_snapshot_dates=missing,
    )
    active_ids = active_product_ids(facts, as_of=as_of)
    runs = build_runs(
        occurred,
        identities,
        gap_threshold_days=gap_threshold_days,
        as_of=as_of,
        dataset_start=dataset_start,
        catalog=catalog,
        active_product_ids_at_as_of=active_ids,
    )
    observations = build_observations(
        facts, runs, identities, as_of=as_of, catalog=catalog
    )
    quality_counts = Counter(row.observation_quality for row in observations)
    gap_summary = summarize_gaps(gaps, len(occurred_by_product))
    gap_summary["identity_changes_on_same_title"] = identity_change_cases(facts)
    return LifecycleAuditResult(
        as_of=as_of,
        dataset_start=dataset_start,
        gap_threshold_days=gap_threshold_days,
        snapshot_dates=snapshot_dates,
        missing_snapshot_dates=missing,
        identities=identities,
        runs=runs,
        gaps=gaps,
        observations=observations,
        gap_summary=gap_summary,
        run_type_stats=run_type_lifecycle_stats(runs),
        wednesday_cadence=summarize_wednesday_cadence(observations),
        observation_quality_counts=dict(quality_counts),
    )


def write_observation_csv(path: Path, observations: Sequence[ObservationRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OBSERVATION_FIELDNAMES)
        writer.writeheader()
        for row in observations:
            writer.writerow(row.to_csv_dict())


def inventory_committed_logs(logs_dir: Path) -> dict[str, Any]:
    """Classify committed ``*_amc.json`` logs without loading Git history."""
    paths = sorted(logs_dir.glob("*_amc.json"))
    dates: list[date] = []
    with_movie_id = 0
    without_movie_id = 0
    generated_at: list[str] = []
    for path in paths:
        prefix = path.stem.rsplit("_", 1)[0]
        try:
            snap_date = date.fromisoformat(prefix)
        except ValueError:
            continue
        dates.append(snap_date)
        text = path.read_text(encoding="utf-8")
        envelope = json.loads(text)
        stamp, _parsed = parse_snapshot_timestamp(envelope.get("generated_at"))
        if envelope.get("generated_at"):
            generated_at.append(str(envelope.get("generated_at")))
        if '"movie_id"' in text or '"movieId"' in text:
            with_movie_id += 1
        else:
            without_movie_id += 1
        _ = stamp
    dates.sort()
    missing = missing_dates_from_snapshots(dates)
    return {
        "source": "committed_daily_json_logs",
        "preserves_forward_booking_at_T": True,
        "legacy_14day_fetch_ceiling": True,
        "log_count": len(dates),
        "earliest": dates[0].isoformat() if dates else "",
        "latest": dates[-1].isoformat() if dates else "",
        "missing_dates": [day.isoformat() for day in missing],
        "missing_count": len(missing),
        "logs_with_movie_id": with_movie_id,
        "logs_without_movie_id": without_movie_id,
        "distinct_observation_dates": len(dates),
        "generated_at_sample": generated_at[:3],
    }


def json_ready(value: Any) -> Any:
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_ready(item) for item in value]
    return value
