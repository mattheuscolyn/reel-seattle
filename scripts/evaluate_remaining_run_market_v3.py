#!/usr/bin/env python3
"""Evaluate genuinely market-grain features against the former hybrid rows.

Research-only, matched original target labels and strict holdout; no promotion.
"""
from __future__ import annotations
import argparse
import json
from collections import Counter
from pathlib import Path

from reel_seattle.analysis.remaining_run_market_features import (
    VERSION, MARKET_REPLACEMENT, THEATER_ONLY, build_historical_market_rows,
)
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    _market_rows, _feature_names, _fit_hazard, _split,
)
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import load_snapshot_infos
from scripts.evaluate_remaining_run_calendar_v2 import (
    _point_in_time_rows, _candidate_rows, _metrics, _score_for,
    _paired_bootstrap, _by_segment,
)

EVAL_VERSION = "remaining_run_market_v3_backtest_1"
RENAMES = {
    "share_of_theater": "share_of_market",
    "rank_in_theater": "rank_in_market",
    "theater_week_vs_baseline": "market_week_vs_baseline",
}
FEATURES = tuple(RENAMES.get(name, name) for name in _feature_names(True))


def _identity(row):
    return (str(row["film_id"]), str(row["upcoming_friday"]), str(row["observation_date"]))


def matched_market_cohorts(raw_theater, *, bundle, statuses):
    baseline = _market_rows(raw_theater)
    rebuilt = build_historical_market_rows(
        bundle.screenings, raw_theater,
        dataset_start=bundle.dataset_start, theater_ids=tuple(bundle.theater_names),
    )
    originals = {_identity(row): row for row in baseline}
    rebuilt_map = {_identity(row): row for row in rebuilt}
    if len(originals) != len(baseline) or len(rebuilt_map) != len(rebuilt):
        raise RuntimeError("Duplicate film/week/as-of keys")
    missing = set(originals) - set(rebuilt_map)
    extra = set(rebuilt_map) - set(originals)
    if missing or extra:
        raise RuntimeError(
            f"Cannot compare unmatched market cohorts: missing={len(missing)}, extra={len(extra)}"
        )
    original, candidate = [], []
    for key in sorted(originals):
        old = dict(originals[key])
        fresh = rebuilt_map[key]
        hybrid = dict(old)
        for old_name, new_name in RENAMES.items():
            hybrid[new_name] = hybrid.pop(old_name, float("nan"))
        # The old control features are intentionally the hybrid market/local
        # semantics renamed to a common model column list.
        new = dict(old)
        for field in THEATER_ONLY:
            new.pop(field, None)
        new.update(fresh)
        new["theater_id"] = old["theater_id"]  # preserve paired reporting key only
        for field in ("market_bucket", "market_censored", "market_known_weeks",
                      "market_remaining_weeks", "bucket", "censored",
                      "known_weeks", "remaining_weeks"):
            new[field] = old.get(field)
        for field in THEATER_ONLY:
            if field in new:
                raise RuntimeError(f"Hybrid theater field {field} persisted in new market row")
        if float(new["current_week_screenings"]) != float(new["market_screenings"]):
            raise RuntimeError("Inconsistent market screening units")
        original.append(hybrid)
        candidate.append(new)
    baseline_labeled = _candidate_rows(original, bundle=bundle, statuses=statuses, grain="market")
    candidate_labeled = _candidate_rows(candidate, bundle=bundle, statuses=statuses, grain="market")
    for a, b in zip(baseline_labeled, candidate_labeled):
        if _identity(a) != _identity(b) or (a["bucket"], a["censored"], a["label_tier"]) != (
            b["bucket"], b["censored"], b["label_tier"]
        ):
            raise RuntimeError("Reconstruction altered a paired forecast identity or its label")
    return baseline_labeled, candidate_labeled


def evaluate(original, candidate):
    before, after = _split(original), _split(candidate)
    fit_before = [*before["train"], *before["validation"]]
    fit_after = [*after["train"], *after["validation"]]
    fit_before = [row for row in fit_before if row["label_tier"] != "unresolved"]
    fit_after = [row for row in fit_after if row["label_tier"] != "unresolved"]
    if len(fit_before) != len(fit_after):
        raise RuntimeError("Market training cohorts diverged")
    model_before = _fit_hazard(fit_before, FEATURES)
    model_after = _fit_hazard(fit_after, FEATURES)
    if model_before is None or model_after is None:
        raise RuntimeError("Insufficient observations to fit market models")
    eval_before = [row for row in before["holdout"] if row["label_tier"] == "strict" and not row["censored"]]
    eval_after = [row for row in after["holdout"] if row["label_tier"] == "strict" and not row["censored"]]
    scores_before = _score_for(model_before, eval_before)
    scores_after = _score_for(model_after, eval_after)
    paired = _paired_bootstrap(scores_before, scores_after)
    return {
        "training_examples": len(fit_before),
        "holdout_examples": len(eval_before),
        "strict_holdout": True,
        "legacy_hybrid_features": _metrics(scores_before),
        "pure_market_v3_features": _metrics(scores_after),
        "paired_film_clustered_log_loss": paired,
        "by_segment_hybrid": _by_segment(scores_before),
        "by_segment_market_v3": _by_segment(scores_after),
        "columns": list(FEATURES),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/audits/remaining_run_market_v3_backtest.json"))
    args = parser.parse_args()
    root = args.root.resolve()
    bundle, historical = _point_in_time_rows(root)
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    original, candidate = matched_market_cohorts(historical, bundle=bundle, statuses=statuses)
    result = {
        "version": EVAL_VERSION, "feature_version": VERSION,
        "as_of": bundle.as_of.isoformat(),
        "matched_film_weeks": len(original),
        "identity_policy": "AMC source product ID unless manually approved alias",
        "evaluation": evaluate(original, candidate),
        "promotion_decision": "research_only",
        "caveats": [
            "Same historical holdout was already used to diagnose market features",
            "Early training snapshots have unknown formal completeness",
            "Retrospective AMC product and run segment metadata are not fully proven PIT-safe",
            "Market forecast anchor dates still inherit original theater publication milestones",
            "Prospective period with untouched outcome labels is required for promotion",
        ],
    }
    output = (root / args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "version": result["version"], "as_of": result["as_of"],
        "matched_film_weeks": result["matched_film_weeks"],
        "evaluation": result["evaluation"],
        "file": str(output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
