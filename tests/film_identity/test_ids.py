"""Tests for namespaced film IDs and fallbacks."""

from __future__ import annotations

import pytest

from reel_seattle.film_identity.ids import (
    fallback_film_id,
    film_id_from_source,
    film_id_from_source_key,
    film_id_from_tmdb,
    parse_film_id,
)


def test_tmdb_film_id_format():
    assert film_id_from_tmdb(603) == "tmdb:603"
    parsed = parse_film_id("tmdb:120467")
    assert parsed.identity_type == "tmdb"
    assert parsed.tmdb_id == 120467


def test_tmdb_film_id_rejects_non_positive():
    with pytest.raises(ValueError):
        film_id_from_tmdb(0)


def test_source_and_source_key_fallbacks():
    assert film_id_from_source("amc", "72474") == "source:amc:72474"
    assert (
        film_id_from_source_key("nwff", "asco-without-permission")
        == "source-key:nwff:asco-without-permission"
    )
    assert (
        fallback_film_id(source="amc", source_film_id="72474", showtime_film_key="moana")
        == "source:amc:72474"
    )
    assert (
        fallback_film_id(source="siff", source_film_id=None, showtime_film_key="sinners")
        == "source-key:siff:sinners"
    )


def test_parse_rejects_bare_integer_and_bad_shapes():
    with pytest.raises(ValueError):
        parse_film_id("603")
    with pytest.raises(ValueError):
        parse_film_id("tmdb:0")
