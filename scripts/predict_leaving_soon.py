#!/usr/bin/env python3
"""Run frozen Leaving Soon v1 inference and publish artifacts when safe.

Daily production calls the same publisher from ``daily_processor.py`` after
the AMC scrape. This CLI is for local dry-runs and recovery.

Example:
  python scripts/predict_leaving_soon.py
"""

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
    publish_leaving_soon_current,
)
from reel_seattle.analysis.leaving_soon_inference import (  # noqa: E402
    DEFAULT_SNAPSHOT_DIR,
)
from reel_seattle.validate import validate_theaters_registry_file  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Publish Leaving Soon predictions from the frozen v1 model.",
    )
    parser.add_argument(
        "--showtimes-current",
        type=Path,
        default=DEFAULT_SHOWTIMES_CURRENT_PATH,
    )
    parser.add_argument("--registry", type=Path, default=Path("data/theaters.json"))
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--snapshot-dir", type=Path, default=DEFAULT_SNAPSHOT_DIR)
    args = parser.parse_args(argv)

    current_artifact = load_showtimes_current(args.showtimes_current)
    registry = validate_theaters_registry_file(args.registry)
    result = publish_leaving_soon_current(
        current_artifact,
        registry=registry,
        output_path=args.output,
        snapshot_dir=args.snapshot_dir,
    )
    if result.get("published"):
        artifact = result["artifact"]
        stats = artifact["stats"]
        print(f"Wrote {args.output}")
        print(
            f"  {stats['flagged_film_count']} public badges "
            f"({stats.get('last_chance_count', 0)} last chance / "
            f"{stats.get('leaving_soon_count', 0)} leaving soon)"
        )
        print(f"  snapshot {result['snapshot_path']}")
        return 0
    print(
        "Did not publish a new public Leaving Soon artifact "
        f"({result.get('skipped_reason')})"
    )
    if result.get("snapshot_path"):
        print(f"  snapshot {result['snapshot_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
