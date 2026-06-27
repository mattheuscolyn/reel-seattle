"""Tests for reel_seattle.normalize.formats."""

import pytest

from reel_seattle.normalize.formats import parse_format_tags


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("IMAX", ("imax",)),
        ("Dolby Cinema", ("dolby-cinema",)),
        ("IMAX, Dolby Cinema", ("imax", "dolby-cinema")),
        ("IMAX / Dolby Atmos", ("imax", "dolby-atmos")),
        ("PRIME at AMC", ("prime",)),
        ("Laser Projection 70mm", ("laser-projection-70mm",)),
        ("", ()),
        (None, ()),
        ("None", ()),
        ("Unknown", ()),
    ],
)
def test_parse_format_tags(raw, expected):
    assert parse_format_tags(raw) == expected


def test_parse_format_tags_deduplicates():
    assert parse_format_tags("IMAX, imax") == ("imax",)


def test_parse_format_tags_from_list():
    assert parse_format_tags(["IMAX", "Dolby"]) == ("imax", "dolby")


def test_parse_format_tags_preserves_order():
    assert parse_format_tags("Dolby, IMAX") == ("dolby", "imax")
