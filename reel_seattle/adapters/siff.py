"""SIFF cinema source adapter."""

from __future__ import annotations

import re
import time
from datetime import date
from typing import Callable

from bs4 import BeautifulSoup

from reel_seattle.adapters.base import FetchContext, FetchResult, RawShowtime
from reel_seattle.adapters.indie_completeness import decide_siff_completeness
from reel_seattle.adapters.indie_legacy import (
    SUPPORTED_SIFF_VENUES,
    format_indie_date,
    session_for_context,
)

SIFF_BASE_URL = "https://www.siff.net"
SIFF_IN_THEATERS_URL = f"{SIFF_BASE_URL}/cinema/in-theaters"


def siff_listing_structure_present(html: str) -> bool:
    """Return True when the listing page looks like the expected SIFF cinema markup."""
    if not html or not str(html).strip():
        return False
    text = str(html)
    if "/cinema/in-theaters/" in text or "/programs-and-events/" in text:
        return True
    # Empty-but-valid listing pages still reference the cinema section.
    lowered = text.casefold()
    return "in-theaters" in lowered or "siff" in lowered


def extract_siff_movie_links(html: str, *, base_url: str = SIFF_BASE_URL) -> set[str]:
    """Extract absolute film page URLs from a SIFF listing page."""
    soup = BeautifulSoup(html, "html.parser")
    links: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if href.startswith("/cinema/in-theaters/") or href.startswith("/programs-and-events/"):
            links.add(base_url + href)
    return links


def parse_siff_film_page(
    html: str,
    *,
    movie_url: str,
    current_year: int,
    base_url: str = SIFF_BASE_URL,
) -> list[RawShowtime]:
    """Parse one SIFF film page HTML into RawShowtime records."""
    soup = BeautifulSoup(html, "html.parser")
    movie_title = soup.title.string if soup.title else "Unknown Movie"
    movie_year = next(
        (int(match.group(1)) for match in re.finditer(r"(\d{4})", soup.text)),
        current_year,
    )

    runtime = "Unknown"
    runtime_p = soup.find("p", class_="small")
    if runtime_p:
        for span in runtime_p.find_all("span"):
            text = span.get_text(strip=True)
            if "min." in text:
                runtime = text.replace(" min.", "")
                break

    poster_image = None
    img_wrap = soup.find("p", class_="img-wrap")
    if img_wrap:
        img = img_wrap.find("img")
        if img and img.get("src"):
            poster_image = base_url + img["src"]

    records: list[RawShowtime] = []
    for day_div in soup.find_all("div", class_="day"):
        date_tag = day_div.find("p", class_="h3")
        if not date_tag:
            continue

        date_text = date_tag.get_text(strip=True)
        date_parts = date_text.split(", ")
        if len(date_parts) < 2:
            continue

        month_day = date_parts[1]
        year = int(date_parts[2]) if len(date_parts) > 2 else movie_year
        formatted_date = format_indie_date(month_day, year)
        if not formatted_date:
            continue

        for showtime_item in day_div.find_all("div", class_="item small-copy"):
            venue_h4 = showtime_item.find("h4")
            if venue_h4:
                venue_link = venue_h4.find("a")
                if venue_link:
                    venue_span = venue_link.find("span", class_="dark-gray-text")
                    venue = venue_span.get_text(strip=True) if venue_span else "Unknown Venue"
                else:
                    venue = venue_h4.get_text(strip=True)
            else:
                venue = "Unknown Venue"

            times: list[str] = []
            for anchor in showtime_item.find_all("a"):
                anchor_id = anchor.get("id")
                if anchor_id and anchor_id.startswith("screening-"):
                    time_text = anchor.get_text(strip=True)
                    if time_text:
                        times.append(time_text)

            for showtime_time in times:
                records.append(
                    RawShowtime(
                        theater_name_raw=venue,
                        date_raw=formatted_date,
                        time_raw=showtime_time,
                        title_raw=movie_title,
                        runtime_raw=runtime,
                        poster_url_raw=poster_image,
                        source_film_url=movie_url,
                    )
                )

    return records


def fetch_siff_showtimes(
    context: FetchContext,
    *,
    fetch_text_fn: Callable[[str], str | None] | None = None,
    current_year: int | None = None,
    sleep_seconds: float = 0,
) -> FetchResult:
    """Fetch and parse SIFF showtimes from the public website."""
    session = session_for_context(context)
    year = current_year or context.run_date.year
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
    movie_links = sorted(extract_siff_movie_links(listing_html))
    records: list[RawShowtime] = []
    failed_urls: list[str] = []
    succeeded = 0

    for movie_url in movie_links:
        film_html = fetch_text(movie_url)
        if not film_html:
            warnings.append(f"Failed to fetch {movie_url}")
            failed_urls.append(movie_url)
            continue
        records.extend(
            parse_siff_film_page(
                film_html,
                movie_url=movie_url,
                current_year=year,
            )
        )
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
        extra={
            "records_fetched": len(records),
            "film_pages_scraped": len(movie_links),
            "venues_found": sorted({record.theater_name_raw for record in records}),
        },
    )
    warnings.extend(completeness_warnings)

    return FetchResult(records=records, stats=completeness, warnings=warnings, errors=errors)


class SiffAdapter:
    """Thin class wrapper around SIFF fetch helpers."""

    def fetch(self, context: FetchContext, **kwargs: object) -> FetchResult:
        return fetch_siff_showtimes(context, **kwargs)

    @staticmethod
    def parse_film_page(html: str, *, movie_url: str, current_year: int) -> list[RawShowtime]:
        return parse_siff_film_page(html, movie_url=movie_url, current_year=current_year)

    @staticmethod
    def supported_venues() -> frozenset[str]:
        return SUPPORTED_SIFF_VENUES
