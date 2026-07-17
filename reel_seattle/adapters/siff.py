"""SIFF cinema source adapter."""

from __future__ import annotations

import html as html_lib
import json
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Callable
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, Tag

from reel_seattle.adapters.base import FetchContext, FetchResult, RawShowtime
from reel_seattle.adapters.indie_completeness import (
    STATUS_PARTIAL_FAILURE,
    decide_siff_completeness,
)
from reel_seattle.adapters.indie_legacy import SUPPORTED_SIFF_VENUES, session_for_context
from reel_seattle.ingestion.independent_contract import normalize_exact_source_title
from reel_seattle.normalize.dates import format_date_csv
from reel_seattle.normalize.year_window import infer_year_for_month_day

SIFF_BASE_URL = "https://www.siff.net"
SIFF_IN_THEATERS_URL = f"{SIFF_BASE_URL}/cinema/in-theaters"

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

_HOUSE_SUFFIX_RE = re.compile(r"\s+House\s+\d+\s*$", re.IGNORECASE)
_EMPTY_LISTING_RE = re.compile(
    r"(no\s+(films|movies|showtimes|programs)\s+(currently|scheduled|at\s+this\s+time))"
    r"|(currently\s+no\s+(films|movies|showtimes))"
    r"|(there\s+are\s+no\s+(films|movies|showtimes))",
    re.IGNORECASE,
)
_PAGE_KIND_PROGRAM = "program"
_PAGE_KIND_PARENT_EVENT = "parent_event"
_PAGE_KIND_EMPTY_PROGRAM = "empty_program"

_VENUE_TO_THEATER_ID = {
    "SIFF Cinema Downtown": "siff-cinema-downtown",
    "SIFF Cinema Uptown": "siff-cinema-uptown",
    "SIFF Film Center": "siff-film-center",
}


@dataclass(frozen=True, slots=True)
class SiffFilmParseResult:
    """Records and diagnostics for one SIFF program/detail page."""

    records: list[RawShowtime]
    warnings: list[str]
    occurrence_failures: int = 0
    page_kind: str = _PAGE_KIND_PROGRAM
    showtimes_seen: int = 0


def siff_listing_structure_present(html: str) -> bool:
    """Return True when the listing page looks like the expected SIFF cinema markup."""
    if not html or not str(html).strip():
        return False
    text = str(html)
    if "/cinema/in-theaters/" in text or "/programs-and-events/" in text:
        return True
    lowered = text.casefold()
    return "in-theaters" in lowered or ("siff" in lowered and "cinema" in lowered)


def siff_listing_affirmative_empty(html: str) -> bool:
    """Return True when listing HTML contains an explicit empty-schedule signal."""
    if not html or not str(html).strip():
        return False
    return _EMPTY_LISTING_RE.search(str(html)) is not None


def canonicalize_siff_program_url(url: str, *, base_url: str = SIFF_BASE_URL) -> str | None:
    """Return canonical absolute SIFF program URL without query/fragment."""
    absolute = urljoin(base_url.rstrip("/") + "/", str(url).strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.casefold()
    if host not in {"www.siff.net", "siff.net"}:
        return None
    path = parsed.path or "/"
    if not (
        path.startswith("/cinema/in-theaters/")
        or path.startswith("/programs-and-events/")
    ):
        return None
    # Drop trailing slash except for root-like paths we do not use.
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    if path in {"/cinema/in-theaters", "/programs-and-events"}:
        return None
    return urlunparse(("https", "www.siff.net", path, "", "", ""))


def siff_program_path_id(url: str, *, base_url: str = SIFF_BASE_URL) -> str | None:
    """Return durable program identity path without leading slash."""
    canonical = canonicalize_siff_program_url(url, base_url=base_url)
    if not canonical:
        return None
    path = urlparse(canonical).path.lstrip("/")
    return path or None


def extract_siff_movie_links(html: str, *, base_url: str = SIFF_BASE_URL) -> set[str]:
    """Extract canonical absolute film page URLs from a SIFF listing page."""
    soup = BeautifulSoup(html, "html.parser")
    links: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        canonical = canonicalize_siff_program_url(anchor["href"], base_url=base_url)
        if canonical:
            links.add(canonical)
    return links


def map_siff_venue_label(raw_venue: str) -> str | None:
    """Map a raw venue label to a supported SIFF theater name, or None if rejected."""
    text = normalize_exact_source_title(html_lib.unescape(str(raw_venue or "")))
    if not text:
        return None
    cleaned = _HOUSE_SUFFIX_RE.sub("", text).strip()
    by_casefold = {name.casefold(): name for name in SUPPORTED_SIFF_VENUES}
    return by_casefold.get(cleaned.casefold())


def _extract_siff_title(soup: BeautifulSoup) -> tuple[str | None, list[str]]:
    warnings: list[str] = []
    h1 = soup.find("h1")
    if h1 is not None:
        title = normalize_exact_source_title(html_lib.unescape(h1.get_text(" ", strip=True)))
        if title:
            return title, warnings
        warnings.append("SIFF page h1 was empty after cleanup")
    if soup.title and soup.title.string:
        warnings.append("SIFF page missing usable h1; falling back to document title")
        title = normalize_exact_source_title(html_lib.unescape(str(soup.title.string)))
        if title:
            return title, warnings
    return None, ["SIFF page missing trustworthy title"]


def _extract_runtime(soup: BeautifulSoup) -> str:
    runtime_p = soup.find("p", class_="small")
    if runtime_p:
        for span in runtime_p.find_all("span"):
            text = span.get_text(strip=True)
            if "min." in text:
                return text.replace(" min.", "")
    return "Unknown"


def _extract_poster(soup: BeautifulSoup, *, base_url: str) -> str | None:
    img_wrap = soup.find("p", class_="img-wrap")
    if not img_wrap:
        return None
    img = img_wrap.find("img")
    if img and img.get("src"):
        return urljoin(base_url.rstrip("/") + "/", img["src"])
    return None


def _parse_date_header(
    date_text: str,
    *,
    window_start: date,
    window_end: date,
    scrape_date: date,
) -> tuple[date | None, str | None, bool]:
    """Return ``(resolved_date, error_code, year_inferred)``."""
    cleaned = normalize_exact_source_title(html_lib.unescape(date_text))
    parts = [part.strip() for part in cleaned.split(",") if part.strip()]
    # Expected: Weekday, Month Day[, Year]
    if len(parts) < 2:
        return None, "malformed_date", False
    month_day = parts[1]
    month_match = re.fullmatch(r"([A-Za-z]+)\s+(\d{1,2})", month_day)
    if not month_match:
        return None, "malformed_date", False
    month_key = month_match.group(1).casefold()
    month = _MONTH_NAMES.get(month_key) or _MONTH_NAMES.get(month_key[:3])
    if not month:
        return None, "malformed_date", False
    day = int(month_match.group(2))
    explicit_year: int | None = None
    if len(parts) > 2:
        year_match = re.fullmatch(r"(\d{4})", parts[2])
        if not year_match:
            return None, "malformed_date", False
        explicit_year = int(year_match.group(1))

    if explicit_year is not None:
        try:
            resolved = date(explicit_year, month, day)
        except ValueError:
            return None, "malformed_date", False
        if not (window_start <= resolved <= window_end):
            return None, "date_outside_window_or_unresolvable", False
        return resolved, None, False

    resolved, error = infer_year_for_month_day(
        month,
        day,
        window_start=window_start,
        window_end=window_end,
        scrape_date=scrape_date,
    )
    if error:
        return None, error, True
    assert resolved is not None
    return resolved, None, True


def _extract_showtime_id(anchor: Tag) -> tuple[str | None, str | None]:
    """Return ``(showtime_id, conflict_error)`` from screening anchor evidence."""
    ids: list[str] = []
    anchor_id = str(anchor.get("id") or "").strip()
    if anchor_id.startswith("screening-") and len(anchor_id) > len("screening-"):
        ids.append(anchor_id[len("screening-") :])

    raw_json = anchor.get("data-screening")
    if raw_json:
        try:
            payload = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
        except (TypeError, json.JSONDecodeError, ValueError):
            payload = None
        if isinstance(payload, dict):
            showtime_id = payload.get("ShowtimeId") or payload.get("showtimeId")
            if showtime_id not in (None, ""):
                ids.append(str(showtime_id).strip())

    unique = []
    for value in ids:
        if value and value not in unique:
            unique.append(value)
    if len(unique) > 1:
        return None, "conflicting_showtime_id"
    if len(unique) == 1:
        return unique[0], None
    return None, None


def parse_siff_film_page(
    html: str,
    *,
    movie_url: str,
    window_start: date | None = None,
    window_end: date | None = None,
    scrape_date: date | None = None,
    current_year: int | None = None,
    base_url: str = SIFF_BASE_URL,
) -> SiffFilmParseResult:
    """Parse one SIFF film page HTML into RawShowtime records.

    ``current_year`` is accepted for call-site compatibility and is not used for
    page-wide year assignment.
    """
    del current_year
    scrape = scrape_date or date.today()
    start = window_start or scrape
    end = window_end or date(scrape.year, 12, 31)

    soup = BeautifulSoup(html, "html.parser")
    warnings: list[str] = []
    movie_title, title_warnings = _extract_siff_title(soup)
    warnings.extend(title_warnings)
    if not movie_title:
        return SiffFilmParseResult(
            records=[],
            warnings=warnings,
            occurrence_failures=1,
            page_kind=_PAGE_KIND_PROGRAM,
            showtimes_seen=0,
        )

    runtime = _extract_runtime(soup)
    poster_image = _extract_poster(soup, base_url=base_url)
    canonical_url = canonicalize_siff_program_url(movie_url, base_url=base_url)
    program_id = siff_program_path_id(canonical_url or movie_url, base_url=base_url)
    if not program_id:
        warnings.append(f"SIFF program URL could not be canonicalized: {movie_url}")
        return SiffFilmParseResult(
            records=[],
            warnings=warnings,
            occurrence_failures=1,
            page_kind=_PAGE_KIND_PROGRAM,
            showtimes_seen=0,
        )

    day_divs = soup.find_all("div", class_="day")
    path = urlparse(canonical_url or movie_url).path
    is_events_path = path.startswith("/programs-and-events/")
    if not day_divs:
        if is_events_path:
            warnings.append(
                f"SIFF parent/series page with no direct showtimes: {program_id}"
            )
            return SiffFilmParseResult(
                records=[],
                warnings=warnings,
                occurrence_failures=0,
                page_kind=_PAGE_KIND_PARENT_EVENT,
                showtimes_seen=0,
            )
        return SiffFilmParseResult(
            records=[],
            warnings=warnings,
            occurrence_failures=0,
            page_kind=_PAGE_KIND_EMPTY_PROGRAM,
            showtimes_seen=0,
        )

    records: list[RawShowtime] = []
    failures = 0
    showtimes_seen = 0
    seen_ids: dict[str, tuple[str, str, str]] = {}
    seen_null_keys: set[tuple[str, str, str]] = set()

    for day_div in day_divs:
        date_tag = day_div.find("p", class_="h3")
        if not date_tag:
            continue
        raw_date_text = date_tag.get_text(" ", strip=True)
        local_date, date_error, year_inferred = _parse_date_header(
            raw_date_text,
            window_start=start,
            window_end=end,
            scrape_date=scrape,
        )
        if date_error:
            screening_count = 0
            for item in day_div.find_all("div", class_="item small-copy"):
                screening_count += sum(
                    1
                    for a in item.find_all("a")
                    if str(a.get("id") or "").startswith("screening-")
                    or a.get("data-screening")
                )
            screening_count = max(screening_count, 1)
            showtimes_seen += screening_count
            failures += screening_count
            warnings.append(
                f"SIFF date parse failed for {program_id}: {raw_date_text!r} ({date_error})"
            )
            continue
        assert local_date is not None

        for showtime_item in day_div.find_all("div", class_="item small-copy"):
            venue_h4 = showtime_item.find("h4")
            raw_venue = ""
            if venue_h4:
                venue_link = venue_h4.find("a")
                if venue_link:
                    venue_span = venue_link.find("span", class_="dark-gray-text")
                    raw_venue = (
                        venue_span.get_text(" ", strip=True)
                        if venue_span
                        else venue_link.get_text(" ", strip=True)
                    )
                else:
                    raw_venue = venue_h4.get_text(" ", strip=True)
            mapped_venue = map_siff_venue_label(raw_venue)
            theater_id = _VENUE_TO_THEATER_ID.get(mapped_venue or "")

            anchors = [
                a
                for a in showtime_item.find_all("a")
                if str(a.get("id") or "").startswith("screening-") or a.get("data-screening")
            ]
            if not anchors:
                continue

            if mapped_venue is None:
                showtimes_seen += len(anchors)
                failures += len(anchors)
                warnings.append(
                    f"SIFF venue rejected for {program_id}: {raw_venue!r}"
                )
                continue

            for anchor in anchors:
                showtimes_seen += 1
                time_raw = normalize_exact_source_title(anchor.get_text(" ", strip=True))
                if not time_raw:
                    failures += 1
                    warnings.append(f"SIFF showtime missing time text for {program_id}")
                    continue
                showtime_id, id_error = _extract_showtime_id(anchor)
                if id_error:
                    failures += 1
                    warnings.append(
                        f"SIFF showtime identity conflict for {program_id}: {id_error}"
                    )
                    continue

                fact_key = (mapped_venue, format_date_csv(local_date), time_raw)
                if showtime_id:
                    prior = seen_ids.get(showtime_id)
                    if prior is not None:
                        if prior != fact_key:
                            failures += 1
                            warnings.append(
                                f"SIFF conflicting facts for ShowtimeId {showtime_id!r} "
                                f"on {program_id}"
                            )
                        continue
                    seen_ids[showtime_id] = fact_key
                else:
                    if fact_key in seen_null_keys:
                        continue
                    seen_null_keys.add(fact_key)
                    warnings.append(
                        f"SIFF showtime missing Elevent ShowtimeId for {program_id} "
                        f"on {raw_date_text} {time_raw}"
                    )

                attributes: dict[str, object] = {
                    "source_film_id": program_id,
                    "source_program_id": program_id,
                    "canonical_program_url": canonical_url,
                    "canonical_program_path": f"/{program_id}",
                    "raw_date_text": raw_date_text,
                    "year_inferred": year_inferred,
                    "raw_venue_text": raw_venue,
                    "theater_id": theater_id,
                    "exact_h1_title": movie_title,
                }
                if showtime_id:
                    attributes["source_showtime_id"] = showtime_id
                    attributes["elevent_showtime_id"] = showtime_id
                    data_screening = anchor.get("data-screening")
                    if data_screening:
                        attributes["raw_data_screening"] = str(data_screening)

                records.append(
                    RawShowtime(
                        theater_name_raw=mapped_venue,
                        date_raw=format_date_csv(local_date),
                        time_raw=time_raw,
                        title_raw=movie_title,
                        runtime_raw=runtime,
                        poster_url_raw=poster_image,
                        ticket_url_raw=None,
                        source_showtime_id=showtime_id,
                        source_film_url=canonical_url,
                        attributes=attributes,
                    )
                )

    page_kind = _PAGE_KIND_PROGRAM
    if not records and not showtimes_seen:
        page_kind = _PAGE_KIND_EMPTY_PROGRAM

    return SiffFilmParseResult(
        records=records,
        warnings=warnings,
        occurrence_failures=failures,
        page_kind=page_kind,
        showtimes_seen=showtimes_seen,
    )


def fetch_siff_showtimes(
    context: FetchContext,
    *,
    fetch_text_fn: Callable[[str], str | None] | None = None,
    current_year: int | None = None,
    sleep_seconds: float = 0,
) -> FetchResult:
    """Fetch and parse SIFF showtimes from the public website."""
    del current_year
    session = session_for_context(context)
    warnings: list[str] = []
    errors: list[str] = []

    def default_fetch(url: str) -> str | None:
        response = session.get(url)
        if response.status_code != 200:
            return None
        return response.text

    fetch_text = fetch_text_fn or default_fetch

    listing_html = fetch_text(SIFF_IN_THEATERS_URL)
    if not listing_html:
        completeness, completeness_warnings = decide_siff_completeness(
            discovery_ok=False,
            expected_structure_present=False,
            discovered_programs=0,
            program_pages_succeeded=0,
            program_pages_failed=0,
            record_count=0,
            window_start=context.window_start,
            window_end=context.window_end,
            extra={"records_fetched": 0, "film_pages_scraped": 0, "venues_found": []},
        )
        warnings.append(f"Failed to fetch {SIFF_IN_THEATERS_URL}")
        warnings.extend(completeness_warnings)
        return FetchResult(
            records=[],
            stats=completeness,
            warnings=warnings,
            errors=errors,
        )

    structure_ok = siff_listing_structure_present(listing_html)
    affirmative_empty = siff_listing_affirmative_empty(listing_html)
    movie_links = sorted(extract_siff_movie_links(listing_html))
    records: list[RawShowtime] = []
    failed_urls: list[str] = []
    succeeded = 0
    occurrence_failures = 0
    parent_event_pages = 0
    empty_program_pages = 0

    for movie_url in movie_links:
        film_html = fetch_text(movie_url)
        if not film_html:
            warnings.append(f"Failed to fetch {movie_url}")
            failed_urls.append(movie_url)
            continue
        parsed = parse_siff_film_page(
            film_html,
            movie_url=movie_url,
            window_start=context.window_start,
            window_end=context.window_end,
            scrape_date=context.run_date,
        )
        records.extend(parsed.records)
        warnings.extend(parsed.warnings)
        occurrence_failures += parsed.occurrence_failures
        if parsed.page_kind == _PAGE_KIND_PARENT_EVENT:
            parent_event_pages += 1
        elif parsed.page_kind == _PAGE_KIND_EMPTY_PROGRAM and not parsed.records:
            empty_program_pages += 1
        succeeded += 1
        if sleep_seconds:
            time.sleep(sleep_seconds)

    completeness, completeness_warnings = decide_siff_completeness(
        discovery_ok=True,
        expected_structure_present=structure_ok,
        discovered_programs=len(movie_links),
        program_pages_succeeded=succeeded,
        program_pages_failed=len(failed_urls),
        record_count=len(records),
        failed_program_urls=failed_urls,
        window_start=context.window_start,
        window_end=context.window_end,
        affirmative_empty_proof=affirmative_empty,
        extra={
            "records_fetched": len(records),
            "film_pages_scraped": len(movie_links),
            "venues_found": sorted({record.theater_name_raw for record in records}),
            "occurrence_parse_failures": occurrence_failures,
            "parent_event_pages": parent_event_pages,
            "empty_program_pages": empty_program_pages,
            "listing_affirmative_empty": affirmative_empty,
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
            f"SIFF scrape partial: {occurrence_failures} showtime occurrence(s) unresolved; "
            "retained prior future rows (restate blocked)."
        )

    return FetchResult(records=records, stats=completeness, warnings=warnings, errors=errors)


class SiffAdapter:
    """Thin class wrapper around SIFF fetch helpers."""

    def fetch(self, context: FetchContext, **kwargs: object) -> FetchResult:
        return fetch_siff_showtimes(context, **kwargs)

    @staticmethod
    def parse_film_page(
        html: str,
        *,
        movie_url: str,
        window_start: date | None = None,
        window_end: date | None = None,
        scrape_date: date | None = None,
        current_year: int | None = None,
    ) -> list[RawShowtime]:
        return parse_siff_film_page(
            html,
            movie_url=movie_url,
            window_start=window_start,
            window_end=window_end,
            scrape_date=scrape_date,
            current_year=current_year,
        ).records

    @staticmethod
    def supported_venues() -> frozenset[str]:
        return SUPPORTED_SIFF_VENUES
