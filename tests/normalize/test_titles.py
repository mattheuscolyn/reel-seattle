"""Tests for reel_seattle.normalize.titles."""

import pytest

from reel_seattle.normalize.titles import (
    extract_year_hint,
    normalize_film_title,
    showtime_film_key,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Sinners  ", "Sinners"),
        ("hello   world", "hello world"),
        ("SINNERS", "Sinners"),
        ("THE DARK KNIGHT", "The Dark Knight"),
        ("NOPE", "NOPE"),  # length == 4, no all-caps conversion
        ("Sinners: Part II", "Sinners: Part II"),
        ("Thunderbolts*", "Thunderbolts*"),
        (None, None),
        ("Unknown", None),
    ],
)
def test_normalize_film_title(raw, expected):
    assert normalize_film_title(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Sinners (2025)", 2025),
        ("Film from 1999", 1999),
        ("No year here", None),
        (None, None),
    ],
)
def test_extract_year_hint(raw, expected):
    assert extract_year_hint(raw) == expected


@pytest.mark.parametrize(
    ("title", "year", "expected"),
    [
        ("Sinners", None, "sinners"),
        ("The Matrix", None, "matrix"),
        ("Bleak Week: Funny Games", None, "bleak-week-funny-games"),
        ("Sinners", 2025, "sinners-2025"),
        ("Sinners (2025)", None, "sinners-2025"),
        ("  ", None, None),
    ],
)
def test_showtime_film_key(title, year, expected):
    assert showtime_film_key(title, year=year) == expected


def test_showtime_film_key_is_deterministic():
    assert showtime_film_key("Sinners") == showtime_film_key("  SINNERS  ")


def test_article_stripped_for_key_not_display():
    display = normalize_film_title("The Matrix")
    assert display == "The Matrix"
    assert showtime_film_key(display) == "matrix"
