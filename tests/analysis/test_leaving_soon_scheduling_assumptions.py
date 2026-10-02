"""Unit tests for scheduling-assumption audit helpers. No production writes."""

from __future__ import annotations

from datetime import date

from reel_seattle.analysis.amc_run_lifecycle import DEFAULT_GAP_THRESHOLD_DAYS
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    CENSORED_ACTIVE,
    CENSORED_FRONTIER,
    CONFIRMED,
    FUTURE_ONLY,
    Screening,
    assign_segment,
    build_engagements,
    classify_engagement_end,
    completeness_by_lag,
    dense_horizon,
    next_programming_friday,
    reconstruct_announcement,
    schedule_completeness,
    screening_removed_before_show,
    thursday_friday_transition,
    upcoming_friday,
    weekday_name,
    wilson_interval,
)


def _screening(**overrides) -> Screening:
    payload = dict(
        screening_id="s",
        film_id="100",
        title="Example",
        theater_id="amc-pacific-place-11",
        show_date=date(2026, 7, 10),
        minutes=19 * 60,
        first_snapshot=date(2026, 7, 1),
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


def test_weekday_and_programming_friday():
    thursday = date(2026, 10, 1)
    assert thursday.weekday() == 3
    assert weekday_name(thursday) == "Thursday"
    assert next_programming_friday(thursday) == date(2026, 10, 2)
    assert next_programming_friday(date(2026, 10, 2)) == date(2026, 10, 9)
    assert upcoming_friday(date(2026, 9, 28)) == date(2026, 10, 2)  # Monday
    assert upcoming_friday(date(2026, 10, 1)) == date(2026, 10, 2)  # Thursday
    assert upcoming_friday(thursday.replace(day=2)) == date(2026, 10, 2)  # Friday


def test_wilson_interval_contains_proportion():
    low, high = wilson_interval(80, 100)
    assert low < 0.80 < high
    assert wilson_interval(0, 0) is None


def test_segment_catalog_wins_and_disagreement_stays_ambiguous():
    assert assign_segment(
        catalog_category="anniversary_or_rerelease",
        title_run_type="normal_first_run",
        has_source_film_id=True,
    ) == ("rerelease", "catalog", "high")
    assert assign_segment(
        catalog_category="standard",
        title_run_type="anniversary_re_release",
        has_source_film_id=True,
    )[0] == "ambiguous_rerelease"
    assert assign_segment(
        catalog_category="standard",
        title_run_type="normal_first_run",
        has_source_film_id=True,
    ) == ("ordinary", "catalog", "high")
    assert assign_segment(
        catalog_category="unknown",
        title_run_type="anniversary_re_release",
        has_source_film_id=False,
    )[0] == "rerelease_title_only"


def test_removed_before_show_survives_past_status_override():
    show = date(2026, 7, 10)
    assert screening_removed_before_show(
        show_date=show,
        removed_at="2026-07-08",
        cancelled_at=None,
        last_snapshot=date(2026, 7, 8),
        current_status="past",
    )
    assert not screening_removed_before_show(
        show_date=show,
        removed_at=None,
        cancelled_at=None,
        last_snapshot=date(2026, 7, 10),
        current_status="past",
    )
    assert screening_removed_before_show(
        show_date=show,
        removed_at="2026-07-08",
        cancelled_at=None,
        last_snapshot=date(2026, 7, 8),
        current_status="no_longer_observed",
    )


def test_end_censoring_requires_a_published_horizon_past_the_last_show():
    assert (
        classify_engagement_end(
            last_scheduled=date(2026, 7, 16),
            last_occurred=date(2026, 7, 16),
            horizon=date(2026, 8, 1),
        )
        == CONFIRMED
    )
    assert (
        classify_engagement_end(
            last_scheduled=date(2026, 8, 6),
            last_occurred=date(2026, 7, 30),
            horizon=date(2026, 8, 20),
        )
        == CENSORED_ACTIVE
    )
    assert (
        classify_engagement_end(
            last_scheduled=date(2026, 8, 20),
            last_occurred=date(2026, 8, 20),
            horizon=date(2026, 8, 20),
        )
        == CENSORED_FRONTIER
    )
    assert (
        classify_engagement_end(
            last_scheduled=date(2026, 9, 1),
            last_occurred=None,
            horizon=date(2026, 9, 10),
        )
        == FUTURE_ONLY
    )


def test_dense_horizon_stops_at_a_hole_and_ignores_a_later_spike():
    counts = {}
    cursor = date(2026, 6, 1)
    while cursor <= date(2026, 6, 30):
        counts[cursor] = 10
        cursor = date.fromordinal(cursor.toordinal() + 1)
    for day in (date(2026, 7, 1), date(2026, 7, 2), date(2026, 7, 3)):
        counts[day] = 1
    counts[date(2026, 7, 10)] = 10
    assert dense_horizon(counts, baseline_end=date(2026, 7, 1)) == date(2026, 6, 30)


def test_announcement_reconstruction_counts_added_days_and_visible_share():
    scheduled = (
        _screening(screening_id="a", show_date=date(2026, 7, 10), first_snapshot=date(2026, 7, 5)),
        _screening(screening_id="b", show_date=date(2026, 7, 11), first_snapshot=date(2026, 7, 5)),
        _screening(screening_id="c", show_date=date(2026, 7, 18), first_snapshot=date(2026, 7, 12)),
    )
    report = reconstruct_announcement(
        scheduled,
        (),
        dataset_start=date(2026, 6, 1),
        snapshot_dates=(date(2026, 6, 1), date(2026, 7, 5), date(2026, 7, 12)),
    )
    assert report["announcement_observed"] is True
    assert report["left_truncated"] is False
    assert report["share_visible_at_first_observation"] == 2 / 3
    assert report["days_added"] == 7
    assert report["extended"] is True
    assert report["dates_added_count"] == 1


def test_announcement_is_left_truncated_on_the_first_snapshot():
    scheduled = (
        _screening(show_date=date(2026, 6, 3), first_snapshot=date(2026, 6, 1)),
    )
    report = reconstruct_announcement(
        scheduled,
        (),
        dataset_start=date(2026, 6, 1),
        snapshot_dates=(date(2026, 6, 1),),
    )
    assert report["left_truncated"] is True
    assert report["announcement_observed"] is False


def test_run_split_and_confirmed_end():
    early = _screening(screening_id="e", show_date=date(2026, 6, 18), first_snapshot=date(2026, 6, 10))
    late = _screening(screening_id="l", show_date=date(2026, 7, 16), first_snapshot=date(2026, 7, 1))
    engagements = build_engagements(
        [early, late],
        level="film_theater",
        gap_threshold_days=DEFAULT_GAP_THRESHOLD_DAYS,
        dataset_start=date(2026, 6, 1),
        snapshot_dates=[date(2026, 6, 1), date(2026, 6, 10), date(2026, 7, 1)],
        as_of=date(2026, 8, 1),
        horizons={"amc-pacific-place-11": date(2026, 8, 15)},
        friday_baseline={"amc-pacific-place-11": 20.0},
        theater_daily={
            ("amc-pacific-place-11", date(2026, 6, 19)): 30,
            ("amc-pacific-place-11", date(2026, 7, 17)): 30,
        },
    )
    assert len(engagements) == 2
    assert [item.end_status for item in engagements] == [CONFIRMED, CONFIRMED]
    assert engagements[0].sequence == 1
    assert engagements[1].sequence == 2
    assert engagements[0].next_friday_published is True


def test_thursday_friday_transition_accounts_for_departures_and_reductions():
    stats = thursday_friday_transition(
        thursday_counts={"A": 10, "B": 5},
        friday_counts={"A": 4, "C": 8},
    )
    assert stats["films_departing"] == 1
    assert stats["films_incoming"] == 1
    assert stats["films_continuing"] == 1
    assert stats["screenings_lost_departed_films"] == 5
    assert stats["screenings_lost_reduced_continuing"] == 6
    assert stats["incumbent_screenings_lost"] == 11
    assert stats["incoming_friday_screenings"] == 8
    assert stats["continuing_screenings_kept"] == 4
    assert stats["net_screening_change"] == 12 - 15


def test_schedule_completeness_and_lag():
    show = date(2026, 7, 10)
    rows = [
        _screening(screening_id="known", show_date=show, first_snapshot=date(2026, 7, 6)),
        _screening(screening_id="late", show_date=show, first_snapshot=date(2026, 7, 9)),
        _screening(
            screening_id="gone",
            show_date=show,
            first_snapshot=date(2026, 7, 1),
            removed_before_show=True,
        ),
    ]
    report = schedule_completeness(rows, observation_date=date(2026, 7, 7), show_date=show)
    assert report["eventual_screenings"] == 2
    assert report["known_screenings"] == 1
    assert report["completeness"] == 0.5
    lag = {row["days_before_showtime"]: row for row in completeness_by_lag(
        rows,
        dataset_start=date(2026, 6, 1),
        as_of=date(2026, 7, 11),
    )}
    assert lag[4]["completeness"] == 0.5  # July 6 is 4 days before July 10
    assert lag[1]["completeness"] == 1.0
