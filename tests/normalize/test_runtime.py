"""Tests for reel_seattle.normalize.runtime."""

import pytest

from reel_seattle.normalize.runtime import parse_runtime_minutes


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (137, 137),
        ("137", 137),
        ("137 min", 137),
        ("137 min.", 137),
        ("137 minutes", 137),
        ("2h 17m", 137),
        ("2h17m", 137),
        ("2h", 120),
        ("150 min.", 150),
        (None, None),
        ("Unknown", None),
        ("None", None),
        ("", None),
        ("ALL NIGHT LONG", None),
        (0, None),
        (-5, None),
        (True, None),
        ("not-a-runtime", None),
        ("0 min", None),
    ],
)
def test_parse_runtime_minutes(raw, expected):
    assert parse_runtime_minutes(raw) == expected


def test_parse_runtime_float():
    assert parse_runtime_minutes(137.0) == 137
