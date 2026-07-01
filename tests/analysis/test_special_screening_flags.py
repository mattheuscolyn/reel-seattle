"""Tests for granular special-screening title flags."""

from __future__ import annotations

from reel_seattle.analysis.special_screening_flags import (
    assign_run_segment,
    classify_run_type,
    classify_special_screening_flags,
    flags_to_csv_fields,
    is_strict_event_like,
)


def test_sensory_friendly_flag():
    flags = classify_special_screening_flags("Superman: Sensory Friendly Screening")
    assert flags["sensory_friendly_like"] is True
    assert flags["probable_normal_first_run"] is False
    assert is_strict_event_like("Superman: Sensory Friendly Screening") is True


def test_anniversary_flag():
    flags = classify_special_screening_flags(
        "The Devil Wears Prada 20th Anniversary Double Feature"
    )
    assert flags["anniversary_like"] is True
    assert flags["double_feature_like"] is True
    assert flags["probable_normal_first_run"] is False


def test_family_holiday_grinch():
    flags = classify_special_screening_flags("Dr. Seuss' The Grinch")
    assert flags["family_holiday_like"] is True
    assert assign_run_segment("Dr. Seuss' The Grinch", anchor_month="2025-12") == (
        "holiday_family_rerelease"
    )
    assert classify_run_type("Dr. Seuss' The Grinch", anchor_month="2025-12") == (
        "family_holiday_title"
    )


def test_elf_family_holiday():
    flags = classify_special_screening_flags("Elf")
    assert flags["family_holiday_like"] is True


def test_anime_event_chainsaw_man():
    flags = classify_special_screening_flags("Chainsaw Man - The Movie: Reze Arc")
    assert flags["anime_event_like"] is True
    assert classify_run_type("Chainsaw Man - The Movie: Reze Arc") == (
        "anime_special_engagement"
    )


def test_awards_limited_hamnet():
    flags = classify_special_screening_flags("Hamnet")
    assert flags["awards_limited_like"] is True
    assert classify_run_type("Hamnet") == "awards_season_limited"


def test_opening_night_split_from_fan_event():
    flags = classify_special_screening_flags("Dune: Part Two Opening Night Fan Event")
    assert flags["opening_night_like"] is True
    assert flags["fan_event_like"] is True


def test_regular_title_probable_normal_first_run():
    flags = classify_special_screening_flags("Sinners")
    assert flags["probable_normal_first_run"] is True
    assert is_strict_event_like("Sinners") is False
    assert assign_run_segment("Sinners") == "normal_first_run"


def test_flags_to_csv_fields_includes_segment():
    fields = flags_to_csv_fields("Elf", anchor_date="2025-12-09")
    assert fields["run_segment"] == "holiday_family_rerelease"
    assert fields["flag_family_holiday_like"] == "true"
    assert fields["flag_probable_normal_first_run"] == "false"
