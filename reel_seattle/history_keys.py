"""Additive history key enrichment for showtime CSV rows."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.normalize import (
    TheaterIndex,
    build_theater_index,
    resolve_theater,
    showtime_film_key,
)

DEFAULT_REGISTRY_PATH = Path("data/theaters.json")


@dataclass
class EnrichmentStats:
    total_rows: int = 0
    theater_id_populated: int = 0
    theater_id_unresolved: int = 0
    showtime_film_key_populated: int = 0
    showtime_film_key_missing: int = 0
    theater_warnings: int = 0
    film_warnings: int = 0


def load_theater_index(registry_path: Path | str = DEFAULT_REGISTRY_PATH) -> TheaterIndex:
    """Load the theater registry and build a lookup index."""
    path = Path(registry_path)
    with path.open(encoding="utf-8") as handle:
        registry = json.load(handle)
    return build_theater_index(registry)


def derive_theater_id(row: Mapping[str, Any], theater_index: TheaterIndex) -> str | None:
    """Resolve ``theater_id`` from a history row's theater name."""
    resolution = resolve_theater(row.get("Theater", ""), theater_index)
    if resolution is None:
        return None
    return resolution.theater_id


def derive_showtime_film_key(row: Mapping[str, Any]) -> str | None:
    """Derive ``showtime_film_key`` from a history row's film title."""
    return showtime_film_key(row.get("Film", ""))


def enrich_history_row_keys(
    row: dict[str, Any],
    theater_index: TheaterIndex,
    *,
    overwrite: bool = False,
    log_warnings: bool = False,
) -> tuple[str, str]:
    """Populate ``theater_id`` and ``showtime_film_key`` on *row*.

    Returns ``(theater_id, showtime_film_key)`` after enrichment (blank strings
    when unresolved).
    """
    theater_id = str(row.get("theater_id", "")).strip()
    film_key = str(row.get("showtime_film_key", "")).strip()

    if not theater_id or overwrite:
        resolved = derive_theater_id(row, theater_index)
        theater_id = resolved or ""
        row["theater_id"] = theater_id
        if log_warnings and not theater_id:
            theater_name = str(row.get("Theater", "")).strip() or "(blank theater)"
            print(f"Warning: unresolved theater_id for {theater_name!r}")

    if not film_key or overwrite:
        resolved_key = derive_showtime_film_key(row)
        film_key = resolved_key or ""
        row["showtime_film_key"] = film_key
        if log_warnings and not film_key:
            film_title = str(row.get("Film", "")).strip() or "(blank film)"
            print(f"Warning: missing showtime_film_key for {film_title!r}")

    return theater_id, film_key


def enrich_history_rows(
    rows: list[dict[str, Any]],
    theater_index: TheaterIndex,
    *,
    overwrite: bool = False,
    log_warnings: bool = False,
) -> EnrichmentStats:
    """Enrich all rows and return summary counts."""
    stats = EnrichmentStats(total_rows=len(rows))

    for row in rows:
        theater_id, film_key = enrich_history_row_keys(
            row,
            theater_index,
            overwrite=overwrite,
            log_warnings=log_warnings,
        )
        if theater_id:
            stats.theater_id_populated += 1
        else:
            stats.theater_id_unresolved += 1
        if film_key:
            stats.showtime_film_key_populated += 1
        else:
            stats.showtime_film_key_missing += 1

    return stats
