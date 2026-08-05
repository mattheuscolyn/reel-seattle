"""T-FILMID-01E matcher calibration regression tests."""

from __future__ import annotations

import json
from pathlib import Path

from reel_seattle.film_identity.constants import AUTO_CONFIRM_MIN_SCORE, REVIEW_MIN_SCORE
from reel_seattle.film_identity.eligibility import classify_eligibility
from reel_seattle.film_identity.normalize_text import normalize_title_key, parse_person_names, person_keys
from reel_seattle.film_identity.presentation import interpret_source_years, normalize_match_title
from reel_seattle.film_identity.scoring import (
    classify_match_bucket,
    rank_candidates,
    score_candidate,
)

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "film_identity" / "reviewed_cases.json"


def _load_cases():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def test_only_yesterday_year_and_score_without_hard_conflict():
    title = "Only Yesterday 35th Anniversary - Studio Ghibli Fest 2026"
    years = interpret_source_years(source_title=title, product_year=2026)
    assert years.canonical_year_candidate == 1991
    assert years.event_year == 2026
    assert years.anniversary_years == 35
    assert years.event_year_not_canonical is True
    assert normalize_match_title(title) == "Only Yesterday"
    elig = classify_eligibility(source_title=title)
    assert elig.status == "eligible"
    assert elig.entity_kind == "feature_film"

    scored = score_candidate(
        search_title="Only Yesterday",
        source_year=years.scoring_year(),
        source_runtime=126,
        source_directors="Isao Takahata",
        source_external_ids=None,
        candidate={
            "id": 15080,
            "title": "Only Yesterday",
            "original_title": "おもひでぽろぽろ",
            "release_date": "1991-07-20",
            "runtime": 118,
            "director": "Isao Takahata",
            "popularity": 5,
            "adult": False,
            "media_type": "movie",
        },
        event_year_relaxed=years.event_year_not_canonical,
    )
    assert scored.signals["year_conflict"] is False
    assert scored.signals["year_exact"] is True
    assert scored.score >= 0.8
    assert "year_conflict" not in scored.warnings


def test_implausible_anniversary_rejected():
    years = interpret_source_years(
        source_title="Fake Movie 400th Anniversary Fest 2026",
        product_year=2026,
    )
    assert years.anniversary_year_derived is False
    assert years.canonical_year_candidate != 1626


def test_title_normalization_variants():
    assert normalize_title_key("SINNERS") == normalize_title_key("Sinners")
    assert normalize_title_key("Bad Guys 2") == normalize_title_key("  the  bad   guys  2 ")
    assert normalize_title_key("Rock ’n’ Roll") == normalize_title_key("Rock 'n' Roll")
    assert normalize_title_key("Tom & Jerry") == normalize_title_key("Tom and Jerry")
    assert normalize_title_key("Amélie") == "amelie"
    assert normalize_title_key("Foo–Bar") == normalize_title_key("Foo-Bar")


def test_director_normalization_variants():
    assert parse_person_names("HAYAO MIYAZAKI") == ["hayao miyazaki"]
    assert parse_person_names("Robert  Eggers") == ["robert eggers"]
    assert parse_person_names("S. S. Rajamouli") == parse_person_names("S.S. Rajamouli")
    assert set(parse_person_names("Joel Coen & Ethan Coen")) == {
        "joel coen",
        "ethan coen",
    }
    assert parse_person_names("Director: Jane Campion") == ["jane campion"]
    scored = score_candidate(
        search_title="Moana",
        source_year=2016,
        source_runtime=107,
        source_directors="Ron Clements",
        source_external_ids=None,
        candidate={
            "id": 1,
            "title": "Moana",
            "release_date": "2016-11-23",
            "runtime": 107,
            "director": "RON CLEMENTS",
            "adult": False,
            "media_type": "movie",
        },
    )
    assert scored.signals["director_overlap"] is True


def test_unavailable_evidence_neutral_title_exact_enters_review():
    scored = score_candidate(
        search_title="Obscure Indie Title XYZ",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 9,
            "title": "Obscure Indie Title XYZ",
            "release_date": None,
            "runtime": None,
            "popularity": 0,
            "adult": False,
            "media_type": "movie",
        },
    )
    assert scored.score >= 0.55
    assert "weak_title_only_match" in scored.warnings
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "review"
    assert bucket != "auto"


def test_remake_margin_blocks_auto():
    a = score_candidate(
        search_title="Dune",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 438631,
            "title": "Dune",
            "release_date": "2021-10-22",
            "runtime": 155,
            "popularity": 80,
            "adult": False,
            "media_type": "movie",
        },
    )
    b = score_candidate(
        search_title="Dune",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 841,
            "title": "Dune",
            "release_date": "1984-12-14",
            "runtime": 137,
            "popularity": 20,
            "adult": False,
            "media_type": "movie",
        },
    )
    ranked = rank_candidates([a, b])
    bucket, proposed = classify_match_bucket(ranked)
    assert bucket != "auto"
    assert proposed is not None


def test_program_entities_not_forced_to_tmdb():
    shorts = classify_eligibility(source_title="Emerald City Short Film Festival")
    assert shorts.status == "non_film"
    assert shorts.entity_kind == "shorts_program"
    assert "program_entity_not_tmdb_movie" in shorts.reasons

    mystery = classify_eligibility(source_title="AMC Screen Unseen: July 20")
    assert mystery.status == "non_film"
    assert mystery.entity_kind == "mystery_screening"


def test_reviewed_fixture_corpus():
    for case in _load_cases():
        title = case["source_title"]
        expected = case["expected"]
        years = interpret_source_years(
            source_title=title,
            product_year=case.get("product_year"),
        )
        elig = classify_eligibility(source_title=title)
        if "normalized_title" in expected:
            assert normalize_match_title(title) == expected["normalized_title"]
        if "normalized_title_key" in expected:
            assert normalize_title_key(title) == expected["normalized_title_key"]
        if "normalized_title_contains" in expected:
            assert expected["normalized_title_contains"].casefold() in (
                normalize_match_title(title) or ""
            ).casefold()
        if "eligibility" in expected:
            assert elig.status == expected["eligibility"]
        if "entity_kind" in expected:
            assert elig.entity_kind == expected["entity_kind"]
        if "entity_kind_in" in expected:
            assert elig.entity_kind in expected["entity_kind_in"]
        if "canonical_year_candidate" in expected:
            assert years.canonical_year_candidate == expected["canonical_year_candidate"]
        if "event_year" in expected:
            assert years.event_year == expected["event_year"]
        if expected.get("event_year_not_canonical"):
            assert years.event_year_not_canonical is True
        if "warnings_any" in expected:
            blob = set(years.warnings) | set(elig.reasons)
            assert set(expected["warnings_any"]) & blob
        if "director_key_contains" in expected:
            assert expected["director_key_contains"] in person_keys(case.get("directors_raw"))
        offline = case.get("offline_candidates")
        if not offline:
            continue
        scored = [
            score_candidate(
                search_title=normalize_match_title(title) or title,
                source_year=years.scoring_year(),
                source_runtime=case.get("runtime_min"),
                source_directors=case.get("directors_raw"),
                source_external_ids=None,
                candidate=row,
                event_year_relaxed=years.event_year_not_canonical,
            )
            for row in offline
        ]
        ranked = rank_candidates(scored)
        bucket, proposed = classify_match_bucket(ranked)
        if "bucket_in" in expected:
            assert bucket in expected["bucket_in"]
        if expected.get("no_year_conflict_vs_1991") and proposed:
            assert proposed.signals.get("year_conflict") is False
        if "top_candidate_tmdb_id" in expected and proposed:
            assert proposed.tmdb_id == expected["top_candidate_tmdb_id"]
            assert proposed.score >= 0.7


def test_thresholds_unchanged():
    from reel_seattle.film_identity.constants import REVIEW_MIN_SCORE

    assert AUTO_CONFIRM_MIN_SCORE == 0.92
    assert REVIEW_MIN_SCORE == 0.55
