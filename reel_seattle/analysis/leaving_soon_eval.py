"""Baseline heuristic evaluation for Leaving Soon labels (PR D).

Uses anchor-time footprint fields only. Post-update outcome columns are never
used as predictors.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_labels import LABEL_STATUS_LABELED

# Outcome / leakage fields — must not be used as predictors.
FORBIDDEN_PREDICTOR_FIELDS = frozenset(
    {
        "post_update_snapshot_date",
        "post_update_max_show_date",
        "extended_after_update",
        "leaving_soon_label",
        "label_status",
        "post_update_gap_days",
    }
)

ALLOWED_PREDICTOR_FIELDS = frozenset(
    {
        "anchor_date",
        "showtime_film_key",
        "film_title",
        "anchor_max_show_date",
        "days_until_anchor_max_show_date",
        "anchor_weekday",
        "days_to_weekend",
        "booking_horizon_days",
        "total_visible_showtimes_for_film_at_snapshot",
        "total_visible_theaters_for_film_at_snapshot",
        "visible_show_date_count_for_film_at_snapshot",
        "min_show_date_visible_for_film_at_snapshot",
        "max_show_date_visible_for_film_at_snapshot",
        "has_weekend_show",
        "has_primetime",
        "event_like_flag",
        "event_like_reason",
        "anchor_relevant_wednesday",
    }
)

MIN_SHIP_PRECISION = 0.75
MIN_SHIP_COVERAGE = 0.05
MIN_LIFT_OVER_BASE = 1.05


@dataclass(frozen=True)
class ConfusionCounts:
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int

    @property
    def total(self) -> int:
        return self.true_positives + self.false_positives + self.true_negatives + self.false_negatives

    @property
    def predicted_positive(self) -> int:
        return self.true_positives + self.false_positives

    @property
    def actual_positive(self) -> int:
        return self.true_positives + self.false_negatives


@dataclass(frozen=True)
class MetricResult:
    rule_id: str
    description: str
    confusion: ConfusionCounts
    base_positive_rate: float
    period: str = "all"

    @property
    def precision(self) -> float:
        denom = self.confusion.predicted_positive
        return self.confusion.true_positives / denom if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.confusion.actual_positive
        return self.confusion.true_positives / denom if denom else 0.0

    @property
    def coverage(self) -> float:
        total = self.confusion.total
        return self.confusion.predicted_positive / total if total else 0.0

    @property
    def specificity(self) -> float:
        denom = self.confusion.true_negatives + self.confusion.false_positives
        return self.confusion.true_negatives / denom if denom else 0.0

    @property
    def false_positive_rate(self) -> float:
        denom = self.confusion.true_negatives + self.confusion.false_positives
        return self.confusion.false_positives / denom if denom else 0.0

    @property
    def lift_over_base(self) -> float:
        if self.base_positive_rate <= 0:
            return 0.0
        return self.precision / self.base_positive_rate

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "description": self.description,
            "period": self.period,
            "true_positives": self.confusion.true_positives,
            "false_positives": self.confusion.false_positives,
            "true_negatives": self.confusion.true_negatives,
            "false_negatives": self.confusion.false_negatives,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "coverage": round(self.coverage, 4),
            "specificity": round(self.specificity, 4),
            "false_positive_rate": round(self.false_positive_rate, 4),
            "lift_over_base": round(self.lift_over_base, 4),
            "base_positive_rate": round(self.base_positive_rate, 4),
        }


PredictFn = Callable[[Mapping[str, str]], bool]


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def _parse_int(text: str, default: int = 0) -> int:
    text = str(text).strip()
    return int(text) if text else default


def load_labeled_rows(path: Path | str) -> list[dict[str, str]]:
    """Load only rows with ``label_status == labeled``."""
    with Path(path).open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [row for row in rows if row.get("label_status") == LABEL_STATUS_LABELED]


def actual_leaving_soon(row: Mapping[str, str]) -> bool:
    return _parse_bool(row["leaving_soon_label"])


def base_positive_rate(rows: Sequence[Mapping[str, str]]) -> float:
    if not rows:
        return 0.0
    positives = sum(1 for row in rows if actual_leaving_soon(row))
    return positives / len(rows)


def confusion_counts(
    rows: Sequence[Mapping[str, str]],
    predict: PredictFn,
) -> ConfusionCounts:
    tp = fp = tn = fn = 0
    for row in rows:
        predicted = predict(row)
        actual = actual_leaving_soon(row)
        if predicted and actual:
            tp += 1
        elif predicted and not actual:
            fp += 1
        elif not predicted and actual:
            fn += 1
        else:
            tn += 1
    return ConfusionCounts(tp, fp, tn, fn)


def evaluate_rule(
    rows: Sequence[Mapping[str, str]],
    *,
    rule_id: str,
    description: str,
    predict: PredictFn,
    period: str = "all",
) -> MetricResult:
    base = base_positive_rate(rows)
    counts = confusion_counts(rows, predict)
    return MetricResult(rule_id, description, counts, base, period=period)


def split_rows_by_anchor_date(
    rows: Sequence[Mapping[str, str]],
    *,
    train_fraction: float = 0.6,
    validation_fraction: float = 0.2,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    """Split labeled rows by sorted unique anchor dates (time-aware)."""
    dates = sorted({row["anchor_date"] for row in rows})
    n = len(dates)
    train_end = max(1, int(n * train_fraction))
    val_end = max(train_end + 1, int(n * (train_fraction + validation_fraction)))
    if val_end >= n:
        val_end = n - 1 if n > 1 else n
    train_dates = set(dates[:train_end])
    val_dates = set(dates[train_end:val_end])
    test_dates = set(dates[val_end:])
    train = [row for row in rows if row["anchor_date"] in train_dates]
    val = [row for row in rows if row["anchor_date"] in val_dates]
    test = [row for row in rows if row["anchor_date"] in test_dates]
    return train, val, test


def monthly_metric_rows(
    rows: Sequence[Mapping[str, str]],
    *,
    rule_id: str,
    description: str,
    predict: PredictFn,
) -> list[MetricResult]:
    by_month: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        month = row["anchor_date"][:7]
        by_month.setdefault(month, []).append(row)
    results: list[MetricResult] = []
    for month in sorted(by_month):
        month_rows = by_month[month]
        results.append(
            evaluate_rule(
                month_rows,
                rule_id=rule_id,
                description=description,
                predict=predict,
                period=month,
            )
        )
    return results


def _horizon_le(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row["days_until_anchor_max_show_date"]) <= threshold


def _visible_dates_le(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row["visible_show_date_count_for_film_at_snapshot"]) <= threshold


def _showtimes_le(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row["total_visible_showtimes_for_film_at_snapshot"]) <= threshold


def _theaters_le(row: Mapping[str, str], threshold: int) -> bool:
    return _parse_int(row["total_visible_theaters_for_film_at_snapshot"]) <= threshold


def _no_weekend(row: Mapping[str, str]) -> bool:
    return not _parse_bool(row.get("has_weekend_show", "false"))


def _no_primetime(row: Mapping[str, str]) -> bool:
    return not _parse_bool(row.get("has_primetime", "false"))


def _combined_horizon_theaters(row: Mapping[str, str], horizon: int, theaters: int) -> bool:
    return _horizon_le(row, horizon) and _theaters_le(row, theaters)


def _combined_horizon_showtimes(row: Mapping[str, str], horizon: int, showtimes: int) -> bool:
    return _horizon_le(row, horizon) and _showtimes_le(row, showtimes)


def _combined_horizon_no_weekend(row: Mapping[str, str], horizon: int) -> bool:
    return _horizon_le(row, horizon) and _no_weekend(row)


def _score_rule(row: Mapping[str, str], threshold: int) -> bool:
    score = 0
    days_until = _parse_int(row["days_until_anchor_max_show_date"])
    if days_until <= 2:
        score += 3
    elif days_until <= 4:
        score += 2
    elif days_until <= 7:
        score += 1
    if _parse_int(row["total_visible_theaters_for_film_at_snapshot"]) <= 2:
        score += 2
    elif _parse_int(row["total_visible_theaters_for_film_at_snapshot"]) <= 4:
        score += 1
    if _parse_int(row["total_visible_showtimes_for_film_at_snapshot"]) <= 15:
        score += 2
    elif _parse_int(row["total_visible_showtimes_for_film_at_snapshot"]) <= 30:
        score += 1
    if _no_weekend(row):
        score += 1
    if _no_primetime(row):
        score += 1
    return score >= threshold


@dataclass(frozen=True)
class HeuristicSpec:
    rule_id: str
    description: str
    predict: PredictFn


def build_heuristic_catalog() -> list[HeuristicSpec]:
    """Return all baseline heuristics to evaluate."""
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
        HeuristicSpec("no_weekend", "No weekend showtimes visible at anchor.", _no_weekend),
        HeuristicSpec("no_primetime", "No primetime showtimes visible at anchor.", _no_primetime),
    ]
    for threshold in (2, 3, 4, 5, 7, 10):
        specs.append(
            HeuristicSpec(
                f"horizon_le_{threshold}",
                f"Days until anchor max show date <= {threshold}.",
                lambda row, t=threshold: _horizon_le(row, t),
            )
        )
    for threshold in (1, 2, 3, 4):
        specs.append(
            HeuristicSpec(
                f"visible_dates_le_{threshold}",
                f"Visible show date count <= {threshold}.",
                lambda row, t=threshold: _visible_dates_le(row, t),
            )
        )
    for threshold in (10, 15, 20, 30, 50):
        specs.append(
            HeuristicSpec(
                f"showtimes_le_{threshold}",
                f"Total visible showtimes <= {threshold}.",
                lambda row, t=threshold: _showtimes_le(row, t),
            )
        )
    for threshold in (1, 2, 3, 4, 5):
        specs.append(
            HeuristicSpec(
                f"theaters_le_{threshold}",
                f"Total visible theaters <= {threshold}.",
                lambda row, t=threshold: _theaters_le(row, t),
            )
        )
    for horizon, theaters in ((3, 2), (4, 2), (5, 3), (7, 4)):
        specs.append(
            HeuristicSpec(
                f"horizon{horizon}_theaters{theaters}",
                f"Horizon <= {horizon} days AND theaters <= {theaters}.",
                lambda row, h=horizon, th=theaters: _combined_horizon_theaters(row, h, th),
            )
        )
    for horizon, showtimes in ((3, 15), (4, 20), (5, 30), (7, 50)):
        specs.append(
            HeuristicSpec(
                f"horizon{horizon}_showtimes{showtimes}",
                f"Horizon <= {horizon} days AND showtimes <= {showtimes}.",
                lambda row, h=horizon, s=showtimes: _combined_horizon_showtimes(row, h, s),
            )
        )
    for horizon in (3, 4, 5, 7):
        specs.append(
            HeuristicSpec(
                f"horizon{horizon}_no_weekend",
                f"Horizon <= {horizon} days AND no weekend coverage.",
                lambda row, h=horizon: _combined_horizon_no_weekend(row, h),
            )
        )
    for threshold in (4, 5, 6, 7, 8):
        specs.append(
            HeuristicSpec(
                f"score_ge_{threshold}",
                f"Weak-footprint score >= {threshold}.",
                lambda row, t=threshold: _score_rule(row, t),
            )
        )
    return specs


def select_high_confidence_rules(
    validation_metrics: Sequence[MetricResult],
    *,
    min_precision: float = MIN_SHIP_PRECISION,
    min_coverage: float = MIN_SHIP_COVERAGE,
    min_lift: float = MIN_LIFT_OVER_BASE,
) -> list[MetricResult]:
    """Pick rules that meet product gates on the validation split."""
    eligible = [
        metric
        for metric in validation_metrics
        if metric.rule_id not in {"always_positive", "always_negative"}
        and metric.precision >= min_precision
        and metric.coverage >= min_coverage
        and metric.lift_over_base >= min_lift
        and metric.confusion.predicted_positive > 0
    ]
    eligible.sort(
        key=lambda item: (item.precision, item.lift_over_base, item.coverage),
        reverse=True,
    )
    return eligible


def prediction_examples(
    rows: Sequence[Mapping[str, str]],
    predict: PredictFn,
    *,
    limit: int = 5,
) -> dict[str, list[dict[str, str]]]:
    """Collect example TP/FP/TN/FN rows for error analysis."""
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
                    "days_until_anchor_max_show_date": row["days_until_anchor_max_show_date"],
                    "total_visible_theaters_for_film_at_snapshot": row[
                        "total_visible_theaters_for_film_at_snapshot"
                    ],
                    "total_visible_showtimes_for_film_at_snapshot": row[
                        "total_visible_showtimes_for_film_at_snapshot"
                    ],
                    "has_weekend_show": row["has_weekend_show"],
                    "leaving_soon_label": row["leaving_soon_label"],
                }
            )
    return buckets


def evaluate_all_periods(
    rows: Sequence[Mapping[str, str]],
    specs: Sequence[HeuristicSpec],
) -> dict[str, Any]:
    """Run full evaluation: overall, splits, monthly for catalog rules."""
    train, val, test = split_rows_by_anchor_date(rows)
    overall_base = base_positive_rate(rows)
    catalog = build_heuristic_catalog() if not specs else list(specs)

    overall: list[dict[str, Any]] = []
    validation: list[dict[str, Any]] = []
    held_out_test: list[dict[str, Any]] = []
    monthly_by_rule: dict[str, list[dict[str, Any]]] = {}

    spec_by_id = {spec.rule_id: spec for spec in catalog}
    for spec in catalog:
        overall_metric = evaluate_rule(
            rows, rule_id=spec.rule_id, description=spec.description, predict=spec.predict
        )
        val_metric = evaluate_rule(
            val, rule_id=spec.rule_id, description=spec.description, predict=spec.predict, period="validation"
        )
        test_metric = evaluate_rule(
            test, rule_id=spec.rule_id, description=spec.description, predict=spec.predict, period="test"
        )
        overall.append(overall_metric.to_dict())
        validation.append(val_metric.to_dict())
        held_out_test.append(test_metric.to_dict())
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
        best_examples = prediction_examples(test, best_spec.predict)

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

    recommendation = build_recommendation(
        overall_base=overall_base,
        high_confidence_validation=high_conf_val,
        best_test=best_test,
        monthly_by_rule=monthly_by_rule,
        best_rule_id=best_rule_id,
    )

    return {
        "labeled_rows": len(rows),
        "distinct_films": len({row["showtime_film_key"] for row in rows}),
        "base_positive_rate": round(overall_base, 4),
        "anchor_date_range": {
            "earliest": min(row["anchor_date"] for row in rows) if rows else "",
            "latest": max(row["anchor_date"] for row in rows) if rows else "",
        },
        "time_splits": split_ranges,
        "overall_metrics": overall,
        "validation_metrics": validation,
        "test_metrics": held_out_test,
        "high_confidence_validation_rules": [metric.to_dict() for metric in high_conf_val[:10]],
        "best_high_confidence_rule": {
            "rule_id": best_rule_id,
            "validation": high_conf_val[0].to_dict() if high_conf_val else None,
            "test": best_test,
            "monthly": monthly_by_rule.get(best_rule_id, []) if best_rule_id else [],
            "examples": best_examples,
        },
        "recommendation": recommendation,
    }


def build_recommendation(
    *,
    overall_base: float,
    high_confidence_validation: Sequence[MetricResult],
    best_test: Mapping[str, Any] | None,
    monthly_by_rule: Mapping[str, Sequence[Mapping[str, Any]]],
    best_rule_id: str,
) -> dict[str, Any]:
    """Summarize whether the signal is strong enough to proceed."""
    if not high_confidence_validation or not best_test:
        return {
            "decision": "defer",
            "summary": (
                "No heuristic met the high-confidence gates on validation "
                f"(precision>={MIN_SHIP_PRECISION}, coverage>={MIN_SHIP_COVERAGE}, "
                f"lift>={MIN_LIFT_OVER_BASE})."
            ),
            "next_steps": [
                "Refine labels or add Wednesday PM scrape before UI work.",
                "Try additional footprint trajectory features in a future PR.",
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

    if passes_test_precision and beats_always_positive and stable:
        decision = "proceed_with_caution"
        summary = (
            f"Best rule `{best_rule_id}` meets precision on held-out test "
            f"({test_precision:.1%}) with modest lift over base rate ({test_lift:.2f}x)."
        )
        next_steps = [
            "Consider PR E for a generated current artifact using the best heuristic.",
            "Keep UI copy conservative; show tag only for high-confidence bucket.",
        ]
    elif passes_test_precision and beats_always_positive:
        decision = "needs_more_work"
        summary = (
            f"`{best_rule_id}` passes test precision ({test_precision:.1%}) but monthly "
            "stability is weak or coverage is thin."
        )
        next_steps = [
            "Collect more snapshots and re-evaluate monthly stability.",
            "Do not ship UI until stability improves.",
        ]
    else:
        decision = "defer"
        summary = (
            f"Best validation rule `{best_rule_id}` does not generalize: test precision "
            f"{test_precision:.1%}, lift {test_lift:.2f}x."
        )
        next_steps = [
            "Refine labels/features or defer the Leaving Soon UI.",
            "A 75% precision bar is not meaningful when base rate is ~78%; require lift.",
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
        },
        "next_steps": next_steps,
    }


def write_predictions_csv(
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
        "days_until_anchor_max_show_date",
        "total_visible_theaters_for_film_at_snapshot",
        "total_visible_showtimes_for_film_at_snapshot",
        "has_weekend_show",
        "has_primetime",
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
                    "days_until_anchor_max_show_date": row["days_until_anchor_max_show_date"],
                    "total_visible_theaters_for_film_at_snapshot": row[
                        "total_visible_theaters_for_film_at_snapshot"
                    ],
                    "total_visible_showtimes_for_film_at_snapshot": row[
                        "total_visible_showtimes_for_film_at_snapshot"
                    ],
                    "has_weekend_show": row["has_weekend_show"],
                    "has_primetime": row["has_primetime"],
                }
            )


def render_markdown_report(report: Mapping[str, Any]) -> str:
    """Render a human-readable markdown summary."""
    lines = [
        "# Leaving Soon baseline evaluation (PR D)",
        "",
        f"- Labeled rows: **{report['labeled_rows']}**",
        f"- Distinct films: **{report['distinct_films']}**",
        f"- Base positive rate: **{report['base_positive_rate']:.1%}**",
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
    lines.extend(["", "## Best high-confidence rule (validation → test)", ""])
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
                f"FP **{t['false_positives']}**"
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
                        f"(horizon={example['days_until_anchor_max_show_date']}d, "
                        f"theaters={example['total_visible_theaters_for_film_at_snapshot']})"
                    )
                lines.append("")
    else:
        lines.append("No rule met high-confidence gates on validation.")
    lines.extend(["", "## Top rules on held-out test (by precision)", ""])
    test_metrics = sorted(
        report["test_metrics"],
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


def run_baseline_evaluation(
    input_path: Path,
    *,
    json_output: Path,
    markdown_output: Path,
    predictions_output: Path | None = None,
) -> dict[str, Any]:
    """Load labels, evaluate heuristics, write reports."""
    rows = load_labeled_rows(input_path)
    report = evaluate_all_periods(rows, build_heuristic_catalog())
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown_output.write_text(render_markdown_report(report) + "\n", encoding="utf-8")
    best_rule_id = report["best_high_confidence_rule"]["rule_id"]
    if predictions_output is not None and best_rule_id:
        spec = {item.rule_id: item for item in build_heuristic_catalog()}[best_rule_id]
        write_predictions_csv(predictions_output, rows, rule_id=best_rule_id, predict=spec.predict)
        report["predictions_output_path"] = str(predictions_output)
    report["json_output_path"] = str(json_output)
    report["markdown_output_path"] = str(markdown_output)
    return report
