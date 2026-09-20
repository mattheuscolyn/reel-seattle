"""Tests for presentation-safe Leaving Soon departure timing."""

from __future__ import annotations

from datetime import date

import pytest

from reel_seattle.analysis.leaving_soon_timing import (
    assert_no_raw_probability_leakage,
    bound_predicted_end_date,
    classify_departure_timing,
    model_median_end_date,
)
from reel_seattle.validate import validate_leaving_soon_current


def test_bounded_prediction_never_predates_max_show_date():
    raw = date(2026, 9, 21)
    booked = date(2026, 9, 23)
    assert bound_predicted_end_date(model_median_date=raw, max_show_date=booked) == booked
    assert bound_predicted_end_date(model_median_date=booked, max_show_date=raw) == booked


def test_model_median_omitted_when_beyond_horizon_or_missing():
    obs = date(2026, 9, 19)
    assert model_median_end_date(
        observation_date=obs, median_remaining_days=3, median_beyond_horizon=True
    ) is None
    assert model_median_end_date(
        observation_date=obs, median_remaining_days=None
    ) is None
    assert model_median_end_date(
        observation_date=obs, median_remaining_days=3
    ) == date(2026, 9, 22)


def test_high_tier_exact_date():
    timing = classify_departure_timing(
        observation_date=date(2026, 9, 19),
        leaving_soon_bucket="last_chance",
        median_remaining_days=3,
        max_show_date=date(2026, 9, 22),
        today=date(2026, 9, 19),
    )
    assert timing is not None
    assert timing.timing_confidence == "high"
    assert timing.timing_mode == "likely_around"
    assert timing.predicted_end_date == date(2026, 9, 22)
    assert timing.scope == "amc"


def test_moderate_tier_exact_date():
    timing = classify_departure_timing(
        observation_date=date(2026, 9, 19),
        leaving_soon_bucket="leaving_soon",
        median_remaining_days=6,
        max_show_date=date(2026, 9, 21),
        today=date(2026, 9, 19),
    )
    assert timing is not None
    assert timing.timing_confidence == "moderate"
    assert timing.timing_mode == "could_around"
    assert timing.predicted_end_date == date(2026, 9, 25)


def test_weak_rerelease_and_mid_footprint_downgrade():
    for weak in ("rerelease", "mid_footprint"):
        timing = classify_departure_timing(
            observation_date=date(2026, 9, 19),
            leaving_soon_bucket="last_chance",
            median_remaining_days=2,
            weak_segment=weak,
            max_show_date=date(2026, 9, 23),
            today=date(2026, 9, 19),
        )
        assert timing is not None
        assert timing.timing_confidence == "low"
        assert timing.timing_mode == "horizon_only"
        assert timing.predicted_end_date is None


def test_stale_prediction_suppresses_exact_date():
    timing = classify_departure_timing(
        observation_date=date(2026, 9, 10),
        leaving_soon_bucket="last_chance",
        median_remaining_days=2,
        max_show_date=date(2026, 9, 12),
        today=date(2026, 9, 19),
    )
    assert timing is not None
    assert timing.timing_confidence == "low"
    assert timing.predicted_end_date is None


def test_public_item_rejects_probability_leakage():
    with pytest.raises(AssertionError):
        assert_no_raw_probability_leakage({"film_key": "x", "p_end_within_7d": 0.9})


def test_schema_v1_2_accepts_timing_fields():
    artifact = {
        "schema_version": "1.2.0",
        "generated_at": "2026-09-19T03:11:08-07:00",
        "source": "amc",
        "model_version": "amc_remaining_run_survival_v1",
        "published": True,
        "skipped_reason": None,
        "window": {"start_date": "2026-09-19", "end_date": "2027-09-18"},
        "method": {
            "name": "amc_remaining_run_survival_v1",
            "description": "test",
            "evaluated_precision": 0.9,
            "evaluated_recall": 0.7,
            "evaluated_coverage": 0.7,
            "evaluation_note": "test",
        },
        "stats": {
            "candidate_film_count": 1,
            "flagged_film_count": 1,
            "last_chance_count": 1,
            "leaving_soon_count": 0,
        },
        "items": [
            {
                "film_key": "sinners",
                "film_title": "Sinners",
                "risk_level": "high",
                "reason": "test",
                "leaving_soon_bucket": "last_chance",
                "model_version": "amc_remaining_run_survival_v1",
                "source_film_id": "1",
                "run_id": "1#01",
                "run_type": "probable_normal_first_run",
                "sort_rank": 1,
                "visible_show_date_count": 1,
                "min_show_date": "2026-09-19",
                "max_show_date": "2026-09-19",
                "total_visible_showtimes": 2,
                "total_visible_theaters": 1,
                "theaters": [{"theater_id": "t1", "theater_name": "AMC"}],
                "show_dates": ["2026-09-19"],
                "has_primetime": True,
                "has_weekend_show": False,
                "poster_url": None,
                "runtime_min": 120,
                "prediction_as_of": "2026-09-19",
                "predicted_end_date": "2026-09-19",
                "timing_confidence": "high",
                "timing_mode": "likely_around",
                "prediction_scope": "amc",
            }
        ],
    }
    validate_leaving_soon_current(artifact)


def test_schema_v1_1_still_validates_without_timing():
    artifact = {
        "schema_version": "1.1.0",
        "generated_at": "2026-09-19T03:11:08-07:00",
        "source": "amc",
        "model_version": "amc_remaining_run_survival_v1",
        "published": True,
        "skipped_reason": None,
        "window": {"start_date": "2026-09-19", "end_date": "2027-09-18"},
        "method": {
            "name": "amc_remaining_run_survival_v1",
            "description": "test",
            "evaluated_precision": 0.9,
            "evaluated_recall": 0.7,
            "evaluated_coverage": 0.7,
            "evaluation_note": "test",
        },
        "stats": {
            "candidate_film_count": 1,
            "flagged_film_count": 1,
            "last_chance_count": 1,
            "leaving_soon_count": 0,
        },
        "items": [
            {
                "film_key": "sinners",
                "film_title": "Sinners",
                "risk_level": "high",
                "reason": "test",
                "leaving_soon_bucket": "last_chance",
                "model_version": "amc_remaining_run_survival_v1",
                "source_film_id": "1",
                "run_id": "1#01",
                "run_type": "probable_normal_first_run",
                "sort_rank": 1,
                "visible_show_date_count": 1,
                "min_show_date": "2026-09-19",
                "max_show_date": "2026-09-19",
                "total_visible_showtimes": 2,
                "total_visible_theaters": 1,
                "theaters": [{"theater_id": "t1", "theater_name": "AMC"}],
                "show_dates": ["2026-09-19"],
                "has_primetime": True,
                "has_weekend_show": False,
                "poster_url": None,
                "runtime_min": 120,
            }
        ],
    }
    validate_leaving_soon_current(artifact)
