"""Scoring threshold and conflict tests."""

from __future__ import annotations

from reel_seattle.film_identity.constants import AUTO_CONFIRM_MIN_SCORE, REVIEW_MIN_SCORE
from reel_seattle.film_identity.scoring import classify_match_bucket, rank_candidates, score_candidate


def _cand(**overrides):
    base = {
        "id": 1,
        "title": "Moana",
        "original_title": "Moana",
        "release_date": "2016-11-23",
        "runtime": 107,
        "popularity": 50,
        "adult": False,
        "media_type": "movie",
    }
    base.update(overrides)
    return base


def test_exact_title_and_year_auto_confirm_range():
    scored = score_candidate(
        search_title="Moana",
        source_year=2016,
        source_runtime=107,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(),
    )
    assert scored.signals["title_exact"] is True
    assert scored.signals["year_exact"] is True
    assert scored.score >= AUTO_CONFIRM_MIN_SCORE
    bucket, proposed = classify_match_bucket([scored])
    assert bucket == "auto"
    assert proposed is not None


def test_year_conflict_blocks_auto_confirm():
    scored = score_candidate(
        search_title="Dune",
        source_year=2021,
        source_runtime=155,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(id=2, title="Dune", release_date="1984-12-14", runtime=137),
    )
    assert "year_conflict" in scored.warnings
    assert scored.score < AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket in {"review", "unmatched"}


def test_runtime_conflict_and_external_id():
    conflict = score_candidate(
        search_title="Moana",
        source_year=2016,
        source_runtime=180,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(runtime=90),
    )
    assert conflict.signals["runtime_conflict"] is True

    external = score_candidate(
        search_title="Totally Wrong Title",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids={"imdb_id": "tt3521164"},
        candidate={
            **_cand(title="Moana"),
            "external_ids": {"imdb_id": "tt3521164"},
        },
    )
    assert external.signals["external_id_exact"] is True
    assert external.score >= REVIEW_MIN_SCORE


def test_popularity_cannot_override_title_conflict():
    goodish = score_candidate(
        search_title="Sinners",
        source_year=2025,
        source_runtime=120,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(
            id=10,
            title="Sinners",
            release_date="2025-04-18",
            runtime=120,
            popularity=1,
        ),
    )
    popular_wrong = score_candidate(
        search_title="Sinners",
        source_year=2025,
        source_runtime=120,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(
            id=11,
            title="Completely Different",
            release_date="2025-01-01",
            runtime=120,
            popularity=99999,
        ),
    )
    ranked = rank_candidates([popular_wrong, goodish])
    assert ranked[0].tmdb_id == 10


def test_remake_ambiguity_without_year():
    scored = score_candidate(
        search_title="Dune",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(id=3, title="Dune", release_date="2021-10-22"),
    )
    assert "remake_ambiguity" in scored.warnings
    bucket, _ = classify_match_bucket([scored])
    assert bucket != "auto"


def test_title_only_exact_enters_review_not_unmatched():
    scored = score_candidate(
        search_title="Unique Title ZZZ",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(id=9, title="Unique Title ZZZ", release_date=None, runtime=None, popularity=0),
    )
    assert scored.score >= REVIEW_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "review"


def test_title_mismatch_stays_unmatched():
    scored = score_candidate(
        search_title="X",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(id=9, title="Y", release_date=None, runtime=None, popularity=0),
    )
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "unmatched"
