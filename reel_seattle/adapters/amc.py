"""AMC API source adapter."""

from __future__ import annotations

import csv
import json
import math
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Mapping

import requests

from reel_seattle.adapters.base import FetchContext, FetchResult, RawShowtime
from reel_seattle.adapters.amc_metadata import extract_showtime_metadata
from reel_seattle.source_identity import source_film_id_from_raw, source_title_from_raw
from reel_seattle.amc_allowlist import (
    DEFAULT_REGISTRY_PATH,
    filter_enabled_amc_theaters,
    load_theater_registry,
)

AMC_BASE_URL = "https://api.amctheatres.com/v2"
DEFAULT_CSV_PATH = Path("public/showtimes.csv")
DAYS_AHEAD = 14
SEATTLE_LAT, SEATTLE_LON = 47.6062, -122.3321
RADIUS_MILES = 300

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
        format_raw=format_premium_format(premium) or None,
        source_showtime_id=str(showtime["id"]) if showtime.get("id") not in (None, "") else None,
        attributes={
            "has_trailers": showtime.get("hasTrailers"),
            "maximum_intended_attendance": showtime.get("maximumIntendedAttendance"),
            "premium_format_raw": premium,
            **metadata,
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
        window_end=run + timedelta(days=DAYS_AHEAD),
        theaters_registry=load_theater_registry(registry_path),
        session=session,
    )


def _session_for_context(context: FetchContext) -> requests.Session:
    if context.session is not None:
        return context.session
    session = requests.Session()
    session.headers.update(build_amc_headers())
    return session


def get_all_theaters(session: requests.Session) -> list[dict[str, Any]]:
    """Fetch all AMC theaters using paginated API calls."""
    theaters: list[dict[str, Any]] = []
    url = f"{AMC_BASE_URL}/theatres?page-number=1&page-size=100"
    while url:
        response = session.get(url)
        if response.status_code != 200:
            break
        data = response.json()
        theaters.extend(data["_embedded"].get("theatres", []))
        url = data["_links"].get("next", {}).get("href")
    return theaters


def get_showtimes(session: requests.Session, theater_id: str, show_date: date) -> list[dict[str, Any]]:
    """Fetch all showtimes for a given theater and date."""
    formatted_date = show_date.strftime("%m-%d-%y").lstrip("0").replace("-0", "-")
    base_url = f"{AMC_BASE_URL}/theatres/{theater_id}/showtimes/{formatted_date}"

    initial_response = session.get(base_url)
    if initial_response.status_code != 200:
        return []

    data = initial_response.json()
    page_size = data.get("pageSize", 10)
    total_count = data.get("count", 0)
    total_pages = (total_count + page_size - 1) // page_size

    all_showtimes: list[dict[str, Any]] = []
    for page_number in range(1, total_pages + 1):
        paged_url = f"{base_url}?pageNumber={page_number}&pageSize={page_size}"
        response = session.get(paged_url)
        if response.status_code != 200:
            continue
        page_data = response.json()
        showtimes = page_data.get("_embedded", {}).get("showtimes", [])
        all_showtimes.extend(showtimes)

    return all_showtimes


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


def fetch_amc_showtimes(
    context: FetchContext,
    *,
    sleep_seconds: float = 1.0,
    get_all_theaters_fn: Callable[[requests.Session], list[dict[str, Any]]] | None = None,
    get_showtimes_fn: Callable[[requests.Session, str, date], list[dict[str, Any]]] | None = None,
) -> FetchResult:
    """Fetch AMC showtimes for enabled registry theaters over the context window."""
    session = _session_for_context(context)
    all_theaters_fn = get_all_theaters_fn or get_all_theaters
    showtimes_fn = get_showtimes_fn or get_showtimes

    all_theaters = all_theaters_fn(session)
    nearby_theaters = filter_nearby_amc_theaters(all_theaters)
    allowed_theaters, allowlist_stats = filter_enabled_amc_theaters(
        nearby_theaters,
        context.theaters_registry,
    )

    records: list[RawShowtime] = []
    warnings: list[str] = []
    errors: list[str] = []

    day = context.window_start
    days_scraped = 0
    while day <= context.window_end:
        days_scraped += 1
        for theater_id, theater_name in allowed_theaters.items():
            showtimes = showtimes_fn(session, theater_id, day)
            for showtime in showtimes:
                records.append(api_showtime_to_raw(showtime, theater_name))
        if sleep_seconds:
            time.sleep(sleep_seconds)
        day += timedelta(days=1)

    stats: dict[str, object] = {
        "allowlist_included": allowlist_stats.included,
        "allowlist_disabled": allowlist_stats.disabled,
        "allowlist_unknown": allowlist_stats.unknown,
        "allowlist_disabled_theaters": allowlist_stats.disabled_theaters,
        "allowlist_unknown_theaters": allowlist_stats.unknown_theaters,
        "days_scraped": days_scraped,
        "theaters_scraped": len(allowed_theaters),
        "records_fetched": len(records),
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
