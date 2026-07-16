"""Tests for production-compatible NWFF adapter (P-16G, non-scheduled)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.adapters.nwff import (
    DEFAULT_TIMEZONE,
    NWFF_THEATER_ID,
    NwffAdapterError,
    NwffLogValidationError,
    default_nwff_window,
    fetch_nwff,
    fetch_nwff_from_fixture_dir,
    nwff_log_path,
    prove_indie_parser_compatibility,
    summarize_nwff_result,
    validate_nwff_scrape_log,
    write_nwff_scrape_log,
)
from reel_seattle.adapters.scrape_log import load_scrape_daily_log_payload, raw_showtimes_to_legacy_rows
from reel_seattle.ingestion.independent_contract import CONTRACT_VERSION
from reel_seattle.prototypes.nwff import FetchResponse, calendar_url_for_start
from reel_seattle.source_identity import source_film_id_from_raw

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "adapters" / "nwff"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)
SCRAPED_AT = "2026-07-15T12:00:00-07:00"
GENERATED_AT = "2026-07-15T12:05:00-07:00"
THEATER_IDS = {NWFF_THEATER_ID, "the-beacon", "siff-cinema-uptown"}


def test_default_window_is_inclusive_14_days():
    now = datetime(2026, 7, 20, 9, 0, tzinfo=PACIFIC)
    start, end = default_nwff_window(now=now)
    assert start == date(2026, 7, 20)
    assert end == date(2026, 8, 2)
    assert (end - start).days == 13


def test_fixture_success_emits_contract_and_option_c_log():
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 14),
        date(2026, 7, 20),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["contract_version"] == CONTRACT_VERSION
    assert result.contract["source"] == "nwff"
    assert result.contract["status"] == "success"
    assert result.restate_safe is True
    assert result.log_envelope["source"] == "nwff"
    assert "independent_source_result" in result.log_envelope
    assert "mapping" in result.log_envelope
    assert result.log_envelope["mapping"]["restate_safe"] is True
    assert len(result.records) >= 1
    validate_nwff_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)
    assert all(source_film_id_from_raw(r) for r in result.records)
    assert all((r.attributes or {}).get("theater_id") == NWFF_THEATER_ID for r in result.records)
    assert all(r.title_raw for r in result.records)
    blob = json.dumps(result.log_envelope)
    assert "<html" not in blob.casefold()


def test_program_pages_fetched_once():
    counts: dict[str, int] = {}
    pages = {}
    mapping = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    for url, filename in mapping.items():
        pages[url] = (FIXTURE_DIR / filename).read_text(encoding="utf-8")

    from reel_seattle.prototypes.nwff import fixture_fetch_map

    base = fixture_fetch_map(pages)

    def counting(url: str) -> FetchResponse:
        counts[url] = counts.get(url, 0) + 1
        return base(url)

    result = fetch_nwff(
        date(2026, 7, 14),
        date(2026, 7, 20),
        fetch=counting,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    film_fetches = {u: n for u, n in counts.items() if "/films/" in u}
    assert film_fetches
    assert all(n == 1 for n in film_fetches.values())
    assert result.restate_safe is True


def test_requested_window_filtering():
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 19),
        date(2026, 7, 19),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    assert all((r.attributes or {}).get("local_date") == "2026-07-19" for r in result.records)
    assert result.requested_window == {"start": "2026-07-19", "end": "2026-07-19"}


def test_calendar_request_failure_valid_unsafe_log():
    def fail(_url: str) -> FetchResponse:
        return FetchResponse(url=_url, status_code=0, text=None)

    result = fetch_nwff(
        date(2026, 7, 14),
        date(2026, 7, 20),
        fetch=fail,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "request_failure"
    assert result.restate_safe is False
    assert result.records == []
    validate_nwff_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_structural_failure_valid_unsafe_log():
    url = calendar_url_for_start(date(2026, 7, 14))
    bad = (FIXTURE_DIR / "calendar_bad_structure.html").read_text(encoding="utf-8")

    def fetch(u: str) -> FetchResponse:
        if "calendar" in u:
            return FetchResponse(url=u, status_code=200, text=bad)
        return FetchResponse(url=u, status_code=404, text=None)

    result = fetch_nwff(
        date(2026, 7, 14),
        date(2026, 7, 20),
        fetch=fetch,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "structural_failure"
    assert result.restate_safe is False
    validate_nwff_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_week_page_failure_partial_unsafe():
    pages = {}
    mapping = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    for url, filename in mapping.items():
        pages[url] = (FIXTURE_DIR / filename).read_text(encoding="utf-8")
    fail_url = calendar_url_for_start(date(2026, 7, 21))

    def fetch(url: str) -> FetchResponse:
        if url == fail_url:
            return FetchResponse(url=url, status_code=500, text=None)
        from reel_seattle.prototypes.nwff import fixture_fetch_map

        return fixture_fetch_map(pages)(url)

    result = fetch_nwff(
        date(2026, 7, 14),
        date(2026, 7, 27),
        fetch=fetch,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "partial_failure"
    assert result.restate_safe is False
    assert result.inspected_window.get("complete") is False
    validate_nwff_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_program_page_failure_partial_unsafe():
    pages = {}
    mapping = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    for url, filename in mapping.items():
        pages[url] = (FIXTURE_DIR / filename).read_text(encoding="utf-8")
    fail_film = "https://nwfilmforum.org/films/asco-without-permission/"

    def fetch(url: str) -> FetchResponse:
        if url.rstrip("/") == fail_film.rstrip("/"):
            return FetchResponse(url=url, status_code=500, text=None)
        from reel_seattle.prototypes.nwff import fixture_fetch_map

        return fixture_fetch_map(pages)(url)

    result = fetch_nwff(
        date(2026, 7, 14),
        date(2026, 7, 20),
        fetch=fetch,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "partial_failure"
    assert result.restate_safe is False
    validate_nwff_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_offsite_in_multi_week_makes_unsafe():
    # Jul 14-27 includes offsite screening in week2 fixture.
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 14),
        date(2026, 7, 27),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    assert result.restate_safe is False
    assert result.contract["status"] == "partial_failure"
    locations = {(r.attributes or {}).get("location_name") for r in result.records}
    assert locations <= {"Northwest Film Forum", "NWFF", None} or all(
        str(loc).casefold() in {"northwest film forum", "nwff"} for loc in locations if loc
    )


def test_schedule_mismatch_warning_can_remain_safe_on_single_week():
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 14),
        date(2026, 7, 20),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    # ASCO fixture matches detail schedule; title mismatch may warn but stay safe.
    assert result.restate_safe is True
    assert result.contract["status"] == "success"


def test_valid_empty_fixture_week():
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 28),
        date(2026, 8, 2),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["status"] == "valid_empty"
    assert result.restate_safe is True
    assert result.records == []
    assert result.contract["valid_empty_evidence"]["proven"] is True
    validate_nwff_scrape_log(result.log_envelope, theater_ids=THEATER_IDS)


def test_log_write_deterministic_and_parser_compatible(tmp_path):
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 14),
        date(2026, 7, 20),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    path = nwff_log_path(date(2026, 7, 14), output_dir=tmp_path)
    write_nwff_scrape_log(path, result.log_envelope)
    text_a = path.read_text(encoding="utf-8")
    write_nwff_scrape_log(path, result.log_envelope)
    assert path.read_text(encoding="utf-8") == text_a
    payload = json.loads(text_a)
    compat = prove_indie_parser_compatibility(payload)
    assert compat["history_written"] is False
    assert compat["restatement_invoked"] is False
    fetch_result = load_scrape_daily_log_payload(payload)
    rows = raw_showtimes_to_legacy_rows("nwff", fetch_result.records)
    assert len(rows) == len(fetch_result.records)
    assert all(source_film_id_from_raw(r) for r in fetch_result.records)
    assert all(r.title_raw for r in fetch_result.records)


def test_exact_titles_and_slugs_survive():
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 14),
        date(2026, 7, 20),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    titles = {r.title_raw for r in result.records}
    assert any(t.startswith("Staff Selects") for t in titles)
    assert "asco-without-permission" in {source_film_id_from_raw(r) for r in result.records}
    tickets = [r.ticket_url_raw for r in result.records if r.ticket_url_raw]
    assert tickets  # at least some occurrence tickets in fixtures


def test_mapping_cannot_upgrade_unsafe_contract():
    def fail(_url: str) -> FetchResponse:
        return FetchResponse(url=_url, status_code=0, text=None)

    result = fetch_nwff(
        date(2026, 7, 14),
        date(2026, 7, 20),
        fetch=fail,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        sleep_seconds=0.0,
        theater_ids=THEATER_IDS,
    )
    assert result.contract["restate_safe"] is False
    assert result.restate_safe is False
    assert result.log_envelope["mapping"]["restate_safe"] is False


def test_end_before_start_raises():
    with pytest.raises(NwffAdapterError):
        fetch_nwff(
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
    from scripts.scrape_nwff import main

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
            "--generated-at",
            GENERATED_AT,
        ]
    )
    assert code == 0
    assert calls == []
    logs = list(tmp_path.glob("*_nwff.json"))
    assert len(logs) == 1
    payload = json.loads(logs[0].read_text(encoding="utf-8"))
    assert payload["source"] == "nwff"
    assert (tmp_path / "nwff_scrape_summary.json").is_file()


def test_manual_workflow_is_dispatch_readonly():
    path = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "nwff_manual_scrape.yml"
    text = path.read_text(encoding="utf-8")
    assert "workflow_dispatch:" in text
    assert "schedule:" not in text
    assert "contents: read" in text
    assert "git commit" not in text
    assert "git push" not in text
    assert "daily_scraping" not in text
    assert "${{ secrets." not in text
    # Avoid PyYAML's boolean coercion of the `on:` key.
    assert "permissions:" in text


def test_summarize_includes_windows():
    result = fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 14),
        date(2026, 7, 20),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )
    summary = summarize_nwff_result(result)
    assert summary["requested_window"]["start"] == "2026-07-14"
    assert summary["restate_safe"] is True


def test_invalid_log_rejected():
    with pytest.raises(NwffLogValidationError):
        validate_nwff_scrape_log({"source": "nwff"}, theater_ids=THEATER_IDS)
