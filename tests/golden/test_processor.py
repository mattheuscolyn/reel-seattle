"""Golden regression tests for the daily processor pipeline."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.golden.processor_harness import (
    FIXTURES_DIR,
    REFERENCE_DATE,
    REFERENCE_TODAY,
    future_rows,
    history_films,
    run_processor_golden,
)


@pytest.fixture
def golden(tmp_path) -> "ProcessorGoldenResult":
    return run_processor_golden(tmp_path)


def test_fixtures_exist():
    assert (FIXTURES_DIR / "history_seed.csv").exists()
    assert (FIXTURES_DIR / "amc_scrape.csv").exists()
    assert (FIXTURES_DIR / "indie_scrape.csv").exists()


def test_processor_preserves_past_rows(golden):
    films = history_films(golden.history)
    assert "Past AMC Film" in films
    assert "Past SIFF Film" in films
    assert "Past Beacon Film" in films
    assert "Out Of Scope AMC" in films
    assert "Nullish Film" in films


def test_amc_future_rows_are_restate(golden):
    films = history_films(golden.history)
    assert "Old Future AMC" not in films
    assert "New Future AMC" in films
    assert len(future_rows(golden.history, source="amc")) >= 1


def test_siff_future_rows_are_restate(golden):
    films = history_films(golden.history)
    assert "Old Future SIFF" not in films
    assert "New Future SIFF" in films
    assert all(row["source"] == "siff" for row in future_rows(golden.history, source="siff"))


def test_beacon_future_rows_restate_and_stale_removed(golden):
    films = history_films(golden.history)
    assert "Stale Beacon Film" not in films
    assert "Old Future Beacon" not in films
    assert "New Future Beacon" in films


def test_out_of_scope_historical_amc_preserved(golden):
    out_of_scope = [
        row
        for row in golden.history
        if row["Theater"] == "AMC River Park Square 20"
    ]
    assert len(out_of_scope) == 1
    assert out_of_scope[0]["Film"] == "Out Of Scope AMC"


def test_no_generic_indie_source_for_resolved_theaters(golden):
    future = future_rows(golden.history)
    resolved = [
        row
        for row in future
        if row.get("source") == "indie"
        and row["Theater"] in {"SIFF Cinema Uptown", "The Beacon"}
    ]
    assert resolved == []


def test_nullish_optional_fields_normalized(golden):
    nullish = next(row for row in golden.history if row["Film"] == "Nullish Film")
    assert nullish["Runtime"] == ""
    assert nullish["posterDynamic"] == ""


def test_showtimes_current_shape_and_window(golden):
    artifact = golden.current_artifact
    assert set(artifact) >= {
        "schema_version",
        "generated_at",
        "timezone",
        "window",
        "sources_included",
        "sources",
        "stats",
        "theaters",
        "films",
        "showtimes",
    }
    assert artifact["window"] == {
        "start_date": "2026-06-26",
        "end_date": "2026-07-10",
    }


def test_showtimes_current_normalized_ids_and_keys(golden):
    showtimes = golden.current_artifact["showtimes"]
    assert showtimes

    amc = next(s for s in showtimes if s["film_title"] == "New Future AMC")
    assert amc["theater_id"] == "amc-pacific-place-11"
    assert amc["showtime_film_key"] == "new-future-amc"
    assert amc["source"] == "amc"

    siff = next(s for s in showtimes if s["film_title"] == "New Future SIFF")
    assert siff["theater_id"] == "siff-cinema-uptown"
    assert siff["source"] == "siff"

    beacon = next(s for s in showtimes if s["film_title"] == "New Future Beacon")
    assert beacon["theater_id"] == "the-beacon"
    assert beacon["source"] == "beacon"


def test_showtimes_current_source_freshness(golden):
    sources = golden.current_artifact["sources"]
    assert sources["amc"]["status"] == "success"
    assert sources["siff"]["status"] == "success"
    assert sources["beacon"]["status"] == "success"
    assert sources["amc"]["showtime_count"] >= 1
    assert sources["siff"]["showtime_count"] >= 1
    assert sources["beacon"]["showtime_count"] >= 1


def test_generated_json_artifacts_validate_and_have_no_literal_sentinels(golden):
    current_text = golden.current_path.read_text(encoding="utf-8")
    report_text = golden.report_path.read_text(encoding="utf-8")
    assert '"None"' not in current_text
    assert '"Unknown"' not in current_text
    json.loads(current_text)
    json.loads(report_text)
    assert golden.pipeline_report["status"] == "success"


def test_golden_does_not_use_production_paths(tmp_path, golden):
    repo_root = Path(__file__).resolve().parents[2]
    assert golden.history_path.is_relative_to(tmp_path)
    assert golden.current_path.is_relative_to(tmp_path)
    assert golden.report_path.is_relative_to(tmp_path)
    assert str(golden.history_path) != str(repo_root / "data" / "history" / "showtimes_history.csv")


def test_unknown_indie_scrape_not_added_to_history(golden):
    assert "Unknown Indie Film" not in history_films(golden.history)


def test_canceled_amc_in_history_but_not_in_current_artifact(golden):
    assert "Canceled AMC Film" in history_films(golden.history)
    current_films = {s["film_title"] for s in golden.current_artifact["showtimes"]}
    assert "Canceled AMC Film" not in current_films
