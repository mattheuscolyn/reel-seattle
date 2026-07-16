"""Tests for Northwest Film Forum independent-source prototype (non-production)."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import pytest

from reel_seattle.ingestion.independent_contract import (
    PLANNED_FIXTURE_THEATER_IDS,
    assert_valid_independent_source_result,
    fixture_theater_ids,
    serialize_independent_source_result,
)
from reel_seattle.prototypes.nwff import (
    FetchResponse,
    PLANNED_THEATER_ID,
    SOURCE,
    build_nwff_result,
    calendar_url_for_start,
    canonical_film_url,
    extract_calendar_occurrences,
    film_slug_from_url,
    fixture_fetch_map,
    parse_detail_schedule_prose,
    sanitize_description_html,
)
from tests.prototypes.nwff_html import calendar_shell, film_item, program_page, workshop_item

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "adapters" / "nwff"
SCRAPED_AT = "2026-07-15T12:00:00-07:00"


def _validate(result: dict) -> None:
    theater_ids = fixture_theater_ids(include_planned=True) | set(PLANNED_FIXTURE_THEATER_IDS)
    assert_valid_independent_source_result(result, theater_ids=theater_ids)


def _pages_from_manifest() -> dict[str, str]:
    mapping = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    return {url: (FIXTURE_DIR / filename).read_text(encoding="utf-8") for url, filename in mapping.items()}


def _fetch_with_overrides(
    pages: dict[str, str],
    *,
    fail_urls: set[str] | None = None,
    fail_status: int = 500,
) -> callable:
    base = fixture_fetch_map(pages)
    fail_urls = fail_urls or set()

    def _fetch(url: str) -> FetchResponse:
        if url in fail_urls or any(url.startswith(u.rstrip("/") ) and u in fail_urls for u in fail_urls):
            for failed in fail_urls:
                if url == failed or url.rstrip("/") == failed.rstrip("/"):
                    return FetchResponse(url=url, status_code=fail_status, text=None)
        return base(url)

    return _fetch


def test_canonical_slug_identity_and_normalization():
    a = canonical_film_url("http://NWFILMFORUM.ORG/films/asco-without-permission/?x=1#frag")
    b = canonical_film_url("https://nwfilmforum.org/films/asco-without-permission")
    assert a == b == "https://nwfilmforum.org/films/asco-without-permission/"
    assert film_slug_from_url(a) == "asco-without-permission"
    assert canonical_film_url("/education/workshops/x/") is None
    assert canonical_film_url("/films/") is None


def test_exact_title_preservation_and_not_used_as_id():
    html = calendar_shell(
        heading="Jul 14 - 20",
        body=film_item(
            title="Staff Selects - ASCO: Without Permission",
            href="/films/asco-without-permission/",
            start_iso="2026-07-18T19:00:00",
        ),
    )
    occs, _, _ = extract_calendar_occurrences(
        html, calendar_page_url="https://nwfilmforum.org/calendar/?start=2026-07-14", year_hint=2026
    )
    assert occs[0].source_title == "Staff Selects - ASCO: Without Permission"
    assert film_slug_from_url(occs[0].program_url) == "asco-without-permission"


def test_description_sanitization_preserves_boundaries():
    paragraphs = sanitize_description_html(
        "<div><p>First&nbsp;line</p><p>Second<br/>continues with <b>bold</b>.</p></div>"
    )
    assert paragraphs[0] == "First line"
    assert "Second" in paragraphs[1]
    assert "continues" in paragraphs[1]
    assert "<b>" not in "".join(paragraphs)
    assert "bold" in paragraphs[1]


def test_detail_prose_schedule_parse():
    slots = parse_detail_schedule_prose("Sat Jul 18: 3.30pm PDT, 5.30pm PDT, 7.30pm PDT", year_hint=2026)
    assert slots == [
        (date(2026, 7, 18), "15:30"),
        (date(2026, 7, 18), "17:30"),
        (date(2026, 7, 18), "19:30"),
    ]


def test_single_page_window_success():
    pages = _pages_from_manifest()
    # Only first week needed for Jul 14-20.
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "success"
    assert result["restate_safe"] is True
    assert result["source"] == SOURCE
    assert result["inspected_window"]["complete"] is True
    # 3 ASCO + 1 shorts; workshop rejected
    assert result["stats"]["accepted_showtimes"] == 4
    assert result["stats"]["unique_programs"] == 2
    assert any(r["code"] == "non_film_category" for r in result["rejected_observations"])
    titles = {s["source_title"] for s in result["showtimes"]}
    assert "Staff Selects - ASCO: Without Permission" in titles
    assert all(s["timezone"] == "America/Los_Angeles" for s in result["showtimes"])
    assert all(s["theater_id"] == PLANNED_THEATER_ID for s in result["showtimes"])
    assert all(s["source_showtime_id"] is None for s in result["showtimes"])


def test_multi_page_traversal_and_overlap_dedupe():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 27),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "partial_failure"  # offsite location affects completeness
    assert result["restate_safe"] is False
    # ASCO 3 times + shorts + night; offsite rejected; workshop rejected; overlap deduped
    assert result["stats"]["accepted_showtimes"] == 5
    asco_times = [
        s["local_time"]
        for s in result["showtimes"]
        if s["source_program_id"] == "asco-without-permission"
    ]
    assert sorted(asco_times) == ["15:30", "17:30", "19:30"]
    assert any(r["code"] == "unknown_location" for r in result["rejected_observations"])


def test_missing_required_calendar_page_unsafe():
    pages = _pages_from_manifest()
    fail = {calendar_url_for_start(date(2026, 7, 21))}
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 27),
        fetch=_fetch_with_overrides(pages, fail_urls=fail),
        scraped_at=SCRAPED_AT,
    )
    assert result["status"] == "partial_failure"
    assert result["restate_safe"] is False
    assert result["inspected_window"]["complete"] is False


def test_first_request_failure():
    def fetch(_url: str) -> FetchResponse:
        return FetchResponse(url=_url, status_code=0, text=None)

    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fetch,
        scraped_at=SCRAPED_AT,
    )
    assert result["status"] == "request_failure"
    assert result["restate_safe"] is False


def test_structural_calendar_failure():
    url = calendar_url_for_start(date(2026, 7, 14))
    pages = {url: (FIXTURE_DIR / "calendar_bad_structure.html").read_text(encoding="utf-8")}
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert result["status"] == "structural_failure"
    assert result["restate_safe"] is False


def test_valid_empty_requires_proof():
    url = calendar_url_for_start(date(2026, 7, 28))
    pages = {url: (FIXTURE_DIR / "calendar_2026-07-28.html").read_text(encoding="utf-8")}
    result = build_nwff_result(
        start_date=date(2026, 7, 28),
        end_date=date(2026, 8, 2),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "valid_empty"
    assert result["restate_safe"] is True
    assert result["valid_empty_evidence"]["proven"] is True
    assert result["showtimes"] == []


def test_program_page_fetched_once():
    pages = _pages_from_manifest()
    counts: dict[str, int] = {}

    def fetch(url: str) -> FetchResponse:
        counts[url] = counts.get(url, 0) + 1
        return fixture_fetch_map(pages)(url)

    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fetch,
        scraped_at=SCRAPED_AT,
    )
    film_fetches = {
        u: n for u, n in counts.items() if "/films/" in u
    }
    assert film_fetches
    assert all(n == 1 for n in film_fetches.values())
    assert result["stats"]["program_pages_attempted"] == len(film_fetches)


def test_detail_schedule_exact_match_no_mismatch_warning():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    codes = {w["code"] for w in result["warnings"] if w.get("source_program_id") == "asco-without-permission"}
    assert "detail_schedule_has_additional" not in codes
    assert "calendar_schedule_has_additional" not in codes


def test_detail_additional_time_warns_without_adding_showtime():
    pages = _pages_from_manifest()
    pages["https://nwfilmforum.org/films/asco-without-permission/"] = (
        FIXTURE_DIR / "film_asco_mismatch.html"
    ).read_text(encoding="utf-8")
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    asco = [s for s in result["showtimes"] if s["source_program_id"] == "asco-without-permission"]
    assert len(asco) == 3
    assert not any(s["local_time"] == "21:00" for s in asco)
    assert any(w["code"] == "detail_schedule_has_additional" for w in result["warnings"])


def test_calendar_additional_and_missing_detail_schedule():
    pages = _pages_from_manifest()
    pages["https://nwfilmforum.org/films/asco-without-permission/"] = (
        FIXTURE_DIR / "film_asco_missing_schedule.html"
    ).read_text(encoding="utf-8")
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert any(w["code"] == "detail_schedule_missing" for w in result["warnings"])
    assert result["status"] == "success"


def test_program_page_failure_partial():
    pages = _pages_from_manifest()
    fail = {"https://nwfilmforum.org/films/asco-without-permission/"}
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=_fetch_with_overrides(pages, fail_urls=fail),
        scraped_at=SCRAPED_AT,
    )
    assert result["status"] == "partial_failure"
    assert result["restate_safe"] is False


def test_title_mismatch_warning_preserves_both():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert any(w["code"] == "calendar_program_title_mismatch" for w in result["warnings"])
    asco_program = next(p for p in result["programs"] if p["source_program_id"] == "asco-without-permission")
    assert asco_program["source_title"] == "ASCO: Without Permission"
    assert asco_program["raw"]["calendar_title"].startswith("Staff Selects")
    show = next(s for s in result["showtimes"] if s["source_program_id"] == "asco-without-permission")
    assert show["source_title"].startswith("Staff Selects")


def test_malformed_film_link_rejected():
    url = calendar_url_for_start(date(2026, 7, 14))
    pages = {
        url: (FIXTURE_DIR / "calendar_malformed.html").read_text(encoding="utf-8"),
    }
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert any(r["code"] == "malformed_film_link" for r in result["rejected_observations"])
    assert result["status"] == "partial_failure"


def test_fallback_identity_collision_surfaced():
    url = calendar_url_for_start(date(2026, 7, 14))
    pages = {
        url: (FIXTURE_DIR / "calendar_collision.html").read_text(encoding="utf-8"),
        "https://nwfilmforum.org/films/collision-film/": (
            FIXTURE_DIR / "film_collision-film.html"
        ).read_text(encoding="utf-8"),
    }
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert len(result["showtimes"]) == 2
    assert any(w["code"] == "fallback_identity_collision" for w in result["warnings"])
    assert any(s["raw"].get("occurrence_discriminator") for s in result["showtimes"])


def test_december_to_january_window():
    pages = {
        calendar_url_for_start(date(2026, 12, 29)): (
            FIXTURE_DIR / "calendar_2026-12-29.html"
        ).read_text(encoding="utf-8"),
        calendar_url_for_start(date(2027, 1, 5)): (
            FIXTURE_DIR / "calendar_2027-01-05.html"
        ).read_text(encoding="utf-8"),
        "https://nwfilmforum.org/films/year-end-feature/": (
            FIXTURE_DIR / "film_year-end-feature.html"
        ).read_text(encoding="utf-8"),
    }
    result = build_nwff_result(
        start_date=date(2026, 12, 29),
        end_date=date(2027, 1, 6),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    _validate(result)
    assert result["status"] == "success"
    dates = sorted({s["local_date"] for s in result["showtimes"]})
    assert dates == ["2026-12-31", "2027-01-06"]


def test_traversal_stall_incomplete():
    # Second page returns structure but no span covering later days.
    url1 = calendar_url_for_start(date(2026, 7, 14))
    url2 = calendar_url_for_start(date(2026, 7, 21))
    pages = {
        url1: (FIXTURE_DIR / "calendar_2026-07-14.html").read_text(encoding="utf-8"),
        url2: calendar_shell(heading="Jul 14 - 20", body=""),  # stalled span
        "https://nwfilmforum.org/films/asco-without-permission/": (
            FIXTURE_DIR / "film_asco-without-permission.html"
        ).read_text(encoding="utf-8"),
        "https://nwfilmforum.org/films/local-shorts-program/": (
            FIXTURE_DIR / "film_local-shorts-program.html"
        ).read_text(encoding="utf-8"),
    }
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 27),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert result["inspected_window"]["complete"] is False
    assert result["restate_safe"] is False


def test_unknown_category_film_path_not_auto_rejected():
    html = calendar_shell(
        heading="Jul 14 - 20",
        body="""
  <div class="calendar__item" data-calendar-item itemscope itemtype="https://schema.org/ScreeningEvent">
    <meta itemprop="name" content="Mystery Screening" />
    <meta itemprop="startDate" content="2026-07-18T19:00:00" />
    <div itemprop="location" itemscope itemtype="https://schema.org/Place">
      <meta itemprop="name" content="Northwest Film Forum" />
    </div>
    <a class="calendar__item__link" href="/films/mystery-screening/">Mystery Screening</a>
  </div>
""",
    )
    pages = {
        calendar_url_for_start(date(2026, 7, 14)): html,
        "https://nwfilmforum.org/films/mystery-screening/": program_page(
            title="Mystery Screening", schedule_times=["2026-07-18T19:00:00"]
        ),
    }
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert result["status"] == "success"
    assert len(result["showtimes"]) == 1
    assert not any(r["code"] == "unknown_category" for r in result["rejected_observations"])


def test_shorts_and_special_presentation_accepted():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 27),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    ids = {p["source_program_id"] for p in result["programs"]}
    assert "local-shorts-program" in ids
    assert "night-film" in ids


def test_ticket_url_distinction():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    asco = [s for s in result["showtimes"] if s["source_program_id"] == "asco-without-permission"]
    with_ticket = [s for s in asco if s["ticket_url"] and "asco-1530" in s["ticket_url"]]
    assert with_ticket
    shorts = next(s for s in result["showtimes"] if s["source_program_id"] == "local-shorts-program")
    # Generic program ticket may be absent; calendar had none.
    assert shorts["ticket_url"] is None or "eventive" in (shorts["ticket_url"] or "")


def test_deterministic_serialization_byte_stable():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    a = serialize_independent_source_result(result)
    b = serialize_independent_source_result(json.loads(a))
    assert a == b
    assert "<html" not in a.casefold()


def test_fixture_mode_cli_offline(tmp_path, monkeypatch):
    calls: list[str] = []

    def blocked(url: str, *args, **kwargs):  # noqa: ANN001
        calls.append(url)
        raise AssertionError(f"network forbidden in fixture mode: {url}")

    monkeypatch.setattr("urllib.request.urlopen", blocked)
    from scripts.prototype_nwff_ingestion import main

    code = main(
        [
            "--start-date",
            "2026-07-14",
            "--end-date",
            "2026-07-20",
            "--fixture-dir",
            str(FIXTURE_DIR),
            "--output-dir",
            str(tmp_path),
            "--scraped-at",
            SCRAPED_AT,
        ]
    )
    assert code == 0
    assert calls == []
    out = tmp_path / "nwff_independent_source_result.json"
    assert out.is_file()
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["status"] == "success"


def test_requested_window_filtering():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 19),
        end_date=date(2026, 7, 19),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    assert all(s["local_date"] == "2026-07-19" for s in result["showtimes"])
    assert result["stats"]["accepted_showtimes"] == 1


def test_showtimes_reference_existing_programs():
    pages = _pages_from_manifest()
    result = build_nwff_result(
        start_date=date(2026, 7, 14),
        end_date=date(2026, 7, 20),
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
    )
    program_ids = {p["source_program_id"] for p in result["programs"]}
    assert {s["source_program_id"] for s in result["showtimes"]} <= program_ids
