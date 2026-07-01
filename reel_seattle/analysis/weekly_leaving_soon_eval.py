"""Baseline heuristic evaluation for weekly-extension Leaving Soon labels (PR D2).

Uses Tuesday anchor / current-week and prior-history features only. Post-update and
following-week outcome columns are never used as predictors.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_eval import (
    MIN_LIFT_OVER_BASE,
    MIN_SHIP_COVERAGE,
    MIN_SHIP_PRECISION,
    ConfusionCounts,
    HeuristicSpec,
    MetricResult,
    PredictFn,
    base_positive_rate,
    confusion_counts,
    evaluate_rule,
    monthly_metric_rows,
    select_high_confidence_rules,
    split_rows_by_anchor_date,
)
from reel_seattle.analysis.leaving_soon_labels import LABEL_STATUS_LABELED
from reel_seattle.analysis.weekly_leaving_soon_stability import (
    analyze_weak_months,
    distinct_films_tagged,
    enrich_metric_dict,
    filter_strict_non_event_rows,
    monthly_precision_summary,
)
from reel_seattle.analysis.weekly_leaving_soon_ml import run_weekly_ml_exploration
from reel_seattle.analysis.weekly_leaving_soon_error_audit import (
    build_error_audit_rows,
    summarize_false_positive_audit,
    write_error_audit_csv,
)
from reel_seattle.analysis.weekly_leaving_soon_segments import (
    evaluate_all_segments,
    evaluate_segment_aware_rules,
)

PR_D2_BASELINE_RULE_ID = "no_current_week_weekend"

FORBIDDEN_PREDICTOR_FIELDS = frozenset(
    {
        "post_update_snapshot_date",
        "post_update_gap_days",
        "following_week_start",
        "following_week_end",
        "following_week_showtime_count",
        "following_week_theater_count",
        "following_week_visible_days",
        "gets_following_week_showtimes",
        "leaving_soon_label",
        "label_status",
    }
)

# Tautological horizon fields — excluded from allowed predictors for weekly model.
TAUTOLOGY_FIELDS = frozenset(
    {
        "visible_show_date_count_at_anchor",
        "days_until_anchor_max_show_date",
    }
)

ALLOWED_PREDICTOR_FIELDS = frozenset(
    {
        "label_mode",
        "anchor_date",
        "showtime_film_key",
        "film_title",
        "anchor_weekday",
        "anchor_relevant_wednesday",
        "current_week_start",
        "current_week_end",
        "current_week_showtime_count",
        "current_week_theater_count",
        "current_week_visible_days",
        "current_week_matinee_showtime_count",
        "current_week_primetime_showtime_count",
        "current_week_late_showtime_count",
        "current_week_weekend_showtime_count",
        "current_week_weekend_day_count",
        "current_week_showtime_density",
        "current_week_has_weekend_show",
        "current_week_has_primetime",
        "prior_week_showtime_count",
        "prior_week_theater_count",
        "prior_week_visible_days",
        "showtime_count_change_vs_prior_week",
        "theater_count_change_vs_prior_week",
        "visible_days_change_vs_prior_week",
        "showtime_pct_change_vs_prior_week",
        "theater_pct_change_vs_prior_week",
        "peak_week_showtime_count_to_date",
        "peak_week_theater_count_to_date",
        "peak_showtime_count_to_date",
        "peak_theater_count_to_date",
        "current_showtime_pct_of_peak",
        "current_theater_pct_of_peak",
        "weeks_since_peak_showtimes",
        "weeks_since_peak_theaters",
        "first_anchor_seen_date",
        "weeks_since_first_seen",
        "booking_cycles_seen",
        "booking_cycles_survived",
        "weeks_survived_so_far",
        "is_first_week_observed",
        "is_new_release_like",
        "weekday_only_current_week",
        "single_theater_current_week",
        "single_day_current_week",
        "low_showtime_count_bucket",
        "event_like_flag",
        "event_like_reason",
        "strict_event_like_flag",
        "strict_event_like_reason",
        "run_segment",
        "run_type",
        "flag_anniversary_like",
        "flag_fan_event_like",
        "flag_opening_night_like",
        "flag_sensory_friendly_like",
        "flag_double_feature_like",
        "flag_live_or_concert_like",
        "flag_live_encore_like",
        "flag_classic_rerelease_like",
        "flag_holiday_rerelease_like",
        "flag_anime_event_like",
        "flag_awards_limited_like",
        "flag_foreign_limited_like",
        "flag_family_holiday_like",
        "flag_special_event_like",
        "flag_probable_normal_first_run",
    }
)

COVERAGE_FLOORS = (0.05, 0.10, 0.15, 0.20, 0.30, 0.40)


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def _parse_int(text: str, default: int = 0) -> int:
    text = str(text).strip()
    return int(text) if text else default


def _optional_int(row: Mapping[str, str], field: str) -> int | None:
    text = str(row.get(field, "")).strip()
    if not text:
        return None
    return int(text)


def _optional_float(row: Mapping[str, str], field: str) -> float | None:
    text = str(row.get(field, "")).strip()
    if not text:
        return None
    return float(text)


def _weekday_only_current_week(row: Mapping[str, str]) -> bool:
    return _parse_bool(row.get("weekday_only_current_week", "false"))


def _field_pct_le(row: Mapping[str, str], field: str, threshold: float) -> bool:
    value = _optional_float(row, field)
    return value is not None and value <= threshold


def _not_first_week(row: Mapping[str, str]) -> bool:
    return not _parse_bool(row.get("is_first_week_observed", "false"))


def _trajectory_score(row: Mapping[str, str], threshold: int) -> bool:
    score = 0
    if _weekday_only_current_week(row):
        score += 2
    if _field_pct_le(row, "current_showtime_pct_of_peak", 0.5):
        score += 2
    if _showtime_change_lt(row, 0):
        score += 2
    if _current_week_showtimes_le(row, 15):
        score += 1
    if _weeks_since_first_seen_ge(row, 4):
        score += 1
    return score >= threshold


def load_weekly_labeled_rows(path: Path | str) -> list[dict[str, str]]:
    with Path(path).open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [row for row in rows if row.get("label_status") == LABEL_STATUS_LABELED]


def actual_leaving_soon(row: Mapping[str, str]) -> bool:
    return _parse_bool(row["leaving_soon_label"])


def _current_week_showtimes_le(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row["current_week_showtime_count"]) <= threshold


def _current_week_theaters_le(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row["current_week_theater_count"]) <= threshold


def _current_week_visible_days_le(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row["current_week_visible_days"]) <= threshold


def _no_current_week_weekend(row: Mapping[str, str]) -> bool:
    return not _parse_bool(row.get("current_week_has_weekend_show", "false"))


def _no_current_week_primetime(row: Mapping[str, str]) -> bool:
    return not _parse_bool(row.get("current_week_has_primetime", "false"))


def _showtime_change_lt(row: Mapping[str, str], threshold: int) -> bool:
    change = _optional_int(row, "showtime_count_change_vs_prior_week")
    return change is not None and change < threshold


def _theater_change_lt(row: Mapping[str, str], threshold: int) -> bool:
    change = _optional_int(row, "theater_count_change_vs_prior_week")
    return change is not None and change < threshold


def _visible_days_change_lt(row: Mapping[str, str], threshold: int) -> bool:
    change = _optional_int(row, "visible_days_change_vs_prior_week")
    return change is not None and change < threshold


def _showtime_pct_of_peak_le(row: Mapping[str, str], threshold: float) -> bool:
    if _field_pct_le(row, "current_showtime_pct_of_peak", threshold):
        return True
    peak = _parse_int(row.get("peak_week_showtime_count_to_date", "0")) or _parse_int(
        row.get("peak_showtime_count_to_date", "0")
    )
    current = _parse_int(row["current_week_showtime_count"])
    if peak <= 0:
        return False
    return (current / peak) <= threshold


def _theater_pct_of_peak_le(row: Mapping[str, str], threshold: float) -> bool:
    if _field_pct_le(row, "current_theater_pct_of_peak", threshold):
        return True
    peak = _parse_int(row.get("peak_week_theater_count_to_date", "0")) or _parse_int(
        row.get("peak_theater_count_to_date", "0")
    )
    current = _parse_int(row["current_week_theater_count"])
    if peak <= 0:
        return False
    return (current / peak) <= threshold


def _weeks_since_first_seen_ge(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row.get("weeks_since_first_seen", "0")) >= threshold


def _booking_cycles_survived_ge(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row.get("booking_cycles_survived", "0")) >= threshold


def build_weekly_heuristic_catalog() -> list[HeuristicSpec]:
    specs: list[HeuristicSpec] = [
        HeuristicSpec(
            "always_positive",
            "Always predict leaving soon (base-rate ceiling).",
            lambda _row: True,
        ),
        HeuristicSpec(
            "always_negative",
            "Never predict leaving soon.",
            lambda _row: False,
        ),
        HeuristicSpec(
            "no_current_week_weekend",
            "No weekend showtimes in current booking week.",
            _no_current_week_weekend,
        ),
        HeuristicSpec(
            "no_current_week_primetime",
            "No primetime showtimes in current booking week.",
            _no_current_week_primetime,
        ),
    ]
    for threshold in (5, 10, 15, 20, 30, 50):
        specs.append(
            HeuristicSpec(
                f"current_week_showtimes_le_{threshold}",
                f"Current-week showtime count <= {threshold}.",
                lambda row, t=threshold: _current_week_showtimes_le(row, t),
            )
        )
    for threshold in (1, 2, 3, 4):
        specs.append(
            HeuristicSpec(
                f"current_week_theaters_le_{threshold}",
                f"Current-week theater count <= {threshold}.",
                lambda row, t=threshold: _current_week_theaters_le(row, t),
            )
        )
    for threshold in (1, 2, 3, 4):
        specs.append(
            HeuristicSpec(
                f"current_week_visible_days_le_{threshold}",
                f"Current-week visible play days <= {threshold}.",
                lambda row, t=threshold: _current_week_visible_days_le(row, t),
            )
        )
    for threshold in (-1, -5, -10, -20):
        specs.append(
            HeuristicSpec(
                f"showtime_change_lt_{abs(threshold)}",
                f"Showtime count down vs prior week by > {abs(threshold)}.",
                lambda row, t=threshold: _showtime_change_lt(row, t),
            )
        )
    for threshold in (-1, -2):
        specs.append(
            HeuristicSpec(
                f"theater_change_lt_{abs(threshold)}",
                f"Theater count down vs prior week by > {abs(threshold)}.",
                lambda row, t=threshold: _theater_change_lt(row, t),
            )
        )
    specs.append(
        HeuristicSpec(
            "visible_days_down_vs_prior_week",
            "Visible play days decreased vs prior week.",
            lambda row: _visible_days_change_lt(row, 0),
        )
    )
    for threshold in (0.25, 0.5, 0.75):
        label = str(threshold).replace(".", "")
        specs.append(
            HeuristicSpec(
                f"showtime_pct_of_peak_le_{label}",
                f"Current-week showtimes <= {threshold:.0%} of peak to date.",
                lambda row, t=threshold: _showtime_pct_of_peak_le(row, t),
            )
        )
        specs.append(
            HeuristicSpec(
                f"theater_pct_of_peak_le_{label}",
                f"Current-week theaters <= {threshold:.0%} of peak to date.",
                lambda row, t=threshold: _theater_pct_of_peak_le(row, t),
            )
        )
    for threshold in (2, 4, 8):
        specs.append(
            HeuristicSpec(
                f"weeks_since_first_seen_ge_{threshold}",
                f"Weeks since first seen >= {threshold}.",
                lambda row, t=threshold: _weeks_since_first_seen_ge(row, t),
            )
        )
    for threshold in (2, 4):
        specs.append(
            HeuristicSpec(
                f"booking_cycles_survived_ge_{threshold}",
                f"Survived >= {threshold} prior booking cycles.",
                lambda row, t=threshold: _booking_cycles_survived_ge(row, t),
            )
        )
    specs.extend(
        [
            HeuristicSpec(
                "low_showtimes_and_shrinking",
                "Current-week showtimes <= 15 AND showtimes down vs prior week.",
                lambda row: _current_week_showtimes_le(row, 15)
                and _showtime_change_lt(row, 0),
            ),
            HeuristicSpec(
                "low_theaters_and_mature",
                "Current-week theaters <= 2 AND weeks since first seen >= 4.",
                lambda row: _current_week_theaters_le(row, 2)
                and _weeks_since_first_seen_ge(row, 4),
            ),
            HeuristicSpec(
                "low_peak_share_no_weekend",
                "Showtimes <= 50% of peak AND no current-week weekend.",
                lambda row: _showtime_pct_of_peak_le(row, 0.5)
                and _no_current_week_weekend(row),
            ),
            HeuristicSpec(
                "low_footprint_not_new",
                "Showtimes <= 10 AND theaters <= 2 AND weeks since first seen >= 2.",
                lambda row: _current_week_showtimes_le(row, 10)
                and _current_week_theaters_le(row, 2)
                and _weeks_since_first_seen_ge(row, 2),
            ),
            HeuristicSpec(
                "shrinking_and_low_theaters",
                "Showtimes down vs prior week AND current-week theaters <= 2.",
                lambda row: _showtime_change_lt(row, 0)
                and _current_week_theaters_le(row, 2),
            ),
            HeuristicSpec(
                "low_showtimes_low_theaters_no_primetime",
                "Showtimes <= 15, theaters <= 2, no current-week primetime.",
                lambda row: _current_week_showtimes_le(row, 15)
                and _current_week_theaters_le(row, 2)
                and _no_current_week_primetime(row),
            ),
            HeuristicSpec(
                "weekday_only_and_shrinking",
                "Weekday-only current week AND showtimes down vs prior week.",
                lambda row: _weekday_only_current_week(row) and _showtime_change_lt(row, 0),
            ),
            HeuristicSpec(
                "weekday_only_and_below_peak_50",
                "Weekday-only current week AND showtimes <= 50% of peak week.",
                lambda row: _weekday_only_current_week(row)
                and _showtime_pct_of_peak_le(row, 0.5),
            ),
            HeuristicSpec(
                "no_weekend_and_mature_ge_4",
                "No current-week weekend AND weeks since first seen >= 4.",
                lambda row: _no_current_week_weekend(row)
                and _weeks_since_first_seen_ge(row, 4),
            ),
            HeuristicSpec(
                "no_weekend_and_below_peak_50",
                "No current-week weekend AND showtimes <= 50% of peak week.",
                lambda row: _no_current_week_weekend(row)
                and _showtime_pct_of_peak_le(row, 0.5),
            ),
            HeuristicSpec(
                "low_theaters_and_shrinking",
                "Current-week theaters <= 2 AND theaters down vs prior week.",
                lambda row: _current_week_theaters_le(row, 2)
                and _theater_change_lt(row, 0),
            ),
            HeuristicSpec(
                "low_footprint_not_first_week",
                "Low footprint bucket AND not first observed week.",
                lambda row: _parse_bool(row.get("low_showtime_count_bucket", "false"))
                and _not_first_week(row),
            ),
            HeuristicSpec(
                "trajectory_score_ge_5",
                "Trajectory score >= 5 from weekday-only, shrinkage, peak share, maturity.",
                lambda row: _trajectory_score(row, 5),
            ),
            HeuristicSpec(
                "trajectory_score_ge_6",
                "Trajectory score >= 6 from weekday-only, shrinkage, peak share, maturity.",
                lambda row: _trajectory_score(row, 6),
            ),
        ]
    )
    return specs


def build_tautology_control_catalog() -> list[HeuristicSpec]:
    """Deprecated horizon rules kept for comparison only — not product candidates."""
    return [
        HeuristicSpec(
            "tautology_visible_dates_le_1",
            "[TAUTOLOGY CONTROL] Visible show dates at anchor <= 1.",
            lambda row: _parse_int(row.get("visible_show_date_count_at_anchor", "99")) <= 1,
        ),
        HeuristicSpec(
            "tautology_horizon_le_3",
            "[TAUTOLOGY CONTROL] Days until anchor max show date <= 3.",
            lambda row: _parse_int(row.get("days_until_anchor_max_show_date", "99")) <= 3,
        ),
    ]


def weekly_prediction_examples(
    rows: Sequence[Mapping[str, str]],
    predict: PredictFn,
    *,
    limit: int = 5,
) -> dict[str, list[dict[str, str]]]:
    buckets: dict[str, list[dict[str, str]]] = {
        "true_positive": [],
        "false_positive": [],
        "true_negative": [],
        "false_negative": [],
    }
    for row in rows:
        predicted = predict(row)
        actual = actual_leaving_soon(row)
        if predicted and actual:
            key = "true_positive"
        elif predicted and not actual:
            key = "false_positive"
        elif not predicted and actual:
            key = "false_negative"
        else:
            key = "true_negative"
        if len(buckets[key]) < limit:
            buckets[key].append(
                {
                    "anchor_date": row["anchor_date"],
                    "film_title": row["film_title"],
                    "showtime_film_key": row["showtime_film_key"],
                    "current_week_showtime_count": row["current_week_showtime_count"],
                    "current_week_theater_count": row["current_week_theater_count"],
                    "showtime_count_change_vs_prior_week": row[
                        "showtime_count_change_vs_prior_week"
                    ],
                    "weeks_since_first_seen": row["weeks_since_first_seen"],
                    "leaving_soon_label": row["leaving_soon_label"],
                }
            )
    return buckets


def best_rules_at_coverage_floors(
    validation_metrics: Sequence[MetricResult],
    test_metrics_by_rule: Mapping[str, Mapping[str, Any]],
    *,
    floors: Sequence[float] = COVERAGE_FLOORS,
) -> dict[str, dict[str, Any] | None]:
    """Pick highest-precision validation rules at each minimum coverage floor."""
    results: dict[str, dict[str, Any] | None] = {}
    for floor in floors:
        eligible = [
            metric
            for metric in validation_metrics
            if metric.rule_id not in {"always_positive", "always_negative"}
            and metric.coverage >= floor
            and metric.confusion.predicted_positive > 0
        ]
        if not eligible:
            results[f"{floor:.0%}"] = None
            continue
        eligible.sort(
            key=lambda item: (item.precision, item.lift_over_base, item.coverage),
            reverse=True,
        )
        best = eligible[0]
        test_dict = test_metrics_by_rule.get(best.rule_id)
        results[f"{floor:.0%}"] = {
            "rule_id": best.rule_id,
            "description": best.description,
            "validation": best.to_dict(),
            "test": test_dict,
        }
    return results


def build_weekly_recommendation(
    *,
    overall_base: float,
    high_confidence_validation: Sequence[MetricResult],
    best_test: Mapping[str, Any] | None,
    monthly_by_rule: Mapping[str, Sequence[Mapping[str, Any]]],
    best_rule_id: str,
    coverage_floor_results: Mapping[str, Mapping[str, Any] | None],
) -> dict[str, Any]:
    if not high_confidence_validation or not best_test:
        return {
            "decision": "defer",
            "summary": (
                "No weekly heuristic met high-confidence gates on validation "
                f"(precision>={MIN_SHIP_PRECISION}, coverage>={MIN_SHIP_COVERAGE}, "
                f"lift>={MIN_LIFT_OVER_BASE}) against corrected base rate "
                f"{overall_base:.1%}."
            ),
            "next_steps": [
                "Refine weekly labels or add trajectory features before replacing PR E.",
                "Consider Wednesday PM scrape and AMC movieId for cleaner identity.",
                "Do not ship UI; PR E artifact remains review-only.",
            ],
        }

    test_precision = float(best_test["precision"])
    test_coverage = float(best_test["coverage"])
    test_lift = float(best_test["lift_over_base"])
    monthly = monthly_by_rule.get(best_rule_id, [])
    monthly_precisions = [
        float(item["precision"])
        for item in monthly
        if item["true_positives"] + item["false_positives"] > 0
    ]
    stable = (
        len(monthly_precisions) >= 3
        and min(monthly_precisions) >= MIN_SHIP_PRECISION
        and max(monthly_precisions) - min(monthly_precisions) <= 0.20
    )
    beats_always_positive = test_lift > 1.05
    passes_test_precision = test_precision >= MIN_SHIP_PRECISION

    if passes_test_precision and beats_always_positive and stable and test_coverage >= 0.05:
        decision = "proceed_with_caution"
        summary = (
            f"Best weekly rule `{best_rule_id}` meets precision on held-out test "
            f"({test_precision:.1%}) with lift {test_lift:.2f}x over corrected base "
            f"({overall_base:.1%})."
        )
        next_steps = [
            "Consider a future PR to replace PR E artifact with weekly rule (not UI yet).",
            "Product review required before any frontend work.",
        ]
    elif passes_test_precision and beats_always_positive:
        decision = "needs_more_work"
        summary = (
            f"`{best_rule_id}` passes test precision ({test_precision:.1%}) but monthly "
            "stability or coverage is weak for a product-safe bucket."
        )
        next_steps = [
            "Collect more snapshots and re-evaluate monthly stability.",
            "Do not replace PR E or ship UI until stability improves.",
        ]
    else:
        decision = "defer"
        summary = (
            f"Best validation rule `{best_rule_id}` does not generalize on weekly labels: "
            f"test precision {test_precision:.1%}, lift {test_lift:.2f}x."
        )
        next_steps = [
            "Refine weekly labels/features or defer Leaving Soon UI.",
            "PR E tautology artifact should not be replaced.",
        ]

    return {
        "decision": decision,
        "summary": summary,
        "gates": {
            "test_precision_pass": passes_test_precision,
            "test_lift_pass": beats_always_positive,
            "monthly_stability_pass": stable,
            "test_precision": round(test_precision, 4),
            "test_coverage": round(test_coverage, 4),
            "test_lift_over_base": round(test_lift, 4),
            "corrected_base_positive_rate": round(overall_base, 4),
        },
        "coverage_floor_best_rules": coverage_floor_results,
        "next_steps": next_steps,
    }


def evaluate_weekly_baselines(
    rows: Sequence[Mapping[str, str]],
    specs: Sequence[HeuristicSpec] | None = None,
) -> dict[str, Any]:
    train, val, test = split_rows_by_anchor_date(rows)
    catalog = list(specs or build_weekly_heuristic_catalog())
    tautology_controls = build_tautology_control_catalog()
    all_specs = catalog + tautology_controls
    spec_by_id = {spec.rule_id: spec for spec in all_specs}

    overall_base = base_positive_rate(rows)
    overall: list[dict[str, Any]] = []
    validation: list[dict[str, Any]] = []
    held_out_test: list[dict[str, Any]] = []
    monthly_by_rule: dict[str, list[dict[str, Any]]] = {}

    for spec in all_specs:
        overall.append(
            evaluate_rule(
                rows, rule_id=spec.rule_id, description=spec.description, predict=spec.predict
            ).to_dict()
        )
        validation.append(
            evaluate_rule(
                val,
                rule_id=spec.rule_id,
                description=spec.description,
                predict=spec.predict,
                period="validation",
            ).to_dict()
        )
        held_out_test.append(
            evaluate_rule(
                test,
                rule_id=spec.rule_id,
                description=spec.description,
                predict=spec.predict,
                period="test",
            ).to_dict()
        )
        monthly_by_rule[spec.rule_id] = [
            metric.to_dict()
            for metric in monthly_metric_rows(
                rows,
                rule_id=spec.rule_id,
                description=spec.description,
                predict=spec.predict,
            )
        ]

    val_results = [
        evaluate_rule(
            val,
            rule_id=spec.rule_id,
            description=spec.description,
            predict=spec.predict,
            period="validation",
        )
        for spec in catalog
    ]
    high_conf_val = select_high_confidence_rules(val_results)
    best_rule_id = high_conf_val[0].rule_id if high_conf_val else ""
    best_test: dict[str, Any] | None = None
    best_examples: dict[str, list[dict[str, str]]] | None = None
    if best_rule_id:
        best_spec = spec_by_id[best_rule_id]
        best_test_metric = evaluate_rule(
            test,
            rule_id=best_spec.rule_id,
            description=best_spec.description,
            predict=best_spec.predict,
            period="test",
        )
        best_test = best_test_metric.to_dict()
        best_examples = weekly_prediction_examples(test, best_spec.predict)

    test_by_rule = {item["rule_id"]: item for item in held_out_test if not item["rule_id"].startswith("tautology_")}
    coverage_floor_results = best_rules_at_coverage_floors(
        val_results,
        test_by_rule,
    )

    split_ranges = {
        "train": {
            "start": min(row["anchor_date"] for row in train) if train else "",
            "end": max(row["anchor_date"] for row in train) if train else "",
            "rows": len(train),
        },
        "validation": {
            "start": min(row["anchor_date"] for row in val) if val else "",
            "end": max(row["anchor_date"] for row in val) if val else "",
            "rows": len(val),
        },
        "test": {
            "start": min(row["anchor_date"] for row in test) if test else "",
            "end": max(row["anchor_date"] for row in test) if test else "",
            "rows": len(test),
        },
    }

    recommendation = build_weekly_recommendation(
        overall_base=overall_base,
        high_confidence_validation=high_conf_val,
        best_test=best_test,
        monthly_by_rule=monthly_by_rule,
        best_rule_id=best_rule_id,
        coverage_floor_results=coverage_floor_results,
    )

    tautology_test = [
        item for item in held_out_test if item["rule_id"].startswith("tautology_")
    ]

    pr_d2_spec = spec_by_id[PR_D2_BASELINE_RULE_ID]
    pr_d2_test_metric = evaluate_rule(
        test,
        rule_id=pr_d2_spec.rule_id,
        description=pr_d2_spec.description,
        predict=pr_d2_spec.predict,
        period="test",
    )
    pr_d2_monthly = monthly_by_rule.get(PR_D2_BASELINE_RULE_ID, [])
    pr_d2_baseline = enrich_metric_dict(
        pr_d2_test_metric,
        test,
        pr_d2_spec.predict,
        monthly=pr_d2_monthly,
    )

    weak_month_analysis: list[dict[str, Any]] = []
    best_monthly_stability: dict[str, Any] = {}
    if best_rule_id:
        best_spec = spec_by_id[best_rule_id]
        weak_month_analysis = analyze_weak_months(rows, best_spec.predict)
        best_monthly_stability = monthly_precision_summary(
            monthly_by_rule.get(best_rule_id, [])
        )
        if best_test is not None:
            best_test_metric = evaluate_rule(
                test,
                rule_id=best_rule_id,
                description=best_spec.description,
                predict=best_spec.predict,
                period="test",
            )
            best_test = enrich_metric_dict(
                best_test_metric,
                test,
                best_spec.predict,
                monthly=monthly_by_rule.get(best_rule_id, []),
            )

    strict_rows = filter_strict_non_event_rows(rows)
    strict_experiment: dict[str, Any] = {
        "rows_removed": len(rows) - len(strict_rows),
        "labeled_rows_after_filter": len(strict_rows),
        "base_positive_rate_after_filter": round(base_positive_rate(strict_rows), 4),
    }
    if strict_rows:
        strict_test_rows = [
            row for row in strict_rows if row["anchor_date"] in {r["anchor_date"] for r in test}
        ]
        seen_rules: list[str] = []
        for rule_id in (best_rule_id or PR_D2_BASELINE_RULE_ID, PR_D2_BASELINE_RULE_ID):
            if not rule_id or rule_id in seen_rules:
                continue
            seen_rules.append(rule_id)
            spec = spec_by_id[rule_id]
            metric = evaluate_rule(
                strict_test_rows,
                rule_id=spec.rule_id,
                description=spec.description,
                predict=spec.predict,
                period="strict_test",
            )
            monthly = [
                item.to_dict()
                for item in monthly_metric_rows(
                    strict_rows,
                    rule_id=spec.rule_id,
                    description=spec.description,
                    predict=spec.predict,
                )
            ]
            strict_experiment[rule_id] = enrich_metric_dict(
                metric, strict_test_rows, spec.predict, monthly=monthly
            )

    best_spec = spec_by_id.get(best_rule_id or PR_D2_BASELINE_RULE_ID)
    segment_analysis: dict[str, Any] = {}
    segment_aware_experiment: dict[str, Any] = {}
    error_audit_summary: dict[str, Any] = {}
    if best_spec is not None:
        segment_analysis = evaluate_all_segments(
            rows,
            rule_id=best_spec.rule_id,
            description=best_spec.description,
            predict=best_spec.predict,
            test_rows=test,
        )
        segment_aware_experiment = evaluate_segment_aware_rules(
            rows,
            test,
            base_rule_id=best_spec.rule_id,
            base_description=best_spec.description,
            base_predict=best_spec.predict,
        )
        audit_rows = build_error_audit_rows(
            rows,
            rule_id=best_spec.rule_id,
            predict=best_spec.predict,
        )
        error_audit_summary = summarize_false_positive_audit(audit_rows)

    return {
        "label_mode": "weekly-extension",
        "feature_version": "event-segment-v1",
        "labeled_rows": len(rows),
        "distinct_films": len({row["showtime_film_key"] for row in rows}),
        "base_positive_rate": round(overall_base, 4),
        "anchor_date_range": {
            "earliest": min(row["anchor_date"] for row in rows) if rows else "",
            "latest": max(row["anchor_date"] for row in rows) if rows else "",
        },
        "event_like_handling": (
            "Event-like films are excluded at label build time by default "
            "(label_status=event_like_excluded); evaluation uses labeled rows only."
        ),
        "predictor_guardrails": {
            "allowed_field_count": len(ALLOWED_PREDICTOR_FIELDS),
            "forbidden_field_count": len(FORBIDDEN_PREDICTOR_FIELDS),
            "tautology_fields_excluded": sorted(TAUTOLOGY_FIELDS),
        },
        "time_splits": split_ranges,
        "overall_metrics": overall,
        "validation_metrics": validation,
        "test_metrics": held_out_test,
        "tautology_control_test_metrics": tautology_test,
        "high_confidence_validation_rules": [metric.to_dict() for metric in high_conf_val[:10]],
        "best_high_confidence_rule": {
            "rule_id": best_rule_id,
            "validation": high_conf_val[0].to_dict() if high_conf_val else None,
            "test": best_test,
            "monthly": monthly_by_rule.get(best_rule_id, []) if best_rule_id else [],
            "examples": best_examples,
        },
        "coverage_floor_best_rules": coverage_floor_results,
        "pr_d2_baseline_rule": {
            "rule_id": PR_D2_BASELINE_RULE_ID,
            "test": pr_d2_baseline,
        },
        "weak_month_analysis": weak_month_analysis,
        "best_rule_monthly_stability": best_monthly_stability,
        "strict_event_filter_experiment": strict_experiment,
        "segment_analysis": segment_analysis,
        "segment_aware_experiment": segment_aware_experiment,
        "error_audit_summary": error_audit_summary,
        "recommendation": recommendation,
    }



def write_weekly_predictions_csv(
    output_path: Path,
    rows: Sequence[Mapping[str, str]],
    *,
    rule_id: str,
    predict: PredictFn,
) -> None:
    fieldnames = [
        "anchor_date",
        "showtime_film_key",
        "film_title",
        "leaving_soon_label",
        "predicted_leaving_soon",
        "rule_id",
        "current_week_showtime_count",
        "current_week_theater_count",
        "current_week_visible_days",
        "showtime_count_change_vs_prior_week",
        "theater_count_change_vs_prior_week",
        "weeks_since_first_seen",
        "booking_cycles_survived",
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "anchor_date": row["anchor_date"],
                    "showtime_film_key": row["showtime_film_key"],
                    "film_title": row["film_title"],
                    "leaving_soon_label": row["leaving_soon_label"],
                    "predicted_leaving_soon": "true" if predict(row) else "false",
                    "rule_id": rule_id,
                    "current_week_showtime_count": row["current_week_showtime_count"],
                    "current_week_theater_count": row["current_week_theater_count"],
                    "current_week_visible_days": row["current_week_visible_days"],
                    "showtime_count_change_vs_prior_week": row[
                        "showtime_count_change_vs_prior_week"
                    ],
                    "theater_count_change_vs_prior_week": row[
                        "theater_count_change_vs_prior_week"
                    ],
                    "weeks_since_first_seen": row["weeks_since_first_seen"],
                    "booking_cycles_survived": row["booking_cycles_survived"],
                }
            )


def render_weekly_markdown_report(report: Mapping[str, Any]) -> str:
    lines = [
        "# Weekly Leaving Soon baseline evaluation",
        "",
        f"- Feature version: **{report.get('feature_version', 'weekly-extension')}**",
        f"- Label mode: **{report['label_mode']}**",
        f"- Labeled rows: **{report['labeled_rows']}**",
        f"- Distinct films: **{report['distinct_films']}**",
        f"- Corrected base positive rate: **{report['base_positive_rate']:.1%}**",
        f"- Anchor range: **{report['anchor_date_range']['earliest']}** → "
        f"**{report['anchor_date_range']['latest']}**",
        "",
        "## Recommendation",
        "",
        f"**Decision:** `{report['recommendation']['decision']}`",
        "",
        report["recommendation"]["summary"],
        "",
        "### Next steps",
        "",
    ]
    for step in report["recommendation"]["next_steps"]:
        lines.append(f"- {step}")

    lines.extend(["", "## Best rules at coverage floors (validation → test)", ""])
    for floor, entry in report["coverage_floor_best_rules"].items():
        if entry is None:
            lines.append(f"- **{floor} coverage floor:** no rule met floor")
            continue
        test = entry.get("test") or {}
        lines.append(f"- **{floor} floor:** `{entry['rule_id']}`")
        if test:
            lines.append(
                f"  - Test: precision **{test.get('precision', 0):.1%}**, "
                f"recall **{test.get('recall', 0):.1%}**, coverage **{test.get('coverage', 0):.1%}**, "
                f"lift **{test.get('lift_over_base', 0):.2f}x**, "
                f"FP **{test.get('false_positives', 0)}**, FN **{test.get('false_negatives', 0)}**"
            )

    lines.extend(["", "## Best high-confidence rule (validation gates → test)", ""])
    best = report["best_high_confidence_rule"]
    if best["rule_id"]:
        lines.append(f"- Rule: `{best['rule_id']}`")
        if best["validation"]:
            v = best["validation"]
            lines.append(
                f"- Validation: precision **{v['precision']:.1%}**, recall **{v['recall']:.1%}**, "
                f"coverage **{v['coverage']:.1%}**, lift **{v['lift_over_base']:.2f}x**"
            )
        if best["test"]:
            t = best["test"]
            lines.append(
                f"- Held-out test: precision **{t['precision']:.1%}**, recall **{t['recall']:.1%}**, "
                f"coverage **{t['coverage']:.1%}**, lift **{t['lift_over_base']:.2f}x**, "
                f"FP **{t['false_positives']}**, FN **{t['false_negatives']}**"
            )
        lines.extend(["", "### Monthly precision (best rule)", ""])
        for month_row in best.get("monthly", []):
            if month_row["true_positives"] + month_row["false_positives"] == 0:
                continue
            lines.append(
                f"- {month_row['period']}: precision **{month_row['precision']:.1%}**, "
                f"coverage **{month_row['coverage']:.1%}**"
            )
        if best.get("examples"):
            lines.extend(["", "### Example errors (held-out test)", ""])
            for label, heading in (
                ("false_positive", "False positives"),
                ("false_negative", "False negatives"),
            ):
                lines.append(f"**{heading}:**")
                for example in best["examples"].get(label, []):
                    lines.append(
                        f"- {example['anchor_date']} {example['film_title']} "
                        f"(cw_showtimes={example['current_week_showtime_count']}, "
                        f"cw_theaters={example['current_week_theater_count']}, "
                        f"showtime_chg={example['showtime_count_change_vs_prior_week'] or 'n/a'})"
                    )
                lines.append("")
    else:
        lines.append("No rule met high-confidence gates on validation.")

    audit = report.get("error_audit_summary")
    if audit:
        lines.extend(
            [
                "",
                "## Error audit summary (all labeled rows)",
                "",
                f"- False positives: **{audit.get('false_positive_count', 0)}**",
                f"- False negatives: **{audit.get('false_negative_count', 0)}**",
                f"- Top FP run types: **{audit.get('by_run_type', {})}**",
            ]
        )

    segment_aware = report.get("segment_aware_experiment", {}).get("rules", {})
    if segment_aware:
        lines.extend(["", "## Segment-aware rules (evaluation-only, held-out test)", ""])
        for rule_id, metrics in segment_aware.items():
            stability = metrics.get("monthly_stability", {})
            lines.append(
                f"- `{rule_id}`: precision **{metrics.get('precision', 0):.1%}**, "
                f"recall **{metrics.get('recall', 0):.1%}**, coverage **{metrics.get('coverage', 0):.1%}**, "
                f"monthly min **{stability.get('min_precision', 0):.1%}**"
            )

    lines.extend(["", "## Tautology controls (not product candidates)", ""])
    for item in report.get("tautology_control_test_metrics", []):
        if item["true_positives"] + item["false_positives"] == 0:
            continue
        lines.append(
            f"- `{item['rule_id']}`: precision **{item['precision']:.1%}**, "
            f"coverage **{item['coverage']:.1%}**, lift **{item['lift_over_base']:.2f}x**"
        )

    lines.extend(["", "## Top non-tautological rules on held-out test (by precision)", ""])
    test_metrics = sorted(
        [
            item
            for item in report["test_metrics"]
            if not item["rule_id"].startswith("tautology_")
            and item["rule_id"] not in {"always_positive", "always_negative"}
        ],
        key=lambda item: (item["precision"], item["lift_over_base"]),
        reverse=True,
    )
    for item in test_metrics[:10]:
        if item["true_positives"] + item["false_positives"] == 0:
            continue
        lines.append(
            f"- `{item['rule_id']}`: precision **{item['precision']:.1%}**, "
            f"recall **{item['recall']:.1%}**, coverage **{item['coverage']:.1%}**, "
            f"lift **{item['lift_over_base']:.2f}x**"
        )
    lines.append("")
    return "\n".join(lines)


def run_weekly_baseline_evaluation(
    input_path: Path,
    *,
    json_output: Path,
    markdown_output: Path,
    predictions_output: Path | None = None,
) -> dict[str, Any]:
    rows = load_weekly_labeled_rows(input_path)
    report = evaluate_weekly_baselines(rows)
    ml_output = json_output.parent / "weekly_leaving_soon_ml_exploration.json"
    report["ml_exploration"] = run_weekly_ml_exploration(rows, output_path=ml_output)

    best_rule_id = report["best_high_confidence_rule"]["rule_id"] or PR_D2_BASELINE_RULE_ID
    catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
    audit_spec = catalog.get(best_rule_id)
    audit_output = json_output.parent / "weekly_leaving_soon_error_audit.csv"
    if audit_spec is not None:
        audit_rows = build_error_audit_rows(
            rows,
            rule_id=audit_spec.rule_id,
            predict=audit_spec.predict,
        )
        write_error_audit_csv(audit_output, audit_rows)
        report["error_audit_path"] = str(audit_output)
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown_output.write_text(render_weekly_markdown_report(report) + "\n", encoding="utf-8")

    best_rule_id = report["best_high_confidence_rule"]["rule_id"]
    if not best_rule_id:
        floors = report["coverage_floor_best_rules"]
        for entry in floors.values():
            if entry and entry.get("rule_id"):
                best_rule_id = entry["rule_id"]
                break

    if predictions_output is not None and best_rule_id:
        catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
        spec = catalog.get(best_rule_id)
        if spec is not None:
            write_weekly_predictions_csv(
                predictions_output,
                rows,
                rule_id=best_rule_id,
                predict=spec.predict,
            )
            report["predictions_output_path"] = str(predictions_output)

    report["json_output_path"] = str(json_output)
    report["markdown_output_path"] = str(markdown_output)
    return report
