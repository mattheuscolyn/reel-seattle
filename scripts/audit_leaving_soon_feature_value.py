#!/usr/bin/env python3
"""Point-in-time Leaving Soon feature audit. Does not write production artifacts."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_feature_value import run_audit  # noqa: E402
from reel_seattle.analysis.leaving_soon_feature_value_report import write_outputs  # noqa: E402

DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "audits" / "leaving_soon_feature_value"


def main() -> None:
    result = run_audit(PROJECT_ROOT)
    write_outputs(result, DEFAULT_OUTPUT)
    hold = (result["ablations"].get(result["best_model"]) or {}).get("holdout") or {}
    print(
        f"Wrote {DEFAULT_OUTPUT / 'index.html'} best={result['best_model']} "
        f"holdout_n={hold.get('n')} pr_auc={hold.get('pr_auc')}"
    )


if __name__ == "__main__":
    main()
