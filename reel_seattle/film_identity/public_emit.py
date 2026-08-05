"""Public nullable film_id emission for showtimes_current (T-FILMID-02).

Maps durable film-identity catalog rows onto public film entities using
``source_identity_key`` (``{source}|id|{source_film_id}`` preferred;
``{source}|key|{showtime_film_key}`` fallback). Only confirmed TMDB
identities are emitted publicly; unmatched/program/source fallbacks → null.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    CATALOG_REL,
    STATUS_CONFIRMED_AUTOMATIC,
    STATUS_CONFIRMED_MANUAL,
)
from reel_seattle.film_identity.decisions import source_identity_key
from reel_seattle.film_identity.ids import parse_film_id
from reel_seattle.film_identity.io_util import atomic_write_json
from reel_seattle.validate import PROJECT_ROOT

CONFIRMED_STATUSES = frozenset({STATUS_CONFIRMED_AUTOMATIC, STATUS_CONFIRMED_MANUAL})
PUBLIC_IDENTITY_EMIT_REPORT_REL = "data/audits/tmdb_public_identity_emit.json"


def load_identity_catalog(path: Path | None = None) -> dict[str, Any] | None:
    """Load catalog JSON or return None when absent/unreadable."""
    target = path or (PROJECT_ROOT / CATALOG_REL)
    if not target.is_file():
        return None
    try:
        with target.open(encoding="utf-8") as handle:
            doc = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(doc, dict) or not isinstance(doc.get("films"), list):
        return None
    return doc


def build_confirmed_tmdb_index(
    catalog: Mapping[str, Any] | None,
) -> tuple[dict[str, str], list[str]]:
    """Index ``source_identity_key`` → public ``tmdb:<id>`` for confirmed matches.

    Returns ``(index, warnings)``. Non-confirmed / non-tmdb catalog rows are omitted
    (public emit stays null for those observations).
    """
    index: dict[str, str] = {}
    warnings: list[str] = []
    if not catalog:
        return index, ["identity_catalog_missing"]

    for film in catalog.get("films") or []:
        if not isinstance(film, Mapping):
            continue
        status = film.get("match_status")
        if status not in CONFIRMED_STATUSES:
            continue
        if film.get("identity_type") != "tmdb":
            continue
        film_id = film.get("film_id")
        try:
            parsed = parse_film_id(film_id)
        except ValueError:
            warnings.append(f"invalid_catalog_film_id:{film_id!r}")
            continue
        if parsed.identity_type != "tmdb" or parsed.tmdb_id is None:
            warnings.append(f"non_tmdb_confirmed_skipped:{film_id!r}")
            continue
        public_id = parsed.film_id
        for src in film.get("source_identities") or []:
            if not isinstance(src, Mapping):
                continue
            try:
                key = source_identity_key(src)
            except Exception:  # noqa: BLE001
                warnings.append("invalid_source_identity_row")
                continue
            existing = index.get(key)
            if existing is None:
                index[key] = public_id
            elif existing != public_id:
                warnings.append(f"catalog_index_collision:{key}:{existing}|{public_id}")
    return index, warnings


def observation_key(
    *,
    source: str | None,
    source_film_id: str | None,
    showtime_film_key: str | None,
) -> str | None:
    """Build the durable inventory/decision key for one public observation."""
    src = str(source or "").strip()
    if not src:
        return None
    sid = str(source_film_id).strip() if source_film_id not in (None, "") else None
    key = str(showtime_film_key).strip() if showtime_film_key not in (None, "") else None
    try:
        return source_identity_key(
            {
                "source": src,
                "source_film_id": sid,
                "showtime_film_key": key,
            }
        )
    except Exception:  # noqa: BLE001
        return None


def resolve_public_film_id(
    observations: Sequence[Mapping[str, Any]],
    index: Mapping[str, str],
) -> tuple[str | None, list[str]]:
    """Resolve one public film entity's nullable ``film_id`` from showtimes observations.

    Confirmed TMDB hits must agree. Conflicts → null + warning. Misses → null.
    """
    warnings: list[str] = []
    resolved: set[str] = set()
    looked_up = False
    for obs in observations:
        key = observation_key(
            source=obs.get("source"),
            source_film_id=obs.get("source_film_id"),
            showtime_film_key=obs.get("showtime_film_key"),
        )
        if key is None:
            continue
        looked_up = True
        hit = index.get(key)
        if hit:
            resolved.add(hit)
    if len(resolved) > 1:
        warnings.append(
            "film_id_collision:" + "|".join(sorted(resolved))
        )
        return None, warnings
    if len(resolved) == 1:
        return next(iter(resolved)), warnings
    if not looked_up:
        warnings.append("no_source_observation")
    return None, warnings


def attach_public_film_ids(
    films: list[dict[str, Any]],
    showtimes: Sequence[Mapping[str, Any]],
    *,
    catalog: Mapping[str, Any] | None = None,
    catalog_path: Path | None = None,
) -> dict[str, Any]:
    """Mutate ``films`` in place with nullable ``film_id``; return emit report metrics."""
    loaded = catalog if catalog is not None else load_identity_catalog(catalog_path)
    index, index_warnings = build_confirmed_tmdb_index(loaded)

    by_film_key: dict[str, list[dict[str, Any]]] = {}
    for showtime in showtimes:
        film_key = str(showtime.get("showtime_film_key") or "").strip()
        if not film_key:
            continue
        by_film_key.setdefault(film_key, []).append(dict(showtime))

    warnings = list(index_warnings)
    non_null = 0
    null_count = 0
    tmdb_ids: set[int] = set()
    per_source: dict[str, dict[str, int]] = {}
    mapping_misses = 0
    collisions = 0
    canonical_counts: dict[str, int] = {}

    for film in films:
        film_key = str(film.get("showtime_film_key") or "").strip()
        observations = by_film_key.get(film_key) or []
        # Prefer attaching observations from showtimes; if empty, try film fields alone.
        if not observations:
            observations = [
                {
                    "source": None,
                    "source_film_id": film.get("source_film_id"),
                    "showtime_film_key": film_key,
                }
            ]
        film_id, film_warnings = resolve_public_film_id(observations, index)
        for message in film_warnings:
            warnings.append(f"{film_key}:{message}")
            if "collision" in message:
                collisions += 1
        film["film_id"] = film_id
        if film_id:
            non_null += 1
            try:
                tmdb_ids.add(parse_film_id(film_id).tmdb_id or 0)
            except ValueError:
                warnings.append(f"{film_key}:invalid_emitted_film_id:{film_id}")
            canonical_counts[film_id] = canonical_counts.get(film_id, 0) + 1
        else:
            null_count += 1
            if any("collision" not in w for w in film_warnings) or not film_warnings:
                mapping_misses += 1

        # Per-source tallies from observations that contributed to this film.
        sources_seen: set[str] = set()
        for obs in observations:
            src = str(obs.get("source") or "").strip()
            if src:
                sources_seen.add(src)
        for src in sources_seen:
            bucket = per_source.setdefault(src, {"films": 0, "with_film_id": 0, "null_film_id": 0})
            bucket["films"] += 1
            if film_id:
                bucket["with_film_id"] += 1
            else:
                bucket["null_film_id"] += 1

    repeated_canonical = sum(1 for count in canonical_counts.values() if count > 1)
    total = len(films)
    report = {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "status": "ok",
        "catalog_path": CATALOG_REL,
        "total_public_films": total,
        "non_null_film_id": non_null,
        "null_film_id": null_count,
        "coverage_rate": (non_null / total) if total else 0.0,
        "unique_tmdb_ids": len({tid for tid in tmdb_ids if tid}),
        "repeated_canonical_across_films": repeated_canonical,
        "mapping_misses": mapping_misses,
        "collisions": collisions,
        "invalid_identities": sum(1 for w in warnings if "invalid" in w),
        "source_fallback_emitted": 0,
        "per_source": {key: per_source[key] for key in sorted(per_source)},
        "index_size": len(index),
        "warnings": warnings[:200],
        "warning_count": len(warnings),
        "notes": [
            "Public film_id emits confirmed tmdb:<id> only; unmatched/program → null.",
            "Mapping key is source_identity_key (source|id|sid preferred).",
            "showtime_film_key and source_film_id remain unchanged.",
            "Saved/Seen/NI readers prefer filmId with showtimeFilmKey aliases (T-FILMID-03).",
            "Film Detail / Home / Search join enrichment by exact filmId only.",
        ],
    }
    return report


def write_identity_emit_report(
    report: Mapping[str, Any],
    *,
    path: Path | None = None,
) -> Path:
    target = path or (PROJECT_ROOT / PUBLIC_IDENTITY_EMIT_REPORT_REL)
    atomic_write_json(target, report)
    return target


def assert_public_film_id_attach_not_regressed(
    root: Path | None = None,
    *,
    showtimes_doc: Mapping[str, Any] | None = None,
    catalog: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Fail when confirmed catalog matches exist but public emit attached zero film_ids.

    Does **not** require 100% coverage. Only catches the regression where attach is
    skipped/broken while durable confirmed TMDB matches are available for the window.
    """
    project_root = root or PROJECT_ROOT
    if showtimes_doc is None:
        showtimes_path = project_root / "public" / "data" / "showtimes_current.json"
        if not showtimes_path.is_file():
            return {"status": "skipped", "reason": "showtimes_missing"}
        with showtimes_path.open(encoding="utf-8") as handle:
            showtimes_doc = json.load(handle)
    if catalog is None:
        catalog = load_identity_catalog(project_root / CATALOG_REL)

    films = list(showtimes_doc.get("films") or [])
    showtimes = list(showtimes_doc.get("showtimes") or [])
    if not films:
        return {"status": "skipped", "reason": "no_films"}

    index, _warnings = build_confirmed_tmdb_index(catalog)
    if not index:
        return {
            "status": "ok",
            "reason": "no_confirmed_catalog_matches",
            "index_size": 0,
            "non_null_film_id": 0,
            "attachable_aliases": 0,
        }

    # How many public films could attach via source aliases present in this window?
    attachable = 0
    for film in films:
        film_key = str(film.get("showtime_film_key") or "").strip()
        observations = [
            st
            for st in showtimes
            if str(st.get("showtime_film_key") or "").strip() == film_key
        ]
        if not observations:
            observations = [
                {
                    "source": None,
                    "source_film_id": film.get("source_film_id"),
                    "showtime_film_key": film_key,
                }
            ]
        film_id, _ = resolve_public_film_id(observations, index)
        if film_id:
            attachable += 1

    non_null = sum(1 for film in films if film.get("film_id"))
    result = {
        "status": "ok",
        "index_size": len(index),
        "attachable_aliases": attachable,
        "non_null_film_id": non_null,
        "total_films": len(films),
    }
    if attachable > 0 and non_null == 0:
        raise ValueError(
            "public film_id attach regression: identity catalog has confirmed TMDB "
            f"matches and {attachable} current-window source aliases are attachable, "
            "but emitted public films contain zero film_id values"
        )
    return result
