"""Normalize TMDB movie payloads into public enrichment rows."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Mapping

from reel_seattle.enrichment.constants import (
    BACKDROP_SIZE,
    DEFAULT_SECURE_BASE_URL,
    LANGUAGE,
    OVERVIEW_MAX_LEN,
    POSTER_SIZE,
    PROVIDER,
    TOP_CAST_MAX,
)

_IMDB_RE = re.compile(r"^tt\d{7,8}$")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def build_image_config(
    *,
    secure_base_url: str | None = None,
    poster_size: str = POSTER_SIZE,
    backdrop_size: str = BACKDROP_SIZE,
) -> dict[str, str]:
    base = (secure_base_url or DEFAULT_SECURE_BASE_URL).rstrip("/") + "/"
    return {
        "secure_base_url": base,
        "poster_size": poster_size,
        "backdrop_size": backdrop_size,
    }


def resolve_image_url(path: str | None, *, base_url: str, size: str) -> str | None:
    if not path:
        return None
    return f"{base_url.rstrip('/')}/{size}{path}"


def normalize_enrichment_row(
    details: Mapping[str, Any],
    *,
    image_config: Mapping[str, str],
    fetched_at: str | None = None,
    include_top_cast: bool = True,
) -> dict[str, Any]:
    """Build one public enrichment row from TMDB movie details (+credits, external_ids)."""
    tmdb_id = details.get("id")
    if not isinstance(tmdb_id, int) or tmdb_id < 1:
        raise ValueError("TMDB details missing positive id")

    external = details.get("external_ids") if isinstance(details.get("external_ids"), Mapping) else {}
    imdb_raw = _clean_text(external.get("imdb_id"))
    imdb_id = imdb_raw if imdb_raw and _IMDB_RE.match(imdb_raw) else None

    release_date = _clean_text(details.get("release_date"))
    if release_date and not re.match(r"^\d{4}-\d{2}-\d{2}$", release_date):
        release_date = None
    release_year = int(release_date[:4]) if release_date else None

    overview = _clean_text(details.get("overview"))
    if overview and len(overview) > OVERVIEW_MAX_LEN:
        overview = overview[:OVERVIEW_MAX_LEN].rstrip()

    genres = _normalize_genres(details.get("genres") or [])
    directors = _normalize_directors(details.get("credits") or {})
    top_cast = _normalize_top_cast(details.get("credits") or {}) if include_top_cast else []
    runtime_minutes = _normalize_runtime(details.get("runtime"))
    us_certification = extract_us_certification(details.get("release_dates"))

    poster_path = _clean_image_path(details.get("poster_path"))
    backdrop_path = _clean_image_path(details.get("backdrop_path"))
    base = image_config.get("secure_base_url") or DEFAULT_SECURE_BASE_URL
    poster_size = image_config.get("poster_size") or POSTER_SIZE
    backdrop_size = image_config.get("backdrop_size") or BACKDROP_SIZE

    stamp = fetched_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    display_title = _clean_text(details.get("title"))
    original_title = _clean_text(details.get("original_title"))
    field_provenance = {
        "canonical_title": "tmdb" if display_title or original_title else "unavailable",
        "release_date": "tmdb" if release_date else "unavailable",
        "release_year": "tmdb" if release_year else "unavailable",
        "runtime_minutes": "tmdb" if runtime_minutes is not None else "unavailable",
        "us_certification": "tmdb" if us_certification else "unavailable",
        "genres": "tmdb" if genres else "unavailable",
        "overview": "tmdb" if overview else "unavailable",
        "poster": "tmdb" if poster_path else "unavailable",
        "backdrop": "tmdb" if backdrop_path else "unavailable",
        "director": "tmdb" if directors else "unavailable",
    }

    return {
        "film_id": f"tmdb:{tmdb_id}",
        "tmdb_id": tmdb_id,
        "imdb_id": imdb_id,
        "original_title": original_title,
        "display_title": display_title,
        "original_language": _clean_text(details.get("original_language")),
        "release_date": release_date,
        "release_year": release_year,
        "runtime_minutes": runtime_minutes,
        "us_certification": us_certification,
        "overview": overview,
        "genres": genres,
        "directors": directors,
        "top_cast": top_cast,
        "poster": {
            "path": poster_path,
            "url": resolve_image_url(poster_path, base_url=base, size=poster_size),
        }
        if poster_path
        else None,
        "backdrop": {
            "path": backdrop_path,
            "url": resolve_image_url(backdrop_path, base_url=base, size=backdrop_size),
        }
        if backdrop_path
        else None,
        "provenance": {
            "provider": PROVIDER,
            "fetched_at": stamp,
            "language": LANGUAGE,
            "append_to_response": ["credits", "external_ids", "release_dates"],
        },
        "field_provenance": field_provenance,
    }


def merge_partial_row(
    previous: Mapping[str, Any] | None,
    incoming: Mapping[str, Any],
) -> dict[str, Any]:
    """Prefer incoming non-empty values; keep prior good fields when incoming is empty."""
    if previous is None:
        return dict(incoming)
    out = dict(previous)
    for key, value in incoming.items():
        if key == "provenance":
            out[key] = value
            continue
        if key == "field_provenance":
            if isinstance(value, Mapping) and value:
                out[key] = value
            continue
        if key in {"genres", "directors", "top_cast"}:
            if isinstance(value, list) and value:
                out[key] = value
            continue
        if key in {"poster", "backdrop"}:
            if isinstance(value, Mapping) and value.get("path"):
                out[key] = value
            continue
        if value not in (None, "", []):
            out[key] = value
    # Ensure identity fields from incoming win.
    out["film_id"] = incoming["film_id"]
    out["tmdb_id"] = incoming["tmdb_id"]
    return out


def extract_us_certification(release_dates: Any) -> str | None:
    """Pick the primary US theatrical certification when present."""
    if not isinstance(release_dates, Mapping):
        return None
    results = release_dates.get("results")
    if not isinstance(results, list):
        return None
    us_entry = None
    for entry in results:
        if isinstance(entry, Mapping) and str(entry.get("iso_3166_1") or "").upper() == "US":
            us_entry = entry
            break
    if us_entry is None:
        return None
    releases = us_entry.get("release_dates")
    if not isinstance(releases, list):
        return None
    # Prefer theatrical (type 3), then limited (2), then any non-empty certification.
    preferred_types = (3, 2, 1, 4, 5, 6)
    ranked: list[tuple[int, str]] = []
    for row in releases:
        if not isinstance(row, Mapping):
            continue
        cert = _clean_text(row.get("certification"))
        if not cert:
            continue
        rtype = row.get("type") if isinstance(row.get("type"), int) else 99
        try:
            rank = preferred_types.index(rtype)
        except ValueError:
            rank = 50 + int(rtype)
        ranked.append((rank, cert))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0])
    return ranked[0][1]


def _normalize_runtime(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, float) and value > 0 and value.is_integer():
        return int(value)
    return None


def _normalize_genres(raw: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    items = list(raw) if isinstance(raw, list) else []
    items.sort(
        key=lambda g: (
            int(g.get("id")) if isinstance(g, Mapping) and isinstance(g.get("id"), int) else 10**9,
            str((g or {}).get("name") or "") if isinstance(g, Mapping) else "",
        )
    )
    for genre in items:
        if not isinstance(genre, Mapping):
            continue
        name = _clean_text(genre.get("name"))
        if not name or name.casefold() in seen:
            continue
        seen.add(name.casefold())
        gid = genre.get("id") if isinstance(genre.get("id"), int) else None
        rows.append({"id": gid, "name": name})
    return rows


def _normalize_directors(credits: Mapping[str, Any]) -> list[dict[str, Any]]:
    crew = credits.get("crew") if isinstance(credits.get("crew"), list) else []
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    directors = [
        person
        for person in crew
        if isinstance(person, Mapping)
        and person.get("job") == "Director"
        and _clean_text(person.get("name"))
    ]
    directors.sort(
        key=lambda p: (
            int(p["id"]) if isinstance(p.get("id"), int) else 10**9,
            str(p.get("name") or ""),
        )
    )
    for person in directors:
        name = _clean_text(person.get("name"))
        assert name is not None
        key = str(person.get("id") or name)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "tmdb_person_id": person.get("id")
                if isinstance(person.get("id"), int)
                else None,
                "name": name,
            }
        )
    return rows


def _normalize_top_cast(credits: Mapping[str, Any]) -> list[dict[str, Any]]:
    cast = credits.get("cast") if isinstance(credits.get("cast"), list) else []
    people = [
        person
        for person in cast
        if isinstance(person, Mapping) and _clean_text(person.get("name"))
    ]
    people.sort(
        key=lambda p: (
            int(p["order"]) if isinstance(p.get("order"), int) else 10**9,
            str(p.get("name") or ""),
        )
    )
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for person in people[:TOP_CAST_MAX]:
        name = _clean_text(person.get("name"))
        assert name is not None
        key = str(person.get("id") or name)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "tmdb_person_id": person.get("id")
                if isinstance(person.get("id"), int)
                else None,
                "name": name,
                "character": _clean_text(person.get("character")),
                "order": person.get("order") if isinstance(person.get("order"), int) else None,
            }
        )
    return rows


def _clean_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = _CONTROL_RE.sub("", str(value)).strip()
    return text or None


def _clean_image_path(value: Any) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    if not text.startswith("/"):
        return None
    return text
