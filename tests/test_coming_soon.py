"""Tests for Coming Soon data pipeline."""

import json
from datetime import date, timedelta
from pathlib import Path

from reel_seattle.emit.coming_soon import (
    ComingSoonCandidate,
    EVIDENCE_AMC_COMING_SOON,
    EVIDENCE_REEL_SEATTLE_SCHEDULED,
    STATUS_CONFIRMED_LOCAL,
    STATUS_AMC_ANNOUNCED,
    extract_amc_coming_soon_candidates,
    extract_reel_seattle_future_screenings,
    merge_candidates,
)


def test_coming_soon_candidate_status():
    """Test candidate status classification."""
    
    # AMC announced only
    candidate = ComingSoonCandidate(
        canonical_film_id=None,
        title="Test Movie",
        tmdb_id=None,
        amc_movie_id="12345",
        expected_release_date=date(2026, 10, 1),
        expected_release_date_source="amc",
        first_local_screening_date=None,
        local_theater_ids=[],
    )
    candidate.evidence.add(EVIDENCE_AMC_COMING_SOON)
    
    assert candidate.provisional_status() == STATUS_AMC_ANNOUNCED
    assert "AMC announced" in candidate.confidence_explanation()
    
    # Confirmed local
    candidate.evidence.add(EVIDENCE_REEL_SEATTLE_SCHEDULED)
    candidate.first_local_screening_date = date(2026, 10, 1)
    candidate.local_theater_ids = ["amc-seattle-10"]
    
    assert candidate.provisional_status() == STATUS_CONFIRMED_LOCAL
    assert "Confirmed Seattle screening" in candidate.confidence_explanation()


def test_extract_amc_coming_soon_from_real_log():
    """Test extraction using real AMC log."""
    
    # Use most recent AMC log
    logs_dir = Path("data/daily_logs")
    amc_logs = sorted(logs_dir.glob("*_amc.json"))
    if not amc_logs:
        # Skip if no logs available
        return
    
    amc_log_path = amc_logs[-1]
    today = date(2026, 9, 15)
    window_end = today + timedelta(days=90)
    current_window_start = today - timedelta(days=2)
    
    candidates = extract_amc_coming_soon_candidates(
        amc_scrape_log_path=amc_log_path,
        today_date=today,
        window_end=window_end,
        current_window_start=current_window_start,
    )
    
    assert len(candidates) > 0, "Should find some coming soon movies"
    
    for candidate in candidates:
        assert candidate.amc_movie_id is not None
        assert candidate.title
        assert candidate.expected_release_date is not None
        assert EVIDENCE_AMC_COMING_SOON in candidate.evidence
        assert candidate.parent_film_key is not None


def test_merge_candidates_with_reel_seattle():
    """Test merging AMC candidates with Reel Seattle future screenings."""
    
    amc_candidates = [
        ComingSoonCandidate(
            canonical_film_id=None,
            title="Test Movie A",
            tmdb_id=None,
            amc_movie_id="111",
            expected_release_date=date(2026, 10, 1),
            expected_release_date_source="amc",
            first_local_screening_date=None,
            local_theater_ids=[],
            parent_film_key="test-movie-a",
        ),
        ComingSoonCandidate(
            canonical_film_id=None,
            title="Test Movie B",
            tmdb_id=None,
            amc_movie_id="222",
            expected_release_date=date(2026, 10, 15),
            expected_release_date_source="amc",
            first_local_screening_date=None,
            local_theater_ids=[],
            parent_film_key="test-movie-b",
        ),
    ]
    
    for c in amc_candidates:
        c.evidence.add(EVIDENCE_AMC_COMING_SOON)
    
    # Simulate Reel Seattle having future screenings for Movie A
    reel_seattle_future = {
        "test-movie-a-key": {
            "title": "Test Movie A",
            "film_id": "tmdb:12345",
            "parent_film_key": "test-movie-a",
            "earliest_date": date(2026, 10, 1),
            "theaters": {"amc-seattle-10"},
            "source_film_ids": {"111"},
        }
    }
    
    merged = merge_candidates(amc_candidates, reel_seattle_future)
    
    assert len(merged) == 2
    
    # Find Movie A
    movie_a = next((c for c in merged if c.amc_movie_id == "111"), None)
    assert movie_a is not None
    assert EVIDENCE_REEL_SEATTLE_SCHEDULED in movie_a.evidence
    assert movie_a.canonical_film_id == "tmdb:12345"
    assert movie_a.first_local_screening_date == date(2026, 10, 1)
    
    # Movie B should not have Reel Seattle evidence
    movie_b = next((c for c in merged if c.amc_movie_id == "222"), None)
    assert movie_b is not None
    assert EVIDENCE_REEL_SEATTLE_SCHEDULED not in movie_b.evidence


def test_audit_artifact_structure():
    """Test that generated audit artifact has expected structure."""
    
    audit_path = Path("data/audits/coming_soon_source_audit.json")
    if not audit_path.exists():
        # Skip if audit hasn't been generated yet
        return
    
    with audit_path.open() as f:
        artifact = json.load(f)
    
    # Check required top-level fields
    assert "schema_version" in artifact
    assert "generated_at" in artifact
    assert "window" in artifact
    assert "sources" in artifact
    assert "stats" in artifact
    assert "entries" in artifact
    
    # Check window structure
    window = artifact["window"]
    assert "start_date" in window
    assert "end_date" in window
    assert "days" in window
    
    # Check stats
    stats = artifact["stats"]
    assert "total_candidates" in stats
    assert "status_counts" in stats
    
    # Check entries
    entries = artifact["entries"]
    assert isinstance(entries, list)
    
    if entries:
        entry = entries[0]
        assert "title" in entry
        assert "expected_release_date" in entry
        assert "evidence" in entry
        assert "provisional_status" in entry
        assert "confidence_explanation" in entry
