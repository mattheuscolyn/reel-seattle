"""The Beacon indie cinema source adapter."""

from __future__ import annotations

import re
import time
from typing import Callable

from bs4 import BeautifulSoup

from reel_seattle.adapters.base import FetchContext, FetchResult, RawShowtime
from reel_seattle.adapters.indie_completeness import decide_beacon_completeness
from reel_seattle.adapters.indie_legacy import format_indie_date, session_for_context

BEACON_CALENDAR_URL = "https://thebeacon.film/calendar"
BEACON_THEATER_NAME = "The Beacon"


def beacon_calendar_structure_present(html: str) -> bool:
    """Return True when calendar HTML contains expected Beacon calendar markers."""
    if not html or not str(html).strip():
        return False
    text = str(html)
    lowered = text.casefold()
    if "thebeacon.film/calendar" in lowered or "/calendar/movie/" in lowered:
        return True
    # Calendar shell without current movie links still references the calendar path.
    return "calendar" in lowered and ("beacon" in lowered or "thebeacon" in lowered)


def extract_beacon_movie_links(calendar_html: str) -> set[str]:
    """Extract Beacon film page URLs embedded in calendar page markup."""
    return set(re.findall(r"'(https://thebeacon\.film/calendar/movie/[^\']+)'", calendar_html))


def parse_beacon_film_page(html: str, *, current_year: int, film_url: str = "") -> list[RawShowtime]:
    """Parse one Beacon film page HTML into RawShowtime records."""
    soup = BeautifulSoup(html, "html.parser")
    if soup.title and soup.title.string:
        movie_title = soup.title.string.split(" | ")[0].title()
    else:
        movie_title = "Unknown Movie"

    runtime = next(
        (
            div.find("p").get_text(strip=True).replace(" minutes", "")
            for div in soup.find_all("div", class_="w-8")
            if div.find("h4") and "Runtime" in div.find("h4").text
        ),
        "Unknown",
    )

    records: list[RawShowtime] = []
    for div in soup.find_all("div", class_="showtime_item transformer showtime_exists"):
        if not div.get("data-value"):
            continue
        date_time_text = div.get_text(strip=True, separator=" ")
        date_part, showtime_time = date_time_text.rsplit(" ", 1)
        formatted_date = format_indie_date(date_part.split(",")[-1].strip(), current_year)
        if not formatted_date:
            continue
        records.append(
            RawShowtime(
                theater_name_raw=BEACON_THEATER_NAME,
                date_raw=formatted_date,
                time_raw=showtime_time,
                title_raw=movie_title,
                runtime_raw=runtime,
                poster_url_raw=None,
                source_film_url=film_url or None,
            )
        )

    return records


def fetch_beacon_showtimes(
    context: FetchContext,
    *,
    fetch_text_fn: Callable[[str], str | None] | None = None,
    current_year: int | None = None,
    sleep_seconds: float = 0,
) -> FetchResult:
    """Fetch and parse Beacon showtimes from the public website."""
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

    for link in movie_links:
        film_html = fetch_text(link)
        if not film_html:
            warnings.append(f"Failed to fetch {link}")
            failed_urls.append(link)
            continue
        records.extend(parse_beacon_film_page(film_html, current_year=year, film_url=link))
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
        },
    )
    warnings.extend(completeness_warnings)

    return FetchResult(records=records, stats=completeness, warnings=warnings, errors=errors)


class BeaconAdapter:
    """Thin class wrapper around Beacon fetch helpers."""

    def fetch(self, context: FetchContext, **kwargs: object) -> FetchResult:
        return fetch_beacon_showtimes(context, **kwargs)

    @staticmethod
    def parse_film_page(html: str, *, current_year: int, film_url: str = "") -> list[RawShowtime]:
        return parse_beacon_film_page(html, current_year=current_year, film_url=film_url)
