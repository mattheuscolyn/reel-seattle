#!/usr/bin/env python3
"""Backfill additive theater_id and showtime_film_key columns in history CSV."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from daily_processor import (  # noqa: E402
    HISTORY_FIELDNAMES,
    HISTORY_PATH,
    normalize_history_row,
    read_csv,
    save_csv,
)
from reel_seattle.history_keys import enrich_history_rows, load_theater_index  # noqa: E402


def main() -> int:
    if not HISTORY_PATH.exists():
        print(f"Error: history file not found at {HISTORY_PATH}")
        return 1

    raw_rows = read_csv(str(HISTORY_PATH))
    row_count_before = len(raw_rows)
    rows = [normalize_history_row(row) for row in raw_rows]

    theater_index = load_theater_index()
    stats = enrich_history_rows(rows, theater_index, overwrite=True, log_warnings=False)

    save_csv(str(HISTORY_PATH), rows, fieldnames=HISTORY_FIELDNAMES)

    print(f"Migrated {HISTORY_PATH}")
    print(f"  total rows: {stats.total_rows}")
    print(f"  theater_id populated: {stats.theater_id_populated}")
    print(f"  theater_id unresolved: {stats.theater_id_unresolved}")
    print(f"  showtime_film_key populated: {stats.showtime_film_key_populated}")
    print(f"  showtime_film_key missing: {stats.showtime_film_key_missing}")

    if stats.total_rows != row_count_before:
        print("Error: row count changed during migration")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
