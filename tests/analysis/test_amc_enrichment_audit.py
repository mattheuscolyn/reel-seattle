"""Tests for AMC enrichment coverage audit (T-ENR-AMC-R)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.analysis.amc_enrichment_audit import (
    EnrichmentAuditError,
    build_amc_enrichment_audit,
    derive_release_year,
    nonempty,
    write_audit_outputs,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "audit" / "amc_enrichment"
PRODUCTS = FIXTURES / "amc_movie_products.json"
SHOWTIMES = FIXTURES / "showtimes_current.json"
STAMP = "2026-07-25T12:00:00+00:00"


def test_nonempty_treats_blank_string_as_empty():
    assert nonempty(None) is False
    assert nonempty("") is False
    assert nonempty("  ") is False
    assert nonempty("PG") is True
    assert nonempty([]) is False
    assert nonempty({"a": 1}) is True


def test_derive_release_year():
    assert derive_release_year("2026-01-15T00:00:00Z") == 2026
    assert derive_release_year(None) is None
    assert derive_release_year("") is None
    assert derive_release_year("not-a-date") is None


def test_build_audit_fixture_coverage_and_joins(tmp_path: Path):
    report = build_amc_enrichment_audit(
        products_path=PRODUCTS,
        releases_path=tmp_path / "missing_releases.json",
        showtimes_path=SHOWTIMES,
        generated_at=STAMP,
    )
    assert report["schema_version"] == "1.0.0"
    assert report["generated_at"] == STAMP
    assert report["inputs"]["requires_amc_api_secret"] is False
    assert report["terms_gate"]["status"] == "uncleared"

    assert report["counts"]["catalog_products"] == 3
    assert report["counts"]["current_window_amc_source_film_ids"] == 3
    assert report["counts"]["current_window_joined_products"] == 2

    cat = report["catalog_coverage"]["fields"]
    assert cat["synopsis"]["present"] == 3
    assert cat["genre"]["present"] == 2
    assert cat["mpaa_rating"]["present"] == 2
    assert cat["directors_raw"]["present"] == 2
    assert cat["imdb_id"]["present"] == 0
    assert cat["tmdb_id"]["present"] == 0
    assert cat["language"]["present"] == 0
    assert cat["release_year"]["present"] == 3

    joined = report["current_window_joined_coverage"]["fields"]
    assert joined["synopsis"]["present"] == 2
    assert joined["genre"]["present"] == 1
    assert joined["mpaa_rating"]["present"] == 1

    pub = report["public_showtimes_film_coverage"]["fields"]
    assert pub["year"]["present"] == 0
    assert pub["synopsis"]["present"] == 0
    assert pub["runtime_min"]["present"] == 3

    join = report["join"]
    assert join["recommended_join_key"] == "source_film_id"
    assert join["join_success_film_keys"] == 2
    assert join["join_failure_film_keys"] == 1
    assert join["current_ids_missing_from_catalog"] == ["88888"]
    assert join["join_success_rate_percent"] == pytest.approx(66.67)


def test_duplicate_title_conflict_detection(tmp_path: Path):
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    twin = dict(products["products"][0])
    twin["source_film_id"] = "10001b"
    twin["genre"] = "ACTION"
    products["products"].append(twin)
    path = tmp_path / "products_conflict.json"
    path.write_text(json.dumps(products), encoding="utf-8")
    report = build_amc_enrichment_audit(
        products_path=path,
        showtimes_path=SHOWTIMES,
        generated_at=STAMP,
    )
    assert any(c["title_key"] == "alpha film" for c in report["title_level_conflicts"])


def test_missing_input_file():
    with pytest.raises(EnrichmentAuditError, match="Missing input file"):
        build_amc_enrichment_audit(
            products_path=Path("does-not-exist.json"),
            showtimes_path=SHOWTIMES,
            generated_at=STAMP,
        )


def test_deterministic_write(tmp_path: Path):
    report_a = build_amc_enrichment_audit(
        products_path=PRODUCTS,
        showtimes_path=SHOWTIMES,
        generated_at=STAMP,
    )
    report_b = build_amc_enrichment_audit(
        products_path=PRODUCTS,
        showtimes_path=SHOWTIMES,
        generated_at=STAMP,
    )
    assert report_a == report_b
    out = write_audit_outputs(report_a, tmp_path)
    assert out.name == "amc_enrichment_coverage.json"
    loaded = json.loads(out.read_text(encoding="utf-8"))
    assert loaded["audit_id"] == "amc_enrichment_coverage"
    assert "public/" not in str(out).replace("\\", "/")


def test_cli_no_secret_dependency(tmp_path: Path):
    import subprocess
    import sys

    project_root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [
            sys.executable,
            str(project_root / "scripts" / "audit_amc_enrichment.py"),
            "--products-path",
            str(PRODUCTS),
            "--showtimes-path",
            str(SHOWTIMES),
            "--releases-path",
            str(tmp_path / "missing.json"),
            "--output-dir",
            str(tmp_path),
            "--generated-at",
            STAMP,
        ],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "amc_enrichment_coverage.json").exists()
    assert "AMC_API" not in result.stdout
    assert "AMC_API_KEY" not in result.stdout
    loaded = json.loads((tmp_path / "amc_enrichment_coverage.json").read_text(encoding="utf-8"))
    assert loaded["inputs"]["requires_amc_api_secret"] is False
