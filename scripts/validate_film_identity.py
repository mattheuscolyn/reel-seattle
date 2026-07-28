#!/usr/bin/env python3
"""Validate film identity decision / catalog / review artifacts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.constants import (  # noqa: E402
    CATALOG_REL,
    DECISIONS_REL,
    REVIEW_QUEUE_REL,
)
from reel_seattle.film_identity.decisions import validate_decisions_document  # noqa: E402
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage  # noqa: E402
from reel_seattle.validate import validate_against_schema  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate film identity artifacts.")
    parser.add_argument(
        "--decisions-path",
        type=Path,
        default=PROJECT_ROOT / DECISIONS_REL,
    )
    parser.add_argument(
        "--catalog-path",
        type=Path,
        default=PROJECT_ROOT / CATALOG_REL,
    )
    parser.add_argument(
        "--review-queue-path",
        type=Path,
        default=PROJECT_ROOT / REVIEW_QUEUE_REL,
    )
    parser.add_argument(
        "--require-generated",
        action="store_true",
        help="Fail if catalog/review queue files are missing.",
    )
    return parser.parse_args(argv)


def _load(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"expected object: {path}")
    return data


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    decisions = _load(args.decisions_path)
    validate_decisions_document(decisions)
    print(f"OK decisions: {args.decisions_path}")

    for path, schema_rel, label in (
        (
            args.catalog_path,
            "schema/film_identity/film_identity_catalog/v1.0.0.json",
            "catalog",
        ),
        (
            args.review_queue_path,
            "schema/film_identity/tmdb_match_review_queue/v1.0.0.json",
            "review_queue",
        ),
    ):
        if not path.exists():
            if args.require_generated:
                print(f"MISSING {label}: {path}", file=sys.stderr)
                return 1
            print(f"SKIP {label} (not present): {path}")
            continue
        doc = _load(path)
        validate_against_schema(doc, PROJECT_ROOT / schema_rel, label=label)
        assert_no_tmdb_secret_leakage(doc)
        print(f"OK {label}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
