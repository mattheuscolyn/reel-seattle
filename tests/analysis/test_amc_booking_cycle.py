"""Tests for AMC booking-cycle analysis (PR C2)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reel_seattle.analysis.amc_booking_cycle import (
    current_week_range,
    detect_max_show_date_extensions,
    following_week_range,
    summarize_extension_events,
)
from reel_seattle.analysis.leaving_soon_labels import load_footprint_rows

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"


def test_week_ranges_use_monday_start():
    anchor = date(2026, 6, 24)  # Wednesday
    assert current_week_range(anchor) == (date(2026, 6, 22), date(2026, 6, 28))
    assert following_week_range(anchor) == (date(2026, 6, 29), date(2026, 7, 5))


def test_detect_extensions_on_consecutive_snapshots():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    events = detect_max_show_date_extensions(rows)
    assert len(events) == 1
    event = events[0]
    assert event.showtime_film_key == "extends-film"
    assert event.previous_snapshot_date == date(2026, 6, 23)
    assert event.observed_snapshot_date == date(2026, 6, 25)
    assert event.observed_weekday_name == "Thursday"


def test_summarize_extension_events_counts_thursday_dominant():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    summary = summarize_extension_events(detect_max_show_date_extensions(rows))
    assert summary["extension_event_count"] == 1
    assert summary["observed_on_weekday"]["dominant_weekday_name"] == "Thursday"
