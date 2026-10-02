"""Scheduling-assumptions audit for the Leaving Soon model.

Read-only research. Does not score films, retrain a model, or write
production Leaving Soon artifacts.

Prior work this module reuses instead of rebuilding:

- ``docs/leaving-soon-lifecycle-audit.md`` and ``amc_run_lifecycle.py``:
  source-film identity, 14-day dark-gap run splits, and the rule that a
  right-censored run does not get an invented end date.
- ``docs/leaving-soon-model-design.md`` and ``amc_booking_cycle.py``:
  which weekday a *visible horizon extension* is first observed. That is
  a different question from which weekday a run's final showtime falls on.
- ``special_screening_flags.classify_run_type`` and the AMC product catalog
  ``presentation.category`` (current-as-of, not historical-as-of).

Point-in-time evidence comes from the screening lifecycle ledger, which is
rebuilt from daily logs. ``showtimes_history.csv`` restates the forward
window on every scrape, so it is used only as a count cross-check.
"""

from __future__ import annotations

import csv
import gzip
import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from reel_seattle.analysis.amc_run_lifecycle import (
    DEFAULT_GAP_THRESHOLD_DAYS,
    load_catalog_index,
    segment_occurred_dates,
)
from reel_seattle.analysis.special_screening_flags import classify_run_type
from reel_seattle.normalize.formats import parse_format_tags
from reel_seattle.normalize.times import parse_time_to_minutes

SCHEMA_VERSION = "1.0.0"
WEEKDAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)
SOURCE = "amc"
DENSE_RATIO = 0.5
DENSE_HOLE_DAYS = 2
ORDINARY_MIN_SPAN_DAYS = 7

CONFIRMED = "confirmed_complete"
CENSORED_ACTIVE = "right_censored_still_scheduled"
CENSORED_FRONTIER = "right_censored_publication_frontier"
FUTURE_ONLY = "future_only_no_occurred_showtimes"

SEGMENT_ORDINARY = "ordinary"
SEGMENT_RERELEASE = "rerelease"
SEGMENT_SPECIAL = "special_event"
SEGMENT_ACCESS = "accessibility_presentation"
SEGMENT_AMBIGUOUS_RERELEASE = "ambiguous_rerelease"
SEGMENT_AMBIGUOUS_SPECIAL = "ambiguous_special"
SEGMENT_AMBIGUOUS_LIMITED = "ambiguous_limited"
SEGMENT_ORDINARY_TITLE = "ordinary_title_only"
SEGMENT_RERELEASE_TITLE = "rerelease_title_only"
SEGMENT_SPECIAL_TITLE = "special_event_title_only"
SEGMENT_OTHER = "other"

CATALOG_RERELEASE = {"anniversary_or_rerelease"}
CATALOG_SPECIAL = {
    "concert_or_event",
    "mystery_screening",
    "marathon_or_multi_feature",
    "other_special",
    "q_and_a",
    "special_introduction",
}
CATALOG_ACCESS = {"sensory_friendly", "open_caption", "dubbed_or_subtitled"}
TITLE_RERELEASE = {"anniversary_re_release", "classic_revival", "holiday_re_release"}
TITLE_SPECIAL = {
    "fan_event",
    "opening_night",
    "concert_live_encore",
    "anime_special_engagement",
    "special_event",
    "double_feature",
    "family_holiday_title",
}
TITLE_LIMITED = {"awards_season_limited", "foreign_language_limited", "sensory_friendly"}

# Name-inferred from the theater id suffix. Not a verified auditorium inventory.
HOLIDAYS = {
    date(2026, 7, 3): "day before Independence Day",
    date(2026, 7, 4): "Independence Day",
    date(2026, 7, 5): "day after Independence Day",
    date(2026, 9, 6): "day before Labor Day",
    date(2026, 9, 7): "Labor Day",
    date(2026, 9, 8): "day after Labor Day",
}

_PREMIUM_TOKENS = frozenset(
    {"imax", "imax-3d", "dolby", "dolby-cinema", "dolby-atmos", "prime", "reald-3d", "3d"}
)


@dataclass(frozen=True)
class Screening:
    screening_id: str
    film_id: str
    title: str
    theater_id: str
    show_date: date
    minutes: int | None
    first_snapshot: date
    removed_before_show: bool
    canceled: bool
    premium: bool
    catalog_category: str
    title_run_type: str
    segment: str
    segment_source: str
    segment_confidence: str
    identity_kind: str


@dataclass(frozen=True)
class SnapshotInfo:
    snapshot_date: date
    completeness: str
    record_count: int
    reason: str


@dataclass
class Engagement:
    level: str
    film_id: str
    title: str
    theater_id: str
    sequence: int
    segment: str
    segment_source: str
    segment_confidence: str
    catalog_category: str
    title_run_type: str
    identity_kind: str
    start_date: date
    end_date: date
    last_occurred: date | None
    span_days: int
    distinct_show_dates: int
    screening_count: int
    occurred_screening_count: int
    first_observation: date
    left_truncated: bool
    end_status: str
    end_weekday: str
    next_programming_friday: date | None
    next_friday_published: bool | None
    announcement_observed: bool
    initial_first_show: date | None
    initial_last_show: date | None
    initial_span_days: int | None
    initial_screening_count: int
    share_visible_at_first_observation: float | None
    days_added: int | None
    extended: bool | None
    shortened: bool | None
    dates_added_count: int
    removed_screening_count: int
    screenings: tuple[Screening, ...] = field(repr=False)
    removed_screenings: tuple[Screening, ...] = field(repr=False)

    @property
    def confirmed(self) -> bool:
        return self.end_status == CONFIRMED

    @property
    def week_plus(self) -> bool:
        return self.span_days >= ORDINARY_MIN_SPAN_DAYS


def weekday_name(value: date) -> str:
    return WEEKDAY_NAMES[value.weekday()]


def programming_week_friday(value: date) -> date:
    """Friday that opens the Fri–Thu programming week containing *value*."""
    return value - timedelta(days=(value.weekday() - 4) % 7)


def next_programming_friday(end: date) -> date:
    """Friday that opens the programming week after the week containing *end*."""
    return programming_week_friday(end) + timedelta(days=7)


def upcoming_friday(observation: date) -> date:
    """Nearest Friday on or after *observation* (same day when observation is Friday)."""
    ahead = (4 - observation.weekday()) % 7
    return observation + timedelta(days=ahead)


def wilson_interval(successes: int, total: int, *, z: float = 1.96) -> tuple[float, float] | None:
    """Wilson score interval for a binomial proportion. Returns shares in 0–1."""
    if total <= 0:
        return None
    phat = successes / total
    z2 = z * z
    denom = 1.0 + z2 / total
    center = (phat + z2 / (2.0 * total)) / denom
    margin = z * math.sqrt((phat * (1.0 - phat) + z2 / (4.0 * total)) / total) / denom
    return (max(0.0, center - margin), min(1.0, center + margin))


def is_premium_format(raw: str | None) -> bool:
    """Premium booth formats. Matches known slugs plus AMC labels like 'IMAX at AMC'."""
    tags = set(parse_format_tags(raw))
    if tags & _PREMIUM_TOKENS:
        return True
    text = (raw or "").casefold()
    return any(hint in text for hint in ("imax", "dolby", "reald", "real d", "3d"))


def inferred_auditorium_count(theater_id: str) -> int | None:
    """Trailing number on ids such as ``amc-pacific-place-11``. Not field-verified."""
    tail = theater_id.rsplit("-", 1)[-1]
    if tail.isdigit():
        return int(tail)
    return None


def time_block(minutes: int | None) -> str | None:
    if minutes is None:
        return None
    if minutes < 12 * 60:
        return "morning"
    if minutes < 17 * 60:
        return "afternoon"
    if minutes < 22 * 60:
        return "prime"
    return "late"


def assign_segment(
    *,
    catalog_category: str,
    title_run_type: str,
    has_source_film_id: bool,
) -> tuple[str, str, str]:
    """Return (segment, source, confidence).

    Catalog ``presentation.category`` is preferred when it marks a rerelease,
    special, or accessibility product. Title patterns never override that.
    Disagreement (catalog standard, title looks special) is kept ambiguous.
    """
    category = (catalog_category or "").strip() or "unknown"
    if category in CATALOG_RERELEASE:
        return SEGMENT_RERELEASE, "catalog", "high"
    if category in CATALOG_SPECIAL:
        return SEGMENT_SPECIAL, "catalog", "high"
    if category in CATALOG_ACCESS:
        return SEGMENT_ACCESS, "catalog", "high"
    title_is_rerelease = title_run_type in TITLE_RERELEASE
    title_is_special = title_run_type in TITLE_SPECIAL
    title_is_limited = title_run_type in TITLE_LIMITED
    if category == "standard":
        if title_is_rerelease:
            return SEGMENT_AMBIGUOUS_RERELEASE, "catalog_title_disagreement", "low"
        if title_is_special:
            return SEGMENT_AMBIGUOUS_SPECIAL, "catalog_title_disagreement", "low"
        if title_is_limited:
            return SEGMENT_AMBIGUOUS_LIMITED, "catalog_title_disagreement", "low"
        if title_run_type == "normal_first_run":
            return SEGMENT_ORDINARY, "catalog", "high"
        return SEGMENT_OTHER, "catalog", "low"
    if not has_source_film_id or category in {"", "unknown"}:
        if title_is_rerelease:
            return SEGMENT_RERELEASE_TITLE, "title_only", "low"
        if title_is_special:
            return SEGMENT_SPECIAL_TITLE, "title_only", "low"
        if title_run_type == "normal_first_run":
            return SEGMENT_ORDINARY_TITLE, "title_only", "low"
        return SEGMENT_OTHER, "title_only", "low"
    return SEGMENT_OTHER, "catalog", "low"


def _parse_iso_date(value: str | None) -> date | None:
    text = (value or "").strip()
    if len(text) < 10:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _parse_scheduled(value: str | None) -> tuple[date | None, int | None]:
    text = (value or "").strip()
    if len(text) < 10:
        return None, None
    show_date = _parse_iso_date(text)
    minutes = None
    if "T" in text:
        clock = text.split("T", 1)[1][:5]
        minutes = parse_time_to_minutes(clock)
    return show_date, minutes


def screening_removed_before_show(
    *,
    show_date: date,
    removed_at: str | None,
    cancelled_at: str | None,
    last_snapshot: date | None,
    current_status: str,
) -> bool:
    """True when the screening left the feed before it could have played.

    ``past`` wins over ``no_longer_observed`` in the ledger once the show date
    is earlier than as-of, so a removal has to be recovered from ``removed_at``
    plus a last snapshot that never reached the show date.
    """
    if cancelled_at:
        return True
    if current_status == "no_longer_observed":
        return True
    removed = _parse_iso_date(removed_at)
    if removed is None or last_snapshot is None:
        return False
    return last_snapshot < show_date and removed <= show_date


def classify_engagement_end(
    *,
    last_scheduled: date,
    last_occurred: date | None,
    horizon: date | None,
) -> str:
    """Censor runs whose schedule is still open or sitting on the publication edge.

    A last showtime is a confirmed end only when nothing later is scheduled and
    the theater's dense published horizon is strictly after that date. The
    horizon test is what keeps an unpublished next week from looking like an ending.
    """
    if last_occurred is None:
        return FUTURE_ONLY
    if last_scheduled > last_occurred:
        return CENSORED_ACTIVE
    if horizon is None or last_occurred >= horizon:
        return CENSORED_FRONTIER
    return CONFIRMED


def dense_horizon(daily_counts: Mapping[date, int], *, baseline_end: date) -> date | None:
    """Latest date still on the continuous dense part of a theater calendar.

    Baseline median uses dates strictly before ``baseline_end`` (the as-of
    date). Isolated one- and two-day dips stay inside the horizon. Three
    sparse days in a row end it, so a later one-off event does not pull the
    horizon forward across an unpublished gap.
    """
    if not daily_counts:
        return None
    baseline = [count for day, count in daily_counts.items() if day < baseline_end and count > 0]
    if not baseline:
        baseline = [count for count in daily_counts.values() if count > 0]
    if not baseline:
        return None
    threshold = DENSE_RATIO * float(statistics.median(baseline))
    start = min(daily_counts)
    end = max(daily_counts)
    last_good: date | None = None
    hole = 0
    cursor = start
    while cursor <= end:
        count = daily_counts.get(cursor, 0)
        if count >= threshold and count > 0:
            last_good = cursor
            hole = 0
        else:
            hole += 1
            if last_good is not None and hole > DENSE_HOLE_DAYS:
                break
        cursor += timedelta(days=1)
    return last_good


def reconstruct_announcement(
    scheduled: Sequence[Screening],
    removed: Sequence[Screening],
    *,
    dataset_start: date,
    snapshot_dates: Sequence[date],
) -> dict[str, Any]:
    """Compare the schedule on the first observation with the eventual schedule.

    Requires a prior snapshot so the first observation is not the left edge of
    collection, and a first showtime strictly after that observation so the
    engagement was seen before it opened.
    """
    pool = list(scheduled) + list(removed)
    if not pool:
        return {
            "announcement_observed": False,
            "initial_first_show": None,
            "initial_last_show": None,
            "initial_span_days": None,
            "initial_screening_count": 0,
            "share_visible_at_first_observation": None,
            "days_added": None,
            "extended": None,
            "shortened": None,
            "dates_added_count": 0,
            "removed_screening_count": len(removed),
            "left_truncated": True,
            "first_observation": None,
        }
    first_observation = min(item.first_snapshot for item in pool)
    prior_exists = any(day < first_observation for day in snapshot_dates)
    start = min(item.show_date for item in scheduled) if scheduled else min(item.show_date for item in pool)
    left_truncated = first_observation <= dataset_start or not prior_exists
    initial = [item for item in scheduled if item.first_snapshot == first_observation]
    initial_dates = {item.show_date for item in initial}
    eventual_dates = {item.show_date for item in scheduled}
    announcement_observed = (
        not left_truncated
        and bool(initial_dates)
        and start > first_observation
    )
    initial_first = min(initial_dates) if initial_dates else None
    initial_last = max(initial_dates) if initial_dates else None
    eventual_last = max(eventual_dates) if eventual_dates else None
    days_added = None
    extended = None
    shortened = None
    if announcement_observed and initial_last is not None and eventual_last is not None:
        days_added = (eventual_last - initial_last).days
        extended = days_added > 0
        shortened = days_added < 0
    share = None
    if scheduled:
        share = len(initial) / len(scheduled)
    return {
        "announcement_observed": announcement_observed,
        "initial_first_show": initial_first,
        "initial_last_show": initial_last,
        "initial_span_days": (
            (initial_last - initial_first).days + 1
            if initial_first is not None and initial_last is not None
            else None
        ),
        "initial_screening_count": len(initial),
        "share_visible_at_first_observation": share if announcement_observed else None,
        "days_added": days_added,
        "extended": extended,
        "shortened": shortened,
        "dates_added_count": len(eventual_dates - initial_dates) if announcement_observed else 0,
        "removed_screening_count": len(removed),
        "left_truncated": left_truncated,
        "first_observation": first_observation,
    }


def _attach_removed(
    removed: Sequence[Screening],
    start: date,
    end: date,
    next_start: date | None,
    *,
    gap_threshold_days: int,
) -> list[Screening]:
    attached: list[Screening] = []
    for item in removed:
        if start <= item.show_date <= end:
            attached.append(item)
            continue
        if item.show_date <= end:
            continue
        if next_start is not None and item.show_date >= next_start:
            continue
        dark = (item.show_date - end).days - 1
        if dark < gap_threshold_days:
            attached.append(item)
    return attached


def build_engagements(
    screenings: Sequence[Screening],
    *,
    level: str,
    gap_threshold_days: int,
    dataset_start: date,
    snapshot_dates: Sequence[date],
    as_of: date,
    horizons: Mapping[str, date | None],
    friday_baseline: Mapping[str, float],
    theater_daily: Mapping[tuple[str, date], int],
) -> list[Engagement]:
    """Split film or film×theater calendars on long dark gaps and censor ends."""
    grouped: dict[tuple[str, str], list[Screening]] = defaultdict(list)
    for item in screenings:
        if item.canceled:
            continue
        key = (item.film_id, item.theater_id if level == "film_theater" else "")
        grouped[key].append(item)

    engagements: list[Engagement] = []
    for (film_id, theater_id), rows in grouped.items():
        active = [item for item in rows if not item.removed_before_show]
        removed = [item for item in rows if item.removed_before_show]
        dates = sorted({item.show_date for item in active})
        segments = segment_occurred_dates(dates, gap_threshold_days=gap_threshold_days)
        if not segments:
            continue
        sample = active[0]
        for index, segment in enumerate(segments):
            start, end = segment[0], segment[-1]
            next_start = segments[index + 1][0] if index + 1 < len(segments) else None
            members = tuple(item for item in active if start <= item.show_date <= end)
            removed_members = tuple(
                _attach_removed(
                    removed,
                    start,
                    end,
                    next_start,
                    gap_threshold_days=gap_threshold_days,
                )
            )
            occurred_dates = sorted({item.show_date for item in members if item.show_date < as_of})
            last_occurred = occurred_dates[-1] if occurred_dates else None
            if level == "film_theater":
                horizon = horizons.get(theater_id)
                theaters_for_friday = [theater_id]
            else:
                played = {item.theater_id for item in members}
                known = [horizons.get(tid) for tid in played]
                horizon = min((item for item in known if item is not None), default=None)
                if any(item is None for item in known):
                    horizon = None
                theaters_for_friday = sorted(played)
            status = classify_engagement_end(
                last_scheduled=end,
                last_occurred=last_occurred,
                horizon=horizon,
            )
            end_for_weekday = last_occurred if status == CONFIRMED else end
            announcement = reconstruct_announcement(
                members,
                removed_members,
                dataset_start=dataset_start,
                snapshot_dates=snapshot_dates,
            )
            next_friday = next_programming_friday(end_for_weekday)
            published_flags = []
            for tid in theaters_for_friday:
                baseline = friday_baseline.get(tid) or 0.0
                count = theater_daily.get((tid, next_friday), 0)
                if baseline <= 0:
                    published_flags.append(False)
                else:
                    published_flags.append(count >= DENSE_RATIO * baseline)
            engagements.append(
                Engagement(
                    level=level,
                    film_id=film_id,
                    title=sample.title,
                    theater_id=theater_id,
                    sequence=index + 1,
                    segment=sample.segment,
                    segment_source=sample.segment_source,
                    segment_confidence=sample.segment_confidence,
                    catalog_category=sample.catalog_category,
                    title_run_type=sample.title_run_type,
                    identity_kind=sample.identity_kind,
                    start_date=start,
                    end_date=end,
                    last_occurred=last_occurred,
                    span_days=(end - start).days + 1,
                    distinct_show_dates=len(segment),
                    screening_count=len(members),
                    occurred_screening_count=sum(1 for item in members if item.show_date < as_of),
                    first_observation=announcement["first_observation"],
                    left_truncated=bool(announcement["left_truncated"]),
                    end_status=status,
                    end_weekday=weekday_name(end_for_weekday),
                    next_programming_friday=next_friday,
                    next_friday_published=all(published_flags) if published_flags else None,
                    announcement_observed=bool(announcement["announcement_observed"]),
                    initial_first_show=announcement["initial_first_show"],
                    initial_last_show=announcement["initial_last_show"],
                    initial_span_days=announcement["initial_span_days"],
                    initial_screening_count=int(announcement["initial_screening_count"]),
                    share_visible_at_first_observation=announcement[
                        "share_visible_at_first_observation"
                    ],
                    days_added=announcement["days_added"],
                    extended=announcement["extended"],
                    shortened=announcement["shortened"],
                    dates_added_count=int(announcement["dates_added_count"]),
                    removed_screening_count=int(announcement["removed_screening_count"]),
                    screenings=members,
                    removed_screenings=removed_members,
                )
            )
    engagements.sort(key=lambda item: (item.title.casefold(), item.theater_id, item.start_date, item.sequence))
    return engagements


def weekday_distribution(engagements: Sequence[Engagement]) -> dict[str, Any]:
    counts = Counter(item.end_weekday for item in engagements)
    total = sum(counts.values())
    rows = []
    for name in WEEKDAY_NAMES:
        count = counts.get(name, 0)
        interval = wilson_interval(count, total)
        rows.append(
            {
                "weekday": name,
                "count": count,
                "share": (count / total) if total else None,
                "wilson_low": interval[0] if interval else None,
                "wilson_high": interval[1] if interval else None,
            }
        )
    thursday = counts.get("Thursday", 0)
    return {
        "n": total,
        "thursday_count": thursday,
        "thursday_share": (thursday / total) if total else None,
        "friday_share": (counts.get("Friday", 0) / total) if total else None,
        "saturday_share": (counts.get("Saturday", 0) / total) if total else None,
        "sunday_share": (counts.get("Sunday", 0) / total) if total else None,
        "by_weekday": rows,
    }


def _percentile(values: Sequence[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    pos = (len(ordered) - 1) * q
    lo = math.floor(pos)
    hi = min(lo + 1, len(ordered) - 1)
    frac = pos - lo
    return float(ordered[lo] * (1.0 - frac) + ordered[hi] * frac)


def summarize_numbers(values: Sequence[float]) -> dict[str, float | int | None]:
    if not values:
        return {"n": 0, "median": None, "mean": None, "p10": None, "p90": None, "stdev": None, "cv": None}
    mean = float(statistics.fmean(values))
    stdev = float(statistics.stdev(values)) if len(values) >= 2 else 0.0
    return {
        "n": len(values),
        "median": float(statistics.median(values)),
        "mean": mean,
        "p10": _percentile(values, 0.10),
        "p90": _percentile(values, 0.90),
        "stdev": stdev,
        "cv": (stdev / mean) if mean else None,
    }


def thursday_friday_transition(
    *,
    thursday_counts: Mapping[str, int],
    friday_counts: Mapping[str, int],
) -> dict[str, int]:
    """Decompose one theater's Thursday → Friday film schedule.

    Keys are film ids. Counts are screening counts. Films present both days
    are continuing. The identity is an accounting identity, not a causal claim.
    """
    thursday_films = {key for key, count in thursday_counts.items() if count > 0}
    friday_films = {key for key, count in friday_counts.items() if count > 0}
    departed = thursday_films - friday_films
    incoming = friday_films - thursday_films
    continuing = thursday_films & friday_films
    departed_screenings = sum(thursday_counts[key] for key in departed)
    incoming_screenings = sum(friday_counts[key] for key in incoming)
    reduced = 0
    added_continuing = 0
    kept = 0
    for key in continuing:
        thu = thursday_counts[key]
        fri = friday_counts[key]
        kept += min(thu, fri)
        if fri < thu:
            reduced += thu - fri
        elif fri > thu:
            added_continuing += fri - thu
    thursday_total = sum(thursday_counts.values())
    friday_total = sum(friday_counts.values())
    return {
        "thursday_screenings": thursday_total,
        "friday_screenings": friday_total,
        "net_screening_change": friday_total - thursday_total,
        "films_thursday": len(thursday_films),
        "films_friday": len(friday_films),
        "films_departing": len(departed),
        "films_incoming": len(incoming),
        "films_continuing": len(continuing),
        "screenings_lost_departed_films": departed_screenings,
        "screenings_lost_reduced_continuing": reduced,
        "incumbent_screenings_lost": departed_screenings + reduced,
        "incoming_friday_screenings": incoming_screenings,
        "continuing_screenings_kept": kept,
        "continuing_screenings_added": added_continuing,
    }


def schedule_completeness(
    screenings: Sequence[Screening],
    *,
    observation_date: date,
    show_date: date,
) -> dict[str, int | float | None]:
    """Share of non-removed screenings on *show_date* already seen by *observation_date*."""
    eventual = [
        item
        for item in screenings
        if item.show_date == show_date and not item.canceled and not item.removed_before_show
    ]
    known = [item for item in eventual if item.first_snapshot <= observation_date]
    total = len(eventual)
    return {
        "eventual_screenings": total,
        "known_screenings": len(known),
        "completeness": (len(known) / total) if total else None,
    }


def completeness_by_lag(
    screenings: Sequence[Screening],
    *,
    dataset_start: date,
    as_of: date,
    max_lag: int = 21,
) -> list[dict[str, Any]]:
    """Share of occurred screenings already known *lag* days before the show."""
    occurred = [
        item
        for item in screenings
        if not item.canceled and not item.removed_before_show and dataset_start <= item.show_date < as_of
    ]
    rows = []
    for lag in range(0, max_lag + 1):
        eligible = [
            item
            for item in occurred
            if item.show_date - timedelta(days=lag) >= dataset_start
        ]
        known = [item for item in eligible if item.first_snapshot <= item.show_date - timedelta(days=lag)]
        total = len(eligible)
        rows.append(
            {
                "days_before_showtime": lag,
                "n": total,
                "known": len(known),
                "completeness": (len(known) / total) if total else None,
            }
        )
    return rows


def _segment_label(segment: str) -> str:
    return {
        SEGMENT_ORDINARY: "Ordinary catalog releases",
        SEGMENT_RERELEASE: "Catalog rereleases",
        SEGMENT_SPECIAL: "Catalog special events",
        SEGMENT_AMBIGUOUS_RERELEASE: "Ambiguous rerelease (title vs catalog)",
        SEGMENT_RERELEASE_TITLE: "Title-only rerelease",
        SEGMENT_AMBIGUOUS_SPECIAL: "Ambiguous special (title vs catalog)",
        SEGMENT_SPECIAL_TITLE: "Title-only special",
    }.get(segment, segment)


def _round(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _engagement_row(item: Engagement, theater_names: Mapping[str, str]) -> dict[str, Any]:
    return {
        "level": item.level,
        "film_id": item.film_id,
        "title": item.title,
        "theater_id": item.theater_id,
        "theater_name": theater_names.get(item.theater_id, item.theater_id),
        "sequence": item.sequence,
        "segment": item.segment,
        "segment_source": item.segment_source,
        "segment_confidence": item.segment_confidence,
        "catalog_category": item.catalog_category,
        "title_run_type": item.title_run_type,
        "identity_kind": item.identity_kind,
        "start_date": item.start_date.isoformat(),
        "end_date": item.end_date.isoformat(),
        "last_occurred": item.last_occurred.isoformat() if item.last_occurred else "",
        "span_days": item.span_days,
        "distinct_show_dates": item.distinct_show_dates,
        "screening_count": item.screening_count,
        "occurred_screening_count": item.occurred_screening_count,
        "end_status": item.end_status,
        "end_weekday": item.end_weekday,
        "left_truncated": item.left_truncated,
        "first_observation": item.first_observation.isoformat(),
        "announcement_observed": item.announcement_observed,
        "initial_first_show": item.initial_first_show.isoformat() if item.initial_first_show else "",
        "initial_last_show": item.initial_last_show.isoformat() if item.initial_last_show else "",
        "initial_span_days": item.initial_span_days if item.initial_span_days is not None else "",
        "initial_screening_count": item.initial_screening_count,
        "share_visible_at_first_observation": _round(item.share_visible_at_first_observation),
        "days_added": item.days_added if item.days_added is not None else "",
        "extended": item.extended if item.extended is not None else "",
        "shortened": item.shortened if item.shortened is not None else "",
        "dates_added_count": item.dates_added_count,
        "removed_screening_count": item.removed_screening_count,
        "next_programming_friday": (
            item.next_programming_friday.isoformat() if item.next_programming_friday else ""
        ),
        "next_friday_published": item.next_friday_published if item.next_friday_published is not None else "",
        "retrospective": True,
    }


def _filter_confirmed(engagements: Sequence[Engagement], segment: str, *, week_plus: bool) -> list[Engagement]:
    rows = [item for item in engagements if item.confirmed and item.segment == segment]
    if week_plus:
        rows = [item for item in rows if item.week_plus]
    return rows


def _daily_maps(
    screenings: Sequence[Screening],
) -> tuple[dict[tuple[str, date], int], dict[tuple[str, date], set[str]], dict[tuple[str, date], Counter[str]]]:
    counts: dict[tuple[str, date], int] = Counter()
    films: dict[tuple[str, date], set[str]] = defaultdict(set)
    blocks: dict[tuple[str, date], Counter[str]] = defaultdict(Counter)
    for item in screenings:
        if item.canceled or item.removed_before_show:
            continue
        key = (item.theater_id, item.show_date)
        counts[key] += 1
        films[key].add(item.film_id)
        block = time_block(item.minutes)
        if block:
            blocks[key][block] += 1
    return counts, films, blocks


def _spearman(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    if len(xs) < 3 or len(xs) != len(ys):
        return None
    try:
        from scipy.stats import spearmanr
    except ImportError:
        return None
    coef, _pvalue = spearmanr(xs, ys)
    if coef is None or (isinstance(coef, float) and math.isnan(coef)):
        return None
    return float(coef)


def _contraction_series(engagement: Engagement, *, as_of: date) -> dict[int, int | None]:
    """Screenings per day from D-14 through D0. Days before the run starts are null."""
    if engagement.last_occurred is None:
        return {}
    counts = Counter(
        item.show_date
        for item in engagement.screenings
        if item.show_date < as_of and not item.removed_before_show
    )
    series: dict[int, int | None] = {}
    for offset in range(0, 15):
        day = engagement.last_occurred - timedelta(days=offset)
        if day < engagement.start_date:
            series[-offset] = None
        else:
            series[-offset] = counts.get(day, 0)
    return series


def _share_text(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.1%}"


def build_candidate_implications(summary: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Provisional review labels. These are not production decisions."""
    implications: list[dict[str, Any]] = []

    def add(pattern: str, label: str, evidence: str, n: int | None) -> None:
        implications.append(
            {
                "pattern": pattern,
                "provisional_label": label,
                "evidence": evidence,
                "n": n,
                "status": "candidate_for_human_review",
            }
        )

    q1 = summary["questions"]["end_weekday"]
    ordinary = q1["film_theater_ordinary_week_plus"]
    n = ordinary["n"]
    share = ordinary["thursday_share"]
    frontier = q1["thursday_among_publication_frontier"]
    if n < 30 or share is None:
        add(
            "Ordinary film×theater runs end on Thursday",
            "insufficient evidence",
            f"Confirmed ordinary runs spanning at least 7 days: n={n}.",
            n,
        )
    else:
        low = ordinary["thursday_wilson_low"]
        by_day = {row["weekday"]: row for row in ordinary["by_weekday"]}
        wed_share = by_day.get("Wednesday", {}).get("share") or 0
        wed_count = by_day.get("Wednesday", {}).get("count") or 0
        theater_bits = [
            row
            for row in q1.get("by_theater", [])
            if row.get("n", 0) >= 20 and row.get("thursday_share") is not None
        ]
        if theater_bits:
            low_theater = min(theater_bits, key=lambda row: row["thursday_share"])
            high_theater = max(theater_bits, key=lambda row: row["thursday_share"])
            theater_sentence = (
                f" Among theaters with n≥20, Thursday share ranges from "
                f"{low_theater['thursday_share']:.1%} at {low_theater['theater_name']} "
                f"(n={low_theater['n']}) to {high_theater['thursday_share']:.1%} at "
                f"{high_theater['theater_name']} (n={high_theater['n']})."
            )
        else:
            theater_sentence = ""
        if share >= 0.60 and low is not None and low >= 0.50:
            label = "possible hard rule"
        elif share >= 0.40:
            label = "possible model feature"
        else:
            label = "likely not useful"
        evidence = (
            f"Confirmed Thursday share={share:.1%} (n={n}, Wilson low={low:.1%}). "
            f"Wednesday share={wed_share:.1%} (n={wed_count}). "
            f"Publication-frontier n={frontier['n']}."
            f"{theater_sentence}"
        )
        add("Ordinary film×theater runs end on Thursday", label, evidence, n)
        combined = wed_share + (share or 0)
        if n >= 30 and combined >= 0.90:
            add(
                "Ordinary week-plus film×theater runs end on Wednesday or Thursday",
                "possible hard rule",
                (
                    f"Wednesday {wed_share:.1%} ({wed_count}) plus Thursday {share:.1%} "
                    f"({ordinary['thursday_count']}) = {combined:.1%} of n={n}. "
                    f"Friday share={ordinary['friday_share'] or 0:.1%}, "
                    f"Saturday={ordinary['saturday_share'] or 0:.1%}, "
                    f"Sunday={ordinary['sunday_share'] or 0:.1%}, "
                    f"Tuesday count={by_day.get('Tuesday', {}).get('count', 0)}."
                ),
                n,
            )

    q2 = summary["questions"]["predetermined_engagements"]
    rerelease = q2["rerelease"]
    ordinary_ann = q2["ordinary"]
    if rerelease["n"] < 15:
        add(
            "Rerelease/special engagements are published in full at first observation",
            "insufficient evidence",
            (
                f"Catalog rereleases with an observed initial announcement and a confirmed end: "
                f"n={rerelease['n']}. Ambiguous title/catalog disagreements are excluded from this n "
                f"(ambiguous rerelease rows={q2['ambiguous_rerelease_n']})."
            ),
            rerelease["n"],
        )
    else:
        median_share = rerelease["median_share_visible"]
        extension_rate = rerelease["extension_rate"]
        ordinary_share = ordinary_ann["median_share_visible"]
        if (
            median_share is not None
            and extension_rate is not None
            and median_share >= 0.80
            and extension_rate <= 0.25
            and (ordinary_share is None or median_share - ordinary_share >= 0.15)
        ):
            label = "possible separate segment"
        elif median_share is not None and ordinary_share is not None and abs(median_share - ordinary_share) < 0.10:
            label = "likely not useful"
        else:
            label = "possible model feature"
        special = q2["special_event"]
        add(
            "Rerelease schedules are fixed at announcement, unlike ordinary releases",
            label,
            (
                f"Catalog rereleases: median share visible at first observation={_share_text(median_share)}, "
                f"extension rate={_share_text(extension_rate)}, "
                f"n={rerelease['n']}. Ordinary comparison median share={_share_text(ordinary_share)}, "
                f"n={ordinary_ann['n']}. Catalog specials, separately: median share visible="
                f"{_share_text(special['median_share_visible'])}, "
                f"extension rate={_share_text(special['extension_rate'])}, n={special['n']}."
            ),
            rerelease["n"],
        )
        if special["n"] < 15:
            add(
                "Catalog special events are published in full when first observed",
                "insufficient evidence",
                f"Confirmed specials with an observed initial announcement: n={special['n']}.",
                special["n"],
            )
        else:
            special_share = special["median_share_visible"]
            special_ext = special["extension_rate"]
            if (
                special_share is not None
                and special_ext is not None
                and special_share >= 0.80
                and special_ext <= 0.25
            ):
                special_label = "possible separate segment"
            else:
                special_label = "possible model feature"
            add(
                "Catalog special events are published in full when first observed",
                special_label,
                (
                    f"Median share of eventual screenings visible at first observation={_share_text(special_share)}, "
                    f"extension rate={_share_text(special_ext)}, "
                    f"n={special['n']}. Ordinary releases in the same filter: "
                    f"median share={_share_text(ordinary_share)}, "
                    f"extension rate={_share_text(ordinary_ann['extension_rate'])}, "
                    f"n={ordinary_ann['n']}."
                ),
                special["n"],
            )

    q3 = summary["questions"]["capacity"]
    cvs = [row["cv"] for row in q3["weekday_summary"] if row.get("cv") is not None and row["n"] >= 4]
    if not cvs:
        add("Theater daily screening volume is stable within weekday", "insufficient evidence", "No theater-weekday cells with n>=4.", 0)
    else:
        median_cv = float(statistics.median(cvs))
        if median_cv <= 0.15:
            label = "possible model feature"
        elif median_cv <= 0.30:
            label = "possible model feature"
        else:
            label = "likely not useful"
        add(
            "Within a weekday, theater screening volume is tight",
            label,
            f"Median within-weekday coefficient of variation across theater×weekday cells={median_cv:.2f} (cells={len(cvs)}).",
            len(cvs),
        )

    q4 = summary["questions"]["displacement"]
    spearman = q4.get("spearman_incoming_vs_incumbent_lost")
    n4 = q4.get("n_weeks") or 0
    if spearman is None or n4 < 30:
        add(
            "Incoming Friday screenings move with incumbent screenings lost",
            "insufficient evidence",
            f"Theater-weeks={n4}, Spearman={spearman}.",
            n4,
        )
    elif spearman >= 0.6:
        add(
            "Incoming Friday screenings move with incumbent screenings lost",
            "possible model feature",
            (
                f"Spearman r={spearman:.2f} across {n4} theater-weeks. "
                "This is an association in the schedule, not evidence that new films cause the losses."
            ),
            n4,
        )
    elif spearman < 0.3:
        add(
            "Incoming Friday screenings move with incumbent screenings lost",
            "likely not useful",
            f"Spearman r={spearman:.2f} across {n4} theater-weeks.",
            n4,
        )
    else:
        add(
            "Incoming Friday screenings move with incumbent screenings lost",
            "possible model feature",
            f"Spearman r={spearman:.2f} across {n4} theater-weeks. Association only.",
            n4,
        )

    q5 = summary["questions"]["contraction"]
    ordinary_path = q5["ordinary_week_plus"]
    n5 = ordinary_path["n"]
    d7 = ordinary_path.get("median_d7")
    d0 = ordinary_path.get("median_d0")
    if n5 < 30 or d7 is None or d0 is None:
        add(
            "Screenings decline over the final week before a confirmed exit",
            "insufficient evidence",
            f"Confirmed ordinary week-plus film×theater trajectories: n={n5}.",
            n5,
        )
    elif d7 > 0 and d0 <= 0.5 * d7:
        add(
            "Screenings decline over the final week before a confirmed exit",
            "possible model feature",
            f"Median screenings D-7={d7:.1f}, D0={d0:.1f}, n={n5}. Retrospective alignment on the eventual end date.",
            n5,
        )
    else:
        add(
            "Screenings decline over the final week before a confirmed exit",
            "likely not useful",
            f"Median screenings D-7={d7:.1f}, D0={d0:.1f}, n={n5}.",
            n5,
        )

    q6 = summary["questions"]["completeness"]
    by_weekday = {row["weekday"]: row for row in q6["by_observation_weekday"]}
    monday = by_weekday.get("Monday") or {}
    thursday = by_weekday.get("Thursday") or {}
    mon_c = monday.get("completeness")
    thu_c = thursday.get("completeness")
    mon_n = monday.get("n_screenings") or 0
    thu_n = thursday.get("n_screenings") or 0
    if mon_c is None or thu_c is None or min(mon_n, thu_n) < 50:
        add(
            "Missing next-week showtimes before Thursday can be unpublished schedule rather than an exit",
            "insufficient evidence",
            "Completeness of the upcoming Friday was not measurable for Monday and Thursday.",
            min(mon_n, thu_n),
        )
    elif thu_c - mon_c >= 0.25:
        add(
            "Missing next-week showtimes before Thursday can be unpublished schedule rather than an exit",
            "possible hard rule",
            (
                f"Pooled share of eventual upcoming-Friday screenings already known: "
                f"Monday={mon_c:.1%} (n={mon_n}), Thursday={thu_c:.1%} (n={thu_n}). "
                "This describes publication cadence, not a film's remaining run."
            ),
            min(mon_n, thu_n),
        )
    else:
        add(
            "Missing next-week showtimes before Thursday can be unpublished schedule rather than an exit",
            "possible model feature",
            f"Monday completeness={mon_c:.1%} (n={mon_n}), Thursday={thu_c:.1%} (n={thu_n}).",
            min(mon_n, thu_n),
        )
    return implications


def _announcement_population_summary(rows: Sequence[Engagement]) -> dict[str, Any]:
    shares = [
        item.share_visible_at_first_observation
        for item in rows
        if item.share_visible_at_first_observation is not None
    ]
    added = [item.days_added for item in rows if item.days_added is not None]
    extended = [item for item in rows if item.extended is True]
    n = len(rows)
    return {
        "n": n,
        "median_share_visible": float(statistics.median(shares)) if shares else None,
        "mean_share_visible": float(statistics.fmean(shares)) if shares else None,
        "extension_rate": (len(extended) / n) if n else None,
        "extension_count": len(extended),
        "median_days_added": float(statistics.median(added)) if added else None,
        "p90_days_added": _percentile([float(item) for item in added], 0.90) if added else None,
    }


def _trajectory_summary(engagements: Sequence[Engagement], *, as_of: date) -> dict[str, Any]:
    buckets: dict[int, list[int]] = {offset: [] for offset in range(0, 15)}
    d0_values: list[int] = []
    one_show_final = 0
    death_spiral = 0
    weekend_only = 0
    for item in engagements:
        series = _contraction_series(item, as_of=as_of)
        for offset in range(0, 15):
            value = series.get(-offset)
            if value is not None:
                buckets[offset].append(value)
        if series.get(0) is not None:
            d0_values.append(series[0])
            if series[0] <= 1:
                one_show_final += 1
        last_three = [series.get(0), series.get(-1), series.get(-2)]
        if all(value is not None and value <= 1 for value in last_three):
            death_spiral += 1
        weekend_days = []
        weekday_hits = 0
        weekend_hits = 0
        for offset in range(0, 7):
            value = series.get(-offset)
            if value is None or item.last_occurred is None:
                continue
            day = item.last_occurred - timedelta(days=offset)
            weekend_days.append(value)
            if day.weekday() >= 4 and value > 0:
                weekend_hits += value
            if day.weekday() < 4 and value > 0:
                weekday_hits += value
        if weekend_days and weekday_hits == 0 and weekend_hits > 0:
            weekend_only += 1
    n = len(engagements)

    def med(offset: int) -> float | None:
        values = buckets[offset]
        return float(statistics.median(values)) if values else None

    return {
        "n": n,
        "median_by_offset": {f"D-{offset}" if offset else "D0": med(offset) for offset in range(0, 15)},
        "mean_by_offset": {
            f"D-{offset}" if offset else "D0": (float(statistics.fmean(buckets[offset])) if buckets[offset] else None)
            for offset in range(0, 15)
        },
        "n_by_offset": {f"D-{offset}" if offset else "D0": len(buckets[offset]) for offset in range(0, 15)},
        "median_d14": med(14),
        "median_d7": med(7),
        "median_d3": med(3),
        "median_d1": med(1),
        "median_d0": med(0),
        "share_d0_at_most_one": (one_show_final / n) if n else None,
        "share_last_three_days_at_most_one": (death_spiral / n) if n else None,
        "share_weekend_only_final_week": (weekend_only / n) if n else None,
        "distribution": {
            label: summarize_numbers([float(value) for value in buckets[offset]])
            for label, offset in (("D-14", 14), ("D-7", 7), ("D-3", 3), ("D-1", 1), ("D0", 0))
        },
    }


def load_snapshot_infos(path: Path) -> list[SnapshotInfo]:
    rows: list[SnapshotInfo] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if payload.get("source") != SOURCE:
            continue
        snap_date = _parse_iso_date(payload.get("snapshot_date"))
        if snap_date is None:
            continue
        rows.append(
            SnapshotInfo(
                snapshot_date=snap_date,
                completeness=str(payload.get("completeness") or "unknown"),
                record_count=int(payload.get("record_count") or 0),
                reason=str(payload.get("reason") or ""),
            )
        )
    rows.sort(key=lambda item: item.snapshot_date)
    return rows


def load_premium_ids(path: Path) -> set[str]:
    found: set[str] = set()
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if '"source": "amc"' not in line and '"source":"amc"' not in line:
                continue
            payload = json.loads(line)
            if payload.get("source") != SOURCE or payload.get("record_type") == "lifecycle_header":
                continue
            if is_premium_format(payload.get("format_raw")):
                screening_id = payload.get("screening_id")
                if screening_id:
                    found.add(str(screening_id))
    return found


def load_screenings(
    lifecycle_path: Path,
    *,
    catalog: Mapping[str, Any],
    enabled_theaters: set[str],
    premium_ids: set[str],
) -> tuple[list[Screening], date]:
    screenings: list[Screening] = []
    as_of = date.today()
    with gzip.open(lifecycle_path, "rt", encoding="utf-8") as handle:
        first = handle.readline()
        header = json.loads(first)
        if header.get("as_of_date"):
            as_of = date.fromisoformat(header["as_of_date"])
        for line in handle:
            payload = json.loads(line)
            if payload.get("source") != SOURCE:
                continue
            theater_id = str(payload.get("theater_id") or "")
            if theater_id not in enabled_theaters:
                continue
            show_date, minutes = _parse_scheduled(payload.get("scheduled_local"))
            first_snapshot = _parse_iso_date(payload.get("first_snapshot_date"))
            last_snapshot = _parse_iso_date(payload.get("last_snapshot_date"))
            if show_date is None or first_snapshot is None:
                continue
            source_film_id = str(payload.get("source_film_id") or "").strip()
            film_key = str(payload.get("showtime_film_key") or payload.get("parent_film_key") or "unknown")
            product = catalog.get(source_film_id) if source_film_id else None
            catalog_title = product.title if product is not None else ""
            catalog_category = product.category if product is not None else "unknown"
            parent = str(payload.get("parent_display_title") or "").strip()
            title_blob = " ".join(
                part
                for part in (catalog_title, parent, film_key.replace("-", " "))
                if part
            )
            title_run_type = classify_run_type(title_blob)
            segment, source, confidence = assign_segment(
                catalog_category=catalog_category if product is not None else "unknown",
                title_run_type=title_run_type,
                has_source_film_id=bool(source_film_id),
            )
            if product is not None and catalog_title:
                title = catalog_title
            else:
                title = parent or film_key.replace("-", " ")
            film_id = source_film_id or f"title:{film_key}"
            removed = screening_removed_before_show(
                show_date=show_date,
                removed_at=payload.get("removed_at"),
                cancelled_at=payload.get("cancelled_at"),
                last_snapshot=last_snapshot,
                current_status=str(payload.get("current_status") or ""),
            )
            screenings.append(
                Screening(
                    screening_id=str(payload.get("screening_id") or ""),
                    film_id=film_id,
                    title=title,
                    theater_id=theater_id,
                    show_date=show_date,
                    minutes=minutes,
                    first_snapshot=first_snapshot,
                    removed_before_show=removed,
                    canceled=bool(payload.get("cancelled_at")),
                    premium=str(payload.get("screening_id") or "") in premium_ids,
                    catalog_category=catalog_category if product is not None else "unknown",
                    title_run_type=title_run_type,
                    segment=segment,
                    segment_source=source,
                    segment_confidence=confidence,
                    identity_kind="source_film_id" if source_film_id else "title_fallback",
                )
            )
    return screenings, as_of


def count_history_amc_occurred(
    path: Path,
    *,
    as_of: date,
    window_start: date | None = None,
    enabled_theaters: set[str] | None = None,
) -> int:
    """Count past AMC history rows inside the ledger window.

    The file restates today+future and also keeps older archive rows, so both
    are excluded from this cross-check.
    """
    if not path.is_file():
        return 0
    total = 0
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if str(row.get("source", "")).strip() != SOURCE:
                continue
            if str(row.get("isCanceled", "")).strip().lower() in {"true", "1", "yes"}:
                continue
            theater_id = str(row.get("theater_id", "")).strip()
            if enabled_theaters is not None and theater_id not in enabled_theaters:
                continue
            raw_date = str(row.get("Date") or "")
            parsed = None
            if "/" in raw_date:
                parts = raw_date.split("/")
                if len(parts) == 3:
                    try:
                        parsed = date(int(parts[2]), int(parts[0]), int(parts[1]))
                    except ValueError:
                        parsed = None
            else:
                parsed = _parse_iso_date(raw_date)
            if parsed is None or parsed >= as_of:
                continue
            if window_start is not None and parsed < window_start:
                continue
            total += 1
    return total


def _opening_week(engagement: Engagement, show: date) -> bool:
    return programming_week_friday(show) == programming_week_friday(engagement.start_date)


def run_questions(
    *,
    screenings: Sequence[Screening],
    film_theater: Sequence[Engagement],
    market: Sequence[Engagement],
    snapshots: Sequence[SnapshotInfo],
    as_of: date,
    dataset_start: date,
    theater_names: Mapping[str, str],
    horizons: Mapping[str, date | None],
    theater_daily: Mapping[tuple[str, date], int],
    theater_films: Mapping[tuple[str, date], set[str]],
    theater_blocks: Mapping[tuple[str, date], Counter[str]],
    history_occurred_count: int | None,
) -> dict[str, Any]:
    """Compute the six research questions and the inspection tables behind them."""
    auditoria = {tid: inferred_auditorium_count(tid) for tid in theater_names}

    def pack_dist(rows: Sequence[Engagement]) -> dict[str, Any]:
        dist = weekday_distribution(rows)
        thursday = next(item for item in dist["by_weekday"] if item["weekday"] == "Thursday")
        dist["thursday_wilson_low"] = thursday["wilson_low"]
        dist["thursday_wilson_high"] = thursday["wilson_high"]
        published = [item for item in rows if item.next_friday_published]
        dist["next_friday_published_n"] = len(published)
        dist["next_friday_published_share"] = (len(published) / len(rows)) if rows else None
        return dist

    ordinary_ft = _filter_confirmed(film_theater, SEGMENT_ORDINARY, week_plus=True)
    ordinary_ft_all = _filter_confirmed(film_theater, SEGMENT_ORDINARY, week_plus=False)
    ordinary_mkt = _filter_confirmed(market, SEGMENT_ORDINARY, week_plus=True)
    rerelease_ft = _filter_confirmed(film_theater, SEGMENT_RERELEASE, week_plus=False)
    special_ft = _filter_confirmed(film_theater, SEGMENT_SPECIAL, week_plus=False)
    ambiguous_ft = _filter_confirmed(film_theater, SEGMENT_AMBIGUOUS_RERELEASE, week_plus=False)
    frontier = [item for item in film_theater if item.end_status == CENSORED_FRONTIER]
    active = [item for item in film_theater if item.end_status == CENSORED_ACTIVE]

    theater_rows = []
    for theater_id in sorted(theater_names):
        rows = [item for item in ordinary_ft if item.theater_id == theater_id]
        dist = weekday_distribution(rows)
        theater_rows.append(
            {
                "theater_id": theater_id,
                "theater_name": theater_names[theater_id],
                "n": dist["n"],
                "thursday_count": dist["thursday_count"],
                "thursday_share": dist["thursday_share"],
                "thursday_wilson_low": next(
                    item["wilson_low"] for item in dist["by_weekday"] if item["weekday"] == "Thursday"
                ),
                "thursday_wilson_high": next(
                    item["wilson_high"] for item in dist["by_weekday"] if item["weekday"] == "Thursday"
                ),
            }
        )

    non_thursday = [
        _engagement_row(item, theater_names)
        for item in ordinary_ft
        if item.end_weekday != "Thursday"
    ]

    q1 = {
        "population": (
            "Confirmed ends only: last occurred show is strictly before the theater dense horizon, "
            "and no later showtime remains on the schedule. Ordinary primary population also requires "
            f"catalog segment=ordinary and span>={ORDINARY_MIN_SPAN_DAYS} days. "
            "Rereleases and specials use catalog categories only; title disagreements are separate."
        ),
        "film_theater_ordinary_week_plus": pack_dist(ordinary_ft),
        "film_theater_ordinary_all_lengths": pack_dist(ordinary_ft_all),
        "market_ordinary_week_plus": pack_dist(ordinary_mkt),
        "film_theater_rerelease": pack_dist(rerelease_ft),
        "film_theater_special": pack_dist(special_ft),
        "film_theater_ambiguous_rerelease": pack_dist(ambiguous_ft),
        "thursday_among_publication_frontier": pack_dist(frontier),
        "weekday_among_still_scheduled": pack_dist(active),
        "by_theater": theater_rows,
        "non_thursday_examples": non_thursday[:80],
        "confirmed_film_theater_n": sum(1 for item in film_theater if item.confirmed),
        "confirmed_market_n": sum(1 for item in market if item.confirmed),
    }

    def announced(level_rows: Sequence[Engagement], segment: str) -> list[Engagement]:
        return [
            item
            for item in level_rows
            if item.segment == segment and item.announcement_observed and item.confirmed
        ]

    rerelease_ann = announced(film_theater, SEGMENT_RERELEASE)
    ordinary_ann = announced(film_theater, SEGMENT_ORDINARY)
    special_ann = announced(film_theater, SEGMENT_SPECIAL)
    ambiguous_ann = announced(film_theater, SEGMENT_AMBIGUOUS_RERELEASE)
    q2 = {
        "population": (
            "Film×theater engagements whose first snapshot is after collection started, "
            "whose first showtime is after that snapshot, and whose end is confirmed. "
            "Share visible uses scheduled screenings that were already present on the first snapshot "
            "divided by scheduled screenings that remained (removals excluded from the denominator). "
            "Removal counts are a lower bound: the ledger only infers absence from complete snapshots."
        ),
        "rerelease": _announcement_population_summary(rerelease_ann),
        "ordinary": _announcement_population_summary(ordinary_ann),
        "special_event": _announcement_population_summary(special_ann),
        "ambiguous_rerelease": _announcement_population_summary(ambiguous_ann),
        "ambiguous_rerelease_n": sum(1 for item in film_theater if item.segment == SEGMENT_AMBIGUOUS_RERELEASE),
        "examples": [],
    }

    # Capacity tables. Dense dates only for distribution stats; full series kept for charts.
    capacity_rows: list[dict[str, Any]] = []
    theaters_sorted = sorted(theater_names)
    all_days = sorted({day for (_tid, day) in theater_daily})
    for theater_id in theaters_sorted:
        horizon = horizons.get(theater_id)
        for day in all_days:
            key = (theater_id, day)
            count = theater_daily.get(key, 0)
            if count == 0 and (horizon is None or day > horizon + timedelta(days=21)):
                continue
            film_n = len(theater_films.get(key, ()))
            blocks = theater_blocks.get(key, Counter())
            screens = auditoria.get(theater_id)
            capacity_rows.append(
                {
                    "theater_id": theater_id,
                    "theater_name": theater_names[theater_id],
                    "show_date": day.isoformat(),
                    "weekday": weekday_name(day),
                    "screenings": count,
                    "distinct_films": film_n,
                    "morning": blocks.get("morning", 0),
                    "afternoon": blocks.get("afternoon", 0),
                    "prime": blocks.get("prime", 0),
                    "late": blocks.get("late", 0),
                    "inferred_auditoria": screens if screens is not None else "",
                    "screenings_per_inferred_auditorium": (
                        round(count / screens, 2) if screens else ""
                    ),
                    "holiday_note": HOLIDAYS.get(day, ""),
                    "dense": bool(horizon is not None and day <= horizon),
                    "occurred_day": day < as_of,
                }
            )
    weekday_summary = []
    outliers = []
    for theater_id in theaters_sorted:
        for weekday in WEEKDAY_NAMES:
            values = [
                float(row["screenings"])
                for row in capacity_rows
                if row["theater_id"] == theater_id and row["weekday"] == weekday and row["dense"]
            ]
            stats = summarize_numbers(values)
            film_values = [
                float(row["distinct_films"])
                for row in capacity_rows
                if row["theater_id"] == theater_id and row["weekday"] == weekday and row["dense"]
            ]
            film_stats = summarize_numbers(film_values)
            weekday_summary.append(
                {
                    "theater_id": theater_id,
                    "theater_name": theater_names[theater_id],
                    "weekday": weekday,
                    **{key: _round(value) if isinstance(value, float) else value for key, value in stats.items()},
                    "films_median": _round(film_stats["median"], 2) if film_stats["median"] is not None else None,
                    "films_p10": _round(film_stats["p10"], 2) if film_stats["p10"] is not None else None,
                    "films_p90": _round(film_stats["p90"], 2) if film_stats["p90"] is not None else None,
                }
            )
            if stats["n"] and stats["p10"] is not None and stats["p90"] is not None and stats["n"] >= 4:
                for row in capacity_rows:
                    if row["theater_id"] != theater_id or row["weekday"] != weekday or not row["dense"]:
                        continue
                    if row["screenings"] < stats["p10"] or row["screenings"] > stats["p90"]:
                        outliers.append(
                            {
                                **row,
                                "p10": _round(stats["p10"], 2),
                                "p90": _round(stats["p90"], 2),
                                "direction": "low" if row["screenings"] < stats["p10"] else "high",
                            }
                        )
    # Within-theater CV of daily totals on dense dates, plus weekday-only CV already in cells.
    overall_cv = []
    for theater_id in theaters_sorted:
        values = [float(row["screenings"]) for row in capacity_rows if row["theater_id"] == theater_id and row["dense"]]
        overall_cv.append({"theater_id": theater_id, "theater_name": theater_names[theater_id], **summarize_numbers(values)})
    q3 = {
        "population": (
            "Daily scheduled screenings that were not canceled and not removed before the show. "
            "Distribution stats use the continuous dense horizon only, so the unpublished tail "
            "does not look like a collapse in programming. Auditorium counts are parsed from the theater id."
        ),
        "horizons": {tid: (horizons[tid].isoformat() if horizons.get(tid) else None) for tid in theaters_sorted},
        "weekday_summary": weekday_summary,
        "theater_overall": overall_cv,
        "outlier_count": len(outliers),
        "capacity_rows": capacity_rows,
        "outliers": outliers,
    }

    # Thursday → Friday on dense occurred Fridays.
    transitions = []
    fridays = sorted(
        {
            day
            for (_tid, day) in theater_daily
            if day.weekday() == 4 and dataset_start <= day < as_of
        }
    )
    film_day: dict[tuple[str, date, str], int] = Counter()
    for item in screenings:
        if item.canceled or item.removed_before_show or item.show_date >= as_of:
            continue
        film_day[(item.theater_id, item.show_date, item.film_id)] += 1
    for friday in fridays:
        thursday = friday - timedelta(days=1)
        for theater_id in theaters_sorted:
            horizon = horizons.get(theater_id)
            if horizon is None or friday > horizon or thursday > horizon:
                continue
            thu_map = {
                film_id: count
                for (tid, day, film_id), count in film_day.items()
                if tid == theater_id and day == thursday
            }
            fri_map = {
                film_id: count
                for (tid, day, film_id), count in film_day.items()
                if tid == theater_id and day == friday
            }
            if not thu_map and not fri_map:
                continue
            stats = thursday_friday_transition(thursday_counts=thu_map, friday_counts=fri_map)
            transitions.append(
                {
                    "theater_id": theater_id,
                    "theater_name": theater_names[theater_id],
                    "thursday": thursday.isoformat(),
                    "friday": friday.isoformat(),
                    "holiday_note": HOLIDAYS.get(thursday, "") or HOLIDAYS.get(friday, ""),
                    **stats,
                }
            )
    xs = [float(row["incoming_friday_screenings"]) for row in transitions]
    ys = [float(row["incumbent_screenings_lost"]) for row in transitions]
    q4 = {
        "population": (
            "Occurred Thursday→Friday pairs inside each theater's dense horizon. "
            "Incoming screenings are Friday screenings of films absent on Thursday. "
            "Incumbent screenings lost are Thursday screenings of films absent on Friday "
            "plus Thursday screenings dropped by films that continued with fewer shows."
        ),
        "n_weeks": len(transitions),
        "spearman_incoming_vs_incumbent_lost": _round(_spearman(xs, ys), 4),
        "spearman_incoming_films_vs_departing_films": _round(
            _spearman(
                [float(row["films_incoming"]) for row in transitions],
                [float(row["films_departing"]) for row in transitions],
            ),
            4,
        ),
        "median_net_change": (
            float(statistics.median([row["net_screening_change"] for row in transitions])) if transitions else None
        ),
        "mean_incoming": float(statistics.fmean(xs)) if xs else None,
        "mean_incumbent_lost": float(statistics.fmean(ys)) if ys else None,
        "transitions": transitions,
    }

    def short_long(rows: Sequence[Engagement]) -> tuple[list[Engagement], list[Engagement]]:
        short = [item for item in rows if item.span_days < 14]
        long = [item for item in rows if item.span_days >= 28]
        return short, long

    ordinary_short, ordinary_long = short_long(ordinary_ft_all)
    q5_groups = {
        "ordinary_week_plus": _trajectory_summary(ordinary_ft, as_of=as_of),
        "ordinary_all_lengths": _trajectory_summary(ordinary_ft_all, as_of=as_of),
        "ordinary_short_under_14": _trajectory_summary(ordinary_short, as_of=as_of),
        "ordinary_long_at_least_28": _trajectory_summary(ordinary_long, as_of=as_of),
        "rerelease": _trajectory_summary(rerelease_ft, as_of=as_of),
        "special_event": _trajectory_summary(special_ft, as_of=as_of),
    }
    market_confirmed = [item for item in market if item.confirmed and item.segment == SEGMENT_ORDINARY and item.week_plus]
    market_theater_path = _market_theater_path(market_confirmed)
    q5 = {
        "population": (
            "Retrospective. Confirmed film×theater exits aligned on the last occurred show date. "
            "Days before the engagement started are omitted rather than treated as zero. "
            "Theater-count path is market-level ordinary week-plus exits."
        ),
        "ordinary_week_plus": q5_groups["ordinary_week_plus"],
        "groups": q5_groups,
        "market_theater_count": market_theater_path,
        "premium_screenings": sum(1 for item in screenings if item.premium and not item.canceled),
        "premium_share_of_screenings": (
            sum(1 for item in screenings if item.premium and not item.canceled and not item.removed_before_show)
            / max(1, sum(1 for item in screenings if not item.canceled and not item.removed_before_show))
        ),
    }

    snapshot_days = [item.snapshot_date for item in snapshots]
    completeness_rows = []
    pooled: dict[str, list[int]] = {name: [0, 0] for name in WEEKDAY_NAMES}
    pooled_new: dict[str, list[int]] = {name: [0, 0] for name in WEEKDAY_NAMES}
    pooled_cont: dict[str, list[int]] = {name: [0, 0] for name in WEEKDAY_NAMES}
    pooled_rerelease: dict[str, list[int]] = {name: [0, 0] for name in WEEKDAY_NAMES}
    pooled_theater: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    market_sequences: dict[str, list[Engagement]] = defaultdict(list)
    for item in market:
        market_sequences[item.film_id].append(item)

    def market_engagement_for(item: Screening) -> Engagement | None:
        for engagement in market_sequences.get(item.film_id, []):
            if engagement.start_date <= item.show_date <= engagement.end_date:
                return engagement
        return None

    for snap in snapshot_days:
        friday = upcoming_friday(snap)
        if friday >= as_of or friday <= snap and snap.weekday() != 4:
            continue
        if friday < dataset_start:
            continue
        day_screenings = [
            item
            for item in screenings
            if item.show_date == friday and not item.canceled and not item.removed_before_show
        ]
        if not day_screenings:
            continue
        known = [item for item in day_screenings if item.first_snapshot <= snap]
        name = weekday_name(snap)
        pooled[name][0] += len(known)
        pooled[name][1] += len(day_screenings)
        for item in day_screenings:
            engagement = market_engagement_for(item)
            bucket = None
            if engagement is not None and engagement.segment == SEGMENT_RERELEASE:
                bucket = pooled_rerelease
            elif (
                engagement is not None
                and engagement.segment == SEGMENT_ORDINARY
                and _opening_week(engagement, item.show_date)
            ):
                bucket = pooled_new
            elif engagement is not None and engagement.segment == SEGMENT_ORDINARY:
                bucket = pooled_cont
            is_known = item.first_snapshot <= snap
            if bucket is not None:
                bucket[name][1] += 1
                bucket[name][0] += int(is_known)
            pooled_theater[(item.theater_id, name)][1] += 1
            pooled_theater[(item.theater_id, name)][0] += int(is_known)
        completeness_rows.append(
            {
                "observation_date": snap.isoformat(),
                "observation_weekday": name,
                "upcoming_friday": friday.isoformat(),
                "known": len(known),
                "eventual": len(day_screenings),
                "completeness": len(known) / len(day_screenings),
            }
        )

    def pooled_table(source: Mapping[str, Sequence[int]]) -> list[dict[str, Any]]:
        rows = []
        for name in WEEKDAY_NAMES:
            known, total = source[name]
            interval = wilson_interval(known, total)
            rows.append(
                {
                    "weekday": name,
                    "known": known,
                    "n_screenings": total,
                    "completeness": (known / total) if total else None,
                    "wilson_low": interval[0] if interval else None,
                    "wilson_high": interval[1] if interval else None,
                }
            )
        return rows

    lag_rows = completeness_by_lag(screenings, dataset_start=dataset_start, as_of=as_of)
    # Segment-specific lag for new ordinary vs continuing ordinary vs rerelease.
    def lag_for(predicate) -> list[dict[str, Any]]:
        chosen = [item for item in screenings if predicate(item)]
        return completeness_by_lag(chosen, dataset_start=dataset_start, as_of=as_of)

    def is_ordinary_new(item: Screening) -> bool:
        engagement = market_engagement_for(item)
        return bool(
            engagement
            and engagement.segment == SEGMENT_ORDINARY
            and _opening_week(engagement, item.show_date)
            and not item.canceled
            and not item.removed_before_show
        )

    def is_ordinary_cont(item: Screening) -> bool:
        engagement = market_engagement_for(item)
        return bool(
            engagement
            and engagement.segment == SEGMENT_ORDINARY
            and not _opening_week(engagement, item.show_date)
            and not item.canceled
            and not item.removed_before_show
        )

    def is_rerelease(item: Screening) -> bool:
        engagement = market_engagement_for(item)
        return bool(engagement and engagement.segment == SEGMENT_RERELEASE and not item.canceled and not item.removed_before_show)

    theater_completeness = []
    for theater_id in theaters_sorted:
        for name in WEEKDAY_NAMES:
            known, total = pooled_theater.get((theater_id, name), [0, 0])
            theater_completeness.append(
                {
                    "theater_id": theater_id,
                    "theater_name": theater_names[theater_id],
                    "weekday": name,
                    "known": known,
                    "n_screenings": total,
                    "completeness": (known / total) if total else None,
                }
            )
    q6 = {
        "population": (
            "For each observation date, upcoming Friday is the Friday on or after that date. "
            "The denominator is screenings on that Friday that were not removed before showtime "
            "and whose Friday is already in the past (as-of), so the set is closed. "
            "New vs continuing uses the market engagement's first Fri–Thu week. Retrospective."
        ),
        "by_observation_weekday": pooled_table(pooled),
        "new_ordinary_by_weekday": pooled_table(pooled_new),
        "continuing_ordinary_by_weekday": pooled_table(pooled_cont),
        "rerelease_by_weekday": pooled_table(pooled_rerelease),
        "by_days_before": lag_rows,
        "ordinary_new_by_days_before": lag_for(is_ordinary_new),
        "ordinary_continuing_by_days_before": lag_for(is_ordinary_cont),
        "rerelease_by_days_before": lag_for(is_rerelease),
        "by_theater_weekday": theater_completeness,
        "observation_rows": completeness_rows,
    }
    segment_counts = Counter(item.segment for item in film_theater)
    confirmed_segment_counts = Counter(item.segment for item in film_theater if item.confirmed)
    window = {
        "dataset_start": dataset_start.isoformat(),
        "dataset_end": max(item.snapshot_date for item in snapshots).isoformat() if snapshots else None,
        "as_of": as_of.isoformat(),
        "snapshot_days": len(snapshots),
        "complete_snapshot_days": sum(1 for item in snapshots if item.completeness == "complete"),
        "unknown_snapshot_days": sum(1 for item in snapshots if item.completeness == "unknown"),
        "partial_or_failed_snapshot_days": sum(
            1 for item in snapshots if item.completeness in {"partial", "failed"}
        ),
        "first_complete_snapshot": next(
            (item.snapshot_date.isoformat() for item in snapshots if item.completeness == "complete"),
            None,
        ),
        "missing_calendar_days": _missing_days(snapshots),
        "removal_inference": (
            "no_longer_observed is inferred only on complete snapshots. "
            "Earlier unknown snapshots still record showtimes that were present."
        ),
        "history_occurred_showtime_rows": history_occurred_count,
        "lifecycle_occurred_screenings": sum(
            1
            for item in screenings
            if not item.canceled and not item.removed_before_show and item.show_date < as_of
        ),
        "dense_horizons": {tid: (value.isoformat() if value else None) for tid, value in horizons.items()},
    }
    summary = {
        "schema_version": SCHEMA_VERSION,
        "question": "scheduling assumptions audit — descriptive, not a production model change",
        "window": window,
        "counts": {
            "screenings": len(screenings),
            "film_theater_engagements": len(film_theater),
            "market_engagements": len(market),
            "confirmed_film_theater": q1["confirmed_film_theater_n"],
            "confirmed_market": q1["confirmed_market_n"],
            "confirmed_ordinary_week_plus_film_theater": len(ordinary_ft),
            "confirmed_rerelease_film_theater": len(rerelease_ft),
            "confirmed_special_film_theater": len(special_ft),
            "segment_counts_film_theater": dict(segment_counts),
            "confirmed_segment_counts_film_theater": dict(confirmed_segment_counts),
            "confident_rerelease_engagements": segment_counts.get(SEGMENT_RERELEASE, 0),
            "confident_special_engagements": segment_counts.get(SEGMENT_SPECIAL, 0),
        },
        "questions": {
            "end_weekday": {key: value for key, value in q1.items() if key != "non_thursday_examples"},
            "predetermined_engagements": q2,
            "capacity": {
                "population": q3["population"],
                "horizons": q3["horizons"],
                "weekday_summary": q3["weekday_summary"],
                "theater_overall": q3["theater_overall"],
                "outlier_count": q3["outlier_count"],
            },
            "displacement": {key: value for key, value in q4.items() if key != "transitions"},
            "contraction": q5,
            "completeness": {
                key: value
                for key, value in q6.items()
                if key not in {"observation_rows"}
            },
        },
    }
    summary["candidate_implications"] = build_candidate_implications(summary)
    tables = {
        "completed_film_theater_runs": [
            _engagement_row(item, theater_names) for item in film_theater if item.confirmed
        ],
        "completed_market_runs": [_engagement_row(item, theater_names) for item in market if item.confirmed],
        "end_weekday_non_thursday_examples": non_thursday,
        "censored_film_theater_runs": [
            _engagement_row(item, theater_names) for item in film_theater if not item.confirmed
        ],
        "rerelease_engagements": [
            _engagement_row(item, theater_names)
            for item in film_theater
            if item.segment in {SEGMENT_RERELEASE, SEGMENT_RERELEASE_TITLE, SEGMENT_AMBIGUOUS_RERELEASE}
        ],
        "ambiguous_segments": [
            _engagement_row(item, theater_names)
            for item in film_theater
            if item.segment
            in {
                SEGMENT_AMBIGUOUS_RERELEASE,
                SEGMENT_AMBIGUOUS_SPECIAL,
                SEGMENT_AMBIGUOUS_LIMITED,
                SEGMENT_RERELEASE_TITLE,
                SEGMENT_SPECIAL_TITLE,
                SEGMENT_ORDINARY_TITLE,
            }
        ],
        "engagement_announcements": [
            _engagement_row(item, theater_names)
            for item in film_theater
            if item.announcement_observed and item.confirmed
        ],
        "theater_day_capacity": capacity_rows,
        "theater_weekday_capacity_summary": weekday_summary,
        "capacity_outlier_days": outliers,
        "thursday_friday_transitions": transitions,
        "schedule_completeness_by_observation": completeness_rows,
    }
    return {
        "summary": summary,
        "tables": tables,
        "q1_plot": q1,
        "q5_groups": q5_groups,
        "q6": q6,
        "film_theater": film_theater,
        "market": market,
        "as_of": as_of,
        "theater_names": dict(theater_names),
        "ordinary_week_plus": ordinary_ft,
        "rerelease_ann": rerelease_ann,
        "ordinary_ann": ordinary_ann,
        "special_ann": special_ann,
    }


def _market_theater_path(engagements: Sequence[Engagement]) -> dict[str, Any]:
    buckets: dict[int, list[int]] = {offset: [] for offset in range(0, 15)}
    for item in engagements:
        if item.last_occurred is None:
            continue
        by_day: dict[date, set[str]] = defaultdict(set)
        for screening in item.screenings:
            if screening.show_date < item.last_occurred or screening.show_date == item.last_occurred:
                if screening.show_date >= item.start_date:
                    by_day[screening.show_date].add(screening.theater_id)
        for offset in range(0, 15):
            day = item.last_occurred - timedelta(days=offset)
            if day < item.start_date:
                continue
            buckets[offset].append(len(by_day.get(day, ())))
    return {
        "n": len(engagements),
        "median_by_offset": {
            f"D-{offset}" if offset else "D0": (
                float(statistics.median(buckets[offset])) if buckets[offset] else None
            )
            for offset in range(0, 15)
        },
        "mean_by_offset": {
            f"D-{offset}" if offset else "D0": (
                float(statistics.fmean(buckets[offset])) if buckets[offset] else None
            )
            for offset in range(0, 15)
        },
    }


def _missing_days(snapshots: Sequence[SnapshotInfo]) -> list[str]:
    if not snapshots:
        return []
    have = {item.snapshot_date for item in snapshots}
    cursor = min(have)
    end = max(have)
    missing = []
    while cursor <= end:
        if cursor not in have:
            missing.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return missing


def prepare_audit(root: Path) -> dict[str, Any]:
    """Load historical artifacts and compute every research question."""
    history = root / "data" / "history"
    snapshots = load_snapshot_infos(history / "screening_snapshot_status.jsonl")
    if not snapshots:
        raise FileNotFoundError("No AMC snapshot-status rows found")
    catalog = load_catalog_index(root / "data" / "source_catalog" / "amc_movie_products.json")
    registry = json.loads((root / "data" / "theaters.json").read_text(encoding="utf-8"))
    theater_names = {}
    enabled = set()
    for theater in registry.get("theaters", []):
        if theater.get("source") != SOURCE or theater.get("enabled") is False:
            continue
        enabled.add(theater["id"])
        theater_names[theater["id"]] = theater.get("name") or theater["id"]
    premium_ids = load_premium_ids(history / "screening_observations.jsonl.gz")
    screenings, as_of = load_screenings(
        history / "screening_lifecycle.jsonl.gz",
        catalog=catalog,
        enabled_theaters=enabled,
        premium_ids=premium_ids,
    )
    dataset_start = min(item.snapshot_date for item in snapshots)
    snapshot_dates = [item.snapshot_date for item in snapshots]
    theater_daily, theater_films, theater_blocks = _daily_maps(screenings)
    horizons: dict[str, date | None] = {}
    friday_baseline: dict[str, float] = {}
    for theater_id in theater_names:
        daily = {day: theater_daily[(theater_id, day)] for (tid, day) in theater_daily if tid == theater_id}
        horizons[theater_id] = dense_horizon(daily, baseline_end=as_of)
        friday_counts = [count for day, count in daily.items() if day.weekday() == 4 and day < as_of]
        friday_baseline[theater_id] = float(statistics.median(friday_counts)) if friday_counts else 0.0
    film_theater = build_engagements(
        screenings,
        level="film_theater",
        gap_threshold_days=DEFAULT_GAP_THRESHOLD_DAYS,
        dataset_start=dataset_start,
        snapshot_dates=snapshot_dates,
        as_of=as_of,
        horizons=horizons,
        friday_baseline=friday_baseline,
        theater_daily=theater_daily,
    )
    market = build_engagements(
        screenings,
        level="market",
        gap_threshold_days=DEFAULT_GAP_THRESHOLD_DAYS,
        dataset_start=dataset_start,
        snapshot_dates=snapshot_dates,
        as_of=as_of,
        horizons=horizons,
        friday_baseline=friday_baseline,
        theater_daily=theater_daily,
    )
    history_count = count_history_amc_occurred(
        history / "showtimes_history.csv",
        as_of=as_of,
        window_start=dataset_start,
        enabled_theaters=enabled,
    )
    result = run_questions(
        screenings=screenings,
        film_theater=film_theater,
        market=market,
        snapshots=snapshots,
        as_of=as_of,
        dataset_start=dataset_start,
        theater_names=theater_names,
        horizons=horizons,
        theater_daily=theater_daily,
        theater_films=theater_films,
        theater_blocks=theater_blocks,
        history_occurred_count=history_count,
    )
    result["screenings"] = screenings
    result["dataset_start"] = dataset_start
    result["snapshots"] = snapshots
    return result
