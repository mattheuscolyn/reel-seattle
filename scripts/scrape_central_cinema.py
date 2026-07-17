#!/usr/bin/env python3
"""Production-compatible Central Cinema scrape (manual / non-scheduled).

Examples:
  # Live
  python scripts/scrape_central_cinema.py \\
    --start-date 2026-07-20 --end-date 2026-08-02 \\
    --output-dir local-output/central-cinema-live

  # Offline fixtures
  python scripts/scrape_central_cinema.py \\
    --start-date 2026-12-28 --end-date 2027-01-10 \\
    --fixture-dir tests/fixtures/prototypes/central_cinema \\
    --output-dir local-output/central-cinema-fixture
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.adapters.central_cinema import (  # noqa: E402
    CentralCinemaAdapterError,
    CentralCinemaLogValidationError,
    central_cinema_log_path,
    default_central_cinema_window,
    fetch_central_cinema,
    fetch_central_cinema_from_fixture_dir,
    prove_indie_parser_compatibility,
    summarize_central_cinema_result,
    validate_central_cinema_scrape_log,
    write_central_cinema_scrape_log,
)
from reel_seattle.validate import validate_theaters_registry_file  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Manual Central Cinema production-compatible scrape."
    )
    parser.add_argument("--start-date", default=None, help="Inclusive YYYY-MM-DD (Pacific)")
    parser.add_argument("--end-date", default=None, help="Inclusive YYYY-MM-DD (Pacific)")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, default=None)
    parser.add_argument("--live", action="store_true", help="Fetch live Central Cinema pages")
    parser.add_argument("--sleep-seconds", type=float, default=0.35)
    parser.add_argument("--scraped-at", default=None)
    parser.add_argument("--generated-at", default=None)
    parser.add_argument("--skip-parser-check", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.live and args.fixture_dir:
            raise CentralCinemaAdapterError("use either --live or --fixture-dir, not both")
        if not args.live and not args.fixture_dir:
            raise CentralCinemaAdapterError("provide --fixture-dir or --live")

        if args.start_date or args.end_date:
            if not args.start_date or not args.end_date:
                raise CentralCinemaAdapterError(
                    "provide both --start-date and --end-date, or neither"
                )
            start = date.fromisoformat(args.start_date)
            end = date.fromisoformat(args.end_date)
        else:
            start, end = default_central_cinema_window()

        registry = validate_theaters_registry_file(PROJECT_ROOT / "data" / "theaters.json")
        theater_ids = {str(row["id"]) for row in registry.get("theaters", [])}

        if args.fixture_dir:
            result = fetch_central_cinema_from_fixture_dir(
                args.fixture_dir,
                start,
                end,
                scraped_at=args.scraped_at,
                generated_at=args.generated_at,
                theater_ids=theater_ids,
            )
        else:
            result = fetch_central_cinema(
                start,
                end,
                scraped_at=args.scraped_at,
                generated_at=args.generated_at,
                sleep_seconds=max(0.0, float(args.sleep_seconds)),
                theater_ids=theater_ids,
            )

        validate_central_cinema_scrape_log(result.log_envelope, theater_ids=theater_ids)
        if not args.skip_parser_check:
            prove_indie_parser_compatibility(result.log_envelope)

        run_date = start
        if args.generated_at:
            try:
                run_date = datetime.fromisoformat(args.generated_at).date()
            except ValueError:
                run_date = start
        log_path = central_cinema_log_path(run_date, output_dir=args.output_dir)
        write_central_cinema_scrape_log(log_path, result.log_envelope)

        summary = summarize_central_cinema_result(result)
        summary_path = args.output_dir / "central_cinema_scrape_summary.json"
        args.output_dir.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

        print("Central Cinema production-compatible scrape complete (manual / non-scheduled)")
        for key, value in summary.items():
            print(f"  {key}: {value}")
        print(f"  wrote: {log_path}")
        print(f"  wrote: {summary_path}")
        return 0
    except (
        OSError,
        json.JSONDecodeError,
        CentralCinemaAdapterError,
        CentralCinemaLogValidationError,
        ValueError,
    ) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
