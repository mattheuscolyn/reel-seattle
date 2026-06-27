"""Minimal base types for source showtime adapters."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

import requests


@dataclass(frozen=True, slots=True)
class RawShowtime:
    """Vendor-neutral showtime record before legacy CSV emission."""

    theater_name_raw: str
    date_raw: str
    time_raw: str
    title_raw: str
    runtime_raw: str | None = None
    poster_url_raw: str | None = None
    ticket_url_raw: str | None = None
    canceled: bool | None = None
    almost_sold_out: bool | None = None
    format_raw: str | None = None
    source_showtime_id: str | None = None
    source_film_url: str | None = None
    attributes: dict[str, object] | None = None


@dataclass(frozen=True, slots=True)
class FetchContext:
    """Inputs shared by source adapters."""

    run_date: date
    window_start: date
    window_end: date
    theaters_registry: dict[str, Any]
    session: requests.Session | None = None


@dataclass(frozen=True, slots=True)
class FetchResult:
    """Structured adapter output before legacy CSV conversion.

    Serialized to normalized raw JSON daily logs via
    :func:`reel_seattle.adapters.scrape_log.write_scrape_daily_log`.
    """

    records: list[RawShowtime]
    stats: dict[str, object] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
