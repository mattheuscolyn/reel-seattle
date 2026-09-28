"""Leaving Soon v2 audit helpers.

Analysis only. These functions score historical snapshots and candidate
splits. They do not load ``active.json``, refit production, or write the
public Leaving Soon artifact.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_frozen import ALL_ANNOUNCED_BOUNDARY
from reel_seattle.analysis.leaving_soon_prospective import binary_from_remaining, realized_remaining_days
from reel_seattle.analysis.leaving_soon_survival import (
    classification_metrics,
    reliability_table,
    split_by_observation_date,
    threshold_for_precision,
)
from reel_seattle.analysis.leaving_soon_timing import bound_predicted_end_date, model_median_end_date

BOUNDARY = date.fromisoformat(ALL_ANNOUNCED_BOUNDARY)
HORIZONS = (3, 7, 14, 21)
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
CANDIDATE_TRAIN_END = date(2026, 8, 14)
CANDIDATE_VAL_END = date(2026, 9, 2)
MIN_HOLDOUT_14 = 40
MIN_MATURE_7 = 80
MIN_MATURE_14 = 40


def parse_iso_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def regime_for_date(observation_date: date) -> str:
    """Tag the collection regime from the frozen all-announced boundary."""
    if observation_date >= BOUNDARY:
        return "all_announced_future"
    return "capped_pit"


def is_mature(observation_date: date, as_of: date, horizon: int) -> bool:
    """True when ``as_of`` is at least ``horizon`` days after the prediction."""
    if horizon < 0:
        raise ValueError("horizon must be non-negative")
    return (as_of - observation_date).days >= horizon


def production_bucket(p7: float, p14: float, *, last_chance_threshold: float, leaving_soon_threshold: float) -> str | None:
    """Frozen public rule: last_chance, else leaving_soon, else untagged."""
    if p7 >= last_chance_threshold:
        return "last_chance"
    if p14 >= leaving_soon_threshold:
        return "leaving_soon"
    return None


def error_class(label: int | None, flagged: bool) -> str:
    """Classify one matured prediction. Immature rows stay out of the metrics."""
    if label is None:
        return "immature"
    if flagged and label == 1:
        return "tp"
    if flagged and label == 0:
        return "fp"
    if not flagged and label == 0:
        return "tn"
    return "fn"


def specificity(tp: float, fp: float, tn: float, fn: float) -> float:
    del fn
    denom = tn + fp
    return float(tn) / float(denom) if denom else 0.0


def calibration_error(table: Sequence[Mapping[str, float]]) -> float:
    """Expected calibration error from a reliability table."""
    total = sum(float(row["n"]) for row in table)
    if not total:
        return float("nan")
    gap = sum(abs(float(row["mean_predicted"]) - float(row["mean_observed"])) * float(row["n"]) for row in table)
    return gap / total


def score_binary(y_true: Sequence[int], scores: Sequence[float], *, threshold: float) -> dict[str, Any]:
    if not y_true:
        return {"n": 0.0, "note": "no matured predictions"}
    metrics = classification_metrics(y_true, scores, threshold=threshold)
    table = reliability_table(y_true, scores)
    metrics["specificity"] = specificity(metrics["tp"], metrics["fp"], metrics["tn"], metrics["fn"])
    metrics["coverage"] = (metrics["tp"] + metrics["fp"]) / metrics["n"] if metrics["n"] else 0.0
    metrics["calibration_error"] = calibration_error(table)
    metrics["reliability"] = table
    metrics["false_positive_count"] = metrics["fp"]
    metrics["false_negative_count"] = metrics["fn"]
    return metrics


def operating_points(
    y_true: Sequence[int],
    scores: Sequence[float],
    targets: Sequence[float],
) -> list[dict[str, float]]:
    rows = []
    for target in targets:
        chosen = threshold_for_precision(y_true, scores, min_precision=target)
        rows.append({"target_precision": float(target), **chosen})
    return rows


def label_for_horizon(
    *,
    observation_date: date,
    run_end: date | None,
    as_of: date,
    horizon: int,
) -> int | None:
    """Mature binary label. Returns None when the horizon has not elapsed."""
    if not is_mature(observation_date, as_of, horizon):
        return None
    remaining = realized_remaining_days(
        observation_date=observation_date,
        run_end_date=run_end,
        as_of=as_of,
    )
    follow = (as_of - observation_date).days
    return binary_from_remaining(remaining, horizon=horizon, follow_up_days=follow)


def iter_eligible_predictions(snapshots: Sequence[Mapping[str, Any]]):
    """Yield eligible prediction records from historical snapshots only."""
    for snapshot in snapshots:
        if snapshot.get("skipped"):
            continue
        for pred in snapshot.get("predictions") or []:
            if not pred.get("eligible"):
                continue
            if pred.get("p_end_within_7d") is None or pred.get("p_end_within_14d") is None:
                continue
            obs = parse_iso_date(pred.get("observation_date"))
            if obs is None:
                continue
            yield pred


def join_predictions(
    snapshots: Sequence[Mapping[str, Any]],
    *,
    observations_by_key: Mapping[tuple[str, str], Any],
    run_ends: Mapping[str, date | None],
    as_of: date,
    last_chance_threshold: float,
    leaving_soon_threshold: float,
) -> list[dict[str, Any]]:
    """Join stored predictions to same-day features and later realized ends.

    Feature lookup is exact ``(run_id, observation_date)``. A later lifecycle
    row is never used as a model input. Run-end dates are labels only.
    """
    joined: list[dict[str, Any]] = []
    for pred in iter_eligible_predictions(snapshots):
        obs = parse_iso_date(pred.get("observation_date"))
        assert obs is not None
        run_id = str(pred.get("run_id") or "")
        feature_row = observations_by_key.get((run_id, obs.isoformat()))
        if feature_row is not None and feature_row.observation_date != obs:
            raise AssertionError("feature row observation_date does not match the prediction")
        run_end = run_ends.get(run_id)
        p3 = pred.get("p_end_within_3d")
        p7 = float(pred["p_end_within_7d"])
        p14 = float(pred["p_end_within_14d"])
        p21 = pred.get("p_end_within_21d")
        bucket = production_bucket(
            p7,
            p14,
            last_chance_threshold=last_chance_threshold,
            leaving_soon_threshold=leaving_soon_threshold,
        )
        labels = {
            horizon: label_for_horizon(observation_date=obs, run_end=run_end, as_of=as_of, horizon=horizon)
            for horizon in HORIZONS
        }
        remaining = realized_remaining_days(observation_date=obs, run_end_date=run_end, as_of=as_of)
        features = _feature_payload(feature_row) if feature_row is not None else None
        max_show = None
        if feature_row is not None:
            max_show = parse_iso_date((feature_row.raw or {}).get("farthest_announced_show_date"))
        joined.append(
            {
                "observation_date": obs.isoformat(),
                "run_id": run_id,
                "source_film_id": str(pred.get("source_film_id") or ""),
                "title": str(pred.get("title") or ""),
                "run_type": str(pred.get("run_type") or "unknown"),
                "public_eligible": bool(pred.get("public_eligible")),
                "weak_segment": pred.get("weak_segment"),
                "p3": None if p3 is None else float(p3),
                "p7": p7,
                "p14": p14,
                "p21": None if p21 is None else float(p21),
                "median_remaining_days": pred.get("median_remaining_days"),
                "median_beyond_horizon": bool(pred.get("median_beyond_horizon")),
                "stored_bucket": pred.get("leaving_soon_bucket"),
                "bucket": bucket if pred.get("public_eligible") else None,
                "internal_bucket": bucket,
                "run_end_date": run_end.isoformat() if run_end else None,
                "remaining_days": remaining,
                "labels": {str(horizon): labels[horizon] for horizon in HORIZONS},
                "regime": regime_for_date(obs),
                "features": features,
                "max_show_date": max_show.isoformat() if max_show else None,
                "feature_joined": feature_row is not None,
            }
        )
    return joined


def _feature_payload(row: Any) -> dict[str, Any]:
    showtime_count = int(row.showtime_count or 0)
    return {
        "theater_count": int(row.theater_count),
        "showtime_count": showtime_count,
        "days_with_announced_showtimes": int(row.days_with_announced_showtimes),
        "announced_horizon_days": int(row.announced_horizon_days),
        "showtimes_per_active_day": float(row.showtimes_per_active_day),
        "weekend_showtime_count": int(row.weekend_showtime_count),
        "prime_time_showtime_count": int(row.prime_time_showtime_count),
        "premium_format_count": int(row.premium_format_count),
        "premium_format_share": float(row.premium_format_share),
        "weekend_share": (row.weekend_showtime_count / showtime_count) if showtime_count else 0.0,
        "prime_share": (row.prime_time_showtime_count / showtime_count) if showtime_count else 0.0,
        "delta_theater_count": row.delta_theater_count,
        "delta_showtime_count": row.delta_showtime_count,
        "farthest_show_date_delta": row.farthest_show_date_delta,
        "lost_theater_since_prior": bool(row.lost_theater_since_prior),
        "lost_weekend_coverage": bool(row.lost_weekend_coverage),
        "lost_prime_time_coverage": bool(row.lost_prime_time_coverage),
        "days_since_run_start": int(row.days_since_run_start),
        "observations_since_run_start": int(row.observations_since_run_start),
        "horizon_at_ceiling": int(row.announced_horizon_days) >= 13,
        "low_footprint": int(row.theater_count) <= 2,
        "is_first_week": int(row.days_since_run_start) < 7,
        "weekday": WEEKDAYS[row.observation_date.weekday()],
    }


def horizon_frame(rows: Sequence[Mapping[str, Any]], horizon: int, *, public_only: bool = False) -> tuple[list[int], list[float]]:
    y_true: list[int] = []
    scores: list[float] = []
    key = {3: "p3", 7: "p7", 14: "p14", 21: "p21"}[horizon]
    for row in rows:
        if public_only and not row.get("public_eligible"):
            continue
        label = (row.get("labels") or {}).get(str(horizon))
        score = row.get(key)
        if label is None or score is None:
            continue
        y_true.append(int(label))
        scores.append(float(score))
    return y_true, scores


def bucket_frame(
    rows: Sequence[Mapping[str, Any]],
    *,
    bucket: str,
    horizon: int,
) -> tuple[list[int], list[int]]:
    """Return labels and hard flags for one public bucket. Immature rows drop out."""
    y_true: list[int] = []
    flags: list[int] = []
    for row in rows:
        if not row.get("public_eligible"):
            continue
        label = (row.get("labels") or {}).get(str(horizon))
        if label is None:
            continue
        y_true.append(int(label))
        flags.append(1 if row.get("bucket") == bucket else 0)
    return y_true, flags


def segment_name_map(features: Mapping[str, Any] | None, run_type: str) -> dict[str, str]:
    """Segment labels knowable at prediction time."""
    if not features:
        return {"run_type": run_type, "features": "unjoined"}
    theaters = int(features["theater_count"])
    if theaters <= 1:
        footprint = "1_theater"
    elif theaters == 2:
        footprint = "2_theaters"
    elif theaters <= 4:
        footprint = "3_4_theaters"
    else:
        footprint = "5plus_theaters"
    age = int(features["days_since_run_start"])
    if age < 7:
        age_band = "age_0_6"
    elif age < 14:
        age_band = "age_7_13"
    elif age < 28:
        age_band = "age_14_27"
    else:
        age_band = "age_28_plus"
    shows = int(features["showtime_count"])
    if shows <= 5:
        volume = "shows_1_5"
    elif shows <= 20:
        volume = "shows_6_20"
    elif shows <= 50:
        volume = "shows_21_50"
    else:
        volume = "shows_51_plus"
    group = run_type
    if run_type == "probable_normal_first_run":
        group = "normal_first_run"
    elif run_type == "rerelease_anniversary":
        group = "rerelease"
    elif run_type == "family_holiday":
        group = "family_holiday"
    else:
        group = "event_or_special"
    return {
        "run_type": group,
        "first_week": "first_week" if features["is_first_week"] else "later_weeks",
        "footprint": footprint,
        "showtime_volume": volume,
        "run_age": age_band,
        "weekday": str(features["weekday"]),
        "lost_weekend": "lost_weekend" if features["lost_weekend_coverage"] else "kept_weekend",
        "lost_primetime": "lost_primetime" if features["lost_prime_time_coverage"] else "kept_primetime",
        "theater_delta": "theater_count_declined" if (features["delta_theater_count"] or 0) < 0 else "theater_count_not_declined",
        "footprint_class": "low_footprint" if features["low_footprint"] else "non_low_footprint",
        "regime": "all_announced_era",
    }


def pattern_tags(row: Mapping[str, Any], *, horizon: int) -> list[str]:
    """Human-readable pattern tags for a matured error row."""
    features = row.get("features") or {}
    tags: list[str] = []
    run_type = str(row.get("run_type") or "")
    if run_type == "rerelease_anniversary":
        tags.append("rerelease")
    elif run_type not in {"probable_normal_first_run", "family_holiday"}:
        tags.append("event_or_special")
    elif run_type == "family_holiday":
        tags.append("family_holiday")
    horizon_days = features.get("announced_horizon_days")
    remaining = row.get("remaining_days")
    if horizon_days is not None and remaining is not None:
        if int(horizon_days) <= 6 and int(remaining) >= horizon + 7:
            tags.append("short_booking_but_run_continued")
        if abs(int(horizon_days) - int(remaining)) <= 2:
            tags.append("booking_horizon_matches_endpoint")
    if features.get("lost_theater_since_prior") or (features.get("delta_theater_count") or 0) < 0:
        if remaining is not None and int(remaining) >= horizon:
            tags.append("temporary_theater_loss")
    if features.get("horizon_at_ceiling"):
        tags.append("horizon_at_ceiling")
    if features.get("low_footprint"):
        tags.append("low_footprint")
    if 3 <= int(features.get("theater_count") or 0) <= 4:
        tags.append("mid_footprint")
    return tags


def error_table(
    rows: Sequence[Mapping[str, Any]],
    *,
    horizon: int,
    kind: str,
    limit: int = 40,
) -> list[dict[str, Any]]:
    """False-positive or false-negative rows for one horizon, public-eligible only."""
    score_key = {7: "p7", 14: "p14", 3: "p3", 21: "p21"}[horizon]
    selected: list[dict[str, Any]] = []
    for row in rows:
        if not row.get("public_eligible"):
            continue
        label = (row.get("labels") or {}).get(str(horizon))
        if label is None:
            continue
        flagged = row.get("bucket") in {"last_chance", "leaving_soon"}
        if horizon == 7:
            flagged = row.get("bucket") == "last_chance"
        klass = error_class(int(label), bool(flagged))
        if klass != kind:
            continue
        features = row.get("features") or {}
        selected.append(
            {
                "title": row.get("title"),
                "run_id": row.get("run_id"),
                "source_film_id": row.get("source_film_id"),
                "prediction_date": row.get("observation_date"),
                "predicted_bucket": row.get("bucket"),
                "p7": row.get("p7"),
                "p14": row.get("p14"),
                "score": row.get(score_key),
                "median_remaining_days": row.get("median_remaining_days"),
                "max_show_date": row.get("max_show_date"),
                "actual_final_show_date": row.get("run_end_date"),
                "actual_remaining_days": row.get("remaining_days"),
                "theater_count": features.get("theater_count"),
                "showtime_count": features.get("showtime_count"),
                "announced_horizon_days": features.get("announced_horizon_days"),
                "delta_theater_count": features.get("delta_theater_count"),
                "delta_showtime_count": features.get("delta_showtime_count"),
                "lost_weekend_coverage": features.get("lost_weekend_coverage"),
                "lost_prime_time_coverage": features.get("lost_prime_time_coverage"),
                "days_since_run_start": features.get("days_since_run_start"),
                "run_type": row.get("run_type"),
                "patterns": pattern_tags(row, horizon=horizon),
            }
        )
    if kind == "fp":
        selected.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
    else:
        selected.sort(key=lambda item: float(item.get("score") or 0))
    return selected[:limit]


def presentation_end_date(row: Mapping[str, Any]) -> date | None:
    obs = parse_iso_date(row.get("observation_date"))
    max_show = parse_iso_date(row.get("max_show_date"))
    if obs is None:
        return None
    raw = model_median_end_date(
        observation_date=obs,
        median_remaining_days=row.get("median_remaining_days"),
        median_beyond_horizon=bool(row.get("median_beyond_horizon")),
    )
    return bound_predicted_end_date(model_median_date=raw, max_show_date=max_show)


def timing_errors(rows: Sequence[Mapping[str, Any]], *, predicate) -> dict[str, Any]:
    """Absolute and signed error of the bounded presentation date vs the realized end."""
    signed: list[int] = []
    for row in rows:
        if not predicate(row):
            continue
        if row.get("remaining_days") is None or row.get("run_end_date") is None:
            continue
        predicted = presentation_end_date(row)
        actual = parse_iso_date(row.get("run_end_date"))
        if predicted is None or actual is None:
            continue
        signed.append((predicted - actual).days)
    return _error_summary(signed)


def _error_summary(signed: Sequence[int]) -> dict[str, Any]:
    if not signed:
        return {"n": 0}
    abs_err = [abs(value) for value in signed]
    n = len(signed)
    return {
        "n": n,
        "mae": sum(abs_err) / n,
        "median_ae": float(sorted(abs_err)[n // 2]),
        "mean_signed_bias": sum(signed) / n,
        "within_1": sum(1 for value in abs_err if value <= 1) / n,
        "within_2": sum(1 for value in abs_err if value <= 2) / n,
        "within_3": sum(1 for value in abs_err if value <= 3) / n,
        "within_7": sum(1 for value in abs_err if value <= 7) / n,
    }


def gap_return_summary(gaps: Sequence[Any]) -> dict[str, Any]:
    """Count disappear/return gaps. Missing-snapshot gaps are reported apart."""
    buckets = {
        "return_1_to_3": 0,
        "return_4_to_7": 0,
        "return_8_to_14": 0,
        "return_after_14": 0,
    }
    artifactual = 0
    by_type: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for gap in gaps:
        dark = int(gap.dark_days)
        if dark <= 3:
            name = "return_1_to_3"
        elif dark <= 7:
            name = "return_4_to_7"
        elif dark <= 14:
            name = "return_8_to_14"
        else:
            name = "return_after_14"
        if getattr(gap, "possibly_missing_snapshot", False):
            artifactual += 1
            continue
        buckets[name] += 1
        by_type[str(gap.run_type)][name] += 1
    return {
        "observed_returns": buckets,
        "possibly_missing_snapshot_gaps": artifactual,
        "by_run_type": {key: dict(value) for key, value in sorted(by_type.items())},
        "note": (
            "The production run rule starts a new run when dark_days >= 14. "
            "Returns of 1-13 days stay inside one run."
        ),
    }


def candidate_split(rows: Sequence[Any], *, train_end: date = CANDIDATE_TRAIN_END, val_end: date = CANDIDATE_VAL_END):
    """Temporal split used for v2 candidates. Holdout is every later row."""
    bundle = split_by_observation_date(rows, train_end=train_end, val_end=val_end)
    from reel_seattle.analysis.leaving_soon_survival import assert_temporal_split_integrity

    assert_temporal_split_integrity(bundle)
    ids = [id(row) for row in bundle.train + bundle.val + bundle.test]
    if len(ids) != len(set(ids)):
        raise AssertionError("a row appears in more than one temporal split")
    if bundle.test and min(row.observation_date for row in bundle.test) <= val_end:
        raise AssertionError("holdout includes validation dates")
    return bundle


def choose_recommendation(
    *,
    matured_7: int,
    matured_14: int,
    v1_pr_auc_7: float,
    candidate_pr_auc_7: float,
    v1_pr_auc_14: float,
    candidate_pr_auc_14: float,
    last_chance_precision: float,
    last_chance_recall: float,
    leaving_soon_precision: float,
) -> str:
    """Pick an audit recommendation. Never promotes a model by itself."""
    if matured_7 < MIN_MATURE_7 or matured_14 < MIN_MATURE_14:
        return "INSUFFICIENT_MATURE_DATA"
    if any(math.isnan(value) for value in (v1_pr_auc_7, candidate_pr_auc_7, v1_pr_auc_14, candidate_pr_auc_14)):
        return "INSUFFICIENT_MATURE_DATA"
    beats_later_holdout = (
        candidate_pr_auc_7 > v1_pr_auc_7 + 0.02 and candidate_pr_auc_14 > v1_pr_auc_14 + 0.02
    )
    if beats_later_holdout:
        return "ADVANCE_V2_CANDIDATE"
    precision_off = last_chance_precision < 0.85 or leaving_soon_precision < 0.80
    too_quiet = last_chance_precision >= 0.95 and last_chance_recall < 0.15
    if precision_off or too_quiet:
        return "RECALIBRATE_V1"
    return "KEEP_V1"


def count_pattern(rows: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        for tag in row.get("patterns") or []:
            counts[str(tag)] += 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def zero_flag_days(snapshots: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Days whose public snapshot flagged nobody."""
    found = []
    for snapshot in snapshots:
        if snapshot.get("skipped"):
            found.append(
                {
                    "observation_date": snapshot.get("observation_date"),
                    "skipped": True,
                    "skipped_reason": snapshot.get("skipped_reason"),
                }
            )
            continue
        stats = snapshot.get("stats") or {}
        last_chance = int(stats.get("last_chance") or 0)
        leaving = int(stats.get("leaving_soon") or 0)
        if last_chance + leaving == 0:
            found.append(
                {
                    "observation_date": snapshot.get("observation_date"),
                    "skipped": False,
                    "eligible": stats.get("eligible"),
                    "public_eligible": stats.get("public_eligible"),
                    "last_chance": last_chance,
                    "leaving_soon": leaving,
                }
            )
    return found


def days_until(as_of: date, observation_date: date) -> int:
    return (as_of - observation_date).days


def mature_cutoff(as_of: date, horizon: int) -> date:
    return as_of - timedelta(days=horizon)


def load_amc_lifecycle(root: Path):
    """Rebuild leakage-safe lifecycle rows from committed logs. Does not write them."""
    import json

    from reel_seattle.analysis.amc_footprint import load_amc_snapshots
    from reel_seattle.analysis.amc_run_lifecycle import (
        build_lifecycle_audit,
        facts_from_snapshots,
        load_catalog_index,
        load_occurred_from_history,
        resolve_product_identity,
    )
    from reel_seattle.analysis.leaving_soon_inference import survival_from_lifecycle_row
    from reel_seattle.normalize import build_theater_index

    logs_dir = root / "data" / "daily_logs"
    history = root / "data" / "history" / "showtimes_history.csv"
    theaters = root / "data" / "theaters.json"
    catalog_path = root / "data" / "source_catalog" / "amc_movie_products.json"
    registry = json.loads(theaters.read_text(encoding="utf-8"))
    theater_index = build_theater_index(registry)
    snapshots = load_amc_snapshots(logs_dir)
    facts = facts_from_snapshots(snapshots, theater_index=theater_index, snapshot_format="json")
    catalog = load_catalog_index(catalog_path) if catalog_path.is_file() else {}
    as_of = max(fact.observation_date for fact in facts)
    product_ids = {
        resolve_product_identity(
            source_film_id=fact.source_film_id,
            source_release_id=fact.source_release_id,
            title=fact.title,
            title_key=fact.title_key,
        ).product_id
        for fact in facts
    }
    extra = [
        row
        for row in load_occurred_from_history(history, theater_index=theater_index, as_of=as_of)
        if row.product_id in product_ids
    ]
    result = build_lifecycle_audit(facts, extra_occurred=extra, catalog=catalog)
    rows = [survival_from_lifecycle_row(row) for row in result.observations]
    return rows, result.gaps, result.as_of
