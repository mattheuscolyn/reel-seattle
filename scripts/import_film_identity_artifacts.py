#!/usr/bin/env python3
"""Import a downloaded film-identity match artifact package for local cockpit review.

Example:
  python scripts/import_film_identity_artifacts.py --from-dir ~/Downloads/film-identity-match-123
  python scripts/import_film_identity_artifacts.py --from-dir ./pkg --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.workflow_support import (  # noqa: E402
    import_generated_artifacts,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import validated film identity generated artifacts."
    )
    parser.add_argument("--from-dir", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.from_dir.is_dir():
        print(f"not a directory: {args.from_dir}", file=sys.stderr)
        return 2
    try:
        summary = import_generated_artifacts(
            args.from_dir,
            root=PROJECT_ROOT,
            dry_run=args.dry_run,
        )
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
