"""Tests for film variant / parent-title inference."""

from __future__ import annotations

from reel_seattle.analysis.film_variant_audit import (
    classify_screening_variant_type,
    group_title_records,
    infer_parent_display_title,
    infer_parent_film_key,
    is_likely_screening_variant,
)
from reel_seattle.analysis.film_variant_audit import TitleRecord


def test_infer_parent_from_sensory_friendly():
    title = "Supergirl: Sensory Friendly Screening"
    assert infer_parent_display_title(title) == "Supergirl"
    assert infer_parent_film_key(title) == "supergirl"
    assert classify_screening_variant_type(title) == "sensory_friendly"
    assert is_likely_screening_variant(title) is True


def test_infer_parent_from_early_access():
    title = "Supergirl Early Access"
    assert infer_parent_display_title(title) == "Supergirl"
    assert classify_screening_variant_type(title) == "early_access"


def test_infer_parent_from_opening_night_fan_event():
    title = "Supergirl IMAX Opening Night Fan Event"
    parent = infer_parent_display_title(title)
    assert parent == "Supergirl"
    assert is_likely_screening_variant(title) is True


def test_regular_title_not_variant():
    title = "Sinners"
    assert infer_parent_display_title(title) == "Sinners"
    assert is_likely_screening_variant(title) is False


def test_group_multiple_keys_under_parent():
    records = [
        TitleRecord(
            source_title="Supergirl",
            showtime_film_key="supergirl",
            parent_display_title="Supergirl",
            parent_film_key="supergirl",
            variant_type="none",
            is_variant=False,
        ),
        TitleRecord(
            source_title="Supergirl: Sensory Friendly Screening",
            showtime_film_key="supergirl-sensory-friendly-screening",
            parent_display_title="Supergirl",
            parent_film_key="supergirl",
            variant_type="sensory_friendly",
            is_variant=True,
        ),
    ]
    groups = group_title_records(records)
    assert len(groups) == 1
    assert groups[0].distinct_film_keys == 2
