"""Tests for the manual AMC IMDb coverage audit (offline only)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from reel_seattle.analysis.amc_imdb_coverage import (
    IMDB_STATUS_MALFORMED,
    IMDB_STATUS_MISSING,
    IMDB_STATUS_REQUEST_FAILED,
    IMDB_STATUS_RESPONSE_INVALID,
    IMDB_STATUS_VALID,
    MovieIdPlan,
    assert_no_secret_leakage,
    build_report,
    classify_movie_lookup,
    extract_movie_plans_from_scrape_log,
    extract_movie_plans_from_showtimes_current,
    load_offline_fixture_fetch,
    normalize_imdb_id,
    run_movie_lookups,
    sanitize_error_message,
    write_audit_outputs,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "audit"
MOVIES = FIXTURES / "amc_movies"


def test_extract_distinct_ids_from_scrape_log():
    payload = json.loads((FIXTURES / "source_amc_scrape_log.json").read_text(encoding="utf-8"))
    plan = extract_movie_plans_from_scrape_log(payload, source_label="fixture-scrape")
    ids = [p.amc_movie_id for p in plan.plans]
    assert "13534" in ids
    assert "" not in ids
    assert ids.count("13534") == 1
    assert plan.raw_amc_records == 13
    toy = next(p for p in plan.plans if p.amc_movie_id == "13534")
    assert toy.source_title == "Toy Story 3"
    assert toy.occurrence_count == 2


def test_extract_ignores_blank_and_dedupes_showtimes():
    payload = json.loads((FIXTURES / "source_showtimes_current.json").read_text(encoding="utf-8"))
    plan = extract_movie_plans_from_showtimes_current(payload, source_label="fixture-showtimes")
    ids = [p.amc_movie_id for p in plan.plans]
    assert ids == ["13534", "20001"]
    assert plan.raw_amc_records == 4  # three AMC rows with content + blank id still counted as AMC
    # blank film id row is still an AMC record
    assert all(isinstance(x, str) for x in ids)


def test_normalize_imdb_valid_trim_and_prefix_case():
    assert normalize_imdb_id("  tt0435761  ") == ("tt0435761", IMDB_STATUS_VALID, "tt0435761")
    assert normalize_imdb_id("TT0435761") == ("tt0435761", IMDB_STATUS_VALID, "TT0435761")
    assert normalize_imdb_id("Tt123") == ("tt123", IMDB_STATUS_VALID, "Tt123")


def test_normalize_imdb_missing_and_malformed():
    assert normalize_imdb_id(None) == (None, IMDB_STATUS_MISSING, None)
    assert normalize_imdb_id("") == (None, IMDB_STATUS_MISSING, "")
    assert normalize_imdb_id("   ") == (None, IMDB_STATUS_MISSING, "")
    assert normalize_imdb_id("0435761") == (None, IMDB_STATUS_MALFORMED, "0435761")
    assert normalize_imdb_id(435761) == (None, IMDB_STATUS_MALFORMED, "435761")
    assert normalize_imdb_id(["tt1"])[1] == IMDB_STATUS_MALFORMED


def test_classify_404_and_transient_do_not_abort_batch():
    plans = (
        MovieIdPlan("40401", "Not Found", 1),
        MovieIdPlan("50001", "Transient", 1),
        MovieIdPlan("13534", "Toy Story 3", 1),
    )
    rows = run_movie_lookups(plans, load_offline_fixture_fetch(MOVIES), sleep_seconds=0)
    assert len(rows) == 3
    assert rows[0].imdb_status == IMDB_STATUS_REQUEST_FAILED
    assert rows[0].http_status == 404
    assert rows[1].imdb_status == IMDB_STATUS_REQUEST_FAILED
    assert rows[1].http_status is None
    assert rows[2].imdb_status == IMDB_STATUS_VALID
    assert rows[2].imdb_id == "tt0435761"


def test_classify_valid_missing_malformed_event_and_invalid():
    fetch = load_offline_fixture_fetch(MOVIES)

    def row(movie_id: str, title: str):
        status, body, error = fetch(movie_id)
        return classify_movie_lookup(
            MovieIdPlan(movie_id, title, 1),
            http_status=status,
            body=body,
            error=error,
        )

    assert row("13534", "Toy").imdb_status == IMDB_STATUS_VALID
    assert row("20001", "Missing").imdb_status == IMDB_STATUS_MISSING
    assert row("20002", "Bad").imdb_status == IMDB_STATUS_MALFORMED
    event = row("30001", "Mystery")
    assert event.imdb_status == IMDB_STATUS_MISSING
    assert event.preferred_media_type == "Event"
    invalid = row("60001", "Invalid")
    assert invalid.imdb_status == IMDB_STATUS_RESPONSE_INVALID


def test_offline_full_audit_outputs_consistent_and_no_payload_leak(tmp_path: Path):
    payload = json.loads((FIXTURES / "source_amc_scrape_log.json").read_text(encoding="utf-8"))
    source = extract_movie_plans_from_scrape_log(payload, source_label="tests/fixtures/audit/source_amc_scrape_log.json")
    rows = run_movie_lookups(source.plans, load_offline_fixture_fetch(MOVIES), sleep_seconds=0)
    report = build_report(source=source, rows=rows, generated_at="2026-07-14T20:00:00-07:00")
    paths = write_audit_outputs(report, tmp_path)

    text = paths["json"].read_text(encoding="utf-8")
    assert "preferredMediaType" not in text  # field renamed; full AMC payload keys beyond retained fields
    # Retained preferred_media_type is fine; ensure bulky unrelated AMC keys absent
    assert "_embedded" not in text
    assert "X-AMC-Vendor-Key" not in text
    assert "AMC_API_KEY" not in text
    assert_no_secret_leakage(report)

    coverage = report["coverage"]
    # 13534, 70001, 70002, 80001
    assert coverage["valid_imdb_id"] == 4
    assert coverage["missing_imdb_id"] == 2  # 20001, 30001
    assert coverage["malformed_imdb_id"] == 1  # 20002
    assert coverage["request_failed"] == 2  # 40401, 50001
    assert coverage["response_invalid"] == 1  # 60001
    assert report["requests_succeeded"] == 7  # valid+missing+malformed
    assert report["requests_failed"] == 3
    assert coverage["coverage_percent"] == round(100.0 * 4 / 7, 2)

    shared = report["relationships"]["imdb_ids_used_by_multiple_amc_movie_ids"]
    assert any(item["imdb_id"] == "tt0435761" for item in shared)
    multi = report["relationships"]["titles_with_multiple_imdb_ids"]
    assert any(item["title_key"] == "shared title a" for item in multi)

    csv_rows = list(csv.DictReader(paths["csv"].open(encoding="utf-8")))
    assert len(csv_rows) == report["distinct_amc_movie_ids"]
    assert len(csv_rows) == len(report["rows"])

    md = paths["markdown"].read_text(encoding="utf-8")
    assert "Coverage of parsed movie responses" in md
    assert str(coverage["valid_imdb_id"]) in md
    assert "X-AMC-Vendor-Key" not in md


def test_sanitize_redacts_secretish_errors():
    assert sanitize_error_message("failed X-AMC-Vendor-Key: abc") == "request error (details redacted)"
    assert sanitize_error_message("normal timeout") == "normal timeout"


def test_request_failure_not_counted_as_missing():
    row = classify_movie_lookup(
        MovieIdPlan("1", "x", 1),
        http_status=404,
        body=None,
        error="HTTP 404",
    )
    report = build_report(
        source=extract_movie_plans_from_scrape_log(
            {
                "source": "amc",
                "generated_at": "2026-07-14T00:00:00-07:00",
                "records": [{"title_raw": "x", "attributes": {"movie_id": "1"}}],
            },
            source_label="inline",
        ),
        rows=[row],
    )
    assert report["coverage"]["missing_imdb_id"] == 0
    assert report["coverage"]["request_failed"] == 1


def _load_cli_module():
    import importlib.util

    path = Path(__file__).resolve().parents[2] / "scripts" / "audit_amc_imdb_coverage.py"
    spec = importlib.util.spec_from_file_location("audit_amc_imdb_coverage_cli", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cli_offline_execution(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    cli = _load_cli_module()
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    code = cli.main(
        [
            "--source",
            str(FIXTURES / "source_amc_scrape_log.json"),
            "--offline-fixtures",
            str(MOVIES),
            "--output-dir",
            str(tmp_path),
            "--repo-root",
            str(Path(__file__).resolve().parents[2]),
        ]
    )
    assert code == 0
    assert (tmp_path / "amc_imdb_coverage_audit.json").is_file()
    assert (tmp_path / "amc_imdb_coverage_audit.csv").is_file()
    assert (tmp_path / "amc_imdb_coverage_summary.md").is_file()


def test_cli_requires_secret_without_offline(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    cli = _load_cli_module()
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    code = cli.main(
        [
            "--source",
            str(FIXTURES / "source_amc_scrape_log.json"),
            "--output-dir",
            str(tmp_path),
            "--repo-root",
            str(Path(__file__).resolve().parents[2]),
        ]
    )
    assert code == 1
