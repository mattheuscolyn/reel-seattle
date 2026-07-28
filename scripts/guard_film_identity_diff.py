#!/usr/bin/env python3
"""Guard that live TMDB matching only changed allowed generated paths.

Intended for clean CI checkouts (diff vs HEAD). Local dirty trees will fail
unless only allowlisted generated paths differ from HEAD.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.constants import DECISIONS_REL  # noqa: E402
from reel_seattle.film_identity.workflow_support import (  # noqa: E402
    ALLOWED_GENERATED_RELS,
    assert_allowed_changed_paths,
    file_sha256,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail if film-identity live match dirty paths are unexpected."
    )
    parser.add_argument(
        "--decisions-sha-before",
        default=None,
        help="Optional SHA-256 of decisions file captured before matching.",
    )
    parser.add_argument(
        "--print-paths",
        action="store_true",
        help="Print allowed changed paths one per line (OK message on stderr).",
    )
    parser.add_argument(
        "--delete-bak",
        action="store_true",
        help="Remove allowlisted *.bak sidecars before evaluating the diff.",
    )
    return parser.parse_args(argv)


def _git_changed_paths(root: Path) -> list[str]:
    tracked = subprocess.run(
        ["git", "diff", "--name-only", "HEAD"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    paths = [
        line.strip()
        for line in (tracked.stdout + untracked.stdout).splitlines()
        if line.strip()
    ]
    return sorted(set(paths))


def _delete_allowed_bak_files(root: Path) -> None:
    for rel in ALLOWED_GENERATED_RELS:
        bak = root / f"{rel}.bak"
        if bak.exists():
            bak.unlink()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    decisions_path = PROJECT_ROOT / DECISIONS_REL
    if args.decisions_sha_before:
        if not decisions_path.exists():
            print("decisions file missing after match", file=sys.stderr)
            return 1
        after = file_sha256(decisions_path)
        if after != args.decisions_sha_before:
            print(
                "authored decisions file changed during automatic matching",
                file=sys.stderr,
            )
            return 1

    if args.delete_bak:
        _delete_allowed_bak_files(PROJECT_ROOT)

    changed = _git_changed_paths(PROJECT_ROOT)
    # Ignore bak sidecars of allowed generated files if still present.
    filtered: list[str] = []
    for path in changed:
        if path.endswith(".bak"):
            stem = path[: -len(".bak")]
            if stem in ALLOWED_GENERATED_RELS:
                continue
        filtered.append(path)

    try:
        allowed = assert_allowed_changed_paths(filtered, root=PROJECT_ROOT)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if args.print_paths:
        for path in allowed:
            print(path)
        print(
            f"Diff guard OK ({len(allowed)} allowed generated path(s)).",
            file=sys.stderr,
        )
    else:
        print(f"Diff guard OK ({len(allowed)} allowed generated path(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
