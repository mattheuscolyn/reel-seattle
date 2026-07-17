"""Tests for AMC catalog cadence / inactive-growth evaluation (P-21C)."""

from __future__ import annotations

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

from reel_seattle.analysis.amc_catalog_cadence_audit import (
    MEANINGFUL_PRODUCT_FIELDS,
    build_catalog_cadence_evaluation,
    diff_snapshots,
    model_cadence_scenarios,
    quality_checks,
    summarize_snapshot,
    write_evaluation_outputs,
)
from reel_seattle.source_catalog.amc_daily import run_daily_amc_source_catalog

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "source_catalog"
RESPONSES = FIXTURES / "movie_responses"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
GENERATED_AT = "2026-07-15T12:00:00-07:00"
LATER_AT = "2026-07-16T12:00:00-07:00"


def _build_snapshot(tmp_path: Path, *, stamp: str) -> dict:
    products_path = tmp_path / "amc_movie_products.json"
    releases_path = tmp_path / "amc_release_observations.json"
    run_daily_amc_source_catalog(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        products_path=products_path,
        releases_path=releases_path,
        fixture_responses=RESPONSES,
        generated_at=stamp,
        temp_dir=tmp_path / "tmp",
        repo_root=tmp_path,
        live=False,
    )
    return {
        "label": stamp,
        "commit": None,
        "products": json.loads(products_path.read_text(encoding="utf-8")),
        "releases": json.loads(releases_path.read_text(encoding="utf-8")),
    }


def test_summarize_and_diff_detect_inactive_and_metadata_change(tmp_path: Path):
    first = _build_snapshot(tmp_path / "a", stamp=GENERATED_AT)
    second = deepcopy(first)
    second["label"] = LATER_AT
    second["products"]["generated_at"] = LATER_AT
    products = second["products"]["products"]
    assert products
    products[0]["lifecycle"]["inactive_since"] = LATER_AT
    if len(products) > 1:
        products[1]["source_title"] = (products[1].get("source_title") or "Title") + " (edited)"

    summary = summarize_snapshot(second)
    assert summary["inactive"] >= 1
    assert summary["total_products"] == len(products)

    transition = diff_snapshots(first, second)
    assert products[0]["source_film_id"] in transition["newly_inactive"]
    assert transition["reactivated"] == []
    assert transition["meaningful_changed_count"] >= 1
    assert "source_title" in MEANINGFUL_PRODUCT_FIELDS


def test_quality_checks_clean_on_fixture_catalog(tmp_path: Path):
    snap = _build_snapshot(tmp_path, stamp=GENERATED_AT)
    result = quality_checks(snap["products"], snap["releases"])
    assert result["duplicate_source_film_ids"]["count"] == 0
    assert result["catalog_validation_errors"] == []
    assert result["release_members_missing_product"]["count"] == 0


def test_stale_scenario_skips_fresh_products_after_offset(tmp_path: Path):
    snap = _build_snapshot(tmp_path, stamp=GENERATED_AT)
    scenarios = model_cadence_scenarios(
        snap["products"], next_run_offset_hours=24.0, stale_after_hours_options=(48.0,)
    )
    by_policy = {(s["policy"], s.get("stale_after_hours")): s for s in scenarios}
    all_active = by_policy[("all-active", None)]
    stale_48 = by_policy[("stale", 48.0)]
    new_only = by_policy[("new-only", None)]
    assert all_active["selected"] == summarize_snapshot(snap)["active"]
    assert stale_48["selected"] == 0
    assert stale_48["pct_reduction_vs_all_active"] == 100.0
    assert new_only["selected"] == 0


def test_build_evaluation_classifications_and_outputs(tmp_path: Path):
    first = _build_snapshot(tmp_path / "a", stamp=GENERATED_AT)
    second = deepcopy(first)
    second["label"] = LATER_AT
    second["products"]["generated_at"] = LATER_AT
    report = build_catalog_cadence_evaluation(
        [first, second],
        generated_at="2026-07-17T12:00:00-07:00",
        evidence_notes=["unit fixture"],
    )
    assert report["audit_id"] == "amc_catalog_cadence_evaluation"
    assert report["classifications"]["refresh_cadence"] == "keep_all_active_daily"
    assert report["classifications"]["inactive_growth"] == "healthy_durable_accumulation"
    assert report["evidence_window"]["snapshot_count"] == 2
    paths = write_evaluation_outputs(report, tmp_path / "out")
    assert paths["json"].is_file()
    assert paths["markdown"].is_file()
    assert "keep_all_active_daily" in paths["markdown"].read_text(encoding="utf-8")


def test_cli_snapshots_dir_no_network(tmp_path: Path):
    snap = _build_snapshot(tmp_path / "build", stamp=GENERATED_AT)
    snap_dir = tmp_path / "snaps" / "day1"
    snap_dir.mkdir(parents=True)
    (snap_dir / "amc_movie_products.json").write_text(
        json.dumps(snap["products"], indent=2) + "\n", encoding="utf-8"
    )
    (snap_dir / "amc_release_observations.json").write_text(
        json.dumps(snap["releases"], indent=2) + "\n", encoding="utf-8"
    )
    out = tmp_path / "audit-out"
    result = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "audit_amc_catalog_cadence.py"),
            "--snapshots-dir",
            str(tmp_path / "snaps"),
            "--output-dir",
            str(out),
            "--generated-at",
            "2026-07-17T12:00:00-07:00",
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert (out / "amc_catalog_cadence_evaluation.json").is_file()
    assert "keep_all_active_daily" in result.stdout
