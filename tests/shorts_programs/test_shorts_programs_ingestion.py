"""NWFF shorts programs ingestion: explicit structure, conservative Short identity."""

from __future__ import annotations

import json
from pathlib import Path

from reel_seattle.shorts_programs.adapters.nwff import (
    discover_nwff_shorts_programs,
    has_films_in_this_program_section,
    parse_nwff_shorts_program_page,
)
from reel_seattle.shorts_programs.artifact import build_artifact, merge_observations
from reel_seattle.shorts_programs.identity import can_merge_occurrences, consolidate_short_identities
from reel_seattle.shorts_programs.ids import listing_key, shorts_program_id
from reel_seattle.shorts_programs.join import (
    enrich_programs_with_showtimes,
    index_showtimes_by_listing_key,
    stamp_shorts_program_classifications,
)
from reel_seattle.shorts_programs.model import ChildOccurrence, ShortRecord
from reel_seattle.shorts_programs.parse_metadata import parse_child_block
from reel_seattle.shorts_programs.pipeline import build_shorts_programs_current
from reel_seattle.validate import PROJECT_ROOT, validate_against_schema
from tests.fixtures.shorts_programs.html import LIKE_A_LOCAL, NORMAL_FEATURE, fixture_fetch

OBSERVED = "2026-09-12T12:00:00-07:00"


def test_like_a_local_becomes_one_shorts_program_with_ordered_children():
    program, children, warnings = parse_nwff_shorts_program_page(
        LIKE_A_LOCAL,
        film_url="https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        observed_at=OBSERVED,
    )
    assert warnings == []
    assert program is not None
    assert program.shorts_program_id == "nwff:program:local-sightings-2026-like-a-local"
    assert program.source_listing_key == "nwff|id|local-sightings-2026-like-a-local"
    assert program.runtime_min == 68
    assert [child.raw_title for child in children] == [
        "Aurora Ave: Sunrise to Sunset",
        "Dick's-A-Thon",
        "Roll Modelz",
        "Broken Meta Short",
    ]
    assert children[0].position == 1
    assert children[1].parsed_year == 2025
    assert children[1].parsed_directors == ("Dylan Young",)
    assert children[1].parsed_runtime_min == 18


def test_metadata_peels_director_without_location_and_region_abbr():
    no_location = parse_child_block(
        title="Walk and Talk",
        text_editor="(Inanna Cusi, 2025, 6min, in English)",
    )
    assert no_location.directors == ("Inanna Cusi",)
    assert no_location.year == 2025
    assert no_location.runtime_min == 6
    assert no_location.location_text is None
    assert no_location.language == "English"

    region = parse_child_block(
        title="Diamond Belly",
        text_editor="(Kyle D'Odorico, Vancouver, BC, 2025, 10min, in English)",
    )
    assert region.directors == ("Kyle D'Odorico",)
    assert region.location_text == "Vancouver, BC"
    assert region.year == 2025
    assert region.runtime_min == 10

    no_dialogue = parse_child_block(
        title="Augenblick",
        text_editor="(Juliet McMains, Seattle, 2025, 10min, no dialogue)",
    )
    assert no_dialogue.directors == ("Juliet McMains",)
    assert no_dialogue.location_text == "Seattle"
    assert no_dialogue.language == "no dialogue"
    assert no_dialogue.year == 2025
    assert no_dialogue.runtime_min == 10

    complex_lang = parse_child_block(
        title="UNBRAID",
        text_editor=(
            "(xana lenore, Portland/Cagayan Valley/Santa Cruz, 2026, 25min, "
            "in English, Filipino (Tagalog), and Ibanag with English Subtitles)"
        ),
    )
    assert complex_lang.directors == ("xana lenore",)
    assert complex_lang.location_text == "Portland/Cagayan Valley/Santa Cruz"
    assert complex_lang.year == 2026
    assert complex_lang.runtime_min == 25
    assert "Filipino" in (complex_lang.language or "")

    parsed = parse_child_block(
        title="Broken Meta Short",
        text_editor="No parentheses metadata here, just a freeform description that should survive.",
    )
    assert parsed.title == "Broken Meta Short"
    assert parsed.directors == ()
    assert parsed.year is None
    assert parsed.runtime_min is None
    assert "freeform description" in (parsed.description or "")

    result = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        ],
    )
    broken = next(m for m in result.memberships if m.raw_title == "Broken Meta Short")
    assert broken.raw_description
    assert broken.parsed_year is None
    assert broken.short_id


def test_program_showtimes_join_and_shorts_do_not_get_screenings():
    result = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        ],
    )
    showtimes = [
        {
            "id": "st1",
            "source": "nwff",
            "source_film_id": "local-sightings-2026-like-a-local",
            "showtime_film_key": "local-sightings-2026-like-a-local-shorts-2026",
            "film_title": "Like a Local",
            "date": "2026-09-19",
            "time": "19:30",
        },
        {
            "id": "st2",
            "source": "nwff",
            "source_film_id": "some-other-film",
            "showtime_film_key": "some-other-film",
            "film_title": "Other",
            "date": "2026-09-19",
            "time": "21:00",
        },
    ]
    enriched = enrich_programs_with_showtimes(
        result.programs,
        showtimes_by_key=index_showtimes_by_listing_key(showtimes),
    )
    assert enriched[0].showtime_film_key == "local-sightings-2026-like-a-local-shorts-2026"
    # Artifact never emits screenings for Shorts.
    artifact = build_artifact(
        programs=enriched,
        shorts=result.shorts,
        memberships=result.memberships,
        generated_at=OBSERVED,
        source_stats={"nwff": result.stats},
    )
    assert "showtimes" not in artifact
    for short in artifact["shorts"]:
        assert "showtimes" not in short
        assert "showtimeFilmKey" not in short


def test_same_short_can_join_multiple_programs_with_strong_evidence():
    result = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
            "https://nwfilmforum.org/films/local-sightings-2026-ways-of-seeing/",
        ],
    )
    dicks_memberships = [
        m for m in result.memberships if "dick" in m.raw_title.casefold()
    ]
    assert len(dicks_memberships) == 2
    assert len({m.shorts_program_id for m in dicks_memberships}) == 2
    assert len({m.short_id for m in dicks_memberships}) == 1
    short_id = dicks_memberships[0].short_id
    assert short_id == "nwff:short:dick-s-a-thon:2025"


def test_same_title_not_merged_when_metadata_differs():
    left = ChildOccurrence(
        position=1,
        raw_title="Dick's-A-Thon",
        raw_metadata_block="(Dylan Young, Seattle, 2025, 18 min, in English)",
        raw_description="",
        parsed_title="Dick's-A-Thon",
        parsed_directors=("Dylan Young",),
        parsed_year=2025,
        parsed_runtime_min=18,
    )
    right = ChildOccurrence(
        position=1,
        raw_title="Dick's-A-Thon",
        raw_metadata_block="(Other Person, Portland, 2019, 7 min, in English)",
        raw_description="",
        parsed_title="Dick's-A-Thon",
        parsed_directors=("Other Person",),
        parsed_year=2019,
        parsed_runtime_min=7,
    )
    assert can_merge_occurrences(left, right) is False

    result = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
            "https://nwfilmforum.org/films/local-sightings-2026-origin-story/",
        ],
    )
    dicks_ids = {
        m.short_id
        for m in result.memberships
        if m.raw_title == "Dick's-A-Thon"
    }
    assert len(dicks_ids) == 2


def test_title_only_match_is_not_enough_to_merge():
    left = ShortRecord(
        short_id="nwff:short:prog-a:echo",
        source="nwff",
        title="Echo",
    )
    right = ShortRecord(
        short_id="nwff:short:prog-b:echo",
        source="nwff",
        title="Echo",
    )
    assert can_merge_occurrences(left, right) is False
    shorts, memberships = consolidate_short_identities(
        shorts=[left, right],
        memberships=[],
        observed_at=OBSERVED,
    )
    assert {short.short_id for short in shorts} == {
        "nwff:short:prog-a:echo",
        "nwff:short:prog-b:echo",
    }
    assert memberships == []


def test_unresolved_short_without_tmdb_remains_valid():
    result = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        ],
    )
    assert result.shorts
    assert all(short.canonical_film_id is None for short in result.shorts)
    schema_path = PROJECT_ROOT / "schema/shorts_programs_current/v1.0.0.json"
    artifact = build_artifact(
        programs=result.programs,
        shorts=result.shorts,
        memberships=result.memberships,
        generated_at=OBSERVED,
        source_stats={"nwff": result.stats},
    )
    validate_against_schema(artifact, schema_path, label="shorts_programs_current")


def test_normal_feature_page_is_not_a_shorts_program():
    assert has_films_in_this_program_section(NORMAL_FEATURE) is False
    program, children, warnings = parse_nwff_shorts_program_page(
        NORMAL_FEATURE,
        film_url="https://nwfilmforum.org/films/local-sightings-2026-sugarfly/",
        observed_at=OBSERVED,
    )
    assert program is None
    assert children == []
    assert warnings == []

    result = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-sugarfly/",
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        ],
    )
    ids = {program.source_film_id for program in result.programs}
    assert "local-sightings-2026-like-a-local" in ids
    assert "local-sightings-2026-sugarfly" not in ids


def test_classification_stamp_sets_shorts_program_on_schedule_film_only():
    result = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        ],
    )
    showtimes_doc = {
        "films": [
            {
                "showtime_film_key": "local-sightings-2026-like-a-local-shorts-2026",
                "source_film_id": "local-sightings-2026-like-a-local",
                "title": "Like a Local",
                "content_classification": None,
            },
            {
                "showtime_film_key": "sugarfly-2026",
                "source_film_id": "local-sightings-2026-sugarfly",
                "title": "Sugarfly",
                "content_classification": None,
            },
        ],
        "showtimes": [
            {
                "source": "nwff",
                "source_film_id": "local-sightings-2026-like-a-local",
                "showtime_film_key": "local-sightings-2026-like-a-local-shorts-2026",
            }
        ],
    }
    stamped = stamp_shorts_program_classifications(showtimes_doc, result.programs)
    by_key = {
        film["showtime_film_key"]: film["content_classification"]
        for film in stamped["films"]
    }
    assert by_key["local-sightings-2026-like-a-local-shorts-2026"] == "shorts_program"
    assert by_key["sugarfly-2026"] is None


def test_trusted_complete_scrape_drops_missing_child_membership():
    first = discover_nwff_shorts_programs(
        fetch_text=fixture_fetch,
        observed_at=OBSERVED,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        ],
    )
    previous = build_artifact(
        programs=first.programs,
        shorts=first.shorts,
        memberships=first.memberships,
        generated_at=OBSERVED,
        source_stats={"nwff": first.stats},
    )

    def fetch_without_broken(url: str) -> str | None:
        html = fixture_fetch(url)
        if not html:
            return None
        return html.replace("Broken Meta Short", "Removed Short Name").replace(
            "No parentheses metadata here, just a freeform description that should survive.",
            "(Ada Director, Seattle, 2026, 5 min, in English)\nReplacement child.",
        )

    # Simulate a complete rescrape of the same program URL with a different child set by
    # rebuilding discovery from a reduced membership list.
    reduced_memberships = [
        m for m in first.memberships if m.raw_title != "Broken Meta Short"
    ]
    reduced_short_ids = {m.short_id for m in reduced_memberships}
    reduced_shorts = [s for s in first.shorts if s.short_id in reduced_short_ids]
    programs, shorts, memberships = merge_observations(
        previous=previous,
        discovered_programs=first.programs,
        discovered_shorts=reduced_shorts,
        discovered_memberships=reduced_memberships,
        scraped_program_ids={first.programs[0].shorts_program_id},
        source_ok=True,
        observed_at="2026-09-13T12:00:00-07:00",
    )
    assert all(m.raw_title != "Broken Meta Short" for m in memberships)
    assert all(s.title != "Broken Meta Short" for s in shorts)
    assert programs[0].member_count == len(memberships)


def test_pipeline_offline_preserves_schema_shape(tmp_path: Path):
    artifact = build_shorts_programs_current(
        fetch_text=fixture_fetch,
        film_page_urls=[
            "https://nwfilmforum.org/films/local-sightings-2026-like-a-local/",
        ],
        showtimes_doc={
            "films": [
                {
                    "showtime_film_key": "local-sightings-2026-like-a-local-shorts-2026",
                    "source_film_id": "local-sightings-2026-like-a-local",
                    "title": "Like a Local",
                    "content_classification": None,
                    "parent_film_key": "local-sightings-2026-like-a-local-shorts-2026",
                    "parent_display_title": "Like a Local",
                    "screening_variant_type": "none",
                    "is_special_screening": False,
                    "film_id": None,
                }
            ],
            "showtimes": [
                {
                    "source": "nwff",
                    "source_film_id": "local-sightings-2026-like-a-local",
                    "showtime_film_key": "local-sightings-2026-like-a-local-shorts-2026",
                }
            ],
        },
        observed_at=OBSERVED,
        stamp_showtimes=False,
        output_path=tmp_path / "shorts_programs_current.json",
        validate=True,
    )
    assert artifact["schema_version"] == "1.0.0"
    assert artifact["stats"]["shorts_program_count"] == 1
    assert artifact["shortsPrograms"][0]["sourceListingKey"] == listing_key(
        source="nwff", source_film_id="local-sightings-2026-like-a-local"
    )
    assert (
        artifact["shortsPrograms"][0]["shortsProgramId"]
        == shorts_program_id(
            source="nwff", source_film_id="local-sightings-2026-like-a-local"
        )
    )
