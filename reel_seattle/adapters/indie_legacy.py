"""Shared legacy indie CSV helpers for SIFF and Beacon adapters."""

from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Mapping

import requests

from reel_seattle.adapters.base import FetchContext, RawShowtime

DEFAULT_INDIE_CSV_PATH = Path("public/indieshowtimes.csv")

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    )
}

INDIE_CSV_FIELDNAMES = [
    "Date",
    "Time",
    "Theater",
    "Film",
    "Runtime",
    "isAlmostSoldOut",
    "posterDynamic",
    "first_seen_date",
    "last_updated",
    "source",
]

SUPPORTED_SIFF_VENUES = frozenset(
    {
        "SIFF Cinema Downtown",
        "SIFF Cinema Uptown",
        "SIFF Film Center",
    }
)


def format_indie_date(date_str: str, year: int) -> str | None:
    """Convert a date string into mm/dd/yyyy format, assuming a given year."""
    try:
        return datetime.strptime(f"{date_str} {year}", "%B %d %Y").strftime("%m/%d/%Y")
    except ValueError:
        return None


def raw_showtime_to_legacy_row(raw: RawShowtime) -> dict[str, str]:
    """Convert a RawShowtime to the legacy indie CSV row shape."""
    poster = raw.poster_url_raw if raw.poster_url_raw not in (None, "") else "None"
    return {
        "Date": raw.date_raw,
        "Time": raw.time_raw,
        "Theater": raw.theater_name_raw,
        "Film": raw.title_raw,
        "Runtime": raw.runtime_raw or "Unknown",
        "isAlmostSoldOut": "None",
        "posterDynamic": poster,
        "first_seen_date": "",
        "last_updated": "",
        "source": "",
    }


def normalize_legacy_indie_row(row: Mapping[str, object]) -> dict[str, str]:
    return {key: str(row.get(key, "") or "") for key in INDIE_CSV_FIELDNAMES}


def write_legacy_indie_csv(csv_path: Path | str, rows: list[Mapping[str, object]]) -> None:
    """Write legacy indie CSV rows compatible with daily_processor.py."""
    path = Path(csv_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = [normalize_legacy_indie_row(row) for row in rows]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=INDIE_CSV_FIELDNAMES)
        writer.writeheader()
        writer.writerows(normalized)


def build_default_indie_fetch_context(
    *,
    run_date: date | None = None,
    session: requests.Session | None = None,
    theaters_registry: dict | None = None,
) -> FetchContext:
    run = run_date or date.today()
    return FetchContext(
        run_date=run,
        window_start=run,
        window_end=run + timedelta(days=365),
        theaters_registry=theaters_registry or {},
        session=session,
    )


def session_for_context(context: FetchContext) -> requests.Session:
    if context.session is not None:
        return context.session
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    return session
