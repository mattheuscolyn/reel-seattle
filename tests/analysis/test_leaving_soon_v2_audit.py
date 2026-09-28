"""Tests for Leaving Soon v2 audit helpers. No live sites and no production writes."""

from __future__ import annotations

from datetime import date

from reel_seattle.analysis.leaving_soon_survival import make_observation
from reel_seattle.analysis.leaving_soon_v2_audit import (
    candidate_split,
    choose_recommendation,
    error_class,
    error_table,
    is_mature,
    join_predictions,
    label_for_horizon,
    production_bucket,
    regime_for_date,
    score_binary,
)


AS_OF = date(2026, 9, 28)
T7 = 0.9
T14 = 0.8


def _prediction(**overrides):
    payload = {
        "eligible": True,
        "public_eligible": True,
        "observation_date": "2026-09-10",
        "run_id": "100#01",
        "source_film_id": "100",
        "title": "Kept Film",
        "run_type": "probable_normal_first_run",
        "p_end_within_3d": 0.2,
        "p_end_within_7d": 0.95,
        "p_end_within_14d": 0.96,
        "p_end_within_21d": 0.97,
        "median_remaining_days": 4,
        "median_beyond_horizon": False,
        "leaving_soon_bucket": "last_chance",
        "weak_segment": None,
    }
    payload.update(overrides)
    return payload


def _obs(**overrides):
    return make_observation(
        observation_date="2026-09-10",
        farthest_announced_show_date="2026-09-16",
        announced_horizon_days=6,
        historical_horizon_truncated=False,
        **overrides,
    )


def test_immature_predictions_are_excluded_from_labels():
    assert is_mature(date(2026, 9, 22), AS_OF, 7) is False
    assert is_mature(date(2026, 9, 21), AS_OF, 7) is True
    assert label_for_horizon(
        observation_date=date(2026, 9, 22),
        run_end=date(2026, 9, 23),
        as_of=AS_OF,
        horizon=7,
    ) is None
    assert label_for_horizon(
        observation_date=date(2026, 9, 10),
        run_end=date(2026, 9, 12),
        as_of=AS_OF,
        horizon=7,
    ) == 1


def test_join_uses_same_day_features_and_later_outcomes_only_as_labels():
    early = _obs()
    later = make_observation(
        observation_date="2026-09-20",
        run_id="100#01",
        announced_horizon_days=20,
        farthest_announced_show_date="2026-10-10",
    )
    joined = join_predictions(
        [{"skipped": False, "predictions": [_prediction()]}],
        observations_by_key={
            ("100#01", "2026-09-10"): early,
            ("100#01", "2026-09-20"): later,
        },
        run_ends={"100#01": date(2026, 9, 30)},
        as_of=AS_OF,
        last_chance_threshold=T7,
        leaving_soon_threshold=T14,
    )
    assert len(joined) == 1
    assert joined[0]["features"]["announced_horizon_days"] == 6
    assert joined[0]["max_show_date"] == "2026-09-16"
    assert joined[0]["run_end_date"] == "2026-09-30"
    assert joined[0]["labels"]["7"] == 0
    assert joined[0]["labels"]["21"] is None
    assert "remaining_days" not in joined[0]["features"]


def test_skipped_and_ineligible_predictions_are_not_joined():
    joined = join_predictions(
        [
            {"skipped": True, "predictions": [_prediction(run_id="skip#01")]},
            {"skipped": False, "predictions": [_prediction(eligible=False, run_id="no#01")]},
        ],
        observations_by_key={},
        run_ends={},
        as_of=AS_OF,
        last_chance_threshold=T7,
        leaving_soon_threshold=T14,
    )
    assert joined == []


def test_temporal_split_keeps_holdout_after_validation():
    rows = [
        make_observation(observation_date="2026-07-01", run_id="a#01"),
        make_observation(observation_date="2026-08-20", run_id="b#01"),
        make_observation(observation_date="2026-09-10", run_id="c#01"),
    ]
    bundle = candidate_split(rows)
    assert [row.run_id for row in bundle.train] == ["a#01"]
    assert [row.run_id for row in bundle.val] == ["b#01"]
    assert [row.run_id for row in bundle.test] == ["c#01"]
    assert max(row.observation_date for row in bundle.val) < min(row.observation_date for row in bundle.test)


def test_threshold_evaluation_reports_precision_and_coverage():
    metrics = score_binary([1, 1, 0, 0], [0.95, 0.2, 0.96, 0.1], threshold=0.9)
    assert metrics["tp"] == 1
    assert metrics["fp"] == 1
    assert metrics["fn"] == 1
    assert metrics["tn"] == 1
    assert metrics["precision"] == 0.5
    assert metrics["recall"] == 0.5
    assert metrics["specificity"] == 0.5
    assert metrics["coverage"] == 0.5
    assert metrics["n"] == 4


def test_false_positive_and_false_negative_classification():
    assert error_class(1, True) == "tp"
    assert error_class(0, True) == "fp"
    assert error_class(1, False) == "fn"
    assert error_class(0, False) == "tn"
    assert error_class(None, True) == "immature"
    assert production_bucket(0.95, 0.5, last_chance_threshold=0.9, leaving_soon_threshold=0.8) == "last_chance"
    assert production_bucket(0.2, 0.85, last_chance_threshold=0.9, leaving_soon_threshold=0.8) == "leaving_soon"
    rows = join_predictions(
        [{
            "predictions": [
                _prediction(p_end_within_7d=0.99, p_end_within_14d=0.99, title="False Alarm"),
                _prediction(
                    run_id="200#01",
                    source_film_id="200",
                    title="Missed Exit",
                    p_end_within_7d=0.1,
                    p_end_within_14d=0.2,
                    leaving_soon_bucket=None,
                ),
            ]
        }],
        observations_by_key={
            ("100#01", "2026-09-10"): _obs(run_id="100#01"),
            ("200#01", "2026-09-10"): _obs(run_id="200#01", product_id="200"),
        },
        run_ends={"100#01": date(2026, 9, 28), "200#01": date(2026, 9, 12)},
        as_of=AS_OF,
        last_chance_threshold=T7,
        leaving_soon_threshold=T14,
    )
    fps = error_table(rows, horizon=7, kind="fp")
    fns = error_table(rows, horizon=7, kind="fn")
    assert [row["title"] for row in fps] == ["False Alarm"]
    assert [row["title"] for row in fns] == ["Missed Exit"]
    assert "short_booking_but_run_continued" in fps[0]["patterns"]


def test_regime_tag_uses_september_3_boundary():
    assert regime_for_date(date(2026, 9, 2)) == "capped_pit"
    assert regime_for_date(date(2026, 9, 3)) == "all_announced_future"


def test_recommendation_requires_a_later_holdout_win():
    assert choose_recommendation(
        matured_7=10,
        matured_14=10,
        v1_pr_auc_7=0.9,
        candidate_pr_auc_7=0.99,
        v1_pr_auc_14=0.9,
        candidate_pr_auc_14=0.99,
        last_chance_precision=0.99,
        last_chance_recall=0.5,
        leaving_soon_precision=0.9,
    ) == "INSUFFICIENT_MATURE_DATA"
    assert choose_recommendation(
        matured_7=100,
        matured_14=80,
        v1_pr_auc_7=0.80,
        candidate_pr_auc_7=0.90,
        v1_pr_auc_14=0.70,
        candidate_pr_auc_14=0.85,
        last_chance_precision=0.7,
        last_chance_recall=0.4,
        leaving_soon_precision=0.7,
    ) == "ADVANCE_V2_CANDIDATE"
    assert choose_recommendation(
        matured_7=100,
        matured_14=80,
        v1_pr_auc_7=0.90,
        candidate_pr_auc_7=0.91,
        v1_pr_auc_14=0.85,
        candidate_pr_auc_14=0.84,
        last_chance_precision=0.70,
        last_chance_recall=0.4,
        leaving_soon_precision=0.90,
    ) == "RECALIBRATE_V1"
    assert choose_recommendation(
        matured_7=100,
        matured_14=80,
        v1_pr_auc_7=0.90,
        candidate_pr_auc_7=0.90,
        v1_pr_auc_14=0.85,
        candidate_pr_auc_14=0.85,
        last_chance_precision=0.94,
        last_chance_recall=0.40,
        leaving_soon_precision=0.90,
    ) == "KEEP_V1"
