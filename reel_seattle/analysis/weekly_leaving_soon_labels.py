"""Weekly booking-extension Leaving Soon labels (experimental, PR C2).

Corrected target: at a pre-update anchor snapshot, predict whether a currently
playing film will receive any showtimes in the *following* Monday–Sunday booking
week after the weekly AMC schedule update is observed.

This avoids tautological horizon rules like ``visible_dates_le_1`` that mostly
encode "already at the end of the visible schedule."
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.amc_booking_cycle import (
    current_week_range,
    following_week_range,
)
from reel_seattle.analysis.leaving_soon_labels import (
    LABEL_STATUS_EVENT_EXCLUDED,
    LABEL_STATUS_INSUFFICIENT_SHOWTIMES,
    LABEL_STATUS_LABELED,
    LABEL_STATUS_MISSING_POST_UPDATE,
    build_film_anchor_index,
    find_post_update_snapshot,
    load_footprint_rows,
    relevant_wednesday,
)
from reel_seattle.analysis.special_screening_flags import flags_to_csv_fields

LABEL_MODE_WEEKLY_EXTENSION = "weekly-extension"

LABEL_STATUS_NOT_ANCHOR_DAY = "not_anchor_day"

WEEKLY_LABEL_FIELDNAMES = [
    "label_mode",
    "anchor_date",
    "showtime_film_key",
    "film_title",
    "anchor_weekday",
    "anchor_relevant_wednesday",
    "post_update_snapshot_date",
    "post_update_gap_days",
    "current_week_start",
    "current_week_end",
    "following_week_start",
    "following_week_end",
    "current_week_showtime_count",
    "current_week_theater_count",
    "current_week_visible_days",
    "current_week_matinee_showtime_count",
    "current_week_primetime_showtime_count",
    "current_week_late_showtime_count",
    "current_week_weekend_showtime_count",
    "current_week_weekend_day_count",
    "current_week_showtime_density",
    "current_week_has_weekend_show",
    "current_week_has_primetime",
    "prior_week_showtime_count",
    "prior_week_theater_count",
    "prior_week_visible_days",
    "showtime_count_change_vs_prior_week",
    "theater_count_change_vs_prior_week",
    "visible_days_change_vs_prior_week",
    "showtime_pct_change_vs_prior_week",
    "theater_pct_change_vs_prior_week",
    "peak_week_showtime_count_to_date",
    "peak_week_theater_count_to_date",
    "peak_showtime_count_to_date",
    "peak_theater_count_to_date",
    "current_showtime_pct_of_peak",
    "current_theater_pct_of_peak",
    "weeks_since_peak_showtimes",
    "weeks_since_peak_theaters",
    "first_anchor_seen_date",
    "weeks_since_first_seen",
    "booking_cycles_seen",
    "booking_cycles_survived",
    "weeks_survived_so_far",
    "is_first_week_observed",
    "is_new_release_like",
    "weekday_only_current_week",
    "single_theater_current_week",
    "single_day_current_week",
    "low_showtime_count_bucket",
    "event_like_flag",
    "event_like_reason",
    "strict_event_like_flag",
    "strict_event_like_reason",
    "run_segment",
    "run_type",
    "flag_anniversary_like",
    "flag_fan_event_like",
    "flag_opening_night_like",
    "flag_sensory_friendly_like",
    "flag_double_feature_like",
    "flag_live_or_concert_like",
    "flag_live_encore_like",
    "flag_classic_rerelease_like",
    "flag_holiday_rerelease_like",
    "flag_anime_event_like",
    "flag_awards_limited_like",
    "flag_foreign_limited_like",
    "flag_family_holiday_like",
    "flag_special_event_like",
    "flag_probable_normal_first_run",
    "visible_show_date_count_at_anchor",
    "days_until_anchor_max_show_date",
    "following_week_showtime_count",
    "following_week_theater_count",
    "following_week_visible_days",
    "gets_following_week_showtimes",
    "leaving_soon_label",
    "label_status",
]


@dataclass(frozen=True)
class WeeklyLabelBuildConfig:
    anchor_weekdays: frozenset[int] = frozenset({1})  # Tuesday pre-update default
    post_update_weekdays: frozenset[int] = frozenset({3, 4})  # Thu/Fri observation
    max_post_update_gap_days: int = 4
    min_current_week_showtimes: int = 1
    exclude_event_like: bool = True
    prior_anchor_lookback_days: int = 7


@dataclass
class _WeekStats:
    showtime_count: int = 0
    matinee_showtime_count: int = 0
    primetime_showtime_count: int = 0
    late_showtime_count: int = 0
    weekend_showtime_count: int = 0
    theater_ids: set[str] | None = None
    show_dates: set[date] | None = None
    weekend_days: set[date] | None = None
    has_weekend_show: bool = False
    has_primetime: bool = False

    def __post_init__(self) -> None:
        if self.theater_ids is None:
            self.theater_ids = set()
        if self.show_dates is None:
            self.show_dates = set()
        if self.weekend_days is None:
            self.weekend_days = set()

    @property
    def theater_count(self) -> int:
        return len(self.theater_ids or set())

    @property
    def visible_days(self) -> int:
        return len(self.show_dates or set())

    @property
    def weekend_day_count(self) -> int:
        return len(self.weekend_days or set())

    @property
    def showtime_density(self) -> float:
        days = self.visible_days
        return self.showtime_count / days if days else 0.0


def _parse_date(text: str) -> date:
    return date.fromisoformat(text.strip())


def _parse_int(text: str, default: int = 0) -> int:
    text = str(text).strip()
    if not text:
        return default
    return int(text)


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def _split_theaters(text: str) -> set[str]:
    return {part.strip() for part in text.split("|") if part.strip()}


def build_snapshot_film_rows_index(
    rows: Sequence[Mapping[str, str]],
) -> dict[date, dict[str, list[Mapping[str, str]]]]:
    """Index raw footprint rows by snapshot date and film key."""
    index: dict[date, dict[str, list[Mapping[str, str]]]] = {}
    for row in rows:
        snapshot_date = _parse_date(row["snapshot_date"])
        film_key = row["showtime_film_key"].strip()
        if not film_key:
            continue
        index.setdefault(snapshot_date, {}).setdefault(film_key, []).append(row)
    return index


def week_stats_for_film_rows(
    film_rows: Sequence[Mapping[str, str]],
    *,
    week_start_date: date,
    week_end_date: date,
) -> _WeekStats:
    stats = _WeekStats()
    for row in film_rows:
        show_date = _parse_date(row["show_date"])
        if show_date < week_start_date or show_date > week_end_date:
            continue
        active = _parse_int(row.get("active_showtime_count", "0"))
        if active <= 0:
            continue
        stats.showtime_count += active
        stats.show_dates.add(show_date)
        stats.theater_ids.update(_split_theaters(row.get("theater_list", "")))
        if show_date.weekday() >= 5:
            stats.weekend_days.add(show_date)
            stats.weekend_showtime_count += active
        if _parse_bool(row.get("has_matinee", "false")):
            stats.matinee_showtime_count += active
        if _parse_bool(row.get("has_primetime", "false")):
            stats.primetime_showtime_count += active
        if _parse_bool(row.get("has_late", "false")):
            stats.late_showtime_count += active
        stats.has_weekend_show = stats.has_weekend_show or _parse_bool(
            row.get("has_weekend_show", "false")
        )
        stats.has_primetime = stats.has_primetime or _parse_bool(
            row.get("has_primetime", "false")
        )
    return stats


def _pct_change(current: int, prior: int) -> str:
    if prior <= 0:
        return ""
    return str(round((current - prior) / prior, 4))


def _pct_of_peak(current: int, peak: int) -> str:
    if peak <= 0:
        return ""
    return str(round(current / peak, 4))


def _peak_week_stats_to_date(
    snapshot_dates: Sequence[date],
    anchor_date: date,
    film_key: str,
    row_index: Mapping[date, Mapping[str, Sequence[Mapping[str, str]]]],
    *,
    anchor_weekdays: frozenset[int],
) -> tuple[int, int, date | None]:
    peak_showtimes = 0
    peak_theaters = 0
    peak_anchor: date | None = None
    for snapshot_date in snapshot_dates:
        if snapshot_date > anchor_date or snapshot_date.weekday() not in anchor_weekdays:
            continue
        week_start_date, week_end_date = current_week_range(snapshot_date)
        film_rows = row_index.get(snapshot_date, {}).get(film_key, [])
        stats = week_stats_for_film_rows(
            film_rows,
            week_start_date=week_start_date,
            week_end_date=week_end_date,
        )
        if stats.showtime_count > peak_showtimes:
            peak_showtimes = stats.showtime_count
            peak_anchor = snapshot_date
        peak_theaters = max(peak_theaters, stats.theater_count)
    return peak_showtimes, peak_theaters, peak_anchor


def _first_anchor_seen_date(
    snapshot_dates: Sequence[date],
    anchor_date: date,
    film_key: str,
    row_index: Mapping[date, Mapping[str, Sequence[Mapping[str, str]]]],
    *,
    anchor_weekdays: frozenset[int],
) -> date | None:
    for snapshot_date in snapshot_dates:
        if snapshot_date > anchor_date or snapshot_date.weekday() not in anchor_weekdays:
            continue
        week_start_date, week_end_date = current_week_range(snapshot_date)
        stats = week_stats_for_film_rows(
            row_index.get(snapshot_date, {}).get(film_key, []),
            week_start_date=week_start_date,
            week_end_date=week_end_date,
        )
        if stats.showtime_count > 0:
            return snapshot_date
    return None


def _weeks_between(earlier: date, later: date) -> int:
    return max((later - earlier).days // 7, 0)


def _find_prior_anchor_snapshot(
    anchor_date: date,
    snapshot_dates: Sequence[date],
    *,
    lookback_days: int,
) -> date | None:
    target = anchor_date - timedelta(days=lookback_days)
    candidates = [day for day in snapshot_dates if day < anchor_date]
    if not candidates:
        return None
    return min(candidates, key=lambda day: abs((day - target).days))


def _count_prior_booking_cycles(
    snapshot_dates: Sequence[date],
    anchor_date: date,
    film_key: str,
    row_index: Mapping[date, Mapping[str, Sequence[Mapping[str, str]]]],
) -> int:
    """Count prior anchor weeks where the film had current-week showtimes."""
    cycles = 0
    cursor = anchor_date
    for _ in range(52):
        prior_anchor = _find_prior_anchor_snapshot(
            cursor,
            [day for day in snapshot_dates if day < cursor],
            lookback_days=7,
        )
        if prior_anchor is None:
            break
        week_start_date, week_end_date = current_week_range(prior_anchor)
        film_rows = row_index.get(prior_anchor, {}).get(film_key, [])
        stats = week_stats_for_film_rows(
            film_rows,
            week_start_date=week_start_date,
            week_end_date=week_end_date,
        )
        if stats.showtime_count > 0:
            cycles += 1
        cursor = prior_anchor
    return cycles


def build_weekly_label_rows(
    rows: Sequence[Mapping[str, str]],
    *,
    config: WeeklyLabelBuildConfig | None = None,
) -> list[dict[str, str]]:
    """Build weekly-extension label rows from footprint CSV rows."""
    cfg = config or WeeklyLabelBuildConfig()
    by_snapshot, snapshot_dates = build_film_anchor_index(rows)
    row_index = build_snapshot_film_rows_index(rows)
    label_rows: list[dict[str, str]] = []

    for anchor_date in snapshot_dates:
        if anchor_date.weekday() not in cfg.anchor_weekdays:
            continue

        current_start, current_end = current_week_range(anchor_date)
        following_start, following_end = following_week_range(anchor_date)
        wednesday = relevant_wednesday(anchor_date)
        post_update_date = find_post_update_snapshot(
            anchor_date,
            snapshot_dates,
            post_update_weekdays=cfg.post_update_weekdays,
            max_post_update_gap_days=cfg.max_post_update_gap_days,
        )
        prior_anchor = _find_prior_anchor_snapshot(
            anchor_date,
            snapshot_dates,
            lookback_days=cfg.prior_anchor_lookback_days,
        )

        for film_key in sorted(by_snapshot.get(anchor_date, {})):
            anchor = by_snapshot[anchor_date][film_key]
            anchor_rows = row_index.get(anchor_date, {}).get(film_key, [])
            current_stats = week_stats_for_film_rows(
                anchor_rows,
                week_start_date=current_start,
                week_end_date=current_end,
            )
            screening_flags = flags_to_csv_fields(
                anchor.film_title,
                anchor_date=anchor_date.isoformat(),
            )
            booking_cycles = _count_prior_booking_cycles(
                snapshot_dates, anchor_date, film_key, row_index
            )
            first_seen = _first_anchor_seen_date(
                snapshot_dates,
                anchor_date,
                film_key,
                row_index,
                anchor_weekdays=cfg.anchor_weekdays,
            )
            weeks_since_first = (
                _weeks_between(first_seen, anchor_date) if first_seen is not None else 0
            )
            peak_showtimes, peak_theaters, peak_anchor = _peak_week_stats_to_date(
                snapshot_dates,
                anchor_date,
                film_key,
                row_index,
                anchor_weekdays=cfg.anchor_weekdays,
            )
            weeks_since_peak = (
                _weeks_between(peak_anchor, anchor_date) if peak_anchor is not None else ""
            )

            base: dict[str, str] = {
                "label_mode": LABEL_MODE_WEEKLY_EXTENSION,
                "anchor_date": anchor_date.isoformat(),
                "showtime_film_key": film_key,
                "film_title": anchor.film_title,
                "anchor_weekday": str(anchor_date.weekday()),
                "anchor_relevant_wednesday": wednesday.isoformat(),
                "post_update_snapshot_date": "",
                "post_update_gap_days": "",
                "current_week_start": current_start.isoformat(),
                "current_week_end": current_end.isoformat(),
                "following_week_start": following_start.isoformat(),
                "following_week_end": following_end.isoformat(),
                "current_week_showtime_count": str(current_stats.showtime_count),
                "current_week_theater_count": str(current_stats.theater_count),
                "current_week_visible_days": str(current_stats.visible_days),
                "current_week_matinee_showtime_count": str(current_stats.matinee_showtime_count),
                "current_week_primetime_showtime_count": str(
                    current_stats.primetime_showtime_count
                ),
                "current_week_late_showtime_count": str(current_stats.late_showtime_count),
                "current_week_weekend_showtime_count": str(
                    current_stats.weekend_showtime_count
                ),
                "current_week_weekend_day_count": str(current_stats.weekend_day_count),
                "current_week_showtime_density": str(
                    round(current_stats.showtime_density, 4)
                ),
                "current_week_has_weekend_show": (
                    "true" if current_stats.has_weekend_show else "false"
                ),
                "current_week_has_primetime": (
                    "true" if current_stats.has_primetime else "false"
                ),
                "prior_week_showtime_count": "",
                "prior_week_theater_count": "",
                "prior_week_visible_days": "",
                "showtime_count_change_vs_prior_week": "",
                "theater_count_change_vs_prior_week": "",
                "visible_days_change_vs_prior_week": "",
                "showtime_pct_change_vs_prior_week": "",
                "theater_pct_change_vs_prior_week": "",
                "peak_week_showtime_count_to_date": str(peak_showtimes),
                "peak_week_theater_count_to_date": str(peak_theaters),
                "peak_showtime_count_to_date": str(peak_showtimes),
                "peak_theater_count_to_date": str(peak_theaters),
                "current_showtime_pct_of_peak": _pct_of_peak(
                    current_stats.showtime_count, peak_showtimes
                ),
                "current_theater_pct_of_peak": _pct_of_peak(
                    current_stats.theater_count, peak_theaters
                ),
                "weeks_since_peak_showtimes": str(weeks_since_peak),
                "weeks_since_peak_theaters": str(weeks_since_peak),
                "first_anchor_seen_date": first_seen.isoformat() if first_seen else "",
                "weeks_since_first_seen": str(weeks_since_first),
                "booking_cycles_seen": str(booking_cycles),
                "booking_cycles_survived": str(booking_cycles),
                "weeks_survived_so_far": str(booking_cycles),
                "is_first_week_observed": "true" if booking_cycles == 0 else "false",
                "is_new_release_like": "true" if weeks_since_first <= 1 else "false",
                "weekday_only_current_week": (
                    "true" if current_stats.weekend_day_count == 0 else "false"
                ),
                "single_theater_current_week": (
                    "true" if current_stats.theater_count <= 1 else "false"
                ),
                "single_day_current_week": (
                    "true" if current_stats.visible_days <= 1 else "false"
                ),
                "low_showtime_count_bucket": (
                    "true" if current_stats.showtime_count <= 10 else "false"
                ),
                "event_like_flag": "true" if anchor.event_like_flag else "false",
                "event_like_reason": anchor.event_like_reason,
                **screening_flags,
                "visible_show_date_count_at_anchor": str(anchor.visible_show_date_count),
                "days_until_anchor_max_show_date": str(
                    (anchor.max_show_date - anchor_date).days
                ),
                "following_week_showtime_count": "",
                "following_week_theater_count": "",
                "following_week_visible_days": "",
                "gets_following_week_showtimes": "",
                "leaving_soon_label": "",
                "label_status": "",
            }

            if prior_anchor is not None:
                prior_start, prior_end = current_week_range(prior_anchor)
                prior_rows = row_index.get(prior_anchor, {}).get(film_key, [])
                prior_stats = week_stats_for_film_rows(
                    prior_rows,
                    week_start_date=prior_start,
                    week_end_date=prior_end,
                )
                base["prior_week_showtime_count"] = str(prior_stats.showtime_count)
                base["prior_week_theater_count"] = str(prior_stats.theater_count)
                base["prior_week_visible_days"] = str(prior_stats.visible_days)
                base["showtime_count_change_vs_prior_week"] = str(
                    current_stats.showtime_count - prior_stats.showtime_count
                )
                base["theater_count_change_vs_prior_week"] = str(
                    current_stats.theater_count - prior_stats.theater_count
                )
                base["visible_days_change_vs_prior_week"] = str(
                    current_stats.visible_days - prior_stats.visible_days
                )
                base["showtime_pct_change_vs_prior_week"] = _pct_change(
                    current_stats.showtime_count, prior_stats.showtime_count
                )
                base["theater_pct_change_vs_prior_week"] = _pct_change(
                    current_stats.theater_count, prior_stats.theater_count
                )

            if current_stats.showtime_count < cfg.min_current_week_showtimes:
                base["label_status"] = LABEL_STATUS_INSUFFICIENT_SHOWTIMES
                label_rows.append(base)
                continue
            if cfg.exclude_event_like and anchor.event_like_flag:
                base["label_status"] = LABEL_STATUS_EVENT_EXCLUDED
                label_rows.append(base)
                continue
            if post_update_date is None:
                base["label_status"] = LABEL_STATUS_MISSING_POST_UPDATE
                label_rows.append(base)
                continue

            post_rows = row_index.get(post_update_date, {}).get(film_key, [])
            following_stats = week_stats_for_film_rows(
                post_rows,
                week_start_date=following_start,
                week_end_date=following_end,
            )
            gets_following_week = following_stats.showtime_count > 0

            base["post_update_snapshot_date"] = post_update_date.isoformat()
            base["post_update_gap_days"] = str((post_update_date - wednesday).days)
            base["following_week_showtime_count"] = str(following_stats.showtime_count)
            base["following_week_theater_count"] = str(following_stats.theater_count)
            base["following_week_visible_days"] = str(following_stats.visible_days)
            base["gets_following_week_showtimes"] = "true" if gets_following_week else "false"
            base["leaving_soon_label"] = "false" if gets_following_week else "true"
            base["label_status"] = LABEL_STATUS_LABELED
            label_rows.append(base)

    label_rows.sort(key=lambda row: (row["anchor_date"], row["showtime_film_key"]))
    return label_rows


def summarize_weekly_labels(
    footprint_row_count: int,
    label_rows: Sequence[Mapping[str, str]],
) -> dict[str, Any]:
    labeled = [row for row in label_rows if row["label_status"] == LABEL_STATUS_LABELED]
    positives = [row for row in labeled if row["leaving_soon_label"] == "true"]
    negatives = [row for row in labeled if row["leaving_soon_label"] == "false"]
    label_rate = len(positives) / len(labeled) if labeled else 0.0

    status_counts: dict[str, int] = {}
    for row in label_rows:
        status = row["label_status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    anchor_dates = sorted({row["anchor_date"] for row in label_rows})
    films = sorted({row["showtime_film_key"] for row in label_rows})

    return {
        "label_mode": LABEL_MODE_WEEKLY_EXTENSION,
        "footprint_row_count": footprint_row_count,
        "candidate_anchor_rows": len(label_rows),
        "labeled_rows": len(labeled),
        "leaving_soon_positives": len(positives),
        "not_leaving_soon_negatives": len(negatives),
        "label_rate_leaving_soon": round(label_rate, 4),
        "status_counts": status_counts,
        "anchor_date_range": {
            "earliest": anchor_dates[0] if anchor_dates else "",
            "latest": anchor_dates[-1] if anchor_dates else "",
        },
        "distinct_films": len(films),
        "examples_leaving_soon": [
            {
                "anchor_date": row["anchor_date"],
                "film": row["film_title"],
                "current_week_showtimes": row["current_week_showtime_count"],
                "following_week_showtimes": row["following_week_showtime_count"],
            }
            for row in positives[:5]
        ],
        "examples_not_leaving_soon": [
            {
                "anchor_date": row["anchor_date"],
                "film": row["film_title"],
                "current_week_showtimes": row["current_week_showtime_count"],
                "following_week_showtimes": row["following_week_showtime_count"],
            }
            for row in negatives[:5]
        ],
    }


def write_weekly_labels_csv(output_path: Path, rows: Sequence[Mapping[str, str]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=WEEKLY_LABEL_FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def write_summary_json(output_path: Path, summary: Mapping[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def build_weekly_labels_from_footprint_csv(
    input_path: Path,
    output_path: Path,
    *,
    summary_output: Path | None = None,
    config: WeeklyLabelBuildConfig | None = None,
) -> dict[str, Any]:
    footprint_rows = load_footprint_rows(input_path)
    label_rows = build_weekly_label_rows(footprint_rows, config=config)
    write_weekly_labels_csv(output_path, label_rows)
    summary = summarize_weekly_labels(len(footprint_rows), label_rows)
    summary["input_path"] = str(input_path)
    summary["output_path"] = str(output_path)
    if summary_output is not None:
        write_summary_json(summary_output, summary)
        summary["summary_output_path"] = str(summary_output)
    return summary
