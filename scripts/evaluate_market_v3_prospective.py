#!/usr/bin/env python3
"""Prospective-only settlement and locked promotion scorecard for Market V3.

Reads *saved* predictions; recomputes verified labels from later complete AMC
snapshots. No labels or probabilities may be silently rewritten in a ledger.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from reel_seattle.analysis.leaving_soon_feature_value import load_bundle
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import load_snapshot_infos
from reel_seattle.analysis.tmdb_weekly_snapshot import read_jsonl_gz, append_jsonl_gz
from scripts.evaluate_remaining_run_calendar_v2 import _candidate_rows
from scripts.run_market_v3_shadow import LEDGER, COHORT_VERSION, _model

OUTCOMES = Path("data/history/remaining_run_market_v3_outcomes.jsonl.gz")
REPORT = Path("data/audits/remaining_run_market_v3_prospective.json")
REVIEW = Path("data/models/remaining_run_shadow/market_v3_review.json")
MIN_STRICT_WEEKS = 8
MIN_STRICT_FILMS = 80
MAX_LOG_LOSS = 1.25
MIN_FINAL_WEEK_PRECISION_AT_FOUR = 0.50
PACIFIC = ZoneInfo("America/Los_Angeles")


def _prediction_valid(row, model):
    if row.get("model_sha256") != model["model_sha256"]:
        return False
    if row.get("cohort_version") != COHORT_VERSION:
        return False
    first = (row.get("features") or {}).get("days_since_first_show")
    if not isinstance(first, (int, float)) or not math.isfinite(first) or first < 0:
        return False
    if row.get("model_version") != model["model_version"]:
        return False
    try:
        generated = datetime.fromisoformat(row["generated_at"])
        frozen = datetime.fromisoformat(model["frozen_at"])
        observation = date.fromisoformat(row["observation_date"])
        upcoming = date.fromisoformat(row["upcoming_friday"])
        if generated.tzinfo is None or frozen.tzinfo is None:
            return False
        if generated <= frozen or generated.astimezone(PACIFIC).date() >= upcoming:
            return False
        if observation > generated.astimezone(PACIFIC).date():
            return False
        if observation >= upcoming or observation <= date.fromisoformat(model["train_observation_cutoff"]):
            return False
        probs = [float(row[k]) for k in ("p_final_week", "p_plus_1_week", "p_plus_2_weeks", "p_plus_3_plus")]
        return len(probs) == 4 and all(math.isfinite(v) and 0 <= v <= 1 for v in probs) and abs(sum(probs) - 1) < 1e-6
    except (TypeError, KeyError, ValueError, OverflowError):
        return False


def resolve(root: Path, saved: list[dict], model: dict) -> dict:
    review_path = root / REVIEW
    review = json.loads(review_path.read_text(encoding="utf-8")) if review_path.is_file() else None
    bundle = load_bundle(root)
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    valid = [r for r in saved if _prediction_valid(r, model)]
    # Only strictly complete source snapshots can settle a prediction.
    source = [{
        "film_id": row["film_id"],
        "title": row["title"],
        "theater_id": "market",
        "upcoming_friday": row["upcoming_friday"],
        "visible_friday": row["current_programming_week"],
        "observation_date": row["observation_date"],
        "bucket": None, "censored": 1, "known_weeks": 0,
        "market_bucket": None, "market_censored": 1, "market_known_weeks": 0,
    } for row in valid]
    evaluated = _candidate_rows(source, bundle=bundle, statuses=statuses, grain="market") if source else []
    events = []
    for row, evidence in zip(valid, evaluated):
        if evidence["label_tier"] != "strict" or evidence["censored"]:
            continue
        # Quality-degraded forecasts are stored for diagnostics, but cannot
        # qualify as high-quality observations for promotion.
        events.append({
            "record_type": "verified_outcome",
            "prediction_id": row["prediction_id"],
            "model_version": row["model_version"],
            "model_sha256": row["model_sha256"],
            "film_id": row["film_id"],
            "upcoming_friday": row["upcoming_friday"],
            "observation_date": row["observation_date"],
            "data_quality_status": row["data_quality_status"],
            "segment": row["segment"],
            "bucket": int(evidence["bucket"]),
            "label_tier": evidence["label_tier"],
            "label_reason": evidence["label_reason"],
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        })
    outcome_path = root / OUTCOMES
    previous = {r["prediction_id"]: r for r in read_jsonl_gz(outcome_path)}
    for event in events:
        old = previous.get(event["prediction_id"])
        if old is not None and (old["bucket"], old["label_tier"]) != (event["bucket"], event["label_tier"]):
            raise RuntimeError("Immutable verified outcome changed; adjudicate instead of rewriting " + event["prediction_id"])
    appended = append_jsonl_gz(outcome_path, events, key_fn=lambda r: r["prediction_id"])
    truth = {**previous, **{r["prediction_id"]: r for r in events}}
    resolved = [(r, truth[r["prediction_id"]]["bucket"]) for r in valid if r["prediction_id"] in truth]
    clean = [(r, y) for r, y in resolved if r["data_quality_status"] == "complete"]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": model["model_version"],
        "model_sha256": model["model_sha256"],
        "saved_forecasts": len(saved),
        "valid_postfreeze_forecasts": len(valid),
        "newly_verified": appended,
        "strict_resolved": len(resolved),
        "strict_clean": len(clean),
        "overall": metrics(resolved),
        "clean": metrics(clean),
        "by_segment": {segment: metrics([(r, y) for r, y in clean if r["segment"] == segment]) for segment in sorted({r["segment"] for r, _ in clean})},
        "thursday": metrics([(r, y) for r, y in clean if r.get("is_thursday_decision")]),
        "recommendation_proxy": allocation_proxy(clean),
        "promotion": promotion_gate(clean, model, review),
        "diagnostics": {
            "quality_degraded_resolved": len(resolved) - len(clean),
            "unresolved_or_censored": len(valid) - len(resolved),
            "important": "Performance is not a causal evaluation of actual A-List decisions; eligibility, interest, scheduling, and the four-credit reset still need an offline replay",
        },
    }


def metrics(pairs):
    if not pairs:
        return {"n": 0}
    probs = [r["p_final_week"] for r, _ in pairs]
    losses, briers = [], []
    for r, bucket in pairs:
        ps = [r[k] for k in ("p_final_week", "p_plus_1_week", "p_plus_2_weeks", "p_plus_3_plus")]
        losses.append(-math.log(max(1e-8, ps[bucket])))
        briers.append(sum((p - (i == bucket)) ** 2 for i, p in enumerate(ps)))
    bins = []
    for low in (0, 0.25, 0.50, 0.75):
        entries = [(r, y) for r, y in pairs if low <= r["p_final_week"] < low + 0.25 or (low == 0.75 and r["p_final_week"] == 1)]
        if entries:
            bins.append({"interval": [low, low + 0.25], "n": len(entries),
                         "mean_predicted": sum(r["p_final_week"] for r, _ in entries) / len(entries),
                         "actual_final_week": sum(y == 0 for _, y in entries) / len(entries)})
    # Pairwise within-the-same forecast Friday; days are not independent films.
    comparisons = wins = 0
    by_week = defaultdict(list)
    for r, y in pairs:
        by_week[(r["upcoming_friday"], r["observation_date"])].append((r, y))
    for group in by_week.values():
        for i, (a, ya) in enumerate(group):
            for b, yb in group[i+1:]:
                if (ya == 0) == (yb == 0):
                    continue
                comparisons += 1
                if a["p_final_week"] == b["p_final_week"]:
                    wins += 0.5
                else:
                    wins += float((a["p_final_week"] > b["p_final_week"]) == (ya == 0))
    return {
        "n": len(pairs),
        "unique_films": len({r["film_id"] for r, _ in pairs}),
        "unique_programming_weeks": len({r["upcoming_friday"] for r, _ in pairs}),
        "log_loss": sum(losses) / len(losses),
        "brier": sum(briers) / len(briers),
        "final_week_pairwise_accuracy": wins / comparisons if comparisons else None,
        "final_week_actual_rate": sum(y == 0 for _, y in pairs) / len(pairs),
        "final_week_predicted_rate": sum(probs) / len(probs),
        "calibration": bins,
    }


def allocation_proxy(pairs):
    batches = defaultdict(list)
    # Use Thursday-only snapshot to avoid evaluating a bundle of daily near-duplicates.
    for row, truth in pairs:
        if row.get("is_thursday_decision"):
            batches[(row["upcoming_friday"], row["observation_date"])].append((row, truth))
    relevant = [batch for batch in batches.values() if len(batch) >= 5]
    if not relevant:
        return {"weeks": 0, "precision_at_four": None, "note": "No eligible Thursday cohorts"}
    hits = slots = avoidable_misses = 0
    for batch in relevant:
        ranked = sorted(batch, key=lambda x: (-x[0]["p_final_week"], x[0]["film_id"]))
        chosen = ranked[:4]
        hits += sum(y == 0 for _, y in chosen)
        slots += len(chosen)
        avoidable_misses += max(0, sum(y == 0 for _, y in batch) - sum(y == 0 for _, y in chosen))
    return {
        "weeks": len(relevant),
        "precision_at_four": hits / slots,
        "missed_final_week_films": avoidable_misses,
        "note": "Final-week capture@4 proxy; NOT A-List credit or personal-utility validation",
    }


def promotion_gate(clean, model, review=None):
    # Evidence attested in a separate reviewed change; never from the holdout.
    def certified(key):
        if not isinstance(review, dict) or review.get("model_sha256") != model.get("model_sha256"):
            return False
        item = review.get(key)
        return (isinstance(item, dict) and item.get("passed") is True
                and str(item.get("evidence_url", "")).startswith("https://")
                and bool(review.get("reviewed_by")) and bool(review.get("reviewed_at")))
    scored = metrics(clean)
    proxy = allocation_proxy(clean)
    checks = {
        "frozen_candidate_integrity": bool(model.get("model_sha256")),
        "minimum_eight_independent_weeks": scored["n"] > 0 and scored["unique_programming_weeks"] >= MIN_STRICT_WEEKS,
        "minimum_eighty_unique_films": scored["n"] > 0 and scored["unique_films"] >= MIN_STRICT_FILMS,
        "four_bucket_log_loss": scored["n"] > 0 and scored["log_loss"] <= MAX_LOG_LOSS,
        "thursday_top_four_capture": proxy["weeks"] >= MIN_STRICT_WEEKS and proxy["precision_at_four"] >= MIN_FINAL_WEEK_PRECISION_AT_FOUR,
        # Remain unpassed until independent human/CI reference review.
        "independent_label_audit": certified("independent_label_audit"),
        "a_list_eligibility_and_credit_replay": certified("a_list_eligibility_and_credit_replay"),
        "baseline_noninferiority_bootstrap": certified("baseline_noninferiority_bootstrap"),
    }
    return {
        "eligible": all(checks.values()),
        "checks": checks,
        "policy": {
            "min_weeks": MIN_STRICT_WEEKS,
            "min_unique_films": MIN_STRICT_FILMS,
            "max_log_loss": MAX_LOG_LOSS,
            "min_top_four_final_week_precision": MIN_FINAL_WEEK_PRECISION_AT_FOUR,
            "must_pass_independent_audit": True,
            "explicit_human_approval_required": True,
            "rollback_required": True,
        },
        "decision": "not_promotable" if not all(checks.values()) else "candidate_eligible_for_manual_review",
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--root", type=Path, default=Path("."))
    args = p.parse_args()
    root = args.root.resolve()
    report = resolve(root, read_jsonl_gz(root / LEDGER), _model(root))
    output = root / REPORT
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n")
    print(json.dumps({"strict_clean": report["strict_clean"], "gate": report["promotion"]}, indent=2))


if __name__ == "__main__":
    main()
