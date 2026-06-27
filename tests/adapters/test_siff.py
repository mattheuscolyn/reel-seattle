"""Tests for the SIFF source adapter."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from reel_seattle.adapters.base import FetchContext
from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row
from reel_seattle.adapters.siff import (
    SIFF_BASE_URL,
    SIFF_IN_THEATERS_URL,
    SiffAdapter,
    extract_siff_movie_links,
    fetch_siff_showtimes,
    parse_siff_film_page,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"
FILM_URL = f"{SIFF_BASE_URL}/cinema/in-theaters/test-film"


@pytest.fixture
def siff_film_html() -> str:
    return (FIXTURES_DIR / "siff_film.html").read_text(encoding="utf-8")


@pytest.fixture
def siff_listing_html() -> str:
    return (FIXTURES_DIR / "siff_listing.html").read_text(encoding="utf-8")


def test_siff_fixture_parses_showtimes(siff_film_html):
    records = parse_siff_film_page(siff_film_html, movie_url=FILM_URL, current_year=2026)
    assert len(records) >= 1


def test_siff_venue_resolves_to_supported_theater(siff_film_html):
    records = parse_siff_film_page(siff_film_html, movie_url=FILM_URL, current_year=2026)
    venues = {record.theater_name_raw for record in records}
    assert venues <= SiffAdapter.supported_venues()
    assert "SIFF Cinema Uptown" in venues
    assert "SIFF Cinema Downtown" in venues


def test_siff_time_format_preserved_in_legacy_csv(siff_film_html):
    records = parse_siff_film_page(siff_film_html, movie_url=FILM_URL, current_year=2026)
    uptown = next(record for record in records if record.time_raw == "5:00 PM")
    row = raw_showtime_to_legacy_row(uptown)
    assert row["Time"] == "5:00 PM"


def test_siff_runtime_extracted_when_present(siff_film_html):
    records = parse_siff_film_page(siff_film_html, movie_url=FILM_URL, current_year=2026)
    assert records[0].runtime_raw == "120"


def test_siff_poster_url_extracted_when_present(siff_film_html):
    records = parse_siff_film_page(siff_film_html, movie_url=FILM_URL, current_year=2026)
    assert records[0].poster_url_raw == f"{SIFF_BASE_URL}/images/fixture-poster.jpg"


def test_siff_adapter_returns_raw_showtime_records(siff_film_html, siff_listing_html):
    pages = {
        SIFF_IN_THEATERS_URL: siff_listing_html,
        FILM_URL: siff_film_html,
        f"{SIFF_BASE_URL}/programs-and-events/special-event": siff_film_html,
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
    result = fetch_siff_showtimes(context, fetch_text_fn=fake_fetch, current_year=2026)

    assert result.records
    assert all(record.title_raw == "Fixture SIFF Film" for record in result.records)


def test_extract_siff_movie_links(siff_listing_html):
    links = extract_siff_movie_links(siff_listing_html)
    assert links == {
        f"{SIFF_BASE_URL}/cinema/in-theaters/test-film",
        f"{SIFF_BASE_URL}/programs-and-events/special-event",
    }
