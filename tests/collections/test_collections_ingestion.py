"""Collection ingestion: source-evidence membership and safe title candidates."""

from __future__ import annotations

import json
from pathlib import Path

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.collections.adapters.beacon import discover_beacon_collections
from reel_seattle.collections.adapters.nwff import discover_nwff_collections
from reel_seattle.collections.adapters.siff import discover_siff_collections
from reel_seattle.collections.artifact import build_artifact, merge_observations
from reel_seattle.collections.identity_title import identity_title_candidate
from reel_seattle.collections.ids import collection_id
from reel_seattle.collections.join import attach_collection_ids_to_showtimes, enrich_memberships
from reel_seattle.collections.model import (
    EVIDENCE_COLLECTION_PAGE_LINK,
    EVIDENCE_FESTIVAL_CATALOGUE_PAGE_LINK,
    EVIDENCE_FILM_PAGE_SERIES_LINK,
    CollectionRecord,
    MembershipRecord,
)
from reel_seattle.collections.pipeline import build_collections_current
from reel_seattle.film_identity.presentation import extract_match_title
from tests.fixtures.collections.html import fixture_fetch, fixture_fetch_resolved

OBSERVED = "2026-09-11T11:00:00-07:00"


def _siff() -> object:
    return discover_siff_collections(fetch_text=fixture_fetch, observed_at=OBSERVED)


def _beacon() -> object:
    return discover_beacon_collections(fetch_text=fixture_fetch, observed_at=OBSERVED)


def _nwff() -> object:
    return discover_nwff_collections(
        fetch_text=fixture_fetch,
        fetch_resolved=fixture_fetch_resolved,
        observed_at=OBSERVED,
        film_page_urls=["https://nwfilmforum.org/films/sfcs-10-mariners/"],
    )


def test_siff_explicit_collection_membership_and_title_candidate():
    result = _siff()
    assert result.ok
    collection = next(c for c in result.collections if c.source_collection_id == "nouvelles-femmes")
    assert collection.collection_id == "siff:nouvelles-femmes"
    assert collection.source_collection_type == "series"
    breathless = next(
        m for m in result.memberships if m.source_film_url.endswith("/breathless")
    )
    assert EVIDENCE_COLLECTION_PAGE_LINK in breathless.membership_evidence
    assert breathless.raw_title == "Nouvelles Femmes: Breathless"
    enriched = enrich_memberships([breathless], [collection])
    assert enriched[0].raw_title == "Nouvelles Femmes: Breathless"
    assert enriched[0].identity_title_candidate == "Breathless"


def test_siff_format_plus_collection_keeps_35mm():
    result = _siff()
    collection = next(c for c in result.collections if c.collection_id == "siff:nouvelles-femmes")
    jules = next(m for m in result.memberships if m.source_film_url.endswith("/jules-and-jim"))
    assert jules.raw_title == "Nouvelles Femmes: Jules and Jim (35mm)"
    enriched = enrich_memberships([jules], [collection])[0]
    assert enriched.identity_title_candidate == "Jules and Jim"
    extracted = extract_match_title("Jules and Jim (35mm)", source="siff")
    assert extracted.base_title == "Jules and Jim"
    assert any("35mm" in tag.casefold() for tag in extracted.format_tags)
    assert "(35mm)" in enriched.raw_title


def test_no_generic_colon_stripping_without_collection_evidence():
    raw = "2001: A Space Odyssey"
    assert identity_title_candidate(raw, prefixes=(), source="siff") is None
    assert identity_title_candidate(raw, prefixes=["Nouvelles Femmes"], source="siff") is None


def test_beacon_series_membership_from_explicit_link():
    result = _beacon()
    series = next(c for c in result.collections if c.source_collection_type == "series")
    assert series.collection_id == "beacon:series:time-as-a-symptom"
    assert series.title == "Time as a Symptom"
    member = next(m for m in result.memberships if m.collection_id == series.collection_id)
    assert member.source_film_id == "rebels-of-the-neon-god"
    assert member.raw_title == "Rebels of the Neon God"
    assert member.identity_title_candidate is None or member.identity_title_candidate == "Rebels of the Neon God"
    assert EVIDENCE_COLLECTION_PAGE_LINK in member.membership_evidence


def test_beacon_program_maps_to_collection():
    result = _beacon()
    program = next(c for c in result.collections if c.source_collection_type == "program")
    assert program.collection_id == "beacon:program:shadowland-after-hours"
    assert any(m.collection_id == program.collection_id for m in result.memberships)


def test_nwff_series_page_and_film_page_corroboration():
    result = _nwff()
    collection = next(c for c in result.collections if c.collection_id == "nwff:sfcs-at-10")
    assert collection.source_collection_type == "series"
    mariners = next(m for m in result.memberships if m.source_film_id == "sfcs-10-mariners")
    assert EVIDENCE_COLLECTION_PAGE_LINK in mariners.membership_evidence
    assert EVIDENCE_FILM_PAGE_SERIES_LINK in mariners.membership_evidence
    enriched = enrich_memberships(result.memberships, [collection])
    first_cow = next(m for m in enriched if m.source_film_id == "sfcs-10-first-cow")
    assert first_cow.identity_title_candidate == "First Cow"
    assert "Disabled List" not in {c.title for c in result.collections}


def test_nwff_festival_page_links_local_sightings_to_program_listings():
    result = _nwff()
    festival = next(
        c
        for c in result.collections
        if c.collection_id == "nwff:local-sightings-film-festival-pacific-nw"
    )
    assert festival.source_collection_type == "festival"
    assert festival.title == "Local Sightings Film Festival 2026"
    assert "nwff:local-sightings-film-festival-2025" not in {
        c.collection_id for c in result.collections
    }
    assert "nwff:bydesign-festival-2023-hybrid" not in {
        c.collection_id for c in result.collections
    }
    member_ids = {
        m.source_film_id
        for m in result.memberships
        if m.collection_id == festival.collection_id
    }
    assert "local-sightings-2026-like-a-local" in member_ids
    assert "local-sightings-2026-ways-of-seeing" in member_ids
    assert "local-sightings-2026-sugarfly" in member_ids
    like_a_local = next(
        m
        for m in result.memberships
        if m.source_film_id == "local-sightings-2026-like-a-local"
    )
    assert EVIDENCE_FESTIVAL_CATALOGUE_PAGE_LINK in like_a_local.membership_evidence
    # No title-prefix inference: membership comes from catalogue /films/ links.
    assert like_a_local.source_film_url.endswith("/local-sightings-2026-like-a-local/")
    # Empty festival landing pages are omitted.
    assert "nwff:free-forum-2026" not in {c.collection_id for c in result.collections}



def test_canonical_film_can_belong_to_multiple_collections():
    memberships = [
        MembershipRecord(
            collection_id="siff:nouvelles-femmes",
            source="siff",
            source_film_url="https://www.siff.net/programs-and-events/nouvelles-femmes/breathless",
            raw_title="Nouvelles Femmes: Breathless",
            source_film_id="programs-and-events/nouvelles-femmes/breathless",
            canonical_film_id="tmdb:62",
        ),
        MembershipRecord(
            collection_id="beacon:series:time-as-a-symptom",
            source="beacon",
            source_film_url="https://thebeacon.film/calendar/movie/breathless",
            raw_title="Breathless",
            source_film_id="breathless",
            canonical_film_id="tmdb:62",
        ),
    ]
    assert {m.collection_id for m in memberships if m.canonical_film_id == "tmdb:62"} == {
        "siff:nouvelles-femmes",
        "beacon:series:time-as-a-symptom",
    }


def test_collection_ids_attach_only_to_matching_source_listing():
    memberships = [
        MembershipRecord(
            collection_id="siff:nouvelles-femmes",
            source="siff",
            source_film_url="https://www.siff.net/programs-and-events/nouvelles-femmes/breathless",
            raw_title="Nouvelles Femmes: Breathless",
            source_film_id="programs-and-events/nouvelles-femmes/breathless",
            source_listing_key="siff|id|programs-and-events/nouvelles-femmes/breathless",
        )
    ]
    showtimes = [
        {
            "source": "siff",
            "source_film_id": "programs-and-events/nouvelles-femmes/breathless",
            "film_id": "tmdb:62",
            "attributes": {},
        },
        {
            "source": "siff",
            "source_film_id": "cinema/in-theaters/breathless",
            "film_id": "tmdb:62",
            "attributes": {},
        },
    ]
    stamped = attach_collection_ids_to_showtimes(showtimes, memberships)
    assert stamped[0]["attributes"]["collection_ids"] == ["siff:nouvelles-femmes"]
    assert "collection_ids" not in stamped[1]["attributes"]


def test_unmatched_member_is_still_represented():
    collection = CollectionRecord(
        collection_id="siff:nouvelles-femmes",
        source="siff",
        source_collection_type="series",
        source_collection_id="nouvelles-femmes",
        title="Nouvelles Femmes",
        source_url="https://www.siff.net/programs-and-events/nouvelles-femmes",
    )
    member = MembershipRecord(
        collection_id=collection.collection_id,
        source="siff",
        source_film_url="https://www.siff.net/programs-and-events/nouvelles-femmes/unknown-film",
        raw_title="Nouvelles Femmes: Unknown Film",
        source_film_id="programs-and-events/nouvelles-femmes/unknown-film",
    )
    artifact = build_artifact(
        collections=[collection],
        memberships=enrich_memberships([member], [collection]),
        generated_at=OBSERVED,
    )
    row = artifact["memberships"][0]
    assert row["canonicalFilmId"] is None
    assert row["identityTitleCandidate"] == "Unknown Film"
    assert artifact["stats"]["unresolved_membership_count"] == 1


def test_partial_source_failure_preserves_prior_artifact():
    previous = build_artifact(
        collections=[
            CollectionRecord(
                collection_id="siff:nouvelles-femmes",
                source="siff",
                source_collection_type="series",
                source_collection_id="nouvelles-femmes",
                title="Nouvelles Femmes",
                source_url="https://www.siff.net/programs-and-events/nouvelles-femmes",
                first_observed_at="2026-09-01T00:00:00-07:00",
            )
        ],
        memberships=[
            MembershipRecord(
                collection_id="siff:nouvelles-femmes",
                source="siff",
                source_film_url="https://www.siff.net/programs-and-events/nouvelles-femmes/breathless",
                raw_title="Nouvelles Femmes: Breathless",
            )
        ],
        generated_at="2026-09-01T00:00:00-07:00",
    )
    collections, memberships = merge_observations(
        previous=previous,
        discovered_collections=[],
        discovered_memberships=[],
        source_ok={"siff": False, "beacon": True, "nwff": True},
        observed_at=OBSERVED,
    )
    assert any(c.collection_id == "siff:nouvelles-femmes" for c in collections)
    assert memberships
    empty = merge_observations(
        previous=previous,
        discovered_collections=[],
        discovered_memberships=[],
        source_ok={"siff": True, "beacon": True, "nwff": True},
        observed_at=OBSERVED,
    )
    assert empty[0] == []


def test_artifact_is_deterministic(tmp_path: Path):
    listings = {
        "siff": [
            RawShowtime(
                theater_name_raw="SIFF Cinema Uptown",
                date_raw="09/16/2026",
                time_raw="7:00 PM",
                title_raw="Nouvelles Femmes: Breathless",
                source_film_url="https://www.siff.net/programs-and-events/nouvelles-femmes/breathless",
                attributes={"source_film_id": "programs-and-events/nouvelles-femmes/breathless"},
            )
        ],
        "beacon": [],
        "nwff": [
            RawShowtime(
                theater_name_raw="Northwest Film Forum",
                date_raw="09/16/2026",
                time_raw="7:00 PM",
                title_raw="SFCS at 10: The History of The Seattle Mariners",
                source_film_url="https://nwfilmforum.org/films/sfcs-10-mariners/",
                attributes={"source_film_id": "sfcs-10-mariners"},
            )
        ],
    }
    first = build_collections_current(
        fetch_text=fixture_fetch,
        listings=listings,
        showtimes_doc={"showtimes": []},
        previous={},
        catalog_canonical={},
        observed_at=OBSERVED,
        generated_at=OBSERVED,
        output_path=tmp_path / "a.json",
        validate=True,
        stamp_showtimes=False,
    )
    second = build_collections_current(
        fetch_text=fixture_fetch,
        listings=listings,
        showtimes_doc={"showtimes": []},
        previous={},
        catalog_canonical={},
        observed_at=OBSERVED,
        generated_at=OBSERVED,
        output_path=tmp_path / "b.json",
        validate=True,
        stamp_showtimes=False,
    )
    assert first == second
    assert (tmp_path / "a.json").read_text(encoding="utf-8") == (
        tmp_path / "b.json"
    ).read_text(encoding="utf-8")


def test_collection_ids_are_provider_namespaced():
    assert collection_id(
        source="siff", source_collection_type="series", source_collection_id="nouvelles-femmes"
    ) == "siff:nouvelles-femmes"
    assert collection_id(
        source="beacon", source_collection_type="series", source_collection_id="time-as-a-symptom"
    ) == "beacon:series:time-as-a-symptom"


def test_p0a_p0b_p0c_surfaces_still_importable():
    from reel_seattle.film_identity.ids import fallback_film_id
    from reel_seattle.film_identity.presentation import extract_match_title
    from reel_seattle.history import DEFAULT_OBSERVATIONS_PATH

    assert fallback_film_id(
        source="siff",
        source_film_id="cinema/in-theaters/breathless",
        showtime_film_key=None,
    )
    extracted = extract_match_title("Jules and Jim (35mm)", source="siff")
    assert extracted.base_title == "Jules and Jim"
    assert DEFAULT_OBSERVATIONS_PATH.endswith("screening_observations.jsonl.gz")
