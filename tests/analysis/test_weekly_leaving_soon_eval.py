"""Tests for weekly Leaving Soon baseline evaluation (PR D2)."""

from __future__ import annotations

from pathlib import Path

from reel_seattle.analysis.weekly_leaving_soon_eval import (
    ALLOWED_PREDICTOR_FIELDS,
    FORBIDDEN_PREDICTOR_FIELDS,
    TAUTOLOGY_FIELDS,
    build_weekly_heuristic_catalog,
    evaluate_rule,
    evaluate_weekly_baselines,
    load_weekly_labeled_rows,
    split_rows_by_anchor_date,
)
from reel_seattle.analysis.leaving_soon_eval import split_rows_by_anchor_date as legacy_split

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"


def test_weekly_predictor_guardrails():
    assert "gets_following_week_showtimes" in FORBIDDEN_PREDICTOR_FIELDS
    assert "following_week_showtime_count" in FORBIDDEN_PREDICTOR_FIELDS
    assert "visible_show_date_count_at_anchor" in TAUTOLOGY_FIELDS
    assert FORBIDDEN_PREDICTOR_FIELDS.isdisjoint(ALLOWED_PREDICTOR_FIELDS)


def test_load_weekly_labeled_rows_filters_status():
    rows = load_weekly_labeled_rows(FIXTURES_DIR / "weekly_leaving_soon_labels_mini.csv")
    assert len(rows) == 5
    assert all(row["label_status"] == "labeled" for row in rows)


def test_current_week_showtimes_rule_precision():
    rows = load_weekly_labeled_rows(FIXTURES_DIR / "weekly_leaving_soon_labels_mini.csv")
    catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
    metric = evaluate_rule(
        rows,
        rule_id="current_week_showtimes_le_10",
        description="test",
        predict=catalog["current_week_showtimes_le_10"].predict,
    )
    assert metric.confusion.true_positives == 2
    assert metric.confusion.false_positives == 0
    assert metric.precision == 1.0


def test_low_footprint_not_new_flags_leaving_rows():
    rows = load_weekly_labeled_rows(FIXTURES_DIR / "weekly_leaving_soon_labels_mini.csv")
    catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
    predict = catalog["low_footprint_not_new"].predict
    leaving = next(row for row in rows if row["showtime_film_key"] == "leaving-film")
    staying = next(row for row in rows if row["showtime_film_key"] == "staying-film")
    assert predict(leaving) is True
    assert predict(staying) is False


def test_evaluate_weekly_baselines_report_shape():
    rows = load_weekly_labeled_rows(FIXTURES_DIR / "weekly_leaving_soon_labels_mini.csv")
    report = evaluate_weekly_baselines(rows)
    assert report["label_mode"] == "weekly-extension"
    assert report["labeled_rows"] == 5
    assert "coverage_floor_best_rules" in report
    assert "recommendation" in report
    assert "tautology_control_test_metrics" in report


def test_time_aware_split_by_anchor_date():
    rows = load_weekly_labeled_rows(FIXTURES_DIR / "weekly_leaving_soon_labels_mini.csv")
    train, val, test = split_rows_by_anchor_date(rows, train_fraction=0.6, validation_fraction=0.2)
    assert len(train) + len(val) + len(test) == len(rows)
    assert legacy_split(rows) == (train, val, test)
