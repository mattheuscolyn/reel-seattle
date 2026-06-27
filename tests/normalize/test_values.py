"""Tests for reel_seattle.normalize.values."""

import pytest

from reel_seattle.normalize.values import (
    collapse_whitespace,
    empty_to_none,
    normalize_bool_string,
    normalize_optional_string,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        ("   ", None),
        ("None", None),
        ("NONE", None),
        ("unknown", None),
        ("Unknown", None),
        ("N/A", None),
        ("null", None),
        ("  hello  ", "hello"),
        ("hello   world", "hello world"),
        (42, "42"),
    ],
)
def test_normalize_optional_string(raw, expected):
    assert normalize_optional_string(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  a   b  ", "a b"),
        ("\thello\nworld\t", "hello world"),
        ("no-change", "no-change"),
    ],
)
def test_collapse_whitespace(raw, expected):
    assert collapse_whitespace(raw) == expected


@pytest.mark.parametrize(
    ("raw", "default", "expected"),
    [
        ("true", False, True),
        ("TRUE", False, True),
        ("1", False, True),
        ("yes", False, True),
        ("false", True, False),
        ("0", True, False),
        ("no", True, False),
        ("None", False, False),
        ("", True, True),
        ("maybe", False, False),
    ],
)
def test_normalize_bool_string(raw, default, expected):
    assert normalize_bool_string(raw, default=default) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        ("   ", None),
        ("text", "text"),
    ],
)
def test_empty_to_none(raw, expected):
    assert empty_to_none(raw) == expected
