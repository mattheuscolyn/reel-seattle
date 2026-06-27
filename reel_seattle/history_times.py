"""Additive history time enrichment for showtime CSV rows."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from reel_seattle.normalize import parse_time


@dataclass
class TimeEnrichmentStats:
    total_rows: int = 0
    time_24h_populated: int = 0
    time_24h_blank: int = 0
    unparsed_time_values: list[str] = field(default_factory=list)


def derive_time_24h(row: Mapping[str, Any]) -> str | None:
    """Derive canonical ``HH:MM`` from a history row's legacy ``Time`` value."""
    parsed = parse_time(row.get("Time", ""))
    if parsed is None:
        return None
    return parsed.time_24h


def is_valid_stored_time_24h(value: Any) -> bool:
    """Return True when *value* is a parseable canonical 24-hour clock time."""
    text = str(value or "").strip()
    if not text:
        return False
    parsed = parse_time(text)
    return parsed is not None and parsed.time_24h == text


def enrich_history_row_time(
    row: dict[str, Any],
    *,
    overwrite: bool = False,
    log_warnings: bool = False,
) -> str:
    """Populate ``time_24h`` on *row* without modifying legacy ``Time``."""
    stored = str(row.get("time_24h", "")).strip()
    if stored and is_valid_stored_time_24h(stored) and not overwrite:
        row["time_24h"] = stored
        return stored

    derived = derive_time_24h(row)
    time_24h = derived or ""
    row["time_24h"] = time_24h

    if log_warnings and not time_24h:
        legacy_time = str(row.get("Time", "")).strip() or "(blank time)"
        print(f"Warning: could not parse time_24h from Time={legacy_time!r}")

    return time_24h


def enrich_history_rows_time(
    rows: list[dict[str, Any]],
    *,
    overwrite: bool = False,
    log_warnings: bool = False,
    unparsed_example_limit: int = 10,
) -> TimeEnrichmentStats:
    """Enrich all rows and return summary counts."""
    stats = TimeEnrichmentStats(total_rows=len(rows))

    for row in rows:
        time_24h = enrich_history_row_time(
            row,
            overwrite=overwrite,
            log_warnings=log_warnings,
        )
        if time_24h:
            stats.time_24h_populated += 1
        else:
            stats.time_24h_blank += 1
            legacy_time = str(row.get("Time", "")).strip()
            if legacy_time and len(stats.unparsed_time_values) < unparsed_example_limit:
                if legacy_time not in stats.unparsed_time_values:
                    stats.unparsed_time_values.append(legacy_time)

    return stats
