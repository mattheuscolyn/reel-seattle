#!/usr/bin/env python3
"""Attach nullable public film_id values onto showtimes_current.json (dry-run helper)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.public_emit import (  # noqa: E402
    reattach_public_film_ids_current,
    write_identity_emit_report,
)
from reel_seattle.validate import PROJECT_ROOT as ROOT  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--showtimes",
        type=Path,
        default=ROOT / "public" / "data" / "showtimes_current.json",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="Optional identity catalog path (defaults to the generated catalog).",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Optional emit-report path.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write film_id onto the showtimes artifact (default: report only).",
    )
    args = parser.parse_args()

    result = reattach_public_film_ids_current(
        showtimes_path=args.showtimes,
        catalog_path=args.catalog,
        report_path=args.report,
        write=args.write,
    )
    report = result["report"]
    report_path = args.report
    if not args.write:
        report_path = write_identity_emit_report(report, path=args.report)
    print(
        f"films={report['total_public_films']} "
        f"with_film_id={report['non_null_film_id']} "
        f"coverage={report['coverage_rate']:.3f} "
        f"report={report_path or 'written-with-showtimes'}"
    )
    if args.write:
        print(f"wrote {args.showtimes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
