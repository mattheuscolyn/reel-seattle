"""Tests for reel_seattle.normalize.dates."""

from datetime import date, datetime

import pytest

from reel_seattle.normalize.dates import (
    format_date_csv,
    format_date_iso,
    parse_csv_date,
    parse_datetime_iso,
    parse_iso_date,
    parse_show_date,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-07-11", date(2026, 7, 11)),
        ("2026-01-05", date(2026, 1, 5)),
        ("not-a-date", None),
        ("2026-13-01", None),
    ],
)
def test_parse_iso_date(raw, expected):
    assert parse_iso_date(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("07/11/2026", date(2026, 7, 11)),
        ("7/5/2026", date(2026, 7, 5)),
        ("13/01/2026", None),
        ("07/11/26", None),
    ],
)
def test_parse_csv_date(raw, expected):
    assert parse_csv_date(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("July 11, 2026", date(2026, 7, 11)),
        ("Friday, July 11, 2026", date(2026, 7, 11)),
        ("December 1, 2025", date(2025, 12, 1)),
        ("Not a Month 99, 2026", None),
    ],
)
def test_parse_show_date_long_form(raw, expected):
    assert parse_show_date(raw) == expected


def test_parse_show_date_iso_and_csv_paths():
    assert parse_show_date("2026-06-26") == date(2026, 6, 26)
    assert parse_show_date("06/26/2026") == date(2026, 6, 26)


def test_parse_show_date_with_default_year():
    assert parse_show_date("July 11", default_year=2026) == date(2026, 7, 11)


def test_parse_show_date_year_inference_next_year():
    # Scraping in December for a January date → next calendar year.
    reference = date(2025, 12, 15)
    assert parse_show_date("January 20", reference_date=reference) == date(2026, 1, 20)


def test_parse_show_date_year_inference_same_year():
    reference = date(2026, 6, 1)
    assert parse_show_date("July 11", reference_date=reference) == date(2026, 7, 11)


def test_parse_show_date_missing_year_without_reference():
    assert parse_show_date("July 11") is None


@pytest.mark.parametrize(
    ("value", "expected_iso", "expected_csv"),
    [
        (date(2026, 7, 11), "2026-07-11", "07/11/2026"),
        (date(2026, 1, 5), "2026-01-05", "01/05/2026"),
    ],
)
def test_format_dates(value, expected_iso, expected_csv):
    assert format_date_iso(value) == expected_iso
    assert format_date_csv(value) == expected_csv


def test_parse_datetime_iso():
    dt = parse_datetime_iso("2026-06-26T19:30:00")
    assert dt == datetime(2026, 6, 26, 19, 30, 0)


def test_parse_datetime_iso_with_offset():
    dt = parse_datetime_iso("2026-06-26T19:30:00-07:00")
    assert dt is not None
    assert dt.year == 2026


def test_parse_datetime_iso_invalid():
    assert parse_datetime_iso("not-a-datetime") is None
    assert parse_datetime_iso("None") is None
