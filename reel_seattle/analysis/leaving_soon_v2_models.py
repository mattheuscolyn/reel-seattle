"""Candidate Leaving Soon fits.

These trainers write nothing and never read ``active.json``. Callers that
persist a candidate must use a non-production path.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Sequence

from reel_seattle.analysis.leaving_soon_survival import (
    DEFAULT_BIN_SIZE,
    DEFAULT_HORIZON_DAYS,
    DiscreteHazardModel,
    SurvivalObservation,
    apply_platt,
    binary_outcome,
    concordance_index,
    covariate_dict,
    default_feature_columns,
    expand_rows,
    follow_up_days,
    n_bins,
    platt_calibrator,
    remaining_error_metrics,
)
from reel_seattle.analysis.leaving_soon_v2_audit import BOUNDARY, regime_for_date, score_binary

ABLATION_FEATURES = {
    "booking_horizon": (
        "announced_horizon_days",
        "days_with_announced_showtimes",
        "farthest_show_date_delta",
        "horizon_at_ceiling",
    ),
    "footprint": (
        "theater_count",
        "showtime_count",
        "showtimes_per_active_day",
        "weekend_showtime_count",
        "prime_time_showtime_count",
        "premium_format_count",
        "premium_format_share",
        "weekend_share",
        "prime_share",
        "low_footprint",
        "has_weekend",
    ),
    "trajectory": (
        "delta_theater_count",
        "delta_showtime_count",
        "lost_theater_since_prior",
        "lost_weekend_coverage",
        "lost_prime_time_coverage",
        "missing_prior",
    ),
}


def period_columns(names: Sequence[str], *, horizon_days: int = DEFAULT_HORIZON_DAYS, bin_size: int = DEFAULT_BIN_SIZE) -> list[str]:
    bins = n_bins(horizon_days, bin_size)
    return list(names) + ["period"] + [f"period_{idx}" for idx in range(bins)]


def ablation_column_sets(*, horizon_days: int = DEFAULT_HORIZON_DAYS) -> dict[str, list[str]]:
    booking = ABLATION_FEATURES["booking_horizon"]
    footprint = ABLATION_FEATURES["footprint"]
    trajectory = ABLATION_FEATURES["trajectory"]
    specs = {
        "booking_horizon": booking,
        "footprint": footprint,
        "trajectory": trajectory,
        "booking_horizon_plus_footprint": booking + footprint,
        "footprint_plus_trajectory": footprint + trajectory,
        "full": tuple(
            name
            for name in default_feature_columns(n_bins(horizon_days, DEFAULT_BIN_SIZE))
            if name != "period" and not name.startswith("period_")
        ),
    }
    return {name: period_columns(cols, horizon_days=horizon_days) for name, cols in specs.items()}


def columns_without_ceiling(columns: Sequence[str]) -> list[str]:
    return [name for name in columns if name != "horizon_at_ceiling"]


class RegimeHazardModel(DiscreteHazardModel):
    """Discrete hazard with an explicit capped-PIT vs all-announced flag."""

    def predict_hazards_for_row(self, row: SurvivalObservation) -> list[float]:
        if self._model is None:
            raise RuntimeError("model is not fitted")
        covariates = covariate_dict(row)
        covariates["regime_all_announced"] = 1.0 if regime_for_date(row.observation_date) == "all_announced_future" else 0.0
        return _hazards_from_covariates(self, covariates)


def _hazards_from_covariates(model: DiscreteHazardModel, covariates: dict[str, float]) -> list[float]:
    matrix = []
    for period in range(model.n_period_bins):
        feats = dict(covariates)
        feats["period"] = float(period)
        for idx in range(model.n_period_bins):
            feats[f"period_{idx}"] = 1.0 if idx == period else 0.0
        matrix.append([float(feats.get(name, 0.0)) for name in model.columns])
    x = model._transform(matrix)
    proba = model._model.predict_proba(x)
    classes = list(getattr(model._model, "classes_", []))
    if 1 not in classes:
        return [0.0] * model.n_period_bins
    class_index = classes.index(1)
    return [float(row_p[class_index]) for row_p in proba]


def _inject_regime(periods) -> None:
    for period in periods:
        period.features["regime_all_announced"] = (
            1.0 if period.observation_date >= BOUNDARY else 0.0
        )


def fit_hazard(
    train_rows: Sequence[SurvivalObservation],
    columns: Sequence[str],
    *,
    as_of: date,
    regime_feature: bool = False,
    C: float = 1.0,
) -> DiscreteHazardModel:
    model_cls = RegimeHazardModel if regime_feature else DiscreteHazardModel
    model = model_cls(columns=list(columns), C=C)
    periods = expand_rows(train_rows, as_of=as_of, horizon_days=model.horizon_days, bin_size=model.bin_size)
    if regime_feature:
        _inject_regime(periods)
    model.fit(periods)
    return model


def _curve_probability(curve, horizon: int) -> float:
    return float(curve.p_end_within[horizon])


def calibrated_horizon_scores(
    model: DiscreteHazardModel,
    rows: Sequence[SurvivalObservation],
    *,
    as_of: date,
    calibrators: dict[int, Any] | None = None,
) -> dict[int, list[float]]:
    raw = {7: [], 14: []}
    for row in rows:
        curve = model.predict_curve(row)
        raw[7].append(_curve_probability(curve, 7))
        raw[14].append(_curve_probability(curve, 14))
    if not calibrators:
        return raw
    return {
        horizon: apply_platt(calibrators[horizon], scores) if calibrators.get(horizon) is not None else scores
        for horizon, scores in raw.items()
    }


def fit_horizon_calibrators(
    model: DiscreteHazardModel,
    val_rows: Sequence[SurvivalObservation],
    *,
    as_of: date,
) -> dict[int, Any]:
    scores = calibrated_horizon_scores(model, val_rows, as_of=as_of)
    fitted = {}
    for horizon, values in scores.items():
        labels = [binary_outcome(row, horizon=horizon, as_of=as_of) for row in val_rows]
        paired_y = [label for label, score in zip(labels, values) if label is not None]
        paired_s = [score for label, score in zip(labels, values) if label is not None]
        if len(set(paired_y)) < 2:
            fitted[horizon] = None
        else:
            fitted[horizon] = platt_calibrator(paired_s, paired_y)
    return fitted


def survival_holdout_metrics(
    model: DiscreteHazardModel,
    rows: Sequence[SurvivalObservation],
    *,
    as_of: date,
    calibrators: dict[int, Any] | None = None,
    threshold7: float = 0.5,
    threshold14: float = 0.5,
) -> dict[str, Any]:
    scores = calibrated_horizon_scores(model, rows, as_of=as_of, calibrators=calibrators)
    curves = [model.predict_curve(row) for row in rows]
    metrics = {}
    for horizon, threshold in ((7, threshold7), (14, threshold14)):
        y_true = []
        used = []
        for row, score in zip(rows, scores[horizon]):
            label = binary_outcome(row, horizon=horizon, as_of=as_of)
            if label is None:
                continue
            y_true.append(label)
            used.append(score)
        metrics[f"end_within_{horizon}d"] = score_binary(y_true, used, threshold=threshold)
    times = []
    events = []
    predicted = []
    for row, curve in zip(rows, curves):
        if row.event_observed and row.remaining_days is not None:
            times.append(float(row.remaining_days))
            events.append(1)
        else:
            times.append(float(follow_up_days(row, as_of)))
            events.append(0)
        predicted.append(
            float(curve.median_remaining_days)
            if curve.median_remaining_days is not None
            else float(model.horizon_days + 1)
        )
    metrics["concordance"] = concordance_index(times, events, predicted)
    metrics["remaining_days"] = remaining_error_metrics(
        rows,
        [curve.median_remaining_days for curve in curves],
    )
    return metrics


def fit_binary_logistic(
    train_rows: Sequence[SurvivalObservation],
    *,
    horizon: int,
    as_of: date,
    columns: Sequence[str] | None = None,
    kind: str = "logistic",
):
    """Regularized classifier for a single horizon. Labels that are still unknown are dropped."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    import numpy as np

    names = list(columns or [name for name in covariate_dict(train_rows[0]) if name != "period"])
    matrix = []
    labels = []
    for row in train_rows:
        label = binary_outcome(row, horizon=horizon, as_of=as_of)
        if label is None:
            continue
        feats = covariate_dict(row)
        matrix.append([float(feats.get(name, 0.0)) for name in names])
        labels.append(label)
    if len(set(labels)) < 2:
        raise ValueError(f"horizon {horizon} training labels are single-class")
    scaler = StandardScaler()
    x = scaler.fit_transform(np.asarray(matrix, dtype=float))
    y = np.asarray(labels, dtype=int)
    if kind == "hgb":
        from sklearn.ensemble import HistGradientBoostingClassifier

        clf = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.08, max_iter=80, random_state=42)
        clf.fit(x, y)
    else:
        clf = LogisticRegression(C=1.0, solver="lbfgs", max_iter=1000, random_state=42)
        clf.fit(x, y)
    return {"model": clf, "scaler": scaler, "columns": names, "kind": kind, "horizon": horizon}


def binary_scores(fitted: dict[str, Any], rows: Sequence[SurvivalObservation]) -> list[float | None]:
    import numpy as np

    matrix = []
    for row in rows:
        feats = covariate_dict(row)
        matrix.append([float(feats.get(name, 0.0)) for name in fitted["columns"]])
    x = fitted["scaler"].transform(np.asarray(matrix, dtype=float))
    proba = fitted["model"].predict_proba(x)
    classes = list(fitted["model"].classes_)
    if 1 not in classes:
        return [0.0 for _ in rows]
    index = classes.index(1)
    return [float(row_p[index]) for row_p in proba]


def binary_holdout_metrics(
    fitted: dict[str, Any],
    rows: Sequence[SurvivalObservation],
    *,
    as_of: date,
    threshold: float = 0.5,
    calibrator=None,
) -> dict[str, Any]:
    scores = binary_scores(fitted, rows)
    if calibrator is not None:
        scores = apply_platt(calibrator, [float(score) for score in scores])
    y_true = []
    used = []
    for row, score in zip(rows, scores):
        label = binary_outcome(row, horizon=fitted["horizon"], as_of=as_of)
        if label is None or score is None:
            continue
        y_true.append(label)
        used.append(float(score))
    return score_binary(y_true, used, threshold=threshold)
