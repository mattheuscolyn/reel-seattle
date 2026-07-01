"""Segmentation experiments for weekly Leaving Soon evaluation (PR D4)."""

from __future__ import annotations

from typing import Any, Callable, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_eval import (
    MetricResult,
    PredictFn,
    base_positive_rate,
    evaluate_rule,
    monthly_metric_rows,
)
from reel_seattle.analysis.special_screening_flags import assign_row_segment
from reel_seattle.analysis.weekly_leaving_soon_stability import (
    enrich_metric_dict,
    monthly_precision_summary,
)

SegmentFilter = Callable[[Sequence[Mapping[str, str]]], list[dict[str, str]]]


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def filter_all_rows(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [dict(row) for row in rows]


def filter_exclude_strict_event(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [
        dict(row) for row in rows if not _parse_bool(row.get("strict_event_like_flag", "false"))
    ]


def filter_exclude_holiday_family(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [
        dict(row)
        for row in rows
        if not _parse_bool(row.get("flag_family_holiday_like", "false"))
        and not _parse_bool(row.get("flag_holiday_rerelease_like", "false"))
        and assign_row_segment(row) != "holiday_family_rerelease"
    ]


def filter_exclude_all_special(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [
        dict(row)
        for row in rows
        if _parse_bool(row.get("flag_probable_normal_first_run", "false"))
        or assign_row_segment(row) == "normal_first_run"
    ]


def filter_normal_first_run_only(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [dict(row) for row in rows if assign_row_segment(row) == "normal_first_run"]


def filter_special_limited_only(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [dict(row) for row in rows if assign_row_segment(row) == "special_limited_run"]


def filter_holiday_family_only(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [dict(row) for row in rows if assign_row_segment(row) == "holiday_family_rerelease"]


SEGMENT_DEFINITIONS: dict[str, tuple[str, SegmentFilter]] = {
    "all_rows": ("All labeled rows", filter_all_rows),
    "exclude_strict_event": ("Exclude strict event-like rows", filter_exclude_strict_event),
    "exclude_holiday_family": (
        "Exclude holiday/family re-release-like rows",
        filter_exclude_holiday_family,
    ),
    "exclude_all_special": ("Normal-first-run-like only (exclude special)", filter_exclude_all_special),
    "normal_first_run_only": ("Normal first-run segment only", filter_normal_first_run_only),
    "special_limited_only": ("Special/limited-run segment only", filter_special_limited_only),
    "holiday_family_only": ("Holiday/family re-release segment only", filter_holiday_family_only),
}


def evaluate_segment(
    rows: Sequence[Mapping[str, str]],
    *,
    segment_id: str,
    rule_id: str,
    description: str,
    predict: PredictFn,
    test_anchor_dates: set[str] | None = None,
) -> dict[str, Any]:
    segment_label, segment_filter = SEGMENT_DEFINITIONS[segment_id]
    filtered = segment_filter(rows)
    test_rows = filtered
    if test_anchor_dates is not None:
        test_rows = [row for row in filtered if row["anchor_date"] in test_anchor_dates]
    if not test_rows:
        return {
            "segment_id": segment_id,
            "segment_label": segment_label,
            "labeled_rows": len(filtered),
            "test_rows": 0,
            "base_positive_rate": round(base_positive_rate(filtered), 4) if filtered else 0.0,
            "rule_id": rule_id,
            "test": None,
        }
    metric = evaluate_rule(
        test_rows,
        rule_id=rule_id,
        description=description,
        predict=predict,
        period=f"{segment_id}_test",
    )
    monthly = [
        item.to_dict()
        for item in monthly_metric_rows(
            filtered,
            rule_id=rule_id,
            description=description,
            predict=predict,
        )
    ]
    december_metrics = _december_precision(filtered, predict)
    return {
        "segment_id": segment_id,
        "segment_label": segment_label,
        "labeled_rows": len(filtered),
        "test_rows": len(test_rows),
        "base_positive_rate": round(base_positive_rate(filtered), 4),
        "rule_id": rule_id,
        "test": enrich_metric_dict(metric, test_rows, predict, monthly=monthly),
        "december_2025": december_metrics,
    }


def _december_precision(rows: Sequence[Mapping[str, str]], predict: PredictFn) -> dict[str, Any]:
    dec_rows = [row for row in rows if row["anchor_date"].startswith("2025-12")]
    if not dec_rows:
        return {"labeled_rows": 0, "precision": None, "false_positives": 0}
    metric = evaluate_rule(
        dec_rows,
        rule_id="december_diagnostic",
        description="December 2025 diagnostic",
        predict=predict,
        period="2025-12",
    )
    return {
        "labeled_rows": len(dec_rows),
        "precision": round(metric.precision, 4),
        "coverage": round(metric.coverage, 4),
        "false_positives": metric.confusion.false_positives,
        "false_negatives": metric.confusion.false_negatives,
    }


def evaluate_all_segments(
    rows: Sequence[Mapping[str, str]],
    *,
    rule_id: str,
    description: str,
    predict: PredictFn,
    test_rows: Sequence[Mapping[str, str]],
) -> dict[str, Any]:
    test_dates = {row["anchor_date"] for row in test_rows}
    return {
        segment_id: evaluate_segment(
            rows,
            segment_id=segment_id,
            rule_id=rule_id,
            description=description,
            predict=predict,
            test_anchor_dates=test_dates,
        )
        for segment_id in SEGMENT_DEFINITIONS
    }


def build_segment_aware_predictors(
    base_predict: PredictFn,
) -> dict[str, PredictFn]:
    """Segment-aware evaluation-only predictors."""

    def segment_aware_suppress_special(row: Mapping[str, str]) -> bool:
        segment = assign_row_segment(row)
        if segment in {"special_limited_run", "holiday_family_rerelease"}:
            return False
        return base_predict(row)

    def segment_aware_december_holiday_suppress(row: Mapping[str, str]) -> bool:
        anchor_month = row["anchor_date"][:7]
        segment = assign_row_segment(row)
        if anchor_month == "2025-12" and segment == "holiday_family_rerelease":
            return False
        if segment == "special_limited_run":
            return False
        return base_predict(row)

    def normal_only_base_rule(row: Mapping[str, str]) -> bool:
        if assign_row_segment(row) != "normal_first_run":
            return False
        return base_predict(row)

    def awards_require_extra_shrinkage(row: Mapping[str, str]) -> bool:
        segment = assign_row_segment(row)
        if segment == "special_limited_run":
            return False
        if segment == "holiday_family_rerelease":
            return False
        if _parse_bool(row.get("flag_awards_limited_like", "false")):
            change = row.get("showtime_count_change_vs_prior_week", "").strip()
            if change and int(change) >= 0:
                return False
        return base_predict(row)

    return {
        "segment_aware_suppress_special": segment_aware_suppress_special,
        "segment_aware_december_holiday_suppress": segment_aware_december_holiday_suppress,
        "normal_only_low_footprint": normal_only_base_rule,
        "awards_require_extra_shrinkage": awards_require_extra_shrinkage,
    }


def evaluate_segment_aware_rules(
    rows: Sequence[Mapping[str, str]],
    test_rows: Sequence[Mapping[str, str]],
    *,
    base_rule_id: str,
    base_description: str,
    base_predict: PredictFn,
) -> dict[str, Any]:
    predictors = build_segment_aware_predictors(base_predict)
    results: dict[str, Any] = {}
    for rule_id, predict in predictors.items():
        metric = evaluate_rule(
            test_rows,
            rule_id=rule_id,
            description=f"{base_description} + {rule_id}",
            predict=predict,
            period="test",
        )
        monthly = [
            item.to_dict()
            for item in monthly_metric_rows(
                rows,
                rule_id=rule_id,
                description=base_description,
                predict=predict,
            )
        ]
        results[rule_id] = enrich_metric_dict(metric, test_rows, predict, monthly=monthly)
    return {
        "base_rule_id": base_rule_id,
        "rules": results,
    }
