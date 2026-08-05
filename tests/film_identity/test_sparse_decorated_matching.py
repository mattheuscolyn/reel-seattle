"""Focused tests for sparse-year, runtime bands, and decorated-title normalization."""

from __future__ import annotations

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    REVIEW_MIN_SCORE,
    RUNTIME_COMPATIBLE_MAX_MIN,
    RUNTIME_CONFLICT_MIN,
    RUNTIME_SOFT_MAX_MIN,
)
from reel_seattle.film_identity.presentation import extract_match_title, normalize_match_title
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


def test_missing_year_does_not_penalize_unambiguous_exact_title():
    scored = score_candidate(
        search_title="Unique Film Alpha",
        source_year=None,
        source_runtime=120,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(
            id=42,
            title="Unique Film Alpha",
            release_date="2019-01-01",
            runtime=121,
        ),
    )
    assert scored.signals["year_evidence"] == "missing"
    assert scored.signals["year_conflict"] is False
    assert "year_conflict" not in scored.warnings
    assert scored.signals["runtime_near"] is True
    assert scored.score >= AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "auto"


def test_missing_year_same_title_remakes_require_review():
    a = score_candidate(
        search_title="Dune",
        source_year=None,
        source_runtime=155,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(id=2, title="Dune", release_date="2021-10-22", runtime=155),
    )
    b = score_candidate(
        search_title="Dune",
        source_year=None,
        source_runtime=155,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(id=3, title="Dune", release_date="1984-12-14", runtime=137),
    )
    ranked = rank_candidates([a, b])
    bucket, proposed = classify_match_bucket(ranked)
    assert bucket == "review"
    assert proposed is not None
    assert "same_title_remake_ambiguity" in proposed.warnings


def test_compatible_year_supports_match():
    scored = score_candidate(
        search_title="Moana",
        source_year=2016,
        source_runtime=107,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(),
    )
    assert scored.signals["year_evidence"] == "compatible"
    assert scored.score >= AUTO_CONFIRM_MIN_SCORE


def test_incompatible_year_remains_warning():
    scored = score_candidate(
        search_title="Dune",
        source_year=2021,
        source_runtime=155,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(id=2, title="Dune", release_date="1984-12-14", runtime=137),
    )
    assert scored.signals["year_evidence"] == "conflict"
    assert "year_conflict" in scored.warnings
    assert scored.score < AUTO_CONFIRM_MIN_SCORE


def test_runtime_tolerance_bands():
    assert RUNTIME_COMPATIBLE_MAX_MIN == 3
    assert RUNTIME_SOFT_MAX_MIN == 12
    assert RUNTIME_CONFLICT_MIN == 25

    for delta in (1, 2, 3):
        scored = score_candidate(
            search_title="Moana",
            source_year=2016,
            source_runtime=107,
            source_directors=None,
            source_external_ids=None,
            candidate=_cand(runtime=107 + delta),
        )
        assert scored.signals["runtime_near"] is True
        assert scored.signals["runtime_status"] == "match"
        assert scored.signals["runtime_delta_minutes"] == delta

    soft = score_candidate(
        search_title="Moana",
        source_year=2016,
        source_runtime=107,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(runtime=107 + 8),
    )
    assert soft.signals["runtime_near"] is False
    assert soft.signals["runtime_soft"] is True
    assert soft.signals["runtime_status"] == "soft"
    assert "runtime_soft_penalty" in soft.warnings

    conflict = score_candidate(
        search_title="Moana",
        source_year=2016,
        source_runtime=107,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(runtime=107 + 40),
    )
    assert conflict.signals["runtime_conflict"] is True

    missing = score_candidate(
        search_title="Moana",
        source_year=2016,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate=_cand(),
    )
    assert missing.signals["runtime_status"] == "unavailable"
    assert missing.signals["contributions"]["runtime"]["kind"] == "absent"


def test_train_to_busan_phrase_normalization():
    title = "Train to Busan - 10th Anniversary Remastered & Revived"
    extracted = extract_match_title(title)
    assert extracted.base_title == "Train to Busan"
    assert extracted.removed_phrases == ("10th Anniversary Remastered & Revived",)
    assert "&" not in (extracted.base_title or "")
    assert "Revived" not in (extracted.base_title or "")


def test_parenthetical_35mm_normalization():
    title = "Teenage Sex and Death at Camp Miasma (35mm)"
    extracted = extract_match_title(title)
    assert extracted.base_title == "Teenage Sex and Death at Camp Miasma"
    assert extracted.format_tags == ("35mm",)
    assert any("(35mm)" == p or "35mm" in p for p in extracted.removed_phrases)


def test_genuine_subtitles_and_meaningful_parens_remain():
    assert normalize_match_title("Spider-Man: Brand New Day") == "Spider-Man: Brand New Day"
    assert (
        normalize_match_title("Mission: Impossible - Dead Reckoning")
        == "Mission: Impossible - Dead Reckoning"
    )
    assert normalize_match_title("Hercules (1997)") == "Hercules (1997)"
    sensory = extract_match_title(
        "Spider-Man: Brand New Day: Sensory Friendly Screening"
    )
    assert sensory.base_title == "Spider-Man: Brand New Day"
    assert "Sensory Friendly Screening" in sensory.removed_phrases


def test_multiple_qualifiers_extracted_together():
    extracted = extract_match_title(
        "Only Yesterday 35th Anniversary - Studio Ghibli Fest 2026"
    )
    assert extracted.base_title == "Only Yesterday"
    joined = " ".join(extracted.removed_phrases).casefold()
    assert "35th anniversary" in joined
    assert "ghibli" in joined
