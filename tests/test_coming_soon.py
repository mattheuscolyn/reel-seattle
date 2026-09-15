"""Tests for Coming Soon data pipeline (V2 with corrected evidence model)."""

import json
from datetime import date, timedelta
from pathlib import Path

from reel_seattle.emit.coming_soon import (
    ComingSoonCandidate,
    STATUS_CONFIRMED_LOCAL_FUTURE,
    STATUS_CURRENTLY_AVAILABLE,
    extract_amc_theater_bookings,
)


def test_coming_soon_candidate_status():
    """Test candidate status classification with V2 schema."""
    
    # AMC theater booking, future only
    candidate = ComingSoonCandidate(
        canonical_film_id=None,
        title="Test Movie",
        tmdb_id=None,
        amc_movie_id="12345",
        parent_film_key="test-movie",
        showtime_film_key="test-movie",
        amc_theater_booking=True,
        reel_seattle_future=True,
        reel_seattle_current=False,
        amc_first_booking_date=date(2026, 10, 1),
        first_local_screening_date=date(2026, 10, 1),
        local_theater_ids=["amc-pacific-place-11"],
    )
    
    assert candidate.provisional_status() == STATUS_CONFIRMED_LOCAL_FUTURE
    assert "future Seattle screening" in candidate.confidence_explanation()
    assert candidate.is_coming_soon() is True
    
    # Currently available (should NOT be coming soon)
    candidate.reel_seattle_current = True
    candidate.earliest_current_screening = date(2026, 9, 15)
    
    assert candidate.provisional_status() == STATUS_CURRENTLY_AVAILABLE
    assert "Currently available" in candidate.confidence_explanation()
    assert candidate.is_coming_soon() is False


def test_extract_amc_theater_bookings_from_real_log():
    """Test extraction using real AMC log with V2 schema."""
    
    # Use most recent AMC log
    logs_dir = Path("data/daily_logs")
    amc_logs = sorted(logs_dir.glob("*_amc.json"))
    if not amc_logs:
        # Skip if no logs available
        return
    
    amc_log_path = amc_logs[-1]
    today = date(2026, 9, 15)
    window_end = today + timedelta(days=90)
    current_window_end = today + timedelta(days=7)
    
    candidates = extract_amc_theater_bookings(
        amc_scrape_log_path=amc_log_path,
        today_date=today,
        window_end=window_end,
        current_window_end=current_window_end,
    )
    
    assert len(candidates) > 0, "Should find some AMC theater bookings"
    
    for candidate in candidates:
        assert candidate.amc_movie_id is not None
        assert candidate.title
        assert candidate.amc_theater_booking is True
        assert candidate.amc_first_booking_date is not None
        assert candidate.parent_film_key is not None
        
        # Should be classified as either current or future
        status = candidate.provisional_status()
        assert status in (STATUS_CURRENTLY_AVAILABLE, STATUS_CONFIRMED_LOCAL_FUTURE)


def test_current_vs_future_classification():
    """Test current vs future classification."""
    
    # Future only - should be coming soon
    future_only = ComingSoonCandidate(
        canonical_film_id=None,
        title="Future Movie",
        tmdb_id=None,
        amc_movie_id="111",
        parent_film_key="future-movie",
        showtime_film_key="future-movie",
        amc_theater_booking=True,
        reel_seattle_future=True,
        reel_seattle_current=False,
        amc_first_booking_date=date(2026, 10, 1),
        first_local_screening_date=date(2026, 10, 1),
        local_theater_ids=["amc-pacific-place-11"],
    )
    
    assert future_only.is_coming_soon() is True
    assert future_only.provisional_status() == STATUS_CONFIRMED_LOCAL_FUTURE
    
    # Current - should NOT be coming soon
    current_movie = ComingSoonCandidate(
        canonical_film_id=None,
        title="Current Movie",
        tmdb_id=None,
        amc_movie_id="222",
        parent_film_key="current-movie",
        showtime_film_key="current-movie",
        amc_theater_booking=True,
        reel_seattle_future=True,
        reel_seattle_current=True,
        amc_first_booking_date=date(2026, 9, 15),
        earliest_current_screening=date(2026, 9, 15),
        first_local_screening_date=date(2026, 9, 20),
        local_theater_ids=["amc-pacific-place-11"],
    )
    
    assert current_movie.is_coming_soon() is False
    assert current_movie.provisional_status() == STATUS_CURRENTLY_AVAILABLE


def test_audit_artifact_v2_structure():
    """Test that generated V2 audit artifact has expected structure."""
    
    audit_path = Path("data/audits/coming_soon_source_audit_v2.json")
    if not audit_path.exists():
        # Skip if audit hasn't been generated yet
        return
    
    with audit_path.open() as f:
        artifact = json.load(f)
    
    # Check required top-level fields
    assert "schema_version" in artifact
    assert artifact["schema_version"] == "0.2.0"
    assert "generated_at" in artifact
    assert "window" in artifact
    assert "sources" in artifact
    assert "stats" in artifact
    assert "entries" in artifact
    assert "important_notes" in artifact
    
    # Check window structure
    window = artifact["window"]
    assert "start_date" in window
    assert "end_date" in window
    assert "days" in window
    assert "current_window_end" in window
    assert "current_window_days" in window
    
    # Check stats
    stats = artifact["stats"]
    assert "total_candidates" in stats
    assert "coming_soon_count" in stats
    assert "currently_available_count" in stats
    assert "status_counts" in stats
    assert "window_analysis" in stats
    
    # Check entries
    entries = artifact["entries"]
    assert isinstance(entries, list)
    
    if entries:
        entry = entries[0]
        assert "title" in entry
        assert "evidence" in entry
        assert isinstance(entry["evidence"], dict)
        assert "amc_theater_booking" in entry["evidence"]
        assert "provisional_status" in entry
        assert "is_coming_soon" in entry
        assert "confidence_explanation" in entry
