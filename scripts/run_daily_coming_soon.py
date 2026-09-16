#!/usr/bin/env python3
"""Daily non-blocking Coming Soon generation.

Refreshes the two optional upstream snapshots (AMC Coming Soon catalog, TMDB US
theatrical discover) and rebuilds ``public/data/coming_soon_current.json``.
Soft-fails by default (exit 0) so a temporary AMC or TMDB outage never blocks
the daily showtime commit and never empties the page.

Exit codes:
  0 — success or expected soft-failure
  2 — invalid CLI usage
  1 — unexpected programmer/runtime error (--fail-hard also maps soft failures here)

Example (offline / local):
  python scripts/run_daily_coming_soon.py \\
    --amc-fixture-pages tests/fixtures/coming_soon/amc_catalog_pages \\
    --output-path local-output/coming_soon_current.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.emit.coming_soon import (  # noqa: E402
    DEFAULT_ANALYSIS_PATH,
    DEFAULT_CURRENT_AVAILABILITY_DAYS,
    DEFAULT_LOGS_DIR,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REGISTRY_PATH,
    DEFAULT_SHOWTIMES_CURRENT_PATH,
    DEFAULT_WINDOW_DAYS,
)
from reel_seattle.emit.coming_soon_daily import (  # noqa: E402
    ComingSoonDailyHardError,
    format_diagnostics,
    run_daily_coming_soon,
)
from reel_seattle.film_identity.tmdb_discover import (  # noqa: E402
    DEFAULT_CANDIDATES_PATH,
)
from reel_seattle.source_catalog.amc_coming_soon import (  # noqa: E402
    DEFAULT_CATALOG_PATH,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Refresh optional Coming Soon sources and publish "
            "coming_soon_current.json (non-blocking soft-fail by default)."
        )
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Fetch live AMC catalog + TMDB discover (requires AMC_API_KEY / TMDB creds).",
    )
    parser.add_argument(
        "--amc-fixture-pages",
        type=Path,
        default=None,
        help="Offline AMC catalog fixture directory (page-1.json, ...).",
    )
    parser.add_argument(
        "--skip-amc-refresh",
        action="store_true",
        help="Reuse the durable AMC catalog snapshot without refreshing it.",
    )
    parser.add_argument(
        "--skip-tmdb-refresh",
        action="store_true",
        help="Reuse the durable TMDB candidates snapshot without refreshing it.",
    )
    parser.add_argument("--output-path", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--analysis-path", type=Path, default=DEFAULT_ANALYSIS_PATH)
    parser.add_argument("--catalog-path", type=Path, default=DEFAULT_CATALOG_PATH)
    parser.add_argument(
        "--tmdb-candidates-path", type=Path, default=DEFAULT_CANDIDATES_PATH
    )
    parser.add_argument(
        "--showtimes-current-path", type=Path, default=DEFAULT_SHOWTIMES_CURRENT_PATH
    )
    parser.add_argument("--registry-path", type=Path, default=DEFAULT_REGISTRY_PATH)
    parser.add_argument("--logs-dir", type=Path, default=DEFAULT_LOGS_DIR)
    parser.add_argument("--repo-root", type=Path, default=PROJECT_ROOT)
    parser.add_argument(
        "--window-days",
        type=int,
        default=DEFAULT_WINDOW_DAYS,
        help=f"Coming Soon horizon in days (production default {DEFAULT_WINDOW_DAYS}).",
    )
    parser.add_argument(
        "--current-availability-days",
        type=int,
        default=DEFAULT_CURRENT_AVAILABILITY_DAYS,
        help="Days from today treated as currently available (excluded from Coming Soon).",
    )
    parser.add_argument(
        "--today",
        default=None,
        help="YYYY-MM-DD Pacific reference date for deterministic runs.",
    )
    parser.add_argument(
        "--run-date",
        default=None,
        help="YYYY-MM-DD preferred AMC scrape-log date (default: newest log).",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Fixed timestamp for deterministic runs.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Pacing between live AMC catalog page requests.",
    )
    parser.add_argument(
        "--json-summary-path",
        type=Path,
        default=None,
        help="Optional path for a sanitized JSON run summary.",
    )
    parser.add_argument(
        "--fail-hard",
        action="store_true",
        help="Exit nonzero on soft failures (not for the production daily run).",
    )
    return parser.parse_args(argv)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
    except SystemExit as exc:
        code = exc.code
        return int(code) if isinstance(code, int) else 2

    if args.live and args.amc_fixture_pages is not None:
        print(
            "Error: use either --live or --amc-fixture-pages, not both",
            file=sys.stderr,
        )
        return 2
    if args.window_days < 1:
        print("Error: --window-days must be >= 1", file=sys.stderr)
        return 2
    if args.current_availability_days < 0:
        print("Error: --current-availability-days must be >= 0", file=sys.stderr)
        return 2

    try:
        today = _parse_date(args.today)
        run_date = _parse_date(args.run_date)
    except ValueError as exc:
        print(f"Error: invalid date argument ({exc})", file=sys.stderr)
        return 2

    try:
        result = run_daily_coming_soon(
            output_path=args.output_path,
            analysis_path=args.analysis_path,
            catalog_path=args.catalog_path,
            tmdb_candidates_path=args.tmdb_candidates_path,
            showtimes_current_path=args.showtimes_current_path,
            registry_path=args.registry_path,
            logs_dir=args.logs_dir,
            repo_root=args.repo_root,
            live=args.live,
            refresh_amc=not args.skip_amc_refresh,
            refresh_tmdb=not args.skip_tmdb_refresh,
            amc_fixture_pages=args.amc_fixture_pages,
            today_date=today,
            window_days=args.window_days,
            current_availability_days=args.current_availability_days,
            generated_at=args.generated_at,
            run_date=run_date,
            sleep_seconds=args.sleep_seconds,
        )
    except ComingSoonDailyHardError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except (TypeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    for line in format_diagnostics(result):
        print(line)

    if args.json_summary_path is not None:
        args.json_summary_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_summary_path.write_text(
            json.dumps(result.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    if result.soft_failure and args.fail_hard:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
