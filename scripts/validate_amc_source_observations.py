#!/usr/bin/env python3
"""Validate prototype AMC source observation artifacts.

Example:
  python scripts/validate_amc_source_observations.py \\
    --products local-output/amc-source-observations/amc_movie_products.json \\
    --releases local-output/amc-source-observations/amc_release_observations.json
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
    SourceObservationValidationError,
    validate_source_observation_pair,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate prototype AMC source observation artifacts."
    )
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--releases", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        products = json.loads(args.products.read_text(encoding="utf-8"))
        releases = json.loads(args.releases.read_text(encoding="utf-8"))
        validate_source_observation_pair(products, releases)
    except FileNotFoundError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"Error: invalid JSON: {exc}", file=sys.stderr)
        return 1
    except SourceObservationValidationError as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        return 1

    print("Prototype AMC source observations are valid.")
    print(f"  products: {args.products}")
    print(f"  releases: {args.releases}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
