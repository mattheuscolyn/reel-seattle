#!/usr/bin/env python3
"""Inventory unique source film identities (offline; no TMDB).

Examples:
  python scripts/inventory_film_identities.py
  python scripts/inventory_film_identities.py --output data/audits/film_identity_source_inventory.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.inventory import inventory_source_identities  # noqa: E402
from reel_seattle.film_identity.io_util import atomic_write_json  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inventory source film identities.")
    parser.add_argument(
        "--showtimes-path",
        type=Path,
        default=PROJECT_ROOT / "public/data/showtimes_current.json",
    )
    parser.add_argument(
        "--products-path",
        type=Path,
        default=PROJECT_ROOT / "data/source_catalog/amc_movie_products.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data/audits/film_identity_source_inventory.json",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print summary JSON to stdout instead of writing the full inventory.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    inventory = inventory_source_identities(
        showtimes_path=args.showtimes_path,
        products_path=args.products_path,
        root=PROJECT_ROOT,
    )
    if args.stdout:
        summary = {
            "total_unique_source_identities": inventory["total_unique_source_identities"],
            "by_source": inventory["by_source"],
        }
        print(json.dumps(summary, indent=2, sort_keys=True))
        return 0
    atomic_write_json(args.output, inventory)
    print(
        f"Wrote {inventory['total_unique_source_identities']} identities -> {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
