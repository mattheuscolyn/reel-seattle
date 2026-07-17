"""Tests for Central Cinema independent-source prototype (non-production)."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from reel_seattle.ingestion.independent_contract import (
    PLANNED_FIXTURE_THEATER_IDS,
    assert_valid_independent_source_result,
    fixture_theater_ids,
    serialize_independent_source_result,
)
from reel_seattle.prototypes.central_cinema import (
    PLANNED_THEATER_ID,
    SOURCE,
    FetchResponse,
    build_central_cinema_result,
    calendar_structure_present,
    canonical_movie_url,
    discover_movie_links,
    fixture_fetch_map,
    infer_year_for_month_day,
    movie_slug_from_url,
    parse_local_time,
    parse_schema_duration,
    parse_showing_display_text,
)
from tests.prototypes.central_cinema_html import calendar_shell, movie_link, movie_page

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "prototypes" / "central_cinema"
SCRAPED_AT = "2026-12-30T12:00:00-08:00"
WINDOW_START = date(2026, 12, 28)
WINDOW_END = date(2027, 1, 10)


def _validate(result: dict) -> None:
    theater_ids = fixture_theater_ids(include_planned=True) | set(PLANNED_FIXTURE_THEATER_IDS)
    assert_valid_independent_source_result(result, theater_ids=theater_ids)


def _pages_from_manifest() -> dict[str, str]:
    mapping = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    return {
        url: (FIXTURE_DIR / filename).read_text(encoding="utf-8")
        for url, filename in mapping.items()
    }


def _fetch_with_overrides(
    pages: dict[str, str],
    *,
    fail_urls: set[str] | None = None,
    fail_status: int = 500,
    replace: dict[str, str] | None = None,
):
    merged = dict(pages)
    if replace:
        merged.update(replace)
    base = fixture_fetch_map(merged)
    fail_urls = fail_urls or set()

    def _fetch(url: str) -> FetchResponse:
        for failed in fail_urls:
            if url == failed or url.rstrip("/") == failed.rstrip("/"):
                return FetchResponse(url=url, status_code=fail_status, text=None)
        return base(url)

    return _fetch


def test_canonical_slug_identity_and_normalization():
    a = canonical_movie_url("http://WWW.CENTRAL-CINEMA.COM/movie/faceslashoff/?x=1#frag")
    b = canonical_movie_url("https://central-cinema.com/movie/faceslashoff")
    assert a == b == "https://central-cinema.com/movie/faceslashoff/"
    assert movie_slug_from_url(a) == "faceslashoff"
    assert canonical_movie_url("/about/") is None
    assert canonical_movie_url("/movie/") is None


def test_title_is_not_identity():
    html = calendar_shell(
        body=movie_link("Some Normalized Title", "/movie/faceslashoff/")
        + movie_link("Ignored", "/events/party/")
    )
    links, _ = discover_movie_links(html, calendar_page_url="https://central-cinema.com/calendar/")
    assert len(links) == 1
    assert links[0].slug == "faceslashoff"
    assert links[0].slug != "some-normalized-title"


def test_duplicate_www_links_fetch_once():
    pages = _pages_from_manifest()
    fetch = fixture_fetch_map(pages)
    counts: dict[str, int] = {}

    def counting(url: str) -> FetchResponse:
        counts[url] = counts.get(url, 0) + 1
        return fetch(url)

    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=counting,
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    movie_fetches = {u: n for u, n in counts.items() if "/movie/" in u}
    assert movie_fetches
    assert all(n == 1 for n in movie_fetches.values())
    assert len(result["programs"]) == 2


def test_fixture_success_rollover_and_showing_ids():
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(_pages_from_manifest()),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    assert result["source"] == SOURCE
    assert result["status"] == "success"
    assert result["restate_safe"] is True
    assert result["identity"]["showtime_strategy"] == "source_showing_id"
    assert result["identity"]["program_strategy"] == "canonical_url_slug"
    ids = {row["source_showtime_id"] for row in result["showtimes"]}
    assert "3387540" in ids
    assert "3341684" in ids
    assert "3427787" in ids
    assert len(result["showtimes"]) == 3  # duplicate checkout deduped
    face = next(p for p in result["programs"] if p["source_program_id"] == "faceslashoff")
    assert face["source_title"] == "Face/Off"
    assert face["raw"]["dateCreated"] == "2026-07-10"
    assert face["raw"]["release_year"] is None
    assert face["raw"]["runtime_min"] == 139
    assert "Hecklevision" in (face["raw"].get("description_text") or "")
    assert all(row["theater_id"] == PLANNED_THEATER_ID for row in result["showtimes"])
    blob = serialize_independent_source_result(result)
    assert "<html" not in blob.casefold()
    assert serialize_independent_source_result(result) == blob


def test_date_created_not_release_year_even_with_copyright():
    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(
            body=movie_link("Face/Off", "/movie/faceslashoff/")
        ),
        "https://central-cinema.com/movie/faceslashoff/": movie_page(
            name="Face/Off",
            date_created="2026-07-10",
            copyright_year="1997",
            checkouts=[
                (
                    "January 3, 7:00 pm",
                    "https://www.central-cinema.com/checkout/showing/faceslashoff/1",
                )
            ],
        ),
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    program = result["programs"][0]
    assert program["raw"]["dateCreated"] == "2026-07-10"
    assert program["raw"]["release_year"] == 1997
    assert program["raw"]["schema_org"]["dateCreated"] == "2026-07-10"


def test_description_entities_and_paragraphs():
    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(
            body=movie_link("Cartoon Happy Hour", "/movie/cartoon-happy-hour/")
        ),
        "https://central-cinema.com/movie/cartoon-happy-hour/": movie_page(
            name="Cartoon Happy Hour",
            description_html="<p>Shorts&nbsp;program.</p><p>Second&amp; third.</p>",
            checkouts=[
                (
                    "January 5, 5:00 pm",
                    "https://www.central-cinema.com/checkout/showing/cartoon-happy-hour/9",
                )
            ],
        ),
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    paragraphs = result["programs"][0]["raw"]["description_paragraphs"]
    assert paragraphs[0] == "Shorts program."
    assert "Second& third." in paragraphs[1] or "Second&amp; third." not in paragraphs[1]
    assert "&amp;" not in " ".join(paragraphs)


def test_duration_variants():
    assert parse_schema_duration("PT2H18M") == (138, None)
    assert parse_schema_duration("PT138M") == (138, None)
    assert parse_schema_duration("138 minutes") == (138, None)
    assert parse_schema_duration("nope") == (None, "malformed_duration")
    assert parse_schema_duration(None) == (None, None)


def test_year_inference_rollover_and_ambiguous():
    resolved, err = infer_year_for_month_day(
        1,
        3,
        window_start=date(2026, 12, 28),
        window_end=date(2027, 1, 10),
        scrape_date=date(2026, 12, 30),
    )
    assert resolved == date(2027, 1, 3) and err is None

    resolved, err = infer_year_for_month_day(
        7,
        15,
        window_start=date(2026, 7, 1),
        window_end=date(2026, 7, 31),
        scrape_date=date(2026, 7, 16),
    )
    assert resolved == date(2026, 7, 15) and err is None

    # Ambiguous: same month/day falls in window for two years.
    resolved, err = infer_year_for_month_day(
        1,
        5,
        window_start=date(2025, 12, 20),
        window_end=date(2027, 1, 20),
        scrape_date=date(2026, 1, 1),
    )
    assert resolved is None and err == "ambiguous_year"


def test_time_parsing_variants():
    assert parse_local_time("9:30 pm") == "21:30"
    assert parse_local_time("9.30pm") == "21:30"
    assert parse_local_time("noon") == "12:00"
    assert parse_local_time("midnight") == "00:00"
    assert parse_local_time("25:00 pm") is None
    assert parse_local_time("banana") is None


def test_explicit_year_and_outside_window():
    local_date, local_time, inferred, err = parse_showing_display_text(
        "July 15, 2026, 9:30 pm",
        window_start=date(2026, 7, 1),
        window_end=date(2026, 7, 31),
        scrape_date=date(2026, 7, 10),
    )
    assert local_date == date(2026, 7, 15)
    assert local_time == "21:30"
    assert inferred is False
    assert err is None

    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(
            body=movie_link("Face/Off", "/movie/faceslashoff/")
        ),
        "https://central-cinema.com/movie/faceslashoff/": movie_page(
            name="Face/Off",
            checkouts=[
                (
                    "March 1, 2025, 7:00 pm",
                    "https://www.central-cinema.com/checkout/showing/faceslashoff/99",
                )
            ],
        ),
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    assert result["showtimes"] == []
    assert result["status"] == "valid_empty"
    assert result["restate_safe"] is True


def test_malformed_time_is_unsafe():
    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(
            body=movie_link("Face/Off", "/movie/faceslashoff/")
        ),
        "https://central-cinema.com/movie/faceslashoff/": movie_page(
            name="Face/Off",
            checkouts=[
                (
                    "January 3, not-a-time",
                    "https://www.central-cinema.com/checkout/showing/faceslashoff/1",
                )
            ],
        ),
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    assert result["restate_safe"] is False
    assert result["status"] == "partial_failure"
    assert any(r["affects_completeness"] for r in result["rejected_observations"])


def test_conflicting_showing_id_unsafe():
    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(
            body=movie_link("A", "/movie/a/") + movie_link("B", "/movie/b/")
        ),
        "https://central-cinema.com/movie/a/": movie_page(
            name="A",
            checkouts=[
                ("January 3, 7:00 pm", "https://www.central-cinema.com/checkout/showing/a/100")
            ],
        ),
        "https://central-cinema.com/movie/b/": movie_page(
            name="B",
            checkouts=[
                ("January 4, 8:00 pm", "https://www.central-cinema.com/checkout/showing/b/100")
            ],
        ),
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    assert result["restate_safe"] is False
    assert any(r["code"] == "conflicting_showing_id" for r in result["rejected_observations"])


def test_movie_page_failure_partial_unsafe():
    pages = _pages_from_manifest()
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=_fetch_with_overrides(
            pages,
            fail_urls={"https://central-cinema.com/movie/faceslashoff/"},
        ),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    assert result["status"] == "partial_failure"
    assert result["restate_safe"] is False
    assert result["stats"]["program_pages_failed"] >= 1
    # Other movie may still contribute showtimes for diagnosis.
    assert any(p["source_program_id"] == "cartoon-happy-hour" for p in result["programs"])


def test_missing_schema_structural_unsafe():
    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(
            body=movie_link("Broken", "/movie/broken/")
        ),
        "https://central-cinema.com/movie/broken/": movie_page(
            name="Broken",
            include_schema=False,
            checkouts=[],
        ),
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        scrape_date=date(2026, 12, 30),
    )
    _validate(result)
    assert result["status"] == "structural_failure"
    assert result["restate_safe"] is False


def test_request_failure():
    def fail(_url: str) -> FetchResponse:
        return FetchResponse(url=_url, status_code=0, text=None)

    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fail,
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "request_failure"
    assert result["restate_safe"] is False


def test_missing_calendar_structure_unsafe():
    pages = {"https://central-cinema.com/calendar/": "<html><body><p>Nope</p></body></html>"}
    assert calendar_structure_present(pages["https://central-cinema.com/calendar/"]) is False
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "structural_failure"


def test_valid_empty_requires_inspected_pages_with_no_in_window_showtimes():
    """Valid empty = structure + movie page(s) inspected + zero accepted showtimes."""
    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(
            body=movie_link("Face/Off", "/movie/faceslashoff/")
        ),
        "https://central-cinema.com/movie/faceslashoff/": movie_page(
            name="Face/Off",
            checkouts=[
                (
                    "July 3, 7:00 pm",
                    "https://www.central-cinema.com/checkout/showing/faceslashoff/1",
                )
            ],
        ),
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "valid_empty"
    assert result["restate_safe"] is True
    assert result["showtimes"] == []
    assert result["valid_empty_evidence"]["proven"] is True


def test_zero_movie_links_is_structural_failure():
    pages = {
        "https://central-cinema.com/calendar/": calendar_shell(body="<p>No movies this week.</p>")
    }
    result = build_central_cinema_result(
        start_date=WINDOW_START,
        end_date=WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "structural_failure"
    assert result["restate_safe"] is False
    assert result["valid_empty_evidence"]["proven"] is False

def test_cli_fixture_mode_no_network(tmp_path):
    from scripts.prototype_central_cinema_ingestion import main

    code = main(
        [
            "--start-date",
            "2026-12-28",
            "--end-date",
            "2027-01-10",
            "--fixture-dir",
            str(FIXTURE_DIR),
            "--output-dir",
            str(tmp_path),
            "--scraped-at",
            SCRAPED_AT,
        ]
    )
    assert code == 0
    result_path = tmp_path / "central_cinema_independent_source_result.json"
    summary_path = tmp_path / "central_cinema_prototype_summary.json"
    assert result_path.is_file()
    assert summary_path.is_file()
    payload = json.loads(result_path.read_text(encoding="utf-8"))
    assert payload["source"] == SOURCE
    assert payload["restate_safe"] is True
