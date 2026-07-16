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
from reel_seattle.adapters.base import FetchResult
from reel_seattle.adapters.scrape_log import write_scrape_daily_log
from reel_seattle.pipeline_report import (
    SourceScrapeDiagnostics,
    build_pipeline_report,
    load_daily_scrape_diagnostics,
    write_pipeline_report,
)
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
    assert set(artifact["sources"]) == {"amc", "siff", "beacon", "nwff"}
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


def test_build_pipeline_report_without_diagnostics_uses_empty_arrays(theaters_registry):
    artifact = _build_artifact([_history_row(REFERENCE)], theaters_registry)
    report = build_pipeline_report(artifact)

    for source in ("amc", "siff", "beacon", "nwff"):
        assert report["sources"][source]["warnings"] == []
        assert report["sources"][source]["errors"] == []
    validate_pipeline_report(report)


def test_build_pipeline_report_forwards_scrape_diagnostics(theaters_registry):
    artifact = _build_artifact([_history_row(REFERENCE)], theaters_registry)
    diagnostics = {
        "amc": SourceScrapeDiagnostics(("adapter warning",), ("adapter error",)),
        "siff": SourceScrapeDiagnostics(("siff warning",), ()),
        "beacon": SourceScrapeDiagnostics((), ()),
        "nwff": SourceScrapeDiagnostics((), ()),
    }

    report = build_pipeline_report(artifact, scrape_diagnostics=diagnostics)

    assert report["sources"]["amc"]["warnings"] == ["adapter warning"]
    assert report["sources"]["amc"]["errors"] == ["adapter error"]
    assert report["sources"]["siff"]["warnings"] == ["siff warning"]
    assert report["sources"]["beacon"]["warnings"] == []
    assert report["sources"]["amc"]["status"] == "success"
    validate_pipeline_report(report)


def test_load_daily_scrape_diagnostics_forwards_log_messages(
    tmp_path, amc_raw_fixture
):
    run_date = "2026-06-26"
    write_scrape_daily_log(
        tmp_path / f"{run_date}_amc.json",
        "amc",
        FetchResult(
            records=[amc_raw_fixture],
            stats={"records_fetched": 1},
            warnings=["fetch warning"],
            errors=["fetch error"],
        ),
    )
    write_scrape_daily_log(
        tmp_path / f"{run_date}_siff.json",
        "siff",
        FetchResult(records=[], warnings=["siff warning"], errors=[]),
    )
    write_scrape_daily_log(
        tmp_path / f"{run_date}_beacon.json",
        "beacon",
        FetchResult(records=[], warnings=[], errors=[]),
    )

    diagnostics = load_daily_scrape_diagnostics(run_date, logs_dir=tmp_path)

    assert diagnostics["amc"].warnings == ("fetch warning",)
    assert diagnostics["amc"].errors == ("fetch error",)
    assert diagnostics["siff"].warnings == ("siff warning",)
    assert diagnostics["beacon"].warnings == ()
    assert diagnostics["beacon"].errors == ()


@pytest.fixture
def amc_raw_fixture():
    from reel_seattle.adapters.amc import api_showtime_to_raw

    fixture_path = Path(__file__).resolve().parents[1] / "fixtures" / "adapters" / "amc_api_showtime.json"
    api_showtime = json.loads(fixture_path.read_text(encoding="utf-8"))
    return api_showtime_to_raw(api_showtime, "AMC Pacific Place 11")


def test_load_daily_scrape_diagnostics_warns_on_missing_log(tmp_path):
    diagnostics = load_daily_scrape_diagnostics("2026-06-26", logs_dir=tmp_path)

    assert len(diagnostics) == 4
    for source in ("amc", "siff", "beacon", "nwff"):
        assert len(diagnostics[source].warnings) == 1
        assert "No daily scrape log found" in diagnostics[source].warnings[0]
        assert source in diagnostics[source].warnings[0]
        assert diagnostics[source].errors == ()


def test_load_daily_scrape_diagnostics_derives_amc_allowlist_warnings(tmp_path, amc_raw_fixture):
    run_date = "2026-06-26"
    write_scrape_daily_log(
        tmp_path / f"{run_date}_amc.json",
        "amc",
        FetchResult(
            records=[amc_raw_fixture],
            stats={
                "records_fetched": 1,
                "allowlist_unknown": 2,
                "allowlist_disabled": 1,
            },
        ),
    )

    diagnostics = load_daily_scrape_diagnostics(run_date, logs_dir=tmp_path)

    assert "AMC allowlist: 2 unknown theaters skipped" in diagnostics["amc"].warnings
    assert "AMC allowlist: 1 disabled registry matches skipped" in diagnostics["amc"].warnings


def test_load_daily_scrape_diagnostics_names_amc_skipped_theaters(tmp_path, amc_raw_fixture):
    run_date = "2026-06-26"
    write_scrape_daily_log(
        tmp_path / f"{run_date}_amc.json",
        "amc",
        FetchResult(
            records=[amc_raw_fixture],
            stats={
                "records_fetched": 1,
                "allowlist_unknown": 2,
                "allowlist_disabled": 2,
                "allowlist_unknown_theaters": [
                    {"name": "AMC River Park Square 20", "id": "701"},
                    {"id": "702"},
                ],
                "allowlist_disabled_theaters": [
                    {"name": "AMC Kitsap 8", "id": "700", "registry_id": "amc-kitsap-8"},
                    {"name": "AMC Lakewood Mall 12", "id": "800"},
                ],
            },
        ),
    )

    diagnostics = load_daily_scrape_diagnostics(run_date, logs_dir=tmp_path)

    assert (
        "AMC allowlist: 2 unknown theaters skipped: AMC River Park Square 20, 702"
        in diagnostics["amc"].warnings
    )
    assert (
        "AMC allowlist: 2 disabled registry matches skipped: "
        "AMC Kitsap 8, AMC Lakewood Mall 12" in diagnostics["amc"].warnings
    )


def test_load_daily_scrape_diagnostics_amc_count_only_fallback(tmp_path, amc_raw_fixture):
    run_date = "2026-06-26"
    write_scrape_daily_log(
        tmp_path / f"{run_date}_amc.json",
        "amc",
        FetchResult(
            records=[amc_raw_fixture],
            stats={
                "records_fetched": 1,
                "allowlist_unknown": 2,
                "allowlist_disabled": 1,
                "allowlist_unknown_theaters": [],
            },
        ),
    )

    diagnostics = load_daily_scrape_diagnostics(run_date, logs_dir=tmp_path)

    assert "AMC allowlist: 2 unknown theaters skipped" in diagnostics["amc"].warnings
    assert "AMC allowlist: 1 disabled registry matches skipped" in diagnostics["amc"].warnings


def test_write_pipeline_report_with_run_date_loads_logs(
    tmp_path, theaters_registry, amc_raw_fixture
):
    artifact = _build_artifact([_history_row(REFERENCE)], theaters_registry)
    run_date = "2026-06-26"
    logs_dir = tmp_path / "daily_logs"
    write_scrape_daily_log(
        logs_dir / f"{run_date}_amc.json",
        "amc",
        FetchResult(records=[amc_raw_fixture], warnings=["loaded warning"], errors=[]),
    )

    report = write_pipeline_report(
        artifact,
        output_path=tmp_path / "pipeline_report.json",
        run_date=run_date,
        logs_dir=logs_dir,
    )

    assert report["sources"]["amc"]["warnings"] == ["loaded warning"]
    assert "No daily scrape log found" in report["sources"]["siff"]["warnings"][0]
    validate_pipeline_report(report)
