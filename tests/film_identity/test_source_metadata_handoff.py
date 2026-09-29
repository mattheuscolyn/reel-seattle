"""Regression tests for source identity metadata surviving the history bridge."""

from __future__ import annotations

import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.film_identity.inventory import inventory_source_identities
from reel_seattle.validate import validate_showtimes_current

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 9, 28)


def _history_row() -> dict[str, str]:
    return {
        "Date": "09/28/2026",
        "Time": "7:30PM",
        "Theater": "The Beacon",
        "Film": "Clean Film",
        "Runtime": "101",
        "isAlmostSoldOut": "None",
        "posterDynamic": "",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-09-27",
        "last_updated": "2026-09-28",
        "source": "beacon",
        "source_film_id": "clean-film",
        "source_title": "Example Series: Clean Film (35mm)",
        "identity_title": "Clean Film",
        "release_year": "1998",
        "program_series": "Example Series",
        "source_showtime_id": "",
        "ticket_url": "",
        "source_film_url": "https://example.com/clean-film",
    }


def test_indie_legacy_bridge_preserves_identity_metadata():
    raw = RawShowtime(
        theater_name_raw="The Beacon",
        date_raw="09/28/2026",
        time_raw="7:30PM",
        title_raw="Example Series: Clean Film (35mm)",
        runtime_raw="101",
        attributes={
            "source_film_id": "clean-film",
            "identity_title": "Clean Film",
            "release_year": 1998,
            "program_series": "Example Series",
        },
    )

    row = raw_showtime_to_legacy_row(raw)

    assert row["Film"] == "Clean Film"
    assert row["source_title"] == "Example Series: Clean Film (35mm)"
    assert row["identity_title"] == "Clean Film"
    assert row["release_year"] == "1998"
    assert row["program_series"] == "Example Series"


def test_current_emit_preserves_identity_metadata(theaters_registry):
    artifact = build_showtimes_current(
        [_history_row()],
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=datetime(2026, 9, 28, 12, 0, tzinfo=PACIFIC),
    )

    assert len(artifact["showtimes"]) == 1
    row = artifact["showtimes"][0]
    assert row["source_title"] == "Example Series: Clean Film (35mm)"
    assert row["identity_title"] == "Clean Film"
    assert row["release_year"] == 1998
    assert row["program_series"] == "Example Series"
    validate_showtimes_current(artifact)


def test_identity_inventory_uses_source_identity_title_and_release_year(tmp_path):
    showtimes_path = tmp_path / "showtimes.json"
    showtimes_path.write_text(
        json.dumps(
            {
                "films": [
                    {
                        "showtime_film_key": "clean-film",
                        "runtime_min": 101,
                    }
                ],
                "showtimes": [
                    {
                        "source": "beacon",
                        "source_film_id": "clean-film",
                        "showtime_film_key": "clean-film",
                        "source_title": "Unregistered Showcase: Clean Film (35mm)",
                        "film_title": "Clean Film",
                        "identity_title": "Clean Film",
                        "release_year": 1998,
                        "program_series": "Unregistered Showcase",
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

    assert inventory["total_unique_source_identities"] == 1
    identity = inventory["identities"][0]
    assert identity["source_title"] == "Unregistered Showcase: Clean Film (35mm)"
    assert identity["identity_title"] == "Clean Film"
    assert identity["normalized_title"] == "Clean Film"
    assert identity["release_year"] == 1998
    assert identity["year_hint"] == 1998
    assert identity["program_series"] == "Unregistered Showcase"
