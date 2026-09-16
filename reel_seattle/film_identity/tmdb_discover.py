"""Live TMDB Discover query for upcoming US theatrical releases.

The query is fixed by product definition::

    GET /discover/movie
        region=US
        with_release_type=2|3        (theatrical, theatrical limited)
        release_date.gte=<window start>
        release_date.lte=<window end>
        sort_by=release_date.asc
        include_adult=false
        language=en-US

TMDB is supplemental evidence for Coming Soon. This module records quality
diagnostics (missing poster, very low popularity, no votes, missing overview)
without applying an inclusion threshold, so a later indie/arthouse inclusion
model has the raw signals to work from.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.film_identity.security import sanitize_error_message
from reel_seattle.film_identity.tmdb_client import TmdbAuthError, TmdbClient, resolve_tmdb_auth
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.validate import SchemaValidationError, validate_against_schema

SCHEMA_VERSION = "1.0.0"
SOURCE = "tmdb"

DISCOVER_PATH = "/discover/movie"
REGION = "US"
RELEASE_TYPES = "2|3"
SORT_BY = "release_date.asc"
LANGUAGE = "en-US"

DEFAULT_CANDIDATES_PATH = Path("data/source_catalog/tmdb_us_theatrical_candidates.json")
DEFAULT_MAX_PAGES = 30

CANDIDATES_SCHEMA_PATH = (
    Path(__file__).resolve().parents[2]
    / "schema"
    / "source_catalog"
    / "tmdb_us_theatrical_candidates"
    / "v1.0.0.json"
)

FETCH_SUCCESS = "success"
FETCH_PARTIAL = "partial"
FETCH_FAILED = "failed"

# Quality diagnostics. These are recorded, never used to drop candidates.
FLAG_MISSING_POSTER = "missing_poster"
FLAG_VERY_LOW_POPULARITY = "very_low_popularity"
FLAG_NO_VOTES_LOW_POPULARITY = "no_votes_and_low_popularity"
FLAG_MISSING_OVERVIEW = "missing_overview"

QUALITY_FLAGS = (
    FLAG_MISSING_POSTER,
    FLAG_VERY_LOW_POPULARITY,
    FLAG_NO_VOTES_LOW_POPULARITY,
    FLAG_MISSING_OVERVIEW,
)

LOW_POPULARITY_THRESHOLD = 1.0
UNVETTED_POPULARITY_THRESHOLD = 3.0

REASON_MISSING_ID = "missing_tmdb_id"
REASON_MISSING_TITLE = "missing_title"
REASON_UNPARSABLE_DATE = "unparsable_release_date"
REASON_OUTSIDE_WINDOW = "release_date_outside_window"
REASON_ADULT = "adult_flagged"


class TmdbDiscoverError(ValueError):
    """Raised when discover inputs cannot be fetched or normalized."""


class TmdbDiscoverValidationError(TmdbDiscoverError):
    """Raised when the durable candidates artifact fails validation."""


@dataclass
class DiscoverFetchResult:
    """Outcome of walking the paginated Discover response."""

    status: str
    rows: list[dict[str, Any]] = field(default_factory=list)
    pages_fetched: int = 0
    reported_total_results: int | None = None
    reported_total_pages: int | None = None
    exhausted: bool = False
    errors: list[dict[str, Any]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status in {FETCH_SUCCESS, FETCH_PARTIAL} and bool(self.rows)


def _now_pacific_iso() -> str:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")


def discover_params(*, start_date: date, end_date: date, page: int) -> dict[str, Any]:
    """Build the exact Discover query parameters for one page."""
    return {
        "page": page,
        "include_adult": "false",
        "language": LANGUAGE,
        "region": REGION,
        "release_date.gte": start_date.isoformat(),
        "release_date.lte": end_date.isoformat(),
        "with_release_type": RELEASE_TYPES,
        "sort_by": SORT_BY,
    }


def fetch_us_theatrical(
    client: TmdbClient,
    *,
    start_date: date,
    end_date: date,
    max_pages: int = DEFAULT_MAX_PAGES,
) -> DiscoverFetchResult:
    """Page through Discover for the window, recording pagination facts."""
    result = DiscoverFetchResult(status=FETCH_FAILED)

    for page in range(1, max_pages + 1):
        try:
            response = client.discover_movie(
                discover_params(start_date=start_date, end_date=end_date, page=page)
            )
        except Exception as exc:  # noqa: BLE001 - request failures are data here
            result.errors.append(
                {
                    "page": page,
                    "error": sanitize_error_message(f"{type(exc).__name__}: {exc}"),
                }
            )
            break

        rows = [row for row in response.get("results", []) if isinstance(row, Mapping)]
        if page == 1:
            total_results = response.get("total_results")
            total_pages = response.get("total_pages")
            result.reported_total_results = (
                int(total_results) if isinstance(total_results, int) else None
            )
            result.reported_total_pages = (
                int(total_pages) if isinstance(total_pages, int) else None
            )

        result.rows.extend(dict(row) for row in rows)
        result.pages_fetched = page

        total_pages = response.get("total_pages") or 0
        if not rows or page >= int(total_pages):
            result.exhausted = True
            break

    if result.rows and not result.errors:
        result.status = FETCH_SUCCESS
    elif result.rows:
        result.status = FETCH_PARTIAL
    else:
        result.status = FETCH_FAILED
    return result


def _parse_date(value: Any) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def quality_flags_for(
    *,
    has_poster: bool,
    popularity: float,
    vote_count: int,
    has_overview: bool,
) -> list[str]:
    """Return quality diagnostics for one candidate."""
    flags: list[str] = []
    if not has_poster:
        flags.append(FLAG_MISSING_POSTER)
    if popularity < LOW_POPULARITY_THRESHOLD:
        flags.append(FLAG_VERY_LOW_POPULARITY)
    if vote_count == 0 and popularity < UNVETTED_POPULARITY_THRESHOLD:
        flags.append(FLAG_NO_VOTES_LOW_POPULARITY)
    if not has_overview:
        flags.append(FLAG_MISSING_OVERVIEW)
    return flags


def normalize_discover_row(
    row: Mapping[str, Any],
    *,
    start_date: date,
    end_date: date,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Project one Discover row into a candidate record.

    Returns ``(candidate, invalid_reasons)``. ``candidate`` is ``None`` when the
    row cannot be used at all (no id or no title).
    """
    reasons: list[str] = []

    raw_id = row.get("id")
    tmdb_id: int | None = None
    if isinstance(raw_id, int) and not isinstance(raw_id, bool):
        tmdb_id = raw_id
    else:
        try:
            tmdb_id = int(str(raw_id).strip())
        except (TypeError, ValueError):
            tmdb_id = None
    if tmdb_id is None:
        reasons.append(REASON_MISSING_ID)

    title = str(row.get("title") or "").strip()
    if not title:
        reasons.append(REASON_MISSING_TITLE)

    release_date = _parse_date(row.get("release_date"))
    if release_date is None:
        reasons.append(REASON_UNPARSABLE_DATE)
    elif not (start_date <= release_date <= end_date):
        reasons.append(REASON_OUTSIDE_WINDOW)

    if row.get("adult") is True:
        reasons.append(REASON_ADULT)

    if tmdb_id is None or not title:
        return None, reasons

    raw_popularity = row.get("popularity")
    popularity = float(raw_popularity) if isinstance(raw_popularity, (int, float)) else 0.0
    raw_votes = row.get("vote_count")
    vote_count = int(raw_votes) if isinstance(raw_votes, int) and not isinstance(raw_votes, bool) else 0
    poster_path = row.get("poster_path")
    has_poster = bool(poster_path)
    has_overview = bool(str(row.get("overview") or "").strip())

    candidate = {
        "source": SOURCE,
        "tmdb_id": tmdb_id,
        "title": title,
        "original_title": str(row.get("original_title") or "").strip() or None,
        "original_language": str(row.get("original_language") or "").strip() or None,
        "release_date": release_date.isoformat() if release_date else None,
        "popularity": round(popularity, 3),
        "vote_count": vote_count,
        "poster_path": str(poster_path) if poster_path else None,
        "has_poster": has_poster,
        "has_overview": has_overview,
        "quality_flags": quality_flags_for(
            has_poster=has_poster,
            popularity=popularity,
            vote_count=vote_count,
            has_overview=has_overview,
        ),
    }
    return candidate, reasons


def _candidate_stats(
    candidates: Sequence[Mapping[str, Any]],
    *,
    raw_rows: int,
    invalid_reason_counts: Mapping[str, int],
) -> dict[str, Any]:
    dates = sorted(str(c["release_date"]) for c in candidates if c.get("release_date"))
    flag_counts = {flag: 0 for flag in QUALITY_FLAGS}
    for candidate in candidates:
        for flag in candidate.get("quality_flags") or []:
            if flag in flag_counts:
                flag_counts[flag] += 1
    return {
        "raw_rows": raw_rows,
        "candidates": len(candidates),
        "rejected_rows": raw_rows - len(candidates),
        "with_poster": sum(1 for c in candidates if c.get("has_poster")),
        "without_poster": sum(1 for c in candidates if not c.get("has_poster")),
        "with_quality_flags": sum(1 for c in candidates if c.get("quality_flags")),
        "earliest_release_date": dates[0] if dates else None,
        "latest_release_date": dates[-1] if dates else None,
        "quality_flag_counts": flag_counts,
        "rejected_reason_counts": {
            key: int(value) for key, value in sorted(invalid_reason_counts.items())
        },
    }


def build_us_theatrical_candidates(
    fetch_result: DiscoverFetchResult,
    *,
    start_date: date,
    end_date: date,
    window_days: int,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build the durable TMDB US theatrical candidates artifact."""
    stamp = generated_at or _now_pacific_iso()

    candidates: list[dict[str, Any]] = []
    invalid_reason_counts: dict[str, int] = {}
    seen: set[int] = set()
    duplicates = 0

    for row in fetch_result.rows:
        candidate, reasons = normalize_discover_row(
            row, start_date=start_date, end_date=end_date
        )
        if reasons:
            for reason in reasons:
                invalid_reason_counts[reason] = invalid_reason_counts.get(reason, 0) + 1
        if candidate is None or reasons:
            # Only fully valid, in-window candidates enter the durable artifact;
            # rejection reasons stay as counts for diagnostics.
            continue
        if candidate["tmdb_id"] in seen:
            duplicates += 1
            continue
        seen.add(candidate["tmdb_id"])
        candidates.append(candidate)

    candidates.sort(key=lambda item: (str(item["release_date"]), item["title"].casefold()))

    stats = _candidate_stats(
        candidates,
        raw_rows=len(fetch_result.rows),
        invalid_reason_counts=invalid_reason_counts,
    )
    stats["duplicate_ids_skipped"] = duplicates

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "query": {
            "endpoint": DISCOVER_PATH,
            "region": REGION,
            "release_types": RELEASE_TYPES,
            "sort_by": SORT_BY,
            "language": LANGUAGE,
            "include_adult": False,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "window_days": window_days,
            "timezone": DEFAULT_TIMEZONE,
        },
        "fetch": {
            "status": fetch_result.status,
            "pages_fetched": fetch_result.pages_fetched,
            "reported_total_results": fetch_result.reported_total_results,
            "reported_total_pages": fetch_result.reported_total_pages,
            "exhausted": fetch_result.exhausted,
            "errors": list(fetch_result.errors),
        },
        "stats": stats,
        "candidates": candidates,
    }


def validate_us_theatrical_candidates(artifact: Mapping[str, Any]) -> None:
    """Validate the durable candidates artifact plus structural invariants."""
    try:
        validate_against_schema(
            artifact, CANDIDATES_SCHEMA_PATH, label="tmdb_us_theatrical_candidates"
        )
    except SchemaValidationError as exc:
        raise TmdbDiscoverValidationError(str(exc)) from exc

    query = artifact.get("query") or {}
    start = _parse_date(query.get("start_date"))
    end = _parse_date(query.get("end_date"))
    if start is None or end is None or end < start:
        raise TmdbDiscoverValidationError("candidates query window is invalid")

    seen: set[int] = set()
    for candidate in artifact.get("candidates") or []:
        tmdb_id = candidate.get("tmdb_id")
        if tmdb_id in seen:
            raise TmdbDiscoverValidationError(f"duplicate tmdb_id: {tmdb_id!r}")
        seen.add(tmdb_id)
        released = _parse_date(candidate.get("release_date"))
        if released is None or not (start <= released <= end):
            raise TmdbDiscoverValidationError(
                f"candidate {tmdb_id!r} release_date outside query window"
            )


def write_us_theatrical_candidates(
    artifact: Mapping[str, Any],
    path: Path | str = DEFAULT_CANDIDATES_PATH,
) -> Path:
    """Write the durable candidates JSON file."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return target


def load_us_theatrical_candidates(
    path: Path | str = DEFAULT_CANDIDATES_PATH,
) -> dict[str, Any] | None:
    """Load durable candidates, returning ``None`` when absent or unusable."""
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


def build_live_client() -> TmdbClient:
    """Build a cache-free TMDB client from environment credentials."""
    try:
        auth = resolve_tmdb_auth(require=True)
    except TmdbAuthError as exc:
        raise TmdbDiscoverError(sanitize_error_message(str(exc)) or "TMDB auth unavailable") from exc
    # cache=None forces live HTTP so a stale cache cannot masquerade as a fetch.
    return TmdbClient(auth, cache=None)
