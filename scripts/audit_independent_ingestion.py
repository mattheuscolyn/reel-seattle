#!/usr/bin/env python3
"""Manual SIFF/Beacon ingestion inventory (read-only).

Example:
  python scripts/audit_independent_ingestion.py \\
    --logs-dir data/daily_logs \\
    --max-logs 7 \\
    --output audit-output/independent_theater_ingestion_audit.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.independent_ingestion_audit import (  # noqa: E402
    IndependentIngestionAuditError,
    build_independent_ingestion_audit,
    write_audit_json,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inventory SIFF/Beacon scrape-log identity and emptiness behavior."
    )
    parser.add_argument("--logs-dir", type=Path, default=Path("data/daily_logs"))
    parser.add_argument("--max-logs", type=int, default=7)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("audit-output/independent_theater_ingestion_audit.json"),
    )
    parser.add_argument("--generated-at", default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        report = build_independent_ingestion_audit(
            logs_dir=args.logs_dir,
            max_logs=args.max_logs,
            generated_at=args.generated_at,
        )
        path = write_audit_json(report, args.output)
    except (OSError, json.JSONDecodeError, IndependentIngestionAuditError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print("Independent theater ingestion inventory complete")
    for source, block in report["sources"].items():
        print(
            f"  {source}: logs={block['log_count']} records={block['raw_showtime_records']} "
            f"empty_days={block['empty_log_days']} "
            f"empty_no_warn={block['empty_log_days_without_warnings']} "
            f"showtime_ids={block['distinct_source_showtime_ids']}"
        )
    print(f"  wrote: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
