"""Tests for AMC forward-window restate safety in daily_processor."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta

import pytest

from daily_processor import (
    HISTORY_FIELDNAMES,
    count_future_amc_history_rows,
    normalize_history_row,
    process_amc_csv_data,
    save_csv,
)
from reel_seattle.history_keys import load_theater_index

@pytest.fixture
def theater_index():
    return load_theater_index()


def _fmt(d) -> str:
    return f"{d.month:02d}/{d.day:02d}/{d.year}"


def _amc_row(show_date, film: str, *, time: str = "7:00PM") -> dict:
    return normalize_history_row(
        {
            "Date": _fmt(show_date),
            "Time": time,
            "Theater": "AMC Pacific Place 11",
            "Film": film,
            "Runtime": "120",
            "source": "amc",
        }
    )


@pytest.fixture
def today():
    return datetime.now().date()


@pytest.fixture
def future_date(today):
    return today + timedelta(days=7)


@pytest.fixture
def past_date(today):
    return today - timedelta(days=30)


def _write_scrape_csv(path, rows):
    save_csv(path, rows, fieldnames=HISTORY_FIELDNAMES)


def test_stale_scrape_preserves_existing_future_amc_rows(
    tmp_path, today, future_date, past_date, capsys, theater_index
):
    history = [
        _amc_row(past_date, "Past Film"),
        _amc_row(future_date, "Future Film"),
    ]
    history_before = copy.deepcopy(history)

    scrape_path = tmp_path / "showtimes.csv"
    _write_scrape_csv(scrape_path, [_amc_row(past_date, "Stale Only")])

    announcements = []
    process_amc_csv_data(
        str(scrape_path), history, announcements, "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert count_future_amc_history_rows(history, today) == 1
    assert any(row["Film"] == "Future Film" for row in history)
    assert any(row["Film"] == "Past Film" for row in history)
    assert history == history_before

    captured = capsys.readouterr().out
    assert "ERROR: AMC restate skipped" in captured
    assert "0 future rows" in captured


def test_valid_scrape_replaces_future_amc_rows(tmp_path, today, future_date, past_date, theater_index):
    history = [
        _amc_row(past_date, "Past Film"),
        _amc_row(future_date, "Old Future"),
    ]

    scrape_path = tmp_path / "showtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [
            _amc_row(future_date, "New Future", time="8:00PM"),
            _amc_row(past_date, "Ignored Past"),
        ],
    )

    announcements = []
    process_amc_csv_data(
        str(scrape_path), history, announcements, "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    films = [row["Film"] for row in history]
    assert "Past Film" in films
    assert "Old Future" not in films
    assert "New Future" in films
    assert count_future_amc_history_rows(history, today) == 1


def test_past_amc_rows_never_removed_on_stale_scrape(
    tmp_path, today, future_date, past_date, theater_index
):
    history = [
        _amc_row(past_date, "Archive Film A"),
        _amc_row(past_date - timedelta(days=1), "Archive Film B"),
        _amc_row(future_date, "Future Film"),
    ]
    past_films_before = {
        row["Film"]
        for row in history
        if row["Film"].startswith("Archive")
    }

    scrape_path = tmp_path / "showtimes.csv"
    _write_scrape_csv(scrape_path, [])

    process_amc_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    past_films_after = {
        row["Film"]
        for row in history
        if row["Film"].startswith("Archive")
    }
    assert past_films_after == past_films_before


def test_missing_scrape_file_leaves_history_unchanged(tmp_path, today, future_date, past_date, theater_index):
    history = [
        _amc_row(past_date, "Past Film"),
        _amc_row(future_date, "Future Film"),
    ]
    history_before = copy.deepcopy(history)

    process_amc_csv_data(
        "nonexistent/showtimes.csv",
        history,
        [],
        "2026-06-26",
        theater_index,
        logs_dir=tmp_path / "daily_logs",
    )

    assert history == history_before


def test_zero_future_in_history_and_scrape_is_noop(tmp_path, today, past_date, theater_index):
    history = [_amc_row(past_date, "Past Film")]

    scrape_path = tmp_path / "showtimes.csv"
    _write_scrape_csv(scrape_path, [_amc_row(past_date, "Another Past")])

    process_amc_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert len(history) == 1
    assert history[0]["Film"] == "Past Film"
