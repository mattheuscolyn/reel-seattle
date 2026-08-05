#!/usr/bin/env python3
"""Apply a validated TMDB match decision patch to the authored decisions artifact.

Examples:
  python scripts/apply_tmdb_match_decisions.py --patch path/to/patch.json
  python scripts/apply_tmdb_match_decisions.py --patch path/to/patch.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.constants import DECISIONS_REL  # noqa: E402
from reel_seattle.film_identity.decisions import (  # noqa: E402
    apply_decision_patch,
    load_decisions,
    validate_decisions_document,
)
from reel_seattle.film_identity.io_util import atomic_write_json  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply TMDB match decision patch.")
    parser.add_argument("--patch", type=Path, required=True)
    parser.add_argument(
        "--decisions-path",
        type=Path,
        default=PROJECT_ROOT / DECISIONS_REL,
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reviewed-by", default="developer")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    with args.patch.open(encoding="utf-8") as handle:
        patch_doc = json.load(handle)

    patches = patch_doc.get("decisions") if isinstance(patch_doc, dict) else None
    if patches is None and isinstance(patch_doc, dict) and "decision" in patch_doc:
        patches = [patch_doc]
    if not isinstance(patches, list) or not patches:
        print("Patch must be {decisions:[...]} or a single decision object.", file=sys.stderr)
        return 2

    doc = load_decisions(args.decisions_path)
    for patch in patches:
        if not isinstance(patch, dict):
            raise ValueError("each patch decision must be an object")
        doc = apply_decision_patch(doc, patch, reviewed_by=args.reviewed_by)

    validate_decisions_document(doc)
    if args.dry_run:
        print(json.dumps(doc, indent=2, sort_keys=True))
        return 0
    atomic_write_json(args.decisions_path, doc)
    print(f"Wrote {len(doc['decisions'])} decisions -> {args.decisions_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
