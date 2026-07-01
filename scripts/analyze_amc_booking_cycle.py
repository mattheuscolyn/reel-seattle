#!/usr/bin/env python3
"""Analyze AMC booking-cycle timing from footprint snapshots (PR C2)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_booking_cycle import (  # noqa: E402
    analyze_booking_cycle_csv,
    write_booking_cycle_report,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze when AMC films' max show dates extend across snapshots.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/analysis/amc_film_footprint_from_git.csv"),
        help="Input footprint CSV path",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/analysis/amc_booking_cycle_report.json"),
        help="Output JSON report path (gitignored)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.input.is_file():
        print(f"Error: input footprint CSV not found: {args.input}")
        print("Run: python scripts/extract_amc_snapshots_from_git.py")
        return 1

    report = analyze_booking_cycle_csv(args.input.resolve())
    write_booking_cycle_report(report, args.output.resolve())

    weekday = report["observed_on_weekday"]
    print(f"Wrote {args.output}")
    print(f"  extension events (any horizon increase): {report['extension_event_count']}")
    print(f"  dominant observed weekday: {weekday['dominant_weekday_name']} ({weekday['dominant_weekday_share']:.1%})")
    for entry in weekday["by_weekday"]:
        if entry["extension_event_count"]:
            print(
                f"    {entry['weekday_name']}: {entry['extension_event_count']} "
                f"({entry['share_of_extensions']:.1%})"
            )
    crossing = report["week_crossing_observed_on_weekday"]
    print(
        f"  week-crossing extension events: {report['week_crossing_extension_event_count']} "
        f"(dominant {crossing['dominant_weekday_name']} {crossing['dominant_weekday_share']:.1%})"
    )
    interpretation = report["week_crossing_interpretation"]
    print(f"  Thursday observation share: {interpretation['thursday_observation_share']:.1%}")
    print(f"  Wednesday observation share: {interpretation['wednesday_observation_share']:.1%}")
    print(f"  recommendation: {interpretation['recommended_anchor_convention']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
