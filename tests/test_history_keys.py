"""Tests for additive history key columns and migration."""

from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

import pytest

from daily_processor import (
    HISTORY_FIELDNAMES,
    HISTORY_PATH,
    add_new_showtime,
    normalize_history_row,
    read_csv,
    save_csv,
)
from reel_seattle.history_keys import (
    derive_showtime_film_key,
    derive_theater_id,
    enrich_history_row_keys,
    enrich_history_rows,
    load_theater_index,
)


def _sample_row(
    *,
    theater: str = "AMC Pacific Place 11",
    film: str = "Sinners",
    source: str = "amc",
) -> dict[str, str]:
    return {
        "Date": "06/26/2026",
        "Time": "7:30PM",
        "Theater": theater,
        "Film": film,
        "Runtime": "137",
        "isAlmostSoldOut": "",
        "posterDynamic": "",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-26",
        "last_updated": "2026-06-26",
        "source": source,
    }


@pytest.fixture
def theater_index(theaters_registry):
    from reel_seattle.normalize import build_theater_index

    return build_theater_index(theaters_registry)


def test_migration_adds_columns_when_missing(tmp_path, theaters_registry, theater_index):
    history_path = tmp_path / "showtimes_history.csv"
    rows = [normalize_history_row(_sample_row())]
    save_csv(str(history_path), rows, fieldnames=HISTORY_FIELDNAMES[:14])

    loaded = [normalize_history_row(row) for row in read_csv(str(history_path))]
    enrich_history_rows(loaded, theater_index, overwrite=True)
    save_csv(str(history_path), loaded, fieldnames=HISTORY_FIELDNAMES)

    with history_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        assert "theater_id" in reader.fieldnames
        assert "showtime_film_key" in reader.fieldnames


def test_migration_preserves_row_count(tmp_path, theater_index):
    history_path = tmp_path / "showtimes_history.csv"
    rows = [
        normalize_history_row(_sample_row()),
        normalize_history_row(_sample_row(theater="The Beacon", film="Anatomy Of A Murder", source="indie")),
    ]
    save_csv(str(history_path), rows, fieldnames=HISTORY_FIELDNAMES)

    loaded = [normalize_history_row(row) for row in read_csv(str(history_path))]
    assert len(loaded) == 2
    stats = enrich_history_rows(loaded, theater_index, overwrite=True)
    assert stats.total_rows == 2


def test_migration_preserves_existing_field_values(tmp_path, theater_index):
    history_path = tmp_path / "showtimes_history.csv"
    original = normalize_history_row(_sample_row())
    original["Runtime"] = "150"
    original["posterDynamic"] = "https://example.com/poster.jpg"
    save_csv(str(history_path), [original], fieldnames=HISTORY_FIELDNAMES)

    loaded = [normalize_history_row(row) for row in read_csv(str(history_path))]
    enrich_history_rows(loaded, theater_index, overwrite=True)

    assert loaded[0]["Runtime"] == "150"
    assert loaded[0]["posterDynamic"] == "https://example.com/poster.jpg"
    assert loaded[0]["Theater"] == "AMC Pacific Place 11"


@pytest.mark.parametrize(
    ("theater", "expected_id"),
    [
        ("AMC Pacific Place 11", "amc-pacific-place-11"),
        ("SIFF Cinema Uptown", "siff-cinema-uptown"),
        ("The Beacon", "the-beacon"),
    ],
)
def test_known_theaters_resolve(theater_index, theater, expected_id):
    row = _sample_row(theater=theater)
    assert derive_theater_id(row, theater_index) == expected_id


def test_out_of_scope_theater_remains_unresolved(theater_index):
    row = _sample_row(theater="AMC Vancouver Mall 12")
    assert derive_theater_id(row, theater_index) is None

    enriched = normalize_history_row(row)
    enrich_history_row_keys(enriched, theater_index)
    assert enriched["theater_id"] == ""


def test_film_keys_are_deterministic(theater_index):
    row = _sample_row(film="Sinners (2025)")
    key_one = derive_showtime_film_key(row)
    key_two = derive_showtime_film_key(row)
    assert key_one == key_two == "sinners-2025"


def test_processor_add_new_showtime_populates_keys(theater_index):
    history = []
    add_new_showtime(_sample_row(), history, "2026-06-26", "amc", theater_index)
    assert history[0]["theater_id"] == "amc-pacific-place-11"
    assert history[0]["showtime_film_key"] == "sinners"


def test_missing_film_title_leaves_key_blank(theater_index):
    row = normalize_history_row(_sample_row(film=""))
    enrich_history_row_keys(row, theater_index, log_warnings=False)
    assert row["showtime_film_key"] == ""
    assert row["theater_id"] == "amc-pacific-place-11"
