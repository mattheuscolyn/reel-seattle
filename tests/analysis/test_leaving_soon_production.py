"""Production inference + frozen-artifact tests for Leaving Soon v1."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.analysis.leaving_soon_frozen import (
    FEATURE_SCHEMA_VERSION,
    FrozenHazardModel,
    FrozenModelError,
    MODEL_VERSION,
    artifact_checksum,
    build_frozen_payload,
    load_frozen_model,
    validate_frozen_payload,
)
from reel_seattle.analysis.leaving_soon_inference import (
    EVENT_RUN_TYPES,
    PUBLIC_ELIGIBLE_RUN_TYPES,
    RankedPrediction,
    assign_bucket,
    build_internal_snapshot,
    eligibility_for_row,
    inspect_amc_log,
    public_eligibility_for_row,
    rank_key,
    run_leaving_soon_inference,
    score_observations,
    snapshot_is_stale,
    write_internal_snapshot,
)
from reel_seattle.analysis.leaving_soon_prospective import (
    evaluate_matured_predictions,
    realized_remaining_days,
)
from reel_seattle.analysis.leaving_soon_survival import (
    DiscreteHazardModel,
    default_feature_columns,
    expand_rows,
    make_observation,
    n_bins,
    platt_calibrator,
    platt_linear_export,
)
from reel_seattle.emit.leaving_soon import publish_leaving_soon_current
from reel_seattle.normalize import DEFAULT_TIMEZONE

sklearn = pytest.importorskip("sklearn")
_ = sklearn


def _tiny_train_rows():
    return [
        make_observation(
            observation_date=date(2026, 7, 1) + timedelta(days=i),
            run_id=f"{i}#01",
            product_id=str(100 + i),
            remaining_days=0 if i % 2 == 0 else 8,
            theater_count=1 if i % 2 == 0 else 6,
            days_since_run_start=i,
            run_type="probable_normal_first_run",
        )
        for i in range(12)
    ]


def _tiny_frozen_and_sklearn():
    rows = _tiny_train_rows()
    horizon = 21
    bins = n_bins(horizon, 1)
    columns = default_feature_columns(bins)
    periods = expand_rows(rows, as_of=date(2026, 8, 1), horizon_days=horizon, bin_size=1)
    fitted = DiscreteHazardModel(
        columns=columns, horizon_days=horizon, bin_size=1, seed=42
    ).fit(periods)
    scores = [float(fitted.predict_curve(row).p_end_within[7]) for row in rows]
    labels = [1 if row.remaining_days < 7 else 0 for row in rows]
    cal = platt_calibrator(scores, labels)
    payload = build_frozen_payload(
        linear=fitted.linear_export(),
        platt_7d=platt_linear_export(cal),
        platt_14d=None,
        thresholds={
            "7": {
                "min_precision_0.90": {
                    "threshold": 0.6,
                    "precision": 0.9,
                    "recall": 0.5,
                    "coverage": 0.5,
                    "n_predicted_positive": 2,
                },
                "min_precision_0.95": {
                    "threshold": 0.8,
                    "precision": 0.95,
                    "recall": 0.4,
                    "coverage": 0.4,
                    "n_predicted_positive": 1,
                },
            },
            "14": {
                "min_precision_0.90": {
                    "threshold": 0.55,
                    "precision": 0.9,
                    "recall": 0.5,
                    "coverage": 0.5,
                    "n_predicted_positive": 2,
                },
                "min_precision_0.95": {
                    "threshold": 0.75,
                    "precision": 0.95,
                    "recall": 0.4,
                    "coverage": 0.4,
                    "n_predicted_positive": 1,
                },
            },
        },
        metadata={"sklearn_version": sklearn.__version__, "tiny_fixture": True},
    )
    return fitted, FrozenHazardModel(payload=payload), rows


def _write_amc_log(path: Path, *, collection_mode: str, restate_safe: bool, theaters_failed: int = 0):
    path.write_text(
        json.dumps(
            {
                "generated_at": "2026-09-03T06:00:00-07:00",
                "stats": {
                    "collection_mode": collection_mode,
                    "restate_safe": restate_safe,
                    "theaters_failed": theaters_failed,
                },
                "showtimes": [],
            }
        ),
        encoding="utf-8",
    )


def test_frozen_artifact_matches_sklearn_on_fixture_rows():
    fitted, frozen, rows = _tiny_frozen_and_sklearn()
    for row in rows[:4]:
        sklearn_curve = fitted.predict_curve(row)
        frozen_curve = frozen.predict_curve(row)
        assert frozen_curve.hazards == pytest.approx(sklearn_curve.hazards, rel=1e-9, abs=1e-9)
        assert frozen_curve.p_end_within[7] == pytest.approx(
            sklearn_curve.p_end_within[7], rel=1e-9, abs=1e-9
        )


def test_frozen_checksum_and_schema_mismatch_fail(tmp_path):
    _fitted, frozen, _rows = _tiny_frozen_and_sklearn()
    payload = dict(frozen.payload)
    path = tmp_path / "model.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    loaded = load_frozen_model(path)
    assert loaded.model_version == MODEL_VERSION
    assert loaded.feature_schema_version == FEATURE_SCHEMA_VERSION

    bad_checksum = dict(payload)
    bad_checksum["intercept"] = float(payload["intercept"]) + 0.01
    with pytest.raises(FrozenModelError, match="checksum"):
        validate_frozen_payload(bad_checksum)

    bad_version = dict(payload)
    bad_version["model_version"] = "amc_remaining_run_survival_v2"
    bad_version["checksum_sha256"] = artifact_checksum(bad_version)
    with pytest.raises(FrozenModelError, match="unsupported model_version"):
        validate_frozen_payload(bad_version)

    bad_schema = dict(payload)
    bad_schema["feature_schema_version"] = "9.9.9"
    bad_schema["checksum_sha256"] = artifact_checksum(bad_schema)
    with pytest.raises(FrozenModelError, match="feature schema"):
        validate_frozen_payload(bad_schema)


def test_assign_bucket_uses_frozen_thresholds():
    _fitted, frozen, _rows = _tiny_frozen_and_sklearn()
    last_chance = assign_bucket(
        {"p_end_within_7d": 0.85, "p_end_within_14d": 0.9}, frozen
    )
    leaving = assign_bucket(
        {"p_end_within_7d": 0.2, "p_end_within_14d": 0.7}, frozen
    )
    none = assign_bucket(
        {"p_end_within_7d": 0.1, "p_end_within_14d": 0.2}, frozen
    )
    assert last_chance == "last_chance"
    assert leaving == "leaving_soon"
    assert none is None
    assert frozen.threshold(horizon=7, min_precision="min_precision_0.95") == 0.8
    assert frozen.threshold(horizon=14, min_precision="min_precision_0.90") == 0.55


def test_specials_and_title_fallback_are_not_public():
    special = make_observation(run_type="concert_live_event", product_id="555")
    qa = make_observation(run_type="qa_fan_mystery", product_id="556")
    title_fallback = make_observation(identity_kind="title_key", product_id="title:sinners")
    missing_id = make_observation(product_id="title:unknown")
    first_run = make_observation(run_type="probable_normal_first_run", product_id="100")
    rerelease = make_observation(run_type="rerelease_anniversary", product_id="200")
    family = make_observation(run_type="family_holiday", product_id="300")

    assert public_eligibility_for_row(special) == (False, "special_presentation_excluded")
    assert public_eligibility_for_row(qa) == (False, "special_presentation_excluded")
    assert eligibility_for_row(title_fallback)[0] is False
    assert eligibility_for_row(missing_id)[0] is False
    assert public_eligibility_for_row(first_run)[0] is True
    assert public_eligibility_for_row(rerelease)[0] is True
    assert public_eligibility_for_row(family)[0] is True
    assert "concert_live_event" in EVENT_RUN_TYPES
    assert "probable_normal_first_run" in PUBLIC_ELIGIBLE_RUN_TYPES


def test_ranking_is_deterministic():
    high = RankedPrediction(
        observation=make_observation(title="Beta", product_id="2", run_id="2#01"),
        scores={"p_end_within_7d": 0.9, "p_end_within_14d": 0.95, "median_remaining_days": 2},
        eligible=True,
        ineligibility_reason=None,
        public_eligible=True,
        public_ineligibility_reason=None,
        bucket="last_chance",
        weak_segment=None,
    )
    mid = RankedPrediction(
        observation=make_observation(title="Alpha", product_id="1", run_id="1#01"),
        scores={"p_end_within_7d": 0.4, "p_end_within_14d": 0.8, "median_remaining_days": 4},
        eligible=True,
        ineligibility_reason=None,
        public_eligible=True,
        public_ineligibility_reason=None,
        bucket="leaving_soon",
        weak_segment=None,
    )
    ineligible = RankedPrediction(
        observation=make_observation(title="Zed", product_id="9", run_id="9#01"),
        scores={
            "p_end_within_7d": None,
            "p_end_within_14d": None,
            "median_remaining_days": None,
        },
        eligible=False,
        ineligibility_reason="title_fallback_identity",
        public_eligible=False,
        public_ineligibility_reason="title_fallback_identity",
        bucket=None,
        weak_segment=None,
    )
    ordered = sorted([mid, ineligible, high], key=rank_key)
    assert [item.observation.title for item in ordered] == ["Beta", "Alpha", "Zed"]


def test_source_quality_gates():
    assert snapshot_is_stale(date(2026, 9, 1), today=date(2026, 9, 4)) is True
    assert snapshot_is_stale(date(2026, 9, 3), today=date(2026, 9, 4)) is False


def test_inspect_amc_log_rejects_unsafe_snapshots(tmp_path):
    unsafe = tmp_path / "2026-09-03_amc.json"
    _write_amc_log(unsafe, collection_mode="all_announced_future", restate_safe=False)
    status = inspect_amc_log(unsafe)
    assert status.ok is False
    assert status.ineligibility_reason == "restate_safe_false"

    incomplete = tmp_path / "2026-09-04_amc.json"
    _write_amc_log(
        incomplete,
        collection_mode="all_announced_future",
        restate_safe=True,
        theaters_failed=2,
    )
    assert inspect_amc_log(incomplete).ineligibility_reason == "incomplete_theater_fetch"

    capped = tmp_path / "2026-09-02_amc.json"
    _write_amc_log(capped, collection_mode="visible_14d", restate_safe=True)
    assert inspect_amc_log(capped).ineligibility_reason == "collection_mode_not_all_announced_future"


def test_run_inference_skips_unsafe_logs_without_predictions(tmp_path):
    _fitted, frozen, _rows = _tiny_frozen_and_sklearn()
    logs = tmp_path / "logs"
    logs.mkdir()
    _write_amc_log(
        logs / "2026-09-03_amc.json",
        collection_mode="all_announced_future",
        restate_safe=False,
    )
    snapshot, items, status = run_leaving_soon_inference(
        model=frozen,
        logs_dir=logs,
        history_path=tmp_path / "missing.csv",
        theaters_path=Path("data/theaters.json"),
        catalog_path=tmp_path / "missing-catalog.json",
        today=date(2026, 9, 3),
        generated_at=datetime(2026, 9, 3, 12, 0, tzinfo=ZoneInfo(DEFAULT_TIMEZONE)),
    )
    assert status.ineligibility_reason == "restate_safe_false"
    assert snapshot["skipped"] is True
    assert snapshot["predictions"] == []
    assert items == []


def test_snapshot_is_date_stamped_and_idempotent(tmp_path):
    _fitted, frozen, rows = _tiny_frozen_and_sklearn()
    from reel_seattle.analysis.leaving_soon_inference import SourceSnapshotStatus

    status = SourceSnapshotStatus(
        path=tmp_path / "2026-09-03_amc.json",
        observation_date=date(2026, 9, 3),
        generated_at="2026-09-03T06:00:00-07:00",
        collection_mode="all_announced_future",
        restate_safe=True,
        theaters_failed=0,
        ok=True,
        ineligibility_reason=None,
    )
    items = score_observations(rows[:3], model=frozen, source=status)
    generated = datetime(2026, 9, 3, 12, 0, tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    first = build_internal_snapshot(items, source=status, generated_at=generated)
    second = build_internal_snapshot(items, source=status, generated_at=generated)
    assert first == second
    path = write_internal_snapshot(first, directory=tmp_path)
    assert path.name == "2026-09-03.json"
    dumped = json.dumps(first["predictions"][0])
    assert "event_observed" not in first["predictions"][0]
    assert "true_run_length_days" not in dumped


def test_publish_does_not_overwrite_public_artifact_when_unsafe(tmp_path):
    _fitted, frozen, _rows = _tiny_frozen_and_sklearn()
    public = tmp_path / "leaving_soon_current.json"
    public.write_text('{"schema_version":"1.0.0","kept":true}\n', encoding="utf-8")
    logs = tmp_path / "logs"
    logs.mkdir()
    _write_amc_log(
        logs / "2026-09-03_amc.json",
        collection_mode="all_announced_future",
        restate_safe=False,
    )
    result = publish_leaving_soon_current(
        {"window": {"start_date": "2026-09-03", "end_date": "2026-09-16"}, "showtimes": []},
        registry={"theaters": []},
        output_path=public,
        snapshot_dir=tmp_path / "snapshots",
        model=frozen,
        logs_dir=logs,
        history_path=tmp_path / "missing.csv",
        theaters_path=Path("data/theaters.json"),
        catalog_path=tmp_path / "missing-catalog.json",
        today=date(2026, 9, 3),
    )
    assert result["published"] is False
    assert result["skipped_reason"] == "restate_safe_false"
    assert json.loads(public.read_text(encoding="utf-8"))["kept"] is True


def test_prospective_eval_uses_later_run_ends_only():
    snapshots = [
        {
            "skipped": False,
            "predictions": [
                {
                    "eligible": True,
                    "run_id": "100#01",
                    "run_type": "probable_normal_first_run",
                    "observation_date": "2026-08-01",
                    "p_end_within_7d": 0.9,
                    "p_end_within_14d": 0.95,
                    "median_remaining_days": 2,
                },
                {
                    "eligible": True,
                    "run_id": "200#01",
                    "run_type": "rerelease_anniversary",
                    "observation_date": "2026-09-03",
                    "p_end_within_7d": 0.8,
                    "p_end_within_14d": 0.85,
                    "median_remaining_days": 3,
                },
            ],
        }
    ]
    report = evaluate_matured_predictions(
        snapshots,
        run_ends={"100#01": date(2026, 8, 3)},
        as_of=date(2026, 8, 20),
        last_chance_threshold=0.8,
        leaving_soon_threshold=0.55,
    )
    assert report["end_within_7d"]["n"] == 1.0
    assert report["immature_predictions"] >= 1
    assert realized_remaining_days(
        observation_date=date(2026, 8, 1),
        run_end_date=date(2026, 8, 3),
        as_of=date(2026, 8, 20),
    ) == 2
    # Recent prediction must not be scored before its window matures.
    assert "200#01" not in json.dumps(report["end_within_7d"])


def test_committed_v1_artifact_loads_and_exposes_frozen_thresholds():
    path = Path("data/models/leaving_soon/amc_remaining_run_survival_v1.json")
    if not path.is_file():
        pytest.skip("frozen v1 artifact not exported")
    model = load_frozen_model(path)
    assert model.model_version == MODEL_VERSION
    last_chance = model.threshold(horizon=7, min_precision="min_precision_0.95")
    leaving = model.threshold(horizon=14, min_precision="min_precision_0.90")
    assert 0.8 < last_chance < 0.95
    assert 0.7 < leaving < 0.9
    assert last_chance > leaving


def test_first_observation_and_rerelease_features_are_defined():
    first = make_observation(delta_theater_count=None, observations_since_run_start=1)
    shrinking = make_observation(delta_theater_count=-2, theater_count=2)
    rerelease = make_observation(run_type="rerelease_anniversary", theater_count=3)
    wide = make_observation(theater_count=8, days_since_run_start=20)
    _fitted, frozen, _rows = _tiny_frozen_and_sklearn()
    for row in (first, shrinking, rerelease, wide):
        scores = frozen.predict_calibrated(row)
        assert 0.0 <= scores["p_end_within_7d"] <= 1.0
        assert scores["p_end_within_3d"] is not None
