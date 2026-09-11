"""Orchestrate collection discovery, listing join, and artifact write."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.collections.adapters.beacon import discover_beacon_collections
from reel_seattle.collections.adapters.common import FetchText
from reel_seattle.collections.adapters.nwff import discover_nwff_collections
from reel_seattle.collections.adapters.siff import discover_siff_collections
from reel_seattle.collections.artifact import (
    DEFAULT_ARTIFACT_REL,
    build_artifact,
    load_artifact,
    merge_observations,
    observed_at_now,
    write_artifact,
)
from reel_seattle.collections.join import (
    attach_collection_ids_to_showtimes,
    enrich_memberships,
    index_raw_listings,
    index_showtimes,
)
from reel_seattle.collections.listings import (
    COLLECTION_SOURCES,
    extra_siff_collection_urls,
    load_catalog_canonical_map,
    load_latest_source_listings,
    load_showtimes_document,
    nwff_film_page_urls,
)
from reel_seattle.collections.model import SourceDiscoveryResult
from reel_seattle.validate import PROJECT_ROOT, validate_against_schema


def discover_all_sources(
    *,
    fetch_text: FetchText | None = None,
    listings: Mapping[str, list[RawShowtime]] | None = None,
    observed_at: str,
    sleep_seconds: float = 0.0,
    results: Mapping[str, SourceDiscoveryResult] | None = None,
) -> dict[str, SourceDiscoveryResult]:
    if results is not None:
        return dict(results)
    listings = listings or {}
    return {
        "siff": discover_siff_collections(
            fetch_text=fetch_text,
            extra_collection_urls=extra_siff_collection_urls(listings.get("siff") or []),
            observed_at=observed_at,
            sleep_seconds=sleep_seconds,
        ),
        "beacon": discover_beacon_collections(
            fetch_text=fetch_text,
            observed_at=observed_at,
            sleep_seconds=sleep_seconds,
        ),
        "nwff": discover_nwff_collections(
            fetch_text=fetch_text,
            observed_at=observed_at,
            sleep_seconds=sleep_seconds,
            film_page_urls=nwff_film_page_urls(listings.get("nwff") or []),
        ),
    }


def build_collections_current(
    *,
    fetch_text: FetchText | None = None,
    listings: Mapping[str, list[RawShowtime]] | None = None,
    showtimes_doc: Mapping[str, Any] | None = None,
    previous: Mapping[str, Any] | None = None,
    catalog_canonical: Mapping[str, str] | None = None,
    observed_at: str | None = None,
    generated_at: str | None = None,
    sleep_seconds: float = 0.0,
    results: Mapping[str, SourceDiscoveryResult] | None = None,
    stamp_showtimes: bool = False,
    showtimes_path: Path | None = None,
    output_path: Path | None = None,
    validate: bool = True,
) -> dict[str, Any]:
    observed = observed_at or observed_at_now()
    generated = generated_at or observed
    source_listings = listings if listings is not None else load_latest_source_listings()
    discovered = discover_all_sources(
        fetch_text=fetch_text,
        listings=source_listings,
        observed_at=observed,
        sleep_seconds=sleep_seconds,
        results=results,
    )

    source_ok = {source: discovered.get(source, SourceDiscoveryResult(source, False)).ok for source in COLLECTION_SOURCES}
    warnings: list[str] = []
    omitted: list[dict[str, str]] = []
    source_stats: dict[str, Any] = {}
    discovered_collections = []
    discovered_memberships = []
    for source in COLLECTION_SOURCES:
        result = discovered.get(source) or SourceDiscoveryResult(source=source, ok=False)
        source_stats[source] = dict(result.stats)
        source_stats[source]["ok"] = result.ok
        warnings.extend(result.warnings)
        omitted.extend(result.omitted)
        discovered_collections.extend(result.collections)
        discovered_memberships.extend(result.memberships)
        if not result.ok:
            warnings.append(f"{source}: scrape incomplete; prior valid collections preserved")

    showtimes_document = dict(showtimes_doc) if showtimes_doc is not None else load_showtimes_document(showtimes_path)
    showtimes = list(showtimes_document.get("showtimes") or [])
    listings_by_key: dict[str, list[RawShowtime]] = {}
    for source, records in source_listings.items():
        for key, rows in index_raw_listings(source=source, records=records).items():
            listings_by_key.setdefault(key, []).extend(rows)
    showtimes_by_key = index_showtimes(showtimes)
    canonical_map = dict(catalog_canonical) if catalog_canonical is not None else load_catalog_canonical_map()
    for key, rows in showtimes_by_key.items():
        film_id = rows[0].get("film_id")
        if isinstance(film_id, str) and film_id.startswith("tmdb:"):
            canonical_map.setdefault(key, film_id)

    merged_collections, merged_memberships = merge_observations(
        previous=previous if previous is not None else load_artifact(output_path),
        discovered_collections=discovered_collections,
        discovered_memberships=discovered_memberships,
        source_ok=source_ok,
        observed_at=observed,
    )
    enriched = enrich_memberships(
        merged_memberships,
        merged_collections,
        listings_by_key=listings_by_key,
        showtimes_by_key=showtimes_by_key,
        canonical_by_listing_key=canonical_map,
    )

    stamped = attach_collection_ids_to_showtimes(showtimes, enriched) if showtimes else []
    artifact = build_artifact(
        collections=merged_collections,
        memberships=enriched,
        generated_at=generated,
        source_stats=source_stats,
        warnings=warnings,
        omitted=omitted,
        showtimes=stamped or showtimes,
    )
    if validate:
        schema_path = PROJECT_ROOT / "schema/collections_current/v1.0.0.json"
        if schema_path.is_file():
            validate_against_schema(artifact, schema_path, label="collections_current")
    target = output_path or (PROJECT_ROOT / DEFAULT_ARTIFACT_REL)
    write_artifact(artifact, target)

    if stamp_showtimes and showtimes_document and stamped:
        showtimes_document["showtimes"] = stamped
        out = showtimes_path or (PROJECT_ROOT / "public/data/showtimes_current.json")
        out.write_text(json.dumps(showtimes_document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return artifact


def run_collections_pipeline(
    *,
    sleep_seconds: float = 0.25,
    stamp_showtimes: bool = True,
    fetch_text: FetchText | None = None,
) -> dict[str, Any]:
    """Daily-safe wrapper: preserve prior artifact on unexpected failure."""
    previous = load_artifact()
    try:
        return build_collections_current(
            fetch_text=fetch_text,
            sleep_seconds=sleep_seconds,
            stamp_showtimes=stamp_showtimes,
            previous=previous,
        )
    except Exception as exc:  # noqa: BLE001 — daily pipeline must not wipe state
        if previous:
            warnings = list(previous.get("warnings") or [])
            warnings.append(f"collection pipeline failed; preserved prior artifact: {exc}")
            previous = dict(previous)
            previous["warnings"] = sorted(set(str(item) for item in warnings))
            write_artifact(previous)
            return previous
        raise
