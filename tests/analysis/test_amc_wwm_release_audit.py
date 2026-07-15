"""Tests for AMC wwmReleaseNumber relationship audit (offline only)."""

from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path

import pytest

from reel_seattle.analysis.amc_movies_client import (
    MovieIdPlan,
    SourcePlan,
    extract_movie_plans_from_scrape_log,
    load_offline_fixture_fetch,
)
from reel_seattle.analysis.amc_wwm_release_audit import (
    WWM_STATUS_MALFORMED,
    WWM_STATUS_MISSING,
    WWM_STATUS_REQUEST_FAILED,
    WWM_STATUS_VALID,
    assert_no_secret_leakage,
    build_report,
    classify_product_category,
    classify_release_lookup,
    normalize_wwm_release_number,
    run_release_lookups,
    write_audit_outputs,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "audit"
MOVIES = FIXTURES / "amc_movies_wwm"
SOURCE = FIXTURES / "source_wwm_scrape_log.json"
REPO_ROOT = Path(__file__).resolve().parents[2]


def test_normalize_wwm_integer_and_numeric_string():
    assert normalize_wwm_release_number(391297) == ("391297", WWM_STATUS_VALID, "391297")
    assert normalize_wwm_release_number(" 391297 ") == ("391297", WWM_STATUS_VALID, "391297")


def test_normalize_wwm_blank_zero_negative_malformed():
    assert normalize_wwm_release_number(None)[1] == WWM_STATUS_MISSING
    assert normalize_wwm_release_number("")[1] == WWM_STATUS_MISSING
    assert normalize_wwm_release_number("   ")[1] == WWM_STATUS_MISSING
    assert normalize_wwm_release_number(0)[1] == WWM_STATUS_MISSING
    assert normalize_wwm_release_number(-5)[1] == WWM_STATUS_MALFORMED
    assert normalize_wwm_release_number("abc-123")[1] == WWM_STATUS_MALFORMED
    assert normalize_wwm_release_number(["1"])[1] == WWM_STATUS_MALFORMED


def test_extract_deduplicates_and_keeps_separate_source_records():
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    plan = extract_movie_plans_from_scrape_log(payload, source_label="fixture")
    ids = [p.amc_movie_id for p in plan.plans]
    assert ids.count("82975") == 1
    assert "" not in ids
    invite = next(p for p in plan.plans if p.amc_movie_id == "82975")
    assert invite.occurrence_count == 2
    assert invite.source_title == "The Invite"


def test_request_failure_separate_from_missing():
    row = classify_release_lookup(
        MovieIdPlan("94001", "Failed", 1),
        http_status=404,
        body=None,
        error="HTTP 404",
    )
    assert row.wwm_status == WWM_STATUS_REQUEST_FAILED
    missing = classify_release_lookup(
        MovieIdPlan("91001", "Missing", 1),
        http_status=200,
        body={"id": 91001, "name": "Missing", "wwmReleaseNumber": None},
    )
    assert missing.wwm_status == WWM_STATUS_MISSING


def test_categories_qanda_intro_sensory_unknown():
    assert (
        classify_product_category(
            name="The Invite - Q&A with Filmmaker/Actor Olivia Wilde",
            source_title=None,
            attribute_codes=["qa"],
            attribute_names=[],
            preferred_media_type="Theatrical",
        )
        == "q_and_a"
    )
    assert (
        classify_product_category(
            name="The Invite - Special Introduction with Filmmaker/Actor Olivia Wilde",
            source_title=None,
            attribute_codes=[],
            attribute_names=[],
            preferred_media_type="Theatrical",
        )
        == "special_introduction"
    )
    assert (
        classify_product_category(
            name="Moana: Sensory Friendly Screening",
            source_title=None,
            attribute_codes=["sensory"],
            attribute_names=[],
            preferred_media_type="Theatrical",
        )
        == "sensory_friendly"
    )
    assert (
        classify_product_category(
            name="Plain Title",
            source_title=None,
            attribute_codes=[],
            attribute_names=[],
            preferred_media_type="Theatrical",
        )
        == "standard"
    )
    # Capability flags on ordinary theatrical titles must not force open_caption.
    assert (
        classify_product_category(
            name="The Odyssey",
            source_title="The Odyssey",
            attribute_codes=["OPENCAPTION", "CLOSEDCAPTION", "IMAX"],
            attribute_names=[],
            preferred_media_type="Theatrical",
        )
        == "standard"
    )


def test_offline_grouping_conflicts_and_outputs(tmp_path: Path):
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    source = extract_movie_plans_from_scrape_log(payload, source_label="fixture-wwm")
    rows = run_release_lookups(source.plans, load_offline_fixture_fetch(MOVIES), sleep_seconds=0)
    report = build_report(source=source, rows=rows, generated_at="2026-07-14T21:00:00-07:00")
    paths = write_audit_outputs(report, tmp_path)

    invite = next(g for g in report["release_groups"] if g["wwm_release_number"] == "391297")
    assert invite["member_count"] == 3
    assert set(invite["amc_movie_ids"]) == {"82975", "84265", "84266"}
    assert invite["conflicts"]["runtime"] is True
    assert "q_and_a" in invite["categories"]
    assert "special_introduction" in invite["categories"]
    assert invite["likely_standard_product_candidate"]["amc_movie_id"] == "82975"
    assert invite["likely_standard_product_candidate"]["label"] == "audit_inference_only"

    coverage = report["coverage"]
    assert coverage["valid_wwm_release_number"] == 8
    assert coverage["missing_wwm_release_number"] == 1
    assert coverage["malformed_wwm_release_number"] == 1
    assert coverage["request_failed"] == 1
    assert report["requests_succeeded"] == 10
    assert report["requests_failed"] == 1

    unrelated = report["conflicts"]["unrelated_title_group_candidates"]
    assert any(item["wwm_release_number"] == "555001" for item in unrelated)

    multi_title = report["conflicts"]["titles_with_multiple_release_numbers"]
    assert any(item["title_key"] == "shared title remake" for item in multi_title)

    assert report["conflicts"]["amc_movie_ids_with_multiple_release_numbers"] == []

    text = paths["json"].read_text(encoding="utf-8")
    assert "X-AMC-Vendor-Key" not in text
    assert "AMC_API_KEY" not in text
    assert "sortableName" not in text
    assert_no_secret_leakage(report)

    csv_rows = list(csv.DictReader(paths["rows_csv"].open(encoding="utf-8")))
    assert len(csv_rows) == report["distinct_amc_movie_ids"] == len(report["rows"])

    group_rows = list(csv.DictReader(paths["groups_csv"].open(encoding="utf-8")))
    assert len(group_rows) == report["cardinality"]["distinct_wwm_release_numbers"]
    assert len(group_rows) == len(report["release_groups"])

    md = paths["markdown"].read_text(encoding="utf-8")
    assert "391297" in md


def test_conflicting_release_numbers_for_one_amc_id_reported():
    rows = [
        classify_release_lookup(
            MovieIdPlan("1", "A", 1),
            http_status=200,
            body={"id": 1, "name": "A", "wwmReleaseNumber": 10},
        ),
        classify_release_lookup(
            MovieIdPlan("1", "A", 1),
            http_status=200,
            body={"id": 1, "name": "A", "wwmReleaseNumber": 11},
        ),
    ]
    source = SourcePlan("inline", "2026-07-14", 2, (MovieIdPlan("1", "A", 2),))
    report = build_report(source=source, rows=rows)
    conflicts = report["conflicts"]["amc_movie_ids_with_multiple_release_numbers"]
    assert conflicts == [{"amc_movie_id": "1", "wwm_release_numbers": ["10", "11"]}]


def _load_cli():
    path = REPO_ROOT / "scripts" / "audit_amc_wwm_release.py"
    spec = importlib.util.spec_from_file_location("audit_amc_wwm_release_cli", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cli_offline(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    cli = _load_cli()
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    code = cli.main(
        [
            "--source",
            str(SOURCE),
            "--offline-fixtures",
            str(MOVIES),
            "--output-dir",
            str(tmp_path),
            "--repo-root",
            str(REPO_ROOT),
        ]
    )
    assert code == 0
    assert (tmp_path / "amc_wwm_release_audit.json").is_file()
    assert (tmp_path / "amc_wwm_release_rows.csv").is_file()
    assert (tmp_path / "amc_wwm_release_groups.csv").is_file()
    assert (tmp_path / "amc_wwm_release_summary.md").is_file()
