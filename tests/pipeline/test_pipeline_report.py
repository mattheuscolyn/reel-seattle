"""Tests for pipeline report and source freshness."""

from __future__ import annotations

import copy
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.normalize import build_theater_index, format_date_csv
from reel_seattle.pipeline_report import build_pipeline_report, write_pipeline_report
from reel_seattle.source_freshness import (
    build_sources_metadata,
    empty_history_evidence,
    scan_history_source_evidence,
)
from reel_seattle.validate import (
    PIPELINE_REPORT_SCHEMA_PATH,
    SchemaValidationError,
    validate_pipeline_report,
    validate_showtimes_current,
)

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)
GENERATED_AT = datetime(2026, 6, 26, 0, 0, 0, tzinfo=PACIFIC)


def _history_row(
    show_date: date,
    *,
    film: str = "Sinners",
    theater: str = "AMC Pacific Place 11",
    time: str = "7:30PM",
    last_updated: str = "2026-06-12",
    source: str = "amc",
) -> dict[str, str]:
    return {
        "Date": format_date_csv(show_date),
        "Time": time,
        "Theater": theater,
        "Film": film,
        "Runtime": "137",
        "isAlmostSoldOut": "None",
        "posterDynamic": "https://example.com/poster.jpg",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-01",
        "last_updated": last_updated,
        "source": source,
    }


def _build_artifact(history_rows, theaters_registry):
    return build_showtimes_current(
        history_rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )


def test_pipeline_report_shape_validates(theaters_registry):
    rows = [
        _history_row(REFERENCE, theater="AMC Pacific Place 11"),
        _history_row(
            REFERENCE,
            film="Beacon Film",
            theater="The Beacon",
            source="indie",
        ),
    ]
    artifact = _build_artifact(rows, theaters_registry)
    report = build_pipeline_report(artifact)
    validate_pipeline_report(report)


def test_source_with_current_showtimes_is_success(theaters_registry):
    artifact = _build_artifact(
        [_history_row(REFERENCE, theater="SIFF Cinema Uptown", source="indie")],
        theaters_registry,
    )
    assert artifact["sources"]["siff"]["status"] == "success"
    assert artifact["sources"]["siff"]["showtime_count"] == 1
    assert artifact["sources"]["siff"]["last_successful_run"] == "2026-06-12"


def test_source_with_only_historical_rows_is_stale(theaters_registry):
    artifact = _build_artifact(
        [
            _history_row(
                REFERENCE - timedelta(days=30),
                last_updated="2026-06-12",
            )
        ],
        theaters_registry,
    )
    amc = artifact["sources"]["amc"]
    assert amc["status"] == "stale"
    assert amc["showtime_count"] == 0
    assert amc["last_successful_run"] == "2026-06-12"


def test_source_with_no_evidence_is_empty(theaters_registry):
    artifact = _build_artifact([], theaters_registry)
    assert artifact["sources"]["beacon"]["status"] == "empty"
    assert artifact["sources"]["beacon"]["last_successful_run"] is None


def test_last_successful_run_uses_current_last_seen_at(theaters_registry):
    artifact = _build_artifact(
        [
            _history_row(
                REFERENCE,
                theater="The Beacon",
                source="indie",
                last_updated="2026-06-26",
            )
        ],
        theaters_registry,
    )
    assert artifact["sources"]["beacon"]["status"] == "success"
    assert artifact["sources"]["beacon"]["last_successful_run"] == "2026-06-26"


def test_showtimes_current_includes_sources_metadata(theaters_registry):
    artifact = _build_artifact([_history_row(REFERENCE)], theaters_registry)
    assert "sources" in artifact
    assert set(artifact["sources"]) == {"amc", "siff", "beacon"}
    validate_showtimes_current(artifact)


def test_invalid_pipeline_report_fails_validation(theaters_registry):
    artifact = _build_artifact([_history_row(REFERENCE)], theaters_registry)
    report = build_pipeline_report(artifact)
    del report["totals"]

    with pytest.raises(SchemaValidationError) as exc_info:
        validate_pipeline_report(report)

    assert str(PIPELINE_REPORT_SCHEMA_PATH) in str(exc_info.value)


def test_write_pipeline_report_does_not_write_invalid_json(
    tmp_path, theaters_registry
):
    artifact = _build_artifact([_history_row(REFERENCE)], theaters_registry)
    output_path = tmp_path / "pipeline_report.json"

    broken = build_pipeline_report(artifact)
    del broken["status"]

    import reel_seattle.pipeline_report as report_module

    original = report_module.build_pipeline_report
    report_module.build_pipeline_report = lambda *args, **kwargs: broken
    try:
        with pytest.raises(SchemaValidationError):
            write_pipeline_report(artifact, output_path=output_path)
    finally:
        report_module.build_pipeline_report = original

    assert not output_path.exists()


def test_scan_history_source_evidence_single_pass(theaters_registry):
    theater_index = build_theater_index(theaters_registry)
    rows = [
        _history_row(REFERENCE - timedelta(days=40), last_updated="2026-06-12"),
        _history_row(
            REFERENCE,
            theater="The Beacon",
            source="indie",
            last_updated="2026-06-26",
        ),
    ]
    evidence = scan_history_source_evidence(
        rows,
        theater_index,
        reference_date=REFERENCE,
    )
    metadata = build_sources_metadata([], evidence)
    assert metadata["amc"]["status"] == "stale"
    assert metadata["beacon"]["status"] == "stale"
