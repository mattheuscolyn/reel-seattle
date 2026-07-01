#!/usr/bin/env python3
"""Evaluate Leaving Soon baseline heuristics (PR D).

Modeling-only: does not train a production model or emit frontend artifacts.

Example:
    python scripts/evaluate_leaving_soon_baselines.py
    python scripts/evaluate_leaving_soon_baselines.py \\
        --input data/analysis/leaving_soon_labels.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_eval import (  # noqa: E402
    ALLOWED_PREDICTOR_FIELDS,
    FORBIDDEN_PREDICTOR_FIELDS,
    run_baseline_evaluation,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate Leaving Soon baseline heuristics on labeled rows",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/analysis/leaving_soon_labels.csv"),
        help="Labeled rows CSV from build_leaving_soon_labels.py",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=Path("data/analysis/leaving_soon_baseline_report.json"),
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        default=Path("data/analysis/leaving_soon_baseline_report.md"),
    )
    parser.add_argument(
        "--predictions-output",
        type=Path,
        default=Path("data/analysis/leaving_soon_baseline_predictions.csv"),
    )
    parser.add_argument(
        "--no-predictions-file",
        action="store_true",
        help="Skip writing per-row predictions CSV",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.input.is_file():
        print(f"Error: labeled input not found: {args.input}")
        print("Run: python scripts/build_leaving_soon_labels.py")
        return 1

    report = run_baseline_evaluation(
        args.input.resolve(),
        json_output=args.json_output.resolve(),
        markdown_output=args.markdown_output.resolve(),
        predictions_output=None if args.no_predictions_file else args.predictions_output.resolve(),
    )

    best = report["best_high_confidence_rule"]
    rec = report["recommendation"]
    print("Leaving Soon baseline evaluation summary")
    print(f"  labeled rows: {report['labeled_rows']}")
    print(f"  distinct films: {report['distinct_films']}")
    print(f"  base positive rate: {report['base_positive_rate']:.2%}")
    print(
        f"  anchor range: {report['anchor_date_range']['earliest']} .. "
        f"{report['anchor_date_range']['latest']}"
    )
    if best["rule_id"]:
        if best["test"]:
            t = best["test"]
            print(f"  best rule (validation pick): {best['rule_id']}")
            print(f"    held-out test precision: {t['precision']:.2%}")
            print(f"    held-out test recall: {t['recall']:.2%}")
            print(f"    held-out test coverage: {t['coverage']:.2%}")
            print(f"    held-out test lift: {t['lift_over_base']:.2f}x")
            print(f"    held-out false positives: {t['false_positives']}")
    else:
        print("  best rule: (none met validation gates)")
    print(f"  recommendation: {rec['decision']}")
    print(f"  {rec['summary']}")
    print(f"  json report: {report['json_output_path']}")
    print(f"  markdown report: {report['markdown_output_path']}")
    if report.get("predictions_output_path"):
        print(f"  predictions: {report['predictions_output_path']}")
    print(f"  predictor fields: {len(ALLOWED_PREDICTOR_FIELDS)} allowed, "
          f"{len(FORBIDDEN_PREDICTOR_FIELDS)} forbidden")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
