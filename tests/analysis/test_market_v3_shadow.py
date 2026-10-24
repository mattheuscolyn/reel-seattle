"""Regression guards for independent market snapshot and prospective shadow ledger."""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from reel_seattle.analysis.remaining_run_market_publication import select_market_snapshot
from scripts.run_market_v3_shadow import append_immutable
from scripts.evaluate_market_v3_prospective import _prediction_valid, allocation_proxy, promotion_gate

def show(film, day, first, theater="a"):
    return SimpleNamespace(
        film_id=film, theater_id=theater,
        show_date=date.fromisoformat(day), first_snapshot=date.fromisoformat(first),
        removed_before_show=False, removed_at=None, canceled=False,
    )

def status(day, completeness="complete"):
    return SimpleNamespace(snapshot_date=date.fromisoformat(day), completeness=completeness)

def context(*, complete_thursday=True, extra_late=False):
    upcoming = date(2026, 10, 30)
    records = [
        show("old", "2026-10-02", "2026-10-01"),
        show("old", "2026-10-09", "2026-10-08"),
        show("old", "2026-10-16", "2026-10-15"),
        show("old", "2026-10-23", "2026-10-22"),
        show("future", "2026-10-30", "2026-10-21"),
        show("future", "2026-10-30", "2026-10-22", "b"),
    ]
    if extra_late:
        records.append(show("late", "2026-10-30", "2026-10-24", "b"))
    days = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-21", "2026-10-22", "2026-10-23"]
    statuses = [status(d) for d in days if d != "2026-10-23" or complete_thursday]
    return records, statuses, upcoming

def choose(shows, statuses, upcoming, asof="2026-10-23"):
    return select_market_snapshot(shows, statuses,
        as_of=date.fromisoformat(asof), upcoming_friday=upcoming,
        theater_ids=["a", "b"], dataset_start=date(2026, 9, 3))

def test_market_complete_snapshot_is_not_earliest_theater_milestone():
    records, statuses, upcoming = context()
    selected = choose(records, statuses, upcoming)
    assert selected["observation_date"] == "2026-10-23"
    assert selected["typical_market_friday_volume"] == 1
    assert selected["publication_completeness"] == 2
    assert selected["forecast_state"] == "market_ready"
    assert selected["thursday_snapshot_available"] is True
    assert selected["publication_snapshot"] == "2026-10-22"

def test_incomplete_thursday_is_not_treated_as_complete():
    records, statuses, upcoming = context(complete_thursday=False)
    statuses.append(status("2026-10-23", "incomplete"))
    selected = choose(records, statuses, upcoming)
    assert selected["observation_date"] == "2026-10-22"
    assert selected["snapshot_lag_days"] == 1
    assert selected["quality_status"] == "recent_snapshot_gap"
    assert selected["thursday_snapshot_available"] is False

def test_future_publication_is_not_visible_before_snapshot():
    records, statuses, upcoming = context(extra_late=True)
    before = choose(records, statuses, upcoming)
    assert before["visible_upcoming_friday_screenings"] == 2
    statuses.append(status("2026-10-24"))
    after = choose(records, statuses, upcoming, asof="2026-10-24")
    assert after["visible_upcoming_friday_screenings"] == 3

def test_unreliable_status_cannot_supply_market_forecast():
    records, statuses, upcoming = context()
    unknown = [status("2026-10-23", "unknown")]
    selected = choose(records, unknown, upcoming)
    assert selected["quality_status"] == "no_complete_snapshot"
    assert selected["observation_date"] is None

def test_shadow_ledger_is_idempotent_and_fails_on_retroactive_changes(tmp_path):
    ledger = tmp_path / "prediction.jsonl.gz"
    forecast = {
        "prediction_id": "v3|one", "probabilities": [0.5,0.2,0.2,0.1],
        "features": {"a": 1}, "model_sha256": "hash",
        "observation_date": "2026-10-23", "data_quality_status": "complete"
    }
    assert append_immutable(ledger, [forecast]) == 1
    assert append_immutable(ledger, [forecast]) == 0
    with pytest.raises(RuntimeError, match="Historical shadow forecast changed"):
        append_immutable(ledger, [{**forecast, "probabilities": [0.6,0.1,0.2,0.1]}])

def test_prospective_rejects_trained_cohort_and_late_generated_forecasts():
    candidate = {
        "model_sha256": "hash", "model_version": "v3",
        "frozen_at": "2026-10-23T18:00:00+00:00",
        "train_observation_cutoff": "2026-09-06"
    }
    row = {
        "model_sha256": "hash", "model_version": "v3",
        "generated_at": "2026-10-24T04:00:00+00:00",
        "observation_date": "2026-10-23", "upcoming_friday": "2026-10-30",
        "p_final_week": 0.4, "p_plus_1_week": 0.3,
        "p_plus_2_weeks": 0.2, "p_plus_3_plus": 0.1,
    }
    assert _prediction_valid(row, candidate)
    assert not _prediction_valid({**row, "observation_date": "2026-08-20"}, candidate)
    assert not _prediction_valid({**row, "generated_at": "2026-10-30T20:00:00+00:00"}, candidate)

def test_gate_cannot_promote_from_small_or_unreviewed_cohort():
    candidate = {"model_sha256": "hash"}
    report = promotion_gate([], candidate)
    assert report["eligible"] is False
    assert report["checks"]["independent_label_audit"] is False
    assert report["checks"]["a_list_eligibility_and_credit_replay"] is False
    assert report["checks"]["baseline_noninferiority_bootstrap"] is False
