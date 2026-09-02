#!/usr/bin/env python3
"""Evaluate the v1 remaining-run survival model from an existing observation table.

Offline only. Does not write production Leaving Soon artifacts or UI.

This is a thin wrapper around ``scripts/train_leaving_soon_survival.py`` that
defaults to a previously generated lifecycle CSV so the observation table is
not rebuilt unless you omit ``--observations-csv``.

Example:
  python scripts/evaluate_leaving_soon_survival.py
  python scripts/evaluate_leaving_soon_survival.py --observations-csv audit-output/leaving-soon-survival-v1/lifecycle/observations.csv
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.train_leaving_soon_survival import main as train_main  # noqa: E402

DEFAULT_OBSERVATIONS = Path("audit-output/leaving-soon-survival-v1/lifecycle/observations.csv")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--observations-csv" not in args and DEFAULT_OBSERVATIONS.is_file():
        args = ["--observations-csv", str(DEFAULT_OBSERVATIONS), *args]
    return train_main(args)


if __name__ == "__main__":
    raise SystemExit(main())
