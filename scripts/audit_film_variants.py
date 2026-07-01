#!/usr/bin/env python3
"""Audit film title variants vs inferred parent titles (PR Identity-A)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.film_variant_audit import run_variant_audit  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit parent/variant film title splits")
    parser.add_argument(
        "--showtimes-current",
        type=Path,
        default=Path("public/data/showtimes_current.json"),
    )
    parser.add_argument(
        "--footprint-csv",
        type=Path,
        default=Path("data/analysis/amc_film_footprint_from_git.csv"),
    )
    parser.add_argument(
        "--csv-output",
        type=Path,
        default=Path("data/analysis/film_variant_audit.csv"),
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=Path("data/analysis/film_variant_audit_summary.json"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.showtimes_current.is_file():
        print(f"Error: showtimes_current not found: {args.showtimes_current}")
        return 1
    summary = run_variant_audit(
        showtimes_current_path=args.showtimes_current.resolve(),
        footprint_csv_path=args.footprint_csv.resolve() if args.footprint_csv.is_file() else None,
        csv_output=args.csv_output.resolve(),
        json_output=args.json_output.resolve(),
    )
    print("Film variant audit summary")
    print(f"  current distinct film keys: {summary['current_distinct_film_keys']}")
    print(f"  current variant-like keys: {summary['current_variant_like_keys']}")
    print(f"  footprint distinct film keys: {summary['footprint_distinct_film_keys']}")
    print(f"  footprint rows with amc_movie_id: {summary['footprint_with_amc_movie_id']}")
    print(f"  parent groups with multiple keys: {summary['parent_groups_with_multiple_keys']}")
    print(f"  csv: {summary['csv_output']}")
    print(f"  json: {summary['json_output']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
