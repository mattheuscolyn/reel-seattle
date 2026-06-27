"""Tests for null sentinel normalization in history and current artifacts."""

from __future__ import annotations

import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from daily_processor import normalize_history_row
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.history_nulls import nullish_to_csv_empty, normalize_history_optional_fields
from reel_seattle.normalize import format_date_csv
from reel_seattle.validate import validate_showtimes_current

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)
GENERATED_AT = datetime(2026, 6, 26, 0, 0, 0, tzinfo=PACIFIC)


def _history_row(**overrides) -> dict[str, str]:
    row = {
        "Date": format_date_csv(REFERENCE),
        "Time": "7:30PM",
        "Theater": "AMC Pacific Place 11",
        "Film": "Sinners",
        "Runtime": "137",
        "isAlmostSoldOut": "",
        "posterDynamic": "https://example.com/poster.jpg",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": "amc",
    }
    row.update(overrides)
    return row


def _artifact_for_rows(rows, theaters_registry):
    return build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )


def _optional_string_values(artifact: dict) -> list[str]:
    values: list[str] = []
    for showtime in artifact["showtimes"]:
        for field in (
            "poster_url",
            "ticket_url",
            "source_showtime_id",
            "first_seen_at",
            "last_seen_at",
        ):
            value = showtime.get(field)
            if isinstance(value, str):
                values.append(value)
        runtime = showtime.get("runtime_min")
        if isinstance(runtime, str):
            values.append(runtime)
    for film in artifact["films"]:
        for field in ("poster_url",):
            value = film.get(field)
            if isinstance(value, str):
                values.append(value)
        runtime = film.get("runtime_min")
        if isinstance(runtime, str):
            values.append(runtime)
    return values


def test_current_json_null_for_none_poster(theaters_registry):
    artifact = _artifact_for_rows(
        [_history_row(posterDynamic="None")],
        theaters_registry,
    )
    showtime = artifact["showtimes"][0]
    assert showtime["poster_url"] is None
    assert showtime["film_title"] == "Sinners"


def test_current_json_null_for_unknown_runtime(theaters_registry):
    artifact = _artifact_for_rows(
        [_history_row(Runtime="Unknown")],
        theaters_registry,
    )
    showtime = artifact["showtimes"][0]
    assert showtime["runtime_min"] is None


def test_current_json_null_for_missing_ticket_url(theaters_registry):
    artifact = _artifact_for_rows([_history_row()], theaters_registry)
    showtime = artifact["showtimes"][0]
    assert showtime["ticket_url"] is None


def test_current_json_has_no_literal_none_or_unknown_optional_values(theaters_registry):
    artifact = _artifact_for_rows(
        [
            _history_row(
                Runtime="Unknown",
                posterDynamic="None",
                first_seen_date="None",
                last_updated="Unknown",
            )
        ],
        theaters_registry,
    )
    values = _optional_string_values(artifact)
    assert "None" not in values
    assert "Unknown" not in values
    validate_showtimes_current(artifact)


def test_history_row_normalizes_none_poster_to_empty_string():
    row = normalize_history_row(_history_row(posterDynamic="None"))
    assert row["posterDynamic"] == ""


def test_history_row_normalizes_unknown_runtime_to_empty_string():
    row = normalize_history_row(_history_row(Runtime="Unknown"))
    assert row["Runtime"] == ""


def test_history_row_preserves_meaningful_runtime_values():
    row = normalize_history_row(_history_row(Runtime="137 min"))
    assert row["Runtime"] == "137 min"
    row = normalize_history_row(_history_row(Runtime="137"))
    assert row["Runtime"] == "137"


def test_rows_not_dropped_for_nullish_optional_fields(theaters_registry):
    artifact = _artifact_for_rows(
        [_history_row(Runtime="Unknown", posterDynamic="None")],
        theaters_registry,
    )
    assert artifact["stats"]["showtime_count"] == 1


def test_nullish_to_csv_empty_handles_whitespace_and_na():
    assert nullish_to_csv_empty("   ") == ""
    assert nullish_to_csv_empty("N/A") == ""
    assert nullish_to_csv_empty("none") == ""


def test_normalize_history_optional_fields_only_touches_present_keys():
    row = {"Runtime": "Unknown", "Film": "Sinners"}
    normalize_history_optional_fields(row)
    assert row["Runtime"] == ""
    assert row["Film"] == "Sinners"
