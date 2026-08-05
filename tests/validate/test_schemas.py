"""Tests for JSON Schema validation."""

from __future__ import annotations

import copy
import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.emit.current import build_showtimes_current, write_showtimes_current
from reel_seattle.normalize import format_date_csv
from reel_seattle.validate import (
    NEWLY_ADDED_CURRENT_SCHEMA_PATH,
    SHOWTIMES_CURRENT_SCHEMA_PATH,
    THEATERS_SCHEMA_PATH,
    SchemaValidationError,
    validate_against_schema,
    validate_newly_added_current,
    validate_showtimes_current,
    validate_theaters_registry,
    validate_theaters_registry_file,
)

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)
GENERATED_AT = datetime(2026, 6, 26, 0, 0, 0, tzinfo=PACIFIC)


def _history_row(show_date: date) -> dict[str, str]:
    return {
        "Date": format_date_csv(show_date),
        "Time": "7:30PM",
        "Theater": "AMC Pacific Place 11",
        "Film": "Sinners",
        "Runtime": "137",
        "isAlmostSoldOut": "None",
        "posterDynamic": "https://example.com/sinners.jpg",
        "isCanceled": "false",
        "premiumFormat": "IMAX",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": "amc",
    }


@pytest.fixture
def valid_showtimes_current(theaters_registry) -> dict:
    return build_showtimes_current(
        [_history_row(REFERENCE)],
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )


def test_valid_theaters_registry_passes(project_root):
    registry = json.loads((project_root / "data" / "theaters.json").read_text(encoding="utf-8"))
    validate_theaters_registry(registry)


def test_validate_theaters_registry_file_passes(project_root):
    registry = validate_theaters_registry_file(project_root / "data" / "theaters.json")
    assert registry["schema_version"] == "1.1.0"


def test_valid_showtimes_current_fixture_passes(valid_showtimes_current):
    validate_showtimes_current(valid_showtimes_current)


def test_missing_top_level_field_fails_validation(valid_showtimes_current):
    broken = copy.deepcopy(valid_showtimes_current)
    del broken["window"]

    with pytest.raises(SchemaValidationError) as exc_info:
        validate_showtimes_current(broken)

    message = str(exc_info.value)
    assert str(SHOWTIMES_CURRENT_SCHEMA_PATH) in message
    assert "window" in message


def test_missing_showtime_field_fails_validation(valid_showtimes_current):
    broken = copy.deepcopy(valid_showtimes_current)
    del broken["showtimes"][0]["theater_id"]

    with pytest.raises(SchemaValidationError) as exc_info:
        validate_showtimes_current(broken)

    message = str(exc_info.value)
    assert "theater_id" in message
    assert "$.showtimes" in message


def test_invalid_enum_fails_validation(valid_showtimes_current):
    broken = copy.deepcopy(valid_showtimes_current)
    broken["showtimes"][0]["status"] = "cancelled"

    with pytest.raises(SchemaValidationError) as exc_info:
        validate_showtimes_current(broken)

    assert "status" in str(exc_info.value)


def test_invalid_type_fails_validation(valid_showtimes_current):
    broken = copy.deepcopy(valid_showtimes_current)
    broken["stats"]["showtime_count"] = "seven"

    with pytest.raises(SchemaValidationError) as exc_info:
        validate_showtimes_current(broken)

    message = str(exc_info.value)
    assert "showtime_count" in message
    assert "seven" in message or "string" in message.lower()


def test_invalid_registry_fails_before_emit(tmp_path, theaters_registry):
    broken_registry = copy.deepcopy(theaters_registry)
    del broken_registry["updated_at"]

    registry_path = tmp_path / "theaters.json"
    output_path = tmp_path / "showtimes_current.json"
    registry_path.write_text(json.dumps(broken_registry), encoding="utf-8")

    with pytest.raises(SchemaValidationError) as exc_info:
        write_showtimes_current(
            [_history_row(REFERENCE)],
            output_path=output_path,
            registry_path=registry_path,
            reference_date=REFERENCE,
        )

    assert str(THEATERS_SCHEMA_PATH) in str(exc_info.value)
    assert not output_path.exists()


def test_invalid_artifact_is_not_written(tmp_path, theaters_registry, valid_showtimes_current):
    registry_path = tmp_path / "theaters.json"
    output_path = tmp_path / "showtimes_current.json"
    registry_path.write_text(json.dumps(theaters_registry), encoding="utf-8")

    broken = copy.deepcopy(valid_showtimes_current)
    del broken["schema_version"]

    def _broken_build(*args, **kwargs):
        return broken

    import reel_seattle.emit.current as emit_module

    original = emit_module.build_showtimes_current
    emit_module.build_showtimes_current = _broken_build
    try:
        with pytest.raises(SchemaValidationError):
            write_showtimes_current(
                [_history_row(REFERENCE)],
                output_path=output_path,
                registry_path=registry_path,
                reference_date=REFERENCE,
            )
    finally:
        emit_module.build_showtimes_current = original

    assert not output_path.exists()


def test_validate_against_schema_reports_json_pointer(valid_showtimes_current):
    broken = copy.deepcopy(valid_showtimes_current)
    broken["showtimes"][0]["date"] = 20260626

    with pytest.raises(SchemaValidationError) as exc_info:
        validate_against_schema(broken, SHOWTIMES_CURRENT_SCHEMA_PATH)

    assert "$.showtimes.0.date" in str(exc_info.value)


def test_valid_newly_added_current_fixture_passes(theaters_registry, valid_showtimes_current):
    from reel_seattle.emit.newly_added import build_newly_added_current

    artifact = build_newly_added_current(
        [
            {
                "Film": "Sinners",
                "Theater": "AMC Pacific Place 11",
                "first_announced_date": "2026-06-26",
                "last_seen_date": "2026-06-26",
            }
        ],
        valid_showtimes_current,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    validate_newly_added_current(artifact)
    validate_against_schema(artifact, NEWLY_ADDED_CURRENT_SCHEMA_PATH)
