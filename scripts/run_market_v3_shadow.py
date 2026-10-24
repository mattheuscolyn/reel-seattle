#!/usr/bin/env python3
"""Daily, non-public, frozen Market V3 scorer.

No refitting; no changes to Leaving Soon, legacy shadow, or public A-List feeds.
Ledger records are immutable for each model/film/Friday/observation date.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date, datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

from reel_seattle.analysis.leaving_soon_feature_value import load_bundle
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import load_snapshot_infos
from reel_seattle.analysis.remaining_run_market_features import build_market_snapshot
from reel_seattle.analysis.remaining_run_market_publication import select_market_snapshot
from reel_seattle.analysis.remaining_run_shadow import horizon_friday, probabilities_from_serialized, assert_probabilities
from reel_seattle.analysis.tmdb_weekly_snapshot import append_jsonl_gz, read_jsonl_gz
from scripts.bootstrap_remaining_run_market_v3 import OUTPUT, VERSION

LEDGER = Path("data/history/remaining_run_market_v3_predictions.jsonl.gz")
SNAPSHOT = Path("data/model_predictions/remaining_run_market_v3/current.json")


def _model(root: Path) -> dict:
    path = root / OUTPUT
    if not path.exists():
        raise RuntimeError("Missing frozen V3 candidate. Bootstrap and review model first.")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("model_version") != VERSION or not manifest.get("prospective_only"):
        raise RuntimeError("Wrong or unsealed candidate model")
    hazard = manifest["candidate_hazard"]
    if hashlib.sha256(json.dumps(hazard, sort_keys=True, allow_nan=False).encode()).hexdigest() != manifest["model_sha256"]:
        raise RuntimeError("Frozen candidate model integrity failure")
    if manifest["feature_version"] != "market_features_v3_research":
        raise RuntimeError("Model and feature generator versions disagree")
    return manifest


def build_predictions(bundle, statuses, manifest: dict, *, generated_at: str) -> dict:
    latest = max(bundle.snapshot_dates)
    upcoming = horizon_friday(latest)
    selected = select_market_snapshot(
        bundle.screenings, statuses, as_of=latest, upcoming_friday=upcoming,
        theater_ids=tuple(bundle.theater_names), dataset_start=bundle.dataset_start,
    )
    # A complete *old* snapshot is still stale if ingestion stops. The AMC
    # scrape runs late Pacific evening, so allow one Pacific calendar day lag.
    utc_time = datetime.fromisoformat(generated_at)
    if utc_time.tzinfo is None:
        raise ValueError("generated_at must have a timezone")
    pacific_date = utc_time.astimezone(ZoneInfo("America/Los_Angeles")).date()
    source_age = (pacific_date - latest).days
    selected["source_age_days"] = source_age
    if source_age < 0:
        selected["quality_status"] = "future_dated_source_snapshot"
    elif source_age > 1:
        selected["quality_status"] = "stale_source_snapshot"
    quality = selected["quality_status"]
    market_rows = []
    if selected["observation_date"] and quality not in {"no_complete_snapshot", "insufficient_baseline", "stale_snapshot", "stale_source_snapshot", "future_dated_source_snapshot"}:
        observation = date.fromisoformat(selected["observation_date"])
        market_rows = build_market_snapshot(
            bundle.screenings, snapshot=observation, upcoming_friday=upcoming,
            dataset_start=bundle.dataset_start, theater_ids=tuple(bundle.theater_names),
        )
    forecasts = []
    for row in market_rows:
        if row["feature_version"] != manifest["feature_version"]:
            raise RuntimeError("Feature version mismatch")
        probs = probabilities_from_serialized(manifest["candidate_hazard"], row)
        values = [probs[k] for k in ("p_final_week", "p_plus_1_week", "p_plus_2_weeks", "p_plus_3_plus")]
        assert_probabilities(values)
        forecast = {
            "record_type": "prospective_market_forecast",
            "prediction_id": "|".join((manifest["model_version"], manifest["model_sha256"][:12], row["film_id"], row["upcoming_friday"], row["observation_date"])),
            "generated_at": generated_at,
            "model_version": manifest["model_version"],
            "model_sha256": manifest["model_sha256"],
            "feature_version": row["feature_version"],
            "selector_version": selected["selector_version"],
            "observation_date": row["observation_date"],
            "upcoming_friday": row["upcoming_friday"],
            "current_programming_week": row["visible_friday"],
            "film_id": row["film_id"],
            "source_product_ids": row["source_product_ids"],
            "title": row["title"],
            "segment": row["segment"],
            "segment_provenance": row["segment_provenance"],
            "identity_policy": row["identity_policy"],
            "theaters_in_market": row["theaters_in_market"],
            "forecast_state": selected["forecast_state"],
            "data_quality_status": quality,
            "publication_snapshot": selected["publication_snapshot"],
            "publication_completeness": selected["publication_completeness"],
            "snapshot_lag_days": selected["snapshot_lag_days"],
            "is_thursday_decision": date.fromisoformat(row["observation_date"]) == upcoming - timedelta(days=1),
            "probabilities": values,
            **probs,
            "features": {key: (None if isinstance(value,float) and (value != value or abs(value)==float("inf")) else value) for key, value in row.items() if key in manifest["candidate_hazard"]["columns"]},
            "outcome_state": "unresolved",
        }
        forecasts.append(forecast)
    forecasts.sort(key=lambda r: (-r["p_final_week"], r["film_id"]))
    for rank, entry in enumerate(forecasts, 1):
        entry["urgency_rank"] = rank
    return {
        "schema_version": 1,
        "role": "non_public_prospective_challenger",
        "model_version": manifest["model_version"],
        "model_sha256": manifest["model_sha256"],
        "feature_version": manifest["feature_version"],
        "generated_at": generated_at,
        "as_of": latest.isoformat(),
        "upcoming_friday": upcoming.isoformat(),
        "quality": selected,
        "forecast_count": len(forecasts),
        "market": forecasts,
    }


def append_immutable(path: Path, rows: list[dict]) -> int:
    previous = {r["prediction_id"]: r for r in read_jsonl_gz(path)}
    new = []
    for row in rows:
        prior = previous.get(row["prediction_id"])
        if prior is not None:
            # Protect the actual prediction and inputs from retrospective edits.
            for key in ("probabilities", "features", "observation_date", "data_quality_status", "model_sha256"):
                if prior.get(key) != row.get(key):
                    raise RuntimeError(f"Historical shadow forecast changed: {row['prediction_id']} ({key})")
        else:
            new.append(row)
    return append_jsonl_gz(path, new, key_fn=lambda r: r["prediction_id"])


def run(root: Path, *, generated_at: str | None = None) -> dict:
    manifest = _model(root)
    bundle = load_bundle(root)
    status = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    result = build_predictions(
        bundle, status, manifest,
        generated_at=generated_at or datetime.now(timezone.utc).isoformat(),
    )
    # Append immutable evidence before replacing the convenient latest snapshot.
    appended = append_immutable(root / LEDGER, result["market"])
    destination = root / SNAPSHOT
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(".tmp")
    temp.write_text(json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    temp.replace(destination)
    print(json.dumps({"appended": appended, "forecast_count": result["forecast_count"], "quality": result["quality"], "file": str(destination)}))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    args = parser.parse_args()
    run(args.root.resolve())


if __name__ == "__main__":
    main()
