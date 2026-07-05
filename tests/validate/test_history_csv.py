"""Tests for history CSV contract validation."""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from daily_processor import HISTORY_FIELDNAMES, save_csv
from scripts.validate_history_csv import validate_history_csv


def _valid_row(**overrides: str) -> dict[str, str]:
    row = {name: "" for name in HISTORY_FIELDNAMES}
    row.update(
        {
            "Date": "06/26/2026",
            "Time": "7:30PM",
            "Theater": "AMC Pacific Place 11",
            "Film": "Sinners",
            "Runtime": "137",
            "isCanceled": "false",
            "first_seen_date": "2026-06-26",
            "last_updated": "2026-06-26",
            "source": "amc",
            "theater_id": "amc-pacific-place-11",
            "showtime_film_key": "sinners",
            "time_24h": "19:30",
        }
    )
    row.update(overrides)
    return row


def test_validate_history_csv_passes_valid_file(tmp_path: Path):
    path = tmp_path / "showtimes_history.csv"
    save_csv(str(path), [_valid_row()], fieldnames=HISTORY_FIELDNAMES)

    errors, row_count = validate_history_csv(path)

    assert errors == []
    assert row_count == 1


def test_validate_history_csv_detects_header_mismatch(tmp_path: Path):
    path = tmp_path / "showtimes_history.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Date", "Time", "Theater"])
        writer.writerow(["06/26/2026", "7:30PM", "AMC Pacific Place 11"])

    errors, row_count = validate_history_csv(path)

    assert row_count == 0
    assert len(errors) == 1
    assert "header does not match HISTORY_FIELDNAMES" in errors[0]


def test_validate_history_csv_detects_null_sentinel(tmp_path: Path):
    path = tmp_path / "showtimes_history.csv"
    save_csv(
        str(path),
        [_valid_row(posterDynamic="None")],
        fieldnames=HISTORY_FIELDNAMES,
    )

    errors, row_count = validate_history_csv(path)

    assert row_count == 1
    assert any("posterDynamic" in message for message in errors)


def test_validate_history_csv_detects_unparseable_date(tmp_path: Path):
    path = tmp_path / "showtimes_history.csv"
    save_csv(
        str(path),
        [_valid_row(Date="not-a-date")],
        fieldnames=HISTORY_FIELDNAMES,
    )

    errors, _row_count = validate_history_csv(path, strict=True)

    assert any("Date" in message and "parseable" in message for message in errors)


def test_validate_history_csv_strict_detects_blank_theater(tmp_path: Path):
    path = tmp_path / "showtimes_history.csv"
    save_csv(
        str(path),
        [_valid_row(Theater="")],
        fieldnames=HISTORY_FIELDNAMES,
    )

    errors, _row_count = validate_history_csv(path, strict=True)

    assert any("Theater" in message for message in errors)


@pytest.mark.skipif(
    not Path("data/history/showtimes_history.csv").is_file(),
    reason="canonical history CSV not present",
)
def test_validate_history_csv_passes_repo_history():
    errors, row_count = validate_history_csv()

    assert errors == []
    assert row_count > 0
