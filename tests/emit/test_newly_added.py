"""Tests for newly_added_current.json emission."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.emit.newly_added import (
    NEWLY_ADDED_DAYS_BACK,
    NEWLY_ADDED_SCHEMA_VERSION,
    build_newly_added_current,
    filter_recent_announcements,
    write_newly_added_current,
)
from reel_seattle.normalize import format_date_csv
from reel_seattle.validate import validate_newly_added_current

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)
GENERATED_AT = datetime(2026, 6, 26, 12, 0, 0, tzinfo=PACIFIC)


def _history_row(
    show_date: date,
    *,
    film: str = "Sinners",
    theater: str = "AMC Pacific Place 11",
    source: str = "amc",
) -> dict[str, str]:
    return {
        "Date": format_date_csv(show_date),
        "Time": "7:30PM",
        "Theater": theater,
        "Film": film,
        "Runtime": "137",
        "isAlmostSoldOut": "None",
        "posterDynamic": "https://example.com/poster.jpg",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": source,
    }


def _announcement(
    film: str,
    theater: str,
    *,
    first_announced: str = "2026-06-26",
    last_seen: str = "2026-06-26",
) -> dict[str, str]:
    return {
        "Film": film,
        "Theater": theater,
        "first_announced_date": first_announced,
        "last_seen_date": last_seen,
    }


@pytest.fixture
def current_artifact(theaters_registry):
    rows = [
        _history_row(REFERENCE, film="Fresh Film", theater="AMC Pacific Place 11"),
        _history_row(REFERENCE, film="Beacon Pick", theater="The Beacon", source="indie"),
        _history_row(REFERENCE + timedelta(days=1), film="Older Window Film", theater="The Beacon", source="indie"),
    ]
    return build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )


def test_emits_valid_json_shape(current_artifact, theaters_registry):
    announcements = [
        _announcement("Fresh Film", "AMC Pacific Place 11"),
        _announcement("Beacon Pick", "The Beacon"),
    ]
    artifact = build_newly_added_current(
        announcements,
        current_artifact,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )

    assert artifact["schema_version"] == NEWLY_ADDED_SCHEMA_VERSION
    assert artifact["generated_at"] == GENERATED_AT.isoformat(timespec="seconds")
    assert artifact["days_back"] == NEWLY_ADDED_DAYS_BACK
    assert isinstance(artifact["entries"], list)
    validate_newly_added_current(artifact)


def test_includes_canonical_theater_id_and_film_key(current_artifact, theaters_registry):
    announcements = [_announcement("Fresh Film", "AMC Pacific Place 11")]
    artifact = build_newly_added_current(
        announcements,
        current_artifact,
        registry=theaters_registry,
        reference_date=REFERENCE,
    )
    entry = artifact["entries"][0]

    assert entry["theater_id"] == "amc-pacific-place-11"
    assert entry["showtime_film_key"] == "fresh-film"
    assert entry["theater_name"] == "AMC Pacific Place 11"
    assert entry["film_title"] == "Fresh Film"


def test_preserves_first_announced_date(current_artifact, theaters_registry):
    announcements = [
        _announcement(
            "Beacon Pick",
            "The Beacon",
            first_announced="2026-06-24",
            last_seen="2026-06-26",
        ),
    ]
    artifact = build_newly_added_current(
        announcements,
        current_artifact,
        registry=theaters_registry,
        reference_date=REFERENCE,
    )
    entry = artifact["entries"][0]

    assert entry["first_announced_date"] == "2026-06-24"
    assert entry["last_seen_date"] == "2026-06-26"


def test_filters_entries_not_in_current_window(current_artifact, theaters_registry):
    announcements = [
        _announcement("Fresh Film", "AMC Pacific Place 11"),
        _announcement("Ghost Film", "AMC Oak Tree 6"),
    ]
    artifact = build_newly_added_current(
        announcements,
        current_artifact,
        registry=theaters_registry,
        reference_date=REFERENCE,
    )
    keys = {(entry["showtime_film_key"], entry["theater_id"]) for entry in artifact["entries"]}

    assert ("fresh-film", "amc-pacific-place-11") in keys
    assert ("ghost-film", "amc-oak-tree-6") not in keys


def test_filters_announcements_outside_days_back_window(current_artifact, theaters_registry):
    announcements = [
        _announcement(
            "Beacon Pick",
            "The Beacon",
            first_announced="2026-06-10",
            last_seen="2026-06-26",
        ),
        _announcement("Fresh Film", "AMC Pacific Place 11", first_announced="2026-06-25"),
    ]
    artifact = build_newly_added_current(
        announcements,
        current_artifact,
        registry=theaters_registry,
        reference_date=REFERENCE,
        days_back=7,
    )
    titles = {entry["film_title"] for entry in artifact["entries"]}

    assert "Fresh Film" in titles
    assert "Beacon Pick" not in titles


def test_dedupes_duplicate_film_theater_entries(current_artifact, theaters_registry):
    announcements = [
        _announcement(
            "Fresh Film",
            "AMC Pacific Place 11",
            first_announced="2026-06-20",
            last_seen="2026-06-25",
        ),
        _announcement(
            "Fresh Film",
            "AMC Pacific Place 11",
            first_announced="2026-06-24",
            last_seen="2026-06-26",
        ),
    ]
    artifact = build_newly_added_current(
        announcements,
        current_artifact,
        registry=theaters_registry,
        reference_date=REFERENCE,
    )

    assert len(artifact["entries"]) == 1
    assert artifact["entries"][0]["first_announced_date"] == "2026-06-20"


def test_sorts_newest_first(current_artifact, theaters_registry):
    announcements = [
        _announcement("Beacon Pick", "The Beacon", first_announced="2026-06-24"),
        _announcement("Fresh Film", "AMC Pacific Place 11", first_announced="2026-06-26"),
        _announcement("Older Window Film", "The Beacon", first_announced="2026-06-25"),
    ]
    artifact = build_newly_added_current(
        announcements,
        current_artifact,
        registry=theaters_registry,
        reference_date=REFERENCE,
    )
    announced_dates = [entry["first_announced_date"] for entry in artifact["entries"]]

    assert announced_dates == sorted(announced_dates, reverse=True)


def test_filter_recent_announcements_uses_reference_date():
    rows = [
        _announcement("A", "The Beacon", first_announced="2026-06-26"),
        _announcement("B", "The Beacon", first_announced="2026-06-10"),
    ]
    recent = filter_recent_announcements(rows, days_back=7, reference_date=REFERENCE)

    assert len(recent) == 1
    assert recent[0]["Film"] == "A"


def test_write_newly_added_current(tmp_path, current_artifact, theaters_registry, project_root):
    announcements = [_announcement("Fresh Film", "AMC Pacific Place 11")]
    output_path = tmp_path / "newly_added_current.json"
    registry_path = project_root / "data" / "theaters.json"

    artifact = write_newly_added_current(
        announcements,
        current_artifact,
        output_path=output_path,
        registry_path=registry_path,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )

    assert output_path.exists()
    assert artifact["entries"]
    validate_newly_added_current(artifact)
