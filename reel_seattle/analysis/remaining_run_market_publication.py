"""Independent AMC market publication milestones and point-in-time quality gates.

The forecast cutoff is one complete AMC snapshot for the *entire* market,
not the earliest theater's publication cycle. Dates are Pacific programming
dates as recorded in the AMC lifecycle log. A missing scrape is never zero.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median
from typing import Any, Sequence

from reel_seattle.analysis.leaving_soon_feature_value import still_listed

FEATURE_VERSION = "market_features_v3_research"
SELECTOR_VERSION = "market_publication_v1"
READY_RATIO = 0.80
MIN_BASELINE_FRIDAYS = 3
MAX_SNAPSHOT_LAG_DAYS = 1


def _friday_volume(screenings, theater_ids: set[str], friday: date, snapshot: date, *, historical=False) -> int:
    """Past Friday denominator uses screenings already known by this snapshot.

    Once a showtime has actually elapsed, later removal of its booking page
    does not erase that historical performance from the observed baseline.
    """
    return sum(
        1 for s in screenings
        if s.theater_id in theater_ids and s.show_date == friday
        and s.first_snapshot <= snapshot
        and (
            (not s.removed_before_show and not s.canceled)
            if historical else still_listed(s, snapshot)
        )
    )


def select_market_snapshot(
    screenings: Sequence[Any],
    snapshot_infos: Sequence[Any],
    *,
    as_of: date,
    upcoming_friday: date,
    theater_ids: Sequence[str],
    dataset_start: date,
) -> dict[str, Any]:
    """Select one common observation date; conservatively grade its evidence.

    Historical denominator: the latest four eligible, elapsed Fridays for
    which an AMC complete snapshot exists on/after the performance date.
    The denominator never includes the forecast week or future knowledge.
    Each candidate publication date is assessed using only data visible then.
    """
    if as_of >= upcoming_friday:
        raise ValueError("as_of must be before the forecast Friday")
    allowed = set(theater_ids)
    if not allowed:
        raise ValueError("Cannot forecast an empty AMC market")
    complete = sorted({
        s.snapshot_date for s in snapshot_infos
        if s.completeness == "complete" and s.snapshot_date <= as_of
    })
    candidates = [d for d in complete if dataset_start <= d < upcoming_friday]
    if not candidates:
        return {
            "selector_version": SELECTOR_VERSION, "quality_status": "no_complete_snapshot",
            "observation_date": None, "forecast_state": "not_ready",
            "publication_snapshot": None, "publication_completeness": None,
            "baseline_fridays": [], "snapshot_lag_days": None,
        }
    snapshot = candidates[-1]
    weeks = []
    d = upcoming_friday - timedelta(days=7)
    while d >= dataset_start and len(weeks) < 4:
        # A complete source snapshot at or after the actual performance date
        # is required; inferred/no-status days cannot anchor the baseline.
        if any(day >= d and day <= snapshot for day in complete):
            count = _friday_volume(screenings, allowed, d, snapshot, historical=True)
            if count:
                weeks.append((d, count))
        d -= timedelta(days=7)
    if len(weeks) < MIN_BASELINE_FRIDAYS:
        return {
            "selector_version": SELECTOR_VERSION, "quality_status": "insufficient_baseline",
            "observation_date": snapshot.isoformat(), "forecast_state": "not_ready",
            "publication_snapshot": None, "publication_completeness": None,
            "baseline_fridays": [d.isoformat() for d, _ in weeks],
            "snapshot_lag_days": (as_of - snapshot).days,
        }
    baseline = float(median(count for _, count in weeks))
    window = [d for d in candidates if upcoming_friday - timedelta(days=8) <= d]
    if not window:
        window = [snapshot]
    milestones = [
        (d, _friday_volume(screenings, allowed, upcoming_friday, d) / baseline)
        for d in window
    ]
    ready = next((d for d, ratio in milestones if ratio >= READY_RATIO), None)
    latest_ratio = milestones[-1][1]
    lag = (as_of - snapshot).days
    # A single missing adjacent day is explicitly recorded, not considered
    # evidence that publication completed on the unseen day.
    recent_missing = [
        (snapshot - timedelta(days=i)).isoformat()
        for i in range(1, min(7, (snapshot - dataset_start).days) + 1)
        if (snapshot - timedelta(days=i)) not in complete
    ]
    quality = "stale_snapshot" if lag > MAX_SNAPSHOT_LAG_DAYS else (
        "recent_snapshot_gap" if recent_missing else "complete"
    )
    thursday = upcoming_friday - timedelta(days=1)
    return {
        "selector_version": SELECTOR_VERSION,
        "quality_status": quality,
        "observation_date": snapshot.isoformat(),
        "forecast_state": "market_ready" if latest_ratio >= READY_RATIO else "pre_publication",
        "publication_snapshot": ready.isoformat() if ready else None,
        "publication_completeness": round(latest_ratio, 6),
        "publication_threshold": READY_RATIO,
        "baseline_fridays": [d.isoformat() for d, _ in weeks],
        "typical_market_friday_volume": baseline,
        "visible_upcoming_friday_screenings": _friday_volume(screenings, allowed, upcoming_friday, snapshot),
        "snapshot_lag_days": lag,
        "recent_missing_complete_days": recent_missing,
        "thursday_decision_snapshot": snapshot.isoformat() if snapshot == thursday else None,
        "thursday_snapshot_available": thursday in complete and thursday <= as_of,
        "latest_complete_snapshot": snapshot.isoformat(),
    }
