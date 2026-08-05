"""Emit the lean ``showtimes_current.json`` client artifact."""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from reel_seattle.normalize import (
    DEFAULT_TIMEZONE,
    build_theater_index,
    format_date_iso,
    normalize_bool_string,
    normalize_film_title,
    normalize_optional_string,
    parse_format_tags,
    parse_iso_date,
    parse_runtime_minutes,
    parse_show_date,
    parse_time,
    resolve_theater,
    showtime_film_key,
)
from reel_seattle.source_freshness import (
    build_sources_metadata,
    resolve_history_row_source,
    update_history_evidence,
    empty_history_evidence,
)
from reel_seattle.source_identity import (
    source_film_id_from_history_row,
    source_title_from_history_row,
)
from reel_seattle.analysis.film_identity import (
    build_film_key_identity_map,
    derive_parent_identity,
)
from reel_seattle.film_identity.public_emit import (
    attach_public_film_ids,
    write_identity_emit_report,
)
from reel_seattle.validate import validate_showtimes_current, validate_theaters_registry

CURRENT_SCHEMA_VERSION = "1.0.0"
WINDOW_DAYS = 14
DEFAULT_REGISTRY_PATH = Path("data/theaters.json")
DEFAULT_OUTPUT_PATH = Path("public/data/showtimes_current.json")

_THEATER_SNAPSHOT_FIELDS = (
    "id",
    "name",
    "aliases",
    "source",
    "source_external_id",
    "enabled",
    "type",
    "city",
    "neighborhood",
    "timezone",
)


def make_showtime_id(
    theater_id: str,
    date_iso: str,
    time_24h: str,
    film_key: str,
) -> str:
    """Deterministic showtime id from theater, date, time, and film key."""
    payload = f"{theater_id}|{date_iso}|{time_24h}|{film_key}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _load_registry(registry_path: Path) -> dict[str, Any]:
    with registry_path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _load_history_rows(history_path: Path) -> list[dict[str, str]]:
    with history_path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


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


def _poster_url(value: Any) -> str | None:
    url = normalize_optional_string(value)
    if url is None:
        return None
    if url.startswith("https://") or url.startswith("http://"):
        return url
    return None


def _theater_snapshot(entry: Mapping[str, Any]) -> dict[str, Any]:
    snapshot: dict[str, Any] = {}
    for field in _THEATER_SNAPSHOT_FIELDS:
        if field in entry:
            snapshot[field] = entry[field]
    return snapshot


def _window_bounds(reference_date: date) -> tuple[date, date]:
    return reference_date, reference_date + timedelta(days=WINDOW_DAYS)


def _is_in_window(show_date: date, start_date: date, end_date: date) -> bool:
    return start_date <= show_date <= end_date


def _resolve_history_row_time(row: Mapping[str, Any]):
    """Prefer stored ``time_24h``; fall back to parsing legacy ``Time``."""
    stored = normalize_optional_string(row.get("time_24h"))
    if stored is not None:
        parsed = parse_time(stored)
        if parsed is not None:
            return parsed
    return parse_time(row.get("Time", ""))


def build_showtimes_current(
    history_rows: list[dict[str, Any]],
    *,
    registry: Mapping[str, Any],
    reference_date: date | None = None,
    generated_at: datetime | None = None,
    emit_report_out: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the showtimes_current artifact from history CSV rows.

    When ``emit_report_out`` is provided, it is filled with the T-FILMID-02
    identity-emission coverage report (not part of the public artifact).
    """
    ref = reference_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    start_date, end_date = _window_bounds(ref)
    theater_index = build_theater_index(registry)

    if generated_at is None:
        generated_at = datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    elif generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))

    showtimes: list[dict[str, Any]] = []
    films_by_key: dict[str, dict[str, Any]] = {}
    theater_ids_in_showtimes: set[str] = set()
    sources_included: set[str] = set()
    history_evidence = empty_history_evidence()

    for row in history_rows:
        source = resolve_history_row_source(row, theater_index)
        if source is not None:
            update_history_evidence(
                history_evidence[source],
                row,
                reference_date=ref,
            )

        if normalize_bool_string(row.get("isCanceled"), default=False):
            continue

        show_date = parse_show_date(row.get("Date", ""), reference_date=ref)
        if show_date is None or not _is_in_window(show_date, start_date, end_date):
            continue

        parsed_time = _resolve_history_row_time(row)
        if parsed_time is None:
            continue

        film_title = normalize_film_title(row.get("Film", ""))
        if film_title is None:
            continue

        preset_theater_id = str(row.get("theater_id", "")).strip()
        if preset_theater_id and preset_theater_id in theater_index.theaters_by_id:
            resolved_theater_id = preset_theater_id
        else:
            theater_resolution = resolve_theater(row.get("Theater", ""), theater_index)
            if theater_resolution is None:
                continue
            resolved_theater_id = theater_resolution.theater_id

        film_key = str(row.get("showtime_film_key", "")).strip()
        if not film_key:
            film_key = showtime_film_key(film_title)
        if film_key is None:
            continue

        theater_entry = theater_index.theaters_by_id[resolved_theater_id]
        source = str(theater_entry.get("source", row.get("source", ""))).strip() or "unknown"

        runtime_min = parse_runtime_minutes(row.get("Runtime"))
        poster_url = _poster_url(row.get("posterDynamic"))
        format_tags = list(parse_format_tags(row.get("premiumFormat")))

        if normalize_bool_string(row.get("isAlmostSoldOut"), default=False):
            status = "sold_out"
        else:
            status = "active"

        date_iso = format_date_iso(show_date)
        showtime_id = make_showtime_id(
            resolved_theater_id,
            date_iso,
            parsed_time.time_24h,
            film_key,
        )

        showtimes.append(
            {
                "id": showtime_id,
                "date": date_iso,
                "time": parsed_time.time_24h,
                "time_display": parsed_time.time_display,
                "theater_id": resolved_theater_id,
                "showtime_film_key": film_key,
                "film_title": film_title,
                "runtime_min": runtime_min,
                "poster_url": poster_url,
                "status": status,
                "format_tags": format_tags,
                "ticket_url": None,
                "source": source,
                "source_film_id": source_film_id_from_history_row(row),
                "source_title": source_title_from_history_row(row),
                "source_showtime_id": None,
                "attributes": {},
                "first_seen_at": _metadata_date(row.get("first_seen_date")),
                "last_seen_at": _metadata_date(row.get("last_updated")),
            }
        )

        theater_ids_in_showtimes.add(resolved_theater_id)
        sources_included.add(source)

        if film_key not in films_by_key:
            films_by_key[film_key] = {
                "showtime_film_key": film_key,
                "title": film_title,
                "runtime_min": runtime_min,
                "poster_url": poster_url,
            }
        else:
            existing = films_by_key[film_key]
            if existing["runtime_min"] is None and runtime_min is not None:
                existing["runtime_min"] = runtime_min
            if existing["poster_url"] is None and poster_url is not None:
                existing["poster_url"] = poster_url

    showtimes.sort(
        key=lambda item: (
            item["date"],
            item["time"],
            item["theater_id"],
            item["showtime_film_key"],
        )
    )

    # Build parent identity map for all film keys
    identity_rows = []
    for showtime in showtimes:
        film_key = showtime["showtime_film_key"]
        source_film_id = showtime.get("source_film_id", "")
        film_title = showtime.get("film_title", "")
        if film_key and film_title:
            identity_rows.append({
                "showtime_film_key": film_key,
                "film_title": film_title,
                "amc_movie_id": source_film_id or "",
            })
    
    identity_map = build_film_key_identity_map(identity_rows)
    
    # Add parent identity fields to showtimes
    for showtime in showtimes:
        film_key = showtime["showtime_film_key"]
        identity = identity_map.get(film_key)
        if identity:
            showtime["parent_film_key"] = identity.parent_film_key
            showtime["parent_display_title"] = identity.parent_display_title
            showtime["screening_variant_type"] = identity.screening_variant_type
            showtime["is_special_screening"] = identity.is_special_screening
        else:
            showtime["parent_film_key"] = film_key
            showtime["parent_display_title"] = showtime["film_title"]
            showtime["screening_variant_type"] = "none"
            showtime["is_special_screening"] = False
    
    # Add parent identity fields to films
    for film_key, film_record in films_by_key.items():
        identity = identity_map.get(film_key)
        if identity:
            film_record["parent_film_key"] = identity.parent_film_key
            film_record["parent_display_title"] = identity.parent_display_title
            film_record["screening_variant_type"] = identity.screening_variant_type
            film_record["is_special_screening"] = identity.is_special_screening
            film_record["source_film_id"] = identity.source_film_id or None
        else:
            film_record["parent_film_key"] = film_key
            film_record["parent_display_title"] = film_record["title"]
            film_record["screening_variant_type"] = "none"
            film_record["is_special_screening"] = False
            film_record["source_film_id"] = None

    theaters: list[dict[str, Any]] = []
    for entry in registry.get("theaters", []):
        if not isinstance(entry, dict):
            continue
        theater_id = entry.get("id")
        if not theater_id:
            continue
        enabled = bool(entry.get("enabled", False))
        if enabled or theater_id in theater_ids_in_showtimes:
            theaters.append(_theater_snapshot(entry))

    theaters.sort(key=lambda item: item["id"])
    films = [films_by_key[key] for key in sorted(films_by_key)]
    # T-FILMID-02: nullable canonical film_id from durable identity catalog.
    identity_emit_report = attach_public_film_ids(films, showtimes)
    if emit_report_out is not None:
        emit_report_out.clear()
        emit_report_out.update(identity_emit_report)
    sources = build_sources_metadata(showtimes, history_evidence)

    return {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "timezone": DEFAULT_TIMEZONE,
        "window": {
            "start_date": format_date_iso(start_date),
            "end_date": format_date_iso(end_date),
        },
        "sources_included": sorted(sources_included),
        "sources": sources,
        "stats": {
            "showtime_count": len(showtimes),
            "film_count": len(films),
            "theater_count": len(theater_ids_in_showtimes),
        },
        "theaters": theaters,
        "films": films,
        "showtimes": showtimes,
    }


def write_showtimes_current(
    history_rows: list[dict[str, Any]] | None = None,
    *,
    history_path: Path | None = None,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    registry_path: Path = DEFAULT_REGISTRY_PATH,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Build and write ``showtimes_current.json``."""
    if history_rows is None:
        path = history_path or Path("data/history/showtimes_history.csv")
        history_rows = _load_history_rows(path)

    registry = _load_registry(registry_path)
    validate_theaters_registry(registry)

    emit_report: dict[str, Any] = {}
    artifact = build_showtimes_current(
        history_rows,
        registry=registry,
        reference_date=reference_date,
        emit_report_out=emit_report,
    )
    validate_showtimes_current(artifact)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    if emit_report:
        write_identity_emit_report(emit_report)

    return artifact
