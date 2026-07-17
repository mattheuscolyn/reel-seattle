"""Tests for AMC catalog health section in pipeline_report (P-21B)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.pipeline_report import build_pipeline_report
from reel_seattle.pipeline_report_catalog import (
    CATALOG_STATUS_SKIPPED,
    CATALOG_STATUS_STALE,
    CATALOG_STATUS_SUCCESS,
    apply_amc_catalog_health_to_pipeline_report,
    build_amc_source_catalog_health,
    build_not_attempted_amc_source_catalog_health,
)
from reel_seattle.source_catalog.amc_daily import (
    OUTCOME_INITIALIZED,
    OUTCOME_PROMOTED,
    OUTCOME_RETAINED,
    OUTCOME_SKIPPED,
    DailyCatalogResult,
    run_daily_amc_source_catalog,
)
from reel_seattle.validate import SchemaValidationError, validate_pipeline_report

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "source_catalog"
RESPONSES = FIXTURES / "movie_responses"
GENERATED_AT = "2026-07-15T12:00:00-07:00"
PRIOR_GENERATED_AT = "2026-07-14T09:00:00-07:00"


def _minimal_report() -> dict:
    return {
        "schema_version": "1.0.0",
        "generated_at": "2026-07-17T10:00:00-07:00",
        "status": "success",
        "window": {"start_date": "2026-07-17", "end_date": "2026-07-31"},
        "sources": {
            key: {
                "status": "success",
                "showtime_count": 1,
                "film_count": 1,
                "theater_count": 1,
                "last_successful_run": "2026-07-17",
                "warnings": [],
                "errors": [],
            }
            for key in ("amc", "siff", "beacon", "nwff", "central_cinema")
        },
        "totals": {"showtime_count": 5, "film_count": 5, "theater_count": 5},
        "messages": [],
    }


def _result(**overrides) -> DailyCatalogResult:
    base = dict(
        outcome=OUTCOME_PROMOTED,
        promoted=True,
        soft_failure=False,
        message="promoted catalogs",
        diagnostics=[],
        active_ids=2,
        selected=2,
        success=2,
        failed=0,
        invalid=0,
        products=2,
        active_products=2,
        inactive_products=0,
        release_observations=1,
        products_path="data/source_catalog/amc_movie_products.json",
        releases_path="data/source_catalog/amc_release_observations.json",
    )
    base.update(overrides)
    return DailyCatalogResult(**base)


def test_successful_catalog_build_populates_healthy_section(tmp_path: Path):
    products_path = tmp_path / "data" / "source_catalog" / "amc_movie_products.json"
    releases_path = tmp_path / "data" / "source_catalog" / "amc_release_observations.json"
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    assert result.outcome == OUTCOME_INITIALIZED

    section = build_amc_source_catalog_health(
        result,
        products_path=products_path,
        releases_path=releases_path,
        reported_at="2026-07-17T12:00:00-07:00",
    )
    assert section["status"] == CATALOG_STATUS_SUCCESS
    assert section["build_attempted"] is True
    assert section["build_succeeded"] is True
    assert section["soft_failure"] is False
    assert section["artifacts_written_this_run"] is True
    assert section["artifacts_retained_from_prior"] is False
    assert section["last_successful_build_at"] == GENERATED_AT
    assert section["artifacts"]["amc_movie_products"]["valid"] is True
    assert section["artifacts"]["amc_release_observations"]["valid"] is True
    assert section["artifacts"]["amc_movie_products"]["path"] == (
        "data/source_catalog/amc_movie_products.json"
    )
    assert section["artifacts"]["amc_release_observations"]["path"] == (
        "data/source_catalog/amc_release_observations.json"
    )
    assert ":" not in section["artifacts"]["amc_movie_products"]["path"]
    assert section["products_summary"]["total"] == section["artifacts"]["amc_movie_products"][
        "record_count"
    ]
    assert section["releases_summary"]["multi_product_groups"] >= 0
    assert section["releases_summary"]["unresolved_member_references"] == 0

    report = _minimal_report()
    report["amc_source_catalog"] = section
    validate_pipeline_report(report)


def test_product_and_release_summary_counts_match_artifacts(tmp_path: Path):
    products_path = tmp_path / "amc_movie_products.json"
    releases_path = tmp_path / "amc_release_observations.json"
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    section = build_amc_source_catalog_health(
        result, products_path=products_path, releases_path=releases_path
    )
    products = json.loads(products_path.read_text(encoding="utf-8"))
    releases = json.loads(releases_path.read_text(encoding="utf-8"))
    assert section["products_summary"]["total"] == len(products["products"])
    assert (
        section["products_summary"]["active"] + section["products_summary"]["inactive"]
        == section["products_summary"]["total"]
    )
    assert section["releases_summary"]["total"] == len(releases["releases"])
    assert (
        section["releases_summary"]["singleton_groups"]
        + section["releases_summary"]["multi_product_groups"]
        == section["releases_summary"]["total"]
    )


def test_retained_stale_after_failure_does_not_advance_last_success(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    products_path = tmp_path / "amc_movie_products.json"
    releases_path = tmp_path / "amc_release_observations.json"
    first = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=PRIOR_GENERATED_AT,
        temp_dir=tmp_path / "tmp1",
        repo_root=tmp_path,
        live=False,
    )
    assert first.outcome == OUTCOME_INITIALIZED
    prior_products = products_path.read_text(encoding="utf-8")
    prior_releases = releases_path.read_text(encoding="utf-8")

    monkeypatch.delenv("AMC_API_KEY", raising=False)
    retained = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        live=True,
        generated_at="2026-07-17T18:00:00-07:00",
        temp_dir=tmp_path / "tmp2",
        repo_root=tmp_path,
    )
    assert retained.outcome == OUTCOME_RETAINED
    assert retained.soft_failure is True
    assert products_path.read_text(encoding="utf-8") == prior_products
    assert releases_path.read_text(encoding="utf-8") == prior_releases

    section = build_amc_source_catalog_health(
        retained,
        products_path=products_path,
        releases_path=releases_path,
        reported_at="2026-07-17T18:05:00-07:00",
    )
    assert section["status"] == CATALOG_STATUS_STALE
    assert section["build_succeeded"] is False
    assert section["artifacts_written_this_run"] is False
    assert section["artifacts_retained_from_prior"] is True
    assert section["last_successful_build_at"] == PRIOR_GENERATED_AT
    assert section["artifacts"]["amc_movie_products"]["generated_at"] == PRIOR_GENERATED_AT
    assert section["errors"]
    report = _minimal_report()
    report["amc_source_catalog"] = section
    validate_pipeline_report(report)


def test_failed_build_without_usable_artifacts_is_unhealthy(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    products_path = tmp_path / "amc_movie_products.json"
    releases_path = tmp_path / "amc_release_observations.json"
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        live=True,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
    )
    assert result.outcome == OUTCOME_SKIPPED
    section = build_amc_source_catalog_health(
        result, products_path=products_path, releases_path=releases_path
    )
    assert section["status"] == CATALOG_STATUS_SKIPPED
    assert section["build_succeeded"] is False
    assert section["artifacts"]["amc_movie_products"]["exists"] is False
    assert section["artifacts"]["amc_movie_products"]["valid"] is False
    assert section["last_successful_build_at"] is None


def test_not_attempted_is_distinguishable_from_success(tmp_path: Path):
    section = build_not_attempted_amc_source_catalog_health(
        products_path=tmp_path / "missing_products.json",
        releases_path=tmp_path / "missing_releases.json",
        reported_at="2026-07-17T10:00:00-07:00",
    )
    assert section["status"] == CATALOG_STATUS_SKIPPED
    assert section["build_attempted"] is False
    assert section["outcome"] == "not_attempted"
    assert section["build_succeeded"] is False


def test_temp_absolute_paths_never_appear_in_report(tmp_path: Path):
    products_path = tmp_path / "durable" / "amc_movie_products.json"
    releases_path = tmp_path / "durable" / "amc_release_observations.json"
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    # Simulate absolute paths leaking from DailyCatalogResult.
    result = _result(
        outcome=result.outcome,
        promoted=result.promoted,
        soft_failure=result.soft_failure,
        message=result.message,
        products=result.products,
        active_products=result.active_products,
        inactive_products=result.inactive_products,
        release_observations=result.release_observations,
        products_path=str(products_path.resolve()),
        releases_path=str(releases_path.resolve()),
    )
    section = build_amc_source_catalog_health(
        result, products_path=products_path, releases_path=releases_path
    )
    for artifact in section["artifacts"].values():
        assert not Path(artifact["path"]).is_absolute()
        assert artifact["path"].startswith("data/source_catalog/")


def test_apply_merges_section_without_changing_source_fields(tmp_path: Path):
    products_path = tmp_path / "amc_movie_products.json"
    releases_path = tmp_path / "amc_release_observations.json"
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    report_path = tmp_path / "pipeline_report.json"
    report = _minimal_report()
    report["sources"]["amc"]["warnings"] = ["preexisting warning"]
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    updated = apply_amc_catalog_health_to_pipeline_report(
        report_path,
        result,
        products_path=products_path,
        releases_path=releases_path,
        reported_at="2026-07-17T12:00:00-07:00",
    )
    assert updated["sources"]["amc"]["warnings"] == ["preexisting warning"]
    assert updated["amc_source_catalog"]["status"] == CATALOG_STATUS_SUCCESS
    validate_pipeline_report(updated)


def test_invalid_catalog_health_shape_fails_validation():
    report = _minimal_report()
    report["amc_source_catalog"] = {"id": "amc_source_catalog", "status": "success"}
    with pytest.raises(SchemaValidationError):
        validate_pipeline_report(report)


def test_report_without_catalog_section_still_validates():
    validate_pipeline_report(_minimal_report())


def test_multi_product_groups_remain_grouping_evidence(tmp_path: Path):
    products_path = tmp_path / "amc_movie_products.json"
    releases_path = tmp_path / "amc_release_observations.json"
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    section = build_amc_source_catalog_health(
        result, products_path=products_path, releases_path=releases_path
    )
    releases = json.loads(releases_path.read_text(encoding="utf-8"))
    for release in releases["releases"]:
        assert release["relationship_status"] == "grouping_evidence_only"
    assert "multi_product_groups" in section["releases_summary"]
