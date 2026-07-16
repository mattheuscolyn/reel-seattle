#!/usr/bin/env python3
"""Validate durable AMC source-catalog artifacts.

Example:
  python scripts/validate_amc_source_catalog.py \\
    --products local-output/amc-source-catalog/amc_movie_products.json \\
    --releases local-output/amc-source-catalog/amc_release_observations.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.source_catalog.amc import (  # noqa: E402
    SourceCatalogValidationError,
    validate_amc_source_catalog_pair,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate durable AMC movie-product and release-observation catalogs."
    )
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--releases", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        products = json.loads(args.products.read_text(encoding="utf-8"))
        releases = json.loads(args.releases.read_text(encoding="utf-8"))
        validate_amc_source_catalog_pair(products, releases)
    except FileNotFoundError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"Error: invalid JSON: {exc}", file=sys.stderr)
        return 1
    except SourceCatalogValidationError as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        return 1

    print("Durable AMC source catalog is valid.")
    print(f"  products: {args.products}")
    print(f"  releases: {args.releases}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
