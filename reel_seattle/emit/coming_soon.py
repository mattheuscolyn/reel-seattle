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
EVIDENCE_AMC_COMING_SOON = "amc_coming_soon"
EVIDENCE_TMDB_US_THEATRICAL = "tmdb_us_theatrical"
EVIDENCE_REEL_SEATTLE_SCHEDULED = "reel_seattle_scheduled"

STATUS_CONFIRMED_LOCAL = "confirmed_local"
STATUS_AMC_ANNOUNCED = "amc_announced"
STATUS_TMDB_UPCOMING = "tmdb_upcoming"

DEFAULT_OUTPUT_PATH = Path("data/audits/coming_soon_source_audit.json")


@dataclass
class ComingSoonCandidate:
    """One coming soon movie candidate from any source."""
    
    canonical_film_id: str | None
    title: str
    tmdb_id: int | None
    amc_movie_id: str | None
    expected_release_date: date | None
    expected_release_date_source: str | None
    first_local_screening_date: date | None
    local_theater_ids: list[str]
    evidence: set[str] = field(default_factory=set)
    amc_first_announced_date: date | None = None
    tmdb_release_date: date | None = None
    reel_seattle_earliest_date: date | None = None
    parent_film_key: str | None = None
    showtime_film_key: str | None = None
    
    def provisional_status(self) -> str:
        """Classify movie by evidence strength."""
        if EVIDENCE_REEL_SEATTLE_SCHEDULED in self.evidence and self.first_local_screening_date:
            return STATUS_CONFIRMED_LOCAL
        if EVIDENCE_AMC_COMING_SOON in self.evidence:
            return STATUS_AMC_ANNOUNCED
        if EVIDENCE_TMDB_US_THEATRICAL in self.evidence:
            return STATUS_TMDB_UPCOMING
        return "unknown"
    
    def confidence_explanation(self) -> str:
        """Human-readable confidence reasoning."""
        status = self.provisional_status()
        if status == STATUS_CONFIRMED_LOCAL:
            return f"Confirmed Seattle screening on {self.first_local_screening_date}"
        if status == STATUS_AMC_ANNOUNCED:
            return f"AMC announced, first screening {self.amc_first_announced_date or 'TBD'}"
        if status == STATUS_TMDB_UPCOMING:
            return f"TMDB US theatrical release {self.tmdb_release_date or 'TBD'}"
        return "Insufficient evidence"


def pacific_today(now: datetime | None = None) -> date:
    """Return today's calendar date in America/Los_Angeles."""
    if now is None:
        return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    if now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    return now.astimezone(ZoneInfo(DEFAULT_TIMEZONE)).date()


def extract_amc_coming_soon_candidates(
    *,
    amc_scrape_log_path: Path,
    today_date: date,
    window_end: date,
    current_window_start: date,
) -> list[ComingSoonCandidate]:
    """Extract movies from AMC with future announced screenings but no current screenings.
    
    AMC Coming Soon evidence: movies with first screening >= today + N days.
    This indicates AMC has announced the movie but it's not yet playing.
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
                "dates": [],
                "theaters": set(),
            }
        
        movies_by_id[movie_id]["dates"].append(show_date)
        movies_by_id[movie_id]["theaters"].add(record.theater_name_raw)
    
    # Filter for "coming soon" - movies with NO screenings in current window
    # but WITH screenings in the coming soon window
    candidates = []
    
    for movie_id, info in movies_by_id.items():
        dates = sorted(info["dates"])
        first_date = dates[0]
        
        # Check if ANY screening is in the current playing window
        has_current_screening = any(d < today_date + timedelta(days=7) for d in dates)
        
        # Coming Soon: first screening is sufficiently far out OR no current screenings
        is_coming_soon = first_date >= today_date + timedelta(days=7) or not has_current_screening
        
        if is_coming_soon:
            identity = derive_parent_identity(
                info["title"],
                source_film_id=movie_id,
            )
            
            candidate = ComingSoonCandidate(
                canonical_film_id=None,  # Will be resolved later
                title=info["title"],
                tmdb_id=None,
                amc_movie_id=movie_id,
                expected_release_date=first_date,
                expected_release_date_source="amc_first_announced_screening",
                first_local_screening_date=first_date if first_date >= today_date else None,
                local_theater_ids=[],  # TODO: map theater names to IDs
                amc_first_announced_date=first_date,
                parent_film_key=identity.parent_film_key,
                showtime_film_key=None,
            )
            candidate.evidence.add(EVIDENCE_AMC_COMING_SOON)
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
) -> dict[str, Any]:
    """Build coming soon source audit artifact."""
    
    today = today_date or pacific_today()
    window_end = today + timedelta(days=window_days)
    current_window_start = today - timedelta(days=2)  # Current window for "now playing"
    
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
    
    # Extract candidates
    amc_candidates = extract_amc_coming_soon_candidates(
        amc_scrape_log_path=amc_log_path,
        today_date=today,
        window_end=window_end,
        current_window_start=current_window_start,
    )
    
    print(f"AMC coming soon candidates: {len(amc_candidates)}")
    
    # Load Reel Seattle future screenings
    reel_seattle_future = {}
    if showtimes_current_path.exists():
        with showtimes_current_path.open(encoding="utf-8") as f:
            showtimes_current = json.load(f)
        reel_seattle_future = extract_reel_seattle_future_screenings(
            showtimes_current=showtimes_current,
            today_date=today,
        )
        print(f"Reel Seattle future films: {len(reel_seattle_future)}")
    
    # Merge all sources
    merged = merge_candidates(
        amc_candidates=amc_candidates,
        reel_seattle_future=reel_seattle_future,
    )
    
    # Classify by provisional status
    status_counts = {}
    for candidate in merged:
        status = candidate.provisional_status()
        status_counts[status] = status_counts.get(status, 0) + 1
    
    # Build artifact entries
    entries = []
    for candidate in sorted(merged, key=lambda c: (c.expected_release_date or date.max, c.title)):
        entries.append({
            "canonical_film_id": candidate.canonical_film_id,
            "title": candidate.title,
            "tmdb_id": candidate.tmdb_id,
            "amc_movie_id": candidate.amc_movie_id,
            "parent_film_key": candidate.parent_film_key,
            "expected_release_date": candidate.expected_release_date.isoformat() if candidate.expected_release_date else None,
            "expected_release_date_source": candidate.expected_release_date_source,
            "first_local_screening_date": candidate.first_local_screening_date.isoformat() if candidate.first_local_screening_date else None,
            "local_theater_ids": candidate.local_theater_ids,
            "evidence": sorted(candidate.evidence),
            "provisional_status": candidate.provisional_status(),
            "confidence_explanation": candidate.confidence_explanation(),
        })
    
    artifact = {
        "schema_version": "0.1.0",
        "generated_at": datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds"),
        "investigation_type": "coming_soon_source_audit",
        "window": {
            "start_date": today.isoformat(),
            "end_date": window_end.isoformat(),
            "days": window_days,
        },
        "sources": {
            "amc_log": str(amc_log_path),
            "amc_log_date": amc_log_date,
            "reel_seattle_showtimes": str(showtimes_current_path) if showtimes_current_path.exists() else None,
        },
        "stats": {
            "total_candidates": len(entries),
            "amc_only_count": sum(1 for e in entries if e["evidence"] == [EVIDENCE_AMC_COMING_SOON]),
            "confirmed_local_count": status_counts.get(STATUS_CONFIRMED_LOCAL, 0),
            "amc_announced_count": status_counts.get(STATUS_AMC_ANNOUNCED, 0),
            "tmdb_upcoming_count": status_counts.get(STATUS_TMDB_UPCOMING, 0),
            "status_counts": status_counts,
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
