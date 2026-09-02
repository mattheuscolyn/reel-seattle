#!/usr/bin/env python3
"""Build ``public/data/opening_this_week_current.json`` (review-only)."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.emit.opening_this_week import (  # noqa: E402
    DEFAULT_HISTORY_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_OVERRIDES_PATH,
    DEFAULT_REGISTRY_PATH,
    DEFAULT_SHOWTIMES_CURRENT_PATH,
    write_opening_this_week_current,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Emit opening_this_week_current.json from showtimes history "
            "(citywide earliest scheduled Date)."
        ),
    )
    parser.add_argument(
        "--history",
        type=Path,
        default=DEFAULT_HISTORY_PATH,
        help="Path to showtimes_history.csv",
    )
    parser.add_argument(
        "--showtimes-current",
        type=Path,
        default=DEFAULT_SHOWTIMES_CURRENT_PATH,
        help="Path to showtimes_current.json (visibility join only)",
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to theaters registry JSON",
    )
    parser.add_argument(
        "--overrides",
        type=Path,
        default=DEFAULT_OVERRIDES_PATH,
        help="Path to opening_overrides.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Output path for opening_this_week_current.json",
    )
    parser.add_argument(
        "--reference-date",
        type=str,
        default=None,
        help="Pacific calendar date for week membership (YYYY-MM-DD)",
    )
    args = parser.parse_args()

    reference_date = (
        date.fromisoformat(args.reference_date) if args.reference_date else None
    )

    artifact = write_opening_this_week_current(
        history_path=args.history,
        output_path=args.output,
        registry_path=args.registry,
        overrides_path=args.overrides,
        showtimes_current_path=args.showtimes_current,
        reference_date=reference_date,
    )

    stats = artifact["stats"]
    week = artifact["week"]
    print(f"Wrote {args.output}")
    print(f"  week {week['start_date']}..{week['end_date']}")
    print(
        f"  entries={stats['entry_count']} "
        f"low_confidence={stats['low_confidence_count']} "
        f"overrides={stats['override_applied_count']}"
    )
    if stats["earliest_opening_date"]:
        print(
            f"  opening_dates {stats['earliest_opening_date']}.."
            f"{stats['latest_opening_date']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
