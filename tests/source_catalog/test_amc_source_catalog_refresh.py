"""Tests for the offline-capable AMC source-catalog refresh stage."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from reel_seattle.source_catalog.amc import (
    CLASSIFIER_VERSION,
    REFRESH_STALE,
    REFRESH_SUCCESS,
    update_amc_source_catalog,
    validate_amc_source_catalog_pair,
)
from reel_seattle.source_catalog.amc_refresh import (
    FAILURE_HTTP,
    FAILURE_ID_MISMATCH,
    FAILURE_INVALID_SHAPE,
    POLICY_ALL_ACTIVE,
    POLICY_NEW_ONLY,
    POLICY_STALE,
    RefreshStageError,
    build_fetch_movie,
    count_product_errors,
    discover_active_products,
    load_existing_products,
    normalize_movies_metadata,
    observation_from_lookup,
    observations_for_merge,
    refresh_and_optional_update,
    run_amc_catalog_refresh,
    select_refresh_targets,
)
from reel_seattle.analysis.amc_movies_client import MovieIdPlan

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "source_catalog"
RESPONSES = FIXTURES / "movie_responses"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
GENERATED_AT = "2026-07-15T12:00:00-07:00"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_discover_from_scrape_log():
    discovery = discover_active_products(str(FIXTURES / "discovery_scrape_log.json"))
    assert discovery.source_kind == "scrape-log"
    assert discovery.raw_records == 11
    assert discovery.active_ids == [
        "76238",
        "83988",
        "90001",
        "91001",
        "92001",
        "93001",
        "348229",
        "419382",
    ]
    by_id = {p.source_film_id: p for p in discovery.products}
    assert by_id["76238"].observed_title == "The Odyssey"
    assert by_id["76238"].occurrence_count == 2
    assert by_id["83988"].observed_title.startswith("The Odyssey")


def test_discover_far_future_only_product_from_scrape_log():
    discovery = discover_active_products(
        str(FIXTURES / "discovery_far_future_scrape_log.json")
    )
    assert discovery.source_kind == "scrape-log"
    assert discovery.active_ids == ["99001"]
    assert discovery.products[0].observed_title == "Anniversary Screening"


def test_showtimes_current_discovery_does_not_include_far_future_only_id():
    discovery = discover_active_products(str(FIXTURES / "discovery_showtimes.json"))
    assert "99001" not in discovery.active_ids


def test_discover_from_showtimes_fallback_ignores_non_amc_and_blanks():
    discovery = discover_active_products(str(FIXTURES / "discovery_showtimes.json"))
    assert discovery.source_kind == "showtimes-current"
    assert discovery.active_ids == ["76238", "83988", "90001"]
    assert "ignore-me" not in discovery.active_ids
    assert discovery.products[0].observed_title == "The Odyssey"


def test_discover_fails_when_no_ids():
    with pytest.raises(RefreshStageError, match="no usable AMC"):
        discover_active_products(str(FIXTURES / "discovery_empty.json"))


def test_auto_mode_prefers_scrape_log(tmp_path: Path):
    logs = tmp_path / "data" / "daily_logs"
    logs.mkdir(parents=True)
    (logs / "2026-07-15_amc.json").write_text(
        (FIXTURES / "discovery_scrape_log.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    showtimes = tmp_path / "public" / "data"
    showtimes.mkdir(parents=True)
    (showtimes / "showtimes_current.json").write_text(
        (FIXTURES / "discovery_showtimes.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    discovery = discover_active_products("auto", repo_root=tmp_path)
    assert discovery.source_kind == "scrape-log"
    assert "348229" in discovery.active_ids


def test_auto_mode_falls_back_to_showtimes(tmp_path: Path):
    showtimes = tmp_path / "public" / "data"
    showtimes.mkdir(parents=True)
    (showtimes / "showtimes_current.json").write_text(
        (FIXTURES / "discovery_showtimes.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    discovery = discover_active_products("auto", repo_root=tmp_path)
    assert discovery.source_kind == "showtimes-current"
    assert discovery.active_ids == ["76238", "83988", "90001"]


def test_selection_policies(tmp_path: Path):
    discovery = discover_active_products(str(FIXTURES / "discovery_scrape_log.json"))
    # Seed catalog with Odyssey only, successful and fresh.
    products, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[
            {
                "source_film_id": "76238",
                "observed_title": "The Odyssey",
                "observed_at": "2026-07-15T00:00:00-07:00",
                "movies_fetch": {
                    "attempted_at": GENERATED_AT,
                    "status": "success",
                    "metadata": {
                        "source_title": "The Odyssey",
                        "source_release_id": "377232",
                        "runtime_min": 172,
                        "synopsis": "An epic journey home.",
                        "attribute_codes": [],
                        "media": {
                            "poster_url": "https://example.test/odyssey-poster.jpg",
                            "hero_desktop_url": None,
                            "hero_mobile_url": None,
                            "trailer_hd_url": None,
                            "trailer_mp4_url": None,
                        },
                    },
                },
            }
        ],
        active_ids=["76238"],
        generated_at=GENERATED_AT,
    )
    # Add a never-successful stub.
    products2, _ = update_amc_source_catalog(
        existing_products=products,
        observations=[
            {
                "source_film_id": "91001",
                "observed_title": "Missing Fixture Film",
                "observed_at": "2026-07-15T00:00:00-07:00",
                "movies_fetch": {
                    "attempted_at": GENERATED_AT,
                    "status": "failed",
                    "metadata": None,
                },
            }
        ],
        active_ids=["76238", "91001"],
        generated_at=GENERATED_AT,
    )

    all_active = select_refresh_targets(
        discovery, products2, policy=POLICY_ALL_ACTIVE
    )
    assert list(all_active.selected_ids) == discovery.active_ids
    assert all_active.skipped_ids == ()

    new_only = select_refresh_targets(discovery, products2, policy=POLICY_NEW_ONLY)
    assert "76238" not in new_only.selected_ids
    assert "76238" in new_only.skipped_ids
    assert "83988" in new_only.selected_ids
    assert "91001" not in new_only.selected_ids  # known stub

    stale = select_refresh_targets(
        discovery,
        products2,
        policy=POLICY_STALE,
        stale_after_hours=24,
        as_of="2026-07-15T12:00:00-07:00",
    )
    assert "83988" in stale.selected_ids  # new
    assert "91001" in stale.selected_ids  # no successful refresh
    assert "76238" in stale.skipped_ids  # fresh success

    stale_old = select_refresh_targets(
        discovery,
        products2,
        policy=POLICY_STALE,
        stale_after_hours=1,
        as_of="2026-07-16T14:00:00-07:00",
    )
    assert "76238" in stale_old.selected_ids

    assert list(stale.selected_ids) == sorted(
        stale.selected_ids, key=lambda x: (0, int(x)) if x.isdigit() else (1, x)
    )


def test_normalize_metadata_release_media_empty_and_classifier():
    body = _load(RESPONSES / "83988.json")
    meta = normalize_movies_metadata(body)
    assert meta["source_release_id"] == "377232"
    assert meta["runtime_min"] == 172
    assert meta["attribute_codes"] == ["EVENT", "SENSORYFRIENDLY"]
    assert meta["media"]["poster_url"].endswith("odyssey-sensory-poster.jpg")
    assert "attributes" not in meta
    assert "posterDynamic" not in meta
    assert meta["presentation"]["category"] == "sensory_friendly"
    assert meta["presentation"]["classifier_version"] == CLASSIFIER_VERSION
    assert meta["presentation"]["is_special_presentation"] is True

    empty = normalize_movies_metadata(_load(RESPONSES / "90001.json"))
    assert empty["source_release_id"] is None
    assert empty["synopsis"] is None
    assert empty["media"]["poster_url"] is None


def test_observation_success_failure_invalid_mismatch():
    plan = MovieIdPlan(amc_movie_id="76238", source_title="The Odyssey", occurrence_count=1)
    ok = observation_from_lookup(
        plan,
        http_status=200,
        body=_load(RESPONSES / "76238.json"),
        error=None,
        observed_at="2026-07-15T00:00:00-07:00",
        attempted_at=GENERATED_AT,
    )
    assert ok["movies_fetch"]["status"] == "success"
    assert ok["movies_fetch"]["metadata"]["source_release_id"] == "377232"

    missing = observation_from_lookup(
        MovieIdPlan("91001", "Missing", 1),
        http_status=404,
        body=None,
        error="HTTP 404",
        observed_at="2026-07-15T00:00:00-07:00",
        attempted_at=GENERATED_AT,
    )
    assert missing["movies_fetch"]["status"] == "failed"
    assert missing["movies_fetch"]["failure_category"] == FAILURE_HTTP
    assert missing["movies_fetch"]["metadata"] is None

    invalid = observation_from_lookup(
        MovieIdPlan("92001", "Invalid", 1),
        http_status=200,
        body=None,
        error="response is not a JSON object",
        observed_at="2026-07-15T00:00:00-07:00",
        attempted_at=GENERATED_AT,
    )
    assert invalid["movies_fetch"]["status"] == "invalid"
    assert invalid["movies_fetch"]["failure_category"] == FAILURE_INVALID_SHAPE

    mismatch = observation_from_lookup(
        MovieIdPlan("93001", "Mismatch", 1),
        http_status=200,
        body=_load(RESPONSES / "93001.json"),
        error=None,
        observed_at="2026-07-15T00:00:00-07:00",
        attempted_at=GENERATED_AT,
    )
    assert mismatch["movies_fetch"]["status"] == "invalid"
    assert mismatch["movies_fetch"]["failure_category"] == FAILURE_ID_MISMATCH
    assert mismatch["movies_fetch"]["metadata"] is None


def test_fixture_refresh_isolates_failures_and_accepts_merge(tmp_path: Path):
    monkey_env = os.environ.copy()
    monkey_env.pop("AMC_API_KEY", None)

    result = refresh_and_optional_update(
        discovery_source=str(FIXTURES / "discovery_scrape_log.json"),
        existing_products_path=None,
        policy=POLICY_ALL_ACTIVE,
        stale_after_hours=None,
        output_dir=tmp_path / "out",
        generated_at=GENERATED_AT,
        fixture_dir=RESPONSES,
        live=False,
        update_catalog=True,
    )
    artifact = result["observations_artifact"]
    blob = json.dumps(artifact)
    assert "AMC_API_KEY" not in blob
    assert "X-AMC-Vendor-Key" not in blob
    assert "Authorization" not in blob

    by_id = {row["source_film_id"]: row for row in artifact["observations"]}
    assert by_id["76238"]["movies_fetch"]["status"] == "success"
    assert by_id["83988"]["movies_fetch"]["status"] == "success"
    assert by_id["91001"]["movies_fetch"]["status"] == "failed"
    assert by_id["92001"]["movies_fetch"]["status"] == "invalid"
    assert by_id["93001"]["movies_fetch"]["status"] == "invalid"
    assert artifact["stats"]["success"] >= 5
    assert artifact["stats"]["failed"] >= 1
    assert artifact["stats"]["invalid"] >= 2

    products = result["products"]
    releases = result["releases"]
    validate_amc_source_catalog_pair(products, releases)
    product_map = {p["source_film_id"]: p for p in products["products"]}
    assert product_map["76238"]["source_release_id"] == product_map["83988"]["source_release_id"]
    assert product_map["76238"]["source_film_id"] != product_map["83988"]["source_film_id"]
    assert product_map["348229"]["source_release_id"] != product_map["419382"]["source_release_id"]
    assert product_map["90001"]["source_release_id"] is None
    assert product_map["91001"]["lifecycle"]["refresh_status"] != REFRESH_SUCCESS
    assert product_map["91001"]["synopsis"] is None
    assert product_map["93001"]["synopsis"] is None  # mismatch must not apply metadata


def test_failed_existing_retains_metadata_after_refresh_merge(tmp_path: Path):
    first = refresh_and_optional_update(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        existing_products_path=None,
        policy=POLICY_ALL_ACTIVE,
        stale_after_hours=None,
        output_dir=tmp_path / "first",
        generated_at=GENERATED_AT,
        fixture_dir=RESPONSES,
        update_catalog=True,
    )
    products_path = first["products_path"]
    # Second run: remove 76238 fixture effect by using a fetch that fails for 76238 only.
    discovery = discover_active_products(str(FIXTURES / "discovery_showtimes.json"))
    existing = load_existing_products(products_path)
    selection = select_refresh_targets(discovery, existing, policy=POLICY_ALL_ACTIVE)

    def fetch_movie(movie_id: str):
        if movie_id == "76238":
            return 500, None, "HTTP 500"
        from reel_seattle.analysis.amc_movies_client import load_offline_fixture_fetch

        return load_offline_fixture_fetch(RESPONSES)(movie_id)

    artifact = run_amc_catalog_refresh(
        discovery=discovery,
        selection=selection,
        fetch_movie=fetch_movie,
        generated_at="2026-07-16T12:00:00-07:00",
        include_skipped_presence=False,
    )
    products, releases = update_amc_source_catalog(
        existing_products=existing,
        observations=observations_for_merge(artifact),
        active_ids=discovery.active_ids,
        generated_at="2026-07-16T12:00:00-07:00",
    )
    product = next(p for p in products["products"] if p["source_film_id"] == "76238")
    assert product["synopsis"] == "An epic journey home."
    assert product["lifecycle"]["refresh_status"] == REFRESH_STALE
    assert product["lifecycle"]["last_successful_refresh_at"] == GENERATED_AT
    validate_amc_source_catalog_pair(products, releases)


def test_successful_empty_fields_replace_prior_values(tmp_path: Path):
    # Initialize 90001 with non-empty synopsis via direct merge, then refresh with empty fixture.
    seeded, _ = update_amc_source_catalog(
        existing_products=None,
        observations=[
            {
                "source_film_id": "90001",
                "observed_title": "Fan Fave Mystery Night",
                "observed_at": "2026-07-14T00:00:00-07:00",
                "movies_fetch": {
                    "attempted_at": "2026-07-14T01:00:00-07:00",
                    "status": "success",
                    "metadata": {
                        "source_title": "Fan Fave Mystery Night",
                        "source_release_id": None,
                        "synopsis": "Old synopsis",
                        "attribute_codes": ["EVENT"],
                        "media": {
                            "poster_url": "https://example.test/old.jpg",
                            "hero_desktop_url": None,
                            "hero_mobile_url": None,
                            "trailer_hd_url": None,
                            "trailer_mp4_url": None,
                        },
                    },
                },
            }
        ],
        active_ids=["90001"],
        generated_at="2026-07-14T12:00:00-07:00",
    )
    path = tmp_path / "seeded.json"
    path.write_text(json.dumps(seeded), encoding="utf-8")

    # Narrow discovery to 90001 only.
    discovery_path = tmp_path / "discovery.json"
    discovery_path.write_text(
        json.dumps(
            {
                "source": "amc",
                "generated_at": "2026-07-15T00:00:00-07:00",
                "records": [
                    {
                        "title_raw": "Fan Fave Mystery Night",
                        "attributes": {"movie_id": "90001"},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    result = refresh_and_optional_update(
        discovery_source=str(discovery_path),
        existing_products_path=path,
        policy=POLICY_ALL_ACTIVE,
        stale_after_hours=None,
        output_dir=tmp_path / "out",
        generated_at=GENERATED_AT,
        fixture_dir=RESPONSES,
        update_catalog=True,
    )
    product = result["products"]["products"][0]
    assert product["synopsis"] is None
    assert product["media"]["poster_url"] is None


def test_byte_stable_outputs(tmp_path: Path):
    a = refresh_and_optional_update(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        existing_products_path=None,
        policy=POLICY_ALL_ACTIVE,
        stale_after_hours=None,
        output_dir=tmp_path / "a",
        generated_at=GENERATED_AT,
        fixture_dir=RESPONSES,
        update_catalog=True,
    )
    b = refresh_and_optional_update(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        existing_products_path=None,
        policy=POLICY_ALL_ACTIVE,
        stale_after_hours=None,
        output_dir=tmp_path / "b",
        generated_at=GENERATED_AT,
        fixture_dir=RESPONSES,
        update_catalog=True,
    )
    assert Path(a["observations_path"]).read_bytes() == Path(b["observations_path"]).read_bytes()
    assert Path(a["products_path"]).read_bytes() == Path(b["products_path"]).read_bytes()


def test_malformed_existing_catalog_fails(tmp_path: Path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"schema_version": "1.0.0", "products": []}), encoding="utf-8")
    with pytest.raises(RefreshStageError, match="failed validation"):
        load_existing_products(bad)


def test_missing_secret_fails_before_live_requests(monkeypatch):
    monkeypatch.delenv("AMC_API_KEY", raising=False)

    def _block(*_a, **_k):
        raise AssertionError("network accessed")

    monkeypatch.setattr(socket, "create_connection", _block)
    with pytest.raises(RefreshStageError, match="AMC_API_KEY"):
        build_fetch_movie(live=True)


def test_fixture_mode_never_reads_secret(monkeypatch):
    monkeypatch.setenv("AMC_API_KEY", "should-not-be-read")
    calls = {"read": 0}
    real_getenv = os.environ.get

    def tracked_get(key, default=None):
        if key == "AMC_API_KEY":
            calls["read"] += 1
        return real_getenv(key, default)

    monkeypatch.setattr(os.environ, "get", tracked_get)
    fetch = build_fetch_movie(fixture_dir=RESPONSES, live=False)
    status, body, error = fetch("76238")
    assert status == 200
    assert body is not None
    assert calls["read"] == 0


def test_cli_refresh_only_and_update_and_strict(tmp_path: Path):
    out = tmp_path / "cli"
    cmd = [
        sys.executable,
        str(PROJECT_ROOT / "scripts" / "refresh_amc_source_catalog.py"),
        "--discovery-source",
        str(FIXTURES / "discovery_scrape_log.json"),
        "--fixture-responses",
        str(RESPONSES),
        "--policy",
        "all-active",
        "--generated-at",
        GENERATED_AT,
        "--output-dir",
        str(out),
    ]
    result = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    obs_path = out / "amc_source_catalog_observations.json"
    assert obs_path.is_file()
    assert not (out / "amc_movie_products.json").exists()

    out2 = tmp_path / "cli-build"
    build = subprocess.run(
        cmd[:-1] + [str(out2), "--update-catalog"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    # Fix: cmd ends with out path; rebuild properly
    build = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "refresh_amc_source_catalog.py"),
            "--discovery-source",
            str(FIXTURES / "discovery_scrape_log.json"),
            "--fixture-responses",
            str(RESPONSES),
            "--policy",
            "all-active",
            "--generated-at",
            GENERATED_AT,
            "--output-dir",
            str(out2),
            "--update-catalog",
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert build.returncode == 0, build.stderr
    assert (out2 / "amc_movie_products.json").is_file()
    assert (out2 / "amc_release_observations.json").is_file()

    validate = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "validate_amc_source_catalog.py"),
            "--products",
            str(out2 / "amc_movie_products.json"),
            "--releases",
            str(out2 / "amc_release_observations.json"),
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert validate.returncode == 0, validate.stderr

    strict = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "refresh_amc_source_catalog.py"),
            "--discovery-source",
            str(FIXTURES / "discovery_scrape_log.json"),
            "--fixture-responses",
            str(RESPONSES),
            "--policy",
            "all-active",
            "--generated-at",
            GENERATED_AT,
            "--output-dir",
            str(tmp_path / "strict"),
            "--fail-on-product-errors",
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert strict.returncode != 0
    assert "product-level" in strict.stderr.lower()

    structural = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "refresh_amc_source_catalog.py"),
            "--discovery-source",
            str(FIXTURES / "discovery_empty.json"),
            "--fixture-responses",
            str(RESPONSES),
            "--generated-at",
            GENERATED_AT,
            "--output-dir",
            str(tmp_path / "empty"),
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert structural.returncode != 0


def test_no_network_during_offline_refresh(monkeypatch, tmp_path: Path):
    def _block(*_a, **_k):
        raise AssertionError("network access attempted")

    monkeypatch.setattr(socket, "create_connection", _block)
    monkeypatch.delenv("AMC_API_KEY", raising=False)
    refresh_and_optional_update(
        discovery_source=str(FIXTURES / "discovery_showtimes.json"),
        existing_products_path=None,
        policy=POLICY_ALL_ACTIVE,
        stale_after_hours=None,
        output_dir=tmp_path / "offline",
        generated_at=GENERATED_AT,
        fixture_dir=RESPONSES,
        update_catalog=True,
    )


def test_count_product_errors():
    artifact = {
        "observations": [
            {"movies_fetch": {"status": "success"}},
            {"movies_fetch": {"status": "failed"}},
            {"movies_fetch": {"status": "invalid"}},
            {"movies_fetch": {"status": "skipped"}},
        ]
    }
    assert count_product_errors(artifact) == 2
