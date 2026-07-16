"""Tests for SIFF/Beacon independent ingestion inventory audit."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from reel_seattle.analysis.independent_ingestion_audit import (
    build_independent_ingestion_audit,
    list_source_scrape_logs,
    summarize_source_logs,
    write_audit_json,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "analysis" / "independent_ingestion"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
GENERATED_AT = "2026-07-16T12:00:00-07:00"


def _write_log(path: Path, *, source: str, records: list[dict], warnings: list[str] | None = None) -> None:
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0.0",
                "generated_at": GENERATED_AT,
                "source": source,
                "records": records,
                "stats": {"record_count": len(records)},
                "warnings": warnings or [],
                "errors": [],
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def test_logs_detected_and_theaters_summarized(tmp_path: Path):
    logs = tmp_path / "logs"
    logs.mkdir()
    _write_log(
        logs / "2026-07-15_siff.json",
        source="siff",
        records=[
            {
                "theater_name_raw": "SIFF Cinema Downtown",
                "date_raw": "07/15/2026",
                "time_raw": "7:00 PM",
                "title_raw": "Exact Title",
                "source_film_url": "https://www.siff.net/cinema/in-theaters/exact-title",
                "source_showtime_id": None,
            },
            {
                "theater_name_raw": "SIFF Cinema Uptown",
                "date_raw": "07/15/2026",
                "time_raw": "9:00 PM",
                "title_raw": "Exact Title",
                "source_film_url": "https://www.siff.net/cinema/in-theaters/exact-title",
            },
        ],
    )
    _write_log(logs / "2026-07-16_siff.json", source="siff", records=[])
    _write_log(logs / "2026-07-15_beacon.json", source="beacon", records=[])
    _write_log(
        logs / "2026-07-16_beacon.json",
        source="beacon",
        records=[
            {
                "theater_name_raw": "The Beacon",
                "date_raw": "07/16/2026",
                "time_raw": "8:00 PM",
                "title_raw": "Welcome Ii The Terrordome",
                "source_film_url": "https://thebeacon.film/calendar/movie/welcome",
            }
        ],
    )

    report = build_independent_ingestion_audit(
        logs_dir=logs,
        max_logs=7,
        generated_at=GENERATED_AT,
    )
    assert report["sources"]["siff"]["distinct_theaters"] == 2
    assert report["sources"]["siff"]["records_with_source_film_url"] == 2
    assert report["sources"]["siff"]["records_with_source_showtime_id"] == 0
    assert report["sources"]["siff"]["empty_log_days"] == 1
    assert report["sources"]["beacon"]["empty_log_days_without_warnings"] == 1
    assert report["sources"]["beacon"]["title_samples"][0] == "Welcome Ii The Terrordome"
    assert report["findings"]["both_lack_source_showtime_ids_in_recent_logs"] is True

    out = write_audit_json(report, tmp_path / "out.json")
    assert out.is_file()
    # Deterministic key order via json.dumps default insertion order + sorted files.
    again = build_independent_ingestion_audit(
        logs_dir=logs, max_logs=7, generated_at=GENERATED_AT
    )
    assert json.dumps(report, sort_keys=True) == json.dumps(again, sort_keys=True)


def test_list_logs_selects_newest(tmp_path: Path):
    logs = tmp_path / "logs"
    logs.mkdir()
    for name in ("2026-07-01_beacon.json", "2026-07-10_beacon.json", "2026-07-16_beacon.json"):
        _write_log(logs / name, source="beacon", records=[])
    selected = list_source_scrape_logs(logs, "beacon", max_logs=2)
    assert [p.name for p in selected] == ["2026-07-10_beacon.json", "2026-07-16_beacon.json"]


def test_duplicate_title_metrics_and_program_urls(tmp_path: Path):
    summary = summarize_source_logs(
        [
            {
                "name": "day.json",
                "warnings": [],
                "errors": [],
                "malformed_records": 0,
                "records": [
                    {
                        "theater_name_raw": "The Beacon",
                        "title_raw": "Same",
                        "source_film_url": "https://thebeacon.film/calendar/movie/a",
                        "source_showtime_id": "1",
                    },
                    {
                        "theater_name_raw": "The Beacon",
                        "title_raw": "Same",
                        "source_film_url": "https://thebeacon.film/calendar/movie/a",
                        "source_showtime_id": "2",
                    },
                ],
            }
        ]
    )
    assert summary["distinct_titles"] == 1
    assert summary["distinct_source_film_urls"] == 1
    assert summary["distinct_source_showtime_ids"] == 2
    assert summary["identity_notes"]["source_showtime_id_populated"] is True


def test_cli_end_to_end(tmp_path: Path):
    logs = tmp_path / "logs"
    logs.mkdir()
    _write_log(logs / "2026-07-16_siff.json", source="siff", records=[])
    _write_log(logs / "2026-07-16_beacon.json", source="beacon", records=[])
    out = tmp_path / "audit.json"
    result = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "audit_independent_ingestion.py"),
            "--logs-dir",
            str(logs),
            "--output",
            str(out),
            "--generated-at",
            GENERATED_AT,
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert out.is_file()
