"""Tests for parent-grain weekly Leaving Soon labels (PR Identity-C)."""

from __future__ import annotations

from pathlib import Path

from reel_seattle.analysis.film_identity import IDENTITY_MODE_PARENT, IDENTITY_MODE_TITLE
from reel_seattle.analysis.weekly_leaving_soon_labels import (
    WEEKLY_LABEL_FIELDNAMES,
    WeeklyLabelBuildConfig,
    build_weekly_label_rows,
    load_footprint_rows,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"


def test_weekly_label_fieldnames_include_parent_identity():
    assert "parent_film_key" in WEEKLY_LABEL_FIELDNAMES
    assert "identity_mode" in WEEKLY_LABEL_FIELDNAMES
    assert "variant_key_count" in WEEKLY_LABEL_FIELDNAMES


def test_title_mode_populates_parent_fields_per_key():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")
    label_rows = build_weekly_label_rows(
        rows,
        config=WeeklyLabelBuildConfig(identity_mode=IDENTITY_MODE_TITLE),
    )
    extends = next(row for row in label_rows if row["showtime_film_key"] == "extends-film")
    assert extends["identity_mode"] == IDENTITY_MODE_TITLE
    assert extends["parent_film_key"]
    assert extends["parent_display_title"]


def test_parent_mode_aggregates_variant_footprint():
    rows = [
        {
            "snapshot_date": "2026-06-23",
            "showtime_film_key": "hero-film",
            "film_title": "Hero Film",
            "show_date": "2026-06-23",
            "active_showtime_count": "10",
            "theater_list": "amc-a",
            "has_matinee": "false",
            "has_primetime": "true",
            "has_late": "false",
            "has_weekend_show": "false",
            "event_like_flag": "false",
            "event_like_reason": "",
            "min_show_date_visible_for_film_at_snapshot": "2026-06-23",
            "max_show_date_visible_for_film_at_snapshot": "2026-06-30",
            "visible_show_date_count_for_film_at_snapshot": "3",
            "total_visible_showtimes_for_film_at_snapshot": "10",
            "total_visible_theaters_for_film_at_snapshot": "1",
        },
        {
            "snapshot_date": "2026-06-23",
            "showtime_film_key": "hero-film-sensory-friendly-screening",
            "film_title": "Hero Film: Sensory Friendly Screening",
            "show_date": "2026-06-23",
            "active_showtime_count": "2",
            "theater_list": "amc-b",
            "has_matinee": "false",
            "has_primetime": "false",
            "has_late": "false",
            "has_weekend_show": "false",
            "event_like_flag": "false",
            "event_like_reason": "",
            "min_show_date_visible_for_film_at_snapshot": "2026-06-23",
            "max_show_date_visible_for_film_at_snapshot": "2026-06-23",
            "visible_show_date_count_for_film_at_snapshot": "1",
            "total_visible_showtimes_for_film_at_snapshot": "2",
            "total_visible_theaters_for_film_at_snapshot": "1",
        },
        {
            "snapshot_date": "2026-06-26",
            "showtime_film_key": "hero-film",
            "film_title": "Hero Film",
            "show_date": "2026-07-01",
            "active_showtime_count": "8",
            "theater_list": "amc-a",
            "has_matinee": "false",
            "has_primetime": "true",
            "has_late": "false",
            "has_weekend_show": "false",
            "event_like_flag": "false",
            "event_like_reason": "",
            "min_show_date_visible_for_film_at_snapshot": "2026-06-30",
            "max_show_date_visible_for_film_at_snapshot": "2026-07-06",
            "visible_show_date_count_for_film_at_snapshot": "4",
            "total_visible_showtimes_for_film_at_snapshot": "8",
            "total_visible_theaters_for_film_at_snapshot": "1",
        },
        {
            "snapshot_date": "2026-06-26",
            "showtime_film_key": "hero-film-sensory-friendly-screening",
            "film_title": "Hero Film: Sensory Friendly Screening",
            "show_date": "2026-07-01",
            "active_showtime_count": "0",
            "theater_list": "",
            "has_matinee": "false",
            "has_primetime": "false",
            "has_late": "false",
            "has_weekend_show": "false",
            "event_like_flag": "false",
            "event_like_reason": "",
            "min_show_date_visible_for_film_at_snapshot": "",
            "max_show_date_visible_for_film_at_snapshot": "",
            "visible_show_date_count_for_film_at_snapshot": "0",
            "total_visible_showtimes_for_film_at_snapshot": "0",
            "total_visible_theaters_for_film_at_snapshot": "0",
        },
    ]
    label_rows = build_weekly_label_rows(
        rows,
        config=WeeklyLabelBuildConfig(
            anchor_weekdays=frozenset({1}),
            identity_mode=IDENTITY_MODE_PARENT,
        ),
    )
    parent_rows = [row for row in label_rows if row["identity_mode"] == IDENTITY_MODE_PARENT]
    assert len(parent_rows) == 1
    parent = parent_rows[0]
    assert parent["showtime_film_key"] == parent["parent_film_key"]
    assert int(parent["current_week_showtime_count"]) == 12
    assert parent["variant_key_count"] == "2"
    assert parent["has_special_variants"] == "true"
    assert "following_week_showtime_count" in parent
