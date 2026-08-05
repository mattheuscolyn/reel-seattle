#!/usr/bin/env python3
"""Run TMDB film identity matching and rebuild catalog / review / coverage.

Offline modes:
  python scripts/match_tmdb_films.py --offline-inventory-only
  python scripts/match_tmdb_films.py --dry-run-decisions-only

Live matching (requires TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY):
  python scripts/match_tmdb_films.py
  python scripts/match_tmdb_films.py --refresh-cache
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.cache import TmdbResponseCache  # noqa: E402
from reel_seattle.film_identity.constants import (  # noqa: E402
    CATALOG_REL,
    COVERAGE_REL,
    DECISIONS_REL,
    REVIEW_QUEUE_REL,
)
from reel_seattle.film_identity.decisions import load_decisions  # noqa: E402
from reel_seattle.film_identity.env_local import load_dotenv_local  # noqa: E402
from reel_seattle.film_identity.inventory import inventory_source_identities  # noqa: E402
from reel_seattle.film_identity.io_util import atomic_write_json  # noqa: E402
from reel_seattle.film_identity.matcher import build_match_artifacts  # noqa: E402
from reel_seattle.film_identity.tmdb_client import (  # noqa: E402
    TmdbAuthError,
    TmdbClient,
    describe_auth_mode,
    resolve_tmdb_auth,
)
from reel_seattle.validate import validate_against_schema  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Match source films to TMDB IDs.")
    parser.add_argument("--showtimes-path", type=Path, default=None)
    parser.add_argument("--products-path", type=Path, default=None)
    parser.add_argument(
        "--decisions-path",
        type=Path,
        default=PROJECT_ROOT / DECISIONS_REL,
    )
    parser.add_argument(
        "--catalog-path",
        type=Path,
        default=PROJECT_ROOT / CATALOG_REL,
    )
    parser.add_argument(
        "--review-queue-path",
        type=Path,
        default=PROJECT_ROOT / REVIEW_QUEUE_REL,
    )
    parser.add_argument(
        "--coverage-path",
        type=Path,
        default=PROJECT_ROOT / COVERAGE_REL,
    )
    parser.add_argument(
        "--offline-inventory-only",
        action="store_true",
        help="Only rebuild inventory-driven unmatched catalog without TMDB calls.",
    )
    parser.add_argument(
        "--dry-run-decisions-only",
        action="store_true",
        help="Validate decisions artifact and exit.",
    )
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Ignore cached TMDB responses for this run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional cap on identities for debugging.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    load_dotenv_local(PROJECT_ROOT)
    args = parse_args(argv)
    decisions = load_decisions(args.decisions_path)
    if args.dry_run_decisions_only:
        print(f"Decisions OK ({len(decisions.get('decisions') or [])} rows)")
        return 0

    inventory = inventory_source_identities(
        showtimes_path=args.showtimes_path,
        products_path=args.products_path,
        root=PROJECT_ROOT,
    )
    identities = list(inventory.get("identities") or [])
    if args.limit is not None:
        identities = identities[: max(0, args.limit)]

    client: TmdbClient | None = None
    if not args.offline_inventory_only:
        try:
            auth = resolve_tmdb_auth(require=True)
        except TmdbAuthError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        print(f"TMDB auth mode: {describe_auth_mode(auth)}")
        client = TmdbClient(
            auth,
            cache=TmdbResponseCache(PROJECT_ROOT),
            refresh=args.refresh_cache,
        )

    artifacts = build_match_artifacts(
        identities,
        client=client,
        decisions_doc=decisions,
    )

    catalog = artifacts["catalog"]
    review_queue = artifacts["review_queue"]
    coverage = artifacts["coverage"]

    validate_against_schema(
        catalog,
        PROJECT_ROOT / "schema/film_identity/film_identity_catalog/v1.0.0.json",
        label="film_identity_catalog",
    )
    validate_against_schema(
        review_queue,
        PROJECT_ROOT / "schema/film_identity/tmdb_match_review_queue/v1.0.0.json",
        label="tmdb_match_review_queue",
    )

    # Preserve previous catalog on catastrophic empty failure when live run errors.
    if artifacts["partial_failure"] and args.catalog_path.exists() and not catalog["films"]:
        print("Partial failure with empty catalog — preserving previous artifacts.", file=sys.stderr)
        return 1

    atomic_write_json(args.catalog_path, catalog)
    atomic_write_json(args.review_queue_path, review_queue)
    atomic_write_json(args.coverage_path, coverage)

    print(
        "Matched "
        f"{coverage['total_unique_source_identities']} identities | "
        f"auto={coverage['confirmed_automatic']} "
        f"manual={coverage['confirmed_manual']} "
        f"review={coverage['review_required']} "
        f"unmatched={coverage['unmatched']} "
        f"non_film={coverage['non_film']} "
        f"errors={coverage['errors']}"
    )
    if artifacts["partial_failure"]:
        print(f"Partial failures: {artifacts['error_count']} (last-good rows retained per item)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
