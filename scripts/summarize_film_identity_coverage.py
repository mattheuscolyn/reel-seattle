#!/usr/bin/env python3
"""Write a safe markdown summary from tmdb_film_identity_coverage.json."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.constants import COVERAGE_REL  # noqa: E402
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage  # noqa: E402
from reel_seattle.film_identity.workflow_support import (  # noqa: E402
    build_match_summary_markdown,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize film identity coverage.")
    parser.add_argument(
        "--coverage-path",
        type=Path,
        default=PROJECT_ROOT / COVERAGE_REL,
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data/audits/tmdb_film_identity_match_summary.md",
    )
    parser.add_argument(
        "--changed-paths-file",
        type=Path,
        default=None,
        help="Optional file with one changed path per line.",
    )
    parser.add_argument(
        "--auth-mode",
        default=None,
        help="Optional TMDB auth mode label (bearer|api_key); never a secret.",
    )
    parser.add_argument(
        "--github-summary",
        action="store_true",
        help="Also append to $GITHUB_STEP_SUMMARY when set.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    with args.coverage_path.open(encoding="utf-8") as handle:
        coverage = json.load(handle)
    assert_no_tmdb_secret_leakage(coverage)
    changed: list[str] = []
    if args.changed_paths_file and args.changed_paths_file.exists():
        changed = [
            line.strip()
            for line in args.changed_paths_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    markdown = build_match_summary_markdown(
        coverage,
        changed_paths=changed,
        auth_mode=args.auth_mode,
    )
    assert_no_tmdb_secret_leakage({"summary": markdown})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(markdown if markdown.endswith("\n") else markdown + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")
    if args.github_summary:
        summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary_path:
            with open(summary_path, "a", encoding="utf-8") as handle:
                handle.write(markdown)
                if not markdown.endswith("\n"):
                    handle.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
