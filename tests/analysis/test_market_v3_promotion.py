"""Promotion and rollback are explicit, fail-closed, and version-bound."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from scripts.bootstrap_remaining_run_market_v3 import VERSION
from scripts.manage_market_v3_promotion import ROUTING, LEGACY, transition
from scripts.market_v3_public_adapter import routed_market_v3

def save(root, name, value):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value) + "\n")
    return path

def candidate(root):
    spec={"columns":["period_1"],"coef":[1]}
    checksum=hashlib.sha256(json.dumps(spec,sort_keys=True,allow_nan=False).encode()).hexdigest()
    data={"model_version":VERSION,"model_sha256":checksum,
          "prospective_only":True, "feature_version":"market_features_v3_research",
          "candidate_hazard":spec}
    save(root,"data/models/remaining_run_shadow/market_v3_candidate.json",data)
    return checksum

def test_legacy_is_default_without_registry(tmp_path):
    assert routed_market_v3(tmp_path) is None
    with pytest.raises(RuntimeError, match="No promoted challenger"):
        transition(tmp_path, action="rollback", reason="Investigate source anomaly")

def test_promotion_cannot_skip_independent_prospective_certificate(tmp_path):
    model_hash=candidate(tmp_path)
    with pytest.raises(RuntimeError,match="Locked prospective promotion criteria"):
        transition(tmp_path,action="promote",
                   approval="PROMOTE_MARKET_V3",model_hash=model_hash)
    state=tmp_path / ROUTING
    assert not state.exists()

def test_validated_activation_public_adapter_and_one_step_rollback(tmp_path):
    model_hash=candidate(tmp_path)
    review={
        "model_sha256":model_hash, "reviewed_by":"independent-reviewer",
        "reviewed_at":datetime.now(timezone.utc).isoformat(),
        "independent_label_audit":{"passed":True,"evidence_url":"https://example.org/evidence/labels"},
        "a_list_eligibility_and_credit_replay":{"passed":True,"evidence_url":"https://example.org/evidence/allocation"},
        "baseline_noninferiority_bootstrap":{"passed":True,"evidence_url":"https://example.org/evidence/baseline"},
    }
    save(tmp_path,"data/models/remaining_run_shadow/market_v3_review.json",review)
    save(tmp_path,"data/audits/remaining_run_market_v3_prospective.json",{
        "model_sha256":model_hash,
        "generated_at":datetime.now(timezone.utc).isoformat(),
        "promotion":{"eligible":True,"checks":{"strict_outcomes":True,"independent_review":True}},
    })
    save(tmp_path,"data/model_predictions/remaining_run_market_v3/current.json",{
        "role":"non_public_prospective_challenger",
        "model_version":VERSION,"model_sha256":model_hash,
        "as_of":"2026-10-29","generated_at":"2026-10-30T04:00:00+00:00",
        "quality":{"quality_status":"complete"},
        "market":[{
            "film_id":"1234","current_programming_week":"2026-10-23",
            "data_quality_status":"complete","forecast_state":"market_ready",
            "p_final_week":0.4,"p_plus_1_week":0.3,
            "p_plus_2_weeks":0.2,"p_plus_3_plus":0.1,
        }],
    })
    state=transition(tmp_path,action="promote",approval="PROMOTE_MARKET_V3",model_hash=model_hash)
    assert state["active_model"] == VERSION
    assert state["previous_model"] == LEGACY
    feed = routed_market_v3(tmp_path)
    assert feed["market"][0]["pFinalWeek"] == 0.4
    assert feed["modelVersion"] == VERSION
    assert "features" not in feed["market"][0]
    # Degraded data must never overwrite an earlier valid consumer feed.
    source=tmp_path/"data/model_predictions/remaining_run_market_v3/current.json"
    degraded=json.loads(source.read_text())
    degraded["quality"]["quality_status"]="recent_snapshot_gap"
    source.write_text(json.dumps(degraded))
    with pytest.raises(ValueError,match="incomplete or degraded"):
        routed_market_v3(tmp_path)
    state=transition(tmp_path,action="rollback",reason="Quality deteriorated")
    assert state["active_model"] == LEGACY
    assert state["history"][-1]["reason"] == "Quality deteriorated"
    assert routed_market_v3(tmp_path) is None
