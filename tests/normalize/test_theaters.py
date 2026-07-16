"""Tests for reel_seattle.normalize.theaters."""

import pytest

from reel_seattle.normalize.theaters import (
    TheaterResolution,
    build_theater_index,
    list_enabled_theater_ids,
    resolve_theater,
)


@pytest.fixture(scope="module")
def theater_index(theaters_registry):
    return build_theater_index(theaters_registry)


@pytest.mark.parametrize(
    ("raw_name", "expected_id", "expected_name"),
    [
        ("AMC Pacific Place 11", "amc-pacific-place-11", "AMC Pacific Place 11"),
        ("amc pacific place 11", "amc-pacific-place-11", "AMC Pacific Place 11"),
        ("  AMC Pacific Place 11  ", "amc-pacific-place-11", "AMC Pacific Place 11"),
        ("The Beacon", "the-beacon", "The Beacon"),
        ("Beacon", "the-beacon", "The Beacon"),
        ("SIFF Cinema Uptown", "siff-cinema-uptown", "SIFF Cinema Uptown"),
        ("siff cinema uptown", "siff-cinema-uptown", "SIFF Cinema Uptown"),
        ("Northwest Film Forum", "northwest-film-forum", "Northwest Film Forum"),
        ("NWFF", "northwest-film-forum", "Northwest Film Forum"),
    ],
)
def test_resolve_theater_exact_and_alias(theater_index, raw_name, expected_id, expected_name):
    result = resolve_theater(raw_name, theater_index)
    assert result == TheaterResolution(theater_id=expected_id, name=expected_name)


@pytest.mark.parametrize(
    "raw_name",
    [
        None,
        "",
        "Unknown Cinema",
        "AMC Corvallis 12",
        "Central Library",
    ],
)
def test_resolve_theater_unresolved(theater_index, raw_name):
    assert resolve_theater(raw_name, theater_index) is None


def test_resolve_theater_disabled_still_resolves(theater_index):
    """enabled affects scraping allowlists, not name resolution."""
    result = resolve_theater("AMC Kitsap 8", theater_index)
    assert result is not None
    assert result.theater_id == "amc-kitsap-8"


def test_list_enabled_theater_ids(theaters_registry):
    enabled = list_enabled_theater_ids(theaters_registry)
    assert "amc-pacific-place-11" in enabled
    assert "the-beacon" in enabled
    assert "amc-kitsap-8" not in enabled
    assert "amc-lakewood-mall-12" not in enabled


def test_list_enabled_theater_ids_amc_only(theaters_registry):
    amc_enabled = list_enabled_theater_ids(theaters_registry, source="amc")
    assert "amc-pacific-place-11" in amc_enabled
    assert "the-beacon" not in amc_enabled
    assert len(amc_enabled) == 7


def test_build_theater_index_rejects_invalid_registry():
    with pytest.raises(ValueError, match="theaters"):
        build_theater_index({})


def test_build_theater_index_rejects_duplicate_ids():
    registry = {
        "theaters": [
            {"id": "a", "name": "Alpha", "aliases": [], "source": "amc", "enabled": True, "type": "chain"},
            {"id": "a", "name": "Alpha Two", "aliases": [], "source": "amc", "enabled": True, "type": "chain"},
        ]
    }
    with pytest.raises(ValueError, match="duplicate theater id"):
        build_theater_index(registry)


def test_build_theater_index_rejects_duplicate_lookup_keys():
    registry = {
        "theaters": [
            {"id": "a", "name": "Same Name", "aliases": [], "source": "amc", "enabled": True, "type": "chain"},
            {"id": "b", "name": "same name", "aliases": [], "source": "amc", "enabled": True, "type": "chain"},
        ]
    }
    with pytest.raises(ValueError, match="duplicate theater lookup key"):
        build_theater_index(registry)
