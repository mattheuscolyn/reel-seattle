"""Validate first-snapshot rerelease completeness against later publication lags.

The original audit metric in ``reconstruct_announcement`` is unchanged.
This module adds rollout and in-run definitions beside it.

Three different ideas, kept separate:

- first observed snapshot completeness: what was listed on the discovery snapshot
- announcement rollout completeness: what was listed within the next few daily snapshots
- true in-run extension: the final date first appeared after the engagement had opened

Daily snapshots are once a day, so lags are whole snapshot days, not clock hours.
Removals are counted only when ``removed_at`` is set and the snapshot is complete.
"""

from __future__ import annotations

import csv
import html
import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    SEGMENT_ORDINARY,
    SEGMENT_RERELEASE,
    SEGMENT_SPECIAL,
    Engagement,
    Screening,
    programming_week_friday,
    weekday_name,
)

COMPLETE = "complete"
LAGS: tuple[tuple[str, int], ...] = (
    ("exact_first", 0),
    ("plus_1_day", 1),
    ("plus_2_days", 2),
    ("plus_3_days", 3),
)
OPENING_LAGS: tuple[tuple[str, int], ...] = (
    ("by_7_days_before_opening", 7),
    ("by_3_days_before_opening", 3),
)
EXTENSION_KEYS = (
    "exact_first",
    "within_48h",
    "within_72h",
    "post_opening",
    "late",
)
SEGMENT_KEYS = (
    ("rerelease", SEGMENT_RERELEASE),
    ("ordinary", SEGMENT_ORDINARY),
    ("special", SEGMENT_SPECIAL),
)
FOCUS_FILMS: tuple[tuple[str, str], ...] = (
    ("84149", "Cars: 20th Anniversary"),
    ("84081", "The Fast and the Furious 25th Anniversary"),
    ("83589", "Castle in the Sky 40th Anniversary - Studio Ghibli Fest 2026"),
    ("84779", "Ghost in the Shell 30th Anniversary"),
    ("84559", "Batman (1989)"),
    ("84715", "Amok Time + Star Trek III: The Search for Spock 60th Anniversary Event"),
)
FOCUS_IDS = {film_id for film_id, _title in FOCUS_FILMS}


@dataclass(frozen=True)
class AnnouncedShow:
    show_id: str
    show_date: date
    first_snapshot: date
    removed_at: date | None = None
    removed: bool = False


def is_eventual(show: AnnouncedShow) -> bool:
    return not show.removed


def eventual_shows(shows: Sequence[AnnouncedShow]) -> list[AnnouncedShow]:
    return [show for show in shows if is_eventual(show)]


def known_by(shows: Sequence[AnnouncedShow], cutoff: date) -> list[AnnouncedShow]:
    """Eventual screenings whose first snapshot is on or before *cutoff*."""
    return [show for show in eventual_shows(shows) if show.first_snapshot <= cutoff]


def listed_on_snapshot(show: AnnouncedShow, snapshot: date) -> bool:
    """Whether this show had been announced and not yet removed by *snapshot*.

    Absence from an incomplete snapshot is not a removal. Only ``removed_at``
    withdraws a show, and callers must set that only from a complete snapshot.
    """
    if show.first_snapshot > snapshot:
        return False
    if show.removed and show.removed_at is not None and show.removed_at <= snapshot:
        return False
    return True


def removals_on_snapshot(
    shows: Sequence[AnnouncedShow],
    snapshot: date,
    completeness: str,
) -> list[AnnouncedShow]:
    """Removals recorded on this snapshot. Incomplete snapshots contribute none."""
    if completeness != COMPLETE:
        return []
    return [show for show in shows if show.removed_at == snapshot]


def cutoff_observable(
    first_observation: date,
    cutoff: date,
    snapshot_dates: Sequence[date],
    as_of: date,
) -> bool:
    """True when the cutoff day itself was snapshotted and is not after as-of.

    A missing calendar day is interval-censored. It is not scored from an
    earlier snapshot, and it is not treated as an empty schedule.
    """
    if cutoff < first_observation or cutoff > as_of:
        return False
    return cutoff in snapshot_dates


def share_of_screenings(shows: Sequence[AnnouncedShow], cutoff: date) -> float | None:
    eventual = eventual_shows(shows)
    if not eventual:
        return None
    return len(known_by(shows, cutoff)) / len(eventual)


def share_of_dates(shows: Sequence[AnnouncedShow], cutoff: date) -> float | None:
    eventual_dates = {show.show_date for show in eventual_shows(shows)}
    if not eventual_dates:
        return None
    known_dates = {show.show_date for show in known_by(shows, cutoff)}
    return len(known_dates) / len(eventual_dates)


def latest_known_date(shows: Sequence[AnnouncedShow], cutoff: date) -> date | None:
    known = known_by(shows, cutoff)
    if not known:
        return None
    return max(show.show_date for show in known)


def eventual_final_date(shows: Sequence[AnnouncedShow]) -> date | None:
    eventual = eventual_shows(shows)
    if not eventual:
        return None
    return max(show.show_date for show in eventual)


def final_date_known(shows: Sequence[AnnouncedShow], cutoff: date) -> bool | None:
    final = eventual_final_date(shows)
    if final is None:
        return None
    return any(show.show_date == final and show.first_snapshot <= cutoff for show in eventual_shows(shows))


def final_date_discovered(shows: Sequence[AnnouncedShow]) -> date | None:
    """Earliest snapshot that listed a screening on the eventual final date."""
    final = eventual_final_date(shows)
    if final is None:
        return None
    snaps = [show.first_snapshot for show in eventual_shows(shows) if show.show_date == final]
    if not snaps:
        return None
    return min(snaps)


def extended_beyond(shows: Sequence[AnnouncedShow], cutoff: date) -> bool | None:
    """True when the eventual final date is later than the latest date known by *cutoff*."""
    latest = latest_known_date(shows, cutoff)
    final = eventual_final_date(shows)
    if latest is None or final is None:
        return None
    return final > latest


def post_opening_extension(shows: Sequence[AnnouncedShow], opening: date) -> bool | None:
    """True when the eventual final date was first listed after opening day."""
    discovered = final_date_discovered(shows)
    if discovered is None:
        return None
    return discovered > opening


def late_extension(shows: Sequence[AnnouncedShow], opening: date) -> bool | None:
    """True when the eventual final date was first listed on or after opening + 2 days."""
    discovered = final_date_discovered(shows)
    if discovered is None:
        return None
    return discovered >= opening + timedelta(days=2)


def days_until_share(
    shows: Sequence[AnnouncedShow],
    first_observation: date,
    threshold: float,
) -> int | None:
    """Whole snapshot-days from first observation until *threshold* of eventual screenings are known."""
    eventual = eventual_shows(shows)
    if not eventual:
        return None
    target = threshold * len(eventual)
    seen = 0
    for snap in sorted({show.first_snapshot for show in eventual}):
        if snap < first_observation:
            continue
        seen = len(known_by(shows, snap))
        if seen >= target:
            return (snap - first_observation).days
    return None


def days_until_final_known(shows: Sequence[AnnouncedShow], first_observation: date) -> int | None:
    discovered = final_date_discovered(shows)
    if discovered is None:
        return None
    return (discovered - first_observation).days


def format_show_dates(dates: Sequence[date]) -> str:
    ordered = sorted(set(dates))
    if not ordered:
        return ""
    ranges: list[tuple[date, date]] = []
    start = previous = ordered[0]
    for current in ordered[1:]:
        if current == previous + timedelta(days=1):
            previous = current
            continue
        ranges.append((start, previous))
        start = previous = current
    ranges.append((start, previous))
    parts = []
    for first, last in ranges:
        if first == last:
            parts.append(f"{first.strftime('%b')} {first.day}")
        elif first.month == last.month and first.year == last.year:
            parts.append(f"{first.strftime('%b')} {first.day}–{last.day}")
        else:
            parts.append(f"{first.strftime('%b')} {first.day}–{last.strftime('%b')} {last.day}")
    return ", ".join(parts)


def shows_from_screening(screening: Screening, *, removed: bool) -> AnnouncedShow:
    return AnnouncedShow(
        show_id=screening.screening_id,
        show_date=screening.show_date,
        first_snapshot=screening.first_snapshot,
        removed_at=screening.removed_at if removed else None,
        removed=removed,
    )


def shows_from_engagement(engagement: Engagement) -> list[AnnouncedShow]:
    rows = [shows_from_screening(item, removed=False) for item in engagement.screenings]
    rows.extend(shows_from_screening(item, removed=True) for item in engagement.removed_screenings)
    return rows


def _median(values: Sequence[float]) -> float | None:
    if not values:
        return None
    return float(statistics.median(values))


def _rate(flags: Sequence[bool]) -> float | None:
    if not flags:
        return None
    return sum(1 for flag in flags if flag) / len(flags)


def classify_exact_extension(row: Mapping[str, Any]) -> str:
    """Partition engagements the original metric calls extended.

    Immediate rollout: the eventual final date is already known within 2 snapshot days.
    Pre-opening rollout: still short at 2 days, but the final date appears before opening.
    Post-opening: final date first appears after opening, before two play days.
    Late in-run: final date first appears on or after opening + 2 days.
    """
    exact = row.get("extended_exact_first")
    if exact is False:
        return "not_extended_on_first_snapshot"
    if exact is not True:
        return "not_applicable"
    within_48 = row.get("extended_within_48h")
    if within_48 is False:
        return "immediate_rollout_within_48h"
    if within_48 is not True:
        return "lag_not_observable"
    if row.get("extended_post_opening") is False:
        return "pre_opening_rollout_after_48h"
    if row.get("extended_post_opening") is not True:
        return "not_applicable"
    if row.get("extended_late") is True:
        return "late_in_run_extension"
    if row.get("extended_late") is False:
        return "post_opening_before_two_play_days"
    return "not_applicable"


def metric_row_for_engagement(
    engagement: Engagement,
    *,
    snapshot_dates: Sequence[date],
    as_of: date,
    theater_name: str,
    opening_week_known: int | None,
    opening_week_eventual: int | None,
) -> dict[str, Any]:
    shows = shows_from_engagement(engagement)
    final = eventual_final_date(shows)
    discovered = final_date_discovered(shows)
    row: dict[str, Any] = {
        "film_id": engagement.film_id,
        "title": engagement.title,
        "theater_id": engagement.theater_id,
        "theater_name": theater_name,
        "segment": engagement.segment,
        "catalog_category": engagement.catalog_category,
        "end_status": engagement.end_status,
        "opening_date": engagement.start_date.isoformat(),
        "eventual_final_date": final.isoformat() if final else "",
        "first_observation": engagement.first_observation.isoformat(),
        "first_observation_weekday": weekday_name(engagement.first_observation),
        "original_share_visible_at_first_observation": engagement.share_visible_at_first_observation,
        "original_extended": engagement.extended,
        "original_days_added": engagement.days_added if engagement.days_added is not None else "",
        "opening_week_screenings_known_at_first_observation": opening_week_known if opening_week_known is not None else "",
        "opening_week_screenings_eventual": opening_week_eventual if opening_week_eventual is not None else "",
        "opening_week_completeness_at_first_observation": (
            round(opening_week_known / opening_week_eventual, 4)
            if opening_week_known is not None and opening_week_eventual
            else ""
        ),
        "days_to_50pct": days_until_share(shows, engagement.first_observation, 0.50),
        "days_to_80pct": days_until_share(shows, engagement.first_observation, 0.80),
        "days_to_90pct": days_until_share(shows, engagement.first_observation, 0.90),
        "days_to_100pct": days_until_share(shows, engagement.first_observation, 1.0),
        "days_to_final_date_known": days_until_final_known(shows, engagement.first_observation),
        "final_date_known_before_opening": (
            discovered < engagement.start_date if discovered is not None else ""
        ),
    }
    for name, lag in LAGS:
        cutoff = engagement.first_observation + timedelta(days=lag)
        valid = cutoff_observable(engagement.first_observation, cutoff, snapshot_dates, as_of)
        row[f"{name}_valid"] = valid
        row[f"{name}_share_screenings"] = share_of_screenings(shows, cutoff) if valid else ""
        row[f"{name}_share_dates"] = share_of_dates(shows, cutoff) if valid else ""
        latest = latest_known_date(shows, cutoff) if valid else None
        row[f"{name}_latest_show_date"] = latest.isoformat() if latest else ""
        known = final_date_known(shows, cutoff) if valid else None
        row[f"{name}_final_date_known"] = known if known is not None else ""
    for name, days_before in OPENING_LAGS:
        cutoff = engagement.start_date - timedelta(days=days_before)
        valid = engagement.first_observation <= cutoff and cutoff_observable(
            engagement.first_observation, cutoff, snapshot_dates, as_of
        )
        row[f"{name}_valid"] = valid
        row[f"{name}_share_screenings"] = share_of_screenings(shows, cutoff) if valid else ""
        row[f"{name}_share_dates"] = share_of_dates(shows, cutoff) if valid else ""
        known = final_date_known(shows, cutoff) if valid else None
        row[f"{name}_final_date_known"] = known if known is not None else ""
    exact_cutoff = engagement.first_observation
    cutoff_48 = engagement.first_observation + timedelta(days=2)
    cutoff_72 = engagement.first_observation + timedelta(days=3)
    row["extended_exact_first"] = extended_beyond(shows, exact_cutoff)
    row["extended_within_48h"] = (
        extended_beyond(shows, cutoff_48)
        if cutoff_observable(engagement.first_observation, cutoff_48, snapshot_dates, as_of)
        else ""
    )
    row["extended_within_72h"] = (
        extended_beyond(shows, cutoff_72)
        if cutoff_observable(engagement.first_observation, cutoff_72, snapshot_dates, as_of)
        else ""
    )
    row["extended_post_opening"] = post_opening_extension(shows, engagement.start_date)
    row["extended_late"] = late_extension(shows, engagement.start_date)
    row["exact_extension_class"] = classify_exact_extension(row)
    return row


def opening_week_counts(
    by_theater_date: Mapping[tuple[str, date], Sequence[date]],
    theater_id: str,
    opening: date,
    observation: date,
) -> tuple[int, int]:
    friday = programming_week_friday(opening)
    known = 0
    eventual = 0
    for offset in range(7):
        day = friday + timedelta(days=offset)
        snaps = by_theater_date.get((theater_id, day), ())
        eventual += len(snaps)
        known += sum(1 for snap in snaps if snap <= observation)
    return known, eventual


def _index_theater_dates(screenings: Sequence[Screening]) -> dict[tuple[str, date], list[date]]:
    indexed: dict[tuple[str, date], list[date]] = defaultdict(list)
    for screening in screenings:
        if screening.canceled or screening.removed_before_show:
            continue
        indexed[(screening.theater_id, screening.show_date)].append(screening.first_snapshot)
    return indexed


def summarize_segment(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    def valid_numbers(key: str) -> list[float]:
        values = []
        for row in rows:
            if row.get(f"{key}_valid") is not True:
                continue
            value = row.get(f"{key}_share_screenings")
            if isinstance(value, (int, float)):
                values.append(float(value))
        return values

    def final_known_rate(key: str) -> dict[str, Any]:
        flags = []
        for row in rows:
            if row.get(f"{key}_valid") is not True:
                continue
            value = row.get(f"{key}_final_date_known")
            if isinstance(value, bool):
                flags.append(value)
        return {"n": len(flags), "share": _rate(flags)}

    lags = {}
    for name, _lag in LAGS:
        values = valid_numbers(name)
        date_values = []
        for row in rows:
            if row.get(f"{name}_valid") is not True:
                continue
            value = row.get(f"{name}_share_dates")
            if isinstance(value, (int, float)):
                date_values.append(float(value))
        lags[name] = {
            "n": len(values),
            "median_share_screenings": _median(values),
            "median_share_dates": _median(date_values),
            "final_date_known": final_known_rate(name),
        }
    opening = {}
    for name, _days in OPENING_LAGS:
        values = valid_numbers(name)
        opening[name] = {
            "n": len(values),
            "median_share_screenings": _median(values),
            "final_date_known": final_known_rate(name),
        }
    extensions = {}
    for key, field_name in (
        ("exact_first", "extended_exact_first"),
        ("within_48h", "extended_within_48h"),
        ("within_72h", "extended_within_72h"),
        ("post_opening", "extended_post_opening"),
        ("late", "extended_late"),
    ):
        flags = [row[field_name] for row in rows if isinstance(row.get(field_name), bool)]
        extensions[key] = {"n": len(flags), "rate": _rate(flags)}
    classes: dict[str, int] = defaultdict(int)
    for row in rows:
        classes[str(row.get("exact_extension_class"))] += 1
    rollout_days = {
        label: _median(
            [float(row[field]) for row in rows if isinstance(row.get(field), int)]
        )
        for label, field in (
            ("days_to_50pct", "days_to_50pct"),
            ("days_to_80pct", "days_to_80pct"),
            ("days_to_90pct", "days_to_90pct"),
            ("days_to_100pct", "days_to_100pct"),
            ("days_to_final_date_known", "days_to_final_date_known"),
        )
    }
    before_opening = [
        row["final_date_known_before_opening"]
        for row in rows
        if isinstance(row.get("final_date_known_before_opening"), bool)
    ]
    return {
        "n": len(rows),
        "lags": lags,
        "opening_relative": opening,
        "extensions": extensions,
        "exact_extension_class_counts": dict(classes),
        "rollout_days_median": rollout_days,
        "final_date_known_before_opening": {"n": len(before_opening), "share": _rate(before_opening)},
        "days_to_90pct_values": [row["days_to_90pct"] for row in rows if isinstance(row.get("days_to_90pct"), int)],
    }


def daily_publication_rows(
    engagement: Engagement,
    *,
    theater_name: str,
    snapshot_dates: Sequence[date],
    completeness_by_date: Mapping[date, str],
    by_theater_date: Mapping[tuple[str, date], Sequence[date]],
    as_of: date,
) -> list[dict[str, Any]]:
    shows = shows_from_engagement(engagement)
    if not shows:
        return []
    first_observation = min(show.first_snapshot for show in shows)
    window = [day for day in snapshot_dates if first_observation <= day <= min(as_of, engagement.end_date)]
    if engagement.end_date > as_of:
        window = [day for day in snapshot_dates if first_observation <= day <= as_of]
    previous_ids: set[str] = set()
    previous_dates: set[date] = set()
    rows = []
    for snapshot in window:
        completeness = completeness_by_date.get(snapshot, "unknown")
        active = [show for show in shows if listed_on_snapshot(show, snapshot)]
        dates = sorted({show.show_date for show in active})
        ids = {show.show_id for show in active}
        added_dates = sorted(set(dates) - previous_dates)
        added_ids = ids - previous_ids
        removed = removals_on_snapshot(shows, snapshot, completeness)
        known, eventual = opening_week_counts(
            by_theater_date, engagement.theater_id, engagement.start_date, snapshot
        )
        completeness_value = (known / eventual) if eventual else None
        rows.append(
            {
                "title": engagement.title,
                "film_id": engagement.film_id,
                "catalog_category": engagement.catalog_category,
                "segment": engagement.segment,
                "theater_id": engagement.theater_id,
                "theater_name": theater_name,
                "end_status": engagement.end_status,
                "snapshot_date": snapshot.isoformat(),
                "observation_weekday": weekday_name(snapshot),
                "days_before_first_show": (engagement.start_date - snapshot).days,
                "is_first_observed_snapshot": snapshot == first_observation,
                "snapshot_completeness": completeness,
                "announced_show_dates": ";".join(day.isoformat() for day in dates),
                "announced_show_dates_label": format_show_dates(dates),
                "visible_screening_count": len(active),
                "earliest_visible_show_date": dates[0].isoformat() if dates else "",
                "latest_visible_show_date": dates[-1].isoformat() if dates else "",
                "new_show_dates": ";".join(day.isoformat() for day in added_dates),
                "new_show_dates_label": format_show_dates(added_dates),
                "screenings_added": len(added_ids),
                "screenings_removed": len(removed),
                "removal_inferred": completeness == COMPLETE,
                "opening_date": engagement.start_date.isoformat(),
                "eventual_final_show_date": engagement.end_date.isoformat(),
                "theater_opening_week_screenings_known": known,
                "theater_opening_week_screenings_eventual": eventual,
                "theater_opening_week_completeness": (
                    round(completeness_value, 4) if completeness_value is not None else ""
                ),
                "theater_schedule_substantially_published": (
                    completeness_value is not None and completeness_value >= 0.8
                ),
            }
        )
        previous_ids = ids
        previous_dates = set(dates)
    return rows


def build_validation(result: Mapping[str, Any]) -> dict[str, Any]:
    snapshot_dates = sorted({item.snapshot_date for item in result["snapshots"]})
    completeness_by_date = {item.snapshot_date: item.completeness for item in result["snapshots"]}
    as_of = result["as_of"]
    theater_names = result["theater_names"]
    indexed = _index_theater_dates(result["screenings"])
    metric_rows = []
    for engagement in result["film_theater"]:
        if engagement.segment not in {SEGMENT_RERELEASE, SEGMENT_ORDINARY, SEGMENT_SPECIAL}:
            continue
        if not engagement.announcement_observed or not engagement.confirmed:
            continue
        known, eventual = opening_week_counts(
            indexed, engagement.theater_id, engagement.start_date, engagement.first_observation
        )
        metric_rows.append(
            metric_row_for_engagement(
                engagement,
                snapshot_dates=snapshot_dates,
                as_of=as_of,
                theater_name=theater_names.get(engagement.theater_id, engagement.theater_id),
                opening_week_known=known,
                opening_week_eventual=eventual,
            )
        )
    by_segment = {}
    for key, segment in SEGMENT_KEYS:
        by_segment[key] = summarize_segment([row for row in metric_rows if row["segment"] == segment])
    focus_engagements = [
        engagement
        for engagement in result["film_theater"]
        if engagement.film_id in FOCUS_IDS
    ]
    daily_rows: list[dict[str, Any]] = []
    for engagement in focus_engagements:
        daily_rows.extend(
            daily_publication_rows(
                engagement,
                theater_name=theater_names.get(engagement.theater_id, engagement.theater_id),
                snapshot_dates=snapshot_dates,
                completeness_by_date=completeness_by_date,
                by_theater_date=indexed,
                as_of=as_of,
            )
        )
    return {
        "metric_rows": metric_rows,
        "daily_rows": daily_rows,
        "focus_engagements": focus_engagements,
        "by_segment": by_segment,
        "summary": {
            "population": (
                "Film×theater engagements with a pre-opening announcement and a confirmed end. "
                "Exact-first numbers repeat the original definition. Later lags ask what was known "
                "by first_observation plus N snapshot days. Post-opening and late extension ask when "
                "the eventual final date was first listed, not merely whether day 0 was short."
            ),
            "by_segment": {
                key: {
                    item_key: item_value
                    for item_key, item_value in segment.items()
                    if item_key != "days_to_90pct_values"
                }
                for key, segment in by_segment.items()
            },
            "focus_film_ids": {film_id: title for film_id, title in FOCUS_FILMS},
            "focus_engagement_count": len(focus_engagements),
        },
    }


def _write_csv(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                fields.append(key)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    key: "" if row.get(key) is None else row.get(key, "")
                    for key in fields
                }
            )


def _style() -> None:
    import matplotlib.pyplot as plt

    plt.rcParams.update(
        {
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "axes.grid": True,
            "grid.alpha": 0.28,
            "axes.axisbelow": True,
            "font.size": 10,
            "figure.dpi": 120,
        }
    )


def _save(fig: Any, path: Path) -> None:
    import matplotlib.pyplot as plt

    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


def _segment_color(name: str) -> str:
    return {"rerelease": "#c47b2b", "ordinary": "#1f4e79", "special": "#2f6f4e"}.get(name, "#243040")


def render_validation_charts(payload: Mapping[str, Any], out_dir: Path) -> list[str]:
    import matplotlib.pyplot as plt
    from matplotlib.dates import DateFormatter, date2num

    _style()
    written: list[str] = []
    by_segment = payload["by_segment"]
    names = [key for key, _segment in SEGMENT_KEYS]

    def keep(path: Path) -> None:
        written.append(path.name)

    # Completeness by lag.
    fig, ax = plt.subplots(figsize=(9.4, 5.4))
    import numpy as np

    x = np.arange(len(LAGS))
    width = 0.24
    for index, name in enumerate(names):
        block = by_segment[name]["lags"]
        heights = [(block[lag]["median_share_screenings"] or 0) * 100 for lag, _n in LAGS]
        ns = [block[lag]["n"] for lag, _n in LAGS]
        offset = (index - 1) * width
        bars = ax.bar(
            x + offset,
            heights,
            width=width * 0.92,
            color=_segment_color(name),
            label=name,
        )
        for bar, n_value, height in zip(bars, ns, heights):
            ax.text(bar.get_x() + bar.get_width() / 2, height + 1.2, f"n={n_value}", ha="center", va="bottom", fontsize=7)
    ax.set_xticks(x, ["First snapshot", "+1 day", "+2 days", "+3 days"])
    ax.set_ylabel("Median share of eventual screenings visible")
    ax.set_ylim(0, 120)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False)
    ax.set_title(
        "Schedule share visible by observation lag\nMedian of confirmed, pre-opening engagements. Exact-first is the original metric.",
        loc="left",
        color="#243040",
    )
    path = out_dir / "rerelease_completeness_by_observation_lag.png"
    _save(fig, path)
    keep(path)

    fig, ax = plt.subplots(figsize=(9.4, 5.4))
    for name in names:
        block = by_segment[name]["lags"]
        ys = []
        for lag, _n in LAGS:
            share = block[lag]["final_date_known"]["share"]
            ys.append((share or 0) * 100)
        ns = [block[lag]["final_date_known"]["n"] for lag, _n in LAGS]
        ax.plot(
            range(len(LAGS)),
            ys,
            marker="o",
            color=_segment_color(name),
            label=f"{name} (n={ns[0]})",
        )
    ax.set_xticks(range(len(LAGS)), ["First snapshot", "+1 day", "+2 days", "+3 days"])
    ax.set_ylabel("Engagements whose eventual final date is already known")
    ax.set_ylim(0, 105)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False)
    ax.set_title(
        "Was the eventual final show date already listed?\nSame population as the completeness chart. Daily snapshots, not clock hours.",
        loc="left",
        color="#243040",
    )
    path = out_dir / "rerelease_final_date_known_by_lag.png"
    _save(fig, path)
    keep(path)

    fig, ax = plt.subplots(figsize=(10.2, 5.6))
    x = np.arange(len(EXTENSION_KEYS))
    labels = ["Exact first\nsnapshot", "Still short\nafter 2 days", "Still short\nafter 3 days", "Final date after\nopening day", "Final date after\n2 play days"]
    for index, name in enumerate(names):
        block = by_segment[name]["extensions"]
        heights = [(block[key]["rate"] or 0) * 100 for key in EXTENSION_KEYS]
        ns = [block[key]["n"] for key in EXTENSION_KEYS]
        offset = (index - 1) * width
        bars = ax.bar(x + offset, heights, width=width * 0.92, color=_segment_color(name), label=name)
        for bar, n_value, height in zip(bars, ns, heights):
            ax.text(bar.get_x() + bar.get_width() / 2, height + 1.2, str(n_value), ha="center", va="bottom", fontsize=7)
    ax.set_xticks(x, labels)
    ax.set_ylabel("Share of engagements")
    ax.set_ylim(0, 120)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False)
    ax.set_title(
        "Extension rate under five definitions\nExact-first counts any later final date. Post-opening and late count only in-run movement.",
        loc="left",
        color="#243040",
    )
    path = out_dir / "rerelease_extension_rate_by_definition.png"
    _save(fig, path)
    keep(path)

    fig, ax = plt.subplots(figsize=(9.2, 5.4))
    for name in names:
        values = sorted(by_segment[name]["days_to_90pct_values"])
        if not values:
            continue
        xs = sorted(set(values))
        ys = [sum(1 for value in values if value <= day) / len(values) * 100 for day in xs]
        ax.step(xs, ys, where="post", color=_segment_color(name), label=f"{name} (n={len(values)})")
        ax.plot(xs, ys, "o", color=_segment_color(name), markersize=4)
    ax.set_xlabel("Snapshot days after first observation")
    ax.set_ylabel("Engagements that have reached 90% of eventual screenings")
    ax.set_ylim(0, 105)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False)
    ax.set_title(
        "How quickly 90% of the eventual screenings are listed\nCumulative share. One step is one daily snapshot, not an exact hour.",
        loc="left",
        color="#243040",
    )
    path = out_dir / "announcement_rollout_time_to_90pct.png"
    _save(fig, path)
    keep(path)

    fig, ax = plt.subplots(figsize=(9.6, 5.4))
    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    x = np.arange(len(weekdays))
    for index, name in enumerate(names):
        rows = [row for row in payload["metric_rows"] if row["segment"] == SEGMENT_KEYS[index][1]]
        heights = []
        ns = []
        for weekday in weekdays:
            values = [
                float(row["exact_first_share_screenings"])
                for row in rows
                if row["first_observation_weekday"] == weekday and isinstance(row.get("exact_first_share_screenings"), float)
            ]
            heights.append((statistics.median(values) * 100) if values else 0)
            ns.append(len(values))
        offset = (index - 1) * width
        bars = ax.bar(x + offset, heights, width=width * 0.92, color=_segment_color(name), label=name)
        for bar, n_value in zip(bars, ns):
            if n_value:
                ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1, str(n_value), ha="center", fontsize=7)
    ax.set_xticks(x, [name[:3] for name in weekdays])
    ax.set_ylabel("Median exact-first screening share")
    ax.set_ylim(0, 120)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False)
    ax.set_title(
        "Exact-first completeness by the weekday we first saw the engagement\nNumbers on the bars are sample sizes. This is the original metric, split by discovery weekday.",
        loc="left",
        color="#243040",
    )
    path = out_dir / "announcement_completeness_by_first_observation_weekday.png"
    _save(fig, path)
    keep(path)

    # Composition of the original "extended" set.
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    class_order = [
        ("immediate_rollout_within_48h", "Final date known within 2 days"),
        ("pre_opening_rollout_after_48h", "Final date known before opening, after 2 days"),
        ("post_opening_before_two_play_days", "Final date after opening, before 2 play days"),
        ("late_in_run_extension", "Final date after 2 play days"),
    ]
    x = np.arange(len(names))
    bottoms = np.zeros(len(names))
    palette = ["#1f4e79", "#7ea0c4", "#c47b2b", "#8c3a3a"]
    for (class_name, label), color in zip(class_order, palette):
        heights = []
        for name in names:
            counts = by_segment[name]["exact_extension_class_counts"]
            extended_n = sum(counts.get(key, 0) for key, _label in class_order)
            count = counts.get(class_name, 0)
            heights.append((count / extended_n * 100) if extended_n else 0)
        ax.bar(x, heights, bottom=bottoms, color=color, label=label)
        bottoms = bottoms + np.array(heights)
    ax.set_xticks(x, names)
    ax.set_ylabel("Share of exact-first extensions")
    ax.set_ylim(0, 100)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda value, _pos: f"{value:.0f}%"))
    ax.legend(frameon=False, fontsize=8)
    ax.set_title(
        "What the original extension flag is made of\nEach bar is only the engagements whose first snapshot did not yet show the eventual final date.",
        loc="left",
        color="#243040",
    )
    path = out_dir / "rerelease_extension_composition.png"
    _save(fig, path)
    keep(path)

    _render_rollout_examples(payload, out_dir, date2num, DateFormatter, plt)
    written.append("rerelease_publication_rollout_examples.png")
    for film_id, _title in FOCUS_FILMS:
        slug = _slug(film_id)
        chart = out_dir / f"rerelease_rollout_{slug}.png"
        if chart.exists():
            written.append(chart.name)
    return written


def _slug(film_id: str) -> str:
    titles = dict(FOCUS_FILMS)
    text = titles.get(film_id, film_id).casefold()
    keep = "".join(ch if ch.isalnum() else "-" for ch in text)
    while "--" in keep:
        keep = keep.replace("--", "-")
    return keep.strip("-")[:48]


def _render_rollout_examples(payload: Mapping[str, Any], out_dir: Path, date2num: Any, date_formatter: Any, plt: Any) -> None:
    daily = payload["daily_rows"]
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in daily:
        grouped[(row["film_id"], row["theater_id"])].append(row)
    # One representative per focus title: most snapshot rows, prefer a confirmed end.
    chosen = []
    for film_id, title in FOCUS_FILMS:
        candidates = [key for key in grouped if key[0] == film_id]
        if not candidates:
            continue
        def score(key: tuple[str, str]) -> tuple[int, int]:
            rows = grouped[key]
            confirmed = 1 if rows and rows[0]["end_status"] == "confirmed_complete" else 0
            return (confirmed, len(rows))
        best = max(candidates, key=score)
        chosen.append((title, grouped[best]))
    if not chosen:
        return
    fig, axes = plt.subplots(3, 2, figsize=(12.4, 11), sharex=False)
    flat = list(axes.ravel())
    for ax in flat[len(chosen) :]:
        ax.axis("off")
    for ax, (title, rows) in zip(flat, chosen):
        _plot_rollout(ax, rows, date2num, date_formatter, plt)
        ax.set_title(f"{title}\n{rows[0]['theater_name'].replace('AMC ', '')}", loc="left", fontsize=9, color="#243040")
    fig.suptitle(
        "Daily publication rollout for one theater per focus title\nY-axis is the latest show date known on that snapshot. Blue is day 0, orange +1 day, green +2 days, red later.",
        fontsize=12,
        fontweight="semibold",
        color="#243040",
        x=0.02,
        ha="left",
    )
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(out_dir / "rerelease_publication_rollout_examples.png", bbox_inches="tight")
    plt.close(fig)

    for film_id, title in FOCUS_FILMS:
        keys = [key for key in grouped if key[0] == film_id]
        if not keys:
            continue
        keys.sort(key=lambda key: grouped[key][0]["theater_name"])
        fig, axes = plt.subplots(len(keys), 1, figsize=(10.5, max(2.6 * len(keys), 3.2)), sharex=False)
        if len(keys) == 1:
            axes = [axes]
        for ax, key in zip(axes, keys):
            rows = grouped[key]
            _plot_rollout(ax, rows, date2num, date_formatter, plt)
            ax.set_title(rows[0]["theater_name"], loc="left", fontsize=10, color="#243040")
        fig.suptitle(title, fontsize=12, fontweight="semibold", color="#243040", x=0.02, ha="left")
        fig.tight_layout(rect=(0, 0, 1, 0.96))
        fig.savefig(out_dir / f"rerelease_rollout_{_slug(film_id)}.png", bbox_inches="tight")
        plt.close(fig)


def _plot_rollout(ax: Any, rows: Sequence[Mapping[str, Any]], date2num: Any, date_formatter: Any, plt: Any) -> None:
    from matplotlib.dates import DayLocator

    if not rows:
        return
    first = date.fromisoformat(rows[0]["snapshot_date"])
    opening = date.fromisoformat(rows[0]["opening_date"])
    eventual = date.fromisoformat(rows[0]["eventual_final_show_date"])
    xs = []
    ys = []
    colors = []
    for row in rows:
        if not row["latest_visible_show_date"]:
            continue
        snap = date.fromisoformat(row["snapshot_date"])
        latest = date.fromisoformat(row["latest_visible_show_date"])
        lag = (snap - first).days
        if lag <= 0:
            color = "#1f4e79"
        elif lag == 1:
            color = "#c47b2b"
        elif lag == 2:
            color = "#2f6f4e"
        else:
            color = "#8c3a3a"
        xs.append(date2num(snap))
        ys.append(date2num(latest))
        colors.append(color)
    if xs:
        ax.plot(xs, ys, color="#98a2b3", linewidth=1)
        ax.scatter(xs, ys, c=colors, s=28, zorder=3)
    known_dates = [opening, eventual]
    for row in rows:
        if row["latest_visible_show_date"]:
            known_dates.append(date.fromisoformat(row["latest_visible_show_date"]))
    low = min(known_dates) - timedelta(days=1)
    high = max(known_dates) + timedelta(days=1)
    ax.set_ylim(date2num(low), date2num(high))
    ax.axhline(date2num(opening), color="#2f6f4e", linestyle=":", linewidth=1)
    ax.axhline(date2num(eventual), color="#8c3a3a", linestyle="--", linewidth=1)
    ax.xaxis.set_major_formatter(date_formatter("%b %d"))
    ax.yaxis.set_major_formatter(date_formatter("%b %d"))
    if (high - low).days <= 16:
        ax.yaxis.set_major_locator(DayLocator(interval=1))
    ax.tick_params(axis="x", labelrotation=30, labelsize=8)
    ax.tick_params(axis="y", labelsize=8)
    status = rows[0]["end_status"].replace("_", " ")
    first_label = rows[0]["announced_show_dates_label"] or "none"
    ax.set_xlabel(f"Snapshot date · first listing: {first_label} · {status}", fontsize=8)


def _pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value * 100:.1f}%"


def _esc(value: object) -> str:
    return html.escape(str(value))


def render_validation_html(payload: Mapping[str, Any]) -> str:
    by_segment = payload["summary"]["by_segment"]
    images = [
        "rerelease_publication_rollout_examples.png",
        "rerelease_completeness_by_observation_lag.png",
        "rerelease_final_date_known_by_lag.png",
        "rerelease_extension_rate_by_definition.png",
        "rerelease_extension_composition.png",
        "announcement_rollout_time_to_90pct.png",
        "announcement_completeness_by_first_observation_weekday.png",
    ]
    figures = "".join(
        f'<figure><img src="{_esc(name)}" alt="{_esc(name)}"><figcaption>{_esc(name)}</figcaption></figure>'
        for name in images
    )
    per_title = []
    for film_id, title in FOCUS_FILMS:
        slug = _slug(film_id)
        per_title.append(
            f'<figure><img src="rerelease_rollout_{_esc(slug)}.png" alt="{_esc(title)}"><figcaption>{_esc(title)}</figcaption></figure>'
        )
    header = (
        "<tr><th>Definition</th><th>Rerelease</th><th>Ordinary</th><th>Special</th></tr>"
    )

    def cell(segment: str, lag: str, field: str) -> str:
        block = by_segment[segment]["lags"][lag]
        if field == "median":
            return f"{_pct(block['median_share_screenings'])} (n={block['n']})"
        known = block["final_date_known"]
        return f"{_pct(known['share'])} (n={known['n']})"

    lag_rows = []
    for lag, label in (
        ("exact_first", "Exact first snapshot"),
        ("plus_1_day", "Within 1 day"),
        ("plus_2_days", "Within 2 days"),
        ("plus_3_days", "Within 3 days"),
    ):
        lag_rows.append(
            "<tr>"
            f"<td>{label}, median screening share</td>"
            f"<td>{cell('rerelease', lag, 'median')}</td>"
            f"<td>{cell('ordinary', lag, 'median')}</td>"
            f"<td>{cell('special', lag, 'median')}</td>"
            "</tr>"
            "<tr>"
            f"<td>{label}, eventual final date already known</td>"
            f"<td>{cell('rerelease', lag, 'final')}</td>"
            f"<td>{cell('ordinary', lag, 'final')}</td>"
            f"<td>{cell('special', lag, 'final')}</td>"
            "</tr>"
        )
    ext_rows = []
    for key, label in (
        ("exact_first", "Exact-first extension"),
        ("within_48h", "Still extended after 2 days"),
        ("within_72h", "Still extended after 3 days"),
        ("post_opening", "Final date first appears after opening"),
        ("late", "Final date first appears after 2 play days"),
    ):
        def ext(segment: str, field: str = key) -> str:
            block = by_segment[segment]["extensions"][field]
            return f"{_pct(block['rate'])} (n={block['n']})"
        ext_rows.append(
            f"<tr><td>{label}</td><td>{ext('rerelease')}</td><td>{ext('ordinary')}</td><td>{ext('special')}</td></tr>"
        )
    opening_rows = []
    for key, label in (
        ("by_7_days_before_opening", "By 7 days before opening"),
        ("by_3_days_before_opening", "By 3 days before opening"),
    ):
        def opening_cell(segment: str, field: str = key) -> str:
            block = by_segment[segment]["opening_relative"][field]
            return f"{_pct(block['median_share_screenings'])} (n={block['n']})"
        opening_rows.append(
            f"<tr><td>{label}, median screening share</td><td>{opening_cell('rerelease')}</td><td>{opening_cell('ordinary')}</td><td>{opening_cell('special')}</td></tr>"
        )
    # Focus examples: first snapshot label and +1/+2 if present in daily rows.
    by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in payload["daily_rows"]:
        by_key[(row["film_id"], row["theater_id"])].append(row)
    example_rows = []
    for (film_id, theater_id), rows in sorted(by_key.items(), key=lambda item: (item[1][0]["title"], item[1][0]["theater_name"])):
        first = rows[0]
        def label_at(lag: int) -> str:
            target = date.fromisoformat(first["snapshot_date"]) + timedelta(days=lag)
            match = next((row for row in rows if row["snapshot_date"] == target.isoformat()), None)
            if match is None:
                return "no snapshot"
            return match["announced_show_dates_label"] or "none"
        example_rows.append(
            "<tr>"
            f"<td>{_esc(first['title'])}</td>"
            f"<td>{_esc(first['theater_name'].replace('AMC ', ''))}</td>"
            f"<td>{_esc(first['snapshot_date'])}</td>"
            f"<td>{_esc(first['observation_weekday'])}</td>"
            f"<td>{_esc(label_at(0))}</td>"
            f"<td>{_esc(label_at(1))}</td>"
            f"<td>{_esc(label_at(2))}</td>"
            f"<td>{_esc(first['opening_date'])}</td>"
            f"<td>{_esc(first['eventual_final_show_date'])}</td>"
            f"<td>{_esc(first['end_status'])}</td>"
            f"<td>{_esc(first['theater_opening_week_completeness'])}</td>"
            "</tr>"
        )
    rerelease_classes = by_segment["rerelease"]["exact_extension_class_counts"]
    return f"""
    <section id="rerelease-validation">
      <h2>Validation: does “first snapshot” understate the initially announced run?</h2>
      <p>The original exact-first metric is unchanged and still shown above. The figures here ask whether a short daily-scrape rollout, rather than a later renewal, produces that result.</p>
      <p>Three readings stay separate. <strong>First observed snapshot completeness</strong> is what the discovery snapshot listed. <strong>Announcement rollout completeness</strong> is what the next one to three daily snapshots listed. <strong>True in-run extension</strong> is whether the eventual final date first appeared after the engagement had already opened.</p>
      <h3>Exact-first versus the next few snapshots</h3>
      <table><thead>{header}</thead><tbody>{''.join(lag_rows)}{''.join(opening_rows)}</tbody></table>
      <h3>Extension definitions</h3>
      <table><thead>{header}</thead><tbody>{''.join(ext_rows)}</tbody></table>
      <p>Of catalog rereleases the original metric marks extended, the class counts are: within 2 days {rerelease_classes.get('immediate_rollout_within_48h', 0)}, still short at 2 days but final date known before opening {rerelease_classes.get('pre_opening_rollout_after_48h', 0)}, after opening but before 2 play days {rerelease_classes.get('post_opening_before_two_play_days', 0)}, after 2 play days {rerelease_classes.get('late_in_run_extension', 0)}. Not extended on the first snapshot: {rerelease_classes.get('not_extended_on_first_snapshot', 0)}.</p>
      {figures}
      <h3>Focus titles, every Seattle AMC engagement</h3>
      <p>Each row is the show-date span listed on the first snapshot, the next snapshot, and the snapshot two days later. The full day-by-day ranges are in the CSV, not collapsed here.</p>
      <table>
        <thead><tr><th>Title</th><th>Theater</th><th>First snapshot</th><th>Weekday</th><th>Listed that day</th><th>Listed +1 day</th><th>Listed +2 days</th><th>Opening</th><th>Eventual final date in the ledger</th><th>End status</th><th>Theater opening-week completeness that day</th></tr></thead>
        <tbody>{''.join(example_rows)}</tbody>
      </table>
      {''.join(per_title)}
      <h3>Caveats</h3>
      <ul>
        <li>Snapshots are once a day. “+1 day” and “48 hours” mean the next daily snapshot or the snapshot two days later, not an exact hour.</li>
        <li>A lag counts only when that calendar day’s snapshot exists and is on or before as-of. A missing day is left out of the denominator. It is not treated as a removal or as an empty schedule.</li>
        <li>Screenings removed later are out of the eventual denominator, matching the original share. A removal is counted on a daily row only when that snapshot is complete.</li>
        <li>“By 7 days before opening” and “by 3 days before opening” include only engagements we were already observing that early. The sample is smaller on purpose.</li>
        <li>Batman (1989) is catalog category standard. It is in the focus tables because it was named for inspection. It is not in the catalog-rerelease percentages unless its segment is rerelease.</li>
        <li>An unconfirmed end status means the ledger’s last date may still move. Those rows are in the daily CSV and are outside the rate tables.</li>
      </ul>
      <p class="files">Inspection tables: <a href="rerelease_daily_publication_history.csv">rerelease_daily_publication_history.csv</a>, <a href="announcement_definition_comparison.csv">announcement_definition_comparison.csv</a></p>
    </section>
    """


def attach_validation(result: dict[str, Any], out_dir: Path) -> None:
    payload = build_validation(result)
    _write_csv(out_dir / "rerelease_daily_publication_history.csv", payload["daily_rows"])
    _write_csv(out_dir / "announcement_definition_comparison.csv", payload["metric_rows"])
    render_validation_charts(payload, out_dir)
    result["summary"]["announcement_validation"] = payload["summary"]
    result["validation_html"] = render_validation_html(payload)
    result["announcement_validation_payload"] = payload
