#!/usr/bin/env python3
"""Explicit Market V3 activation/rollback registry.

Requires a current passing prospective scorecard AND independently reviewed
model-bound attestations. A prospective job can never call this implicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

from scripts.evaluate_market_v3_prospective import REPORT, REVIEW
from scripts.run_market_v3_shadow import _model

ROUTING = Path("data/models/remaining_run_shadow/market_routing.json")
LEGACY = "remaining_run_shadow_v1"


def _read(path, fallback=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else fallback


def _persist(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n")
    tmp.replace(path)


def transition(root: Path, *, action: str, approval: str = "", model_hash: str = "", reason: str = "") -> dict:
    routing_path = root / ROUTING
    state = _read(routing_path, {"active_model": LEGACY, "previous_model": None, "history": []})
    active = state["active_model"]
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    if action == "promote":
        model = _model(root)
        report = _read(root / REPORT)
        review_path = root / REVIEW
        review = _read(review_path)
        if approval != "PROMOTE_MARKET_V3" or model_hash != model["model_sha256"]:
            raise RuntimeError("Promotion requires explicit consent and exact frozen model SHA")
        if active == model["model_version"]:
            raise RuntimeError("Candidate already active; duplicate promotion refused")
        if not report or not report.get("promotion", {}).get("eligible"):
            raise RuntimeError("Locked prospective promotion criteria have not passed")
        if report.get("model_sha256") != model_hash:
            raise RuntimeError("Evaluation report belongs to a different model")
        generated = datetime.fromisoformat(report["generated_at"])
        if generated.tzinfo is None or datetime.now(timezone.utc) - generated > timedelta(days=7):
            raise RuntimeError("Evaluation report is stale")
        if not review or review.get("model_sha256") != model_hash:
            raise RuntimeError("Missing model-bound independent review")
        checks = report["promotion"]["checks"]
        if not all(checks.values()):
            raise RuntimeError("All model, data, label, baseline and A-List gates must pass")
        certificate_sha = hashlib.sha256(review_path.read_bytes()).hexdigest()
        state.update({
            "active_model": model["model_version"],
            "previous_model": active,
            "model_sha256": model_hash,
            "certificate_sha256": certificate_sha,
            "activated_at": timestamp,
        })
        state["history"].append({
            "action": "promote", "from": active, "to": model["model_version"],
            "model_sha256": model_hash, "at": timestamp, "reason": reason or "Explicit validated promotion",
        })
    elif action == "rollback":
        if not reason.strip():
            raise RuntimeError("Rollback requires an incident or degradation reason")
        if active == LEGACY or not state.get("previous_model"):
            raise RuntimeError("No promoted challenger to roll back")
        target = state["previous_model"]
        state["history"].append({
            "action": "rollback", "from": active, "to": target,
            "at": timestamp, "reason": reason.strip(),
        })
        state.update({
            "active_model": target,
            "previous_model": active,
            "rolled_back_at": timestamp,
        })
    else:
        raise ValueError("action must be promote or rollback")
    _persist(routing_path, state)
    return state


def main():
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--promote", action="store_true")
    g.add_argument("--rollback", action="store_true")
    p.add_argument("--approve", default="")
    p.add_argument("--model-sha256", default="")
    p.add_argument("--reason", default="")
    p.add_argument("--root", type=Path, default=Path("."))
    args = p.parse_args()
    state = transition(
        args.root.resolve(), action="promote" if args.promote else "rollback",
        approval=args.approve, model_hash=args.model_sha256, reason=args.reason,
    )
    print(json.dumps(state, indent=2))


if __name__ == "__main__":
    main()
