"""Synthetic checks for the pre-publication week forecast. No lifecycle load."""

from datetime import date, timedelta

from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    additional_programming_weeks,
    classify_outcome,
    distribution_from_hazards,
    first_reaching,
    last_snapshot_before,
)


def test_additional_weeks_stop_at_the_first_empty_week():
    friday = date(2026, 9, 11)
    shows = [friday, friday + timedelta(days=2), friday + timedelta(days=14)]
    assert additional_programming_weeks(shows, friday) == 1


def test_confirmed_final_week_and_three_plus_without_an_end():
    final = classify_outcome(weeks=0, confirmed=True, end_date=date(2026, 9, 10), as_of=date(2026, 10, 1))
    assert final["censored"] == 0 and final["bucket"] == 0
    longer = classify_outcome(weeks=4, confirmed=False, end_date=date(2026, 10, 20), as_of=date(2026, 10, 1))
    assert longer["censored"] == 0 and longer["bucket"] == 3
    unknown = classify_outcome(weeks=0, confirmed=False, end_date=date(2026, 9, 10), as_of=date(2026, 10, 1))
    assert unknown["censored"] == 1 and unknown["bucket"] is None


def test_prepublication_snapshot_is_the_day_before_the_schedule_fills():
    monday, tuesday, wednesday = date(2026, 9, 7), date(2026, 9, 8), date(2026, 9, 9)
    snaps = [monday, tuesday, wednesday]
    counts = {monday: 10, tuesday: 40, wednesday: 90}
    transition = first_reaching(snaps, counts, typical=100, level=0.80)
    assert transition == wednesday
    assert last_snapshot_before(snaps, transition) == tuesday


def test_hazard_distribution_matches_the_example_shape():
    probs = distribution_from_hazards([0.10, 50 / 90, 30 / 40])
    assert abs(sum(probs) - 1) < 1e-9
    assert abs(probs[0] - 0.10) < 1e-9
    assert abs(probs[1] - 0.50) < 1e-9
    assert abs(probs[2] - 0.30) < 1e-9
    assert abs(probs[3] - 0.10) < 1e-9
