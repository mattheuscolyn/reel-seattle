"""Sklearn-free frozen v1 remaining-run hazard inference.

Daily production loads this JSON artifact. It does not refit on new outcomes.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_survival import (
    CONTINUOUS_FEATURES,
    FORBIDDEN_MODEL_INPUTS,
    SurvivalCurve,
    SurvivalObservation,
    covariate_dict,
    n_bins,
    survival_from_hazards,
)

MODEL_VERSION = "amc_remaining_run_survival_v1"
FEATURE_SCHEMA_VERSION = "1.0.0"
MODEL_FAMILY = "regularized_logistic_discrete_hazard"
CALIBRATION_METHOD = "platt_sigmoid_validation_only"
RUN_GAP_DAYS = 14
PREDICTION_HORIZON_DAYS = 21
TRAINING_CUTOFF = "2026-07-27"
VALIDATION_CUTOFF = "2026-08-14"
LABEL_AS_OF = "2026-09-01"
ALL_ANNOUNCED_BOUNDARY = "2026-09-03"
DEFAULT_MODEL_PATH = Path("data/models/leaving_soon") / f"{MODEL_VERSION}.json"
ACTIVE_MANIFEST_PATH = Path("data/models/leaving_soon/active.json")

CANONICAL_JSON_SEPARATORS = (",", ":")


class FrozenModelError(ValueError):
    """Raised when a frozen model artifact cannot be loaded or applied."""


def _sigmoid(value: float) -> float:
    if value >= 0:
        exp_neg = math.exp(-value)
        return 1.0 / (1.0 + exp_neg)
    exp_pos = math.exp(value)
    return exp_pos / (1.0 + exp_pos)


def apply_platt_linear(params: Mapping[str, float] | None, scores: Sequence[float]) -> list[float]:
    if not params:
        return [float(score) for score in scores]
    coef = float(params["coefficient"])
    intercept = float(params["intercept"])
    return [_sigmoid(coef * float(score) + intercept) for score in scores]


def canonical_dumps(payload: Mapping[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=CANONICAL_JSON_SEPARATORS, ensure_ascii=True)


def artifact_checksum(payload: Mapping[str, Any]) -> str:
    body = {key: value for key, value in payload.items() if key != "checksum_sha256"}
    encoded = canonical_dumps(body).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class FrozenHazardModel:
    payload: dict[str, Any]

    @property
    def model_version(self) -> str:
        return str(self.payload["model_version"])

    @property
    def feature_schema_version(self) -> str:
        return str(self.payload["feature_schema_version"])

    @property
    def columns(self) -> list[str]:
        return list(self.payload["columns"])

    @property
    def horizon_days(self) -> int:
        return int(self.payload["horizon_days"])

    @property
    def bin_size(self) -> int:
        return int(self.payload["bin_size"])

    @property
    def n_period_bins(self) -> int:
        return n_bins(self.horizon_days, self.bin_size)

    @property
    def thresholds(self) -> dict[str, Any]:
        return dict(self.payload.get("thresholds") or {})

    def threshold(self, *, horizon: int, min_precision: str) -> float:
        block = self.thresholds.get(str(horizon)) or {}
        chosen = block.get(min_precision) or {}
        value = chosen.get("threshold")
        if value is None:
            raise FrozenModelError(
                f"frozen model missing threshold horizon={horizon} {min_precision}"
            )
        return float(value)

    def predict_hazards_for_row(self, row: SurvivalObservation) -> list[float]:
        overlap = set(self.columns) & FORBIDDEN_MODEL_INPUTS
        if overlap:
            raise FrozenModelError(f"frozen columns include label fields: {sorted(overlap)}")
        covariates = covariate_dict(row)
        hazards: list[float] = []
        for period in range(self.n_period_bins):
            feats = dict(covariates)
            feats["period"] = float(period)
            for idx in range(self.n_period_bins):
                feats[f"period_{idx}"] = 1.0 if idx == period else 0.0
            vector = [float(feats.get(name, 0.0)) for name in self.columns]
            hazards.append(_sigmoid(self._decision(vector)))
        return hazards

    def predict_curve(self, row: SurvivalObservation) -> SurvivalCurve:
        return survival_from_hazards(
            self.predict_hazards_for_row(row),
            bin_size=self.bin_size,
            horizon_days=self.horizon_days,
        )

    def predict_calibrated(self, row: SurvivalObservation) -> dict[str, Any]:
        curve = self.predict_curve(row)
        p3 = float(curve.p_end_within[3])
        p7_raw = float(curve.p_end_within[7])
        p14_raw = float(curve.p_end_within[14])
        p21 = float(curve.p_end_within[21])
        p7 = apply_platt_linear(self.payload.get("platt_7d"), [p7_raw])[0]
        p14 = apply_platt_linear(self.payload.get("platt_14d"), [p14_raw])[0]
        return {
            "p_end_within_3d": p3,
            "p_end_within_7d": p7,
            "p_end_within_14d": p14,
            "p_end_within_21d": p21,
            "p_end_within_7d_raw": p7_raw,
            "p_end_within_14d_raw": p14_raw,
            "median_remaining_days": curve.median_remaining_days,
            "expected_remaining_days": curve.expected_remaining_days,
            "median_beyond_horizon": bool(curve.median_beyond_horizon),
        }

    def _decision(self, vector: Sequence[float]) -> float:
        scaled = list(vector)
        mean = self.payload["scaler_mean"]
        scale = self.payload["scaler_scale"]
        for offset, idx in enumerate(self.payload["continuous_idx"]):
            denom = float(scale[offset]) or 1.0
            scaled[idx] = (float(scaled[idx]) - float(mean[offset])) / denom
        total = float(self.payload["intercept"])
        coefficients = self.payload["coefficients"]
        for weight, value in zip(coefficients, scaled):
            total += float(weight) * float(value)
        return total


def validate_frozen_payload(payload: Mapping[str, Any]) -> None:
    required = (
        "model_version",
        "feature_schema_version",
        "columns",
        "continuous_idx",
        "scaler_mean",
        "scaler_scale",
        "coefficients",
        "intercept",
        "horizon_days",
        "bin_size",
        "thresholds",
        "checksum_sha256",
    )
    missing = [key for key in required if key not in payload]
    if missing:
        raise FrozenModelError(f"frozen model missing keys: {missing}")
    if payload["model_version"] != MODEL_VERSION:
        raise FrozenModelError(
            f"unsupported model_version {payload['model_version']!r}; expected {MODEL_VERSION}"
        )
    if payload["feature_schema_version"] != FEATURE_SCHEMA_VERSION:
        raise FrozenModelError(
            f"feature schema mismatch {payload['feature_schema_version']!r}; "
            f"expected {FEATURE_SCHEMA_VERSION}"
        )
    columns = payload["columns"]
    coefficients = payload["coefficients"]
    if not isinstance(columns, list) or not columns:
        raise FrozenModelError("frozen model columns must be a non-empty list")
    if len(columns) != len(coefficients):
        raise FrozenModelError("coefficient count does not match columns")
    if set(columns) & FORBIDDEN_MODEL_INPUTS:
        raise FrozenModelError("frozen model columns include label fields")
    continuous_idx = payload["continuous_idx"]
    if len(continuous_idx) != len(payload["scaler_mean"]) or len(continuous_idx) != len(
        payload["scaler_scale"]
    ):
        raise FrozenModelError("scaler arrays must align with continuous_idx")
    expected_continuous = [
        i for i, name in enumerate(columns) if name in CONTINUOUS_FEATURES or name == "period"
    ]
    if list(continuous_idx) != expected_continuous:
        raise FrozenModelError("continuous_idx does not match feature contract")
    if int(payload["horizon_days"]) != PREDICTION_HORIZON_DAYS:
        raise FrozenModelError("horizon_days does not match frozen v1 contract")
    checksum = artifact_checksum(payload)
    if checksum != str(payload["checksum_sha256"]):
        raise FrozenModelError("frozen model checksum mismatch")


def load_frozen_model(path: Path | str = DEFAULT_MODEL_PATH) -> FrozenHazardModel:
    artifact_path = Path(path)
    if not artifact_path.is_file():
        raise FrozenModelError(f"frozen model not found: {artifact_path}")
    payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise FrozenModelError("frozen model must be a JSON object")
    validate_frozen_payload(payload)
    return FrozenHazardModel(payload=payload)


def load_active_model(manifest_path: Path | str = ACTIVE_MANIFEST_PATH) -> FrozenHazardModel:
    manifest = Path(manifest_path)
    if not manifest.is_file():
        return load_frozen_model(DEFAULT_MODEL_PATH)
    data = json.loads(manifest.read_text(encoding="utf-8"))
    version = str(data.get("active_model_version") or MODEL_VERSION)
    artifact = data.get("artifact") or str(DEFAULT_MODEL_PATH)
    if version != MODEL_VERSION:
        raise FrozenModelError(f"active model {version!r} is not loadable by this runtime")
    return load_frozen_model(artifact)


def build_frozen_payload(
    *,
    linear: Mapping[str, Any],
    platt_7d: Mapping[str, float] | None,
    platt_14d: Mapping[str, float] | None,
    thresholds: Mapping[str, Any],
    metadata: Mapping[str, Any],
) -> dict[str, Any]:
    payload = {
        "model_version": MODEL_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "model_family": MODEL_FAMILY,
        "calibration_method": CALIBRATION_METHOD,
        "run_gap_days": RUN_GAP_DAYS,
        "source_identity_requirement": "source_film_id",
        "prediction_horizon_days": PREDICTION_HORIZON_DAYS,
        "training_data_cutoff": TRAINING_CUTOFF,
        "validation_cutoff": VALIDATION_CUTOFF,
        "label_as_of": LABEL_AS_OF,
        "all_announced_observation_boundary": ALL_ANNOUNCED_BOUNDARY,
        "ship_gate": "promising_continue",
        "not_final": True,
        **dict(linear),
        "platt_7d": dict(platt_7d) if platt_7d else None,
        "platt_14d": dict(platt_14d) if platt_14d else None,
        "thresholds": json.loads(json.dumps(thresholds)),
        "metadata": dict(metadata),
    }
    payload["checksum_sha256"] = artifact_checksum(payload)
    validate_frozen_payload(payload)
    return payload
