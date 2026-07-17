"""Source-level film identity fields (PR Identity-B)."""

from __future__ import annotations

from typing import Any, Mapping

from reel_seattle.adapters.base import RawShowtime

_SOURCE_FILM_ID_ATTR_KEYS = (
    "movie_id",
    "movieId",
    "amc_movie_id",
    "source_film_id",
    "source_program_id",
)


def source_film_id_from_raw(raw: RawShowtime) -> str:
    """Extract a stable source film id from a normalized adapter record."""
    attrs = raw.attributes or {}
    for key in _SOURCE_FILM_ID_ATTR_KEYS:
        value = attrs.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def source_title_from_raw(raw: RawShowtime) -> str:
    """Exact source/API title before display normalization or variant stripping."""
    return str(raw.title_raw or "").strip()


def source_film_id_from_history_row(row: Mapping[str, Any]) -> str | None:
    """Read ``source_film_id`` from a history CSV row; null when absent/blank."""
    value = str(row.get("source_film_id", "")).strip()
    return value or None


def source_showtime_id_from_raw(raw: RawShowtime) -> str:
    """Extract a stable source showtime id from a normalized adapter record."""
    if raw.source_showtime_id not in (None, ""):
        return str(raw.source_showtime_id).strip()
    attrs = raw.attributes or {}
    for key in ("source_showtime_id", "checkout_showing_segment", "showing_id"):
        value = attrs.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def source_title_from_history_row(row: Mapping[str, Any]) -> str | None:
    """Read ``source_title`` from history; fall back to legacy ``Film`` when blank."""
    explicit = str(row.get("source_title", "")).strip()
    if explicit:
        return explicit
    legacy = str(row.get("Film", "")).strip()
    return legacy or None
