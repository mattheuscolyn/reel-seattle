"""Tests for AMC metadata extraction (PR D5)."""

from __future__ import annotations

import json
from pathlib import Path

from reel_seattle.adapters.amc import api_showtime_to_raw
from reel_seattle.analysis.amc_footprint import _amc_movie_id_from_record
from reel_seattle.analysis.amc_metadata_audit import (
    extract_showtime_metadata,
    metadata_audit_summary,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"


def test_extract_showtime_metadata_from_full_fixture():
    payload = json.loads((FIXTURES_DIR / "amc_api_showtime_full.json").read_text(encoding="utf-8"))
    metadata = extract_showtime_metadata(payload)
    assert metadata["movie_id"] == "movie-abc123"
    assert metadata["genre"] == "Action"
    assert metadata["mpaa_rating"] == "PG-13"
    assert metadata["sell_until_utc"] == "2026-06-28T23:59:00Z"


def test_api_showtime_to_raw_persists_metadata_attributes():
    payload = json.loads((FIXTURES_DIR / "amc_api_showtime_full.json").read_text(encoding="utf-8"))
    raw = api_showtime_to_raw(payload, "AMC Pacific Place 11")
    assert raw.attributes is not None
    assert raw.attributes["movie_id"] == "movie-abc123"
    assert raw.attributes["genre"] == "Action"
    assert _amc_movie_id_from_record(raw) == "movie-abc123"


def test_legacy_minimal_fixture_has_no_metadata_attributes():
    payload = json.loads((FIXTURES_DIR / "amc_api_showtime.json").read_text(encoding="utf-8"))
    raw = api_showtime_to_raw(payload, "AMC Pacific Place 11")
    assert _amc_movie_id_from_record(raw) == ""
    assert extract_showtime_metadata(payload) == {}


def test_metadata_audit_summary_lists_high_value_gaps():
    summary = metadata_audit_summary()
    assert "movieId" in summary["high_value_not_historical"]
    assert summary["implemented_in_pr_d5"]
