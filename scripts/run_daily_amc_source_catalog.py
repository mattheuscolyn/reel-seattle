#!/usr/bin/env python3
"""Daily non-blocking AMC source-catalog orchestration.

Runs after showtime/history validation. Soft-fails by default (exit 0) so
otherwise-valid showtime commits are not blocked by catalog enrichment failures.

Exit codes:
  0 — success or expected catalog soft-failure
  2 — invalid CLI usage
  1 — unexpected programmer/runtime error (--fail-hard also maps soft failures here)

Example (fixture / local):
  python scripts/run_daily_amc_source_catalog.py \\
    --discovery-source tests/fixtures/source_catalog/discovery_scrape_log.json \\
    --fixture-responses tests/fixtures/source_catalog/movie_responses \\
    --products-path local-output/daily-catalog/amc_movie_products.json \\
    --releases-path local-output/daily-catalog/amc_release_observations.json \\
    --generated-at 2026-07-15T12:00:00-07:00
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

from reel_seattle.source_catalog.amc_daily import (  # noqa: E402
    DailyCatalogHardError,
    format_diagnostics,
    run_daily_amc_source_catalog,
)
from reel_seattle.source_catalog.amc_refresh import POLICY_ALL_ACTIVE  # noqa: E402
from reel_seattle.pipeline_report_catalog import (  # noqa: E402
    apply_amc_catalog_health_to_pipeline_report,
)
from reel_seattle.validate import SchemaValidationError  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Refresh and promote durable AMC source catalogs for the daily workflow "
            "(non-blocking soft-fail by default)."
        )
    )
    parser.add_argument(
        "--discovery-source",
        default="auto",
        help="auto | scrape-log | showtimes-current | path (default: auto).",
    )
    parser.add_argument(
        "--products-path",
        type=Path,
        default=Path("data/source_catalog/amc_movie_products.json"),
        help="Durable product catalog path.",
    )
    parser.add_argument(
        "--releases-path",
        type=Path,
        default=Path("data/source_catalog/amc_release_observations.json"),
        help="Durable release catalog path.",
    )
    parser.add_argument(
        "--policy",
        default=POLICY_ALL_ACTIVE,
        help="Refresh policy (default: all-active).",
    )
    parser.add_argument(
        "--fixture-responses",
        type=Path,
        default=None,
        help="Offline Movies fixture directory (skips live API / secret).",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Force live AMC Movies API mode (requires AMC_API_KEY).",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Fixed timestamp for deterministic runs.",
    )
    parser.add_argument(
        "--temp-dir",
        type=Path,
        default=None,
        help="Parent directory for temporary work (default: system temp).",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=PROJECT_ROOT,
        help="Repository root for auto discovery resolution.",
    )
    parser.add_argument(
        "--run-date",
        default=None,
        help="YYYY-MM-DD preferred scrape-log date (default: Pacific today).",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=None,
        help="Pacing between live requests (default 1.0 live / 0 fixture).",
    )
    parser.add_argument(
        "--fail-hard",
        action="store_true",
        help="Exit nonzero on catalog soft-failures (not for production daily).",
    )
    parser.add_argument(
        "--json-summary-path",
        type=Path,
        default=None,
        help="Optional path to write a sanitized JSON summary.",
    )
    parser.add_argument(
        "--promote-all-failed",
        action="store_true",
        help=(
            "Allow promotion when every Movies fetch fails and prior catalog exists "
            "(default retains prior)."
        ),
    )
    parser.add_argument(
        "--pipeline-report-path",
        type=Path,
        default=None,
        help=(
            "Pipeline report to update with AMC catalog health (P-21B). "
            "Omit to skip. Production daily passes public/data/pipeline_report.json."
        ),
    )
    parser.add_argument(
        "--skip-pipeline-report-update",
        action="store_true",
        help="Do not write amc_source_catalog into pipeline_report.json.",
    )
    return parser.parse_args(argv)


def _parse_run_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(argv)
    except SystemExit as exc:
        code = exc.code
        return int(code) if isinstance(code, int) else 2

    if args.live and args.fixture_responses is not None:
        print("Error: use either --live or --fixture-responses, not both", file=sys.stderr)
        return 2
    if args.policy != POLICY_ALL_ACTIVE:
        # Production daily wiring is all-active only for P-14D.
        print(
            f"Error: unsupported daily policy {args.policy!r}; use all-active",
            file=sys.stderr,
        )
        return 2

    try:
        run_date = _parse_run_date(args.run_date)
    except ValueError:
        print(f"Error: invalid --run-date {args.run_date!r}", file=sys.stderr)
        return 2

    live = True if args.live else None
    if args.fixture_responses is not None:
        live = False

    try:
        result = run_daily_amc_source_catalog(
            discovery_source=args.discovery_source,
            products_path=args.products_path,
            releases_path=args.releases_path,
            policy=args.policy,
            fixture_responses=args.fixture_responses,
            live=live,
            generated_at=args.generated_at,
            temp_dir=args.temp_dir,
            repo_root=args.repo_root,
            run_date=run_date,
            sleep_seconds=args.sleep_seconds,
            retain_on_all_failed=not args.promote_all_failed,
        )
    except DailyCatalogHardError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except (TypeError, ValueError) as exc:
        # Invalid arguments / programmer misuse.
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

    if not args.skip_pipeline_report_update and args.pipeline_report_path is not None:
        report_path = args.pipeline_report_path
        if str(report_path).strip() not in {"", "."}:
            if report_path.is_file():
                try:
                    report = apply_amc_catalog_health_to_pipeline_report(
                        report_path,
                        result,
                        products_path=args.products_path,
                        releases_path=args.releases_path,
                    )
                    catalog = report.get("amc_source_catalog") or {}
                    print(
                        "pipeline_report.amc_source_catalog: "
                        f"status={catalog.get('status')} "
                        f"outcome={catalog.get('outcome')} "
                        f"soft_failure={catalog.get('soft_failure')}"
                    )
                except (
                    OSError,
                    ValueError,
                    TypeError,
                    json.JSONDecodeError,
                    SchemaValidationError,
                    FileNotFoundError,
                ) as exc:
                    print(
                        f"Warning: could not update pipeline report catalog health: {exc}",
                        file=sys.stderr,
                    )
            else:
                print(
                    f"Warning: pipeline report missing at {report_path}; "
                    "skipped amc_source_catalog update",
                    file=sys.stderr,
                )

    if result.soft_failure and args.fail_hard:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
