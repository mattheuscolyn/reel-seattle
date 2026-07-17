"""Tests for indie scrape completeness and restatement-safety guards."""

from __future__ import annotations

import copy
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from daily_processor import (
    HISTORY_FIELDNAMES,
    normalize_history_row,
    process_indie_csv_data,
    save_csv,
)
from reel_seattle.adapters.base import FetchContext, FetchResult, RawShowtime
from reel_seattle.adapters.beacon import (
    BEACON_CALENDAR_URL,
    fetch_beacon_showtimes,
)
from reel_seattle.adapters.indie_completeness import (
    STATUS_PARTIAL_FAILURE,
    STATUS_STRUCTURAL_FAILURE,
    STATUS_SUCCESS,
    STATUS_VALID_EMPTY,
    decide_beacon_completeness,
    decide_siff_completeness,
    derived_indie_completeness_warnings,
    is_indie_restate_allowed,
)
from reel_seattle.adapters.scrape_log import daily_log_path, write_scrape_daily_log
from reel_seattle.adapters.siff import (
    SIFF_BASE_URL,
    SIFF_IN_THEATERS_URL,
    fetch_siff_showtimes,
)
from reel_seattle.history_keys import load_theater_index
from reel_seattle.pipeline_report import load_daily_scrape_diagnostics

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "adapters"
FILM_URL = f"{SIFF_BASE_URL}/cinema/in-theaters/test-film"
BEACON_FILM_URL = "https://thebeacon.film/calendar/movie/fixture-film"


@pytest.fixture
def theater_index():
    return load_theater_index()


@pytest.fixture
def today():
    return datetime.now().date()


@pytest.fixture
def future_date(today):
    return today + timedelta(days=7)


@pytest.fixture
def past_date(today):
    return today - timedelta(days=30)


def _fmt(d) -> str:
    return f"{d.month:02d}/{d.day:02d}/{d.year}"


def _indie_row(show_date, *, film: str, theater: str, source: str = "indie") -> dict:
    return normalize_history_row(
        {
            "Date": _fmt(show_date),
            "Time": "7:00PM",
            "Theater": theater,
            "Film": film,
            "Runtime": "120",
            "source": source,
            "first_seen_date": "2026-06-01",
            "last_updated": "2026-06-01",
        }
    )


def _context() -> FetchContext:
    return FetchContext(
        run_date=date(2026, 6, 26),
        window_start=date(2026, 6, 26),
        window_end=date(2026, 12, 31),
        theaters_registry={},
        session=object(),  # type: ignore[arg-type]
    )


def _write_json_log(logs_dir: Path, source: str, result: FetchResult, run_date: str = "2026-06-26") -> None:
    logs_dir.mkdir(parents=True, exist_ok=True)
    write_scrape_daily_log(daily_log_path(run_date, source, logs_dir=logs_dir), source, result)


def test_decide_siff_any_failed_page_blocks_restate():
    stats, warnings = decide_siff_completeness(
        discovery_ok=True,
        expected_structure_present=True,
        discovered_programs=2,
        program_pages_succeeded=1,
        program_pages_failed=1,
        record_count=5,
        failed_program_urls=["https://www.siff.net/cinema/in-theaters/a"],
    )
    assert stats["restate_safe"] is False
    assert stats["scrape_status"] == STATUS_PARTIAL_FAILURE
    assert any("partial" in message.casefold() for message in warnings)


def test_decide_siff_complete_permits_restate():
    stats, warnings = decide_siff_completeness(
        discovery_ok=True,
        expected_structure_present=True,
        discovered_programs=2,
        program_pages_succeeded=2,
        program_pages_failed=0,
        record_count=4,
    )
    assert stats["restate_safe"] is True
    assert stats["scrape_status"] == STATUS_SUCCESS
    assert warnings == []


def test_decide_siff_zero_discovered_without_proof_is_unsafe():
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
    assert stats["valid_empty_proof"] is False
    assert stats["scrape_status"] == STATUS_STRUCTURAL_FAILURE
    assert any("affirmative empty proof" in message for message in warnings)


def test_decide_siff_zero_discovered_with_affirmative_proof_is_valid_empty():
    stats, _warnings = decide_siff_completeness(
        discovery_ok=True,
        expected_structure_present=True,
        discovered_programs=0,
        program_pages_succeeded=0,
        program_pages_failed=0,
        record_count=0,
        affirmative_empty_proof=True,
    )
    assert stats["restate_safe"] is True
    assert stats["scrape_status"] == STATUS_VALID_EMPTY
    assert stats["valid_empty_proof"] is True


def test_decide_siff_all_pages_empty_is_valid_empty():
    stats, _warnings = decide_siff_completeness(
        discovery_ok=True,
        expected_structure_present=True,
        discovered_programs=2,
        program_pages_succeeded=2,
        program_pages_failed=0,
        record_count=0,
    )
    assert stats["restate_safe"] is True
    assert stats["scrape_status"] == STATUS_VALID_EMPTY
    assert stats["valid_empty_proof"] is True


def test_decide_beacon_zero_without_proof_is_unsafe():
    stats, warnings = decide_beacon_completeness(
        discovery_ok=True,
        expected_structure_present=True,
        discovered_programs=0,
        program_pages_succeeded=0,
        program_pages_failed=0,
        record_count=0,
    )
    assert stats["restate_safe"] is False
    assert stats["valid_empty_proof"] is False
    assert any("valid-empty proof" in message for message in warnings)


def test_decide_beacon_valid_empty_when_all_pages_empty():
    stats, _warnings = decide_beacon_completeness(
        discovery_ok=True,
        expected_structure_present=True,
        discovered_programs=2,
        program_pages_succeeded=2,
        program_pages_failed=0,
        record_count=0,
    )
    assert stats["restate_safe"] is True
    assert stats["scrape_status"] == STATUS_VALID_EMPTY
    assert stats["valid_empty_proof"] is True


def test_siff_fetch_partial_failure_sets_restate_unsafe():
    listing = (FIXTURES_DIR / "siff_listing.html").read_text(encoding="utf-8")
    film = (FIXTURES_DIR / "siff_film.html").read_text(encoding="utf-8")
    pages = {
        SIFF_IN_THEATERS_URL: listing,
        FILM_URL: film,
        f"{SIFF_BASE_URL}/programs-and-events/special-event": None,
    }

    def fake_fetch(url: str) -> str | None:
        return pages.get(url)

    result = fetch_siff_showtimes(_context(), fetch_text_fn=fake_fetch, current_year=2026)
    assert result.records
    assert result.stats["restate_safe"] is False
    assert result.stats["program_pages_failed"] == 1
    assert result.stats["scrape_status"] == STATUS_PARTIAL_FAILURE
    assert any("partial" in warning.casefold() for warning in result.warnings)


def test_siff_fetch_complete_is_restate_safe():
    listing = (FIXTURES_DIR / "siff_listing.html").read_text(encoding="utf-8")
    film = (FIXTURES_DIR / "siff_film.html").read_text(encoding="utf-8")
    pages = {
        SIFF_IN_THEATERS_URL: listing,
        FILM_URL: film,
        f"{SIFF_BASE_URL}/programs-and-events/special-event": film,
    }

    def fake_fetch(url: str) -> str | None:
        return pages.get(url)

    result = fetch_siff_showtimes(_context(), fetch_text_fn=fake_fetch, current_year=2026)
    assert result.stats["restate_safe"] is True
    assert result.stats["scrape_status"] == STATUS_SUCCESS


def test_beacon_fetch_structural_empty_is_unsafe():
    def fake_fetch(url: str) -> str | None:
        if url == BEACON_CALENDAR_URL:
            return "<html><body>unrelated page</body></html>"
        return None

    result = fetch_beacon_showtimes(_context(), fetch_text_fn=fake_fetch, current_year=2026)
    assert result.records == []
    assert result.stats["restate_safe"] is False
    assert result.stats["scrape_status"] == STATUS_STRUCTURAL_FAILURE


def test_beacon_fetch_complete_is_restate_safe():
    calendar = (FIXTURES_DIR / "beacon_calendar.html").read_text(encoding="utf-8")
    film = (FIXTURES_DIR / "beacon_film.html").read_text(encoding="utf-8")
    pages = {BEACON_CALENDAR_URL: calendar, BEACON_FILM_URL: film}

    def fake_fetch(url: str) -> str | None:
        return pages.get(url)

    result = fetch_beacon_showtimes(_context(), fetch_text_fn=fake_fetch, current_year=2026)
    assert result.stats["restate_safe"] is True
    assert len(result.records) == 2


def test_partial_siff_json_does_not_wipe_future_rows(
    tmp_path, today, future_date, past_date, theater_index, capsys
):
    history = [
        _indie_row(past_date, film="Past SIFF", theater="SIFF Cinema Uptown", source="siff"),
        _indie_row(future_date, film="Keep Future SIFF", theater="SIFF Cinema Uptown", source="siff"),
        _indie_row(future_date, film="Keep Beacon", theater="The Beacon", source="beacon"),
    ]
    history_before = copy.deepcopy(history)
    logs_dir = tmp_path / "logs"
    partial = FetchResult(
        records=[
            RawShowtime(
                theater_name_raw="SIFF Cinema Uptown",
                date_raw=_fmt(future_date),
                time_raw="7:00PM",
                title_raw="Partial Only",
            )
        ],
        stats={
            "restate_safe": False,
            "scrape_status": STATUS_PARTIAL_FAILURE,
            "stale_retention_recommended": True,
            "program_pages_succeeded": 1,
            "discovered_programs": 2,
            "program_pages_failed": 1,
        },
        warnings=["SIFF scrape partial: 1 of 2 program pages parsed; retained prior future rows."],
    )
    _write_json_log(logs_dir, "siff", partial)
    _write_json_log(
        logs_dir,
        "beacon",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="The Beacon",
                    date_raw=_fmt(future_date),
                    time_raw="8:00PM",
                    title_raw="Beacon Fresh",
                )
            ],
            stats={"restate_safe": True, "scrape_status": STATUS_SUCCESS},
        ),
    )
    scrape_path = tmp_path / "indieshowtimes.csv"
    save_csv(scrape_path, [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(scrape_path),
        history,
        [],
        "2026-06-26",
        theater_index,
        logs_dir=logs_dir,
    )

    assert any(row["Film"] == "Keep Future SIFF" for row in history)
    assert any(row["Film"] == "Past SIFF" for row in history)
    assert not any(row["Film"] == "Partial Only" for row in history)
    assert any(row["Film"] == "Beacon Fresh" for row in history)
    assert not any(row["Film"] == "Keep Beacon" for row in history)
    assert "restate skipped" in capsys.readouterr().out
    kept = next(row for row in history if row["Film"] == "Keep Future SIFF")
    original = next(row for row in history_before if row["Film"] == "Keep Future SIFF")
    assert kept["last_updated"] == original["last_updated"]


def test_suspicious_empty_beacon_preserves_future(
    tmp_path, future_date, theater_index, capsys
):
    history = [
        _indie_row(future_date, film="Stale Beacon", theater="The Beacon", source="beacon"),
        _indie_row(future_date, film="SIFF Ok", theater="SIFF Cinema Downtown", source="siff"),
    ]
    logs_dir = tmp_path / "logs"
    _write_json_log(
        logs_dir,
        "beacon",
        FetchResult(
            records=[],
            stats={
                "restate_safe": False,
                "scrape_status": STATUS_STRUCTURAL_FAILURE,
                "valid_empty_proof": False,
                "stale_retention_recommended": True,
                "discovered_programs": 0,
            },
            warnings=[
                "Beacon scrape returned zero showtimes without valid-empty proof; "
                "retained prior future rows if present (restate blocked)."
            ],
        ),
    )
    _write_json_log(
        logs_dir,
        "siff",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="SIFF Cinema Downtown",
                    date_raw=_fmt(future_date),
                    time_raw="6:00PM",
                    title_raw="SIFF Fresh",
                )
            ],
            stats={"restate_safe": True, "scrape_status": STATUS_SUCCESS},
        ),
    )
    scrape_path = tmp_path / "empty.csv"
    save_csv(scrape_path, [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=logs_dir
    )

    assert any(row["Film"] == "Stale Beacon" for row in history)
    assert any(row["Film"] == "SIFF Fresh" for row in history)
    assert not any(row["Film"] == "SIFF Ok" for row in history)
    assert "beacon restate skipped" in capsys.readouterr().out.casefold()


def test_beacon_valid_empty_clears_future_rows(tmp_path, future_date, past_date, theater_index):
    history = [
        _indie_row(past_date, film="Past Beacon", theater="The Beacon", source="beacon"),
        _indie_row(future_date, film="Clear Me", theater="The Beacon", source="beacon"),
    ]
    logs_dir = tmp_path / "logs"
    _write_json_log(
        logs_dir,
        "beacon",
        FetchResult(
            records=[],
            stats={
                "restate_safe": True,
                "scrape_status": STATUS_VALID_EMPTY,
                "valid_empty_proof": True,
                "discovered_programs": 2,
                "program_pages_succeeded": 2,
                "program_pages_failed": 0,
            },
        ),
    )
    _write_json_log(
        logs_dir,
        "siff",
        FetchResult(records=[], stats={"restate_safe": True, "scrape_status": STATUS_VALID_EMPTY}),
    )
    scrape_path = tmp_path / "empty.csv"
    save_csv(scrape_path, [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=logs_dir
    )

    assert any(row["Film"] == "Past Beacon" for row in history)
    assert not any(row["Film"] == "Clear Me" for row in history)


def test_safe_beacon_restate_replaces_mutated_future_title(
    tmp_path, future_date, past_date, theater_index
):
    """Exact source title from a safe scrape replaces a mutated future history title."""
    history = [
        _indie_row(past_date, film="Welcome Ii The Terrordome", theater="The Beacon", source="beacon"),
        _indie_row(
            future_date,
            film="Welcome Ii The Terrordome",
            theater="The Beacon",
            source="beacon",
        ),
    ]
    logs_dir = tmp_path / "logs"
    _write_json_log(
        logs_dir,
        "beacon",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="The Beacon",
                    date_raw=_fmt(future_date),
                    time_raw="7:00PM",
                    title_raw="WELCOME II THE TERRORDOME",
                    source_showtime_id="INV-T",
                    source_film_url="https://thebeacon.film/calendar/movie/welcome-ii-the-terrordome",
                    attributes={
                        "source_film_id": "welcome-ii-the-terrordome",
                        "source_program_id": "welcome-ii-the-terrordome",
                    },
                )
            ],
            stats={"restate_safe": True, "scrape_status": STATUS_SUCCESS},
        ),
    )
    scrape_path = tmp_path / "indie.csv"
    save_csv(
        scrape_path,
        [
            normalize_history_row(
                {
                    "Date": _fmt(future_date),
                    "Time": "7:00PM",
                    "Theater": "The Beacon",
                    "Film": "WELCOME II THE TERRORDOME",
                    "Runtime": "90",
                    "isAlmostSoldOut": "None",
                    "posterDynamic": "None",
                    "source": "beacon",
                    "source_film_id": "welcome-ii-the-terrordome",
                    "source_title": "WELCOME II THE TERRORDOME",
                    "source_showtime_id": "INV-T",
                }
            )
        ],
        fieldnames=HISTORY_FIELDNAMES,
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=logs_dir
    )

    assert any(row["Film"] == "Welcome Ii The Terrordome" and row["Date"] == _fmt(past_date) for row in history)
    assert any(row["Film"] == "WELCOME II THE TERRORDOME" for row in history)
    assert not any(
        row["Film"] == "Welcome Ii The Terrordome" and row["Date"] == _fmt(future_date)
        for row in history
    )


def test_legacy_json_without_restate_safe_is_conservative(
    tmp_path, future_date, theater_index, capsys
):
    history = [
        _indie_row(future_date, film="Keep", theater="SIFF Cinema Uptown", source="siff"),
    ]
    logs_dir = tmp_path / "logs"
    _write_json_log(
        logs_dir,
        "siff",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="SIFF Cinema Uptown",
                    date_raw=_fmt(future_date),
                    time_raw="7:00PM",
                    title_raw="Would Replace",
                )
            ],
            stats={"records_fetched": 1},
        ),
    )
    _write_json_log(
        logs_dir,
        "beacon",
        FetchResult(records=[], stats={"restate_safe": False, "scrape_status": STATUS_STRUCTURAL_FAILURE}),
    )
    scrape_path = tmp_path / "empty.csv"
    save_csv(scrape_path, [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=logs_dir
    )

    assert any(row["Film"] == "Keep" for row in history)
    assert not any(row["Film"] == "Would Replace" for row in history)
    assert "lacks restate_safe" in capsys.readouterr().out


def test_complete_siff_after_partial_resumes_restate(tmp_path, future_date, theater_index):
    history = [
        _indie_row(future_date, film="Old", theater="SIFF Cinema Uptown", source="siff"),
    ]
    logs_dir = tmp_path / "logs"
    _write_json_log(
        logs_dir,
        "siff",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="SIFF Cinema Uptown",
                    date_raw=_fmt(future_date),
                    time_raw="7:00PM",
                    title_raw="New",
                )
            ],
            stats={"restate_safe": True, "scrape_status": STATUS_SUCCESS},
        ),
    )
    _write_json_log(
        logs_dir,
        "beacon",
        FetchResult(records=[], stats={"restate_safe": False, "scrape_status": STATUS_STRUCTURAL_FAILURE}),
    )
    scrape_path = tmp_path / "empty.csv"
    save_csv(scrape_path, [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=logs_dir
    )

    assert any(row["Film"] == "New" for row in history)
    assert not any(row["Film"] == "Old" for row in history)


def test_pipeline_diagnostics_derive_indie_completeness_warnings(tmp_path):
    run_date = "2026-06-26"
    write_scrape_daily_log(
        tmp_path / f"{run_date}_siff.json",
        "siff",
        FetchResult(
            records=[],
            stats={
                "restate_safe": False,
                "scrape_status": STATUS_PARTIAL_FAILURE,
                "program_pages_succeeded": 18,
                "discovered_programs": 20,
                "stale_retention_recommended": True,
            },
        ),
    )
    write_scrape_daily_log(
        tmp_path / f"{run_date}_beacon.json",
        "beacon",
        FetchResult(
            records=[],
            stats={
                "restate_safe": False,
                "scrape_status": STATUS_STRUCTURAL_FAILURE,
                "valid_empty_proof": False,
            },
        ),
    )
    write_scrape_daily_log(
        tmp_path / f"{run_date}_amc.json",
        "amc",
        FetchResult(records=[]),
    )

    diagnostics = load_daily_scrape_diagnostics(run_date, logs_dir=tmp_path)
    assert any("SIFF scrape partial" in warning for warning in diagnostics["siff"].warnings)
    assert any(
        "structurally empty" in warning.casefold() for warning in diagnostics["beacon"].warnings
    )


def test_is_indie_restate_allowed_csv_legacy_empty_guard():
    allowed, reason = is_indie_restate_allowed(
        input_kind="csv", stats=None, existing_future=3, incoming_future=0
    )
    assert allowed is False
    assert reason is not None

    allowed, _ = is_indie_restate_allowed(
        input_kind="csv", stats=None, existing_future=3, incoming_future=2
    )
    assert allowed is True


def test_derived_warnings_skip_legacy_logs_without_metadata():
    assert derived_indie_completeness_warnings("siff", {"records_fetched": 1}) == []
