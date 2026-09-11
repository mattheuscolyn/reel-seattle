#!/usr/bin/env python3
"""Build public/data/collections_current.json from source collection pages.

Examples:
  python scripts/build_collections_current.py
  python scripts/build_collections_current.py --offline
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.collections.pipeline import (  # noqa: E402
    build_collections_current,
    run_collections_pipeline,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build indie theater collections artifact.")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Do not fetch live pages; rebuild from previously discovered state only.",
    )
    parser.add_argument(
        "--no-stamp-showtimes",
        action="store_true",
        help="Do not write attributes.collection_ids onto showtimes_current.json.",
    )
    parser.add_argument("--sleep-seconds", type=float, default=0.25)
    parser.add_argument("--stdout", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.offline:
        from reel_seattle.collections.model import SourceDiscoveryResult

        artifact = build_collections_current(
            results={
                source: SourceDiscoveryResult(source=source, ok=False)
                for source in ("siff", "beacon", "nwff")
            },
            stamp_showtimes=not args.no_stamp_showtimes,
            sleep_seconds=0.0,
        )
    else:
        artifact = run_collections_pipeline(
            sleep_seconds=args.sleep_seconds,
            stamp_showtimes=not args.no_stamp_showtimes,
        )
    summary = artifact.get("stats") or {}
    if args.stdout:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print(
            "Wrote collections_current.json: "
            f"{summary.get('collection_count', 0)} collections, "
            f"{summary.get('membership_count', 0)} memberships, "
            f"{summary.get('canonical_film_count', 0)} canonical films"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
