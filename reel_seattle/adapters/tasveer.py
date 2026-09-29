"""Tasveer Film Center showtimes via the public Indy Systems GraphQL endpoint.

``site-id`` and ``circuit-id`` are the consumer-site constants published in the
unauthenticated showtimes bundle. They are not API credentials. Introspection
is disabled; the query below is the field set the public site already requests.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

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

SOURCE = "tasveer"
THEATER_ID = "tasveer-film-center"
THEATER_NAME = "Tasveer Film Center"
GRAPHQL_URL = "https://filmcenter.tasveer.org/graphql"
ORIGIN = "https://filmcenter.tasveer.org"
# Published in the public consumer bundle (client-type consumer).
SITE_ID = "262"
CIRCUIT_ID = "138"

_QUERY = """
{
  movies {
    data {
      id
      name
      urlSlug
      duration
      rating
      showings {
        id
        time
        showingBadges { id title }
      }
    }
  }
}
""".strip()

_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
_TRAILING_METADATA_RE = re.compile(
    r"^(?P<title>.+?)\s*\((?P<meta>[^()]*(?:19|20)\d{2}[^()]*)\)\s*\)?$"
)
_COUNTRY_LABELS = frozenset(
    {
        "usa",
        "united states",
        "india",
        "japan",
        "canada",
        "uk",
        "united kingdom",
        "bangladesh",
        "pakistan",
        "nepal",
        "sri lanka",
        "france",
        "germany",
        "israel",
    }
)
FetchFn = Callable[..., tuple[int, bytes, dict[str, str]]]


def default_tasveer_window(now: datetime | None = None) -> tuple[date, date]:
    moment = now or datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    start = moment.date()
    return start, start + timedelta(days=INDIE_SCRAPE_HORIZON_DAYS)


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "client-type": "consumer",
        "site-id": SITE_ID,
        "circuit-id": CIRCUIT_ID,
        "Origin": ORIGIN,
    }


def parse_tasveer_title_metadata(title: str) -> tuple[str, int | None, dict[str, Any]]:
    """Separate Tasveer's trailing country/language/year listing metadata.

    The source title remains untouched on RawShowtime.title_raw. Cleanup is
    deliberately source-specific: a suffix is stripped only when the final
    parenthetical contains exactly one credible four-digit year.
    """
    source_title = normalize_exact_source_title(title)
    match = _TRAILING_METADATA_RE.match(source_title)
    if not match:
        return source_title, None, {}

    parts = [
        normalize_exact_source_title(part)
        for part in match.group("meta").split(",")
        if normalize_exact_source_title(part)
    ]
    years = [
        int(year)
        for part in parts
        for year in _YEAR_RE.findall(part)
        if part == year
    ]
    if len(years) != 1:
        return source_title, None, {}

    year = years[0]
    if not 1888 <= year <= 2100:
        return source_title, None, {}

    identity_title = normalize_exact_source_title(match.group("title"))
    if not identity_title:
        return source_title, None, {}

    metadata: dict[str, Any] = {
        "release_year": year,
        "source_title_metadata": parts,
    }
    non_year_parts = [part for part in parts if not _YEAR_RE.fullmatch(part)]
    alternate_titles = [
        part for part in non_year_parts if any(ord(char) > 127 for char in part)
    ]
    countries = [
        part for part in non_year_parts if part.casefold() in _COUNTRY_LABELS
    ]
    language_notes = [
        part
        for part in non_year_parts
        if part not in alternate_titles and part not in countries
    ]
    if alternate_titles:
        metadata["alternate_titles"] = alternate_titles
    if countries:
        metadata["country_raw"] = countries[0]
    if language_notes:
        metadata["language_note_raw"] = "; ".join(language_notes)
    return identity_title, year, metadata


def _open_caption(badges: list[dict[str, Any]]) -> bool:
    for badge in badges:
        label = str(badge.get("title") or "").casefold()
        if "open caption" in label or label.strip() in {"ocap", "oc"}:
            return True
    return False


def _to_pacific(value: str) -> datetime | None:
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(ZoneInfo(DEFAULT_TIMEZONE))


def _failure(
    start: date,
    end: date,
    *,
    request_error: str | None = None,
    structural_error: str | None = None,
    scraped_at: str | None = None,
) -> OptionCAdapterResult:
    return assemble_option_c(
        source=SOURCE,
        window_start=start,
        window_end=end,
        screens=[],
        request_error=request_error,
        structural_error=structural_error,
        structure_present=structural_error is None and request_error is None,
        inspected_complete=False,
        scraped_at=scraped_at,
        theater_ids=load_registry_theater_ids(),
    )


def fetch_tasveer(
    start_date: date | None = None,
    end_date: date | None = None,
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
    scraped_at: str | None = None,
) -> OptionCAdapterResult:
    if start_date is None or end_date is None:
        default_start, default_end = default_tasveer_window(now=now)
        start_date = start_date or default_start
        end_date = end_date or default_end
    transport = fetch or http_exchange
    body = json.dumps({"query": _QUERY}).encode("utf-8")
    try:
        status, payload, _headers_out = transport(
            GRAPHQL_URL,
            method="POST",
            data=body,
            headers=_headers(),
        )
    except SourceHttpError as exc:
        return _failure(start_date, end_date, request_error=f"Tasveer request failed: {exc}", scraped_at=scraped_at)

    if status != 200:
        return _failure(
            start_date,
            end_date,
            request_error=f"Tasveer GraphQL HTTP {status}",
            scraped_at=scraped_at,
        )
    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _failure(
            start_date,
            end_date,
            structural_error="Tasveer GraphQL response was not JSON",
            scraped_at=scraped_at,
        )
    if not isinstance(parsed, dict):
        return _failure(
            start_date,
            end_date,
            structural_error="Tasveer GraphQL response was not an object",
            scraped_at=scraped_at,
        )
    if parsed.get("errors") and not isinstance(parsed.get("data"), dict):
        return _failure(
            start_date,
            end_date,
            request_error="Tasveer GraphQL returned errors without movie data",
            scraped_at=scraped_at,
        )
    movies = parsed.get("data", {}).get("movies") if isinstance(parsed.get("data"), dict) else None
    rows = movies.get("data") if isinstance(movies, dict) else None
    if not isinstance(rows, list):
        return _failure(
            start_date,
            end_date,
            structural_error="Tasveer response is missing movies.data",
            scraped_at=scraped_at,
        )

    screens: list[Screen] = []
    rejected: list[dict[str, Any]] = []
    for movie in rows:
        if not isinstance(movie, dict):
            rejected.append(
                {
                    "code": "invalid_movie",
                    "message": "Tasveer movies.data contained a non-object row",
                    "affects_completeness": True,
                }
            )
            continue
        movie_id = str(movie.get("id") or "").strip()
        name = normalize_exact_source_title(str(movie.get("name") or ""))
        slug = str(movie.get("urlSlug") or "").strip()
        if not movie_id or not name or not slug:
            rejected.append(
                {
                    "code": "missing_movie_identity",
                    "message": "Tasveer movie is missing id, name, or urlSlug",
                    "affects_completeness": True,
                }
            )
            continue
        showings = movie.get("showings") or []
        if not isinstance(showings, list):
            rejected.append(
                {
                    "code": "invalid_showings",
                    "message": f"Tasveer movie {movie_id} showings were not a list",
                    "affects_completeness": True,
                }
            )
            continue
        duration = movie.get("duration")
        runtime = int(duration) if isinstance(duration, int) and duration > 0 else None
        rating = str(movie.get("rating") or "").strip() or None
        identity_title, release_year, title_metadata = parse_tasveer_title_metadata(name)
        program_url = f"{ORIGIN}/movie/{slug}"
        for showing in showings:
            if not isinstance(showing, dict):
                continue
            showing_id = str(showing.get("id") or "").strip()
            local = _to_pacific(str(showing.get("time") or ""))
            if local is not None and (local.date() < start_date or local.date() > end_date):
                continue
            if not showing_id or local is None:
                rejected.append(
                    {
                        "code": "invalid_showing",
                        "message": f"Tasveer showing on movie {movie_id} is missing id or time",
                        "affects_completeness": True,
                    }
                )
                continue
            local_day = local.date()
            badges = showing.get("showingBadges") or []
            badge_rows = [badge for badge in badges if isinstance(badge, dict)]
            badge_titles = [str(badge.get("title") or "").strip() for badge in badge_rows]
            badge_titles = [title for title in badge_titles if title]
            format_raw = "open caption" if _open_caption(badge_rows) else None
            attributes: dict[str, Any] = dict(title_metadata)
            if badge_titles:
                attributes["showing_badges"] = badge_titles
            if rating:
                attributes["rating_raw"] = rating
            screens.append(
                Screen(
                    program_id=movie_id,
                    source_title=name,
                    identity_title=identity_title,
                    program_url=program_url,
                    showtime_id=showing_id,
                    theater_id=THEATER_ID,
                    theater_name=THEATER_NAME,
                    local_date=local_day,
                    local_time=local.strftime("%H:%M"),
                    ticket_url=f"{ORIGIN}/checkout/showing/{slug}/{showing_id}",
                    runtime_minutes=runtime,
                    year=release_year,
                    format_raw=format_raw,
                    attributes=attributes,
                    program_raw={"url_slug": slug},
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
