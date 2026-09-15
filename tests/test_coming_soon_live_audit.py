"""Tests for the credentialed live Coming Soon audit."""

from __future__ import annotations

import json
from datetime import date, timedelta

import pytest

from reel_seattle.emit.coming_soon_live import (
    EVIDENCE_AMC_COMING_SOON_CATALOG,
    EVIDENCE_AMC_THEATER_BOOKING,
    EVIDENCE_REEL_SEATTLE_SCHEDULED,
    EVIDENCE_TMDB_US_THEATRICAL,
    STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES,
    STATUS_CONFIRMED_LOCAL_FUTURE,
    STATUS_CURRENTLY_AVAILABLE,
    STATUS_TMDB_ONLY_UPCOMING,
    ComingSoonEntry,
    bucket_counts,
    build_entries,
    build_live_audit,
    evidence_totals,
    horizon_counts,
    load_reel_seattle_scheduled,
    match_key,
)
from reel_seattle.live_audit_security import (
    assert_no_secret_leakage,
    credential_presence,
    scrub_secrets,
    scrub_text,
)

TODAY = date(2026, 9, 15)
CURRENT_WINDOW_END = TODAY + timedelta(days=7)


def test_scrub_text_redacts_credential_values():
    env = {"AMC_API_KEY": "amc-vendor-key-abcdef123456"}
    text = "request failed for key amc-vendor-key-abcdef123456"

    scrubbed = scrub_text(text, env)

    assert "amc-vendor-key-abcdef123456" not in scrubbed
    assert "[redacted]" in scrubbed


def test_scrub_text_ignores_short_env_values():
    env = {"TMDB_API_KEY": "abc"}

    assert scrub_text("abc is a title word", env) == "abc is a title word"


def test_scrub_secrets_redacts_sensitive_headers_and_query_params():
    env = {"TMDB_READ_ACCESS_TOKEN": "tmdb-token-abcdef123456"}
    payload = {
        "headers": {"Authorization": "Bearer tmdb-token-abcdef123456", "X-AMC-Vendor-Key": "secret-value"},
        "url": "https://api.themoviedb.org/3/discover/movie?api_key=tmdb-token-abcdef123456&page=1",
        "titles": ["Dune: Part Three"],
    }

    scrubbed = scrub_secrets(payload, env)

    assert scrubbed["headers"]["Authorization"] == "[redacted]"
    assert scrubbed["headers"]["X-AMC-Vendor-Key"] == "[redacted]"
    assert "tmdb-token-abcdef123456" not in json.dumps(scrubbed)
    assert "api_key=[redacted]" in scrubbed["url"]
    assert scrubbed["titles"] == ["Dune: Part Three"]
    assert_no_secret_leakage(scrubbed, env)


def test_assert_no_secret_leakage_rejects_raw_credentials():
    env = {"AMC_API_KEY": "amc-vendor-key-abcdef123456"}

    with pytest.raises(ValueError):
        assert_no_secret_leakage({"note": "amc-vendor-key-abcdef123456"}, env)


def test_credential_presence_reports_booleans_only():
    presence = credential_presence({"AMC_API_KEY": "x" * 20, "TMDB_API_KEY": ""})

    assert presence == {
        "amc_api_key_present": True,
        "tmdb_read_access_token_present": False,
        "tmdb_api_key_present": False,
    }


def test_status_buckets_cover_each_evidence_combination():
    currently_available = ComingSoonEntry(
        match_key="now-playing-film",
        title="Now Playing Film",
        amc_theater_booking=True,
        amc_first_booking_date=TODAY + timedelta(days=1),
    )
    local_future = ComingSoonEntry(
        match_key="local-future-film",
        title="Local Future Film",
        amc_theater_booking=True,
        amc_first_booking_date=TODAY + timedelta(days=20),
    )
    amc_announced = ComingSoonEntry(
        match_key="announced-film",
        title="Announced Film",
        amc_coming_soon_catalog=True,
        amc_catalog_release_date=TODAY + timedelta(days=45),
    )
    tmdb_only = ComingSoonEntry(
        match_key="tmdb-only-film",
        title="TMDB Only Film",
        tmdb_us_theatrical=True,
        tmdb_us_release_date=TODAY + timedelta(days=80),
    )

    assert currently_available.status(current_window_end=CURRENT_WINDOW_END) == STATUS_CURRENTLY_AVAILABLE
    assert local_future.status(current_window_end=CURRENT_WINDOW_END) == STATUS_CONFIRMED_LOCAL_FUTURE
    assert (
        amc_announced.status(current_window_end=CURRENT_WINDOW_END)
        == STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES
    )
    assert tmdb_only.status(current_window_end=CURRENT_WINDOW_END) == STATUS_TMDB_ONLY_UPCOMING

    counts = bucket_counts(
        [currently_available, local_future, amc_announced, tmdb_only],
        current_window_end=CURRENT_WINDOW_END,
    )
    assert counts[STATUS_CURRENTLY_AVAILABLE] == 1
    assert counts[STATUS_CONFIRMED_LOCAL_FUTURE] == 1
    assert counts[STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES] == 1
    assert counts[STATUS_TMDB_ONLY_UPCOMING] == 1


def test_catalog_evidence_is_not_theater_booking_evidence():
    entry = ComingSoonEntry(
        match_key="announced-film",
        title="Announced Film",
        amc_coming_soon_catalog=True,
        amc_catalog_release_date=TODAY + timedelta(days=45),
    )

    evidence = entry.evidence()

    assert evidence[EVIDENCE_AMC_COMING_SOON_CATALOG] is True
    assert evidence[EVIDENCE_AMC_THEATER_BOOKING] is False
    assert evidence[EVIDENCE_REEL_SEATTLE_SCHEDULED] is False
    assert entry.first_local_date() is None


def test_horizon_counts_respect_announcement_dates():
    entries = [
        ComingSoonEntry(
            match_key="soon",
            title="Soon",
            amc_coming_soon_catalog=True,
            amc_catalog_release_date=TODAY + timedelta(days=10),
        ),
        ComingSoonEntry(
            match_key="mid",
            title="Mid",
            amc_coming_soon_catalog=True,
            amc_catalog_release_date=TODAY + timedelta(days=45),
        ),
        ComingSoonEntry(
            match_key="late",
            title="Late",
            tmdb_us_theatrical=True,
            tmdb_us_release_date=TODAY + timedelta(days=85),
        ),
    ]

    horizons = horizon_counts(entries, today=TODAY, current_window_end=CURRENT_WINDOW_END)

    assert horizons["30_days"]["total_in_horizon"] == 1
    assert horizons["60_days"]["total_in_horizon"] == 2
    assert horizons["90_days"]["total_in_horizon"] == 3
    assert horizons["90_days"][STATUS_TMDB_ONLY_UPCOMING] == 1


def test_build_entries_merges_sources_without_conflating_evidence():
    entries = build_entries(
        amc_catalog_movies=[
            {"amc_movie_id": "79853", "name": "Verity", "release_date": "2026-11-20"},
            {"amc_movie_id": "70533", "name": "Avengers: Doomsday", "release_date": "2026-12-18"},
        ],
        amc_bookings={
            "verity": {
                "title": "Verity",
                "amc_movie_ids": {"79853"},
                "first_date": TODAY + timedelta(days=60),
                "theaters": {"AMC Pacific Place 11"},
            }
        },
        tmdb_candidates=[
            {"tmdb_id": 111, "title": "Verity", "release_date": "2026-11-20"},
            {"tmdb_id": 222, "title": "Some Indie Film", "release_date": "2026-10-02"},
        ],
        reel_seattle_scheduled={},
    )

    by_key = {entry.match_key: entry for entry in entries}

    verity = by_key["verity"]
    assert verity.evidence() == {
        EVIDENCE_AMC_COMING_SOON_CATALOG: True,
        EVIDENCE_AMC_THEATER_BOOKING: True,
        EVIDENCE_TMDB_US_THEATRICAL: True,
        EVIDENCE_REEL_SEATTLE_SCHEDULED: False,
    }
    assert verity.amc_movie_id == "79853"
    assert verity.tmdb_id == 111

    doomsday = by_key["avengers-doomsday"]
    assert doomsday.evidence()[EVIDENCE_AMC_COMING_SOON_CATALOG] is True
    assert doomsday.evidence()[EVIDENCE_AMC_THEATER_BOOKING] is False

    indie = by_key["some-indie-film"]
    assert indie.evidence()[EVIDENCE_TMDB_US_THEATRICAL] is True
    assert indie.status(current_window_end=CURRENT_WINDOW_END) == STATUS_TMDB_ONLY_UPCOMING

    assert evidence_totals(entries)[EVIDENCE_AMC_COMING_SOON_CATALOG] == 2


def test_load_reel_seattle_scheduled_reads_published_date_field(tmp_path):
    showtimes = tmp_path / "showtimes_current.json"
    showtimes.write_text(
        json.dumps(
            {
                "showtimes": [
                    {
                        "date": (TODAY + timedelta(days=2)).isoformat(),
                        "parent_display_title": "Now Playing Film",
                        "parent_film_key": "now-playing-film",
                        "theater_id": "amc-pacific-place-11",
                        "source_film_id": "555",
                    },
                    {
                        "date": (TODAY - timedelta(days=3)).isoformat(),
                        "parent_display_title": "Old Film",
                        "parent_film_key": "old-film",
                        "theater_id": "amc-factoria-8",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    scheduled = load_reel_seattle_scheduled(showtimes, today=TODAY)

    assert set(scheduled) == {"now-playing-film"}
    assert scheduled["now-playing-film"]["first_date"] == TODAY + timedelta(days=2)


def test_build_live_audit_shape_with_missing_local_inputs(tmp_path):
    audit = build_live_audit(
        amc_investigation={
            "catalog": {
                "accessible": True,
                "selected_endpoint": "/movies/views/coming-soon",
                "movies": [{"amc_movie_id": "1", "name": "Announced Film", "release_date": "2026-11-01"}],
            },
            "credentials": {"auth_probe": {"authenticated": True}},
        },
        tmdb_investigation={
            "query": {"executed": True, "endpoint": "/discover/movie"},
            "candidates": [{"tmdb_id": 9, "title": "TMDB Only Film", "release_date": "2026-10-15"}],
        },
        amc_log_path=tmp_path / "missing_amc.json",
        showtimes_current_path=tmp_path / "missing_showtimes.json",
        today=TODAY,
    )

    assert audit["counts"]["total_entries"] == 2
    assert audit["counts"][STATUS_AMC_ANNOUNCED_WITHOUT_LOCAL_SHOWTIMES] == 1
    assert audit["counts"][STATUS_TMDB_ONLY_UPCOMING] == 1
    assert set(audit["horizons"]) == {"30_days", "60_days", "90_days"}
    assert audit["sources"]["amc_coming_soon_catalog"]["accessible"] is True
    assert audit["sources"]["tmdb_us_theatrical"]["accessible"] is True
    for entry in audit["entries"]:
        assert set(entry["evidence"]) == {
            EVIDENCE_AMC_COMING_SOON_CATALOG,
            EVIDENCE_AMC_THEATER_BOOKING,
            EVIDENCE_TMDB_US_THEATRICAL,
            EVIDENCE_REEL_SEATTLE_SCHEDULED,
        }


def test_match_key_normalizes_format_variants():
    assert match_key("Dune: Part Three") == match_key("DUNE: PART THREE")
    assert match_key("Wicked: For Good 3D") == match_key("Wicked: For Good")
