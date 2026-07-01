"""Tests for Leaving Soon baseline evaluation (PR D)."""

from __future__ import annotations

from pathlib import Path

from reel_seattle.analysis.leaving_soon_eval import (
    ALLOWED_PREDICTOR_FIELDS,
    FORBIDDEN_PREDICTOR_FIELDS,
    build_heuristic_catalog,
    confusion_counts,
    evaluate_rule,
    load_labeled_rows,
    select_high_confidence_rules,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"


def test_confusion_matrix_counts():
    rows = load_labeled_rows(FIXTURES_DIR / "leaving_soon_labels_mini.csv")
    catalog = {spec.rule_id: spec for spec in build_heuristic_catalog()}
    counts = confusion_counts(rows, catalog["horizon_le_4"].predict)
    assert counts.true_positives == 1
    assert counts.false_positives == 1
    assert counts.false_negatives == 0
    assert counts.true_negatives == 2


def test_precision_recall_and_coverage():
    rows = load_labeled_rows(FIXTURES_DIR / "leaving_soon_labels_mini.csv")
    metric = evaluate_rule(
        rows,
        rule_id="horizon_le_4",
        description="test",
        predict=lambda row: int(row["days_until_anchor_max_show_date"]) <= 4,
    )
    assert metric.precision == 0.5
    assert metric.recall == 1.0
    assert metric.coverage == 0.5
    assert metric.lift_over_base > 1.0


def test_horizon_rule_identifies_leaving_soon_positive():
    rows = load_labeled_rows(FIXTURES_DIR / "leaving_soon_labels_mini.csv")
    catalog = {spec.rule_id: spec for spec in build_heuristic_catalog()}
    stops = next(row for row in rows if row["showtime_film_key"] == "stops-film")
    stable = next(row for row in rows if row["showtime_film_key"] == "stable-film")
    assert catalog["horizon_le_4"].predict(stops) is True
    assert catalog["horizon_le_4"].predict(stable) is False


def test_forbidden_predictor_fields_exclude_outcomes():
    assert "leaving_soon_label" in FORBIDDEN_PREDICTOR_FIELDS
    assert "post_update_max_show_date" in FORBIDDEN_PREDICTOR_FIELDS
    assert "days_until_anchor_max_show_date" in ALLOWED_PREDICTOR_FIELDS
    assert FORBIDDEN_PREDICTOR_FIELDS.isdisjoint(ALLOWED_PREDICTOR_FIELDS)


def test_select_high_confidence_rules_prefers_precision():
    rows = load_labeled_rows(FIXTURES_DIR / "leaving_soon_labels_mini.csv")
    metrics = [
        evaluate_rule(rows, rule_id=spec.rule_id, description=spec.description, predict=spec.predict)
        for spec in build_heuristic_catalog()
        if spec.rule_id.startswith("horizon")
    ]
    selected = select_high_confidence_rules(
        metrics,
        min_precision=0.5,
        min_coverage=0.2,
        min_lift=1.0,
    )
    assert selected
    assert selected[0].precision >= 0.5
