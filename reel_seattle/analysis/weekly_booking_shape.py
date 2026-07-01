"""Anchor-time booking-shape features for weekly Leaving Soon labels (PR D5)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Mapping, Sequence

from reel_seattle.analysis.amc_booking_cycle import current_week_range
from reel_seattle.analysis.leaving_soon_labels import FilmAnchorFeatures
from reel_seattle.analysis.weekly_leaving_soon_labels import (
    WeeklyLabelBuildConfig,
    _WeekStats,
    week_stats_for_film_rows,
)

LOW_FOOTPRINT_THRESHOLD = 10
WIDE_FOOTPRINT_THEATERS = 3


def _parse_date(text: str) -> date:
    return date.fromisoformat(text.strip())


def _week_stats_at_anchor(
    anchor_date: date,
    film_key: str,
    row_index: Mapping[date, Mapping[str, Sequence[Mapping[str, str]]]],
) -> _WeekStats:
    week_start, week_end = current_week_range(anchor_date)
    film_rows = row_index.get(anchor_date, {}).get(film_key, [])
    return week_stats_for_film_rows(
        film_rows,
        week_start_date=week_start,
        week_end_date=week_end,
    )


def _anchor_features(
    by_snapshot: Mapping[date, Mapping[str, FilmAnchorFeatures]],
    anchor_date: date,
    film_key: str,
) -> FilmAnchorFeatures | None:
    return by_snapshot.get(anchor_date, {}).get(film_key)


def _prior_tuesday_anchors(
    anchor_date: date,
    snapshot_dates: Sequence[date],
    *,
    anchor_weekdays: frozenset[int],
    limit: int = 52,
) -> list[date]:
    anchors = [
        day
        for day in snapshot_dates
        if day < anchor_date and day.weekday() in anchor_weekdays
    ]
    return list(reversed(anchors[-limit:]))


def _share(numerator: int, denominator: int) -> str:
    if denominator <= 0:
        return ""
    return str(round(numerator / denominator, 4))


def compute_booking_shape_features(
    *,
    anchor_date: date,
    film_key: str,
    snapshot_dates: Sequence[date],
    row_index: Mapping[date, Mapping[str, Sequence[Mapping[str, str]]]],
    by_snapshot: Mapping[date, Mapping[str, FilmAnchorFeatures]],
    current_stats: _WeekStats,
    prior_stats: _WeekStats | None,
    peak_anchor: date | None,
    first_seen: date | None,
    config: WeeklyLabelBuildConfig | None = None,
) -> dict[str, str]:
    """Derive non-leaky booking-shape features using anchor-or-earlier snapshots only."""
    cfg = config or WeeklyLabelBuildConfig()
    anchor_feature = _anchor_features(by_snapshot, anchor_date, film_key)
    current_max_show_date = anchor_feature.max_show_date if anchor_feature else None

    prior_week_had_weekend = (
        "true" if prior_stats and prior_stats.weekend_day_count > 0 else "false"
    )
    lost_weekend = (
        "true"
        if prior_stats
        and prior_stats.weekend_day_count > 0
        and current_stats.weekend_day_count == 0
        else "false"
    )
    lost_theaters = (
        "true"
        if prior_stats
        and prior_stats.theater_count > current_stats.theater_count
        else "false"
    )
    lost_primetime = (
        "true"
        if prior_stats
        and prior_stats.primetime_showtime_count > 0
        and current_stats.primetime_showtime_count == 0
        else "false"
    )
    theater_churn = ""
    if prior_stats is not None:
        theater_churn = str(max(0, prior_stats.theater_count - current_stats.theater_count))

    days_since_peak_showtimes = ""
    days_since_peak_theaters = ""
    if peak_anchor is not None:
        delta_days = (anchor_date - peak_anchor).days
        days_since_peak_showtimes = str(delta_days)
        days_since_peak_theaters = str(delta_days)

    prior_anchors = _prior_tuesday_anchors(
        anchor_date,
        snapshot_dates,
        anchor_weekdays=cfg.anchor_weekdays,
    )

    consecutive_low = 0
    consecutive_no_weekend = 0
    weekday_only_streak = 0
    same_theater_streak = 0
    max_date_stuck = 0
    prev_max_show_date: date | None = None

    if current_stats.showtime_count <= LOW_FOOTPRINT_THRESHOLD:
        consecutive_low = 1
    if current_stats.weekend_day_count == 0:
        consecutive_no_weekend = 1
    if current_stats.theater_count <= 1:
        same_theater_streak = 1
    if current_stats.weekend_day_count == 0 and current_stats.showtime_count > 0:
        weekday_only_streak = 1

    for prior_anchor in reversed(prior_anchors):
        stats = _week_stats_at_anchor(prior_anchor, film_key, row_index)
        features = _anchor_features(by_snapshot, prior_anchor, film_key)
        if consecutive_low > 0 and stats.showtime_count <= LOW_FOOTPRINT_THRESHOLD:
            consecutive_low += 1
        else:
            consecutive_low = 0
        if consecutive_no_weekend > 0 and stats.weekend_day_count == 0:
            consecutive_no_weekend += 1
        else:
            consecutive_no_weekend = 0
        if same_theater_streak > 0 and stats.theater_count <= 1:
            same_theater_streak += 1
        else:
            same_theater_streak = 0
        if weekday_only_streak > 0 and stats.weekend_day_count == 0 and stats.showtime_count > 0:
            weekday_only_streak += 1
        else:
            weekday_only_streak = 0

        if features is not None:
            if prev_max_show_date is None:
                prev_max_show_date = features.max_show_date
            elif features.max_show_date <= prev_max_show_date:
                max_date_stuck += 1
                prev_max_show_date = features.max_show_date
            else:
                break

    if current_max_show_date is not None and prev_max_show_date is not None:
        if current_max_show_date <= prev_max_show_date:
            max_date_stuck += 1

    opening_weekend_seen = "false"
    if first_seen is not None:
        opening_end = first_seen + timedelta(days=13)
        for snapshot_date in snapshot_dates:
            if snapshot_date < first_seen or snapshot_date > min(opening_end, anchor_date):
                continue
            if snapshot_date.weekday() not in cfg.anchor_weekdays:
                continue
            stats = _week_stats_at_anchor(snapshot_date, film_key, row_index)
            if stats.weekend_day_count > 0:
                opening_weekend_seen = "true"
                break

    weeks_since_first_wide = ""
    if first_seen is not None:
        wide_anchor: date | None = None
        for snapshot_date in snapshot_dates:
            if snapshot_date > anchor_date or snapshot_date.weekday() not in cfg.anchor_weekdays:
                continue
            stats = _week_stats_at_anchor(snapshot_date, film_key, row_index)
            if stats.theater_count >= WIDE_FOOTPRINT_THEATERS:
                wide_anchor = snapshot_date
                break
        if wide_anchor is not None:
            weeks_since_first_wide = str(max((anchor_date - wide_anchor).days // 7, 0))

    return {
        "max_show_date_stuck_weeks": str(max_date_stuck),
        "consecutive_low_footprint_weeks": str(consecutive_low),
        "consecutive_no_weekend_weeks": str(consecutive_no_weekend),
        "prior_week_had_weekend": prior_week_had_weekend,
        "lost_weekend_vs_prior_week": lost_weekend,
        "lost_theaters_vs_prior_week": lost_theaters,
        "lost_primetime_vs_prior_week": lost_primetime,
        "current_weekend_share": _share(
            current_stats.weekend_showtime_count, current_stats.showtime_count
        ),
        "current_primetime_share": _share(
            current_stats.primetime_showtime_count, current_stats.showtime_count
        ),
        "current_weekday_concentration": _share(
            current_stats.showtime_count - current_stats.weekend_showtime_count,
            current_stats.showtime_count,
        ),
        "same_theater_only_streak": str(same_theater_streak),
        "weekday_only_streak": str(weekday_only_streak),
        "days_since_peak_showtimes": days_since_peak_showtimes,
        "days_since_peak_theaters": days_since_peak_theaters,
        "opening_weekend_seen": opening_weekend_seen,
        "weeks_since_first_wide_footprint": weeks_since_first_wide,
        "theater_churn_count": theater_churn,
    }
