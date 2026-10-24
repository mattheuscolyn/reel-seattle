#!/usr/bin/env python3
"""Freeze the corrected-label market V3 challenger. NEVER refit on daily runs.

This creates an immutable candidate weight file from the documented historical
train+validation split. Prospective evaluation starts strictly after freeze.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from reel_seattle.analysis.leaving_soon_prepublication_survival import _fit_hazard, _split
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import load_snapshot_infos
from reel_seattle.analysis.remaining_run_shadow import serialize_hazard
from scripts.evaluate_remaining_run_calendar_v2 import _point_in_time_rows
from scripts.evaluate_remaining_run_market_v3 import FEATURES, matched_market_cohorts

VERSION = "remaining_run_market_v3_prospective_1"
OUTPUT = Path("data/models/remaining_run_shadow/market_v3_candidate.json")
TRAIN_END = "2026-09-06"


def freeze_model(root: Path, *, frozen_at: str | None = None) -> dict:
    bundle, theater = _point_in_time_rows(root)
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    _, candidates = matched_market_cohorts(theater, bundle=bundle, statuses=statuses)
    split = _split(candidates)
    training = [
        r for r in [*split["train"], *split["validation"]]
        if r["label_tier"] in ("strict", "provisional_legacy")
        and r["observation_date"] <= TRAIN_END
    ]
    if len(training) < 30:
        raise RuntimeError("Not enough corrected-label observations for model freeze")
    if any(r["observation_date"] > TRAIN_END for r in training):
        raise RuntimeError("Training date exceeded sealed historical boundary")
    fitted = _fit_hazard(training, FEATURES)
    if fitted is None:
        raise RuntimeError("Market V3 hazard training failed")
    model = serialize_hazard(fitted)
    assert model is not None
    for name in ("share_of_theater", "rank_in_theater", "theater_week_vs_baseline"):
        if name in model["columns"]:
            raise RuntimeError("Legacy theater-only column in market candidate")
    checksum = hashlib.sha256(json.dumps(model, sort_keys=True, allow_nan=False).encode()).hexdigest()
    return {
        "model_version": VERSION,
        "feature_version": "market_features_v3_research",
        "selector_version": "market_publication_v1",
        "model_sha256": checksum,
        "frozen_at": frozen_at or datetime.now(timezone.utc).isoformat(),
        "training_data_as_of": bundle.as_of.isoformat(),
        "latest_training_observation": max(r["observation_date"] for r in training),
        "train_observation_cutoff": TRAIN_END,
        "training_rows": len(training),
        "training_evidence_tiers": {
            tier: sum(r["label_tier"] == tier for r in training)
            for tier in ("strict", "provisional_legacy")
        },
        "prospective_only": True,
        "promotion_state": "not_eligible",
        "holdout_policy": "Historical diagnostic holdout does not count toward prospective promotion",
        "candidate_hazard": model,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--root", type=Path, default=Path("."))
    p.add_argument("--output", type=Path, default=OUTPUT)
    args = p.parse_args()
    root = args.root.resolve()
    output = root / args.output
    if output.exists():
        raise RuntimeError(f"Refusing to overwrite frozen challenger {output}")
    data = freeze_model(root)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, sort_keys=True, indent=2, allow_nan=False) + "\n")
    print(json.dumps({k: v for k, v in data.items() if k != "candidate_hazard"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
