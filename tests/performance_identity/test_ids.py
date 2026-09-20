"""Tests for deterministic performance-id helpers."""

from reel_seattle.performance_identity.ids import (
    gi_performance_id,
    host_compatible_performance_id,
)


def test_gi_performance_id_is_deterministic_from_occurrence_id():
    occurrence_id = "the-hole|siff-film-center|2026-09-20|18:30"

    assert (
        gi_performance_id(occurrence_id)
        == "xsrc:grand-illusion:b4b235cc812b1e44"
    )


def test_host_compatible_performance_id_uses_id_namespace():
    assert host_compatible_performance_id("abc12345") == "id:abc12345"


def test_film_id_enrichment_does_not_change_gi_performance_id():
    occurrence_id = "the-hole|siff-film-center|2026-09-20|18:30"
    before_enrichment = gi_performance_id(occurrence_id)

    # film_id is metadata enrichment, not part of the occurrence seed.
    enriched_showtime = {
        "source_occurrence_id": occurrence_id,
        "film_id": "film-the-hole",
    }
    after_enrichment = gi_performance_id(enriched_showtime["source_occurrence_id"])

    assert after_enrichment == before_enrichment
