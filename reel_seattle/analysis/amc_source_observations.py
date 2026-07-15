"""Prototype AMC source-film observation artifacts (non-production).

Builds product and release observation JSON from sanitized AMC relationship-audit
output. Never calls the AMC API and never mutates production artifacts.
"""

from __future__ import annotations

import json
from collections import defaultdict
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.analysis.amc_wwm_release_audit import PRODUCT_CATEGORIES
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.validate import (
    SchemaValidationError,
    validate_against_schema,
)

SCHEMA_VERSION = "1.0.0"
ARTIFACT_STATUS = "prototype"
SOURCE = "amc"
RELATIONSHIP_STATUS = "grouping_evidence_only"
SOURCE_ENDPOINT = "amc_movies_api"

PRODUCT_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "schema"
    / "prototypes"
    / "amc_movie_products"
    / "v1.0.0.json"
)
RELEASE_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "schema"
    / "prototypes"
    / "amc_release_observations"
    / "v1.0.0.json"
)

ALLOWED_CATEGORIES = frozenset(PRODUCT_CATEGORIES)
NON_SPECIAL_CATEGORIES = frozenset({"standard", "unknown"})

PRODUCT_COMPARE_KEYS = (
    "source_release_id",
    "source_title",
    "sortable_title",
    "runtime_min",
    "release_date_utc",
    "genre",
    "mpaa_rating",
    "starring_actors_raw",
    "directors_raw",
    "synopsis",
    "distributor_id",
    "distributor_code",
    "preferred_media_type",
    "attribute_codes",
    "media",
    "presentation",
)

DERIVED_PRODUCT_FIELDS = (
    "presentation.category",
    "presentation.is_special_presentation",
)
DERIVED_RELEASE_FIELDS = (
    "member_count",
    "relationship_observations",
    "relationship_status",
)


class SourceObservationError(ValueError):
    """Raised when sanitized audit input cannot be transformed."""


class SourceObservationConflictError(SourceObservationError):
    """Raised when duplicate products disagree on observed metadata."""


class SourceObservationValidationError(SourceObservationError):
    """Raised when prototype artifacts fail structural validation."""


def is_special_presentation_category(category: str) -> bool:
    """Audit-compatible special-presentation flag from category label."""
    return category not in NON_SPECIAL_CATEGORIES


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


def validate_audit_input(payload: Mapping[str, Any]) -> None:
    """Validate the minimal shape of a sanitized relationship-audit document."""
    if not isinstance(payload, Mapping):
        raise SourceObservationError("audit input must be a JSON object")
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise SourceObservationError("audit input missing rows array")
    if not rows:
        raise SourceObservationError("audit input rows array is empty")
    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise SourceObservationError(f"rows[{index}] must be an object")
        movie_id = row.get("amc_movie_id")
        if movie_id in (None, "") or not str(movie_id).strip():
            raise SourceObservationError(f"rows[{index}] missing amc_movie_id")


def _category_from_row(row: Mapping[str, Any]) -> str:
    category = str(row.get("product_category") or "unknown").strip() or "unknown"
    if category not in ALLOWED_CATEGORIES:
        raise SourceObservationError(
            f"unsupported presentation category for {row.get('amc_movie_id')!r}: {category!r}"
        )
    return category


def _release_id_from_row(row: Mapping[str, Any]) -> str | None:
    status = str(row.get("wwm_status") or "").strip()
    value = row.get("wwm_release_number")
    if status == "valid" and value not in (None, ""):
        text = str(value).strip()
        return text or None
    return None


def row_to_product(
    row: Mapping[str, Any],
    *,
    observed_at: str | None,
    source_audit: str | None,
) -> dict[str, Any]:
    """Convert one sanitized audit row into a product observation."""
    film_id = str(row.get("amc_movie_id")).strip()
    category = _category_from_row(row)
    title = row.get("amc_movie_name") or row.get("source_title")
    title_text = str(title).strip() if title not in (None, "") else None
    return {
        "schema_version": SCHEMA_VERSION,
        "source": SOURCE,
        "source_film_id": film_id,
        "source_release_id": _release_id_from_row(row),
        "source_title": title_text,
        "sortable_title": (
            str(row.get("sortable_name")).strip()
            if row.get("sortable_name") not in (None, "")
            else None
        ),
        "runtime_min": row.get("run_time") if isinstance(row.get("run_time"), int) else None,
        "release_date_utc": row.get("release_date_utc"),
        "earliest_showing_utc": row.get("earliest_showing_utc"),
        "online_ticket_availability_date_utc": row.get("online_ticket_availability_date_utc"),
        "has_scheduled_showtimes": row.get("has_scheduled_showtimes"),
        "genre": row.get("genre"),
        "mpaa_rating": row.get("mpaa_rating"),
        "starring_actors_raw": row.get("starring_actors"),
        "directors_raw": row.get("directors"),
        "synopsis": row.get("synopsis"),
        "distributor_id": (
            str(row.get("distributor_id")).strip()
            if row.get("distributor_id") not in (None, "")
            else None
        ),
        "distributor_code": row.get("distributor_code"),
        "preferred_media_type": row.get("preferred_media_type"),
        "available_for_a_list": row.get("available_for_a_list"),
        "slug": row.get("slug"),
        "website_url": row.get("website_url"),
        "showtimes_url": row.get("showtimes_url"),
        "attribute_codes": list(row.get("attribute_codes") or []),
        "media": {
            "poster_url": row.get("poster_dynamic"),
            "hero_desktop_url": row.get("hero_desktop_dynamic"),
            "hero_mobile_url": row.get("hero_mobile_dynamic"),
            "trailer_hd_url": row.get("trailer_hd"),
            "trailer_mp4_url": row.get("trailer_mp4"),
        },
        "presentation": {
            "category": category,
            "is_special_presentation": is_special_presentation_category(category),
        },
        "observed_at": observed_at,
        "provenance": {
            "source_endpoint": SOURCE_ENDPOINT,
            "source_audit": source_audit,
        },
        "derived_fields": list(DERIVED_PRODUCT_FIELDS),
    }


def _products_conflict(left: Mapping[str, Any], right: Mapping[str, Any]) -> list[str]:
    conflicts: list[str] = []
    for key in PRODUCT_COMPARE_KEYS:
        if _stable_json(left.get(key)) != _stable_json(right.get(key)):
            conflicts.append(key)
    return conflicts


def build_products(
    rows: Sequence[Mapping[str, Any]],
    *,
    observed_at: str | None,
    source_audit: str | None,
) -> list[dict[str, Any]]:
    """Deduplicate rows into one product per AMC movie ID."""
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        product = row_to_product(row, observed_at=observed_at, source_audit=source_audit)
        film_id = product["source_film_id"]
        existing = by_id.get(film_id)
        if existing is None:
            by_id[film_id] = product
            continue
        conflicts = _products_conflict(existing, product)
        if conflicts:
            raise SourceObservationConflictError(
                f"conflicting product metadata for source_film_id={film_id!r}: "
                + ", ".join(conflicts)
            )
    return [by_id[key] for key in sorted(by_id.keys(), key=_id_sort_key)]


def _has_variation(values: Sequence[Any]) -> bool:
    present = [_stable_json(v) for v in values if v not in (None, "", [])]
    return len(set(present)) > 1


def build_release_from_products(
    source_release_id: str,
    members: Sequence[Mapping[str, Any]],
    *,
    observed_at: str | None,
    source_audit: str | None,
) -> dict[str, Any]:
    """Create one release observation summarizing distinct member products."""
    ordered = sorted(members, key=lambda item: _id_sort_key(str(item["source_film_id"])))
    member_ids = [str(item["source_film_id"]) for item in ordered]
    if len(member_ids) != len(set(member_ids)):
        raise SourceObservationError(
            f"duplicate member ids for release {source_release_id!r}"
        )

    titles = _sorted_unique_strings([item.get("source_title") for item in ordered])
    runtimes = _sorted_unique_ints([item.get("runtime_min") for item in ordered])
    dates = _sorted_unique_strings([item.get("release_date_utc") for item in ordered])
    distributors = _sorted_unique_strings([item.get("distributor_code") for item in ordered])
    categories = sorted(
        {
            str(item.get("presentation", {}).get("category") or "unknown")
            for item in ordered
        }
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "source": SOURCE,
        "source_release_id": source_release_id,
        "member_source_film_ids": member_ids,
        "member_count": len(member_ids),
        "observed_titles": titles,
        "observed_runtimes_min": runtimes,
        "observed_release_dates_utc": dates,
        "observed_distributor_codes": distributors,
        "presentation_categories": categories,
        "relationship_observations": {
            "title_variation": _has_variation([item.get("source_title") for item in ordered]),
            "runtime_variation": _has_variation([item.get("runtime_min") for item in ordered]),
            "release_date_variation": _has_variation(
                [item.get("release_date_utc") for item in ordered]
            ),
            "media_variation": _has_variation([item.get("media") for item in ordered]),
            "attribute_variation": _has_variation(
                [item.get("attribute_codes") for item in ordered]
            ),
        },
        "relationship_status": RELATIONSHIP_STATUS,
        "observed_at": observed_at,
        "provenance": {
            "source_endpoint": SOURCE_ENDPOINT,
            "source_audit": source_audit,
        },
        "derived_fields": list(DERIVED_RELEASE_FIELDS),
    }


def build_releases(
    products: Sequence[Mapping[str, Any]],
    *,
    observed_at: str | None,
    source_audit: str | None,
) -> list[dict[str, Any]]:
    """Group products with valid release IDs into release observations."""
    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for product in products:
        release_id = product.get("source_release_id")
        if release_id in (None, ""):
            continue
        grouped[str(release_id)].append(product)

    releases = [
        build_release_from_products(
            release_id,
            members,
            observed_at=observed_at,
            source_audit=source_audit,
        )
        for release_id, members in grouped.items()
    ]
    return sorted(releases, key=lambda item: _id_sort_key(str(item["source_release_id"])))


def _product_stats(products: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    with_release = sum(1 for p in products if p.get("source_release_id") not in (None, ""))
    special = sum(
        1
        for p in products
        if (p.get("presentation") or {}).get("is_special_presentation") is True
    )
    return {
        "products": len(products),
        "with_release_id": with_release,
        "without_release_id": len(products) - with_release,
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


def build_source_observations(
    audit: Mapping[str, Any],
    *,
    input_path: str,
    generated_at: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build prototype product and release artifacts from sanitized audit JSON."""
    validate_audit_input(audit)

    pacific = ZoneInfo(DEFAULT_TIMEZONE)
    stamp = generated_at or datetime.now(pacific).isoformat(timespec="seconds")
    observed_at = audit.get("generated_at")
    if observed_at is not None:
        observed_at = str(observed_at)
    source_audit = str(input_path)

    products = build_products(
        audit["rows"],
        observed_at=observed_at,
        source_audit=source_audit,
    )
    releases = build_releases(
        products,
        observed_at=observed_at,
        source_audit=source_audit,
    )

    input_meta = {
        "type": "sanitized_audit",
        "path": input_path,
        "audit_generated_at": observed_at,
    }
    product_artifact = {
        "schema_version": SCHEMA_VERSION,
        "artifact_status": ARTIFACT_STATUS,
        "generated_at": stamp,
        "source": SOURCE,
        "input": input_meta,
        "stats": _product_stats(products),
        "products": products,
    }
    release_artifact = {
        "schema_version": SCHEMA_VERSION,
        "artifact_status": ARTIFACT_STATUS,
        "generated_at": stamp,
        "source": SOURCE,
        "input": deepcopy(input_meta),
        "stats": _release_stats(releases),
        "releases": releases,
    }
    return product_artifact, release_artifact


def write_source_observations(
    product_artifact: Mapping[str, Any],
    release_artifact: Mapping[str, Any],
    output_dir: Path | str,
) -> dict[str, Path]:
    """Write prototype JSON artifacts to *output_dir*."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    products_path = out / "amc_movie_products.json"
    releases_path = out / "amc_release_observations.json"
    products_path.write_text(
        json.dumps(product_artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    releases_path.write_text(
        json.dumps(release_artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return {"products": products_path, "releases": releases_path}


def validate_product_artifact(artifact: Mapping[str, Any]) -> None:
    """Validate product artifact schema + structural invariants."""
    try:
        validate_against_schema(artifact, PRODUCT_SCHEMA_PATH, label="amc_movie_products")
    except SchemaValidationError as exc:
        raise SourceObservationValidationError(str(exc)) from exc

    products = artifact.get("products") or []
    seen: set[tuple[str, str]] = set()
    for product in products:
        key = (str(product.get("source")), str(product.get("source_film_id")))
        if key in seen:
            raise SourceObservationValidationError(
                f"duplicate product identity: {key[0]!r}/{key[1]!r}"
            )
        seen.add(key)
        release_id = product.get("source_release_id")
        if release_id is not None and (not isinstance(release_id, str) or not release_id.strip()):
            raise SourceObservationValidationError(
                f"invalid source_release_id for {product.get('source_film_id')!r}"
            )

    stats = artifact.get("stats") or {}
    expected = _product_stats(products)
    if dict(stats) != expected:
        raise SourceObservationValidationError(
            f"product stats mismatch: got {stats}, expected {expected}"
        )


def validate_release_artifact(
    artifact: Mapping[str, Any],
    *,
    products_artifact: Mapping[str, Any] | None = None,
) -> None:
    """Validate release artifact schema + structural/referential invariants."""
    try:
        validate_against_schema(
            artifact, RELEASE_SCHEMA_PATH, label="amc_release_observations"
        )
    except SchemaValidationError as exc:
        raise SourceObservationValidationError(str(exc)) from exc

    releases = artifact.get("releases") or []
    seen: set[tuple[str, str]] = set()
    product_ids: set[str] | None = None
    if products_artifact is not None:
        product_ids = {
            str(product.get("source_film_id"))
            for product in (products_artifact.get("products") or [])
        }

    for release in releases:
        key = (str(release.get("source")), str(release.get("source_release_id")))
        if key in seen:
            raise SourceObservationValidationError(
                f"duplicate release identity: {key[0]!r}/{key[1]!r}"
            )
        seen.add(key)

        members = list(release.get("member_source_film_ids") or [])
        if len(members) != len(set(members)):
            raise SourceObservationValidationError(
                f"duplicate members in release {release.get('source_release_id')!r}"
            )
        if int(release.get("member_count") or 0) != len(members):
            raise SourceObservationValidationError(
                f"member_count mismatch for release {release.get('source_release_id')!r}"
            )
        if product_ids is not None:
            unresolved = [member for member in members if member not in product_ids]
            if unresolved:
                raise SourceObservationValidationError(
                    f"unresolved release members for {release.get('source_release_id')!r}: "
                    + ", ".join(unresolved)
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
                raise SourceObservationValidationError(
                    f"relationship_observations.{flag} must be boolean"
                )

    stats = artifact.get("stats") or {}
    expected = _release_stats(releases)
    if dict(stats) != expected:
        raise SourceObservationValidationError(
            f"release stats mismatch: got {stats}, expected {expected}"
        )


def validate_source_observation_pair(
    products_artifact: Mapping[str, Any],
    releases_artifact: Mapping[str, Any],
) -> None:
    """Validate products and releases together."""
    validate_product_artifact(products_artifact)
    validate_release_artifact(releases_artifact, products_artifact=products_artifact)
