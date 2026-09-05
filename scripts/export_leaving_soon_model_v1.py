#!/usr/bin/env python3
"""Freeze the v1 remaining-run survival model into a committed JSON artifact.

Fits once on the pinned v1 train/validation cutoffs and label as-of date.
Daily production inference loads the JSON and does not refit.

Example:
  python scripts/export_leaving_soon_model_v1.py
"""

from __future__ import annotations

import argparse
import json
import sys
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
)
from reel_seattle.analysis.leaving_soon_frozen import (  # noqa: E402
    ACTIVE_MANIFEST_PATH,
    DEFAULT_MODEL_PATH,
    FEATURE_SCHEMA_VERSION,
    LABEL_AS_OF,
    MODEL_VERSION,
    TRAINING_CUTOFF,
    VALIDATION_CUTOFF,
    build_frozen_payload,
)
from reel_seattle.analysis.leaving_soon_survival import (  # noqa: E402
    DEFAULT_BIN_SIZE,
    DEFAULT_HORIZON_DAYS,
    DEFAULT_TRAIN_END,
    DEFAULT_VAL_END,
    RANDOM_SEED,
    DiscreteHazardModel,
    apply_platt,
    assert_temporal_split_integrity,
    binary_outcome,
    default_feature_columns,
    expand_rows,
    filter_primary_observations,
    n_bins,
    observation_from_mapping,
    platt_calibrator,
    platt_linear_export,
    split_by_observation_date,
    threshold_for_precision,
)
from reel_seattle.normalize import build_theater_index  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export frozen v1 Leaving Soon model artifact.")
    parser.add_argument("--logs-dir", type=Path, default=Path("data/daily_logs"))
    parser.add_argument("--history", type=Path, default=Path("data/history/showtimes_history.csv"))
    parser.add_argument("--theaters", type=Path, default=Path("data/theaters.json"))
    parser.add_argument("--catalog", type=Path, default=Path("data/source_catalog/amc_movie_products.json"))
    parser.add_argument("--output", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--manifest", type=Path, default=ACTIVE_MANIFEST_PATH)
    parser.add_argument("--label-as-of", default=LABEL_AS_OF)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    return parser.parse_args(argv)


def _load_registry(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_pinned_observations(args: argparse.Namespace, label_as_of: date):
    registry = _load_registry(args.theaters)
    theater_index = build_theater_index(registry)
    snapshots = [
        snap
        for snap in load_amc_snapshots(args.logs_dir)
        if snap.snapshot_date <= label_as_of
    ]
    facts = facts_from_snapshots(snapshots, theater_index=theater_index, snapshot_format="json")
    catalog = load_catalog_index(args.catalog) if args.catalog.is_file() else {}
    extra = []
    if args.history.is_file() and facts:
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
            for row in load_occurred_from_history(
                args.history, theater_index=theater_index, as_of=label_as_of
            )
            if row.product_id in product_ids
        ]
    result = build_lifecycle_audit(
        facts, extra_occurred=extra, catalog=catalog, as_of=label_as_of
    )
    return [observation_from_mapping(row.to_csv_dict()) for row in result.observations]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    label_as_of = date.fromisoformat(args.label_as_of)
    rows = load_pinned_observations(args, label_as_of)
    primary, _accounting = filter_primary_observations(rows)
    bundle = split_by_observation_date(
        primary, train_end=DEFAULT_TRAIN_END, val_end=DEFAULT_VAL_END
    )
    assert_temporal_split_integrity(bundle)
    bins = n_bins(DEFAULT_HORIZON_DAYS, DEFAULT_BIN_SIZE)
    columns = default_feature_columns(bins)
    train_periods = expand_rows(
        bundle.train,
        as_of=label_as_of,
        horizon_days=DEFAULT_HORIZON_DAYS,
        bin_size=DEFAULT_BIN_SIZE,
    )
    model = DiscreteHazardModel(
        columns=columns,
        horizon_days=DEFAULT_HORIZON_DAYS,
        bin_size=DEFAULT_BIN_SIZE,
        C=1.0,
        seed=args.seed,
        model_kind="logistic",
    ).fit(train_periods)

    val_p7 = []
    val_p14 = []
    y7 = []
    y14 = []
    s7 = []
    s14 = []
    for row in bundle.val:
        curve = model.predict_curve(row)
        p7 = float(curve.p_end_within[7])
        p14 = float(curve.p_end_within[14])
        val_p7.append(p7)
        val_p14.append(p14)
        lab7 = binary_outcome(row, horizon=7, as_of=label_as_of)
        lab14 = binary_outcome(row, horizon=14, as_of=label_as_of)
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
    y7_cal = []
    s7_cal = []
    y14_cal = []
    s14_cal = []
    for row, p7, p14 in zip(bundle.val, val_p7_cal, val_p14_cal):
        lab7 = binary_outcome(row, horizon=7, as_of=label_as_of)
        lab14 = binary_outcome(row, horizon=14, as_of=label_as_of)
        if lab7 is not None:
            y7_cal.append(lab7)
            s7_cal.append(p7)
        if lab14 is not None:
            y14_cal.append(lab14)
            s14_cal.append(p14)

    thresholds = {
        "7": {
            "min_precision_0.90": threshold_for_precision(y7_cal, s7_cal, min_precision=0.90),
            "min_precision_0.95": threshold_for_precision(y7_cal, s7_cal, min_precision=0.95),
        },
        "14": {
            "min_precision_0.90": threshold_for_precision(y14_cal, s14_cal, min_precision=0.90),
            "min_precision_0.95": threshold_for_precision(y14_cal, s14_cal, min_precision=0.95),
        },
    }

    try:
        import sklearn

        sklearn_version = str(sklearn.__version__)
    except ImportError:
        sklearn_version = "unknown"

    payload = build_frozen_payload(
        linear=model.linear_export(),
        platt_7d=platt_linear_export(cal7),
        platt_14d=platt_linear_export(cal14),
        thresholds=thresholds,
        metadata={
            "sklearn_version": sklearn_version,
            "train_rows": len(bundle.train),
            "val_rows": len(bundle.val),
            "train_person_periods": len(train_periods),
            "training_data_cutoff": TRAINING_CUTOFF,
            "validation_cutoff": VALIDATION_CUTOFF,
            "label_as_of": label_as_of.isoformat(),
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
            "held_out_backtest": {
                "end_within_7d_pr_auc": 0.925,
                "end_within_7d_brier": 0.084,
                "remaining_days_mae": 1.37,
                "concordance": 0.903,
                "val_90_precision_threshold_test_precision": 0.841,
                "val_95_precision_threshold_test_precision": 0.925,
                "weak_segments": ["rerelease", "mid_footprint"],
                "note": "Historical held-out backtest; production use does not mean the model is final.",
            },
        },
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps(
            {
                "active_model_version": MODEL_VERSION,
                "artifact": str(args.output).replace("\\", "/"),
                "promoted_at": label_as_of.isoformat(),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {args.output}")
    print(
        "7-day 95% threshold="
        f"{thresholds['7']['min_precision_0.95']['threshold']:.6f} "
        "14-day 90% threshold="
        f"{thresholds['14']['min_precision_0.90']['threshold']:.6f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
