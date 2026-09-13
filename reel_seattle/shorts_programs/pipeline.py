"""Orchestrate NWFF shorts-program discovery and artifact write."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.collections.adapters.common import FetchText
from reel_seattle.collections.listings import (
    load_latest_source_listings,
    load_showtimes_document,
    nwff_film_page_urls,
)
from reel_seattle.shorts_programs.adapters.nwff import discover_nwff_shorts_programs
from reel_seattle.shorts_programs.artifact import (
    DEFAULT_ARTIFACT_REL,
    build_artifact,
    load_artifact,
    merge_observations,
    observed_at_now,
    write_artifact,
)
from reel_seattle.shorts_programs.join import (
    collection_ids_by_listing_from_artifact,
    enrich_programs_with_showtimes,
    index_showtimes_by_listing_key,
    stamp_shorts_program_classifications,
)
from reel_seattle.shorts_programs.model import ShortsDiscoveryResult
from reel_seattle.validate import PROJECT_ROOT, validate_against_schema


def build_shorts_programs_current(
    *,
    fetch_text: FetchText | None = None,
    film_page_urls: list[str] | None = None,
    showtimes_doc: Mapping[str, Any] | None = None,
    collections_artifact: Mapping[str, Any] | None = None,
    previous: Mapping[str, Any] | None = None,
    observed_at: str | None = None,
    generated_at: str | None = None,
    sleep_seconds: float = 0.0,
    result: ShortsDiscoveryResult | None = None,
    stamp_showtimes: bool = False,
    showtimes_path: Path | None = None,
    output_path: Path | None = None,
    validate: bool = True,
) -> dict[str, Any]:
    observed = observed_at or observed_at_now()
    generated = generated_at or observed

    if result is None:
        if film_page_urls is None:
            listings = load_latest_source_listings()
            film_page_urls = nwff_film_page_urls(listings.get("nwff") or [])
        result = discover_nwff_shorts_programs(
            fetch_text=fetch_text,
            observed_at=observed,
            film_page_urls=film_page_urls,
            sleep_seconds=sleep_seconds,
        )

    warnings = list(result.warnings)
    omitted = list(result.omitted)
    if not result.ok:
        warnings.append("nwff: shorts program scrape incomplete; prior valid rows preserved")

    merged_programs, merged_shorts, merged_memberships = merge_observations(
        previous=previous if previous is not None else load_artifact(output_path),
        discovered_programs=result.programs,
        discovered_shorts=result.shorts,
        discovered_memberships=result.memberships,
        scraped_program_ids=set(result.scraped_program_ids),
        source_ok=result.ok,
        observed_at=observed,
    )

    showtimes_document = (
        dict(showtimes_doc) if showtimes_doc is not None else load_showtimes_document(showtimes_path)
    )
    showtimes = list(showtimes_document.get("showtimes") or [])
    showtimes_by_key = index_showtimes_by_listing_key(showtimes)

    collections_doc = collections_artifact
    if collections_doc is None:
        collections_path = PROJECT_ROOT / "public/data/collections_current.json"
        if collections_path.is_file():
            try:
                collections_doc = json.loads(collections_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                collections_doc = None

    enriched_programs = enrich_programs_with_showtimes(
        merged_programs,
        showtimes_by_key=showtimes_by_key,
        collection_ids_by_listing_key=collection_ids_by_listing_from_artifact(
            collections_doc if isinstance(collections_doc, Mapping) else None
        ),
    )

    artifact = build_artifact(
        programs=enriched_programs,
        shorts=merged_shorts,
        memberships=merged_memberships,
        generated_at=generated,
        source_stats={"nwff": {**dict(result.stats), "ok": result.ok}},
        warnings=warnings,
        omitted=omitted,
    )
    if validate:
        schema_path = PROJECT_ROOT / "schema/shorts_programs_current/v1.0.0.json"
        if schema_path.is_file():
            validate_against_schema(artifact, schema_path, label="shorts_programs_current")

    target = output_path or (PROJECT_ROOT / DEFAULT_ARTIFACT_REL)
    write_artifact(artifact, target)

    if stamp_showtimes and showtimes_document:
        stamped = stamp_shorts_program_classifications(
            showtimes_document, enriched_programs
        )
        out = showtimes_path or (PROJECT_ROOT / "public/data/showtimes_current.json")
        out.write_text(
            json.dumps(stamped, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    return artifact


def run_shorts_programs_pipeline(
    *,
    sleep_seconds: float = 0.25,
    stamp_showtimes: bool = True,
    fetch_text: FetchText | None = None,
) -> dict[str, Any]:
    """Daily-safe wrapper: preserve prior artifact on unexpected failure."""
    previous = load_artifact()
    try:
        return build_shorts_programs_current(
            fetch_text=fetch_text,
            sleep_seconds=sleep_seconds,
            stamp_showtimes=stamp_showtimes,
            previous=previous,
        )
    except Exception as exc:  # noqa: BLE001 — daily pipeline must not wipe state
        if previous:
            warnings = list(previous.get("warnings") or [])
            warnings.append(
                f"shorts programs pipeline failed; preserved prior artifact: {exc}"
            )
            previous = dict(previous)
            previous["warnings"] = sorted(set(str(item) for item in warnings))
            write_artifact(previous)
            return previous
        raise
