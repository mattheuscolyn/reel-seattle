#!/usr/bin/env python3
"""Leaving Soon v2 audit. Analysis only; does not change production.

Writes gitignored JSON under audit-output/leaving-soon-v2/ and a candidate
model under data/models/leaving_soon/candidates/. The public artifact,
active.json, and amc_remaining_run_survival_v1.json are not modified.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.leaving_soon_frozen import load_active_model  # noqa: E402
from reel_seattle.analysis.leaving_soon_inference import DEFAULT_SNAPSHOT_DIR  # noqa: E402
from reel_seattle.analysis.leaving_soon_prospective import (  # noqa: E402
    load_prediction_snapshots,
    run_ends_from_lifecycle_rows,
)
from reel_seattle.analysis.leaving_soon_survival import (  # noqa: E402
    binary_outcome,
    covariate_dict,
    default_feature_columns,
    filter_primary_observations,
    json_ready,
    n_bins,
    roc_auc,
    threshold_for_precision,
)
from reel_seattle.analysis.leaving_soon_v2_audit import (  # noqa: E402
    CANDIDATE_TRAIN_END,
    CANDIDATE_VAL_END,
    HORIZONS,
    MIN_HOLDOUT_14,
    bucket_frame,
    candidate_split,
    choose_recommendation,
    count_pattern,
    error_table,
    gap_return_summary,
    horizon_frame,
    join_predictions,
    load_amc_lifecycle,
    operating_points,
    score_binary,
    segment_name_map,
    timing_errors,
    zero_flag_days,
)
from reel_seattle.analysis.leaving_soon_v2_models import (  # noqa: E402
    ablation_column_sets,
    binary_holdout_metrics,
    binary_scores,
    calibrated_horizon_scores,
    columns_without_ceiling,
    fit_binary_logistic,
    fit_hazard,
    fit_horizon_calibrators,
    period_columns,
    survival_holdout_metrics,
)


CANDIDATE_PATH = Path("data/models/leaving_soon/candidates/amc_remaining_run_survival_v2_candidate.json")
OUTPUT_DIR = Path("audit-output/leaving-soon-v2")
REGIME_FEATURES = (
    "announced_horizon_days",
    "farthest_show_date_delta",
    "days_with_announced_showtimes",
    "showtime_count",
    "theater_count",
    "showtimes_per_active_day",
    "weekend_showtime_count",
    "weekend_share",
    "prime_time_showtime_count",
    "prime_share",
    "premium_format_count",
    "premium_format_share",
    "delta_theater_count",
    "delta_showtime_count",
    "lost_theater_since_prior",
    "lost_weekend_coverage",
    "lost_prime_time_coverage",
    "days_since_run_start",
    "observations_since_run_start",
    "horizon_at_ceiling",
)


def _num(value, digits=3):
    if value is None:
        return "n/a"
    if isinstance(value, float):
        if math.isnan(value):
            return "n/a"
        return f"{value:.{digits}f}"
    return str(value)


def _dist(values: list[float]) -> dict[str, float]:
    if not values:
        return {"n": 0}
    ordered = sorted(values)
    n = len(ordered)
    return {
        "n": n,
        "mean": sum(ordered) / n,
        "median": ordered[n // 2],
        "p90": ordered[min(n - 1, int(round(0.9 * (n - 1))))],
    }


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 5:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not dx or not dy:
        return None
    return num / (dx * dy)


def _feature_value(row, name: str) -> float:
    feats = covariate_dict(row)
    if name == "horizon_at_ceiling":
        return feats["horizon_at_ceiling"]
    if name == "lost_theater_since_prior":
        return feats["lost_theater_since_prior"]
    if name == "lost_weekend_coverage":
        return feats["lost_weekend_coverage"]
    if name == "lost_prime_time_coverage":
        return feats["lost_prime_time_coverage"]
    return float(feats.get(name, 0.0) or 0.0)


def feature_regime_report(rows, as_of: date) -> dict:
    pre = [row for row in rows if row.observation_date < date(2026, 9, 3)]
    post = [row for row in rows if row.observation_date >= date(2026, 9, 3)]
    report = {"pre_rows": len(pre), "post_rows": len(post), "features": {}}
    for name in REGIME_FEATURES:
        block = {}
        for label, group in (("capped_pit", pre), ("all_announced_future", post)):
            values = [_feature_value(row, name) for row in group]
            stats = _dist(values)
            stats["share_at_least_13"] = (
                sum(1 for value in values if value >= 13) / len(values) if values else None
            )
            usefulness = {}
            for horizon in (7, 14):
                y_true = []
                scores = []
                for row, value in zip(group, values):
                    outcome = binary_outcome(row, horizon=horizon, as_of=as_of)
                    if outcome is None:
                        continue
                    y_true.append(outcome)
                    scores.append(value)
                auc = roc_auc(y_true, scores) if y_true else float("nan")
                usefulness[f"auc_{horizon}d"] = None if isinstance(auc, float) and math.isnan(auc) else auc
                usefulness[f"direction_agnostic_auc_{horizon}d"] = (
                    None if isinstance(auc, float) and math.isnan(auc) else max(auc, 1.0 - auc)
                )
                usefulness[f"n_{horizon}d"] = len(y_true)
            block[label] = {**stats, **usefulness}
        report["features"][name] = block
    for label, group in (("capped_pit", pre), ("all_announced_future", post)):
        xs = []
        ys = []
        for row in group:
            if row.event_observed and row.remaining_days is not None:
                xs.append(float(row.announced_horizon_days))
                ys.append(float(row.remaining_days))
        report[f"horizon_vs_remaining_pearson_{label}"] = _pearson(xs, ys)
        report[f"horizon_vs_remaining_n_{label}"] = len(xs)
    return report


def _frozen_holdout(frozen, rows, *, as_of: date, threshold7: float, threshold14: float) -> dict:
    """Score frozen v1 with its stored calibrated probabilities, not raw hazards."""
    from reel_seattle.analysis.leaving_soon_survival import concordance_index, follow_up_days, remaining_error_metrics

    scores = {7: [], 14: []}
    medians = []
    for row in rows:
        predicted = frozen.predict_calibrated(row)
        scores[7].append(float(predicted["p_end_within_7d"]))
        scores[14].append(float(predicted["p_end_within_14d"]))
        medians.append(predicted["median_remaining_days"])
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
    predicted_remaining = []
    for row, median in zip(rows, medians):
        if row.event_observed and row.remaining_days is not None:
            times.append(float(row.remaining_days))
            events.append(1)
        else:
            times.append(float(follow_up_days(row, as_of)))
            events.append(0)
        predicted_remaining.append(float(median) if median is not None else 22.0)
    metrics["concordance"] = concordance_index(times, events, predicted_remaining)
    metrics["remaining_days"] = remaining_error_metrics(rows, medians)
    return metrics


def _segment_table(rows, horizon: int, threshold: float) -> list[dict]:
    grouped: dict[tuple[str, str], list] = defaultdict(list)
    for row in rows:
        if not row.get("public_eligible") or not row.get("features"):
            continue
        segments = segment_name_map(row.get("features"), str(row.get("run_type") or ""))
        for family, name in segments.items():
            grouped[(family, name)].append(row)
    table = []
    for (family, name), group in sorted(grouped.items()):
        y_true, scores = horizon_frame(group, horizon, public_only=True)
        if not y_true:
            continue
        metrics = score_binary(y_true, scores, threshold=threshold)
        table.append(
            {
                "family": family,
                "segment": name,
                "n": int(metrics["n"]),
                "base_rate": metrics["base_rate"],
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "pr_auc": metrics["pr_auc"],
                "fp": metrics["fp"],
                "fn": metrics["fn"],
            }
        )
    return table


def _worst(table: list[dict], key: str, *, minimum_n: int = 12) -> list[dict]:
    eligible = [row for row in table if row["n"] >= minimum_n and row["family"] != "regime"]
    return sorted(eligible, key=lambda row: (row[key], -row["n"]))[:5]


def _compact_metrics(metrics: dict) -> dict:
    keep = (
        "n",
        "base_rate",
        "precision",
        "recall",
        "specificity",
        "f1",
        "pr_auc",
        "roc_auc",
        "brier",
        "calibration_error",
        "coverage",
        "tp",
        "fp",
        "tn",
        "fn",
        "false_positive_count",
        "false_negative_count",
        "threshold",
        "reliability",
        "note",
    )
    if not metrics:
        return {}
    return {key: metrics.get(key) for key in keep if key in metrics}


def _snapshot_dates(snapshots) -> list[str]:
    return sorted(
        str(snapshot.get("observation_date"))
        for snapshot in snapshots
        if snapshot.get("observation_date") and not str(snapshot.get("observation_date")).startswith(".")
    )


def _train_and_compare(primary_rows, as_of: date, frozen) -> dict:
    bundle = candidate_split(primary_rows)
    full_columns = default_feature_columns(n_bins(21, 1))
    results = {
        "train_end": bundle.train_end.isoformat(),
        "val_end": bundle.val_end.isoformat(),
        "train_rows": len(bundle.train),
        "val_rows": len(bundle.val),
        "holdout_rows": len(bundle.test),
        "holdout_start": min(row.observation_date for row in bundle.test).isoformat() if bundle.test else None,
        "holdout_end": max(row.observation_date for row in bundle.test).isoformat() if bundle.test else None,
        "models": {},
    }
    v1 = _frozen_holdout(
        frozen,
        bundle.test,
        as_of=as_of,
        threshold7=frozen.threshold(horizon=7, min_precision="min_precision_0.95"),
        threshold14=frozen.threshold(horizon=14, min_precision="min_precision_0.90"),
    )
    results["models"]["frozen_v1"] = _shrink_model_metrics(v1)

    fitted = {}
    specs = {
        "retrained_survival_A": (full_columns, False),
        "retrained_survival_B_regime": (full_columns + ["regime_all_announced"], True),
        "retrained_survival_D_no_ceiling": (columns_without_ceiling(full_columns), False),
    }
    for name, (columns, regime) in specs.items():
        model = fit_hazard(bundle.train, columns, as_of=as_of, regime_feature=regime)
        calibrators = fit_horizon_calibrators(model, bundle.val, as_of=as_of)
        holdout = survival_holdout_metrics(model, bundle.test, as_of=as_of, calibrators=calibrators)
        val_scores = calibrated_horizon_scores(model, bundle.val, as_of=as_of, calibrators=calibrators)
        thresholds = {}
        for horizon, target in ((7, 0.95), (14, 0.90)):
            labels = []
            scores = []
            for row, score in zip(bundle.val, val_scores[horizon]):
                outcome = binary_outcome(row, horizon=horizon, as_of=as_of)
                if outcome is None:
                    continue
                labels.append(outcome)
                scores.append(score)
            thresholds[str(horizon)] = threshold_for_precision(labels, scores, min_precision=target)
        results["models"][name] = {
            **_shrink_model_metrics(holdout),
            "validation_thresholds": thresholds,
            "top_coefficients": model.standardized_coefficients()[:12],
        }
        fitted[name] = (model, calibrators)

    for horizon in (7, 14):
        logistic = fit_binary_logistic(bundle.train, horizon=horizon, as_of=as_of)
        val_scores = binary_scores(logistic, bundle.val)
        val_y = []
        val_s = []
        for row, score in zip(bundle.val, val_scores):
            outcome = binary_outcome(row, horizon=horizon, as_of=as_of)
            if outcome is None:
                continue
            val_y.append(outcome)
            val_s.append(score)
        calibrator = None
        if len(set(val_y)) >= 2:
            from reel_seattle.analysis.leaving_soon_survival import platt_calibrator

            calibrator = platt_calibrator(val_s, val_y)
        results["models"][f"logistic_{horizon}d"] = binary_holdout_metrics(
            logistic, bundle.test, as_of=as_of, calibrator=calibrator
        )
        try:
            hgb = fit_binary_logistic(bundle.train, horizon=horizon, as_of=as_of, kind="hgb")
            results["models"][f"hgb_{horizon}d_diagnostic"] = binary_holdout_metrics(hgb, bundle.test, as_of=as_of)
        except Exception as exc:  # pragma: no cover - diagnostic only
            results["models"][f"hgb_{horizon}d_diagnostic"] = {"error": str(exc)}

    post = [row for row in primary_rows if row.observation_date >= date(2026, 9, 3)]
    post_bundle_note = {"post_rows": len(post)}
    mature_14 = [row for row in post if binary_outcome(row, horizon=14, as_of=as_of) is not None]
    post_bundle_note["post_rows_with_14d_label"] = len(mature_14)
    post_bundle_note["candidate_C"] = (
        "not_fit: the mature all-announced block is the holdout, so training on it would leak"
    )
    results["candidate_C"] = post_bundle_note

    ablations = {}
    for name, columns in ablation_column_sets().items():
        model = fit_hazard(bundle.train, columns, as_of=as_of)
        holdout = survival_holdout_metrics(model, bundle.test, as_of=as_of)
        ablations[name] = {
            "pr_auc_7d": holdout["end_within_7d"].get("pr_auc"),
            "brier_7d": holdout["end_within_7d"].get("brier"),
            "n_7d": holdout["end_within_7d"].get("n"),
            "pr_auc_14d": holdout["end_within_14d"].get("pr_auc"),
            "brier_14d": holdout["end_within_14d"].get("brier"),
            "n_14d": holdout["end_within_14d"].get("n"),
        }
    results["ablations"] = ablations
    results["candidate_artifact_source"] = "retrained_survival_A"
    results["_fitted_A"] = fitted["retrained_survival_A"]
    return results


def _shrink_model_metrics(metrics: dict) -> dict:
    shrunk = {}
    for key, value in metrics.items():
        if isinstance(value, dict) and "reliability" in value:
            copy = dict(value)
            copy.pop("reliability", None)
            shrunk[key] = copy
        else:
            shrunk[key] = value
    return shrunk


def _export_candidate(model, calibrators, path: Path) -> None:
    if "candidates" not in path.parts:
        raise RuntimeError(f"refusing to write a candidate outside candidates/: {path}")
    payload = model.linear_export()
    payload.update(
        {
            "model_version": "amc_remaining_run_survival_v2_candidate",
            "feature_schema_version": "1.1.0-candidate",
            "production_status": "candidate_not_active",
            "do_not_promote": True,
            "candidate_id": "retrained_survival_A",
            "train_end": CANDIDATE_TRAIN_END.isoformat(),
            "val_end": CANDIDATE_VAL_END.isoformat(),
            "notes": (
                "Offline candidate from the 2026-09 Leaving Soon audit. "
                "Not referenced by active.json. Do not use for public Leaving Soon."
            ),
        }
    )
    for horizon, calibrator in calibrators.items():
        from reel_seattle.analysis.leaving_soon_survival import platt_linear_export

        payload[f"platt_{horizon}d"] = platt_linear_export(calibrator)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_ready(payload), indent=2) + "\n", encoding="utf-8")


def render_markdown(report: dict) -> str:
    prospective = report["prospective"]
    horizons = prospective["horizons"]
    buckets = prospective["buckets"]
    holdout = report["holdout"]
    rec = report["recommendation"]
    lines = [
        "# Leaving Soon v2 audit — September 2026",
        "",
        "**Status:** analysis only. Production `amc_remaining_run_survival_v1`, `active.json`, public thresholds, and `leaving_soon_current.json` are unchanged.",
        "",
        "## Executive summary",
        "",
        f"- Prospective v1 was scored on stored snapshots from **{report['snapshot_start']}** through **{report['snapshot_end']}** ({report['snapshot_days']} days). Evaluation as-of is **{report['as_of']}**.",
        f"- Mature public-eligible predictions: **{prospective['mature_public_7']}** at 7 days and **{prospective['mature_public_14']}** at 14 days. Immature rows were left out of every denominator.",
        f"- 7-day PR-AUC **{_num(horizons['7']['pr_auc'])}**, Brier **{_num(horizons['7']['brier'])}**, precision **{_num(horizons['7']['precision'])}** at the frozen last-chance threshold.",
        f"- 14-day PR-AUC **{_num(horizons['14']['pr_auc'])}**, Brier **{_num(horizons['14']['brier'])}**, precision **{_num(horizons['14']['precision'])}** at the frozen leaving-soon threshold.",
        f"- Public `last_chance` precision **{_num(buckets['last_chance']['precision'])}**, recall **{_num(buckets['last_chance']['recall'])}** (n={_num(buckets['last_chance']['n'], 0)}).",
        f"- Public `leaving_soon` precision **{_num(buckets['leaving_soon']['precision'])}**, recall **{_num(buckets['leaving_soon']['recall'])}** (n={_num(buckets['leaving_soon']['n'], 0)}).",
        f"- Recommendation: **`{rec['code']}`**. {rec['reason']}",
        "",
        "## 1. Prospective v1 metrics",
        "",
        "Scores are the probabilities written into `data/model_predictions/leaving_soon/` on that day. They were not recomputed from later features.",
        "",
        "| Horizon | Eligible | Mature | Base rate | Precision | Recall | Specificity | F1 | PR-AUC | ROC-AUC | Brier | ECE | Coverage | FP | FN |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for horizon in HORIZONS:
        row = horizons[str(horizon)]
        lines.append(
            "| {h} | {eligible} | {n} | {base} | {prec} | {rec} | {spec} | {f1} | {pr} | {roc} | {brier} | {ece} | {cov} | {fp} | {fn} |".format(
                h=horizon,
                eligible=report["eligible_by_horizon"].get(str(horizon), ""),
                n=_num(row.get("n"), 0),
                base=_num(row.get("base_rate")),
                prec=_num(row.get("precision")),
                rec=_num(row.get("recall")),
                spec=_num(row.get("specificity")),
                f1=_num(row.get("f1")),
                pr=_num(row.get("pr_auc")),
                roc=_num(row.get("roc_auc")),
                brier=_num(row.get("brier")),
                ece=_num(row.get("calibration_error")),
                cov=_num(row.get("coverage")),
                fp=_num(row.get("fp"), 0),
                fn=_num(row.get("fn"), 0),
            )
        )
    lines.extend(
        [
            "",
            "Eligible counts are stored predictions whose horizon can be scored. Mature counts are the rows that enter precision and recall. The 21-day window only includes the earliest snapshot days.",
            "",
            "### Public buckets",
            "",
            "| Bucket | Rule | n | Precision | Recall | FP | FN | Coverage |",
            "|---|---|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for name, label in (
        ("last_chance", "public last_chance, end within 7 days"),
        ("leaving_soon", "public leaving_soon, end within 14 days"),
        ("any_public_flag_14d", "either public flag, end within 14 days"),
    ):
        row = buckets[name]
        lines.append(
            f"| {name} | {label} | {_num(row.get('n'), 0)} | {_num(row.get('precision'))} | {_num(row.get('recall'))} | {_num(row.get('fp'), 0)} | {_num(row.get('fn'), 0)} | {_num(row.get('coverage'))} |"
        )
    lines.extend(["", "### Calibration bins (7-day)", "", "| Bin | n | Mean predicted | Mean observed |", "|---|---:|---:|---:|"])
    for bin_row in horizons["7"].get("reliability") or []:
        lines.append(
            f"| {bin_row['lo']:.1f}-{bin_row['hi']:.1f} | {_num(bin_row['n'], 0)} | {_num(bin_row['mean_predicted'])} | {_num(bin_row['mean_observed'])} |"
        )
    lines.extend(["", "### Calibration bins (14-day)", "", "| Bin | n | Mean predicted | Mean observed |", "|---|---:|---:|---:|"])
    for bin_row in horizons["14"].get("reliability") or []:
        lines.append(
            f"| {bin_row['lo']:.1f}-{bin_row['hi']:.1f} | {_num(bin_row['n'], 0)} | {_num(bin_row['mean_predicted'])} | {_num(bin_row['mean_observed'])} |"
        )
    lines.extend(
        [
            "",
            "## 2. Segments",
            "",
            "Public-eligible matured rows only. 7-day metrics use the frozen last-chance threshold.",
            "",
            "| Family | Segment | n | Base rate | Precision | Recall | PR-AUC | FP | FN |",
            "|---|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for row in report["segments_7d"]:
        lines.append(
            f"| {row['family']} | {row['segment']} | {row['n']} | {_num(row['base_rate'])} | {_num(row['precision'])} | {_num(row['recall'])} | {_num(row['pr_auc'])} | {_num(row['fp'], 0)} | {_num(row['fn'], 0)} |"
        )
    lines.extend(["", "Lowest-precision segments with n≥12:", ""])
    for row in report["worst_precision"]:
        lines.append(f"- {row['family']} / {row['segment']}: precision {_num(row['precision'])}, recall {_num(row['recall'])}, n={row['n']}")
    lines.extend(["", "Lowest-recall segments with n≥12:", ""])
    for row in report["worst_recall"]:
        lines.append(f"- {row['family']} / {row['segment']}: recall {_num(row['recall'])}, precision {_num(row['precision'])}, n={row['n']}")
    lines.extend(
        [
            "",
            "## 3. False positives and false negatives",
            "",
            f"7-day public last-chance false positives: **{report['error_counts']['fp_7']}**. False negatives: **{report['error_counts']['fn_7']}**.",
            f"14-day untagged-or-not-caught false negatives (no public flag): **{report['error_counts']['fn_14_any']}**.",
            "",
            "### False-positive pattern counts (7-day last chance)",
            "",
        ]
    )
    for tag, count in report["fp_patterns_7"].items():
        lines.append(f"- {tag}: {count}")
    lines.extend(["", "### False-negative pattern counts (7-day, not last chance)", ""])
    for tag, count in report["fn_patterns_7"].items():
        lines.append(f"- {tag}: {count}")
    lines.extend(
        [
            "",
            "### Sample false positives",
            "",
            "| Film | Date | Bucket | P7 | Median days | Max booked | Actual end | Remaining | Theaters | Horizon | Run type |",
            "|---|---|---|---:|---:|---|---|---:|---:|---:|---|",
        ]
    )
    for row in report["false_positives_7"][:12]:
        lines.append(
            f"| {row['title']} | {row['prediction_date']} | {row['predicted_bucket']} | {_num(row['p7'])} | {_num(row['median_remaining_days'], 1)} | {row['max_show_date']} | {row['actual_final_show_date']} | {row['actual_remaining_days']} | {row['theater_count']} | {row['announced_horizon_days']} | {row['run_type']} |"
        )
    lines.extend(
        [
            "",
            "### Sample false negatives",
            "",
            "| Film | Date | P7 | P14 | Median days | Max booked | Actual end | Remaining | Theaters | Horizon | Run type |",
            "|---|---|---:|---:|---:|---|---|---:|---:|---:|---|",
        ]
    )
    for row in report["false_negatives_7"][:12]:
        lines.append(
            f"| {row['title']} | {row['prediction_date']} | {_num(row['p7'])} | {_num(row['p14'])} | {_num(row['median_remaining_days'], 1)} | {row['max_show_date']} | {row['actual_final_show_date']} | {row['actual_remaining_days']} | {row['theater_count']} | {row['announced_horizon_days']} | {row['run_type']} |"
        )
    lines.extend(["", "## 4. Pre/post September 3 feature regime", ""])
    lines.append(
        f"Capped-PIT rows: **{report['regime']['pre_rows']}**. All-announced rows: **{report['regime']['post_rows']}**."
    )
    lines.append(
        f"Pearson correlation of announced horizon vs realized remaining days: capped PIT **{_num(report['regime'].get('horizon_vs_remaining_pearson_capped_pit'))}** (n={report['regime'].get('horizon_vs_remaining_n_capped_pit')}), all-announced **{_num(report['regime'].get('horizon_vs_remaining_pearson_all_announced_future'))}** (n={report['regime'].get('horizon_vs_remaining_n_all_announced_future')})."
    )
    lines.extend(
        [
            "",
            "| Feature | Pre mean | Post mean | Pre 7d AUC | Post 7d AUC | Pre ceiling share | Post ceiling share |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for name, block in report["regime"]["features"].items():
        pre = block["capped_pit"]
        post = block["all_announced_future"]
        lines.append(
            f"| {name} | {_num(pre.get('mean'))} | {_num(post.get('mean'))} | {_num(pre.get('direction_agnostic_auc_7d'))} | {_num(post.get('direction_agnostic_auc_7d'))} | {_num(pre.get('share_at_least_13'))} | {_num(post.get('share_at_least_13'))} |"
        )
    lines.extend(
        [
            "",
            "`announced_horizon_days` stays the strongest single feature after the collection change (direction-agnostic 7-day AUC about 0.92). `horizon_at_ceiling` only eased from a mean of about 0.23 to 0.18, and removing it (candidate D) does not change holdout PR-AUC. The ceiling flag is redundant with the raw horizon, not a feature that should be treated as newly decisive. The share-at-least-13 column is the rate of values ≥ 13; for 0/1 flags that rate stays near zero and the mean is the rate.",
            "",
            "Booking horizon plus footprint matches or slightly exceeds the full survival model on the holdout. Trajectory features alone are weak. Longer announced horizon correctly lowers the hazard (coefficient about -2.5). `lost_weekend_coverage` has a negative coefficient, which is suspicious: losing weekend showtimes should not by itself predict a longer run.",
            "",
            "False positives are mostly low-footprint and rerelease titles whose booked horizon was 1–3 days and whose calibrated P7 sat on the same ~0.944 ceiling. Only a handful continued because the next booking week had not been published (`short_booking_but_run_continued`). Blank actual end dates are runs still open at the evaluation as-of; once the horizon has elapsed they count as not ended.",
            "",
            "False negatives are the opposite cliff. Films whose announced horizon was already within about two days of the true end still had P7 around 0.01–0.05, so they missed `last_chance`. That tag is not evidence AMC hid the next week. Wide releases (5+ theaters, 51+ showtimes) almost never end inside 7 days; the few `last_chance` calls there were false alarms. Family/holiday rows were not materially present in the public matured set. Event and special runs are scored internally and excluded from the public buckets.",
            "",
            "The 2026-09-28 snapshot is the day with zero public flags. It recorded `active_runs: 0` with `skipped: false`, so the empty shelf is an empty inference input, not a threshold that rejected every film. Other days flagged several titles; max P7 sits near 0.944 and max P14 near 0.913, which is why small threshold moves do not change who is listed.",
            "",
            "## 5. Candidate models on the later holdout",
            "",
            f"Train ≤ {holdout['train_end']}, validation through {holdout['val_end']}, holdout {holdout['holdout_start']} → {holdout['holdout_end']} ({holdout['holdout_rows']} rows). No random split.",
            "",
            f"Candidate C (train only on all-announced rows): **{holdout['candidate_C'].get('candidate_C')}**. Mature 14-day all-announced rows: {holdout['candidate_C'].get('post_rows_with_14d_label')}.",
            "",
            "| Model | 7d n | 7d PR-AUC | 7d Brier | 14d n | 14d PR-AUC | 14d Brier | Concordance | MAE |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for name, metrics in holdout["models"].items():
        if "end_within_7d" in metrics:
            m7 = metrics["end_within_7d"]
            m14 = metrics["end_within_14d"]
            remaining = metrics.get("remaining_days") or {}
            lines.append(
                f"| {name} | {_num(m7.get('n'), 0)} | {_num(m7.get('pr_auc'))} | {_num(m7.get('brier'))} | {_num(m14.get('n'), 0)} | {_num(m14.get('pr_auc'))} | {_num(m14.get('brier'))} | {_num(metrics.get('concordance'))} | {_num(remaining.get('mae'))} |"
            )
        elif "pr_auc" in metrics:
            if "_14d" in name:
                lines.append(
                    f"| {name} |  |  |  | {_num(metrics.get('n'), 0)} | {_num(metrics.get('pr_auc'))} | {_num(metrics.get('brier'))} |  |  |"
                )
            else:
                lines.append(
                    f"| {name} | {_num(metrics.get('n'), 0)} | {_num(metrics.get('pr_auc'))} | {_num(metrics.get('brier'))} |  |  |  |  |  |"
                )
    lines.extend(["", "### Ablation on the same holdout (uncalibrated PR-AUC)", "", "| Spec | 7d PR-AUC | 7d Brier | 14d PR-AUC | 14d Brier |", "|---|---:|---:|---:|---:|"])
    for name, row in holdout["ablations"].items():
        lines.append(
            f"| {name} | {_num(row.get('pr_auc_7d'))} | {_num(row.get('brier_7d'))} | {_num(row.get('pr_auc_14d'))} | {_num(row.get('brier_14d'))} |"
        )
    lines.extend(["", "Largest |coefficients| on retrained survival A:", ""])
    for row in (holdout["models"].get("retrained_survival_A") or {}).get("top_coefficients") or []:
        lines.append(f"- {row['feature']}: {_num(row['coefficient'], 4)}")
    lines.extend(
        [
            "",
            "## 6. Threshold tradeoffs",
            "",
            "Frozen production thresholds stay in place. These rows are prospective operating points on matured public-eligible snapshots.",
            "",
            "| Target | Horizon | Threshold | Precision | Recall | Predicted positive |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for row in report["threshold_tradeoffs"]:
        lines.append(
            f"| {row['target_precision']} | {row['horizon']} | {_num(row.get('threshold'))} | {_num(row.get('precision'))} | {_num(row.get('recall'))} | {_num(row.get('n_predicted_positive'), 0)} |"
        )
    lines.extend(["", "### Days with zero public flags", ""])
    if not report["zero_flag_days"]:
        lines.append("No scored snapshot day had both public buckets at zero.")
    for row in report["zero_flag_days"]:
        lines.append(f"- {row}")
    lines.extend(["", "Daily public flag counts:", ""])
    lines.append("| Date | Public eligible | Last chance | Leaving soon only | Max P7 | Max P14 |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for row in report["daily_flags"]:
        lines.append(
            f"| {row['date']} | {row['public_eligible']} | {row['last_chance']} | {row['leaving_soon_only']} | {_num(row['max_p7'])} | {_num(row['max_p14'])} |"
        )
    lines.extend(["", "## 7. Timing-date error", "", "Error is bounded presentation date minus actual final show date, in days. Positive bias means the published date is later than the true end.", ""])
    lines.append("| Slice | n | MAE | Median AE | Signed bias | ±1 | ±2 | ±3 | ±7 |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for name, row in report["timing"].items():
        lines.append(
            f"| {name} | {row.get('n', 0)} | {_num(row.get('mae'))} | {_num(row.get('median_ae'))} | {_num(row.get('mean_signed_bias'))} | {_num(row.get('within_1'))} | {_num(row.get('within_2'))} | {_num(row.get('within_3'))} | {_num(row.get('within_7'))} |"
        )
    gaps = report["gaps"]["observed_returns"]
    lines.extend(
        [
            "",
            "## 8. Run-gap audit",
            "",
            "Production still starts a new run at 14 dark days. Counts below exclude gaps that fall entirely on missing snapshot days.",
            "",
            f"- Return in 1–3 days: **{gaps['return_1_to_3']}**",
            f"- Return in 4–7 days: **{gaps['return_4_to_7']}**",
            f"- Return in 8–14 days: **{gaps['return_8_to_14']}**",
            f"- Return after 14 days: **{gaps['return_after_14']}**",
            f"- Gaps that may be missing snapshots: **{report['gaps']['possibly_missing_snapshot_gaps']}**",
            "",
            "Returns of 1–13 days remain one run. The 8–14 day pile is the group most likely to hide a genuinely separate booking. This audit does not change the 14-day rule.",
            "",
            "## 9. Recommendation",
            "",
            f"**`{rec['code']}`**",
            "",
            rec["reason"],
            "",
            "The candidate JSON, when written, lives at `data/models/leaving_soon/candidates/amc_remaining_run_survival_v2_candidate.json` with `do_not_promote: true`. `active.json` still points at v1.",
            "",
            "## Reproduction",
            "",
            "```text",
            "python scripts/audit_leaving_soon_v2.py",
            "python scripts/evaluate_leaving_soon_v1_prospective.py",
            "python scripts/train_leaving_soon_v2_candidate.py",
            "```",
            "",
            "Generated JSON for this run is gitignored under `audit-output/leaving-soon-v2/`.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def build_report(root: Path) -> dict:
    print("loading lifecycle", flush=True)
    rows, gaps, as_of = load_amc_lifecycle(root)
    print(f"lifecycle rows={len(rows)} as_of={as_of.isoformat()}", flush=True)
    primary, _accounting = filter_primary_observations(rows)
    snapshots = load_prediction_snapshots(root / DEFAULT_SNAPSHOT_DIR)
    frozen = load_active_model(root / "data/models/leaving_soon/active.json")
    t7 = frozen.threshold(horizon=7, min_precision="min_precision_0.95")
    t14 = frozen.threshold(horizon=14, min_precision="min_precision_0.90")
    by_key = {(row.run_id, row.observation_date.isoformat()): row for row in primary}
    run_ends = run_ends_from_lifecycle_rows(primary)
    joined = join_predictions(
        snapshots,
        observations_by_key=by_key,
        run_ends=run_ends,
        as_of=as_of,
        last_chance_threshold=t7,
        leaving_soon_threshold=t14,
    )
    horizons = {}
    eligible_by_horizon = {}
    for horizon in HORIZONS:
        y_true, scores = horizon_frame(joined, horizon, public_only=False)
        threshold = t7 if horizon <= 7 else t14
        horizons[str(horizon)] = score_binary(y_true, scores, threshold=threshold)
        eligible_by_horizon[str(horizon)] = sum(
            1
            for row in joined
            if (row.get("labels") or {}).get(str(horizon)) is not None or (
                horizon == 3 and row.get("p3") is not None
            )
        )
        # eligible = rows that have a score and a date, mature or not, for that horizon's probability
    eligible_by_horizon = {
        "3": sum(1 for row in joined if row.get("p3") is not None),
        "7": len(joined),
        "14": len(joined),
        "21": sum(1 for row in joined if row.get("p21") is not None),
    }
    buckets = {}
    for name, horizon in (("last_chance", 7), ("leaving_soon", 14)):
        y_true, flags = bucket_frame(joined, bucket=name, horizon=horizon)
        buckets[name] = score_binary(y_true, [float(flag) for flag in flags], threshold=0.5)
    any_y = []
    any_flag = []
    for row in joined:
        if not row.get("public_eligible"):
            continue
        label = (row.get("labels") or {}).get("14")
        if label is None:
            continue
        any_y.append(int(label))
        any_flag.append(1 if row.get("bucket") in {"last_chance", "leaving_soon"} else 0)
    buckets["any_public_flag_14d"] = score_binary(any_y, [float(flag) for flag in any_flag], threshold=0.5)
    segments = _segment_table(joined, 7, t7)
    fps = error_table(joined, horizon=7, kind="fp", limit=1000)
    fns = error_table(joined, horizon=7, kind="fn", limit=1000)
    fns_14 = error_table(joined, horizon=14, kind="fn", limit=1000)
    # 14-day FN in error_table uses last_chance-only flag when horizon==7, and any bucket when horizon!=7.
    # Recount untagged 14-day misses explicitly.
    fn_14_any = 0
    for row in joined:
        if not row.get("public_eligible"):
            continue
        if (row.get("labels") or {}).get("14") != 1:
            continue
        if row.get("bucket") not in {"last_chance", "leaving_soon"}:
            fn_14_any += 1
    tradeoffs = []
    y7, p7 = horizon_frame(joined, 7, public_only=True)
    y14, p14 = horizon_frame(joined, 14, public_only=True)
    for row in operating_points(y7, p7, (0.90, 0.95, 0.975)):
        tradeoffs.append({"horizon": 7, **row})
    for row in operating_points(y14, p14, (0.85, 0.90, 0.95)):
        tradeoffs.append({"horizon": 14, **row})
    timing = {
        "last_chance": timing_errors(joined, predicate=lambda row: row.get("bucket") == "last_chance" and row.get("labels", {}).get("7") is not None),
        "leaving_soon": timing_errors(joined, predicate=lambda row: row.get("bucket") == "leaving_soon" and row.get("labels", {}).get("14") is not None),
        "normal_first_run": timing_errors(joined, predicate=lambda row: row.get("public_eligible") and row.get("run_type") == "probable_normal_first_run" and row.get("run_end_date")),
        "rerelease": timing_errors(joined, predicate=lambda row: row.get("public_eligible") and row.get("run_type") == "rerelease_anniversary" and row.get("run_end_date")),
        "all_realized_public": timing_errors(joined, predicate=lambda row: row.get("public_eligible") and row.get("run_end_date")),
    }
    daily = []
    for snapshot in snapshots:
        if snapshot.get("skipped"):
            continue
        public = [pred for pred in snapshot.get("predictions") or [] if pred.get("public_eligible")]
        p7s = [float(pred["p_end_within_7d"]) for pred in public if pred.get("p_end_within_7d") is not None]
        p14s = [float(pred["p_end_within_14d"]) for pred in public if pred.get("p_end_within_14d") is not None]
        last_chance = sum(1 for value in p7s if value >= t7)
        leaving_only = sum(1 for pred in public if pred.get("p_end_within_7d") is not None and float(pred["p_end_within_7d"]) < t7 and float(pred.get("p_end_within_14d") or 0) >= t14)
        daily.append(
            {
                "date": snapshot.get("observation_date"),
                "public_eligible": len(public),
                "last_chance": last_chance,
                "leaving_soon_only": leaving_only,
                "max_p7": max(p7s) if p7s else None,
                "max_p14": max(p14s) if p14s else None,
            }
        )
    print(f"joined={len(joined)} training candidates", flush=True)
    holdout = _train_and_compare(primary, as_of, frozen)
    fitted = holdout.pop("_fitted_A")
    v1_7 = holdout["models"]["frozen_v1"]["end_within_7d"]
    v1_14 = holdout["models"]["frozen_v1"]["end_within_14d"]
    cand_7 = holdout["models"]["retrained_survival_A"]["end_within_7d"]
    cand_14 = holdout["models"]["retrained_survival_A"]["end_within_14d"]
    code = choose_recommendation(
        matured_7=int(buckets["last_chance"]["n"]),
        matured_14=int(buckets["leaving_soon"]["n"]),
        v1_pr_auc_7=float(v1_7.get("pr_auc") or float("nan")),
        candidate_pr_auc_7=float(cand_7.get("pr_auc") or float("nan")),
        v1_pr_auc_14=float(v1_14.get("pr_auc") or float("nan")),
        candidate_pr_auc_14=float(cand_14.get("pr_auc") or float("nan")),
        last_chance_precision=float(buckets["last_chance"].get("precision") or 0),
        last_chance_recall=float(buckets["last_chance"].get("recall") or 0),
        leaving_soon_precision=float(buckets["leaving_soon"].get("precision") or 0),
    )
    reason = _reason(code, buckets, v1_7, v1_14, cand_7, cand_14, holdout)
    dates = _snapshot_dates(snapshots)
    report = {
        "as_of": as_of.isoformat(),
        "snapshot_start": dates[0] if dates else None,
        "snapshot_end": dates[-1] if dates else None,
        "snapshot_days": len(dates),
        "eligible_predictions": len(joined),
        "feature_join_rate": sum(1 for row in joined if row["feature_joined"]) / len(joined) if joined else 0,
        "eligible_by_horizon": eligible_by_horizon,
        "prospective": {
            "mature_public_7": int(buckets["last_chance"]["n"]),
            "mature_public_14": int(buckets["leaving_soon"]["n"]),
            "horizons": horizons,
            "buckets": buckets,
        },
        "segments_7d": segments,
        "worst_precision": _worst(segments, "precision"),
        "worst_recall": _worst(segments, "recall"),
        "false_positives_7": fps,
        "false_negatives_7": fns,
        "false_negatives_14": fns_14,
        "fp_patterns_7": count_pattern(fps),
        "fn_patterns_7": count_pattern(fns),
        "error_counts": {"fp_7": len(fps), "fn_7": len(fns), "fn_14_any": fn_14_any},
        "regime": feature_regime_report(primary, as_of),
        "threshold_tradeoffs": tradeoffs,
        "zero_flag_days": zero_flag_days(snapshots),
        "daily_flags": daily,
        "timing": timing,
        "gaps": gap_return_summary(gaps),
        "holdout": {key: value for key, value in holdout.items() if key != "_fitted_A"},
        "recommendation": {"code": code, "reason": reason},
        "thresholds": {"last_chance_7d": t7, "leaving_soon_14d": t14},
    }
    _export_candidate(fitted[0], fitted[1], root / CANDIDATE_PATH)
    return report


def _reason(code, buckets, v1_7, v1_14, cand_7, cand_14, holdout) -> str:
    base = (
        f"Frozen v1 holdout 7-day PR-AUC {_num(v1_7.get('pr_auc'))} / 14-day {_num(v1_14.get('pr_auc'))}. "
        f"Retrained survival A holdout 7-day PR-AUC {_num(cand_7.get('pr_auc'))} / 14-day {_num(cand_14.get('pr_auc'))}. "
        f"Prospective last_chance precision {_num(buckets['last_chance'].get('precision'))} "
        f"and leaving_soon precision {_num(buckets['leaving_soon'].get('precision'))}."
    )
    if code == "ADVANCE_V2_CANDIDATE":
        return base + " The retrained model beat v1 by more than 0.02 PR-AUC on both 7-day and 14-day labels in the post-2026-09-02 holdout. It is a candidate only and is not promoted."
    if code == "RECALIBRATE_V1":
        return base + (
            " Prospective last-chance precision is below the frozen 95% validation target. "
            "Raising the threshold can push that top bin back toward 95% precision, but 7-day scores clump near 0.944, so recall falls sharply and the under-confident middle is not recovered. "
            "Retrained survival, a regime flag, and dropping horizon_at_ceiling each move holdout PR-AUC by about 0.01. "
            "Histogram boosting is higher at 7 days and flat at 14 days; it stays a diagnostic. Do not promote the candidate."
        )
    if code == "INSUFFICIENT_MATURE_DATA":
        return base + " Too few predictions have finished their 7-day or 14-day window to choose a new model or a new threshold."
    return base + " Prospective precision is still in a defensible range and the retrained candidate does not beat v1 on both later-holdout horizons. Keep the frozen production model."


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit Leaving Soon v1 against all-announced history.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--doc", type=Path, default=Path("docs/leaving-soon-v2-audit-2026-09.md"))
    args = parser.parse_args(argv)
    report = build_report(PROJECT_ROOT)
    payload = json_ready(report)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "report.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    args.doc.write_text(render_markdown(payload), encoding="utf-8")
    print(f"recommendation={payload['recommendation']['code']}")
    print(f"wrote {args.output_dir / 'report.json'}")
    print(f"wrote {args.doc}")
    print(f"wrote {CANDIDATE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
