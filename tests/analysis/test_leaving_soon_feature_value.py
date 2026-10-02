"""Point-in-time label and listing rules. No production writes."""

from __future__ import annotations

from datetime import date, timedelta

from reel_seattle.analysis.leaving_soon_feature_value import (
    completeness_estimate,
    label_departure,
    still_listed,
)
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import Screening


def _screening(**overrides) -> Screening:
    payload = dict(
        screening_id="s",
        film_id="1",
        title="Example",
        theater_id="amc-pacific-place-11",
        show_date=date(2026, 9, 10),
        minutes=19 * 60,
        first_snapshot=date(2026, 9, 1),
        removed_before_show=False,
        canceled=False,
        premium=False,
        catalog_category="standard",
        title_run_type="normal_first_run",
        segment="ordinary",
        segment_source="catalog",
        segment_confidence="high",
        identity_kind="source_film_id",
    )
    payload.update(overrides)
    return Screening(**payload)


def test_later_snapshot_is_not_listed_yet_and_a_future_removal_stays_listed():
    observation = date(2026, 9, 1)
    later = _screening(first_snapshot=date(2026, 9, 3))
    removed_later = _screening(removed_before_show=True, removed_at=date(2026, 9, 5))
    removed_already = _screening(show_date=date(2026, 9, 4), removed_before_show=True, removed_at=observation)
    assert still_listed(later, observation) is False
    assert still_listed(removed_later, observation) is True
    assert still_listed(removed_already, observation) is False


def test_negative_label_is_withheld_when_the_window_is_open_or_the_end_is_unconfirmed():
    observation = date(2026, 9, 1)
    as_of = date(2026, 9, 20)
    assert label_departure(end_date=date(2026, 9, 4), confirmed=True, observation=observation, horizon=7, as_of=as_of) == 1
    assert label_departure(end_date=date(2026, 9, 20), confirmed=True, observation=observation, horizon=7, as_of=as_of) == 0
    assert label_departure(end_date=date(2026, 9, 20), confirmed=False, observation=observation, horizon=7, as_of=as_of) == 0
    assert label_departure(end_date=date(2026, 9, 4), confirmed=False, observation=observation, horizon=7, as_of=as_of) is None
    assert label_departure(end_date=date(2026, 9, 20), confirmed=False, observation=observation, horizon=7, as_of=observation + timedelta(days=2)) is None


def test_completeness_uses_the_past_baseline_only():
    assert completeness_estimate(40, 80) == 0.5
    assert completeness_estimate(100, 80) == 1.0
    assert completeness_estimate(10, None) is None
    assert completeness_estimate(10, 0) is None
