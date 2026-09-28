"""Seattle Theatre Group film screenings from the public MEC REST collection.

The HTML events calendar answers 403 to non-browser clients. ``mec-events`` on
``/wp-json/wp/v2/mec-events`` is the public JSON surface used here. Qualification
is generic: Silent Movie Mondays is one accepted shape, not the only one.
Unmapped venues are rejected and make the scrape partial. They never create a
generic STG theater.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from html import unescape
from typing import Any, Callable
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from reel_seattle.adapters.option_c import (
    Screen,
    OptionCAdapterResult,
    assemble_option_c,
    load_registry_theater_ids,
)
from reel_seattle.adapters.source_http import SourceHttpError, http_exchange
from reel_seattle.adapters.stg_qualification import qualify_stg_event, split_stg_title
from reel_seattle.ingestion.independent_contract import (
    DEFAULT_TIMEZONE,
    normalize_exact_source_title,
)
from reel_seattle.showtime_horizon import INDIE_SCRAPE_HORIZON_DAYS

SOURCE = "stg"
LIST_URL = "https://www.stgpresents.org/wp-json/wp/v2/mec-events"
PER_PAGE = 100
MAX_PAGES = 15
THEATER_NAMES = {
    "paramount-theatre": "Paramount Theatre",
}
VENUES = {
    "paramount theatre": "paramount-theatre",
    "the paramount theatre": "paramount-theatre",
}

_DATE_RE = re.compile(
    r"(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,\s*)?"
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\w*\.?\s+"
    r"(\d{1,2}),?\s+(\d{4})",
    re.IGNORECASE,
)
_TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", re.IGNORECASE)
_RUNTIME_RE = re.compile(r"\brun\s*time:\s*(\d+)\s*mins?\b", re.IGNORECASE)
_MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

FetchFn = Callable[..., tuple[int, bytes, dict[str, str]]]


def default_stg_window(now: datetime | None = None) -> tuple[date, date]:
    moment = now or datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    start = moment.date()
    return start, start + timedelta(days=INDIE_SCRAPE_HORIZON_DAYS)


def _plain(value: str) -> str:
    text = BeautifulSoup(unescape(value), "html.parser").get_text("\n", strip=True)
    return re.sub(r"[ \t]+", " ", text)


def _clock(text: str) -> str | None:
    match = _TIME_RE.search(text)
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


def _dates(text: str) -> list[date]:
    found: list[date] = []
    for match in _DATE_RE.finditer(text):
        month = _MONTHS.get(match.group(1).casefold()[:4].rstrip("."))
        if month is None:
            month = _MONTHS.get(match.group(1).casefold()[:3])
        if month is None:
            continue
        try:
            found.append(date(int(match.group(3)), month, int(match.group(2))))
        except ValueError:
            continue
    return found


def _venue_line(excerpt_text: str) -> str:
    for line in excerpt_text.splitlines():
        cleaned = line.strip()
        if not cleaned or cleaned.casefold().startswith("get tickets"):
            continue
        if _DATE_RE.search(cleaned) or _TIME_RE.search(cleaned):
            continue
        return cleaned
    return ""


def _ticket_url(excerpt_html: str) -> str | None:
    soup = BeautifulSoup(excerpt_html, "html.parser")
    link = soup.find("a", href=True)
    if link is None:
        return None
    return str(link["href"]).replace("&amp;", "&")


def _map_venue(name: str) -> str | None:
    key = re.sub(r"\s+", " ", name).strip().casefold()
    return VENUES.get(key)


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


def _page_url(page: int) -> str:
    return (
        f"{LIST_URL}?per_page={PER_PAGE}&page={page}"
        "&_fields=id,slug,link,title,excerpt,content"
    )


def fetch_stg(
    start_date: date | None = None,
    end_date: date | None = None,
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
    scraped_at: str | None = None,
) -> OptionCAdapterResult:
    if start_date is None or end_date is None:
        default_start, default_end = default_stg_window(now=now)
        start_date = start_date or default_start
        end_date = end_date or default_end
    transport = fetch or http_exchange
    events: list[dict[str, Any]] = []
    pages_attempted = 0
    pages_succeeded = 0
    pages_failed = 0
    failed_urls: list[str] = []
    request_error = None
    structural_error = None
    inspected_complete = True

    for page in range(1, MAX_PAGES + 1):
        url = _page_url(page)
        pages_attempted += 1
        try:
            status, payload, headers = transport(url, method="GET", headers={"Accept": "application/json"})
        except SourceHttpError as exc:
            pages_failed += 1
            failed_urls.append(url)
            if page == 1:
                request_error = f"STG request failed: {exc}"
            else:
                inspected_complete = False
            break
        if status != 200:
            pages_failed += 1
            failed_urls.append(url)
            if page == 1:
                request_error = f"STG events HTTP {status}"
            else:
                inspected_complete = False
            break
        try:
            parsed = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            pages_failed += 1
            if page == 1:
                structural_error = "STG events response was not JSON"
            else:
                inspected_complete = False
            break
        if not isinstance(parsed, list):
            pages_failed += 1
            if page == 1:
                structural_error = "STG events response was not a list"
            else:
                inspected_complete = False
            break
        pages_succeeded += 1
        events.extend(row for row in parsed if isinstance(row, dict))
        total_pages = headers.get("x-wp-totalpages")
        try:
            total = int(total_pages) if total_pages else None
        except ValueError:
            total = None
        if total is not None and page >= total:
            break
        if len(parsed) < PER_PAGE:
            break
        if page == MAX_PAGES and (total is None or total > MAX_PAGES):
            inspected_complete = False
    else:
        inspected_complete = False

    if request_error or structural_error:
        return _failure(
            start_date,
            end_date,
            request_error=request_error,
            structural_error=structural_error,
            pages_attempted=pages_attempted,
            pages_succeeded=pages_succeeded,
            pages_failed=pages_failed,
            failed_urls=failed_urls,
            scraped_at=scraped_at,
        )

    screens: list[Screen] = []
    rejected: list[dict[str, Any]] = []
    for event in events:
        event_id = str(event.get("id") or "").strip()
        title_raw = ""
        title_field = event.get("title")
        if isinstance(title_field, dict):
            title_raw = str(title_field.get("rendered") or "")
        excerpt_html = ""
        excerpt_field = event.get("excerpt")
        if isinstance(excerpt_field, dict):
            excerpt_html = str(excerpt_field.get("rendered") or "")
        content_html = ""
        content_field = event.get("content")
        if isinstance(content_field, dict):
            content_html = str(content_field.get("rendered") or "")
        source_title = normalize_exact_source_title(_plain(title_raw))
        excerpt_text = _plain(excerpt_html)
        body_text = _plain(content_html)
        link = str(event.get("link") or "").strip() or "https://www.stgpresents.org/events/"
        if not event_id or not source_title:
            rejected.append(
                {
                    "code": "invalid_event",
                    "message": "STG event is missing id or title",
                    "affects_completeness": True,
                }
            )
            continue
        occurrences = _dates(excerpt_text)
        clock = _clock(excerpt_text)
        in_window = [day for day in occurrences if start_date <= day <= end_date]
        if occurrences and not in_window:
            continue
        if not occurrences or clock is None:
            has_schedule_text = bool(_DATE_RE.search(excerpt_text) or _TIME_RE.search(excerpt_text))
            if not has_schedule_text:
                continue
            rejected.append(
                {
                    "code": "unparsed_schedule",
                    "message": f"STG event {event_id} ({source_title}) has no parsable excerpt date or time",
                    "affects_completeness": True,
                }
            )
            continue
        decision, reason = qualify_stg_event(source_title, f"{excerpt_text}\n{body_text}")
        identity, year, series = split_stg_title(source_title)
        venue_name = _venue_line(excerpt_text)
        theater_id = _map_venue(venue_name)
        if decision != "accept":
            rejected.append(
                {
                    "code": "non_film_event" if decision == "deny" else "ambiguous_film_event",
                    "message": (
                        f"STG event {event_id} ({source_title}) {decision}: {reason}"
                    ),
                    "affects_completeness": False,
                }
            )
            continue
        if theater_id is None:
            rejected.append(
                {
                    "code": "unmapped_venue",
                    "message": (
                        f"STG event {event_id} ({source_title}) is a film at unmapped venue "
                        f"{venue_name or '(missing)'}"
                    ),
                    "affects_completeness": True,
                }
            )
            continue
        runtime_match = _RUNTIME_RE.search(body_text)
        runtime = int(runtime_match.group(1)) if runtime_match else None
        ticket = _ticket_url(excerpt_html)
        attributes: dict[str, Any] = {
            "qualification": reason,
            "venue_raw": venue_name,
        }
        if series:
            attributes["program_series"] = series
            attributes["title_normalization"] = {
                "identity_title": identity,
                "series_prefix": series,
                "year": year,
            }
        showtime_ids = (
            [event_id]
            if len(in_window) == 1
            else [f"{event_id}:{day.isoformat()}" for day in in_window]
        )
        if len(in_window) > 1:
            attributes["showtime_identity"] = "mec_event_occurrence"
        for day, showtime_id in zip(in_window, showtime_ids, strict=True):
            screens.append(
                Screen(
                    program_id=event_id,
                    source_title=source_title,
                    identity_title=identity,
                    program_url=link,
                    showtime_id=showtime_id,
                    theater_id=theater_id,
                    theater_name=THEATER_NAMES[theater_id],
                    local_date=day,
                    local_time=clock,
                    ticket_url=ticket,
                    runtime_minutes=runtime,
                    year=year,
                    attributes=dict(attributes),
                    program_raw={"evidence_excerpt": body_text[:240]},
                )
            )

    return assemble_option_c(
        source=SOURCE,
        window_start=start_date,
        window_end=end_date,
        screens=screens,
        rejected=rejected,
        structure_present=True,
        inspected_complete=inspected_complete,
        valid_empty_proof=True,
        discovered_programs=len({str(event.get("id")) for event in events}),
        pages_attempted=pages_attempted,
        pages_succeeded=pages_succeeded,
        pages_failed=pages_failed,
        failed_urls=failed_urls,
        scraped_at=scraped_at,
        theater_ids=load_registry_theater_ids(),
    )
