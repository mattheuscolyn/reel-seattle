"""Central Cinema ingestion prototype (non-production).

Emits IndependentSourceResult v1.0.0.

Calendar discovers canonical ``/movie/`` pages; each movie page is authoritative
for schema.org metadata and checkout showtimes.
"""

from __future__ import annotations

import html as html_lib
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Callable, Mapping
from urllib.parse import urljoin, urlparse, urlunparse
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
from reel_seattle.normalize.year_window import infer_year_for_month_day
from reel_seattle.prototypes.nwff import sanitize_description_html

SOURCE = "central_cinema"
CENTRAL_BASE = "https://central-cinema.com"
CALENDAR_PATH = "/calendar/"
PLANNED_THEATER_ID = "central-cinema"
PLANNED_THEATER_NAME = "Central Cinema"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)

USER_AGENT = (
    "ReelSeattle-CentralCinema-Prototype/0.1 "
    "(+https://github.com/mattheuscolyn/reel-seattle; research)"
)

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

_ISO_DURATION_RE = re.compile(
    r"^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$",
    flags=re.I,
)
_MINUTES_RE = re.compile(r"^(\d+)\s*(?:min(?:ute)?s?)?$", flags=re.I)
_CHECKOUT_RE = re.compile(
    r"/checkout/showing/([a-zA-Z0-9\-]+)/(\d+)/?",
    flags=re.I,
)
_SHOWING_TEXT_RE = re.compile(
    r"^\s*"
    r"(?P<month>[A-Za-z]+)\s+"
    r"(?P<day>\d{1,2})"
    r"(?:,\s*(?P<year>\d{4}))?"
    r",?\s+"
    r"(?P<time>.+?)"
    r"\s*$",
)
_TIME_RE = re.compile(
    r"^\s*"
    r"(?P<hour>\d{1,2})"
    r"(?::|\.)"
    r"(?P<minute>\d{2})"
    r"\s*"
    r"(?P<ampm>a\.?m\.?|p\.?m\.?)"
    r"\s*$",
    flags=re.I,
)
_NOON_RE = re.compile(r"^\s*noon\s*$", flags=re.I)
_MIDNIGHT_RE = re.compile(r"^\s*midnight\s*$", flags=re.I)


class CentralCinemaPrototypeError(ValueError):
    """Raised for invalid prototype inputs."""


@dataclass
class FetchResponse:
    url: str
    status_code: int
    text: str | None


FetchFn = Callable[[str], FetchResponse]


@dataclass
class DiscoveredMovieLink:
    raw_url: str
    canonical_url: str
    slug: str
    calendar_title: str
    calendar_page_url: str


@dataclass
class CheckoutShowing:
    slug: str
    showing_id: str
    display_text: str
    ticket_url: str
    local_date: date | None = None
    local_time: str | None = None  # HH:MM
    year_inferred: bool = False
    parse_error: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class MoviePageData:
    url: str
    slug: str
    fetch_ok: bool
    structure_ok: bool
    source_title: str | None = None
    schema_org: dict[str, Any] = field(default_factory=dict)
    description_text: str | None = None
    description_paragraphs: list[str] = field(default_factory=list)
    runtime_min: int | None = None
    duration_raw: str | None = None
    release_year: int | None = None
    image_url: str | None = None
    showings: list[CheckoutShowing] = field(default_factory=list)
    location_name: str | None = None
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

    def _fetch(url: str) -> FetchResponse:
        parsed = urlparse(url)
        candidates = [
            url,
            urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", parsed.query, "")),
            urlunparse(("https", "central-cinema.com", parsed.path, "", "", "")),
            urlunparse(("https", "www.central-cinema.com", parsed.path, "", "", "")),
            parsed.path + (("?" + parsed.query) if parsed.query else ""),
            parsed.path,
            parsed.path.rstrip("/") + "/",
            parsed.path.rstrip("/"),
        ]
        for key in candidates:
            if key in pages:
                return FetchResponse(url=url, status_code=200, text=pages[key])
        # Slug-based movie lookup.
        if "/movie/" in parsed.path:
            slug = parsed.path.strip("/").split("/")[-1]
            for key, html in pages.items():
                if f"/movie/{slug}" in key or key.endswith(f"{slug}.html"):
                    return FetchResponse(url=url, status_code=200, text=html)
        if "calendar" in parsed.path.casefold():
            for key, html in pages.items():
                if "calendar" in key.casefold():
                    return FetchResponse(url=url, status_code=200, text=html)
        return FetchResponse(url=url, status_code=404, text=None)

    return _fetch


def calendar_url() -> str:
    return urljoin(CENTRAL_BASE, CALENDAR_PATH)


def canonical_movie_url(url: str, *, base: str = CENTRAL_BASE) -> str | None:
    absolute = urljoin(base, url.strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.casefold()
    if host not in {"central-cinema.com", "www.central-cinema.com"}:
        return None
    path = parsed.path.rstrip("/") + "/"
    match = re.fullmatch(r"/movie/([a-zA-Z0-9\-]+)/", path)
    if not match:
        return None
    return urlunparse(("https", "central-cinema.com", path, "", "", ""))


def movie_slug_from_url(url: str) -> str | None:
    canonical = canonical_movie_url(url)
    if not canonical:
        return None
    return urlparse(canonical).path.strip("/").split("/")[-1]


def calendar_structure_present(html: str) -> bool:
    """Affirmative Central calendar structure (SPA shell and/or movie directory)."""
    if not html or not html.strip():
        return False
    soup = BeautifulSoup(html, "html.parser")
    if soup.select_one("#q-app"):
        return True
    text = soup.get_text(" ", strip=True).casefold()
    if "explore movies" in text:
        return True
    if soup.find("a", href=re.compile(r"/movie/", re.I)):
        return True
    title = (soup.title.get_text(" ", strip=True) if soup.title else "").casefold()
    return "central cinema" in title and "calendar" in title


def discover_movie_links(
    html: str,
    *,
    calendar_page_url: str,
) -> tuple[list[DiscoveredMovieLink], list[str]]:
    """Discover unique canonical ``/movie/`` links from the calendar page."""
    warnings: list[str] = []
    soup = BeautifulSoup(html, "html.parser")
    by_slug: dict[str, DiscoveredMovieLink] = {}
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        canonical = canonical_movie_url(href, base=calendar_page_url)
        if not canonical:
            continue
        slug = movie_slug_from_url(canonical)
        if not slug:
            continue
        title = normalize_exact_source_title(anchor.get_text(" ", strip=True))
        existing = by_slug.get(slug)
        if existing is None:
            by_slug[slug] = DiscoveredMovieLink(
                raw_url=href,
                canonical_url=canonical,
                slug=slug,
                calendar_title=title,
                calendar_page_url=calendar_page_url,
            )
            continue
        if title and existing.calendar_title and title != existing.calendar_title:
            warnings.append(
                f"conflicting calendar titles for slug {slug!r}: "
                f"{existing.calendar_title!r} vs {title!r}"
            )
    return list(by_slug.values()), warnings


def parse_schema_duration(value: str | None) -> tuple[int | None, str | None]:
    """Return ``(runtime_min, error_code)``. Error only when value present but unusable."""
    if value is None:
        return None, None
    raw = html_lib.unescape(str(value)).strip()
    if not raw:
        return None, None
    iso = _ISO_DURATION_RE.fullmatch(raw.replace(" ", ""))
    if iso:
        hours = int(iso.group(1) or 0)
        minutes = int(iso.group(2) or 0)
        seconds = int(iso.group(3) or 0)
        total = hours * 60 + minutes + (1 if seconds >= 30 else 0)
        if total > 0:
            return total, None
        return None, "malformed_duration"
    minutes_match = _MINUTES_RE.fullmatch(raw)
    if minutes_match:
        return int(minutes_match.group(1)), None
    # e.g. "138 minutes"
    words = re.fullmatch(r"(\d+)\s+minutes?", raw, flags=re.I)
    if words:
        return int(words.group(1)), None
    return None, "malformed_duration"


def parse_local_time(token: str) -> str | None:
    """Parse visible time into ``HH:MM``; reject malformed values."""
    text = token.strip()
    if _NOON_RE.fullmatch(text):
        return "12:00"
    if _MIDNIGHT_RE.fullmatch(text):
        return "00:00"
    match = _TIME_RE.fullmatch(text)
    if not match:
        return None
    hour = int(match.group("hour"))
    minute = int(match.group("minute"))
    ampm = re.sub(r"\.", "", match.group("ampm")).casefold()
    if hour < 1 or hour > 12 or minute > 59:
        return None
    if ampm.startswith("p") and hour != 12:
        hour += 12
    if ampm.startswith("a") and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def parse_showing_display_text(
    text: str,
    *,
    window_start: date,
    window_end: date,
    scrape_date: date,
) -> tuple[date | None, str | None, bool, str | None]:
    """Parse checkout-link text into date/time.

    Returns ``(local_date, local_time, year_inferred, error_code)``.
    """
    cleaned = normalize_exact_source_title(html_lib.unescape(text))
    match = _SHOWING_TEXT_RE.fullmatch(cleaned)
    if not match:
        return None, None, False, "malformed_showing_text"
    month_key = match.group("month").casefold()
    month = _MONTHS.get(month_key) or _MONTHS.get(month_key[:3])
    if not month:
        return None, None, False, "malformed_showing_text"
    day = int(match.group("day"))
    year_raw = match.group("year")
    local_time = parse_local_time(match.group("time"))
    if local_time is None:
        return None, None, False, "malformed_time"

    if year_raw:
        try:
            local_date = date(int(year_raw), month, day)
        except ValueError:
            return None, None, False, "malformed_showing_text"
        return local_date, local_time, False, None

    local_date, error = infer_year_for_month_day(
        month,
        day,
        window_start=window_start,
        window_end=window_end,
        scrape_date=scrape_date,
    )
    if error:
        return None, local_time, False, error
    return local_date, local_time, True, None


def canonicalize_checkout_url(url: str, *, base: str = CENTRAL_BASE) -> str | None:
    absolute = urljoin(base, url.strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.casefold()
    if host not in {"central-cinema.com", "www.central-cinema.com"}:
        return None
    match = _CHECKOUT_RE.search(parsed.path)
    if not match:
        return None
    slug, showing_id = match.group(1), match.group(2)
    path = f"/checkout/showing/{slug}/{showing_id}"
    return urlunparse(("https", "www.central-cinema.com", path, "", "", ""))


def extract_checkout_showings(
    html: str,
    *,
    page_url: str,
    expected_slug: str,
    window_start: date,
    window_end: date,
    scrape_date: date,
) -> list[CheckoutShowing]:
    soup = BeautifulSoup(html, "html.parser")
    showings: list[CheckoutShowing] = []
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        if "/checkout/showing/" not in href:
            continue
        display = normalize_exact_source_title(anchor.get_text(" ", strip=True))
        canonical = canonicalize_checkout_url(href, base=page_url)
        match = _CHECKOUT_RE.search(urlparse(href).path if not canonical else urlparse(canonical).path)
        if match is None:
            showings.append(
                CheckoutShowing(
                    slug=expected_slug,
                    showing_id="",
                    display_text=display,
                    ticket_url=href,
                    parse_error="malformed_showing_url",
                    raw={"href": href, "display_text": display},
                )
            )
            continue
        slug, showing_id = match.group(1), match.group(2)
        local_date, local_time, year_inferred, error = parse_showing_display_text(
            display,
            window_start=window_start,
            window_end=window_end,
            scrape_date=scrape_date,
        )
        showings.append(
            CheckoutShowing(
                slug=slug,
                showing_id=str(showing_id),
                display_text=display,
                ticket_url=canonical or href,
                local_date=local_date,
                local_time=local_time,
                year_inferred=year_inferred,
                parse_error=error,
                raw={
                    "href": href,
                    "display_text": display,
                    "checkout_showing_segment": str(showing_id),
                    "year_rollover_inferred": year_inferred,
                    "source_display_date": display,
                },
            )
        )
    return showings


def _itemprop_inner_html(el: Any) -> str:
    return "".join(str(child) for child in el.children)


def _itemprop_values(root: Any, prop: str, *, prefer_html: bool = False) -> list[str]:
    values: list[str] = []
    for el in root.find_all(attrs={"itemprop": prop}):
        # Nested Person ``name`` is collected via actor/director containers.
        if prop == "name":
            parent = el.parent
            if parent is not None and parent.get("itemprop") in {
                "actor",
                "director",
                "author",
                "producer",
            }:
                continue
        content = el.get("content")
        if content is not None and str(content).strip():
            values.append(html_lib.unescape(str(content).strip()))
            continue
        for attr in ("href", "src"):
            if el.get(attr):
                values.append(str(el.get(attr)).strip())
                break
        else:
            if prefer_html:
                html_fragment = _itemprop_inner_html(el).strip()
                if html_fragment:
                    values.append(html_fragment)
                    continue
            text = el.get_text(" ", strip=True)
            if text:
                values.append(html_lib.unescape(text))
    return values


def _person_names(root: Any, prop: str) -> list[str]:
    names: list[str] = []
    for el in root.find_all(attrs={"itemprop": prop}):
        nested = el.find(attrs={"itemprop": "name"})
        if nested is not None:
            text = nested.get("content") or nested.get_text(" ", strip=True)
        else:
            text = el.get("content") or el.get_text(" ", strip=True)
        text = html_lib.unescape(str(text or "").strip())
        if text:
            names.append(text)
    return names


def parse_movie_page(
    html: str,
    *,
    page_url: str,
    slug: str,
    window_start: date,
    window_end: date,
    scrape_date: date,
) -> MoviePageData:
    soup = BeautifulSoup(html, "html.parser")
    movie = soup.find(attrs={"itemtype": re.compile(r"Movie", re.I)})
    structure_ok = movie is not None
    data = MoviePageData(
        url=page_url,
        slug=slug,
        fetch_ok=True,
        structure_ok=structure_ok,
    )
    if not structure_ok:
        data.warning = "movie_page_schema_org_missing"
        data.showings = extract_checkout_showings(
            html,
            page_url=page_url,
            expected_slug=slug,
            window_start=window_start,
            window_end=window_end,
            scrape_date=scrape_date,
        )
        return data

    schema: dict[str, Any] = {}
    names = _itemprop_values(movie, "name")
    if names:
        schema["name"] = names[0]
        data.source_title = normalize_exact_source_title(names[0])

    descriptions = _itemprop_values(movie, "description", prefer_html=True)
    if descriptions:
        # Description often contains HTML entities / tags in content attr.
        raw_desc = descriptions[0]
        schema["description"] = raw_desc
        paragraphs = sanitize_description_html(raw_desc)
        if not paragraphs and raw_desc.strip():
            # Plain text after unescape.
            plain = BeautifulSoup(html_lib.unescape(raw_desc), "html.parser").get_text(
                "\n", strip=True
            )
            paragraphs = [p for p in (line.strip() for line in plain.splitlines()) if p]
        data.description_paragraphs = paragraphs
        data.description_text = "\n\n".join(paragraphs) if paragraphs else None

    for prop in ("genre", "contentRating", "countryOfOrigin", "dateCreated"):
        values = _itemprop_values(movie, prop)
        if values:
            schema[prop] = values[0] if len(values) == 1 else values

    languages = _itemprop_values(movie, "inLanguage") or _itemprop_values(movie, "originalLanguage")
    if languages:
        schema["inLanguage"] = languages[0] if len(languages) == 1 else languages
        schema["language_source_property"] = (
            "inLanguage" if _itemprop_values(movie, "inLanguage") else "originalLanguage"
        )

    durations = _itemprop_values(movie, "duration")
    if durations:
        schema["duration"] = durations[0]
        data.duration_raw = durations[0]
        runtime, duration_error = parse_schema_duration(durations[0])
        data.runtime_min = runtime
        if duration_error:
            data.warning = duration_error

    images = _itemprop_values(movie, "image") or _itemprop_values(movie, "thumbnailUrl")
    if images:
        schema["image"] = images[0]
        data.image_url = images[0]

    cast = _person_names(movie, "actor")
    directors = _person_names(movie, "director")
    writers = _person_names(movie, "author")
    producers = _person_names(movie, "producer")
    if cast:
        schema["actor"] = cast
    if directors:
        schema["director"] = directors
    if writers:
        schema["author"] = writers
    if producers:
        schema["producer"] = producers

    # dateCreated is site-record metadata only — never release year.
    date_created = schema.get("dateCreated")
    data.release_year = None
    # Optional explicit film year via dedicated non-dateCreated property only.
    for prop in ("copyrightYear",):
        values = _itemprop_values(movie, prop)
        if values:
            schema[prop] = values[0]
            try:
                year = int(str(values[0]).strip()[:4])
                if 1888 <= year <= 2100:
                    data.release_year = year
            except ValueError:
                pass

    data.schema_org = schema
    data.raw = {
        "schema_org": schema,
        "dateCreated": date_created,
        "release_year": data.release_year,
        "description_text": data.description_text,
        "description_paragraphs": list(data.description_paragraphs),
        "duration_raw": data.duration_raw,
        "runtime_min": data.runtime_min,
        "directors": directors,
        "cast": cast,
        "writers": writers,
        "producers": producers,
        "image_url": data.image_url,
        "prototype_theater_id": PLANNED_THEATER_ID,
        "theater_id_production_enabled": False,
    }
    data.showings = extract_checkout_showings(
        html,
        page_url=page_url,
        expected_slug=slug,
        window_start=window_start,
        window_end=window_end,
        scrape_date=scrape_date,
    )
    return data


def summarize_result(result: Mapping[str, Any]) -> dict[str, Any]:
    stats = result.get("stats") if isinstance(result.get("stats"), Mapping) else {}
    return {
        "source": result.get("source"),
        "status": result.get("status"),
        "restate_safe": result.get("restate_safe"),
        "requested_window": result.get("requested_window"),
        "inspected_window": result.get("inspected_window"),
        "calendar_pages_succeeded": stats.get("calendar_pages_succeeded"),
        "discovered_movie_pages": stats.get("discovered_programs"),
        "movie_pages_succeeded": stats.get("program_pages_succeeded"),
        "movie_pages_failed": stats.get("program_pages_failed"),
        "accepted_programs": len(result.get("programs") or []),
        "accepted_showtimes": len(result.get("showtimes") or []),
        "rejected_observations": len(result.get("rejected_observations") or []),
        "warning_count": len(result.get("warnings") or []),
        "showing_id_coverage": stats.get("showing_id_coverage"),
        "ticket_url_coverage": stats.get("ticket_url_coverage"),
        "prototype_theater_id": PLANNED_THEATER_ID,
    }


def build_central_cinema_result(
    *,
    start_date: date,
    end_date: date,
    fetch: FetchFn,
    scraped_at: str | None = None,
    sleep_seconds: float = 0.0,
    scrape_date: date | None = None,
) -> dict[str, Any]:
    """Fetch/parse Central Cinema and return a contract-shaped result dict."""
    if end_date < start_date:
        raise CentralCinemaPrototypeError("end_date must be >= start_date")

    stamp = scraped_at or datetime.now(PACIFIC).isoformat(timespec="seconds")
    scrape_day = scrape_date or date.fromisoformat(stamp[:10])
    warnings: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    checks: list[dict[str, Any]] = []
    stats: dict[str, Any] = {
        "calendar_pages_attempted": 0,
        "calendar_pages_succeeded": 0,
        "calendar_pages_failed": 0,
        "discovered_programs": 0,
        "program_pages_attempted": 0,
        "program_pages_succeeded": 0,
        "program_pages_failed": 0,
        "accepted_showtimes": 0,
        "rejected_entries": 0,
        "malformed_showings": 0,
        "showing_id_coverage": 0,
        "ticket_url_coverage": 0,
        "prototype_theater_id": PLANNED_THEATER_ID,
        "theater_id_production_enabled": False,
    }

    cal_url = calendar_url()
    stats["calendar_pages_attempted"] = 1
    calendar_response = fetch(cal_url)
    if calendar_response.status_code != 200 or not calendar_response.text:
        stats["calendar_pages_failed"] = 1
        checks.append(
            {
                "code": "calendar_request",
                "passed": False,
                "severity": "error",
                "message": f"Calendar request failed for {cal_url}",
            }
        )
        return {
            "contract_version": CONTRACT_VERSION,
            "source": SOURCE,
            "scraped_at": stamp,
            "requested_window": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "inspected_window": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "complete": False,
            },
            "status": STATUS_REQUEST_FAILURE,
            "restate_safe": False,
            "identity": {
                "program_strategy": "canonical_url_slug",
                "showtime_strategy": "source_showing_id",
            },
            "structural_validation": {"passed": False, "checks": checks},
            "stats": stats,
            "warnings": warnings,
            "rejected_observations": rejected,
            "programs": [],
            "showtimes": [],
            "valid_empty_evidence": {"proven": False},
        }

    structure_ok = calendar_structure_present(calendar_response.text)
    checks.append(
        {
            "code": "calendar_structure_present",
            "passed": structure_ok,
            "severity": "error",
            "message": None if structure_ok else f"Missing calendar structure on {cal_url}",
        }
    )
    if not structure_ok:
        stats["calendar_pages_failed"] = 1
        return {
            "contract_version": CONTRACT_VERSION,
            "source": SOURCE,
            "scraped_at": stamp,
            "requested_window": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "inspected_window": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "complete": False,
            },
            "status": STATUS_STRUCTURAL_FAILURE,
            "restate_safe": False,
            "identity": {
                "program_strategy": "canonical_url_slug",
                "showtime_strategy": "source_showing_id",
            },
            "structural_validation": {"passed": False, "checks": checks},
            "stats": stats,
            "warnings": warnings,
            "rejected_observations": rejected,
            "programs": [],
            "showtimes": [],
            "valid_empty_evidence": {"proven": False},
        }

    stats["calendar_pages_succeeded"] = 1
    discovered, discover_warnings = discover_movie_links(
        calendar_response.text,
        calendar_page_url=cal_url,
    )
    for message in discover_warnings:
        warnings.append(
            {
                "code": "calendar_title_conflict",
                "message": message,
                "source_program_id": None,
            }
        )
    stats["discovered_programs"] = len(discovered)
    checks.append(
        {
            "code": "movie_links_inspected",
            "passed": True,
            "severity": "info",
            "message": f"Discovered {len(discovered)} canonical /movie/ pages",
        }
    )

    programs: list[dict[str, Any]] = []
    showtimes: list[dict[str, Any]] = []
    page_failures = 0
    structural_page_failures = 0
    completeness_affecting = False
    showing_ids_seen: dict[str, dict[str, Any]] = {}

    for link in discovered:
        stats["program_pages_attempted"] += 1
        if sleep_seconds:
            time.sleep(sleep_seconds)
        response = fetch(link.canonical_url)
        if response.status_code != 200 or not response.text:
            page_failures += 1
            stats["program_pages_failed"] += 1
            completeness_affecting = True
            warnings.append(
                {
                    "code": "movie_page_fetch_failed",
                    "message": f"Failed to fetch movie page {link.canonical_url}",
                    "source_program_id": link.slug,
                }
            )
            rejected.append(
                {
                    "code": "movie_page_fetch_failed",
                    "message": "Required movie page fetch failed.",
                    "source_program_id": link.slug,
                    "source_value": link.canonical_url,
                    "affects_completeness": True,
                }
            )
            continue

        page = parse_movie_page(
            response.text,
            page_url=link.canonical_url,
            slug=link.slug,
            window_start=start_date,
            window_end=end_date,
            scrape_date=scrape_day,
        )
        if not page.structure_ok:
            structural_page_failures += 1
            completeness_affecting = True
            stats["program_pages_failed"] += 1
            checks.append(
                {
                    "code": "movie_page_schema_org_present",
                    "passed": False,
                    "severity": "error",
                    "message": f"Missing schema.org Movie on {link.canonical_url}",
                }
            )
            rejected.append(
                {
                    "code": "movie_page_structural_failure",
                    "message": "Movie page missing expected schema.org Movie structure.",
                    "source_program_id": link.slug,
                    "source_value": link.canonical_url,
                    "affects_completeness": True,
                }
            )
            # Still attempt to surface any parseable showings for diagnosis below.
        else:
            stats["program_pages_succeeded"] += 1
            checks.append(
                {
                    "code": "movie_page_schema_org_present",
                    "passed": True,
                    "severity": "error",
                    "message": None,
                }
            )

        source_title = page.source_title or link.calendar_title or link.slug
        source_title = normalize_exact_source_title(source_title)
        if (
            link.calendar_title
            and page.source_title
            and normalize_exact_source_title(link.calendar_title) != page.source_title
        ):
            warnings.append(
                {
                    "code": "calendar_schema_title_mismatch",
                    "message": (
                        f"Calendar title {link.calendar_title!r} differs from "
                        f"schema.org name {page.source_title!r}"
                    ),
                    "source_program_id": link.slug,
                }
            )

        if page.warning == "malformed_duration":
            warnings.append(
                {
                    "code": "malformed_duration",
                    "message": f"Unusable duration value {page.duration_raw!r}",
                    "source_program_id": link.slug,
                }
            )

        program_raw = dict(page.raw)
        program_raw["calendar_title"] = link.calendar_title
        program_raw["calendar_raw_url"] = link.raw_url
        programs.append(
            {
                "contract_version": CONTRACT_VERSION,
                "source": SOURCE,
                "source_program_id": link.slug,
                "source_title": source_title,
                "source_program_url": link.canonical_url,
                "program_kind": "film",
                "observed_at": stamp,
                "raw": program_raw,
            }
        )

        for showing in page.showings:
            # Outside-window (resolved) showings are filtered quietly.
            if (
                showing.parse_error == "date_outside_window_or_unresolvable"
                and showing.local_time is not None
                and showing.local_date is None
            ):
                # Try to detect explicit outside-window dates with year.
                continue

            if showing.parse_error in {
                "malformed_showing_url",
                "malformed_showing_text",
                "malformed_time",
                "ambiguous_year",
            } or (showing.showing_id == "" and showing.parse_error):
                completeness_affecting = True
                stats["malformed_showings"] += 1
                stats["rejected_entries"] += 1
                rejected.append(
                    {
                        "code": showing.parse_error or "malformed_showing",
                        "message": "Checkout showing link could not be parsed.",
                        "source_program_id": link.slug,
                        "source_value": showing.display_text or showing.ticket_url,
                        "affects_completeness": True,
                    }
                )
                continue

            if showing.parse_error == "date_outside_window_or_unresolvable":
                # Not completeness-affecting: showing exists but outside requested window.
                continue

            if showing.local_date is None or showing.local_time is None or not showing.showing_id:
                completeness_affecting = True
                stats["malformed_showings"] += 1
                stats["rejected_entries"] += 1
                rejected.append(
                    {
                        "code": showing.parse_error or "malformed_showing",
                        "message": "Checkout showing missing date, time, or showing ID.",
                        "source_program_id": link.slug,
                        "source_value": showing.display_text or showing.ticket_url,
                        "affects_completeness": True,
                    }
                )
                continue

            if not (start_date <= showing.local_date <= end_date):
                continue

            if showing.slug and showing.slug != link.slug:
                warnings.append(
                    {
                        "code": "checkout_slug_mismatch",
                        "message": (
                            f"Checkout slug {showing.slug!r} differs from movie slug {link.slug!r}"
                        ),
                        "source_program_id": link.slug,
                    }
                )

            prior = showing_ids_seen.get(showing.showing_id)
            showtime_payload = {
                "contract_version": CONTRACT_VERSION,
                "source": SOURCE,
                "source_program_id": link.slug,
                "source_showtime_id": showing.showing_id,
                "source_title": source_title,
                "theater_id": PLANNED_THEATER_ID,
                "local_date": showing.local_date.isoformat(),
                "local_time": showing.local_time,
                "timezone": DEFAULT_TIMEZONE,
                "source_occurrence_url": link.canonical_url,
                "ticket_url": showing.ticket_url,
                "observed_at": stamp,
                "raw": {
                    **showing.raw,
                    "movie_slug": link.slug,
                    "runtime_min": page.runtime_min,
                },
            }
            if prior is not None:
                if (
                    prior["local_date"] != showtime_payload["local_date"]
                    or prior["local_time"] != showtime_payload["local_time"]
                    or prior["source_program_id"] != showtime_payload["source_program_id"]
                ):
                    completeness_affecting = True
                    rejected.append(
                        {
                            "code": "conflicting_showing_id",
                            "message": (
                                f"Conflicting duplicate source_showtime_id {showing.showing_id!r}"
                            ),
                            "source_program_id": link.slug,
                            "source_value": showing.showing_id,
                            "affects_completeness": True,
                        }
                    )
                    stats["rejected_entries"] += 1
                # Exact duplicates dedupe silently.
                continue

            showing_ids_seen[showing.showing_id] = showtime_payload
            showtimes.append(showtime_payload)

    stats["accepted_showtimes"] = len(showtimes)
    if showtimes:
        with_ids = sum(1 for row in showtimes if row.get("source_showtime_id"))
        with_tickets = sum(1 for row in showtimes if row.get("ticket_url"))
        stats["showing_id_coverage"] = with_ids
        stats["ticket_url_coverage"] = with_tickets

    all_pages_ok = page_failures == 0 and structural_page_failures == 0
    window_complete = (
        stats["calendar_pages_succeeded"] == 1
        and structure_ok
        and all_pages_ok
        and not completeness_affecting
    )

    structural_passed = structure_ok and structural_page_failures == 0 and page_failures == 0
    # Soft-fail checks already recorded; structural_validation.passed means no error-severity fails.
    error_checks_failed = any(
        (not check.get("passed")) and check.get("severity") == "error" for check in checks
    )
    structural_passed = not error_checks_failed

    if not structure_ok or structural_page_failures:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
        inspected_complete = False
        valid_empty_proof = False
    elif page_failures or completeness_affecting:
        status = STATUS_PARTIAL_FAILURE
        restate_safe = False
        inspected_complete = False
        valid_empty_proof = False
    elif len(showtimes) == 0 and all_pages_ok and structure_ok:
        # Affirmative empty: calendar structure present, all movie pages inspected,
        # zero in-window accepted showtimes.
        status = STATUS_VALID_EMPTY
        restate_safe = True
        inspected_complete = True
        valid_empty_proof = True
    elif all_pages_ok and not completeness_affecting:
        status = STATUS_SUCCESS
        restate_safe = True
        inspected_complete = True
        valid_empty_proof = False
    else:
        status = STATUS_PARTIAL_FAILURE
        restate_safe = False
        inspected_complete = False
        valid_empty_proof = False

    # Zero discovered movie links with an otherwise intact calendar shell is not
    # affirmative empty — SPA hydration failures look the same. Conservative
    # structural failure (P-17D). Valid empty requires inspected movie pages with
    # zero in-window showtimes (handled above).
    if structure_ok and stats["discovered_programs"] == 0:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
        inspected_complete = False
        valid_empty_proof = False
        checks.append(
            {
                "code": "movie_links_discovered",
                "passed": False,
                "severity": "error",
                "message": (
                    "Zero canonical /movie/ links discovered; "
                    "not treated as valid empty without affirmative empty proof"
                ),
            }
        )
        structural_passed = False

    result = {
        "contract_version": CONTRACT_VERSION,
        "source": SOURCE,
        "scraped_at": stamp,
        "requested_window": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "inspected_window": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "complete": inspected_complete,
        },
        "status": status,
        "restate_safe": restate_safe,
        "identity": {
            "program_strategy": "canonical_url_slug",
            "showtime_strategy": "source_showing_id",
        },
        "structural_validation": {"passed": structural_passed, "checks": checks},
        "stats": stats,
        "warnings": warnings,
        "rejected_observations": rejected,
        "programs": programs,
        "showtimes": showtimes,
        "valid_empty_evidence": {
            "proven": valid_empty_proof,
            "calendar_structure_present": structure_ok,
            "discovered_movie_pages": stats["discovered_programs"],
            "movie_pages_succeeded": stats["program_pages_succeeded"],
            "accepted_showtimes": len(showtimes),
        },
    }
    # Silence unused variable for lint clarity.
    _ = window_complete
    return result
