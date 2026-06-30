"""Tests for Leaving Soon label generation (PR C)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from reel_seattle.analysis.leaving_soon_labels import (
    LABEL_STATUS_EVENT_EXCLUDED,
    LABEL_STATUS_INSUFFICIENT_SHOWTIMES,
    LABEL_STATUS_LABELED,
    LABEL_STATUS_MISSING_POST_UPDATE,
    LABEL_FIELDNAMES,
    LabelBuildConfig,
    build_film_anchor_index,
    build_label_rows,
    find_post_update_snapshot,
    load_footprint_rows,
    relevant_wednesday,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"

ANCHOR_FEATURE_FIELDS = {
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
    "anchor_relevant_wednesday",
}

OUTCOME_ONLY_FIELDS = {
    "post_update_snapshot_date",
    "post_update_max_show_date",
    "extended_after_update",
    "leaving_soon_label",
    "post_update_gap_days",
}


@pytest.fixture
def mini_rows():
    return load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_mini.csv")


def test_relevant_wednesday_for_tuesday_anchor():
    assert relevant_wednesday(date(2026, 6, 23)) == date(2026, 6, 24)


def test_find_post_update_snapshot_prefers_thursday():
    snapshots = [date(2026, 6, 23), date(2026, 6, 24), date(2026, 6, 25)]
    picked = find_post_update_snapshot(date(2026, 6, 23), snapshots)
    assert picked == date(2026, 6, 25)


def test_film_that_extends_is_not_leaving_soon(mini_rows):
    rows = build_label_rows(mini_rows)
    row = next(row for row in rows if row["showtime_film_key"] == "extends-film")
    assert row["label_status"] == LABEL_STATUS_LABELED
    assert row["extended_after_update"] == "true"
    assert row["leaving_soon_label"] == "false"
    assert row["post_update_max_show_date"] == "2026-07-02"


def test_film_that_fails_to_extend_is_leaving_soon(mini_rows):
    rows = build_label_rows(mini_rows)
    row = next(row for row in rows if row["showtime_film_key"] == "stops-film")
    assert row["label_status"] == LABEL_STATUS_LABELED
    assert row["extended_after_update"] == "false"
    assert row["leaving_soon_label"] == "true"
    assert row["post_update_max_show_date"] == ""


def test_event_like_film_is_excluded_by_default(mini_rows):
    rows = build_label_rows(mini_rows)
    row = next(row for row in rows if row["showtime_film_key"] == "fathom-one-night-opera")
    assert row["label_status"] == LABEL_STATUS_EVENT_EXCLUDED
    assert row["leaving_soon_label"] == ""


def test_event_like_film_can_be_kept_when_exclusion_disabled(mini_rows):
    rows = build_label_rows(
        mini_rows,
        config=LabelBuildConfig(exclude_event_like=False),
    )
    row = next(row for row in rows if row["showtime_film_key"] == "fathom-one-night-opera")
    assert row["label_status"] == LABEL_STATUS_LABELED


def test_insufficient_active_showtimes_are_marked(mini_rows):
    rows = build_label_rows(mini_rows)
    row = next(row for row in rows if row["showtime_film_key"] == "sparse-film")
    assert row["label_status"] == LABEL_STATUS_INSUFFICIENT_SHOWTIMES


def test_missing_post_update_snapshot_is_marked():
    rows = load_footprint_rows(FIXTURES_DIR / "leaving_soon_footprint_missing_post.csv")
    labels = build_label_rows(rows)
    row = labels[0]
    assert row["label_status"] == LABEL_STATUS_MISSING_POST_UPDATE
    assert row["leaving_soon_label"] == ""


def test_anchor_features_do_not_require_post_update_snapshot_fields(mini_rows):
    rows = build_label_rows(mini_rows)
    labeled = [row for row in rows if row["label_status"] == LABEL_STATUS_LABELED][0]
    for field in ANCHOR_FEATURE_FIELDS:
        assert labeled[field] != ""
    for field in OUTCOME_ONLY_FIELDS:
        assert field in labeled


def test_build_film_anchor_index_aggregates_active_showtimes(mini_rows):
    index, snapshot_dates = build_film_anchor_index(mini_rows)
    assert snapshot_dates == [date(2026, 6, 23), date(2026, 6, 25)]
    anchor = index[date(2026, 6, 23)]["extends-film"]
    assert anchor.active_showtime_count == 3
    assert anchor.max_show_date == date(2026, 6, 28)


def test_label_fieldnames_are_stable():
    assert "anchor_date" in LABEL_FIELDNAMES
    assert "leaving_soon_label" in LABEL_FIELDNAMES
