"""Tests for reel_seattle.normalize.times."""

import pytest

from reel_seattle.normalize.times import (
    ParsedTime,
    format_time_24h,
    format_time_display,
    parse_time,
    parse_time_to_minutes,
    parsed_time_from_minutes,
)


@pytest.mark.parametrize(
    ("raw", "minutes", "time_24h", "time_display"),
    [
        ("7:30PM", 19 * 60 + 30, "19:30", "7:30 PM"),
        ("7:30 PM", 19 * 60 + 30, "19:30", "7:30 PM"),
        ("07:30PM", 19 * 60 + 30, "19:30", "7:30 PM"),
        ("19:30", 19 * 60 + 30, "19:30", "7:30 PM"),
        ("12:00 PM", 12 * 60, "12:00", "12:00 PM"),
        ("12:00 AM", 0, "00:00", "12:00 AM"),
        ("12:30 AM", 30, "00:30", "12:30 AM"),
        ("12:30 PM", 12 * 60 + 30, "12:30", "12:30 PM"),
        ("1:15PM", 13 * 60 + 15, "13:15", "1:15 PM"),
        ("11:59PM", 23 * 60 + 59, "23:59", "11:59 PM"),
    ],
)
def test_parse_time_valid(raw, minutes, time_24h, time_display):
    parsed = parse_time(raw)
    assert parsed is not None
    assert parsed.minutes_since_midnight == minutes
    assert parsed.time_24h == time_24h
    assert parsed.time_display == time_display
    assert " " in parsed.time_display
    assert parsed.time_display.endswith("AM") or parsed.time_display.endswith("PM")


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "Unknown",
        "7:30",
        "25:00",
        "7:60PM",
        "13:00PM",
        "7:30:00PM",
        "7:30:00 PM",
        "not-a-time",
    ],
)
def test_parse_time_invalid(raw):
    assert parse_time(raw) is None
    assert parse_time_to_minutes(raw) is None


def test_parse_time_to_minutes_matches_parsed_time():
    assert parse_time_to_minutes("7:30 PM") == 19 * 60 + 30


def test_parsed_time_from_minutes_round_trip():
    parsed = parsed_time_from_minutes(19 * 60 + 30)
    assert parsed == ParsedTime(
        minutes_since_midnight=19 * 60 + 30,
        time_24h="19:30",
        time_display="7:30 PM",
    )


@pytest.mark.parametrize(
    ("minutes", "expected_24h", "expected_display"),
    [
        (0, "00:00", "12:00 AM"),
        (12 * 60, "12:00", "12:00 PM"),
        (19 * 60 + 30, "19:30", "7:30 PM"),
    ],
)
def test_format_helpers(minutes, expected_24h, expected_display):
    assert format_time_24h(minutes) == expected_24h
    assert format_time_display(minutes) == expected_display


def test_parsed_time_from_minutes_out_of_range():
    with pytest.raises(ValueError):
        parsed_time_from_minutes(24 * 60)
