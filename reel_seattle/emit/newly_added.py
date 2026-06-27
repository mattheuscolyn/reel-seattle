"""Emit the lean ``newly_added_current.json`` client artifact."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from reel_seattle.normalize import (
    DEFAULT_TIMEZONE,
    build_theater_index,
    format_date_iso,
    normalize_film_title,
    normalize_optional_string,
    parse_iso_date,
    parse_show_date,
    resolve_theater,
    showtime_film_key,
)
from reel_seattle.validate import validate_newly_added_current

NEWLY_ADDED_SCHEMA_VERSION = "1.0.0"
NEWLY_ADDED_DAYS_BACK = 7
DEFAULT_OUTPUT_PATH = Path("public/data/newly_added_current.json")
DEFAULT_REGISTRY_PATH = Path("data/theaters.json")


def _metadata_date(value: Any) -> str | None:
    cleaned = normalize_optional_string(value)
    if cleaned is None:
        return None
    parsed = parse_iso_date(cleaned)
    if parsed is not None:
        return format_date_iso(parsed)
    parsed = parse_show_date(cleaned)
    if parsed is not None:
        return format_date_iso(parsed)
    return None


def _current_window_pairs(
    current_artifact: Mapping[str, Any],
) -> set[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    for showtime in current_artifact.get("showtimes", []):
        if not isinstance(showtime, dict):
            continue
        film_key = str(showtime.get("showtime_film_key", "")).strip()
        theater_id = str(showtime.get("theater_id", "")).strip()
        if film_key and theater_id:
            pairs.add((film_key, theater_id))
    return pairs


def _reference_date_from_artifact(
    current_artifact: Mapping[str, Any],
    *,
    reference_date: date | None,
) -> date:
    if reference_date is not None:
        return reference_date
    window = current_artifact.get("window", {})
    if isinstance(window, dict):
        start = _metadata_date(window.get("start_date"))
        if start is not None:
            return date.fromisoformat(start)
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()


def _generated_at_from_artifact(
    current_artifact: Mapping[str, Any],
    *,
    generated_at: datetime | None,
) -> datetime:
    if generated_at is not None:
        if generated_at.tzinfo is None:
            return generated_at.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
        return generated_at
    raw = current_artifact.get("generated_at")
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = datetime.fromisoformat(raw.strip())
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
            return parsed
        except ValueError:
            pass
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE))


def filter_recent_announcements(
    announcements_rows: list[dict[str, Any]],
    *,
    days_back: int = NEWLY_ADDED_DAYS_BACK,
    reference_date: date | None = None,
) -> list[dict[str, Any]]:
    """Return announcement rows with ``first_announced_date`` within *days_back*."""
    ref = reference_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    cutoff = (ref - timedelta(days=days_back)).isoformat()
    recent: list[dict[str, Any]] = []
    for row in announcements_rows:
        announced = _metadata_date(row.get("first_announced_date"))
        if announced is not None and announced >= cutoff:
            recent.append(row)
    return recent


def build_newly_added_current(
    announcements_rows: list[dict[str, Any]],
    current_artifact: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    days_back: int = NEWLY_ADDED_DAYS_BACK,
    reference_date: date | None = None,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Build newly_added_current from announcement rows and current showtimes."""
    ref = _reference_date_from_artifact(current_artifact, reference_date=reference_date)
    emitted_at = _generated_at_from_artifact(current_artifact, generated_at=generated_at)
    theater_index = build_theater_index(registry)
    window_pairs = _current_window_pairs(current_artifact)

    recent = filter_recent_announcements(
        announcements_rows,
        days_back=days_back,
        reference_date=ref,
    )

    by_pair: dict[tuple[str, str], dict[str, Any]] = {}

    for row in recent:
        theater_resolution = resolve_theater(row.get("Theater", ""), theater_index)
        if theater_resolution is None:
            continue

        theater_id = theater_resolution.theater_id
        theater_entry = theater_index.theaters_by_id.get(theater_id, {})
        theater_name = str(theater_entry.get("name", theater_resolution.name)).strip()
        if not theater_name:
            theater_name = theater_resolution.name

        film_title = normalize_film_title(row.get("Film", ""))
        if film_title is None:
            continue

        film_key = showtime_film_key(row.get("Film", ""))
        if film_key is None:
            continue

        if (film_key, theater_id) not in window_pairs:
            continue

        first_announced = _metadata_date(row.get("first_announced_date"))
        last_seen = _metadata_date(row.get("last_seen_date"))
        if first_announced is None or last_seen is None:
            continue

        entry = {
            "showtime_film_key": film_key,
            "film_title": film_title,
            "theater_id": theater_id,
            "theater_name": theater_name,
            "first_announced_date": first_announced,
            "last_seen_date": last_seen,
        }

        pair = (film_key, theater_id)
        existing = by_pair.get(pair)
        if existing is None:
            by_pair[pair] = entry
            continue

        if entry["first_announced_date"] < existing["first_announced_date"]:
            by_pair[pair] = entry
        elif entry["first_announced_date"] == existing["first_announced_date"]:
            if entry["last_seen_date"] > existing["last_seen_date"]:
                by_pair[pair] = entry

    entries = list(by_pair.values())
    entries.sort(key=lambda item: (item["film_title"].casefold(), item["theater_name"].casefold()))
    entries.sort(key=lambda item: item["first_announced_date"], reverse=True)

    return {
        "schema_version": NEWLY_ADDED_SCHEMA_VERSION,
        "generated_at": emitted_at.isoformat(timespec="seconds"),
        "days_back": days_back,
        "entries": entries,
    }


def write_newly_added_current(
    announcements_rows: list[dict[str, Any]],
    current_artifact: Mapping[str, Any],
    *,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    registry_path: Path = DEFAULT_REGISTRY_PATH,
    days_back: int = NEWLY_ADDED_DAYS_BACK,
    reference_date: date | None = None,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Build and write ``newly_added_current.json``."""
    with registry_path.open(encoding="utf-8") as handle:
        registry = json.load(handle)

    artifact = build_newly_added_current(
        announcements_rows,
        current_artifact,
        registry=registry,
        days_back=days_back,
        reference_date=reference_date,
        generated_at=generated_at,
    )
    validate_newly_added_current(artifact)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    return artifact
