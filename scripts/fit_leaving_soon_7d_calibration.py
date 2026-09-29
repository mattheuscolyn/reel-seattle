#!/usr/bin/env python3
"""Fit the September 2026 7-day recalibration from stored predictions.

Does not rewrite v1 coefficients. Writes the calibration artifact only.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_calibration import (  # noqa: E402
    FIT_END,
    THRESHOLD_END,
    build_calibration_payload,
    choose_last_chance_threshold,
    fit_isotonic_breakpoints,
    fit_platt_params,
    grouped_bootstrap,
    load_calibration,
    one_row_per_run,
    probability_metrics,
    rows_between,
    select_calibration_method,
)
from reel_seattle.analysis.leaving_soon_frozen import load_active_model  # noqa: E402
from reel_seattle.analysis.leaving_soon_inference import DEFAULT_SNAPSHOT_DIR  # noqa: E402
from reel_seattle.analysis.leaving_soon_prospective import (  # noqa: E402
    load_prediction_snapshots,
    run_ends_from_lifecycle_rows,
)
from reel_seattle.analysis.leaving_soon_survival import filter_primary_observations, json_ready  # noqa: E402
from reel_seattle.analysis.leaving_soon_v2_audit import (  # noqa: E402
    join_predictions,
    load_amc_lifecycle,
    segment_name_map,
)


def _xy(rows, key):
    return [int(row["label"]) for row in rows], [float(row[key]) for row in rows]


def _apply_rows(rows, key, values):
    updated = []
    for row, value in zip(rows, values):
        copy = dict(row)
        copy[key] = float(value)
        updated.append(copy)
    return updated


def main() -> int:
    rows, _gaps, as_of = load_amc_lifecycle(PROJECT_ROOT)
    primary, _accounting = filter_primary_observations(rows)
    snapshots = load_prediction_snapshots(PROJECT_ROOT / DEFAULT_SNAPSHOT_DIR)
    frozen = load_active_model(PROJECT_ROOT / "data/models/leaving_soon/active.json")
    old_threshold = frozen.threshold(horizon=7, min_precision="min_precision_0.95")
    leaving_threshold = frozen.threshold(horizon=14, min_precision="min_precision_0.90")
    joined = join_predictions(
        snapshots,
        observations_by_key={(row.run_id, row.observation_date.isoformat()): row for row in primary},
        run_ends=run_ends_from_lifecycle_rows(primary),
        as_of=as_of,
        last_chance_threshold=old_threshold,
        leaving_soon_threshold=leaving_threshold,
    )
    dataset = []
    for row in joined:
        if not row.get("public_eligible") or row.get("regime") != "all_announced_future":
            continue
        label = (row.get("labels") or {}).get("7")
        if label is None or row.get("p7") is None:
            continue
        dataset.append(
            {
                "observation_date": row["observation_date"],
                "run_id": row["run_id"],
                "title": row.get("title"),
                "run_type": row.get("run_type"),
                "label": int(label),
                "label_14": (row.get("labels") or {}).get("14"),
                "p7": float(row["p7"]),
                "p14": float(row["p14"]),
                "features": row.get("features") or {},
            }
        )
    fit_rows = rows_between(dataset, date(2026, 9, 3), FIT_END)
    threshold_rows = rows_between(dataset, date(2026, 9, 12), THRESHOLD_END)
    holdout_end = max(date.fromisoformat(row["observation_date"]) for row in dataset)
    holdout_rows = rows_between(dataset, date(2026, 9, 17), holdout_end)
    y_fit, p_fit = _xy(fit_rows, "p7")
    platt = fit_platt_params(p_fit, y_fit)
    breakpoints = fit_isotonic_breakpoints(p_fit, y_fit)
    from reel_seattle.analysis.leaving_soon_frozen import apply_platt_linear
    from reel_seattle.analysis.leaving_soon_calibration import apply_isotonic_one

    def _platt(rows):
        return apply_platt_linear(platt, [row["p7"] for row in rows])

    def _iso(rows):
        return [apply_isotonic_one(row["p7"], breakpoints) for row in rows]

    method_scores = {
        "platt": (_apply_rows(threshold_rows, "score", _platt(threshold_rows)), _apply_rows(holdout_rows, "score", _platt(holdout_rows))),
        "isotonic": (_apply_rows(threshold_rows, "score", _iso(threshold_rows)), _apply_rows(holdout_rows, "score", _iso(holdout_rows))),
    }
    reference_threshold = {
        "platt": apply_platt_linear(platt, [old_threshold])[0],
        "isotonic": apply_isotonic_one(old_threshold, breakpoints),
    }
    y_hold, p_base = _xy(holdout_rows, "p7")
    holdout = {"baseline_platt": probability_metrics(y_hold, p_base, threshold=old_threshold)}
    choices = {}
    for name, (threshold_scored, holdout_scored) in method_scores.items():
        y_thr, s_thr = _xy(threshold_scored, "score")
        choices[name] = choose_last_chance_threshold(
            y_thr,
            s_thr,
            reference_threshold=reference_threshold[name],
        )
        y_h, s_h = _xy(holdout_scored, "score")
        metrics = probability_metrics(y_h, s_h, threshold=float(choices[name]["selected"]["threshold"]))
        if name == "isotonic":
            metrics["breakpoint_count"] = len(breakpoints)
        holdout[name] = metrics
    print("comparison", {name: {key: metrics.get(key) for key in ("n", "brier", "calibration_error", "precision", "recall", "pr_auc")} for name, metrics in holdout.items()}, flush=True)
    method = select_calibration_method(holdout)
    selected = dict(choices[method]["selected"])
    candidate_threshold = float(selected["threshold"])
    scored_holdout = method_scores[method][1]
    candidate_metrics = holdout[method]
    baseline_metrics = holdout["baseline_platt"]
    recall_dropped = float(candidate_metrics["recall"]) + 1e-9 < float(baseline_metrics["recall"]) - 0.05
    precision_failed = float(candidate_metrics["precision"]) < 0.85
    if recall_dropped or precision_failed:
        reference = choices[method].get("reference") or {}
        selected = {
            "target_precision": None,
            "threshold": float(reference_threshold[method]),
            "precision": float(reference.get("precision") or 0.0),
            "recall": float(reference.get("recall") or 0.0),
            "coverage": float(reference.get("coverage") or 0.0),
            "n_predicted_positive": float(reference.get("n_predicted_positive") or 0.0),
            "selection_rule": "rank_equivalent_current_threshold",
            "rejected_threshold": candidate_threshold,
            "rejected_reason": (
                "The precision-target threshold did not keep Last Chance precision and recall "
                "on the later holdout. The production threshold is the current v1 boundary "
                "mapped through the new 7-day calibration."
            ),
        }
        y_h, s_h = _xy(scored_holdout, "score")
        replacement = probability_metrics(y_h, s_h, threshold=float(selected["threshold"]))
        if method == "isotonic":
            replacement["breakpoint_count"] = len(breakpoints)
        holdout[method] = replacement
    new_threshold = float(selected["threshold"])
    disagreements = sum(
        1
        for row in scored_holdout
        if (float(row["p7"]) >= old_threshold) != (float(row["score"]) >= new_threshold)
    )
    all_scored = _apply_rows(dataset, "score", _platt(dataset) if method == "platt" else _iso(dataset))
    grouped = grouped_bootstrap(scored_holdout, score_key="score", threshold=new_threshold)
    per_run = one_row_per_run(scored_holdout)
    y_run, s_run = _xy(per_run, "score")
    per_run_metrics = probability_metrics(y_run, s_run, threshold=new_threshold)
    v1_checksum = json.loads(
        (PROJECT_ROOT / "data/models/leaving_soon/amc_remaining_run_survival_v1.json").read_text(encoding="utf-8")
    )["checksum_sha256"]
    payload = build_calibration_payload(
        method=method,
        platt=platt,
        breakpoints=breakpoints,
        last_chance_threshold=new_threshold,
        threshold_target=None if selected.get("target_precision") is None else float(selected["target_precision"]),
        threshold_operating_points=choices[method]["candidates"],
        selection_rule=str(selected.get("selection_rule") or ""),
        base_model_checksum=v1_checksum,
        windows={
            "fit": {"start": "2026-09-03", "end": FIT_END.isoformat()},
            "threshold": {"start": "2026-09-12", "end": THRESHOLD_END.isoformat()},
            "holdout": {"start": "2026-09-17", "end": holdout_end.isoformat()},
        },
        sample_counts={
            "fit_rows": len(fit_rows),
            "fit_runs": len({row["run_id"] for row in fit_rows}),
            "threshold_rows": len(threshold_rows),
            "threshold_runs": len({row["run_id"] for row in threshold_rows}),
            "holdout_rows": len(holdout_rows),
            "holdout_runs": len({row["run_id"] for row in holdout_rows}),
            "mature_public_rows": len(dataset),
            "as_of": as_of.isoformat(),
        },
        holdout_metrics={
            "before": {key: holdout["baseline_platt"].get(key) for key in ("n", "brier", "calibration_error", "log_loss", "pr_auc", "precision", "recall", "coverage")},
            "after": {key: holdout[method].get(key) for key in ("n", "brier", "calibration_error", "log_loss", "pr_auc", "precision", "recall", "coverage")},
            "one_row_per_run": {key: per_run_metrics.get(key) for key in ("n", "precision", "recall", "brier", "calibration_error")},
            "decision_set_disagreements_on_holdout": disagreements,
            "rejected_precision_target": {
                "threshold": candidate_threshold,
                "precision": candidate_metrics.get("precision"),
                "recall": candidate_metrics.get("recall"),
                "reason": selected.get("rejected_reason"),
            },
        },
        grouped_uncertainty=grouped,
    )
    path = PROJECT_ROOT / "data/models/leaving_soon/calibration/amc_remaining_run_survival_v1_7d_2026_09.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_ready(payload), indent=2) + "\n", encoding="utf-8")
    load_calibration(path, base_model_checksum=v1_checksum)
    summary = {
        "method": method,
        "old_threshold": old_threshold,
        "new_threshold": new_threshold,
        "threshold_candidates": choices[method]["candidates"],
        "holdout": {name: {key: metrics.get(key) for key in ("n", "brier", "calibration_error", "pr_auc", "precision", "recall", "coverage", "log_loss")} for name, metrics in holdout.items()},
        "grouped": grouped,
        "per_run": per_run_metrics,
        "counts": payload["sample_counts"],
        "segments": _segments(scored_holdout, "score", new_threshold, baseline_threshold=old_threshold),
        "selection": selected,
        "reference_threshold": reference_threshold[method],
        "replay": _replay(all_scored, last_chance_threshold=new_threshold, leaving_soon_threshold=leaving_threshold, baseline_threshold=old_threshold),
        "mature_14d": _replay(
            [row for row in all_scored if row.get("label_14") is not None],
            last_chance_threshold=new_threshold,
            leaving_soon_threshold=leaving_threshold,
            baseline_threshold=old_threshold,
        ),
        "decision_set_disagreements_on_holdout": disagreements,
    }
    out = PROJECT_ROOT / "audit-output" / "leaving-soon-v2" / "calibration_fit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(json_ready(summary), indent=2) + "\n", encoding="utf-8")
    print(json.dumps(json_ready({"method": method, "threshold": new_threshold, "holdout_before": summary["holdout"]["baseline_platt"], "holdout_after": summary["holdout"][method], "counts": payload["sample_counts"]}), indent=2))
    return 0


def _segments(rows, score_key, threshold, baseline_threshold=None):
    from collections import defaultdict

    grouped = defaultdict(list)
    for row in rows:
        segments = segment_name_map(row.get("features"), str(row.get("run_type") or ""))
        for family, name in segments.items():
            if family in {"run_type", "footprint", "showtime_volume", "first_week", "weekday"}:
                grouped[(family, name)].append(row)
    table = []
    for (family, name), group in sorted(grouped.items()):
        y_true = [int(row["label"]) for row in group]
        scores = [float(row[score_key]) for row in group]
        metrics = probability_metrics(y_true, scores, threshold=threshold)
        entry = {
            "family": family,
            "segment": name,
            "n": metrics.get("n"),
            "precision": metrics.get("precision"),
            "recall": metrics.get("recall"),
            "base_rate": metrics.get("base_rate"),
            "n_predicted_positive": float(metrics.get("tp", 0) + metrics.get("fp", 0)),
        }
        if baseline_threshold is not None:
            base = probability_metrics(y_true, [float(row["p7"]) for row in group], threshold=baseline_threshold)
            entry["baseline_precision"] = base.get("precision")
            entry["baseline_recall"] = base.get("recall")
        table.append(entry)
    return table


def _bucket_flags(rows, *, p7_key, last_chance_threshold, leaving_soon_threshold):
    from collections import defaultdict

    from reel_seattle.analysis.leaving_soon_survival import classification_metrics

    daily = defaultdict(lambda: {"last_chance": 0, "leaving_soon_only": 0, "any": 0, "rows": 0})
    last_y, last_flag = [], []
    leave_y, leave_flag = [], []
    either_y, either_flag = [], []
    rerelease_last = 0
    last_total = 0
    for row in rows:
        p7 = float(row[p7_key])
        p14 = float(row["p14"])
        bucket = None
        if p7 >= last_chance_threshold:
            bucket = "last_chance"
        elif p14 >= leaving_soon_threshold:
            bucket = "leaving_soon"
        day = daily[row["observation_date"]]
        day["rows"] += 1
        if bucket == "last_chance":
            day["last_chance"] += 1
            day["any"] += 1
            last_total += 1
            if row.get("run_type") == "rerelease_anniversary":
                rerelease_last += 1
        elif bucket == "leaving_soon":
            day["leaving_soon_only"] += 1
            day["any"] += 1
        label7 = row.get("label")
        if label7 is not None:
            last_y.append(int(label7))
            last_flag.append(1.0 if bucket == "last_chance" else 0.0)
        label14 = row.get("label_14")
        if label14 is not None:
            leave_y.append(int(label14))
            leave_flag.append(1.0 if bucket == "leaving_soon" else 0.0)
            either_y.append(int(label14))
            either_flag.append(1.0 if bucket in {"last_chance", "leaving_soon"} else 0.0)
    def _score(y_true, flags):
        if not y_true:
            return {}
        return classification_metrics(y_true, flags, threshold=0.5)

    counts = [
        {"date": day, **stats}
        for day, stats in sorted(daily.items())
    ]
    return {
        "daily": counts,
        "last_chance": _score(last_y, last_flag),
        "leaving_soon": _score(leave_y, leave_flag),
        "any_public_flag_14d": _score(either_y, either_flag),
        "rerelease_share_of_last_chance": (rerelease_last / last_total) if last_total else 0.0,
        "mean_last_chance_per_day": sum(row["last_chance"] for row in counts) / len(counts) if counts else 0.0,
        "mean_any_per_day": sum(row["any"] for row in counts) / len(counts) if counts else 0.0,
    }


def _replay(rows, *, last_chance_threshold, leaving_soon_threshold, baseline_threshold):
    windows = {
        "fit": (date(2026, 9, 3), FIT_END),
        "threshold": (date(2026, 9, 12), THRESHOLD_END),
        "holdout": (date(2026, 9, 17), date(2099, 1, 1)),
    }
    report = {}
    for name, (start, end) in windows.items():
        subset = rows_between(rows, start, end)
        report[name] = {
            "before": _bucket_flags(
                subset,
                p7_key="p7",
                last_chance_threshold=baseline_threshold,
                leaving_soon_threshold=leaving_soon_threshold,
            ),
            "after": _bucket_flags(
                subset,
                p7_key="score",
                last_chance_threshold=last_chance_threshold,
                leaving_soon_threshold=leaving_soon_threshold,
            ),
        }
    return report


if __name__ == "__main__":
    raise SystemExit(main())
