"""Tests for null-TMDB suppression readiness audit."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from reel_seattle.analysis.tmdb_suppression_readiness import (
    audit_tmdb_suppression_readiness,
    write_audit,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _film(
    *,
    title: str,
    status: str,
    eligibility: str,
    entity_kind: str,
    tmdb_id: int | None = None,
    source: str = "siff",
) -> dict:
    return {
        "tmdb_id": tmdb_id,
        "match_status": status,
        "eligibility": eligibility,
        "entity_kind": entity_kind,
        "normalized_title": title,
        "runtime_min": 90,
        "year_hint": None,
        "source_identities": [
            {
                "source": source,
                "source_film_id": title.casefold().replace(" ", "-"),
                "source_title": title,
            }
        ],
    }


def test_blanket_null_tmdb_gate_fails_when_real_movie_like_identity_is_unmatched():
    catalog = {
        "generated_at": "2026-09-29T13:29:09+00:00",
        "films": [
            _film(
                title="Known Movie",
                status="confirmed_automatic",
                eligibility="eligible",
                entity_kind="feature_film",
                tmdb_id=123,
            ),
            _film(
                title="Obscure Feature",
                status="unmatched",
                eligibility="eligible",
                entity_kind="feature_film",
            ),
            _film(
                title="Individually Ticketed Short",
                status="review_required",
                eligibility="eligible",
                entity_kind="short_film",
            ),
            _film(
                title="Mystery Program",
                status="non_film",
                eligibility="non_film",
                entity_kind="mystery_screening",
                source="amc",
            ),
        ],
    }

    report = audit_tmdb_suppression_readiness(catalog)

    assert report["without_tmdb_count"] == 3
    assert report["explicit_program_without_tmdb_count"] == 1
    assert report["movie_like_without_tmdb_count"] == 2
    assert report["blanket_null_tmdb_suppression_safe"] is False
    assert report["recommended_suppression_basis"] == (
        "explicit_non_film_or_program_classification"
    )
    assert report["movie_like_without_tmdb_by_source"] == {"siff": 2}
    assert {row["source_title"] for row in report["unsafe_movie_like_samples"]} == {
        "Obscure Feature",
        "Individually Ticketed Short",
    }


def test_blanket_gate_can_only_be_safe_when_all_tmdb_null_rows_are_explicit_programs():
    catalog = {
        "films": [
            _film(
                title="Double Feature",
                status="non_film",
                eligibility="non_film",
                entity_kind="double_feature",
            ),
            _film(
                title="Shorts Block",
                status="multiple_shorts",
                eligibility="non_film",
                entity_kind="shorts_program",
            ),
        ]
    }

    report = audit_tmdb_suppression_readiness(catalog)

    assert report["without_tmdb_count"] == 2
    assert report["explicit_program_without_tmdb_count"] == 2
    assert report["movie_like_without_tmdb_count"] == 0
    assert report["other_unresolved_without_tmdb_count"] == 0
    assert report["blanket_null_tmdb_suppression_safe"] is True


def test_ambiguous_unresolved_program_blocks_blanket_gate():
    catalog = {
        "films": [
            _film(
                title="Unknown Festival Object",
                status="review_required",
                eligibility="ambiguous_program",
                entity_kind="unknown_program",
            )
        ]
    }
    report = audit_tmdb_suppression_readiness(catalog)
    assert report["movie_like_without_tmdb_count"] == 0
    assert report["other_unresolved_without_tmdb_count"] == 1
    assert report["blanket_null_tmdb_suppression_safe"] is False


def test_write_and_cli(tmp_path: Path):
    catalog = {
        "films": [
            _film(
                title="Obscure Feature",
                status="unmatched",
                eligibility="eligible",
                entity_kind="feature_film",
            )
        ]
    }
    direct = write_audit(
        audit_tmdb_suppression_readiness(catalog),
        tmp_path / "direct.json",
    )
    assert direct.is_file()

    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
    output = tmp_path / "cli.json"
    result = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "audit_tmdb_suppression_readiness.py"),
            "--catalog",
            str(catalog_path),
            "--output",
            str(output),
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert output.is_file()
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["blanket_null_tmdb_suppression_safe"] is False
    assert report["movie_like_without_tmdb_count"] == 1
