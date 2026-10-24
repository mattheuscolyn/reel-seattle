"""Promoted Market v3 -> minimal A-List feed, guarded by immutable routing.

Returns None for legacy routing. Raises for a broken candidate so the old
fresness-gated public feed can remain untouched rather than writing bad data.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

VERSION = "remaining_run_market_v3_prospective_1"
ROUTING = Path("data/models/remaining_run_shadow/market_routing.json")
SOURCE = Path("data/model_predictions/remaining_run_market_v3/current.json")
MODEL = Path("data/models/remaining_run_shadow/market_v3_candidate.json")
REVIEW = Path("data/models/remaining_run_shadow/market_v3_review.json")
REPORT = Path("data/audits/remaining_run_market_v3_prospective.json")
DEST_KEYS = ("pFinalWeek", "pPlus1Week", "pPlus2Weeks", "pPlus3PlusWeeks")
SOURCE_KEYS = ("p_final_week", "p_plus_1_week", "p_plus_2_weeks", "p_plus_3_plus")


def routed_market_v3(root: Path = Path(".")) -> dict | None:
    state_path = root / ROUTING
    routing = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {}
    if routing.get("active_model") != VERSION:
        return None
    source = json.loads((root / SOURCE).read_text(encoding="utf-8"))
    model = json.loads((root / MODEL).read_text(encoding="utf-8"))
    report = json.loads((root / REPORT).read_text(encoding="utf-8"))
    certificate = (root / REVIEW).read_bytes()
    model_hash = model["model_sha256"]
    if any(obj.get("model_sha256") != model_hash for obj in (source, report, routing)):
        raise ValueError("Promoted market model hash differs between publication and validation")
    if hashlib.sha256(certificate).hexdigest() != routing.get("certificate_sha256"):
        raise ValueError("Model's independent validation certificate was replaced")
    if not report.get("promotion", {}).get("eligible"):
        raise ValueError("Prospective validation no longer passes")
    if source.get("quality", {}).get("quality_status") != "complete":
        raise ValueError("Market snapshot is incomplete or degraded")
    if source.get("model_version") != VERSION or source.get("role") != "non_public_prospective_challenger":
        raise ValueError("Incorrect challenger forecast source")
    as_of = source.get("as_of")
    if not as_of or not source.get("market"):
        raise ValueError("Missing up-to-date candidate predictions")
    rows = []
    for row in source["market"]:
        sid = str(row.get("film_id") or "")
        ps = [row.get(k) for k in SOURCE_KEYS]
        if not sid.isdecimal():
            continue
        if not all(isinstance(x, (int, float)) and math.isfinite(x) and 0 <= x <= 1 for x in ps):
            continue
        if abs(sum(ps) - 1) > 1e-6 or row.get("data_quality_status") != "complete":
            continue
        rows.append({
            "sourceFilmId": sid,
            "currentProgrammingWeek": row["current_programming_week"],
            "forecastState": row["forecast_state"],
            **dict(zip(DEST_KEYS, ps)),
        })
    if not rows:
        raise ValueError("No promotable market rows")
    return {
        "schema_version": 1,
        "modelVersion": VERSION,
        "asOf": as_of,
        "generatedAt": source.get("generated_at"),
        "market": rows,
    }
