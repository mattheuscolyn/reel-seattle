"""Evaluation ablation cannot change cohort labels or forecast identity."""
from datetime import date
from types import SimpleNamespace

import pytest

from scripts.evaluate_market_snapshot_sync import _ids_match, synchronize_market_rows

def show(film, theater, day, first):
    return SimpleNamespace(
        film_id=film, theater_id=theater,
        show_date=date.fromisoformat(day), first_snapshot=date.fromisoformat(first),
        canceled=False, removed_before_show=False, removed_at=None,
    )

def row():
    return {
        "film_id": "f", "theater_id": "amc-a",
        "upcoming_friday": "2026-10-16", "observation_date": "2026-10-10",
        "bucket": 1, "censored": 0, "label_tier": "strict",
        "market_screenings": 2.0, "market_theater_count": 2.0,
        "theater_count_wow": 0.0, "market_screenings_wow": 0.0,
        "current_week_screenings": 2.0,
    }

def test_synchronized_market_uses_asof_only_and_keeps_original_row_unchanged():
    original = row()
    screenings = [
        show("f", "amc-a", "2026-10-12", "2026-10-09"),
        show("f", "amc-b", "2026-10-12", "2026-10-13"),
    ]
    updated, changes = synchronize_market_rows([original], screenings, theater_ids=("amc-a", "amc-b"))
    assert updated[0]["current_week_screenings"] == 1
    assert updated[0]["market_theater_count"] == 1
    assert original["market_screenings"] == 2
    assert changes["features_modified_row_counts"]["market_screenings"] == 1
    _ids_match([original], [{**updated[0], "bucket": 1}])

def test_model_comparison_requires_identical_sample_identities_and_labels():
    base = row()
    _ids_match([base], [dict(base)])
    with pytest.raises(RuntimeError):
        _ids_match([base], [{**base, "observation_date": "2026-10-11"}])
    with pytest.raises(RuntimeError):
        _ids_match([base], [{**base, "bucket": 2}])
