"""Tests for the September 2026 7-day Leaving Soon calibration layer."""

from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

import pytest

from reel_seattle.analysis.leaving_soon_calibration import (
    CALIBRATION_VERSION,
    CalibrationError,
    apply_isotonic_one,
    choose_last_chance_threshold,
    fit_isotonic_breakpoints,
    load_active_calibration,
    load_calibration,
    rows_between,
)
from reel_seattle.analysis.leaving_soon_frozen import load_active_model

ARTIFACT = Path("data/models/leaving_soon/calibration/amc_remaining_run_survival_v1_7d_2026_09.json")
V1_PATH = Path("data/models/leaving_soon/amc_remaining_run_survival_v1.json")


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def test_rows_between_is_inclusive_and_drops_later_dates():
    rows = [
        {"observation_date": "2026-09-03", "run_id": "a"},
        {"observation_date": "2026-09-11", "run_id": "a"},
        {"observation_date": "2026-09-12", "run_id": "b"},
    ]
    chosen = rows_between(rows, date(2026, 9, 3), date(2026, 9, 11))
    assert [row["observation_date"] for row in chosen] == ["2026-09-03", "2026-09-11"]


def test_committed_calibration_windows_do_not_overlap():
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    assert payload["fit_window"]["end"] < payload["threshold_window"]["start"]
    assert payload["threshold_window"]["end"] < payload["holdout_window"]["start"]
    assert payload["fit_window"]["start"] == "2026-09-03"
    assert payload["sample_counts"]["mature_public_rows"] == 542


def test_platt_transform_is_deterministic_and_monotone():
    model = load_active_model()
    calibration = load_calibration(ARTIFACT, base_model_checksum=model.payload["checksum_sha256"])
    assert calibration.version == CALIBRATION_VERSION
    assert calibration.method == "platt"
    coef = float(calibration.payload["platt"]["coefficient"])
    intercept = float(calibration.payload["platt"]["intercept"])
    scores = [0.05, 0.3, 0.7, 0.94]
    mapped = calibration.apply(scores)
    assert mapped == calibration.apply(scores)
    assert mapped == [_sigmoid(coef * score + intercept) for score in scores]
    assert mapped == sorted(mapped)


def test_isotonic_breakpoints_are_monotone():
    breakpoints = fit_isotonic_breakpoints([0.1, 0.4, 0.4, 0.9], [0, 0, 1, 1])
    mapped = [apply_isotonic_one(score, breakpoints) for score in (0.0, 0.2, 0.5, 1.0)]
    assert mapped == sorted(mapped)


def test_checksum_and_version_failures_do_not_load():
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    payload["platt"]["coefficient"] = float(payload["platt"]["coefficient"]) + 1.0
    bad = ARTIFACT.parent / "_bad_checksum.json"
    try:
        bad.write_text(json.dumps(payload), encoding="utf-8")
        with pytest.raises(CalibrationError, match="checksum"):
            load_calibration(bad)
    finally:
        bad.unlink(missing_ok=True)
    payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    payload["calibration_version"] = "not-the-production-calibration"
    payload.pop("checksum_sha256", None)
    from reel_seattle.analysis.leaving_soon_frozen import artifact_checksum

    payload["checksum_sha256"] = artifact_checksum(payload)
    bad.write_text(json.dumps(payload), encoding="utf-8")
    try:
        with pytest.raises(CalibrationError, match="unsupported calibration_version"):
            load_calibration(bad)
    finally:
        bad.unlink(missing_ok=True)


def test_active_calibration_is_bound_to_the_frozen_v1_checksum():
    model = load_active_model()
    v1 = json.loads(V1_PATH.read_text(encoding="utf-8"))
    assert v1["checksum_sha256"] == model.payload["checksum_sha256"]
    calibration = load_active_calibration(base_model_checksum=v1["checksum_sha256"])
    assert calibration.payload["base_model_version"] == "amc_remaining_run_survival_v1"
    assert calibration.payload["fourteen_day_calibration"] == "unchanged_v1_platt"
    assert calibration.payload["does_not_refit_survival"] is True
    assert abs(calibration.last_chance_threshold - 0.829244726757645) < 1e-12


def test_threshold_derivation_keeps_recall_when_a_precision_target_allows_it():
    labels = [1, 1, 1, 1, 0, 0, 0, 0]
    scores = [0.9, 0.8, 0.7, 0.6, 0.4, 0.3, 0.2, 0.1]
    chosen = choose_last_chance_threshold(labels, scores)
    assert chosen["selected"]["precision"] >= 0.85
    assert chosen["selected"]["recall"] >= 0.30
    assert chosen["selected"]["threshold"] <= 1.0


def test_base_model_checksum_mismatch_refuses_the_artifact():
    with pytest.raises(CalibrationError, match="does not match"):
        load_calibration(ARTIFACT, base_model_checksum="0" * 64)
