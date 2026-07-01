"""Tests for weekly booking-shape feature derivation (PR D5)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reel_seattle.analysis.leaving_soon_labels import build_film_anchor_index
from reel_seattle.analysis.weekly_booking_shape import compute_booking_shape_features
from reel_seattle.analysis.weekly_leaving_soon_labels import (
    WeeklyLabelBuildConfig,
    _WeekStats,
    build_snapshot_film_rows_index,
    load_footprint_rows,
    week_stats_for_film_rows,
)
from reel_seattle.analysis.amc_booking_cycle import current_week_range

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"


def test_booking_shape_features_do_not_use_outcome_fields():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    by_snapshot, snapshot_dates = build_film_anchor_index(rows)
    row_index = build_snapshot_film_rows_index(rows)
    anchor_date = date.fromisoformat("2026-06-23")
    film_key = "stops-film"
    current_start, current_end = current_week_range(anchor_date)
    current_stats = week_stats_for_film_rows(
        row_index[anchor_date][film_key],
        week_start_date=current_start,
        week_end_date=current_end,
    )
    features = compute_booking_shape_features(
        anchor_date=anchor_date,
        film_key=film_key,
        snapshot_dates=snapshot_dates,
        row_index=row_index,
        by_snapshot=by_snapshot,
        current_stats=current_stats,
        prior_stats=None,
        peak_anchor=anchor_date,
        first_seen=anchor_date,
    )
    assert "max_show_date_stuck_weeks" in features
    assert "lost_weekend_vs_prior_week" in features
    assert "following_week_showtime_count" not in features


def test_weekly_labels_include_booking_shape_columns():
    from reel_seattle.analysis.weekly_leaving_soon_labels import (
        WEEKLY_LABEL_FIELDNAMES,
        build_weekly_label_rows,
    )

    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    label_rows = build_weekly_label_rows(rows)
    labeled = [row for row in label_rows if row["label_status"] == "labeled"]
    assert labeled
    assert "consecutive_low_footprint_weeks" in WEEKLY_LABEL_FIELDNAMES
    assert labeled[0]["max_show_date_stuck_weeks"] != ""
