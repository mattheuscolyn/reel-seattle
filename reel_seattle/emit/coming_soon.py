"""Emit coming_soon_source_audit.json - investigation prototype for Coming Soon data.

This module extracts "coming soon" movies from multiple sources:
1. AMC far-future announced showtimes (movies without current screenings)
2. TMDB upcoming/discover queries for US theatrical releases
3. Existing Reel Seattle schedule data for confirmation

NOT YET PRODUCTION - this is an audit/investigation tool.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.adapters.scrape_log import load_scrape_daily_log, daily_log_path
from reel_seattle.analysis.film_identity import derive_parent_identity
from reel_seattle.normalize import (
    DEFAULT_TIMEZONE,
    parse_show_date,
    normalize_film_title,
)

DEFAULT_WINDOW_DAYS = 90

# Evidence flags - these are INDEPENDENT and must not be conflated
EVIDENCE_AMC_THEATER_BOOKING = "amc_theater_booking"  # Has actual AMC performance booking
EVIDENCE_AMC_CATALOG = "amc_catalog"  # In AMC catalog (NOT accessible with our credentials)
EVIDENCE_TMDB_US_THEATRICAL = "tmdb_us_theatrical"  # TMDB US theatrical release
EVIDENCE_REEL_SEATTLE_FUTURE = "reel_seattle_future"  # Has future Reel Seattle screening

# Status classifications based on evidence
STATUS_CONFIRMED_LOCAL_FUTURE = "confirmed_local_future"  # Has future screening, no current availability
STATUS_CURRENTLY_AVAILABLE = "currently_available"  # Has screening in current window
STATUS_AMC_BOOKED_FUTURE = "amc_booked_future"  # AMC booking but no current local availability
STATUS_TMDB_UPCOMING = "tmdb_upcoming"  # TMDB evidence only

DEFAULT_OUTPUT_PATH = Path("data/audits/coming_soon_source_audit_v2.json")


@dataclass
class ComingSoonCandidate:
    """One coming soon movie candidate from any source.
    
    IMPORTANT: Evidence flags are independent:
    - amcTheaterBooking: Has actual AMC performance slots (from showtimes API)
    - amcCatalog: In AMC movie catalog (NOT accessible - documented for future)
    - tmdbUsTheatrical: TMDB US theatrical release data
    - reelSeattleFuture: Has confirmed future Reel Seattle screening
    """
    
    canonical_film_id: str | None
    title: str
    tmdb_id: int | None
    amc_movie_id: str | None
    parent_film_key: str | None
    showtime_film_key: str | None
    
    # Evidence flags (independent)
    amc_theater_booking: bool = False
    amc_catalog: bool = False  # Not accessible in current investigation
    tmdb_us_theatrical: bool = False
    reel_seattle_future: bool = False
    reel_seattle_current: bool = False  # Has screening in current window
    
    # Dates (can be from different sources)
    amc_first_booking_date: date | None = None
    amc_catalog_release_date: date | None = None  # Not available
    tmdb_us_release_date: date | None = None
    first_local_screening_date: date | None = None
    earliest_current_screening: date | None = None
    
    # Theater info
    local_theater_ids: list[str] = field(default_factory=list)
    
    def provisional_status(self) -> str:
        """Classify movie by evidence and availability."""
        # If currently available, it's not "coming soon"
        if self.reel_seattle_current and self.earliest_current_screening:
            return STATUS_CURRENTLY_AVAILABLE
        
        # If has future local screening (but not current), it's confirmed future
        if self.reel_seattle_future and self.first_local_screening_date:
            return STATUS_CONFIRMED_LOCAL_FUTURE
        
        # If has AMC theater booking (but no current/future local match), it's AMC booked
        if self.amc_theater_booking:
            return STATUS_AMC_BOOKED_FUTURE
        
        # TMDB only (when we can query it)
        if self.tmdb_us_theatrical:
            return STATUS_TMDB_UPCOMING
        
        return "unknown"
    
    def confidence_explanation(self) -> str:
        """Human-readable confidence reasoning."""
        status = self.provisional_status()
        
        if status == STATUS_CURRENTLY_AVAILABLE:
            return f"Currently available (screening {self.earliest_current_screening})"
        
        if status == STATUS_CONFIRMED_LOCAL_FUTURE:
            return f"Confirmed future Seattle screening on {self.first_local_screening_date}"
        
        if status == STATUS_AMC_BOOKED_FUTURE:
            return f"AMC theater booking, first screening {self.amc_first_booking_date or 'TBD'}"
        
        if status == STATUS_TMDB_UPCOMING:
            return f"TMDB US theatrical release {self.tmdb_us_release_date or 'TBD'}"
        
        return "Insufficient evidence"
    
    def is_coming_soon(self) -> bool:
        """True if this should be included in Coming Soon (not currently available)."""
        return self.provisional_status() != STATUS_CURRENTLY_AVAILABLE


def pacific_today(now: datetime | None = None) -> date:
    """Return today's calendar date in America/Los_Angeles."""
    if now is None:
        return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    if now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    return now.astimezone(ZoneInfo(DEFAULT_TIMEZONE)).date()


def extract_amc_theater_bookings(
    *,
    amc_scrape_log_path: Path,
    today_date: date,
    window_end: date,
    current_window_end: date,  # End of "currently available" window
) -> list[ComingSoonCandidate]:
    """Extract movies from AMC theater bookings (performance data, NOT catalog).
    
    IMPORTANT: This extracts from theater showtimes API, which returns actual
    performance bookings. This is NOT the same as AMC's Coming Soon catalog.
    
    A movie with future bookings may or may not be "coming soon" depending on
    whether it's currently available.
    """
    
    if not amc_scrape_log_path.exists():
        return []
    
    result = load_scrape_daily_log(amc_scrape_log_path)
    records = result.records
    
    # Group screenings by AMC movie_id
    movies_by_id: dict[str, dict[str, Any]] = {}
    
    for record in records:
        attrs = record.attributes or {}
        movie_id = str(attrs.get("movie_id", "")).strip()
        if not movie_id:
            continue
        
        # Parse show date
        date_str = record.date_raw
        try:
            m, d, y = date_str.split("/")
            show_date = date(int(y), int(m), int(d))
        except (ValueError, AttributeError):
            continue
        
        # Skip if outside our window
        if not (today_date <= show_date <= window_end):
            continue
        
        if movie_id not in movies_by_id:
            movies_by_id[movie_id] = {
                "title": record.title_raw,
                "amc_movie_id": movie_id,
                "current_dates": [],
                "future_dates": [],
                "all_dates": [],
                "theaters": set(),
            }
        
        movies_by_id[movie_id]["all_dates"].append(show_date)
        
        # Classify as current vs future
        if show_date <= current_window_end:
            movies_by_id[movie_id]["current_dates"].append(show_date)
        else:
            movies_by_id[movie_id]["future_dates"].append(show_date)
        
        movies_by_id[movie_id]["theaters"].add(record.theater_name_raw)
    
    # Create candidates for ALL movies with bookings in the window
    candidates = []
    
    for movie_id, info in movies_by_id.items():
        all_dates = sorted(info["all_dates"])
        current_dates = sorted(info["current_dates"])
        future_dates = sorted(info["future_dates"])
        
        identity = derive_parent_identity(
            info["title"],
            source_film_id=movie_id,
        )
        
        candidate = ComingSoonCandidate(
            canonical_film_id=None,  # Will be resolved later
            title=info["title"],
            tmdb_id=None,
            amc_movie_id=movie_id,
            parent_film_key=identity.parent_film_key,
            showtime_film_key=None,
            amc_theater_booking=True,
            amc_first_booking_date=all_dates[0] if all_dates else None,
            earliest_current_screening=current_dates[0] if current_dates else None,
            first_local_screening_date=future_dates[0] if future_dates else None,
            local_theater_ids=[],  # TODO: map theater names to IDs
        )
        
        # Set current vs future flags
        candidate.reel_seattle_current = bool(current_dates)
        candidate.reel_seattle_future = bool(future_dates)
        
        candidates.append(candidate)
    
    return candidates


def extract_reel_seattle_future_screenings(
    *,
    showtimes_current: Mapping[str, Any],
    today_date: date,
) -> dict[str, dict[str, Any]]:
    """Extract movies with future Seattle screenings from current showtimes artifact.
    
    Returns dict mapping showtime_film_key -> screening info.
    """
    
    future_by_key: dict[str, dict[str, Any]] = {}
    
    for showtime in showtimes_current.get("showtimes", []):
        local_date_str = showtime.get("local_date", "")
        try:
            local_date = date.fromisoformat(local_date_str)
        except (ValueError, TypeError):
            continue
        
        if local_date < today_date:
            continue
        
        film_key = showtime.get("showtime_film_key", "")
        if not film_key:
            continue
        
        if film_key not in future_by_key:
            future_by_key[film_key] = {
                "title": showtime.get("film_title", ""),
                "film_id": showtime.get("film_id"),
                "parent_film_key": showtime.get("parent_film_key"),
                "earliest_date": local_date,
                "theaters": set(),
                "source_film_ids": set(),
            }
        else:
            if local_date < future_by_key[film_key]["earliest_date"]:
                future_by_key[film_key]["earliest_date"] = local_date
        
        future_by_key[film_key]["theaters"].add(showtime.get("theater_id", ""))
        
        source_id = showtime.get("source_film_id")
        if source_id:
            future_by_key[film_key]["source_film_ids"].add(source_id)
    
    return future_by_key


def merge_candidates(
    amc_candidates: Sequence[ComingSoonCandidate],
    reel_seattle_future: Mapping[str, Mapping[str, Any]],
    tmdb_candidates: Sequence[ComingSoonCandidate] | None = None,
) -> list[ComingSoonCandidate]:
    """Merge candidates from multiple sources, deduplicating by AMC movie ID and film key.
    
    Priority for merging:
    1. Exact AMC movie_id match
    2. Parent film key match
    3. TMDB ID match (if both have it)
    """
    
    # Index AMC candidates by movie_id
    by_amc_id: dict[str, ComingSoonCandidate] = {}
    by_parent_key: dict[str, ComingSoonCandidate] = {}
    
    for candidate in amc_candidates:
        if candidate.amc_movie_id:
            by_amc_id[candidate.amc_movie_id] = candidate
        if candidate.parent_film_key:
            by_parent_key[candidate.parent_film_key] = candidate
    
    # Enrich with Reel Seattle future screenings
    for film_key, info in reel_seattle_future.items():
        matched = False
        
        # Try to match by AMC movie ID
        for source_id in info.get("source_film_ids", set()):
            if source_id in by_amc_id:
                candidate = by_amc_id[source_id]
                candidate.evidence.add(EVIDENCE_REEL_SEATTLE_SCHEDULED)
                candidate.canonical_film_id = info.get("film_id")
                candidate.first_local_screening_date = info["earliest_date"]
                candidate.local_theater_ids = list(info["theaters"])
                candidate.reel_seattle_earliest_date = info["earliest_date"]
                matched = True
                break
        
        if matched:
            continue
        
        # Try to match by parent key
        parent_key = info.get("parent_film_key")
        if parent_key and parent_key in by_parent_key:
            candidate = by_parent_key[parent_key]
            candidate.evidence.add(EVIDENCE_REEL_SEATTLE_SCHEDULED)
            candidate.canonical_film_id = info.get("film_id")
            candidate.first_local_screening_date = info["earliest_date"]
            candidate.local_theater_ids = list(info["theaters"])
            candidate.reel_seattle_earliest_date = info["earliest_date"]
            continue
    
    # TODO: Integrate TMDB candidates (when live TMDB queries are available)
    # For now, TMDB integration would:
    # 1. Query TMDB Discover for US theatrical releases in date window
    # 2. Match by title similarity + release year
    # 3. Add EVIDENCE_TMDB_US_THEATRICAL to matched candidates
    
    merged = list(by_amc_id.values())
    return merged


def build_coming_soon_source_audit(
    *,
    today_date: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    amc_log_date: str | None = None,
    logs_dir: Path = Path("data/daily_logs"),
    showtimes_current_path: Path = Path("public/data/showtimes_current.json"),
    current_window_days: int = 7,  # Days for "currently available" window
) -> dict[str, Any]:
    """Build coming soon source audit artifact (V2 with corrected evidence model)."""
    
    today = today_date or pacific_today()
    window_end = today + timedelta(days=window_days)
    current_window_end = today + timedelta(days=current_window_days)
    
    # Find most recent AMC log if not specified
    if amc_log_date is None:
        amc_logs = sorted(logs_dir.glob("*_amc.json"))
        if not amc_logs:
            raise FileNotFoundError(f"No AMC logs found in {logs_dir}")
        amc_log_path = amc_logs[-1]
        amc_log_date = amc_log_path.stem.split("_")[0]
    else:
        amc_log_path = daily_log_path(amc_log_date, "amc", logs_dir=logs_dir)
    
    print(f"Using AMC log: {amc_log_path}")
    print(f"Current window: {today} to {current_window_end} ({current_window_days} days)")
    print(f"Full window: {today} to {window_end} ({window_days} days)")
    
    # Extract AMC theater bookings
    amc_candidates = extract_amc_theater_bookings(
        amc_scrape_log_path=amc_log_path,
        today_date=today,
        window_end=window_end,
        current_window_end=current_window_end,
    )
    
    print(f"AMC theater bookings found: {len(amc_candidates)}")
    
    # Classify candidates
    currently_available = [c for c in amc_candidates if c.provisional_status() == STATUS_CURRENTLY_AVAILABLE]
    future_only = [c for c in amc_candidates if c.is_coming_soon()]
    
    print(f"  Currently available: {len(currently_available)}")
    print(f"  Coming soon (future only): {len(future_only)}")
    
    # Classify by provisional status
    status_counts = {}
    for candidate in amc_candidates:
        status = candidate.provisional_status()
        status_counts[status] = status_counts.get(status, 0) + 1
    
    # Build artifact entries (include ALL for analysis, flag which are truly "coming soon")
    entries = []
    for candidate in sorted(amc_candidates, key=lambda c: (c.amc_first_booking_date or date.max, c.title)):
        entry = {
            "canonical_film_id": candidate.canonical_film_id,
            "title": candidate.title,
            "tmdb_id": candidate.tmdb_id,
            "amc_movie_id": candidate.amc_movie_id,
            "parent_film_key": candidate.parent_film_key,
            "showtime_film_key": candidate.showtime_film_key,
            
            # Evidence flags (independent)
            "evidence": {
                "amc_theater_booking": candidate.amc_theater_booking,
                "amc_catalog": candidate.amc_catalog,
                "tmdb_us_theatrical": candidate.tmdb_us_theatrical,
                "reel_seattle_future": candidate.reel_seattle_future,
                "reel_seattle_current": candidate.reel_seattle_current,
            },
            
            # Dates
            "amc_first_booking_date": candidate.amc_first_booking_date.isoformat() if candidate.amc_first_booking_date else None,
            "amc_catalog_release_date": candidate.amc_catalog_release_date.isoformat() if candidate.amc_catalog_release_date else None,
            "tmdb_us_release_date": candidate.tmdb_us_release_date.isoformat() if candidate.tmdb_us_release_date else None,
            "first_local_screening_date": candidate.first_local_screening_date.isoformat() if candidate.first_local_screening_date else None,
            "earliest_current_screening": candidate.earliest_current_screening.isoformat() if candidate.earliest_current_screening else None,
            
            # Classification
            "provisional_status": candidate.provisional_status(),
            "is_coming_soon": candidate.is_coming_soon(),
            "confidence_explanation": candidate.confidence_explanation(),
            
            # Theater info
            "local_theater_ids": candidate.local_theater_ids,
        }
        entries.append(entry)
    
    # Evaluate different window sizes
    window_analysis = {}
    for days in [30, 60, 90]:
        cutoff = today + timedelta(days=days)
        in_window = [
            c for c in amc_candidates
            if c.is_coming_soon() and c.amc_first_booking_date and c.amc_first_booking_date <= cutoff
        ]
        window_analysis[f"{days}_days"] = len(in_window)
    
    artifact = {
        "schema_version": "0.2.0",
        "generated_at": datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds"),
        "investigation_type": "coming_soon_source_audit_v2",
        "important_notes": [
            "This audit uses AMC theater booking data (performance slots), NOT AMC catalog",
            "AMC catalog API (/v2/movies) requires credentials not available in this environment",
            "TMDB queries require credentials not available in this environment",
            "Evidence flags are INDEPENDENT - do not conflate theater bookings with catalog membership",
        ],
        "window": {
            "start_date": today.isoformat(),
            "end_date": window_end.isoformat(),
            "days": window_days,
            "current_window_end": current_window_end.isoformat(),
            "current_window_days": current_window_days,
        },
        "sources": {
            "amc_log": str(amc_log_path),
            "amc_log_date": amc_log_date,
            "amc_source_type": "theater_showtimes_api",
            "amc_catalog_accessible": False,
            "tmdb_accessible": False,
        },
        "stats": {
            "total_candidates": len(entries),
            "coming_soon_count": len(future_only),
            "currently_available_count": len(currently_available),
            "status_counts": status_counts,
            "window_analysis": window_analysis,
        },
        "entries": entries,
    }
    
    return artifact


def write_coming_soon_source_audit(
    output_path: Path = DEFAULT_OUTPUT_PATH,
    **kwargs: Any,
) -> dict[str, Any]:
    """Build and write coming soon source audit artifact."""
    
    artifact = build_coming_soon_source_audit(**kwargs)
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2, ensure_ascii=False)
        f.write("\n")
    
    print(f"\nWrote audit artifact: {output_path}")
    print(f"Total candidates: {artifact['stats']['total_candidates']}")
    print(f"Status breakdown: {json.dumps(artifact['stats']['status_counts'], indent=2)}")
    
    return artifact
