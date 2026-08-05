#!/usr/bin/env python3
"""Validate public film enrichment artifact (T-ENR-01B)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.enrichment.constants import PUBLIC_ARTIFACT_REL  # noqa: E402
from reel_seattle.enrichment.validate import (  # noqa: E402
    validate_film_enrichment_document,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate film_enrichment_current.json.")
    parser.add_argument(
        "--path",
        type=Path,
        default=PROJECT_ROOT / PUBLIC_ARTIFACT_REL,
    )
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="Exit 0 if the artifact file is absent (rollout helper).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.path.exists():
        if args.allow_missing:
            print(f"SKIP missing enrichment artifact: {args.path}")
            return 0
        print(f"MISSING enrichment artifact: {args.path}", file=sys.stderr)
        return 1

    try:
        with args.path.open(encoding="utf-8") as handle:
            doc = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"invalid enrichment JSON: {exc}", file=sys.stderr)
        return 1

    if not isinstance(doc, dict):
        print("enrichment artifact must be an object", file=sys.stderr)
        return 1

    try:
        validate_film_enrichment_document(doc)
    except Exception as exc:  # noqa: BLE001
        print(f"validation failed: {exc}", file=sys.stderr)
        return 1

    films = doc.get("films") or []
    print(f"OK enrichment: {args.path} ({len(films)} films)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
