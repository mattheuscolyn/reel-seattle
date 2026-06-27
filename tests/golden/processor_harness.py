"""Offline harness for processor golden fixture tests."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import daily_processor
from daily_processor import (
    HISTORY_FIELDNAMES,
    normalize_history_row,
    process_daily_core,
    read_csv,
    save_csv,
)
from reel_seattle.emit.current import write_showtimes_current
from reel_seattle.history_keys import load_theater_index
from reel_seattle.pipeline_report import write_pipeline_report
from reel_seattle.validate import validate_pipeline_report, validate_showtimes_current

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "processor"
REFERENCE_DATE = date(2026, 6, 26)
REFERENCE_TODAY = "2026-06-26"


@dataclass
class ProcessorGoldenResult:
    history: list[dict]
    current_artifact: dict
    pipeline_report: dict
    history_path: Path
    current_path: Path
    report_path: Path


def run_processor_golden(tmp_path: Path) -> ProcessorGoldenResult:
    """Run the processor pipeline against fixture CSVs in a temp directory."""
    history_path = tmp_path / "data" / "history" / "showtimes_history.csv"
    amc_path = tmp_path / "public" / "showtimes.csv"
    indie_path = tmp_path / "public" / "indieshowtimes.csv"
    announcements_path = tmp_path / "public" / "data" / "movies_announcements.csv"
    current_path = tmp_path / "public" / "data" / "showtimes_current.json"
    report_path = tmp_path / "public" / "data" / "pipeline_report.json"
    registry_path = Path(__file__).resolve().parents[2] / "data" / "theaters.json"

    history_path.parent.mkdir(parents=True, exist_ok=True)
    amc_path.parent.mkdir(parents=True, exist_ok=True)
    indie_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FIXTURES_DIR / "history_seed.csv", history_path)
    shutil.copy2(FIXTURES_DIR / "amc_scrape.csv", amc_path)
    shutil.copy2(FIXTURES_DIR / "indie_scrape.csv", indie_path)
    announcements_path.parent.mkdir(parents=True, exist_ok=True)
    announcements_path.write_text(
        "Film,Theater,first_announced_date,last_seen_date\n",
        encoding="utf-8",
    )

    history_data = [normalize_history_row(row) for row in read_csv(str(history_path))]
    announcements_data = read_csv(str(announcements_path))
    theater_index = load_theater_index(registry_path)

    process_daily_core(
        history_data,
        announcements_data,
        indie_csv_path=str(indie_path),
        amc_csv_path=str(amc_path),
        today=REFERENCE_TODAY,
        theater_index=theater_index,
        today_date=REFERENCE_DATE,
        run_date_iso=REFERENCE_TODAY,
        logs_dir=tmp_path / "daily_logs",
    )

    save_csv(str(history_path), history_data, fieldnames=HISTORY_FIELDNAMES)

    current_artifact = write_showtimes_current(
        history_data,
        output_path=current_path,
        registry_path=registry_path,
        reference_date=REFERENCE_DATE,
    )
    pipeline_report = write_pipeline_report(
        current_artifact,
        output_path=report_path,
    )

    validate_showtimes_current(current_artifact)
    validate_pipeline_report(pipeline_report)

    return ProcessorGoldenResult(
        history=history_data,
        current_artifact=current_artifact,
        pipeline_report=pipeline_report,
        history_path=history_path,
        current_path=current_path,
        report_path=report_path,
    )


def history_films(history: list[dict]) -> set[str]:
    return {row["Film"] for row in history}


def future_rows(history: list[dict], *, source: str | None = None) -> list[dict]:
    rows = []
    for row in history:
        show_date = daily_processor.parse_history_date(row.get("Date", ""))
        if show_date is None or show_date < REFERENCE_DATE:
            continue
        if source is not None and row.get("source") != source:
            continue
        rows.append(row)
    return rows
