#!/usr/bin/env python3
"""Build the Leaving Soon scheduling-assumptions visual audit.

Read-only. Does not scrape, retrain, or write production Leaving Soon artifacts.

Example:
  python scripts/audit_leaving_soon_scheduling_assumptions.py
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_scheduling_assumptions import prepare_audit  # noqa: E402
from reel_seattle.analysis.leaving_soon_scheduling_assumptions_report import (  # noqa: E402
    write_outputs,
)

DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "audits" / "leaving_soon_scheduling_assumptions"


def _head_sha(root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            text=True,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = prepare_audit(PROJECT_ROOT)
    result["summary"]["base_commit"] = _head_sha(PROJECT_ROOT)
    write_outputs(result, args.output)
    summary = result["summary"]
    counts = summary["counts"]
    print(f"Wrote {args.output / 'index.html'}")
    print(
        "confirmed film×theater="
        f"{counts['confirmed_film_theater']} market={counts['confirmed_market']} "
        f"catalog rereleases={counts['confident_rerelease_engagements']}"
    )


if __name__ == "__main__":
    main()
