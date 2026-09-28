#!/usr/bin/env python3
"""Score stored Leaving Soon snapshots. Does not retrain or publish."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_frozen import load_active_model  # noqa: E402
from reel_seattle.analysis.leaving_soon_inference import DEFAULT_SNAPSHOT_DIR  # noqa: E402
from reel_seattle.analysis.leaving_soon_prospective import (  # noqa: E402
    load_prediction_snapshots,
    run_ends_from_lifecycle_rows,
)
from reel_seattle.analysis.leaving_soon_survival import filter_primary_observations, json_ready  # noqa: E402
from reel_seattle.analysis.leaving_soon_v2_audit import (  # noqa: E402
    HORIZONS,
    horizon_frame,
    join_predictions,
    load_amc_lifecycle,
    score_binary,
)


def main() -> int:
    rows, _gaps, as_of = load_amc_lifecycle(PROJECT_ROOT)
    primary, _accounting = filter_primary_observations(rows)
    snapshots = load_prediction_snapshots(PROJECT_ROOT / DEFAULT_SNAPSHOT_DIR)
    frozen = load_active_model(PROJECT_ROOT / "data/models/leaving_soon/active.json")
    t7 = frozen.threshold(horizon=7, min_precision="min_precision_0.95")
    t14 = frozen.threshold(horizon=14, min_precision="min_precision_0.90")
    joined = join_predictions(
        snapshots,
        observations_by_key={(row.run_id, row.observation_date.isoformat()): row for row in primary},
        run_ends=run_ends_from_lifecycle_rows(primary),
        as_of=as_of,
        last_chance_threshold=t7,
        leaving_soon_threshold=t14,
    )
    report = {"as_of": as_of.isoformat(), "eligible": len(joined), "horizons": {}}
    for horizon in HORIZONS:
        y_true, scores = horizon_frame(joined, horizon)
        threshold = t7 if horizon <= 7 else t14
        report["horizons"][str(horizon)] = score_binary(y_true, scores, threshold=threshold)
    print(json.dumps(json_ready(report), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
