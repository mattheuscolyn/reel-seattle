#!/usr/bin/env python3
"""Offline Central Cinema contract → indie scrape-log mapper (no network).

Example:
  python scripts/map_central_cinema_contract_to_indie.py \\
    --input tests/fixtures/ingestion/independent_contract/central_success.json \\
    --output local-output/central-cinema-mapping/central_cinema_log.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.ingestion.central_cinema_mapping import (  # noqa: E402
    CentralCinemaMappingError,
    map_central_cinema_contract_to_indie,
    serialize_central_cinema_mapping_log,
)
from reel_seattle.validate import validate_theaters_registry_file  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Map Central Cinema IndependentSourceResult to indie scrape log."
    )
    parser.add_argument("--input", type=Path, required=True, help="Path to contract JSON")
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output path (ignored local dir recommended; not data/daily_logs)",
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=PROJECT_ROOT / "data" / "theaters.json",
        help="Theater registry for ID validation",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        registry = validate_theaters_registry_file(args.registry)
        theater_ids = {str(row["id"]) for row in registry.get("theaters", [])}
        mapped = map_central_cinema_contract_to_indie(payload, theater_ids=theater_ids)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        text = serialize_central_cinema_mapping_log(mapped.log_envelope)
        args.output.write_text(text, encoding="utf-8")
        print("Central Cinema contract mapping complete (offline)")
        print(f"  mapping_status: {mapped.mapping_status}")
        print(f"  restate_safe: {mapped.restate_safe}")
        print(f"  accepted_records: {mapped.stats.get('accepted_records')}")
        print(f"  rejected_records: {mapped.stats.get('rejected_records')}")
        print(f"  wrote: {args.output}")
        return 0
    except (OSError, json.JSONDecodeError, CentralCinemaMappingError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
