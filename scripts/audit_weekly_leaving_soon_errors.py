#!/usr/bin/env python3
"""Audit weekly Leaving Soon false positives for a baseline rule (PR D4)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.weekly_leaving_soon_error_audit import (  # noqa: E402
    build_error_audit_rows,
    summarize_false_positive_audit,
    write_error_audit_csv,
)
from reel_seattle.analysis.weekly_leaving_soon_eval import (  # noqa: E402
    build_weekly_heuristic_catalog,
    load_weekly_labeled_rows,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit weekly Leaving Soon prediction errors")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_labels.csv"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_error_audit.csv"),
    )
    parser.add_argument(
        "--rule-id",
        default="low_footprint_not_first_week",
        help="Baseline rule to audit",
    )
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_error_audit_summary.json"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.input.is_file():
        print(f"Error: labeled input not found: {args.input}")
        return 1

    rows = load_weekly_labeled_rows(args.input.resolve())
    catalog = {spec.rule_id: spec for spec in build_weekly_heuristic_catalog()}
    spec = catalog.get(args.rule_id)
    if spec is None:
        print(f"Error: unknown rule id: {args.rule_id}")
        return 1

    audit_rows = build_error_audit_rows(
        rows,
        rule_id=spec.rule_id,
        predict=spec.predict,
    )
    write_error_audit_csv(args.output.resolve(), audit_rows)
    summary = summarize_false_positive_audit(audit_rows)
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote error audit: {args.output.resolve()}")
    print(f"  false positives: {summary['false_positive_count']}")
    print(f"  false negatives: {summary['false_negative_count']}")
    print(f"  summary: {args.summary_output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
