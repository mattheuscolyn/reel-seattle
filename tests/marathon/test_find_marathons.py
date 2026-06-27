"""Tests for marathon export from showtimes_current.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "marathon"
MARATHON_SCRIPT = PROJECT_ROOT / "scripts" / "marathon" / "find_marathons.py"


def _load_find_marathons_module():
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    marathon_dir = str(PROJECT_ROOT / "scripts" / "marathon")
    if marathon_dir not in sys.path:
        sys.path.insert(0, marathon_dir)
    import find_marathons

    return find_marathons


@pytest.fixture
def marathon_mod():
    return _load_find_marathons_module()


@pytest.fixture
def current_fixture() -> dict:
    return json.loads((FIXTURES_DIR / "showtimes_current.json").read_text(encoding="utf-8"))


def test_export_reads_showtimes_current_json(marathon_mod, tmp_path, current_fixture):
    current_path = tmp_path / "showtimes_current.json"
    current_path.write_text(json.dumps(current_fixture), encoding="utf-8")

    artifact = marathon_mod.load_showtimes_current_artifact(current_path)
    skip_stats: dict[str, int] = {}
    showtimes = marathon_mod.load_amc_showtimes_from_current(artifact, skip_stats=skip_stats)

    assert len(showtimes) == 2
    assert skip_stats.get("non_amc") == 1


def test_amc_rows_are_included(marathon_mod, current_fixture):
    showtimes = marathon_mod.load_amc_showtimes_from_current(current_fixture)
    films = {row.film for row in showtimes}
    assert films == {"Sinners", "Matinee Film"}


def test_non_amc_rows_are_excluded(marathon_mod, current_fixture):
    skip_stats: dict[str, int] = {}
    marathon_mod.load_amc_showtimes_from_current(current_fixture, skip_stats=skip_stats)
    assert skip_stats["non_amc"] == 1


def test_canceled_rows_are_excluded(marathon_mod, current_fixture):
    skip_stats: dict[str, int] = {}
    showtimes = marathon_mod.load_amc_showtimes_from_current(current_fixture, skip_stats=skip_stats)
    assert all(row.film != "Canceled Film" for row in showtimes)
    assert skip_stats.get("canceled") == 1


def test_rows_without_runtime_are_excluded(marathon_mod, current_fixture):
    skip_stats: dict[str, int] = {}
    showtimes = marathon_mod.load_amc_showtimes_from_current(current_fixture, skip_stats=skip_stats)
    assert all(row.film != "Mystery Film" for row in showtimes)
    assert skip_stats.get("missing_runtime") == 1


def test_time_fields_convert_to_expected_marathon_shape(marathon_mod, current_fixture):
    showtimes = marathon_mod.load_amc_showtimes_from_current(current_fixture)
    sinners = next(row for row in showtimes if row.film == "Sinners")
    assert sinners.time == "7:30 PM"
    assert sinners.start_min == 19 * 60 + 30
    assert sinners.end_min == sinners.start_min + 137


def test_theater_display_names_from_embedded_theaters(marathon_mod, current_fixture):
    showtimes = marathon_mod.load_amc_showtimes_from_current(current_fixture)
    assert {row.theater for row in showtimes} == {"AMC Pacific Place 11"}


def test_empty_amc_result_writes_valid_marathon_json(marathon_mod, tmp_path):
    empty_fixture = json.loads(
        (FIXTURES_DIR / "showtimes_current_empty_amc.json").read_text(encoding="utf-8")
    )
    current_path = tmp_path / "showtimes_current.json"
    current_path.write_text(json.dumps(empty_fixture), encoding="utf-8")

    paths, skip_stats = marathon_mod.export_marathon_planner(
        base=tmp_path / "public",
        current_path=current_path,
    )
    payload = json.loads(paths["showtimes"].read_text(encoding="utf-8"))

    assert payload["showtimes"] == []
    assert payload["dates"] == []
    assert payload["theaters"] == []
    assert skip_stats == {}


def test_missing_showtimes_current_fails_clearly(marathon_mod, tmp_path):
    with pytest.raises(FileNotFoundError, match="Run daily_processor.py first"):
        marathon_mod.export_marathon_planner(
            base=tmp_path / "public",
            current_path=tmp_path / "missing.json",
        )


def test_malformed_json_fails_clearly(marathon_mod, tmp_path):
    bad_path = tmp_path / "bad.json"
    bad_path.write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError, match="Malformed showtimes current artifact"):
        marathon_mod.load_showtimes_current_artifact(bad_path)


def test_marathon_output_shape_preserved_for_ui(marathon_mod, current_fixture):
    showtimes = marathon_mod.load_amc_showtimes_from_current(current_fixture)
    payload = marathon_mod.build_showtimes_export(showtimes, source_name="showtimes_current.json")

    assert set(payload) >= {
        "generated_at",
        "source_csv",
        "source_file",
        "blacklist",
        "preferred_movies",
        "day_window",
        "default_date",
        "default_theater",
        "dates",
        "theaters",
        "showtimes",
    }
    assert payload["dates"] == ["06/28/2026", "06/29/2026"]
    assert payload["source_file"] == "public/data/showtimes_current.json"

    row = payload["showtimes"][0]
    assert set(row) == {
        "id",
        "date",
        "time",
        "theater",
        "film",
        "runtime",
        "poster",
        "start_min",
        "end_min",
    }


def test_export_marathon_planner_end_to_end(marathon_mod, tmp_path, current_fixture):
    current_path = tmp_path / "showtimes_current.json"
    current_path.write_text(json.dumps(current_fixture), encoding="utf-8")

    deploy_base = tmp_path / "public"
    paths, _skip_stats = marathon_mod.export_marathon_planner(
        base=deploy_base,
        current_path=current_path,
    )

    payload = json.loads(paths["showtimes"].read_text(encoding="utf-8"))
    assert payload["source_csv"] == "showtimes_current.json"
    assert payload["source_file"] == "public/data/showtimes_current.json"
    assert len(payload["showtimes"]) == 2
    assert (deploy_base / "marathon" / "marathon.js").exists()
