"""Theater name resolution against the theater registry.

The registry is passed explicitly on each call—there is no module-level cache or
singleton. Use :func:`build_theater_index` once per pipeline run and reuse the
index for batch processing.

This module does not load ``data/theaters.json`` from disk; callers supply the
parsed registry dict.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from reel_seattle.normalize.values import collapse_whitespace, normalize_optional_string


def _normalize_lookup_key(name: str) -> str:
    return collapse_whitespace(name).casefold()


@dataclass(frozen=True, slots=True)
class TheaterResolution:
    """Result of resolving a raw theater name to registry identifiers."""

    theater_id: str
    name: str


@dataclass(frozen=True, slots=True)
class TheaterIndex:
    """Precomputed lookup table for theater name resolution."""

    theaters_by_id: Mapping[str, dict[str, Any]]
    name_to_id: Mapping[str, str]


def build_theater_index(registry: Mapping[str, Any]) -> TheaterIndex:
    """Build a :class:`TheaterIndex` from a parsed ``theaters.json`` document.

    Parameters
    ----------
    registry:
        Dict with a ``theaters`` list matching ``data/theaters.json``.

    Raises
    ------
    ValueError
        If duplicate lookup keys or duplicate theater ids are detected.
    """
    theaters = registry.get("theaters")
    if not isinstance(theaters, list):
        msg = "registry must contain a 'theaters' list"
        raise ValueError(msg)

    theaters_by_id: dict[str, dict[str, Any]] = {}
    name_to_id: dict[str, str] = {}

    for entry in theaters:
        if not isinstance(entry, dict):
            continue
        theater_id = entry.get("id")
        name = entry.get("name")
        if not theater_id or not name:
            continue
        if theater_id in theaters_by_id:
            msg = f"duplicate theater id in registry: {theater_id}"
            raise ValueError(msg)
        theaters_by_id[theater_id] = entry

        keys = [name, *entry.get("aliases", [])]
        for key in keys:
            optional = normalize_optional_string(key)
            if optional is None:
                continue
            lookup = _normalize_lookup_key(optional)
            existing = name_to_id.get(lookup)
            if existing is not None and existing != theater_id:
                msg = f"duplicate theater lookup key {lookup!r}"
                raise ValueError(msg)
            name_to_id[lookup] = theater_id

    return TheaterIndex(theaters_by_id=theaters_by_id, name_to_id=name_to_id)


def resolve_theater(
    name_raw: Any,
    index: TheaterIndex,
) -> TheaterResolution | None:
    """Resolve a scraper theater string to registry ``theater_id`` and canonical name.

    Matching is case-insensitive after whitespace normalization. Unknown names
    return ``None``.
    """
    text = normalize_optional_string(name_raw)
    if text is None:
        return None

    theater_id = index.name_to_id.get(_normalize_lookup_key(text))
    if theater_id is None:
        return None

    entry = index.theaters_by_id.get(theater_id)
    if entry is None:
        return None

    canonical_name = entry.get("name")
    if not canonical_name:
        return None

    return TheaterResolution(theater_id=theater_id, name=str(canonical_name))


def list_enabled_theater_ids(
    registry: Mapping[str, Any],
    *,
    source: str | None = None,
) -> tuple[str, ...]:
    """Return theater ids with ``enabled: true``, optionally filtered by *source*.

    Useful for future scraper allowlists. Does not consult a TheaterIndex.
    """
    theaters = registry.get("theaters", [])
    ids: list[str] = []
    for entry in theaters:
        if not isinstance(entry, dict):
            continue
        if not entry.get("enabled", False):
            continue
        if source is not None and entry.get("source") != source:
            continue
        theater_id = entry.get("id")
        if theater_id:
            ids.append(str(theater_id))
    return tuple(sorted(ids))
