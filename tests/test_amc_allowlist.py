"""Tests for AMC registry allowlist filtering."""

from __future__ import annotations

import pytest

from reel_seattle.amc_allowlist import (
    AmcAllowlistIndex,
    build_amc_allowlist_index,
    classify_amc_api_theater,
    filter_enabled_amc_theaters,
    is_enabled_amc_theater,
)


def _api_theater(*, api_id: str, long_name: str) -> dict:
    return {
        "id": api_id,
        "longName": long_name,
        "location": {"latitude": 47.6, "longitude": -122.3},
    }


@pytest.fixture
def registry() -> dict:
    return {
        "schema_version": "1.0.0",
        "updated_at": "2026-06-26",
        "theaters": [
            {
                "id": "amc-pacific-place-11",
                "name": "AMC Pacific Place 11",
                "aliases": [],
                "source": "amc",
                "source_external_id": "601",
                "enabled": True,
                "type": "chain",
            },
            {
                "id": "amc-oak-tree-6",
                "name": "AMC Oak Tree 6",
                "aliases": ["AMC Oak Tree Cinema 6"],
                "source": "amc",
                "source_external_id": None,
                "enabled": True,
                "type": "chain",
            },
            {
                "id": "amc-kitsap-8",
                "name": "AMC Kitsap 8",
                "aliases": [],
                "source": "amc",
                "source_external_id": None,
                "enabled": False,
                "type": "chain",
            },
            {
                "id": "amc-lakewood-mall-12",
                "name": "AMC Lakewood Mall 12",
                "aliases": [],
                "source": "amc",
                "source_external_id": None,
                "enabled": False,
                "type": "chain",
            },
        ],
    }


def test_enabled_amc_theater_is_included(registry):
    allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="999", long_name="AMC Oak Tree 6")],
        registry,
    )
    assert allowed == {"999": "AMC Oak Tree 6"}
    assert stats.included == 1


def test_disabled_amc_theater_is_excluded(registry):
    allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="700", long_name="AMC Kitsap 8")],
        registry,
    )
    assert allowed == {}
    assert stats.disabled == 1


def test_out_of_scope_amc_theater_is_excluded(registry):
    allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="701", long_name="AMC River Park Square 20")],
        registry,
    )
    assert allowed == {}
    assert stats.unknown == 1


def test_matching_by_normalized_name(registry):
    allowed, _stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="702", long_name="  amc oak tree 6  ")],
        registry,
    )
    assert allowed == {"702": "AMC Oak Tree 6"}


def test_matching_by_alias(registry):
    allowed, _stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="703", long_name="AMC Oak Tree Cinema 6")],
        registry,
    )
    assert allowed == {"703": "AMC Oak Tree 6"}


def test_source_external_id_takes_precedence_over_name(registry):
    allowed, _stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="601", long_name="Wrong Name Theater")],
        registry,
    )
    assert allowed == {"601": "AMC Pacific Place 11"}


def test_unknown_amc_theater_is_skipped_safely(registry):
    assert not is_enabled_amc_theater(
        _api_theater(api_id="888", long_name="AMC Mystery 99"),
        registry,
    )
    status, entry = classify_amc_api_theater(
        _api_theater(api_id="888", long_name="AMC Mystery 99"),
        build_amc_allowlist_index(registry),
    )
    assert status == "unknown"
    assert entry is None


def test_unknown_theater_identity_is_captured(registry):
    _allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="701", long_name="AMC River Park Square 20")],
        registry,
    )
    assert stats.unknown == 1
    assert stats.unknown_theaters == [
        {"name": "AMC River Park Square 20", "id": "701"}
    ]
    assert stats.disabled_theaters == []


def test_disabled_theater_identity_includes_registry_id(registry):
    _allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="700", long_name="AMC Kitsap 8")],
        registry,
    )
    assert stats.disabled == 1
    assert stats.disabled_theaters == [
        {"name": "AMC Kitsap 8", "id": "700", "registry_id": "amc-kitsap-8"}
    ]
    assert stats.unknown_theaters == []


def test_disabled_match_by_external_id(registry):
    disabled_registry = {
        **registry,
        "theaters": [
            *registry["theaters"],
            {
                "id": "amc-disabled-by-id",
                "name": "AMC Disabled By Id",
                "aliases": [],
                "source": "amc",
                "source_external_id": "900",
                "enabled": False,
                "type": "chain",
            },
        ],
    }
    allowed, stats = filter_enabled_amc_theaters(
        [_api_theater(api_id="900", long_name="Any Name")],
        disabled_registry,
    )
    assert allowed == {}
    assert stats.disabled == 1
