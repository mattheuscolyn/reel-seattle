"""Tests for the read-only film pipeline source metadata audit."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from reel_seattle.analysis.film_pipeline_source_audit import (
    build_film_pipeline_source_audit,
    latest_source_log,
    summarize_source_log,
    write_audit_json,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STAMP = "2026-09-28T12:00:00-07:00"


def _record(
    title: str,
    *,
    source_film_id: str,
    runtime: str | None,
    release_year: int | None = None,
    identity_title: str | None = None,
    program_series: str | None = None,
) -> dict:
    attrs: dict[str, object] = {"source_film_id": source_film_id}
    if release_year is not None:
        attrs["release_year"] = release_year
    if identity_title is not None:
        attrs["identity_title"] = identity_title
    if program_series is not None:
        attrs["program_series"] = program_series
    return {
        "theater_name_raw": "Example Theater",
        "date_raw": "09/28/2026",
        "time_raw": "7:00 PM",
        "title_raw": title,
        "runtime_raw": runtime,
        "attributes": attrs,
    }


def _write_log(path: Path, source: str, records: list[dict]) -> None:
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0.0",
                "generated_at": STAMP,
                "source": source,
                "records": records,
                "stats": {"record_count": len(records)},
                "warnings": [],
                "errors": [],
            }
        ),
        encoding="utf-8",
    )


def test_latest_source_log_selects_newest(tmp_path: Path):
    _write_log(tmp_path / "2026-09-27_beacon.json", "beacon", [])
    _write_log(tmp_path / "2026-09-28_beacon.json", "beacon", [])
    assert latest_source_log(tmp_path, "beacon").name == "2026-09-28_beacon.json"


def test_summary_is_source_identity_grain_and_ignores_program_runtime_gap():
    records = [
        _record(
            "SECS FEST PRESENTS DRILLER",
            source_film_id="driller",
            runtime="60",
            release_year=1984,
            identity_title="DRILLER",
            program_series="Secs Fest Presents",
        ),
        _record(
            "SECS FEST PRESENTS DRILLER",
            source_film_id="driller",
            runtime="60",
            release_year=1984,
            identity_title="DRILLER",
            program_series="Secs Fest Presents",
        ),
        _record(
            "UNIVERSAL MONSTER MASH DOUBLE FEATURE",
            source_film_id="monster-mash",
            runtime=None,
        ),
    ]
    summary = summarize_source_log(
        source="beacon",
        log={
            "path": "latest.json",
            "generated_at": STAMP,
            "records": records,
            "warnings": [],
            "errors": [],
            "malformed_record_count": 0,
        },
    )

    assert summary["record_count"] == 3
    assert summary["source_identity_count"] == 2
    assert summary["eligible_feature_count"] == 1
    assert summary["runtime"]["eligible_features_missing_runtime"] == 0
    assert summary["release_year"]["eligible_features_missing_year"] == 0
    assert summary["series"]["identity_count"] == 1
    assert summary["cleanup"]["adapter_cleaned_identity_count"] == 1
    assert summary["entity_kind_counts"]["double_feature"] == 1


def test_build_audit_distinguishes_source_year_limitation_from_actionable_gap(tmp_path: Path):
    _write_log(
        tmp_path / "2026-09-28_anderson_school.json",
        "anderson_school",
        [
            _record(
                "Wildwood",
                source_film_id="ST00003280",
                runtime="132",
            )
        ],
    )
    _write_log(
        tmp_path / "2026-09-28_siff.json",
        "siff",
        [
            _record(
                "Nature is a Language (16mm & 35mm)",
                source_film_id="nature-is-a-language",
                runtime="94",
            )
        ],
    )

    report = build_film_pipeline_source_audit(
        logs_dir=tmp_path,
        sources=("anderson_school", "siff"),
        generated_at=STAMP,
    )

    assert report["sources"]["anderson_school"]["release_year"]["strategy"] == (
        "not_exposed_by_listing"
    )
    assert report["sources"]["anderson_school"]["release_year"][
        "eligible_features_missing_year"
    ] == 1
    assert report["sources"]["siff"]["cleanup"]["matcher_cleaned_identity_count"] == 1
    # Nature is a Language is an eleven-film program, so it must not count as
    # an eligible feature with a missing release year.
    assert report["sources"]["siff"]["eligible_feature_count"] == 0
    assert report["findings"]["sources_with_feature_year_gaps_requiring_review"] == []
    assert report["findings"]["sources_where_listing_does_not_expose_release_year"] == [
        "anderson_school"
    ]


def test_missing_log_is_reported_not_fatal(tmp_path: Path):
    _write_log(tmp_path / "2026-09-28_beacon.json", "beacon", [])
    report = build_film_pipeline_source_audit(
        logs_dir=tmp_path,
        sources=("beacon", "majestic_bay"),
        generated_at=STAMP,
    )
    assert report["sources"]["majestic_bay"]["status"] == "missing_log"
    assert report["findings"]["missing_logs"] == ["majestic_bay"]


def test_write_and_cli(tmp_path: Path):
    logs = tmp_path / "logs"
    logs.mkdir()
    _write_log(
        logs / "2026-09-28_beacon.json",
        "beacon",
        [
            _record(
                "DRILLER",
                source_film_id="driller",
                runtime="60",
                release_year=1984,
            )
        ],
    )
    report = build_film_pipeline_source_audit(
        logs_dir=logs,
        sources=("beacon",),
        generated_at=STAMP,
    )
    direct = write_audit_json(report, tmp_path / "direct.json")
    assert direct.is_file()

    out = tmp_path / "cli.json"
    result = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "audit_film_pipeline_sources.py"),
            "--logs-dir",
            str(logs),
            "--source",
            "beacon",
            "--generated-at",
            STAMP,
            "--output",
            str(out),
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert out.is_file()
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["sources"]["beacon"]["source_identity_count"] == 1
