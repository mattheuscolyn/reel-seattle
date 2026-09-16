"""AMC Coming Soon catalog ingestion (``GET /v2/movies/views/coming-soon``).

This is AMC's national movie catalog view: titles AMC has announced, whether or
not any performance exists anywhere. It is a different fact from a Seattle-area
theater booking, which comes from the showtimes scrape, and the two must never
be inferred from each other.

The fetch layer is injectable so tests and offline runs never touch the network.
Record normalization reuses :func:`normalize_movies_metadata` because catalog
view items carry the same shape as ``/v2/movies/{id}`` bodies.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.adapters.amc import AMC_BASE_URL
from reel_seattle.analysis.amc_movies_client import (
    assert_no_secret_leakage,
    sanitize_error_message,
)
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.source_catalog.amc_refresh import normalize_movies_metadata
from reel_seattle.validate import SchemaValidationError, validate_against_schema

SCHEMA_VERSION = "1.0.0"
SOURCE = "amc"

# AMC_BASE_URL already ends in /v2; the view path must not repeat it.
COMING_SOON_VIEW_PATH = "/movies/views/coming-soon"
COMING_SOON_VIEW_URL = f"{AMC_BASE_URL}{COMING_SOON_VIEW_PATH}"

DEFAULT_CATALOG_PATH = Path("data/source_catalog/amc_coming_soon_catalog.json")
DEFAULT_PAGE_SIZE = 100
DEFAULT_MAX_PAGES = 40

CATALOG_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "schema"
    / "source_catalog"
    / "amc_coming_soon_catalog"
    / "v1.0.0.json"
)

FETCH_SUCCESS = "success"
FETCH_PARTIAL = "partial"
FETCH_FAILED = "failed"

# Page fetch contract: (page_number, page_size) -> (http_status, body, error)
FetchPageFn = Callable[[int, int], tuple[int | None, Mapping[str, Any] | None, str | None]]


class ComingSoonCatalogError(ValueError):
    """Raised when catalog inputs cannot be fetched or normalized."""


class ComingSoonCatalogValidationError(ComingSoonCatalogError):
    """Raised when a durable catalog artifact fails validation."""


@dataclass
class CatalogFetchResult:
    """Outcome of walking the paginated Coming Soon view."""

    status: str
    movies: list[dict[str, Any]] = field(default_factory=list)
    pages_fetched: int = 0
    reported_total: int | None = None
    page_size: int = DEFAULT_PAGE_SIZE
    exhausted: bool = False
    next_link_observed: bool = False
    errors: list[dict[str, Any]] = field(default_factory=list)
    duplicate_ids: int = 0

    @property
    def ok(self) -> bool:
        return self.status in {FETCH_SUCCESS, FETCH_PARTIAL} and bool(self.movies)


def _id_sort_key(value: str) -> tuple[int, int | str]:
    text = str(value)
    if text.isdigit():
        return (0, int(text))
    return (1, text)


def _now_pacific_iso() -> str:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")


def _embedded_movies(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    embedded = payload.get("_embedded")
    if not isinstance(embedded, Mapping):
        return []
    movies = embedded.get("movies")
    if not isinstance(movies, list):
        return []
    return [item for item in movies if isinstance(item, Mapping)]


def make_requests_fetch_page(
    session: Any,
    *,
    timeout_seconds: float = 30.0,
    max_retries: int = 2,
) -> FetchPageFn:
    """Build a live page fetcher from a session with AMC headers already set.

    Credentials travel in the ``X-AMC-Vendor-Key`` header, so request URLs and
    recorded errors stay free of credential material.
    """

    def fetch_page(
        page_number: int, page_size: int
    ) -> tuple[int | None, Mapping[str, Any] | None, str | None]:
        url = f"{COMING_SOON_VIEW_URL}?page-number={page_number}&page-size={page_size}"
        attempts = max(1, max_retries + 1)
        last_error: str | None = None

        for attempt in range(attempts):
            try:
                response = session.get(url, timeout=timeout_seconds)
            except Exception as exc:  # noqa: BLE001 - network errors are data here
                last_error = sanitize_error_message(str(exc))
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
                body = response.json()
            except ValueError:
                return status, None, "response was not valid JSON"
            if not isinstance(body, Mapping):
                return status, None, "response JSON was not an object"
            return status, body, None

        return None, None, last_error

    return fetch_page


def load_offline_fixture_pages(fixtures_dir: Path | str) -> FetchPageFn:
    """Load ``page-{n}.json`` fixtures for offline runs and tests."""
    directory = Path(fixtures_dir)

    def fetch_page(
        page_number: int, _page_size: int
    ) -> tuple[int | None, Mapping[str, Any] | None, str | None]:
        path = directory / f"page-{page_number}.json"
        if not path.is_file():
            return 404, None, "HTTP 404"
        body = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(body, Mapping):
            return 200, None, "fixture body is not an object"
        return 200, body, None

    return fetch_page


def fetch_coming_soon_catalog(
    fetch_page: FetchPageFn,
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
    max_pages: int = DEFAULT_MAX_PAGES,
    sleep_seconds: float = 0.0,
) -> CatalogFetchResult:
    """Walk the paginated Coming Soon view, collecting raw movie records."""
    result = CatalogFetchResult(status=FETCH_FAILED, page_size=page_size)
    seen_ids: set[str] = set()
    collected: list[dict[str, Any]] = []

    for page_number in range(1, max_pages + 1):
        status, body, error = fetch_page(page_number, page_size)
        if status != 200 or body is None:
            result.errors.append(
                {
                    "page": page_number,
                    "http_status": status,
                    "error": sanitize_error_message(error) or f"HTTP {status}",
                }
            )
            break

        if page_number == 1:
            reported = body.get("count")
            result.reported_total = int(reported) if isinstance(reported, int) else None

        page_movies = _embedded_movies(body)
        for movie in page_movies:
            movie_id = str(movie.get("id") or "").strip()
            if not movie_id:
                continue
            if movie_id in seen_ids:
                result.duplicate_ids += 1
                continue
            seen_ids.add(movie_id)
            collected.append(dict(movie))

        result.pages_fetched = page_number

        links = body.get("_links") if isinstance(body.get("_links"), Mapping) else {}
        has_next = bool(links.get("next"))
        result.next_link_observed = result.next_link_observed or has_next

        if not page_movies or not has_next:
            result.exhausted = True
            break

        if sleep_seconds:
            time.sleep(sleep_seconds)

    result.movies = collected
    if collected and not result.errors:
        result.status = FETCH_SUCCESS
    elif collected:
        result.status = FETCH_PARTIAL
    else:
        result.status = FETCH_FAILED
    return result


def normalize_catalog_movie(body: Mapping[str, Any]) -> dict[str, Any]:
    """Project one AMC catalog record into the durable catalog record shape."""
    movie_id = str(body.get("id") or "").strip()
    if not movie_id:
        raise ComingSoonCatalogError("catalog record missing id")
    metadata = normalize_movies_metadata(body)
    return {
        "source": SOURCE,
        "source_film_id": movie_id,
        **metadata,
    }


def build_coming_soon_catalog(
    fetch_result: CatalogFetchResult,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build the durable AMC Coming Soon catalog artifact."""
    stamp = generated_at or _now_pacific_iso()

    movies: list[dict[str, Any]] = []
    skipped = 0
    for raw in fetch_result.movies:
        try:
            movies.append(normalize_catalog_movie(raw))
        except ComingSoonCatalogError:
            skipped += 1
    movies.sort(key=lambda item: _id_sort_key(str(item["source_film_id"])))

    release_dates = sorted(
        str(movie["release_date_utc"])[:10]
        for movie in movies
        if movie.get("release_date_utc")
    )
    scheduled_flags = [movie.get("has_scheduled_showtimes") for movie in movies]

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "fetch": {
            "endpoint": COMING_SOON_VIEW_PATH,
            "url_template": f"{COMING_SOON_VIEW_URL}?page-number={{n}}&page-size={fetch_result.page_size}",
            "status": fetch_result.status,
            "page_size": fetch_result.page_size,
            "pages_fetched": fetch_result.pages_fetched,
            "reported_total": fetch_result.reported_total,
            "exhausted": fetch_result.exhausted,
            "next_link_observed": fetch_result.next_link_observed,
            "duplicate_ids_skipped": fetch_result.duplicate_ids,
            "unparsable_records_skipped": skipped,
            "errors": list(fetch_result.errors),
        },
        "stats": _catalog_stats(movies, release_dates, scheduled_flags),
        "movies": movies,
    }
    assert_no_secret_leakage(artifact)
    return artifact


def _catalog_stats(
    movies: Sequence[Mapping[str, Any]],
    release_dates: Sequence[str],
    scheduled_flags: Sequence[Any],
) -> dict[str, Any]:
    with_flag = [flag for flag in scheduled_flags if isinstance(flag, bool)]
    return {
        "movies": len(movies),
        "with_release_date": len(release_dates),
        "without_release_date": len(movies) - len(release_dates),
        "earliest_release_date": release_dates[0] if release_dates else None,
        "latest_release_date": release_dates[-1] if release_dates else None,
        "with_scheduled_showtimes": sum(1 for flag in with_flag if flag),
        "without_scheduled_showtimes": sum(1 for flag in with_flag if not flag),
        "scheduled_showtimes_unknown": len(movies) - len(with_flag),
        "special_presentations": sum(
            1
            for movie in movies
            if (movie.get("presentation") or {}).get("is_special_presentation") is True
        ),
    }


def validate_coming_soon_catalog(artifact: Mapping[str, Any]) -> None:
    """Validate the durable catalog against schema plus structural invariants."""
    try:
        validate_against_schema(
            artifact, CATALOG_SCHEMA_PATH, label="amc_coming_soon_catalog"
        )
    except SchemaValidationError as exc:
        raise ComingSoonCatalogValidationError(str(exc)) from exc

    movies = artifact.get("movies") or []
    seen: set[str] = set()
    for movie in movies:
        movie_id = str(movie.get("source_film_id"))
        if movie_id in seen:
            raise ComingSoonCatalogValidationError(f"duplicate catalog id: {movie_id!r}")
        seen.add(movie_id)

    ordered = [str(movie.get("source_film_id")) for movie in movies]
    if ordered != sorted(ordered, key=_id_sort_key):
        raise ComingSoonCatalogValidationError("catalog movies are not deterministically ordered")

    release_dates = sorted(
        str(movie["release_date_utc"])[:10]
        for movie in movies
        if movie.get("release_date_utc")
    )
    expected = _catalog_stats(
        movies, release_dates, [movie.get("has_scheduled_showtimes") for movie in movies]
    )
    stats = dict(artifact.get("stats") or {})
    if stats != expected:
        raise ComingSoonCatalogValidationError(
            f"catalog stats mismatch: got {stats}, expected {expected}"
        )


def write_coming_soon_catalog(
    artifact: Mapping[str, Any],
    path: Path | str = DEFAULT_CATALOG_PATH,
) -> Path:
    """Write the durable catalog JSON file."""
    assert_no_secret_leakage(artifact)
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return target


def load_coming_soon_catalog(path: Path | str = DEFAULT_CATALOG_PATH) -> dict[str, Any] | None:
    """Load a durable catalog, returning ``None`` when absent or unusable."""
    target = Path(path)
    if not target.is_file():
        return None
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, Mapping):
        return None
    return dict(payload)


def build_live_session() -> Any:
    """Build a requests session carrying AMC vendor auth from the environment."""
    import os

    import requests

    from reel_seattle.adapters.amc import build_amc_headers

    api_key = os.environ.get("AMC_API_KEY")
    if not api_key:
        raise ComingSoonCatalogError(
            "AMC_API_KEY environment variable is required for live catalog refresh. "
            "Use --fixture-pages for offline runs."
        )
    session = requests.Session()
    session.headers.update(build_amc_headers(api_key))
    return session
