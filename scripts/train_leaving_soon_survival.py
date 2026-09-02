#!/usr/bin/env python3
"""Train and backtest the v1 AMC remaining-run discrete-time survival model.

Offline only. Does not write production Leaving Soon artifacts or UI.

Example:
  python scripts/train_leaving_soon_survival.py
  python scripts/train_leaving_soon_survival.py --observations-csv audit-output/amc-run-lifecycle/observations.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_footprint import load_amc_snapshots  # noqa: E402
from reel_seattle.analysis.amc_run_lifecycle import (  # noqa: E402
    build_lifecycle_audit,
    facts_from_snapshots,
    load_catalog_index,
    load_occurred_from_history,
    resolve_product_identity,
    write_observation_csv,
)
from reel_seattle.analysis.leaving_soon_survival import (  # noqa: E402
    DEFAULT_BIN_SIZE,
    DEFAULT_HORIZON_DAYS,
    DEFAULT_TRAIN_END,
    DEFAULT_VAL_END,
    RANDOM_SEED,
    SCHEMA_VERSION,
    ABLATION_SEQUENCE,
    AgeOnlyBaseline,
    DiscreteHazardModel,
    FootprintBaseline,
    SegmentKMBaseline,
    SurvivalObservation,
    apply_platt,
    assert_temporal_split_integrity,
    binary_outcome,
    classification_metrics,
    conformal_residual_interval,
    concordance_index,
    default_feature_columns,
    evaluate_binary_horizon,
    expand_rows,
    filter_primary_observations,
    follow_up_days,
    json_ready,
    load_observations_csv,
    low_footprint_not_first_week,
    n_bins,
    platt_calibrator,
    remaining_error_metrics,
    split_by_observation_date,
    summarize_cohort,
    threshold_for_precision,
)
from reel_seattle.normalize import build_theater_index  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train v1 remaining-run survival model.")
    parser.add_argument("--logs-dir", type=Path, default=Path("data/daily_logs"))
    parser.add_argument("--history", type=Path, default=Path("data/history/showtimes_history.csv"))
    parser.add_argument("--theaters", type=Path, default=Path("data/theaters.json"))
    parser.add_argument("--catalog", type=Path, default=Path("data/source_catalog/amc_movie_products.json"))
    parser.add_argument("--observations-csv", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=Path("audit-output/leaving-soon-survival-v1"))
    parser.add_argument("--skip-history", action="store_true")
    parser.add_argument("--horizon-days", type=int, default=DEFAULT_HORIZON_DAYS)
    parser.add_argument("--bin-size", type=int, default=DEFAULT_BIN_SIZE)
    parser.add_argument("--train-end", default=DEFAULT_TRAIN_END.isoformat())
    parser.add_argument("--val-end", default=DEFAULT_VAL_END.isoformat())
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    parser.add_argument("--skip-hgb", action="store_true")
    return parser.parse_args(argv)


def _load_registry(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def regenerate_observations(args: argparse.Namespace, output_dir: Path) -> list[SurvivalObservation]:
    registry = _load_registry(args.theaters)
    theater_index = build_theater_index(registry)
    snapshots = load_amc_snapshots(args.logs_dir)
    facts = facts_from_snapshots(snapshots, theater_index=theater_index, snapshot_format="json")
    catalog = load_catalog_index(args.catalog)
    as_of = max(fact.observation_date for fact in facts)
    extra = []
    if not args.skip_history and args.history.is_file():
        product_ids = {
            resolve_product_identity(
                source_film_id=fact.source_film_id,
                source_release_id=fact.source_release_id,
                title=fact.title,
                title_key=fact.title_key,
            ).product_id
            for fact in facts
        }
        extra = [
            row
            for row in load_occurred_from_history(args.history, theater_index=theater_index, as_of=as_of)
            if row.product_id in product_ids
        ]
    result = build_lifecycle_audit(facts, extra_occurred=extra, catalog=catalog)
    csv_path = output_dir / "observations.csv"
    write_observation_csv(csv_path, result.observations)
    return load_observations_csv(csv_path)


def _curves(model: DiscreteHazardModel, rows: list[SurvivalObservation]):
    return [model.predict_curve(row) for row in rows]


def _p_end(curves, horizon: int) -> list[float]:
    return [curve.p_end_within[horizon] for curve in curves]


def _medians(curves) -> list[float | None]:
    return [
        None if curve.median_beyond_horizon else curve.median_remaining_days
        for curve in curves
    ]


def _eval_block(
    name: str,
    rows: list[SurvivalObservation],
    *,
    p7: list[float],
    p14: list[float],
    medians: list[float | None],
    as_of: date,
    threshold_7: float = 0.5,
    threshold_14: float = 0.5,
) -> dict:
    times = []
    events = []
    preds = []
    for row, med in zip(rows, medians):
        follow = follow_up_days(row, as_of)
        times.append(float(follow))
        events.append(1 if row.event_observed else 0)
        preds.append(float(med if med is not None else args_horizon_fallback(as_of, row)))
    return {
        "name": name,
        "n": len(rows),
        "end_within_7": evaluate_binary_horizon(rows, p7, horizon=7, as_of=as_of, threshold=threshold_7),
        "end_within_14": evaluate_binary_horizon(rows, p14, horizon=14, as_of=as_of, threshold=threshold_14),
        "remaining_days_error": remaining_error_metrics(rows, medians),
        "concordance": concordance_index(times, events, preds),
    }


def args_horizon_fallback(as_of: date, row: SurvivalObservation) -> float:
    return float(DEFAULT_HORIZON_DAYS + 1)


def segment_metrics(rows, p7, p14, medians, as_of, key_fn) -> dict:
    grouped = defaultdict(list)
    for item in zip(rows, p7, p14, medians):
        grouped[key_fn(item[0])].append(item)
    out = {}
    for key, items in sorted(grouped.items()):
        part_rows = [i[0] for i in items]
        out[key] = {
            "n": len(part_rows),
            "end_within_7": evaluate_binary_horizon(
                part_rows, [i[1] for i in items], horizon=7, as_of=as_of
            ),
            "end_within_14": evaluate_binary_horizon(
                part_rows, [i[2] for i in items], horizon=14, as_of=as_of
            ),
            "remaining_days_error": remaining_error_metrics(part_rows, [i[3] for i in items]),
        }
    return out


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    train_end = date.fromisoformat(args.train_end)
    val_end = date.fromisoformat(args.val_end)

    if args.observations_csv and args.observations_csv.is_file():
        all_rows = load_observations_csv(args.observations_csv)
    else:
        all_rows = regenerate_observations(args, output_dir / "lifecycle")

    primary, accounting = filter_primary_observations(all_rows)
    as_of = max(row.observation_date for row in all_rows)
    bundle = split_by_observation_date(primary, train_end=train_end, val_end=val_end)
    assert_temporal_split_integrity(bundle)

    split_summary = {
        "as_of": as_of.isoformat(),
        "train_end": train_end.isoformat(),
        "val_end": val_end.isoformat(),
        "semantics": (
            "Rows assigned by observation_date. Train <= train_end < val <= val_end < test. "
            "The same run may appear in multiple splits at different times; later dates never "
            "enter an earlier split. Labels use complete retrospective follow-up; features at T do not."
        ),
        "all": summarize_cohort(all_rows),
        "primary": summarize_cohort(primary),
        "train": summarize_cohort(bundle.train),
        "val": summarize_cohort(bundle.val),
        "test": summarize_cohort(bundle.test),
        "run_overlap_train_val": len({r.run_id for r in bundle.train} & {r.run_id for r in bundle.val}),
        "run_overlap_val_test": len({r.run_id for r in bundle.val} & {r.run_id for r in bundle.test}),
        "filter_accounting": accounting,
    }

    age = AgeOnlyBaseline(horizon_days=args.horizon_days).fit(bundle.train)
    footprint = FootprintBaseline().fit(bundle.train)
    km = SegmentKMBaseline(horizon_days=args.horizon_days).fit(bundle.train, as_of=as_of)

    def baseline_pack(rows: list[SurvivalObservation]) -> dict:
        age_med = [age.predict_median(row) for row in rows]
        foot_med = [footprint.predict_median(row) for row in rows]
        km_med = [km.predict_median(row) for row in rows]
        km_p7 = [km.p_end_within(row, 7) for row in rows]
        km_p14 = [km.p_end_within(row, 14) for row in rows]
        age_p7 = [1.0 if (m is not None and m < 7) else 0.0 for m in age_med]
        age_p14 = [1.0 if (m is not None and m < 14) else 0.0 for m in age_med]
        foot_scores = [footprint.exit_score(row) for row in rows]
        # rank footprint scores into [0,1] within the split for PR metrics
        if foot_scores:
            lo, hi = min(foot_scores), max(foot_scores)
            span = (hi - lo) or 1.0
            foot_p = [(s - lo) / span for s in foot_scores]
        else:
            foot_p = []
        rule = [float(low_footprint_not_first_week(row)) for row in rows]
        return {
            "age_only": _eval_block("age_only", rows, p7=age_p7, p14=age_p14, medians=age_med, as_of=as_of),
            "footprint": _eval_block("footprint", rows, p7=foot_p, p14=foot_p, medians=foot_med, as_of=as_of),
            "kaplan_meier_segment": _eval_block(
                "kaplan_meier_segment", rows, p7=km_p7, p14=km_p14, medians=km_med, as_of=as_of
            ),
            "low_footprint_not_first_week": _eval_block(
                "low_footprint_not_first_week", rows, p7=rule, p14=rule, medians=age_med, as_of=as_of
            ),
        }

    bins = n_bins(args.horizon_days, args.bin_size)
    columns = default_feature_columns(bins)
    train_periods = expand_rows(
        bundle.train, as_of=as_of, horizon_days=args.horizon_days, bin_size=args.bin_size
    )
    primary_model = DiscreteHazardModel(
        columns=columns,
        horizon_days=args.horizon_days,
        bin_size=args.bin_size,
        C=1.0,
        seed=args.seed,
        model_kind="logistic",
    ).fit(train_periods)

    val_curves = _curves(primary_model, bundle.val)
    test_curves = _curves(primary_model, bundle.test)
    val_p7 = _p_end(val_curves, 7)
    val_p14 = _p_end(val_curves, 14)
    test_p7 = _p_end(test_curves, 7)
    test_p14 = _p_end(test_curves, 14)
    val_med = _medians(val_curves)
    test_med = _medians(test_curves)

    y7, s7 = [], []
    y14, s14 = [], []
    for row, p7, p14 in zip(bundle.val, val_p7, val_p14):
        lab7 = binary_outcome(row, horizon=7, as_of=as_of)
        lab14 = binary_outcome(row, horizon=14, as_of=as_of)
        if lab7 is not None:
            y7.append(lab7)
            s7.append(p7)
        if lab14 is not None:
            y14.append(lab14)
            s14.append(p14)
    cal7 = platt_calibrator(s7, y7)
    cal14 = platt_calibrator(s14, y14)
    val_p7_cal = apply_platt(cal7, val_p7)
    val_p14_cal = apply_platt(cal14, val_p14)
    test_p7_cal = apply_platt(cal7, test_p7)
    test_p14_cal = apply_platt(cal14, test_p14)

    op_table = {}
    for horizon, val_y, val_s, test_rows, test_s in (
        (7, y7, val_p7_cal, bundle.test, test_p7_cal),
        (14, y14, val_p14_cal, bundle.test, test_p14_cal),
    ):
        op_table[str(horizon)] = {}
        for min_p in (0.90, 0.95):
            chosen = threshold_for_precision(val_y, val_s, min_precision=min_p)
            test_y = []
            test_scores = []
            for row, score in zip(test_rows, test_s):
                label = binary_outcome(row, horizon=horizon, as_of=as_of)
                if label is None:
                    continue
                test_y.append(label)
                test_scores.append(score)
            applied = classification_metrics(test_y, test_scores, threshold=chosen["threshold"])
            op_table[str(horizon)][f"min_precision_{min_p:.2f}"] = {
                "chosen_on": "validation",
                "validation": chosen,
                "test": applied,
            }

    hgb_block = None
    if not args.skip_hgb:
        hgb = DiscreteHazardModel(
            columns=columns,
            horizon_days=args.horizon_days,
            bin_size=args.bin_size,
            seed=args.seed,
            model_kind="hgb",
        ).fit(train_periods)
        hgb_val = _curves(hgb, bundle.val)
        hgb_test = _curves(hgb, bundle.test)
        hgb_block = {
            "val": _eval_block(
                "hgb",
                bundle.val,
                p7=_p_end(hgb_val, 7),
                p14=_p_end(hgb_val, 14),
                medians=_medians(hgb_val),
                as_of=as_of,
            ),
            "test": _eval_block(
                "hgb",
                bundle.test,
                p7=_p_end(hgb_test, 7),
                p14=_p_end(hgb_test, 14),
                medians=_medians(hgb_test),
                as_of=as_of,
            ),
        }

    family_sets = {
        "age": ("age",),
        "age+footprint": ("age", "footprint"),
        "age+footprint+trajectory": ("age", "footprint", "trajectory"),
        "age+footprint+trajectory+run_type": ("age", "footprint", "trajectory", "run_type"),
        "age+footprint+trajectory+run_type+calendar": (
            "age",
            "footprint",
            "trajectory",
            "run_type",
            "calendar",
        ),
    }
    ablation = {}
    for name in ABLATION_SEQUENCE:
        cols = default_feature_columns(bins, families=family_sets[name])
        model = DiscreteHazardModel(
            columns=cols,
            horizon_days=args.horizon_days,
            bin_size=args.bin_size,
            seed=args.seed,
        ).fit(train_periods)
        curves = _curves(model, bundle.val)
        ablation[name] = _eval_block(
            name,
            bundle.val,
            p7=_p_end(curves, 7),
            p14=_p_end(curves, 14),
            medians=_medians(curves),
            as_of=as_of,
        )

    residuals = []
    for row, med in zip(bundle.val, val_med):
        if row.event_observed and row.remaining_days is not None and med is not None:
            residuals.append(med - row.remaining_days)
    conformal = conformal_residual_interval(residuals, alpha=0.2)
    test_uncensored = [
        (row, med)
        for row, med in zip(bundle.test, test_med)
        if row.event_observed and row.remaining_days is not None and med is not None
    ]
    half = conformal.get("half_width")
    if test_uncensored and half == half:  # not nan
        covered = sum(
            1
            for row, med in test_uncensored
            if abs(med - row.remaining_days) <= half
        )
        conformal["test_uncensored_coverage"] = covered / len(test_uncensored)
        conformal["test_uncensored_n"] = len(test_uncensored)
    else:
        conformal["test_uncensored_coverage"] = None

    horizon_groups = {
        "at_or_near_14day_ceiling": [row.historical_horizon_truncated or row.announced_horizon_days >= 13 for row in bundle.test],
        "below_ceiling": [not (row.historical_horizon_truncated or row.announced_horizon_days >= 13) for row in bundle.test],
    }
    truncation = {}
    for name, mask in horizon_groups.items():
        part = [row for row, keep in zip(bundle.test, mask) if keep]
        p7 = [p for p, keep in zip(test_p7_cal, mask) if keep]
        p14 = [p for p, keep in zip(test_p14_cal, mask) if keep]
        med = [m for m, keep in zip(test_med, mask) if keep]
        truncation[name] = _eval_block(name, part, p7=p7, p14=p14, medians=med, as_of=as_of)

    sample_rows = []
    for row, curve, p7, p14 in zip(bundle.test, test_curves, test_p7_cal, test_p14_cal):
        sample_rows.append(
            {
                "observation_date": row.observation_date.isoformat(),
                "run_id": row.run_id,
                "title": row.title,
                "run_type": row.run_type,
                "theater_count": row.theater_count,
                "days_since_run_start": row.days_since_run_start,
                "remaining_days": row.remaining_days,
                "event_observed": row.event_observed,
                "p_end_7": p7,
                "p_end_14": p14,
                "median_remaining_days": curve.median_remaining_days,
                "median_beyond_horizon": curve.median_beyond_horizon,
                "expected_remaining_days": curve.expected_remaining_days,
            }
        )

    primary_val = _eval_block(
        "logistic_raw", bundle.val, p7=val_p7, p14=val_p14, medians=val_med, as_of=as_of
    )
    primary_val_cal = _eval_block(
        "logistic_calibrated",
        bundle.val,
        p7=val_p7_cal,
        p14=val_p14_cal,
        medians=val_med,
        as_of=as_of,
    )
    primary_test = _eval_block(
        "logistic_calibrated",
        bundle.test,
        p7=test_p7_cal,
        p14=test_p14_cal,
        medians=test_med,
        as_of=as_of,
        threshold_7=op_table["7"]["min_precision_0.90"]["validation"]["threshold"] or 0.5,
        threshold_14=op_table["14"]["min_precision_0.90"]["validation"]["threshold"] or 0.5,
    )

    report = {
        "schema_version": SCHEMA_VERSION,
        "seed": args.seed,
        "horizon_days": args.horizon_days,
        "bin_size": args.bin_size,
        "formulation": (
            "Discrete-time logistic hazard. Person-period rows are calendar-day bins "
            f"0..{args.horizon_days} unless --bin-size>1. Survival S(d)=Π(1-h). "
            "Median remaining days is the first d with S(d)<=0.5; None if not reached."
        ),
        "split": split_summary,
        "baselines_val": baseline_pack(bundle.val),
        "baselines_test": baseline_pack(bundle.test),
        "primary_val_raw": primary_val,
        "primary_val_calibrated": primary_val_cal,
        "primary_test": primary_test,
        "hgb": hgb_block,
        "operating_points": op_table,
        "coefficients": primary_model.standardized_coefficients()[:40],
        "ablation_val": ablation,
        "stability_test_run_type": segment_metrics(
            bundle.test, test_p7_cal, test_p14_cal, test_med, as_of, lambda r: r.run_type_group
        ),
        "stability_test_age": segment_metrics(
            bundle.test,
            test_p7_cal,
            test_p14_cal,
            test_med,
            as_of,
            lambda r: "age_0_6" if r.days_since_run_start < 7 else "age_7_13" if r.days_since_run_start < 14 else "age_14_plus",
        ),
        "stability_test_footprint": segment_metrics(
            bundle.test,
            test_p7_cal,
            test_p14_cal,
            test_med,
            as_of,
            lambda r: "t1" if r.theater_count <= 1 else "t2" if r.theater_count == 2 else "t3_4" if r.theater_count <= 4 else "t5_plus",
        ),
        "stability_test_month": segment_metrics(
            bundle.test,
            test_p7_cal,
            test_p14_cal,
            test_med,
            as_of,
            lambda r: r.observation_date.strftime("%Y-%m"),
        ),
        "conformal": conformal,
        "truncation_sensitivity_test": truncation,
        "unavailable_features": [
            "network capacity share",
            "other-film slot competition",
            "historical-as-of catalog category",
            "true announced horizon beyond the old 14-day fetch",
        ],
        "train_person_periods": len(train_periods),
        "feature_columns": columns,
    }

    _write_json(output_dir / "split_summary.json", split_summary)
    _write_json(output_dir / "filter_accounting.json", accounting)
    _write_json(output_dir / "baseline_metrics.json", {"val": report["baselines_val"], "test": report["baselines_test"]})
    _write_json(output_dir / "primary_metrics.json", {
        "val_raw": primary_val,
        "val_calibrated": primary_val_cal,
        "test": primary_test,
    })
    _write_json(output_dir / "hgb_metrics.json", hgb_block)
    _write_json(output_dir / "operating_points.json", op_table)
    _write_json(output_dir / "coefficients.json", report["coefficients"])
    _write_json(output_dir / "ablation.json", ablation)
    _write_json(output_dir / "stability.json", {
        "run_type": report["stability_test_run_type"],
        "age": report["stability_test_age"],
        "footprint": report["stability_test_footprint"],
        "month": report["stability_test_month"],
    })
    _write_json(output_dir / "conformal.json", conformal)
    _write_json(output_dir / "truncation_sensitivity.json", truncation)
    _write_json(output_dir / "model_config.json", {
        "seed": args.seed,
        "horizon_days": args.horizon_days,
        "bin_size": args.bin_size,
        "C": 1.0,
        "model_kind": "logistic",
        "train_end": train_end.isoformat(),
        "val_end": val_end.isoformat(),
        "feature_columns": columns,
    })
    _write_json(output_dir / "experiment_report.json", report)
    sample_path = output_dir / "prediction_sample.csv"
    if sample_rows:
        import csv

        with sample_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(sample_rows[0].keys()))
            writer.writeheader()
            writer.writerows(sample_rows)

    print(f"Wrote survival experiment to {output_dir}")
    print(
        f"primary rows={len(primary)} train={len(bundle.train)} "
        f"val={len(bundle.val)} test={len(bundle.test)}"
    )
    print(
        "test 7-day precision/recall="
        f"{primary_test['end_within_7'].get('precision')} / "
        f"{primary_test['end_within_7'].get('recall')}"
    )
    return 0


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_ready(payload), indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
