"""Tests for the Beacon source adapter (P-19A title/year/identity alignment)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from reel_seattle.adapters.beacon import (
    BEACON_CALENDAR_URL,
    BEACON_THEATER_NAME,
    BeaconAdapter,
    beacon_slug_from_url,
    canonicalize_beacon_movie_url,
    extract_beacon_movie_links,
    fetch_beacon_showtimes,
    parse_beacon_film_page,
)
from reel_seattle.adapters.base import FetchContext, RawShowtime
from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row
from reel_seattle.normalize.year_window import infer_year_for_month_day
from reel_seattle.source_identity import source_film_id_from_raw, source_showtime_id_from_raw

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"
FILM_URL = "https://thebeacon.film/calendar/movie/fixture-film"


def _context(
    *,
    run_date: date = date(2026, 6, 26),
    window_start: date | None = None,
    window_end: date | None = None,
) -> FetchContext:
    return FetchContext(
        run_date=run_date,
        window_start=window_start or run_date,
        window_end=window_end or date(2026, 12, 31),
        theaters_registry={},
        session=object(),  # type: ignore[arg-type]
    )


def _film_html(
    *,
    title: str = "FIXTURE BEACON FILM",
    showtimes: list[tuple[str, str]] | None = None,
    title_tag: str | None = None,
) -> str:
    if showtimes is None:
        showtimes = [
            ("Thursday, July 2 at 7:00 PM", "INV-JUL2"),
            ("Saturday, July 4 at 9:30 PM", "INV-JUL4"),
        ]
    rows = []
    for label, inventory_id in showtimes:
        rows.append(
            f"""
            <div class="showtime-row">
              <span class="showtime-datetime">{label}</span>
              <a href="#" class="buy-btn" data-inventory-id="{inventory_id}"
                 data-catalog-id="{inventory_id}"
                 data-movie-title="{title}"
                 data-showtime-label="{label}">Tickets</a>
            </div>
            """
        )
    head_title = title_tag if title_tag is not None else f"{title} — The Beacon"
    return f"""<!DOCTYPE html>
<html>
<head><title>{head_title}</title></head>
<body>
  <h1>{title}</h1>
  <div class="w-8"><h4>Runtime</h4><p>102 minutes</p></div>
  <div class="movie-showtimes">{''.join(rows)}</div>
</body>
</html>
"""


@pytest.fixture
def beacon_film_html() -> str:
    return (FIXTURES_DIR / "beacon_film.html").read_text(encoding="utf-8")


@pytest.fixture
def beacon_calendar_html() -> str:
    return (FIXTURES_DIR / "beacon_calendar.html").read_text(encoding="utf-8")


def test_beacon_fixture_parses_showtime(beacon_film_html):
    result = parse_beacon_film_page(
        beacon_film_html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert len(result.records) == 2


def test_beacon_theater_name_is_the_beacon(beacon_film_html):
    records = BeaconAdapter.parse_film_page(
        beacon_film_html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert {record.theater_name_raw for record in records} == {BEACON_THEATER_NAME}


def test_beacon_runtime_extracted_when_present(beacon_film_html):
    records = BeaconAdapter.parse_film_page(
        beacon_film_html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].runtime_raw == "102"


def test_beacon_missing_poster_remains_empty(beacon_film_html):
    records = BeaconAdapter.parse_film_page(
        beacon_film_html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
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

    result = fetch_beacon_showtimes(_context(), fetch_text_fn=fake_fetch)
    assert len(result.records) == 2
    assert result.records[0].title_raw == "FIXTURE BEACON FILM"
    assert result.stats["restate_safe"] is True


def test_beacon_time_format_preserved_in_legacy_csv(beacon_film_html):
    records = BeaconAdapter.parse_film_page(
        beacon_film_html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    row = raw_showtime_to_legacy_row(records[0])
    assert row["Time"] == "7:00PM"


def test_extract_beacon_movie_links(beacon_calendar_html):
    links = extract_beacon_movie_links(beacon_calendar_html)
    assert links == {FILM_URL}


def test_extract_beacon_movie_links_dedupes_query_variants():
    html = """
    <a href="/calendar/movie/welcome-ii-the-terrordome">A</a>
    <a href="/calendar/movie/welcome-ii-the-terrordome?showtime=ABC">B</a>
    <a href='https://thebeacon.film/calendar/movie/welcome-ii-the-terrordome'>C</a>
    """
    links = extract_beacon_movie_links(html)
    assert links == {"https://thebeacon.film/calendar/movie/welcome-ii-the-terrordome"}


def test_beacon_adapter_class_delegates(beacon_film_html):
    adapter = BeaconAdapter()
    records = adapter.parse_film_page(
        beacon_film_html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records


def test_title_case_method_not_applied_to_roman_numerals():
    html = _film_html(title="WELCOME II THE TERRORDOME")
    records = BeaconAdapter.parse_film_page(
        html,
        film_url="https://thebeacon.film/calendar/movie/welcome-ii-the-terrordome",
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].title_raw == "WELCOME II THE TERRORDOME"
    assert "Ii" not in records[0].title_raw
    assert ".title(" not in Path("reel_seattle/adapters/beacon.py").read_text(encoding="utf-8")


@pytest.mark.parametrize(
    "title",
    [
        "WELCOME II THE TERRORDOME",
        "VHS",
        "RATE IT X",
        "What Have You Done To Solange?",
        "SECS FEST PRESENTS NIGHTS IN BLACK LEATHER",
        "A Lizard In A Woman's Skin",
        "5 Minutes To Live!",
    ],
)
def test_exact_titles_survive(title: str):
    records = BeaconAdapter.parse_film_page(
        _film_html(title=title),
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].title_raw == title


def test_html_entity_title_decodes():
    html = _film_html(title="Tom &amp; Jerry", title_tag="Tom &amp; Jerry — The Beacon")
    # BeautifulSoup already unescapes text nodes; also cover title-tag path without h1.
    html = html.replace("<h1>Tom &amp; Jerry</h1>", "")
    records = BeaconAdapter.parse_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].title_raw == "Tom & Jerry"


def test_whitespace_collapsed_but_casing_preserved():
    html = _film_html(title="  WELCOME   II   THE   TERRORDOME  ")
    records = BeaconAdapter.parse_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].title_raw == "WELCOME II THE TERRORDOME"


def test_public_legacy_title_remains_exact():
    records = BeaconAdapter.parse_film_page(
        _film_html(title="MIKEY AND NICKY"),
        film_url="https://thebeacon.film/calendar/movie/mikey-and-nicky",
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    row = raw_showtime_to_legacy_row(records[0])
    assert row["Film"] == "MIKEY AND NICKY"
    assert row["source_title"] == "MIKEY AND NICKY"


def test_program_slug_maps_to_source_film_id():
    url = "https://thebeacon.film/calendar/movie/welcome-ii-the-terrordome"
    records = BeaconAdapter.parse_film_page(
        _film_html(title="WELCOME II THE TERRORDOME"),
        film_url=url,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert beacon_slug_from_url(url) == "welcome-ii-the-terrordome"
    assert source_film_id_from_raw(records[0]) == "welcome-ii-the-terrordome"
    assert records[0].source_film_url == url
    row = raw_showtime_to_legacy_row(records[0])
    assert row["source_film_id"] == "welcome-ii-the-terrordome"


def test_title_change_does_not_change_program_identity():
    url = "https://thebeacon.film/calendar/movie/stable-slug"
    first = BeaconAdapter.parse_film_page(
        _film_html(title="OLD TITLE"),
        film_url=url,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    second = BeaconAdapter.parse_film_page(
        _film_html(title="NEW TITLE"),
        film_url=url,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert source_film_id_from_raw(first[0]) == source_film_id_from_raw(second[0]) == "stable-slug"


def test_similar_titles_different_slugs_remain_distinct():
    a = BeaconAdapter.parse_film_page(
        _film_html(title="THE KILLERS"),
        film_url="https://thebeacon.film/calendar/movie/the-killers",
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    b = BeaconAdapter.parse_film_page(
        _film_html(title="The Killers"),
        film_url="https://thebeacon.film/calendar/movie/the-killers-restored",
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert source_film_id_from_raw(a[0]) != source_film_id_from_raw(b[0])


def test_inventory_id_preserved_as_source_showtime_id():
    records = BeaconAdapter.parse_film_page(
        _film_html(),
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].source_showtime_id == "INV-JUL2"
    assert source_showtime_id_from_raw(records[0]) == "INV-JUL2"
    row = raw_showtime_to_legacy_row(records[0])
    assert row["source_showtime_id"] == "INV-JUL2"


def test_legacy_data_value_is_not_invented_as_showtime_id():
    html = """<!DOCTYPE html><html><head><title>Legacy | The Beacon</title></head>
    <body><h1>Legacy Film</h1>
    <div class="showtime_item transformer showtime_exists" data-value="1">
      Wednesday, July 2 7:00PM
    </div></body></html>"""
    result = parse_beacon_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert len(result.records) == 1
    assert result.records[0].source_showtime_id is None
    assert source_showtime_id_from_raw(result.records[0]) == ""
    assert result.records[0].attributes
    assert result.records[0].attributes.get("beacon_data_value") == "1"


def test_explicit_year_wins():
    html = _film_html(
        showtimes=[("Friday, January 2, 2027 at 7:00 PM", "INV-Y")]
    )
    records = BeaconAdapter.parse_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 12, 20),
        window_end=date(2027, 1, 10),
        scrape_date=date(2026, 12, 28),
    )
    assert records[0].date_raw == "01/02/2027"


def test_same_year_inference():
    html = _film_html(showtimes=[("Thursday, July 2 at 7:00 PM", "INV-S")])
    records = BeaconAdapter.parse_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].date_raw == "07/02/2026"


def test_december_to_january_rollover():
    html = _film_html(showtimes=[("Saturday, January 3 at 7:00 PM", "INV-R")])
    records = BeaconAdapter.parse_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 12, 28),
        window_end=date(2027, 1, 10),
        scrape_date=date(2026, 12, 30),
    )
    assert records[0].date_raw == "01/03/2027"


def test_january_run_with_december_in_window():
    html = _film_html(showtimes=[("Wednesday, December 30 at 7:00 PM", "INV-D")])
    records = BeaconAdapter.parse_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 12, 20),
        window_end=date(2027, 1, 5),
        scrape_date=date(2027, 1, 2),
    )
    assert records[0].date_raw == "12/30/2026"


def test_outside_window_date_skipped_not_guessed():
    html = _film_html(showtimes=[("Wednesday, March 4 at 7:00 PM", "INV-O")])
    result = parse_beacon_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 7, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert result.records == []
    assert result.occurrence_failures == 0
    assert result.out_of_window_count == 1

    pages = {
        BEACON_CALENDAR_URL: '<a href="/calendar/movie/fixture-film">x</a>',
        FILM_URL: html,
    }
    fetch = fetch_beacon_showtimes(
        _context(
            run_date=date(2026, 6, 26),
            window_start=date(2026, 6, 26),
            window_end=date(2026, 7, 31),
        ),
        fetch_text_fn=pages.get,
    )
    assert fetch.records == []
    assert fetch.stats["restate_safe"] is False


def test_ambiguous_date_is_unsafe():
    html = _film_html(showtimes=[("Monday, January 5 at 7:00 PM", "INV-A")])
    result = parse_beacon_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2025, 12, 20),
        window_end=date(2027, 1, 20),
        scrape_date=date(2026, 1, 1),
    )
    assert result.records == []
    assert result.occurrence_failures == 1
    assert any("ambiguous_year" in warning for warning in result.warnings)

    pages = {
        BEACON_CALENDAR_URL: '<a href="/calendar/movie/fixture-film">x</a>',
        FILM_URL: html,
    }
    fetch = fetch_beacon_showtimes(
        _context(
            run_date=date(2026, 1, 1),
            window_start=date(2025, 12, 20),
            window_end=date(2027, 1, 20),
        ),
        fetch_text_fn=pages.get,
    )
    assert fetch.stats["restate_safe"] is False
    assert fetch.records == []


def test_malformed_date_is_unsafe():
    html = _film_html(showtimes=[("Not a real showtime", "INV-M")])
    result = parse_beacon_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert result.records == []
    assert result.occurrence_failures == 1
    assert any("malformed_date" in warning for warning in result.warnings)


def test_raw_date_evidence_preserved():
    records = BeaconAdapter.parse_film_page(
        _film_html(),
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert records[0].attributes
    assert "July 2" in str(records[0].attributes.get("raw_date_text"))


def test_leap_day_resolves_in_leap_year():
    resolved, err = infer_year_for_month_day(
        2,
        29,
        window_start=date(2024, 2, 1),
        window_end=date(2024, 3, 1),
        scrape_date=date(2024, 2, 10),
    )
    assert resolved == date(2024, 2, 29) and err is None


def test_repeated_scrape_preserves_identity(beacon_film_html, beacon_calendar_html):
    pages = {BEACON_CALENDAR_URL: beacon_calendar_html, FILM_URL: beacon_film_html}

    def fake_fetch(url: str) -> str | None:
        return pages.get(url)

    first = fetch_beacon_showtimes(_context(), fetch_text_fn=fake_fetch)
    second = fetch_beacon_showtimes(_context(), fetch_text_fn=fake_fetch)
    assert {source_film_id_from_raw(r) for r in first.records} == {
        source_film_id_from_raw(r) for r in second.records
    }
    assert {r.source_showtime_id for r in first.records} == {
        r.source_showtime_id for r in second.records
    }


def test_canonicalize_strips_showtime_query():
    assert (
        canonicalize_beacon_movie_url(
            "/calendar/movie/welcome-ii-the-terrordome?showtime=ABC123"
        )
        == "https://thebeacon.film/calendar/movie/welcome-ii-the-terrordome"
    )


def test_no_title_derived_or_positional_showtime_id():
    """Missing inventory id must stay null — do not invent from title/position."""
    html = """<!DOCTYPE html><html><body>
    <h1>NO ID FILM</h1>
    <div class="showtime-row">
      <span class="showtime-datetime">Thursday, July 2 at 7:00 PM</span>
      <a href="#" class="buy-btn">Tickets</a>
    </div>
    </body></html>"""
    records = BeaconAdapter.parse_film_page(
        html,
        film_url=FILM_URL,
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 6, 26),
    )
    assert len(records) == 1
    assert records[0].source_showtime_id is None
    assert source_showtime_id_from_raw(records[0]) == ""
