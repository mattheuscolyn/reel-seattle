"""Synthetic, deterministic tests for read-only Phase 2 evidence classification."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

from scripts.audit_leaving_soon_phase2_evidence import (
    audit_booking_cycle_baselines,
    audit_label_cohorts,
    compare_historical_samples,
    provenance_row,
)
from reel_seattle.analysis.leaving_soon_prepublication_survival import build_booking_cycles


def _row(observation: str, friday: str, *, censored: int = 0, days_since_first_show: int = 0):
    return {
        "observation_date": observation,
        "upcoming_friday": friday,
        "days_since_first_show": days_since_first_show,
        "censored": censored,
        "bucket": None if censored else 0,
        "known_weeks": 0,
        "film_id": "film-a",
        "theater_id": "amc-a",
        "segment": "ordinary",
    }


def test_gap_is_not_an_exit_label_and_censored_rows_are_preserved():
    observed = ["2026-10-12", "2026-10-19", "2026-10-20", "2026-10-21"]
    coverage = {
        "snapshot_dates": observed,
        "missing_dates": [f"2026-10-{day:02d}" for day in range(13, 19)],
        "incomplete_dates": [],
    }
    parts = {
        "train": [_row("2026-10-12", "2026-10-16")],
        "validation": [_row("2026-10-19", "2026-10-23", censored=1)],
        "holdout": [
            _row("2026-10-20", "2026-10-23", days_since_first_show=8),
            _row("2026-10-16", "2026-10-23"),
            _row("2026-10-21", "2026-10-23"),
        ],
    }
    result = audit_label_cohorts(parts, coverage, dataset_start=date(2026, 9, 3))
    assert len(result["rows"]) == 5
    assert result["summary"]["by_cohort"]["validation"]["censored_labels"] == 1
    assert result["rows"][0]["evidence_state"] == "potential_gap_exposure"
    assert result["rows"][0]["outcome_missing_dates"] == coverage["missing_dates"]
    assert result["rows"][1]["evidence_state"] == "unresolved_censored"
    assert result["rows"][2]["feature_missing_dates"] == coverage["missing_dates"]
    assert result["rows"][3]["evidence_state"] == "untrusted_observation"
    assert result["rows"][4]["evidence_state"] == "coverage_clear_not_label_verified"
    assert result["rows"][0]["bucket"] == 0


def test_incomplete_snapshots_are_untrusted_not_rewritten():
    row = _row("2026-10-20", "2026-10-23", censored=0)
    audited = provenance_row(
        row, cohort="holdout",
        missing=[date(2026, 10, 20)],
        dataset_start=date(2026, 9, 3),
        valid_snapshots={date(2026, 10, 21)},
    )
    assert audited["evidence_state"] == "untrusted_observation"
    assert audited["bucket"] == 0
    assert audited["observation_coverage"] == "missing_or_incomplete"


def _show(friday: date, index: int, *, first_seen: date):
    return SimpleNamespace(
        screening_id=f"{friday.isoformat()}-{index}",
        theater_id="amc-a",
        show_date=friday,
        first_snapshot=first_seen,
        canceled=False,
        removed_before_show=False,
        removed_at=None,
    )


def test_retrospective_baseline_can_change_publication_snapshot():
    screenings = []
    for friday in (date(2026, 10, 2), date(2026, 10, 9)):
        screenings.extend(_show(friday, i, first_seen=friday - timedelta(days=3)) for i in range(10))
    for friday in (date(2026, 10, 23), date(2026, 10, 30), date(2026, 11, 6)):
        screenings.extend(_show(friday, i, first_seen=friday - timedelta(days=3)) for i in range(100))
    screenings.extend(_show(date(2026, 10, 16), i, first_seen=date(2026, 10, 13)) for i in range(30))

    snaps = [date(2026, 10, day) for day in range(8, 16)]
    still_listed = lambda show, on: show.first_snapshot <= on
    cycles = build_booking_cycles(
        screenings, snaps, {"amc-a": "AMC A"}, as_of=date(2026, 11, 8)
    )
    target = next(c for c in cycles if c["upcoming_friday"] == "2026-10-16")
    assert target["typical_friday_volume"] == 100.0
    assert target["date_80"] == ""

    result = audit_booking_cycle_baselines(
        [target], screenings, snaps,
        as_of=date(2026, 11, 8), still_listed=still_listed,
    )
    assert result["cycles_with_later_fridays_available_to_original"] == 1
    assert result["cycles_with_changed_past_only_baseline"] == 1
    assert result["cycles_with_changed_80pct_publication_date"] == 1
    assert result["cycles_with_changed_prepublication_snapshot"] == 1
    assert result["examples"][0]["original_prepublication_snapshot"] == ""
    assert result["examples"][0]["past_only_prepublication_snapshot"] == "2026-10-12"
    example = result["examples"][0]
    assert example["past_only_baseline"] == 10.0
    assert example["past_only_date_80"] == "2026-10-13"


def test_no_future_fridays_does_not_invent_a_new_baseline():
    screenings = [_show(date(2026, 10, 2), i, first_seen=date(2026, 9, 30)) for i in range(10)]
    cycle = {
        "theater_id": "amc-a",
        "upcoming_friday": "2026-10-9",
        "typical_friday_volume": 10.0,
        "date_80": "",
    }
    # The actual cycle's date formatting is ISO and produces no publication hit.
    cycle["upcoming_friday"] = "2026-10-09"
    result = audit_booking_cycle_baselines(
        [cycle], screenings, [date(2026, 10, 5)],
        as_of=date(2026, 10, 8), still_listed=lambda show, on: show.first_snapshot <= on,
    )
    assert result["cycles_with_changed_past_only_baseline"] == 0
    assert result["cycles_with_changed_80pct_publication_date"] == 0


def test_chronological_replay_compares_model_row_selection_without_relabeling():
    def row(film_id, observed, bucket=1):
        return {
            "theater_id": "amc-a",
            "upcoming_friday": "2026-10-23",
            "film_id": film_id,
            "observation_date": observed,
            "bucket": bucket,
            "censored": 0,
        }

    original = [row("same-film", "2026-10-12"), row("old-only", "2026-10-12")]
    chronological = [row("same-film", "2026-10-19"), row("new-only", "2026-10-19")]
    result = compare_historical_samples(original, chronological)
    assert result["original_rows"] == 2
    assert result["chronological_rows"] == 2
    assert result["common_film_theater_week_rows"] == 1
    assert result["original_only_rows"] == 1
    assert result["chronological_only_rows"] == 1
    assert result["rows_with_changed_feature_snapshot"] == 1
    assert result["rows_with_changed_outcome_label"] == 0


def test_withdrawn_friday_shows_count_when_they_were_still_visible():
    prior = [_show(date(2026, 10, 9), i, first_seen=date(2026, 10, 6)) for i in range(10)]
    scheduled = [_show(date(2026, 10, 16), i, first_seen=date(2026, 10, 13)) for i in range(8)]
    for show in scheduled:
        show.removed_before_show = True
        show.removed_at = date(2026, 10, 14)
    shows = prior + scheduled
    snapshots = [date(2026, 10, day) for day in range(8, 16)]

    def listed(show, snap):
        return show.first_snapshot <= snap and (
            not show.removed_before_show or show.removed_at > snap
        )

    cycles = build_booking_cycles(shows, snapshots, {"amc-a": "AMC A"}, as_of=date(2026, 10, 22))
    target = next(c for c in cycles if c["upcoming_friday"] == "2026-10-16")
    assert target["date_80"] == "2026-10-13"
    audit = audit_booking_cycle_baselines(
        [target], shows, snapshots, as_of=date(2026, 10, 22), still_listed=listed
    )
    assert audit["cycles_with_changed_80pct_publication_date"] == 0
    assert audit["cycles_with_changed_prepublication_snapshot"] == 0
