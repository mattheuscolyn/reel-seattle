"""Tests for the Beacon source adapter."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from reel_seattle.adapters.beacon import (
    BEACON_CALENDAR_URL,
    BEACON_THEATER_NAME,
    BeaconAdapter,
    extract_beacon_movie_links,
    fetch_beacon_showtimes,
    parse_beacon_film_page,
)
from reel_seattle.adapters.base import FetchContext
from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"
FILM_URL = "https://thebeacon.film/calendar/movie/fixture-film"


@pytest.fixture
def beacon_film_html() -> str:
    return (FIXTURES_DIR / "beacon_film.html").read_text(encoding="utf-8")


@pytest.fixture
def beacon_calendar_html() -> str:
    return (FIXTURES_DIR / "beacon_calendar.html").read_text(encoding="utf-8")


def test_beacon_fixture_parses_showtime(beacon_film_html):
    records = parse_beacon_film_page(beacon_film_html, current_year=2026, film_url=FILM_URL)
    assert len(records) == 2


def test_beacon_theater_name_is_the_beacon(beacon_film_html):
    records = parse_beacon_film_page(beacon_film_html, current_year=2026, film_url=FILM_URL)
    assert {record.theater_name_raw for record in records} == {BEACON_THEATER_NAME}


def test_beacon_runtime_extracted_when_present(beacon_film_html):
    records = parse_beacon_film_page(beacon_film_html, current_year=2026, film_url=FILM_URL)
    assert records[0].runtime_raw == "102"


def test_beacon_missing_poster_remains_empty(beacon_film_html):
    records = parse_beacon_film_page(beacon_film_html, current_year=2026, film_url=FILM_URL)
    assert records[0].poster_url_raw is None
    row = raw_showtime_to_legacy_row(records[0])
    assert row["posterDynamic"] == "None"


def test_beacon_adapter_returns_raw_showtime_records(beacon_film_html, beacon_calendar_html):
    pages = {
        BEACON_CALENDAR_URL: beacon_calendar_html,
        FILM_URL: beacon_film_html,
    }

    def fake_fetch(url: str) -> str | None:
        return pages.get(url)

    context = FetchContext(
        run_date=date(2026, 6, 26),
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        theaters_registry={},
        session=object(),  # type: ignore[arg-type]
    )
    result = fetch_beacon_showtimes(context, fetch_text_fn=fake_fetch, current_year=2026)

    assert len(result.records) == 2
    assert result.records[0].title_raw == "Fixture Beacon Film"


def test_beacon_time_format_preserved_in_legacy_csv(beacon_film_html):
    records = parse_beacon_film_page(beacon_film_html, current_year=2026, film_url=FILM_URL)
    row = raw_showtime_to_legacy_row(records[0])
    assert row["Time"] == "7:00PM"


def test_extract_beacon_movie_links(beacon_calendar_html):
    links = extract_beacon_movie_links(beacon_calendar_html)
    assert links == {FILM_URL}


def test_beacon_adapter_class_delegates(beacon_film_html):
    adapter = BeaconAdapter()
    records = adapter.parse_film_page(beacon_film_html, current_year=2026, film_url=FILM_URL)
    assert records
