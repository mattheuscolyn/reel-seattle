"""Evidence plumbing + search fallbacks for film-identity matching."""

from __future__ import annotations

import json
from pathlib import Path

from reel_seattle.film_identity.inventory import inventory_source_identities
from reel_seattle.film_identity.matcher import (
    beacon_an_to_and_search_title,
    colon_subtitle_search_fallback,
    plan_tmdb_search_queries,
)
from reel_seattle.film_identity.source_evidence import load_source_evidence_index
from reel_seattle.validate import PROJECT_ROOT


def test_beacon_an_to_and_only_for_all_caps_multi_token():
    assert (
        beacon_an_to_and_search_title("DREAD BEAT AN BLOOD", "Dread Beat An Blood")
        == "Dread Beat AND Blood"
    )
    assert beacon_an_to_and_search_title("Dread Beat An Blood", "Dread Beat An Blood") is None
    assert beacon_an_to_and_search_title("AN", "An") is None
    assert beacon_an_to_and_search_title("BANANA BREAD", "Banana Bread") is None


def test_colon_subtitle_head_fallback():
    assert (
        colon_subtitle_search_fallback("NO LIMBS, NO LIMITS: The NickV Story")
        == "NO LIMBS, NO LIMITS"
    )
    assert colon_subtitle_search_fallback("NickV: Story") is None
    assert colon_subtitle_search_fallback("No Colon Title") is None


def test_plan_includes_empty_only_fallbacks():
    queries = plan_tmdb_search_queries(
        search_title="DREAD BEAT AN BLOOD",
        search_year=1979,
        extra_fallbacks=[
            {"title": "DREAD BEAT AND BLOOD", "year": None, "reason": "beacon_an_to_and"}
        ],
    )
    reasons = [q["reason"] for q in queries]
    assert "normalized_title_year" in reasons
    assert "beacon_an_to_and" in reasons


def test_source_evidence_index_loads_beacon_and_nwff():
    index = load_source_evidence_index(root=PROJECT_ROOT)
    beacon = index.get("beacon") or {}
    assert "l-immortelle" in beacon
    imm = beacon["l-immortelle"]
    assert imm.release_year == 1963
    assert imm.directors_raw
    assert imm.provenance.get("release_year")

    nwff = index.get("nwff") or {}
    dad = nwff["local-sightings-2026-dad-genes"]
    assert dad.release_year == 2025
    assert dad.directors_raw == "Craig Downing"
    assert dad.runtime_min == 62


def test_inventory_surfaces_sibling_base_title_for_forgotten_island_event():
    inv = inventory_source_identities(root=PROJECT_ROOT)
    row = next(
        r
        for r in inv["identities"]
        if r.get("source_film_id") == "84857"
        or (r.get("source_title") or "").startswith("Forgotten Island - Friendship")
    )
    assert row["identity_title_candidate"] == "Forgotten Island"
    assert row["evidence_provenance"].get("identity_title_candidate") == (
        "sibling_base_title_prefix"
    )


def test_nwff_mapping_copies_directors_raw():
    from reel_seattle.ingestion.nwff_mapping import NWFF_THEATER_ID, map_nwff_contract_to_indie
    from tests.ingestion.nwff_mapping_fixtures import base_result, program, showtime

    result = base_result()
    result["programs"] = [
        program(
            slug="neptune",
            title="Neptune Frost",
            runtime_min=105,
            release_year=2021,
            extra_raw={"directors": ["Saul Williams, Anisia Uzeyman"]},
        )
    ]
    result["showtimes"] = [
        showtime(slug="neptune", title="WTF with STUFF - Neptune Frost", title_differs=True)
    ]
    mapped = map_nwff_contract_to_indie(
        result, theater_ids={NWFF_THEATER_ID, "the-beacon", "siff-cinema-uptown"}
    )
    assert mapped.records
    assert mapped.records[0].attributes.get("directors_raw") == "Saul Williams, Anisia Uzeyman"
    assert mapped.records[0].attributes.get("release_year") == 2021