#!/usr/bin/env python3
"""Production-compatible NWFF scrape (manual / non-scheduled).

Examples:
  # Live
  python scripts/scrape_nwff.py \\
    --start-date 2026-07-20 --end-date 2026-08-02 \\
    --output-dir local-output/nwff-live

  # Offline fixtures
  python scripts/scrape_nwff.py \\
    --start-date 2026-07-14 --end-date 2026-07-20 \\
    --fixture-dir tests/fixtures/adapters/nwff \\
    --output-dir local-output/nwff-fixture
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

from reel_seattle.adapters.nwff import (  # noqa: E402
    NwffAdapterError,
    NwffLogValidationError,
    default_nwff_window,
    fetch_nwff,
    fetch_nwff_from_fixture_dir,
    nwff_log_path,
    prove_indie_parser_compatibility,
    summarize_nwff_result,
    validate_nwff_scrape_log,
    write_nwff_scrape_log,
)
from reel_seattle.validate import validate_theaters_registry_file  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manual NWFF production-compatible scrape.")
    parser.add_argument("--start-date", default=None, help="Inclusive YYYY-MM-DD (Pacific)")
    parser.add_argument("--end-date", default=None, help="Inclusive YYYY-MM-DD (Pacific)")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--fixture-dir", type=Path, default=None)
    parser.add_argument("--live", action="store_true", help="Fetch live NWFF pages")
    parser.add_argument("--sleep-seconds", type=float, default=0.35)
    parser.add_argument("--scraped-at", default=None)
    parser.add_argument("--generated-at", default=None)
    parser.add_argument("--skip-parser-check", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.live and args.fixture_dir:
            raise NwffAdapterError("use either --live or --fixture-dir, not both")
        if not args.live and not args.fixture_dir:
            raise NwffAdapterError("provide --fixture-dir or --live")

        if args.start_date or args.end_date:
            if not args.start_date or not args.end_date:
                raise NwffAdapterError("provide both --start-date and --end-date, or neither")
            start = date.fromisoformat(args.start_date)
            end = date.fromisoformat(args.end_date)
        else:
            start, end = default_nwff_window()

        registry = validate_theaters_registry_file(PROJECT_ROOT / "data" / "theaters.json")
        theater_ids = {str(row["id"]) for row in registry.get("theaters", [])}

        if args.fixture_dir:
            result = fetch_nwff_from_fixture_dir(
                args.fixture_dir,
                start,
                end,
                scraped_at=args.scraped_at,
                generated_at=args.generated_at,
                theater_ids=theater_ids,
            )
        else:
            result = fetch_nwff(
                start,
                end,
                scraped_at=args.scraped_at,
                generated_at=args.generated_at,
                sleep_seconds=max(0.0, float(args.sleep_seconds)),
                theater_ids=theater_ids,
            )

        validate_nwff_scrape_log(result.log_envelope, theater_ids=theater_ids)
        if not args.skip_parser_check:
            prove_indie_parser_compatibility(result.log_envelope)

        run_date = start
        if args.generated_at:
            try:
                run_date = datetime.fromisoformat(args.generated_at).date()
            except ValueError:
                run_date = start
        log_path = nwff_log_path(run_date, output_dir=args.output_dir)
        write_nwff_scrape_log(log_path, result.log_envelope)

        summary = summarize_nwff_result(result)
        summary_path = args.output_dir / "nwff_scrape_summary.json"
        args.output_dir.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

        print("NWFF production-compatible scrape complete (manual / non-scheduled)")
        for key, value in summary.items():
            print(f"  {key}: {value}")
        print(f"  wrote: {log_path}")
        print(f"  wrote: {summary_path}")
        return 0
    except (OSError, json.JSONDecodeError, NwffAdapterError, NwffLogValidationError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
