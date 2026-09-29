#!/usr/bin/env python3
"""Audit film-pipeline source metadata from the latest normalized daily logs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.film_pipeline_source_audit import (  # noqa: E402
    FilmPipelineSourceAuditError,
    SOURCES,
    build_film_pipeline_source_audit,
    write_audit_json,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--logs-dir", type=Path, default=Path("data/daily_logs"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("audit-output/film_pipeline_source_metadata.json"),
    )
    parser.add_argument("--generated-at", default=None)
    parser.add_argument(
        "--source",
        action="append",
        choices=SOURCES,
        dest="sources",
        help="Audit only this source; repeat for multiple sources.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        report = build_film_pipeline_source_audit(
            logs_dir=args.logs_dir,
            sources=tuple(args.sources or SOURCES),
            generated_at=args.generated_at,
        )
        path = write_audit_json(report, args.output)
    except (OSError, json.JSONDecodeError, FilmPipelineSourceAuditError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print("Film pipeline source metadata audit complete")
    for source, block in report["sources"].items():
        if block.get("status") != "ok":
            print(f"  {source}: {block.get('status')}")
            continue
        runtime = block["runtime"]
        year = block["release_year"]
        print(
            f"  {source}: identities={block['source_identity_count']} "
            f"features={block['eligible_feature_count']} "
            f"runtime_missing={runtime['eligible_features_missing_runtime']} "
            f"year_missing={year['eligible_features_missing_year']} "
            f"year_strategy={year['strategy']}"
        )
    print(f"  wrote: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
