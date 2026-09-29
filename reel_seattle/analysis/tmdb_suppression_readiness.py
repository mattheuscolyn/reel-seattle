"""Audit whether TMDB-null identities are safe to suppress from film surfaces.

The key distinction is deliberate:
- an explicit program/non-film classification can be suppressed by product policy;
- a missing TMDB match alone is never evidence that an identity is not a film.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.film_identity.constants import (
    ENTITY_FEATURE_FILM,
    ENTITY_SHORT_FILM,
    STATUS_DEFERRED,
    STATUS_ERROR,
    STATUS_MULTIPLE_SHORTS,
    STATUS_NON_FILM,
    STATUS_REJECTED,
    STATUS_REVIEW_REQUIRED,
    STATUS_UNMATCHED,
)

SCHEMA_VERSION = "1.0.0"

UNRESOLVED_MOVIE_STATUSES = frozenset(
    {
        STATUS_UNMATCHED,
        STATUS_REVIEW_REQUIRED,
        STATUS_DEFERRED,
        STATUS_REJECTED,
        STATUS_ERROR,
    }
)
MOVIE_ENTITY_KINDS = frozenset({ENTITY_FEATURE_FILM, ENTITY_SHORT_FILM})


class SuppressionReadinessAuditError(ValueError):
    """Raised for malformed suppression-readiness inputs."""


def _source_identity(film: Mapping[str, Any]) -> Mapping[str, Any]:
    rows = film.get("source_identities") or []
    if rows and isinstance(rows[0], Mapping):
        return rows[0]
    return {}


def _sample(film: Mapping[str, Any]) -> dict[str, Any]:
    source = _source_identity(film)
    return {
        "source": source.get("source"),
        "source_film_id": source.get("source_film_id"),
        "source_title": source.get("source_title"),
        "normalized_title": film.get("normalized_title"),
        "match_status": film.get("match_status"),
        "eligibility": film.get("eligibility"),
        "entity_kind": film.get("entity_kind"),
        "runtime_min": film.get("runtime_min"),
        "year_hint": film.get("year_hint"),
    }


def audit_tmdb_suppression_readiness(
    catalog: Mapping[str, Any],
    *,
    sample_limit: int = 25,
) -> dict[str, Any]:
    """Return a deterministic report for a proposed null-TMDB suppression gate."""
    films = catalog.get("films") or []
    if not isinstance(films, list):
        raise SuppressionReadinessAuditError("catalog films must be an array")

    no_tmdb: list[Mapping[str, Any]] = []
    explicit_programs: list[Mapping[str, Any]] = []
    unsafe_movie_like: list[Mapping[str, Any]] = []
    unresolved_other: list[Mapping[str, Any]] = []

    for film in films:
        if not isinstance(film, Mapping):
            continue
        if isinstance(film.get("tmdb_id"), int):
            continue

        no_tmdb.append(film)
        status = str(film.get("match_status") or "")
        eligibility = str(film.get("eligibility") or "")
        entity_kind = str(film.get("entity_kind") or "")

        explicitly_non_film = (
            status in {STATUS_NON_FILM, STATUS_MULTIPLE_SHORTS}
            or eligibility == "non_film"
        )
        movie_like = entity_kind in MOVIE_ENTITY_KINDS or eligibility == "eligible"
        unresolved_movie = status in UNRESOLVED_MOVIE_STATUSES and movie_like

        if explicitly_non_film and not movie_like:
            explicit_programs.append(film)
        elif unresolved_movie or movie_like:
            unsafe_movie_like.append(film)
        else:
            unresolved_other.append(film)

    status_counts = Counter(str(film.get("match_status") or "unknown") for film in no_tmdb)
    source_counts = Counter(
        str(_source_identity(film).get("source") or "unknown")
        for film in unsafe_movie_like
    )
    entity_counts = Counter(
        str(film.get("entity_kind") or "unknown") for film in unsafe_movie_like
    )

    blanket_safe = not unsafe_movie_like and not unresolved_other

    return {
        "schema_version": SCHEMA_VERSION,
        "catalog_generated_at": catalog.get("generated_at"),
        "catalog_identity_count": len(
            [film for film in films if isinstance(film, Mapping)]
        ),
        "without_tmdb_count": len(no_tmdb),
        "without_tmdb_status_counts": dict(sorted(status_counts.items())),
        "explicit_program_without_tmdb_count": len(explicit_programs),
        "movie_like_without_tmdb_count": len(unsafe_movie_like),
        "other_unresolved_without_tmdb_count": len(unresolved_other),
        "movie_like_without_tmdb_by_source": dict(sorted(source_counts.items())),
        "movie_like_without_tmdb_entity_counts": dict(sorted(entity_counts.items())),
        "blanket_null_tmdb_suppression_safe": blanket_safe,
        "recommended_suppression_basis": "explicit_non_film_or_program_classification",
        "unsafe_movie_like_samples": [
            _sample(film) for film in unsafe_movie_like[:sample_limit]
        ],
        "other_unresolved_samples": [
            _sample(film) for film in unresolved_other[:sample_limit]
        ],
        "explicit_program_samples": [
            _sample(film) for film in explicit_programs[:sample_limit]
        ],
    }


def load_catalog(path: Path | str) -> dict[str, Any]:
    catalog_path = Path(path)
    payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SuppressionReadinessAuditError("catalog must be a JSON object")
    return payload


def write_audit(report: Mapping[str, Any], path: Path | str) -> Path:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output
