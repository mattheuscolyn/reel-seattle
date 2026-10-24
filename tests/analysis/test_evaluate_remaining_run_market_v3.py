"""Matched market v3 evaluation contract."""
from datetime import date
from types import SimpleNamespace
import pytest

from scripts.evaluate_remaining_run_market_v3 import (
    FEATURES, RENAMES, matched_market_cohorts, evaluate,
)
from reel_seattle.analysis.remaining_run_market_features import THEATER_ONLY


def test_training_columns_are_pure_market_not_theater_ratios():
    assert all(key not in FEATURES for key in THEATER_ONLY)
    assert set(RENAMES.values()).issubset(FEATURES)
    assert "current_week_screenings" in FEATURES
    assert "screenings_per_show_date" in FEATURES
    assert "market_screenings" in FEATURES


def test_market_reconstruction_rejects_any_divergent_film_week_cohort():
    # An incomplete, synthetic bundle with no screens cannot silently be
    # called a matched historical experiment.
    example = {
        "film_id": "f", "title": "Film", "theater_id": "amc-a",
        "upcoming_friday": "2026-10-16", "observation_date": "2026-10-10",
        "visible_friday": "2026-10-09",
        "split_date": "2026-10-10", "snapshot_kind": "before_80",
        "current_week_screenings": 1.0, "market_screenings": 1.0,
        "market_theater_count": 1.0,
        "bucket": 0, "censored": 0,
    }
    bundle = SimpleNamespace(
        screenings=[], dataset_start=date(2026, 9, 3),
        theater_names={"amc-a": "A"}, market=[], as_of=date(2026, 10, 24),
    )
    with pytest.raises(RuntimeError, match="unmatched market cohorts"):
        matched_market_cohorts([example], bundle=bundle, statuses=[])
