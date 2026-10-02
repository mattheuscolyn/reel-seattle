"""Synthetic checks for the feature-expansion helpers."""

from reel_seattle.analysis.leaving_soon_feature_expansion import (
    adult_price,
    archetype_label,
    assign_archetype,
)


def test_adult_price_reads_the_adult_sku():
    prices = [
        {"type": "CHILD", "price": 12.0},
        {"type": "ADULT", "price": 20.04},
    ]
    assert adult_price(prices) == 20.04
    assert adult_price(None) is None


def test_south_asian_language_is_its_own_archetype():
    flags = assign_archetype(
        {"language": "hi", "genre": "DRAMA", "tmdb_genres": []},
        title="Example",
        segment="ordinary",
        opening_theaters=5.0,
    )
    assert flags["arch_south_asian"] == 1.0
    assert archetype_label(flags) == "south asian"


def test_wide_english_film_is_not_labeled_specialty():
    flags = assign_archetype(
        {"language": "en", "genre": "COMEDY", "tmdb_genres": ["Comedy"]},
        title="Example",
        segment="ordinary",
        opening_theaters=6.0,
    )
    assert flags["arch_wide"] == 1.0
    assert flags["arch_specialty"] == 0.0
