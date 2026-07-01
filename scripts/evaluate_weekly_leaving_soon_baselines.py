#!/usr/bin/env python3
"""Evaluate weekly-extension Leaving Soon baseline heuristics (PR D2)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.weekly_leaving_soon_eval import (  # noqa: E402
    ALLOWED_PREDICTOR_FIELDS,
    FORBIDDEN_PREDICTOR_FIELDS,
    compare_weekly_identity_modes,
    load_weekly_labeled_rows,
    run_weekly_baseline_evaluation,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate weekly Leaving Soon baselines on corrected labels",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_labels.csv"),
        help="Weekly labeled rows CSV from build_weekly_leaving_soon_labels.py",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_baseline_report.json"),
    )
    parser.add_argument(
        "--markdown-output",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_baseline_report.md"),
    )
    parser.add_argument(
        "--predictions-output",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_baseline_predictions.csv"),
    )
    parser.add_argument(
        "--no-predictions-file",
        action="store_true",
        help="Skip writing per-row predictions CSV",
    )
    parser.add_argument(
        "--identity-mode",
        choices=("title", "parent", "compare"),
        default="title",
        help="Evaluate title-key labels, parent-key labels, or compare both",
    )
    parser.add_argument(
        "--parent-input",
        type=Path,
        default=Path("data/analysis/weekly_leaving_soon_labels_parent.csv"),
        help="Parent-key labels CSV for --identity-mode parent|compare",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.identity_mode == "compare":
        if not args.input.is_file():
            print(f"Error: title labels not found: {args.input}")
            return 1
        if not args.parent_input.is_file():
            print(f"Error: parent labels not found: {args.parent_input}")
            print("Run: python scripts/build_weekly_leaving_soon_labels.py --identity-mode parent")
            return 1
        comparison = compare_weekly_identity_modes(
            load_weekly_labeled_rows(args.input.resolve()),
            load_weekly_labeled_rows(args.parent_input.resolve()),
        )
        out_path = args.json_output.parent / "weekly_leaving_soon_identity_comparison.json"
        out_path.write_text(json.dumps(comparison, indent=2) + "\n", encoding="utf-8")
        print("Weekly identity mode comparison")
        for mode in ("title_key", "parent_key"):
            snap = comparison[mode]
            print(f"  [{mode}] labeled={snap['labeled_rows']} films={snap['distinct_films']}")
            print(
                f"    best={snap['best_rule_id']} precision={snap.get('precision', 0):.2%} "
                f"FP={snap.get('false_positives')} monthly_min={snap.get('monthly_min_precision', 0):.2%}"
            )
        print(f"  wrote: {out_path}")
        return 0

    input_path = args.input
    json_output = args.json_output
    markdown_output = args.markdown_output
    predictions_output = None if args.no_predictions_file else args.predictions_output
    if args.identity_mode == "parent":
        input_path = args.parent_input
        json_output = args.json_output.parent / "weekly_leaving_soon_baseline_report_parent.json"
        markdown_output = args.markdown_output.parent / "weekly_leaving_soon_baseline_report_parent.md"
        if predictions_output is not None:
            predictions_output = predictions_output.parent / "weekly_leaving_soon_baseline_predictions_parent.csv"
    if not input_path.is_file():
        print(f"Error: weekly labeled input not found: {input_path}")
        print("Run: python scripts/build_weekly_leaving_soon_labels.py")
        return 1

    report = run_weekly_baseline_evaluation(
        input_path.resolve(),
        json_output=json_output.resolve(),
        markdown_output=markdown_output.resolve(),
        predictions_output=predictions_output.resolve() if predictions_output else None,
    )

    best = report["best_high_confidence_rule"]
    rec = report["recommendation"]
    print("Weekly Leaving Soon baseline evaluation summary")
    print(f"  labeled rows: {report['labeled_rows']}")
    print(f"  distinct films: {report['distinct_films']}")
    print(f"  corrected base positive rate: {report['base_positive_rate']:.2%}")
    print(
        f"  anchor range: {report['anchor_date_range']['earliest']} .. "
        f"{report['anchor_date_range']['latest']}"
    )
    if best["rule_id"]:
        if best["test"]:
            t = best["test"]
            print(f"  best rule (validation gates): {best['rule_id']}")
            print(f"    held-out test precision: {t['precision']:.2%}")
            print(f"    held-out test recall: {t['recall']:.2%}")
            print(f"    held-out test coverage: {t['coverage']:.2%}")
            print(f"    held-out test lift: {t['lift_over_base']:.2f}x")
            print(f"    held-out false positives: {t['false_positives']}")
            print(f"    held-out false negatives: {t['false_negatives']}")
    else:
        print("  best rule (validation gates): (none met gates)")
    print("  coverage floor picks (validation -> test):")
    for floor, entry in report["coverage_floor_best_rules"].items():
        if entry is None:
            print(f"    {floor}: (no rule)")
            continue
        test = entry.get("test") or {}
        print(
            f"    {floor}: {entry['rule_id']} - "
            f"precision {test.get('precision', 0):.2%}, "
            f"coverage {test.get('coverage', 0):.2%}, "
            f"lift {test.get('lift_over_base', 0):.2f}x"
        )
    print(f"  recommendation: {rec['decision']}")
    print(f"  {rec['summary']}")
    print(f"  json report: {report['json_output_path']}")
    print(f"  markdown report: {report['markdown_output_path']}")
    if report.get("predictions_output_path"):
        print(f"  predictions: {report['predictions_output_path']}")
    print(
        f"  predictor fields: {len(ALLOWED_PREDICTOR_FIELDS)} allowed, "
        f"{len(FORBIDDEN_PREDICTOR_FIELDS)} forbidden"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
