"""The Beacon indie cinema source adapter."""

from __future__ import annotations

import html as html_lib
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Callable
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

from reel_seattle.adapters.base import FetchContext, FetchResult, RawShowtime
from reel_seattle.adapters.indie_completeness import (
    STATUS_PARTIAL_FAILURE,
    STATUS_STRUCTURAL_FAILURE,
    decide_beacon_completeness,
)
from reel_seattle.adapters.indie_legacy import session_for_context
from reel_seattle.ingestion.independent_contract import normalize_exact_source_title
from reel_seattle.normalize.dates import format_date_csv
from reel_seattle.normalize.year_window import infer_year_for_month_day

BEACON_BASE_URL = "https://thebeacon.film"
BEACON_CALENDAR_URL = f"{BEACON_BASE_URL}/calendar"
BEACON_THEATER_NAME = "The Beacon"

_MONTH_NAMES = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}

# Current Astro film pages: "Fri, Aug 7 at 7:00 PM" (optional explicit year).
_NEW_SHOWTIME_RE = re.compile(
    r"(?P<weekday>[A-Za-z]+),\s+"
    r"(?P<month>[A-Za-z]+)\s+"
    r"(?P<day>\d{1,2})"
    r"(?:,\s*(?P<year>\d{4}))?"
    r"\s+at\s+"
    r"(?P<time>\d{1,2}:\d{2}\s*[AaPp][Mm])",
    re.IGNORECASE,
)

# Legacy film pages: "Wednesday, July 2 7:00PM"
_LEGACY_SHOWTIME_RE = re.compile(
    r"(?P<weekday>[A-Za-z]+),\s+"
    r"(?P<month>[A-Za-z]+)\s+"
    r"(?P<day>\d{1,2})"
    r"(?:,\s*(?P<year>\d{4}))?"
    r"\s+"
    r"(?P<time>\d{1,2}:\d{2}\s*[AaPp][Mm])",
    re.IGNORECASE,
)

_TITLE_SEPARATORS = (" | ", " — ", " – ", " - ")


@dataclass(frozen=True, slots=True)
class BeaconFilmParseResult:
    """Records and parse diagnostics for one Beacon film page."""

    records: list[RawShowtime]
    warnings: list[str]
    occurrence_failures: int = 0
    showtimes_seen: int = 0
    out_of_window_count: int = 0


def beacon_calendar_structure_present(html: str) -> bool:
    """Return True when calendar HTML contains expected Beacon calendar markers."""
    if not html or not str(html).strip():
        return False
    text = str(html)
    lowered = text.casefold()
    if "/calendar/movie/" in lowered or "cal-movie" in lowered or "cal-entry" in lowered:
        return True
    if "thebeacon.film/calendar" in lowered:
        return True
    return "calendar" in lowered and ("beacon" in lowered or "thebeacon" in lowered)


def canonicalize_beacon_movie_url(url: str) -> str | None:
    """Return canonical ``https://thebeacon.film/calendar/movie/{slug}`` without query."""
    absolute = urljoin(BEACON_BASE_URL + "/", str(url).strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.casefold()
    if host not in {"thebeacon.film", "www.thebeacon.film"}:
        return None
    match = re.search(r"/calendar/movie/([^/?#]+)", parsed.path)
    if not match:
        return None
    slug = match.group(1).strip()
    if not slug:
        return None
    return urlunparse(("https", "thebeacon.film", f"/calendar/movie/{slug}", "", "", ""))


def beacon_slug_from_url(url: str) -> str | None:
    """Extract the canonical movie slug from a Beacon film URL."""
    canonical = canonicalize_beacon_movie_url(url)
    if not canonical:
        return None
    return urlparse(canonical).path.rstrip("/").rsplit("/", 1)[-1]


def extract_beacon_movie_links(calendar_html: str) -> set[str]:
    """Extract canonical Beacon film page URLs from calendar page markup."""
    links: set[str] = set()
    patterns = (
        r"'(https://(?:www\.)?thebeacon\.film/calendar/movie/[^']+)'",
        r'"(https://(?:www\.)?thebeacon\.film/calendar/movie/[^"]+)"',
        r"'(/calendar/movie/[^']+)'",
        r'"(/calendar/movie/[^"]+)"',
        r"href=(['\"])(/calendar/movie/[^'\"]+)\1",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, calendar_html):
            raw = match.group(match.lastindex) if match.lastindex else match.group(0)
            canonical = canonicalize_beacon_movie_url(raw)
            if canonical:
                links.add(canonical)
    for path in re.findall(r"/calendar/movie/[A-Za-z0-9\-_%]+", calendar_html):
        canonical = canonicalize_beacon_movie_url(path)
        if canonical:
            links.add(canonical)
    return links


def _extract_beacon_title(soup: BeautifulSoup) -> str:
    h1 = soup.find("h1")
    if h1 is not None:
        text = normalize_exact_source_title(html_lib.unescape(h1.get_text(" ", strip=True)))
        if text:
            return text
    if soup.title and soup.title.string:
        raw = html_lib.unescape(str(soup.title.string))
        for separator in _TITLE_SEPARATORS:
            if separator in raw:
                raw = raw.split(separator)[0]
                break
        raw = re.split(r"\s+[|\u2014\u2013\-]\s+", raw, maxsplit=1)[0]
        text = normalize_exact_source_title(raw)
        if text:
            return text
    return "Unknown Movie"


def _extract_runtime(soup: BeautifulSoup) -> str:
    for div in soup.find_all("div", class_="w-8"):
        heading = div.find("h4")
        if heading is None or "Runtime" not in heading.get_text():
            continue
        paragraph = div.find("p")
        if paragraph is None:
            continue
        return paragraph.get_text(strip=True).replace(" minutes", "")
    return "Unknown"


def _format_beacon_time(raw_time: str) -> str | None:
    match = re.fullmatch(r"(\d{1,2}):(\d{2})\s*([AaPp][Mm])", raw_time.strip())
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    meridiem = match.group(3).upper()
    if hour < 1 or hour > 12 or minute > 59:
        return None
    return f"{hour}:{minute:02d}{meridiem}"


def _resolve_show_date(
    *,
    month: int,
    day: int,
    explicit_year: int | None,
    window_start: date,
    window_end: date,
    scrape_date: date,
) -> tuple[date | None, str | None, bool]:
    """Return ``(resolved_date, error_code, year_inferred)``."""
    if explicit_year is not None:
        try:
            resolved = date(explicit_year, month, day)
        except ValueError:
            return None, "malformed_date", False
        return resolved, None, False
    resolved, error = infer_year_for_month_day(
        month,
        day,
        window_start=window_start,
        window_end=window_end,
        scrape_date=scrape_date,
    )
    return resolved, error, True


def _parse_showtime_label(
    text: str,
    *,
    window_start: date,
    window_end: date,
    scrape_date: date,
) -> tuple[date | None, str | None, str, str | None, bool]:
    """Parse visible showtime text.

    Returns ``(local_date, time_raw, raw_date_text, error_code, year_inferred)``.
    """
    cleaned = normalize_exact_source_title(html_lib.unescape(text))
    match = _NEW_SHOWTIME_RE.search(cleaned) or _LEGACY_SHOWTIME_RE.search(cleaned)
    if not match:
        return None, None, cleaned, "malformed_date", False

    month_key = match.group("month").casefold()
    month = _MONTH_NAMES.get(month_key) or _MONTH_NAMES.get(month_key[:3])
    if not month:
        return None, None, cleaned, "malformed_date", False
    day = int(match.group("day"))
    year_raw = match.group("year")
    explicit_year = int(year_raw) if year_raw else None
    time_raw = _format_beacon_time(match.group("time"))
    if time_raw is None:
        return None, None, cleaned, "malformed_date", False

    raw_date_text = match.group(0)
    resolved, error, year_inferred = _resolve_show_date(
        month=month,
        day=day,
        explicit_year=explicit_year,
        window_start=window_start,
        window_end=window_end,
        scrape_date=scrape_date,
    )
    if error:
        return None, time_raw, raw_date_text, error, year_inferred
    assert resolved is not None
    if not (window_start <= resolved <= window_end):
        return None, time_raw, raw_date_text, "date_outside_window_or_unresolvable", year_inferred
    return resolved, time_raw, raw_date_text, None, year_inferred


def _iter_new_showtime_nodes(soup: BeautifulSoup):
    rows = soup.select("div.showtime-row")
    if rows:
        for row in rows:
            label_el = row.select_one(".showtime-datetime")
            button = row.select_one("a[data-inventory-id], a[data-catalog-id]")
            label = ""
            if label_el is not None:
                label = label_el.get_text(" ", strip=True)
            elif button is not None:
                label = str(button.get("data-showtime-label") or "")
            inventory_id = None
            if button is not None:
                inventory_id = button.get("data-inventory-id") or button.get("data-catalog-id")
            yield label, (str(inventory_id).strip() if inventory_id else None)
        return

    for button in soup.select("a[data-inventory-id], a[data-showtime-label]"):
        label = str(button.get("data-showtime-label") or button.get_text(" ", strip=True))
        inventory_id = button.get("data-inventory-id") or button.get("data-catalog-id")
        yield label, (str(inventory_id).strip() if inventory_id else None)


def _iter_legacy_showtime_nodes(soup: BeautifulSoup):
    for div in soup.find_all("div", class_="showtime_item transformer showtime_exists"):
        data_value = div.get("data-value")
        if not data_value:
            continue
        label = div.get_text(strip=True, separator=" ")
        # Legacy data-value is occurrence evidence only — not a durable source ID.
        yield label, None, str(data_value)


def parse_beacon_film_page(
    html: str,
    *,
    film_url: str = "",
    window_start: date | None = None,
    window_end: date | None = None,
    scrape_date: date | None = None,
    current_year: int | None = None,
) -> BeaconFilmParseResult:
    """Parse one Beacon film page HTML into RawShowtime records.

    ``current_year`` is accepted for call-site compatibility but is not used for
    silent year assignment. Year resolution is requested-window-aware.
    """
    del current_year  # Explicit: never assign run year unconditionally.
    scrape = scrape_date or date.today()
    start = window_start or scrape
    end = window_end or date(scrape.year, 12, 31)

    soup = BeautifulSoup(html, "html.parser")
    movie_title = _extract_beacon_title(soup)
    runtime = _extract_runtime(soup)
    canonical_url = canonicalize_beacon_movie_url(film_url) if film_url else None
    slug = beacon_slug_from_url(canonical_url) if canonical_url else None

    records: list[RawShowtime] = []
    warnings: list[str] = []
    failures = 0
    out_of_window = 0
    seen_ids: set[str] = set()

    new_nodes = list(_iter_new_showtime_nodes(soup))
    nodes: list[tuple[str, str | None, str | None]] = [
        (label, inventory_id, None) for label, inventory_id in new_nodes
    ]
    if not nodes:
        nodes = [
            (label, inventory_id, data_value)
            for label, inventory_id, data_value in _iter_legacy_showtime_nodes(soup)
        ]

    for label, inventory_id, legacy_data_value in nodes:
        local_date, time_raw, raw_date_text, error, year_inferred = _parse_showtime_label(
            label,
            window_start=start,
            window_end=end,
            scrape_date=scrape,
        )
        if error == "date_outside_window_or_unresolvable":
            out_of_window += 1
            continue
        if error:
            failures += 1
            warnings.append(
                f"Beacon date parse failed for {slug or film_url or 'film'}: "
                f"{raw_date_text!r} ({error})"
            )
            continue
        if local_date is None or time_raw is None:
            failures += 1
            warnings.append(
                f"Beacon date parse failed for {slug or film_url or 'film'}: {raw_date_text!r}"
            )
            continue

        if inventory_id and inventory_id in seen_ids:
            continue
        if inventory_id:
            seen_ids.add(inventory_id)

        attributes: dict[str, object] = {
            "raw_date_text": raw_date_text,
            "year_inferred": year_inferred,
        }
        if slug:
            attributes["source_film_id"] = slug
            attributes["source_program_id"] = slug
            attributes["beacon_slug"] = slug
        if canonical_url:
            attributes["canonical_program_url"] = canonical_url
        if inventory_id:
            attributes["source_showtime_id"] = inventory_id
            attributes["beacon_inventory_id"] = inventory_id
        elif legacy_data_value:
            attributes["beacon_data_value"] = legacy_data_value

        records.append(
            RawShowtime(
                theater_name_raw=BEACON_THEATER_NAME,
                date_raw=format_date_csv(local_date),
                time_raw=time_raw,
                title_raw=movie_title,
                runtime_raw=runtime,
                poster_url_raw=None,
                ticket_url_raw=None,
                source_showtime_id=inventory_id,
                source_film_url=canonical_url or (film_url or None),
                attributes=attributes,
            )
        )

    return BeaconFilmParseResult(
        records=records,
        warnings=warnings,
        occurrence_failures=failures,
        showtimes_seen=len(nodes),
        out_of_window_count=out_of_window,
    )


def fetch_beacon_showtimes(
    context: FetchContext,
    *,
    fetch_text_fn: Callable[[str], str | None] | None = None,
    current_year: int | None = None,
    sleep_seconds: float = 0,
) -> FetchResult:
    """Fetch and parse Beacon showtimes from the public website."""
    del current_year  # Kept for call-site compatibility; unused for year assignment.
    session = session_for_context(context)
    warnings: list[str] = []
    errors: list[str] = []

    def default_fetch(url: str) -> str | None:
        response = session.get(url)
        if response.status_code != 200:
            return None
        return response.text

    fetch_text = fetch_text_fn or default_fetch

    calendar_html = fetch_text(BEACON_CALENDAR_URL)
    if not calendar_html:
        completeness, completeness_warnings = decide_beacon_completeness(
            discovery_ok=False,
            expected_structure_present=False,
            discovered_programs=0,
            program_pages_succeeded=0,
            program_pages_failed=0,
            record_count=0,
            window_start=context.window_start,
            window_end=context.window_end,
            extra={"records_fetched": 0, "film_pages_scraped": 0},
        )
        warnings.append(f"Failed to fetch {BEACON_CALENDAR_URL}")
        warnings.extend(completeness_warnings)
        return FetchResult(
            records=[],
            stats=completeness,
            warnings=warnings,
            errors=errors,
        )

    structure_ok = beacon_calendar_structure_present(calendar_html)
    movie_links = sorted(extract_beacon_movie_links(calendar_html))
    records: list[RawShowtime] = []
    failed_urls: list[str] = []
    succeeded = 0
    occurrence_failures = 0
    showtimes_seen = 0
    out_of_window = 0

    for link in movie_links:
        film_html = fetch_text(link)
        if not film_html:
            warnings.append(f"Failed to fetch {link}")
            failed_urls.append(link)
            continue
        parsed = parse_beacon_film_page(
            film_html,
            film_url=link,
            window_start=context.window_start,
            window_end=context.window_end,
            scrape_date=context.run_date,
        )
        records.extend(parsed.records)
        warnings.extend(parsed.warnings)
        occurrence_failures += parsed.occurrence_failures
        showtimes_seen += parsed.showtimes_seen
        out_of_window += parsed.out_of_window_count
        succeeded += 1
        if sleep_seconds:
            time.sleep(sleep_seconds)

    completeness, completeness_warnings = decide_beacon_completeness(
        discovery_ok=True,
        expected_structure_present=structure_ok,
        discovered_programs=len(movie_links),
        program_pages_succeeded=succeeded,
        program_pages_failed=len(failed_urls),
        record_count=len(records),
        failed_program_urls=failed_urls,
        window_start=context.window_start,
        window_end=context.window_end,
        extra={
            "records_fetched": len(records),
            "film_pages_scraped": len(movie_links),
            "occurrence_parse_failures": occurrence_failures,
            "showtimes_seen": showtimes_seen,
            "out_of_window_showtimes": out_of_window,
        },
    )
    warnings.extend(completeness_warnings)

    if occurrence_failures > 0 and completeness.get("restate_safe") is True:
        completeness = {
            **completeness,
            "restate_safe": False,
            "scrape_status": STATUS_PARTIAL_FAILURE,
            "stale_retention_recommended": True,
            "inspected_scope_complete": False,
            "valid_empty_proof": False,
        }
        warnings.append(
            f"Beacon scrape partial: {occurrence_failures} showtime date(s) unresolved; "
            "retained prior future rows (restate blocked)."
        )
    elif (
        len(records) == 0
        and showtimes_seen > 0
        and occurrence_failures == 0
        and completeness.get("restate_safe") is True
    ):
        # Showtimes existed but all fell outside the requested window — not valid empty.
        completeness = {
            **completeness,
            "restate_safe": False,
            "scrape_status": STATUS_STRUCTURAL_FAILURE,
            "stale_retention_recommended": True,
            "inspected_scope_complete": False,
            "valid_empty_proof": False,
        }
        warnings.append(
            "Beacon scrape found showtimes only outside the requested window; "
            "retained prior future rows (restate blocked)."
        )

    return FetchResult(records=records, stats=completeness, warnings=warnings, errors=errors)


class BeaconAdapter:
    """Thin class wrapper around Beacon fetch helpers."""

    def fetch(self, context: FetchContext, **kwargs: object) -> FetchResult:
        return fetch_beacon_showtimes(context, **kwargs)

    @staticmethod
    def parse_film_page(
        html: str,
        *,
        film_url: str = "",
        window_start: date | None = None,
        window_end: date | None = None,
        scrape_date: date | None = None,
        current_year: int | None = None,
    ) -> list[RawShowtime]:
        return parse_beacon_film_page(
            html,
            film_url=film_url,
            window_start=window_start,
            window_end=window_end,
            scrape_date=scrape_date,
            current_year=current_year,
        ).records
