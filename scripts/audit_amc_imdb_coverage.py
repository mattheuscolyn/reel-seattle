#!/usr/bin/env python3
"""Manual AMC IMDb coverage audit (read-only measurement).

Usage:
  python scripts/audit_amc_imdb_coverage.py --source auto --output-dir audit-output

Requires ``AMC_API_KEY`` in the environment for live API mode.
Offline:
  python scripts/audit_amc_imdb_coverage.py --offline-fixtures tests/fixtures/audit/amc_movies \\
    --source tests/fixtures/audit/source_amc_scrape_log.json --output-dir audit-output
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.adapters.amc import build_amc_headers  # noqa: E402
from reel_seattle.analysis.amc_imdb_coverage import (  # noqa: E402
    build_report,
    load_offline_fixture_fetch,
    make_requests_fetch_movie,
    resolve_source_plan,
    run_movie_lookups,
    write_audit_outputs,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit IMDb ID coverage for distinct AMC movie IDs (manual measurement only)."
    )
    parser.add_argument(
        "--source",
        default="auto",
        help=(
            "auto | scrape-log | showtimes-current | or path to a scrape log / showtimes JSON. "
            "auto prefers the newest data/daily_logs/*_amc.json."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("audit-output"),
        help="Directory for JSON/CSV/Markdown outputs (not committed).",
    )
    parser.add_argument(
        "--offline-fixtures",
        type=Path,
        default=None,
        help="Directory of redacted AMC Movies fixtures (no live API calls).",
    )
    parser.add_argument(
        "--logs-dir",
        type=Path,
        default=Path("data/daily_logs"),
        help="Directory of AMC daily scrape logs.",
    )
    parser.add_argument(
        "--showtimes-path",
        type=Path,
        default=Path("public/data/showtimes_current.json"),
        help="Fallback showtimes_current.json path.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=1.0,
        help="Delay between live Movies API requests (ignored for offline fixtures when 0).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=30.0,
        help="HTTP timeout for each Movies API request.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=PROJECT_ROOT,
        help="Repository root for resolving relative source paths.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = args.repo_root.resolve()

    try:
        source = resolve_source_plan(
            source=args.source,
            logs_dir=args.logs_dir,
            showtimes_path=args.showtimes_path,
            repo_root=repo_root,
        )
    except (OSError, ValueError, FileNotFoundError) as exc:
        print(f"Error: unable to load source artifact: {exc}", file=sys.stderr)
        return 1

    if not source.plans:
        print(
            "Error: no usable AMC movie IDs found in source "
            f"{source.source_artifact!r} (raw_amc_records={source.raw_amc_records}).",
            file=sys.stderr,
        )
        return 1

    print(f"Source artifact: {source.source_artifact}")
    print(f"Source artifact date: {source.source_artifact_date}")
    print(f"Raw AMC records: {source.raw_amc_records}")
    print(f"Distinct AMC movie IDs: {source.distinct_count}")

    if args.offline_fixtures is not None:
        fixtures = args.offline_fixtures
        if not fixtures.is_dir():
            fixtures = repo_root / fixtures
        if not fixtures.is_dir():
            print(f"Error: offline fixtures directory not found: {args.offline_fixtures}", file=sys.stderr)
            return 1
        fetch_movie = load_offline_fixture_fetch(fixtures)
        sleep_seconds = 0.0 if args.sleep_seconds == 1.0 else args.sleep_seconds
    else:
        api_key = os.environ.get("AMC_API_KEY")
        if not api_key:
            print(
                "Error: AMC_API_KEY environment variable is required for live audit mode. "
                "Use --offline-fixtures for local/CI tests.",
                file=sys.stderr,
            )
            return 1
        session = requests.Session()
        session.headers.update(build_amc_headers(api_key))
        fetch_movie = make_requests_fetch_movie(session, timeout_seconds=args.timeout_seconds)
        sleep_seconds = args.sleep_seconds

    rows = run_movie_lookups(source.plans, fetch_movie, sleep_seconds=sleep_seconds)
    report = build_report(source=source, rows=rows)
    paths = write_audit_outputs(report, args.output_dir.resolve())

    coverage = report["coverage"]
    print(f"Requests attempted: {report['requests_attempted']}")
    print(f"Requests succeeded: {report['requests_succeeded']}")
    print(f"Requests failed: {report['requests_failed']}")
    print(f"Valid IMDb IDs: {coverage['valid_imdb_id']}")
    print(f"Missing IMDb IDs: {coverage['missing_imdb_id']}")
    print(f"Malformed IMDb IDs: {coverage['malformed_imdb_id']}")
    print(f"Coverage (parsed movies): {coverage['coverage_percent_of_parsed_movies']}%")
    print(f"Wrote {paths['json']}")
    print(f"Wrote {paths['csv']}")
    print(f"Wrote {paths['markdown']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
