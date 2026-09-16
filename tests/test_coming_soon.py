"""Offline tests for the production Coming Soon emitter."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from reel_seattle.emit.coming_soon import (
    _preferred_title,
    CLASSIFICATION_AMC_ANNOUNCED,
    CLASSIFICATION_CONFIRMED_LOCAL,
    CLASSIFICATION_CURRENTLY_AVAILABLE,
    CLASSIFICATION_TMDB_ONLY,
    DEFAULT_WINDOW_DAYS,
    LOCAL_SOURCE_SHOWTIMES,
    RELEASE_SOURCE_AMC,
    RELEASE_SOURCE_LOCAL,
    RELEASE_SOURCE_TMDB,
    ComingSoonCandidate,
    build_coming_soon_bundle,
    build_coming_soon_current,
    candidates_from_amc_catalog,
    candidates_from_reel_seattle,
    candidates_from_tmdb,
    coming_soon_join_key,
    collapse_amc_event_variants,
    extract_reel_seattle_future_screenings,
    fold_diacritics,
    merge_candidates,
    publish_coming_soon_current,
    strip_event_suffix,
)
from reel_seattle.validate import (
    SchemaValidationError,
    validate_coming_soon_candidates,
    validate_coming_soon_current,
)

TODAY = date(2026, 9, 15)
GENERATED_AT = datetime(2026, 9, 15, 23, 30, 0)
WINDOW_END = TODAY + timedelta(days=DEFAULT_WINDOW_DAYS)
CURRENT_CUTOFF = TODAY + timedelta(days=7)


def _showtime(**overrides):
    base = {
        "showtime_film_key": "example-film",
        "parent_film_key": "example-film",
        "film_title": "Example Film",
        "film_id": None,
        "source": "amc",
        "source_film_id": "9001",
        "theater_id": "amc-pacific-place-11",
        "date": "2026-09-20",
    }
    base.update(overrides)
    return base


def _showtimes_current(*showtimes, window_end: str = "2026-09-29"):
    return {
        "generated_at": "2026-09-15T23:00:00-07:00",
        "window": {"start_date": "2026-09-15", "end_date": window_end},
        "films": [],
        "showtimes": list(showtimes),
    }


def _catalog_movie(**overrides):
    base = {
        "source": "amc",
        "source_film_id": "8001",
        "source_release_id": "1000",
        "source_title": "Announced Film",
        "sortable_title": "Announced Film",
        "runtime_min": 120,
        "release_date_utc": "2026-11-20T00:00:00Z",
        "earliest_showing_utc": None,
        "online_ticket_availability_date_utc": None,
        "has_scheduled_showtimes": False,
        "genre": "Drama",
        "mpaa_rating": "PG-13",
        "starring_actors_raw": None,
        "directors_raw": None,
        "synopsis": None,
        "distributor_id": None,
        "distributor_code": None,
        "preferred_media_type": None,
        "available_for_a_list": None,
        "slug": "announced-film",
        "website_url": None,
        "showtimes_url": None,
        "attribute_codes": [],
        "media": {
            "poster_url": "https://example.test/poster.jpg",
            "hero_desktop_url": None,
            "hero_mobile_url": None,
            "trailer_hd_url": None,
            "trailer_mp4_url": None,
        },
        "presentation": {
            "category": "standard",
            "is_special_presentation": False,
            "classifier_version": "1.0.0",
        },
    }
    base.update(overrides)
    return base


def _amc_catalog(*movies):
    return {
        "schema_version": "1.0.0",
        "generated_at": "2026-09-15T23:00:00-07:00",
        "source": "amc",
        "fetch": {"status": "success"},
        "stats": {"movies": len(movies)},
        "movies": list(movies),
    }


def _tmdb_candidate(**overrides):
    base = {
        "source": "tmdb",
        "tmdb_id": 700001,
        "title": "Indie Discovery",
        "original_title": "Indie Discovery",
        "original_language": "en",
        "release_date": "2026-10-30",
        "popularity": 2.5,
        "vote_count": 0,
        "poster_path": None,
        "has_poster": False,
        "has_overview": True,
        "quality_flags": ["missing_poster", "no_votes_and_low_popularity"],
    }
    base.update(overrides)
    return base


def _tmdb_artifact(*candidates):
    return {
        "schema_version": "1.0.0",
        "generated_at": "2026-09-15T23:00:00-07:00",
        "source": "tmdb",
        "fetch": {"status": "success"},
        "stats": {"candidates": len(candidates)},
        "candidates": list(candidates),
    }


def _build(**overrides):
    kwargs = {
        "today_date": TODAY,
        "generated_at": GENERATED_AT,
        "identity_catalog": {"films": []},
        "enrichment_index": {},
        "amc_product_index": {},
    }
    kwargs.update(overrides)
    return build_coming_soon_current(**kwargs)


def _bundle(**overrides):
    kwargs = {
        "today_date": TODAY,
        "generated_at": GENERATED_AT,
        "identity_catalog": {"films": []},
        "enrichment_index": {},
        "amc_product_index": {},
    }
    kwargs.update(overrides)
    return build_coming_soon_bundle(**kwargs)


def _entry_by_title(artifact, title):
    for entry in artifact["entries"]:
        if entry["title"] == title:
            return entry
    return None


# ---------------------------------------------------------------------------
# Regression: previously broken helpers
# ---------------------------------------------------------------------------


def test_extract_reel_seattle_future_screenings_reads_published_date_field():
    """Regression: the published artifact stores the day under ``date``."""
    artifact = _showtimes_current(
        _showtime(date="2026-09-20"),
        _showtime(date="2026-09-22", theater_id="amc-oak-tree-6"),
    )

    result = extract_reel_seattle_future_screenings(
        showtimes_current=artifact, today_date=TODAY
    )

    assert set(result) == {"example-film"}
    info = result["example-film"]
    assert info["earliest_date"] == date(2026, 9, 20)
    assert info["showtime_count"] == 2
    assert info["theaters"] == {"amc-pacific-place-11", "amc-oak-tree-6"}
    assert info["source_film_ids"] == {"9001"}


def test_extract_reel_seattle_future_screenings_accepts_local_date_fallback():
    artifact = _showtimes_current(
        {
            "showtime_film_key": "legacy-film",
            "parent_film_key": "legacy-film",
            "film_title": "Legacy Film",
            "theater_id": "siff-cinema-uptown",
            "local_date": "2026-09-25",
        }
    )

    result = extract_reel_seattle_future_screenings(
        showtimes_current=artifact, today_date=TODAY
    )

    assert result["legacy-film"]["earliest_date"] == date(2026, 9, 25)


def test_extract_reel_seattle_future_screenings_skips_past_and_unkeyed_rows():
    artifact = _showtimes_current(
        _showtime(date="2026-09-01"),
        _showtime(showtime_film_key="", date="2026-09-20"),
        _showtime(date="not-a-date"),
    )

    assert extract_reel_seattle_future_screenings(
        showtimes_current=artifact, today_date=TODAY
    ) == {}


def test_merge_candidates_attaches_local_evidence_without_raising():
    """Regression: merge used undefined names and dropped non-AMC sources."""
    booking = ComingSoonCandidate(
        join_key="example-film",
        title="Example Film",
        amc_theater_booking=True,
    )
    booking.amc_movie_ids.add("9001")
    booking.titles.add("Example Film")
    booking.note_local_screening(date(2026, 10, 5), source=LOCAL_SOURCE_SHOWTIMES)

    future = extract_reel_seattle_future_screenings(
        showtimes_current=_showtimes_current(_showtime(date="2026-10-01")),
        today_date=TODAY,
    )

    merged = merge_candidates([booking], future, current_window_end=CURRENT_CUTOFF)

    assert len(merged) == 1
    candidate = merged[0]
    assert candidate.amc_theater_booking is True
    assert candidate.reel_seattle_scheduled is True
    assert candidate.first_local_screening_date == date(2026, 10, 1)
    assert candidate.local_theater_ids == {"amc-pacific-place-11"}


def test_merge_candidates_keeps_unmatched_sources():
    """Local-only and TMDB-only candidates must survive the merge."""
    catalog = candidates_from_amc_catalog(_amc_catalog(_catalog_movie()))
    local = candidates_from_reel_seattle(
        extract_reel_seattle_future_screenings(
            showtimes_current=_showtimes_current(
                _showtime(
                    showtime_film_key="local-only",
                    parent_film_key="local-only",
                    film_title="Local Only",
                    source_film_id="siff-1",
                    source="siff",
                    date="2026-10-10",
                )
            ),
            today_date=TODAY,
        ),
        current_window_end=CURRENT_CUTOFF,
    )
    tmdb = candidates_from_tmdb(_tmdb_artifact(_tmdb_candidate()))

    merged = merge_candidates(catalog, local, tmdb, current_window_end=CURRENT_CUTOFF)

    assert sorted(candidate.title for candidate in merged) == [
        "Announced Film",
        "Indie Discovery",
        "Local Only",
    ]


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------


def test_fold_diacritics_and_join_key_alignment():
    assert fold_diacritics("Amélie") == "Amelie"
    assert coming_soon_join_key("Amélie") == coming_soon_join_key("Amelie")
    assert coming_soon_join_key("Beware Boiúna") == coming_soon_join_key("Beware Boiuna")


def test_join_key_collapses_format_variants_but_not_distinct_films():
    assert coming_soon_join_key("Wicked: For Good 3D") == coming_soon_join_key(
        "Wicked: For Good"
    )
    assert coming_soon_join_key("Dune: Part Three") != coming_soon_join_key("Dune")


def test_strip_event_suffix_only_matches_event_phrases():
    assert strip_event_suffix("Forgotten Island - Opening Night Event") == "Forgotten Island"
    assert strip_event_suffix("Wicked - Sing-Along") == "Wicked"
    assert strip_event_suffix("Dune: Part Three") is None
    assert strip_event_suffix("Mission: Impossible") is None


def test_collapse_amc_event_variants_requires_existing_base_film():
    base = ComingSoonCandidate(join_key=coming_soon_join_key("Wicked"), title="Wicked")
    base.titles.add("Wicked")
    variant = ComingSoonCandidate(
        join_key=coming_soon_join_key("Wicked - Q&A"), title="Wicked - Q&A"
    )
    variant.titles.add("Wicked - Q&A")
    orphan = ComingSoonCandidate(
        join_key=coming_soon_join_key("Unrelated - Q&A"), title="Unrelated - Q&A"
    )
    orphan.titles.add("Unrelated - Q&A")

    survivors, collapsed = collapse_amc_event_variants([base, variant, orphan])

    assert collapsed == 1
    assert sorted(candidate.title for candidate in survivors) == [
        "Unrelated - Q&A",
        "Wicked",
    ]


def test_collapse_retains_named_qa_and_same_date_guest_events():
    """Named Q&A products are distinct consumer-facing engagements.

    Delimiter-less titles such as ``Appofeniacs Q&A with Director …`` and
    talent-specific Live Q&A nights must not fold into the base film.
    """
    public = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(
                source_film_id="84071",
                source_title="Your Mother Your Mother Your Mother",
                release_date_utc="2026-09-23T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="85038",
                source_title=(
                    "Your Mother Your Mother Your Mother Live Q&A with Mahershala Ali"
                ),
                release_date_utc="2026-09-25T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="84343",
                source_title="Appofeniacs",
                release_date_utc="2026-10-02T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="85035",
                source_title=(
                    "APPOFENIACS Q&A with Director Chris Marrs Piliero and cast"
                ),
                release_date_utc="2026-10-02T00:00:00Z",
            ),
        )
    )
    titles = sorted(entry["title"] for entry in public["entries"])
    assert titles == [
        "APPOFENIACS Q&A with Director Chris Marrs Piliero and cast",
        "Appofeniacs",
        "Your Mother Your Mother Your Mother",
        "Your Mother Your Mother Your Mother Live Q&A with Mahershala Ali",
    ]


def test_amc_literal_question_mark_in_title_is_preserved():
    """AMC catalog movie 84887 ships ``d?Afrique``; do not invent an apostrophe."""
    public = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(
                source_film_id="84887",
                source_title="Reve d?Afrique - Les aventuriers voyageurs",
                slug="reve-d-afrique-les-aventuriers-voyageurs-84887",
                release_date_utc="2026-09-16T05:00:00Z",
            )
        )
    )
    assert [entry["title"] for entry in public["entries"]] == [
        "Reve d?Afrique - Les aventuriers voyageurs"
    ]
    title = public["entries"][0]["title"]
    assert "d'Afrique" not in title
    assert "d’Afrique" not in title
    assert "Rêve" not in title


def test_title_join_requires_compatible_release_dates():
    """Same normalized title, releases months apart: keep them separate."""
    old = ComingSoonCandidate(
        join_key="nosferatu",
        title="Nosferatu",
        amc_coming_soon_catalog=True,
        amc_catalog_release_date=date(2026, 9, 25),
    )
    old.titles.add("Nosferatu")
    new = ComingSoonCandidate(
        join_key="nosferatu",
        title="Nosferatu",
        tmdb_us_theatrical=True,
        tmdb_us_release_date=date(2026, 12, 10),
    )
    new.titles.add("Nosferatu")

    merged = merge_candidates([old], [], [new], current_window_end=CURRENT_CUTOFF)

    assert len(merged) == 2


def test_identity_collapse_by_amc_movie_id_across_sources():
    catalog = candidates_from_amc_catalog(
        _amc_catalog(
            _catalog_movie(
                source_film_id="9001",
                source_title="Example Film",
                release_date_utc="2026-10-02T00:00:00Z",
            )
        )
    )
    local = candidates_from_reel_seattle(
        extract_reel_seattle_future_screenings(
            showtimes_current=_showtimes_current(_showtime(date="2026-10-01")),
            today_date=TODAY,
        ),
        current_window_end=CURRENT_CUTOFF,
    )

    merged = merge_candidates(catalog, local, current_window_end=CURRENT_CUTOFF)

    assert len(merged) == 1
    assert merged[0].amc_coming_soon_catalog is True
    assert merged[0].reel_seattle_scheduled is True


def test_preferred_title_is_deterministic_across_case_variants():
    """Variants differing only by case must not drift between runs."""
    variants = {
        "The Further Mis-Adventures Of Cliff Booth",
        "The FURTHER MIS-ADVENTURES OF CLIFF BOOTH",
        "the further mis-adventures of cliff booth",
    }

    picks = set()
    for _ in range(25):
        candidate = ComingSoonCandidate(join_key="k", title="seed")
        # Fresh set each pass: iteration order is what used to leak through.
        candidate.titles = set(variants)
        picks.add(_preferred_title(candidate))

    assert len(picks) == 1
    assert picks.pop() == "the further mis-adventures of cliff booth"


def test_preferred_title_prefers_normal_casing_over_all_caps():
    candidate = ComingSoonCandidate(join_key="k", title="seed")
    candidate.titles = {"Focker-In-Law", "Focker-in-Law"}
    assert _preferred_title(candidate) == "Focker-in-Law"


def test_strip_event_suffix_handles_rentals_but_not_sequel_subtitles():
    assert strip_event_suffix("Forgotten Island: Private Theatre Rental") == "Forgotten Island"
    assert strip_event_suffix("The Cat in the Hat : Private Theater Rental") == "The Cat in the Hat"
    assert strip_event_suffix("Tentpole - Fan First Premiere Event") == "Tentpole"
    assert strip_event_suffix("Classic Film (Special Screening)") == "Classic Film"

    # Sequel subtitles must survive: the event phrase does not start the tail.
    assert strip_event_suffix("Dune: Part Three Insider Screenings in IMAX") is None
    assert strip_event_suffix("Dune: Part Three") is None
    assert strip_event_suffix("Mission: Impossible") is None
    assert strip_event_suffix("Plain Title") is None


def test_inferred_tmdb_identity_is_not_emitted_as_confirmed_film_id():
    """TMDB asserts its own id; accurate, but never review-confirmed."""
    public, analysis = _bundle(tmdb_candidates_artifact=_tmdb_artifact(_tmdb_candidate()))

    assert public["entries"] == []
    entry = _entry_by_title(analysis, "Indie Discovery")
    assert entry["film_id"] is None
    assert entry["tmdb_id"] == 700001
    assert entry["identity"]["method"] == "tmdb_id"
    assert entry["identity"]["film_id_confirmed"] is False
    assert entry["identity"]["tmdb_id_inferred"] is True
    assert analysis["stats"]["entries_with_confirmed_film_id"] == 0
    assert analysis["stats"]["entries_with_tmdb_id"] == 1


def test_confirmed_identity_outranks_self_asserted_on_merge():
    catalog = {
        "films": [
            {
                "film_id": "tmdb:4242",
                "identity_type": "tmdb",
                "match_status": "confirmed_manual",
                "source_identities": [{"source": "amc", "source_film_id": "8001"}],
            }
        ]
    }

    artifact = _build(
        amc_catalog=_amc_catalog(_catalog_movie(release_date_utc="2026-10-30T00:00:00Z")),
        tmdb_candidates_artifact=_tmdb_artifact(
            _tmdb_candidate(tmdb_id=999999, title="Announced Film", release_date="2026-10-30")
        ),
        identity_catalog=catalog,
    )

    assert len(artifact["entries"]) == 1
    entry = artifact["entries"][0]
    assert entry["film_id"] == "tmdb:4242"
    assert entry["identity"]["film_id_confirmed"] is True
    assert entry["identity"]["ambiguous"] is False


def test_film_id_resolution_from_identity_catalog():
    catalog = {
        "films": [
            {
                "film_id": "tmdb:550",
                "identity_type": "tmdb",
                "match_status": "confirmed_automatic",
                "source_identities": [{"source": "amc", "source_film_id": "8001"}],
            }
        ]
    }

    artifact = _build(
        amc_catalog=_amc_catalog(_catalog_movie()),
        identity_catalog=catalog,
    )

    entry = _entry_by_title(artifact, "Announced Film")
    assert entry["film_id"] == "tmdb:550"
    assert entry["tmdb_id"] == 550
    assert entry["identity"]["method"] == "film_id"


# ---------------------------------------------------------------------------
# Classification and window
# ---------------------------------------------------------------------------


def test_amc_catalog_membership_yields_user_visible_announcement():
    artifact = _build(amc_catalog=_amc_catalog(_catalog_movie()))

    entry = _entry_by_title(artifact, "Announced Film")
    assert entry["classification"] == CLASSIFICATION_AMC_ANNOUNCED
    assert entry["user_visible"] is True
    assert entry["evidence"] == {
        "amc_coming_soon_catalog": True,
        "amc_theater_booking": False,
        "tmdb_us_theatrical": False,
        "reel_seattle_scheduled": False,
    }
    assert entry["expected_release_date"] == "2026-11-20"
    assert entry["expected_release_date_source"] == RELEASE_SOURCE_AMC
    assert entry["source_metadata"]["amc"]["has_scheduled_showtimes"] is False


def test_amc_catalog_entry_with_no_performances_is_still_included():
    artifact = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(has_scheduled_showtimes=False, release_date_utc="2026-12-01T00:00:00Z")
        )
    )

    entry = _entry_by_title(artifact, "Announced Film")
    assert entry["user_visible"] is True
    assert entry["local_theater_count"] == 0
    assert entry["local_showtime_count"] == 0


def test_theater_booking_alone_does_not_create_amc_announced():
    """A booking is not catalog membership."""
    booking = ComingSoonCandidate(
        join_key="booked-film", title="Booked Film", amc_theater_booking=True
    )
    booking.titles.add("Booked Film")
    booking.note_local_screening(date(2026, 11, 1), source="amc_theater_booking")

    classification = booking.classify(window_start=TODAY, window_end=WINDOW_END)
    assert classification == CLASSIFICATION_CONFIRMED_LOCAL
    assert booking.amc_coming_soon_catalog is False


def test_confirmed_local_uses_first_local_screening_date():
    artifact = _build(
        showtimes_current=_showtimes_current(_showtime(date="2026-09-26")),
    )

    entry = _entry_by_title(artifact, "Example Film")
    assert entry["classification"] == CLASSIFICATION_CONFIRMED_LOCAL
    assert entry["user_visible"] is True
    assert entry["expected_release_date"] == "2026-09-26"
    assert entry["expected_release_date_source"] == RELEASE_SOURCE_LOCAL
    assert entry["first_local_screening_date"] == "2026-09-26"
    assert entry["local_theater_ids"] == ["amc-pacific-place-11"]


def test_currently_available_film_is_never_emitted():
    artifact = _build(
        showtimes_current=_showtimes_current(
            _showtime(date="2026-09-16"),
            _showtime(date="2026-10-20"),
        ),
    )

    assert artifact["entries"] == []
    assert artifact["stats"]["excluded_counts"]["currently_available"] == 1


def test_currently_available_wins_even_with_amc_catalog_evidence():
    artifact = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(source_film_id="9001", source_title="Example Film")
        ),
        showtimes_current=_showtimes_current(_showtime(date="2026-09-17")),
    )

    assert artifact["entries"] == []
    assert artifact["stats"]["excluded_counts"]["currently_available"] == 1


def test_tmdb_only_candidate_is_retained_in_analysis_not_public():
    public, analysis = _bundle(tmdb_candidates_artifact=_tmdb_artifact(_tmdb_candidate()))

    assert public["entries"] == []
    assert public["stats"]["hidden_count"] == 0
    assert public["stats"]["analysis"]["tmdb_only_count"] == 1

    entry = _entry_by_title(analysis, "Indie Discovery")
    assert entry["classification"] == CLASSIFICATION_TMDB_ONLY
    assert entry["user_visible"] is False
    assert entry["expected_release_date_source"] == RELEASE_SOURCE_TMDB
    assert entry["source_metadata"]["tmdb"]["quality_flags"] == [
        "missing_poster",
        "no_votes_and_low_popularity",
    ]
    assert analysis["stats"]["user_visible_count"] == 0
    assert analysis["stats"]["hidden_count"] == 1
    validate_coming_soon_candidates(analysis)


def test_tmdb_evidence_on_amc_announced_film_stays_visible():
    artifact = _build(
        amc_catalog=_amc_catalog(_catalog_movie(release_date_utc="2026-10-30T00:00:00Z")),
        tmdb_candidates_artifact=_tmdb_artifact(
            _tmdb_candidate(title="Announced Film", release_date="2026-10-30")
        ),
    )

    assert len(artifact["entries"]) == 1
    entry = artifact["entries"][0]
    assert entry["classification"] == CLASSIFICATION_AMC_ANNOUNCED
    assert entry["user_visible"] is True
    assert entry["evidence"]["tmdb_us_theatrical"] is True
    assert entry["evidence"]["amc_coming_soon_catalog"] is True


def test_window_uses_ninety_days_and_excludes_beyond_horizon():
    inside = (TODAY + timedelta(days=89)).isoformat() + "T00:00:00Z"
    outside = (TODAY + timedelta(days=120)).isoformat() + "T00:00:00Z"
    artifact = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(
                source_film_id="8001", source_title="Inside Window", release_date_utc=inside
            ),
            _catalog_movie(
                source_film_id="8002", source_title="Beyond Horizon", release_date_utc=outside
            ),
        )
    )

    assert artifact["window"]["days"] == 90
    assert artifact["window"]["start_date"] == "2026-09-15"
    assert artifact["window"]["end_date"] == "2026-12-14"
    titles = [entry["title"] for entry in artifact["entries"]]
    assert titles == ["Inside Window"]
    assert artifact["stats"]["excluded_counts"][
        "expected_release_date_outside_window"
    ] == 1


def test_catalog_release_date_in_the_past_is_not_announced():
    artifact = _build(
        amc_catalog=_amc_catalog(_catalog_movie(release_date_utc="2026-01-05T00:00:00Z"))
    )

    assert artifact["entries"] == []


def test_horizon_counts_track_user_visible_entries():
    artifact = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(
                source_film_id="8001",
                source_title="Soon Film",
                release_date_utc=(TODAY + timedelta(days=20)).isoformat() + "T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8002",
                source_title="Mid Film",
                release_date_utc=(TODAY + timedelta(days=50)).isoformat() + "T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8003",
                source_title="Late Film",
                release_date_utc=(TODAY + timedelta(days=85)).isoformat() + "T00:00:00Z",
            ),
        )
    )

    assert artifact["stats"]["horizon_counts"] == {
        "30_days": 1,
        "60_days": 2,
        "90_days": 3,
    }


def test_entries_are_sorted_by_expected_date_then_title():
    artifact = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(
                source_film_id="8001",
                source_title="Zebra Film",
                release_date_utc="2026-10-01T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8002",
                source_title="Alpha Film",
                release_date_utc="2026-10-01T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8003",
                source_title="Early Film",
                release_date_utc="2026-09-30T00:00:00Z",
            ),
        )
    )

    assert [entry["title"] for entry in artifact["entries"]] == [
        "Early Film",
        "Alpha Film",
        "Zebra Film",
    ]


def test_source_health_reports_optional_availability():
    artifact = _build(amc_catalog=_amc_catalog(_catalog_movie()))

    sources = artifact["sources"]
    assert sources["amc_coming_soon_catalog"]["available"] is True
    assert sources["amc_coming_soon_catalog"]["fetch_status"] == "success"
    assert sources["tmdb_us_theatrical"]["available"] is False
    assert sources["reel_seattle_showtimes"]["available"] is False


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


def test_generated_artifact_passes_schema_validation():
    artifact = _build(
        amc_catalog=_amc_catalog(_catalog_movie()),
        tmdb_candidates_artifact=_tmdb_artifact(_tmdb_candidate()),
        showtimes_current=_showtimes_current(_showtime(date="2026-10-01")),
    )

    validate_coming_soon_current(artifact)


def test_validation_rejects_entry_outside_window():
    artifact = _build(amc_catalog=_amc_catalog(_catalog_movie()))
    artifact["entries"][0]["expected_release_date"] = "2027-06-01"

    with pytest.raises(ValueError, match="outside the"):
        validate_coming_soon_current(artifact)


def test_validation_rejects_hidden_row_in_public_artifact():
    artifact = _build(amc_catalog=_amc_catalog(_catalog_movie()))
    artifact["entries"][0]["user_visible"] = False

    with pytest.raises((ValueError, SchemaValidationError), match="user_visible|const"):
        validate_coming_soon_current(artifact)


def test_validation_rejects_currently_available_entry():
    artifact = _build(
        showtimes_current=_showtimes_current(_showtime(date="2026-10-01")),
    )
    artifact["entries"][0]["first_local_screening_date"] = "2026-09-16"

    with pytest.raises(ValueError, match="currently available"):
        validate_coming_soon_current(artifact)


def test_validation_rejects_amc_announced_without_catalog_evidence():
    artifact = _build(amc_catalog=_amc_catalog(_catalog_movie()))
    artifact["entries"][0]["evidence"]["amc_coming_soon_catalog"] = False

    with pytest.raises(ValueError, match="without AMC"):
        validate_coming_soon_current(artifact)


def test_validation_rejects_inconsistent_window_bounds():
    artifact = _build(amc_catalog=_amc_catalog(_catalog_movie()))
    artifact["window"]["end_date"] = "2026-11-01"

    with pytest.raises(ValueError, match="window.end_date"):
        validate_coming_soon_current(artifact)


def test_validation_rejects_duplicate_join_keys():
    artifact = _build(
        amc_catalog=_amc_catalog(
            _catalog_movie(source_film_id="8001", source_title="Alpha Film"),
            _catalog_movie(source_film_id="8002", source_title="Beta Film"),
        )
    )
    artifact["entries"][1]["join_key"] = artifact["entries"][0]["join_key"]

    with pytest.raises(ValueError, match="duplicate join_key"):
        validate_coming_soon_current(artifact)


# ---------------------------------------------------------------------------
# Publication / last-known-good
# ---------------------------------------------------------------------------


def _publish_kwargs(tmp_path: Path, **overrides):
    kwargs = {
        "output_path": tmp_path / "coming_soon_current.json",
        "analysis_path": tmp_path / "coming_soon_candidates_current.json",
        "identity_catalog": {"films": []},
        "enrichment_index": {},
        "amc_product_index": {},
        "today_date": TODAY,
        "generated_at": GENERATED_AT,
    }
    kwargs.update(overrides)
    return kwargs


def test_publish_writes_and_revalidates(tmp_path: Path):
    result = publish_coming_soon_current(
        **_publish_kwargs(tmp_path, amc_catalog=_amc_catalog(_catalog_movie()))
    )

    assert result["published"] is True
    written = json.loads(
        (tmp_path / "coming_soon_current.json").read_text(encoding="utf-8")
    )
    analysis = json.loads(
        (tmp_path / "coming_soon_candidates_current.json").read_text(encoding="utf-8")
    )
    assert written["stats"]["entry_count"] == 1
    validate_coming_soon_current(written)
    validate_coming_soon_candidates(analysis)


def test_publish_retains_previous_artifact_when_catalog_unavailable(tmp_path: Path):
    kwargs = _publish_kwargs(tmp_path, amc_catalog=_amc_catalog(_catalog_movie()))
    publish_coming_soon_current(**kwargs)
    before = (tmp_path / "coming_soon_current.json").read_text(encoding="utf-8")
    analysis_before = (tmp_path / "coming_soon_candidates_current.json").read_text(
        encoding="utf-8"
    )

    result = publish_coming_soon_current(**_publish_kwargs(tmp_path, amc_catalog=None))

    assert result["published"] is False
    assert result["skipped_reason"] == "amc_catalog_unavailable_retained_previous"
    assert (tmp_path / "coming_soon_current.json").read_text(encoding="utf-8") == before
    assert (
        tmp_path / "coming_soon_candidates_current.json"
    ).read_text(encoding="utf-8") == analysis_before


def test_publish_skips_rewrite_when_membership_unchanged(tmp_path: Path):
    kwargs = _publish_kwargs(
        tmp_path,
        amc_catalog=_amc_catalog(_catalog_movie()),
    )
    del kwargs["generated_at"]
    publish_coming_soon_current(generated_at=GENERATED_AT, **kwargs)

    result = publish_coming_soon_current(
        generated_at=datetime(2026, 9, 15, 23, 59, 0), **kwargs
    )

    assert result["published"] is False
    assert result["skipped_reason"] == "unchanged_membership"
    written = json.loads(
        (tmp_path / "coming_soon_current.json").read_text(encoding="utf-8")
    )
    assert written["generated_at"].startswith("2026-09-15T23:30:00")


def test_publish_without_previous_artifact_reports_missing_catalog(tmp_path: Path):
    result = publish_coming_soon_current(**_publish_kwargs(tmp_path, amc_catalog=None))

    assert result["published"] is False
    assert result["skipped_reason"] == "amc_catalog_unavailable_no_previous_artifact"


def test_presentation_prefers_confirmed_enrichment_over_inferred_tmdb():
    catalog = {
        "films": [
            {
                "film_id": "tmdb:4242",
                "identity_type": "tmdb",
                "match_status": "confirmed_manual",
                "source_identities": [{"source": "amc", "source_film_id": "8001"}],
            }
        ]
    }
    enrichment = {
        "tmdb:4242": {
            "film_id": "tmdb:4242",
            "poster": {
                "path": "/confirmed.jpg",
                "url": "https://image.tmdb.org/t/p/w500/confirmed.jpg",
            },
            "overview": "Confirmed overview",
            "runtime_minutes": 111,
            "us_certification": "PG-13",
            "release_year": 2026,
        }
    }
    artifact = _build(
        amc_catalog=_amc_catalog(_catalog_movie(release_date_utc="2026-10-30T00:00:00Z")),
        tmdb_candidates_artifact=_tmdb_artifact(
            _tmdb_candidate(
                tmdb_id=999999,
                title="Announced Film",
                release_date="2026-10-30",
                poster_path="/inferred.jpg",
                overview="Inferred overview",
            )
        ),
        identity_catalog=catalog,
        enrichment_index=enrichment,
    )
    entry = artifact["entries"][0]
    assert entry["film_id"] == "tmdb:4242"
    assert entry["identity"]["film_id_confirmed"] is True
    assert entry["identity"]["tmdb_id_inferred"] is False
    assert entry["presentation"]["source"] == "confirmed_enrichment"
    assert entry["presentation"]["poster_url"].endswith("/confirmed.jpg")
    assert entry["presentation"]["overview"] == "Confirmed overview"


def test_presentation_uses_amc_catalog_when_film_id_is_not_confirmed():
    artifact = _build(amc_catalog=_amc_catalog(_catalog_movie()))
    entry = artifact["entries"][0]
    assert entry["film_id"] is None
    assert entry["presentation"]["source"] == "amc_catalog"
    assert entry["presentation"]["poster_url"] == "https://example.test/poster.jpg"
    assert entry["presentation"]["runtime_minutes"] == 120
    assert entry["presentation"]["rating"] == "PG-13"
    assert entry["presentation"]["kind"] == "film"
    assert entry["local_status"] == "not_announced"


def test_presentation_filter_drops_rentals_and_untitled_placeholders():
    public, analysis = _bundle(
        amc_catalog=_amc_catalog(
            _catalog_movie(
                source_film_id="8001",
                source_title="Announced Film",
                release_date_utc="2026-10-30T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8002",
                source_title="Forgotten Island: Private Theatre Rental",
                release_date_utc="2026-10-30T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8003",
                source_title="Untitled Trafalgar Event (11/19/26)",
                release_date_utc="2026-11-19T00:00:00Z",
                presentation={
                    "category": "concert_or_event",
                    "is_special_presentation": True,
                    "classifier_version": "1.0.0",
                },
            ),
            _catalog_movie(
                source_film_id="8004",
                source_title="ENE Repeat",
                release_date_utc="2026-11-19T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8005",
                source_title="Untitled Elon Musk Documentary",
                release_date_utc="2026-10-16T00:00:00Z",
            ),
            _catalog_movie(
                source_film_id="8006",
                source_title="AMC Screen Unseen: October 12",
                release_date_utc="2026-10-12T00:00:00Z",
                presentation={
                    "category": "mystery_screening",
                    "is_special_presentation": True,
                    "classifier_version": "1.0.0",
                },
            ),
            _catalog_movie(
                source_film_id="8007",
                source_title="Princess Mononoke - Studio Ghibli Fest 2026",
                release_date_utc="2026-09-26T00:00:00Z",
            ),
        )
    )

    titles = [entry["title"] for entry in public["entries"]]
    assert "Untitled Trafalgar Event (11/19/26)" not in titles
    assert "ENE Repeat" not in titles
    assert "Untitled Elon Musk Documentary" in titles
    assert "AMC Screen Unseen: October 12" in titles
    assert "Princess Mononoke - Studio Ghibli Fest 2026" in titles
    assert all("rental" not in title.casefold() for title in titles)

    unseen = _entry_by_title(public, "AMC Screen Unseen: October 12")
    assert unseen["presentation"]["kind"] == "mystery_screening"
    ghibli = _entry_by_title(public, "Princess Mononoke - Studio Ghibli Fest 2026")
    assert ghibli["presentation"]["kind"] == "rerelease"

    assert public["stats"]["excluded_counts"]["presentation_filter"] == 3
    reasons = {
        entry["title"]: entry["exclusion_reason"]
        for entry in analysis["entries"]
        if entry["exclusion_reason"]
    }
    assert "private_theatre_rental" in reasons.values()
    assert reasons["Untitled Trafalgar Event (11/19/26)"] == (
        "untitled_distributor_placeholder"
    )
    assert reasons["ENE Repeat"] == "operational_or_test_row"


def test_confirmed_local_exposes_theater_names_and_scheduled_status():
    registry = {
        "theaters": [
            {"id": "amc-pacific-place-11", "name": "AMC Pacific Place 11"},
        ]
    }
    artifact = _build(
        showtimes_current=_showtimes_current(_showtime(date="2026-10-01")),
        registry=registry,
    )
    entry = artifact["entries"][0]
    assert entry["classification"] == CLASSIFICATION_CONFIRMED_LOCAL
    assert entry["local_status"] == "scheduled"
    assert entry["local_theaters"] == [
        {"theater_id": "amc-pacific-place-11", "name": "AMC Pacific Place 11"}
    ]
