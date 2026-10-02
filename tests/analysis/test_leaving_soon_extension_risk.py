"""Synthetic checks for extension labels. These do not load the lifecycle."""

from datetime import date
from types import SimpleNamespace

from reel_seattle.analysis.leaving_soon_extension_risk import classify_listed_end, _later_kept_shows


def test_show_added_after_observation_is_an_extension():
    listed = date(2026, 9, 10)
    result = classify_listed_end(
        listed_final=listed,
        observation=date(2026, 9, 3),
        later_shows=[(date(2026, 9, 12), date(2026, 9, 8))],
        confirmed=False,
        as_of=date(2026, 10, 1),
    )
    assert result is not None
    assert result["extended"] == 1
    assert result["extension_magnitude_days"] == 2
    assert result["extension_first_observed"] == "2026-09-08"
    assert result["extension_published_before_listed_end"] == 1
    assert result["extension_timing_day"] == -2
    assert result["later_final_date_moves"] == 1


def test_confirmed_end_with_no_later_show_is_genuine():
    result = classify_listed_end(
        listed_final=date(2026, 9, 8),
        observation=date(2026, 9, 7),
        later_shows=[],
        confirmed=True,
        as_of=date(2026, 10, 1),
    )
    assert result is not None
    assert result["extended"] == 0
    assert result["extension_magnitude_days"] == 0


def test_unconfirmed_end_with_no_later_show_is_censored():
    result = classify_listed_end(
        listed_final=date(2026, 9, 8),
        observation=date(2026, 9, 7),
        later_shows=[],
        confirmed=False,
        as_of=date(2026, 10, 1),
    )
    assert result is None


def test_show_after_d_already_listed_is_not_a_population_row():
    result = classify_listed_end(
        listed_final=date(2026, 9, 8),
        observation=date(2026, 9, 7),
        later_shows=[(date(2026, 9, 10), date(2026, 9, 7))],
        confirmed=False,
        as_of=date(2026, 10, 1),
    )
    assert result is None


def test_removed_show_is_not_an_extension_and_a_later_kept_show_is():
    engagement = SimpleNamespace(
        screenings=(
            SimpleNamespace(
                canceled=False,
                removed_before_show=False,
                show_date=date(2026, 9, 18),
                first_snapshot=date(2026, 9, 16),
            ),
        )
    )
    # A show withdrawn before it played lives on removed_screenings, not here.
    # A show past a 14-day gap lives on a different engagement and is not passed in.
    shows = _later_kept_shows(engagement, date(2026, 9, 10))
    assert shows == [(date(2026, 9, 18), date(2026, 9, 16))]
    result = classify_listed_end(
        listed_final=date(2026, 9, 10),
        observation=date(2026, 9, 8),
        later_shows=shows,
        confirmed=False,
        as_of=date(2026, 10, 1),
    )
    assert result is not None
    assert result["extended"] == 1
    assert result["extension_published_before_listed_end"] == 0
    assert result["extension_published_after_listed_end"] == 1
