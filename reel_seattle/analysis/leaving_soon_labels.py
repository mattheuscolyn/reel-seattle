"""Build Wednesday-extension Leaving Soon labels from AMC footprint snapshots.

Each label row compares a film's booking horizon at an anchor snapshot (Tuesday
or Wednesday) against the first post-update snapshot after the weekly Wednesday
AMC schedule drop. Features come from the anchor snapshot only; post-update
fields are outcomes used for labeling, not as predictors.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

LABEL_STATUS_LABELED = "labeled"
LABEL_STATUS_MISSING_POST_UPDATE = "missing_post_update_snapshot"
LABEL_STATUS_EVENT_EXCLUDED = "event_like_excluded"
LABEL_STATUS_INSUFFICIENT_SHOWTIMES = "insufficient_current_showtimes"
LABEL_STATUS_NOT_ANCHOR_DAY = "not_anchor_day"

DEFAULT_ANCHOR_WEEKDAYS = (1, 2)  # Tuesday, Wednesday (Monday=0)
DEFAULT_POST_UPDATE_WEEKDAYS = (3, 4)  # Thursday, Friday
DEFAULT_MAX_POST_UPDATE_GAP_DAYS = 4
DEFAULT_MIN_ACTIVE_SHOWTIMES = 1

LABEL_FIELDNAMES = [
    "anchor_date",
    "showtime_film_key",
    "film_title",
    "anchor_max_show_date",
    "post_update_snapshot_date",
    "post_update_max_show_date",
    "extended_after_update",
    "leaving_soon_label",
    "label_status",
    "days_until_anchor_max_show_date",
    "anchor_weekday",
    "days_to_weekend",
    "booking_horizon_days",
    "total_visible_showtimes_for_film_at_snapshot",
    "total_visible_theaters_for_film_at_snapshot",
    "visible_show_date_count_for_film_at_snapshot",
    "min_show_date_visible_for_film_at_snapshot",
    "max_show_date_visible_for_film_at_snapshot",
    "has_weekend_show",
    "has_primetime",
    "event_like_flag",
    "event_like_reason",
    "anchor_relevant_wednesday",
    "post_update_gap_days",
]


@dataclass(frozen=True)
class LabelBuildConfig:
    anchor_weekdays: frozenset[int] = frozenset(DEFAULT_ANCHOR_WEEKDAYS)
    post_update_weekdays: frozenset[int] = frozenset(DEFAULT_POST_UPDATE_WEEKDAYS)
    max_post_update_gap_days: int = DEFAULT_MAX_POST_UPDATE_GAP_DAYS
    min_active_showtimes: int = DEFAULT_MIN_ACTIVE_SHOWTIMES
    exclude_event_like: bool = True


@dataclass
class FilmAnchorFeatures:
    """Film-level footprint summary at one snapshot date."""

    snapshot_date: date
    showtime_film_key: str
    film_title: str
    min_show_date: date
    max_show_date: date
    visible_show_date_count: int
    total_visible_showtimes: int
    total_visible_theaters: int
    active_showtime_count: int
    has_weekend_show: bool
    has_primetime: bool
    event_like_flag: bool
    event_like_reason: str


def _parse_date(text: str) -> date:
    return date.fromisoformat(text.strip())


def _parse_int(text: str, default: int = 0) -> int:
    text = str(text).strip()
    if not text:
        return default
    return int(text)


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def load_footprint_rows(path: Path | str) -> list[dict[str, str]]:
    """Load footprint CSV rows."""
    with Path(path).open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def build_film_anchor_index(
    rows: Sequence[Mapping[str, str]],
) -> tuple[dict[date, dict[str, FilmAnchorFeatures]], list[date]]:
    """Index footprint rows by snapshot date and film key."""
    by_snapshot: dict[date, dict[str, FilmAnchorFeatures]] = {}
    for row in rows:
        snapshot_date = _parse_date(row["snapshot_date"])
        film_key = row["showtime_film_key"].strip()
        if not film_key:
            continue

        show_date = _parse_date(row["show_date"])
        active = _parse_int(row.get("active_showtime_count", "0"))
        per_snapshot = by_snapshot.setdefault(snapshot_date, {})
        existing = per_snapshot.get(film_key)
        if existing is None:
            per_snapshot[film_key] = FilmAnchorFeatures(
                snapshot_date=snapshot_date,
                showtime_film_key=film_key,
                film_title=row.get("film_title", "").strip(),
                min_show_date=show_date,
                max_show_date=show_date,
                visible_show_date_count=_parse_int(
                    row.get("visible_show_date_count_for_film_at_snapshot", "1")
                ),
                total_visible_showtimes=_parse_int(
                    row.get("total_visible_showtimes_for_film_at_snapshot", "0")
                ),
                total_visible_theaters=_parse_int(
                    row.get("total_visible_theaters_for_film_at_snapshot", "0")
                ),
                active_showtime_count=active,
                has_weekend_show=_parse_bool(row.get("has_weekend_show", "false")),
                has_primetime=_parse_bool(row.get("has_primetime", "false")),
                event_like_flag=_parse_bool(row.get("event_like_flag", "false")),
                event_like_reason=row.get("event_like_reason", "").strip(),
            )
            continue

        existing.min_show_date = min(existing.min_show_date, show_date)
        existing.max_show_date = max(existing.max_show_date, show_date)
        existing.active_showtime_count += active
        existing.has_weekend_show = existing.has_weekend_show or _parse_bool(
            row.get("has_weekend_show", "false")
        )
        existing.has_primetime = existing.has_primetime or _parse_bool(
            row.get("has_primetime", "false")
        )

    snapshot_dates = sorted(by_snapshot)
    return by_snapshot, snapshot_dates


def relevant_wednesday(anchor: date) -> date:
    """Return the Wednesday booking update associated with *anchor*."""
    weekday = anchor.weekday()
    if weekday <= 2:
        return anchor + timedelta(days=(2 - weekday))
    days_ahead = (2 - weekday) % 7
    if days_ahead == 0:
        days_ahead = 7
    return anchor + timedelta(days=days_ahead)


def find_post_update_snapshot(
    anchor: date,
    snapshot_dates: Sequence[date],
    *,
    post_update_weekdays: frozenset[int] = DEFAULT_POST_UPDATE_WEEKDAYS,
    max_post_update_gap_days: int = DEFAULT_MAX_POST_UPDATE_GAP_DAYS,
) -> date | None:
    """Pick the first post-Wednesday snapshot after *anchor*, preferring Thu/Fri."""
    wednesday = relevant_wednesday(anchor)
    earliest = wednesday + timedelta(days=1)
    latest = wednesday + timedelta(days=max_post_update_gap_days)
    candidates = [day for day in snapshot_dates if earliest <= day <= latest]
    if not candidates:
        return None
    for day in candidates:
        if day.weekday() in post_update_weekdays:
            return day
    return candidates[0]


def _days_to_weekend(anchor: date) -> int:
    """Days from anchor until the next Saturday (0 if anchor is Saturday)."""
    return (5 - anchor.weekday()) % 7


def _film_max_show_date(
    by_snapshot: Mapping[date, Mapping[str, FilmAnchorFeatures]],
    snapshot_date: date,
    film_key: str,
) -> date | None:
    film = by_snapshot.get(snapshot_date, {}).get(film_key)
    if film is None:
        return None
    return film.max_show_date


def build_label_rows(
    rows: Sequence[Mapping[str, str]],
    *,
    config: LabelBuildConfig | None = None,
) -> list[dict[str, str]]:
    """Build Leaving Soon label rows from footprint CSV rows."""
    cfg = config or LabelBuildConfig()
    by_snapshot, snapshot_dates = build_film_anchor_index(rows)
    label_rows: list[dict[str, str]] = []

    for anchor_date in snapshot_dates:
        if anchor_date.weekday() not in cfg.anchor_weekdays:
            continue
        films = by_snapshot[anchor_date]
        post_update_date = find_post_update_snapshot(
            anchor_date,
            snapshot_dates,
            post_update_weekdays=cfg.post_update_weekdays,
            max_post_update_gap_days=cfg.max_post_update_gap_days,
        )
        wednesday = relevant_wednesday(anchor_date)

        for film_key in sorted(films):
            anchor = films[film_key]
            base = {
                "anchor_date": anchor_date.isoformat(),
                "showtime_film_key": film_key,
                "film_title": anchor.film_title,
                "anchor_max_show_date": anchor.max_show_date.isoformat(),
                "post_update_snapshot_date": "",
                "post_update_max_show_date": "",
                "extended_after_update": "",
                "leaving_soon_label": "",
                "anchor_relevant_wednesday": wednesday.isoformat(),
                "post_update_gap_days": "",
                "days_until_anchor_max_show_date": str(
                    (anchor.max_show_date - anchor_date).days
                ),
                "anchor_weekday": str(anchor_date.weekday()),
                "days_to_weekend": str(_days_to_weekend(anchor_date)),
                "booking_horizon_days": str(
                    (anchor.max_show_date - anchor.min_show_date).days + 1
                ),
                "total_visible_showtimes_for_film_at_snapshot": str(
                    anchor.total_visible_showtimes
                ),
                "total_visible_theaters_for_film_at_snapshot": str(
                    anchor.total_visible_theaters
                ),
                "visible_show_date_count_for_film_at_snapshot": str(
                    anchor.visible_show_date_count
                ),
                "min_show_date_visible_for_film_at_snapshot": anchor.min_show_date.isoformat(),
                "max_show_date_visible_for_film_at_snapshot": anchor.max_show_date.isoformat(),
                "has_weekend_show": "true" if anchor.has_weekend_show else "false",
                "has_primetime": "true" if anchor.has_primetime else "false",
                "event_like_flag": "true" if anchor.event_like_flag else "false",
                "event_like_reason": anchor.event_like_reason,
            }

            if anchor.max_show_date < anchor_date:
                base["label_status"] = LABEL_STATUS_INSUFFICIENT_SHOWTIMES
                label_rows.append(base)
                continue
            if anchor.active_showtime_count < cfg.min_active_showtimes:
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

            post_max = _film_max_show_date(by_snapshot, post_update_date, film_key)
            base["post_update_snapshot_date"] = post_update_date.isoformat()
            base["post_update_gap_days"] = str((post_update_date - wednesday).days)
            if post_max is None:
                post_max_text = ""
                extended = False
            else:
                post_max_text = post_max.isoformat()
                extended = post_max > anchor.max_show_date

            base["post_update_max_show_date"] = post_max_text
            base["extended_after_update"] = "true" if extended else "false"
            base["leaving_soon_label"] = "false" if extended else "true"
            base["label_status"] = LABEL_STATUS_LABELED
            label_rows.append(base)

    label_rows.sort(
        key=lambda row: (row["anchor_date"], row["showtime_film_key"]),
    )
    return label_rows


def summarize_labels(
    footprint_row_count: int,
    label_rows: Sequence[Mapping[str, str]],
) -> dict[str, Any]:
    """Summarize label generation for CLI reporting."""
    labeled = [row for row in label_rows if row["label_status"] == LABEL_STATUS_LABELED]
    positives = [row for row in labeled if row["leaving_soon_label"] == "true"]
    negatives = [row for row in labeled if row["leaving_soon_label"] == "false"]
    anchor_dates = sorted({row["anchor_date"] for row in label_rows})
    films = sorted({row["showtime_film_key"] for row in label_rows})
    status_counts: dict[str, int] = {}
    for row in label_rows:
        status = row["label_status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    label_rate = len(positives) / len(labeled) if labeled else 0.0
    examples_positive = positives[:3]
    examples_negative = negatives[:3]

    return {
        "footprint_row_count": footprint_row_count,
        "candidate_anchor_rows": len(label_rows),
        "labeled_rows": len(labeled),
        "leaving_soon_positives": len(positives),
        "not_leaving_soon_negatives": len(negatives),
        "label_rate_leaving_soon": round(label_rate, 4),
        "status_counts": status_counts,
        "event_like_excluded": status_counts.get(LABEL_STATUS_EVENT_EXCLUDED, 0),
        "missing_post_update": status_counts.get(LABEL_STATUS_MISSING_POST_UPDATE, 0),
        "insufficient_current_showtimes": status_counts.get(
            LABEL_STATUS_INSUFFICIENT_SHOWTIMES, 0
        ),
        "anchor_date_range": {
            "earliest": anchor_dates[0] if anchor_dates else "",
            "latest": anchor_dates[-1] if anchor_dates else "",
        },
        "distinct_films": len(films),
        "examples_leaving_soon": [
            {
                "anchor_date": row["anchor_date"],
                "film": row["film_title"],
                "anchor_max_show_date": row["anchor_max_show_date"],
                "post_update_max_show_date": row["post_update_max_show_date"],
            }
            for row in examples_positive
        ],
        "examples_not_leaving_soon": [
            {
                "anchor_date": row["anchor_date"],
                "film": row["film_title"],
                "anchor_max_show_date": row["anchor_max_show_date"],
                "post_update_max_show_date": row["post_update_max_show_date"],
            }
            for row in examples_negative
        ],
    }


def write_labels_csv(output_path: Path, rows: Sequence[Mapping[str, str]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=LABEL_FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def write_summary_json(output_path: Path, summary: Mapping[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def build_labels_from_footprint_csv(
    input_path: Path,
    output_path: Path,
    *,
    summary_output: Path | None = None,
    config: LabelBuildConfig | None = None,
) -> dict[str, Any]:
    """Load footprint CSV, build labels, write outputs, return summary."""
    footprint_rows = load_footprint_rows(input_path)
    label_rows = build_label_rows(footprint_rows, config=config)
    write_labels_csv(output_path, label_rows)
    summary = summarize_labels(len(footprint_rows), label_rows)
    summary["input_path"] = str(input_path)
    summary["output_path"] = str(output_path)
    if summary_output is not None:
        write_summary_json(summary_output, summary)
        summary["summary_output_path"] = str(summary_output)
    return summary
