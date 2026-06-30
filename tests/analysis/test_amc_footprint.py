"""Tests for AMC film-footprint derivation (PR B)."""

from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

import pytest

from reel_seattle.analysis.amc_footprint import (
    FOOTPRINT_FIELDNAMES,
    build_footprint_from_logs,
    build_footprint_rows,
    enabled_amc_theater_names,
    load_amc_snapshots,
)
from reel_seattle.normalize import build_theater_index

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"
REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "theaters.json"


@pytest.fixture
def registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def mini_log_dir(tmp_path: Path) -> Path:
    shutil.copy(
        FIXTURES_DIR / "amc_footprint_mini.json",
        tmp_path / "2026-06-26_amc.json",
    )
    return tmp_path


def test_enabled_amc_theater_names_includes_pacific_place(registry):
    names = enabled_amc_theater_names(registry)
    assert "AMC Pacific Place 11" in names
    assert all(name.startswith("AMC ") for name in names)


def test_build_footprint_rows_from_mini_fixture(mini_log_dir, registry):
    theater_index = build_theater_index(registry)
    snapshots = load_amc_snapshots(mini_log_dir)
    assert len(snapshots) == 1
    assert snapshots[0].snapshot_date.isoformat() == "2026-06-26"

    rows = build_footprint_rows(snapshots, theater_index=theater_index)
    assert len(rows) == 4  # alpha: 06/26, 06/27, 06/28; event: 06/26

    alpha_rows = [row for row in rows if row["showtime_film_key"] == "fixture-film-alpha"]
    assert len(alpha_rows) == 3

    day_one = next(row for row in alpha_rows if row["show_date"] == "2026-06-26")
    assert day_one["showtime_count"] == "2"
    assert day_one["theater_count"] == "1"
    assert day_one["almost_sold_out_count"] == "1"
    assert day_one["has_matinee"] == "true"
    assert day_one["has_primetime"] == "true"
    assert day_one["max_show_date_visible_for_film_at_snapshot"] == "2026-06-28"
    assert day_one["total_visible_theaters_for_film_at_snapshot"] == "2"
    assert day_one["first_snapshot_seen_for_film"] == "2026-06-26"
    assert day_one["snapshots_seen_count_for_film"] == "1"

    weekend = next(row for row in alpha_rows if row["show_date"] == "2026-06-28")
    assert weekend["has_weekend_show"] == "true"
    assert weekend["days_from_snapshot_to_show_date"] == "2"

    event_row = next(
        row for row in rows if row["showtime_film_key"] == "fathom-one-night-opera"
    )
    assert event_row["event_like_flag"] == "true"
    assert "title_pattern" in event_row["event_like_reason"]


def test_build_footprint_csv_round_trip(mini_log_dir, tmp_path, registry):
    output = tmp_path / "footprint.csv"
    summary = build_footprint_from_logs(
        mini_log_dir,
        output,
        registry_path=REGISTRY_PATH,
    )
    assert summary["row_count"] == 4
    assert summary["film_count"] == 2
    assert output.is_file()

    with output.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames == FOOTPRINT_FIELDNAMES
        loaded = list(reader)
    assert len(loaded) == 4
