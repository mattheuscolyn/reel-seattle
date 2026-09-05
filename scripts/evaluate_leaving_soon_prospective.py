#!/usr/bin/env python3
"""Score matured Leaving Soon prediction snapshots against later run ends.

Does not run during daily inference. Does not retrain. Recent predictions
are skipped until their 7/14-day windows can be observed.

Example:
  python scripts/evaluate_leaving_soon_prospective.py
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_frozen import load_active_model  # noqa: E402
from reel_seattle.analysis.leaving_soon_inference import (  # noqa: E402
    DEFAULT_SNAPSHOT_DIR,
    load_lifecycle_observations,
)
from reel_seattle.analysis.leaving_soon_prospective import (  # noqa: E402
    evaluate_matured_predictions,
    load_prediction_snapshots,
    run_ends_from_lifecycle_rows,
)
from reel_seattle.analysis.leaving_soon_survival import json_ready  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate matured Leaving Soon snapshots.")
    parser.add_argument("--snapshots", type=Path, default=DEFAULT_SNAPSHOT_DIR)
    parser.add_argument("--as-of", default=None)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args(argv)

    as_of = (
        date.fromisoformat(args.as_of)
        if args.as_of
        else datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    )
    model = load_active_model()
    snapshots = load_prediction_snapshots(args.snapshots)
    rows, _status = load_lifecycle_observations()
    report = evaluate_matured_predictions(
        snapshots,
        run_ends=run_ends_from_lifecycle_rows(rows),
        as_of=as_of,
        last_chance_threshold=model.threshold(horizon=7, min_precision="min_precision_0.95"),
        leaving_soon_threshold=model.threshold(horizon=14, min_precision="min_precision_0.90"),
    )
    text = json.dumps(json_ready(report), indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
        print(f"Wrote {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
