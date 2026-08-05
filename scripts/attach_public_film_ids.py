#!/usr/bin/env python3
"""Attach nullable public film_id values onto showtimes_current.json (dry-run helper)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.public_emit import (  # noqa: E402
    attach_public_film_ids,
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
        "--write",
        action="store_true",
        help="Write film_id onto the showtimes artifact (default: report only).",
    )
    args = parser.parse_args()

    with args.showtimes.open(encoding="utf-8") as handle:
        doc = json.load(handle)
    films = list(doc.get("films") or [])
    showtimes = list(doc.get("showtimes") or [])
    report = attach_public_film_ids(films, showtimes)
    report_path = write_identity_emit_report(report)
    print(
        f"films={report['total_public_films']} "
        f"with_film_id={report['non_null_film_id']} "
        f"coverage={report['coverage_rate']:.3f} "
        f"report={report_path}"
    )
    if args.write:
        doc["films"] = films
        args.showtimes.write_text(
            json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {args.showtimes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
