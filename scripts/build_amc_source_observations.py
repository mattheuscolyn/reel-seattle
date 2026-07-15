#!/usr/bin/env python3
"""Build prototype AMC source observation artifacts from a sanitized audit.

No network access. No AMC API key.

Example:
  python scripts/build_amc_source_observations.py \\
    --input tests/fixtures/analysis/amc_source_observations/input_audit.json \\
    --output-dir local-output/amc-source-observations
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_source_observations import (  # noqa: E402
    SourceObservationError,
    build_source_observations,
    validate_source_observation_pair,
    write_source_observations,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build prototype AMC movie-product and release-observation artifacts "
            "from sanitized relationship-audit JSON."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to sanitized amc_wwm_release_audit.json (or fixture equivalent).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("local-output/amc-source-observations"),
        help="Directory for prototype JSON outputs (not committed).",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Optional fixed generated_at timestamp for deterministic tests.",
    )
    parser.add_argument(
        "--skip-validate",
        action="store_true",
        help="Skip post-build structural validation (not recommended).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = args.input
    if not input_path.is_file():
        print(f"Error: input not found: {input_path}", file=sys.stderr)
        return 1

    try:
        audit = json.loads(input_path.read_text(encoding="utf-8"))
        products, releases = build_source_observations(
            audit,
            input_path=str(input_path.as_posix()),
            generated_at=args.generated_at,
        )
        if not args.skip_validate:
            validate_source_observation_pair(products, releases)
        paths = write_source_observations(products, releases, args.output_dir)
    except (OSError, json.JSONDecodeError, SourceObservationError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print("Built prototype AMC source observations")
    print(f"  input: {input_path}")
    print(f"  products: {products['stats']['products']}")
    print(f"  with_release_id: {products['stats']['with_release_id']}")
    print(f"  without_release_id: {products['stats']['without_release_id']}")
    print(f"  special_presentations: {products['stats']['special_presentations']}")
    print(f"  release_observations: {releases['stats']['release_observations']}")
    print(f"  singleton_groups: {releases['stats']['singleton_groups']}")
    print(f"  multi_product_groups: {releases['stats']['multi_product_groups']}")
    print(f"  wrote: {paths['products']}")
    print(f"  wrote: {paths['releases']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
