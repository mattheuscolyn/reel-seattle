"""Northwest Film Forum ingestion prototype (non-production).

Emits independent-source observation contract v1.0.0 results.
Calendar occurrences are the showtime authority; ``/films/`` pages supply metadata.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable, Mapping
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from reel_seattle.ingestion.independent_contract import (
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    STATUS_PARTIAL_FAILURE,
    STATUS_REQUEST_FAILURE,
    STATUS_STRUCTURAL_FAILURE,
    STATUS_SUCCESS,
    STATUS_VALID_EMPTY,
    normalize_exact_source_title,
)

SOURCE = "nwff"
NWFF_BASE = "https://nwfilmforum.org"
NWFF_CALENDAR_PATH = "/calendar/"
PLANNED_THEATER_ID = "northwest-film-forum"
PLANNED_THEATER_NAME = "Northwest Film Forum"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)

USER_AGENT = "ReelSeattle-NWFF-Prototype/0.1 (+https://github.com/mattheuscolyn/reel-seattle; research)"

_MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


class NwffPrototypeError(ValueError):
    """Raised for invalid prototype inputs."""


@dataclass
class FetchResponse:
    url: str
    status_code: int
    text: str | None


FetchFn = Callable[[str], FetchResponse]


@dataclass
class CalendarOccurrence:
    program_url: str | None
    source_title: str
    local_date: date
    local_time: str | None  # HH:MM or None for all-day
    classification: str  # film / workshop / unknown
    location_name: str | None
    calendar_page_url: str
    start_iso: str | None
    duration: str | None
    ticket_url: str | None
    is_film_path: bool
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProgramPageData:
    url: str
    source_title: str | None
    fetch_ok: bool
    structure_ok: bool
    directors: list[str] = field(default_factory=list)
    country: str | None = None
    release_year: int | None = None
    runtime_min: int | None = None
    description_paragraphs: list[str] = field(default_factory=list)
    image_url: str | None = None
    ticket_url: str | None = None
    schedule_slots: list[tuple[date, str]] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    warning: str | None = None


def default_fetch(url: str, *, timeout: float = 30.0) -> FetchResponse:
    import urllib.error
    import urllib.request

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            text = response.read().decode(charset, errors="replace")
            return FetchResponse(url=url, status_code=getattr(response, "status", 200), text=text)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else None
        return FetchResponse(url=url, status_code=int(exc.code), text=body)
    except Exception:  # noqa: BLE001 - prototype boundary
        return FetchResponse(url=url, status_code=0, text=None)


def fixture_fetch_map(pages: Mapping[str, str]) -> FetchFn:
    """Build a fetch function from URL -> HTML mapping (fixture mode)."""

    def _calendar_cover_lookup(target: date) -> str | None:
        for key, html in pages.items():
            if "calendar" not in key.casefold() and "/calendar" not in key:
                continue
            span = parse_calendar_range_heading(html, year_hint=target.year)
            if span and span[0] <= target <= span[1]:
                return html
            # Also try adjacent year for Dec/Jan fixtures.
            span = parse_calendar_range_heading(html, year_hint=target.year - 1)
            if span and span[0] <= target <= span[1]:
                return html
        return None

    def _fetch(url: str) -> FetchResponse:
        parsed = urlparse(url)
        candidates = [
            url,
            urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", parsed.query, "")),
            parsed.path + (("?" + parsed.query) if parsed.query else ""),
            parsed.path,
        ]
        for key in candidates:
            if key in pages:
                return FetchResponse(url=url, status_code=200, text=pages[key])
        qs = parse_qs(parsed.query)
        if "start" in qs:
            start_raw = qs["start"][0]
            for key, html in pages.items():
                if start_raw in key:
                    return FetchResponse(url=url, status_code=200, text=html)
            try:
                start_date = date.fromisoformat(start_raw)
            except ValueError:
                start_date = None
            if start_date is not None:
                covered = _calendar_cover_lookup(start_date)
                if covered is not None:
                    return FetchResponse(url=url, status_code=200, text=covered)
        return FetchResponse(url=url, status_code=404, text=None)

    return _fetch


def canonical_film_url(url: str, *, base: str = NWFF_BASE) -> str | None:
    absolute = urljoin(base, url.strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.casefold()
    if host not in {"nwfilmforum.org", "www.nwfilmforum.org"}:
        return None
    path = parsed.path.rstrip("/") + "/"
    match = re.fullmatch(r"/films/([a-zA-Z0-9\-]+)/", path)
    if not match:
        return None
    return urlunparse(("https", "nwfilmforum.org", path, "", "", ""))


def film_slug_from_url(url: str) -> str | None:
    canonical = canonical_film_url(url)
    if not canonical:
        return None
    return urlparse(canonical).path.strip("/").split("/")[-1]


def calendar_url_for_start(start: date) -> str:
    return f"{NWFF_BASE}{NWFF_CALENDAR_PATH}?start={start.isoformat()}"


def _parse_iso_local(value: str) -> tuple[date, str] | None:
    text = value.strip()
    if not text:
        return None
    # Accept 2026-07-15T19:00:00 or with space.
    text = text.replace(" ", "T")
    try:
        if len(text) == 10:
            return date.fromisoformat(text), "00:00"
        dt = datetime.fromisoformat(text)
        return dt.date(), f"{dt.hour:02d}:{dt.minute:02d}"
    except ValueError:
        return None


def parse_calendar_range_heading(html: str, *, year_hint: int) -> tuple[date, date] | None:
    """Parse headings like ``Jul 14 - 20`` or ``Jul 28 - Aug 3`` into inclusive dates."""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    match = re.search(
        r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s*[-–]\s*"
        r"(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+)?(\d{1,2})\b",
        text,
        flags=re.I,
    )
    if not match:
        return None
    start_month_key = match.group(1).casefold()
    start_month = (
        _MONTHS.get(start_month_key)
        or _MONTHS.get(start_month_key[:4])
        or _MONTHS.get(start_month_key[:3])
    )
    if not start_month:
        return None
    start_day = int(match.group(2))
    end_day = int(match.group(4))
    if match.group(3):
        end_month_key = match.group(3).casefold()
        end_month = (
            _MONTHS.get(end_month_key)
            or _MONTHS.get(end_month_key[:4])
            or _MONTHS.get(end_month_key[:3])
        )
        if not end_month:
            return None
        start = date(year_hint, start_month, start_day)
        end_year = year_hint + 1 if end_month < start_month else year_hint
        end = date(end_year, end_month, end_day)
        return start, end

    start = date(year_hint, start_month, start_day)
    if end_day >= start_day:
        end = date(year_hint, start_month, end_day)
    else:
        if start_month == 12:
            end = date(year_hint + 1, 1, end_day)
        else:
            end = date(year_hint, start_month + 1, end_day)
    return start, end


def calendar_structure_present(html: str) -> bool:
    soup = BeautifulSoup(html, "html.parser")
    if soup.select_one("[data-calendar-item]"):
        return True
    if soup.select_one(".calendar__grid__col") or soup.select_one(".calendar__item"):
        return True
    text = soup.get_text(" ", strip=True).casefold()
    return "calendar" in text and "northwest film forum" in text


def extract_calendar_occurrences(
    html: str,
    *,
    calendar_page_url: str,
    year_hint: int,
) -> tuple[list[CalendarOccurrence], tuple[date, date] | None, list[str]]:
    """Extract calendar occurrences and represented date span."""
    warnings: list[str] = []
    soup = BeautifulSoup(html, "html.parser")
    heading_span = parse_calendar_range_heading(html, year_hint=year_hint)
    items = soup.select("[data-calendar-item]")
    occurrences: list[CalendarOccurrence] = []
    dates_seen: list[date] = []

    for item in items:
        classes = item.get("class") or []
        if "calendar__item--film" in classes or "data-type-film" in item.attrs:
            classification = "film"
        elif "calendar__item--workshop" in classes or "data-type-workshop" in item.attrs:
            classification = "workshop"
        else:
            classification = "unknown"

        start_meta = item.select_one('meta[itemprop="startDate"]')
        start_iso = start_meta.get("content") if start_meta else None
        parsed = _parse_iso_local(start_iso) if start_iso else None
        if not parsed:
            warnings.append("calendar_item_missing_startDate")
            continue
        local_date, local_time = parsed
        dates_seen.append(local_date)

        name_meta = item.select_one('meta[itemprop="name"]')
        link = item.select_one("a.calendar__item__link[href]")
        title = None
        href = None
        if name_meta and name_meta.get("content"):
            title = name_meta.get("content")
        if link:
            href = link.get("href")
            if not title:
                title = link.get_text(" ", strip=True)
        title = normalize_exact_source_title(title or "Unknown Program")

        location_meta = item.select_one('div[itemprop="location"] meta[itemprop="name"]')
        location_name = location_meta.get("content") if location_meta else None
        duration_meta = item.select_one('meta[itemprop="duration"]')
        duration = duration_meta.get("content") if duration_meta else None

        offer = item.select_one('div[itemprop="offers"] meta[itemprop="url"]')
        ticket_url = offer.get("content") if offer else None

        film_url = canonical_film_url(href) if href else None
        is_film_path = film_url is not None

        # All-day workshops sometimes use 00:00 — keep time but flag.
        all_day = local_time == "00:00" and classification == "workshop"

        occurrences.append(
            CalendarOccurrence(
                program_url=film_url if is_film_path else (urljoin(NWFF_BASE, href) if href else None),
                source_title=title,
                local_date=local_date,
                local_time=None if all_day else local_time,
                classification=classification,
                location_name=location_name,
                calendar_page_url=calendar_page_url,
                start_iso=start_iso,
                duration=duration,
                ticket_url=ticket_url,
                is_film_path=is_film_path,
                raw={
                    "href": href,
                    "classification": classification,
                    "start_iso": start_iso,
                    "duration": duration,
                    "location_name": location_name,
                    "all_day": all_day,
                },
            )
        )

    if dates_seen:
        span = (min(dates_seen), max(dates_seen))
    else:
        span = heading_span
    if heading_span and dates_seen:
        span = (min(heading_span[0], min(dates_seen)), max(heading_span[1], max(dates_seen)))
    return occurrences, span, warnings


def sanitize_description_html(fragment: str) -> list[str]:
    """HTML-unescape, strip tags, preserve paragraph / br boundaries."""
    if not fragment or not fragment.strip():
        return []
    soup = BeautifulSoup(fragment, "html.parser")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    paragraphs: list[str] = []
    blocks = soup.find_all("p")
    if not blocks:
        blocks = [soup]
    for block in blocks:
        text = block.get_text(" ", strip=True)
        text = text.replace("\u00a0", " ")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r" *\n *", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if text:
            paragraphs.append(text)
    # Deduplicate while preserving order.
    out: list[str] = []
    seen: set[str] = set()
    for para in paragraphs:
        if para not in seen:
            seen.add(para)
            out.append(para)
    return out


def _parse_clock_token(token: str) -> str | None:
    """Parse ``3.30pm`` / ``7:30pm`` into ``HH:MM``."""
    match = re.fullmatch(r"(\d{1,2})[.:](\d{2})\s*(am|pm)", token.strip(), flags=re.I)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    ampm = match.group(3).casefold()
    if ampm == "pm" and hour != 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def parse_detail_schedule_prose(text: str, *, year_hint: int) -> list[tuple[date, str]]:
    """Parse prose like ``Sat Jul 18: 3.30pm PDT, 5.30pm PDT`` for diagnostics only."""
    slots: list[tuple[date, str]] = []
    pattern = re.compile(
        r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+"
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+"
        r"(\d{1,2})\s*:\s*"
        r"((?:\d{1,2}[.:]\d{2}\s*(?:am|pm)(?:\s*(?:PDT|PST))?[,;\s]*)+)",
        flags=re.I,
    )
    for match in pattern.finditer(text):
        month_key = match.group(1).casefold()
        month = _MONTHS.get(month_key) or _MONTHS.get(month_key[:3])
        if not month:
            continue
        day = int(match.group(2))
        try:
            local_date = date(year_hint, month, day)
        except ValueError:
            continue
        for clock in re.finditer(r"(\d{1,2}[.:]\d{2}\s*(?:am|pm))", match.group(3), flags=re.I):
            local_time = _parse_clock_token(clock.group(1))
            if local_time:
                slots.append((local_date, local_time))
    return sorted(set(slots), key=lambda item: (item[0], item[1]))


def parse_detail_schedule(html: str, *, year_hint: int | None = None) -> list[tuple[date, str]]:
    """Parse detail-page ``<time datetime>`` slots, with prose fallback."""
    soup = BeautifulSoup(html, "html.parser")
    slots: list[tuple[date, str]] = []
    for node in soup.find_all("time"):
        value = node.get("datetime")
        if not value:
            continue
        parsed = _parse_iso_local(value.replace(" ", "T") if " " in value and "T" not in value else value)
        if not parsed:
            try:
                dt = datetime.strptime(value.strip(), "%Y-%m-%d %H:%M:%S")
                parsed = (dt.date(), f"{dt.hour:02d}:{dt.minute:02d}")
            except ValueError:
                continue
        slots.append(parsed)
    if not slots:
        hint = year_hint or datetime.now(PACIFIC).year
        slots = parse_detail_schedule_prose(soup.get_text(" ", strip=True), year_hint=hint)
    return sorted(set(slots), key=lambda item: (item[0], item[1]))


def parse_program_page(html: str, *, url: str) -> ProgramPageData:
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    title = normalize_exact_source_title(h1.get_text(" ", strip=True)) if h1 else None
    if not title and soup.title and soup.title.string:
        title = normalize_exact_source_title(soup.title.string.split(" - ")[0])

    director_meta = soup.select_one('meta[itemprop="director"]')
    country_meta = soup.select_one('meta[itemprop="country"]')
    year_meta = soup.select_one('meta[itemprop="copyrightYear"]')
    duration_meta = soup.select_one('meta[itemprop="duration"]')
    about = soup.select_one('[itemprop="about"]')
    ticket = soup.select_one('a.button[href*="eventive.org"], a[itemprop="url"][href*="eventive"]')
    image = soup.select_one('meta[property="og:image"]') or soup.select_one('meta[itemprop="image"]')

    runtime_min = None
    if duration_meta and duration_meta.get("content"):
        match = re.fullmatch(r"PT(\d+)M", duration_meta["content"].strip())
        if match:
            runtime_min = int(match.group(1))

    release_year = None
    if year_meta and year_meta.get("content") and year_meta["content"].isdigit():
        release_year = int(year_meta["content"])

    description = sanitize_description_html(str(about)) if about else []
    year_hint = release_year or datetime.now(PACIFIC).year
    schedule_slots = parse_detail_schedule(html, year_hint=year_hint)
    structure_ok = bool(h1 or title)

    return ProgramPageData(
        url=url,
        source_title=title,
        fetch_ok=True,
        structure_ok=structure_ok,
        directors=[director_meta["content"]] if director_meta and director_meta.get("content") else [],
        country=country_meta.get("content") if country_meta else None,
        release_year=release_year,
        runtime_min=runtime_min,
        description_paragraphs=description,
        image_url=image.get("content") if image else None,
        ticket_url=ticket.get("href") if ticket else None,
        schedule_slots=schedule_slots,
        raw={
            "copyright_year": year_meta.get("content") if year_meta else None,
            "duration": duration_meta.get("content") if duration_meta else None,
            "schedule_slot_count": len(schedule_slots),
        },
    )


def _daterange(start: date, end: date) -> list[date]:
    days: list[date] = []
    cursor = start
    while cursor <= end:
        days.append(cursor)
        cursor += timedelta(days=1)
    return days


def _week_starts_covering(start: date, end: date) -> list[date]:
    """Return weekly start parameters covering [start, end] inclusive.

    NWFF calendar pages are week views; ``?start=`` lands on the week containing
    that date. Advancing by 7 days until the start parameter itself passes the
    requested end ensures the final day of the window is requested (a page whose
    ``start`` equals the last day still returns that day's week).
    """
    starts: list[date] = []
    cursor = start
    for _ in range(60):
        starts.append(cursor)
        if cursor >= end:
            break
        cursor = cursor + timedelta(days=7)
        if cursor > end and starts[-1] < end:
            # Ensure a start that can land on the week containing ``end``.
            starts.append(end)
            break
    # Deduplicate while preserving order.
    out: list[date] = []
    seen: set[date] = set()
    for value in starts:
        if value not in seen:
            seen.add(value)
            out.append(value)
    return out


def build_nwff_result(
    *,
    start_date: date,
    end_date: date,
    fetch: FetchFn,
    scraped_at: str | None = None,
    sleep_seconds: float = 0.0,
) -> dict[str, Any]:
    """Fetch/parse NWFF and return a contract-shaped IndependentSourceResult dict."""
    if end_date < start_date:
        raise NwffPrototypeError("end_date must be >= start_date")

    stamp = scraped_at or datetime.now(PACIFIC).isoformat(timespec="seconds")
    warnings: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    checks: list[dict[str, Any]] = []
    stats: dict[str, Any] = {
        "calendar_pages_attempted": 0,
        "calendar_pages_succeeded": 0,
        "calendar_pages_failed": 0,
        "discovered_occurrences": 0,
        "accepted_showtimes": 0,
        "rejected_entries": 0,
        "unique_programs": 0,
        "program_pages_attempted": 0,
        "program_pages_succeeded": 0,
        "program_pages_failed": 0,
        "schedule_mismatches": 0,
        "prototype_theater_id": PLANNED_THEATER_ID,
    }

    week_starts = _week_starts_covering(start_date, end_date)
    all_occurrences: list[CalendarOccurrence] = []
    covered_days: set[date] = set()
    page_spans: list[dict[str, Any]] = []
    any_structure = False
    first_request_failed = False

    for index, week_start in enumerate(week_starts):
        url = calendar_url_for_start(week_start)
        stats["calendar_pages_attempted"] += 1
        response = fetch(url)
        if index == 0 and (response.status_code != 200 or not response.text):
            first_request_failed = True
            stats["calendar_pages_failed"] += 1
            break
        if response.status_code != 200 or not response.text:
            stats["calendar_pages_failed"] += 1
            warnings.append(
                {
                    "code": "calendar_page_fetch_failed",
                    "message": f"Failed to fetch calendar page {url}",
                    "source_program_id": None,
                }
            )
            continue

        structure_ok = calendar_structure_present(response.text)
        any_structure = any_structure or structure_ok
        checks.append(
            {
                "code": "calendar_structure_present",
                "passed": structure_ok,
                "severity": "error",
                "message": None if structure_ok else f"Missing calendar structure on {url}",
            }
        )
        if not structure_ok:
            stats["calendar_pages_failed"] += 1
            continue

        stats["calendar_pages_succeeded"] += 1
        occurrences, span, extract_warnings = extract_calendar_occurrences(
            response.text,
            calendar_page_url=url,
            year_hint=week_start.year,
        )
        for code in extract_warnings:
            warnings.append(
                {
                    "code": code,
                    "message": "Calendar item missing parseable startDate",
                    "source_program_id": None,
                }
            )
        if span:
            for day in _daterange(span[0], span[1]):
                covered_days.add(day)
            page_spans.append(
                {
                    "url": url,
                    "start": span[0].isoformat(),
                    "end": span[1].isoformat(),
                    "occurrence_count": len(occurrences),
                }
            )
        all_occurrences.extend(occurrences)
        if sleep_seconds:
            time.sleep(sleep_seconds)

    # Deduplicate occurrences by program URL + start ISO / date-time.
    deduped: list[CalendarOccurrence] = []
    seen_keys: set[str] = set()
    for occ in all_occurrences:
        key = "|".join(
            [
                occ.program_url or "",
                occ.start_iso or f"{occ.local_date.isoformat()}T{occ.local_time or 'allday'}",
                occ.classification,
            ]
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(occ)
    stats["discovered_occurrences"] = len(deduped)

    requested_days = set(_daterange(start_date, end_date))
    window_complete = requested_days.issubset(covered_days) and stats["calendar_pages_failed"] == 0
    if first_request_failed:
        window_complete = False

    # Filter to requested window.
    in_window = [
        occ
        for occ in deduped
        if start_date <= occ.local_date <= end_date
    ]

    # Classification / location handling.
    accepted_candidates: list[CalendarOccurrence] = []
    for occ in in_window:
        if occ.classification == "workshop" or (
            occ.program_url and "/education/workshops/" in (occ.program_url or "")
        ):
            rejected.append(
                {
                    "code": "non_film_category",
                    "message": "Rejected workshop/non-screening calendar entry.",
                    "source_program_id": film_slug_from_url(occ.program_url or "") if occ.program_url else None,
                    "source_value": occ.classification,
                    "affects_completeness": False,
                }
            )
            stats["rejected_entries"] += 1
            continue
        if not occ.is_film_path:
            if occ.classification == "film":
                rejected.append(
                    {
                        "code": "malformed_film_link",
                        "message": "Film classification without canonical /films/ URL.",
                        "source_program_id": None,
                        "source_value": occ.raw.get("href"),
                        "affects_completeness": True,
                    }
                )
                stats["rejected_entries"] += 1
                continue
            # Unknown non-/films/ paths are skipped without automatic rejection.
            warnings.append(
                {
                    "code": "unknown_non_film_path",
                    "message": "Skipped calendar entry without canonical /films/ URL.",
                    "source_program_id": None,
                }
            )
            continue

        location = (occ.location_name or "").strip()
        if location and location.casefold() not in {
            PLANNED_THEATER_NAME.casefold(),
            "nwff",
            "northwest film forum",
        }:
            warnings.append(
                {
                    "code": "unknown_location",
                    "message": f"Off-site or unknown location {location!r}; occurrence rejected.",
                    "source_program_id": film_slug_from_url(occ.program_url or ""),
                }
            )
            rejected.append(
                {
                    "code": "unknown_location",
                    "message": "Unknown/off-site location does not map to planned NWFF theater.",
                    "source_program_id": film_slug_from_url(occ.program_url or ""),
                    "source_value": location,
                    "affects_completeness": True,
                }
            )
            stats["rejected_entries"] += 1
            continue

        if occ.local_time is None:
            rejected.append(
                {
                    "code": "missing_local_time",
                    "message": "Occurrence missing local time.",
                    "source_program_id": film_slug_from_url(occ.program_url or ""),
                    "source_value": occ.start_iso,
                    "affects_completeness": True,
                }
            )
            stats["rejected_entries"] += 1
            continue

        accepted_candidates.append(occ)

    # Fetch program pages once.
    program_urls = sorted({occ.program_url for occ in accepted_candidates if occ.program_url})
    program_pages: dict[str, ProgramPageData] = {}
    for url in program_urls:
        stats["program_pages_attempted"] += 1
        response = fetch(url)
        if response.status_code != 200 or not response.text:
            stats["program_pages_failed"] += 1
            program_pages[url] = ProgramPageData(
                url=url,
                source_title=None,
                fetch_ok=False,
                structure_ok=False,
                warning="program_page_fetch_failed",
            )
            warnings.append(
                {
                    "code": "program_page_fetch_failed",
                    "message": f"Failed to fetch program page {url}",
                    "source_program_id": film_slug_from_url(url),
                }
            )
            continue
        parsed = parse_program_page(response.text, url=url)
        if not parsed.structure_ok:
            stats["program_pages_failed"] += 1
            parsed.fetch_ok = True
            parsed.warning = "program_page_structure_missing"
            warnings.append(
                {
                    "code": "program_page_structure_missing",
                    "message": f"Program page missing expected title structure: {url}",
                    "source_program_id": film_slug_from_url(url),
                }
            )
        else:
            stats["program_pages_succeeded"] += 1
        program_pages[url] = parsed
        if sleep_seconds:
            time.sleep(sleep_seconds)

    # Build programs + showtimes.
    programs_by_id: dict[str, dict[str, Any]] = {}
    showtimes: list[dict[str, Any]] = []
    composite_counts: dict[str, int] = {}

    for occ in accepted_candidates:
        assert occ.program_url
        slug = film_slug_from_url(occ.program_url)
        if not slug:
            continue
        page = program_pages.get(occ.program_url)
        program_title = page.source_title if page and page.source_title else occ.source_title
        if page and page.source_title and page.source_title != occ.source_title:
            warnings.append(
                {
                    "code": "calendar_program_title_mismatch",
                    "message": "Calendar title and program-page title differ.",
                    "source_program_id": slug,
                }
            )

        if slug not in programs_by_id:
            programs_by_id[slug] = {
                "contract_version": CONTRACT_VERSION,
                "source": SOURCE,
                "source_program_id": slug,
                "source_title": program_title,
                "source_program_url": occ.program_url,
                "program_kind": "film" if occ.classification == "film" else occ.classification,
                "observed_at": stamp,
                "raw": {
                    "calendar_title": occ.source_title,
                    "program_page_title": page.source_title if page else None,
                    "directors": page.directors if page else [],
                    "country": page.country if page else None,
                    "release_year": page.release_year if page else None,
                    "runtime_min": page.runtime_min if page else None,
                    "description_paragraphs": page.description_paragraphs if page else [],
                    "image_url": page.image_url if page else None,
                    "ticket_url": page.ticket_url if page else None,
                    "source_classification": occ.classification,
                    **(page.raw if page else {}),
                },
            }

        composite = f"{slug}|{PLANNED_THEATER_ID}|{occ.local_date.isoformat()}|{occ.local_time}"
        composite_counts[composite] = composite_counts.get(composite, 0) + 1
        discriminator = None
        if composite_counts[composite] > 1:
            discriminator = (
                occ.ticket_url
                or occ.start_iso
                or occ.raw.get("href")
                or f"occ-{composite_counts[composite]}"
            )
            warnings.append(
                {
                    "code": "fallback_identity_collision",
                    "message": "Multiple occurrences share program/theater/date/time; discriminator retained.",
                    "source_program_id": slug,
                }
            )

        ticket = occ.ticket_url or (page.ticket_url if page else None)
        title_differs = bool(page and page.source_title and page.source_title != occ.source_title)
        showtimes.append(
            {
                "contract_version": CONTRACT_VERSION,
                "source": SOURCE,
                "source_program_id": slug,
                "source_showtime_id": None,
                "source_title": occ.source_title,
                "theater_id": PLANNED_THEATER_ID,
                "local_date": occ.local_date.isoformat(),
                "local_time": occ.local_time,
                "timezone": DEFAULT_TIMEZONE,
                "source_occurrence_url": occ.program_url,
                "ticket_url": ticket,
                "observed_at": stamp,
                "raw": {
                    "authority": "calendar",
                    "calendar_page_url": occ.calendar_page_url,
                    "start_iso": occ.start_iso,
                    "fallback_identity": "composite_program_theater_datetime",
                    "occurrence_discriminator": discriminator,
                    "location_name": occ.location_name,
                    "program_page_ticket_url": page.ticket_url if page else None,
                    "calendar_ticket_url": occ.ticket_url,
                    "program_page_title": page.source_title if page else None,
                    "title_differs_from_program": title_differs,
                },
            }
        )

    stats["accepted_showtimes"] = len(showtimes)
    stats["unique_programs"] = len(programs_by_id)
    stats["calendar_page_spans"] = page_spans
    stats["covered_day_count"] = len(covered_days & requested_days)

    # Calendar vs detail schedule comparison once per program (calendar authoritative).
    compared_programs: set[str] = set()
    for showtime in showtimes:
        slug = str(showtime["source_program_id"])
        if slug in compared_programs:
            continue
        compared_programs.add(slug)
        program_url = None
        for candidate in accepted_candidates:
            if film_slug_from_url(candidate.program_url or "") == slug:
                program_url = candidate.program_url
                break
        page = program_pages.get(program_url) if program_url else None
        if not page or not page.fetch_ok:
            continue
        calendar_slots = {
            (row["local_date"], row["local_time"])
            for row in showtimes
            if row["source_program_id"] == slug
        }
        detail_slots = {(d.isoformat(), t) for d, t in page.schedule_slots}
        if not page.schedule_slots:
            warnings.append(
                {
                    "code": "detail_schedule_missing",
                    "message": "Program page had no parseable schedule slots.",
                    "source_program_id": slug,
                }
            )
            continue
        only_calendar = calendar_slots - detail_slots
        only_detail = detail_slots - calendar_slots
        if only_calendar or only_detail:
            stats["schedule_mismatches"] += 1
            if only_detail:
                warnings.append(
                    {
                        "code": "detail_schedule_has_additional",
                        "message": "Detail page lists times not present on calendar (calendar remains authoritative).",
                        "source_program_id": slug,
                    }
                )
            if only_calendar:
                warnings.append(
                    {
                        "code": "calendar_schedule_has_additional",
                        "message": "Calendar lists times not present on detail schedule.",
                        "source_program_id": slug,
                    }
                )

    completeness_affecting = any(row.get("affects_completeness") for row in rejected)
    program_failures = stats["program_pages_failed"] > 0

    # Status decision
    if first_request_failed and stats["calendar_pages_succeeded"] == 0:
        status = STATUS_REQUEST_FAILURE
        restate_safe = False
    elif stats["calendar_pages_succeeded"] == 0 and not any_structure:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
    elif stats["calendar_pages_failed"] > 0 or not window_complete or program_failures or completeness_affecting:
        status = STATUS_PARTIAL_FAILURE
        restate_safe = False
    elif len(showtimes) == 0 and window_complete and any_structure and stats["calendar_pages_failed"] == 0:
        status = STATUS_VALID_EMPTY
        restate_safe = True
    elif len(showtimes) > 0 and window_complete and stats["calendar_pages_failed"] == 0 and not program_failures:
        status = STATUS_SUCCESS
        restate_safe = True
    else:
        status = STATUS_PARTIAL_FAILURE
        restate_safe = False

    if not checks:
        checks.append(
            {
                "code": "calendar_pages_present",
                "passed": stats["calendar_pages_succeeded"] > 0,
                "severity": "error",
                "message": None
                if stats["calendar_pages_succeeded"] > 0
                else "No calendar pages succeeded",
            }
        )
    checks.append(
        {
            "code": "requested_range_traversal_complete",
            "passed": window_complete,
            "severity": "error",
            "message": None if window_complete else "Requested window not fully covered",
        }
    )
    if program_urls:
        checks.append(
            {
                "code": "film_detail_fetched",
                "passed": stats["program_pages_failed"] == 0,
                "severity": "error" if program_failures else "warning",
                "message": None
                if stats["program_pages_failed"] == 0
                else f"{stats['program_pages_failed']} program page(s) failed",
            }
        )

    structural_passed = all(
        check["passed"] for check in checks if check.get("severity") == "error"
    ) and status in {STATUS_SUCCESS, STATUS_VALID_EMPTY}

    result: dict[str, Any] = {
        "contract_version": CONTRACT_VERSION,
        "source": SOURCE,
        "scraped_at": stamp,
        "requested_window": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "inspected_window": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "complete": bool(window_complete and status in {STATUS_SUCCESS, STATUS_VALID_EMPTY}),
        },
        "status": status,
        "restate_safe": restate_safe,
        "identity": {
            "program_strategy": "canonical_url_slug",
            "showtime_strategy": "composite_program_theater_datetime",
        },
        "structural_validation": {
            "passed": bool(structural_passed) if status in {STATUS_SUCCESS, STATUS_VALID_EMPTY} else False,
            "checks": checks,
        },
        "stats": stats,
        "warnings": _dedupe_warnings(warnings),
        "rejected_observations": rejected,
        "programs": list(programs_by_id.values()),
        "showtimes": showtimes,
    }
    if status == STATUS_VALID_EMPTY:
        result["valid_empty_evidence"] = {
            "proven": True,
            "reason": "calendar_structure_present_window_complete_zero_accepted_screenings",
        }
        # Ensure at least one passing structural check for valid empty.
        result["structural_validation"]["passed"] = True
        if not any(c.get("passed") for c in checks):
            checks.append(
                {
                    "code": "calendar_structure_present",
                    "passed": True,
                    "severity": "error",
                    "message": None,
                }
            )
    return result


def _dedupe_warnings(warnings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for warning in warnings:
        key = json.dumps(warning, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        out.append(warning)
    return out


def summarize_result(result: Mapping[str, Any]) -> dict[str, Any]:
    stats = result.get("stats") if isinstance(result.get("stats"), dict) else {}
    return {
        "source": result.get("source"),
        "status": result.get("status"),
        "restate_safe": result.get("restate_safe"),
        "requested_window": result.get("requested_window"),
        "inspected_window": result.get("inspected_window"),
        "calendar_pages_attempted": stats.get("calendar_pages_attempted"),
        "calendar_pages_succeeded": stats.get("calendar_pages_succeeded"),
        "unique_programs": stats.get("unique_programs"),
        "accepted_showtimes": stats.get("accepted_showtimes"),
        "rejected_entries": stats.get("rejected_entries"),
        "schedule_mismatches": stats.get("schedule_mismatches"),
        "program_pages_failed": stats.get("program_pages_failed"),
        "warning_count": len(result.get("warnings") or []),
        "prototype_theater_id": PLANNED_THEATER_ID,
    }
