"""Tests for normalized raw JSON scrape daily logs."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from reel_seattle.adapters.amc import api_showtime_to_raw
from reel_seattle.adapters.base import FetchResult, RawShowtime
from reel_seattle.adapters.scrape_log import (
    SCRAPE_LOG_SCHEMA_VERSION,
    ScrapeLogError,
    build_scrape_log_artifact,
    daily_log_path,
    load_scrape_daily_log,
    raw_showtime_to_record_dict,
    record_dict_to_raw_showtime,
    write_scrape_daily_log,
)
from reel_seattle.adapters.siff import parse_siff_film_page

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"
THEATER_NAME = "AMC Pacific Place 11"


@pytest.fixture
def amc_raw() -> RawShowtime:
    api_showtime = json.loads((FIXTURES_DIR / "amc_api_showtime.json").read_text(encoding="utf-8"))
    return api_showtime_to_raw(api_showtime, THEATER_NAME)


@pytest.fixture
def siff_raws() -> list[RawShowtime]:
    html = (FIXTURES_DIR / "siff_film.html").read_text(encoding="utf-8")
    return parse_siff_film_page(
        html,
        movie_url="https://www.siff.net/cinema/in-theaters/test-film",
        window_start=date(2026, 7, 1),
        window_end=date(2027, 7, 1),
        scrape_date=date(2026, 7, 10),
    ).records


@pytest.fixture
def beacon_raw() -> RawShowtime:
    html = (FIXTURES_DIR / "beacon_film.html").read_text(encoding="utf-8")
    from datetime import date

    from reel_seattle.adapters.beacon import parse_beacon_film_page

    return parse_beacon_film_page(
        html,
        film_url="https://thebeacon.film/calendar/movie/fixture-film",
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    ).records[0]


def test_amc_helper_writes_json_artifact_with_expected_envelope(tmp_path, amc_raw):
    result = FetchResult(
        records=[amc_raw],
        stats={"records_fetched": 1},
        warnings=["sample warning"],
        errors=["sample error"],
    )
    path = tmp_path / "2026-06-26_amc.json"
    artifact = write_scrape_daily_log(path, "amc", result, generated_at="2026-06-26T00:00:00-07:00")

    assert artifact["schema_version"] == SCRAPE_LOG_SCHEMA_VERSION
    assert artifact["generated_at"] == "2026-06-26T00:00:00-07:00"
    assert artifact["source"] == "amc"
    assert artifact["records"][0]["title_raw"] == "New Future AMC"
    assert artifact["stats"]["record_count"] == 1
    assert artifact["stats"]["warning_count"] == 1
    assert artifact["stats"]["error_count"] == 1
    assert artifact["warnings"] == ["sample warning"]
    assert artifact["errors"] == ["sample error"]


def test_siff_helper_writes_json_artifact_with_expected_envelope(tmp_path, siff_raws):
    result = FetchResult(records=siff_raws, stats={"film_pages_scraped": 1})
    path = tmp_path / "2026-06-26_siff.json"
    artifact = write_scrape_daily_log(path, "siff", result, generated_at="2026-06-26T00:00:00-07:00")

    assert artifact["source"] == "siff"
    assert artifact["records"]
    assert artifact["records"][0]["theater_name_raw"].startswith("SIFF Cinema")


def test_beacon_helper_writes_json_artifact_with_expected_envelope(tmp_path, beacon_raw):
    result = FetchResult(records=[beacon_raw], stats={"film_pages_scraped": 1})
    path = tmp_path / "2026-06-26_beacon.json"
    artifact = write_scrape_daily_log(path, "beacon", result, generated_at="2026-06-26T00:00:00-07:00")

    assert artifact["source"] == "beacon"
    assert artifact["records"][0]["theater_name_raw"] == "The Beacon"
    assert artifact["records"][0]["poster_url_raw"] is None


def test_raw_showtime_serializes_to_json_safely(amc_raw):
    payload = raw_showtime_to_record_dict(amc_raw)
    encoded = json.dumps(payload)
    decoded = json.loads(encoded)
    restored = record_dict_to_raw_showtime(decoded)
    assert restored == amc_raw


def test_json_artifact_preserves_warnings_errors_stats(tmp_path, amc_raw):
    artifact = build_scrape_log_artifact(
        "amc",
        FetchResult(
            records=[amc_raw],
            stats={"records_fetched": 1, "theaters_scraped": 2},
            warnings=["w1"],
            errors=["e1"],
        ),
        generated_at="2026-06-26T00:00:00-07:00",
    )
    assert artifact["stats"]["records_fetched"] == 1
    assert artifact["stats"]["warning_count"] == 1
    assert artifact["stats"]["error_count"] == 1
    assert artifact["warnings"] == ["w1"]
    assert artifact["errors"] == ["e1"]


def test_load_scrape_daily_log_round_trip(tmp_path, amc_raw):
    path = tmp_path / "2026-06-26_amc.json"
    write_scrape_daily_log(path, "amc", FetchResult(records=[amc_raw]))
    loaded = load_scrape_daily_log(path)
    assert loaded.records == [amc_raw]


def test_malformed_json_raises_scrape_log_error(tmp_path):
    path = tmp_path / "2026-06-26_amc.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(ScrapeLogError, match="invalid JSON"):
        load_scrape_daily_log(path)


def test_unsupported_schema_version_raises_scrape_log_error(tmp_path, amc_raw):
    path = tmp_path / "2026-06-26_amc.json"
    artifact = build_scrape_log_artifact("amc", FetchResult(records=[amc_raw]))
    artifact["schema_version"] = "9.9.9"
    path.write_text(json.dumps(artifact), encoding="utf-8")
    with pytest.raises(ScrapeLogError, match="unsupported schema_version"):
        load_scrape_daily_log(path)


def test_daily_log_path_uses_iso_date_and_source():
    path = daily_log_path(date(2026, 6, 26), "siff")
    assert path.as_posix().endswith("data/daily_logs/2026-06-26_siff.json")
