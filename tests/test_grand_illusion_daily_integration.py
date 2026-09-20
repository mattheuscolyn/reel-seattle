"""Grand Illusion daily restatement isolation and source-vs-venue attribution."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from daily_processor import (
    HISTORY_FIELDNAMES,
    normalize_history_row,
    process_indie_csv_data,
    resolve_indie_row_source,
    save_csv,
)
from reel_seattle.adapters.grand_illusion import (
    fetch_grand_illusion_from_fixture_dir,
    write_grand_illusion_scrape_log,
)
from reel_seattle.adapters.scrape_log import daily_log_path, write_scrape_daily_log
from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.history_keys import load_theater_index
from reel_seattle.source_freshness import resolve_history_row_source

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "prototypes" / "grand_illusion"
RUN_DATE = "2026-09-20"
WINDOW_START = date(2026, 9, 20)
WINDOW_END = date(2026, 10, 31)
SCRAPED_AT = "2026-09-20T12:00:00-07:00"
GENERATED_AT = "2026-09-20T12:05:00-07:00"


@pytest.fixture
def theater_index():
    return load_theater_index()


def _fmt(d: date) -> str:
    return f"{d.month:02d}/{d.day:02d}/{d.year}"


def _row(
    show_date: date,
    *,
    film: str,
    theater: str,
    source: str,
    time: str = "7:15PM",
    source_film_id: str = "",
) -> dict:
    return normalize_history_row(
        {
            "Date": _fmt(show_date),
            "Time": time,
            "Theater": theater,
            "Film": film,
            "Runtime": "100",
            "source": source,
            "first_seen_date": RUN_DATE,
            "last_updated": RUN_DATE,
            "source_film_id": source_film_id,
            "source_title": film,
        }
    )


def test_resolve_prefers_explicit_gi_source_at_siff_venue(theater_index):
    row = _row(
        date(2026, 9, 29),
        film="Don't Play With Fire",
        theater="SIFF Film Center",
        source="grand_illusion",
        source_film_id="dont-play-with-fire-new-restoration",
    )
    assert resolve_indie_row_source(row, theater_index) == "grand_illusion"
    assert resolve_history_row_source(row, theater_index) == "grand_illusion"


def test_siff_restate_does_not_delete_gi_rows(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    history = [
        _row(
            date(2026, 9, 29),
            film="Don't Play With Fire - New Restoration",
            theater="SIFF Film Center",
            source="grand_illusion",
            source_film_id="dont-play-with-fire-new-restoration",
        ),
        _row(
            date(2026, 9, 29),
            film="Host Native Film",
            theater="SIFF Film Center",
            source="siff",
            source_film_id="host-native",
        ),
    ]
    # Empty SIFF JSON with restate_safe true / valid empty-ish: use a minimal
    # unsafe skip by writing no siff log and empty csv → CSV path may skip.
    # Instead write a SIFF log that is restate_safe with zero future rows via
    # valid empty is hard; simulate allowed restate with one unrelated row then
    # wipe: use write_scrape_daily_log with empty records + restate_safe false
    # so SIFF skip preserves both — not the test.
    # Better: restate-safe SIFF with only host film replaced.
    from reel_seattle.adapters.base import FetchResult, RawShowtime

    siff_raw = RawShowtime(
        theater_name_raw="SIFF Film Center",
        date_raw="09/29/2026",
        time_raw="7:15PM",
        title_raw="Host Native Film Restated",
        runtime_raw="100",
        attributes={"source_film_id": "host-native"},
    )
    write_scrape_daily_log(
        daily_log_path(RUN_DATE, "siff", logs_dir=logs),
        "siff",
        FetchResult(
            records=[siff_raw],
            stats={"restate_safe": True, "record_count": 1},
            warnings=[],
            errors=[],
        ),
    )
    announcements: list[dict] = []
    process_indie_csv_data(
        str(tmp_path / "missing.csv"),
        history,
        announcements,
        RUN_DATE,
        theater_index,
        today_date=WINDOW_START,
        run_date_iso=RUN_DATE,
        logs_dir=logs,
    )
    sources = {(r["source"], r["Film"]) for r in history}
    assert ("grand_illusion", "Don't Play With Fire - New Restoration") in sources
    assert any(r["source"] == "siff" for r in history)


def test_gi_restate_does_not_delete_siff_rows(tmp_path, theater_index):
    logs = tmp_path / "logs"
    logs.mkdir()
    history = [
        _row(
            date(2026, 9, 29),
            film="SIFF Own Listing",
            theater="SIFF Film Center",
            source="siff",
        ),
    ]
    result = fetch_grand_illusion_from_fixture_dir(
        FIXTURE_DIR,
        WINDOW_START,
        WINDOW_END,
        scraped_at=SCRAPED_AT,
        generated_at=GENERATED_AT,
    )
    assert result.restate_safe is True
    write_grand_illusion_scrape_log(
        daily_log_path(RUN_DATE, "grand_illusion", logs_dir=logs),
        result.log_envelope,
    )
    announcements: list[dict] = []
    process_indie_csv_data(
        str(tmp_path / "missing.csv"),
        history,
        announcements,
        RUN_DATE,
        theater_index,
        today_date=WINDOW_START,
        run_date_iso=RUN_DATE,
        logs_dir=logs,
    )
    assert any(r["source"] == "siff" and r["Film"] == "SIFF Own Listing" for r in history)
    assert any(r["source"] == "grand_illusion" for r in history)


def test_emit_prefers_row_source_and_suppresses_unmatched_gi(theater_index, tmp_path):
    history = [
        _row(
            date(2026, 9, 28),
            film="Shu Lea Cheang double feature: I.K.U. and UKI",
            theater="Northwest Film Forum",
            source="grand_illusion",
            time="7:00PM",
            source_film_id="shu-lea-cheang-double-feature",
        ),
        _row(
            date(2026, 9, 20),
            film="The Hole (35mm)",
            theater="SIFF Film Center",
            source="siff",
            time="6:30PM",
        ),
        _row(
            date(2026, 9, 20),
            film="The Hole in 35mm",
            theater="SIFF Film Center",
            source="grand_illusion",
            time="6:30PM",
            source_film_id="the-hole-in-35mm",
        ),
    ]
    registry = json.loads(Path("data/theaters.json").read_text(encoding="utf-8"))
    artifact = build_showtimes_current(
        history,
        registry=registry,
        reference_date=WINDOW_START,
    )
    sources = {s["source"] for s in artifact["showtimes"]}
    assert "grand_illusion" not in sources  # unmatched + matched GI omitted from public
    hole = [
        s
        for s in artifact["showtimes"]
        if s["theater_id"] == "siff-film-center" and s["time"] == "18:30"
    ]
    assert len(hole) == 1
    assert hole[0]["source"] == "siff"
    assert hole[0]["attributes"].get("presenters")
