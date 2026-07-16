"""Durable AMC source-catalog merge, derive, and validation (offline only).

Does not call the AMC API. Future workflow adapters produce observation inputs;
this module merges them into durable product/release JSON artifacts.
"""

from __future__ import annotations

import json
from collections import defaultdict
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.analysis.amc_source_observations import is_special_presentation_category
from reel_seattle.analysis.amc_wwm_release_audit import (
    PRODUCT_CATEGORIES,
    classify_product_category,
)
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.validate import SchemaValidationError, validate_against_schema

SCHEMA_VERSION = "1.0.0"
CLASSIFIER_VERSION = "1.0.0"
SOURCE = "amc"
RELATIONSHIP_STATUS = "grouping_evidence_only"
DEFAULT_PRODUCTS_PATH = "data/source_catalog/amc_movie_products.json"
DEFAULT_RELEASES_PATH = "data/source_catalog/amc_release_observations.json"

PRODUCT_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "schema"
    / "source_catalog"
    / "amc_movie_products"
    / "v1.0.0.json"
)
RELEASE_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "schema"
    / "source_catalog"
    / "amc_release_observations"
    / "v1.0.0.json"
)

REFRESH_PENDING = "pending"
REFRESH_SUCCESS = "success"
REFRESH_STALE = "stale"
REFRESH_FAILED = "failed"
REFRESH_INVALID = "invalid"
REFRESH_STATUSES = frozenset(
    {
        REFRESH_PENDING,
        REFRESH_SUCCESS,
        REFRESH_STALE,
        REFRESH_FAILED,
        REFRESH_INVALID,
    }
)

MOVIES_FETCH_SUCCESS = "success"
MOVIES_FETCH_FAILED = "failed"
MOVIES_FETCH_INVALID = "invalid"
MOVIES_FETCH_PENDING = "pending"
MOVIES_FETCH_SKIPPED = "skipped"

ALLOWED_CATEGORIES = frozenset(PRODUCT_CATEGORIES)
DERIVED_PRODUCT_FIELDS = (
    "presentation.category",
    "presentation.is_special_presentation",
)

OBSERVATION_COMPARE_KEYS = (
    "observed_title",
    "movies_fetch.status",
    "movies_fetch.attempted_at",
    "movies_fetch.metadata",
)


class SourceCatalogError(ValueError):
    """Raised when catalog inputs cannot be merged or derived."""


class SourceCatalogConflictError(SourceCatalogError):
    """Raised when duplicate observations disagree within one merge run."""


class SourceCatalogValidationError(SourceCatalogError):
    """Raised when durable catalog artifacts fail validation."""


def _id_sort_key(value: str) -> tuple[int, int | str]:
    text = str(value)
    if text.isdigit():
        return (0, int(text))
    return (1, text)


def _sorted_unique_strings(values: Sequence[object | None]) -> list[str]:
    return sorted({str(v) for v in values if v not in (None, "")})


def _sorted_unique_ints(values: Sequence[object | None]) -> list[int]:
    ints: set[int] = set()
    for value in values:
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, int):
            ints.add(value)
    return sorted(ints)


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)


def _optional_str(value: object | None) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: object | None) -> int | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _optional_bool(value: object | None) -> bool | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    return None


def _empty_media() -> dict[str, None]:
    return {
        "poster_url": None,
        "hero_desktop_url": None,
        "hero_mobile_url": None,
        "trailer_hd_url": None,
        "trailer_mp4_url": None,
    }


def _dig(mapping: Mapping[str, Any], dotted: str) -> Any:
    current: Any = mapping
    for part in dotted.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def empty_product_catalog(*, generated_at: str) -> dict[str, Any]:
    """Return an empty durable product catalog envelope."""
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "source": SOURCE,
        "stats": _product_stats([]),
        "products": [],
    }


def _product_stats(products: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    active = sum(1 for p in products if p.get("lifecycle", {}).get("inactive_since") is None)
    with_release = sum(1 for p in products if p.get("source_release_id") not in (None, ""))
    special = sum(
        1
        for p in products
        if (p.get("presentation") or {}).get("is_special_presentation") is True
    )
    status_counts = {status: 0 for status in sorted(REFRESH_STATUSES)}
    for product in products:
        status = str((product.get("lifecycle") or {}).get("refresh_status") or "")
        if status in status_counts:
            status_counts[status] += 1
    return {
        "products": len(products),
        "active_products": active,
        "inactive_products": len(products) - active,
        "with_release_id": with_release,
        "without_release_id": len(products) - with_release,
        "refresh_pending": status_counts[REFRESH_PENDING],
        "refresh_success": status_counts[REFRESH_SUCCESS],
        "refresh_stale": status_counts[REFRESH_STALE],
        "refresh_failed": status_counts[REFRESH_FAILED],
        "refresh_invalid": status_counts[REFRESH_INVALID],
        "special_presentations": special,
    }


def _release_stats(releases: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    sizes = [int(item.get("member_count") or 0) for item in releases]
    return {
        "release_observations": len(releases),
        "singleton_groups": sum(1 for size in sizes if size == 1),
        "multi_product_groups": sum(1 for size in sizes if size > 1),
        "largest_group": max(sizes) if sizes else 0,
    }


def _normalize_metadata(metadata: Mapping[str, Any] | None) -> dict[str, Any]:
    """Normalize allowlisted Movies metadata fields from an offline observation."""
    meta = metadata or {}
    attribute_codes = meta.get("attribute_codes")
    if not isinstance(attribute_codes, list):
        attribute_codes = []
    codes = [str(code).strip() for code in attribute_codes if str(code).strip()]

    media_in = meta.get("media") if isinstance(meta.get("media"), Mapping) else {}
    return {
        "source_title": _optional_str(
            meta.get("source_title") or meta.get("name") or meta.get("amc_movie_name")
        ),
        "sortable_title": _optional_str(meta.get("sortable_title") or meta.get("sortableName")),
        "source_release_id": _optional_str(
            meta.get("source_release_id") or meta.get("wwm_release_number")
        ),
        "runtime_min": _optional_int(meta.get("runtime_min") or meta.get("run_time") or meta.get("runTime")),
        "release_date_utc": _optional_str(meta.get("release_date_utc") or meta.get("releaseDateUtc")),
        "earliest_showing_utc": _optional_str(
            meta.get("earliest_showing_utc") or meta.get("earliestShowingUtc")
        ),
        "online_ticket_availability_date_utc": _optional_str(
            meta.get("online_ticket_availability_date_utc")
            or meta.get("onlineTicketAvailabilityDateUtc")
        ),
        "has_scheduled_showtimes": _optional_bool(
            meta.get("has_scheduled_showtimes")
            if "has_scheduled_showtimes" in meta
            else meta.get("hasScheduledShowtimes")
        ),
        "genre": _optional_str(meta.get("genre")),
        "mpaa_rating": _optional_str(meta.get("mpaa_rating") or meta.get("mpaaRating")),
        "starring_actors_raw": _optional_str(
            meta.get("starring_actors_raw") or meta.get("starring_actors") or meta.get("starringActors")
        ),
        "directors_raw": _optional_str(
            meta.get("directors_raw") or meta.get("directors")
        ),
        "synopsis": _optional_str(meta.get("synopsis")),
        "distributor_id": _optional_str(
            meta.get("distributor_id") or meta.get("distributorId")
        ),
        "distributor_code": _optional_str(
            meta.get("distributor_code") or meta.get("distributorCode")
        ),
        "preferred_media_type": _optional_str(
            meta.get("preferred_media_type") or meta.get("preferredMediaType")
        ),
        "available_for_a_list": _optional_bool(
            meta.get("available_for_a_list")
            if "available_for_a_list" in meta
            else meta.get("availableForAList")
        ),
        "slug": _optional_str(meta.get("slug")),
        "website_url": _optional_str(meta.get("website_url") or meta.get("websiteUrl")),
        "showtimes_url": _optional_str(meta.get("showtimes_url") or meta.get("showtimesUrl")),
        "attribute_codes": codes,
        "media": {
            "poster_url": _optional_str(
                media_in.get("poster_url") or meta.get("poster_dynamic") or meta.get("posterDynamic")
            ),
            "hero_desktop_url": _optional_str(
                media_in.get("hero_desktop_url")
                or meta.get("hero_desktop_dynamic")
                or meta.get("heroDesktopDynamic")
            ),
            "hero_mobile_url": _optional_str(
                media_in.get("hero_mobile_url")
                or meta.get("hero_mobile_dynamic")
                or meta.get("heroMobileDynamic")
            ),
            "trailer_hd_url": _optional_str(
                media_in.get("trailer_hd_url") or meta.get("trailer_hd") or meta.get("trailerHd")
            ),
            "trailer_mp4_url": _optional_str(
                media_in.get("trailer_mp4_url") or meta.get("trailer_mp4") or meta.get("trailerMp4")
            ),
        },
    }


def _classify_presentation(
    *,
    source_title: str | None,
    attribute_codes: Sequence[str],
    preferred_media_type: str | None,
) -> dict[str, Any]:
    category = classify_product_category(
        name=source_title,
        source_title=source_title,
        attribute_codes=list(attribute_codes),
        attribute_names=[],
        preferred_media_type=preferred_media_type,
    )
    if category not in ALLOWED_CATEGORIES:
        category = "unknown"
    return {
        "category": category,
        "is_special_presentation": is_special_presentation_category(category),
        "classifier_version": CLASSIFIER_VERSION,
    }


def _apply_metadata_fields(product: dict[str, Any], normalized: Mapping[str, Any]) -> None:
    for key, value in normalized.items():
        product[key] = deepcopy(value) if key == "media" else value
    product["presentation"] = _classify_presentation(
        source_title=product.get("source_title"),
        attribute_codes=product.get("attribute_codes") or [],
        preferred_media_type=product.get("preferred_media_type"),
    )


def _new_stub_product(
    *,
    source_film_id: str,
    observed_title: str | None,
    observed_at: str,
    refresh_status: str,
    last_refreshed_at: str | None,
    last_successful_refresh_at: str | None,
    last_input_kind: str,
) -> dict[str, Any]:
    return {
        "source": SOURCE,
        "source_film_id": source_film_id,
        "source_release_id": None,
        "source_title": observed_title,
        "sortable_title": None,
        "runtime_min": None,
        "release_date_utc": None,
        "earliest_showing_utc": None,
        "online_ticket_availability_date_utc": None,
        "has_scheduled_showtimes": None,
        "genre": None,
        "mpaa_rating": None,
        "starring_actors_raw": None,
        "directors_raw": None,
        "synopsis": None,
        "distributor_id": None,
        "distributor_code": None,
        "preferred_media_type": None,
        "available_for_a_list": None,
        "slug": None,
        "website_url": None,
        "showtimes_url": None,
        "attribute_codes": [],
        "media": _empty_media(),
        "presentation": _classify_presentation(
            source_title=observed_title,
            attribute_codes=[],
            preferred_media_type=None,
        ),
        "lifecycle": {
            "first_seen_at": observed_at,
            "last_seen_at": observed_at,
            "last_refreshed_at": last_refreshed_at,
            "last_successful_refresh_at": last_successful_refresh_at,
            "inactive_since": None,
            "refresh_status": refresh_status,
        },
        "provenance": {
            "metadata_source": "amc_movies_api",
            "observation_source": "amc_showtimes",
            "last_input_kind": last_input_kind,
            "derived_fields": list(DERIVED_PRODUCT_FIELDS),
        },
    }


def _normalize_observation(raw: Mapping[str, Any]) -> dict[str, Any]:
    film_id = _optional_str(raw.get("source_film_id"))
    if not film_id:
        raise SourceCatalogError("observation missing source_film_id")
    observed_at = _optional_str(raw.get("observed_at"))
    if not observed_at:
        raise SourceCatalogError(f"observation for {film_id!r} missing observed_at")

    movies_fetch = raw.get("movies_fetch")
    if movies_fetch is None:
        movies_fetch = {"status": MOVIES_FETCH_SKIPPED, "attempted_at": None, "metadata": None}
    if not isinstance(movies_fetch, Mapping):
        raise SourceCatalogError(f"observation for {film_id!r} has invalid movies_fetch")

    status = _optional_str(movies_fetch.get("status")) or MOVIES_FETCH_SKIPPED
    if status not in {
        MOVIES_FETCH_SUCCESS,
        MOVIES_FETCH_FAILED,
        MOVIES_FETCH_INVALID,
        MOVIES_FETCH_PENDING,
        MOVIES_FETCH_SKIPPED,
    }:
        raise SourceCatalogError(
            f"observation for {film_id!r} has unsupported movies_fetch.status={status!r}"
        )

    metadata = movies_fetch.get("metadata")
    if metadata is not None and not isinstance(metadata, Mapping):
        raise SourceCatalogError(f"observation for {film_id!r} has invalid movies_fetch.metadata")

    return {
        "source_film_id": film_id,
        "observed_title": _optional_str(raw.get("observed_title")),
        "observed_at": observed_at,
        "movies_fetch": {
            "status": status,
            "attempted_at": _optional_str(movies_fetch.get("attempted_at")),
            "metadata": dict(metadata) if isinstance(metadata, Mapping) else None,
        },
    }


def _observations_conflict(left: Mapping[str, Any], right: Mapping[str, Any]) -> list[str]:
    conflicts: list[str] = []
    for key in OBSERVATION_COMPARE_KEYS:
        if _stable_json(_dig(left, key)) != _stable_json(_dig(right, key)):
            conflicts.append(key)
    if left.get("observed_at") != right.get("observed_at"):
        # Allow identical metadata with different seen times by taking later seen below.
        pass
    return conflicts


def _dedupe_observations(
    observations: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for raw in observations:
        observation = _normalize_observation(raw)
        film_id = observation["source_film_id"]
        existing = by_id.get(film_id)
        if existing is None:
            by_id[film_id] = observation
            continue
        conflicts = _observations_conflict(existing, observation)
        if conflicts:
            raise SourceCatalogConflictError(
                f"conflicting observations for source_film_id={film_id!r}: "
                + ", ".join(conflicts)
            )
        # Identical metadata: keep the later observed_at lexicographically if ISO-like.
        if observation["observed_at"] > existing["observed_at"]:
            by_id[film_id] = observation
    return [by_id[key] for key in sorted(by_id.keys(), key=_id_sort_key)]


def _refresh_status_for_fetch(status: str) -> str:
    if status == MOVIES_FETCH_SUCCESS:
        return REFRESH_SUCCESS
    if status == MOVIES_FETCH_INVALID:
        return REFRESH_INVALID
    if status == MOVIES_FETCH_PENDING:
        return REFRESH_PENDING
    if status == MOVIES_FETCH_SKIPPED:
        return REFRESH_PENDING
    return REFRESH_FAILED


def _merge_one_observation(product: dict[str, Any] | None, observation: Mapping[str, Any]) -> dict[str, Any]:
    film_id = observation["source_film_id"]
    observed_at = observation["observed_at"]
    fetch = observation["movies_fetch"]
    fetch_status = fetch["status"]
    attempted_at = fetch.get("attempted_at")
    metadata = fetch.get("metadata")

    if product is None:
        if fetch_status == MOVIES_FETCH_SUCCESS:
            if not isinstance(metadata, Mapping):
                raise SourceCatalogError(
                    f"successful observation for {film_id!r} missing metadata object"
                )
            normalized = _normalize_metadata(metadata)
            if normalized.get("source_title") is None and observation.get("observed_title"):
                normalized["source_title"] = observation["observed_title"]
            product = _new_stub_product(
                source_film_id=film_id,
                observed_title=observation.get("observed_title") or normalized.get("source_title"),
                observed_at=observed_at,
                refresh_status=REFRESH_SUCCESS,
                last_refreshed_at=attempted_at or observed_at,
                last_successful_refresh_at=attempted_at or observed_at,
                last_input_kind="sanitized_movies_observation",
            )
            _apply_metadata_fields(product, normalized)
            return product

        refresh_status = _refresh_status_for_fetch(fetch_status)
        return _new_stub_product(
            source_film_id=film_id,
            observed_title=observation.get("observed_title"),
            observed_at=observed_at,
            refresh_status=refresh_status,
            last_refreshed_at=attempted_at,
            last_successful_refresh_at=None,
            last_input_kind="sanitized_movies_observation",
        )

    updated = deepcopy(product)
    lifecycle = updated["lifecycle"]
    lifecycle["last_seen_at"] = observed_at
    lifecycle["inactive_since"] = None

    if fetch_status == MOVIES_FETCH_SUCCESS:
        if not isinstance(metadata, Mapping):
            raise SourceCatalogError(
                f"successful observation for {film_id!r} missing metadata object"
            )
        normalized = _normalize_metadata(metadata)
        if normalized.get("source_title") is None and observation.get("observed_title"):
            normalized["source_title"] = observation["observed_title"]
        _apply_metadata_fields(updated, normalized)
        lifecycle["last_refreshed_at"] = attempted_at or observed_at
        lifecycle["last_successful_refresh_at"] = attempted_at or observed_at
        lifecycle["refresh_status"] = REFRESH_SUCCESS
        updated["provenance"]["last_input_kind"] = "sanitized_movies_observation"
        return updated

    # Failed / invalid / pending / skipped refresh: retain prior successful metadata.
    if attempted_at is not None:
        lifecycle["last_refreshed_at"] = attempted_at
    if fetch_status == MOVIES_FETCH_SKIPPED and lifecycle.get("refresh_status") == REFRESH_SUCCESS:
        # Presence-only observation without a fetch attempt: keep success.
        pass
    elif fetch_status == MOVIES_FETCH_SKIPPED:
        if lifecycle.get("refresh_status") not in REFRESH_STATUSES:
            lifecycle["refresh_status"] = REFRESH_PENDING
    elif fetch_status == MOVIES_FETCH_INVALID:
        lifecycle["refresh_status"] = REFRESH_INVALID
    elif fetch_status == MOVIES_FETCH_PENDING:
        lifecycle["refresh_status"] = REFRESH_PENDING
    else:
        # failed after a prior success becomes stale; otherwise failed.
        if lifecycle.get("last_successful_refresh_at"):
            lifecycle["refresh_status"] = REFRESH_STALE
        else:
            lifecycle["refresh_status"] = REFRESH_FAILED

    if observation.get("observed_title") and updated.get("source_title") is None:
        updated["source_title"] = observation["observed_title"]
        updated["presentation"] = _classify_presentation(
            source_title=updated.get("source_title"),
            attribute_codes=updated.get("attribute_codes") or [],
            preferred_media_type=updated.get("preferred_media_type"),
        )
    updated["provenance"]["last_input_kind"] = "sanitized_movies_observation"
    return updated


def merge_product_catalog(
    existing: Mapping[str, Any] | None,
    observations: Sequence[Mapping[str, Any]],
    *,
    active_ids: Sequence[str] | None,
    generated_at: str,
    as_of: str | None = None,
) -> dict[str, Any]:
    """Merge offline observations into a durable product catalog."""
    stamp = generated_at
    inactive_as_of = as_of or generated_at

    if existing is None:
        by_id: dict[str, dict[str, Any]] = {}
    else:
        if not isinstance(existing, Mapping):
            raise SourceCatalogError("existing catalog must be a JSON object")
        products = existing.get("products")
        if products is None:
            by_id = {}
        elif not isinstance(products, list):
            raise SourceCatalogError("existing catalog products must be an array")
        else:
            by_id = {}
            for product in products:
                if not isinstance(product, Mapping):
                    raise SourceCatalogError("existing product records must be objects")
                film_id = _optional_str(product.get("source_film_id"))
                if not film_id:
                    raise SourceCatalogError("existing product missing source_film_id")
                if film_id in by_id:
                    raise SourceCatalogError(f"duplicate existing product id: {film_id!r}")
                by_id[film_id] = deepcopy(dict(product))

    normalized_observations = _dedupe_observations(observations)
    observed_ids = {item["source_film_id"] for item in normalized_observations}

    for observation in normalized_observations:
        film_id = observation["source_film_id"]
        by_id[film_id] = _merge_one_observation(by_id.get(film_id), observation)

    if active_ids is not None:
        active_set = {str(item).strip() for item in active_ids if str(item).strip()}
        for film_id, product in by_id.items():
            lifecycle = product["lifecycle"]
            if film_id in active_set:
                if film_id not in observed_ids:
                    # Active but no observation this run: keep last_seen, clear inactive.
                    lifecycle["inactive_since"] = None
                else:
                    lifecycle["inactive_since"] = None
            else:
                if lifecycle.get("inactive_since") is None:
                    lifecycle["inactive_since"] = inactive_as_of

    ordered = [by_id[key] for key in sorted(by_id.keys(), key=_id_sort_key)]
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "stats": _product_stats(ordered),
        "products": ordered,
    }


def _has_variation(values: Sequence[Any]) -> bool:
    present = [_stable_json(v) for v in values if v not in (None, "", [])]
    return len(set(present)) > 1


def derive_release_observations(
    products_artifact: Mapping[str, Any],
    *,
    generated_at: str | None = None,
    source_artifact: str = DEFAULT_PRODUCTS_PATH,
) -> dict[str, Any]:
    """Derive release observations from the durable product catalog."""
    if not isinstance(products_artifact, Mapping):
        raise SourceCatalogError("products artifact must be a JSON object")
    products = products_artifact.get("products")
    if not isinstance(products, list):
        raise SourceCatalogError("products artifact missing products array")

    stamp = generated_at or str(products_artifact.get("generated_at") or "")
    if not stamp:
        pacific = ZoneInfo(DEFAULT_TIMEZONE)
        stamp = datetime.now(pacific).isoformat(timespec="seconds")

    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for product in products:
        if not isinstance(product, Mapping):
            continue
        release_id = product.get("source_release_id")
        if release_id in (None, ""):
            continue
        grouped[str(release_id)].append(product)

    releases: list[dict[str, Any]] = []
    for release_id, members in grouped.items():
        ordered = sorted(members, key=lambda item: _id_sort_key(str(item["source_film_id"])))
        member_ids = [str(item["source_film_id"]) for item in ordered]
        first_seen_candidates = [
            str((item.get("lifecycle") or {}).get("first_seen_at") or "")
            for item in ordered
            if (item.get("lifecycle") or {}).get("first_seen_at")
        ]
        first_observed = min(first_seen_candidates) if first_seen_candidates else stamp
        releases.append(
            {
                "source": SOURCE,
                "source_release_id": release_id,
                "member_source_film_ids": member_ids,
                "member_count": len(member_ids),
                "observed_titles": _sorted_unique_strings(
                    [item.get("source_title") for item in ordered]
                ),
                "observed_runtimes_min": _sorted_unique_ints(
                    [item.get("runtime_min") for item in ordered]
                ),
                "observed_release_dates_utc": _sorted_unique_strings(
                    [item.get("release_date_utc") for item in ordered]
                ),
                "observed_distributor_codes": _sorted_unique_strings(
                    [item.get("distributor_code") for item in ordered]
                ),
                "presentation_categories": sorted(
                    {
                        str((item.get("presentation") or {}).get("category") or "unknown")
                        for item in ordered
                    }
                ),
                "relationship_observations": {
                    "title_variation": _has_variation(
                        [item.get("source_title") for item in ordered]
                    ),
                    "runtime_variation": _has_variation(
                        [item.get("runtime_min") for item in ordered]
                    ),
                    "release_date_variation": _has_variation(
                        [item.get("release_date_utc") for item in ordered]
                    ),
                    "media_variation": _has_variation([item.get("media") for item in ordered]),
                    "attribute_variation": _has_variation(
                        [item.get("attribute_codes") for item in ordered]
                    ),
                },
                "relationship_status": RELATIONSHIP_STATUS,
                "lifecycle": {
                    "first_observed_at": first_observed,
                    "last_rebuilt_at": stamp,
                },
            }
        )

    releases.sort(key=lambda item: _id_sort_key(str(item["source_release_id"])))
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "derivation": {
            "source_artifact": source_artifact,
            "source_schema_version": SCHEMA_VERSION,
            "classifier_version": CLASSIFIER_VERSION,
            "rebuilt_at": stamp,
        },
        "stats": _release_stats(releases),
        "releases": releases,
    }


def update_amc_source_catalog(
    *,
    existing_products: Mapping[str, Any] | None,
    observations: Sequence[Mapping[str, Any]],
    active_ids: Sequence[str] | None,
    generated_at: str,
    as_of: str | None = None,
    products_artifact_path: str = DEFAULT_PRODUCTS_PATH,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Merge observations and derive release observations."""
    products = merge_product_catalog(
        existing_products,
        observations,
        active_ids=active_ids,
        generated_at=generated_at,
        as_of=as_of,
    )
    releases = derive_release_observations(
        products,
        generated_at=generated_at,
        source_artifact=products_artifact_path,
    )
    return products, releases


def write_amc_source_catalog(
    products: Mapping[str, Any],
    releases: Mapping[str, Any],
    output_dir: Path | str,
) -> dict[str, Path]:
    """Write durable catalog JSON files to *output_dir*."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    products_path = out / "amc_movie_products.json"
    releases_path = out / "amc_release_observations.json"
    products_path.write_text(
        json.dumps(products, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    releases_path.write_text(
        json.dumps(releases, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return {"products": products_path, "releases": releases_path}


def _validate_timestamp_order(lifecycle: Mapping[str, Any], film_id: str) -> None:
    first_seen = lifecycle.get("first_seen_at")
    last_seen = lifecycle.get("last_seen_at")
    if isinstance(first_seen, str) and isinstance(last_seen, str) and first_seen > last_seen:
        raise SourceCatalogValidationError(
            f"lifecycle timestamp order invalid for {film_id!r}: "
            f"first_seen_at > last_seen_at"
        )
    last_success = lifecycle.get("last_successful_refresh_at")
    last_refreshed = lifecycle.get("last_refreshed_at")
    if (
        isinstance(last_success, str)
        and isinstance(last_refreshed, str)
        and last_success > last_refreshed
    ):
        raise SourceCatalogValidationError(
            f"lifecycle timestamp order invalid for {film_id!r}: "
            f"last_successful_refresh_at > last_refreshed_at"
        )


def validate_product_catalog(artifact: Mapping[str, Any]) -> None:
    """Validate durable product catalog schema + structural invariants."""
    try:
        validate_against_schema(artifact, PRODUCT_SCHEMA_PATH, label="amc_movie_products")
    except SchemaValidationError as exc:
        raise SourceCatalogValidationError(str(exc)) from exc

    products = artifact.get("products") or []
    seen: set[str] = set()
    for product in products:
        film_id = str(product.get("source_film_id"))
        if film_id in seen:
            raise SourceCatalogValidationError(f"duplicate product identity: {film_id!r}")
        seen.add(film_id)

        release_id = product.get("source_release_id")
        if release_id is not None and (not isinstance(release_id, str) or not release_id.strip()):
            raise SourceCatalogValidationError(
                f"invalid source_release_id for {film_id!r}"
            )

        presentation = product.get("presentation") or {}
        if not presentation.get("classifier_version"):
            raise SourceCatalogValidationError(
                f"missing classifier_version for {film_id!r}"
            )
        lifecycle = product.get("lifecycle") or {}
        status = lifecycle.get("refresh_status")
        if status not in REFRESH_STATUSES:
            raise SourceCatalogValidationError(
                f"invalid refresh_status for {film_id!r}: {status!r}"
            )
        inactive_since = lifecycle.get("inactive_since")
        if inactive_since is not None and not isinstance(inactive_since, str):
            raise SourceCatalogValidationError(
                f"invalid inactive_since for {film_id!r}"
            )
        _validate_timestamp_order(lifecycle, film_id)

    expected = _product_stats(products)
    stats = artifact.get("stats") or {}
    if dict(stats) != expected:
        raise SourceCatalogValidationError(
            f"product stats mismatch: got {stats}, expected {expected}"
        )

    ordered_ids = [str(p.get("source_film_id")) for p in products]
    if ordered_ids != sorted(ordered_ids, key=_id_sort_key):
        raise SourceCatalogValidationError("products are not deterministically ordered")


def validate_release_catalog(
    artifact: Mapping[str, Any],
    *,
    products_artifact: Mapping[str, Any] | None = None,
) -> None:
    """Validate durable release catalog schema + structural invariants."""
    try:
        validate_against_schema(
            artifact, RELEASE_SCHEMA_PATH, label="amc_release_observations"
        )
    except SchemaValidationError as exc:
        raise SourceCatalogValidationError(str(exc)) from exc

    releases = artifact.get("releases") or []
    product_by_id: dict[str, Mapping[str, Any]] = {}
    if products_artifact is not None:
        for product in products_artifact.get("products") or []:
            product_by_id[str(product.get("source_film_id"))] = product

    seen: set[str] = set()
    for release in releases:
        release_id = str(release.get("source_release_id"))
        if release_id in seen:
            raise SourceCatalogValidationError(f"duplicate release identity: {release_id!r}")
        seen.add(release_id)

        members = list(release.get("member_source_film_ids") or [])
        if len(members) != len(set(members)):
            raise SourceCatalogValidationError(
                f"duplicate members in release {release_id!r}"
            )
        if int(release.get("member_count") or 0) != len(members):
            raise SourceCatalogValidationError(
                f"member_count mismatch for release {release_id!r}"
            )
        if release.get("relationship_status") != RELATIONSHIP_STATUS:
            raise SourceCatalogValidationError(
                f"invalid relationship_status for release {release_id!r}"
            )
        for flag in (
            "title_variation",
            "runtime_variation",
            "release_date_variation",
            "media_variation",
            "attribute_variation",
        ):
            value = (release.get("relationship_observations") or {}).get(flag)
            if not isinstance(value, bool):
                raise SourceCatalogValidationError(
                    f"relationship_observations.{flag} must be boolean"
                )

        if products_artifact is not None:
            for member in members:
                product = product_by_id.get(member)
                if product is None:
                    raise SourceCatalogValidationError(
                        f"unresolved release member {member!r} in {release_id!r}"
                    )
                product_release = product.get("source_release_id")
                if product_release != release_id:
                    raise SourceCatalogValidationError(
                        f"release membership mismatch: product {member!r} has "
                        f"source_release_id={product_release!r}, release={release_id!r}"
                    )

    expected = _release_stats(releases)
    stats = artifact.get("stats") or {}
    if dict(stats) != expected:
        raise SourceCatalogValidationError(
            f"release stats mismatch: got {stats}, expected {expected}"
        )

    ordered_ids = [str(r.get("source_release_id")) for r in releases]
    if ordered_ids != sorted(ordered_ids, key=_id_sort_key):
        raise SourceCatalogValidationError("releases are not deterministically ordered")


def validate_amc_source_catalog_pair(
    products_artifact: Mapping[str, Any],
    releases_artifact: Mapping[str, Any],
) -> None:
    """Validate products and releases together, including cross-artifact rules."""
    validate_product_catalog(products_artifact)
    validate_release_catalog(releases_artifact, products_artifact=products_artifact)

    products = products_artifact.get("products") or []
    releases = releases_artifact.get("releases") or []

    release_members: dict[str, set[str]] = {
        str(release.get("source_release_id")): set(release.get("member_source_film_ids") or [])
        for release in releases
    }

    for product in products:
        film_id = str(product.get("source_film_id"))
        release_id = product.get("source_release_id")
        if release_id in (None, ""):
            for members in release_members.values():
                if film_id in members:
                    raise SourceCatalogValidationError(
                        f"null-release product {film_id!r} appears in a release observation"
                    )
            continue
        release_id = str(release_id)
        members = release_members.get(release_id)
        if members is None:
            raise SourceCatalogValidationError(
                f"product {film_id!r} has release {release_id!r} with no release observation"
            )
        if film_id not in members:
            raise SourceCatalogValidationError(
                f"product {film_id!r} missing from release {release_id!r} members"
            )
        # Ensure each product with a release appears in exactly one release.
        appearances = sum(1 for members in release_members.values() if film_id in members)
        if appearances != 1:
            raise SourceCatalogValidationError(
                f"product {film_id!r} appears in {appearances} release observations"
            )
