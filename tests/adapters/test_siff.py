"""Tests for the SIFF source adapter (P-20B minimal alignment)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from reel_seattle.adapters.base import FetchContext
from reel_seattle.adapters.indie_completeness import (
    STATUS_PARTIAL_FAILURE,
    STATUS_STRUCTURAL_FAILURE,
    STATUS_SUCCESS,
    STATUS_VALID_EMPTY,
    decide_siff_completeness,
)
from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row
from reel_seattle.adapters.siff import (
    SIFF_BASE_URL,
    SIFF_IN_THEATERS_URL,
    SiffAdapter,
    canonicalize_siff_program_url,
    extract_siff_movie_links,
    fetch_siff_showtimes,
    map_siff_venue_label,
    parse_siff_film_page,
    siff_listing_affirmative_empty,
    siff_listing_structure_present,
    siff_program_path_id,
)
from reel_seattle.source_identity import source_film_id_from_raw, source_showtime_id_from_raw

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"
FILM_URL = f"{SIFF_BASE_URL}/cinema/in-theaters/test-film"
NESTED_URL = f"{SIFF_BASE_URL}/programs-and-events/some-series/example-program"
WINDOW_START = date(2026, 7, 14)
WINDOW_END = date(2027, 7, 14)
SCRAPE = date(2026, 7, 14)


def _ctx(**kwargs: object) -> FetchContext:
    return FetchContext(
        run_date=kwargs.get("run_date", SCRAPE),  # type: ignore[arg-type]
        window_start=kwargs.get("window_start", WINDOW_START),  # type: ignore[arg-type]
        window_end=kwargs.get("window_end", WINDOW_END),  # type: ignore[arg-type]
        theaters_registry={},
        session=object(),  # type: ignore[arg-type]
    )


def _parse(html: str, *, movie_url: str = FILM_URL, **kwargs: object):
    return parse_siff_film_page(
        html,
        movie_url=movie_url,
        window_start=kwargs.get("window_start", WINDOW_START),  # type: ignore[arg-type]
        window_end=kwargs.get("window_end", WINDOW_END),  # type: ignore[arg-type]
        scrape_date=kwargs.get("scrape_date", SCRAPE),  # type: ignore[arg-type]
    )


def _page(
    *,
    title: str = "Fixture SIFF Film",
    date_header: str = "Friday, August 14, 2026",
    venues: list[tuple[str, list[tuple[str, str]]]] | None = None,
    extra_body: str = "",
    head_extra: str = "",
) -> str:
    if venues is None:
        venues = [
            (
                "SIFF Cinema Uptown",
                [("abcUptown5", "5:00 PM"), ("abcUptown730", "7:30 PM")],
            ),
            ("SIFF Cinema Downtown", [("abcDowntown2", "2:00 PM")]),
        ]
    items = []
    for venue, showtimes in venues:
        anchors = []
        for sid, label in showtimes:
            anchors.append(
                f'<a id="screening-{sid}" class="elevent button" '
                f'data-screening=\'{{"ShowtimeId":"{sid}","VenueName":"{venue}"}}\'>'
                f"{label}</a>"
            )
        items.append(
            f'<div class="item small-copy">'
            f'<h4><a href="#"><span class="dark-gray-text">{venue}</span></a></h4>'
            f'{"".join(anchors)}</div>'
        )
    return f"""<!DOCTYPE html><html><head><title>{title} | SIFF</title>{head_extra}</head>
<body>
  <h1>{title}</h1>
  <p class="small"><span>1976</span><span>120 min.</span></p>
  <meta name="film-year" content="1926"/>
  <p>Copyright 1999 Studio. Film released 1984.</p>
  {extra_body}
  <div class="day">
    <p class="h3">{date_header}</p>
    {"".join(items)}
  </div>
</body></html>"""


@pytest.fixture
def siff_film_html() -> str:
    return (FIXTURES_DIR / "siff_film.html").read_text(encoding="utf-8")


@pytest.fixture
def siff_listing_html() -> str:
    return (FIXTURES_DIR / "siff_listing.html").read_text(encoding="utf-8")


# --- Title -----------------------------------------------------------------


def test_h1_preferred_over_document_title():
    html = _page(title="Exact H1 Title: Part II")
    html = html.replace("<title>Exact H1 Title: Part II | SIFF</title>", "<title>Wrong Title</title>")
    result = _parse(html)
    assert result.records[0].title_raw == "Exact H1 Title: Part II"


def test_exact_casing_survives():
    result = _parse(_page(title="WELCOME TO SIFF: AMC &amp; Co."))
    assert result.records[0].title_raw == "WELCOME TO SIFF: AMC & Co."


def test_punctuation_survives():
    result = _parse(_page(title="Who's Afraid of 2001: A Space Odyssey?"))
    assert result.records[0].title_raw == "Who's Afraid of 2001: A Space Odyssey?"


def test_series_event_wording_survives():
    result = _parse(_page(title="SIFF Presents: Midnight Madness (35mm)"))
    assert result.records[0].title_raw == "SIFF Presents: Midnight Madness (35mm)"


def test_year_bearing_title_preserved():
    result = _parse(_page(title="Summer of 1984"))
    assert result.records[0].title_raw == "Summer of 1984"


def test_no_title_case_mutation():
    result = _parse(_page(title="eXistenZ"))
    assert result.records[0].title_raw == "eXistenZ"
    assert result.records[0].title_raw != "Existenz"


def test_missing_title_is_unsafe_occurrence():
    html = _page().replace("<h1>Fixture SIFF Film</h1>", "").replace(
        "<title>Fixture SIFF Film | SIFF</title>", "<title></title>"
    )
    result = _parse(html)
    assert result.records == []
    assert result.occurrence_failures >= 1


# --- Program identity ------------------------------------------------------


def test_canonical_path_maps_to_source_film_id(siff_film_html):
    result = _parse(siff_film_html)
    assert all(
        source_film_id_from_raw(r) == "cinema/in-theaters/test-film" for r in result.records
    )


def test_nested_event_path_intact():
    result = _parse(_page(title="Nested Program"), movie_url=NESTED_URL)
    assert source_film_id_from_raw(result.records[0]) == (
        "programs-and-events/some-series/example-program"
    )


def test_query_fragment_do_not_affect_identity():
    a = siff_program_path_id(f"{FILM_URL}?ref=1#frag")
    b = siff_program_path_id(FILM_URL)
    assert a == b == "cinema/in-theaters/test-film"


def test_title_change_does_not_change_identity():
    a = _parse(_page(title="Title A"))
    b = _parse(_page(title="Title B"))
    assert source_film_id_from_raw(a.records[0]) == source_film_id_from_raw(b.records[0])


def test_similar_titles_distinct_paths_remain_distinct():
    a = _parse(_page(title="Film"), movie_url=f"{SIFF_BASE_URL}/cinema/in-theaters/film-one")
    b = _parse(_page(title="Film"), movie_url=f"{SIFF_BASE_URL}/cinema/in-theaters/film-two")
    assert source_film_id_from_raw(a.records[0]) != source_film_id_from_raw(b.records[0])


def test_multi_venue_program_shares_one_program_id(siff_film_html):
    result = _parse(siff_film_html)
    ids = {source_film_id_from_raw(r) for r in result.records}
    venues = {r.theater_name_raw for r in result.records}
    assert ids == {"cinema/in-theaters/test-film"}
    assert venues == {"SIFF Cinema Uptown", "SIFF Cinema Downtown"}


# --- Showtime identity -----------------------------------------------------


def test_data_screening_maps_to_source_showtime_id(siff_film_html):
    result = _parse(siff_film_html)
    ids = {source_showtime_id_from_raw(r) for r in result.records}
    assert "abcUptown5" in ids
    assert all(r.source_showtime_id for r in result.records)


def test_screening_element_id_alone():
    html = _page(venues=[("SIFF Cinema Uptown", [("onlyFromId", "6:00 PM")])])
    html = html.replace('data-screening=\'{"ShowtimeId":"onlyFromId","VenueName":"SIFF Cinema Uptown"}\'', "")
    result = _parse(html)
    assert result.records[0].source_showtime_id == "onlyFromId"


def test_matching_dual_id_evidence_accepted():
    result = _parse(_page())
    assert result.occurrence_failures == 0
    assert all(r.source_showtime_id for r in result.records)


def test_conflicting_dual_id_evidence_unsafe():
    html = _page(venues=[("SIFF Cinema Uptown", [("idA", "5:00 PM")])])
    html = html.replace(
        'data-screening=\'{"ShowtimeId":"idA","VenueName":"SIFF Cinema Uptown"}\'',
        'data-screening=\'{"ShowtimeId":"idB","VenueName":"SIFF Cinema Uptown"}\'',
    )
    result = _parse(html)
    assert result.records == []
    assert result.occurrence_failures >= 1
    assert any("identity conflict" in w for w in result.warnings)


def test_missing_showtime_id_remains_null():
    html = """<!DOCTYPE html><html><body><h1>No ID Film</h1>
    <div class="day"><p class="h3">Friday, August 14, 2026</p>
    <div class="item small-copy">
      <h4><a href="#"><span class="dark-gray-text">SIFF Cinema Uptown</span></a></h4>
      <a class="elevent button" href="#">5:00 PM</a>
    </div></div></body></html>"""
    # Anchor without screening id or data-screening is ignored by selector; use empty ids:
    html = """<!DOCTYPE html><html><body><h1>No ID Film</h1>
    <div class="day"><p class="h3">Friday, August 14, 2026</p>
    <div class="item small-copy">
      <h4><a href="#"><span class="dark-gray-text">SIFF Cinema Uptown</span></a></h4>
      <a id="screening-" class="elevent button" data-screening='{}'>5:00 PM</a>
    </div></div></body></html>"""
    result = _parse(html)
    assert len(result.records) == 1
    assert result.records[0].source_showtime_id is None
    assert source_showtime_id_from_raw(result.records[0]) == ""


def test_no_synthetic_showtime_id_fallback():
    html = """<!DOCTYPE html><html><body><h1>No ID Film</h1>
    <div class="day"><p class="h3">Friday, August 14, 2026</p>
    <div class="item small-copy">
      <h4><a href="#"><span class="dark-gray-text">SIFF Film Center</span></a></h4>
      <a id="screening-" class="elevent button" data-screening='{"EventName":"x"}'>8:00 PM</a>
    </div></div></body></html>"""
    result = _parse(html)
    assert result.records[0].source_showtime_id is None
    assert "source_showtime_id" not in (result.records[0].attributes or {})


def test_identical_duplicate_deduplicates():
    html = _page(venues=[("SIFF Cinema Uptown", [("dup1", "5:00 PM"), ("dup1", "5:00 PM")])])
    result = _parse(html)
    assert len(result.records) == 1
    assert result.occurrence_failures == 0


def test_same_time_distinct_ids_remain_distinct():
    html = _page(
        venues=[
            (
                "SIFF Cinema Uptown",
                [("id1", "5:00 PM"), ("id2", "5:00 PM")],
            )
        ]
    )
    result = _parse(html)
    assert len(result.records) == 2
    assert {r.source_showtime_id for r in result.records} == {"id1", "id2"}


def test_multi_venue_showtimes_remain_distinct(siff_film_html):
    result = _parse(siff_film_html)
    assert len(result.records) == 3
    assert len({r.source_showtime_id for r in result.records}) == 3


# --- Date / year -----------------------------------------------------------


def test_explicit_header_year_wins():
    result = _parse(_page(date_header="Saturday, January 10, 2027"))
    assert result.records[0].date_raw == "01/10/2027"
    assert result.records[0].attributes["year_inferred"] is False


def test_page_wide_release_year_ignored():
    # Page contains 1976/1926/1999/1984; header has no year → infer from window.
    result = _parse(_page(date_header="Friday, August 14"))
    assert result.records[0].date_raw == "08/14/2026"
    assert result.records[0].attributes["year_inferred"] is True


def test_same_year_inference():
    result = _parse(
        _page(date_header="Monday, September 14"),
        window_start=date(2026, 7, 14),
        window_end=date(2026, 12, 31),
        scrape_date=date(2026, 7, 14),
    )
    assert result.records[0].date_raw == "09/14/2026"


def test_december_january_rollover():
    result = _parse(
        _page(date_header="Friday, January 8"),
        window_start=date(2026, 12, 20),
        window_end=date(2027, 1, 20),
        scrape_date=date(2026, 12, 20),
    )
    assert result.records[0].date_raw == "01/08/2027"


def test_anniversary_ambiguity_prefers_scrape_date():
    result = _parse(
        _page(date_header="Tuesday, July 14"),
        window_start=date(2026, 7, 14),
        window_end=date(2027, 7, 14),
        scrape_date=date(2026, 7, 14),
    )
    assert result.records[0].date_raw == "07/14/2026"


def test_outside_window_date_unsafe():
    result = _parse(
        _page(date_header="Monday, January 5, 2026"),
        window_start=date(2026, 7, 14),
        window_end=date(2027, 7, 14),
        scrape_date=date(2026, 7, 14),
    )
    assert result.records == []
    assert result.occurrence_failures >= 1


def test_malformed_date_unsafe():
    result = _parse(_page(date_header="Not a real date"))
    assert result.records == []
    assert result.occurrence_failures >= 1
    assert any("date parse failed" in w for w in result.warnings)


def test_raw_date_evidence_retained():
    result = _parse(_page(date_header="Friday, August 14, 2026"))
    assert result.records[0].attributes["raw_date_text"] == "Friday, August 14, 2026"


# --- Venue -----------------------------------------------------------------


def test_downtown_maps():
    assert map_siff_venue_label("SIFF Cinema Downtown") == "SIFF Cinema Downtown"


def test_uptown_maps_with_house_suffix():
    assert map_siff_venue_label("SIFF Cinema Uptown House 1") == "SIFF Cinema Uptown"


def test_film_center_maps():
    assert map_siff_venue_label("SIFF Film Center") == "SIFF Film Center"
    result = _parse(
        _page(venues=[("SIFF Film Center", [("fc1", "7:00 PM")])]),
    )
    assert result.records[0].theater_name_raw == "SIFF Film Center"
    assert result.records[0].attributes["theater_id"] == "siff-film-center"


def test_unknown_venue_rejects():
    result = _parse(_page(venues=[("Paramount Theatre", [("x1", "5:00 PM")])]))
    assert result.records == []
    assert result.occurrence_failures >= 1


def test_offsite_venue_rejects():
    result = _parse(_page(venues=[("SIFF at the Egyptian", [("x1", "5:00 PM")])]))
    assert result.records == []
    assert result.occurrence_failures >= 1


def test_missing_venue_does_not_default():
    html = """<!DOCTYPE html><html><body><h1>No Venue</h1>
    <div class="day"><p class="h3">Friday, August 14, 2026</p>
    <div class="item small-copy">
      <a id="screening-nv1" class="elevent button"
         data-screening='{"ShowtimeId":"nv1"}'>5:00 PM</a>
    </div></div></body></html>"""
    result = _parse(html)
    assert result.records == []
    assert result.occurrence_failures >= 1


def test_venue_rejection_affects_fetch_safety(siff_listing_html):
    bad = _page(venues=[("Unknown House", [("b1", "5:00 PM")])])
    pages = {
        SIFF_IN_THEATERS_URL: siff_listing_html,
        FILM_URL: bad,
        f"{SIFF_BASE_URL}/programs-and-events/special-event": bad,
    }
    result = fetch_siff_showtimes(_ctx(), fetch_text_fn=pages.get, current_year=2026)
    assert result.stats["restate_safe"] is False


# --- Completeness / valid empty --------------------------------------------


def test_affirmative_empty_listing_may_be_safe():
    listing = (
        '<html><body><div class="cinema">SIFF Cinema</div>'
        "<p>There are no films currently scheduled.</p></body></html>"
    )
    assert siff_listing_affirmative_empty(listing)
    result = fetch_siff_showtimes(
        _ctx(),
        fetch_text_fn=lambda url: listing if url == SIFF_IN_THEATERS_URL else None,
    )
    assert result.stats["restate_safe"] is True
    assert result.stats["scrape_status"] == STATUS_VALID_EMPTY


def test_zero_discovered_without_proof_is_unsafe():
    listing = '<html><body><div class="cinema in-theaters">SIFF Cinema</div></body></html>'
    assert siff_listing_structure_present(listing)
    assert not siff_listing_affirmative_empty(listing)
    result = fetch_siff_showtimes(
        _ctx(),
        fetch_text_fn=lambda url: listing if url == SIFF_IN_THEATERS_URL else None,
    )
    assert result.stats["restate_safe"] is False
    assert result.stats["scrape_status"] == STATUS_STRUCTURAL_FAILURE


def test_decide_siff_zero_without_affirmative_proof_unsafe():
    stats, warnings = decide_siff_completeness(
        discovery_ok=True,
        expected_structure_present=True,
        discovered_programs=0,
        program_pages_succeeded=0,
        program_pages_failed=0,
        record_count=0,
        affirmative_empty_proof=False,
    )
    assert stats["restate_safe"] is False
    assert stats["scrape_status"] == STATUS_STRUCTURAL_FAILURE
    assert any("affirmative empty proof" in w for w in warnings)


def test_listing_structural_drift_unsafe():
    result = fetch_siff_showtimes(
        _ctx(),
        fetch_text_fn=lambda url: "<html><body>unrelated</body></html>"
        if url == SIFF_IN_THEATERS_URL
        else None,
    )
    assert result.stats["restate_safe"] is False
    assert result.stats["scrape_status"] == STATUS_STRUCTURAL_FAILURE


def test_one_failed_program_page_unsafe(siff_listing_html, siff_film_html):
    pages = {
        SIFF_IN_THEATERS_URL: siff_listing_html,
        FILM_URL: siff_film_html,
        f"{SIFF_BASE_URL}/programs-and-events/special-event": None,
    }
    result = fetch_siff_showtimes(_ctx(), fetch_text_fn=pages.get)
    assert result.stats["restate_safe"] is False
    assert result.stats["scrape_status"] == STATUS_PARTIAL_FAILURE


def test_parent_event_page_classified_safely():
    html = "<html><body><h1>Parent Series</h1><p>Overview only</p></body></html>"
    result = _parse(html, movie_url=NESTED_URL)
    assert result.page_kind == "parent_event"
    assert result.occurrence_failures == 0
    assert result.records == []


def test_malformed_screening_page_unsafe():
    html = _page(date_header="@@@ not a date")
    result = _parse(html)
    assert result.occurrence_failures >= 1


def test_optional_metadata_omission_remains_safe():
    html = _page().replace('<p class="small"><span>1976</span><span>120 min.</span></p>', "")
    result = _parse(html)
    assert result.occurrence_failures == 0
    assert result.records[0].runtime_raw == "Unknown"
    assert result.records[0].poster_url_raw is None


def test_fetch_complete_is_restate_safe(siff_listing_html, siff_film_html):
    pages = {
        SIFF_IN_THEATERS_URL: siff_listing_html,
        FILM_URL: siff_film_html,
        f"{SIFF_BASE_URL}/programs-and-events/special-event": siff_film_html,
    }
    result = fetch_siff_showtimes(_ctx(), fetch_text_fn=pages.get)
    assert result.stats["restate_safe"] is True
    assert result.stats["scrape_status"] == STATUS_SUCCESS


def test_valid_empty_when_all_discovered_pages_empty(siff_listing_html):
    empty = "<html><body><h1>Empty Film</h1></body></html>"
    parent = "<html><body><h1>Parent</h1><p>series</p></body></html>"
    pages = {
        SIFF_IN_THEATERS_URL: siff_listing_html,
        FILM_URL: empty,
        f"{SIFF_BASE_URL}/programs-and-events/special-event": parent,
    }
    result = fetch_siff_showtimes(_ctx(), fetch_text_fn=pages.get)
    assert result.stats["restate_safe"] is True
    assert result.stats["scrape_status"] == STATUS_VALID_EMPTY
    assert result.stats["valid_empty_proof"] is True


# --- History / public compatibility ----------------------------------------


def test_legacy_row_receives_source_film_and_showtime_ids(siff_film_html):
    record = _parse(siff_film_html).records[0]
    row = raw_showtime_to_legacy_row(record)
    assert row["source_film_id"] == "cinema/in-theaters/test-film"
    assert row["source_showtime_id"]
    assert row["source_title"] == "Fixture SIFF Film"
    assert row["Film"] == "Fixture SIFF Film"


def test_missing_showtime_id_stays_null_in_legacy():
    html = """<!DOCTYPE html><html><body><h1>No ID</h1>
    <div class="day"><p class="h3">Friday, August 14, 2026</p>
    <div class="item small-copy">
      <h4><a href="#"><span class="dark-gray-text">SIFF Cinema Downtown</span></a></h4>
      <a id="screening-" class="elevent button" data-screening='{}'>3:00 PM</a>
    </div></div></body></html>"""
    row = raw_showtime_to_legacy_row(_parse(html).records[0])
    assert row["source_showtime_id"] == ""


def test_same_program_across_venues_not_collapsed(siff_film_html):
    records = _parse(siff_film_html).records
    assert len(records) == 3
    assert len({(r.theater_name_raw, r.time_raw) for r in records}) == 3


def test_repeated_parse_stable_ids(siff_film_html):
    a = {(r.source_showtime_id, source_film_id_from_raw(r)) for r in _parse(siff_film_html).records}
    b = {(r.source_showtime_id, source_film_id_from_raw(r)) for r in _parse(siff_film_html).records}
    assert a == b


def test_canonicalize_trailing_slash():
    assert canonicalize_siff_program_url(f"{FILM_URL}/") == FILM_URL


def test_extract_siff_movie_links(siff_listing_html):
    links = extract_siff_movie_links(siff_listing_html)
    assert links == {
        f"{SIFF_BASE_URL}/cinema/in-theaters/test-film",
        f"{SIFF_BASE_URL}/programs-and-events/special-event",
    }


def test_siff_time_format_preserved_in_legacy_csv(siff_film_html):
    records = _parse(siff_film_html).records
    uptown = next(record for record in records if record.time_raw == "5:00 PM")
    row = raw_showtime_to_legacy_row(uptown)
    assert row["Time"] == "5:00 PM"


def test_siff_runtime_and_poster(siff_film_html):
    record = _parse(siff_film_html).records[0]
    assert record.runtime_raw == "120"
    assert record.poster_url_raw == f"{SIFF_BASE_URL}/images/fixture-poster.jpg"


def test_adapter_class_parse_film_page_returns_list(siff_film_html):
    records = SiffAdapter.parse_film_page(
        siff_film_html,
        movie_url=FILM_URL,
        window_start=WINDOW_START,
        window_end=WINDOW_END,
        scrape_date=SCRAPE,
    )
    assert isinstance(records, list)
    assert records
