"""AMC API source adapter."""

from __future__ import annotations

import csv
import json
import math
import os
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Mapping

import requests

from reel_seattle.adapters.base import FetchContext, FetchResult, RawShowtime
from reel_seattle.adapters.amc_metadata import (
    extract_showtime_metadata,
    extract_showtime_raw_extensions,
)
from reel_seattle.source_identity import (
    source_film_id_from_raw,
    source_showtime_id_from_raw,
    source_title_from_raw,
)
from reel_seattle.amc_allowlist import (
    DEFAULT_REGISTRY_PATH,
    filter_enabled_amc_theaters,
    load_theater_registry,
)

AMC_BASE_URL = "https://api.amctheatres.com/v2"
DEFAULT_CSV_PATH = Path("public/showtimes.csv")
# FetchContext requires window_end; AMC collection ignores it as a product horizon
# and fetches all currently announced future showtimes per theater.
UNBOUND_FETCH_WINDOW_END = date(9999, 12, 31)
COLLECTION_MODE_ALL_ANNOUNCED_FUTURE = "all_announced_future"
SHOWTIME_PAGE_SIZE = 100
MAX_SHOWTIME_PAGES_PER_THEATER = 200
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_HTTP_RETRIES = 2
SEATTLE_LAT, SEATTLE_LON = 47.6062, -122.3321
# Puget Sound metro radius. Retains all enabled registry theaters (<=16 mi) plus the
# intentionally disabled Kitsap/Lakewood matches (<=32 mi), while excluding out-of-region
# AMCs; the nearest excluded location is Burlington/Cascade Mall at ~60 mi.
RADIUS_MILES = 50

AMC_CSV_FIELDNAMES = [
    "Date",
    "Time",
    "Theater",
    "Film",
    "Runtime",
    "isAlmostSoldOut",
    "posterDynamic",
    "isCanceled",
    "premiumFormat",
    "hasTrailers",
    "maximumIntendedAttendance",
    "first_seen_date",
    "last_updated",
    "source",
    "source_film_id",
    "source_title",
    "source_showtime_id",
]


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two lat/lon coordinates in miles."""
    radius_miles = 3958.8
    lat1_r, lon1_r, lat2_r, lon2_r = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2_r - lat1_r, lon2_r - lon1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return radius_miles * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_row_date(date_str: str) -> date | None:
    try:
        return datetime.strptime(date_str, "%m/%d/%Y").date()
    except ValueError:
        return None


def serialize_bool(value: object | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, str):
        return "True" if value.strip().lower() in ("true", "1", "yes") else "False"
    return "True" if value else "False"


def format_premium_format(value: object | None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = [format_premium_format(item) for item in value]
        return ", ".join(part for part in parts if part)
    if isinstance(value, dict):
        for key in ("name", "type", "code", "description"):
            if value.get(key):
                return str(value[key]).strip()
        return json.dumps(value, separators=(",", ":"))
    return str(value).strip()


def format_optional_number(value: object | None) -> str:
    if value is None or value == "":
        return ""
    return str(value)


def normalize_legacy_row(row: Mapping[str, object]) -> dict[str, str]:
    return {key: str(row.get(key, "") or "") for key in AMC_CSV_FIELDNAMES}


def api_showtime_to_raw(showtime: Mapping[str, Any], theater_name: str) -> RawShowtime:
    """Map one AMC API showtime object to a RawShowtime record."""
    dt = datetime.fromisoformat(str(showtime["showDateTimeLocal"]))
    premium = showtime.get("premiumFormat")
    metadata = extract_showtime_metadata(showtime)
    
    # Extract accessibility attributes from AMC attributes array
    accessibility_tags = []
    attributes_list = showtime.get("attributes", [])
    if isinstance(attributes_list, list):
        for attr in attributes_list:
            if isinstance(attr, dict):
                code = attr.get("code", "").upper()
                if code == "OPENCAPTION":
                    accessibility_tags.append("OC")
                elif code == "CLOSEDCAPTION":
                    accessibility_tags.append("CC")
                elif code == "DESCRIPTIVEVIDEO":
                    accessibility_tags.append("Audio Description")
    
    # Combine premium format with accessibility tags
    format_parts = []
    premium_formatted = format_premium_format(premium)
    if premium_formatted:
        format_parts.append(premium_formatted)
    if accessibility_tags:
        format_parts.extend(accessibility_tags)
    combined_format = ", ".join(format_parts) if format_parts else None
    
    return RawShowtime(
        theater_name_raw=theater_name,
        date_raw=dt.strftime("%m/%d/%Y"),
        time_raw=dt.strftime("%I:%M%p").lstrip("0"),
        title_raw=str(showtime.get("movieName", "")),
        runtime_raw=str(showtime.get("runTime", "Unknown")),
        poster_url_raw=(showtime.get("media") or {}).get("posterDynamic") or None,
        canceled=bool(showtime.get("isCanceled")) if showtime.get("isCanceled") is not None else None,
        almost_sold_out=(
            bool(showtime.get("isAlmostSoldOut"))
            if showtime.get("isAlmostSoldOut") is not None
            else None
        ),
        format_raw=combined_format,
        source_showtime_id=str(showtime["id"]) if showtime.get("id") not in (None, "") else None,
        attributes={
            "has_trailers": showtime.get("hasTrailers"),
            "maximum_intended_attendance": showtime.get("maximumIntendedAttendance"),
            "premium_format_raw": premium,
            **metadata,
            **extract_showtime_raw_extensions(showtime),
        },
    )


def raw_showtime_to_legacy_row(raw: RawShowtime) -> dict[str, str]:
    """Convert a RawShowtime to the legacy AMC CSV row shape."""
    attrs = raw.attributes or {}
    return normalize_legacy_row(
        {
            "Date": raw.date_raw,
            "Time": raw.time_raw,
            "Theater": raw.theater_name_raw,
            "Film": raw.title_raw,
            "Runtime": raw.runtime_raw or "Unknown",
            "isAlmostSoldOut": serialize_bool(raw.almost_sold_out),
            "posterDynamic": raw.poster_url_raw or "",
            "isCanceled": serialize_bool(raw.canceled),
            "premiumFormat": raw.format_raw or "",
            "hasTrailers": serialize_bool(attrs.get("has_trailers")),
            "maximumIntendedAttendance": format_optional_number(
                attrs.get("maximum_intended_attendance")
            ),
            "first_seen_date": "",
            "last_updated": "",
            "source": "",
            "source_film_id": source_film_id_from_raw(raw),
            "source_title": source_title_from_raw(raw),
            "source_showtime_id": source_showtime_id_from_raw(raw),
        }
    )


def build_amc_headers(api_key: str | None = None) -> dict[str, str]:
    key = api_key if api_key is not None else os.environ.get("AMC_API_KEY")
    return {
        "User-Agent": "Mozilla/5.0",
        "X-AMC-Vendor-Key": key or "",
    }


def build_default_fetch_context(
    *,
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
    run_date: date | None = None,
    session: requests.Session | None = None,
) -> FetchContext:
    run = run_date or date.today()
    return FetchContext(
        run_date=run,
        window_start=run,
        window_end=UNBOUND_FETCH_WINDOW_END,
        theaters_registry=load_theater_registry(registry_path),
        session=session,
    )


def _session_for_context(context: FetchContext) -> requests.Session:
    if context.session is not None:
        return context.session
    session = requests.Session()
    session.headers.update(build_amc_headers())
    return session


@dataclass(frozen=True)
class TheaterShowtimesResult:
    """Result of one theater's announced-future showtimes collection."""

    showtimes: tuple[dict[str, Any], ...]
    request_count: int
    page_count: int
    error: str | None = None


def _next_collection_href(payload: Mapping[str, Any]) -> str | None:
    links = payload.get("_links")
    if not isinstance(links, Mapping):
        return None
    next_link = links.get("next")
    if isinstance(next_link, Mapping):
        href = next_link.get("href")
        return str(href) if href else None
    if isinstance(next_link, str) and next_link.strip():
        return next_link.strip()
    return None


def _embedded_showtimes(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    embedded = payload.get("_embedded")
    if not isinstance(embedded, Mapping):
        return []
    showtimes = embedded.get("showtimes")
    if not isinstance(showtimes, list):
        return []
    return [item for item in showtimes if isinstance(item, dict)]


def _get_json(
    session: requests.Session,
    url: str,
    *,
    timeout_seconds: float = REQUEST_TIMEOUT_SECONDS,
    max_retries: int = MAX_HTTP_RETRIES,
) -> tuple[int | None, dict[str, Any] | None, str | None]:
    """GET JSON with limited retries. Never includes request headers in errors."""
    last_error: str | None = None
    attempts = max(1, max_retries + 1)
    for attempt in range(attempts):
        try:
            response = session.get(url, timeout=timeout_seconds)
        except requests.Timeout:
            last_error = "request timeout"
            if attempt + 1 < attempts:
                time.sleep(min(2.0, 0.5 * (attempt + 1)))
                continue
            return None, None, last_error
        except requests.RequestException:
            last_error = "request failed"
            if attempt + 1 < attempts:
                time.sleep(min(2.0, 0.5 * (attempt + 1)))
                continue
            return None, None, last_error

        status = int(response.status_code)
        if status in {429, 500, 502, 503, 504} and attempt + 1 < attempts:
            time.sleep(min(2.0, 0.5 * (attempt + 1)))
            continue
        if status != 200:
            return status, None, f"HTTP {status}"
        try:
            payload = response.json()
        except ValueError:
            return status, None, "invalid JSON"
        if not isinstance(payload, dict):
            return status, None, "response JSON was not an object"
        return status, payload, None
    return None, None, last_error or "request failed"


def paginate_showtimes_collection(
    session: requests.Session,
    initial_url: str,
    *,
    max_pages: int = MAX_SHOWTIME_PAGES_PER_THEATER,
) -> TheaterShowtimesResult:
    """Follow HAL ``_links.next`` for a showtimes collection.

    ``max_pages`` is a runaway-loop guard, not a product date horizon.
    """
    collected: list[dict[str, Any]] = []
    url: str | None = initial_url
    request_count = 0
    page_count = 0
    expected_count: int | None = None

    while url:
        if page_count >= max_pages:
            return TheaterShowtimesResult(
                showtimes=(),
                request_count=request_count,
                page_count=page_count,
                error=(
                    f"pagination exceeded {max_pages} pages "
                    "(runaway-loop guard; not a date horizon)"
                ),
            )
        _status, payload, error = _get_json(session, url)
        request_count += 1
        if error or payload is None:
            return TheaterShowtimesResult(
                showtimes=(),
                request_count=request_count,
                page_count=page_count,
                error=error or "empty showtimes response",
            )
        page_count += 1
        if expected_count is None and isinstance(payload.get("count"), int):
            expected_count = int(payload["count"])
        collected.extend(_embedded_showtimes(payload))
        url = _next_collection_href(payload)

    if expected_count is not None and len(collected) < expected_count:
        return TheaterShowtimesResult(
            showtimes=(),
            request_count=request_count,
            page_count=page_count,
            error=f"pagination incomplete: got {len(collected)} of {expected_count}",
        )

    return TheaterShowtimesResult(
        showtimes=tuple(collected),
        request_count=request_count,
        page_count=page_count,
        error=None,
    )


def get_all_theaters(session: requests.Session) -> list[dict[str, Any]]:
    """Fetch all AMC theaters using paginated API calls.

    Returns an empty list if any page fails so callers can fail closed rather
    than scrape a silent subset of theatres.
    """
    theaters: list[dict[str, Any]] = []
    url: str | None = f"{AMC_BASE_URL}/theatres?page-number=1&page-size=100"
    while url:
        _status, data, error = _get_json(session, url)
        if error or data is None:
            return []
        embedded = data.get("_embedded") if isinstance(data.get("_embedded"), Mapping) else {}
        if isinstance(embedded, Mapping):
            theaters.extend(
                item for item in embedded.get("theatres", []) if isinstance(item, dict)
            )
        url = _next_collection_href(data)
    return theaters


def get_theater_future_showtimes(
    session: requests.Session,
    theater_id: str,
) -> TheaterShowtimesResult:
    """Fetch all currently announced future showtimes for one theater.

    Uses documented ``GET /v2/theatres/{id}/showtimes`` (no date path). AMC
    describes this as returning all future showtimes for the theatre.
    """
    initial_url = (
        f"{AMC_BASE_URL}/theatres/{theater_id}/showtimes"
        f"?page-number=1&page-size={SHOWTIME_PAGE_SIZE}"
    )
    return paginate_showtimes_collection(session, initial_url)


def get_showtimes(session: requests.Session, theater_id: str, show_date: date) -> list[dict[str, Any]]:
    """Fetch showtimes for a theater on one date (dated endpoint).

    Production collection uses :func:`get_theater_future_showtimes` instead.
    """
    formatted_date = show_date.strftime("%m-%d-%y").lstrip("0").replace("-0", "-")
    initial_url = (
        f"{AMC_BASE_URL}/theatres/{theater_id}/showtimes/{formatted_date}"
        f"?page-number=1&page-size={SHOWTIME_PAGE_SIZE}"
    )
    result = paginate_showtimes_collection(session, initial_url)
    if result.error:
        return []
    return list(result.showtimes)


def filter_nearby_amc_theaters(
    api_theaters: list[Mapping[str, Any]],
    *,
    lat: float = SEATTLE_LAT,
    lon: float = SEATTLE_LON,
    radius_miles: float = RADIUS_MILES,
) -> list[dict[str, Any]]:
    nearby: list[dict[str, Any]] = []
    for theater in api_theaters:
        location = theater.get("location") or {}
        theater_lat = location.get("latitude")
        theater_lon = location.get("longitude")
        if theater_lat is None or theater_lon is None:
            continue
        if haversine(lat, lon, theater_lat, theater_lon) <= radius_miles:
            nearby.append(dict(theater))
    return nearby


def _coerce_theater_showtimes_result(
    raw: TheaterShowtimesResult | list[dict[str, Any]],
) -> TheaterShowtimesResult:
    if isinstance(raw, TheaterShowtimesResult):
        return raw
    return TheaterShowtimesResult(
        showtimes=tuple(raw),
        request_count=1,
        page_count=1,
        error=None,
    )


def _show_date_from_raw(raw: RawShowtime) -> date | None:
    return parse_row_date(raw.date_raw)


def fetch_amc_showtimes(
    context: FetchContext,
    *,
    sleep_seconds: float = 1.0,
    get_all_theaters_fn: Callable[[requests.Session], list[dict[str, Any]]] | None = None,
    get_theater_showtimes_fn: (
        Callable[[requests.Session, str], TheaterShowtimesResult | list[dict[str, Any]]] | None
    ) = None,
) -> FetchResult:
    """Fetch all currently announced future AMC showtimes for enabled theaters.

    Does not use ``FetchContext.window_end`` as a product horizon. Public UI
    horizon is enforced later by ``reel_seattle.emit.current.WINDOW_DAYS``.
    """
    session = _session_for_context(context)
    all_theaters_fn = get_all_theaters_fn or get_all_theaters
    showtimes_fn = get_theater_showtimes_fn or get_theater_future_showtimes

    all_theaters = all_theaters_fn(session)
    nearby_theaters = filter_nearby_amc_theaters(all_theaters)
    allowed_theaters, allowlist_stats = filter_enabled_amc_theaters(
        nearby_theaters,
        context.theaters_registry,
    )

    records: list[RawShowtime] = []
    warnings: list[str] = []
    errors: list[str] = []
    theaters_succeeded = 0
    theaters_failed = 0
    showtime_request_count = 0
    showtime_page_count = 0
    theater_items = list(allowed_theaters.items())

    if not all_theaters:
        errors.append("AMC theatres list was empty")

    for index, (theater_id, theater_name) in enumerate(theater_items):
        fetched = _coerce_theater_showtimes_result(showtimes_fn(session, theater_id))
        showtime_request_count += fetched.request_count
        showtime_page_count += fetched.page_count
        if fetched.error:
            theaters_failed += 1
            errors.append(f"AMC theater {theater_id} ({theater_name}): {fetched.error}")
        else:
            theaters_succeeded += 1
            for showtime in fetched.showtimes:
                records.append(api_showtime_to_raw(showtime, theater_name))
        if sleep_seconds and index + 1 < len(theater_items):
            time.sleep(sleep_seconds)

    show_dates = [parsed for parsed in (_show_date_from_raw(raw) for raw in records) if parsed]
    restate_safe = not errors and theaters_failed == 0 and bool(theater_items)

    stats: dict[str, object] = {
        "allowlist_included": allowlist_stats.included,
        "allowlist_disabled": allowlist_stats.disabled,
        "allowlist_unknown": allowlist_stats.unknown,
        "allowlist_disabled_theaters": allowlist_stats.disabled_theaters,
        "allowlist_unknown_theaters": allowlist_stats.unknown_theaters,
        "collection_mode": COLLECTION_MODE_ALL_ANNOUNCED_FUTURE,
        "theaters_scraped": len(allowed_theaters),
        "theaters_succeeded": theaters_succeeded,
        "theaters_failed": theaters_failed,
        "showtime_request_count": showtime_request_count,
        "showtime_page_count": showtime_page_count,
        "records_fetched": len(records),
        "earliest_show_date": min(show_dates).isoformat() if show_dates else None,
        "farthest_show_date": max(show_dates).isoformat() if show_dates else None,
        "restate_safe": restate_safe,
        "stale_retention_recommended": not restate_safe,
    }

    return FetchResult(
        records=records,
        stats=stats,
        warnings=warnings,
        errors=errors,
    )


def allowlist_message(stats: Mapping[str, object]) -> str:
    """Format allowlist stats like the legacy AMC scraper log line."""
    included = int(stats.get("allowlist_included", 0))
    disabled = int(stats.get("allowlist_disabled", 0))
    unknown = int(stats.get("allowlist_unknown", 0))
    return (
        f"AMC allowlist: {included} enabled theaters included, "
        f"{disabled} disabled registry matches skipped, "
        f"{unknown} unknown theaters skipped"
    )


def load_past_legacy_rows(
    csv_path: Path | str,
    *,
    before_date: date,
) -> list[dict[str, str]]:
    """Keep AMC showtimes strictly before *before_date* (API no longer returns them)."""
    path = Path(csv_path)
    if not path.exists():
        return []

    existing: list[dict[str, str]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            row_date = parse_row_date(row.get("Date", ""))
            if row_date is not None and row_date < before_date:
                existing.append(normalize_legacy_row(row))
    return existing


def write_legacy_csv(csv_path: Path | str, rows: list[Mapping[str, object]]) -> None:
    """Write legacy AMC CSV rows compatible with daily_processor.py."""
    path = Path(csv_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = [normalize_legacy_row(row) for row in rows]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=AMC_CSV_FIELDNAMES)
        writer.writeheader()
        writer.writerows(normalized)


class AmcAdapter:
    """Thin class wrapper around AMC fetch helpers."""

    def fetch(self, context: FetchContext, **kwargs: object) -> FetchResult:
        return fetch_amc_showtimes(context, **kwargs)

    @staticmethod
    def api_showtime_to_raw(showtime: Mapping[str, Any], theater_name: str) -> RawShowtime:
        return api_showtime_to_raw(showtime, theater_name)

    @staticmethod
    def raw_showtime_to_legacy_row(raw: RawShowtime) -> dict[str, str]:
        return raw_showtime_to_legacy_row(raw)
