#!/usr/bin/env python3
"""Manual AMC Showtimes field-population and attribute-taxonomy audit.

Read-only. No AMC API calls. No secrets.

Example:
  python scripts/audit_amc_showtimes_fields.py \\
    --logs-dir data/daily_logs \\
    --max-logs 7 \\
    --api-payloads tests/fixtures/analysis/amc_showtimes_field_audit/api_showtimes.json \\
    --output-dir audit-output/amc-showtimes-field-audit
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_showtimes_field_audit import (  # noqa: E402
    ShowtimesFieldAuditError,
    build_showtimes_field_audit,
    list_amc_scrape_logs,
    write_audit_outputs,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Audit AMC Showtimes fields retained in committed scrape logs and "
            "classify optional API payload fixtures for presentation-attribute planning."
        )
    )
    parser.add_argument(
        "--logs-dir",
        type=Path,
        default=Path("data/daily_logs"),
        help="Directory containing *_amc.json scrape logs.",
    )
    parser.add_argument(
        "--max-logs",
        type=int,
        default=7,
        help="Newest N AMC logs to include (default 7).",
    )
    parser.add_argument(
        "--log-files",
        nargs="*",
        default=None,
        help="Optional explicit log paths (overrides --logs-dir/--max-logs).",
    )
    parser.add_argument(
        "--api-payloads",
        type=Path,
        default=None,
        help=(
            "Optional JSON file: array of synthetic/full AMC Showtimes API objects "
            "for attributes/languages/pricing taxonomy (not required for log audit)."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("audit-output/amc-showtimes-field-audit"),
        help="Directory for sanitized audit outputs (gitignored audit-output recommended).",
    )
    parser.add_argument(
        "--generated-at",
        default=None,
        help="Optional fixed timestamp for deterministic tests.",
    )
    return parser.parse_args(argv)


def _load_api_payloads(path: Path | None) -> list[dict]:
    if path is None:
        return []
    if not path.is_file():
        raise ShowtimesFieldAuditError(f"api payloads file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("showtimes"), list):
        rows = payload["showtimes"]
    elif isinstance(payload, list):
        rows = payload
    else:
        raise ShowtimesFieldAuditError(
            "api payloads must be a JSON array or {\"showtimes\": [...]}"
        )
    out: list[dict] = []
    for row in rows:
        if isinstance(row, dict):
            out.append(row)
    return out


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.log_files:
            log_paths = [Path(item) for item in args.log_files]
            for path in log_paths:
                if not path.is_file():
                    raise ShowtimesFieldAuditError(f"log file not found: {path}")
        else:
            log_paths = list_amc_scrape_logs(args.logs_dir, max_logs=args.max_logs)
        api_payloads = _load_api_payloads(args.api_payloads)
        report = build_showtimes_field_audit(
            log_paths=log_paths,
            api_payloads=api_payloads,
            generated_at=args.generated_at,
        )
        paths = write_audit_outputs(report, args.output_dir)
    except (OSError, json.JSONDecodeError, ShowtimesFieldAuditError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    counts = report["counts"]
    gap = report["capture_gap_summary"]
    print("AMC Showtimes field audit complete")
    print(f"  logs: {report['inputs']['log_count']}")
    print(f"  records: {counts['raw_showtime_records']}")
    print(f"  movie_ids: {counts['distinct_movie_ids']}")
    print(f"  theaters: {counts['distinct_theaters']}")
    print(f"  showtime_ids: {counts['distinct_source_showtime_ids']}")
    print(
        f"  captured_fields: {gap['captured_in_scrape_logs']}/"
        f"{gap['documented_fields']}"
    )
    print(
        f"  fixture_attributes: "
        f"{report['attribute_taxonomy'].get('unique_attributes', 0)}"
    )
    for key, path in paths.items():
        print(f"  wrote[{key}]: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
