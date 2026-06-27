"""Tests for history time_24h enrichment and migration."""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from daily_processor import (
    HISTORY_FIELDNAMES,
    add_new_showtime,
    normalize_history_row,
    read_csv,
    save_csv,
)
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.history_keys import load_theater_index
from reel_seattle.history_times import (
    derive_time_24h,
    enrich_history_row_time,
    enrich_history_rows_time,
    is_valid_stored_time_24h,
)

REGISTRY_PATH = Path(__file__).resolve().parents[1] / "data" / "theaters.json"
REFERENCE = __import__("datetime").date(2026, 6, 26)


@pytest.fixture
def theaters_registry():
    import json

    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _row(time: str, **extra) -> dict[str, str]:
    base = {
        "Date": "06/28/2026",
        "Time": time,
        "Theater": "AMC Pacific Place 11",
        "Film": "Test Film",
        "Runtime": "120",
        "isAlmostSoldOut": "",
        "posterDynamic": "",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "",
        "last_updated": "",
        "source": "amc",
        "theater_id": "",
        "showtime_film_key": "",
        "time_24h": "",
    }
    base.update(extra)
    return normalize_history_row(base)


@pytest.mark.parametrize(
    ("time_value", "expected"),
    [
        ("7:30PM", "19:30"),
        ("7:30 PM", "19:30"),
        ("19:30", "19:30"),
        ("12:00AM", "00:00"),
        ("12:00PM", "12:00"),
    ],
)
def test_derive_time_24h_from_legacy_time(time_value, expected):
    assert derive_time_24h(_row(time_value)) == expected


def test_ambiguous_time_leaves_time_24h_blank():
    row = _row("7:30")
    enrich_history_row_time(row)
    assert row["time_24h"] == ""
    assert row["Time"] == "7:30"


def test_migration_adds_time_24h_column_when_missing(tmp_path):
    history_path = tmp_path / "history.csv"
    rows = [
        {
            "Date": "06/28/2026",
            "Time": "7:30PM",
            "Theater": "AMC Pacific Place 11",
            "Film": "Film A",
            "Runtime": "120",
            "isAlmostSoldOut": "",
            "posterDynamic": "",
            "isCanceled": "false",
            "premiumFormat": "",
            "hasTrailers": "",
            "maximumIntendedAttendance": "",
            "first_seen_date": "",
            "last_updated": "",
            "source": "amc",
            "theater_id": "",
            "showtime_film_key": "",
        }
    ]
    save_csv(str(history_path), rows, fieldnames=HISTORY_FIELDNAMES[:-1])

    loaded = [normalize_history_row(row) for row in read_csv(str(history_path))]
    assert len(loaded) == 1
    stats = enrich_history_rows_time(loaded, overwrite=True)
    save_csv(str(history_path), loaded, fieldnames=HISTORY_FIELDNAMES)

    with history_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        migrated = list(reader)

    assert stats.total_rows == 1
    assert "time_24h" in reader.fieldnames
    assert migrated[0]["Time"] == "7:30PM"
    assert migrated[0]["time_24h"] == "19:30"


def test_migration_preserves_row_count_and_time_column(tmp_path):
    rows = [_row("8:00PM"), _row("5:00 PM", Theater="SIFF Cinema Uptown", source="siff")]
    stats = enrich_history_rows_time(rows, overwrite=True)
    assert stats.total_rows == 2
    assert rows[0]["Time"] == "8:00PM"
    assert rows[1]["Time"] == "5:00 PM"


def test_processor_adds_time_24h_for_new_amc_row(theaters_registry):
    theater_index = load_theater_index(REGISTRY_PATH)
    history: list[dict] = []
    showtime = {
        "Date": "06/28/2026",
        "Time": "7:30PM",
        "Theater": "AMC Pacific Place 11",
        "Film": "New AMC Film",
        "Runtime": "137",
        "isAlmostSoldOut": "",
        "posterDynamic": "",
        "isCanceled": "false",
        "premiumFormat": "IMAX",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
    }
    add_new_showtime(showtime, history, "2026-06-26", "amc", theater_index)
    assert history[0]["Time"] == "7:30PM"
    assert history[0]["time_24h"] == "19:30"


@pytest.mark.parametrize(
    ("theater", "source"),
    [
        ("SIFF Cinema Uptown", "siff"),
        ("The Beacon", "beacon"),
    ],
)
def test_processor_adds_time_24h_for_new_indie_rows(theater, source):
    theater_index = load_theater_index(REGISTRY_PATH)
    history: list[dict] = []
    showtime = {
        "Date": "07/01/2026",
        "Time": "5:00 PM",
        "Theater": theater,
        "Film": "Indie Film",
        "Runtime": "100",
        "isAlmostSoldOut": "None",
        "posterDynamic": "None",
    }
    add_new_showtime(showtime, history, "2026-06-26", source, theater_index)
    assert history[0]["time_24h"] == "17:00"


def test_current_artifact_prefers_time_24h_when_present(theaters_registry):
    row = _row("7:30PM", time_24h="20:00")
    artifact = build_showtimes_current([row], registry=theaters_registry, reference_date=REFERENCE)
    assert artifact["showtimes"][0]["time"] == "20:00"
    assert artifact["showtimes"][0]["time_display"] == "8:00 PM"


def test_current_artifact_falls_back_to_parsing_time(theaters_registry):
    row = _row("7:30 PM")
    artifact = build_showtimes_current([row], registry=theaters_registry, reference_date=REFERENCE)
    assert artifact["showtimes"][0]["time"] == "19:30"
    assert artifact["showtimes"][0]["time_display"] == "7:30 PM"


def test_current_artifact_omits_unparseable_time(theaters_registry):
    row = _row("7:30")
    artifact = build_showtimes_current([row], registry=theaters_registry, reference_date=REFERENCE)
    assert artifact["showtimes"] == []


def test_valid_stored_time_24h():
    assert is_valid_stored_time_24h("19:30")
    assert not is_valid_stored_time_24h("7:30")
