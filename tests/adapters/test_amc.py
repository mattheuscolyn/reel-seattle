"""Tests for the AMC source adapter."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from reel_seattle.adapters.amc import (
    AMC_CSV_FIELDNAMES,
    AmcAdapter,
    api_showtime_to_raw,
    build_default_fetch_context,
    fetch_amc_showtimes,
    filter_nearby_amc_theaters,
    load_past_legacy_rows,
    raw_showtime_to_legacy_row,
    write_legacy_csv,
)
from reel_seattle.adapters.base import FetchContext
from reel_seattle.amc_allowlist import filter_enabled_amc_theaters

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"
THEATER_NAME = "AMC Pacific Place 11"


@pytest.fixture
def api_showtime() -> dict:
    return json.loads((FIXTURES_DIR / "amc_api_showtime.json").read_text(encoding="utf-8"))


@pytest.fixture
def registry() -> dict:
    return {
        "schema_version": "1.0.0",
        "updated_at": "2026-06-26",
        "theaters": [
            {
                "id": "amc-pacific-place-11",
                "name": "AMC Pacific Place 11",
                "aliases": [],
                "source": "amc",
                "source_external_id": "601",
                "enabled": True,
                "type": "chain",
            },
            {
                "id": "amc-kitsap-8",
                "name": "AMC Kitsap 8",
                "aliases": [],
                "source": "amc",
                "source_external_id": None,
                "enabled": False,
                "type": "chain",
            },
        ],
    }


def _api_theater(*, api_id: str, long_name: str) -> dict:
    return {
        "id": api_id,
        "longName": long_name,
        "location": {"latitude": 47.6, "longitude": -122.3},
    }


def test_api_showtime_maps_to_raw_showtime(api_showtime):
    raw = api_showtime_to_raw(api_showtime, THEATER_NAME)

    assert raw.theater_name_raw == THEATER_NAME
    assert raw.date_raw == "06/28/2026"
    assert raw.time_raw == "8:00PM"
    assert raw.title_raw == "New Future AMC"
    assert raw.runtime_raw == "137"
    assert raw.poster_url_raw == "https://example.com/new-amc.jpg"
    assert raw.canceled is False
    assert raw.almost_sold_out is False
    assert raw.format_raw == "IMAX"
    assert raw.source_showtime_id == "show-12345"
    assert raw.attributes["maximum_intended_attendance"] == 150
    assert "movie_id" not in (raw.attributes or {})


def test_api_showtime_full_fixture_maps_metadata():
    payload = json.loads((FIXTURES_DIR / "amc_api_showtime_full.json").read_text(encoding="utf-8"))
    raw = api_showtime_to_raw(payload, THEATER_NAME)
    assert raw.attributes["movie_id"] == "movie-abc123"
    assert raw.attributes["sell_until_utc"] == "2026-06-28T23:59:00Z"


def test_raw_showtime_to_legacy_csv_preserves_expected_fields(api_showtime):
    raw = api_showtime_to_raw(api_showtime, THEATER_NAME)
    row = raw_showtime_to_legacy_row(raw)

    assert set(row) == set(AMC_CSV_FIELDNAMES)
    assert row["Date"] == "06/28/2026"
    assert row["Time"] == "8:00PM"
    assert row["Theater"] == THEATER_NAME
    assert row["Film"] == "New Future AMC"
    assert row["Runtime"] == "137"
    assert row["posterDynamic"] == "https://example.com/new-amc.jpg"
    assert row["isCanceled"] == "False"
    assert row["isAlmostSoldOut"] == "False"
    assert row["premiumFormat"] == "IMAX"
    assert row["hasTrailers"] == "True"
    assert row["maximumIntendedAttendance"] == "150"
    assert row["first_seen_date"] == ""
    assert row["source"] == ""


def test_enabled_theater_is_included(registry):
    allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="601", long_name="AMC Pacific Place 11")],
        registry,
    )
    assert allowed == {"601": "AMC Pacific Place 11"}
    assert stats.included == 1


def test_disabled_theater_is_excluded(registry):
    allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="700", long_name="AMC Kitsap 8")],
        registry,
    )
    assert allowed == {}
    assert stats.disabled == 1


def test_out_of_scope_theater_is_excluded(registry):
    allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="701", long_name="AMC River Park Square 20")],
        registry,
    )
    assert allowed == {}
    assert stats.unknown == 1


def test_canceled_showtime_preserves_is_canceled(api_showtime):
    canceled = {**api_showtime, "isCanceled": True}
    row = raw_showtime_to_legacy_row(api_showtime_to_raw(canceled, THEATER_NAME))
    assert row["isCanceled"] == "True"


def test_almost_sold_out_preserves_flag(api_showtime):
    sold_out = {**api_showtime, "isAlmostSoldOut": True}
    row = raw_showtime_to_legacy_row(api_showtime_to_raw(sold_out, THEATER_NAME))
    assert row["isAlmostSoldOut"] == "True"


def test_premium_format_preserves_value(api_showtime):
    dolby = {**api_showtime, "premiumFormat": {"name": "Dolby Cinema", "type": "premium"}}
    row = raw_showtime_to_legacy_row(api_showtime_to_raw(dolby, THEATER_NAME))
    assert row["premiumFormat"] == "Dolby Cinema"


def test_fetch_uses_injected_api_functions_without_network(registry):
    run_date = date(2026, 6, 26)

    def fake_all_theaters(_session):
        return [
            _api_theater(api_id="601", long_name="AMC Pacific Place 11"),
            _api_theater(api_id="700", long_name="AMC Kitsap 8"),
            _api_theater(api_id="701", long_name="AMC River Park Square 20"),
        ]

    def fake_showtimes(_session, theater_id, _show_date):
        if theater_id != "601":
            return []
        return [json.loads((FIXTURES_DIR / "amc_api_showtime.json").read_text(encoding="utf-8"))]

    context = FetchContext(
        run_date=run_date,
        window_start=run_date,
        window_end=run_date,
        theaters_registry=registry,
        session=object(),  # type: ignore[arg-type]
    )
    result = fetch_amc_showtimes(
        context,
        sleep_seconds=0,
        get_all_theaters_fn=fake_all_theaters,
        get_showtimes_fn=fake_showtimes,
    )

    assert len(result.records) == 1
    assert result.records[0].title_raw == "New Future AMC"
    assert result.stats["allowlist_included"] == 1
    assert result.stats["allowlist_disabled"] == 1
    assert result.stats["allowlist_unknown"] == 1


def test_adapter_class_delegates_to_helpers(api_showtime):
    adapter = AmcAdapter()
    raw = adapter.api_showtime_to_raw(api_showtime, THEATER_NAME)
    row = adapter.raw_showtime_to_legacy_row(raw)
    assert row["Film"] == "New Future AMC"


def test_write_legacy_csv_round_trip(tmp_path, api_showtime):
    csv_path = tmp_path / "showtimes.csv"
    row = raw_showtime_to_legacy_row(api_showtime_to_raw(api_showtime, THEATER_NAME))
    write_legacy_csv(csv_path, [row])

    text = csv_path.read_text(encoding="utf-8")
    assert "Date,Time,Theater,Film" in text
    assert "New Future AMC" in text

    past_only = load_past_legacy_rows(csv_path, before_date=date(2026, 6, 29))
    assert len(past_only) == 1
    future_only = load_past_legacy_rows(csv_path, before_date=date(2026, 6, 1))
    assert future_only == []


def test_build_default_fetch_context_uses_registry(registry, tmp_path, monkeypatch):
    registry_path = tmp_path / "theaters.json"
    registry_path.write_text(json.dumps(registry), encoding="utf-8")
    context = build_default_fetch_context(registry_path=registry_path, run_date=date(2026, 6, 26))
    assert context.window_end == date(2026, 7, 10)
    assert context.theaters_registry["theaters"][0]["name"] == "AMC Pacific Place 11"


def test_nearby_filter_keeps_seattle_theaters():
    nearby = filter_nearby_amc_theaters(
        [
            _api_theater(api_id="1", long_name="Near"),
            {
                "id": "2",
                "longName": "Far",
                "location": {"latitude": 0.0, "longitude": 0.0},
            },
        ]
    )
    assert len(nearby) == 1
    assert nearby[0]["id"] == "1"
