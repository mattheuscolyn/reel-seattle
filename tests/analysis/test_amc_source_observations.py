"""Tests for prototype AMC source observation artifacts (offline only)."""

from __future__ import annotations

import copy
import importlib.util
import json
import os
from pathlib import Path

import pytest

from reel_seattle.analysis.amc_source_observations import (
    PRODUCT_SCHEMA_PATH,
    RELEASE_SCHEMA_PATH,
    SourceObservationConflictError,
    SourceObservationError,
    SourceObservationValidationError,
    _release_stats,
    build_source_observations,
    validate_product_artifact,
    validate_release_artifact,
    validate_source_observation_pair,
    write_source_observations,
)
from reel_seattle.validate import SchemaValidationError, validate_against_schema

FIXTURES = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "analysis"
    / "amc_source_observations"
)
INPUT_AUDIT = FIXTURES / "input_audit.json"
REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATED_AT = "2026-07-14T22:00:00-07:00"


@pytest.fixture
def audit_payload() -> dict:
    return json.loads(INPUT_AUDIT.read_text(encoding="utf-8"))


@pytest.fixture
def built(audit_payload: dict) -> tuple[dict, dict]:
    return build_source_observations(
        audit_payload,
        input_path="tests/fixtures/analysis/amc_source_observations/input_audit.json",
        generated_at=GENERATED_AT,
    )


def test_one_product_per_movie_id_and_duplicate_rows_deduped(built):
    products, _releases = built
    ids = [p["source_film_id"] for p in products["products"]]
    assert ids == ["72474", "76238", "83808", "83988", "83989"]
    assert products["stats"]["products"] == 5


def test_product_metadata_remains_separate(built):
    products, _ = built
    by_id = {p["source_film_id"]: p for p in products["products"]}
    assert by_id["76238"]["source_title"] == "The Odyssey"
    assert by_id["83988"]["source_title"] == "The Odyssey : Sensory Friendly Screening"
    assert by_id["76238"]["media"]["poster_url"] != by_id["83988"]["media"]["poster_url"]
    assert by_id["76238"]["attribute_codes"] != by_id["83988"]["attribute_codes"]
    assert by_id["83988"]["presentation"]["category"] == "sensory_friendly"
    assert by_id["83988"]["presentation"]["is_special_presentation"] is True
    assert by_id["76238"]["presentation"]["is_special_presentation"] is False


def test_missing_release_id_valid_product_no_release(built):
    products, releases = built
    lego = next(p for p in products["products"] if p["source_film_id"] == "83808")
    assert lego["source_release_id"] is None
    assert products["stats"]["without_release_id"] == 1
    assert "83808" not in {
        member
        for release in releases["releases"]
        for member in release["member_source_film_ids"]
    }


def test_shared_release_keeps_distinct_members(built):
    _products, releases = built
    odyssey = next(r for r in releases["releases"] if r["source_release_id"] == "377232")
    assert odyssey["member_count"] == 2
    assert odyssey["member_source_film_ids"] == ["76238", "83988"]
    assert odyssey["relationship_status"] == "grouping_evidence_only"
    assert odyssey["relationship_observations"]["title_variation"] is True
    assert odyssey["relationship_observations"]["runtime_variation"] is False
    assert odyssey["relationship_observations"]["release_date_variation"] is True
    assert odyssey["relationship_observations"]["media_variation"] is True
    assert odyssey["relationship_observations"]["attribute_variation"] is True


def test_moana_products_have_separate_release_groups(built):
    products, releases = built
    by_id = {p["source_film_id"]: p for p in products["products"]}
    assert by_id["72474"]["source_release_id"] == "348229"
    assert by_id["83989"]["source_release_id"] == "419382"
    release_ids = {r["source_release_id"] for r in releases["releases"]}
    assert {"348229", "419382"} <= release_ids
    moana_std = next(r for r in releases["releases"] if r["source_release_id"] == "348229")
    moana_sensory = next(r for r in releases["releases"] if r["source_release_id"] == "419382")
    assert moana_std["member_count"] == 1
    assert moana_sensory["member_count"] == 1


def test_shared_release_does_not_copy_fields(built):
    products, _ = built
    by_id = {p["source_film_id"]: p for p in products["products"]}
    assert by_id["76238"]["runtime_min"] == by_id["83988"]["runtime_min"] == 172
    assert by_id["76238"]["source_title"] != by_id["83988"]["source_title"]
    assert by_id["76238"]["synopsis"] != by_id["83988"]["synopsis"]


def test_deterministic_ordering(built):
    products, releases = built
    assert [p["source_film_id"] for p in products["products"]] == [
        "72474",
        "76238",
        "83808",
        "83988",
        "83989",
    ]
    assert [r["source_release_id"] for r in releases["releases"]] == [
        "348229",
        "377232",
        "419382",
    ]


def test_category_unknown_supported(audit_payload):
    audit_payload["rows"] = [
        {
            "amc_movie_id": "1",
            "source_title": "Mystery",
            "amc_movie_name": "Mystery",
            "wwm_release_number": "9",
            "wwm_status": "valid",
            "product_category": "unknown",
            "run_time": 90,
            "attribute_codes": [],
        }
    ]
    products, _ = build_source_observations(
        audit_payload, input_path="inline", generated_at=GENERATED_AT
    )
    assert products["products"][0]["presentation"]["category"] == "unknown"


def test_conflicting_duplicate_products_surfaced(audit_payload):
    payload = copy.deepcopy(audit_payload)
    payload["rows"].append({**payload["rows"][0], "run_time": 999})
    with pytest.raises(SourceObservationConflictError, match="76238"):
        build_source_observations(payload, input_path="inline", generated_at=GENERATED_AT)


def test_malformed_audit_fails(audit_payload):
    with pytest.raises(SourceObservationError, match="rows"):
        build_source_observations({"generated_at": "x"}, input_path="inline")
    broken = copy.deepcopy(audit_payload)
    broken["rows"][0]["amc_movie_id"] = ""
    with pytest.raises(SourceObservationError, match="amc_movie_id"):
        build_source_observations(broken, input_path="inline")


def test_stats_and_referential_integrity(built):
    products, releases = built
    validate_source_observation_pair(products, releases)
    assert products["stats"] == {
        "products": 5,
        "with_release_id": 4,
        "without_release_id": 1,
        "special_presentations": 2,
    }
    assert releases["stats"]["release_observations"] == 3
    assert releases["stats"]["singleton_groups"] == 2
    assert releases["stats"]["multi_product_groups"] == 1
    assert releases["stats"]["largest_group"] == 2


def test_schemas_accept_valid_and_reject_invalid(built):
    products, releases = built
    validate_against_schema(products, PRODUCT_SCHEMA_PATH)
    validate_against_schema(releases, RELEASE_SCHEMA_PATH)

    bad_products = copy.deepcopy(products)
    bad_products["products"][0]["presentation"]["category"] = "not-a-category"
    with pytest.raises(SchemaValidationError):
        validate_against_schema(bad_products, PRODUCT_SCHEMA_PATH)

    bad_releases = copy.deepcopy(releases)
    del bad_releases["releases"][0]["member_source_film_ids"]
    with pytest.raises(SchemaValidationError):
        validate_against_schema(bad_releases, RELEASE_SCHEMA_PATH)


def test_validator_catches_duplicates_unresolved_and_stats(built):
    products, releases = built

    dup = copy.deepcopy(products)
    dup["products"].append(copy.deepcopy(dup["products"][0]))
    with pytest.raises(SourceObservationValidationError, match="duplicate product"):
        validate_product_artifact(dup)

    unresolved = copy.deepcopy(releases)
    unresolved["releases"][0]["member_source_film_ids"].append("99999")
    unresolved["releases"][0]["member_count"] = len(
        unresolved["releases"][0]["member_source_film_ids"]
    )
    unresolved["stats"] = _release_stats(unresolved["releases"])
    with pytest.raises(SourceObservationValidationError, match="unresolved"):
        validate_release_artifact(unresolved, products_artifact=products)

    bad_stats = copy.deepcopy(products)
    bad_stats["stats"]["products"] = 999
    with pytest.raises(SourceObservationValidationError, match="stats mismatch"):
        validate_product_artifact(bad_stats)


def test_no_network_or_secret_required(built, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    assert "AMC_API_KEY" not in os.environ
    products, releases = built
    assert products["artifact_status"] == "prototype"
    assert releases["artifact_status"] == "prototype"


def test_cli_build_and_validate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("AMC_API_KEY", raising=False)

    def load(name: str, path: Path):
        spec = importlib.util.spec_from_file_location(name, path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    build_cli = load("build_obs_cli", REPO_ROOT / "scripts" / "build_amc_source_observations.py")
    validate_cli = load(
        "validate_obs_cli", REPO_ROOT / "scripts" / "validate_amc_source_observations.py"
    )
    out = tmp_path / "out"
    assert (
        build_cli.main(
            [
                "--input",
                str(INPUT_AUDIT),
                "--output-dir",
                str(out),
                "--generated-at",
                GENERATED_AT,
            ]
        )
        == 0
    )
    assert (out / "amc_movie_products.json").is_file()
    assert (out / "amc_release_observations.json").is_file()
    assert (
        validate_cli.main(
            [
                "--products",
                str(out / "amc_movie_products.json"),
                "--releases",
                str(out / "amc_release_observations.json"),
            ]
        )
        == 0
    )


def test_write_outputs(built, tmp_path: Path):
    products, releases = built
    paths = write_source_observations(products, releases, tmp_path)
    text = paths["products"].read_text(encoding="utf-8")
    assert '"artifact_status": "prototype"' in text
    assert products["input"]["type"] == "sanitized_audit"
