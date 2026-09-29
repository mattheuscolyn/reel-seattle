#!/usr/bin/env python3
"""Audit whether missing TMDB IDs are safe to use as a suppression signal."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.tmdb_suppression_readiness import (  # noqa: E402
    SuppressionReadinessAuditError,
    audit_tmdb_suppression_readiness,
    load_catalog,
    write_audit,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalog",
        type=Path,
        default=PROJECT_ROOT / "data/film_identity/film_identity_catalog.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "audit-output/tmdb_suppression_readiness.json",
    )
    parser.add_argument("--sample-limit", type=int, default=25)
    parser.add_argument("--stdout", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        report = audit_tmdb_suppression_readiness(
            load_catalog(args.catalog),
            sample_limit=max(0, args.sample_limit),
        )
    except (OSError, json.JSONDecodeError, SuppressionReadinessAuditError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.stdout:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        path = write_audit(report, args.output)
        print(f"Wrote suppression readiness audit -> {path}")

    print(
        "Blanket null-TMDB suppression safe: "
        f"{report['blanket_null_tmdb_suppression_safe']}"
    )
    print(
        "Movie-like identities without TMDB: "
        f"{report['movie_like_without_tmdb_count']}"
    )
    print(
        "Explicit programs without TMDB: "
        f"{report['explicit_program_without_tmdb_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
