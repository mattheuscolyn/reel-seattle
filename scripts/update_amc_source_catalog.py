#!/usr/bin/env python3
"""Offline merge/update for durable AMC source-catalog artifacts.

No network access. No AMC API key.

Example:
  python scripts/update_amc_source_catalog.py \\
    --observations tests/fixtures/source_catalog/observations_seed.json \\
    --active-ids tests/fixtures/source_catalog/active_ids_seed.json \\
    --generated-at 2026-07-15T12:00:00-07:00 \\
    --output-dir local-output/amc-source-catalog
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
    SourceCatalogError,
    SourceCatalogValidationError,
    update_amc_source_catalog,
    validate_amc_source_catalog_pair,
    write_amc_source_catalog,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Merge offline AMC source observations into durable movie-product "
            "and release-observation catalogs."
        )
    )
    parser.add_argument(
        "--existing-products",
        type=Path,
        default=None,
        help="Existing amc_movie_products.json (omit to initialize empty).",
    )
    parser.add_argument(
        "--observations",
        type=Path,
        required=True,
        help="JSON file: array of observation objects, or {\"observations\": [...]}.",
    )
    parser.add_argument(
        "--active-ids",
        type=Path,
        default=None,
        help="JSON file: array of active source_film_id strings, or {\"active_ids\": [...]}.",
    )
    parser.add_argument(
        "--generated-at",
        required=True,
        help="Fixed generated_at timestamp for deterministic output.",
    )
    parser.add_argument(
        "--as-of",
        default=None,
        help="Timestamp used when marking products inactive (defaults to generated-at).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("local-output/amc-source-catalog"),
        help="Directory for durable JSON outputs (gitignored local-output recommended).",
    )
    parser.add_argument(
        "--skip-validate",
        action="store_true",
        help="Skip post-update validation (not recommended).",
    )
    return parser.parse_args(argv)


def _load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_observations(path: Path) -> list[dict]:
    payload = _load_json(path)
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("observations"), list):
        return payload["observations"]
    raise SourceCatalogError(
        "observations file must be a JSON array or an object with an observations array"
    )


def _load_active_ids(path: Path | None) -> list[str] | None:
    if path is None:
        return None
    payload = _load_json(path)
    if isinstance(payload, list):
        return [str(item) for item in payload]
    if isinstance(payload, dict) and isinstance(payload.get("active_ids"), list):
        return [str(item) for item in payload["active_ids"]]
    raise SourceCatalogError(
        "active-ids file must be a JSON array or an object with an active_ids array"
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not args.observations.is_file():
        print(f"Error: observations not found: {args.observations}", file=sys.stderr)
        return 1
    if args.existing_products is not None and not args.existing_products.is_file():
        print(
            f"Error: existing products not found: {args.existing_products}",
            file=sys.stderr,
        )
        return 1
    if args.active_ids is not None and not args.active_ids.is_file():
        print(f"Error: active-ids not found: {args.active_ids}", file=sys.stderr)
        return 1

    try:
        existing = None
        if args.existing_products is not None:
            existing = _load_json(args.existing_products)
            if not isinstance(existing, dict):
                raise SourceCatalogError("existing products must be a JSON object")

        observations = _load_observations(args.observations)
        active_ids = _load_active_ids(args.active_ids)

        products, releases = update_amc_source_catalog(
            existing_products=existing,
            observations=observations,
            active_ids=active_ids,
            generated_at=args.generated_at,
            as_of=args.as_of,
        )
        if not args.skip_validate:
            validate_amc_source_catalog_pair(products, releases)
        paths = write_amc_source_catalog(products, releases, args.output_dir)
    except (OSError, json.JSONDecodeError, SourceCatalogError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except SourceCatalogValidationError as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        return 1

    print("Updated durable AMC source catalog")
    print(f"  products: {products['stats']['products']}")
    print(f"  active_products: {products['stats']['active_products']}")
    print(f"  inactive_products: {products['stats']['inactive_products']}")
    print(f"  with_release_id: {products['stats']['with_release_id']}")
    print(f"  without_release_id: {products['stats']['without_release_id']}")
    print(f"  refresh_success: {products['stats']['refresh_success']}")
    print(f"  refresh_failed: {products['stats']['refresh_failed']}")
    print(f"  refresh_stale: {products['stats']['refresh_stale']}")
    print(f"  release_observations: {releases['stats']['release_observations']}")
    print(f"  singleton_groups: {releases['stats']['singleton_groups']}")
    print(f"  multi_product_groups: {releases['stats']['multi_product_groups']}")
    print(f"  wrote: {paths['products']}")
    print(f"  wrote: {paths['releases']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
