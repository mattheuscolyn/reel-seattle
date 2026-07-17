"""Tests for daily non-blocking AMC source-catalog orchestration."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from reel_seattle.source_catalog.amc import validate_amc_source_catalog_pair
from reel_seattle.source_catalog.amc_daily import (
    OUTCOME_INITIALIZED,
    OUTCOME_PROMOTED,
    OUTCOME_RETAINED,
    format_diagnostics,
    inspect_prior_catalog_pair,
    promote_catalog_pair,
    resolve_daily_discovery_source,
    run_daily_amc_source_catalog,
)
from reel_seattle.source_catalog.amc_refresh import RefreshStageError

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "source_catalog"
RESPONSES = FIXTURES / "movie_responses"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
GENERATED_AT = "2026-07-15T12:00:00-07:00"
WORKFLOW = PROJECT_ROOT / ".github" / "workflows" / "daily_scraping.yml"


def _durable_paths(root: Path) -> tuple[Path, Path]:
    catalog_dir = root / "data" / "source_catalog"
    return (
        catalog_dir / "amc_movie_products.json",
        catalog_dir / "amc_release_observations.json",
    )


def test_resolve_prefers_current_run_date_log(tmp_path: Path):
    logs = tmp_path / "data" / "daily_logs"
    logs.mkdir(parents=True)
    older = logs / "2026-07-14_amc.json"
    newer = logs / "2026-07-15_amc.json"
    older.write_text((FIXTURES / "discovery_showtimes.json").read_text(encoding="utf-8"), encoding="utf-8")
    # Use scrape-log shape for dated file.
    newer.write_text((FIXTURES / "discovery_scrape_log.json").read_text(encoding="utf-8"), encoding="utf-8")
    from datetime import date

    resolved = resolve_daily_discovery_source(
        "auto", repo_root=tmp_path, run_date=date(2026, 7, 15)
    )
    assert resolved.endswith("2026-07-15_amc.json")


def test_first_run_initializes_both_files_after_validation(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
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
    assert result.promoted is True
    assert result.outcome == OUTCOME_INITIALIZED
    assert result.soft_failure is False
    assert products_path.is_file()
    assert releases_path.is_file()
    products = json.loads(products_path.read_text(encoding="utf-8"))
    releases = json.loads(releases_path.read_text(encoding="utf-8"))
    validate_amc_source_catalog_pair(products, releases)
    # Work dir cleaned.
    assert result.work_dir is not None
    assert not Path(result.work_dir).exists()


def test_first_run_missing_key_soft_fails_without_files(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    products_path, releases_path = _durable_paths(tmp_path)
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        live=True,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
    )
    assert result.promoted is False
    assert result.soft_failure is True
    assert not products_path.exists()
    assert not releases_path.exists()
    assert "AMC_API_KEY" in result.message or "retained" in result.message.lower() or "no catalog" in result.message.lower()


def test_existing_catalog_updates(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
    first = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp1",
        repo_root=tmp_path,
        live=False,
    )
    assert first.promoted
    second = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at="2026-07-16T12:00:00-07:00",
        temp_dir=tmp_path / "tmp2",
        repo_root=tmp_path,
        live=False,
    )
    assert second.promoted
    assert second.outcome == OUTCOME_PROMOTED
    products = json.loads(products_path.read_text(encoding="utf-8"))
    assert products["generated_at"] == "2026-07-16T12:00:00-07:00"


def test_inconsistent_prior_pair_not_overwritten(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
    products_path.parent.mkdir(parents=True)
    products_path.write_text('{"broken": true}\n', encoding="utf-8")
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
    assert result.promoted is False
    assert result.outcome == OUTCOME_RETAINED
    assert products_path.read_text(encoding="utf-8") == '{"broken": true}\n'
    assert not releases_path.exists()


def test_invalid_prior_pair_not_overwritten(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
    # Create a valid pair first, then corrupt products.
    run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp1",
        repo_root=tmp_path,
        live=False,
    )
    original_products = products_path.read_text(encoding="utf-8")
    original_releases = releases_path.read_text(encoding="utf-8")
    products_path.write_text(
        json.dumps({"schema_version": "1.0.0", "source": "amc", "generated_at": "x", "stats": {}, "products": []}),
        encoding="utf-8",
    )
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at="2026-07-16T12:00:00-07:00",
        temp_dir=tmp_path / "tmp2",
        repo_root=tmp_path,
        live=False,
    )
    assert result.promoted is False
    # Corrupted products remain (not replaced); releases also unchanged.
    assert "failed validation" in result.message
    assert releases_path.read_text(encoding="utf-8") == original_releases


def test_partial_failure_preserves_prior_metadata(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
    run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp1",
        repo_root=tmp_path,
        live=False,
    )
    # Second run: custom fetch fails only for 76238.
    from reel_seattle.analysis.amc_movies_client import load_offline_fixture_fetch
    from reel_seattle.source_catalog import amc_daily as daily_mod

    base_fetch = load_offline_fixture_fetch(RESPONSES)

    def mixed_fetch(movie_id: str):
        if movie_id == "76238":
            return 500, None, "HTTP 500"
        return base_fetch(movie_id)

    def build_mixed(*, fixture_dir=None, live=False, **_kwargs):
        return mixed_fetch

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(daily_mod, "build_fetch_movie", build_mixed)
    try:
        result = run_daily_amc_source_catalog(
            discovery_source=str(FIXTURES / "discovery_showtimes.json"),
            products_path=products_path,
            releases_path=releases_path,
            fixture_responses=RESPONSES,
            generated_at="2026-07-16T12:00:00-07:00",
            temp_dir=tmp_path / "tmp2",
            repo_root=tmp_path,
            live=False,
        )
    finally:
        monkeypatch.undo()

    assert result.promoted is True
    products = json.loads(products_path.read_text(encoding="utf-8"))
    odyssey = next(p for p in products["products"] if p["source_film_id"] == "76238")
    assert odyssey["synopsis"] == "An epic journey home."
    assert odyssey["lifecycle"]["refresh_status"] == "stale"


def test_all_failed_retains_prior_catalog(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
    run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp1",
        repo_root=tmp_path,
        live=False,
    )
    before = products_path.read_text(encoding="utf-8")

    from reel_seattle.source_catalog import amc_daily as daily_mod

    def always_fail(movie_id: str):
        return 500, None, "HTTP 500"

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        daily_mod,
        "build_fetch_movie",
        lambda **_k: always_fail,
    )
    try:
        result = run_daily_amc_source_catalog(
            discovery_source=str(FIXTURES / "discovery_showtimes.json"),
            products_path=products_path,
            releases_path=releases_path,
            fixture_responses=RESPONSES,
            generated_at="2026-07-16T12:00:00-07:00",
            temp_dir=tmp_path / "tmp2",
            repo_root=tmp_path,
            live=False,
            retain_on_all_failed=True,
        )
    finally:
        monkeypatch.undo()

    assert result.promoted is False
    assert result.outcome == OUTCOME_RETAINED
    assert "all Movies refreshes failed" in result.message
    assert products_path.read_text(encoding="utf-8") == before


def test_empty_discovery_soft_fails(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
    result = run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_empty.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    assert result.promoted is False
    assert result.soft_failure is True
    assert not products_path.exists()


def test_promotion_rollback_on_second_replace_failure(tmp_path: Path, monkeypatch):
    products_path, releases_path = _durable_paths(tmp_path)
    run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp1",
        repo_root=tmp_path,
        live=False,
    )
    prior_products = products_path.read_bytes()
    prior_releases = releases_path.read_bytes()

    work = tmp_path / "promote"
    work.mkdir()
    # Write slightly different validated temps (reuse current as temps with tweak).
    temp_products = work / "amc_movie_products.json"
    temp_releases = work / "amc_release_observations.json"
    payload = json.loads(prior_products)
    payload["generated_at"] = "2026-07-99T00:00:00-07:00"
    temp_products.write_text(json.dumps(payload), encoding="utf-8")
    temp_releases.write_bytes(prior_releases)

    real_replace = os.replace
    calls = {"n": 0}

    def flaky_replace(src, dst):
        calls["n"] += 1
        # Fail on the releases replace (2nd durable replace after temps staged).
        # Sequence: products_tmp→products (1), releases_tmp→releases (2 fails),
        # then rollback products_bak→products (3).
        if Path(dst) == releases_path:
            raise OSError("simulated releases replace failure")
        return real_replace(src, dst)

    monkeypatch.setattr(os, "replace", flaky_replace)
    with pytest.raises(OSError, match="simulated"):
        promote_catalog_pair(
            temp_products=temp_products,
            temp_releases=temp_releases,
            durable_products=products_path,
            durable_releases=releases_path,
        )
    assert products_path.read_bytes() == prior_products
    assert releases_path.read_bytes() == prior_releases
    assert not list(products_path.parent.glob("*.tmp"))
    assert not list(products_path.parent.glob("*.bak"))


def test_diagnostics_sanitized_and_no_network(tmp_path: Path, monkeypatch):
    def _block(*_a, **_k):
        raise AssertionError("network access attempted")

    monkeypatch.setattr(socket, "create_connection", _block)
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    products_path, releases_path = _durable_paths(tmp_path)
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
    lines = format_diagnostics(result)
    blob = "\n".join(lines)
    assert "AMC_API_KEY" not in blob
    assert "X-AMC-Vendor-Key" not in blob
    assert "Authorization" not in blob
    assert "posterDynamic" not in blob


def test_cli_soft_fail_exit_zero_and_fail_hard(tmp_path: Path):
    out = tmp_path / "catalog"
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "run_daily_amc_source_catalog.py"),
        "--discovery-source",
        str(FIXTURES / "discovery_empty.json"),
        "--fixture-responses",
        str(RESPONSES),
        "--products-path",
        str(out / "amc_movie_products.json"),
        "--releases-path",
        str(out / "amc_release_observations.json"),
        "--generated-at",
        GENERATED_AT,
        "--temp-dir",
        str(tmp_path / "tmp"),
        "--repo-root",
        str(tmp_path),
        "--skip-pipeline-report-update",
    ]
    soft = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, check=False)
    assert soft.returncode == 0, soft.stderr
    assert "warning" in soft.stdout.lower() or "warning" in soft.stderr.lower() or "no usable" in soft.stdout.lower()

    hard = subprocess.run(
        cmd + ["--fail-hard"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert hard.returncode != 0


def test_cli_fixture_end_to_end(tmp_path: Path):
    out = tmp_path / "durable"
    result = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "run_daily_amc_source_catalog.py"),
            "--discovery-source",
            str(FIXTURES / "discovery_showtimes.json"),
            "--fixture-responses",
            str(RESPONSES),
            "--products-path",
            str(out / "amc_movie_products.json"),
            "--releases-path",
            str(out / "amc_release_observations.json"),
            "--generated-at",
            GENERATED_AT,
            "--temp-dir",
            str(tmp_path / "tmp"),
            "--repo-root",
            str(tmp_path),
            "--json-summary-path",
            str(tmp_path / "summary.json"),
            "--skip-pipeline-report-update",
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert (out / "amc_movie_products.json").is_file()
    assert (out / "amc_release_observations.json").is_file()
    summary = json.loads((tmp_path / "summary.json").read_text(encoding="utf-8"))
    assert summary["promoted"] is True


def test_workflow_yaml_placement_and_staging():
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "run_daily_amc_source_catalog.py" in text
    assert "Validate history CSV" in text
    assert "Refresh AMC source catalog" in text
    assert "Re-validate public data artifacts after catalog health update" in text
    assert "--pipeline-report-path public/data/pipeline_report.json" in text
    hist = text.index("Validate history CSV")
    catalog = text.index("Refresh AMC source catalog")
    revalidate = text.index("Re-validate public data artifacts after catalog health update")
    commit = text.index("Commit and push changes")
    assert hist < catalog < revalidate < commit
    assert "data/source_catalog/amc_movie_products.json" in text
    assert "data/source_catalog/amc_release_observations.json" in text
    assert "git add ." not in text
    # Soft-fail via script exit 0 — no blanket continue-on-error on catalog step.
    catalog_block = text[catalog:commit]
    assert "continue-on-error" not in catalog_block


def test_shared_release_ids_do_not_merge_products(tmp_path: Path):
    products_path, releases_path = _durable_paths(tmp_path)
    run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_scrape_log.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=GENERATED_AT,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    products = json.loads(products_path.read_text(encoding="utf-8"))
    by_id = {p["source_film_id"]: p for p in products["products"]}
    assert "76238" in by_id and "83988" in by_id
    assert by_id["76238"]["source_release_id"] == by_id["83988"]["source_release_id"]
    assert by_id["76238"]["source_title"] != by_id["83988"]["source_title"]
