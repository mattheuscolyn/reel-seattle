"""Deterministic v2 model evaluation invariants (no production artifacts)."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from scripts.evaluate_remaining_run_calendar_v2 import (
    VERSION, FEATURES, _candidate_rows, _constant_probs, _legacy_training,
    _metrics, _paired_bootstrap, _score_for,
)
from reel_seattle.analysis.leaving_soon_prepublication_survival import _fit_hazard


def record(film, bucket, *, observed="2026-09-08", friday="2026-09-11", p=None):
    p = p or [0.2, 0.3, 0.25, 0.25]
    return {
        "film_id": film, "theater_id": "amc-a",
        "upcoming_friday": friday, "observation_date": observed,
        "bucket": bucket, "censored": 0,
        "known_weeks": bucket,
        "remaining_weeks": bucket,
        **{f"p{i}": value for i, value in enumerate(p)},
    }


def test_versioned_model_not_same_as_frozen():
    assert VERSION == "remaining_run_calendar_v2_research"
    assert FEATURES
    assert all("price" not in feature for feature in FEATURES)
    assert all("opening" not in feature for feature in FEATURES)


def test_legacy_control_restores_original_targets_without_mutating_challenger():
    row = {**record("a", 2), "source_original_bucket": 0,
           "source_original_censored": 0, "source_original_known_weeks": 0}
    original = _legacy_training([row])
    assert original[0]["bucket"] == 0
    assert original[0]["censored"] == 0
    assert row["bucket"] == 2
    assert original[0]["remaining_weeks"] == 0


def test_multiclass_metrics_are_proper_and_consistent():
    rows = [
        record("a", 0, p=[0.7, 0.1, 0.1, 0.1]),
        record("b", 2, p=[0.1, 0.1, 0.7, 0.1]),
        record("c", 3, p=[0.1, 0.1, 0.1, 0.7]),
    ]
    metrics = _metrics(rows)
    assert metrics["n"] == 3
    assert metrics["log_loss"] == pytest.approx(0.35667494394)
    assert metrics["accuracy"] == 1.0
    assert metrics["brier_sum_squares"] == pytest.approx(0.12)
    assert metrics["unique_films"] == 3


def test_film_clustered_paired_confidence_interval_and_identity_guard():
    legacy = [
        record("a", 0, p=[0.3, 0.3, 0.2, 0.2]),
        record("b", 1, p=[0.1, 0.3, 0.3, 0.3]),
        record("c", 2, p=[0.1, 0.1, 0.3, 0.5]),
    ]
    challenger = [
        record("a", 0, p=[0.8, 0.1, 0.05, 0.05]),
        record("b", 1, p=[0.05, 0.8, 0.1, 0.05]),
        record("c", 2, p=[0.05, 0.05, 0.8, 0.1]),
    ]
    interval = _paired_bootstrap(legacy, challenger, draws=60)
    assert interval["delta"] < 0
    assert interval["film_clustered_bootstrap_95pct_interval"][1] < 0
    assert interval["independent_film_clusters"] == 3
    with pytest.raises(ValueError):
        _paired_bootstrap(legacy, list(reversed(challenger)), draws=10)


def test_censored_rows_do_not_count_as_verified_holdout_events():
    rows = [record("a", 0), record("b", None)]
    rows[1]["censored"] = 1
    assert _metrics(rows)["n"] == 1


def test_empirical_frequency_baseline_fits_only_train():
    train = [record("a", 0), record("b", 0), record("c", 3)]
    train[0]["censored"] = 1
    baseline = _constant_probs(train)
    assert baseline == pytest.approx([2/6, 1/6, 1/6, 2/6])
