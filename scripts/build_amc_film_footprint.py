#!/usr/bin/env python3
"""Derive AMC film-footprint CSV from normalized daily scrape logs (PR B).

Modeling-only: not used by the production pipeline or frontend.

Example:
    python scripts/build_amc_film_footprint.py
    python scripts/build_amc_film_footprint.py \\
        --input-dir data/daily_logs \\
        --output data/analysis/amc_film_footprint_daily.csv \\
        --theaters data/theaters.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_footprint import (  # noqa: E402
    FOOTPRINT_FIELDNAMES,
    build_footprint_from_logs,
    enabled_amc_theater_names,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build AMC film-footprint daily CSV from data/daily_logs/*_amc.json",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("data/daily_logs"),
        help="Directory containing YYYY-MM-DD_amc.json scrape logs",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/analysis/amc_film_footprint_daily.csv"),
        help="Output CSV path (gitignored under data/analysis/)",
    )
    parser.add_argument(
        "--theaters",
        type=Path,
        default=Path("data/theaters.json"),
        help="Theater registry JSON (enabled AMC theaters define v1 scope)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not args.input_dir.is_dir():
        print(f"Error: input directory not found: {args.input_dir}")
        return 1
    if not args.theaters.is_file():
        print(f"Error: theater registry not found: {args.theaters}")
        return 1

    import json

    registry = json.loads(args.theaters.read_text(encoding="utf-8"))
    enabled = enabled_amc_theater_names(registry)
    if not enabled:
        print("Error: no enabled AMC theaters in registry")
        return 1

    summary = build_footprint_from_logs(
        args.input_dir,
        args.output,
        registry_path=args.theaters,
    )

    if summary["snapshot_count"] == 0:
        print(f"Warning: no *_amc.json logs found in {args.input_dir}")

    print(f"Wrote {summary['output_path']}")
    print(f"  snapshots: {summary['snapshot_count']}")
    print(f"  snapshot dates: {', '.join(summary['snapshot_dates']) or '(none)'}")
    print(f"  footprint rows: {summary['row_count']}")
    print(f"  distinct films: {summary['film_count']}")
    print(f"  event_like rows: {summary['event_like_rows']}")
    print(f"  enabled AMC theaters in scope: {len(enabled)}")
    print(f"  columns: {len(FOOTPRINT_FIELDNAMES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
