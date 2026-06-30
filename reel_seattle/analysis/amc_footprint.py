"""Derive AMC film-footprint rows from normalized daily scrape logs.

Output grain: one row per (snapshot_date, showtime_film_key, show_date).

Scope: all enabled AMC theaters in ``data/theaters.json``. v1 uses the full
registry allowlist; a narrower Seattle-core subset can be applied later via
``--theaters`` or a dedicated filter without changing the output schema.

This module summarizes what was visible in each snapshot only. It does not
assign leaving-soon labels or look forward across snapshots for outcomes.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.adapters.scrape_log import load_scrape_daily_log
from reel_seattle.normalize import (
    DEFAULT_TIMEZONE,
    build_theater_index,
    format_date_iso,
    parse_format_tags,
    parse_show_date,
    parse_time_to_minutes,
    resolve_theater,
    showtime_film_key,
)

SOURCE = "amc"

# Matinee before 17:00, prime 17:00–21:59, late 22:00+ (local clock).
MATINEE_END_MIN = 17 * 60
PRIME_END_MIN = 22 * 60

EVENT_TITLE_PATTERNS = re.compile(
    r"(telemundo|fathom|wwe\b|one[\s-]?night|live in (concert|theater)|"
    r"\bopera\b|\bballet\b|\bconcert\b|met opera|ufc\b|"
    r"world cup|vs[\s\.]|presenta la copa)",
    re.IGNORECASE,
)

FOOTPRINT_FIELDNAMES = [
    "snapshot_date",
    "snapshot_timestamp",
    "source",
    "showtime_film_key",
    "film_title",
    "amc_movie_id",
    "show_date",
    "days_from_snapshot_to_show_date",
    "theater_count",
    "showtime_count",
    "canceled_count",
    "active_showtime_count",
    "almost_sold_out_count",
    "first_show_time",
    "last_show_time",
    "has_matinee",
    "has_primetime",
    "has_late",
    "has_weekend_show",
    "format_list",
    "premium_format_count",
    "theater_list",
    "min_show_date_visible_for_film_at_snapshot",
    "max_show_date_visible_for_film_at_snapshot",
    "visible_show_date_count_for_film_at_snapshot",
    "total_visible_showtimes_for_film_at_snapshot",
    "total_visible_theaters_for_film_at_snapshot",
    "first_snapshot_seen_for_film",
    "snapshots_seen_count_for_film",
    "event_like_flag",
    "event_like_reason",
]


@dataclass
class ParsedSnapshot:
    """One AMC daily log loaded and filtered to enabled registry theaters."""

    path: Path
    snapshot_date: date
    snapshot_timestamp: str | None
    records: list[RawShowtime] = field(default_factory=list)


@dataclass
class _ShowtimeObs:
    theater_id: str
    theater_name: str
    time_24h: str | None
    minutes: int | None
    canceled: bool
    almost_sold_out: bool
    format_tags: tuple[str, ...]


def enabled_amc_theater_names(registry: Mapping[str, Any]) -> set[str]:
    """Return display names for enabled AMC theaters in the registry."""
    names: set[str] = set()
    theaters = registry.get("theaters", [])
    if not isinstance(theaters, list):
        return names
    for entry in theaters:
        if not isinstance(entry, dict):
            continue
        if entry.get("source") != "amc":
            continue
        if entry.get("enabled") is False:
            continue
        name = str(entry.get("name", "")).strip()
        if name:
            names.add(name)
    return names


def parse_snapshot_timestamp(generated_at: str | None) -> tuple[date | None, str | None]:
    """Parse log ``generated_at`` to snapshot calendar date and ISO timestamp string."""
    if not generated_at:
        return None, None
    text = str(generated_at).strip()
    if not text:
        return None, None
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        return None, text
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    else:
        moment = moment.astimezone(ZoneInfo(DEFAULT_TIMEZONE))
    return moment.date(), moment.isoformat(timespec="seconds")


def _amc_movie_id_from_record(record: RawShowtime) -> str:
    """Return AMC movie id when present on raw attributes; never inferred from title."""
    if not record.attributes:
        return ""
    for key in ("movie_id", "movieId", "amc_movie_id"):
        value = record.attributes.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def _event_like_reason(
    film_title: str,
    *,
    total_showtimes: int,
    total_theaters: int,
    visible_show_dates: int,
) -> str:
    reasons: list[str] = []
    if EVENT_TITLE_PATTERNS.search(film_title):
        reasons.append("title_pattern")
    if total_showtimes <= 2 and total_theaters <= 1 and visible_show_dates <= 1:
        reasons.append("sparse_single_venue_day")
    return "|".join(reasons)


def _bool_csv(value: bool) -> str:
    return "true" if value else "false"


def _min_time(times: Iterable[str]) -> str:
    ordered = sorted(t for t in times if t)
    return ordered[0] if ordered else ""


def _max_time(times: Iterable[str]) -> str:
    ordered = sorted(t for t in times if t)
    return ordered[-1] if ordered else ""


def load_amc_snapshots(input_dir: Path) -> list[ParsedSnapshot]:
    """Load all ``*_amc.json`` logs under *input_dir*."""
    import json

    snapshots: list[ParsedSnapshot] = []
    for path in sorted(input_dir.glob("*_amc.json")):
        envelope = json.loads(path.read_text(encoding="utf-8"))
        snapshot_date, snapshot_timestamp = parse_snapshot_timestamp(
            envelope.get("generated_at")
        )
        if snapshot_date is None:
            prefix = path.stem.rsplit("_", 1)[0]
            try:
                snapshot_date = date.fromisoformat(prefix)
            except ValueError:
                continue

        result = load_scrape_daily_log(path)
        snapshots.append(
            ParsedSnapshot(
                path=path,
                snapshot_date=snapshot_date,
                snapshot_timestamp=snapshot_timestamp,
                records=list(result.records),
            )
        )

    snapshots.sort(key=lambda item: (item.snapshot_date, item.path.name))
    return snapshots


def build_footprint_rows(
    snapshots: Sequence[ParsedSnapshot],
    *,
    theater_index: Any,
) -> list[dict[str, str]]:
    """Build deterministic footprint rows from parsed snapshots."""
    lifecycle_first: dict[str, date] = {}
    lifecycle_count: dict[str, int] = defaultdict(int)

    rows: list[dict[str, str]] = []

    for snapshot in snapshots:
        film_obs: dict[str, list[tuple[date, _ShowtimeObs]]] = defaultdict(list)
        film_titles: dict[str, str] = {}
        film_movie_ids: dict[str, str] = {}

        for record in snapshot.records:
            show_date = parse_show_date(record.date_raw, reference_date=snapshot.snapshot_date)
            if show_date is None:
                continue

            film_key = showtime_film_key(record.title_raw)
            if film_key is None:
                continue

            resolution = resolve_theater(record.theater_name_raw, theater_index)
            if resolution is None:
                continue
            entry = theater_index.theaters_by_id.get(resolution.theater_id)
            if entry is None or entry.get("source") != "amc" or entry.get("enabled") is False:
                continue

            film_titles.setdefault(film_key, record.title_raw.strip())
            movie_id = _amc_movie_id_from_record(record)
            if movie_id and film_key not in film_movie_ids:
                film_movie_ids[film_key] = movie_id

            minutes = parse_time_to_minutes(record.time_raw)
            time_24h = None
            if minutes is not None:
                time_24h = f"{minutes // 60:02d}:{minutes % 60:02d}"

            format_tags = parse_format_tags(record.format_raw)
            if not format_tags and record.attributes:
                format_tags = parse_format_tags(record.attributes.get("premium_format_raw"))

            obs = _ShowtimeObs(
                theater_id=resolution.theater_id,
                theater_name=record.theater_name_raw.strip(),
                time_24h=time_24h,
                minutes=minutes,
                canceled=bool(record.canceled),
                almost_sold_out=bool(record.almost_sold_out),
                format_tags=format_tags,
            )
            film_obs[film_key].append((show_date, obs))

        seen_films_this_snapshot: set[str] = set()
        for film_key in sorted(film_obs):
            observations = film_obs[film_key]
            if film_key not in lifecycle_first:
                lifecycle_first[film_key] = snapshot.snapshot_date
            if film_key not in seen_films_this_snapshot:
                lifecycle_count[film_key] += 1
                seen_films_this_snapshot.add(film_key)

            by_show_date: dict[date, list[_ShowtimeObs]] = defaultdict(list)
            for show_date, obs in observations:
                by_show_date[show_date].append(obs)

            all_show_dates = sorted(by_show_date)
            all_theaters = {
                obs.theater_id or obs.theater_name
                for _d, obs_list in by_show_date.items()
                for obs in obs_list
            }
            total_showtimes = sum(len(obs_list) for obs_list in by_show_date.values())
            film_title = film_titles[film_key]
            event_reason = _event_like_reason(
                film_title,
                total_showtimes=total_showtimes,
                total_theaters=len(all_theaters),
                visible_show_dates=len(all_show_dates),
            )
            film_level = {
                "min_show_date": format_date_iso(min(all_show_dates)),
                "max_show_date": format_date_iso(max(all_show_dates)),
                "visible_show_date_count": str(len(all_show_dates)),
                "total_showtimes": str(total_showtimes),
                "total_theaters": str(len(all_theaters)),
                "event_like": _bool_csv(bool(event_reason)),
                "event_like_reason": event_reason,
            }

            for show_date in all_show_dates:
                obs_list = by_show_date[show_date]
                theaters = sorted(
                    {obs.theater_id or obs.theater_name for obs in obs_list}
                )
                times_24h = [obs.time_24h for obs in obs_list if obs.time_24h]
                canceled = sum(1 for obs in obs_list if obs.canceled)
                almost_sold_out = sum(1 for obs in obs_list if obs.almost_sold_out)
                active = len(obs_list) - canceled

                has_matinee = any(
                    obs.minutes is not None and obs.minutes < MATINEE_END_MIN
                    for obs in obs_list
                )
                has_primetime = any(
                    obs.minutes is not None
                    and MATINEE_END_MIN <= obs.minutes < PRIME_END_MIN
                    for obs in obs_list
                )
                has_late = any(
                    obs.minutes is not None and obs.minutes >= PRIME_END_MIN
                    for obs in obs_list
                )
                has_weekend = show_date.weekday() >= 5

                format_tokens: list[str] = []
                seen_formats: set[str] = set()
                premium_count = 0
                for obs in obs_list:
                    for token in obs.format_tags:
                        if token not in seen_formats:
                            seen_formats.add(token)
                            format_tokens.append(token)
                    if obs.format_tags:
                        premium_count += 1

                rows.append(
                    {
                        "snapshot_date": format_date_iso(snapshot.snapshot_date),
                        "snapshot_timestamp": snapshot.snapshot_timestamp or "",
                        "source": SOURCE,
                        "showtime_film_key": film_key,
                        "film_title": film_title,
                        "amc_movie_id": film_movie_ids.get(film_key, ""),
                        "show_date": format_date_iso(show_date),
                        "days_from_snapshot_to_show_date": str(
                            (show_date - snapshot.snapshot_date).days
                        ),
                        "theater_count": str(len(theaters)),
                        "showtime_count": str(len(obs_list)),
                        "canceled_count": str(canceled),
                        "active_showtime_count": str(active),
                        "almost_sold_out_count": str(almost_sold_out),
                        "first_show_time": _min_time(times_24h),
                        "last_show_time": _max_time(times_24h),
                        "has_matinee": _bool_csv(has_matinee),
                        "has_primetime": _bool_csv(has_primetime),
                        "has_late": _bool_csv(has_late),
                        "has_weekend_show": _bool_csv(has_weekend),
                        "format_list": "|".join(format_tokens),
                        "premium_format_count": str(premium_count),
                        "theater_list": "|".join(theaters),
                        "min_show_date_visible_for_film_at_snapshot": film_level[
                            "min_show_date"
                        ],
                        "max_show_date_visible_for_film_at_snapshot": film_level[
                            "max_show_date"
                        ],
                        "visible_show_date_count_for_film_at_snapshot": film_level[
                            "visible_show_date_count"
                        ],
                        "total_visible_showtimes_for_film_at_snapshot": film_level[
                            "total_showtimes"
                        ],
                        "total_visible_theaters_for_film_at_snapshot": film_level[
                            "total_theaters"
                        ],
                        "first_snapshot_seen_for_film": format_date_iso(
                            lifecycle_first[film_key]
                        ),
                        "snapshots_seen_count_for_film": str(lifecycle_count[film_key]),
                        "event_like_flag": film_level["event_like"],
                        "event_like_reason": film_level["event_like_reason"],
                    }
                )

    rows.sort(
        key=lambda row: (
            row["snapshot_date"],
            row["showtime_film_key"],
            row["show_date"],
        )
    )
    return rows


def write_footprint_csv(output_path: Path, rows: Sequence[Mapping[str, str]]) -> None:
    """Write footprint rows to CSV."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FOOTPRINT_FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def build_footprint_from_snapshots(
    snapshots: Sequence[ParsedSnapshot],
    output_path: Path,
    *,
    registry_path: Path,
) -> dict[str, Any]:
    """Derive footprint rows from parsed snapshots and write CSV; return summary stats."""
    import json

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    theater_index = build_theater_index(registry)
    rows = build_footprint_rows(snapshots, theater_index=theater_index)
    write_footprint_csv(output_path, rows)

    film_keys = {row["showtime_film_key"] for row in rows}
    snapshot_dates = {row["snapshot_date"] for row in rows}
    event_like = sum(1 for row in rows if row["event_like_flag"] == "true")

    return {
        "snapshot_count": len(snapshots),
        "row_count": len(rows),
        "film_count": len(film_keys),
        "snapshot_dates": sorted(snapshot_dates),
        "event_like_rows": event_like,
        "output_path": str(output_path),
    }


def build_footprint_from_logs(
    input_dir: Path,
    output_path: Path,
    *,
    registry_path: Path,
) -> dict[str, Any]:
    """Load logs, derive rows, write CSV; return summary stats."""
    import json

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    theater_index = build_theater_index(registry)
    snapshots = load_amc_snapshots(input_dir)
    rows = build_footprint_rows(snapshots, theater_index=theater_index)
    write_footprint_csv(output_path, rows)

    film_keys = {row["showtime_film_key"] for row in rows}
    snapshot_dates = {row["snapshot_date"] for row in rows}
    event_like = sum(1 for row in rows if row["event_like_flag"] == "true")

    return {
        "snapshot_count": len(snapshots),
        "row_count": len(rows),
        "film_count": len(film_keys),
        "snapshot_dates": sorted(snapshot_dates),
        "event_like_rows": event_like,
        "output_path": str(output_path),
    }
