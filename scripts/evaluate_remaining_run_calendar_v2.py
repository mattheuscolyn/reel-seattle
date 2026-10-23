#!/usr/bin/env python3
"""Point-in-time, head-to-head research evaluation of remaining_run_calendar_v2.

No writes to production models, forecasts or historical training ledgers.
Compare equal features, equal forecast dates and a common strict holdout,
changing only the historical target labels used to fit the hazard model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from sklearn.metrics import average_precision_score

from reel_seattle.analysis.leaving_soon_feature_value import load_bundle, still_listed
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    _feature_names, _fit_hazard, _market_rows, _predict_rows, _split,
    build_booking_cycles, build_observations,
)
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import load_snapshot_infos
from reel_seattle.analysis.remaining_run_shadow import serialize_hazard
from scripts.audit_leaving_soon_phase2_evidence import audit_booking_cycle_baselines
from scripts.reconstruct_remaining_run_labels import (
    _engagement_index, _find, eligible_legacy_days, reconstruct_one,
)
from scripts.audit_leaving_soon_run_endings import ScheduleEvidence

VERSION = "remaining_run_calendar_v2_research"
SEED = 20261023
# Deliberately do NOT select OPENING: hindsight-based historical week totals
# in enrich_observations are not yet proved point-in-time safe.
FEATURES = tuple(_feature_names(True))
PROBS = ("p0", "p1", "p2", "p3")


def _point_in_time_rows(root: Path):
    bundle = load_bundle(root)
    original_cycles = build_booking_cycles(
        bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of,
    )
    counterfactual = audit_booking_cycle_baselines(
        original_cycles, bundle.screenings, bundle.snapshot_dates,
        as_of=bundle.as_of, still_listed=still_listed,
    )
    chosen = build_observations(
        bundle, counterfactual["counterfactual_cycles"], kind="before_80",
    )
    return bundle, chosen


def _candidate_rows(base: Sequence[Mapping[str, Any]], *, bundle, statuses, grain: str):
    strict, legacy = eligible_legacy_days(statuses, as_of=bundle.as_of)
    strict_schedule = ScheduleEvidence(bundle.screenings, sorted(strict))
    provisional_schedule = ScheduleEvidence(bundle.screenings, sorted(strict | legacy))
    index = _engagement_index(
        bundle.market if grain == "market" else bundle.film_theater,
        market=(grain == "market"),
    )
    result = []
    for row in base:
        eng = _find(row, index, market=(grain == "market"))
        evidence = reconstruct_one(
            row, engagement=eng, grain=grain,
            strict_schedule=strict_schedule,
            provisional_schedule=provisional_schedule,
            strict_dates=strict, provisional_dates=legacy,
            dataset_start=bundle.dataset_start, as_of=bundle.as_of,
        )
        item = dict(row)
        item.update({
            "source_original_bucket": item["bucket"],
            "source_original_censored": int(item["censored"]),
            "source_original_known_weeks": item.get("known_weeks"),
            "label_tier": evidence["evidence_tier"],
            "label_reason": evidence["evidence_reason"],
            "bucket": evidence["corrected_bucket"],
            "censored": int(evidence["corrected_censored"]),
            "known_weeks": int(evidence["corrected_known_weeks"]),
            "remaining_weeks": evidence["corrected_bucket"] if evidence["corrected_bucket"] is not None else None,
        })
        result.append(item)
    return result


def _legacy_training(rows: Sequence[Mapping[str, Any]]):
    return [
        {**row,
         "bucket": row["source_original_bucket"],
         "censored": row["source_original_censored"],
         "remaining_weeks": row["source_original_bucket"] if row["source_original_bucket"] is not None else None,
         "known_weeks": row.get("source_original_known_weeks") or 0}
        for row in rows
    ]


def _score_for(model, holdout: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    scored = [dict(row) for row in holdout]
    _predict_rows(model, scored)
    return scored


def _constant_probs(train: Sequence[Mapping[str, Any]]) -> list[float]:
    # Frequency baseline with additive Dirichlet smoothing, not test-fitted.
    counts = [1.0, 1.0, 1.0, 1.0]
    for row in train:
        if not row["censored"] and row["bucket"] is not None:
            counts[int(row["bucket"])] += 1
    total = sum(counts)
    return [x / total for x in counts]


def _predict_constant(train, holdout):
    probs = _constant_probs(train)
    return [{**row, **dict(zip(PROBS, probs))} for row in holdout]


def _metrics(scored: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    resolved = [row for row in scored if not row["censored"] and row["bucket"] is not None]
    if not resolved:
        return {"n": 0}
    p = np.array([[row[k] for k in PROBS] for row in resolved], dtype=float)
    p = np.maximum(p, 1e-8)
    p /= np.sum(p, axis=1, keepdims=True)
    y = np.array([int(row["bucket"]) for row in resolved], dtype=int)
    losses = -np.log(p[np.arange(len(y)), y])
    brier = np.mean(np.sum((p - np.eye(4)[y]) ** 2, axis=1))
    final = y == 0
    pr = float(average_precision_score(final.astype(int), p[:, 0])) if 0 < sum(final) < len(final) else None
    return {
        "n": len(y),
        "unique_films": len({row["film_id"] for row in resolved}),
        "bucket_counts": {str(i): int(sum(y == i)) for i in range(4)},
        "log_loss": float(np.mean(losses)),
        "brier_sum_squares": float(brier),
        "pr_auc_final_week": pr,
        "accuracy": float(np.mean(np.argmax(p, axis=1) == y)),
        "mean_pred_final_week": float(np.mean(p[:, 0])),
        "actual_final_week_share": float(np.mean(final)),
        "expected_remaining_weeks_mae_capped": float(
            np.mean(np.abs((p[:, 1] + 2 * p[:, 2] + 3 * p[:, 3]) - np.minimum(3, y)))
        ),
    }


def _by_segment(scored):
    bins = defaultdict(list)
    for row in scored:
        bins[str(row.get("segment") or "unknown")].append(row)
    return {name: _metrics(values) for name, values in bins.items() if len(values) >= 10}


def _paired_bootstrap(legacy, challenger, *, draws: int = 600):
    if len(legacy) != len(challenger):
        raise ValueError("Paired comparison must score identical holdout rows")
    for a, b in zip(legacy, challenger):
        if (a["film_id"], a["theater_id"], a["upcoming_friday"], a["observation_date"]) != (
            b["film_id"], b["theater_id"], b["upcoming_friday"], b["observation_date"]
        ):
            raise ValueError("Holdout identity mismatch")
    group = defaultdict(list)
    for i, row in enumerate(challenger):
        group[row["film_id"]].append(i)
    films = sorted(group)
    if len(films) < 2:
        return {"status": "insufficient_films", "films": len(films)}
    rng = np.random.default_rng(SEED)
    def values(rows):
        return np.array([
            -math.log(max(1e-8, float(row["p" + str(int(row["bucket"]))])))
            for row in rows
        ])
    delta = values(challenger) - values(legacy)
    draws_values = []
    for _ in range(draws):
        sample = rng.choice(films, size=len(films), replace=True)
        indices = [i for film in sample for i in group[film]]
        draws_values.append(float(np.mean(delta[indices])))
    lo, hi = np.percentile(draws_values, [2.5, 97.5])
    return {
        "quantity": "challenger minus legacy log loss; negative favors v2",
        "delta": float(np.mean(delta)),
        "film_clustered_bootstrap_95pct_interval": [float(lo), float(hi)],
        "bootstrap_draws": draws,
        "independent_film_clusters": len(films),
        "fraction_of_bootstraps_v2_better": float(np.mean(np.array(draws_values) < 0)),
    }


def _evaluate_grain(rows: Sequence[Mapping[str, Any]], *, grain: str):
    parts = _split(rows)
    train, val, holdout = (parts[name] for name in ("train", "validation", "holdout"))
    strict = [r for r in holdout if r["label_tier"] == "strict" and not r["censored"]]
    if not strict:
        raise RuntimeError(f"{grain}: cannot measure strict holdout, refusing empty evaluation")
    if any(r["label_tier"] != "strict" for r in strict):
        raise RuntimeError("holdout must have independently complete outcome evidence")
    trainval = [*train, *val]
    usable = [r for r in trainval if r["label_tier"] in {"strict", "provisional_legacy"}]
    legacy = _legacy_training(usable)
    new_model = _fit_hazard(usable, FEATURES)
    legacy_model = _fit_hazard(legacy, FEATURES)
    if new_model is None or legacy_model is None:
        raise RuntimeError(f"{grain}: no model fitted")
    score_new = _score_for(new_model, strict)
    score_old = _score_for(legacy_model, strict)
    score_frequency = _predict_constant(usable, strict)
    val_strict = [r for r in val if r["label_tier"] == "strict" and not r["censored"]]
    # Early validation is provisional. Evaluate train-only to diagnose drift,
    # with its provenance labeled. Never use validation to choose model on holdout.
    train_only = [r for r in train if r["label_tier"] in {"strict", "provisional_legacy"}]
    trained_on_train_only = _fit_hazard(train_only, FEATURES)
    val_resolved = [r for r in val if not r["censored"]]
    validation = {
        "quality": dict(Counter(r["label_tier"] for r in val_resolved)),
        "candidate": _metrics(_score_for(trained_on_train_only, val_resolved)) if trained_on_train_only else {"n": 0},
    }
    return {
        "grain": grain,
        "training": {
            "candidate_training_rows": len(usable),
            "provisional_legacy": sum(r["label_tier"] == "provisional_legacy" for r in usable),
            "strict": sum(r["label_tier"] == "strict" for r in usable),
            "original_training_rows": len(train),
            "validation_rows": len(val),
            "strict_validation_rows": len(val_strict),
            "held_out_rows": len(holdout),
            "strict_resolved_holdout": len(strict),
            "excluded_unresolved_holdout": len(holdout) - len(strict),
            "trainmax_date": max(r["observation_date"] for r in trainval),
            "holdoutmin_date": min(r["observation_date"] for r in holdout),
        },
        "same_strict_holdout": {
            "old_target_retrained_control": _metrics(score_old),
            "calendar_v2_candidate": _metrics(score_new),
            "training_prior_baseline": _metrics(score_frequency),
            "paired_film_bootstrap": _paired_bootstrap(score_old, score_new),
            "candidate_by_segment": _by_segment(score_new),
        },
        "provisional_validation": validation,
        "candidate_model_serialized": serialize_hazard(new_model),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/audits/remaining_run_calendar_v2_evaluation.json"))
    parser.add_argument("--model", type=Path, default=Path("data/audits/remaining_run_calendar_v2_candidate_model.json"))
    args = parser.parse_args()
    root = args.root.resolve()
    bundle, raw = _point_in_time_rows(root)
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    theater = _candidate_rows(raw, bundle=bundle, statuses=statuses, grain="theater")
    # Choose a single prepublication film/week row by historical earliest
    # snapshot, exactly matching the current research market aggregation.
    market_raw = _market_rows(raw)
    market = _candidate_rows(market_raw, bundle=bundle, statuses=statuses, grain="market")
    checks = [_evaluate_grain(theater, grain="theater"), _evaluate_grain(market, grain="market")]
    model_specs = {entry["grain"]: entry.pop("candidate_model_serialized") for entry in checks}
    manifest = {
        "version": VERSION,
        "as_of": bundle.as_of.isoformat(),
        "purpose": "research_challenger_not_production",
        "fixed_seed": SEED,
        "features": list(FEATURES),
        "feature_policy": "no hindsight opening enrichment; chronological booking cycle; original data model only",
        "training_policy": "train+validation calendar-v2 resolved; legacy logs marked provisional",
        "evaluation_policy": "strict resolved later holdout; same chronology, same features, same dates; paired cluster bootstrap by film",
        "known_limitations": [
            "Pre-Sept train/validation rows are provisional legacy snapshot evidence, not independently complete.",
            "Per-feature historical lineage, including actual prior-week reconstructed totals, is not fully certified.",
            "Strict holdout may be selection-biased and excludes unresolved/censored rows.",
            "Frozen PR #141 benchmark is not a matched-cohort comparison and must not be used as a direct opponent.",
            "Film repeats across chronological train and test; estimates do not test unseen-title generalization.",
            "No thresholds or hyperparameters were selected from holdout.",
        ],
        "results": checks,
        "promotion_decision": "not_automatically_eligible",
    }
    out = (root / args.output).resolve()
    artifact = (root / args.model).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    artifact.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    artifact.write_text(json.dumps({
        "version": VERSION, "as_of": bundle.as_of.isoformat(),
        "features": list(FEATURES), "model": model_specs,
        "status": "research_only_do_not_promote",
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "version": VERSION, "as_of": manifest["as_of"],
        "results": manifest["results"],
        "evaluation_path": str(out), "candidate_artifact_path": str(artifact),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
