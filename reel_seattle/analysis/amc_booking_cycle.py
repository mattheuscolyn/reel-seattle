"""Analyze AMC booking-cycle timing from historical footprint snapshots.

Detects when films' visible ``max_show_date`` extends across consecutive
snapshots and summarizes which weekdays those extensions are first observed on.
Used to validate Wednesday/Thursday anchor conventions before weekly labeling.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_labels import (
    build_film_anchor_index,
    load_footprint_rows,
    relevant_wednesday,
)

WEEKDAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)


@dataclass(frozen=True)
class ExtensionEvent:
    """A film's max visible show date increased between two consecutive snapshots."""

    showtime_film_key: str
    film_title: str
    previous_snapshot_date: date
    observed_snapshot_date: date
    previous_max_show_date: date
    new_max_show_date: date
    extension_days: int

    @property
    def observed_weekday(self) -> int:
        return self.observed_snapshot_date.weekday()

    @property
    def observed_weekday_name(self) -> str:
        return WEEKDAY_NAMES[self.observed_weekday]

    @property
    def relevant_wednesday_before_observation(self) -> date:
        return relevant_wednesday(self.observed_snapshot_date)

    @property
    def days_after_relevant_wednesday(self) -> int:
        return (self.observed_snapshot_date - self.relevant_wednesday_before_observation).days


def week_start(value: date) -> date:
    """Monday-start booking week containing *value*."""
    return value - timedelta(days=value.weekday())


def week_end(value: date) -> date:
    return week_start(value) + timedelta(days=6)


def following_week_range(anchor: date) -> tuple[date, date]:
    """Monday–Sunday of the booking week immediately after *anchor*'s week."""
    start = week_start(anchor) + timedelta(days=7)
    return start, start + timedelta(days=6)


def current_week_range(anchor: date) -> tuple[date, date]:
    """Monday–Sunday of the booking week containing *anchor*."""
    start = week_start(anchor)
    return start, start + timedelta(days=6)


def detect_max_show_date_extensions(
    rows: Sequence[Mapping[str, str]],
) -> list[ExtensionEvent]:
    """Detect extension events on consecutive snapshot dates per film."""
    by_snapshot, snapshot_dates = build_film_anchor_index(rows)
    if len(snapshot_dates) < 2:
        return []

    events: list[ExtensionEvent] = []
    for previous_date, observed_date in zip(snapshot_dates, snapshot_dates[1:]):
        previous_films = by_snapshot.get(previous_date, {})
        observed_films = by_snapshot.get(observed_date, {})
        for film_key in sorted(set(previous_films) & set(observed_films)):
            previous = previous_films[film_key]
            observed = observed_films[film_key]
            if observed.max_show_date <= previous.max_show_date:
                continue
            events.append(
                ExtensionEvent(
                    showtime_film_key=film_key,
                    film_title=observed.film_title,
                    previous_snapshot_date=previous_date,
                    observed_snapshot_date=observed_date,
                    previous_max_show_date=previous.max_show_date,
                    new_max_show_date=observed.max_show_date,
                    extension_days=(
                        observed.max_show_date - previous.max_show_date
                    ).days,
                )
            )
    return events


def _counter_to_weekday_report(counter: Counter[int]) -> dict[str, Any]:
    total = sum(counter.values())
    by_weekday = []
    for weekday in range(7):
        count = counter.get(weekday, 0)
        by_weekday.append(
            {
                "weekday": weekday,
                "weekday_name": WEEKDAY_NAMES[weekday],
                "extension_event_count": count,
                "share_of_extensions": round(count / total, 4) if total else 0.0,
            }
        )
    dominant = max(range(7), key=lambda day: counter.get(day, 0)) if total else None
    return {
        "total_extension_events": total,
        "by_weekday": by_weekday,
        "dominant_weekday": dominant,
        "dominant_weekday_name": WEEKDAY_NAMES[dominant] if dominant is not None else None,
        "dominant_weekday_share": round(counter.get(dominant, 0) / total, 4) if total else 0.0,
    }


def detect_week_crossing_extensions(
    events: Sequence[ExtensionEvent],
) -> list[ExtensionEvent]:
    """Keep extensions where the new max show date crosses into a later booking week."""
    filtered: list[ExtensionEvent] = []
    for event in events:
        previous_week_end = week_end(event.previous_snapshot_date)
        if event.new_max_show_date > previous_week_end:
            filtered.append(event)
    return filtered


def summarize_extension_events(events: Sequence[ExtensionEvent]) -> dict[str, Any]:
    """Summarize extension timing for booking-cycle validation."""
    observed_counter: Counter[int] = Counter()
    days_after_wed_counter: Counter[int] = Counter()
    by_observed_date: Counter[str] = Counter()
    gap_days_counter: Counter[int] = Counter()

    for event in events:
        observed_counter[event.observed_weekday] += 1
        days_after_wed_counter[event.days_after_relevant_wednesday] += 1
        by_observed_date[event.observed_snapshot_date.isoformat()] += 1
        gap = (event.observed_snapshot_date - event.previous_snapshot_date).days
        gap_days_counter[gap] += 1

    thursday_share = observed_counter.get(3, 0) / len(events) if events else 0.0
    wednesday_share = observed_counter.get(2, 0) / len(events) if events else 0.0
    friday_share = observed_counter.get(4, 0) / len(events) if events else 0.0

    scrape_note = (
        "Daily scrape runs near 06:00 UTC (~22:00–23:00 PT previous calendar day). "
        "Wednesday PM PT booking drops are therefore expected to appear first on "
        "Thursday snapshot dates, not Wednesday snapshots."
    )

    if thursday_share >= 0.35:
        anchor_recommendation = (
            "Use Tuesday pre-update anchor snapshots and Thursday post-update "
            "observation snapshots. Wednesday snapshots in this dataset mostly "
            "pre-date the visible weekly block extension."
        )
    elif wednesday_share >= 0.35:
        anchor_recommendation = (
            "Wednesday snapshots may already capture part of the weekly update; "
            "still prefer Tuesday anchor + Thursday observation to avoid "
            "post-update leakage."
        )
    else:
        anchor_recommendation = (
            "Extension timing is diffuse; keep Tuesday anchor + Thursday "
            "observation but treat weekday cadence as approximate."
        )

    return {
        "extension_event_count": len(events),
        "observed_on_weekday": _counter_to_weekday_report(observed_counter),
        "days_after_relevant_wednesday": {
            str(days): count for days, count in sorted(days_after_wed_counter.items())
        },
        "snapshot_gap_days_between_extension_pair": {
            str(days): count for days, count in sorted(gap_days_counter.items())
        },
        "top_observed_dates": [
            {"date": day, "extension_event_count": count}
            for day, count in by_observed_date.most_common(15)
        ],
        "interpretation": {
            "scrape_timing_note": scrape_note,
            "thursday_observation_share": round(thursday_share, 4),
            "wednesday_observation_share": round(wednesday_share, 4),
            "friday_observation_share": round(friday_share, 4),
            "supports_wednesday_pm_update_visible_thursday": thursday_share
            >= max(wednesday_share, friday_share),
            "recommended_anchor_convention": anchor_recommendation,
        },
        "example_extensions": [
            {
                "film_title": event.film_title,
                "previous_snapshot_date": event.previous_snapshot_date.isoformat(),
                "observed_snapshot_date": event.observed_snapshot_date.isoformat(),
                "previous_max_show_date": event.previous_max_show_date.isoformat(),
                "new_max_show_date": event.new_max_show_date.isoformat(),
                "observed_weekday": event.observed_weekday_name,
                "days_after_relevant_wednesday": event.days_after_relevant_wednesday,
            }
            for event in events[:10]
        ],
    }


def analyze_booking_cycle_from_rows(
    rows: Sequence[Mapping[str, str]],
    *,
    input_path: str | None = None,
) -> dict[str, Any]:
    """Run full booking-cycle analysis on footprint rows."""
    by_snapshot, snapshot_dates = build_film_anchor_index(rows)
    events = detect_max_show_date_extensions(rows)
    summary = summarize_extension_events(events)
    week_crossing = detect_week_crossing_extensions(events)
    week_crossing_summary = summarize_extension_events(week_crossing)

    snapshot_weekday_counts: Counter[int] = Counter(day.weekday() for day in snapshot_dates)
    return {
        "input_path": input_path,
        "footprint_row_count": len(rows),
        "snapshot_count": len(snapshot_dates),
        "snapshot_date_range": {
            "earliest": snapshot_dates[0].isoformat() if snapshot_dates else "",
            "latest": snapshot_dates[-1].isoformat() if snapshot_dates else "",
        },
        "snapshots_by_weekday": [
            {
                "weekday": day,
                "weekday_name": WEEKDAY_NAMES[day],
                "snapshot_count": snapshot_weekday_counts.get(day, 0),
            }
            for day in range(7)
        ],
        "distinct_films": len(
            {
                film_key
                for films in by_snapshot.values()
                for film_key in films
            }
        ),
        **summary,
        "week_crossing_extension_event_count": week_crossing_summary["extension_event_count"],
        "week_crossing_observed_on_weekday": week_crossing_summary["observed_on_weekday"],
        "week_crossing_interpretation": week_crossing_summary["interpretation"],
    }


def analyze_booking_cycle_csv(input_path: Path | str) -> dict[str, Any]:
    rows = load_footprint_rows(input_path)
    return analyze_booking_cycle_from_rows(rows, input_path=str(input_path))


def write_booking_cycle_report(report: Mapping[str, Any], output_path: Path | str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
