"""Tests for daily_processor JSON-first scrape input selection."""

from __future__ import annotations

import json
import shutil
from datetime import date
from pathlib import Path

import pytest

import daily_processor
from daily_processor import (
    normalize_history_row,
    process_daily_core,
    read_csv,
    resolve_amc_scrape_rows,
    resolve_indie_source_scrape_rows,
)
from reel_seattle.adapters.amc import api_showtime_to_raw, raw_showtime_to_legacy_row
from reel_seattle.adapters.base import FetchResult, RawShowtime
from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row
from reel_seattle.adapters.scrape_log import ScrapeLogError, daily_log_path, write_scrape_daily_log
from reel_seattle.history_keys import load_theater_index

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "processor"
REFERENCE_DATE = date(2026, 6, 26)
REFERENCE_TODAY = "2026-06-26"
REGISTRY_PATH = Path(__file__).resolve().parents[1] / "data" / "theaters.json"


def _future_history_signature(history: list[dict]) -> list[tuple[str, str, str, str]]:
    rows = []
    for row in history:
        show_date = daily_processor.parse_history_date(row.get("Date", ""))
        if show_date is None or show_date < REFERENCE_DATE:
            continue
        rows.append((row["source"], row["Theater"], row["Film"], row["Date"]))
    return sorted(rows)


def _write_fixture_json_logs(logs_dir: Path) -> None:
    amc_rows = read_csv(str(FIXTURES_DIR / "amc_scrape.csv"))
    amc_records = [
        RawShowtime(
            theater_name_raw=row["Theater"],
            date_raw=row["Date"],
            time_raw=row["Time"],
            title_raw=row["Film"],
            runtime_raw=row.get("Runtime") or "Unknown",
            poster_url_raw=row.get("posterDynamic") or None,
            canceled=row.get("isCanceled", "").strip().lower() == "true",
            format_raw=row.get("premiumFormat") or None,
        )
        for row in amc_rows
        if daily_processor.parse_history_date(row["Date"]) >= REFERENCE_DATE
    ]
    write_scrape_daily_log(
        daily_log_path(REFERENCE_TODAY, "amc", logs_dir=logs_dir),
        "amc",
        FetchResult(records=amc_records),
    )

    indie_rows = read_csv(str(FIXTURES_DIR / "indie_scrape.csv"))
    siff_records = [
        RawShowtime(
            theater_name_raw=row["Theater"],
            date_raw=row["Date"],
            time_raw=row["Time"],
            title_raw=row["Film"],
            runtime_raw=row.get("Runtime") or "Unknown",
            poster_url_raw=row.get("posterDynamic") or None,
        )
        for row in indie_rows
        if row["Theater"].startswith("SIFF")
    ]
    beacon_records = [
        RawShowtime(
            theater_name_raw=row["Theater"],
            date_raw=row["Date"],
            time_raw=row["Time"],
            title_raw=row["Film"],
            runtime_raw=row.get("Runtime") or "Unknown",
        )
        for row in indie_rows
        if row["Theater"] == "The Beacon"
    ]
    write_scrape_daily_log(
        daily_log_path(REFERENCE_TODAY, "siff", logs_dir=logs_dir),
        "siff",
        FetchResult(
            records=siff_records,
            stats={"restate_safe": True, "scrape_status": "success"},
        ),
    )
    write_scrape_daily_log(
        daily_log_path(REFERENCE_TODAY, "beacon", logs_dir=logs_dir),
        "beacon",
        FetchResult(
            records=beacon_records,
            stats={"restate_safe": True, "scrape_status": "success"},
        ),
    )


def _run_processor(tmp_path: Path, *, logs_dir: Path | None) -> list[dict]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    history_path = tmp_path / "history.csv"
    amc_path = tmp_path / "amc.csv"
    indie_path = tmp_path / "indie.csv"
    announcements_path = tmp_path / "announcements.csv"

    shutil.copy2(FIXTURES_DIR / "history_seed.csv", history_path)
    shutil.copy2(FIXTURES_DIR / "amc_scrape.csv", amc_path)
    shutil.copy2(FIXTURES_DIR / "indie_scrape.csv", indie_path)
    announcements_path.write_text(
        "Film,Theater,first_announced_date,last_seen_date\n",
        encoding="utf-8",
    )

    history_data = [normalize_history_row(row) for row in read_csv(str(history_path))]
    announcements_data = read_csv(str(announcements_path))
    theater_index = load_theater_index(REGISTRY_PATH)

    process_daily_core(
        history_data,
        announcements_data,
        indie_csv_path=str(indie_path),
        amc_csv_path=str(amc_path),
        today=REFERENCE_TODAY,
        theater_index=theater_index,
        today_date=REFERENCE_DATE,
        run_date_iso=REFERENCE_TODAY,
        logs_dir=logs_dir or (tmp_path / "missing_logs"),
    )
    return history_data


def test_processor_uses_json_input_when_present(tmp_path):
    logs_dir = tmp_path / "data" / "daily_logs"
    logs_dir.mkdir(parents=True)
    _write_fixture_json_logs(logs_dir)

    history = _run_processor(tmp_path, logs_dir=logs_dir)
    assert "New Future AMC" in {row["Film"] for row in history}
    assert "New Future SIFF" in {row["Film"] for row in history}
    assert "Stale Beacon Film" not in {row["Film"] for row in history}


def test_processor_falls_back_to_csv_when_json_absent(tmp_path):
    history = _run_processor(tmp_path, logs_dir=tmp_path / "missing_logs")
    assert _future_history_signature(history)


def test_json_input_produces_equivalent_future_history_to_csv(tmp_path):
    csv_history = _run_processor(tmp_path / "csv_run", logs_dir=tmp_path / "missing_logs")

    logs_dir = tmp_path / "json_run" / "data" / "daily_logs"
    logs_dir.mkdir(parents=True)
    _write_fixture_json_logs(logs_dir)
    json_history = _run_processor(tmp_path / "json_run", logs_dir=logs_dir)

    assert _future_history_signature(csv_history) == _future_history_signature(json_history)


def test_resolve_amc_scrape_rows_prefers_json(tmp_path):
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    record = RawShowtime(
        theater_name_raw="AMC Pacific Place 11",
        date_raw="06/28/2026",
        time_raw="8:00PM",
        title_raw="JSON AMC Film",
        runtime_raw="120",
    )
    write_scrape_daily_log(
        daily_log_path(REFERENCE_TODAY, "amc", logs_dir=logs_dir),
        "amc",
        FetchResult(records=[record]),
    )

    rows, label, kind = resolve_amc_scrape_rows(
        REFERENCE_TODAY,
        tmp_path / "missing.csv",
        logs_dir=logs_dir,
    )
    assert kind == "json"
    assert label.endswith("_amc.json")
    assert rows[0]["Film"] == "JSON AMC Film"


def test_resolve_amc_scrape_rows_falls_back_to_csv(tmp_path):
    csv_path = tmp_path / "amc.csv"
    shutil.copy2(FIXTURES_DIR / "amc_scrape.csv", csv_path)
    rows, label, kind = resolve_amc_scrape_rows(
        REFERENCE_TODAY,
        csv_path,
        logs_dir=tmp_path / "missing_logs",
    )
    assert kind == "csv"
    assert str(csv_path) in label
    assert rows


def test_resolve_indie_source_scrape_rows_prefers_json(tmp_path):
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    write_scrape_daily_log(
        daily_log_path(REFERENCE_TODAY, "siff", logs_dir=logs_dir),
        "siff",
        FetchResult(
            records=[
                RawShowtime(
                    theater_name_raw="SIFF Cinema Uptown",
                    date_raw="07/01/2026",
                    time_raw="5:00PM",
                    title_raw="JSON SIFF Film",
                    runtime_raw="130",
                )
            ]
        ),
    )
    theater_index = load_theater_index(REGISTRY_PATH)
    rows, label, kind, stats = resolve_indie_source_scrape_rows(
        "siff",
        REFERENCE_TODAY,
        tmp_path / "missing.csv",
        theater_index,
        logs_dir=logs_dir,
    )
    assert kind == "json"
    assert rows[0]["Film"] == "JSON SIFF Film"
    assert isinstance(stats, dict)


def test_malformed_json_does_not_fall_back_to_csv(tmp_path):
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    bad_path = daily_log_path(REFERENCE_TODAY, "amc", logs_dir=logs_dir)
    bad_path.write_text("{bad", encoding="utf-8")

    csv_path = tmp_path / "amc.csv"
    shutil.copy2(FIXTURES_DIR / "amc_scrape.csv", csv_path)

    with pytest.raises(ScrapeLogError):
        resolve_amc_scrape_rows(REFERENCE_TODAY, csv_path, logs_dir=logs_dir)


def test_json_legacy_row_conversion_matches_fixture_csv():
    amc_row = read_csv(str(FIXTURES_DIR / "amc_scrape.csv"))[0]
    api_showtime = json.loads(
        (Path(__file__).resolve().parent / "fixtures" / "adapters" / "amc_api_showtime.json").read_text(
            encoding="utf-8"
        )
    )
    raw = api_showtime_to_raw(api_showtime, amc_row["Theater"])
    converted = raw_showtime_to_legacy_row(raw)
    assert converted["Date"] == amc_row["Date"]
    assert converted["Film"] == amc_row["Film"]
    assert converted["Theater"] == amc_row["Theater"]

    indie_row = [row for row in read_csv(str(FIXTURES_DIR / "indie_scrape.csv")) if row["Theater"].startswith("SIFF")][0]
    indie_raw = RawShowtime(
        theater_name_raw=indie_row["Theater"],
        date_raw=indie_row["Date"],
        time_raw=indie_row["Time"],
        title_raw=indie_row["Film"],
        runtime_raw=indie_row["Runtime"],
        poster_url_raw=indie_row.get("posterDynamic") or None,
    )
    indie_converted = raw_showtime_to_legacy_row(indie_raw)
    assert indie_converted["Date"] == indie_row["Date"]
    assert indie_converted["Film"] == indie_row["Film"]
