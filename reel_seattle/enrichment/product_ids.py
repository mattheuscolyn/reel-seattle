"""Exact canonical tmdb:* IDs surfaced by public product artifacts.

Eligibility is ID-only. Never infer from titles or source film ids.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.film_identity.constants import STATUS_CONFIRMED_AUTOMATIC
from reel_seattle.validate import PROJECT_ROOT

_TMDB_RE = re.compile(r"^tmdb:([1-9][0-9]*)$")

PUBLIC_PRODUCT_ARTIFACTS = (
    ("showtimes", "public/data/showtimes_current.json"),
    ("collections", "public/data/collections_current.json"),
    ("opening_this_week", "public/data/opening_this_week_current.json"),
    ("leaving_soon", "public/data/leaving_soon_current.json"),
    ("newly_added", "public/data/newly_added_current.json"),
    ("coming_soon", "public/data/coming_soon_current.json"),
    ("shorts", "public/data/shorts_programs_current.json"),
)


def as_tmdb_id(value: Any) -> int | None:
    if isinstance(value, int) and value >= 1:
        return value
    if not isinstance(value, str):
        return None
    match = _TMDB_RE.match(value.strip())
    if not match:
        return None
    return int(match.group(1))


def _merge_id(
    by_id: dict[int, dict[str, Any]],
    tmdb_id: int,
    *,
    source: str,
) -> None:
    existing = by_id.get(tmdb_id)
    if existing is None:
        by_id[tmdb_id] = {
            "film_id": f"tmdb:{tmdb_id}",
            "tmdb_id": tmdb_id,
            "match_status": STATUS_CONFIRMED_AUTOMATIC,
            "sources": [source],
            "normalized_title": None,
        }
        return
    sources = set(existing.get("sources") or [])
    sources.add(source)
    existing["sources"] = sorted(sources)


def _add(by_id: dict[int, dict[str, Any]], value: Any, source: str) -> None:
    tmdb_id = as_tmdb_id(value)
    if tmdb_id is None:
        return
    _merge_id(by_id, tmdb_id, source=source)


def collect_tmdb_ids_from_product_docs(
    docs: Mapping[str, Mapping[str, Any] | None] | None,
) -> list[dict[str, Any]]:
    """Extract exact tmdb IDs from already-loaded product documents."""
    by_id: dict[int, dict[str, Any]] = {}
    if not docs:
        return []

    showtimes = docs.get("showtimes")
    if isinstance(showtimes, Mapping):
        for row in showtimes.get("films") or []:
            if isinstance(row, Mapping):
                _add(by_id, row.get("film_id") or row.get("filmId"), "showtimes")
        for row in showtimes.get("showtimes") or []:
            if isinstance(row, Mapping):
                _add(by_id, row.get("film_id") or row.get("filmId"), "showtimes")

    collections = docs.get("collections")
    if isinstance(collections, Mapping):
        for row in collections.get("memberships") or []:
            if isinstance(row, Mapping):
                _add(
                    by_id,
                    row.get("canonicalFilmId") or row.get("canonical_film_id"),
                    "collections",
                )

    opening = docs.get("opening_this_week")
    if isinstance(opening, Mapping):
        for row in opening.get("entries") or []:
            if isinstance(row, Mapping):
                _add(by_id, row.get("film_id") or row.get("filmId"), "opening_this_week")

    leaving = docs.get("leaving_soon")
    if isinstance(leaving, Mapping):
        for row in leaving.get("entries") or leaving.get("items") or []:
            if isinstance(row, Mapping):
                _add(by_id, row.get("film_id") or row.get("filmId"), "leaving_soon")

    newly = docs.get("newly_added")
    if isinstance(newly, Mapping):
        for row in newly.get("entries") or []:
            if isinstance(row, Mapping):
                _add(by_id, row.get("film_id") or row.get("filmId"), "newly_added")

    coming_soon = docs.get("coming_soon")
    if isinstance(coming_soon, Mapping):
        for row in coming_soon.get("entries") or []:
            if not isinstance(row, Mapping):
                continue
            identity = row.get("identity") if isinstance(row.get("identity"), Mapping) else {}
            if identity.get("film_id_confirmed") is True:
                _add(
                    by_id,
                    row.get("film_id") or identity.get("film_id"),
                    "coming_soon",
                )

    shorts = docs.get("shorts")
    if isinstance(shorts, Mapping):
        for row in shorts.get("shorts") or []:
            if isinstance(row, Mapping):
                _add(
                    by_id,
                    row.get("canonicalFilmId") or row.get("canonical_film_id"),
                    "shorts",
                )

    return sorted(by_id.values(), key=lambda row: row["tmdb_id"])


def load_json_object(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        with path.open(encoding="utf-8") as handle:
            doc = json.load(handle)
        return doc if isinstance(doc, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def load_product_artifact_docs(root: Path | None = None) -> dict[str, dict[str, Any] | None]:
    base = root or PROJECT_ROOT
    docs: dict[str, dict[str, Any] | None] = {}
    for name, rel in PUBLIC_PRODUCT_ARTIFACTS:
        docs[name] = load_json_object(base / rel)
    return docs


def collect_product_surfaced_tmdb_films(root: Path | None = None) -> list[dict[str, Any]]:
    return collect_tmdb_ids_from_product_docs(load_product_artifact_docs(root))
