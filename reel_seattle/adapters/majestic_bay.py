"""Majestic Bay showtimes from the public Veezi sessions page.

No Veezi API token is used. Session date, time, and runtime come from the
page's schema.org ``VisualArtsEvent`` JSON-LD. Film codes and presentation
labels come from the matching public session markup. A later authorized API
client can replace ``fetch`` without changing the normalized records.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
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
from reel_seattle.ingestion.independent_contract import (
    DEFAULT_TIMEZONE,
    normalize_exact_source_title,
)
from reel_seattle.showtime_horizon import INDIE_SCRAPE_HORIZON_DAYS

SOURCE = "majestic_bay"
THEATER_ID = "majestic-bay"
THEATER_NAME = "Majestic Bay Theatres"
SESSIONS_URL = "https://ticketing.useast.veezi.com/sessions/qnxpcc571jey8whdwrczs2c7g8"
_PURCHASE_ID_RE = re.compile(r"/purchase/(\d+)")
_CODE_RE = re.compile(r"[?&]code=(\d+)")
_DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")
_EMPTY_RE = re.compile(r"no shows currently scheduled", re.IGNORECASE)

FetchFn = Callable[..., tuple[int, bytes, dict[str, str]]]


def default_majestic_bay_window(now: datetime | None = None) -> tuple[date, date]:
    moment = now or datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    start = moment.date()
    return start, start + timedelta(days=INDIE_SCRAPE_HORIZON_DAYS)


def _duration_minutes(value: str) -> int | None:
    match = _DURATION_RE.match(value.strip())
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    total = hours * 60 + minutes + (1 if seconds >= 30 else 0)
    return total or None


def _purchase_id(url: str) -> str | None:
    match = _PURCHASE_ID_RE.search(url)
    return match.group(1) if match else None


def _events(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    found: list[dict[str, Any]] = []
    for node in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = node.string or node.get_text() or ""
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        rows = payload if isinstance(payload, list) else [payload]
        for row in rows:
            if isinstance(row, dict) and row.get("@type") == "VisualArtsEvent":
                found.append(row)
    return found


def _session_details(html: str) -> dict[str, dict[str, Any]]:
    """Map purchase URL to film code, presentation labels, and selling-fast."""
    soup = BeautifulSoup(html, "html.parser")
    legend = soup.find(id="attributeLegend")
    if legend is not None:
        legend.decompose()
    by_url: dict[str, dict[str, Any]] = {}
    for film in soup.select("div.film"):
        image = film.find("img", class_="poster")
        code = None
        if image and image.get("src"):
            code_match = _CODE_RE.search(str(image["src"]))
            if code_match:
                code = code_match.group(1)
        for item in film.select("li"):
            link = item.find("a", href=True)
            if link is None:
                continue
            href = str(link["href"])
            labels: list[str] = []
            selling_fast = False
            for badge in item.select("span.screen-attribute"):
                classes = " ".join(badge.get("class") or [])
                text = badge.get_text(" ", strip=True)
                if "few-tickets-left" in classes:
                    selling_fast = True
                    continue
                if text and text.casefold() not in {"selling fast"}:
                    labels.append(text)
            by_url[href] = {
                "film_code": code,
                "labels": labels,
                "selling_fast": selling_fast,
            }
    return by_url


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


def fetch_majestic_bay(
    start_date: date | None = None,
    end_date: date | None = None,
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
    scraped_at: str | None = None,
) -> OptionCAdapterResult:
    if start_date is None or end_date is None:
        default_start, default_end = default_majestic_bay_window(now=now)
        start_date = start_date or default_start
        end_date = end_date or default_end
    transport = fetch or http_exchange
    try:
        status, payload, _hdrs = transport(
            SESSIONS_URL,
            method="GET",
            headers={"Accept": "text/html"},
        )
    except SourceHttpError as exc:
        return _failure(
            start_date,
            end_date,
            request_error=f"Majestic Bay request failed: {exc}",
            scraped_at=scraped_at,
        )
    if status != 200:
        return _failure(
            start_date,
            end_date,
            request_error=f"Majestic Bay HTTP {status}",
            scraped_at=scraped_at,
        )
    html = payload.decode("utf-8", errors="replace")
    if "Majestic Bay" not in html:
        return _failure(
            start_date,
            end_date,
            structural_error="Majestic Bay sessions page did not identify the theater",
            scraped_at=scraped_at,
        )
    events = _events(html)
    has_shell = "sessionsByDateConent" in html or "sessionsByDateContent" in html
    if not events and not has_shell and not _EMPTY_RE.search(html):
        return _failure(
            start_date,
            end_date,
            structural_error="Majestic Bay page is missing sessions markup and schema.org events",
            scraped_at=scraped_at,
        )

    details = _session_details(html)
    screens: list[Screen] = []
    rejected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for event in events:
        url = str(event.get("url") or "").strip()
        name = normalize_exact_source_title(str(event.get("name") or ""))
        start_text = str(event.get("startDate") or "")
        showtime_id = _purchase_id(url)
        try:
            local = datetime.fromisoformat(start_text)
        except ValueError:
            local = None
        if not url or not name or showtime_id is None or local is None:
            rejected.append(
                {
                    "code": "invalid_veezi_event",
                    "message": "Majestic Bay schema.org event is missing name, url, or startDate",
                    "affects_completeness": True,
                }
            )
            continue
        if showtime_id in seen:
            continue
        seen.add(showtime_id)
        local_day = local.date()
        if local_day < start_date or local_day > end_date:
            continue
        detail = details.get(url, {})
        film_code = detail.get("film_code")
        program_id = str(film_code) if film_code else showtime_id
        labels = list(detail.get("labels") or [])
        attributes: dict[str, Any] = {"public_sessions_url": SESSIONS_URL}
        if labels:
            attributes["presentation_labels"] = labels
        if not film_code:
            attributes["program_id_source"] = "purchase_session"
        screens.append(
            Screen(
                program_id=program_id,
                source_title=name,
                identity_title=name,
                program_url=SESSIONS_URL,
                showtime_id=showtime_id,
                theater_id=THEATER_ID,
                theater_name=THEATER_NAME,
                local_date=local_day,
                local_time=local.strftime("%H:%M"),
                ticket_url=url,
                runtime_minutes=_duration_minutes(str(event.get("duration") or "")),
                format_raw=", ".join(labels) if labels else None,
                attributes=attributes,
                showtime_raw={"selling_fast": bool(detail.get("selling_fast"))},
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
