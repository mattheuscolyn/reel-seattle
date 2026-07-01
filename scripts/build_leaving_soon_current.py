#!/usr/bin/env python3
"""Build ``public/data/leaving_soon_current.json`` for product review (PR E)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.emit.leaving_soon import (  # noqa: E402
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SHOWTIMES_CURRENT_PATH,
    load_showtimes_current,
    write_leaving_soon_current,
)
from reel_seattle.validate import validate_theaters_registry_file  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Emit leaving_soon_current.json using visible_dates_le_1 heuristic.",
    )
    parser.add_argument(
        "--showtimes-current",
        type=Path,
        default=DEFAULT_SHOWTIMES_CURRENT_PATH,
        help="Path to showtimes_current.json input",
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path("data/theaters.json"),
        help="Path to theaters registry JSON",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Output path for leaving_soon_current.json",
    )
    parser.add_argument(
        "--include-event-like",
        action="store_true",
        help="Include event-like titles (excluded by default)",
    )
    args = parser.parse_args()

    current_artifact = load_showtimes_current(args.showtimes_current)
    registry = validate_theaters_registry_file(args.registry)

    artifact = write_leaving_soon_current(
        current_artifact,
        registry=registry,
        output_path=args.output,
        exclude_event_like=not args.include_event_like,
    )

    print(f"Wrote {args.output}")
    print(
        f"  {artifact['stats']['flagged_film_count']} flagged / "
        f"{artifact['stats']['candidate_film_count']} AMC candidate films"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
