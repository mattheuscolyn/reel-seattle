"""Focused schedule-level tests for AMC run-ending evidence verification."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

from scripts.audit_leaving_soon_run_endings import ScheduleEvidence, _end_evidence, verify_distinct_runs


def show(film: str, day: date, *, theater="amc-a", seen=None):
    return SimpleNamespace(
        screening_id=f"{film}-{day.isoformat()}-{theater}",
        film_id=film,
        theater_id=theater,
        show_date=day,
        first_snapshot=seen or day - timedelta(days=2),
        canceled=False,
        removed_before_show=False,
        removed_at=None,
    )


def engagement(last, screenings, *, status="confirmed_complete", theater="amc-a", film="film-a"):
    return SimpleNamespace(
        film_id=film, title="Test Film", theater_id=theater, screenings=screenings,
        sequence=1, start_date=min(s.show_date for s in screenings),
        end_date=last, last_occurred=last, end_status=status,
    )


def row(bucket=0, censored=0, observation="2026-10-06", friday="2026-10-09"):
    return {
        "film_id": "film-a", "theater_id": "amc-a", "upcoming_friday": friday,
        "observation_date": observation, "bucket": bucket, "censored": censored,
        "market_bucket": bucket, "market_censored": censored,
    }


def after_end_schedule(week=date(2026, 10, 9), *, first_seen=date(2026, 10, 8)):
    # 2 films, 5 full days and ten showtimes visible on the same real snapshot.
    return [
        show(f"other-{index % 2}", week + timedelta(days=index // 2), seen=first_seen)
        for index in range(10)
    ]


def evidence(last=date(2026, 10, 7), *, extra=(), complete=None):
    film = show("film-a", last, seen=date(2026, 10, 5))
    dates = complete or [date(2026, 10, n) for n in range(5, 23)]
    all_shows = [film, *after_end_schedule(), *extra]
    return film, ScheduleEvidence(all_shows, dates)


def test_absent_week_is_supported_only_with_full_other_film_schedule():
    film, schedule = evidence()
    assessed = _end_evidence(
        row(), engagement(date(2026, 10, 7), [film]), schedule, set(),
        as_of=date(2026, 10, 23),
    )
    assert assessed["verdict"] == "supported_exit"
    assert assessed["last_observed_on"] == "2026-10-05"
    assert assessed["schedule"]["snapshot"] == "2026-10-09" or assessed["schedule"]["snapshot"] == "2026-10-08"
    assert assessed["schedule"]["days"] == 5
    assert assessed["schedule"]["other_films"] == 2


def test_missing_day_between_last_show_and_post_end_schedule_blocks_verification():
    film, schedule = evidence()
    result = _end_evidence(
        row(), engagement(date(2026, 10, 7), [film]),
        schedule, {date(2026, 10, 8)}, as_of=date(2026, 10, 23),
    )
    assert result["verdict"] == "unresolved_coverage_gap"
    assert result["bad_dates"] == ["2026-10-08"]


def test_partial_publication_does_not_confirm_end():
    film = show("film-a", date(2026, 10, 7), seen=date(2026, 10, 5))
    sparse = [show("other", date(2026, 10, 9), seen=date(2026, 10, 8))]
    schedule = ScheduleEvidence([film, *sparse], [date(2026, 10, n) for n in range(5, 23)])
    result = _end_evidence(
        row(), engagement(date(2026, 10, 7), [film]), schedule,
        set(), as_of=date(2026, 10, 23),
    )
    assert result["verdict"] == "unresolved_unpublished_week"


def test_same_run_reappearance_contradicts_an_early_exit_label():
    later = show("film-a", date(2026, 10, 10), seen=date(2026, 10, 8))
    film, schedule = evidence(extra=(later,))
    result = _end_evidence(
        row(), engagement(date(2026, 10, 7), [film, later]),
        schedule, set(), as_of=date(2026, 10, 23),
    )
    assert result["verdict"] == "contradicted_later_show"
    assert result["contradictions"] == ["2026-10-10"]


def test_right_censored_stays_unresolved_even_when_future_week_is_published():
    film, schedule = evidence()
    result = _end_evidence(
        row(bucket=None, censored=1),
        engagement(date(2026, 10, 7), [film]),
        schedule, set(), as_of=date(2026, 10, 23),
    )
    assert result["verdict"] == "unresolved_censored"


def test_resolved_end_with_unconfirmed_engagement_is_contested():
    film, schedule = evidence()
    result = _end_evidence(
        row(), engagement(date(2026, 10, 7), [film], status="right_censored_publication_frontier"),
        schedule, set(), as_of=date(2026, 10, 23),
    )
    assert result["verdict"] == "contradicted_bucket"


def test_three_plus_needs_a_witnessed_and_elapsed_show_not_just_an_eventual_listing():
    third_week = show("film-a", date(2026, 10, 23), seen=date(2026, 10, 20))
    film = show("film-a", date(2026, 10, 7), seen=date(2026, 10, 5))
    schedule = ScheduleEvidence(
        [film, third_week, *after_end_schedule()],
        [date(2026, 10, n) for n in range(5, 31)],
    )
    result = _end_evidence(
        row(bucket=3), engagement(date(2026, 10, 23), [film, third_week]),
        schedule, set(), as_of=date(2026, 10, 30),
    )
    assert result["verdict"] == "supported_three_plus"
    result_future = _end_evidence(
        row(bucket=3), engagement(date(2026, 10, 23), [film, third_week]),
        schedule, set(), as_of=date(2026, 10, 22),
    )
    assert result_future["verdict"] == "unresolved_future_show"


def test_market_requires_covered_schedule_at_all_engaged_theaters():
    other = show("film-a", date(2026, 10, 7), theater="amc-b", seen=date(2026, 10, 5))
    film, schedule = evidence(extra=(other,))
    market = engagement(date(2026, 10, 7), [film, other], theater="", film="film-a")
    result = _end_evidence(
        row(), market, schedule, set(), as_of=date(2026, 10, 23), market=True,
    )
    assert result["verdict"] == "unresolved_unpublished_week"
    assert result["theaters_checked"] == 2
    assert result["theaters_supported"] == 1


def test_distinct_run_report_does_not_duplicate_each_weekly_training_example():
    last = date(2026, 10, 7)
    film, evidence_table = evidence()
    theater = engagement(last, [film], theater="amc-a")
    market = engagement(last, [film], theater="")
    statuses = [
        SimpleNamespace(snapshot_date=date(2026, 10, day), completeness="complete")
        for day in range(5, 23)
    ]
    bundle = SimpleNamespace(
        screenings=[film, *after_end_schedule()],
        film_theater=[theater],
        market=[market],
        dataset_start=date(2026, 10, 5),
        as_of=date(2026, 10, 23),
    )
    report = verify_distinct_runs(bundle, statuses)
    assert report["summary"]["distinct_engagements"] == 2
    assert report["summary"]["by_grain"]["theater"]["runs"] == 1
    assert report["summary"]["by_grain"]["market"]["runs"] == 1
    assert report["summary"]["by_grain"]["theater"]["verdicts"]["supported_exit"] == 1
    assert report["summary"]["by_grain"]["market"]["verdicts"]["supported_exit"] == 1
