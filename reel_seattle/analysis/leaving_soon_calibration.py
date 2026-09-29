"""September 2026 7-day probability recalibration for frozen Leaving Soon v1.

This layer maps the already-stored v1 7-day probability. It does not refit
survival coefficients, the feature scaler, or the 14-day mapping.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_frozen import (
    FrozenModelError,
    apply_platt_linear,
    artifact_checksum,
)
from reel_seattle.analysis.leaving_soon_survival import (
    brier_score,
    classification_metrics,
    pr_auc,
    reliability_table,
    threshold_for_precision,
)
from reel_seattle.analysis.leaving_soon_v2_audit import calibration_error

CALIBRATION_VERSION = "amc_remaining_run_survival_v1_calibration_2026_09"
BASE_MODEL_VERSION = "amc_remaining_run_survival_v1"
CALIBRATION_HORIZON_DAYS = 7
DEFAULT_CALIBRATION_PATH = Path(
    "data/models/leaving_soon/calibration/amc_remaining_run_survival_v1_7d_2026_09.json"
)
ACTIVE_MANIFEST_PATH = Path("data/models/leaving_soon/active.json")
FIT_END = date(2026, 9, 11)
THRESHOLD_END = date(2026, 9, 16)
RECALL_FLOOR = 0.30


class CalibrationError(FrozenModelError):
    """Raised when the 7-day calibration artifact cannot be trusted."""


@dataclass(frozen=True)
class SevenDayCalibration:
    payload: dict[str, Any]

    @property
    def version(self) -> str:
        return str(self.payload["calibration_version"])

    @property
    def method(self) -> str:
        return str(self.payload["method"])

    @property
    def last_chance_threshold(self) -> float:
        return float(self.payload["last_chance_threshold"])

    def apply_one(self, score: float) -> float:
        return self.apply([score])[0]

    def apply(self, scores: Sequence[float]) -> list[float]:
        if self.method == "platt":
            return apply_platt_linear(self.payload["platt"], scores)
        if self.method == "isotonic":
            return [apply_isotonic_one(float(score), self.payload["breakpoints"]) for score in scores]
        raise CalibrationError(f"unsupported calibration method {self.method!r}")


def log_loss(y_true: Sequence[int], scores: Sequence[float]) -> float:
    if not y_true:
        return float("nan")
    total = 0.0
    for label, score in zip(y_true, scores):
        probability = min(1.0 - 1e-6, max(1e-6, float(score)))
        total += -(int(label) * math.log(probability) + (1 - int(label)) * math.log(1.0 - probability))
    return total / len(y_true)


def pav(labels: Sequence[float]) -> list[float]:
    """Pool-adjacent-violators isotonic regression for a nondecreasing fit."""
    blocks: list[list[float]] = []
    for value in labels:
        blocks.append([float(value), 1.0])
        while len(blocks) >= 2 and (blocks[-2][0] / blocks[-2][1]) > (blocks[-1][0] / blocks[-1][1]) + 1e-15:
            total, count = blocks.pop()
            blocks[-1][0] += total
            blocks[-1][1] += count
    fitted: list[float] = []
    for total, count in blocks:
        fitted.extend([total / count] * int(count))
    return fitted


def fit_isotonic_breakpoints(scores: Sequence[float], labels: Sequence[int]) -> list[dict[str, float]]:
    paired = sorted(zip(scores, labels), key=lambda item: (float(item[0]), int(item[1])))
    if not paired:
        raise CalibrationError("cannot fit isotonic calibration on an empty set")
    fitted = pav([int(label) for _score, label in paired])
    buckets: list[list[Any]] = []
    for score, probability in zip((float(item[0]) for item in paired), fitted):
        if buckets and abs(buckets[-1][0] - score) <= 1e-12:
            buckets[-1][1].append(probability)
        else:
            buckets.append([score, [probability]])
    points: list[dict[str, float]] = []
    running = 0.0
    for score, probabilities in buckets:
        value = max(running, min(1.0, sum(probabilities) / len(probabilities)))
        points.append({"score": float(score), "probability": float(value)})
        running = value
    return points


def apply_isotonic_one(score: float, breakpoints: Sequence[Mapping[str, float]]) -> float:
    points = list(breakpoints)
    if not points:
        raise CalibrationError("isotonic calibration has no breakpoints")
    value = float(score)
    if value <= float(points[0]["score"]):
        return float(points[0]["probability"])
    if value >= float(points[-1]["score"]):
        return float(points[-1]["probability"])
    for left, right in zip(points, points[1:]):
        left_score = float(left["score"])
        right_score = float(right["score"])
        if left_score <= value <= right_score:
            span = right_score - left_score
            if span <= 0:
                return float(right["probability"])
            weight = (value - left_score) / span
            return float(left["probability"]) + weight * (float(right["probability"]) - float(left["probability"]))
    return float(points[-1]["probability"])


def fit_platt_params(scores: Sequence[float], labels: Sequence[int]) -> dict[str, float]:
    from reel_seattle.analysis.leaving_soon_survival import platt_calibrator, platt_linear_export

    model = platt_calibrator(scores, labels)
    exported = platt_linear_export(model)
    if exported is None:
        raise CalibrationError("Platt calibration could not be fit")
    return exported


def probability_metrics(y_true: Sequence[int], scores: Sequence[float], *, threshold: float) -> dict[str, Any]:
    if not y_true:
        return {"n": 0}
    metrics = classification_metrics(y_true, scores, threshold=threshold)
    table = reliability_table(y_true, scores)
    metrics["brier"] = brier_score(y_true, scores)
    metrics["calibration_error"] = calibration_error(table)
    metrics["log_loss"] = log_loss(y_true, scores)
    metrics["pr_auc"] = pr_auc(y_true, scores)
    metrics["reliability"] = table
    metrics["coverage"] = (metrics["tp"] + metrics["fp"]) / metrics["n"] if metrics["n"] else 0.0
    return metrics


def rows_between(
    rows: Sequence[Mapping[str, Any]],
    start: date,
    end: date,
) -> list[Mapping[str, Any]]:
    """Inclusive observation-date window. Used for fit, threshold, and holdout splits."""
    chosen = []
    for row in rows:
        observed = date.fromisoformat(str(row["observation_date"])[:10])
        if start <= observed <= end:
            chosen.append(row)
    return chosen


def one_row_per_run(rows: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """Keep the latest matured prediction for each run."""
    chosen: dict[str, Mapping[str, Any]] = {}
    for row in rows:
        run_id = str(row["run_id"])
        current = chosen.get(run_id)
        if current is None or str(row["observation_date"]) > str(current["observation_date"]):
            chosen[run_id] = row
    return [chosen[key] for key in sorted(chosen)]


def grouped_bootstrap(
    rows: Sequence[Mapping[str, Any]],
    *,
    score_key: str,
    threshold: float,
    draws: int = 400,
    seed: int = 42,
) -> dict[str, Any]:
    """Resample whole runs so daily repeats do not shrink the uncertainty."""
    by_run: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in rows:
        by_run[str(row["run_id"])].append(row)
    run_ids = sorted(by_run)
    if len(run_ids) < 2:
        return {"draws": 0, "runs": len(run_ids)}
    rng = random.Random(seed)
    precisions: list[float] = []
    recalls: list[float] = []
    for _ in range(draws):
        sample: list[Mapping[str, Any]] = []
        for _run in range(len(run_ids)):
            sample.extend(by_run[rng.choice(run_ids)])
        y_true = [int(row["label"]) for row in sample]
        scores = [float(row[score_key]) for row in sample]
        metrics = classification_metrics(y_true, scores, threshold=threshold)
        precisions.append(float(metrics["precision"]))
        recalls.append(float(metrics["recall"]))
    precisions.sort()
    recalls.sort()

    def _pct(values: list[float], q: float) -> float:
        index = min(len(values) - 1, max(0, int(round(q * (len(values) - 1)))))
        return values[index]

    return {
        "draws": draws,
        "runs": len(run_ids),
        "precision_p05": _pct(precisions, 0.05),
        "precision_p50": _pct(precisions, 0.50),
        "precision_p95": _pct(precisions, 0.95),
        "recall_p05": _pct(recalls, 0.05),
        "recall_p50": _pct(recalls, 0.50),
        "recall_p95": _pct(recalls, 0.95),
    }


def choose_last_chance_threshold(
    y_true: Sequence[int],
    scores: Sequence[float],
    *,
    reference_threshold: float | None = None,
) -> dict[str, Any]:
    """Pick a Last Chance threshold that keeps the shelf usable.

    Listed targets are 85%, 90%, 95%, and 97.5% precision. A target is usable
    only when recall stays at or above ``RECALL_FLOOR``. If none do, the
    highest-precision point on the empirical curve that still meets the recall
    floor is used. When a reference threshold is supplied (the current
    production boundary mapped onto the new score), a candidate is kept only
    if its precision is at least as high as that reference.
    """
    n = len(y_true)
    candidates = []
    for target in (0.85, 0.90, 0.95, 0.975):
        chosen = threshold_for_precision(y_true, scores, min_precision=target)
        n_pred = float(chosen["n_predicted_positive"])
        candidates.append(
            {
                "target_precision": target,
                "threshold": float(chosen["threshold"]),
                "precision": float(chosen["precision"]),
                "recall": float(chosen["recall"]),
                "coverage": (n_pred / n) if n else 0.0,
                "n_predicted_positive": n_pred,
            }
        )
    usable = [
        row
        for row in candidates
        if float(row["recall"]) >= RECALL_FLOOR and float(row["n_predicted_positive"]) > 0 and float(row["threshold"]) <= 1.0
    ]
    reference = None
    if reference_threshold is not None and n:
        metrics = classification_metrics(y_true, scores, threshold=float(reference_threshold))
        reference = {
            "target_precision": None,
            "threshold": float(reference_threshold),
            "precision": float(metrics["precision"]),
            "recall": float(metrics["recall"]),
            "coverage": float((metrics["tp"] + metrics["fp"]) / n),
            "n_predicted_positive": float(metrics["tp"] + metrics["fp"]),
            "selection_rule": "rank_equivalent_current_threshold",
        }
    if usable:
        selected = dict(usable[-1])
        selected["selection_rule"] = "highest_listed_precision_target_with_recall_floor"
    else:
        selected = _max_precision_at_recall_floor(y_true, scores)
        if selected is None:
            selected = dict(reference or candidates[0])
            selected["selection_rule"] = "no_operating_point_met_the_recall_floor"
        else:
            selected["selection_rule"] = "max_precision_subject_to_recall_floor"
    if reference is not None and float(selected["precision"]) + 1e-9 < float(reference["precision"]):
        selected = dict(reference)
    return {"selected": selected, "candidates": candidates, "reference": reference}


def _max_precision_at_recall_floor(y_true: Sequence[int], scores: Sequence[float]) -> dict[str, Any] | None:
    n = len(y_true)
    best: dict[str, Any] | None = None
    for threshold in sorted({float(score) for score in scores}):
        metrics = classification_metrics(y_true, scores, threshold=threshold)
        n_pred = float(metrics["tp"] + metrics["fp"])
        if metrics["recall"] < RECALL_FLOOR or n_pred <= 0:
            continue
        row = {
            "target_precision": None,
            "threshold": threshold,
            "precision": float(metrics["precision"]),
            "recall": float(metrics["recall"]),
            "coverage": n_pred / n,
            "n_predicted_positive": n_pred,
        }
        if best is None or (row["precision"], row["recall"]) > (best["precision"], best["recall"]):
            best = row
    return best


def select_calibration_method(holdout: Mapping[str, Mapping[str, Any]]) -> str:
    """Prefer a simple map that improves later-holdout Brier and ECE."""
    baseline = holdout["baseline_platt"]
    platt = holdout.get("platt") or {}
    isotonic = holdout.get("isotonic") or {}

    def _better(candidate: Mapping[str, Any]) -> bool:
        if not candidate or not candidate.get("n"):
            return False
        return (
            float(candidate["brier"]) < float(baseline["brier"]) - 1e-4
            and float(candidate["calibration_error"]) < float(baseline["calibration_error"]) - 1e-4
        )

    platt_ok = _better(platt)
    isotonic_ok = _better(isotonic)
    if isotonic_ok and platt_ok:
        gain = float(platt["calibration_error"]) - float(isotonic["calibration_error"])
        breakpoints = int(isotonic.get("breakpoint_count") or 0)
        if gain >= 0.02 and 4 <= breakpoints <= 30:
            return "isotonic"
    if platt_ok:
        return "platt"
    if isotonic_ok:
        return "isotonic"
    raise CalibrationError("neither recalibration improved later-holdout Brier and ECE")


def build_calibration_payload(
    *,
    method: str,
    platt: Mapping[str, float] | None,
    breakpoints: Sequence[Mapping[str, float]] | None,
    last_chance_threshold: float,
    threshold_target: float,
    base_model_checksum: str,
    windows: Mapping[str, Any],
    sample_counts: Mapping[str, Any],
    holdout_metrics: Mapping[str, Any],
    grouped_uncertainty: Mapping[str, Any],
    threshold_operating_points: Sequence[Mapping[str, Any]] | None = None,
    selection_rule: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "calibration_version": CALIBRATION_VERSION,
        "base_model_version": BASE_MODEL_VERSION,
        "base_model_checksum_sha256": base_model_checksum,
        "target_horizon_days": CALIBRATION_HORIZON_DAYS,
        "method": method,
        "production_status": "active_7d_calibration",
        "does_not_refit_survival": True,
        "fourteen_day_calibration": "unchanged_v1_platt",
        "fit_window": windows["fit"],
        "threshold_window": windows["threshold"],
        "holdout_window": windows["holdout"],
        "sample_counts": sample_counts,
        "last_chance_threshold": float(last_chance_threshold),
        "last_chance_threshold_target_precision": None if threshold_target is None else float(threshold_target),
        "last_chance_threshold_selection_rule": selection_rule,
        "threshold_operating_points": [dict(row) for row in (threshold_operating_points or ())],
        "holdout_metrics": holdout_metrics,
        "grouped_bootstrap": grouped_uncertainty,
        "notes": (
            "Second-stage map of the stored v1 7-day probability. "
            "Survival coefficients, features, and the 14-day Platt map are unchanged."
        ),
    }
    if method == "platt":
        if not platt:
            raise CalibrationError("platt calibration is missing parameters")
        payload["platt"] = {"coefficient": float(platt["coefficient"]), "intercept": float(platt["intercept"])}
    elif method == "isotonic":
        if not breakpoints:
            raise CalibrationError("isotonic calibration is missing breakpoints")
        payload["breakpoints"] = [
            {"score": float(point["score"]), "probability": float(point["probability"])} for point in breakpoints
        ]
    else:
        raise CalibrationError(f"unsupported method {method}")
    payload["checksum_sha256"] = artifact_checksum(payload)
    return payload


def validate_calibration_payload(payload: Mapping[str, Any], *, base_model_checksum: str | None = None) -> None:
    required = (
        "calibration_version",
        "base_model_version",
        "base_model_checksum_sha256",
        "target_horizon_days",
        "method",
        "last_chance_threshold",
        "checksum_sha256",
    )
    missing = [key for key in required if key not in payload]
    if missing:
        raise CalibrationError(f"calibration artifact missing keys: {missing}")
    if payload["calibration_version"] != CALIBRATION_VERSION:
        raise CalibrationError(f"unsupported calibration_version {payload['calibration_version']!r}")
    if payload["base_model_version"] != BASE_MODEL_VERSION:
        raise CalibrationError("calibration is not bound to amc_remaining_run_survival_v1")
    if int(payload["target_horizon_days"]) != CALIBRATION_HORIZON_DAYS:
        raise CalibrationError("calibration horizon is not 7 days")
    if payload["method"] not in {"platt", "isotonic"}:
        raise CalibrationError(f"unsupported calibration method {payload['method']!r}")
    if artifact_checksum(payload) != str(payload["checksum_sha256"]):
        raise CalibrationError("calibration checksum mismatch")
    if base_model_checksum is not None and payload["base_model_checksum_sha256"] != base_model_checksum:
        raise CalibrationError("calibration checksum does not match the frozen v1 artifact")
    threshold = float(payload["last_chance_threshold"])
    if not 0.0 <= threshold <= 1.0:
        raise CalibrationError("last-chance threshold is outside [0, 1]")


def load_calibration(path: Path | str = DEFAULT_CALIBRATION_PATH, *, base_model_checksum: str | None = None) -> SevenDayCalibration:
    import json

    artifact_path = Path(path)
    if not artifact_path.is_file():
        raise CalibrationError(f"calibration artifact not found: {artifact_path}")
    payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise CalibrationError("calibration artifact must be a JSON object")
    validate_calibration_payload(payload, base_model_checksum=base_model_checksum)
    return SevenDayCalibration(payload=payload)


def load_active_calibration(
    manifest_path: Path | str = ACTIVE_MANIFEST_PATH,
    *,
    base_model_checksum: str | None = None,
) -> SevenDayCalibration:
    import json

    manifest = Path(manifest_path)
    if not manifest.is_file():
        raise CalibrationError(f"active model manifest not found: {manifest}")
    data = json.loads(manifest.read_text(encoding="utf-8"))
    version = str(data.get("calibration_version") or "")
    artifact = data.get("calibration_artifact")
    if version != CALIBRATION_VERSION or not artifact:
        raise CalibrationError("active manifest is missing the September 2026 7-day calibration")
    artifact_path = Path(str(artifact))
    if not artifact_path.is_file():
        rooted = Path(manifest).resolve().parents[3] / artifact_path
        if rooted.is_file():
            artifact_path = rooted
    return load_calibration(artifact_path, base_model_checksum=base_model_checksum)
