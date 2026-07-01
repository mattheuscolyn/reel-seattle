"""Tests for granular special-screening title flags."""

from __future__ import annotations

from reel_seattle.analysis.special_screening_flags import (
    classify_special_screening_flags,
    is_strict_event_like,
)


def test_sensory_friendly_flag():
    flags = classify_special_screening_flags("Superman: Sensory Friendly Screening")
    assert flags["sensory_friendly_like"] is True
    assert is_strict_event_like("Superman: Sensory Friendly Screening") is True


def test_anniversary_flag():
    flags = classify_special_screening_flags(
        "The Devil Wears Prada 20th Anniversary Double Feature"
    )
    assert flags["anniversary_like"] is True
    assert flags["double_feature_like"] is True


def test_regular_title_not_strict_event():
    assert is_strict_event_like("Sinners") is False
