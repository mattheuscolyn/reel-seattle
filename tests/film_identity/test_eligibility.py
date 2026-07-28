"""Eligibility + title normalization tests."""

from __future__ import annotations

from reel_seattle.film_identity.eligibility import (
    AMBIGUOUS_PROGRAM,
    ELIGIBLE,
    NON_FILM,
    classify_eligibility,
    normalize_search_title,
)


def test_sensory_suffix_stripped_for_search_title():
    assert normalize_search_title("Supergirl: Sensory Friendly Screening") == "Supergirl"


def test_year_and_punctuation_normalization():
    assert normalize_search_title("SINNERS") == "Sinners"
    assert "2024" not in (normalize_search_title("Dune (2024 Event)") or "")


def test_eligibility_feature_vs_programs():
    assert classify_eligibility(source_title="Moana").status == ELIGIBLE
    assert (
        classify_eligibility(source_title="AMC Screen Unseen: July 20").status == NON_FILM
    )
    assert (
        classify_eligibility(source_title="Anniversary Double Feature").status == NON_FILM
    )
    assert classify_eligibility(source_title="NT Live: Hamlet").status == NON_FILM
    fest = classify_eligibility(source_title="Emerald City Short Film Festival")
    assert fest.status in {NON_FILM, AMBIGUOUS_PROGRAM}
