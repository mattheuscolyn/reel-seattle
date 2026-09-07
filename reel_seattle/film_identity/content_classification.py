"""Public content classification from reviewed unresolved-event identity.

This is TMDB-identity classification (not a conventional movie), not a
public-vs-private or ticketability flag. Absence means unclassified.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import UNRESOLVED_EVENT_CLASSIFICATIONS_REL
from reel_seattle.validate import PROJECT_ROOT

CONTENT_CLASSIFICATION_NON_FILM_EVENT = "non_film_event"
CONTENT_CLASSIFICATION_PROGRAM_BLOCK = "program_block"
CONTENT_CLASSIFICATION_COMPOSITE_EVENT = "composite_event"
CONTENT_CLASSIFICATION_SHORTS_PROGRAM = "shorts_program"

KNOWN_CONTENT_CLASSIFICATIONS = frozenset(
    {
        CONTENT_CLASSIFICATION_NON_FILM_EVENT,
        CONTENT_CLASSIFICATION_PROGRAM_BLOCK,
        CONTENT_CLASSIFICATION_COMPOSITE_EVENT,
        CONTENT_CLASSIFICATION_SHORTS_PROGRAM,
    }
)


def normalize_content_classification(value: Any) -> str | None:
    """Return a trimmed classification string, or None when absent."""
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def load_unresolved_event_classifications(
    path: Path | None = None,
) -> dict[str, Any] | None:
    """Load the reviewed classification catalog, or None when absent."""
    target = path or (PROJECT_ROOT / UNRESOLVED_EVENT_CLASSIFICATIONS_REL)
    if not target.is_file():
        return None
    try:
        with target.open(encoding="utf-8") as handle:
            doc = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(doc, dict):
        return None
    return doc


def index_unresolved_event_classifications(
    doc: Mapping[str, Any] | None,
) -> tuple[dict[str, str], dict[tuple[str, str], str], list[str]]:
    """Index classifications by showtime_film_key and (source, source_film_id).

    First write wins. Colliding values for the same key are warned.
    """
    by_film_key: dict[str, str] = {}
    by_source_id: dict[tuple[str, str], str] = {}
    warnings: list[str] = []
    if not doc:
        return by_film_key, by_source_id, ["classifications_missing"]

    entries = doc.get("classifications")
    if not isinstance(entries, list):
        return by_film_key, by_source_id, ["classifications_missing"]

    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        classification = normalize_content_classification(entry.get("classification"))
        if classification is None:
            continue
        film_key = str(entry.get("showtime_film_key") or "").strip()
        source = str(entry.get("source") or "").strip()
        source_film_id = str(entry.get("source_film_id") or "").strip()
        if film_key:
            existing = by_film_key.get(film_key)
            if existing is None:
                by_film_key[film_key] = classification
            elif existing != classification:
                warnings.append(
                    f"classification_collision:{film_key}:{existing}|{classification}"
                )
        if source and source_film_id:
            sid_key = (source, source_film_id)
            existing = by_source_id.get(sid_key)
            if existing is None:
                by_source_id[sid_key] = classification
            elif existing != classification:
                warnings.append(
                    "classification_source_id_collision:"
                    f"{source}|{source_film_id}:{existing}|{classification}"
                )
    return by_film_key, by_source_id, warnings


def resolve_content_classification(
    *,
    film_key: str | None,
    source: str | None = None,
    source_film_id: str | None = None,
    by_film_key: Mapping[str, str] | None = None,
    by_source_id: Mapping[tuple[str, str], str] | None = None,
) -> str | None:
    """Resolve classification. Film key wins; source id is fallback. None if unknown."""
    key = str(film_key or "").strip()
    if key and by_film_key:
        hit = by_film_key.get(key)
        if hit:
            return hit
    src = str(source or "").strip()
    sid = str(source_film_id or "").strip()
    if src and sid and by_source_id:
        hit = by_source_id.get((src, sid))
        if hit:
            return hit
    return None


def attach_content_classifications(
    films: list[dict[str, Any]],
    showtimes: Sequence[Mapping[str, Any]] | None = None,
    *,
    classifications: Mapping[str, Any] | None = None,
    classifications_path: Path | None = None,
) -> dict[str, Any]:
    """Mutate film records with nullable ``content_classification``.

    Unclassified films receive ``null``. Does not invent public/private flags.
    Showtimes are left unchanged; classification is identity-level.
    """
    _ = showtimes
    loaded = (
        classifications
        if classifications is not None
        else load_unresolved_event_classifications(classifications_path)
    )
    by_film_key, by_source_id, warnings = index_unresolved_event_classifications(loaded)

    attached = 0
    non_film = 0
    for film in films:
        film_key = str(film.get("showtime_film_key") or "").strip()
        source = str(film.get("source") or "").strip() or None
        source_film_id = (
            str(film.get("source_film_id")).strip()
            if film.get("source_film_id") not in (None, "")
            else None
        )
        classification = resolve_content_classification(
            film_key=film_key,
            source=source,
            source_film_id=source_film_id,
            by_film_key=by_film_key,
            by_source_id=by_source_id,
        )
        film["content_classification"] = classification
        if classification:
            attached += 1
            if classification == CONTENT_CLASSIFICATION_NON_FILM_EVENT:
                non_film += 1

    return {
        "index_size": len(by_film_key),
        "films_classified": attached,
        "non_film_event": non_film,
        "unclassified": max(0, len(films) - attached),
        "warnings": warnings[:50],
        "warning_count": len(warnings),
    }
