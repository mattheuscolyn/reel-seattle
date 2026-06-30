"""Tests for Git-history AMC snapshot discovery (PR B2)."""

from __future__ import annotations

from datetime import date

from reel_seattle.analysis.git_amc_snapshots import (
    SOURCE_FORMAT_ARCHIVE,
    SOURCE_FORMAT_DAILY_CSV,
    SOURCE_FORMAT_JSON,
    filter_snapshot_sources,
    merge_snapshot_sources,
    missing_snapshot_dates,
)


def test_merge_snapshot_sources_prefers_archive_over_daily_and_json():
    archive = {
        "2026-06-15": ("aaa1111", "public/data/daily_logs/2026-06-15_amc_showtimes.csv"),
        "2026-06-29": ("bbb2222", "public/data/daily_logs/2026-06-29_amc_showtimes.csv"),
    }
    daily = {
        "2026-06-15": "ccc3333",
        "2026-06-29": "ddd4444",
    }
    json_logs = {
        "2026-06-29": "eee5555",
        "2026-07-01": "fff6666",
    }
    sources = merge_snapshot_sources(archive, daily, json_logs)
    by_date = {src.snapshot_date.isoformat(): src for src in sources}
    assert by_date["2026-06-15"].source_format == SOURCE_FORMAT_ARCHIVE
    assert by_date["2026-06-15"].commit == "aaa1111"
    assert by_date["2026-06-29"].source_format == SOURCE_FORMAT_ARCHIVE
    assert by_date["2026-07-01"].source_format == SOURCE_FORMAT_JSON
    assert len(sources) == 3


def test_merge_snapshot_sources_uses_daily_csv_when_archive_missing():
    sources = merge_snapshot_sources(
        {},
        {"2026-05-23": "commit123"},
        {},
    )
    assert len(sources) == 1
    assert sources[0].source_format == SOURCE_FORMAT_DAILY_CSV
    assert sources[0].git_path == "public/showtimes.csv"


def test_missing_snapshot_dates_reports_gaps():
    sources = merge_snapshot_sources(
        {
            "2026-06-01": ("a", "public/data/daily_logs/2026-06-01_amc_showtimes.csv"),
            "2026-06-03": ("b", "public/data/daily_logs/2026-06-03_amc_showtimes.csv"),
        },
        {},
        {},
    )
    missing = missing_snapshot_dates(sources)
    assert missing == [date(2026, 6, 2)]


def test_filter_snapshot_sources_applies_bounds_sampling_and_limit():
    sources = merge_snapshot_sources(
        {f"2026-06-{day:02d}": (f"c{day}", f"path/{day}.csv") for day in range(1, 8)},
        {},
        {},
    )
    filtered = filter_snapshot_sources(
        sources,
        start_date=date(2026, 6, 2),
        end_date=date(2026, 6, 6),
        every_n=2,
        limit=2,
    )
    assert [src.snapshot_date.isoformat() for src in filtered] == ["2026-06-02", "2026-06-04"]
