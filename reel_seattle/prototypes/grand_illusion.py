"""Grand Illusion Cinema ingestion prototype (programmer / presenter source).

Discovery (verified live 2026-09-20):
- Monthly calendar HTML exposes ``data-filmid`` buttons, not ``/film/`` hrefs.
- Resolve WordPress post id → film URL via ``/?p={filmid}`` redirect (301),
  or AJAX ``cinema_theme_ajax_call`` modal HTML containing the film link.
- Durable program identity is the ``/film/{slug}/`` path slug.
- Physical venue comes from the film page ``Screening location:`` field.
- Grand Illusion is not itself a screening venue while operating at partners.
"""

from __future__ import annotations

import html as html_lib
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable, Mapping
from urllib.parse import urljoin, urlparse
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
from reel_seattle.normalize import resolve_theater
from reel_seattle.normalize.theaters import TheaterIndex, build_theater_index
from reel_seattle.normalize.times import format_time_display, parse_time

SOURCE = "grand_illusion"
GI_BASE = "https://grandillusioncinema.org"
CALENDAR_PATH = "/calendar/"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)

USER_AGENT = (
    "ReelSeattle-GrandIllusion-Prototype/0.1 "
    "(+https://github.com/mattheuscolyn/reel-seattle; read-only showtimes research)"
)

PRESENTER_ID = "grand-illusion"
PRESENTER_NAME = "Grand Illusion Cinema"

# Distinctive formats we preserve into history/public format tags.
DISTINCTIVE_FORMATS = frozenset({"35mm", "16mm", "70mm"})
# Ordinary presentation tokens — keep on the record but do not treat as premium.
ORDINARY_FORMATS = frozenset({"dcp", "4k dcp", "digital", "4k", "hd", "bluray", "blu-ray"})

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

_FILM_PATH_RE = re.compile(r"^/film/([a-zA-Z0-9\-]+)/?$")
_WP_ID_RE = re.compile(r"^\d+$")
_RUNTIME_RE = re.compile(r"(\d+)\s*min", re.I)
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})(?:\s*/\s*((?:19|20)\d{2}))?\b")
_SCREENING_LI_RE = re.compile(
    r"(?P<weekday>\w+),\s+(?P<month>\w+)\s+(?P<day>\d{1,2}),\s+(?P<year>\d{4}),\s+"
    r"(?P<time>\d{1,2}:\d{2}\s*(?:am|pm))",
    re.I,
)
_DATE_FULL_RE = re.compile(
    r"(?P<weekday>\w+),\s+(?P<month>\w+)\s+(?P<day>\d{1,2}),\s+(?P<year>\d{4})",
    re.I,
)


@dataclass
class FetchResponse:
    url: str
    status_code: int
    text: str
    final_url: str | None = None
    headers: Mapping[str, str] = field(default_factory=dict)


FetchFn = Callable[[str], FetchResponse]


class GrandIllusionPrototypeError(ValueError):
    """Raised for structural prototype invocation errors."""


@dataclass
class CalendarOccurrence:
    wp_film_id: str
    calendar_title: str
    local_date: date
    local_times: list[str]  # HH:MM 24h


@dataclass
class ParsedFilmPage:
    source_program_id: str
    source_title: str
    source_program_url: str
    director: str | None
    year_raw: str | None
    runtime_min: int | None
    format_raw: str | None
    screening_location_raw: str | None
    theater_id: str | None
    theater_name: str | None
    ticket_url: str | None
    poster_url: str | None
    showtimes: list[tuple[date, str]]  # (local_date, HH:MM)
    venue_unknown: bool = False
    venue_reject_reason: str | None = None


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = html_lib.unescape(str(value).replace("\xa0", " "))
    return re.sub(r"\s+", " ", text).strip()


def film_slug_from_url(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlparse(url.strip())
    match = _FILM_PATH_RE.match(parsed.path or "")
    if not match:
        return None
    return match.group(1)


def canonicalize_film_url(url: str | None) -> str | None:
    slug = film_slug_from_url(url)
    if not slug:
        return None
    return f"{GI_BASE}/film/{slug}/"


def parse_clock_to_hhmm(raw: str) -> str | None:
    text = _clean_text(raw)
    if not text:
        return None
    # Normalize "5pm" → "5:00pm"
    if re.fullmatch(r"\d{1,2}\s*(am|pm)", text, flags=re.I):
        text = re.sub(r"(?i)^(\d{1,2})\s*(am|pm)$", r"\1:00\2", text)
    parsed = parse_time(text)
    if parsed is None:
        return None
    return parsed.time_24h


def split_calendar_times(raw: str) -> list[str]:
    """Split calendar button times like ``5pm/7:30pm`` into HH:MM values."""
    text = _clean_text(raw)
    if not text:
        return []
    parts = re.split(r"[/|,]|\\band\\b", text, flags=re.I)
    out: list[str] = []
    for part in parts:
        hhmm = parse_clock_to_hhmm(part)
        if hhmm and hhmm not in out:
            out.append(hhmm)
    return out


def parse_calendar_day_date(full_text: str) -> date | None:
    match = _DATE_FULL_RE.search(_clean_text(full_text))
    if not match:
        return None
    month = _MONTHS.get(match.group("month").casefold())
    if month is None:
        return None
    try:
        return date(int(match.group("year")), month, int(match.group("day")))
    except ValueError:
        return None


def parse_calendar_html(html: str) -> tuple[str | None, list[CalendarOccurrence]]:
    """Return (month label, occurrences) from a monthly calendar page."""
    soup = _soup(html)
    title_el = soup.select_one("h1.entry-title")
    month_label = _clean_text(title_el.get_text()) if title_el else None
    occurrences: list[CalendarOccurrence] = []
    for day in soup.select("li.day"):
        date_el = day.select_one(".date-display--day__full")
        if date_el is None:
            continue
        local_date = parse_calendar_day_date(date_el.get_text(" ", strip=True))
        if local_date is None:
            continue
        for btn in day.select("button.film[data-filmid]"):
            film_id = str(btn.get("data-filmid") or "").strip()
            if not _WP_ID_RE.fullmatch(film_id):
                continue
            title_el = btn.select_one(".film-title")
            times_el = btn.select_one(".film-times")
            title = _clean_text(title_el.get_text()) if title_el else ""
            times = split_calendar_times(times_el.get_text() if times_el else "")
            if not times:
                continue
            occurrences.append(
                CalendarOccurrence(
                    wp_film_id=film_id,
                    calendar_title=title,
                    local_date=local_date,
                    local_times=times,
                )
            )
    return month_label, occurrences


def calendar_url_for_month(year: int, month: int) -> str:
    return f"{GI_BASE}{CALENDAR_PATH}?month={year:04d}-{month:02d}"


def months_touching_window(start: date, end: date) -> list[tuple[int, int]]:
    if end < start:
        return []
    cursor = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    out: list[tuple[int, int]] = []
    while cursor <= last:
        out.append((cursor.year, cursor.month))
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return out


def resolve_film_url_from_fetch_response(resp: FetchResponse) -> str | None:
    """Prefer redirect final URL; fall back to film-card href in body."""
    for candidate in (resp.final_url, resp.url):
        canon = canonicalize_film_url(candidate)
        if canon:
            return canon
    soup = _soup(resp.text or "")
    link = soup.select_one("a.film-title[href], h2.film-card--title a[href]")
    if link and link.get("href"):
        return canonicalize_film_url(urljoin(GI_BASE, link["href"]))
    return None


def resolve_film_url(fetch: FetchFn, wp_film_id: str) -> str | None:
    """Resolve durable film URL from WordPress post id via ``/?p=`` redirect."""
    probe = f"{GI_BASE}/?p={wp_film_id}"
    resp = fetch(probe)
    found = resolve_film_url_from_fetch_response(resp)
    if found:
        return found
    # AJAX modal fallback (same film-card markup as the film page).
    ajax = fetch(
        f"{GI_BASE}/wp-admin/admin-ajax.php"
        f"?action=cinema_theme_ajax_call&filmId={wp_film_id}"
    )
    return resolve_film_url_from_fetch_response(ajax)


def _split_location_label(raw: str) -> str:
    """Take venue name before en-dash / address."""
    text = _clean_text(raw)
    for sep in ("–", "—", " - ", " − "):
        if sep in text:
            text = text.split(sep, 1)[0].strip()
            break
    # Drop trailing punctuation
    return text.rstrip(" .")


def resolve_screening_venue(
    location_raw: str | None,
    theater_index: TheaterIndex,
) -> tuple[str | None, str | None, bool, str | None]:
    """Return (theater_id, theater_name, unknown, reason)."""
    if not location_raw or not _clean_text(location_raw):
        return None, None, True, "missing_screening_location"
    label = _split_location_label(location_raw)
    if not label:
        return None, None, True, "empty_screening_location"
    # Explicitly reject mailing-address confusion.
    if "university way" in label.casefold() or "#1330" in label:
        return None, None, True, "mailing_address_not_venue"
    resolution = resolve_theater(label, theater_index)
    if resolution is None:
        return None, label, True, f"unknown_venue:{label}"
    entry = theater_index.theaters_by_id.get(resolution.theater_id) or {}
    name = str(entry.get("name") or label)
    return resolution.theater_id, name, False, None


def _parse_info_blocks(card) -> tuple[str | None, str | None, int | None, str | None]:
    """Parse director/year and runtime/format divs under film-card--film-info."""
    director = None
    year_raw = None
    runtime_min = None
    format_raw = None
    info = card.select_one(".film-card--film-info")
    if info is None:
        return director, year_raw, runtime_min, format_raw
    blocks = [_clean_text(div.get_text(" ", strip=True)) for div in info.find_all("div", recursive=False)]
    blocks = [b for b in blocks if b]
    if blocks:
        # "Director · 1998" or "Director · 2000/2023"
        first = blocks[0]
        if "·" in first:
            left, right = [p.strip() for p in first.split("·", 1)]
            director = left or None
            year_raw = right or None
        else:
            year_match = _YEAR_RE.search(first)
            if year_match:
                year_raw = year_match.group(0)
            else:
                director = first
    if len(blocks) >= 2:
        second = blocks[1]
        if "·" in second:
            left, right = [p.strip() for p in second.split("·", 1)]
        else:
            left, right = second, ""
        rt = _RUNTIME_RE.search(left) or _RUNTIME_RE.search(second)
        if rt:
            runtime_min = int(rt.group(1))
        format_raw = right or None
        if format_raw is None and not rt:
            format_raw = second
    return director, year_raw, runtime_min, format_raw


def history_format_from_raw(format_raw: str | None) -> str:
    """Map GI format to history premiumFormat; ordinary digital/DCP → empty."""
    if not format_raw:
        return ""
    text = _clean_text(format_raw)
    folded = text.casefold()
    if folded in ORDINARY_FORMATS:
        return ""
    if folded in DISTINCTIVE_FORMATS:
        return text
    # "4K DCP" etc. — ordinary
    if "dcp" in folded or folded == "digital":
        return ""
    if "35mm" in folded or "16mm" in folded or "70mm" in folded:
        # Prefer the distinctive token alone when mixed.
        for token in ("70mm", "35mm", "16mm"):
            if token in folded:
                return token
    return ""


def parse_film_page_html(
    html: str,
    *,
    page_url: str | None = None,
    theater_index: TheaterIndex | None = None,
) -> ParsedFilmPage:
    index = theater_index or build_theater_index_from_registry()
    soup = _soup(html)
    card = soup.select_one(".film-card") or soup
    title_link = card.select_one("h2.film-card--title a.film-title, a.film-title")
    href = None
    title = ""
    if title_link is not None:
        href = title_link.get("href")
        title = _clean_text(title_link.get_text())
    source_url = canonicalize_film_url(href) or canonicalize_film_url(page_url)
    slug = film_slug_from_url(source_url)
    if not slug:
        raise GrandIllusionPrototypeError("film page missing /film/{slug}/ identity")
    if not title:
        title = slug.replace("-", " ")

    director, year_raw, runtime_min, format_raw = _parse_info_blocks(card)

    ticket_url = None
    buy = card.select_one(".film-card--buy-tickets a[href]")
    if buy and buy.get("href"):
        ticket_url = buy["href"].strip()

    poster_url = None
    img = card.select_one(".film-card--poster img[src]")
    if img and img.get("src"):
        poster_url = img["src"].strip()

    location_raw = None
    for p in card.select(".film-card--screenings p, .screenings p"):
        text = _clean_text(p.get_text(" ", strip=True))
        if text.casefold().startswith("screening location"):
            location_raw = re.sub(
                r"(?i)^screening\s+location\s*:\s*",
                "",
                text,
            ).strip()
            break

    theater_id, theater_name, unknown, reason = resolve_screening_venue(location_raw, index)

    showtimes: list[tuple[date, str]] = []
    for li in card.select("ul.screenings-list li.screening"):
        text = _clean_text(li.get_text(" ", strip=True))
        match = _SCREENING_LI_RE.search(text)
        if not match:
            continue
        month = _MONTHS.get(match.group("month").casefold())
        if month is None:
            continue
        try:
            local_date = date(int(match.group("year")), month, int(match.group("day")))
        except ValueError:
            continue
        hhmm = parse_clock_to_hhmm(match.group("time"))
        if hhmm:
            showtimes.append((local_date, hhmm))

    return ParsedFilmPage(
        source_program_id=slug,
        source_title=normalize_exact_source_title(title) or title,
        source_program_url=source_url or f"{GI_BASE}/film/{slug}/",
        director=director,
        year_raw=year_raw,
        runtime_min=runtime_min,
        format_raw=format_raw,
        screening_location_raw=location_raw,
        theater_id=theater_id,
        theater_name=theater_name,
        ticket_url=ticket_url,
        poster_url=poster_url,
        showtimes=showtimes,
        venue_unknown=unknown,
        venue_reject_reason=reason,
    )


def build_theater_index_from_registry() -> TheaterIndex:
    from pathlib import Path
    import json

    path = Path("data/theaters.json")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return build_theater_index(payload)


def composite_showtime_id(
    slug: str,
    theater_id: str,
    local_date: date,
    local_time: str,
) -> str:
    return f"{slug}|{theater_id}|{local_date.isoformat()}|{local_time}"


def presenter_attribute(source_url: str) -> list[dict[str, str]]:
    return [
        {
            "id": PRESENTER_ID,
            "name": PRESENTER_NAME,
            "source_url": source_url,
        }
    ]


def _warning(code: str, message: str, **extra: Any) -> dict[str, Any]:
    row = {"code": code, "message": message, "severity": "warning"}
    row.update(extra)
    return row


def _reject(
    code: str,
    message: str,
    *,
    source_program_id: str | None = None,
    source_value: str | None = None,
    affects_completeness: bool = True,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "source_program_id": source_program_id,
        "source_value": source_value,
        "affects_completeness": affects_completeness,
    }


def build_grand_illusion_result(
    *,
    start_date: date,
    end_date: date,
    fetch: FetchFn,
    scraped_at: str | None = None,
    sleep_seconds: float = 0.0,
    theater_index: TheaterIndex | None = None,
) -> dict[str, Any]:
    """HTTP (or fixture) → IndependentSourceResult v1.0.0 for Grand Illusion."""
    if end_date < start_date:
        raise GrandIllusionPrototypeError("end_date must be >= start_date")

    index = theater_index or build_theater_index_from_registry()
    observed_at = scraped_at or datetime.now(PACIFIC).isoformat()
    warnings: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    programs: dict[str, dict[str, Any]] = {}
    showtimes: list[dict[str, Any]] = []

    calendar_failures = 0
    film_failures = 0
    months = months_touching_window(start_date, end_date)
    calendar_occurrences: list[CalendarOccurrence] = []
    inspected_dates: set[date] = set()

    for year, month in months:
        url = calendar_url_for_month(year, month)
        try:
            resp = fetch(url)
        except Exception as exc:  # noqa: BLE001
            calendar_failures += 1
            warnings.append(
                _warning(
                    "calendar_fetch_failed",
                    f"Failed to fetch calendar {url}: {exc}",
                )
            )
            continue
        if resp.status_code >= 400 or not (resp.text or "").strip():
            calendar_failures += 1
            warnings.append(
                _warning(
                    "calendar_http_error",
                    f"Calendar {url} returned HTTP {resp.status_code}",
                )
            )
            continue
        _label, occs = parse_calendar_html(resp.text)
        for occ in occs:
            if start_date <= occ.local_date <= end_date:
                calendar_occurrences.append(occ)
                inspected_dates.add(occ.local_date)
        if sleep_seconds:
            time.sleep(sleep_seconds)

    # Unique WP ids in window (for film page fetch).
    wp_ids = sorted({occ.wp_film_id for occ in calendar_occurrences}, key=lambda x: int(x))
    film_by_wp: dict[str, ParsedFilmPage] = {}
    url_by_wp: dict[str, str] = {}

    for wp_id in wp_ids:
        try:
            film_url = resolve_film_url(fetch, wp_id)
        except Exception as exc:  # noqa: BLE001
            film_failures += 1
            rejected.append(
                _reject(
                    "film_url_resolve_failed",
                    f"Could not resolve film URL for wp id {wp_id}: {exc}",
                    source_value=wp_id,
                )
            )
            continue
        if not film_url:
            film_failures += 1
            rejected.append(
                _reject(
                    "film_url_missing",
                    f"No /film/ URL for wp id {wp_id}",
                    source_value=wp_id,
                )
            )
            continue
        url_by_wp[wp_id] = film_url

        # Prefer the calendar modal AJAX payload when available — the public
        # /film/ page can lag behind calendar announcements (verified live for
        # Hundreds of Beavers). Fall back to the film page HTML.
        page_html = ""
        page_status = 0
        ajax_url = (
            f"{GI_BASE}/wp-admin/admin-ajax.php"
            f"?action=cinema_theme_ajax_call&filmId={wp_id}"
        )
        try:
            ajax = fetch(ajax_url)
            if ajax.status_code < 400 and (ajax.text or "").strip():
                page_html = ajax.text
                page_status = ajax.status_code
        except Exception:  # noqa: BLE001
            page_html = ""

        if not page_html:
            try:
                page = fetch(film_url)
            except Exception as exc:  # noqa: BLE001
                film_failures += 1
                rejected.append(
                    _reject(
                        "film_page_fetch_failed",
                        f"Failed to fetch {film_url}: {exc}",
                        source_value=film_url,
                    )
                )
                continue
            page_html = page.text or ""
            page_status = page.status_code

        if page_status >= 400 or not page_html.strip():
            film_failures += 1
            rejected.append(
                _reject(
                    "film_page_http_error",
                    f"Film content for {film_url} returned HTTP {page_status}",
                    source_value=film_url,
                )
            )
            continue
        try:
            parsed = parse_film_page_html(
                page_html,
                page_url=film_url,
                theater_index=index,
            )
        except GrandIllusionPrototypeError as exc:
            film_failures += 1
            rejected.append(
                _reject(
                    "film_page_parse_failed",
                    str(exc),
                    source_value=film_url,
                )
            )
            continue
        # If AJAX/page slug disagrees with redirect slug, keep redirect identity.
        redirect_slug = film_slug_from_url(film_url)
        if redirect_slug and parsed.source_program_id != redirect_slug:
            parsed.source_program_id = redirect_slug
            parsed.source_program_url = film_url
        film_by_wp[wp_id] = parsed
        if sleep_seconds:
            time.sleep(sleep_seconds)

    # Emit programs + showtimes from film pages (authoritative occurrences),
    # filtered to the requested window. Calendar completeness is still
    # required for discovering which pages to fetch.
    for wp_id, parsed in film_by_wp.items():
        slug = parsed.source_program_id
        if slug not in programs:
            programs[slug] = {
                "contract_version": CONTRACT_VERSION,
                "source": SOURCE,
                "source_program_id": slug,
                "source_title": parsed.source_title,
                "source_program_url": parsed.source_program_url,
                "observed_at": observed_at,
                "raw": {
                    "wp_film_id": wp_id,
                    "director": parsed.director,
                    "year_raw": parsed.year_raw,
                    "runtime_min": parsed.runtime_min,
                    "format_raw": parsed.format_raw,
                    "screening_location_raw": parsed.screening_location_raw,
                    "ticket_url": parsed.ticket_url,
                    "poster_url": parsed.poster_url,
                },
            }

        if parsed.venue_unknown or not parsed.theater_id:
            rejected.append(
                _reject(
                    "unknown_or_missing_venue",
                    parsed.venue_reject_reason
                    or "Screening location could not be resolved to a registry theater.",
                    source_program_id=slug,
                    source_value=parsed.screening_location_raw,
                    affects_completeness=True,
                )
            )
            continue

        for local_date, local_time in parsed.showtimes:
            if local_date < start_date or local_date > end_date:
                continue
            showtime_id = composite_showtime_id(
                slug, parsed.theater_id, local_date, local_time
            )
            showtimes.append(
                {
                    "contract_version": CONTRACT_VERSION,
                    "source": SOURCE,
                    "source_program_id": slug,
                    "source_title": parsed.source_title,
                    "source_showtime_id": showtime_id,
                    "theater_id": parsed.theater_id,
                    "local_date": local_date.isoformat(),
                    "local_time": local_time,
                    "timezone": DEFAULT_TIMEZONE,
                    "source_occurrence_url": parsed.source_program_url,
                    "ticket_url": parsed.ticket_url,
                    "observed_at": observed_at,
                    "raw": {
                        "theater_name": parsed.theater_name,
                        "screening_location_raw": parsed.screening_location_raw,
                        "format_raw": parsed.format_raw,
                        "runtime_min": parsed.runtime_min,
                        "director": parsed.director,
                        "year_raw": parsed.year_raw,
                        "poster_url": parsed.poster_url,
                        "wp_film_id": wp_id,
                        "presenters": presenter_attribute(parsed.source_program_url),
                        "history_format": history_format_from_raw(parsed.format_raw),
                    },
                }
            )

    # Completeness: calendar fetch failures or unresolved film pages in window.
    completeness_rejects = [r for r in rejected if r.get("affects_completeness")]
    if calendar_failures and not calendar_occurrences and not showtimes:
        status = STATUS_REQUEST_FAILURE
        restate_safe = False
        inspected_complete = False
    elif calendar_failures or film_failures or completeness_rejects:
        status = STATUS_PARTIAL_FAILURE
        restate_safe = False
        inspected_complete = False
    elif not showtimes:
        # Valid empty only when calendars succeeded and window has no programs.
        status = STATUS_VALID_EMPTY if not calendar_failures else STATUS_STRUCTURAL_FAILURE
        restate_safe = status == STATUS_VALID_EMPTY
        inspected_complete = restate_safe
    else:
        status = STATUS_SUCCESS
        restate_safe = True
        inspected_complete = True

    inspected_start = start_date if inspected_complete else (
        min(inspected_dates) if inspected_dates else start_date
    )
    inspected_end = end_date if inspected_complete else (
        max(inspected_dates) if inspected_dates else end_date
    )

    result: dict[str, Any] = {
        "contract_version": CONTRACT_VERSION,
        "source": SOURCE,
        "scraped_at": observed_at,
        "requested_window": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "inspected_window": {
            "start": inspected_start.isoformat(),
            "end": inspected_end.isoformat(),
            "complete": inspected_complete,
        },
        "status": status,
        "restate_safe": restate_safe,
        "identity": {
            "program_strategy": "canonical_url_slug",
            "showtime_strategy": "composite_program_theater_datetime",
        },
        "structural_validation": {
            "passed": status
            in {STATUS_SUCCESS, STATUS_VALID_EMPTY, STATUS_PARTIAL_FAILURE},
            "checks": [
                {
                    "code": "calendar_data_filmid_discovery",
                    "passed": calendar_failures == 0 or bool(calendar_occurrences),
                    "severity": "error",
                },
                {
                    "code": "film_slug_identity",
                    "passed": bool(programs) or status == STATUS_VALID_EMPTY,
                    "severity": "error",
                },
            ],
        },
        "stats": {
            "calendar_months_attempted": len(months),
            "calendar_failures": calendar_failures,
            "calendar_occurrences_in_window": len(calendar_occurrences),
            "unique_wp_film_ids": len(wp_ids),
            "film_pages_parsed": len(film_by_wp),
            "film_failures": film_failures,
            "program_count": len(programs),
            "showtime_count": len(showtimes),
            "rejected_count": len(rejected),
        },
        "warnings": warnings,
        "rejected_observations": rejected,
        "programs": list(programs.values()),
        "showtimes": showtimes,
    }
    if status == STATUS_VALID_EMPTY:
        result["valid_empty_evidence"] = {
            "calendars_inspected": len(months) - calendar_failures,
            "occurrences_in_window": 0,
        }
    return result


def fixture_fetch_map(
    fixture_dir: str | Any,
    *,
    wp_id_to_slug: Mapping[str, str] | None = None,
) -> FetchFn:
    """Build a fetch fn from local calendar/film HTML fixtures.

    Expected files:
    - ``calendar_YYYY-MM.html`` for each month
    - ``film_{slug}.html`` for each program
    Optional ``wp_id_to_slug`` maps WordPress ids used in calendar buttons.
    """
    from pathlib import Path

    root = Path(fixture_dir)
    id_map = dict(wp_id_to_slug or {})

    def fetch(url: str) -> FetchResponse:
        parsed = urlparse(url)
        path = parsed.path or "/"
        query = parsed.query or ""

        if path.rstrip("/").endswith("/calendar") or path.endswith("/calendar/"):
            month = None
            for part in query.split("&"):
                if part.startswith("month="):
                    month = part.split("=", 1)[1]
            if not month:
                # default to first calendar fixture
                cals = sorted(root.glob("calendar_*.html"))
                if not cals:
                    return FetchResponse(url=url, status_code=404, text="")
                text = cals[0].read_text(encoding="utf-8")
                return FetchResponse(url=url, status_code=200, text=text, final_url=url)
            fname = root / f"calendar_{month}.html"
            if not fname.exists():
                return FetchResponse(url=url, status_code=404, text="")
            return FetchResponse(
                url=url,
                status_code=200,
                text=fname.read_text(encoding="utf-8"),
                final_url=url,
            )

        if path.startswith("/?p=") or (path == "/" and "p=" in query):
            # /?p=6945 style
            wp_id = None
            if "p=" in query:
                for part in query.split("&"):
                    if part.startswith("p="):
                        wp_id = part.split("=", 1)[1]
            slug = id_map.get(wp_id or "")
            if not slug:
                return FetchResponse(url=url, status_code=404, text="")
            final = f"{GI_BASE}/film/{slug}/"
            film_path = root / f"film_{slug}.html"
            if not film_path.exists():
                return FetchResponse(url=url, status_code=404, text="", final_url=final)
            return FetchResponse(
                url=url,
                status_code=200,
                text=film_path.read_text(encoding="utf-8"),
                final_url=final,
            )

        slug = film_slug_from_url(url)
        if slug:
            film_path = root / f"film_{slug}.html"
            if not film_path.exists():
                return FetchResponse(url=url, status_code=404, text="")
            return FetchResponse(
                url=url,
                status_code=200,
                text=film_path.read_text(encoding="utf-8"),
                final_url=canonicalize_film_url(url),
            )

        if "admin-ajax.php" in path or "cinema_theme_ajax_call" in query:
            wp_id = None
            for part in query.split("&"):
                if part.lower().startswith("filmid="):
                    wp_id = part.split("=", 1)[1]
            slug = id_map.get(wp_id or "")
            if not slug:
                return FetchResponse(url=url, status_code=404, text="")
            film_path = root / f"film_{slug}.html"
            if not film_path.exists():
                return FetchResponse(url=url, status_code=404, text="")
            return FetchResponse(
                url=url,
                status_code=200,
                text=film_path.read_text(encoding="utf-8"),
                final_url=url,
            )

        return FetchResponse(url=url, status_code=404, text="")

    return fetch


# Default WP id → slug map for current fixtures (live snapshot 2026-09-20).
FIXTURE_WP_ID_TO_SLUG = {
    "6945": "the-hole-in-35mm",
    "6931": "pulp-what-do-you-do-for-an-encore",
    "5868": "hundreds-of-beavers",
    "6923": "shu-lea-cheang-double-feature",
    "6826": "dont-play-with-fire-new-restoration",
    "7119": "television-terror-triple-feature-pizza-party-2",
}
