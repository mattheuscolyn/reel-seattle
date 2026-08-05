"""TMDB enrichment audit helpers (T-ENR-01A) — coverage only, no public emit."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    STATUS_CONFIRMED_AUTOMATIC,
    STATUS_CONFIRMED_MANUAL,
)
from reel_seattle.film_identity.io_util import atomic_write_json
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage
from reel_seattle.validate import PROJECT_ROOT

CATALOG_REL = "data/film_identity/film_identity_catalog.json"
COVERAGE_REL = "data/audits/tmdb_enrichment_coverage.json"
ENRICHMENT_CACHE_KIND = "enrichment_movie_bundle"

_IMDB_RE = re.compile(r"^tt\d{7,8}$")
_IMAGE_PATH_RE = re.compile(r"^/[\w./-]+\.(jpg|jpeg|png|webp)$", re.IGNORECASE)
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# First-release candidate fields measured by the audit.
AUDIT_FIELDS = (
    "overview",
    "genres",
    "runtime",
    "directors",
    "imdb_id",
    "poster_path",
    "backdrop_path",
    "top_cast",
    "original_title",
    "release_date",
    "display_title",
    "tagline",
    "vote_average",
    "popularity",
)


def load_catalog(path: Path | None = None) -> dict[str, Any]:
    target = path or (PROJECT_ROOT / CATALOG_REL)
    with target.open(encoding="utf-8") as handle:
        doc = json.load(handle)
    if not isinstance(doc, dict):
        raise ValueError("catalog must be an object")
    return doc


def confirmed_tmdb_films(catalog: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Deduped confirmed TMDB identities (manual + automatic)."""
    by_id: dict[int, dict[str, Any]] = {}
    for film in catalog.get("films") or []:
        if not isinstance(film, Mapping):
            continue
        status = film.get("match_status")
        if status not in {STATUS_CONFIRMED_AUTOMATIC, STATUS_CONFIRMED_MANUAL}:
            continue
        if film.get("identity_type") != "tmdb":
            continue
        tmdb_id = film.get("tmdb_id")
        if not isinstance(tmdb_id, int) or tmdb_id < 1:
            continue
        # Prefer keeping first occurrence; merge source tags.
        existing = by_id.get(tmdb_id)
        sources = _source_names(film)
        if existing is None:
            by_id[tmdb_id] = {
                "film_id": film.get("film_id") or f"tmdb:{tmdb_id}",
                "tmdb_id": tmdb_id,
                "match_status": status,
                "sources": sorted(sources),
                "normalized_title": film.get("normalized_title"),
            }
        else:
            existing["sources"] = sorted(set(existing["sources"]) | sources)
            if status == STATUS_CONFIRMED_MANUAL:
                existing["match_status"] = status
    return sorted(by_id.values(), key=lambda row: row["tmdb_id"])


def extract_enrichment_fields(details: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize a TMDB movie(+appended) payload into audit/contract-shaped fields."""
    credits = details.get("credits") if isinstance(details.get("credits"), Mapping) else {}
    external = (
        details.get("external_ids")
        if isinstance(details.get("external_ids"), Mapping)
        else {}
    )
    directors = [
        {
            "tmdb_person_id": person.get("id"),
            "name": person.get("name"),
        }
        for person in credits.get("crew") or []
        if isinstance(person, Mapping)
        and person.get("job") == "Director"
        and person.get("name")
    ]
    # Dedup directors by person id / name.
    seen: set[str] = set()
    unique_directors: list[dict[str, Any]] = []
    for row in directors:
        key = str(row.get("tmdb_person_id") or row.get("name"))
        if key in seen:
            continue
        seen.add(key)
        unique_directors.append(row)

    cast_rows = [
        person
        for person in credits.get("cast") or []
        if isinstance(person, Mapping) and person.get("name")
    ]
    cast_rows = sorted(
        cast_rows,
        key=lambda p: (
            p.get("order") if isinstance(p.get("order"), int) else 10_000,
            str(p.get("name") or ""),
        ),
    )
    top_cast = [
        {
            "tmdb_person_id": person.get("id"),
            "name": person.get("name"),
            "character": person.get("character"),
            "order": person.get("order"),
        }
        for person in cast_rows[:5]
    ]

    genres = []
    for genre in details.get("genres") or []:
        if not isinstance(genre, Mapping):
            continue
        name = genre.get("name")
        gid = genre.get("id")
        if not name:
            continue
        genres.append({"id": gid, "name": name})

    release_date = _opt_str(details.get("release_date"))
    release_year = None
    if release_date and len(release_date) >= 4 and release_date[:4].isdigit():
        release_year = int(release_date[:4])

    return {
        "tmdb_id": details.get("id"),
        "imdb_id": _opt_str(external.get("imdb_id")),
        "original_title": _opt_str(details.get("original_title")),
        "display_title": _opt_str(details.get("title")),
        "original_language": _opt_str(details.get("original_language")),
        "release_date": release_date,
        "release_year": release_year,
        "overview": _opt_str(details.get("overview")),
        "tagline": _opt_str(details.get("tagline")),
        "runtime": details.get("runtime") if isinstance(details.get("runtime"), int) else None,
        "genres": genres,
        "directors": unique_directors,
        "top_cast": top_cast,
        "poster_path": _opt_str(details.get("poster_path")),
        "backdrop_path": _opt_str(details.get("backdrop_path")),
        "vote_average": details.get("vote_average"),
        "vote_count": details.get("vote_count"),
        "popularity": details.get("popularity"),
        "adult": bool(details.get("adult")),
        "status": _opt_str(details.get("status")),
        "homepage": _opt_str(details.get("homepage")),
    }


def field_presence(extracted: Mapping[str, Any]) -> dict[str, bool]:
    return {
        "overview": bool(extracted.get("overview")),
        "genres": bool(extracted.get("genres")),
        "runtime": isinstance(extracted.get("runtime"), int)
        and int(extracted["runtime"]) > 0,
        "directors": bool(extracted.get("directors")),
        "imdb_id": bool(extracted.get("imdb_id"))
        and bool(_IMDB_RE.match(str(extracted.get("imdb_id")))),
        "poster_path": _valid_image_path(extracted.get("poster_path")),
        "backdrop_path": _valid_image_path(extracted.get("backdrop_path")),
        "top_cast": bool(extracted.get("top_cast")),
        "original_title": bool(extracted.get("original_title")),
        "release_date": bool(extracted.get("release_date"))
        and bool(_ISO_DATE_RE.match(str(extracted.get("release_date")))),
        "display_title": bool(extracted.get("display_title")),
        "tagline": bool(extracted.get("tagline")),
        "vote_average": isinstance(extracted.get("vote_average"), (int, float)),
        "popularity": isinstance(extracted.get("popularity"), (int, float)),
    }


def build_coverage_report(
    *,
    films: Sequence[Mapping[str, Any]],
    field_hits: Mapping[str, int],
    errors: Sequence[Mapping[str, Any]],
    generated_at: str | None = None,
    live_run: bool = False,
    limit: int | None = None,
) -> dict[str, Any]:
    total = len(films)
    coverage: dict[str, Any] = {}
    for field in AUDIT_FIELDS:
        hits = int(field_hits.get(field, 0))
        coverage[field] = {
            "present": hits,
            "missing": max(0, total - hits),
            "rate": round(hits / total, 4) if total else 0.0,
        }
    by_source: dict[str, int] = {}
    for film in films:
        for source in film.get("sources") or []:
            by_source[str(source)] = by_source.get(str(source), 0) + 1

    report = {
        "schema_version": "1.0.0",
        "generated_at": generated_at
        or datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "provider": "tmdb",
        "live_run": live_run,
        "limit": limit,
        "total_confirmed_tmdb_films": total,
        "field_coverage": coverage,
        "by_source_identity_touch": dict(sorted(by_source.items())),
        "error_count": len(errors),
        "errors": list(errors)[:50],
        "notes": [
            "Counts are unique confirmed tmdb_id values (manual + automatic).",
            "Source-backed unmatched/non_film identities are excluded.",
            "Audit artifact only — not public product data.",
        ],
    }
    assert_no_tmdb_secret_leakage(report)
    return report


def write_coverage(report: Mapping[str, Any], path: Path | None = None) -> Path:
    target = path or (PROJECT_ROOT / COVERAGE_REL)
    atomic_write_json(target, dict(report))
    return target


def validate_proposed_enrichment_record(record: Mapping[str, Any]) -> None:
    """Lightweight contract checks for the proposed public enrichment row shape."""
    film_id = record.get("film_id")
    if not isinstance(film_id, str) or not film_id.startswith("tmdb:"):
        raise ValueError("film_id must be namespaced tmdb:<id>")
    tmdb_id = record.get("tmdb_id")
    if not isinstance(tmdb_id, int) or tmdb_id < 1:
        raise ValueError("tmdb_id must be positive int")
    if film_id != f"tmdb:{tmdb_id}":
        raise ValueError("film_id must match tmdb_id")
    imdb = record.get("imdb_id")
    if imdb is not None and not _IMDB_RE.match(str(imdb)):
        raise ValueError(f"invalid imdb_id: {imdb!r}")
    release = record.get("release_date")
    if release is not None and not _ISO_DATE_RE.match(str(release)):
        raise ValueError(f"invalid release_date: {release!r}")
    for key in ("poster", "backdrop"):
        image = record.get(key)
        if image is None:
            continue
        if not isinstance(image, Mapping):
            raise ValueError(f"{key} must be object or null")
        path = image.get("path")
        if path is not None and not _valid_image_path(path):
            raise ValueError(f"invalid {key}.path: {path!r}")
    genres = record.get("genres") or []
    names = [g.get("name") for g in genres if isinstance(g, Mapping)]
    if len(names) != len(set(names)):
        raise ValueError("duplicate genre names")
    directors = record.get("directors") or []
    dir_keys = [
        str(d.get("tmdb_person_id") or d.get("name"))
        for d in directors
        if isinstance(d, Mapping)
    ]
    if len(dir_keys) != len(set(dir_keys)):
        raise ValueError("duplicate directors")
    provenance = record.get("provenance")
    if not isinstance(provenance, Mapping) or provenance.get("provider") != "tmdb":
        raise ValueError("provenance.provider must be tmdb")
    if not provenance.get("fetched_at"):
        raise ValueError("provenance.fetched_at required")


def _source_names(film: Mapping[str, Any]) -> set[str]:
    out: set[str] = set()
    for src in film.get("source_identities") or []:
        if isinstance(src, Mapping) and src.get("source"):
            out.add(str(src["source"]))
    return out


def _opt_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _valid_image_path(value: Any) -> bool:
    if not value:
        return False
    text = str(value)
    return bool(_IMAGE_PATH_RE.match(text) or text.startswith("/"))
