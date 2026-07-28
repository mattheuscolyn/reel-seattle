"""Namespaced canonical film identity helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from reel_seattle.film_identity.constants import (
    IDENTITY_SOURCE,
    IDENTITY_SOURCE_KEY,
    IDENTITY_TMDB,
)

_TMDB_RE = re.compile(r"^tmdb:([1-9][0-9]*)$")
_SOURCE_RE = re.compile(r"^source:([^:]+):(.+)$")
_SOURCE_KEY_RE = re.compile(r"^source-key:([^:]+):(.+)$")


@dataclass(frozen=True)
class ParsedFilmId:
    film_id: str
    identity_type: str
    tmdb_id: int | None
    source: str | None
    source_film_id: str | None
    showtime_film_key: str | None


def film_id_from_tmdb(tmdb_id: int | str) -> str:
    value = int(tmdb_id)
    if value < 1:
        raise ValueError(f"tmdb_id must be a positive integer, got {tmdb_id!r}")
    return f"tmdb:{value}"


def film_id_from_source(source: str, source_film_id: str) -> str:
    src = _require_token(source, "source")
    sid = _require_token(source_film_id, "source_film_id")
    return f"source:{src}:{sid}"


def film_id_from_source_key(source: str, showtime_film_key: str) -> str:
    src = _require_token(source, "source")
    key = _require_token(showtime_film_key, "showtime_film_key")
    return f"source-key:{src}:{key}"


def fallback_film_id(
    *,
    source: str,
    source_film_id: str | None,
    showtime_film_key: str | None,
) -> str:
    """Prefer source film ID; otherwise namespaced showtime film key."""
    if source_film_id and str(source_film_id).strip():
        return film_id_from_source(source, str(source_film_id).strip())
    if showtime_film_key and str(showtime_film_key).strip():
        return film_id_from_source_key(source, str(showtime_film_key).strip())
    raise ValueError("fallback_film_id requires source_film_id or showtime_film_key")


def parse_film_id(value: Any) -> ParsedFilmId:
    text = str(value or "").strip()
    if not text:
        raise ValueError("film_id is empty")

    match = _TMDB_RE.fullmatch(text)
    if match:
        tmdb_id = int(match.group(1))
        return ParsedFilmId(
            film_id=text,
            identity_type=IDENTITY_TMDB,
            tmdb_id=tmdb_id,
            source=None,
            source_film_id=None,
            showtime_film_key=None,
        )

    match = _SOURCE_RE.fullmatch(text)
    if match:
        return ParsedFilmId(
            film_id=text,
            identity_type=IDENTITY_SOURCE,
            tmdb_id=None,
            source=match.group(1),
            source_film_id=match.group(2),
            showtime_film_key=None,
        )

    match = _SOURCE_KEY_RE.fullmatch(text)
    if match:
        return ParsedFilmId(
            film_id=text,
            identity_type=IDENTITY_SOURCE_KEY,
            tmdb_id=None,
            source=match.group(1),
            source_film_id=None,
            showtime_film_key=match.group(2),
        )

    raise ValueError(f"unsupported film_id format: {text!r}")


def _require_token(value: str, label: str) -> str:
    text = str(value or "").strip()
    if not text or ":" in text:
        raise ValueError(f"invalid {label}: {value!r}")
    return text
