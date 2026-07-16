"""NWFF daily pipeline integration: Option C load, restatement, isolation."""

from __future__ import annotations

import copy
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from daily_processor import (
    HISTORY_FIELDNAMES,
    normalize_history_row,
    process_indie_csv_data,
    resolve_indie_source_scrape_rows,
    save_csv,
)
from reel_seattle.adapters.indie_completeness import (
    reconcile_option_c_restate_safe,
)
from reel_seattle.adapters.nwff import (
    NWFF_THEATER_ID,
    fetch_nwff_from_fixture_dir,
    write_nwff_scrape_log,
)
from reel_seattle.adapters.scrape_log import daily_log_path, write_scrape_daily_log
from reel_seattle.adapters.base import FetchResult, RawShowtime
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.history_keys import load_theater_index
from reel_seattle.pipeline_report import load_daily_scrape_diagnostics
from reel_seattle.source_identity import source_film_id_from_raw
from reel_seattle.validate import validate_showtimes_current

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "adapters" / "nwff"
THEATER_IDS = {NWFF_THEATER_ID, "the-beacon", "siff-cinema-uptown"}
SCRAPED_AT = "2026-07-15T12:00:00-07:00"
GENERATED_AT = "2026-07-15T12:05:00-07:00"
RUN_DATE = "2026-07-15"


@pytest.fixture
def theater_index():
    return load_theater_index()


@pytest.fixture
def theaters_registry(project_root):
    return json.loads((project_root / "data" / "theaters.json").read_text(encoding="utf-8"))


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
            "source_film_id": "archive-slug" if source == "nwff" else "",
        }
    )


def _safe_nwff_result():
    return fetch_nwff_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 7, 14),
        date(2026, 7, 20),
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )


def _write_nwff_log(logs_dir: Path, envelope: dict, run_date: str = RUN_DATE) -> Path:
    path = daily_log_path(run_date, "nwff", logs_dir=logs_dir)
    write_nwff_scrape_log(path, envelope)
    return path


def test_reconcile_option_c_requires_all_safe_layers():
    payload = {
        "independent_source_result": {"restate_safe": True},
        "mapping": {"restate_safe": True},
        "stats": {"restate_safe": True},
    }
    assert reconcile_option_c_restate_safe(payload) is True
    payload["mapping"]["restate_safe"] = False
    assert reconcile_option_c_restate_safe(payload) is False
    assert reconcile_option_c_restate_safe({"stats": {}}) is None


def test_option_c_records_load_and_preserve_identity(tmp_path, theater_index):
    result = _safe_nwff_result()
    assert result.restate_safe is True
    logs_dir = tmp_path / "logs"
    _write_nwff_log(logs_dir, result.log_envelope)

    rows, label, kind, stats = resolve_indie_source_scrape_rows(
        "nwff",
        RUN_DATE,
        tmp_path / "missing.csv",
        theater_index,
        logs_dir=logs_dir,
    )
    assert kind == "json"
    assert "nwff" in label
    assert stats is not None and stats["restate_safe"] is True
    assert len(rows) == len(result.records)
    assert all(row["Theater"] == "Northwest Film Forum" for row in rows)
    assert all(row["Film"] for row in rows)
    assert all(row.get("source_film_id") for row in rows)
    # Full contract object is not treated as showtime rows.
    assert "independent_source_result" not in rows[0]


def test_first_safe_run_inserts_nwff_rows(tmp_path, theater_index, theaters_registry):
    today = date(2026, 7, 15)
    result = _safe_nwff_result()
    logs_dir = tmp_path / "logs"
    _write_nwff_log(logs_dir, result.log_envelope)
    save_csv(tmp_path / "indieshowtimes.csv", [], fieldnames=HISTORY_FIELDNAMES)

    history: list[dict] = []
    process_indie_csv_data(
        str(tmp_path / "indieshowtimes.csv"),
        history,
        [],
        RUN_DATE,
        theater_index,
        today_date=today,
        run_date_iso=RUN_DATE,
        logs_dir=logs_dir,
    )

    nwff_rows = [row for row in history if row.get("source") == "nwff"]
    assert len(nwff_rows) >= 1
    assert all(row.get("source_film_id") for row in nwff_rows)
    assert all(row["Theater"] == "Northwest Film Forum" for row in nwff_rows)
    assert all(row["Film"] for row in nwff_rows)

    artifact = build_showtimes_current(
        history,
        registry=theaters_registry,
        reference_date=today,
    )
    validate_showtimes_current(artifact)
    assert "nwff" in artifact["sources"]
    assert artifact["sources"]["nwff"]["showtime_count"] >= 1
    assert "nwff" in artifact["sources_included"]


def test_second_safe_run_restates_without_duplicates(tmp_path, theater_index):
    today = date(2026, 7, 15)
    result = _safe_nwff_result()
    logs_dir = tmp_path / "logs"
    _write_nwff_log(logs_dir, result.log_envelope)
    save_csv(tmp_path / "indieshowtimes.csv", [], fieldnames=HISTORY_FIELDNAMES)

    history: list[dict] = []
    process_indie_csv_data(
        str(tmp_path / "indieshowtimes.csv"),
        history,
        [],
        RUN_DATE,
        theater_index,
        today_date=today,
        run_date_iso=RUN_DATE,
        logs_dir=logs_dir,
    )
    first_count = len([row for row in history if row.get("source") == "nwff"])
    first_ids = sorted(
        (row.get("source_film_id"), row.get("Date"), row.get("Time"), row.get("Film"))
        for row in history
        if row.get("source") == "nwff"
    )

    # Mutate one title in a second safe envelope (same identities).
    envelope = copy.deepcopy(result.log_envelope)
    process_indie_csv_data(
        str(tmp_path / "indieshowtimes.csv"),
        history,
        [],
        RUN_DATE,
        theater_index,
        today_date=today,
        run_date_iso=RUN_DATE,
        logs_dir=logs_dir,
    )
    second_count = len([row for row in history if row.get("source") == "nwff"])
    second_ids = sorted(
        (row.get("source_film_id"), row.get("Date"), row.get("Time"), row.get("Film"))
        for row in history
        if row.get("source") == "nwff"
    )
    assert second_count == first_count
    assert second_ids == first_ids


def test_unsafe_nonempty_preserves_future_and_does_not_partial_insert(
    tmp_path, theater_index
):
    today = date(2026, 7, 15)
    future = today + timedelta(days=3)
    past = today - timedelta(days=10)
    history = [
        _indie_row(past, film="Past NWFF", theater="Northwest Film Forum", source="nwff"),
        _indie_row(
            future, film="Keep Future NWFF", theater="Northwest Film Forum", source="nwff"
        ),
        _indie_row(future, film="Keep SIFF", theater="SIFF Cinema Uptown", source="siff"),
        _indie_row(future, film="Keep Beacon", theater="The Beacon", source="beacon"),
    ]
    before_nwff = [copy.deepcopy(row) for row in history if row.get("source") == "nwff"]

    result = _safe_nwff_result()
    envelope = copy.deepcopy(result.log_envelope)
    assert len(envelope["records"]) >= 1
    envelope["mapping"]["restate_safe"] = False
    envelope["stats"]["restate_safe"] = False
    envelope["stats"]["stale_retention_recommended"] = True
    envelope["stats"]["scrape_status"] = "partial_failure"
    envelope["independent_source_result"]["restate_safe"] = False
    envelope["independent_source_result"]["status"] = "partial_failure"

    logs_dir = tmp_path / "logs"
    _write_nwff_log(logs_dir, envelope)
    write_scrape_daily_log(
        daily_log_path(RUN_DATE, "siff", logs_dir=logs_dir),
        "siff",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="SIFF Cinema Uptown",
                    date_raw=_fmt(future),
                    time_raw="7:00PM",
                    title_raw="Keep SIFF",
                )
            ],
            stats={"restate_safe": True, "scrape_status": "success"},
        ),
    )
    write_scrape_daily_log(
        daily_log_path(RUN_DATE, "beacon", logs_dir=logs_dir),
        "beacon",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="The Beacon",
                    date_raw=_fmt(future),
                    time_raw="8:00PM",
                    title_raw="Keep Beacon",
                )
            ],
            stats={"restate_safe": True, "scrape_status": "success"},
        ),
    )
    save_csv(tmp_path / "indieshowtimes.csv", [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(tmp_path / "indieshowtimes.csv"),
        history,
        [],
        RUN_DATE,
        theater_index,
        today_date=today,
        run_date_iso=RUN_DATE,
        logs_dir=logs_dir,
    )

    after_nwff = [row for row in history if row.get("source") == "nwff"]
    assert after_nwff == before_nwff
    mapped_titles = {r.title_raw for r in result.records}
    assert not any(row["Film"] in mapped_titles for row in after_nwff)
    assert any(row["Film"] == "Keep SIFF" for row in history)
    assert any(row["Film"] == "Keep Beacon" for row in history)

    diagnostics = load_daily_scrape_diagnostics(RUN_DATE, logs_dir=logs_dir)
    assert any("retained prior future" in w.casefold() for w in diagnostics["nwff"].warnings)


def test_safe_valid_empty_clears_future_nwff(tmp_path, theater_index):
    today = date(2026, 7, 15)
    future = today + timedelta(days=2)
    past = today - timedelta(days=5)
    history = [
        _indie_row(past, film="Past NWFF", theater="Northwest Film Forum", source="nwff"),
        _indie_row(future, film="Clear Me", theater="Northwest Film Forum", source="nwff"),
        _indie_row(future, film="Keep SIFF", theater="SIFF Cinema Uptown", source="siff"),
    ]

    logs_dir = tmp_path / "logs"
    write_scrape_daily_log(
        daily_log_path(RUN_DATE, "nwff", logs_dir=logs_dir),
        "nwff",
        FetchResult(
            records=[],
            stats={
                "restate_safe": True,
                "scrape_status": "valid_empty",
                "stale_retention_recommended": False,
            },
        ),
    )
    write_scrape_daily_log(
        daily_log_path(RUN_DATE, "siff", logs_dir=logs_dir),
        "siff",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="SIFF Cinema Uptown",
                    date_raw=_fmt(future),
                    time_raw="7:00PM",
                    title_raw="Keep SIFF",
                )
            ],
            stats={"restate_safe": True, "scrape_status": "success"},
        ),
    )
    save_csv(tmp_path / "indieshowtimes.csv", [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(tmp_path / "indieshowtimes.csv"),
        history,
        [],
        RUN_DATE,
        theater_index,
        today_date=today,
        run_date_iso=RUN_DATE,
        logs_dir=logs_dir,
    )

    assert any(row["Film"] == "Past NWFF" for row in history)
    assert not any(row["Film"] == "Clear Me" for row in history)
    assert any(row["Film"] == "Keep SIFF" for row in history)


def test_later_safe_run_recovers_from_stale_retention(tmp_path, theater_index):
    today = date(2026, 7, 15)
    future = today + timedelta(days=4)
    history = [
        _indie_row(
            future, film="Stale NWFF", theater="Northwest Film Forum", source="nwff"
        ),
    ]
    result = _safe_nwff_result()
    logs_dir = tmp_path / "logs"
    _write_nwff_log(logs_dir, result.log_envelope)
    save_csv(tmp_path / "indieshowtimes.csv", [], fieldnames=HISTORY_FIELDNAMES)

    process_indie_csv_data(
        str(tmp_path / "indieshowtimes.csv"),
        history,
        [],
        RUN_DATE,
        theater_index,
        today_date=today,
        run_date_iso=RUN_DATE,
        logs_dir=logs_dir,
    )

    assert not any(row["Film"] == "Stale NWFF" for row in history)
    assert any(row.get("source") == "nwff" for row in history)
    assert all(source_film_id_from_raw(r) for r in result.records)
