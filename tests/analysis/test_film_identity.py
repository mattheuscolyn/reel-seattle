"""Tests for parent film identity derivation (PR Identity-C)."""

from __future__ import annotations

from reel_seattle.analysis.film_identity import (
    CONFIDENCE_HIGH,
    CONFIDENCE_MEDIUM,
    PARENT_METHOD_AMBIGUOUS,
    PARENT_METHOD_SOURCE_FILM_ID,
    PARENT_METHOD_TITLE_EXACT,
    PARENT_METHOD_TITLE_VARIANT_STRIP,
    build_film_key_identity_map,
    derive_parent_identity,
    group_film_keys_by_parent,
    parent_film_key_from_source_film_id,
)


def test_derive_parent_from_sensory_friendly_title():
    identity = derive_parent_identity("Supergirl: Sensory Friendly Screening")
    assert identity.parent_display_title == "Supergirl"
    assert identity.screening_variant_type == "sensory_friendly"
    assert identity.is_special_screening is True
    assert identity.parent_identity_method == PARENT_METHOD_TITLE_VARIANT_STRIP
    assert identity.parent_identity_confidence == CONFIDENCE_MEDIUM


def test_derive_parent_from_source_film_id():
    identity = derive_parent_identity(
        "MOANA IMAX Opening Night Fan Event",
        source_film_id="movie-moana-123",
    )
    assert identity.parent_film_key == parent_film_key_from_source_film_id("movie-moana-123")
    assert identity.parent_identity_method == PARENT_METHOD_SOURCE_FILM_ID
    assert identity.parent_identity_confidence == CONFIDENCE_HIGH


def test_double_feature_marked_ambiguous():
    identity = derive_parent_identity("The Devil Wears Prada 20th Anniversary Double Feature")
    assert identity.parent_identity_method == PARENT_METHOD_AMBIGUOUS
    assert identity.screening_variant_type == "double_feature"


def test_exact_title_is_high_confidence():
    identity = derive_parent_identity("Sinners")
    assert identity.parent_identity_method == PARENT_METHOD_TITLE_EXACT
    assert identity.is_special_screening is False


def test_build_film_key_identity_map_unifies_movie_id():
    rows = [
        {
            "showtime_film_key": "supergirl",
            "film_title": "Supergirl",
            "amc_movie_id": "movie-sg",
            "snapshot_date": "2026-06-24",
            "show_date": "2026-06-24",
            "active_showtime_count": "1",
        },
        {
            "showtime_film_key": "supergirl-sensory-friendly-screening",
            "film_title": "Supergirl: Sensory Friendly Screening",
            "amc_movie_id": "movie-sg",
            "snapshot_date": "2026-06-24",
            "show_date": "2026-06-24",
            "active_showtime_count": "1",
        },
    ]
    identities = build_film_key_identity_map(rows)
    groups = group_film_keys_by_parent(identities)
    assert identities["supergirl"].parent_film_key == identities[
        "supergirl-sensory-friendly-screening"
    ].parent_film_key
    assert len(groups[identities["supergirl"].parent_film_key]) == 2
