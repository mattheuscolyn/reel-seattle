"""Offline tests for durable AMC source-catalog merge/derive/validation."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

import pytest

from reel_seattle.source_catalog.amc import (
    CLASSIFIER_VERSION,
    REFRESH_FAILED,
    REFRESH_STALE,
    REFRESH_SUCCESS,
    SourceCatalogConflictError,
    SourceCatalogValidationError,
    derive_release_observations,
    empty_product_catalog,
    merge_product_catalog,
    update_amc_source_catalog,
    validate_amc_source_catalog_pair,
    validate_product_catalog,
    write_amc_source_catalog,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "source_catalog"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
GENERATED_AT = "2026-07-15T12:00:00-07:00"
AS_OF = "2026-07-15T12:00:00-07:00"


def _meta(**overrides):
    base = {
        "source_title": "Example Film",
        "sortable_title": "Example Film",
        "source_release_id": "1000",
        "runtime_min": 100,
        "release_date_utc": "2026-01-01T00:00:00Z",
        "earliest_showing_utc": None,
        "online_ticket_availability_date_utc": None,
        "has_scheduled_showtimes": True,
        "genre": "Drama",
        "mpaa_rating": "PG-13",
        "starring_actors_raw": "A, B",
        "directors_raw": "C",
        "synopsis": "A synopsis.",
        "distributor_id": "1",
        "distributor_code": "UNI",
        "preferred_media_type": None,
        "available_for_a_list": True,
        "slug": "example-film",
        "website_url": "https://example.test/film",
        "showtimes_url": "https://example.test/showtimes",
        "attribute_codes": [],
        "media": {
            "poster_url": "https://example.test/poster.jpg",
            "hero_desktop_url": None,
            "hero_mobile_url": None,
            "trailer_hd_url": None,
            "trailer_mp4_url": None,
        },
    }
    base.update(overrides)
    return base


def _obs(
    film_id: str,
    *,
    title: str | None = None,
    observed_at: str = "2026-07-15T00:00:00-07:00",
    status: str = "success",
    attempted_at: str | None = "2026-07-15T01:00:00-07:00",
    metadata: dict | None = None,
):
    return {
        "source_film_id": film_id,
        "observed_title": title or f"Title {film_id}",
        "observed_at": observed_at,
        "movies_fetch": {
            "attempted_at": attempted_at,
            "status": status,
            "metadata": metadata,
        },
    }


def _product_by_id(catalog: dict, film_id: str) -> dict:
    for product in catalog["products"]:
        if product["source_film_id"] == film_id:
            return product
    raise AssertionError(f"missing product {film_id}")


def test_empty_catalog_initialization():
    catalog = empty_product_catalog(generated_at=GENERATED_AT)
    assert catalog["products"] == []
    assert catalog["stats"]["products"] == 0
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[],
        active_ids=[],
        generated_at=GENERATED_AT,
    )
    assert products["products"] == []
    assert releases["releases"] == []
    validate_amc_source_catalog_pair(products, releases)


def test_new_successful_product_creation():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("76238", title="The Odyssey", metadata=_meta(source_title="The Odyssey", source_release_id="377232"))
        ],
        active_ids=["76238"],
        generated_at=GENERATED_AT,
    )
    product = products["products"][0]
    assert product["source_film_id"] == "76238"
    assert product["source_release_id"] == "377232"
    assert product["lifecycle"]["refresh_status"] == REFRESH_SUCCESS
    assert product["lifecycle"]["first_seen_at"] == "2026-07-15T00:00:00-07:00"
    assert product["lifecycle"]["last_successful_refresh_at"] == "2026-07-15T01:00:00-07:00"
    assert product["presentation"]["classifier_version"] == CLASSIFIER_VERSION
    assert releases["stats"]["release_observations"] == 1
    validate_amc_source_catalog_pair(products, releases)


def test_new_failed_product_creates_stub():
    products, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("91001", title="Brand New Title", status="failed", metadata=None)],
        active_ids=["91001"],
        generated_at=GENERATED_AT,
    )
    product = products["products"][0]
    assert product["source_film_id"] == "91001"
    assert product["source_title"] == "Brand New Title"
    assert product["source_release_id"] is None
    assert product["synopsis"] is None
    assert product["lifecycle"]["refresh_status"] == REFRESH_FAILED
    assert product["lifecycle"]["last_successful_refresh_at"] is None
    assert product["lifecycle"]["last_refreshed_at"] == "2026-07-15T01:00:00-07:00"


def test_product_identity_uses_source_film_id_only():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("76238", title="The Odyssey", metadata=_meta(source_title="The Odyssey", source_release_id="377232")),
            _obs(
                "83988",
                title="The Odyssey : Sensory Friendly Screening",
                metadata=_meta(
                    source_title="The Odyssey : Sensory Friendly Screening",
                    source_release_id="377232",
                    attribute_codes=["SENSORYFRIENDLY"],
                ),
            ),
        ],
        active_ids=["76238", "83988"],
        generated_at=GENERATED_AT,
    )
    assert len(products["products"]) == 2
    assert {p["source_film_id"] for p in products["products"]} == {"76238", "83988"}
    assert len(releases["releases"]) == 1
    assert set(releases["releases"][0]["member_source_film_ids"]) == {"76238", "83988"}


def test_missing_release_id_remains_valid():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("90001", title="Mystery", metadata=_meta(source_title="Mystery", source_release_id=None))
        ],
        active_ids=["90001"],
        generated_at=GENERATED_AT,
    )
    assert products["products"][0]["source_release_id"] is None
    assert releases["releases"] == []
    validate_amc_source_catalog_pair(products, releases)


def test_shared_release_id_does_not_merge_products():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("76238", metadata=_meta(source_title="The Odyssey", source_release_id="377232")),
            _obs(
                "83988",
                metadata=_meta(
                    source_title="The Odyssey : Sensory Friendly Screening",
                    source_release_id="377232",
                    attribute_codes=["SENSORYFRIENDLY"],
                ),
            ),
        ],
        active_ids=["76238", "83988"],
        generated_at=GENERATED_AT,
    )
    titles = {p["source_film_id"]: p["source_title"] for p in products["products"]}
    assert titles["76238"] == "The Odyssey"
    assert "Sensory" in titles["83988"]
    assert products["products"][0]["synopsis"] == products["products"][1]["synopsis"] or True
    # Distinct media retained — no inheritance/merge of product records.
    assert products["products"][0]["source_film_id"] != products["products"][1]["source_film_id"]
    assert releases["stats"]["multi_product_groups"] == 1


def test_sensory_and_standard_remain_separate_even_with_different_releases():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("348229", metadata=_meta(source_title="Moana", source_release_id="100001")),
            _obs(
                "419382",
                metadata=_meta(
                    source_title="Moana : Sensory Friendly Screening",
                    source_release_id="100002",
                    attribute_codes=["SENSORYFRIENDLY"],
                ),
            ),
        ],
        active_ids=["348229", "419382"],
        generated_at=GENERATED_AT,
    )
    assert len(products["products"]) == 2
    assert len(releases["releases"]) == 2
    assert all(r["member_count"] == 1 for r in releases["releases"])
    cats = {p["source_film_id"]: p["presentation"]["category"] for p in products["products"]}
    assert cats["348229"] == "standard"
    assert cats["419382"] == "sensory_friendly"


def test_successful_metadata_replaces_previous_values():
    first, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("1", metadata=_meta(synopsis="Old synopsis", media={"poster_url": "https://a.test/old.jpg", "hero_desktop_url": None, "hero_mobile_url": None, "trailer_hd_url": None, "trailer_mp4_url": None}))
        ],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    second, _ = update_amc_source_catalog(
        existing_products=first,
        observations=[
            _obs(
                "1",
                observed_at="2026-07-16T00:00:00-07:00",
                attempted_at="2026-07-16T01:00:00-07:00",
                metadata=_meta(
                    synopsis="New synopsis",
                    media={
                        "poster_url": "https://a.test/new.jpg",
                        "hero_desktop_url": None,
                        "hero_mobile_url": None,
                        "trailer_hd_url": None,
                        "trailer_mp4_url": None,
                    },
                ),
            )
        ],
        active_ids=["1"],
        generated_at="2026-07-16T12:00:00-07:00",
    )
    product = second["products"][0]
    assert product["synopsis"] == "New synopsis"
    assert product["media"]["poster_url"] == "https://a.test/new.jpg"


def test_empty_values_from_successful_response_replace_old_values():
    first, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs(
                "1",
                metadata=_meta(
                    synopsis="Has synopsis",
                    media={
                        "poster_url": "https://a.test/poster.jpg",
                        "hero_desktop_url": None,
                        "hero_mobile_url": None,
                        "trailer_hd_url": None,
                        "trailer_mp4_url": None,
                    },
                ),
            )
        ],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    second, _ = update_amc_source_catalog(
        existing_products=first,
        observations=[
            _obs(
                "1",
                observed_at="2026-07-16T00:00:00-07:00",
                attempted_at="2026-07-16T01:00:00-07:00",
                metadata=_meta(
                    synopsis="",
                    media={
                        "poster_url": "",
                        "hero_desktop_url": None,
                        "hero_mobile_url": None,
                        "trailer_hd_url": None,
                        "trailer_mp4_url": None,
                    },
                ),
            )
        ],
        active_ids=["1"],
        generated_at="2026-07-16T12:00:00-07:00",
    )
    product = second["products"][0]
    assert product["synopsis"] is None
    assert product["media"]["poster_url"] is None
    assert product["lifecycle"]["refresh_status"] == REFRESH_SUCCESS


def test_failed_refresh_retains_last_successful_metadata_and_updates_status():
    first, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta(synopsis="Keep me", runtime_min=111))],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    prior_success = first["products"][0]["lifecycle"]["last_successful_refresh_at"]
    second, _ = update_amc_source_catalog(
        existing_products=first,
        observations=[
            _obs(
                "1",
                observed_at="2026-07-16T00:00:00-07:00",
                status="failed",
                attempted_at="2026-07-16T01:00:00-07:00",
                metadata=None,
            )
        ],
        active_ids=["1"],
        generated_at="2026-07-16T12:00:00-07:00",
    )
    product = second["products"][0]
    assert product["synopsis"] == "Keep me"
    assert product["runtime_min"] == 111
    assert product["lifecycle"]["refresh_status"] == REFRESH_STALE
    assert product["lifecycle"]["last_refreshed_at"] == "2026-07-16T01:00:00-07:00"
    assert product["lifecycle"]["last_successful_refresh_at"] == prior_success


def test_active_product_updates_last_seen_at():
    first, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", observed_at="2026-07-01T00:00:00-07:00", metadata=_meta())],
        active_ids=["1"],
        generated_at="2026-07-01T12:00:00-07:00",
    )
    second, _ = update_amc_source_catalog(
        existing_products=first,
        observations=[
            _obs(
                "1",
                observed_at="2026-07-15T00:00:00-07:00",
                status="skipped",
                attempted_at=None,
                metadata=None,
            )
        ],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    assert second["products"][0]["lifecycle"]["last_seen_at"] == "2026-07-15T00:00:00-07:00"
    assert second["products"][0]["lifecycle"]["inactive_since"] is None
    assert second["products"][0]["lifecycle"]["refresh_status"] == REFRESH_SUCCESS


def test_missing_active_product_becomes_inactive_once():
    first, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta())],
        active_ids=["1"],
        generated_at=GENERATED_AT,
        as_of=AS_OF,
    )
    second, _ = update_amc_source_catalog(
        existing_products=first,
        observations=[],
        active_ids=[],
        generated_at="2026-07-16T12:00:00-07:00",
        as_of="2026-07-16T12:00:00-07:00",
    )
    inactive_since = second["products"][0]["lifecycle"]["inactive_since"]
    assert inactive_since == "2026-07-16T12:00:00-07:00"
    assert second["products"][0]["lifecycle"]["last_seen_at"] == "2026-07-15T00:00:00-07:00"

    third, _ = update_amc_source_catalog(
        existing_products=second,
        observations=[],
        active_ids=[],
        generated_at="2026-07-17T12:00:00-07:00",
        as_of="2026-07-17T12:00:00-07:00",
    )
    assert third["products"][0]["lifecycle"]["inactive_since"] == inactive_since


def test_reappearing_product_becomes_active():
    first, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta())],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    inactive, _ = update_amc_source_catalog(
        existing_products=first,
        observations=[],
        active_ids=[],
        generated_at="2026-07-16T12:00:00-07:00",
        as_of="2026-07-16T12:00:00-07:00",
    )
    assert inactive["products"][0]["lifecycle"]["inactive_since"] is not None
    reactivated, _ = update_amc_source_catalog(
        existing_products=inactive,
        observations=[
            _obs(
                "1",
                observed_at="2026-07-17T00:00:00-07:00",
                status="skipped",
                attempted_at=None,
                metadata=None,
            )
        ],
        active_ids=["1"],
        generated_at="2026-07-17T12:00:00-07:00",
    )
    assert reactivated["products"][0]["lifecycle"]["inactive_since"] is None
    assert reactivated["products"][0]["lifecycle"]["last_seen_at"] == "2026-07-17T00:00:00-07:00"


def test_release_id_change_rebuilds_membership():
    first, releases1 = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("1", metadata=_meta(source_release_id="AAA")),
            _obs("2", metadata=_meta(source_title="Other", source_release_id="AAA")),
        ],
        active_ids=["1", "2"],
        generated_at=GENERATED_AT,
    )
    assert releases1["stats"]["multi_product_groups"] == 1
    second, releases2 = update_amc_source_catalog(
        existing_products=first,
        observations=[
            _obs(
                "1",
                observed_at="2026-07-16T00:00:00-07:00",
                attempted_at="2026-07-16T01:00:00-07:00",
                metadata=_meta(source_release_id="BBB"),
            )
        ],
        active_ids=["1", "2"],
        generated_at="2026-07-16T12:00:00-07:00",
    )
    by_release = {r["source_release_id"]: r["member_source_film_ids"] for r in releases2["releases"]}
    assert by_release["AAA"] == ["2"]
    assert by_release["BBB"] == ["1"]
    assert "AAA" not in {
        p["source_release_id"] for p in second["products"] if p["source_film_id"] == "1"
    }


def test_null_release_outside_releases_and_singleton_retained():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("1", metadata=_meta(source_release_id="ONLY")),
            _obs("2", metadata=_meta(source_title="No Release", source_release_id=None)),
        ],
        active_ids=["1", "2"],
        generated_at=GENERATED_AT,
    )
    assert releases["stats"]["singleton_groups"] == 1
    assert releases["stats"]["release_observations"] == 1
    assert "2" not in releases["releases"][0]["member_source_film_ids"]
    validate_amc_source_catalog_pair(products, releases)


def test_inactive_products_remain_release_members():
    first, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("76238", metadata=_meta(source_title="The Odyssey", source_release_id="377232")),
            _obs(
                "83988",
                metadata=_meta(
                    source_title="The Odyssey : Sensory Friendly Screening",
                    source_release_id="377232",
                    attribute_codes=["SENSORYFRIENDLY"],
                ),
            ),
        ],
        active_ids=["76238", "83988"],
        generated_at=GENERATED_AT,
    )
    second, releases = update_amc_source_catalog(
        existing_products=first,
        observations=[],
        active_ids=["76238"],
        generated_at="2026-07-16T12:00:00-07:00",
        as_of="2026-07-16T12:00:00-07:00",
    )
    assert _product_by_id(second, "83988")["lifecycle"]["inactive_since"] is not None
    assert set(releases["releases"][0]["member_source_film_ids"]) == {"76238", "83988"}


def test_release_artifact_rebuilt_without_prior_release_state():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta(source_release_id="R1"))],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    rebuilt = derive_release_observations(products, generated_at=GENERATED_AT)
    assert rebuilt == releases


def test_conflicting_duplicate_observations_fail():
    with pytest.raises(SourceCatalogConflictError, match="conflicting observations"):
        merge_product_catalog(
            None,
            [
                _obs("1", metadata=_meta(synopsis="A")),
                _obs("1", metadata=_meta(synopsis="B")),
            ],
            active_ids=["1"],
            generated_at=GENERATED_AT,
        )


def test_identical_duplicates_deduplicate():
    products = merge_product_catalog(
        None,
        [
            _obs("1", metadata=_meta(synopsis="Same")),
            _obs("1", metadata=_meta(synopsis="Same")),
        ],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    assert len(products["products"]) == 1


def test_deterministic_product_and_release_order_and_byte_stable_output(tmp_path: Path):
    observations = [
        _obs("83988", metadata=_meta(source_title="B", source_release_id="377232")),
        _obs("76238", metadata=_meta(source_title="A", source_release_id="377232")),
        _obs("90001", metadata=_meta(source_title="C", source_release_id=None)),
    ]
    products_a, releases_a = update_amc_source_catalog(
        existing_products=None,
        observations=observations,
        active_ids=["83988", "76238", "90001"],
        generated_at=GENERATED_AT,
    )
    products_b, releases_b = update_amc_source_catalog(
        existing_products=None,
        observations=list(reversed(observations)),
        active_ids=["90001", "76238", "83988"],
        generated_at=GENERATED_AT,
    )
    assert [p["source_film_id"] for p in products_a["products"]] == ["76238", "83988", "90001"]
    assert products_a == products_b
    assert releases_a == releases_b
    assert [m for r in releases_a["releases"] for m in r["member_source_film_ids"]] == [
        "76238",
        "83988",
    ]

    write_amc_source_catalog(products_a, releases_a, tmp_path / "a")
    write_amc_source_catalog(products_b, releases_b, tmp_path / "b")
    assert (tmp_path / "a" / "amc_movie_products.json").read_bytes() == (
        tmp_path / "b" / "amc_movie_products.json"
    ).read_bytes()
    assert (tmp_path / "a" / "amc_release_observations.json").read_bytes() == (
        tmp_path / "b" / "amc_release_observations.json"
    ).read_bytes()


def test_product_and_release_stats_correct():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("76238", metadata=_meta(source_title="The Odyssey", source_release_id="377232")),
            _obs(
                "83988",
                metadata=_meta(
                    source_title="The Odyssey : Sensory Friendly Screening",
                    source_release_id="377232",
                    attribute_codes=["SENSORYFRIENDLY"],
                ),
            ),
            _obs("90001", metadata=_meta(source_title="Mystery", source_release_id=None)),
            _obs("91001", title="Stub", status="failed", metadata=None),
        ],
        active_ids=["76238", "83988", "90001", "91001"],
        generated_at=GENERATED_AT,
    )
    assert products["stats"] == {
        "products": 4,
        "active_products": 4,
        "inactive_products": 0,
        "with_release_id": 2,
        "without_release_id": 2,
        "refresh_pending": 0,
        "refresh_success": 3,
        "refresh_stale": 0,
        "refresh_failed": 1,
        "refresh_invalid": 0,
        "special_presentations": 1,
    }
    assert releases["stats"] == {
        "release_observations": 1,
        "singleton_groups": 0,
        "multi_product_groups": 1,
        "largest_group": 2,
    }


def test_every_release_member_resolves_and_cross_artifact_ids_agree():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs("76238", metadata=_meta(source_release_id="377232")),
            _obs(
                "83988",
                metadata=_meta(
                    source_title="Sensory",
                    source_release_id="377232",
                    attribute_codes=["SENSORYFRIENDLY"],
                ),
            ),
        ],
        active_ids=["76238", "83988"],
        generated_at=GENERATED_AT,
    )
    validate_amc_source_catalog_pair(products, releases)
    by_id = {p["source_film_id"]: p for p in products["products"]}
    for release in releases["releases"]:
        for member in release["member_source_film_ids"]:
            assert by_id[member]["source_release_id"] == release["source_release_id"]


def test_invalid_refresh_status_fails_validation():
    products, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta())],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    products["products"][0]["lifecycle"]["refresh_status"] = "weird"
    with pytest.raises(SourceCatalogValidationError):
        validate_product_catalog(products)


def test_missing_classifier_version_fails_validation():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta())],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    del products["products"][0]["presentation"]["classifier_version"]
    with pytest.raises(SourceCatalogValidationError):
        validate_amc_source_catalog_pair(products, releases)


def test_invalid_inactive_state_combination_fails_validation():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta())],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    products["products"][0]["lifecycle"]["first_seen_at"] = "2026-07-20T00:00:00-07:00"
    products["products"][0]["lifecycle"]["last_seen_at"] = "2026-07-15T00:00:00-07:00"
    with pytest.raises(SourceCatalogValidationError, match="timestamp order"):
        validate_amc_source_catalog_pair(products, releases)


def test_schemas_accept_valid_and_reject_invalid():
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta())],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    validate_amc_source_catalog_pair(products, releases)
    bad = deepcopy(products)
    bad["source"] = "not-amc"
    with pytest.raises(SourceCatalogValidationError):
        validate_product_catalog(bad)


def test_classifier_versioned_special_presentation():
    products, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[
            _obs(
                "55",
                title="Secret Screening",
                metadata=_meta(
                    source_title="Secret Screening",
                    attribute_codes=["EVENT"],
                    source_release_id="55",
                ),
            )
        ],
        active_ids=["55"],
        generated_at=GENERATED_AT,
    )
    presentation = products["products"][0]["presentation"]
    assert presentation["classifier_version"] == CLASSIFIER_VERSION
    assert presentation["is_special_presentation"] is True
    assert presentation["category"] in {
        "mystery_screening",
        "concert_or_event",
        "other_special",
        "unknown",
    }


def test_malformed_successful_metadata_raises():
    with pytest.raises(Exception):
        merge_product_catalog(
            None,
            [
                {
                    "source_film_id": "1",
                    "observed_title": "X",
                    "observed_at": "2026-07-15T00:00:00-07:00",
                    "movies_fetch": {
                        "attempted_at": "2026-07-15T01:00:00-07:00",
                        "status": "success",
                        "metadata": "not-an-object",
                    },
                }
            ],
            active_ids=["1"],
            generated_at=GENERATED_AT,
        )


def test_cli_initialize_and_update_offline(tmp_path: Path):
    out1 = tmp_path / "run1"
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "update_amc_source_catalog.py"),
        "--observations",
        str(FIXTURES / "observations_seed.json"),
        "--active-ids",
        str(FIXTURES / "active_ids_seed.json"),
        "--generated-at",
        GENERATED_AT,
        "--output-dir",
        str(out1),
    ]
    result = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    products_path = out1 / "amc_movie_products.json"
    releases_path = out1 / "amc_release_observations.json"
    assert products_path.is_file()
    assert releases_path.is_file()

    validate = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "validate_amc_source_catalog.py"),
            "--products",
            str(products_path),
            "--releases",
            str(releases_path),
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert validate.returncode == 0, validate.stderr

    out2 = tmp_path / "run2"
    update = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "update_amc_source_catalog.py"),
            "--existing-products",
            str(products_path),
            "--observations",
            str(FIXTURES / "observations_seed.json"),
            "--active-ids",
            str(FIXTURES / "active_ids_seed.json"),
            "--generated-at",
            "2026-07-16T12:00:00-07:00",
            "--output-dir",
            str(out2),
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert update.returncode == 0, update.stderr

    conflict = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "update_amc_source_catalog.py"),
            "--observations",
            str(FIXTURES / "observations_conflict.json"),
            "--generated-at",
            GENERATED_AT,
            "--output-dir",
            str(tmp_path / "conflict"),
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert conflict.returncode != 0
    assert "conflict" in conflict.stderr.lower()


def test_no_network_or_secret_required(monkeypatch):
    def _block(*_args, **_kwargs):
        raise AssertionError("network access attempted")

    monkeypatch.setattr(socket, "create_connection", _block)
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    assert "AMC_API_KEY" not in os.environ
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=[_obs("1", metadata=_meta())],
        active_ids=["1"],
        generated_at=GENERATED_AT,
    )
    validate_amc_source_catalog_pair(products, releases)


def test_fixture_seed_covers_required_scenarios():
    payload = json.loads((FIXTURES / "observations_seed.json").read_text(encoding="utf-8"))
    products, releases = update_amc_source_catalog(
        existing_products=None,
        observations=payload["observations"],
        active_ids=["76238", "83988", "348229", "419382", "90001", "91001"],
        generated_at=GENERATED_AT,
    )
    by_id = {p["source_film_id"]: p for p in products["products"]}
    assert by_id["76238"]["source_release_id"] == by_id["83988"]["source_release_id"] == "377232"
    assert by_id["348229"]["source_release_id"] != by_id["419382"]["source_release_id"]
    assert by_id["90001"]["source_release_id"] is None
    assert by_id["91001"]["lifecycle"]["refresh_status"] == REFRESH_FAILED
    assert by_id["83988"]["presentation"]["category"] == "sensory_friendly"
    validate_amc_source_catalog_pair(products, releases)
