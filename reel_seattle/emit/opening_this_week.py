"""Emit the review-only ``opening_this_week_current.json`` artifact.

Membership is citywide Seattle openings for the current Monday–Sunday week in
``America/Los_Angeles``, using historical earliest scheduled show ``Date``
(not announcement / first_seen / TMDB release dates).

V1 does not implement return engagements. Low-confidence bootstrap candidates
are kept out of ``entries`` and listed under ``low_confidence_candidates``.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.analysis.amc_footprint import EVENT_TITLE_PATTERNS
from reel_seattle.analysis.film_identity import (
    build_film_key_identity_map,
    derive_parent_identity,
)
from reel_seattle.analysis.special_screening_flags import classify_special_screening_flags
from reel_seattle.film_identity.public_emit import (
    build_confirmed_tmdb_index,
    load_identity_catalog,
    resolve_public_film_id,
)
from reel_seattle.normalize import (
    DEFAULT_TIMEZONE,
    build_theater_index,
    format_date_iso,
    normalize_bool_string,
    normalize_film_title,
    parse_show_date,
    resolve_theater,
    showtime_film_key,
)
from reel_seattle.source_identity import source_film_id_from_history_row
from reel_seattle.validate import validate_opening_this_week_current

OPENING_THIS_WEEK_SCHEMA_VERSION = "1.1.0"
METHOD_NAME = "citywide_earliest_scheduled_date"
METHOD_VERSION = "1.1.0"
METHOD_DESCRIPTION = (
    "Citywide opening_date is the earliest non-canceled scheduled Date across "
    "enabled Seattle theaters after collapsing variants to parent film identity. "
    "A film is a member when week_start <= opening_date <= week_end (Pacific "
    "Monday–Sunday). Current showtimes join visibility metadata only. "
    "opening_type is soft QA classification (theatrical/repertory/event/limited) "
    "and does not affect membership."
)

BOOTSTRAP_DAYS = 14
DEFAULT_OUTPUT_PATH = Path("public/data/opening_this_week_current.json")
DEFAULT_HISTORY_PATH = Path("data/history/showtimes_history.csv")
DEFAULT_REGISTRY_PATH = Path("data/theaters.json")
DEFAULT_OVERRIDES_PATH = Path("data/opening_overrides.json")
DEFAULT_SHOWTIMES_CURRENT_PATH = Path("public/data/showtimes_current.json")

CONFIDENCE_HIGH = "high"
CONFIDENCE_LOW = "low"

OPENING_TYPE_THEATRICAL = "theatrical"
OPENING_TYPE_REPERTORY = "repertory"
OPENING_TYPE_LIMITED = "limited"
OPENING_TYPE_EVENT = "event"
OPENING_TYPE_UNKNOWN = "unknown"

_REPERTORY_LEAN_SOURCES = frozenset({"beacon", "nwff", "central_cinema"})
_EVENT_TITLE_HINT = re.compile(
    r"(?:\+|presents:|q\s*&\s*a|early access|live from|tour\b|screen unseen|"
    r"scream unseen|mystery|double feature)",
    re.IGNORECASE,
)


def pacific_today(now: datetime | None = None) -> date:
    """Return today's calendar date in America/Los_Angeles."""
    if now is None:
        return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    if now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    return now.astimezone(ZoneInfo(DEFAULT_TIMEZONE)).date()


def week_bounds(anchor: date) -> tuple[date, date]:
    """Inclusive Monday–Sunday week containing *anchor*."""
    start = anchor - timedelta(days=anchor.weekday())
    return start, start + timedelta(days=6)


def enabled_theater_ids(registry: Mapping[str, Any]) -> set[str]:
    """Return theater ids with ``enabled`` not explicitly false."""
    ids: set[str] = set()
    for entry in registry.get("theaters", []):
        if not isinstance(entry, dict):
            continue
        if entry.get("enabled") is False:
            continue
        theater_id = str(entry.get("id", "")).strip()
        if theater_id:
            ids.add(theater_id)
    return ids


def classify_opening_type(
    title: str,
    *,
    distinct_scheduled_dates: int,
    sources: Sequence[str] | None = None,
    titles: Sequence[str] | None = None,
) -> str:
    """Soft QA classification; does not affect membership.

    V1.1 adds ``repertory`` for multi-day indie/anniversary engagements so UI
    can segment without changing opening-date membership.
    """
    title_set = [title, *(titles or [])]
    source_set = {str(s).strip() for s in (sources or []) if str(s).strip()}

    for candidate in title_set:
        flags = classify_special_screening_flags(candidate)
        if (
            EVENT_TITLE_PATTERNS.search(candidate)
            or _EVENT_TITLE_HINT.search(candidate)
            or flags.get("fan_event_like")
            or flags.get("live_or_concert_like")
            or flags.get("special_event_like")
            or flags.get("opening_night_like")
        ):
            return OPENING_TYPE_EVENT

    anniversary = any(
        classify_special_screening_flags(candidate).get("anniversary_like")
        for candidate in title_set
    )
    repertory_lean = bool(source_set & _REPERTORY_LEAN_SOURCES) and "amc" not in source_set

    if anniversary and distinct_scheduled_dates >= 1:
        return OPENING_TYPE_REPERTORY
    if distinct_scheduled_dates >= 2 and repertory_lean:
        return OPENING_TYPE_REPERTORY
    if distinct_scheduled_dates == 1:
        return OPENING_TYPE_LIMITED
    if distinct_scheduled_dates > 1:
        return OPENING_TYPE_THEATRICAL
    return OPENING_TYPE_UNKNOWN


@dataclass
class OpeningOverride:
    id: str
    action: str
    reason: str
    film_id: str | None = None
    parent_film_key: str | None = None
    showtime_film_key: str | None = None
    forced_opening_date: date | None = None


def load_opening_overrides(path: Path | None = None) -> list[OpeningOverride]:
    """Load curated overrides; empty/missing file → no overrides."""
    target = path or DEFAULT_OVERRIDES_PATH
    if not target.is_file():
        return []
    with target.open(encoding="utf-8") as handle:
        document = json.load(handle)
    if not isinstance(document, dict):
        raise ValueError(f"opening overrides must be an object: {target}")
    raw_list = document.get("overrides", [])
    if not isinstance(raw_list, list):
        raise ValueError(f"opening overrides.overrides must be an array: {target}")

    overrides: list[OpeningOverride] = []
    seen_ids: set[str] = set()
    for raw in raw_list:
        if not isinstance(raw, dict):
            raise ValueError("each opening override must be an object")
        override_id = str(raw.get("id", "")).strip()
        action = str(raw.get("action", "")).strip()
        reason = str(raw.get("reason", "")).strip()
        if not override_id or not reason:
            raise ValueError("opening override requires id and reason")
        if action not in {"include", "exclude"}:
            raise ValueError(f"opening override action must be include|exclude: {override_id}")
        if override_id in seen_ids:
            raise ValueError(f"duplicate opening override id: {override_id}")
        seen_ids.add(override_id)

        forced: date | None = None
        raw_forced = raw.get("opening_date")
        if raw_forced not in (None, ""):
            try:
                forced = date.fromisoformat(str(raw_forced).strip())
            except ValueError as exc:
                raise ValueError(
                    f"invalid opening_date on override {override_id}: {raw_forced!r}"
                ) from exc

        film_id = str(raw.get("film_id") or "").strip() or None
        parent_key = str(raw.get("parent_film_key") or "").strip() or None
        film_key = str(raw.get("showtime_film_key") or "").strip() or None
        if not film_id and not parent_key and not film_key:
            raise ValueError(
                f"override {override_id} needs film_id, parent_film_key, or showtime_film_key"
            )

        overrides.append(
            OpeningOverride(
                id=override_id,
                action=action,
                reason=reason,
                film_id=film_id,
                parent_film_key=parent_key,
                showtime_film_key=film_key,
                forced_opening_date=forced,
            )
        )
    return overrides


@dataclass
class _FilmAgg:
    """Accumulate citywide history for one collapsed film identity."""

    identity_key: str
    identity_method: str
    parent_film_key: str
    film_title: str
    showtime_film_keys: set[str] = field(default_factory=set)
    film_ids: set[str] = field(default_factory=set)
    titles: set[str] = field(default_factory=set)
    dates_by_theater: dict[str, set[date]] = field(default_factory=dict)
    all_dates: set[date] = field(default_factory=set)
    theater_ids: set[str] = field(default_factory=set)
    sources: set[str] = field(default_factory=set)
    screening_count: int = 0

    def add_observation(
        self,
        *,
        show_date: date,
        theater_id: str,
        showtime_film_key_value: str,
        film_title: str,
        variant_title: str | None = None,
        film_id: str | None,
        source: str,
    ) -> None:
        self.showtime_film_keys.add(showtime_film_key_value)
        self.all_dates.add(show_date)
        self.theater_ids.add(theater_id)
        self.screening_count += 1
        for candidate in (film_title, variant_title):
            if candidate:
                self.titles.add(candidate)
        if source:
            self.sources.add(source)
        self.dates_by_theater.setdefault(theater_id, set()).add(show_date)
        if film_id:
            self.film_ids.add(film_id)
        # Prefer shorter / parent-like titles when equal casefold; otherwise first seen.
        if not self.film_title:
            self.film_title = film_title
        elif len(film_title) < len(self.film_title):
            self.film_title = film_title

    @property
    def opening_date(self) -> date | None:
        return min(self.all_dates) if self.all_dates else None

    def theaters_on_date(self, show_date: date) -> list[str]:
        theaters = [
            theater_id
            for theater_id, dates in self.dates_by_theater.items()
            if show_date in dates
        ]
        return sorted(theaters)

    def representative_showtime_film_key(self) -> str:
        if self.parent_film_key in self.showtime_film_keys:
            return self.parent_film_key
        return sorted(self.showtime_film_keys)[0]


def _resolve_row_theater_id(
    row: Mapping[str, Any],
    theater_index: Any,
    enabled_ids: set[str],
) -> str | None:
    preset = str(row.get("theater_id", "")).strip()
    if preset and preset in theater_index.theaters_by_id:
        return preset if preset in enabled_ids else None
    resolution = resolve_theater(row.get("Theater", ""), theater_index)
    if resolution is None:
        return None
    if resolution.theater_id not in enabled_ids:
        return None
    return resolution.theater_id


def _identity_bundle_for_key(
    film_key: str,
    title: str,
    source_film_id: str,
    identity_map: Mapping[str, Any],
) -> tuple[str, str, str]:
    """Return (parent_film_key, identity_method, display_title).

    Collapse always uses existing parent-film identity. ``film_id`` is attached
    later when the durable catalog join is unambiguous — it does not invent a
    second grouping system.
    """
    identity = identity_map.get(film_key)
    if identity is None:
        identity = derive_parent_identity(title, source_film_id=source_film_id)
    parent_key = identity.parent_film_key or film_key
    display = identity.parent_display_title or title
    if parent_key and parent_key != film_key:
        return parent_key, "parent_film_key", display
    return parent_key or film_key, "showtime_film_key", display


def _match_override(
    overrides: Sequence[OpeningOverride],
    *,
    film_id: str | None,
    parent_film_key: str,
    showtime_film_keys: set[str],
) -> OpeningOverride | None:
    for override in overrides:
        if override.film_id and film_id and override.film_id == film_id:
            return override
        if override.parent_film_key and override.parent_film_key == parent_film_key:
            return override
        if override.showtime_film_key and override.showtime_film_key in showtime_film_keys:
            return override
        if override.showtime_film_key and override.showtime_film_key == parent_film_key:
            return override
    return None


def _bootstrap_sets(
    theater_ids: set[str],
    theater_coverage_start: Mapping[str, date],
    *,
    reference_date: date,
    bootstrap_days: int = BOOTSTRAP_DAYS,
) -> tuple[list[str], list[str]]:
    cutoff = reference_date - timedelta(days=bootstrap_days)
    bootstrap: list[str] = []
    mature: list[str] = []
    for theater_id in sorted(theater_ids):
        coverage = theater_coverage_start.get(theater_id)
        if coverage is None or coverage >= cutoff:
            bootstrap.append(theater_id)
        else:
            mature.append(theater_id)
    return bootstrap, mature


def _visible_counts_from_current(
    current_artifact: Mapping[str, Any] | None,
) -> dict[str, int]:
    """Map showtime_film_key and parent_film_key → visible showtime counts."""
    counts: dict[str, int] = {}
    if not current_artifact:
        return counts
    for showtime in current_artifact.get("showtimes", []):
        if not isinstance(showtime, dict):
            continue
        for key_name in ("showtime_film_key", "parent_film_key"):
            key = str(showtime.get(key_name, "")).strip()
            if key:
                counts[key] = counts.get(key, 0) + 1
    return counts


def _entry_from_agg(
    agg: _FilmAgg,
    *,
    opening_date: date,
    confidence: str,
    bootstrap_theater_ids: list[str],
    mature_theater_ids: list[str],
    visible_counts: Mapping[str, int],
    override: OpeningOverride | None,
) -> dict[str, Any]:
    theaters = agg.theaters_on_date(opening_date)
    film_key = agg.representative_showtime_film_key()
    film_id = sorted(agg.film_ids)[0] if len(agg.film_ids) == 1 else None
    if len(agg.film_ids) > 1:
        # Ambiguous catalog join — keep null rather than guessing.
        film_id = None

    identity_method = agg.identity_method
    if film_id is not None:
        identity_method = "film_id"

    visible = 0
    for key in {film_key, agg.parent_film_key, *agg.showtime_film_keys}:
        visible = max(visible, visible_counts.get(key, 0))

    override_payload = None
    if override is not None:
        override_payload = {
            "id": override.id,
            "action": override.action,
            "reason": override.reason,
            "forced_opening_date": (
                format_date_iso(override.forced_opening_date)
                if override.forced_opening_date
                else None
            ),
        }

    engagement_days = len(agg.all_dates)
    return {
        "showtime_film_key": film_key,
        "parent_film_key": agg.parent_film_key,
        "film_id": film_id,
        "film_title": agg.film_title,
        "opening_date": format_date_iso(opening_date),
        "theaters_on_opening_date": theaters,
        "theater_count_on_opening_date": len(theaters),
        "visible_showtime_count": visible,
        "engagement_days": engagement_days,
        "historical_screening_count": agg.screening_count,
        "opening_type": classify_opening_type(
            agg.film_title,
            distinct_scheduled_dates=engagement_days,
            sources=sorted(agg.sources),
            titles=sorted(agg.titles),
        ),
        "confidence": confidence,
        "evidence": {
            "identity_method": identity_method,
            "variant_showtime_film_keys": sorted(agg.showtime_film_keys),
            "distinct_scheduled_dates": engagement_days,
            "bootstrap_theater_ids": bootstrap_theater_ids,
            "mature_theater_ids": mature_theater_ids,
            "sources": sorted(agg.sources),
        },
        "override": override_payload,
    }


def build_opening_this_week_current(
    history_rows: Sequence[Mapping[str, Any]],
    *,
    registry: Mapping[str, Any],
    current_artifact: Mapping[str, Any] | None = None,
    overrides: Sequence[OpeningOverride] | None = None,
    reference_date: date | None = None,
    generated_at: datetime | None = None,
    identity_catalog: Mapping[str, Any] | None = None,
    bootstrap_days: int = BOOTSTRAP_DAYS,
) -> dict[str, Any]:
    """Build opening_this_week_current from historical showtimes."""
    ref = reference_date or pacific_today()
    week_start, week_end = week_bounds(ref)
    if generated_at is None:
        generated_at = datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    elif generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))

    theater_index = build_theater_index(registry)
    enabled_ids = enabled_theater_ids(registry)
    override_list = list(overrides or [])

    # First pass: theater coverage starts + identity rows for parent collapse.
    theater_coverage_start: dict[str, date] = {}
    identity_rows: list[dict[str, str]] = []
    parsed_rows: list[tuple[date, str, str, str, str, str]] = []
    # (show_date, theater_id, film_key, title, source_film_id, source)

    for row in history_rows:
        if normalize_bool_string(row.get("isCanceled"), default=False):
            continue

        show_date = parse_show_date(row.get("Date", ""), reference_date=ref)
        if show_date is None:
            continue

        theater_id = _resolve_row_theater_id(row, theater_index, enabled_ids)
        if theater_id is None:
            continue

        title = normalize_film_title(row.get("Film", ""))
        if title is None:
            continue

        film_key = str(row.get("showtime_film_key", "")).strip()
        if not film_key:
            film_key = showtime_film_key(row.get("Film", "")) or ""
        if not film_key:
            continue

        source_film_id = source_film_id_from_history_row(row) or ""
        source = str(
            theater_index.theaters_by_id.get(theater_id, {}).get("source")
            or row.get("source")
            or ""
        ).strip()

        prior = theater_coverage_start.get(theater_id)
        if prior is None or show_date < prior:
            theater_coverage_start[theater_id] = show_date

        identity_rows.append(
            {
                "showtime_film_key": film_key,
                "film_title": title,
                "amc_movie_id": source_film_id,
            }
        )
        parsed_rows.append((show_date, theater_id, film_key, title, source_film_id, source))

    identity_map = build_film_key_identity_map(identity_rows)
    catalog = identity_catalog if identity_catalog is not None else load_identity_catalog()
    film_id_index, _ = build_confirmed_tmdb_index(catalog)

    aggregates: dict[str, _FilmAgg] = {}
    for show_date, theater_id, film_key, title, source_film_id, source in parsed_rows:
        parent_key, identity_method, display = _identity_bundle_for_key(
            film_key,
            title,
            source_film_id,
            identity_map,
        )
        film_id, _ = resolve_public_film_id(
            [
                {
                    "source": source,
                    "source_film_id": source_film_id or None,
                    "showtime_film_key": film_key,
                }
            ],
            film_id_index,
        )

        agg = aggregates.get(parent_key)
        if agg is None:
            agg = _FilmAgg(
                identity_key=parent_key,
                identity_method=identity_method,
                parent_film_key=parent_key,
                film_title=display,
            )
            aggregates[parent_key] = agg

        agg.add_observation(
            show_date=show_date,
            theater_id=theater_id,
            showtime_film_key_value=film_key,
            film_title=display,
            variant_title=title,
            film_id=film_id,
            source=source,
        )

    visible_counts = _visible_counts_from_current(current_artifact)
    entries: list[dict[str, Any]] = []
    low_confidence: list[dict[str, Any]] = []
    override_applied = 0
    matched_override_ids: set[str] = set()

    for agg in aggregates.values():
        opening = agg.opening_date
        if opening is None:
            continue

        film_id = sorted(agg.film_ids)[0] if len(agg.film_ids) == 1 else None
        override = _match_override(
            override_list,
            film_id=film_id,
            parent_film_key=agg.parent_film_key,
            showtime_film_keys=agg.showtime_film_keys,
        )
        if override is not None:
            matched_override_ids.add(override.id)
            if override.forced_opening_date is not None:
                opening = override.forced_opening_date

        bootstrap_ids, mature_ids = _bootstrap_sets(
            agg.theater_ids,
            theater_coverage_start,
            reference_date=ref,
            bootstrap_days=bootstrap_days,
        )
        # Opening-date theaters alone can look like a bootstrap theater debut;
        # any mature-theater observation of the same film upgrades confidence.
        opening_theaters = set(agg.theaters_on_date(opening))
        opening_bootstrap, opening_mature = _bootstrap_sets(
            opening_theaters,
            theater_coverage_start,
            reference_date=ref,
            bootstrap_days=bootstrap_days,
        )
        if mature_ids or opening_mature:
            confidence = CONFIDENCE_HIGH
        elif opening_bootstrap:
            confidence = CONFIDENCE_LOW
        else:
            confidence = CONFIDENCE_HIGH

        in_week = week_start <= opening <= week_end
        force_include = override is not None and override.action == "include"
        force_exclude = override is not None and override.action == "exclude"

        if force_exclude:
            override_applied += 1
            continue

        if force_include:
            override_applied += 1
            if not in_week:
                continue
            confidence = CONFIDENCE_HIGH
            entry = _entry_from_agg(
                agg,
                opening_date=opening,
                confidence=confidence,
                bootstrap_theater_ids=bootstrap_ids,
                mature_theater_ids=mature_ids,
                visible_counts=visible_counts,
                override=override,
            )
            entries.append(entry)
            continue

        if not in_week:
            continue

        entry = _entry_from_agg(
            agg,
            opening_date=opening,
            confidence=confidence,
            bootstrap_theater_ids=bootstrap_ids,
            mature_theater_ids=mature_ids,
            visible_counts=visible_counts,
            override=override,
        )
        if confidence == CONFIDENCE_LOW:
            low_confidence.append(entry)
        else:
            entries.append(entry)

    # Force-include overrides with no history evidence (synthetic).
    for override in override_list:
        if override.id in matched_override_ids:
            continue
        if override.action != "include":
            continue
        opening = override.forced_opening_date
        if opening is None or not (week_start <= opening <= week_end):
            continue
        override_applied += 1
        film_key = (
            override.showtime_film_key
            or override.parent_film_key
            or (override.film_id or "override").replace(":", "-")
        )
        parent_key = override.parent_film_key or film_key
        entries.append(
            {
                "showtime_film_key": film_key,
                "parent_film_key": parent_key,
                "film_id": override.film_id,
                "film_title": film_key.replace("-", " ").title(),
                "opening_date": format_date_iso(opening),
                "theaters_on_opening_date": [],
                "theater_count_on_opening_date": 0,
                "visible_showtime_count": max(
                    visible_counts.get(film_key, 0),
                    visible_counts.get(parent_key, 0),
                ),
                "engagement_days": 0,
                "historical_screening_count": 0,
                "opening_type": OPENING_TYPE_UNKNOWN,
                "confidence": CONFIDENCE_HIGH,
                "evidence": {
                    "identity_method": (
                        "film_id"
                        if override.film_id
                        else "parent_film_key"
                        if override.parent_film_key
                        else "showtime_film_key"
                    ),
                    "variant_showtime_film_keys": [film_key],
                    "distinct_scheduled_dates": 0,
                    "bootstrap_theater_ids": [],
                    "mature_theater_ids": [],
                    "sources": [],
                },
                "override": {
                    "id": override.id,
                    "action": override.action,
                    "reason": override.reason,
                    "forced_opening_date": format_date_iso(opening),
                },
            }
        )

    def _sort_key(item: dict[str, Any]) -> tuple[str, str]:
        return (item["opening_date"], item["film_title"].casefold())

    entries.sort(key=_sort_key)
    low_confidence.sort(key=_sort_key)

    opening_dates = [date.fromisoformat(item["opening_date"]) for item in entries]
    type_counts: dict[str, int] = {}
    for item in entries:
        otype = str(item.get("opening_type") or "unknown")
        type_counts[otype] = type_counts.get(otype, 0) + 1

    return {
        "schema_version": OPENING_THIS_WEEK_SCHEMA_VERSION,
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "timezone": DEFAULT_TIMEZONE,
        "week": {
            "start_date": format_date_iso(week_start),
            "end_date": format_date_iso(week_end),
        },
        "method": {
            "name": METHOD_NAME,
            "version": METHOD_VERSION,
            "description": METHOD_DESCRIPTION,
        },
        "stats": {
            "entry_count": len(entries),
            "low_confidence_count": len(low_confidence),
            "override_applied_count": override_applied,
            "earliest_opening_date": (
                format_date_iso(min(opening_dates)) if opening_dates else None
            ),
            "latest_opening_date": (
                format_date_iso(max(opening_dates)) if opening_dates else None
            ),
            "opening_type_counts": type_counts,
        },
        "entries": entries,
        "low_confidence_candidates": low_confidence,
    }


def load_showtimes_current(path: Path | None = None) -> dict[str, Any]:
    target = path or DEFAULT_SHOWTIMES_CURRENT_PATH
    with target.open(encoding="utf-8") as handle:
        document = json.load(handle)
    if not isinstance(document, dict):
        raise ValueError(f"showtimes_current must be an object: {target}")
    return document


def _load_history_rows(history_path: Path) -> list[dict[str, str]]:
    with history_path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_opening_this_week_current(
    history_rows: Sequence[Mapping[str, Any]] | None = None,
    *,
    history_path: Path | None = None,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    registry_path: Path = DEFAULT_REGISTRY_PATH,
    overrides_path: Path = DEFAULT_OVERRIDES_PATH,
    showtimes_current_path: Path | None = DEFAULT_SHOWTIMES_CURRENT_PATH,
    current_artifact: Mapping[str, Any] | None = None,
    reference_date: date | None = None,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Build and write ``opening_this_week_current.json``."""
    if history_rows is None:
        path = history_path or DEFAULT_HISTORY_PATH
        history_rows = _load_history_rows(path)

    with registry_path.open(encoding="utf-8") as handle:
        registry = json.load(handle)

    overrides = load_opening_overrides(overrides_path)

    if current_artifact is None and showtimes_current_path is not None:
        if showtimes_current_path.is_file():
            current_artifact = load_showtimes_current(showtimes_current_path)

    if reference_date is None and current_artifact is not None:
        window = current_artifact.get("window", {})
        if isinstance(window, dict) and window.get("start_date"):
            try:
                reference_date = date.fromisoformat(str(window["start_date"]))
            except ValueError:
                reference_date = None

    artifact = build_opening_this_week_current(
        history_rows,
        registry=registry,
        current_artifact=current_artifact,
        overrides=overrides,
        reference_date=reference_date,
        generated_at=generated_at,
    )
    validate_opening_this_week_current(artifact)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    return artifact
