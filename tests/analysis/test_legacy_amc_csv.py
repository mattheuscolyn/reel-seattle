"""Tests for legacy AMC CSV snapshot parsing (PR B2)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reel_seattle.analysis.amc_footprint import build_footprint_rows
from reel_seattle.analysis.legacy_amc_csv import (
    load_forward_legacy_records,
    parsed_snapshot_from_legacy_csv,
)
from reel_seattle.normalize import build_theater_index
import json

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "analysis"
REGISTRY_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "theaters.json"


def test_load_forward_legacy_records_filters_past_rows():
    csv_text = (FIXTURES_DIR / "legacy_amc_cumulative.csv").read_text(encoding="utf-8")
    snapshot_date = date(2026, 6, 26)
    records = load_forward_legacy_records(csv_text, snapshot_date)
    titles = {record.title_raw for record in records}
    dates = {record.date_raw for record in records}
    assert "Past Only Film" not in titles
    assert "06/25/2026" not in dates
    assert "Fixture Film Alpha" in titles
    assert len(records) == 4


def test_sparse_legacy_schema_produces_footprint_rows():
    csv_text = (FIXTURES_DIR / "legacy_amc_cumulative.csv").read_text(encoding="utf-8")
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    snapshot = parsed_snapshot_from_legacy_csv(
        csv_text,
        snapshot_date=date(2026, 6, 26),
        source_path="legacy_amc_cumulative.csv",
    )
    rows = build_footprint_rows([snapshot], theater_index=build_theater_index(registry))
    assert len(rows) == 3
    day_one = next(row for row in rows if row["show_date"] == "2026-06-26")
    assert day_one["showtime_count"] == "2"
    assert day_one["almost_sold_out_count"] == "1"
    assert day_one["amc_movie_id"] == ""


def test_expanded_legacy_schema_handles_optional_fields():
    csv_text = (FIXTURES_DIR / "legacy_amc_expanded.csv").read_text(encoding="utf-8")
    records = load_forward_legacy_records(csv_text, date(2026, 6, 26))
    assert len(records) == 1
    assert records[0].canceled is False
    assert records[0].format_raw == "IMAX"
