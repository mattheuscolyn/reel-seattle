#!/usr/bin/env python3
"""NWFF independent-source observation prototype (non-production).

Examples:
  # Offline fixtures
  python scripts/prototype_nwff_ingestion.py \\
    --start-date 2026-07-14 --end-date 2026-07-20 \\
    --fixture-dir tests/fixtures/adapters/nwff \\
    --output-dir local-output/nwff-prototype

  # Live read-only
  python scripts/prototype_nwff_ingestion.py \\
    --start-date 2026-07-15 --end-date 2026-07-28 \\
    --live --output-dir local-output/nwff-prototype
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

from reel_seattle.ingestion.independent_contract import (  # noqa: E402
    PLANNED_FIXTURE_THEATER_IDS,
    assert_valid_independent_source_result,
    fixture_theater_ids,
    serialize_independent_source_result,
)
from reel_seattle.prototypes.nwff import (  # noqa: E402
    NwffPrototypeError,
    build_nwff_result,
    default_fetch,
    fixture_fetch_map,
    summarize_result,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prototype NWFF contract ingestion (non-production).")
    parser.add_argument("--start-date", required=True, help="Inclusive local start YYYY-MM-DD")
    parser.add_argument("--end-date", required=True, help="Inclusive local end YYYY-MM-DD")
    parser.add_argument("--output-dir", type=Path, default=Path("local-output/nwff-prototype"))
    parser.add_argument("--fixture-dir", type=Path, default=None, help="Offline HTML fixture directory")
    parser.add_argument("--live", action="store_true", help="Fetch live NWFF pages (read-only)")
    parser.add_argument("--sleep-seconds", type=float, default=0.25)
    parser.add_argument("--scraped-at", default=None)
    parser.add_argument("--skip-validate", action="store_true")
    return parser.parse_args(argv)


def _load_fixture_pages(fixture_dir: Path) -> dict[str, str]:
    if not fixture_dir.is_dir():
        raise NwffPrototypeError(f"fixture dir not found: {fixture_dir}")
    pages: dict[str, str] = {}
    manifest = fixture_dir / "manifest.json"
    if manifest.is_file():
        mapping = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(mapping, dict):
            raise NwffPrototypeError("manifest.json must be an object of url->filename")
        for url, filename in mapping.items():
            path = fixture_dir / str(filename)
            pages[str(url)] = path.read_text(encoding="utf-8")
        return pages
    for path in sorted(fixture_dir.glob("*.html")):
        pages[path.name] = path.read_text(encoding="utf-8")
        pages[path.stem] = pages[path.name]
    return pages


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        start = date.fromisoformat(args.start_date)
        end = date.fromisoformat(args.end_date)
        if args.live and args.fixture_dir:
            raise NwffPrototypeError("use either --live or --fixture-dir, not both")
        if not args.live and not args.fixture_dir:
            raise NwffPrototypeError("provide --fixture-dir or --live")

        if args.fixture_dir:
            pages = _load_fixture_pages(args.fixture_dir)
            fetch = fixture_fetch_map(pages)
            sleep = 0.0
        else:
            fetch = default_fetch
            sleep = max(0.0, float(args.sleep_seconds))

        result = build_nwff_result(
            start_date=start,
            end_date=end,
            fetch=fetch,
            scraped_at=args.scraped_at,
            sleep_seconds=sleep,
        )

        if not args.skip_validate:
            theater_ids = fixture_theater_ids(include_planned=True)
            theater_ids |= set(PLANNED_FIXTURE_THEATER_IDS)
            assert_valid_independent_source_result(result, theater_ids=theater_ids)

        out_dir = args.output_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        result_path = out_dir / "nwff_independent_source_result.json"
        summary_path = out_dir / "nwff_prototype_summary.json"
        result_path.write_text(serialize_independent_source_result(result), encoding="utf-8")
        summary = summarize_result(result)
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

        print("NWFF prototype complete (non-production)")
        for key, value in summary.items():
            print(f"  {key}: {value}")
        print(f"  wrote: {result_path}")
        print(f"  wrote: {summary_path}")
        return 0
    except (OSError, json.JSONDecodeError, NwffPrototypeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
