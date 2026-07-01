#!/usr/bin/env python3
"""Build weekly-extension Leaving Soon labels from AMC footprint snapshots (PR C2)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.weekly_leaving_soon_labels import (  # noqa: E402
    WEEKLY_LABEL_FIELDNAMES,
    WeeklyLabelBuildConfig,
    build_weekly_labels_from_footprint_csv,
)


def _parse_weekdays(text: str) -> frozenset[int]:
    names = {
        "mon": 0,
        "monday": 0,
        "tue": 1,
        "tuesday": 1,
        "wed": 2,
        "wednesday": 2,
        "thu": 3,
        "thursday": 3,
        "fri": 4,
        "friday": 4,
        "sat": 5,
        "saturday": 5,
        "sun": 6,
        "sunday": 6,
    }
    weekdays: set[int] = set()
    for token in text.split(","):
        key = token.strip().lower()
        if not key:
            continue
        if key not in names:
            raise argparse.ArgumentTypeError(f"unknown weekday: {token!r}")
        weekdays.add(names[key])
    if not weekdays:
        raise argparse.ArgumentTypeError("at least one weekday is required")
    return frozenset(weekdays)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build weekly-extension Leaving Soon labels from footprint CSV",
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
        default=Path("data/analysis/weekly_leaving_soon_labels.csv"),
        help="Output labels CSV path (gitignored)",
    )
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_label_summary.json"),
        help="Optional JSON summary path (gitignored)",
    )
    parser.add_argument(
        "--no-summary-file",
        action="store_true",
        help="Skip writing JSON summary file",
    )
    parser.add_argument(
        "--anchor-days",
        type=_parse_weekdays,
        default=_parse_weekdays("Tue"),
        help="Comma-separated pre-update anchor weekdays (default: Tue)",
    )
    parser.add_argument(
        "--exclude-event-like",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Exclude event-like films from labeled training rows",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.input.is_file():
        print(f"Error: input footprint CSV not found: {args.input}")
        print("Run: python scripts/extract_amc_snapshots_from_git.py")
        return 1

    config = WeeklyLabelBuildConfig(
        anchor_weekdays=args.anchor_days,
        exclude_event_like=args.exclude_event_like,
    )
    summary = build_weekly_labels_from_footprint_csv(
        args.input.resolve(),
        args.output.resolve(),
        summary_output=None if args.no_summary_file else args.summary_output.resolve(),
        config=config,
    )

    print(f"Wrote {summary['output_path']}")
    print(f"  label mode: {summary['label_mode']}")
    print(f"  footprint rows: {summary['footprint_row_count']}")
    print(f"  candidate anchor rows: {summary['candidate_anchor_rows']}")
    print(f"  labeled rows: {summary['labeled_rows']}")
    print(f"  leaving soon positives: {summary['leaving_soon_positives']}")
    print(f"  not leaving soon negatives: {summary['not_leaving_soon_negatives']}")
    print(f"  label rate (leaving soon): {summary['label_rate_leaving_soon']:.2%}")
    print(
        "  anchor date range: "
        f"{summary['anchor_date_range']['earliest']} .. {summary['anchor_date_range']['latest']}"
    )
    print(f"  distinct films: {summary['distinct_films']}")
    print(f"  label columns: {len(WEEKLY_LABEL_FIELDNAMES)}")
    if summary.get("summary_output_path"):
        print(f"  summary: {summary['summary_output_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
