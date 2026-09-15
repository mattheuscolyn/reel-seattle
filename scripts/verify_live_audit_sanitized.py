#!/usr/bin/env python3
"""Fail if any live-audit artifact still contains credential material.

Runs after the audit scripts as an independent gate: the scripts sanitize on
write, and this re-checks every file that is about to be uploaded.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from reel_seattle.live_audit_security import assert_no_secret_leakage


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="audit-output")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    if not output_dir.is_dir():
        print(f"ERROR: {output_dir} is not a directory", file=sys.stderr)
        return 2

    files = sorted(path for path in output_dir.rglob("*") if path.is_file())
    if not files:
        print(f"ERROR: no artifact files found in {output_dir}", file=sys.stderr)
        return 2

    for path in files:
        try:
            assert_no_secret_leakage(path.read_text(encoding="utf-8"))
        except ValueError as exc:
            print(f"ERROR: {path} failed sanitization: {exc}", file=sys.stderr)
            return 1
        print(f"  ok {path}")

    print(f"Sanitization check passed for {len(files)} artifact files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
