#!/usr/bin/env python3
"""Market as-of synchronization ablation for calendar-v2 research model.

Compares original mixed-snapshot market features with simultaneous, earliest-
forecast-date market footprint, fitting and testing on identical film/week
sample identities and corrected schedule labels. No production changes.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_prepublication_survival import _market_rows
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import load_snapshot_infos
from scripts.audit_remaining_run_feature_pit import (
    audit_market_as_of, synchronized_market_features,
)
from scripts.evaluate_remaining_run_calendar_v2 import (
    _candidate_rows, _evaluate_grain, _point_in_time_rows,
)

VERSION = "remaining_run_market_snapshot_sync_ablation_v1"

def _key(row: Mapping[str, Any]) -> tuple[str, str, str]:
    return (row["film_id"], row["upcoming_friday"], row["observation_date"])


def _ids_match(a: Sequence[Mapping[str, Any]], b: Sequence[Mapping[str, Any]]):
    if [_key(row) for row in a] != [_key(row) for row in b]:
        raise RuntimeError("market cohorts differ between controls")
    for before, after in zip(a, b):
        if (before["bucket"], before["censored"], before["label_tier"]) != (
            after["bucket"], after["censored"], after["label_tier"]
        ):
            raise RuntimeError("synchronized feature ablation changed a label")


def synchronize_market_rows(
    raw: Sequence[Mapping[str, Any]],
    screenings: Sequence,
    *,
    theater_ids: Sequence[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    by_film = defaultdict(list)
    for show in screenings:
        by_film[show.film_id].append(show)
    result = []
    moved = Counter()
    delta_sum = Counter()
    for row in raw:
        features = synchronized_market_features(
            by_film[row["film_id"]], row["film_id"],
            date.fromisoformat(row["upcoming_friday"]),
            date.fromisoformat(row["observation_date"]),
            theater_ids=theater_ids,
        )
        copied = dict(row)
        for key, value in features.items():
            old = copied.get(key)
            if isinstance(old, (float, int)) and abs(float(old) - value) > 1e-8:
                moved[key] += 1
                if key in {"market_screenings", "market_theater_count", "current_week_screenings"}:
                    delta_sum[key] += float(value) - float(old)
            copied[key] = value
        result.append(copied)
    return result, {
        "rows": len(result),
        "features_modified_row_counts": dict(moved),
        "feature_sum_deltas": dict(delta_sum),
        "limitation": (
            "Only the listed market footprint and growth features are rebuilt. "
            "The chosen theater's local features and other segment metadata "
            "remain as originally selected and may have independent leakage."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/audits/remaining_run_market_snapshot_sync_evaluation.json"))
    args = parser.parse_args()
    root = args.root.resolve()
    bundle, raw = _point_in_time_rows(root)
    market_raw = _market_rows(raw)
    sync_raw, changes = synchronize_market_rows(
        market_raw, bundle.screenings, theater_ids=tuple(bundle.theater_names),
    )
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    control = _candidate_rows(market_raw, bundle=bundle, statuses=statuses, grain="market")
    synchronized = _candidate_rows(sync_raw, bundle=bundle, statuses=statuses, grain="market")
    _ids_match(control, synchronized)
    before = _evaluate_grain(control, grain="market_original_mixed_date")
    after = _evaluate_grain(synchronized, grain="market_synchronized_date")
    for entry in (before, after):
        entry.pop("candidate_model_serialized", None)
    result = {
        "version": VERSION,
        "as_of": bundle.as_of.isoformat(),
        "n_market_film_week_rows": len(control),
        "same_film_week_cohorts_and_labels": True,
        "changed_features": changes,
        "original_mixed_date": before,
        "synchronized_market_footprint": after,
        "interpretation_guard": (
            "This is an exploratory ablation on the SAME strictly evidenced holdout "
            "used in v2. Any apparent win here is exploratory/selection-biased and "
            "must be confirmed on another untouched later cohort. No promotion."
        ),
    }
    out = (root / args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    def compact(entry):
        block = entry["same_strict_holdout"]
        return {
            "old_label_control": block["old_target_retrained_control"],
            "calendar_v2": block["calendar_v2_candidate"],
            "calendar_v2_by_segment": block["candidate_by_segment"],
        }
    print(json.dumps({
        "version": VERSION, "as_of": result["as_of"],
        "same_cohorts": True, "changed_features": changes,
        "original": compact(before), "synchronized": compact(after),
        "output": str(out),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
