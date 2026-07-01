"""Optional local-only ML exploration for weekly Leaving Soon labels (PR D3).

Uses anchor-time numeric/boolean features only. No trained model is committed.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_eval import (
    ConfusionCounts,
    base_positive_rate,
    split_rows_by_anchor_date,
)

ML_BOOL_FIELDS = (
    "current_week_has_weekend_show",
    "current_week_has_primetime",
    "is_first_week_observed",
    "is_new_release_like",
    "weekday_only_current_week",
    "single_theater_current_week",
    "single_day_current_week",
    "low_showtime_count_bucket",
    "event_like_flag",
    "strict_event_like_flag",
    "flag_anniversary_like",
    "flag_fan_event_like",
    "flag_sensory_friendly_like",
    "flag_double_feature_like",
    "flag_live_encore_like",
    "flag_classic_rerelease_like",
)

ML_NUMERIC_FIELDS = (
    "current_week_showtime_count",
    "current_week_theater_count",
    "current_week_visible_days",
    "current_week_matinee_showtime_count",
    "current_week_primetime_showtime_count",
    "current_week_late_showtime_count",
    "current_week_weekend_showtime_count",
    "current_week_weekend_day_count",
    "current_week_showtime_density",
    "prior_week_showtime_count",
    "prior_week_theater_count",
    "prior_week_visible_days",
    "showtime_count_change_vs_prior_week",
    "theater_count_change_vs_prior_week",
    "visible_days_change_vs_prior_week",
    "showtime_pct_change_vs_prior_week",
    "theater_pct_change_vs_prior_week",
    "peak_week_showtime_count_to_date",
    "peak_week_theater_count_to_date",
    "peak_showtime_count_to_date",
    "peak_theater_count_to_date",
    "current_showtime_pct_of_peak",
    "current_theater_pct_of_peak",
    "weeks_since_peak_showtimes",
    "weeks_since_peak_theaters",
    "weeks_since_first_seen",
    "booking_cycles_seen",
    "booking_cycles_survived",
    "weeks_survived_so_far",
)

ML_FEATURE_FIELDS = ML_NUMERIC_FIELDS + ML_BOOL_FIELDS


def _parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def _parse_float(value: str) -> float:
    text = str(value).strip()
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def row_to_features(row: Mapping[str, str]) -> list[float]:
    features: list[float] = []
    for field in ML_NUMERIC_FIELDS:
        features.append(_parse_float(row.get(field, "")))
    for field in ML_BOOL_FIELDS:
        features.append(1.0 if _parse_bool(row.get(field, "")) else 0.0)
    return features


def _labels(rows: Sequence[Mapping[str, str]]) -> list[bool]:
    return [_parse_bool(row["leaving_soon_label"]) for row in rows]


def _metric_dict(
    counts: ConfusionCounts,
    *,
    period: str,
    model_id: str,
    threshold: float,
    base_rate: float,
) -> dict[str, Any]:
    predicted = counts.true_positives + counts.false_positives
    total = predicted + counts.true_negatives + counts.false_negatives
    precision = counts.true_positives / predicted if predicted else 0.0
    recall = counts.true_positives / (counts.true_positives + counts.false_negatives)
    recall = recall if counts.true_positives + counts.false_negatives else 0.0
    coverage = predicted / total if total else 0.0
    lift = precision / base_rate if base_rate else 0.0
    return {
        "model_id": model_id,
        "period": period,
        "threshold": round(threshold, 4),
        "true_positives": counts.true_positives,
        "false_positives": counts.false_positives,
        "true_negatives": counts.true_negatives,
        "false_negatives": counts.false_negatives,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "coverage": round(coverage, 4),
        "lift_over_base": round(lift, 4),
        "base_positive_rate": round(base_rate, 4),
    }


def _confusion_from_labels(
    y_true: Sequence[bool],
    y_pred: Sequence[bool],
) -> ConfusionCounts:
    tp = fp = tn = fn = 0
    for actual, predicted in zip(y_true, y_pred, strict=True):
        if predicted and actual:
            tp += 1
        elif predicted and not actual:
            fp += 1
        elif not predicted and actual:
            fn += 1
        else:
            tn += 1
    return ConfusionCounts(
        true_positives=tp,
        false_positives=fp,
        true_negatives=tn,
        false_negatives=fn,
    )


def _best_threshold(
    y_true: Sequence[bool],
    probabilities: Sequence[float],
    *,
    min_coverage: float = 0.05,
) -> float:
    best_threshold = 0.5
    best_precision = -1.0
    for step in range(5, 96):
        threshold = step / 100.0
        predicted = [prob >= threshold for prob in probabilities]
        counts = _confusion_from_labels(y_true, predicted)
        predicted_n = counts.true_positives + counts.false_positives
        total = len(y_true)
        coverage = predicted_n / total if total else 0.0
        if coverage < min_coverage:
            continue
        precision = counts.true_positives / predicted_n if predicted_n else 0.0
        if precision > best_precision:
            best_precision = precision
            best_threshold = threshold
    return best_threshold


def run_weekly_ml_exploration(
    rows: Sequence[Mapping[str, str]],
    *,
    output_path: Path | None = None,
) -> dict[str, Any]:
    try:
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.tree import DecisionTreeClassifier
    except ImportError:
        return {
            "attempted": False,
            "reason": "scikit-learn is not installed",
            "sklearn_available": False,
        }

    train, val, test = split_rows_by_anchor_date(rows)
    if not train or not val or not test:
        return {
            "attempted": False,
            "reason": "insufficient rows for time-aware ML splits",
            "sklearn_available": True,
        }

    x_train = [row_to_features(row) for row in train]
    x_val = [row_to_features(row) for row in val]
    x_test = [row_to_features(row) for row in test]
    y_train = _labels(train)
    y_val = _labels(val)
    y_test = _labels(test)
    test_base = base_positive_rate(test)

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_val_scaled = scaler.transform(x_val)
    x_test_scaled = scaler.transform(x_test)

    model_specs = [
        (
            "logistic_regression",
            LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42),
            x_train_scaled,
            x_val_scaled,
            x_test_scaled,
        ),
        (
            "decision_tree_depth4",
            DecisionTreeClassifier(max_depth=4, min_samples_leaf=20, random_state=42),
            x_train,
            x_val,
            x_test,
        ),
        (
            "random_forest",
            RandomForestClassifier(
                n_estimators=100,
                max_depth=6,
                min_samples_leaf=10,
                class_weight="balanced",
                random_state=42,
            ),
            x_train,
            x_val,
            x_test,
        ),
    ]

    results: list[dict[str, Any]] = []
    for model_id, model, x_tr, x_va, x_te in model_specs:
        model.fit(x_tr, y_train)
        val_probs = [float(p[1]) for p in model.predict_proba(x_va)]
        threshold = _best_threshold(y_val, val_probs)
        test_probs = [float(p[1]) for p in model.predict_proba(x_te)]
        test_pred = [prob >= threshold for prob in test_probs]
        counts = _confusion_from_labels(y_test, test_pred)
        results.append(
            _metric_dict(
                counts,
                period="test",
                model_id=model_id,
                threshold=threshold,
                base_rate=test_base,
            )
        )

    best_model = max(results, key=lambda item: (item["precision"], item["lift_over_base"]))
    payload = {
        "attempted": True,
        "sklearn_available": True,
        "feature_count": len(ML_FEATURE_FIELDS),
        "models": results,
        "best_model": best_model,
        "comparison_note": (
            "ML uses validation-tuned probability thresholds; compare test precision/coverage "
            "against rule-based `low_footprint_not_first_week`."
        ),
    }
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        payload["output_path"] = str(output_path)
    return payload
