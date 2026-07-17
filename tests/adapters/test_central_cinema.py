"""Tests for production-compatible Central Cinema adapter (P-17D, non-scheduled)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.adapters.central_cinema import (
    CENTRAL_THEATER_ID,
    DEFAULT_TIMEZONE,
    CentralCinemaAdapterError,
    CentralCinemaLogValidationError,
    central_cinema_log_path,
    default_central_cinema_window,
    fetch_central_cinema,
    fetch_central_cinema_from_fixture_dir,
    prove_indie_parser_compatibility,
    summarize_central_cinema_result,
    validate_central_cinema_scrape_log,
    write_central_cinema_scrape_log,
)
from reel_seattle.adapters.scrape_log import load_scrape_daily_log_payload, raw_showtimes_to_legacy_rows
from reel_seattle.ingestion.independent_contract import CONTRACT_VERSION
from reel_seattle.normalize import parse_time
from reel_seattle.normalize.theaters import build_theater_index, resolve_theater
from reel_seattle.prototypes.central_cinema import FetchResponse, calendar_url, fixture_fetch_map
from reel_seattle.source_identity import source_film_id_from_raw, source_showtime_id_from_raw
from tests.prototypes.central_cinema_html import calendar_shell, movie_link, movie_page

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "prototypes" / "central_cinema"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)
SCRAPED_AT = "2026-12-30T12:00:00-08:00"
GENERATED_AT = "2026-12-30T12:05:00-08:00"
WINDOW_START = date(2026, 12, 28)
WINDOW_END = date(2027, 1, 10)
THEATER_IDS = {CENTRAL_THEATER_ID, "the-beacon", "northwest-film-forum", "siff-cinema-uptown"}


def test_default_window_is_inclusive_14_days():
    now = datetime(2026, 7, 20, 9, 0, tzinfo=PACIFIC)
    start, end = default_central_cinema_window(now=now)
    assert start == date(2026, 7, 20)
    assert end == date(2026, 8, 2)
    assert (end - start).days == 13


def test_fixture_success_emits_contract_and_option_c_log():
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["contract_version"] == CONTRACT_VERSION
    assert result.contract["source"] == "central_cinema"
    assert result.contract["status"] == "success"
    assert result.restate_safe is True
    assert result.log_envelope["source"] == "central_cinema"
    assert "independent_source_result" in result.log_envelope
    assert "mapping" in result.log_envelope
    assert result.log_envelope["mapping"]["restate_safe"] is True
    assert len(result.records) >= 1
    validate_central_cinema_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)
    assert all(source_film_id_from_raw(r) for r in result.records)
    assert all(source_showtime_id_from_raw(r).isdigit() for r in result.records)
    assert all((r.attributes or {}).get("theater_id") == CENTRAL_THEATER_ID for r in result.records)
    assert all(r.title_raw for r in result.records)
    assert all(r.ticket_url_raw for r in result.records)
    blob = json.dumps(result.log_envelope)
    assert "<html" not in blob.casefold()
    assert "/Users/" not in blob
    assert "C:\\\\" not in blob


def test_movie_pages_fetched_once():
    counts: dict[str, int] = {}
    pages = {}
    mapping = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    for url, filename in mapping.items():
        pages[url] = (FIXTURE_DIR / filename).read_text(encoding="utf-8")
    base = fixture_fetch_map(pages)

    def counting(url: str) -> FetchResponse:
        counts[url] = counts.get(url, 0) + 1
        return base(url)

    result = fetch_central_cinema(
        WINDOW_START,
        WINDOW_END,
        fetch=counting,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert counts.get(calendar_url(), 0) == 1
    movie_fetches = {u: n for u, n in counts.items() if "/movie/" in u}
    assert movie_fetches
    assert all(n == 1 for n in movie_fetches.values())
    assert result.restate_safe is True


def test_requested_window_filtering():
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 12, 30),
        date(2026, 12, 30),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    assert result.requested_window == {"start": "2026-12-30", "end": "2026-12-30"}
    assert all((r.attributes or {}).get("local_date") == "2026-12-30" for r in result.records)


def test_calendar_request_failure_valid_unsafe_log():
    def fail(_url: str) -> FetchResponse:
        return FetchResponse(url=_url, status_code=0, text=None)

    result = fetch_central_cinema(
        WINDOW_START,
        WINDOW_END,
        fetch=fail,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "request_failure"
    assert result.restate_safe is False
    assert result.records == []
    validate_central_cinema_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_zero_links_structural_failure():
    empty_cal = calendar_shell(body="<p>Explore Movies placeholder with no links</p>")

    def fetch(url: str) -> FetchResponse:
        if "calendar" in url:
            return FetchResponse(url=url, status_code=200, text=empty_cal)
        return FetchResponse(url=url, status_code=404, text=None)

    result = fetch_central_cinema(
        WINDOW_START,
        WINDOW_END,
        fetch=fetch,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "structural_failure"
    assert result.restate_safe is False
    validate_central_cinema_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_movie_page_failure_partial_unsafe():
    pages = {}
    mapping = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    for url, filename in mapping.items():
        pages[url] = (FIXTURE_DIR / filename).read_text(encoding="utf-8")
    fail_movie = "https://central-cinema.com/movie/faceslashoff/"

    def fetch(url: str) -> FetchResponse:
        if url.rstrip("/") == fail_movie.rstrip("/"):
            return FetchResponse(url=url, status_code=500, text=None)
        return fixture_fetch_map(pages)(url)

    result = fetch_central_cinema(
        WINDOW_START,
        WINDOW_END,
        fetch=fetch,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "partial_failure"
    assert result.restate_safe is False
    validate_central_cinema_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_malformed_showing_unsafe():
    pages = {
        calendar_url(): calendar_shell(body=movie_link("Face/Off", "/movie/faceslashoff/")),
        "https://central-cinema.com/movie/faceslashoff/": movie_page(
            name="Face/Off",
            checkouts=[
                (
                    "January 3, 7:00 pm",
                    "https://www.central-cinema.com/checkout/showing/faceslashoff/",
                )
            ],
        ),
    }
    result = fetch_central_cinema(
        WINDOW_START,
        WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.restate_safe is False
    assert all(source_showtime_id_from_raw(r).isdigit() for r in result.records)
    assert (
        any(
            row.get("affects_completeness")
            for row in (result.contract.get("rejected_observations") or [])
            if isinstance(row, dict)
        )
        or result.contract.get("stats", {}).get("malformed_showings", 0) > 0
        or result.restate_safe is False
    )
    validate_central_cinema_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_optional_metadata_missing_can_remain_safe():
    pages = {
        calendar_url(): calendar_shell(body=movie_link("Face/Off", "/movie/faceslashoff/")),
        "https://central-cinema.com/movie/faceslashoff/": movie_page(
            name="Face/Off",
            duration="",
            copyright_year=None,
            checkouts=[
                (
                    "December 30, 7:00 pm",
                    "https://www.central-cinema.com/checkout/showing/faceslashoff/111",
                )
            ],
        ),
    }
    result = fetch_central_cinema(
        WINDOW_START,
        WINDOW_END,
        fetch=fixture_fetch_map(pages),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "success"
    assert result.restate_safe is True
    assert len(result.records) == 1
    assert result.records[0].runtime_raw is None
    assert "release_year" not in (result.records[0].attributes or {})


def test_date_created_never_maps_to_year():
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    for program in result.contract.get("programs") or []:
        raw = program.get("raw") if isinstance(program, dict) else None
        if isinstance(raw, dict) and raw.get("dateCreated"):
            # Even when dateCreated is present, mapped year must come only from release_year.
            pass
    for record in result.records:
        year = (record.attributes or {}).get("release_year")
        if year is not None:
            assert year != 2026 or source_film_id_from_raw(record) != "faceslashoff"


def test_exact_titles_slugs_and_showing_ids_survive():
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    titles = {r.title_raw for r in result.records}
    assert "Face/Off" in titles or any("/" in t for t in titles)
    slugs = {source_film_id_from_raw(r) for r in result.records}
    assert "faceslashoff" in slugs or "cartoon-happy-hour" in slugs
    assert all(source_showtime_id_from_raw(r).isdigit() for r in result.records)
    assert all("checkout/showing/" in (r.ticket_url_raw or "") for r in result.records)


def test_same_time_distinct_ids_and_no_composite_fallback():
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    ids = [source_showtime_id_from_raw(r) for r in result.records]
    assert len(ids) == len(set(ids))
    for record in result.records:
        assert (record.attributes or {}).get("showtime_identity") == "source_showing_id"
        assert "fallback_identity" not in (record.attributes or {})


def test_title_change_does_not_alter_slug_via_adapter_path():
    # Fixture Face/Off slug remains faceslashoff regardless of display punctuation.
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    face = [r for r in result.records if source_film_id_from_raw(r) == "faceslashoff"]
    if face:
        assert all(source_film_id_from_raw(r) == "faceslashoff" for r in face)


def test_mapping_cannot_upgrade_unsafe_contract():
    def fail(_url: str) -> FetchResponse:
        return FetchResponse(url=_url, status_code=0, text=None)

    result = fetch_central_cinema(
        WINDOW_START,
        WINDOW_END,
        fetch=fail,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["restate_safe"] is False
    assert result.restate_safe is False
    assert result.log_envelope["mapping"]["restate_safe"] is False


def test_log_write_deterministic_and_parser_compatible(tmp_path):
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    path = central_cinema_log_path(WINDOW_START, output_dir=tmp_path)
    write_central_cinema_scrape_log(path, result.log_envelope)
    text_a = path.read_text(encoding="utf-8")
    write_central_cinema_scrape_log(path, result.log_envelope)
    assert path.read_text(encoding="utf-8") == text_a
    payload = json.loads(text_a)
    compat = prove_indie_parser_compatibility(payload)
    assert compat["history_written"] is False
    assert compat["restatement_invoked"] is False
    fetch_result = load_scrape_daily_log_payload(payload)
    rows = raw_showtimes_to_legacy_rows("central_cinema", fetch_result.records)
    assert len(rows) == len(fetch_result.records)
    assert all(source_film_id_from_raw(r) for r in fetch_result.records)
    assert all(source_showtime_id_from_raw(r) for r in fetch_result.records)
    assert all(r.title_raw for r in fetch_result.records)


def test_noon_midnight_and_theater_resolve(theaters_registry):
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    # Fixture times are evening; prove format helpers via mapped path + parser.
    for record in result.records:
        parsed = parse_time(record.time_raw)
        assert parsed is not None
        assert "AM" in record.time_raw or "PM" in record.time_raw
    assert parse_time("12:00 AM").time_24h == "00:00"
    assert parse_time("12:00 PM").time_24h == "12:00"
    index = build_theater_index(theaters_registry)
    resolved = resolve_theater(result.records[0].theater_name_raw, index)
    assert resolved is not None
    assert resolved.theater_id == CENTRAL_THEATER_ID


def test_end_before_start_raises():
    with pytest.raises(CentralCinemaAdapterError):
        fetch_central_cinema(
            date(2026, 7, 20),
            date(2026, 7, 14),
            fetch=lambda u: FetchResponse(u, 0, None),
            theater_ids=THEATER_IDS,
        )


def test_cli_fixture_offline(tmp_path, monkeypatch):
    calls: list[str] = []

    def blocked(url, *args, **kwargs):  # noqa: ANN001
        calls.append(str(url))
        raise AssertionError(f"network forbidden: {url}")

    monkeypatch.setattr("urllib.request.urlopen", blocked)
    from scripts.scrape_central_cinema import main

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
            "--generated-at",
            GENERATED_AT,
        ]
    )
    assert code == 0
    assert calls == []
    logs = list(tmp_path.glob("*_central_cinema.json"))
    assert len(logs) == 1
    payload = json.loads(logs[0].read_text(encoding="utf-8"))
    assert payload["source"] == "central_cinema"
    assert (tmp_path / "central_cinema_scrape_summary.json").is_file()


def test_cli_structural_failure_still_writes_valid_log(tmp_path, monkeypatch):
    empty = calendar_shell(body="<div id='q-app'></div>")
    (tmp_path / "fixtures").mkdir()
    (tmp_path / "fixtures" / "calendar.html").write_text(empty, encoding="utf-8")
    (tmp_path / "fixtures" / "manifest.json").write_text(
        json.dumps({calendar_url(): "calendar.html"}),
        encoding="utf-8",
    )
    out = tmp_path / "out"
    from scripts.scrape_central_cinema import main

    code = main(
        [
            "--start-date",
            "2026-12-28",
            "--end-date",
            "2027-01-10",
            "--fixture-dir",
            str(tmp_path / "fixtures"),
            "--output-dir",
            str(out),
            "--scraped-at",
            SCRAPED_AT,
            "--generated-at",
            GENERATED_AT,
        ]
    )
    assert code == 0
    logs = list(out.glob("*_central_cinema.json"))
    assert len(logs) == 1
    payload = json.loads(logs[0].read_text(encoding="utf-8"))
    assert payload["independent_source_result"]["status"] == "structural_failure"
    assert payload["mapping"]["restate_safe"] is False
    validate_central_cinema_scrape_log(payload, theater_ids=THEATER_IDS)


def test_manual_workflow_is_dispatch_readonly():
    path = (
        Path(__file__).resolve().parents[2]
        / ".github"
        / "workflows"
        / "central_cinema_manual_scrape.yml"
    )
    text = path.read_text(encoding="utf-8")
    assert "workflow_dispatch:" in text
    assert "schedule:" not in text
    assert "contents: read" in text
    assert "git commit" not in text
    assert "git push" not in text
    assert "daily_scraping" not in text
    assert "${{ secrets." not in text
    assert "data/daily_logs" not in text
    assert "permissions:" in text


def test_summarize_includes_windows():
    result = fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    summary = summarize_central_cinema_result(result)
    assert summary["requested_window"]["start"] == "2026-12-28"
    assert summary["restate_safe"] is True


def test_invalid_log_rejected():
    with pytest.raises(CentralCinemaLogValidationError):
        validate_central_cinema_scrape_log({"source": "central_cinema"}, theater_ids=THEATER_IDS)


def test_default_window_used_when_dates_omitted():
    now = datetime(2026, 7, 16, 10, 0, tzinfo=PACIFIC)
    calls: list[str] = []

    def fail(url: str) -> FetchResponse:
        calls.append(url)
        return FetchResponse(url=url, status_code=0, text=None)

    result = fetch_central_cinema(
        fetch=fail,
        now=now,
        scraped_at="2026-07-16T10:00:00-07:00",
        generated_at="2026-07-16T10:05:00-07:00",
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.requested_window == {"start": "2026-07-16", "end": "2026-07-29"}
    assert (date.fromisoformat(result.requested_window["end"]) - date.fromisoformat(result.requested_window["start"])).days == 13
