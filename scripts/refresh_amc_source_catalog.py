#!/usr/bin/env python3
"""Refresh AMC Movies metadata into durable source-catalog observations.

Offline fixture mode requires no network and no AMC_API_KEY.
Live mode reads AMC_API_KEY from the environment only (never as a CLI flag).

Examples:
  # Refresh-only (fixtures)
  python scripts/refresh_amc_source_catalog.py \\
    --discovery-source tests/fixtures/source_catalog/discovery_scrape_log.json \\
    --fixture-responses tests/fixtures/source_catalog/movie_responses \\
    --policy all-active \\
    --generated-at 2026-07-15T12:00:00-07:00 \\
    --output-dir local-output/amc-source-refresh

  # Refresh-and-build
  python scripts/refresh_amc_source_catalog.py \\
    --discovery-source tests/fixtures/source_catalog/discovery_scrape_log.json \\
    --fixture-responses tests/fixtures/source_catalog/movie_responses \\
    --policy all-active \\
    --update-catalog \\
    --generated-at 2026-07-15T12:00:00-07:00 \\
    --output-dir local-output/amc-source-refresh
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.source_catalog.amc_refresh import (  # noqa: E402
    POLICY_ALL_ACTIVE,
    POLICY_NEW_ONLY,
    POLICY_STALE,
    RefreshStageError,
    count_product_errors,
    refresh_and_optional_update,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover active AMC products, refresh Movies metadata, and emit "
            "normalized source-catalog observations (optional local catalog update)."
        )
    )
    parser.add_argument(
        "--discovery-source",
        required=True,
        help=(
            "Path to an AMC scrape log or showtimes_current JSON, or one of: "
            "auto | scrape-log | showtimes-current. "
            "auto prefers the newest data/daily_logs/*_amc.json, else showtimes_current."
        ),
    )
    parser.add_argument(
        "--existing-products",
        type=Path,
        default=None,
        help="Optional existing amc_movie_products.json (validated before use).",
    )
    parser.add_argument(
        "--policy",
        choices=sorted({POLICY_ALL_ACTIVE, POLICY_NEW_ONLY, POLICY_STALE}),
        default=POLICY_ALL_ACTIVE,
        help="Refresh selection policy (default: all-active).",
    )
    parser.add_argument(
        "--stale-after-hours",
        type=float,
        default=None,
        help="Required for --policy stale: refresh when last success is older than this.",
    )
    parser.add_argument(
        "--fixture-responses",
        type=Path,
        default=None,
        help="Directory of offline Movies fixtures ({id}.json / {id}.http.json).",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Call the live AMC Movies API (requires AMC_API_KEY in the environment).",
    )
    parser.add_argument(
        "--update-catalog",
        action="store_true",
        help="Also merge observations into local product/release artifacts in --output-dir.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("local-output/amc-source-refresh"),
        help="Local output directory (gitignored local-output recommended).",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Fixed generated_at / attempted_at timestamp for deterministic runs.",
    )
    parser.add_argument(
        "--as-of",
        default=None,
        help="Timestamp for stale threshold and inactive marking (defaults to generated-at).",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Optional pacing between live requests (default 0; audits often use 1.0).",
    )
    parser.add_argument(
        "--fail-on-product-errors",
        action="store_true",
        help="Exit nonzero if any selected product fetch failed or was invalid.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=PROJECT_ROOT,
        help="Repository root for auto/scrape-log/showtimes-current resolution.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.live and args.fixture_responses is not None:
        print("Error: use either --live or --fixture-responses, not both", file=sys.stderr)
        return 1
    if not args.live and args.fixture_responses is None:
        print(
            "Error: provide --fixture-responses for offline mode or --live for API mode",
            file=sys.stderr,
        )
        return 1
    if args.policy == POLICY_STALE and args.stale_after_hours is None:
        print("Error: --stale-after-hours is required with --policy stale", file=sys.stderr)
        return 1

    generated_at = args.generated_at
    if not generated_at:
        from datetime import datetime
        from zoneinfo import ZoneInfo

        from reel_seattle.normalize.dates import DEFAULT_TIMEZONE

        generated_at = datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")

    try:
        result = refresh_and_optional_update(
            discovery_source=args.discovery_source,
            existing_products_path=args.existing_products,
            policy=args.policy,
            stale_after_hours=args.stale_after_hours,
            output_dir=args.output_dir,
            generated_at=generated_at,
            fixture_dir=args.fixture_responses,
            live=args.live,
            update_catalog=args.update_catalog,
            sleep_seconds=args.sleep_seconds,
            as_of=args.as_of,
            repo_root=args.repo_root,
        )
    except RefreshStageError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    artifact = result["observations_artifact"]
    stats = artifact["stats"]
    discovery = artifact["discovery"]
    policy = artifact["policy"]

    print("AMC source catalog refresh complete")
    print(f"  discovery: {discovery['source_path']} ({discovery['source_kind']})")
    print(f"  active_product_ids: {discovery['active_product_ids']}")
    print(f"  policy: {policy['name']}")
    print(f"  selected: {stats['selected']}")
    print(f"  skipped: {stats['skipped']}")
    print(f"  success: {stats['success']}")
    print(f"  failed: {stats['failed']}")
    print(f"  invalid: {stats['invalid']}")
    print(f"  wrote: {result['observations_path']}")
    if result.get("products_path"):
        print(f"  products: {result['products_path']}")
        print(f"  releases: {result['releases_path']}")

    if args.fail_on_product_errors and count_product_errors(artifact) > 0:
        print(
            f"Error: {count_product_errors(artifact)} product-level fetch errors "
            "(strict mode)",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
