"""Validate public film enrichment artifacts."""

from __future__ import annotations

import re
from typing import Any, Mapping

from reel_seattle.enrichment.constants import (
    ALLOWED_FILM_KEYS,
    ARTIFACT_VERSION,
    OVERVIEW_MAX_LEN,
    PROVIDER,
)
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage
from reel_seattle.validate import PROJECT_ROOT, validate_against_schema

_IMDB_RE = re.compile(r"^tt\d{7,8}$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_IMAGE_PATH_RE = re.compile(r"^/")


def validate_film_enrichment_document(doc: Mapping[str, Any]) -> None:
    """Raise on contract violations."""
    assert_no_tmdb_secret_leakage(doc)
    schema_path = (
        PROJECT_ROOT / "schema" / "film_enrichment" / "film_enrichment_current" / "v1.0.0.json"
    )
    if schema_path.exists():
        validate_against_schema(doc, schema_path, label="film_enrichment_current")

    if doc.get("version") != ARTIFACT_VERSION:
        raise ValueError(f"version must be {ARTIFACT_VERSION}")
    if doc.get("provider") != PROVIDER:
        raise ValueError("provider must be tmdb")
    if not doc.get("generated_at"):
        raise ValueError("generated_at required")
    if not doc.get("language"):
        raise ValueError("language required")
    image_config = doc.get("image_config")
    if not isinstance(image_config, Mapping):
        raise ValueError("image_config required")
    for key in ("secure_base_url", "poster_size", "backdrop_size"):
        if not image_config.get(key):
            raise ValueError(f"image_config.{key} required")

    films = doc.get("films")
    if not isinstance(films, list):
        raise ValueError("films must be an array")

    ids: list[int] = []
    film_ids: list[str] = []
    for index, film in enumerate(films):
        if not isinstance(film, Mapping):
            raise ValueError(f"films[{index}] must be an object")
        unknown = set(film.keys()) - ALLOWED_FILM_KEYS
        if unknown:
            raise ValueError(f"films[{index}] disallowed fields: {sorted(unknown)}")
        _validate_film_row(film, image_config=image_config, index=index)
        ids.append(int(film["tmdb_id"]))
        film_ids.append(str(film["film_id"]))

    if ids != sorted(ids):
        raise ValueError("films must be sorted by tmdb_id ascending")
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate tmdb_id values")
    if len(film_ids) != len(set(film_ids)):
        raise ValueError("duplicate film_id values")


def _validate_film_row(
    film: Mapping[str, Any],
    *,
    image_config: Mapping[str, Any],
    index: int,
) -> None:
    tmdb_id = film.get("tmdb_id")
    if not isinstance(tmdb_id, int) or tmdb_id < 1:
        raise ValueError(f"films[{index}].tmdb_id invalid")
    film_id = film.get("film_id")
    if film_id != f"tmdb:{tmdb_id}":
        raise ValueError(f"films[{index}].film_id must equal tmdb:{tmdb_id}")
    if str(film_id).startswith("source:") or str(film_id).startswith("source-key:"):
        raise ValueError(f"films[{index}] source fallback identities are not allowed")

    imdb = film.get("imdb_id")
    if imdb is not None and not _IMDB_RE.match(str(imdb)):
        raise ValueError(f"films[{index}].imdb_id invalid")

    release = film.get("release_date")
    year = film.get("release_year")
    if release is not None:
        if not _ISO_DATE_RE.match(str(release)):
            raise ValueError(f"films[{index}].release_date invalid")
        if year is not None and year != int(str(release)[:4]):
            raise ValueError(f"films[{index}].release_year inconsistent")
    elif year is not None:
        raise ValueError(f"films[{index}].release_year requires release_date")

    overview = film.get("overview")
    if overview is not None and len(str(overview)) > OVERVIEW_MAX_LEN:
        raise ValueError(f"films[{index}].overview too long")

    genres = film.get("genres") or []
    names = [g.get("name") for g in genres if isinstance(g, Mapping)]
    if len(names) != len(set(names)):
        raise ValueError(f"films[{index}] duplicate genres")

    directors = film.get("directors") or []
    dir_keys = [
        str(d.get("tmdb_person_id") or d.get("name"))
        for d in directors
        if isinstance(d, Mapping)
    ]
    if len(dir_keys) != len(set(dir_keys)):
        raise ValueError(f"films[{index}] duplicate directors")

    for key in ("poster", "backdrop"):
        image = film.get(key)
        if image is None:
            continue
        if not isinstance(image, Mapping):
            raise ValueError(f"films[{index}].{key} must be object or null")
        path = image.get("path")
        if path is not None and not _IMAGE_PATH_RE.match(str(path)):
            raise ValueError(f"films[{index}].{key}.path invalid")
        url = image.get("url")
        if path and url:
            size = image_config["poster_size" if key == "poster" else "backdrop_size"]
            expected = f"{str(image_config['secure_base_url']).rstrip('/')}/{size}{path}"
            if str(url) != expected:
                raise ValueError(f"films[{index}].{key}.url does not match config+path")

    provenance = film.get("provenance")
    if not isinstance(provenance, Mapping):
        raise ValueError(f"films[{index}].provenance required")
    if provenance.get("provider") != PROVIDER:
        raise ValueError(f"films[{index}].provenance.provider must be tmdb")
    if not provenance.get("fetched_at"):
        raise ValueError(f"films[{index}].provenance.fetched_at required")
