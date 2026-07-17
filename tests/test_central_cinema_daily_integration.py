"""Central Cinema daily pipeline integration: Option C load, restatement, isolation."""

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
from reel_seattle.adapters.base import FetchResult, RawShowtime
from reel_seattle.adapters.central_cinema import (
    CENTRAL_THEATER_ID,
    fetch_central_cinema_from_fixture_dir,
    write_central_cinema_scrape_log,
)
from reel_seattle.adapters.indie_completeness import reconcile_option_c_restate_safe
from reel_seattle.adapters.scrape_log import daily_log_path, write_scrape_daily_log
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.history_keys import load_theater_index
from reel_seattle.pipeline_report import load_daily_scrape_diagnostics
from reel_seattle.source_identity import source_film_id_from_raw, source_showtime_id_from_raw
from reel_seattle.validate import validate_showtimes_current

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "prototypes" / "central_cinema"
THEATER_IDS = {
    CENTRAL_THEATER_ID,
    "the-beacon",
    "northwest-film-forum",
    "siff-cinema-uptown",
}
SCRAPED_AT = "2026-12-30T12:00:00-08:00"
GENERATED_AT = "2026-12-30T12:05:00-08:00"
RUN_DATE = "2026-12-30"
WINDOW_START = date(2026, 12, 28)
WINDOW_END = date(2027, 1, 10)


@pytest.fixture
def theater_index():
    return load_theater_index()


@pytest.fixture
def theaters_registry(project_root):
    return json.loads((project_root / "data" / "theaters.json").read_text(encoding="utf-8"))


def _fmt(d) -> str:
    return f"{d.month:02d}/{d.day:02d}/{d.year}"


def _indie_row(
    show_date,
    *,
    film: str,
    theater: str,
    source: str = "indie",
    source_film_id: str = "",
    source_showtime_id: str = "",
) -> dict:
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
            "source_film_id": source_film_id
            or ("archive-slug" if source == "central_cinema" else ""),
            "source_showtime_id": source_showtime_id,
        }
    )


def _safe_central_result():
    return fetch_central_cinema_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
        theater_ids=THEATER_IDS,
    )


def _write_central_log(logs_dir: Path, envelope: dict, run_date: str = RUN_DATE) -> Path:
    path = daily_log_path(run_date, "central_cinema", logs_dir=logs_dir)
    write_central_cinema_scrape_log(path, envelope)
    return path


def test_history_fieldnames_include_source_showtime_id():
    assert "source_showtime_id" in HISTORY_FIELDNAMES
    assert HISTORY_FIELDNAMES[-1] == "source_showtime_id"


def test_option_c_records_load_and_preserve_identity(tmp_path, theater_index):
    result = _safe_central_result()
    assert result.restate_safe is True
    logs_dir = tmp_path / "logs"
    _write_central_log(logs_dir, result.log_envelope)

    rows, label, kind, stats = resolve_indie_source_scrape_rows(
        "central_cinema",
        RUN_DATE,
        tmp_path / "missing.csv",
        theater_index,
        logs_dir=logs_dir,
    )
    assert kind == "json"
    assert "central_cinema" in label
    assert stats is not None and stats["restate_safe"] is True
    assert len(rows) == len(result.records)
    assert all(row["Theater"] == "Central Cinema" for row in rows)
    assert all(row["Film"] for row in rows)
    assert all(row.get("source_film_id") for row in rows)
    assert all(str(row.get("source_showtime_id") or "").isdigit() for row in rows)
    assert "independent_source_result" not in rows[0]


def test_first_safe_run_inserts_central_rows(tmp_path, theater_index, theaters_registry):
    today = date(2026, 12, 30)
    result = _safe_central_result()
    logs_dir = tmp_path / "logs"
    _write_central_log(logs_dir, result.log_envelope)
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

    central_rows = [row for row in history if row.get("source") == "central_cinema"]
    assert len(central_rows) >= 1
    assert all(row.get("source_film_id") for row in central_rows)
    assert all(str(row.get("source_showtime_id") or "").isdigit() for row in central_rows)
    assert all(row["Theater"] == "Central Cinema" for row in central_rows)
    assert "Face/Off" in {row["Film"] for row in central_rows} or any(
        "/" in row["Film"] for row in central_rows
    )

    artifact = build_showtimes_current(
        history,
        registry=theaters_registry,
        reference_date=today,
    )
    validate_showtimes_current(artifact)
    assert "central_cinema" in artifact["sources"]
    assert artifact["sources"]["central_cinema"]["showtime_count"] >= 1
    assert "central_cinema" in artifact["sources_included"]


def test_second_safe_run_restates_without_duplicates(tmp_path, theater_index):
    today = date(2026, 12, 30)
    result = _safe_central_result()
    logs_dir = tmp_path / "logs"
    _write_central_log(logs_dir, result.log_envelope)
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
    first_ids = sorted(
        (row.get("source_showtime_id"), row.get("source_film_id"), row.get("Date"), row.get("Time"))
        for row in history
        if row.get("source") == "central_cinema"
    )
    first_count = len(first_ids)

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
    second_ids = sorted(
        (row.get("source_showtime_id"), row.get("source_film_id"), row.get("Date"), row.get("Time"))
        for row in history
        if row.get("source") == "central_cinema"
    )
    assert len(second_ids) == first_count
    assert second_ids == first_ids
    assert len({item[0] for item in second_ids}) == first_count


def test_unsafe_nonempty_preserves_future_and_does_not_partial_insert(tmp_path, theater_index):
    today = date(2026, 12, 30)
    future = today + timedelta(days=3)
    past = today - timedelta(days=10)
    history = [
        _indie_row(
            past,
            film="Past Central",
            theater="Central Cinema",
            source="central_cinema",
            source_showtime_id="111",
        ),
        _indie_row(
            future,
            film="Keep Future Central",
            theater="Central Cinema",
            source="central_cinema",
            source_showtime_id="222",
        ),
        _indie_row(future, film="Keep SIFF", theater="SIFF Cinema Uptown", source="siff"),
        _indie_row(future, film="Keep Beacon", theater="The Beacon", source="beacon"),
        _indie_row(
            future, film="Keep NWFF", theater="Northwest Film Forum", source="nwff"
        ),
    ]
    before_central = [
        copy.deepcopy(row) for row in history if row.get("source") == "central_cinema"
    ]

    result = _safe_central_result()
    envelope = copy.deepcopy(result.log_envelope)
    assert len(envelope["records"]) >= 1
    envelope["mapping"]["restate_safe"] = False
    envelope["stats"]["restate_safe"] = False
    envelope["stats"]["stale_retention_recommended"] = True
    envelope["stats"]["scrape_status"] = "partial_failure"
    envelope["independent_source_result"]["restate_safe"] = False
    envelope["independent_source_result"]["status"] = "partial_failure"

    logs_dir = tmp_path / "logs"
    _write_central_log(logs_dir, envelope)
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

    after_central = [row for row in history if row.get("source") == "central_cinema"]
    assert after_central == before_central
    mapped_titles = {r.title_raw for r in result.records}
    assert not any(row["Film"] in mapped_titles for row in after_central)
    assert any(row["Film"] == "Keep SIFF" for row in history)
    assert any(row["Film"] == "Keep Beacon" for row in history)
    assert any(row["Film"] == "Keep NWFF" for row in history)

    diagnostics = load_daily_scrape_diagnostics(RUN_DATE, logs_dir=logs_dir)
    assert any(
        "retained prior future" in w.casefold()
        for w in diagnostics["central_cinema"].warnings
    )


def test_zero_link_structural_failure_preserves_futures(tmp_path, theater_index):
    today = date(2026, 12, 30)
    future = today + timedelta(days=2)
    history = [
        _indie_row(
            future,
            film="Keep Central",
            theater="Central Cinema",
            source="central_cinema",
            source_showtime_id="999",
        ),
    ]
    before = copy.deepcopy(history)

    logs_dir = tmp_path / "logs"
    write_scrape_daily_log(
        daily_log_path(RUN_DATE, "central_cinema", logs_dir=logs_dir),
        "central_cinema",
        FetchResult(
            records=[],
            stats={
                "restate_safe": False,
                "scrape_status": "structural_failure",
                "stale_retention_recommended": True,
            },
        ),
    )
    # Option C reconciliation requires contract/mapping layers for Central.
    path = daily_log_path(RUN_DATE, "central_cinema", logs_dir=logs_dir)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["independent_source_result"] = {
        "contract_version": "1.0.0",
        "source": "central_cinema",
        "status": "structural_failure",
        "restate_safe": False,
    }
    payload["mapping"] = {
        "status": "unsafe",
        "restate_safe": False,
        "accepted_records": 0,
        "rejected_records": 0,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
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
    assert history == before


def test_safe_valid_empty_clears_future_central(tmp_path, theater_index):
    today = date(2026, 12, 30)
    future = today + timedelta(days=2)
    past = today - timedelta(days=5)
    history = [
        _indie_row(
            past,
            film="Past Central",
            theater="Central Cinema",
            source="central_cinema",
            source_showtime_id="1",
        ),
        _indie_row(
            future,
            film="Clear Me",
            theater="Central Cinema",
            source="central_cinema",
            source_showtime_id="2",
        ),
        _indie_row(future, film="Keep SIFF", theater="SIFF Cinema Uptown", source="siff"),
    ]

    logs_dir = tmp_path / "logs"
    write_scrape_daily_log(
        daily_log_path(RUN_DATE, "central_cinema", logs_dir=logs_dir),
        "central_cinema",
        FetchResult(
            records=[],
            stats={
                "restate_safe": True,
                "scrape_status": "valid_empty",
                "stale_retention_recommended": False,
            },
        ),
    )
    path = daily_log_path(RUN_DATE, "central_cinema", logs_dir=logs_dir)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["independent_source_result"] = {
        "contract_version": "1.0.0",
        "source": "central_cinema",
        "status": "valid_empty",
        "restate_safe": True,
    }
    payload["mapping"] = {
        "status": "success",
        "restate_safe": True,
        "accepted_records": 0,
        "rejected_records": 0,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

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

    assert any(row["Film"] == "Past Central" for row in history)
    assert not any(row["Film"] == "Clear Me" for row in history)
    assert any(row["Film"] == "Keep SIFF" for row in history)


def test_later_safe_run_recovers_from_stale_retention(tmp_path, theater_index):
    today = date(2026, 12, 30)
    future = today + timedelta(days=4)
    history = [
        _indie_row(
            future,
            film="Stale Central",
            theater="Central Cinema",
            source="central_cinema",
            source_showtime_id="555",
        ),
    ]
    result = _safe_central_result()
    logs_dir = tmp_path / "logs"
    _write_central_log(logs_dir, result.log_envelope)
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

    assert not any(row["Film"] == "Stale Central" for row in history)
    assert any(row.get("source") == "central_cinema" for row in history)
    assert all(
        str(row.get("source_showtime_id") or "").isdigit()
        for row in history
        if row.get("source") == "central_cinema"
    )


def test_conflicting_restate_safe_layers_block_restatement():
    payload = {
        "independent_source_result": {"restate_safe": True},
        "mapping": {"restate_safe": False},
        "stats": {"restate_safe": True},
    }
    assert reconcile_option_c_restate_safe(payload) is False


def test_adapter_records_expose_showing_ids_without_composite():
    result = _safe_central_result()
    assert all(source_showtime_id_from_raw(r).isdigit() for r in result.records)
    assert all(source_film_id_from_raw(r) for r in result.records)
    assert all(
        (r.attributes or {}).get("showtime_identity") == "source_showing_id"
        for r in result.records
    )
    assert all("fallback_identity" not in (r.attributes or {}) for r in result.records)
