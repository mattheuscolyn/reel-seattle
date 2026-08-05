"""Tests for T-FILMID-01D workflow support (no live TMDB calls)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.film_identity.workflow_support import (
    assert_allowed_changed_paths,
    build_match_summary_markdown,
    import_generated_artifacts,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = PROJECT_ROOT / ".github" / "workflows" / "film_identity_match.yml"


def test_workflow_yaml_manual_defaults_and_secrets_env_only():
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "name: Film Identity — Live TMDB Match" in text
    assert "workflow_dispatch:" in text
    assert "schedule:" not in text
    assert "persist_mode:" in text
    assert "artifact-only" in text
    assert "create-pr" in text
    assert "default: artifact-only" in text
    assert "refresh_cache:" in text
    assert "python scripts/match_tmdb_films.py" in text
    assert "--refresh-cache" in text
    assert "python scripts/validate_film_identity.py --require-generated" in text
    assert "python scripts/guard_film_identity_diff.py" in text
    assert "python scripts/inventory_film_identities.py" in text
    assert "python -m pytest tests/film_identity -q" in text
    assert "TMDB_READ_ACCESS_TOKEN: ${{ secrets.TMDB_READ_ACCESS_TOKEN }}" in text
    assert "TMDB_API_KEY: ${{ secrets.TMDB_API_KEY }}" in text
    assert "film-identity-match-${{ github.run_id }}" in text
    assert "concurrency:" in text
    assert "group: film-identity-live-match" in text
    assert "cancel-in-progress: false" in text
    # Secrets must not be passed as CLI flags / query fragments.
    assert "--token" not in text
    assert "api_key=" not in text
    assert "TMDB_READ_ACCESS_TOKEN }}" in text  # env mapping only
    assert "match_tmdb_films.py \"${ARGS[@]}\"" in text or 'match_tmdb_films.py "${ARGS[@]}"' in text
    # PR mode never targets pushing to main as the working branch tip commit flow.
    assert "--base main" in text
    assert "git push -u origin \"$BRANCH\"" in text
    assert 'git push origin main' not in text
    assert "contents: write" in text
    assert "pull-requests: write" in text
    # Match job stays read-only.
    assert text.count("contents: read") >= 1


def test_diff_guard_allows_only_generated_paths():
    allowed = assert_allowed_changed_paths(
        [
            "data/film_identity/film_identity_catalog.json",
            "data/audits/tmdb_film_identity_coverage.json",
        ]
    )
    assert "data/film_identity/film_identity_catalog.json" in allowed
    with pytest.raises(ValueError, match="unexpected"):
        assert_allowed_changed_paths(["public/data/showtimes_current.json"])
    with pytest.raises(ValueError, match="unexpected"):
        assert_allowed_changed_paths(["data/film_identity/tmdb_match_decisions.json"])
    with pytest.raises(ValueError, match="unexpected"):
        assert_allowed_changed_paths(["v2/V2App.jsx"])
    with pytest.raises(ValueError, match="unexpected"):
        assert_allowed_changed_paths(["data/cache/tmdb/abc.json"])


def test_summary_handles_empty_counts():
    markdown = build_match_summary_markdown(
        {
            "schema_version": "1.0.0",
            "generated_at": "2026-07-27T00:00:00+00:00",
            "total_unique_source_identities": 0,
            "confirmed_automatic": 0,
            "confirmed_manual": 0,
            "review_required": 0,
            "unmatched": 0,
            "non_film": 0,
            "deferred": 0,
            "errors": 0,
            "by_source": {},
        },
        auth_mode="bearer",
    )
    assert "confirmed_automatic: **0**" in markdown
    assert "Public identity emission enabled" in markdown
    assert "tmdb_auth_mode: `bearer`" in markdown


def test_import_helper_validates_and_dry_run(tmp_path: Path):
    catalog = {
        "schema_version": "1.0.0",
        "generated_at": "2026-07-27T00:00:00+00:00",
        "films": [
            {
                "film_id": "source:amc:1",
                "identity_type": "source",
                "tmdb_id": None,
                "source_identities": [
                    {
                        "source": "amc",
                        "source_film_id": "1",
                        "showtime_film_key": "x",
                        "source_title": "X",
                    }
                ],
                "match_status": "unmatched",
                "match_method": "fallback",
                "match_confidence": None,
            }
        ],
    }
    review = {
        "schema_version": "1.0.0",
        "generated_at": "2026-07-27T00:00:00+00:00",
        "items": [],
    }
    coverage = {
        "schema_version": "1.0.0",
        "generated_at": "2026-07-27T00:00:00+00:00",
        "total_unique_source_identities": 1,
        "confirmed_automatic": 0,
        "confirmed_manual": 0,
        "review_required": 0,
        "unmatched": 1,
        "non_film": 0,
        "deferred": 0,
        "errors": 0,
        "review_queue_size": 0,
    }
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    (pkg / "film_identity_catalog.json").write_text(
        json.dumps(catalog), encoding="utf-8"
    )
    (pkg / "tmdb_match_review_queue.json").write_text(
        json.dumps(review), encoding="utf-8"
    )
    (pkg / "tmdb_film_identity_coverage.json").write_text(
        json.dumps(coverage), encoding="utf-8"
    )
    (pkg / "tmdb_match_decisions.json").write_text("{}", encoding="utf-8")

    with pytest.raises(ValueError, match="authored decisions"):
        import_generated_artifacts(pkg, root=tmp_path / "repo", dry_run=True)

    (pkg / "tmdb_match_decisions.json").unlink()
    repo = tmp_path / "repo"
    # Schema paths are resolved from PROJECT_ROOT via validate_against_schema;
    # dry-run import against a fake root still validates using real schemas.
    summary = import_generated_artifacts(pkg, root=PROJECT_ROOT, dry_run=True)
    assert summary["dry_run"] is True
    assert "film_identity_catalog.json" in summary["imported"]
