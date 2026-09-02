#!/usr/bin/env python3
"""Compare opening_this_week_current vs newly_added_current (local QA)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _load(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Diff Opening This Week keys against Newly Added keys.",
    )
    parser.add_argument(
        "--opening",
        type=Path,
        default=PROJECT_ROOT / "public/data/opening_this_week_current.json",
    )
    parser.add_argument(
        "--newly-added",
        type=Path,
        default=PROJECT_ROOT / "public/data/newly_added_current.json",
    )
    args = parser.parse_args()

    opening = _load(args.opening)
    newly = _load(args.newly_added)

    opening_keys = {
        str(entry.get("parent_film_key") or entry.get("showtime_film_key") or "").strip()
        for entry in opening.get("entries", [])
    }
    opening_keys.discard("")

    newly_keys = {
        str(entry.get("showtime_film_key") or "").strip()
        for entry in newly.get("entries", [])
    }
    newly_keys.discard("")

    both = sorted(opening_keys & newly_keys)
    opening_only = sorted(opening_keys - newly_keys)
    newly_only = sorted(newly_keys - opening_keys)

    print(f"Opening entries: {len(opening_keys)}")
    print(f"Newly Added keys: {len(newly_keys)}")
    print(f"In both: {len(both)}")
    print(f"Opening only: {len(opening_only)}")
    print(f"Newly Added only: {len(newly_only)}")
    print("\nOpening only (sample):")
    for key in opening_only[:25]:
        print(f"  - {key}")
    print("\nNewly Added only (sample):")
    for key in newly_only[:25]:
        print(f"  - {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
