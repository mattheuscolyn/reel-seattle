"""Tests for the corrected Fri–Thu run-outcome labels and evidence tiers."""
from datetime import date, timedelta
from types import SimpleNamespace

from scripts.reconstruct_remaining_run_labels import (
    calendar_remaining_weeks, eligible_legacy_days, reconstruct_one,
    reconstruct_rows, uncovered_days,
)
from scripts.audit_leaving_soon_run_endings import ScheduleEvidence
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    additional_programming_weeks,
)

def show(film, show_date, *, theater="amc-a", first=None):
    return SimpleNamespace(
        screening_id=f"{film}|{theater}|{show_date}",
        film_id=film, theater_id=theater, show_date=show_date,
        first_snapshot=first or show_date - timedelta(days=2),
        removed_before_show=False, canceled=False, removed_at=None,
    )

def ending(*, last=date(2026, 10, 3), screenings=None, status="confirmed_complete"):
    screenings = screenings or [show("f", date(2026, 9, 20)), show("f", last)]
    return SimpleNamespace(
        film_id="f", theater_id="amc-a", title="Film", screenings=screenings,
        start_date=min(s.show_date for s in screenings),
        end_date=last, last_occurred=last, end_status=status, sequence=1,
    )

def other_films(week=date(2026, 10, 9), *, first=date(2026, 10, 7)):
    return [
        show(f"other-{idx % 2}", week + timedelta(days=idx // 2), first=first)
        for idx in range(10)
    ]

def row(observed="2026-09-24", upcoming="2026-09-25", *, bucket=0, censored=0):
    return {
        "film_id": "f", "title": "Film", "theater_id": "amc-a",
        "visible_friday": "2026-09-18",
        "upcoming_friday": upcoming, "observation_date": observed,
        "bucket": bucket, "censored": censored, "known_weeks": 0,
        "market_bucket": bucket, "market_censored": censored,
        "market_known_weeks": 0,
    }

def status(days, completeness="complete"):
    return [
        SimpleNamespace(
            snapshot_date=day, completeness=completeness,
            record_count=1000, reason="restate_safe_missing_with_records" if completeness == "unknown" else "ok"
        )
        for day in days
    ]

def days(a, b):
    return [a + timedelta(days=d) for d in range((b-a).days + 1)]

def reconstruct(eng, snapshots, *, observation, upcoming, asof=date(2026, 10, 24)):
    strict, legacy = eligible_legacy_days(snapshots, as_of=asof)
    showings = [*eng.screenings, *other_films()]
    return reconstruct_one(
        row(observation, upcoming), engagement=eng, grain="theater",
        strict_schedule=ScheduleEvidence(showings, sorted(strict)),
        provisional_schedule=ScheduleEvidence(showings, sorted(strict | legacy)),
        strict_dates=strict, provisional_dates=legacy,
        dataset_start=date(2026, 9, 18), as_of=asof,
    )

def test_gap_inside_same_run_does_not_mean_exit():
    upcoming = date(2026, 9, 25)
    last = date(2026, 10, 3)
    assert additional_programming_weeks([date(2026, 9, 20), last], upcoming) == 0
    assert calendar_remaining_weeks(last, upcoming) == 2
    assert calendar_remaining_weeks(date(2026, 9, 20), upcoming) == 0

def test_calendar_weeks_are_based_on_friday_thursday_boundaries():
    friday = date(2026, 10, 9)
    assert calendar_remaining_weeks(date(2026, 10, 8), friday) == 0
    assert calendar_remaining_weeks(friday, friday) == 1
    assert calendar_remaining_weeks(date(2026, 10, 15), friday) == 1
    assert calendar_remaining_weeks(date(2026, 10, 16), friday) == 2
    assert calendar_remaining_weeks(date(2026, 10, 23), friday) == 3

def test_reconstructs_gap_run_as_continuation_from_independent_schedule():
    eng = ending()
    snapshots = status(days(date(2026, 9, 18), date(2026, 10, 24)))
    result = reconstruct(
        eng, snapshots, observation="2026-09-24", upcoming="2026-09-25",
    )
    assert result["corrected_bucket"] == 2
    assert result["corrected_censored"] == 0
    assert result["evidence_tier"] == "strict"
    assert result["label_changed"] == 1
    assert result["terminal_show"] == "2026-10-03"

def test_unknown_legacy_completeness_recovered_only_as_provisional():
    eng = ending()
    snapshots = status(days(date(2026, 9, 18), date(2026, 10, 24)), "unknown")
    result = reconstruct(
        eng, snapshots, observation="2026-09-24", upcoming="2026-09-25",
    )
    assert result["corrected_bucket"] == 2
    assert result["corrected_censored"] == 0
    assert result["evidence_tier"] == "provisional_legacy"

def test_missing_day_leaves_unresolved_rather_than_imputed_departure():
    eng = ending()
    snapshots = status([
        d for d in days(date(2026, 9, 18), date(2026, 10, 24))
        if d != date(2026, 10, 5)
    ])
    result = reconstruct(
        eng, snapshots, observation="2026-09-24", upcoming="2026-09-25",
    )
    assert result["corrected_bucket"] is None
    assert result["corrected_censored"] == 1
    assert result["evidence_tier"] == "unresolved"
    assert "unresolved_coverage_gap" in result["evidence_reason"]

def test_unknown_without_restate_missing_metadata_is_not_usable():
    snap = status([date(2026, 8, 5)], "unknown")[0]
    snap.reason = "unknown"
    strict, legacy = eligible_legacy_days([snap], as_of=date(2026, 8, 8))
    assert not strict
    assert not legacy
    assert uncovered_days(date(2026, 8, 5), date(2026, 8, 5), set()) == {date(2026, 8, 5)}

def test_announced_future_three_plus_does_not_become_verified():
    screening = show("f", date(2026, 10, 23), first=date(2026, 10, 20))
    eng = ending(last=date(2026, 10, 23), screenings=[
        show("f", date(2026, 10, 7)),
        screening,
    ], status="right_censored_still_scheduled")
    strict = set(days(date(2026, 10, 5), date(2026, 10, 22)))
    outcome = reconstruct_one(
        row("2026-10-08", "2026-10-09", bucket=3), engagement=eng,
        grain="theater",
        strict_schedule=ScheduleEvidence(eng.screenings, sorted(strict)),
        provisional_schedule=ScheduleEvidence(eng.screenings, sorted(strict)),
        strict_dates=strict, provisional_dates=set(),
        dataset_start=date(2026, 9, 18),
        as_of=date(2026, 10, 22),
    )
    assert outcome["corrected_bucket"] is None
    assert outcome["corrected_censored"] == 1

def test_elapsed_third_week_screening_proves_three_plus_without_confirmed_end():
    screening = show("f", date(2026, 10, 23), first=date(2026, 10, 20))
    eng = ending(last=date(2026, 10, 23), screenings=[
        show("f", date(2026, 10, 7)), screening,
    ], status="right_censored_still_scheduled")
    strict = set(days(date(2026, 10, 5), date(2026, 10, 30)))
    outcome = reconstruct_one(
        row("2026-10-08", "2026-10-09", bucket=3), engagement=eng,
        grain="theater",
        strict_schedule=ScheduleEvidence(eng.screenings, sorted(strict)),
        provisional_schedule=ScheduleEvidence(eng.screenings, sorted(strict)),
        strict_dates=strict, provisional_dates=set(),
        dataset_start=date(2026, 9, 18),
        as_of=date(2026, 10, 30),
    )
    assert outcome["corrected_bucket"] == 3
    assert outcome["corrected_censored"] == 0
    assert outcome["evidence_tier"] == "strict"

def test_missing_observation_anchor_cannot_generate_resolved_label():
    eng = ending()
    snapshots = status([
        d for d in days(date(2026, 9, 18), date(2026, 10, 24))
        if d != date(2026, 9, 24)
    ])
    result = reconstruct(
        eng, snapshots, observation="2026-09-24", upcoming="2026-09-25",
    )
    assert result["corrected_censored"] == 1
    assert result["evidence_reason"] == "no_reliable_observation_snapshot"
