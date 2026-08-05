"""T-ENR-01A enrichment audit tests (no live TMDB in CI)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.enrichment import (
    build_coverage_report,
    confirmed_tmdb_films,
    extract_enrichment_fields,
    field_presence,
    validate_proposed_enrichment_record,
)
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def _sample_catalog():
    return {
        "schema_version": "1.0.0",
        "generated_at": "2026-07-28T00:00:00+00:00",
        "films": [
            {
                "film_id": "tmdb:15080",
                "identity_type": "tmdb",
                "tmdb_id": 15080,
                "match_status": "confirmed_manual",
                "match_method": "manual",
                "match_confidence": 1.0,
                "source_identities": [
                    {"source": "amc", "source_film_id": "83588", "source_title": "Only Yesterday"}
                ],
                "normalized_title": "Only Yesterday",
            },
            {
                "film_id": "tmdb:15080",
                "identity_type": "tmdb",
                "tmdb_id": 15080,
                "match_status": "confirmed_automatic",
                "match_method": "automatic",
                "match_confidence": 0.95,
                "source_identities": [
                    {"source": "siff", "source_film_id": "x", "source_title": "Only Yesterday"}
                ],
            },
            {
                "film_id": "source:amc:1",
                "identity_type": "source",
                "tmdb_id": None,
                "match_status": "unmatched",
                "match_method": "fallback",
                "match_confidence": None,
                "source_identities": [{"source": "amc", "source_film_id": "1"}],
            },
            {
                "film_id": "source:amc:2",
                "identity_type": "source",
                "tmdb_id": None,
                "match_status": "non_film",
                "match_method": "none",
                "match_confidence": None,
                "source_identities": [{"source": "amc", "source_film_id": "2"}],
            },
        ],
    }


def test_confirmed_tmdb_dedup_and_excludes_fallbacks():
    films = confirmed_tmdb_films(_sample_catalog())
    assert len(films) == 1
    assert films[0]["tmdb_id"] == 15080
    assert films[0]["sources"] == ["amc", "siff"]
    assert films[0]["match_status"] == "confirmed_manual"


def test_extract_and_presence():
    details = {
        "id": 15080,
        "title": "Only Yesterday",
        "original_title": "おもひでぽろぽろ",
        "original_language": "ja",
        "release_date": "1991-07-20",
        "overview": "A story.",
        "tagline": "",
        "runtime": 118,
        "poster_path": "/abc.jpg",
        "backdrop_path": "/def.jpg",
        "vote_average": 7.5,
        "popularity": 4.2,
        "genres": [{"id": 16, "name": "Animation"}, {"id": 18, "name": "Drama"}],
        "external_ids": {"imdb_id": "tt0094625"},
        "credits": {
            "crew": [
                {"id": 608, "name": "Isao Takahata", "job": "Director"},
                {"id": 608, "name": "Isao Takahata", "job": "Director"},
            ],
            "cast": [
                {"id": 1, "name": "Miki Imai", "character": "Taeko", "order": 0},
                {"id": 2, "name": "Toshirô Yanagiba", "character": "Toshio", "order": 1},
            ],
        },
    }
    extracted = extract_enrichment_fields(details)
    assert len(extracted["directors"]) == 1
    assert extracted["imdb_id"] == "tt0094625"
    presence = field_presence(extracted)
    assert presence["overview"] is True
    assert presence["genres"] is True
    assert presence["directors"] is True
    assert presence["imdb_id"] is True
    assert presence["poster_path"] is True
    assert presence["top_cast"] is True
    assert presence["tagline"] is False


def test_coverage_report_deterministic_and_secret_safe():
    films = confirmed_tmdb_films(_sample_catalog())
    report = build_coverage_report(
        films=films,
        field_hits={"overview": 1, "genres": 1},
        errors=[],
        generated_at="2026-07-28T00:00:00+00:00",
        live_run=False,
    )
    assert report["total_confirmed_tmdb_films"] == 1
    assert report["field_coverage"]["overview"]["rate"] == 1.0
    assert report["field_coverage"]["runtime"]["present"] == 0
    assert_no_tmdb_secret_leakage(report)
    # Stable key order via JSON dump
    text = json.dumps(report, sort_keys=True)
    assert "Bearer" not in text
    assert "api_key" not in text


def test_validate_proposed_record():
    record = {
        "film_id": "tmdb:15080",
        "tmdb_id": 15080,
        "imdb_id": "tt0094625",
        "release_date": "1991-07-20",
        "genres": [{"id": 16, "name": "Animation"}],
        "directors": [{"tmdb_person_id": 608, "name": "Isao Takahata"}],
        "poster": {"path": "/abc.jpg", "url": None},
        "backdrop": {"path": "/def.jpg", "url": None},
        "provenance": {
            "provider": "tmdb",
            "fetched_at": "2026-07-28T00:00:00+00:00",
            "language": "en-US",
        },
    }
    validate_proposed_enrichment_record(record)

    with pytest.raises(ValueError):
        validate_proposed_enrichment_record({**record, "film_id": "source:amc:1"})
    with pytest.raises(ValueError):
        validate_proposed_enrichment_record({**record, "imdb_id": "bad"})
    with pytest.raises(ValueError):
        bad = dict(record)
        bad["genres"] = [{"id": 1, "name": "Drama"}, {"id": 2, "name": "Drama"}]
        validate_proposed_enrichment_record(bad)


def test_partial_missing_fields_ok():
    extracted = extract_enrichment_fields(
        {
            "id": 1,
            "title": "Sparse",
            "original_title": None,
            "release_date": None,
            "overview": None,
            "runtime": None,
            "poster_path": None,
            "backdrop_path": None,
            "genres": [],
            "external_ids": {},
            "credits": {"crew": [], "cast": []},
        }
    )
    presence = field_presence(extracted)
    assert presence["display_title"] is True
    assert presence["overview"] is False
    assert presence["directors"] is False
