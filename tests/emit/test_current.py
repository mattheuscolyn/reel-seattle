"""Tests for showtimes_current.json emission."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.emit.current import (
    CURRENT_SCHEMA_VERSION,
    WINDOW_DAYS,
    build_showtimes_current,
    make_showtime_id,
    write_showtimes_current,
)
from reel_seattle.showtime_horizon import PUBLIC_SHOWTIME_HORIZON_POLICY
from reel_seattle.normalize import format_date_csv, format_date_iso

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)
GENERATED_AT = datetime(2026, 6, 26, 0, 0, 0, tzinfo=PACIFIC)


def _history_row(
    show_date: date,
    *,
    film: str = "Sinners",
    theater: str = "AMC Pacific Place 11",
    time: str = "7:30PM",
    runtime: str = "137",
    poster: str = "https://example.com/sinners.jpg",
    premium_format: str = "",
    canceled: bool = False,
    sold_out: bool = False,
    source: str = "amc",
) -> dict[str, str]:
    return {
        "Date": format_date_csv(show_date),
        "Time": time,
        "Theater": theater,
        "Film": film,
        "Runtime": runtime,
        "isAlmostSoldOut": "true" if sold_out else "None",
        "posterDynamic": poster,
        "isCanceled": "true" if canceled else "false",
        "premiumFormat": premium_format,
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": source,
    }


@pytest.fixture
def artifact(theaters_registry):
    rows = [
        _history_row(REFERENCE, premium_format="IMAX, Dolby Cinema"),
        _history_row(REFERENCE - timedelta(days=1), film="Past Film"),
        _history_row(REFERENCE + timedelta(days=120), film="Far Future"),
        _history_row(REFERENCE, film="Canceled Film", canceled=True),
        _history_row(
            REFERENCE,
            film="Bad Poster",
            runtime="Unknown",
            poster="None",
        ),
        _history_row(
            REFERENCE + timedelta(days=14),
            film="Beacon Film",
            theater="The Beacon",
            source="indie",
        ),
    ]
    return build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )


def test_window_is_all_known_future_with_latest_end_date(artifact):
    assert PUBLIC_SHOWTIME_HORIZON_POLICY == "all_known_future"
    assert WINDOW_DAYS is None
    dates = {row["date"] for row in artifact["showtimes"]}
    assert format_date_iso(REFERENCE) in dates
    assert format_date_iso(REFERENCE + timedelta(days=14)) in dates
    assert format_date_iso(REFERENCE + timedelta(days=120)) in dates
    assert artifact["window"] == {
        "start_date": format_date_iso(REFERENCE),
        "end_date": format_date_iso(REFERENCE + timedelta(days=120)),
    }


def test_past_rows_excluded(artifact):
    assert all(row["film_title"] != "Past Film" for row in artifact["showtimes"])


def test_far_future_rows_included_under_all_known_future(artifact):
    """All-known-future emit retains far-advance bookings from history."""
    assert any(row["film_title"] == "Far Future" for row in artifact["showtimes"])


def test_empty_future_window_end_equals_start(theaters_registry):
    """No future rows → window.end_date equals window.start_date."""
    rows = [_history_row(REFERENCE - timedelta(days=1), film="Past Only")]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    assert artifact["stats"]["showtime_count"] == 0
    assert artifact["window"] == {
        "start_date": format_date_iso(REFERENCE),
        "end_date": format_date_iso(REFERENCE),
    }


def test_canceled_rows_excluded(artifact):
    assert all(row["film_title"] != "Canceled Film" for row in artifact["showtimes"])


def test_theater_names_resolve_to_theater_id(artifact):
    amc = next(row for row in artifact["showtimes"] if row["film_title"] == "Sinners")
    beacon = next(
        row for row in artifact["showtimes"] if row["film_title"] == "Beacon Film"
    )
    assert amc["theater_id"] == "amc-pacific-place-11"
    assert beacon["theater_id"] == "the-beacon"


def test_unknown_poster_and_runtime_become_null(artifact):
    bad = next(row for row in artifact["showtimes"] if row["film_title"] == "Bad Poster")
    assert bad["runtime_min"] is None
    assert bad["poster_url"] is None

    film_ref = next(
        film for film in artifact["films"] if film["showtime_film_key"] == bad["showtime_film_key"]
    )
    assert film_ref["runtime_min"] is None
    assert film_ref["poster_url"] is None


def test_films_are_deduplicated(theaters_registry):
    rows = [
        _history_row(REFERENCE, film="Sinners", time="7:30PM"),
        _history_row(REFERENCE, film="SINNERS", time="9:30PM"),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    assert artifact["stats"]["film_count"] == 1
    assert len(artifact["films"]) == 1
    assert artifact["stats"]["showtime_count"] == 2


def test_showtime_ids_are_stable(theaters_registry):
    rows = [_history_row(REFERENCE)]
    first = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    second = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    assert first["showtimes"][0]["id"] == second["showtimes"][0]["id"]
    assert first["showtimes"][0]["id"] == make_showtime_id(
        "amc-pacific-place-11",
        "2026-06-26",
        "19:30",
        "sinners",
    )


def test_format_tags_are_normalized(artifact):
    sinners = next(row for row in artifact["showtimes"] if row["film_title"] == "Sinners")
    assert sinners["format_tags"] == ["imax", "dolby-cinema"]


def test_showtime_emits_source_identity_from_history(theaters_registry):
    rows = [
        {
            **_history_row(REFERENCE),
            "source_film_id": "movie-abc123",
            "source_title": "SINNERS",
        }
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    showtime = artifact["showtimes"][0]
    assert showtime["source_film_id"] == "movie-abc123"
    assert showtime["source_title"] == "SINNERS"
    assert showtime["film_title"] == "Sinners"


def test_showtime_source_identity_null_when_missing_id(theaters_registry):
    artifact = build_showtimes_current(
        [_history_row(REFERENCE)],
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    showtime = artifact["showtimes"][0]
    assert showtime["source_film_id"] is None
    assert showtime["source_title"] == "Sinners"


def test_json_shape_includes_required_sections(artifact):
    assert artifact["schema_version"] == CURRENT_SCHEMA_VERSION
    assert artifact["timezone"] == "America/Los_Angeles"
    assert artifact["generated_at"] == "2026-06-26T00:00:00-07:00"
    assert set(artifact) == {
        "schema_version",
        "generated_at",
        "timezone",
        "window",
        "sources_included",
        "sources",
        "stats",
        "theaters",
        "films",
        "showtimes",
    }
    assert artifact["stats"]["showtime_count"] == len(artifact["showtimes"])
    assert artifact["stats"]["film_count"] == len(artifact["films"])
    assert artifact["stats"]["theater_count"] == 2
    assert artifact["sources_included"] == ["amc", "beacon"]
    assert len(artifact["theaters"]) >= 11


def test_special_event_is_screening_level_not_film_global(theaters_registry):
    """Ordinary + Q&A performances of the same parent stay distinct."""
    rows = [
        _history_row(REFERENCE, film="Forgotten Island", premium_format="IMAX"),
        _history_row(
            REFERENCE,
            film="Forgotten Island - Early Access Screening with Cast Member Q&A",
            time="9:30PM",
            premium_format="Dolby Cinema",
        ),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    by_title = {row["film_title"]: row for row in artifact["showtimes"]}
    ordinary = by_title["Forgotten Island"]
    event = by_title[
        "Forgotten Island - Early Access Screening with Cast Member Q&A"
    ]
    assert ordinary["special_event"]["is_special_event"] is False
    assert event["special_event"]["is_special_event"] is True
    assert "q_and_a" in event["special_event"]["types"]
    assert "early_access" in event["special_event"]["types"]
    assert "dolby-cinema-at-amc" in event["format_tags"] or any(
        "dolby" in tag for tag in event["format_tags"]
    )
    assert event["parent_display_title"] == "Forgotten Island"
    assert ordinary["parent_display_title"] == "Forgotten Island"


def test_duplicate_history_rows_collapse_to_one_showtime(theaters_registry):
    """Identical theater|date|time|film rows must not inflate the artifact."""
    row = _history_row(
        REFERENCE,
        film="AMC Screen Unseen: September 21",
        time="7:00PM",
    )
    artifact = build_showtimes_current(
        [row, dict(row), dict(row)],
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    matches = [
        s
        for s in artifact["showtimes"]
        if "Screen Unseen" in (s.get("film_title") or "")
    ]
    assert len(matches) == 1
    assert matches[0]["special_event"]["is_special_event"] is True
    assert "mystery_screening" in matches[0]["special_event"]["types"]


def test_write_showtimes_current_writes_valid_json(tmp_path, theaters_registry):
    registry_path = tmp_path / "theaters.json"
    output_path = tmp_path / "showtimes_current.json"
    import json

    registry_path.write_text(json.dumps(theaters_registry), encoding="utf-8")

    rows = [_history_row(REFERENCE)]
    artifact = write_showtimes_current(
        rows,
        output_path=output_path,
        registry_path=registry_path,
        reference_date=REFERENCE,
    )

    raw = output_path.read_text(encoding="utf-8")
    loaded = json.loads(raw)
    assert loaded == artifact
    assert output_path.exists()
    assert artifact["window"]["end_date"] == format_date_iso(REFERENCE)
    # Repo source stays pretty (indent=2); deployment builds compact separately.
    assert "\n  " in raw


def test_parent_fields_emitted_for_regular_films(theaters_registry):
    """Regular films should get parent identity fields."""
    rows = [_history_row(REFERENCE, film="Sinners")]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    
    film = artifact["films"][0]
    assert "parent_film_key" in film
    assert "parent_display_title" in film
    assert "screening_variant_type" in film
    assert "is_special_screening" in film
    assert film["parent_film_key"] == "sinners"
    assert film["parent_display_title"] == "Sinners"
    assert film["screening_variant_type"] == "none"
    assert film["is_special_screening"] is False
    
    showtime = artifact["showtimes"][0]
    assert "parent_film_key" in showtime
    assert "parent_display_title" in showtime
    assert "screening_variant_type" in showtime
    assert "is_special_screening" in showtime


def test_variant_films_grouped_by_title_pattern(theaters_registry):
    """Variant films (IMAX, Sensory Friendly, etc.) should be grouped under parent."""
    rows = [
        _history_row(REFERENCE, film="Nosferatu"),
        _history_row(REFERENCE, film="Nosferatu: Sensory Friendly Screening", time="2:00PM"),
        _history_row(REFERENCE, film="NOSFERATU IMAX Opening Night Fan Event", time="7:00PM"),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    
    assert artifact["stats"]["film_count"] == 3
    
    # Find each variant
    regular = next(f for f in artifact["films"] if f["title"] == "Nosferatu")
    sensory = next(f for f in artifact["films"] if "Sensory" in f["title"])
    imax = next(f for f in artifact["films"] if "IMAX" in f["title"])
    
    # All should share the same parent
    assert regular["parent_film_key"] == "nosferatu"
    assert sensory["parent_film_key"] == "nosferatu"
    assert imax["parent_film_key"] == "nosferatu"
    
    assert regular["parent_display_title"] == "Nosferatu"
    assert sensory["parent_display_title"] == "Nosferatu"
    assert imax["parent_display_title"].upper() == "NOSFERATU"
    
    # Variants should be marked as special
    assert regular["is_special_screening"] is False
    assert sensory["is_special_screening"] is True
    assert imax["is_special_screening"] is True
    
    # Variant types should be classified
    assert regular["screening_variant_type"] == "none"
    assert sensory["screening_variant_type"] == "sensory_friendly"
    assert imax["screening_variant_type"] == "opening_night"


def test_source_film_id_used_for_parent_grouping(theaters_registry):
    """When source_film_id is available, it should be used for high-confidence grouping."""
    rows = [
        {
            **_history_row(REFERENCE, film="Moana"),
            "source_film_id": "72474",
            "source_title": "Moana",
        },
        {
            **_history_row(REFERENCE, film="Moana IMAX", time="2:00PM"),
            "source_film_id": "72474",
            "source_title": "Moana IMAX",
        },
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    
    assert artifact["stats"]["film_count"] == 2
    
    regular = next(f for f in artifact["films"] if f["title"] == "Moana")
    imax = next(f for f in artifact["films"] if "IMAX" in f["title"])
    
    # Both should use source_film_id-based parent key
    assert regular["parent_film_key"] == "amc-movie-72474"
    assert imax["parent_film_key"] == "amc-movie-72474"
    assert regular["source_film_id"] == "72474"
    assert imax["source_film_id"] == "72474"


def test_showtime_film_key_unchanged_for_backward_compatibility(theaters_registry):
    """showtime_film_key should remain title-based for backward compatibility."""
    rows = [
        _history_row(REFERENCE, film="Nosferatu: Sensory Friendly Screening"),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    
    film = artifact["films"][0]
    showtime = artifact["showtimes"][0]
    
    # showtime_film_key should still be title-based (unchanged)
    assert film["showtime_film_key"] == "nosferatu-sensory-friendly-screening"
    assert showtime["showtime_film_key"] == "nosferatu-sensory-friendly-screening"
    
    # But parent_film_key should be the parent
    assert film["parent_film_key"] == "nosferatu"
    assert showtime["parent_film_key"] == "nosferatu"


def test_double_feature_not_auto_merged(theaters_registry):
    """Double features should not be auto-merged with parent film."""
    rows = [
        _history_row(REFERENCE, film="Citizen Kane"),
        _history_row(REFERENCE, film="Citizen Kane 85th Anniversary Double Feature", time="2:00PM"),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    
    assert artifact["stats"]["film_count"] == 2
    
    regular = next(f for f in artifact["films"] if f["title"] == "Citizen Kane")
    double_feature = next(f for f in artifact["films"] if "Double Feature" in f["title"])
    
    # Double feature should NOT share parent with regular film
    # (Low confidence grouping keeps them separate)
    assert regular["showtime_film_key"] == "citizen-kane"
    assert "double-feature" in double_feature["showtime_film_key"]
    assert double_feature["screening_variant_type"] == "double_feature"
    assert double_feature["is_special_screening"] is True


def test_emit_source_rejects_legacy_indie_and_garbage(theaters_registry):
    """Only validated known sources override the theater registry on emit."""
    from reel_seattle.source_freshness import resolve_history_row_source
    from reel_seattle.normalize import build_theater_index

    theater_index = build_theater_index(theaters_registry)
    gi_row = _history_row(
        REFERENCE,
        film="GI Programmer",
        theater="SIFF Film Center",
        source="grand_illusion",
        time="9:00PM",
    )
    assert resolve_history_row_source(gi_row, theater_index) == "grand_illusion"

    artifact = build_showtimes_current(
        [
            _history_row(
                REFERENCE,
                film="Beacon Indie Label",
                theater="The Beacon",
                source="indie",
            ),
            _history_row(
                REFERENCE,
                film="NWFF Garbage Label",
                theater="Northwest Film Forum",
                source="garbage",
                time="8:00PM",
            ),
            gi_row,
        ],
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    by_title = {row["film_title"]: row for row in artifact["showtimes"]}
    assert by_title["Beacon Indie Label"]["source"] == "beacon"
    assert by_title["NWFF Garbage Label"]["source"] == "nwff"
    # Unmatched GI rows stay non-public, but validated GI evidence still lands
    # under grand_illusion freshness (not the SIFF registry source).
    assert "GI Programmer" not in by_title
    assert "indie" not in artifact["sources_included"]
    assert "garbage" not in artifact["sources_included"]
    assert artifact["sources"]["grand_illusion"]["status"] == "stale"
    assert artifact["sources"]["siff"]["showtime_count"] == 0

