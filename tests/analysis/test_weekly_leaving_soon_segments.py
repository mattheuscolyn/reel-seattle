"""Tests for weekly Leaving Soon segmentation and error audit (PR D4)."""

from __future__ import annotations

from pathlib import Path

from reel_seattle.analysis.special_screening_flags import assign_row_segment
from reel_seattle.analysis.weekly_leaving_soon_error_audit import (
    build_error_audit_rows,
    summarize_false_positive_audit,
)
from reel_seattle.analysis.weekly_leaving_soon_eval import (
    build_weekly_heuristic_catalog,
    load_weekly_labeled_rows,
)
from reel_seattle.analysis.weekly_leaving_soon_segments import (
    build_segment_aware_predictors,
    evaluate_segment,
    filter_normal_first_run_only,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"


def test_assign_row_segment_from_flags():
    row = {
        "film_title": "Elf",
        "anchor_date": "2025-12-09",
        "flag_family_holiday_like": "true",
        "flag_probable_normal_first_run": "false",
        "run_segment": "holiday_family_rerelease",
    }
    assert assign_row_segment(row) == "holiday_family_rerelease"


def test_segment_aware_suppresses_holiday_family():
    catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
    base = catalog["low_footprint_not_first_week"].predict
    predictors = build_segment_aware_predictors(base)
    holiday_row = {
        "anchor_date": "2025-12-09",
        "film_title": "Elf",
        "run_segment": "holiday_family_rerelease",
        "low_showtime_count_bucket": "true",
        "is_first_week_observed": "false",
    }
    assert base(holiday_row) is True
    assert predictors["segment_aware_december_holiday_suppress"](holiday_row) is False


def test_error_audit_false_positive_shape():
    rows = load_weekly_labeled_rows(FIXTURES_DIR / "weekly_leaving_soon_labels_mini.csv")
    catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
    spec = catalog["low_footprint_not_first_week"]
    audit_rows = build_error_audit_rows(rows, rule_id=spec.rule_id, predict=spec.predict)
    summary = summarize_false_positive_audit(audit_rows)
    assert "false_positive_count" in summary
    for row in audit_rows:
        assert row["error_type"] in {"false_positive", "false_negative"}
        assert "run_type" in row
        assert "peak_week_showtime_count_to_date" in row


def test_normal_first_run_segment_filter():
    rows = [
        {
            "anchor_date": "2025-12-09",
            "film_title": "Sinners",
            "run_segment": "normal_first_run",
            "leaving_soon_label": "true",
        },
        {
            "anchor_date": "2025-12-09",
            "film_title": "Elf",
            "run_segment": "holiday_family_rerelease",
            "leaving_soon_label": "false",
        },
    ]
    filtered = filter_normal_first_run_only(rows)
    assert len(filtered) == 1
    assert filtered[0]["film_title"] == "Sinners"


def test_evaluate_segment_returns_december_block():
    rows = load_weekly_labeled_rows(FIXTURES_DIR / "weekly_leaving_soon_labels_mini.csv")
    catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
    spec = catalog["low_footprint_not_first_week"]
    result = evaluate_segment(
        rows,
        segment_id="all_rows",
        rule_id=spec.rule_id,
        description=spec.description,
        predict=spec.predict,
    )
    assert result["segment_id"] == "all_rows"
    assert "december_2025" in result
