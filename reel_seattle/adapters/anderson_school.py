"""Anderson School Theater showtimes from the public McMenamins HTML page.

Showtimes are the buy-ticket modals on the theater page. The Veezi purchase
link is a public ticketing URL embedded in that HTML, not a private API.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from reel_seattle.adapters.anderson_titles import normalize_anderson_title
from reel_seattle.adapters.option_c import (
    Screen,
    OptionCAdapterResult,
    assemble_option_c,
    load_registry_theater_ids,
)
from reel_seattle.adapters.source_http import SourceHttpError, http_exchange
from reel_seattle.ingestion.independent_contract import DEFAULT_TIMEZONE
from reel_seattle.showtime_horizon import INDIE_SCRAPE_HORIZON_DAYS

SOURCE = "anderson_school"
THEATER_ID = "anderson-school-theater"
THEATER_NAME = "Anderson School Theater"
PAGE_URL = "https://www.mcmenamins.com/anderson-school/anderson-school-theater"

_MODAL_ID_RE = re.compile(r"^modal-buytickets-(ST\d+)$")
_PANEL_RE = re.compile(r"^date_panel_(ST\d+)_(\d{8})$")
_PURCHASE_RE = re.compile(
    r"window\.open\('(?P<url>https://ticketing\.[^']+/purchase/(?P<id>\d+)[^']*)'\)"
)
_CLOCK_RE = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", re.IGNORECASE)
_RUNTIME_RE = re.compile(r"Running time:\s*(\d+)\s*minutes", re.IGNORECASE)
_CODE_RE = re.compile(r"[?&]code=(\d+)")

FetchFn = Callable[..., tuple[int, bytes, dict[str, str]]]


def default_anderson_school_window(now: datetime | None = None) -> tuple[date, date]:
    moment = now or datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    start = moment.date()
    return start, start + timedelta(days=INDIE_SCRAPE_HORIZON_DAYS)


def _clock(text: str) -> str | None:
    match = _CLOCK_RE.search(text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or "0")
    meridiem = match.group(3).lower()
    if hour > 12 or minute > 59:
        return None
    if meridiem == "pm" and hour != 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def _panel_date(token: str) -> date | None:
    if len(token) != 8 or not token.isdigit():
        return None
    month, day, year = int(token[0:2]), int(token[2:4]), int(token[4:8])
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _failure(start: date, end: date, **kwargs: Any) -> OptionCAdapterResult:
    return assemble_option_c(
        source=SOURCE,
        window_start=start,
        window_end=end,
        screens=[],
        scraped_at=kwargs.pop("scraped_at", None),
        theater_ids=load_registry_theater_ids(),
        **kwargs,
    )


def fetch_anderson_school(
    start_date: date | None = None,
    end_date: date | None = None,
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
    scraped_at: str | None = None,
) -> OptionCAdapterResult:
    if start_date is None or end_date is None:
        default_start, default_end = default_anderson_school_window(now=now)
        start_date = start_date or default_start
        end_date = end_date or default_end
    transport = fetch or http_exchange
    try:
        status, payload, _hdrs = transport(PAGE_URL, method="GET", headers={"Accept": "text/html"})
    except SourceHttpError as exc:
        return _failure(
            start_date,
            end_date,
            request_error=f"Anderson School request failed: {exc}",
            scraped_at=scraped_at,
        )
    if status != 200:
        return _failure(
            start_date,
            end_date,
            request_error=f"Anderson School HTTP {status}",
            scraped_at=scraped_at,
        )
    html = payload.decode("utf-8", errors="replace")
    if "uk-modal-buytickets" not in html and "modal-buytickets-" not in html:
        return _failure(
            start_date,
            end_date,
            structural_error="Anderson School page is missing buy-ticket modals",
            scraped_at=scraped_at,
        )

    soup = BeautifulSoup(html, "html.parser")
    screens: list[Screen] = []
    rejected: list[dict[str, Any]] = []
    for modal in soup.find_all(id=_MODAL_ID_RE):
        modal_match = _MODAL_ID_RE.match(str(modal.get("id") or ""))
        if not modal_match:
            continue
        film_id = modal_match.group(1)
        heading = modal.find("h4")
        source_title = heading.get_text(" ", strip=True) if heading else ""
        if not source_title:
            rejected.append(
                {
                    "code": "missing_title",
                    "message": f"Anderson modal {film_id} has no title",
                    "affects_completeness": True,
                }
            )
            continue
        identity, suffix = normalize_anderson_title(source_title)
        runtime_node = modal.find(class_="uk-modal-runningtime")
        runtime = None
        if runtime_node:
            runtime_match = _RUNTIME_RE.search(runtime_node.get_text(" ", strip=True))
            if runtime_match:
                runtime = int(runtime_match.group(1))
        poster = None
        image = modal.find("img")
        if image and image.get("src"):
            poster = str(image["src"])
        film_code = _CODE_RE.search(poster or "")
        attributes: dict[str, Any] = {}
        if suffix:
            attributes["title_normalization"] = {
                "identity_title": identity,
                "suffix": suffix,
                "accessibility": "open-caption",
            }
        if film_code:
            attributes["veezi_film_code"] = film_code.group(1)
        format_raw = "open caption" if suffix else None
        panels = modal.find_all(id=_PANEL_RE)
        if not panels:
            rejected.append(
                {
                    "code": "missing_date_panel",
                    "message": f"Anderson modal {film_id} has no date panel",
                    "affects_completeness": True,
                }
            )
            continue
        for panel in panels:
            panel_match = _PANEL_RE.match(str(panel.get("id") or ""))
            if not panel_match:
                continue
            show_date = _panel_date(panel_match.group(2))
            if show_date is None:
                rejected.append(
                    {
                        "code": "invalid_date_panel",
                        "message": f"Anderson date panel {panel.get('id')} is not a date",
                        "affects_completeness": True,
                    }
                )
                continue
            if show_date < start_date or show_date > end_date:
                continue
            for button in panel.find_all("button"):
                onclick = str(button.get("onclick") or "")
                purchase = _PURCHASE_RE.search(onclick)
                clock = _clock(button.get_text(" ", strip=True))
                if not purchase or clock is None:
                    rejected.append(
                        {
                            "code": "invalid_showtime_button",
                            "message": f"Anderson {film_id} button is missing a purchase link or time",
                            "affects_completeness": True,
                        }
                    )
                    continue
                screens.append(
                    Screen(
                        program_id=film_id,
                        source_title=source_title,
                        identity_title=identity,
                        program_url=PAGE_URL,
                        showtime_id=purchase.group("id"),
                        theater_id=THEATER_ID,
                        theater_name=THEATER_NAME,
                        local_date=show_date,
                        local_time=clock,
                        ticket_url=purchase.group("url"),
                        runtime_minutes=runtime,
                        format_raw=format_raw,
                        poster_url=poster,
                        attributes=dict(attributes),
                    )
                )

    return assemble_option_c(
        source=SOURCE,
        window_start=start_date,
        window_end=end_date,
        screens=screens,
        rejected=rejected,
        structure_present=True,
        inspected_complete=True,
        valid_empty_proof=True,
        discovered_programs=len({screen.program_id for screen in screens}),
        pages_attempted=1,
        pages_succeeded=1,
        scraped_at=scraped_at,
        theater_ids=load_registry_theater_ids(),
    )
