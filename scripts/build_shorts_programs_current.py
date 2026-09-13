#!/usr/bin/env python3
"""Build public/data/shorts_programs_current.json from NWFF program pages.

Examples:
  python scripts/build_shorts_programs_current.py
  python scripts/build_shorts_programs_current.py --offline
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.shorts_programs.model import ShortsDiscoveryResult  # noqa: E402
from reel_seattle.shorts_programs.pipeline import (  # noqa: E402
    build_shorts_programs_current,
    run_shorts_programs_pipeline,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build NWFF shorts programs artifact.")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Do not fetch live pages; rebuild from previously discovered state only.",
    )
    parser.add_argument(
        "--no-stamp-showtimes",
        action="store_true",
        help="Do not stamp content_classification onto showtimes_current.json films.",
    )
    parser.add_argument("--sleep-seconds", type=float, default=0.25)
    parser.add_argument("--stdout", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.offline:
        artifact = build_shorts_programs_current(
            result=ShortsDiscoveryResult(source="nwff", ok=False),
            stamp_showtimes=not args.no_stamp_showtimes,
            sleep_seconds=0.0,
        )
    else:
        artifact = run_shorts_programs_pipeline(
            sleep_seconds=args.sleep_seconds,
            stamp_showtimes=not args.no_stamp_showtimes,
        )
    summary = artifact.get("stats") or {}
    if args.stdout:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print(
            "Wrote shorts_programs_current.json: "
            f"{summary.get('shorts_program_count', 0)} programs, "
            f"{summary.get('short_count', 0)} shorts, "
            f"{summary.get('membership_count', 0)} memberships"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
