"""Tests for indie forward-window restate semantics in daily_processor."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta

import pytest

from daily_processor import (
    HISTORY_FIELDNAMES,
    count_future_indie_source_history_rows,
    normalize_history_row,
    process_indie_csv_data,
    save_csv,
)
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.history_keys import load_theater_index
from reel_seattle.validate import validate_showtimes_current

PACIFIC_TZ = "America/Los_Angeles"


@pytest.fixture
def theater_index():
    return load_theater_index()


def _fmt(d) -> str:
    return f"{d.month:02d}/{d.day:02d}/{d.year}"


def _indie_row(
    show_date,
    *,
    film: str,
    theater: str,
    source: str = "indie",
    time: str = "7:00PM",
) -> dict:
    return normalize_history_row(
        {
            "Date": _fmt(show_date),
            "Time": time,
            "Theater": theater,
            "Film": film,
            "Runtime": "120",
            "source": source,
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


def test_siff_future_rows_are_restate(tmp_path, today, future_date, past_date, theater_index):
    history = [
        _indie_row(past_date, film="Past SIFF", theater="SIFF Cinema Uptown"),
        _indie_row(future_date, film="Old Future SIFF", theater="SIFF Cinema Uptown", source="siff"),
    ]
    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [
            _indie_row(future_date, film="New Future SIFF", theater="SIFF Cinema Uptown"),
            _indie_row(past_date, film="Ignored Past", theater="SIFF Cinema Uptown"),
        ],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    films = [row["Film"] for row in history if row.get("source") == "siff"]
    assert "Past SIFF" in [row["Film"] for row in history]
    assert "Old Future SIFF" not in films
    assert "New Future SIFF" in films
    assert count_future_indie_source_history_rows(history, "siff", theater_index, today) == 1


def test_beacon_restate_independent_from_siff(
    tmp_path, today, future_date, past_date, theater_index
):
    history = [
        _indie_row(future_date, film="Old SIFF", theater="SIFF Cinema Uptown", source="siff"),
        _indie_row(future_date, film="Old Beacon", theater="The Beacon", source="beacon"),
    ]
    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(future_date, film="New Beacon", theater="The Beacon")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert any(row["Film"] == "Old SIFF" for row in history)
    assert any(row["Film"] == "New Beacon" for row in history)
    assert not any(row["Film"] == "Old Beacon" for row in history)


def test_past_siff_and_beacon_rows_preserved(
    tmp_path, today, future_date, past_date, theater_index
):
    history = [
        _indie_row(past_date, film="Archive SIFF", theater="SIFF Cinema Uptown", source="siff"),
        _indie_row(past_date, film="Archive Beacon", theater="The Beacon", source="beacon"),
        _indie_row(future_date, film="Future SIFF", theater="SIFF Cinema Uptown", source="siff"),
    ]
    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(scrape_path, [])

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert any(row["Film"] == "Archive SIFF" for row in history)
    assert any(row["Film"] == "Archive Beacon" for row in history)


def test_empty_incoming_siff_preserves_future_siff(
    tmp_path, today, future_date, past_date, capsys, theater_index
):
    history = [_indie_row(future_date, film="Future SIFF", theater="SIFF Cinema Uptown", source="siff")]
    history_before = copy.deepcopy(history)

    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(past_date, film="Past Only", theater="SIFF Cinema Uptown")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert history == history_before
    assert "ERROR: siff restate skipped" in capsys.readouterr().out


def test_empty_incoming_beacon_preserves_future_beacon(
    tmp_path, today, future_date, theater_index, capsys
):
    history = [_indie_row(future_date, film="Future Beacon", theater="The Beacon", source="beacon")]
    history_before = copy.deepcopy(history)

    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(future_date, film="Future SIFF", theater="SIFF Cinema Uptown")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert any(row["Film"] == "Future Beacon" for row in history)
    assert "ERROR: beacon restate skipped" in capsys.readouterr().out


def test_empty_siff_does_not_block_valid_beacon_restate(
    tmp_path, today, future_date, theater_index
):
    history = [
        _indie_row(future_date, film="Future SIFF", theater="SIFF Cinema Uptown", source="siff"),
        _indie_row(future_date, film="Old Beacon", theater="The Beacon", source="beacon"),
    ]
    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(future_date, film="New Beacon", theater="The Beacon")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert any(row["Film"] == "Future SIFF" for row in history)
    assert any(row["Film"] == "New Beacon" for row in history)
    assert not any(row["Film"] == "Old Beacon" for row in history)


def test_source_inferred_as_siff_for_siff_theater(tmp_path, today, future_date, theater_index):
    history = []
    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(future_date, film="SIFF Film", theater="SIFF Cinema Uptown")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert history[0]["source"] == "siff"


def test_source_inferred_as_beacon_for_beacon_theater(tmp_path, today, future_date, theater_index):
    history = []
    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(future_date, film="Beacon Film", theater="The Beacon")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert history[0]["source"] == "beacon"


def test_unresolved_theater_does_not_cause_broad_deletion(
    tmp_path, today, future_date, theater_index
):
    history = [
        _indie_row(
            future_date,
            film="Mystery Show",
            theater="Unknown Indie Cinema",
            source="indie",
        )
    ]
    history_before = copy.deepcopy(history)

    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(future_date, film="New Beacon", theater="The Beacon")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    assert any(row["Film"] == "Mystery Show" for row in history)
    assert any(row["Film"] == "New Beacon" for row in history)
    assert len(history) == len(history_before) + 1


def test_showtimes_current_still_validates_after_indie_restate(
    tmp_path, today, future_date, theaters_registry, theater_index
):
    history = [
        _indie_row(future_date, film="Old SIFF", theater="SIFF Cinema Uptown", source="siff"),
    ]
    scrape_path = tmp_path / "indieshowtimes.csv"
    _write_scrape_csv(
        scrape_path,
        [_indie_row(future_date, film="New SIFF", theater="SIFF Cinema Uptown")],
    )

    process_indie_csv_data(
        str(scrape_path), history, [], "2026-06-26", theater_index, logs_dir=tmp_path / "daily_logs"
    )

    artifact = build_showtimes_current(
        history,
        registry=theaters_registry,
        reference_date=today,
    )
    validate_showtimes_current(artifact)
    assert artifact["stats"]["showtime_count"] >= 1
