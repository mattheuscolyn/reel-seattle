"""Multi-feature program classification and component-title evidence."""

from __future__ import annotations

import json

from reel_seattle.film_identity.decisions import empty_decisions_document
from reel_seattle.film_identity.eligibility import (
    ELIGIBLE,
    NON_FILM,
    classify_eligibility,
    extract_component_titles,
)
from reel_seattle.film_identity.inventory import inventory_source_identities
from reel_seattle.film_identity.matcher import match_source_identity


def test_triple_feature_is_non_film_program():
    result = classify_eligibility(
        source_title="Television Terror Triple Feature Pizza Party 2",
        source="grand_illusion",
    )
    assert result.status == NON_FILM
    assert result.entity_kind == "composite_event"
    assert "multi_feature_program" in result.reasons


def test_double_feature_components_are_source_declared_only():
    title = "Shu Lea Cheang double feature: I.K.U. (Director’s Cut) and UKI"
    result = classify_eligibility(source_title=title, source="grand_illusion")
    assert result.status == NON_FILM
    assert result.entity_kind == "double_feature"
    assert extract_component_titles(
        source_title=title,
        source="grand_illusion",
    ) == ("I.K.U.", "UKI")

    # The source identifies a package but does not name the two films.
    assert extract_component_titles(
        source_title="UNIVERSAL MONSTER MASH DOUBLE FEATURE",
        source="beacon",
    ) == ()


def test_registered_series_context_confirms_nwff_plus_package():
    title = "STUFF 2026: Jucks + If I'm Here It Is By Mystery"
    result = classify_eligibility(source_title=title, source="nwff")
    assert result.status == NON_FILM
    assert result.entity_kind == "composite_event"
    assert "composite_title_pair" in result.reasons
    assert extract_component_titles(source_title=title, source="nwff") == (
        "Jucks",
        "If I'm Here It Is By Mystery",
    )


def test_genuine_plus_title_stays_eligible():
    result = classify_eligibility(source_title="Thelma + Louise", source="beacon")
    assert result.status == ELIGIBLE
    assert extract_component_titles(
        source_title="Thelma + Louise",
        source="beacon",
    ) == ()


def test_inventory_and_matcher_retain_component_titles(tmp_path):
    showtimes_path = tmp_path / "showtimes.json"
    title = "Shu Lea Cheang double feature: I.K.U. (Director’s Cut) and UKI"
    showtimes_path.write_text(
        json.dumps(
            {
                "films": [
                    {
                        "showtime_film_key": "shu-lea-cheang-double-feature",
                        "runtime_min": 177,
                    }
                ],
                "showtimes": [
                    {
                        "source": "grand_illusion",
                        "source_film_id": "shu-lea-cheang-double-feature",
                        "showtime_film_key": "shu-lea-cheang-double-feature",
                        "source_title": title,
                        "film_title": title,
                        "screening_variant_type": "none",
                        "is_special_screening": False,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    inventory = inventory_source_identities(
        showtimes_path=showtimes_path,
        products_path=tmp_path / "missing-products.json",
        root=tmp_path,
    )
    identity = inventory["identities"][0]
    assert identity["eligibility"] == NON_FILM
    assert identity["entity_kind"] == "double_feature"
    assert identity["component_titles"] == ["I.K.U.", "UKI"]

    class NeverSearchClient:
        def search_movie(self, *args, **kwargs):
            raise AssertionError("non-film program must not be sent to TMDB")

    matched = match_source_identity(
        identity,
        client=NeverSearchClient(),
        decisions_doc=empty_decisions_document(
            updated_at="2026-09-29T00:00:00+00:00"
        ),
    )
    assert matched["match_status"] == "non_film"
    assert matched["component_titles"] == ["I.K.U.", "UKI"]
    assert matched["candidates"] == []
