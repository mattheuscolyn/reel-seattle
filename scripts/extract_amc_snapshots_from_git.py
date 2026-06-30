#!/usr/bin/env python3
"""Extract historical AMC snapshots from Git and build a footprint CSV (PR B2).

Modeling-only: uses ``git show`` / ``git ls-tree`` without checking out old
commits. Generated outputs live under ``data/analysis/`` (gitignored).

Example:
    python scripts/extract_amc_snapshots_from_git.py --every-n 30
    python scripts/extract_amc_snapshots_from_git.py
    python scripts/extract_amc_snapshots_from_git.py \\
        --output data/analysis/amc_film_footprint_from_git.csv \\
        --inventory-output data/analysis/amc_snapshot_inventory.csv
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_footprint import (  # noqa: E402
    FOOTPRINT_FIELDNAMES,
    build_footprint_from_snapshots,
    enabled_amc_theater_names,
)
from reel_seattle.analysis.git_amc_snapshots import (  # noqa: E402
    INVENTORY_FIELDNAMES,
    default_git_runner,
    discover_snapshot_sources,
    extracted_at_timestamp,
    filter_snapshot_sources,
    inventory_rows,
    inventory_summary,
    load_snapshots_from_git,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build AMC film-footprint CSV from Git-history AMC snapshots",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=PROJECT_ROOT,
        help="Git repository root (default: project root)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/analysis/amc_film_footprint_from_git.csv"),
        help="Footprint CSV output path (gitignored)",
    )
    parser.add_argument(
        "--inventory-output",
        type=Path,
        default=Path("data/analysis/amc_snapshot_inventory.csv"),
        help="Snapshot inventory CSV path (gitignored); omit with --no-inventory-file",
    )
    parser.add_argument(
        "--no-inventory-file",
        action="store_true",
        help="Skip writing inventory CSV; print inventory summary only",
    )
    parser.add_argument(
        "--theaters",
        type=Path,
        default=Path("data/theaters.json"),
        help="Theater registry JSON",
    )
    parser.add_argument("--start-date", type=str, default="", help="YYYY-MM-DD lower bound")
    parser.add_argument("--end-date", type=str, default="", help="YYYY-MM-DD upper bound")
    parser.add_argument(
        "--every-n",
        type=int,
        default=1,
        help="Keep every Nth snapshot after date filtering (default: 1 = all)",
    )
    parser.add_argument("--limit", type=int, default=0, help="Process only first N snapshots")
    parser.add_argument(
        "--inventory-only",
        action="store_true",
        help="Print inventory summary and optional inventory CSV only",
    )
    return parser.parse_args(argv)


def _parse_optional_date(text: str):
    from datetime import date

    if not text:
        return None
    return date.fromisoformat(text)


def write_inventory_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=INVENTORY_FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def print_summary(
    *,
    inventory: dict[str, object],
    selected_count: int,
    footprint_summary: dict[str, object] | None,
    skipped_errors: list[str],
) -> None:
    print("AMC Git snapshot extraction summary")
    print(f"  recoverable snapshots (full inventory): {inventory['snapshot_count']}")
    print(f"  snapshots processed this run: {selected_count}")
    print(f"  date range: {inventory['earliest']} .. {inventory['latest']}")
    print(f"  missing dates (full inventory): {inventory['missing_count']}")
    if inventory["missing_dates"]:
        print(f"    {', '.join(inventory['missing_dates'])}")
    print("  source breakdown:")
    for kind, count in sorted(inventory["source_breakdown"].items()):
        print(f"    {kind}: {count}")
    if footprint_summary is not None:
        print(f"  footprint rows: {footprint_summary['row_count']}")
        print(f"  distinct films: {footprint_summary['film_count']}")
        print(f"  event_like rows: {footprint_summary['event_like_rows']}")
        print(f"  output: {footprint_summary['output_path']}")
    if skipped_errors:
        print(f"  skipped/problem artifacts: {len(skipped_errors)}")
        for message in skipped_errors:
            print(f"    - {message}")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = args.repo_root.resolve()

    if not (repo_root / ".git").exists():
        print(f"Error: not a git repository: {repo_root}")
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

    run_git = default_git_runner(repo_root)
    all_sources = discover_snapshot_sources(run_git)
    selected = filter_snapshot_sources(
        all_sources,
        start_date=_parse_optional_date(args.start_date),
        end_date=_parse_optional_date(args.end_date),
        every_n=max(1, args.every_n),
        limit=args.limit,
    )

    inv = inventory_summary(all_sources)
    inv_selected = inventory_summary(selected)
    inv_rows = inventory_rows(all_sources)

    if not args.no_inventory_file and args.inventory_output:
        write_inventory_csv(args.inventory_output.resolve(), inv_rows)

    if args.inventory_only:
        print_summary(
            inventory=inv,
            selected_count=len(selected),
            footprint_summary=None,
            skipped_errors=[],
        )
        if not args.no_inventory_file and args.inventory_output:
            print(f"  inventory output: {args.inventory_output.resolve()}")
        print(f"  extracted_at: {extracted_at_timestamp()}")
        return 0

    snapshots, errors = load_snapshots_from_git(selected, run_git)
    if not snapshots:
        print("Error: no snapshots could be loaded")
        for message in errors:
            print(f"  - {message}")
        return 1

    summary = build_footprint_from_snapshots(
        snapshots,
        args.output.resolve(),
        registry_path=args.theaters.resolve(),
    )

    print_summary(
        inventory=inv,
        selected_count=len(selected),
        footprint_summary=summary,
        skipped_errors=errors,
    )
    if len(selected) != inv["snapshot_count"]:
        print(
            f"  selected source breakdown: "
            f"{', '.join(f'{k}={v}' for k, v in sorted(inv_selected['source_breakdown'].items()))}"
        )
    if not args.no_inventory_file and args.inventory_output:
        print(f"  inventory output: {args.inventory_output.resolve()}")
    print(f"  footprint columns: {len(FOOTPRINT_FIELDNAMES)}")
    print(f"  enabled AMC theaters in scope: {len(enabled)}")
    print(f"  extracted_at: {extracted_at_timestamp()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
