"""Monthly stability and weak-month diagnostics for weekly Leaving Soon evaluation."""

from __future__ import annotations

from collections import Counter
from typing import Any, Callable, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_eval import (
    MIN_SHIP_PRECISION,
    MetricResult,
    PredictFn,
    base_positive_rate,
    evaluate_rule,
    monthly_metric_rows,
)

WEAK_MONTHS_DEFAULT = ("2025-07", "2025-12", "2026-01")


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def _actual_leaving_soon(row: Mapping[str, str]) -> bool:
    return _parse_bool(row["leaving_soon_label"])


def filter_strict_non_event_rows(rows: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    return [dict(row) for row in rows if not _parse_bool(row.get("strict_event_like_flag", "false"))]


def distinct_films_tagged(rows: Sequence[Mapping[str, str]], predict: PredictFn) -> int:
    return len(
        {
            row["showtime_film_key"]
            for row in rows
            if predict(row)
        }
    )


def monthly_precision_summary(
    monthly_metrics: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    precisions: list[float] = []
    months_below_gate = 0
    for item in monthly_metrics:
        predicted = item["true_positives"] + item["false_positives"]
        if predicted <= 0:
            continue
        precision = float(item["precision"])
        precisions.append(precision)
        if precision < MIN_SHIP_PRECISION:
            months_below_gate += 1
    if not precisions:
        return {
            "month_count_with_predictions": 0,
            "min_precision": 0.0,
            "max_precision": 0.0,
            "precision_range": 0.0,
            "months_below_75pct": 0,
            "stability_pass": False,
        }
    return {
        "month_count_with_predictions": len(precisions),
        "min_precision": round(min(precisions), 4),
        "max_precision": round(max(precisions), 4),
        "precision_range": round(max(precisions) - min(precisions), 4),
        "months_below_75pct": months_below_gate,
        "stability_pass": months_below_gate == 0 and min(precisions) >= MIN_SHIP_PRECISION,
    }


def analyze_weak_months(
    rows: Sequence[Mapping[str, str]],
    predict: PredictFn,
    *,
    months: Sequence[str] = WEAK_MONTHS_DEFAULT,
    false_positive_limit: int = 8,
) -> list[dict[str, Any]]:
    """Diagnose weak monthly precision for selected anchor months."""
    results: list[dict[str, Any]] = []
    for month in months:
        month_rows = [row for row in rows if row["anchor_date"].startswith(month)]
        if not month_rows:
            results.append({"month": month, "labeled_rows": 0})
            continue
        metric = evaluate_rule(
            month_rows,
            rule_id="diagnostic",
            description="weak month diagnostic",
            predict=predict,
            period=month,
        )
        false_positives = [
            {
                "anchor_date": row["anchor_date"],
                "film_title": row["film_title"],
                "current_week_showtime_count": row.get("current_week_showtime_count", ""),
                "current_week_theater_count": row.get("current_week_theater_count", ""),
                "strict_event_like_flag": row.get("strict_event_like_flag", "false"),
                "flag_anniversary_like": row.get("flag_anniversary_like", "false"),
            }
            for row in month_rows
            if predict(row) and not _actual_leaving_soon(row)
        ][:false_positive_limit]
        fp_titles = Counter(example["film_title"] for example in false_positives)
        results.append(
            {
                "month": month,
                "labeled_rows": len(month_rows),
                "base_positive_rate": round(base_positive_rate(month_rows), 4),
                "precision": round(metric.precision, 4),
                "coverage": round(metric.coverage, 4),
                "false_positives": metric.confusion.false_positives,
                "false_negatives": metric.confusion.false_negatives,
                "distinct_films_tagged": distinct_films_tagged(month_rows, predict),
                "top_false_positive_titles": [
                    {"film_title": title, "count": count}
                    for title, count in fp_titles.most_common(5)
                ],
                "example_false_positives": false_positives,
                "notes": _weak_month_notes(month, false_positives),
            }
        )
    return results


def _weak_month_notes(month: str, false_positives: Sequence[Mapping[str, str]]) -> str:
    if month in {"2025-12", "2026-01"}:
        holiday = "Holiday/limited-run titles may inflate weekday-only false positives."
    elif month == "2025-07":
        holiday = "Early dataset month with thinner snapshot history."
    else:
        holiday = ""
    event_like_fps = sum(
        1 for row in false_positives if _parse_bool(row.get("strict_event_like_flag", "false"))
    )
    if event_like_fps:
        return f"{holiday} {event_like_fps} false positives are strict-event-like.".strip()
    return holiday or "Review weekday-only rule behavior for limited-run titles."


def enrich_metric_dict(
    metric: MetricResult,
    rows: Sequence[Mapping[str, str]],
    predict: PredictFn,
    monthly: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = metric.to_dict()
    payload["distinct_films_tagged"] = distinct_films_tagged(rows, predict)
    if monthly is None:
        monthly = [item.to_dict() for item in monthly_metric_rows(rows, rule_id=metric.rule_id, description=metric.description, predict=predict)]
    payload["monthly_stability"] = monthly_precision_summary(monthly)
    return payload
