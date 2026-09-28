#!/usr/bin/env python3
"""Fit the non-production Leaving Soon v2 candidate. Does not touch active.json."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.audit_leaving_soon_v2 import CANDIDATE_PATH, build_report  # noqa: E402


def main() -> int:
    report = build_report(PROJECT_ROOT)
    print(report["recommendation"]["code"])
    print(PROJECT_ROOT / CANDIDATE_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
