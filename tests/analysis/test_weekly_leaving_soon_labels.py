"""Tests for weekly-extension Leaving Soon labels (PR C2)."""

from __future__ import annotations

from pathlib import Path

from reel_seattle.analysis.leaving_soon_labels import (
    LABEL_STATUS_EVENT_EXCLUDED,
    LABEL_STATUS_INSUFFICIENT_SHOWTIMES,
    LABEL_STATUS_LABELED,
)
from reel_seattle.analysis.weekly_leaving_soon_labels import (
    LABEL_MODE_WEEKLY_EXTENSION,
    WEEKLY_LABEL_FIELDNAMES,
    WeeklyLabelBuildConfig,
    build_weekly_label_rows,
    load_footprint_rows,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"


def test_weekly_label_rows_use_following_week_outcome():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    label_rows = build_weekly_label_rows(
        rows,
        config=WeeklyLabelBuildConfig(anchor_weekdays=frozenset({1})),
    )
    extends = next(row for row in label_rows if row["showtime_film_key"] == "extends-film")
    stops = next(row for row in label_rows if row["showtime_film_key"] == "stops-film")

    assert extends["label_status"] == LABEL_STATUS_LABELED
    assert extends["gets_following_week_showtimes"] == "true"
    assert extends["leaving_soon_label"] == "false"
    assert extends["following_week_showtime_count"] != "0"

    assert stops["label_status"] == LABEL_STATUS_LABELED
    assert stops["gets_following_week_showtimes"] == "false"
    assert stops["leaving_soon_label"] == "true"


def test_weekly_labels_exclude_event_like_by_default():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    label_rows = build_weekly_label_rows(rows)
    event_row = next(
        row for row in label_rows if row["showtime_film_key"] == "fathom-one-night-opera"
    )
    assert event_row["label_status"] == LABEL_STATUS_EVENT_EXCLUDED


def test_weekly_labels_require_current_week_showtimes():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    label_rows = build_weekly_label_rows(rows)
    sparse = next(row for row in label_rows if row["showtime_film_key"] == "sparse-film")
    assert sparse["label_status"] == LABEL_STATUS_INSUFFICIENT_SHOWTIMES


def test_weekly_label_fieldnames_include_richer_features():
    assert "current_week_showtime_density" in WEEKLY_LABEL_FIELDNAMES
    assert "current_showtime_pct_of_peak" in WEEKLY_LABEL_FIELDNAMES
    assert "strict_event_like_flag" in WEEKLY_LABEL_FIELDNAMES
    assert "weekday_only_current_week" in WEEKLY_LABEL_FIELDNAMES
