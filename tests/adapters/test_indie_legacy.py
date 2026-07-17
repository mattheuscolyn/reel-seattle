"""Shared indie adapter and wrapper tests."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reel_seattle.adapters.base import FetchContext, RawShowtime
from reel_seattle.adapters.indie_legacy import (
    INDIE_CSV_FIELDNAMES,
    raw_showtime_to_legacy_row,
    write_legacy_indie_csv,
)
from webscrapetheaters import collect_indie_showtimes

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"


def test_legacy_csv_conversion_preserves_expected_fields():
    raw = RawShowtime(
        theater_name_raw="SIFF Cinema Uptown",
        date_raw="07/01/2026",
        time_raw="5:00 PM",
        title_raw="Fixture Film",
        runtime_raw="120",
        poster_url_raw="https://example.com/poster.jpg",
    )
    row = raw_showtime_to_legacy_row(raw)

    assert set(row) == set(INDIE_CSV_FIELDNAMES)
    assert row["Date"] == "07/01/2026"
    assert row["Time"] == "5:00 PM"
    assert row["Theater"] == "SIFF Cinema Uptown"
    assert row["Film"] == "Fixture Film"
    assert row["Runtime"] == "120"
    assert row["isAlmostSoldOut"] == "None"
    assert row["posterDynamic"] == "https://example.com/poster.jpg"
    assert row["first_seen_date"] == ""
    assert row["source"] == ""


def test_webscrapetheaters_wrapper_collects_fixture_records(monkeypatch):
    siff_listing = (FIXTURES_DIR / "siff_listing.html").read_text(encoding="utf-8")
    siff_film = (FIXTURES_DIR / "siff_film.html").read_text(encoding="utf-8")
    beacon_calendar = (FIXTURES_DIR / "beacon_calendar.html").read_text(encoding="utf-8")
    beacon_film = (FIXTURES_DIR / "beacon_film.html").read_text(encoding="utf-8")

    pages = {
        "https://www.siff.net/cinema/in-theaters": siff_listing,
        "https://www.siff.net/cinema/in-theaters/test-film": siff_film,
        "https://www.siff.net/programs-and-events/special-event": siff_film,
        "https://thebeacon.film/calendar": beacon_calendar,
        "https://thebeacon.film/calendar/movie/fixture-film": beacon_film,
    }

    def fake_siff_fetch(context, *args, **kwargs):
        def fetch(url: str) -> str | None:
            return pages.get(url)

        from reel_seattle.adapters.siff import fetch_siff_showtimes

        return fetch_siff_showtimes(
            context,
            fetch_text_fn=fetch,
            current_year=2026,
            sleep_seconds=0,
        )

    def fake_beacon_fetch(context, *args, **kwargs):
        def fetch(url: str) -> str | None:
            return pages.get(url)

        from reel_seattle.adapters.beacon import fetch_beacon_showtimes

        return fetch_beacon_showtimes(
            context,
            fetch_text_fn=fetch,
            current_year=2026,
            sleep_seconds=0,
        )

    monkeypatch.setattr("webscrapetheaters.fetch_siff_showtimes", fake_siff_fetch)
    monkeypatch.setattr("webscrapetheaters.fetch_beacon_showtimes", fake_beacon_fetch)

    def fake_nwff_fetch(start, end, **kwargs):
        from reel_seattle.adapters.nwff import NwffAdapterResult

        return NwffAdapterResult(records=[], stats={}, restate_safe=False)

    monkeypatch.setattr("webscrapetheaters.fetch_nwff", fake_nwff_fetch)

    def fake_central_fetch(start, end, **kwargs):
        from reel_seattle.adapters.central_cinema import CentralCinemaAdapterResult

        return CentralCinemaAdapterResult(records=[], stats={}, restate_safe=False)

    monkeypatch.setattr("webscrapetheaters.fetch_central_cinema", fake_central_fetch)

    context = FetchContext(
        run_date=date(2026, 6, 26),
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        theaters_registry={},
    )
    siff_result, beacon_result, nwff_result, central_result = collect_indie_showtimes(context)
    records = siff_result.records + beacon_result.records

    assert nwff_result is not None
    assert central_result is not None
    assert len(records) >= 3
    theaters = {record.theater_name_raw for record in records}
    assert "SIFF Cinema Uptown" in theaters
    assert "The Beacon" in theaters


def test_write_legacy_indie_csv_round_trip(tmp_path):
    row = raw_showtime_to_legacy_row(
        RawShowtime(
            theater_name_raw="The Beacon",
            date_raw="06/28/2026",
            time_raw="7:00PM",
            title_raw="Fixture Film",
            runtime_raw="102",
        )
    )
    csv_path = tmp_path / "indieshowtimes.csv"
    write_legacy_indie_csv(csv_path, [row])
    text = csv_path.read_text(encoding="utf-8")
    assert "Date,Time,Theater,Film" in text
    assert "The Beacon" in text
