"""Join ShortsPrograms to existing showtimes listings and stamp classification."""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.content_classification import (
    CONTENT_CLASSIFICATION_SHORTS_PROGRAM,
)
from reel_seattle.shorts_programs.ids import listing_key
from reel_seattle.shorts_programs.model import ShortsProgramRecord


def index_showtimes_by_listing_key(
    showtimes: Sequence[Mapping[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    indexed: dict[str, list[dict[str, Any]]] = {}
    for row in showtimes:
        if not isinstance(row, Mapping):
            continue
        source = str(row.get("source") or "").strip()
        source_film_id = str(row.get("source_film_id") or "").strip()
        if not source or not source_film_id:
            continue
        key = listing_key(source=source, source_film_id=source_film_id)
        indexed.setdefault(key, []).append(dict(row))
    return indexed


def enrich_programs_with_showtimes(
    programs: Sequence[ShortsProgramRecord],
    *,
    showtimes_by_key: Mapping[str, Sequence[Mapping[str, Any]]],
    collection_ids_by_listing_key: Mapping[str, Sequence[str]] | None = None,
) -> list[ShortsProgramRecord]:
    """Attach showtimeFilmKey / collectionIds join hints. Never creates Short screenings."""
    collection_ids_by_listing_key = collection_ids_by_listing_key or {}
    out: list[ShortsProgramRecord] = []
    for program in programs:
        key = program.source_listing_key or listing_key(
            source=program.source, source_film_id=program.source_film_id
        )
        showtimes = list(showtimes_by_key.get(key) or [])
        showtime_film_key = None
        if showtimes:
            showtime_film_key = str(showtimes[0].get("showtime_film_key") or "").strip() or None
        collection_ids = tuple(
            dict.fromkeys(
                [
                    *program.collection_ids,
                    *[
                        str(item)
                        for item in collection_ids_by_listing_key.get(key) or []
                        if item
                    ],
                ]
            )
        )
        out.append(
            ShortsProgramRecord(
                shorts_program_id=program.shorts_program_id,
                source=program.source,
                source_film_id=program.source_film_id,
                source_url=program.source_url,
                source_listing_key=key,
                title=program.title,
                description=program.description,
                image_url=program.image_url,
                runtime_min=program.runtime_min,
                showtime_film_key=showtime_film_key or program.showtime_film_key,
                collection_ids=collection_ids,
                member_count=program.member_count,
                first_observed_at=program.first_observed_at,
                last_observed_at=program.last_observed_at,
                last_successful_scrape_at=program.last_successful_scrape_at,
                status=program.status,
            )
        )
    return out


def collection_ids_by_listing_from_artifact(
    collections_artifact: Mapping[str, Any] | None,
) -> dict[str, list[str]]:
    """Map listing keys to Collection ids from collections_current memberships."""
    if not collections_artifact:
        return {}
    out: dict[str, list[str]] = {}
    for row in collections_artifact.get("memberships") or []:
        if not isinstance(row, Mapping):
            continue
        source = str(row.get("source") or "").strip()
        source_film_id = str(row.get("sourceFilmId") or "").strip()
        collection_id = str(row.get("collectionId") or "").strip()
        listing = str(row.get("sourceListingKey") or "").strip()
        if not collection_id:
            continue
        key = listing or (
            listing_key(source=source, source_film_id=source_film_id)
            if source and source_film_id
            else None
        )
        if not key:
            continue
        out.setdefault(key, [])
        if collection_id not in out[key]:
            out[key].append(collection_id)
    return out


def stamp_shorts_program_classifications(
    showtimes_doc: dict[str, Any],
    programs: Sequence[ShortsProgramRecord],
) -> dict[str, Any]:
    """Set content_classification=shorts_program on matching schedule film rows.

    Classification is identity-level on films. Showtimes are unchanged.
    Shorts never receive screenings here.
    """
    if not showtimes_doc:
        return showtimes_doc
    program_keys = {
        listing_key(source=program.source, source_film_id=program.source_film_id)
        for program in programs
        if program.source and program.source_film_id
    }
    program_sids = {
        (program.source, program.source_film_id)
        for program in programs
        if program.source and program.source_film_id
    }
    showtime_film_keys: set[str] = set()
    for row in showtimes_doc.get("showtimes") or []:
        if not isinstance(row, Mapping):
            continue
        source = str(row.get("source") or "").strip()
        source_film_id = str(row.get("source_film_id") or "").strip()
        if (source, source_film_id) in program_sids:
            key = str(row.get("showtime_film_key") or "").strip()
            if key:
                showtime_film_keys.add(key)

    films = list(showtimes_doc.get("films") or [])
    changed = False
    for film in films:
        if not isinstance(film, dict):
            continue
        film_key = str(film.get("showtime_film_key") or "").strip()
        source_film_id = str(film.get("source_film_id") or "").strip()
        matched = False
        if film_key and film_key in showtime_film_keys:
            matched = True
        if source_film_id and any(
            sid == source_film_id for _source, sid in program_sids
        ):
            # Prefer listing-key confirmation when showtimes exist.
            if not showtime_film_keys or film_key in showtime_film_keys:
                matched = True
        if not matched:
            continue
        if film.get("content_classification") != CONTENT_CLASSIFICATION_SHORTS_PROGRAM:
            film["content_classification"] = CONTENT_CLASSIFICATION_SHORTS_PROGRAM
            changed = True
    if changed:
        showtimes_doc = dict(showtimes_doc)
        showtimes_doc["films"] = films
    _ = program_keys
    return showtimes_doc
