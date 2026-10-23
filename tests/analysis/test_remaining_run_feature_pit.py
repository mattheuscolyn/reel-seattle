"""Synthetic temporal-invariance and asynchronous-market regression checks."""

from datetime import date
from dataclasses import dataclass
from types import SimpleNamespace

from scripts.audit_remaining_run_feature_pit import (
    _equal, audit_feature_invariance, audit_hindsight_history, audit_market_as_of,
    audit_cancelled_after_forecast,
    synchronized_market_features,
)


def show(film, theater, when, seen, *, canceled=False, removed_before_show=False, removed_at=None):
    return SimpleNamespace(
        film_id=film, theater_id=theater, show_date=date.fromisoformat(when),
        first_snapshot=date.fromisoformat(seen),
        canceled=canceled, removed_before_show=removed_before_show,
        removed_at=removed_at, minutes=1120, premium=False,
    )


def row(film, theater, observed, *, market_count, market_shows):
    return {
        "film_id": film,
        "title": film,
        "theater_id": theater,
        "upcoming_friday": "2026-10-16",
        "visible_friday": "2026-10-09",
        "observation_date": observed,
        "market_screenings": float(market_shows),
        "market_theater_count": float(market_count),
        "theater_count_wow": 0.0,
        "market_screenings_wow": 0.0,
        "days_since_first_show": 4.0,
        "left_truncated": 0.0,
    }


def test_future_first_seen_screening_does_not_alter_direct_local_features():
    shows = [
        show("film", "amc-a", "2026-10-12", "2026-10-09"),
        show("film", "amc-a", "2026-10-15", "2026-10-13"),
    ]
    bundle = SimpleNamespace(screenings=shows, dataset_start=date(2026, 9, 3))
    report = audit_feature_invariance(
        bundle, [row("film", "amc-a", "2026-10-10", market_count=1, market_shows=1)],
    )
    assert report["rows"] == 1
    assert report["future_record_exposure"]["rows_with_future_first_seen_screenings"] == 1
    assert report["features_with_future_first_seen_dependency"] == {}
    assert report["direct_local_features_checked"] >= 12


def test_market_as_of_does_not_include_theater_first_observed_after_forecast():
    shows = [
        show("film", "amc-a", "2026-10-12", "2026-10-09"),
        show("film", "amc-b", "2026-10-12", "2026-10-13"),
    ]
    snapshot = synchronized_market_features(
        shows, "film", date(2026, 10, 16), date(2026, 10, 10),
    )
    assert snapshot["market_theater_count"] == 1
    assert snapshot["market_screenings"] == 1
    late = synchronized_market_features(
        shows, "film", date(2026, 10, 16), date(2026, 10, 14),
    )
    assert late["market_theater_count"] == 2
    assert late["market_screenings"] == 2
    bundle = SimpleNamespace(
        screenings=shows, theater_names={"amc-a": "A", "amc-b": "B"},
    )
    report = audit_market_as_of(
        bundle,
        [
            row("film", "amc-a", "2026-10-10", market_count=2, market_shows=2),
            row("film", "amc-b", "2026-10-14", market_count=2, market_shows=2),
        ],
    )
    assert report["counts"]["mixed_snapshot_film_weeks"] == 1
    assert report["counts"]["as_of_market_footprint_differs"] == 1
    assert report["original_vs_single_snapshot_mismatch"]["market_screenings"] == 1
    assert report["paired_market_feature_corrections"][("film", "2026-10-16")]["market_screenings"] == 1


def test_historical_removal_preserves_earlier_visibility():
    shows = [
        show("film", "amc-a", "2026-10-14", "2026-10-09",
             removed_before_show=True, removed_at=date(2026, 10, 12))
    ]
    first = synchronized_market_features(
        shows, "film", date(2026, 10, 16), date(2026, 10, 10),
    )
    after = synchronized_market_features(
        shows, "film", date(2026, 10, 16), date(2026, 10, 13),
    )
    assert first["market_screenings"] == 1
    assert after["market_screenings"] == 0


def test_numeric_feature_comparison_preserves_nan_equivalence():
    assert _equal(float("nan"), float("nan"))
    assert not _equal(1, 2)


def test_late_discovered_historical_show_inflates_theater_baseline():
    shows = [
        show("film", "amc-a", "2026-09-26", "2026-09-20"),
        show("other", "amc-a", "2026-10-02", "2026-10-11"),
        show("other2", "amc-a", "2026-10-03", "2026-10-11"),
        show("other3", "amc-a", "2026-10-04", "2026-10-11"),
        show("film", "amc-a", "2026-10-12", "2026-10-09"),
    ]
    engagement = SimpleNamespace(
        start_date=date(2026, 9, 26), end_date=date(2026, 10, 12),
        screening_count=2, screenings=(shows[0], shows[-1]),
    )
    bundle = SimpleNamespace(
        screenings=shows, film_theater=[engagement],
        as_of=date(2026, 10, 23),
    )
    engagement.film_id = "film"
    engagement.theater_id = "amc-a"
    report = audit_hindsight_history(
        bundle, [row("film", "amc-a", "2026-10-10", market_count=1, market_shows=1)],
    )
    assert report["counts"]["observations_with_later_discovered_historical_showtimes"] == 1
    assert report["counts"]["observations_with_hindsight_theater_baseline_change"] == 1
    assert report["examples"][0]["full_history_baseline"] != report["examples"][0]["asof_baseline"]


@dataclass(frozen=True)
class CanceledScreening:
    screening_id: str
    film_id: str
    theater_id: str
    show_date: date
    first_snapshot: date
    canceled: bool
    removed_before_show: bool = False
    removed_at: date | None = None
    minutes: int = 1110
    premium: bool = False

def test_a_later_cancellation_cannot_rewrite_earlier_observed_showtimes():
    active = CanceledScreening(
        "ok", "film", "amc-a", date(2026, 10, 12),
        date(2026, 10, 9), canceled=False,
    )
    later_canceled = CanceledScreening(
        "cancel-later", "film", "amc-a", date(2026, 10, 13),
        date(2026, 10, 9), canceled=True,
    )
    bundle = SimpleNamespace(
        screenings=[active, later_canceled],
        dataset_start=date(2026, 9, 3),
    )
    result = audit_cancelled_after_forecast(
        bundle,
        [row("film", "amc-a", "2026-10-10", market_count=1, market_shows=1)],
        {"cancel-later": date(2026, 10, 11)},
    )
    assert result["counts"]["forecasts_with_changed_direct_model_features"] == 1
    assert result["changed_model_feature_counts"]["current_week_screenings"] == 1
    assert result["examples"][0]["before_current_week_screenings"] == 1
    assert result["examples"][0]["after_current_week_screenings"] == 2
    no_leak = audit_cancelled_after_forecast(
        bundle,
        [row("film", "amc-a", "2026-10-10", market_count=1, market_shows=1)],
        {"cancel-later": date(2026, 10, 9)},
    )
    assert no_leak["counts"] == {}
