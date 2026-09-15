"""Combine live AMC + TMDB + local schedule evidence into a Coming Soon audit.

Four evidence concepts are tracked independently and must never be collapsed
into each other:

``amcComingSoonCatalog``
    The title appears in AMC's national movie/Coming Soon catalog endpoint.
``amcTheaterBooking``
    AMC returned at least one announced performance at a Seattle-area theater.
``tmdbUsTheatrical``
    TMDB Discover lists the title as a US theatrical (release type 2 or 3).
``reelSeattleScheduled``
    The published Reel Seattle showtimes artifact contains a screening.

An AMC theater booking is a *local scheduling* fact. Catalog membership is an
*announcement* fact. A title can have either without the other.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping
from zoneinfo import ZoneInfo

from reel_seattle.analysis.film_identity import derive_parent_identity
from reel_seattle.normalize import DEFAULT_TIMEZONE

SCHEMA_VERSION = "1.0.0"

EVIDENCE_AMC_COMING_SOON_CATALOG = "amcComingSoonCatalog"
EVIDENCE_AMC_THEATER_BOOKING = "amcTheaterBooking"
EVIDENCE_TMDB_US_THEATRICAL = "tmdbUsTheatrical"
EVIDENCE_REEL_SEATTLE_SCHEDULED = "reelSeattleScheduled"

EVIDENCE_KEYS = (
    EVIDENCE_AMC_COMING_SOON_CATALOG,
    EVIDENCE_AMC_THEATER_BOOKING,
    EVIDENCE_TMDB_US_THEATRICAL,
    EVIDENCE_REEL_SEATTLE_SCHEDULED,
)

EVIDENCE_DEFINITIONS = {
    EVIDENCE_AMC_COMING_SOON_CATALOG: (
        "Title present in AMC's national movie/Coming Soon catalog endpoint. "
        "Independent of whether any performance exists anywhere."
    ),
    EVIDENCE_AMC_THEATER_BOOKING: (
        "AMC returned at least one announced performance at a Seattle-area "
        "theater. This is a local scheduling fact, not catalog membership."
    ),
    EVIDENCE_TMDB_US_THEATRICAL: (
        "TMDB Discover lists the title with region=US and release type 2|3 "
        "inside the audit window."
    ),
    EVIDENCE_REEL_SEATTLE_SCHEDULED: (
        "Published Reel Seattle showtimes artifact contains a screening for "
        "the title inside its rolling publication window."
    ),
}

STATUS_CURRENTLY_AVAILABLE = "currently_available"
STATUS_CONFIRMED_LOCAL_FUTURE = "confirmed_local_future"
STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES = "amc_announced_without_local_showtimes"
STATUS_TMDB_ONLY_UPCOMING = "tmdb_only_upcoming"
STATUS_UNCLASSIFIED = "unclassified"

STATUS_KEYS = (
    STATUS_CURRENTLY_AVAILABLE,
    STATUS_CONFIRMED_LOCAL_FUTURE,
    STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES,
    STATUS_TMDB_ONLY_UPCOMING,
    STATUS_UNCLASSIFIED,
)

DEFAULT_WINDOW_DAYS = 90
DEFAULT_CURRENT_WINDOW_DAYS = 7
HORIZONS = (30, 60, 90)


def pacific_today(now: datetime | None = None) -> date:
    """Return today's calendar date in America/Los_Angeles."""
    if now is None:
        return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    if now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    return now.astimezone(ZoneInfo(DEFAULT_TIMEZONE)).date()


def match_key(title: str) -> str:
    """Cross-source join key for a film title.

    Uses the same parent identity derivation as the showtimes pipeline so AMC,
    TMDB, and published Reel Seattle titles land on comparable keys.
    """
    text = (title or "").strip()
    if not text:
        return ""
    identity = derive_parent_identity(text, source_film_id="match-key")
    return identity.parent_film_key or ""


def _parse_iso_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _parse_slash_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    parts = value.strip().split("/")
    if len(parts) != 3:
        return None
    try:
        month, day, year = (int(part) for part in parts)
        return date(year, month, day)
    except ValueError:
        return None


@dataclass
class ComingSoonEntry:
    """One candidate with independent evidence flags."""

    match_key: str
    title: str
    amc_movie_id: str | None = None
    tmdb_id: int | None = None

    amc_coming_soon_catalog: bool = False
    amc_theater_booking: bool = False
    tmdb_us_theatrical: bool = False
    reel_seattle_scheduled: bool = False

    amc_catalog_release_date: date | None = None
    amc_first_booking_date: date | None = None
    tmdb_us_release_date: date | None = None
    reel_seattle_first_date: date | None = None

    local_theater_ids: list[str] = field(default_factory=list)
    source_titles: dict[str, str] = field(default_factory=dict)

    def evidence(self) -> dict[str, bool]:
        return {
            EVIDENCE_AMC_COMING_SOON_CATALOG: self.amc_coming_soon_catalog,
            EVIDENCE_AMC_THEATER_BOOKING: self.amc_theater_booking,
            EVIDENCE_TMDB_US_THEATRICAL: self.tmdb_us_theatrical,
            EVIDENCE_REEL_SEATTLE_SCHEDULED: self.reel_seattle_scheduled,
        }

    def first_local_date(self) -> date | None:
        """Earliest date with a locally scheduled screening from any local source."""
        candidates = [d for d in (self.amc_first_booking_date, self.reel_seattle_first_date) if d]
        return min(candidates) if candidates else None

    def announcement_date(self) -> date | None:
        """Earliest date this title is expected to be showable locally."""
        candidates = [
            d
            for d in (
                self.first_local_date(),
                self.amc_catalog_release_date,
                self.tmdb_us_release_date,
            )
            if d
        ]
        return min(candidates) if candidates else None

    def status(self, *, current_window_end: date) -> str:
        first_local = self.first_local_date()
        if first_local is not None:
            if first_local <= current_window_end:
                return STATUS_CURRENTLY_AVAILABLE
            return STATUS_CONFIRMED_LOCAL_FUTURE
        if self.amc_coming_soon_catalog or self.amc_theater_booking:
            return STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES
        if self.tmdb_us_theatrical:
            return STATUS_TMDB_ONLY_UPCOMING
        return STATUS_UNCLASSIFIED

    def status_reason(self, *, current_window_end: date) -> str:
        status = self.status(current_window_end=current_window_end)
        if status == STATUS_CURRENTLY_AVAILABLE:
            return f"Locally scheduled on {self.first_local_date()} (within current window)"
        if status == STATUS_CONFIRMED_LOCAL_FUTURE:
            return f"Locally scheduled on {self.first_local_date()} (after current window)"
        if status == STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES:
            evidence = "AMC catalog" if self.amc_coming_soon_catalog else "AMC theater booking"
            return f"{evidence} evidence with no locally scheduled screening"
        if status == STATUS_TMDB_ONLY_UPCOMING:
            return f"TMDB US theatrical release {self.tmdb_us_release_date or 'TBD'}, no AMC or local evidence"
        return "No usable evidence"


def bucket_counts(entries: Iterable[ComingSoonEntry], *, current_window_end: date) -> dict[str, int]:
    """Count entries per combined status bucket."""
    counts = {key: 0 for key in STATUS_KEYS}
    for entry in entries:
        counts[entry.status(current_window_end=current_window_end)] += 1
    return counts


def horizon_counts(
    entries: Iterable[ComingSoonEntry],
    *,
    today: date,
    current_window_end: date,
    horizons: Iterable[int] = HORIZONS,
) -> dict[str, dict[str, int]]:
    """Count buckets restricted to titles landing within each horizon."""
    materialized = list(entries)
    result: dict[str, dict[str, int]] = {}
    for days in horizons:
        cutoff = today + timedelta(days=days)
        in_horizon = [
            entry
            for entry in materialized
            if (entry.announcement_date() is not None and entry.announcement_date() <= cutoff)
        ]
        counts = bucket_counts(in_horizon, current_window_end=current_window_end)
        counts["total_in_horizon"] = len(in_horizon)
        result[f"{days}_days"] = counts
    return result


def evidence_totals(entries: Iterable[ComingSoonEntry]) -> dict[str, int]:
    totals = {key: 0 for key in EVIDENCE_KEYS}
    for entry in entries:
        for key, present in entry.evidence().items():
            if present:
                totals[key] += 1
    return totals


def load_amc_theater_bookings(
    log_path: Path | str,
    *,
    today: date,
    window_end: date,
) -> dict[str, dict[str, Any]]:
    """Seattle-area AMC announced performances, keyed by match key.

    Reads a normalized AMC daily scrape log. This is theater booking evidence,
    not catalog evidence.
    """
    from reel_seattle.adapters.scrape_log import load_scrape_daily_log

    path = Path(log_path)
    if not path.exists():
        return {}

    result = load_scrape_daily_log(path)
    bookings: dict[str, dict[str, Any]] = {}

    for record in result.records:
        show_date = _parse_slash_date(record.date_raw)
        if show_date is None or not (today <= show_date <= window_end):
            continue
        title = record.title_raw or ""
        key = match_key(title)
        if not key:
            continue
        attrs = record.attributes or {}
        movie_id = str(attrs.get("movie_id", "") or "").strip() or None

        bucket = bookings.setdefault(
            key,
            {
                "title": title,
                "amc_movie_ids": set(),
                "first_date": show_date,
                "dates": set(),
                "theaters": set(),
            },
        )
        if movie_id:
            bucket["amc_movie_ids"].add(movie_id)
        bucket["dates"].add(show_date)
        bucket["first_date"] = min(bucket["first_date"], show_date)
        if record.theater_name_raw:
            bucket["theaters"].add(record.theater_name_raw)

    return bookings


def load_reel_seattle_scheduled(
    showtimes_path: Path | str,
    *,
    today: date,
) -> dict[str, dict[str, Any]]:
    """Published Reel Seattle screenings keyed by match key.

    The published artifact covers a rolling window, so absence here does not
    mean a title is unscheduled beyond that window.
    """
    path = Path(showtimes_path)
    if not path.exists():
        return {}

    payload = json.loads(path.read_text(encoding="utf-8"))
    scheduled: dict[str, dict[str, Any]] = {}

    for showtime in payload.get("showtimes", []):
        if not isinstance(showtime, Mapping):
            continue
        local_date = _parse_iso_date(showtime.get("date") or showtime.get("local_date"))
        if local_date is None or local_date < today:
            continue
        title = showtime.get("parent_display_title") or showtime.get("film_title") or ""
        key = showtime.get("parent_film_key") or match_key(str(title))
        if not key:
            continue

        bucket = scheduled.setdefault(
            str(key),
            {
                "title": str(title),
                "film_ids": set(),
                "first_date": local_date,
                "theaters": set(),
                "source_film_ids": set(),
            },
        )
        bucket["first_date"] = min(bucket["first_date"], local_date)
        if showtime.get("id"):
            bucket["film_ids"].add(str(showtime["id"]))
        if showtime.get("theater_id"):
            bucket["theaters"].add(str(showtime["theater_id"]))
        if showtime.get("source_film_id"):
            bucket["source_film_ids"].add(str(showtime["source_film_id"]))

    return scheduled


def _publication_window(showtimes_path: Path | str) -> dict[str, Any]:
    path = Path(showtimes_path)
    if not path.exists():
        return {"available": False}
    payload = json.loads(path.read_text(encoding="utf-8"))
    window = payload.get("window") if isinstance(payload.get("window"), Mapping) else {}
    return {
        "available": True,
        "generated_at": payload.get("generated_at"),
        "window": dict(window),
    }


def build_entries(
    *,
    amc_catalog_movies: Iterable[Mapping[str, Any]],
    amc_bookings: Mapping[str, Mapping[str, Any]],
    tmdb_candidates: Iterable[Mapping[str, Any]],
    reel_seattle_scheduled: Mapping[str, Mapping[str, Any]],
) -> list[ComingSoonEntry]:
    """Merge the four evidence sources into one entry list keyed by match key."""
    entries: dict[str, ComingSoonEntry] = {}

    def ensure(key: str, title: str) -> ComingSoonEntry:
        entry = entries.get(key)
        if entry is None:
            entry = ComingSoonEntry(match_key=key, title=title)
            entries[key] = entry
        return entry

    for movie in amc_catalog_movies:
        title = str(movie.get("name") or movie.get("title") or "").strip()
        key = match_key(title)
        if not key:
            continue
        entry = ensure(key, title)
        entry.amc_coming_soon_catalog = True
        entry.source_titles["amc_catalog"] = title
        if movie.get("amc_movie_id") is not None:
            entry.amc_movie_id = str(movie["amc_movie_id"])
        elif movie.get("id") is not None:
            entry.amc_movie_id = str(movie["id"])
        release = _parse_iso_date(movie.get("release_date") or movie.get("releaseDateUtc"))
        if release and (entry.amc_catalog_release_date is None or release < entry.amc_catalog_release_date):
            entry.amc_catalog_release_date = release

    for key, booking in amc_bookings.items():
        title = str(booking.get("title") or "")
        entry = ensure(key, entry_title_or(entries, key, title))
        entry.amc_theater_booking = True
        entry.source_titles["amc_theater_booking"] = title
        movie_ids = booking.get("amc_movie_ids") or set()
        if not entry.amc_movie_id and movie_ids:
            entry.amc_movie_id = str(sorted(movie_ids)[0])
        first_date = booking.get("first_date")
        if isinstance(first_date, date):
            if entry.amc_first_booking_date is None or first_date < entry.amc_first_booking_date:
                entry.amc_first_booking_date = first_date
        for theater in sorted(booking.get("theaters") or []):
            if theater not in entry.local_theater_ids:
                entry.local_theater_ids.append(str(theater))

    for candidate in tmdb_candidates:
        title = str(candidate.get("title") or "").strip()
        key = match_key(title)
        if not key:
            continue
        entry = ensure(key, entry_title_or(entries, key, title))
        entry.tmdb_us_theatrical = True
        entry.source_titles["tmdb"] = title
        if candidate.get("tmdb_id") is not None:
            try:
                entry.tmdb_id = int(candidate["tmdb_id"])
            except (TypeError, ValueError):
                pass
        release = _parse_iso_date(candidate.get("release_date"))
        if release and (entry.tmdb_us_release_date is None or release < entry.tmdb_us_release_date):
            entry.tmdb_us_release_date = release

    for key, scheduled in reel_seattle_scheduled.items():
        title = str(scheduled.get("title") or "")
        entry = ensure(key, entry_title_or(entries, key, title))
        entry.reel_seattle_scheduled = True
        entry.source_titles["reel_seattle"] = title
        first_date = scheduled.get("first_date")
        if isinstance(first_date, date):
            if entry.reel_seattle_first_date is None or first_date < entry.reel_seattle_first_date:
                entry.reel_seattle_first_date = first_date
        for theater in sorted(scheduled.get("theaters") or []):
            if theater not in entry.local_theater_ids:
                entry.local_theater_ids.append(str(theater))

    return sorted(entries.values(), key=lambda e: (e.announcement_date() or date.max, e.title))


def entry_title_or(entries: Mapping[str, ComingSoonEntry], key: str, fallback: str) -> str:
    existing = entries.get(key)
    if existing is not None and existing.title:
        return existing.title
    return fallback


def entry_to_dict(entry: ComingSoonEntry, *, current_window_end: date) -> dict[str, Any]:
    return {
        "match_key": entry.match_key,
        "title": entry.title,
        "amc_movie_id": entry.amc_movie_id,
        "tmdb_id": entry.tmdb_id,
        "evidence": entry.evidence(),
        "dates": {
            "amc_catalog_release_date": entry.amc_catalog_release_date.isoformat()
            if entry.amc_catalog_release_date
            else None,
            "amc_first_booking_date": entry.amc_first_booking_date.isoformat()
            if entry.amc_first_booking_date
            else None,
            "tmdb_us_release_date": entry.tmdb_us_release_date.isoformat()
            if entry.tmdb_us_release_date
            else None,
            "reel_seattle_first_date": entry.reel_seattle_first_date.isoformat()
            if entry.reel_seattle_first_date
            else None,
            "first_local_date": entry.first_local_date().isoformat() if entry.first_local_date() else None,
            "announcement_date": entry.announcement_date().isoformat() if entry.announcement_date() else None,
        },
        "status": entry.status(current_window_end=current_window_end),
        "status_reason": entry.status_reason(current_window_end=current_window_end),
        "local_theaters": entry.local_theater_ids,
        "source_titles": entry.source_titles,
    }


def build_live_audit(
    *,
    amc_investigation: Mapping[str, Any] | None,
    tmdb_investigation: Mapping[str, Any] | None,
    amc_log_path: Path | str,
    showtimes_current_path: Path | str,
    today: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    current_window_days: int = DEFAULT_CURRENT_WINDOW_DAYS,
) -> dict[str, Any]:
    """Build the combined live Coming Soon source audit artifact."""
    today_date = today or pacific_today()
    window_end = today_date + timedelta(days=window_days)
    current_window_end = today_date + timedelta(days=current_window_days)

    amc_catalog = (amc_investigation or {}).get("catalog") or {}
    amc_catalog_movies = amc_catalog.get("movies") or []
    amc_catalog_accessible = bool(amc_catalog.get("accessible"))

    tmdb_candidates = (tmdb_investigation or {}).get("candidates") or []
    tmdb_accessible = bool(((tmdb_investigation or {}).get("query") or {}).get("executed"))

    amc_bookings = load_amc_theater_bookings(amc_log_path, today=today_date, window_end=window_end)
    reel_seattle_scheduled = load_reel_seattle_scheduled(showtimes_current_path, today=today_date)

    entries = build_entries(
        amc_catalog_movies=amc_catalog_movies,
        amc_bookings=amc_bookings,
        tmdb_candidates=tmdb_candidates,
        reel_seattle_scheduled=reel_seattle_scheduled,
    )

    counts = bucket_counts(entries, current_window_end=current_window_end)
    horizons = horizon_counts(
        entries,
        today=today_date,
        current_window_end=current_window_end,
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "artifact": "coming_soon_source_audit_live",
        "generated_at": datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds"),
        "pacific_today": today_date.isoformat(),
        "window": {
            "start_date": today_date.isoformat(),
            "end_date": window_end.isoformat(),
            "window_days": window_days,
            "current_window_end": current_window_end.isoformat(),
            "current_window_days": current_window_days,
        },
        "evidence_definitions": EVIDENCE_DEFINITIONS,
        "sources": {
            "amc_coming_soon_catalog": {
                "live": True,
                "accessible": amc_catalog_accessible,
                "endpoint": amc_catalog.get("selected_endpoint"),
                "titles": len(amc_catalog_movies),
            },
            "amc_theater_booking": {
                "live": False,
                "input": str(amc_log_path),
                "titles": len(amc_bookings),
                "note": "Seattle-area announced performances from the committed AMC scrape log",
            },
            "tmdb_us_theatrical": {
                "live": True,
                "accessible": tmdb_accessible,
                "endpoint": ((tmdb_investigation or {}).get("query") or {}).get("endpoint"),
                "titles": len(tmdb_candidates),
            },
            "reel_seattle_scheduled": {
                "live": False,
                "input": str(showtimes_current_path),
                "titles": len(reel_seattle_scheduled),
                "publication": _publication_window(showtimes_current_path),
            },
        },
        "counts": {**counts, "total_entries": len(entries)},
        "horizons": horizons,
        "evidence_totals": evidence_totals(entries),
        "entries": [entry_to_dict(entry, current_window_end=current_window_end) for entry in entries],
    }
