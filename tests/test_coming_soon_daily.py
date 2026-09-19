"""Offline tests for the non-blocking daily Coming Soon stage."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from reel_seattle.emit.coming_soon_daily import (
    OUTCOME_PUBLISHED,
    OUTCOME_RETAINED,
    OUTCOME_UNCHANGED,
    STAGE_REFRESHED,
    STAGE_RETAINED,
    STAGE_UNAVAILABLE,
    format_diagnostics,
    refresh_amc_catalog_stage,
    refresh_tmdb_stage,
    run_daily_coming_soon,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "coming_soon"
AMC_PAGES = FIXTURES / "amc_catalog_pages"
TODAY = date(2026, 9, 15)
GENERATED_AT = "2026-09-15T23:30:00-07:00"


def _seed_tmdb_candidates(path: Path) -> None:
    """Write TMDB theatrical evidence for fixture AMC titles (strongly_expected)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": "1.0.0",
        "generated_at": GENERATED_AT,
        "source": "tmdb",
        "fetch": {"status": "success"},
        "stats": {"candidates": 2},
        "candidates": [
            {
                "source": "tmdb",
                "tmdb_id": 910001,
                "title": "Fixture Tentpole",
                "original_title": "Fixture Tentpole",
                "original_language": "en",
                "release_date": "2026-11-20",
                "popularity": 10.0,
                "vote_count": 0,
                "poster_path": None,
                "has_poster": False,
                "has_overview": True,
                "quality_flags": [],
            },
            {
                "source": "tmdb",
                "tmdb_id": 910002,
                "title": "Fixture Amélie Revival",
                "original_title": "Fixture Amélie Revival",
                "original_language": "fr",
                "release_date": "2026-10-02",
                "popularity": 5.0,
                "vote_count": 0,
                "poster_path": None,
                "has_poster": False,
                "has_overview": True,
                "quality_flags": [],
            },
        ],
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


class FailingTmdbClient:
    def discover_movie(self, params):  # noqa: ARG002 - signature parity
        raise RuntimeError("tmdb offline")


class StubTmdbClient:
    def __init__(self, rows):
        self.rows = rows

    def discover_movie(self, params):  # noqa: ARG002 - single page stub
        return {
            "page": 1,
            "total_pages": 1,
            "total_results": len(self.rows),
            "results": self.rows,
        }


def _run(tmp_path: Path, **overrides):
    tmdb_path = tmp_path / "tmdb_us_theatrical_candidates.json"
    if "tmdb_candidates_path" not in overrides:
        _seed_tmdb_candidates(tmdb_path)
    kwargs = {
        "analysis_path": tmp_path / "coming_soon_candidates_current.json",
        "output_path": tmp_path / "coming_soon_current.json",
        "catalog_path": tmp_path / "amc_coming_soon_catalog.json",
        "tmdb_candidates_path": tmdb_path,
        "showtimes_current_path": tmp_path / "missing_showtimes.json",
        "registry_path": tmp_path / "missing_theaters.json",
        "logs_dir": tmp_path / "logs",
        "repo_root": tmp_path,
        "amc_fixture_pages": AMC_PAGES,
        "today_date": TODAY,
        "generated_at": GENERATED_AT,
        "refresh_tmdb": False,
    }
    kwargs.update(overrides)
    return run_daily_coming_soon(**kwargs)


def test_fixture_run_publishes_and_collapses_event_variant(tmp_path: Path):
    result = _run(tmp_path)

    assert result.outcome == OUTCOME_PUBLISHED
    assert result.published is True
    assert result.soft_failure is False

    artifact = json.loads(
        (tmp_path / "coming_soon_current.json").read_text(encoding="utf-8")
    )
    analysis = json.loads(
        (tmp_path / "coming_soon_candidates_current.json").read_text(encoding="utf-8")
    )
    titles = [entry["title"] for entry in artifact["entries"]]
    # Three catalog rows collapse to two films: the event variant folds in.
    # Display titles keep their diacritics; only join keys fold them.
    assert titles == ["Fixture Am\u00e9lie Revival", "Fixture Tentpole"]
    assert artifact["stats"]["user_visible_count"] == 2
    tentpole = next(entry for entry in artifact["entries"] if entry["title"] == "Fixture Tentpole")
    assert tentpole["relevance_tier"] == "strongly_expected"
    assert any("Fan First" in (row.get("title") or "") for row in tentpole["engagements"])
    assert analysis["stats"]["relevance_tier_counts"]["strongly_expected"] == 2


def test_amc_stage_refreshes_durable_snapshot(tmp_path: Path):
    catalog_path = tmp_path / "amc_coming_soon_catalog.json"

    stage, artifact = refresh_amc_catalog_stage(
        catalog_path=catalog_path,
        fixture_pages=AMC_PAGES,
        live=False,
        generated_at=GENERATED_AT,
    )

    assert stage.outcome == STAGE_REFRESHED
    assert stage.records == 3
    assert artifact is not None
    assert catalog_path.is_file()


def test_amc_stage_retains_previous_snapshot_when_fetch_unavailable(tmp_path: Path):
    catalog_path = tmp_path / "amc_coming_soon_catalog.json"
    refresh_amc_catalog_stage(
        catalog_path=catalog_path,
        fixture_pages=AMC_PAGES,
        live=False,
        generated_at=GENERATED_AT,
    )
    before = catalog_path.read_text(encoding="utf-8")

    stage, artifact = refresh_amc_catalog_stage(
        catalog_path=catalog_path,
        fixture_pages=tmp_path / "no-such-fixtures",
        live=False,
        generated_at="2026-09-16T23:30:00-07:00",
    )

    assert stage.soft_failure is True
    assert stage.outcome == STAGE_RETAINED
    assert stage.records == 3
    assert artifact is not None
    assert catalog_path.read_text(encoding="utf-8") == before


def test_amc_stage_reports_unavailable_without_prior_snapshot(tmp_path: Path):
    stage, artifact = refresh_amc_catalog_stage(
        catalog_path=tmp_path / "amc_coming_soon_catalog.json",
        fixture_pages=tmp_path / "no-such-fixtures",
        live=False,
        generated_at=GENERATED_AT,
    )

    assert stage.outcome == STAGE_UNAVAILABLE
    assert artifact is None


def test_tmdb_stage_retains_previous_snapshot_on_failure(tmp_path: Path):
    candidates_path = tmp_path / "tmdb_us_theatrical_candidates.json"
    good, _artifact = refresh_tmdb_stage(
        candidates_path=candidates_path,
        live=True,
        start_date=TODAY,
        end_date=date(2026, 12, 14),
        window_days=90,
        generated_at=GENERATED_AT,
        client=StubTmdbClient(
            [
                {
                    "id": 700001,
                    "title": "Stub Discovery",
                    "release_date": "2026-10-30",
                    "popularity": 8.0,
                    "vote_count": 12,
                    "poster_path": "/p.jpg",
                    "overview": "Stub.",
                    "adult": False,
                }
            ]
        ),
    )
    assert good.outcome == STAGE_REFRESHED
    before = candidates_path.read_text(encoding="utf-8")

    stage, artifact = refresh_tmdb_stage(
        candidates_path=candidates_path,
        live=True,
        start_date=TODAY,
        end_date=date(2026, 12, 14),
        window_days=90,
        generated_at="2026-09-16T23:30:00-07:00",
        client=FailingTmdbClient(),
    )

    assert stage.soft_failure is True
    assert stage.outcome == STAGE_RETAINED
    assert artifact is not None
    assert candidates_path.read_text(encoding="utf-8") == before


def test_public_artifact_is_retained_when_amc_becomes_unavailable(tmp_path: Path):
    _run(tmp_path)
    output = tmp_path / "coming_soon_current.json"
    before = output.read_text(encoding="utf-8")

    result = _run(
        tmp_path,
        amc_fixture_pages=None,
        catalog_path=tmp_path / "vanished_catalog.json",
    )

    assert result.published is False
    assert result.outcome == OUTCOME_RETAINED
    assert result.soft_failure is True
    assert output.read_text(encoding="utf-8") == before


def test_second_identical_run_reports_unchanged_membership(tmp_path: Path):
    _run(tmp_path)

    result = _run(tmp_path, generated_at="2026-09-15T23:59:00-07:00")

    assert result.outcome == OUTCOME_UNCHANGED
    assert result.published is False
    assert result.soft_failure is False


def test_tmdb_failure_does_not_block_publication(tmp_path: Path):
    # Seed AMC-only catalog first; TMDB live refresh fails but prior seed remains.
    _seed_tmdb_candidates(tmp_path / "tmdb_us_theatrical_candidates.json")
    result = _run(
        tmp_path,
        live=True,
        refresh_amc=False,
        refresh_tmdb=True,
        tmdb_client=FailingTmdbClient(),
    )

    assert result.published is True
    assert result.soft_failure is True
    assert result.entry_count >= 1


def test_diagnostics_are_printable_lines(tmp_path: Path):
    result = _run(tmp_path)

    lines = format_diagnostics(result)

    assert all(isinstance(line, str) and line for line in lines)
    assert any("Coming Soon" in line for line in lines)
