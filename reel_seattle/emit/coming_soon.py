"""Emit the production ``coming_soon_current.json`` artifact.

Coming Soon answers: *what movies are expected to become theatrically available
soon, including titles whose local Seattle showtimes have not been announced
yet?* It looks 90 days ahead, deliberately wider than Opening This Week.

Four evidence facts are tracked independently and never inferred from each
other:

``amc_coming_soon_catalog``
    The film appears in AMC's national ``/v2/movies/views/coming-soon`` catalog.
``amc_theater_booking``
    A Seattle-area AMC theater has an actual performance booked (scrape log).
``tmdb_us_theatrical``
    TMDB lists a US theatrical / limited-theatrical release in the window.
``reel_seattle_scheduled``
    The published ``showtimes_current`` artifact has a screening.

Classification (first match wins):

``currently_available``
    A local screening falls on or before the current-availability cutoff. Never
    emitted as an entry; counted in diagnostics only.
``confirmed_local``
    A *local* future screening exists past the cutoff. Strongest evidence.
``amc_announced``
    In the AMC Coming Soon catalog with a catalog release date inside the
    window. May have no performances anywhere and no Seattle booking.
``tmdb_only``
    TMDB evidence with neither AMC catalog membership nor a confirmed local
    screening. Retained in the analysis artifact
    (``data/audits/coming_soon_candidates_current.json``) and never shipped in
    ``public/data/coming_soon_current.json``.

The public artifact contains only user-visible cards: ``confirmed_local`` and
``amc_announced`` rows that survive the conservative presentation filter.
High-confidence AMC product noise (private-theatre rentals, dated Untitled
distributor slots, operational repeats) is kept in the analysis artifact.

"Local" means Seattle-area: both the published showtimes artifact and the AMC
scrape log cover the theater allowlist only. A booking somewhere else in the
country never reaches this module and never makes a film ``confirmed_local``.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.adapters.scrape_log import daily_log_path, load_scrape_daily_log
from reel_seattle.analysis.film_identity import derive_parent_identity
from reel_seattle.film_identity.ids import parse_film_id
from reel_seattle.film_identity.public_emit import (
    build_confirmed_tmdb_index,
    load_identity_catalog,
    observation_key,
)
from reel_seattle.emit.coming_soon_presentation import (
    DEFAULT_ENRICHMENT_PATH,
    DEFAULT_PRODUCTS_PATH,
    classify_presentation_kind,
    is_public_presentation,
    load_amc_product_index,
    load_enrichment_index,
    local_status_for,
    local_theaters_payload,
    resolve_presentation,
    theater_name_lookup,
)
from reel_seattle.normalize import (
    DEFAULT_TIMEZONE,
    build_theater_index,
    format_date_iso,
    normalize_film_title,
    resolve_theater,
)
from reel_seattle.validate import (
    validate_coming_soon_candidates,
    validate_coming_soon_current,
)

COMING_SOON_SCHEMA_VERSION = "1.1.0"
COMING_SOON_CANDIDATES_SCHEMA_VERSION = "1.0.0"
METHOD_NAME = "independent_source_evidence_90d"
METHOD_VERSION = "1.1.0"
METHOD_DESCRIPTION = (
    "Coming Soon membership is a 90-day Pacific-local window over four "
    "independent evidence facts: AMC Coming Soon catalog membership, "
    "Seattle-area AMC theater bookings, TMDB US theatrical releases, and "
    "published Reel Seattle showtimes. A film with any local screening on or "
    "before the current-availability cutoff is excluded. Otherwise a local "
    "future screening yields confirmed_local and AMC catalog membership with "
    "an in-window catalog release date yields amc_announced. Those rows are "
    "user-visible unless a high-confidence presentation filter marks them as "
    "rental, untitled-placeholder, or operational SKUs. TMDB-only evidence is "
    "retained in the analysis artifact and is never user-visible."
)

DEFAULT_WINDOW_DAYS = 90
DEFAULT_CURRENT_AVAILABILITY_DAYS = 7
# Title-based joins require release dates this close, so remakes and reissues
# sharing a normalized title are not collapsed into one film.
TITLE_JOIN_TOLERANCE_DAYS = 45

DEFAULT_OUTPUT_PATH = Path("public/data/coming_soon_current.json")
DEFAULT_ANALYSIS_PATH = Path("data/audits/coming_soon_candidates_current.json")
DEFAULT_SHOWTIMES_CURRENT_PATH = Path("public/data/showtimes_current.json")
DEFAULT_REGISTRY_PATH = Path("data/theaters.json")
DEFAULT_LOGS_DIR = Path("data/daily_logs")

SOURCE_AMC_CATALOG = "amc_catalog"
SOURCE_AMC_BOOKING = "amc_booking"
SOURCE_REEL_SEATTLE = "reel_seattle"
SOURCE_TMDB = "tmdb"

CLASSIFICATION_CONFIRMED_LOCAL = "confirmed_local"
CLASSIFICATION_AMC_ANNOUNCED = "amc_announced"
CLASSIFICATION_TMDB_ONLY = "tmdb_only"
CLASSIFICATION_CURRENTLY_AVAILABLE = "currently_available"
CLASSIFICATION_UNCLASSIFIED = "unclassified"

USER_VISIBLE_CLASSIFICATIONS = frozenset(
    {CLASSIFICATION_CONFIRMED_LOCAL, CLASSIFICATION_AMC_ANNOUNCED}
)

RELEASE_SOURCE_LOCAL = "reel_seattle_first_local_screening"
RELEASE_SOURCE_AMC = "amc_catalog_release_date"
RELEASE_SOURCE_TMDB = "tmdb_us_release_date"

LOCAL_SOURCE_SHOWTIMES = "reel_seattle_showtimes"
LOCAL_SOURCE_AMC_BOOKING = "amc_theater_booking"

IDENTITY_METHOD_FILM_ID = "film_id"
IDENTITY_METHOD_AMC_MOVIE_ID = "amc_movie_id"
IDENTITY_METHOD_TMDB_ID = "tmdb_id"
IDENTITY_METHOD_JOIN_KEY = "join_key"

DROP_REASON_OUTSIDE_WINDOW = "expected_release_date_outside_window"
DROP_REASON_NO_EXPECTED_DATE = "no_expected_release_date"
DROP_REASON_CURRENTLY_AVAILABLE = "currently_available"
DROP_REASON_UNCLASSIFIED = "insufficient_evidence"
DROP_REASON_PRESENTATION_FILTER = "presentation_filter"

# Trailing event / screening phrases that mark an AMC catalog duplicate of a
# base title rather than a distinct film.
_EVENT_SUFFIX_PATTERN = re.compile(
    r"(?:"
    r"q\s*&\s*a|q\s*and\s*a|fan\s*event|fan\s*first|early\s*access|"
    r"opening\s*night|premiere\s*event|sneak\s*peek|advance\s*screening|"
    r"sing[-\s]?along|encore|marathon|double\s*feature|triple\s*feature|"
    r"anniversary|re[-\s]?release|special\s*(?:screening|presentation|event)|"
    r"live\s*(?:in\s*concert|event|stream)|presented\s*by|with\s*director|"
    r"screen\s*unseen|scream\s*unseen|mystery\s*(?:movie|screening)|"
    r"private\s*theat(?:re|er)\s*rental|insider\s*screening"
    r")",
    re.IGNORECASE,
)
_SUFFIX_SPLIT_PATTERN = re.compile(
    r"\s+[-\u2013\u2014]\s+|\s*:\s+|\s*\(|\s*\u2013\s*"
)


def pacific_today(now: datetime | None = None) -> date:
    """Return today's calendar date in America/Los_Angeles."""
    if now is None:
        return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    if now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    return now.astimezone(ZoneInfo(DEFAULT_TIMEZONE)).date()


def fold_diacritics(value: str) -> str:
    """Strip combining marks so ``Amélie`` and ``Amelie`` share a join key."""
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def coming_soon_join_key(title: str, *, source_film_id: str | None = None) -> str:
    """Derive the cross-source join key for a title.

    Wraps the shared parent-film identity derivation with diacritic folding.
    ``derive_parent_identity`` itself is left untouched because its output is
    published inside ``showtimes_current``.
    """
    text = normalize_film_title(title) or str(title or "").strip()
    identity = derive_parent_identity(
        fold_diacritics(text), source_film_id=source_film_id or ""
    )
    key = identity.parent_film_key or ""
    if key:
        return key
    return fold_diacritics(text).casefold().strip()


def strip_event_suffix(title: str) -> str | None:
    """Return the base title when *title* ends in an event/screening phrase.

    The event phrase must begin the trailing segment. Otherwise a sequel title
    such as ``Dune: Part Three Insider Screenings`` would strip back to
    ``Dune`` and collapse into a genuinely different film.
    """
    text = normalize_film_title(title) or str(title or "").strip()
    if not text:
        return None
    for match in _SUFFIX_SPLIT_PATTERN.finditer(text):
        head = text[: match.start()].strip()
        tail = text[match.end() :].strip()
        if head and tail and _EVENT_SUFFIX_PATTERN.match(tail):
            return head
    return None


def _parse_iso_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def _parse_us_date(value: Any) -> date | None:
    """Parse ``MM/DD/YYYY`` scrape-log dates."""
    if not isinstance(value, str):
        return None
    parts = value.strip().split("/")
    if len(parts) != 3:
        return None
    try:
        month, day, year = (int(part) for part in parts)
        return date(year, month, day)
    except ValueError:
        return None


@dataclass
class ComingSoonCandidate:
    """One film's accumulated Coming Soon evidence across sources.

    Evidence flags stay independent: a Seattle booking never sets the catalog
    flag, and catalog membership never sets a local-scheduling flag.
    """

    join_key: str
    title: str

    # Identity
    film_id: str | None = None
    # True only when film_id came from the reviewed identity catalog (or an
    # artifact that already emits confirmed-only ids). TMDB discover rows
    # assert their own id, which is accurate but never review-confirmed.
    film_id_confirmed: bool = False
    tmdb_id: int | None = None
    amc_movie_ids: set[str] = field(default_factory=set)
    parent_film_keys: set[str] = field(default_factory=set)
    showtime_film_keys: set[str] = field(default_factory=set)
    film_id_conflict: bool = False

    # Independent evidence flags
    amc_coming_soon_catalog: bool = False
    amc_theater_booking: bool = False
    tmdb_us_theatrical: bool = False
    reel_seattle_scheduled: bool = False

    # Dates
    amc_catalog_release_date: date | None = None
    tmdb_us_release_date: date | None = None
    first_local_screening_date: date | None = None
    first_local_screening_source: str | None = None
    earliest_current_screening: date | None = None

    # Local scheduling
    local_theater_ids: set[str] = field(default_factory=set)
    local_showtime_count: int = 0

    # Source metadata retained for the UI and later inclusion models
    amc_metadata: dict[str, Any] | None = None
    tmdb_metadata: dict[str, Any] | None = None
    titles: set[str] = field(default_factory=set)
    contributing_sources: set[str] = field(default_factory=set)

    def anchor_date(self) -> date | None:
        """Best-known release date, used for conservative title joins."""
        return (
            self.first_local_screening_date
            or self.amc_catalog_release_date
            or self.tmdb_us_release_date
            or self.earliest_current_screening
        )

    def note_local_screening(self, when: date, *, source: str) -> None:
        """Record a future local screening date, keeping the earliest."""
        if self.first_local_screening_date is None or when < self.first_local_screening_date:
            self.first_local_screening_date = when
            self.first_local_screening_source = source

    def note_current_screening(self, when: date) -> None:
        if self.earliest_current_screening is None or when < self.earliest_current_screening:
            self.earliest_current_screening = when

    def merge_from(self, other: ComingSoonCandidate) -> None:
        """Fold *other* into this candidate without losing evidence."""
        self.amc_coming_soon_catalog = self.amc_coming_soon_catalog or other.amc_coming_soon_catalog
        self.amc_theater_booking = self.amc_theater_booking or other.amc_theater_booking
        self.tmdb_us_theatrical = self.tmdb_us_theatrical or other.tmdb_us_theatrical
        self.reel_seattle_scheduled = self.reel_seattle_scheduled or other.reel_seattle_scheduled

        self.amc_movie_ids |= other.amc_movie_ids
        self.parent_film_keys |= other.parent_film_keys
        self.showtime_film_keys |= other.showtime_film_keys
        self.local_theater_ids |= other.local_theater_ids
        self.titles |= other.titles
        self.contributing_sources |= other.contributing_sources
        self.local_showtime_count += other.local_showtime_count

        if self.film_id is None:
            self.film_id = other.film_id
            self.film_id_confirmed = other.film_id_confirmed
        elif other.film_id is not None and other.film_id != self.film_id:
            if other.film_id_confirmed and not self.film_id_confirmed:
                # A reviewed identity outranks a self-asserted one.
                self.film_id = other.film_id
                self.film_id_confirmed = True
            elif self.film_id_confirmed and not other.film_id_confirmed:
                pass
            else:
                self.film_id_conflict = True
        elif other.film_id_confirmed:
            self.film_id_confirmed = True
        self.film_id_conflict = self.film_id_conflict or other.film_id_conflict

        if self.tmdb_id is None:
            self.tmdb_id = other.tmdb_id

        for attr in ("amc_catalog_release_date", "tmdb_us_release_date"):
            mine = getattr(self, attr)
            theirs = getattr(other, attr)
            if theirs is not None and (mine is None or theirs < mine):
                setattr(self, attr, theirs)

        if other.first_local_screening_date is not None:
            self.note_local_screening(
                other.first_local_screening_date,
                source=other.first_local_screening_source or LOCAL_SOURCE_SHOWTIMES,
            )
        if other.earliest_current_screening is not None:
            self.note_current_screening(other.earliest_current_screening)

        if self.amc_metadata is None:
            self.amc_metadata = other.amc_metadata
        if self.tmdb_metadata is None:
            self.tmdb_metadata = other.tmdb_metadata

    def classify(self, *, window_start: date, window_end: date) -> str:
        """Classify this candidate under the production inclusion rule."""
        if self.earliest_current_screening is not None:
            return CLASSIFICATION_CURRENTLY_AVAILABLE
        if self.first_local_screening_date is not None:
            return CLASSIFICATION_CONFIRMED_LOCAL
        if self.amc_coming_soon_catalog:
            released = self.amc_catalog_release_date
            if released is not None and window_start <= released <= window_end:
                return CLASSIFICATION_AMC_ANNOUNCED
            # Catalog membership without an in-window catalog date is not a
            # user-visible announcement; fall through to TMDB evidence.
            if self.tmdb_us_theatrical:
                return CLASSIFICATION_TMDB_ONLY
            return CLASSIFICATION_UNCLASSIFIED
        if self.tmdb_us_theatrical:
            return CLASSIFICATION_TMDB_ONLY
        return CLASSIFICATION_UNCLASSIFIED

    def expected_release(self, classification: str) -> tuple[date | None, str | None]:
        """Resolve expected release date and its source for a classification."""
        if classification == CLASSIFICATION_CONFIRMED_LOCAL:
            if self.first_local_screening_date is not None:
                return self.first_local_screening_date, RELEASE_SOURCE_LOCAL
        if classification == CLASSIFICATION_AMC_ANNOUNCED:
            if self.amc_catalog_release_date is not None:
                return self.amc_catalog_release_date, RELEASE_SOURCE_AMC
        if classification == CLASSIFICATION_TMDB_ONLY:
            if self.tmdb_us_release_date is not None:
                return self.tmdb_us_release_date, RELEASE_SOURCE_TMDB
        # Fall back through the documented source priority.
        if self.first_local_screening_date is not None:
            return self.first_local_screening_date, RELEASE_SOURCE_LOCAL
        if self.amc_catalog_release_date is not None:
            return self.amc_catalog_release_date, RELEASE_SOURCE_AMC
        if self.tmdb_us_release_date is not None:
            return self.tmdb_us_release_date, RELEASE_SOURCE_TMDB
        return None, None

    def resolved_tmdb_id(self) -> int | None:
        """Best-known TMDB id, whether review-confirmed or inferred."""
        if self.tmdb_id is not None:
            return self.tmdb_id
        return _tmdb_id_from_film_id(self.film_id)

    def identity_method(self) -> str:
        if self.film_id and self.film_id_confirmed:
            return IDENTITY_METHOD_FILM_ID
        if self.amc_movie_ids:
            return IDENTITY_METHOD_AMC_MOVIE_ID
        if self.tmdb_id is not None:
            return IDENTITY_METHOD_TMDB_ID
        return IDENTITY_METHOD_JOIN_KEY


# ---------------------------------------------------------------------------
# Source extraction
# ---------------------------------------------------------------------------


def extract_reel_seattle_future_screenings(
    *,
    showtimes_current: Mapping[str, Any],
    today_date: date,
) -> dict[str, dict[str, Any]]:
    """Extract screenings on/after *today_date* from ``showtimes_current``.

    Returns ``showtime_film_key -> screening info``. The published artifact
    stores the Pacific calendar day under ``date``; ``local_date`` is accepted
    as a fallback so older artifacts still parse.
    """
    future_by_key: dict[str, dict[str, Any]] = {}

    for showtime in showtimes_current.get("showtimes", []):
        if not isinstance(showtime, Mapping):
            continue
        local_date = _parse_iso_date(
            showtime.get("date") or showtime.get("local_date")
        )
        if local_date is None or local_date < today_date:
            continue

        film_key = str(showtime.get("showtime_film_key") or "").strip()
        if not film_key:
            continue

        info = future_by_key.get(film_key)
        if info is None:
            info = {
                "title": showtime.get("film_title") or "",
                "film_id": showtime.get("film_id"),
                "parent_film_key": showtime.get("parent_film_key"),
                "earliest_date": local_date,
                "theaters": set(),
                "source_film_ids": set(),
                "sources": set(),
                "showtime_count": 0,
                "dates": set(),
            }
            future_by_key[film_key] = info
        elif local_date < info["earliest_date"]:
            info["earliest_date"] = local_date

        if not info.get("film_id") and showtime.get("film_id"):
            info["film_id"] = showtime.get("film_id")
        if not info.get("title") and showtime.get("film_title"):
            info["title"] = showtime.get("film_title")

        info["showtime_count"] += 1
        info["dates"].add(local_date)
        theater_id = str(showtime.get("theater_id") or "").strip()
        if theater_id:
            info["theaters"].add(theater_id)
        source_id = showtime.get("source_film_id")
        if source_id:
            info["source_film_ids"].add(str(source_id).strip())
        source = str(showtime.get("source") or "").strip()
        if source:
            info["sources"].add(source)

    return future_by_key


def candidates_from_reel_seattle(
    future_by_key: Mapping[str, Mapping[str, Any]],
    *,
    current_window_end: date,
    film_id_index: Mapping[str, str] | None = None,
) -> list[ComingSoonCandidate]:
    """Build candidates from published future showtimes."""
    index = film_id_index or {}
    candidates: list[ComingSoonCandidate] = []

    for film_key, info in future_by_key.items():
        title = normalize_film_title(info.get("title")) or film_key
        source_ids = {str(sid) for sid in info.get("source_film_ids") or set() if sid}
        amc_ids = {sid for sid in source_ids if sid.isdigit()}
        candidate = ComingSoonCandidate(
            join_key=coming_soon_join_key(title, source_film_id=next(iter(sorted(amc_ids)), None)),
            title=title,
            film_id=info.get("film_id") or None,
            reel_seattle_scheduled=True,
            local_showtime_count=int(info.get("showtime_count") or 0),
        )
        candidate.titles.add(title)
        candidate.showtime_film_keys.add(film_key)
        candidate.contributing_sources.add(SOURCE_REEL_SEATTLE)
        parent_key = info.get("parent_film_key")
        if parent_key:
            candidate.parent_film_keys.add(str(parent_key))
        candidate.local_theater_ids |= {
            str(tid) for tid in info.get("theaters") or set() if tid
        }
        if "amc" in {str(s).casefold() for s in info.get("sources") or set()}:
            candidate.amc_movie_ids |= amc_ids

        if candidate.film_id is None and amc_ids:
            candidate.film_id = _film_id_for_amc_ids(amc_ids, index)
        if candidate.film_id:
            # showtimes_current emits confirmed-only film ids.
            candidate.film_id_confirmed = True
            candidate.tmdb_id = _tmdb_id_from_film_id(candidate.film_id)

        dates = sorted(info.get("dates") or {info.get("earliest_date")})
        for when in dates:
            if when is None:
                continue
            if when <= current_window_end:
                candidate.note_current_screening(when)
            else:
                candidate.note_local_screening(when, source=LOCAL_SOURCE_SHOWTIMES)

        candidates.append(candidate)

    return candidates


def extract_amc_theater_bookings(
    *,
    amc_scrape_log_path: Path,
    today_date: date,
    window_end: date,
    current_window_end: date,
    published_window_end: date | None = None,
    theater_index: Any | None = None,
    film_id_index: Mapping[str, str] | None = None,
) -> list[ComingSoonCandidate]:
    """Extract Seattle-area AMC performance bookings from a daily scrape log.

    These are real booked performances at allowlisted theaters, which is a
    different fact from AMC Coming Soon catalog membership. Screenings at or
    before *published_window_end* are left to ``showtimes_current`` so local
    showtime counts are not double counted.
    """
    path = Path(amc_scrape_log_path)
    if not path.is_file():
        return []

    index = film_id_index or {}
    result = load_scrape_daily_log(path)
    by_movie: dict[str, dict[str, Any]] = {}

    for record in result.records:
        attributes = record.attributes or {}
        movie_id = str(attributes.get("movie_id") or "").strip()
        if not movie_id:
            continue
        show_date = _parse_us_date(record.date_raw)
        if show_date is None or not (today_date <= show_date <= window_end):
            continue

        info = by_movie.get(movie_id)
        if info is None:
            info = {
                "title": record.title_raw,
                "current_dates": set(),
                "future_dates": set(),
                "theater_names": set(),
                "tail_screenings": 0,
            }
            by_movie[movie_id] = info

        if show_date <= current_window_end:
            info["current_dates"].add(show_date)
        else:
            info["future_dates"].add(show_date)
            if published_window_end is not None and show_date > published_window_end:
                info["tail_screenings"] += 1
                if record.theater_name_raw:
                    info["theater_names"].add(record.theater_name_raw)

    candidates: list[ComingSoonCandidate] = []
    for movie_id, info in by_movie.items():
        title = normalize_film_title(info["title"]) or str(info["title"])
        candidate = ComingSoonCandidate(
            join_key=coming_soon_join_key(title, source_film_id=movie_id),
            title=title,
            amc_theater_booking=True,
            local_showtime_count=int(info["tail_screenings"]),
        )
        candidate.titles.add(title)
        candidate.amc_movie_ids.add(movie_id)
        candidate.contributing_sources.add(SOURCE_AMC_BOOKING)
        identity = derive_parent_identity(title, source_film_id=movie_id)
        if identity.parent_film_key:
            candidate.parent_film_keys.add(identity.parent_film_key)

        candidate.film_id = _film_id_for_amc_ids({movie_id}, index)
        if candidate.film_id:
            candidate.film_id_confirmed = True
            candidate.tmdb_id = _tmdb_id_from_film_id(candidate.film_id)

        for when in sorted(info["current_dates"]):
            candidate.note_current_screening(when)
        for when in sorted(info["future_dates"]):
            candidate.note_local_screening(when, source=LOCAL_SOURCE_AMC_BOOKING)

        if theater_index is not None:
            for name in info["theater_names"]:
                resolution = resolve_theater(name, theater_index)
                if resolution is not None:
                    candidate.local_theater_ids.add(resolution.theater_id)

        candidates.append(candidate)

    return candidates


def candidates_from_amc_catalog(
    catalog: Mapping[str, Any] | None,
    *,
    film_id_index: Mapping[str, str] | None = None,
) -> list[ComingSoonCandidate]:
    """Build candidates from the durable AMC Coming Soon catalog snapshot."""
    if not catalog:
        return []
    index = film_id_index or {}
    candidates: list[ComingSoonCandidate] = []

    for movie in catalog.get("movies") or []:
        if not isinstance(movie, Mapping):
            continue
        movie_id = str(movie.get("source_film_id") or "").strip()
        raw_title = movie.get("source_title") or ""
        # Pass AMC catalog titles through. AMC sometimes ships a literal '?'
        # where an apostrophe or diacritic failed upstream (e.g. movie 84887
        # ``Reve d?Afrique``). Do not guess a corrected spelling here.
        title = normalize_film_title(raw_title) or str(raw_title).strip()
        if not movie_id or not title:
            continue

        candidate = ComingSoonCandidate(
            join_key=coming_soon_join_key(title, source_film_id=movie_id),
            title=title,
            amc_coming_soon_catalog=True,
            amc_catalog_release_date=_parse_iso_date(movie.get("release_date_utc")),
        )
        candidate.titles.add(title)
        candidate.amc_movie_ids.add(movie_id)
        candidate.contributing_sources.add(SOURCE_AMC_CATALOG)
        identity = derive_parent_identity(title, source_film_id=movie_id)
        if identity.parent_film_key:
            candidate.parent_film_keys.add(identity.parent_film_key)

        candidate.film_id = _film_id_for_amc_ids({movie_id}, index)
        if candidate.film_id:
            candidate.film_id_confirmed = True
            candidate.tmdb_id = _tmdb_id_from_film_id(candidate.film_id)

        presentation = movie.get("presentation") or {}
        media = movie.get("media") or {}
        candidate.amc_metadata = {
            "amc_movie_id": movie_id,
            "source_title": str(raw_title) or None,
            "has_scheduled_showtimes": movie.get("has_scheduled_showtimes"),
            "online_ticket_availability_date_utc": movie.get(
                "online_ticket_availability_date_utc"
            ),
            "earliest_showing_utc": movie.get("earliest_showing_utc"),
            "runtime_min": movie.get("runtime_min"),
            "mpaa_rating": movie.get("mpaa_rating"),
            "genre": movie.get("genre"),
            "slug": movie.get("slug"),
            "synopsis": movie.get("synopsis"),
            "poster_url": media.get("poster_url"),
            "hero_desktop_url": media.get("hero_desktop_url"),
            "hero_mobile_url": media.get("hero_mobile_url"),
            "presentation_category": presentation.get("category"),
            "is_special_presentation": presentation.get("is_special_presentation"),
        }
        candidates.append(candidate)

    return candidates


def candidates_from_tmdb(
    artifact: Mapping[str, Any] | None,
) -> list[ComingSoonCandidate]:
    """Build candidates from the durable TMDB US theatrical snapshot."""
    if not artifact:
        return []
    candidates: list[ComingSoonCandidate] = []

    for row in artifact.get("candidates") or []:
        if not isinstance(row, Mapping):
            continue
        tmdb_id = row.get("tmdb_id")
        title = normalize_film_title(row.get("title")) or str(row.get("title") or "").strip()
        if not isinstance(tmdb_id, int) or not title:
            continue

        candidate = ComingSoonCandidate(
            join_key=coming_soon_join_key(title),
            title=title,
            tmdb_id=tmdb_id,
            film_id=f"tmdb:{tmdb_id}",
            tmdb_us_theatrical=True,
            tmdb_us_release_date=_parse_iso_date(row.get("release_date")),
        )
        candidate.titles.add(title)
        candidate.contributing_sources.add(SOURCE_TMDB)
        identity = derive_parent_identity(title, source_film_id="")
        if identity.parent_film_key:
            candidate.parent_film_keys.add(identity.parent_film_key)
        candidate.tmdb_metadata = {
            "tmdb_id": tmdb_id,
            "original_title": row.get("original_title"),
            "original_language": row.get("original_language"),
            "popularity": row.get("popularity"),
            "vote_count": row.get("vote_count"),
            "poster_path": row.get("poster_path"),
            "backdrop_path": row.get("backdrop_path"),
            "overview": row.get("overview"),
            "has_poster": row.get("has_poster"),
            "has_overview": row.get("has_overview"),
            "quality_flags": list(row.get("quality_flags") or []),
        }
        candidates.append(candidate)

    return candidates


def _film_id_for_amc_ids(
    amc_ids: Iterable[str],
    index: Mapping[str, str],
) -> str | None:
    """Resolve a confirmed canonical film_id from AMC source ids."""
    resolved: set[str] = set()
    for movie_id in amc_ids:
        key = observation_key(
            source="amc", source_film_id=movie_id, showtime_film_key=None
        )
        if key is None:
            continue
        hit = index.get(key)
        if hit:
            resolved.add(hit)
    if len(resolved) == 1:
        return next(iter(resolved))
    return None


def _tmdb_id_from_film_id(film_id: str | None) -> int | None:
    if not film_id:
        return None
    try:
        return parse_film_id(film_id).tmdb_id
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


class _Union:
    """Minimal union-find over candidate list indices."""

    def __init__(self, size: int) -> None:
        self._parent = list(range(size))

    def find(self, item: int) -> int:
        while self._parent[item] != item:
            self._parent[item] = self._parent[self._parent[item]]
            item = self._parent[item]
        return item

    def union(self, left: int, right: int) -> None:
        a, b = self.find(left), self.find(right)
        if a != b:
            self._parent[max(a, b)] = min(a, b)


def _dates_compatible(left: date | None, right: date | None, *, tolerance_days: int) -> bool:
    if left is None or right is None:
        return True
    return abs((left - right).days) <= tolerance_days


def merge_candidates(
    amc_candidates: Sequence[ComingSoonCandidate],
    reel_seattle_future: Mapping[str, Mapping[str, Any]] | Sequence[ComingSoonCandidate],
    tmdb_candidates: Sequence[ComingSoonCandidate] | None = None,
    *,
    current_window_end: date | None = None,
    film_id_index: Mapping[str, str] | None = None,
    title_join_tolerance_days: int = TITLE_JOIN_TOLERANCE_DAYS,
) -> list[ComingSoonCandidate]:
    """Merge candidates from every source into one candidate per film.

    Join priority, most to least trustworthy:

    1. canonical ``film_id`` (confirmed TMDB identity)
    2. AMC movie id
    3. TMDB id
    4. parent film identity key
    5. diacritic-folded join key, only when release dates are compatible

    ``reel_seattle_future`` accepts either the mapping returned by
    :func:`extract_reel_seattle_future_screenings` or ready-made candidates.
    """
    if isinstance(reel_seattle_future, Mapping):
        cutoff = current_window_end or date.min
        local_candidates = candidates_from_reel_seattle(
            reel_seattle_future,
            current_window_end=cutoff,
            film_id_index=film_id_index,
        )
    else:
        local_candidates = list(reel_seattle_future)

    pool: list[ComingSoonCandidate] = [
        *amc_candidates,
        *local_candidates,
        *(tmdb_candidates or []),
    ]
    if not pool:
        return []

    union = _Union(len(pool))

    def link(index_map: Mapping[Any, list[int]]) -> None:
        for members in index_map.values():
            first = members[0]
            for other in members[1:]:
                union.union(first, other)

    by_film_id: dict[str, list[int]] = {}
    by_amc_id: dict[str, list[int]] = {}
    by_tmdb_id: dict[int, list[int]] = {}
    by_parent_key: dict[str, list[int]] = {}
    by_join_key: dict[str, list[int]] = {}

    for position, candidate in enumerate(pool):
        if candidate.film_id:
            by_film_id.setdefault(candidate.film_id, []).append(position)
        for movie_id in candidate.amc_movie_ids:
            by_amc_id.setdefault(movie_id, []).append(position)
        if candidate.tmdb_id is not None:
            by_tmdb_id.setdefault(candidate.tmdb_id, []).append(position)
        for parent_key in candidate.parent_film_keys:
            by_parent_key.setdefault(parent_key, []).append(position)
        by_join_key.setdefault(candidate.join_key, []).append(position)

    link(by_film_id)
    link(by_amc_id)
    link(by_tmdb_id)
    link(by_parent_key)

    # Title-only joins are the weakest signal: require compatible dates.
    for members in by_join_key.values():
        if len(members) < 2:
            continue
        ordered = sorted(
            members,
            key=lambda position: (
                pool[position].anchor_date() or date.max,
                position,
            ),
        )
        previous = ordered[0]
        for current in ordered[1:]:
            if _dates_compatible(
                pool[previous].anchor_date(),
                pool[current].anchor_date(),
                tolerance_days=title_join_tolerance_days,
            ):
                union.union(previous, current)
            previous = current

    grouped: dict[int, ComingSoonCandidate] = {}
    for position, candidate in enumerate(pool):
        root = union.find(position)
        existing = grouped.get(root)
        if existing is None:
            grouped[root] = candidate
        else:
            existing.merge_from(candidate)

    merged = list(grouped.values())
    for candidate in merged:
        candidate.title = _preferred_title(candidate)
    return merged


def _preferred_title(candidate: ComingSoonCandidate) -> str:
    """Pick the most display-worthy title among merged variants.

    The sort key is total so the published title cannot drift between runs
    when variants differ only by case: shortest first, then least shouty
    (AMC ships some rows in ALL CAPS), then a stable lexical tiebreak.
    """
    options = sorted(title for title in candidate.titles if title)
    if not options:
        return candidate.title
    base_titles = [strip_event_suffix(title) or title for title in options]
    return min(
        base_titles,
        key=lambda text: (
            len(text),
            sum(1 for char in text if char.isupper()),
            text.casefold(),
            text,
        ),
    )


def collapse_amc_event_variants(
    candidates: Sequence[ComingSoonCandidate],
) -> tuple[list[ComingSoonCandidate], int]:
    """Fold AMC event/screening variants into a base film already present.

    Only collapses when the trailing phrase is a recognized event marker *and*
    the base title is already a known candidate, so genuinely distinct films
    are never merged. Undelimited Q&A / fan-event titles with named guests
    stay separate even when a base film exists — those are distinct AMC
    products, not SKU suffixes.
    """
    by_key: dict[str, ComingSoonCandidate] = {}
    for candidate in candidates:
        by_key.setdefault(candidate.join_key, candidate)

    survivors: list[ComingSoonCandidate] = []
    collapsed = 0
    for candidate in candidates:
        # Check every variant title, not just the display title: merging may
        # already have promoted a shorter name that no longer shows the suffix.
        base = None
        for variant in sorted({candidate.title, *candidate.titles}):
            base_title = strip_event_suffix(variant)
            if not base_title:
                continue
            match = by_key.get(coming_soon_join_key(base_title))
            if match is not None and match is not candidate:
                base = match
                break
        if base is not None:
            base.merge_from(candidate)
            collapsed += 1
            continue
        survivors.append(candidate)
    return survivors, collapsed


# ---------------------------------------------------------------------------
# Artifact build
# ---------------------------------------------------------------------------


def _entry_from_candidate(
    candidate: ComingSoonCandidate,
    *,
    classification: str,
    expected: date,
    expected_source: str,
    theater_names: Mapping[str, str] | None = None,
    enrichment_index: Mapping[str, Mapping[str, Any]] | None = None,
    amc_product_index: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    amc_movie_id = None
    amc_ids = sorted(candidate.amc_movie_ids, key=lambda value: (len(value), value))
    if amc_ids:
        amc_movie_id = amc_ids[0]
    theaters = sorted(candidate.local_theater_ids)
    film_id_confirmed = bool(candidate.film_id and candidate.film_id_confirmed)
    tmdb_id = candidate.resolved_tmdb_id()
    kind, exclusion_reason = classify_presentation_kind(
        candidate.title,
        amc_presentation_category=(candidate.amc_metadata or {}).get(
            "presentation_category"
        ),
        variant_titles=sorted(candidate.titles),
    )
    eligible = classification in USER_VISIBLE_CLASSIFICATIONS
    user_visible = eligible and is_public_presentation(kind, exclusion_reason)
    scheduled = bool(
        classification == CLASSIFICATION_CONFIRMED_LOCAL
        and candidate.first_local_screening_date is not None
        and candidate.local_showtime_count > 0
    )
    presentation = resolve_presentation(
        film_id=candidate.film_id if film_id_confirmed else None,
        film_id_confirmed=film_id_confirmed,
        expected_release_date=expected,
        amc_metadata=candidate.amc_metadata,
        tmdb_metadata=candidate.tmdb_metadata,
        amc_movie_ids=amc_ids,
        enrichment_index=enrichment_index,
        amc_product_index=amc_product_index,
        kind=kind,
    )
    return {
        # film_id stays confirmed-only so downstream joins keep the same
        # meaning as every other public artifact. Ids inferred from a TMDB
        # discover match are exposed through tmdb_id instead.
        "film_id": candidate.film_id if film_id_confirmed else None,
        "title": candidate.title,
        "join_key": candidate.join_key,
        "parent_film_keys": sorted(candidate.parent_film_keys),
        "showtime_film_keys": sorted(candidate.showtime_film_keys),
        "tmdb_id": tmdb_id,
        "amc_movie_id": amc_movie_id,
        "amc_movie_ids": amc_ids,
        "expected_release_date": format_date_iso(expected),
        "expected_release_date_source": expected_source,
        "amc_catalog_release_date": (
            format_date_iso(candidate.amc_catalog_release_date)
            if candidate.amc_catalog_release_date
            else None
        ),
        "tmdb_us_release_date": (
            format_date_iso(candidate.tmdb_us_release_date)
            if candidate.tmdb_us_release_date
            else None
        ),
        "first_local_screening_date": (
            format_date_iso(candidate.first_local_screening_date)
            if candidate.first_local_screening_date
            else None
        ),
        "first_local_screening_source": candidate.first_local_screening_source,
        "local_status": local_status_for(scheduled=scheduled),
        "local_theater_ids": theaters,
        "local_theaters": local_theaters_payload(theaters, theater_names or {}),
        "local_theater_count": len(theaters),
        "local_showtime_count": int(candidate.local_showtime_count),
        "evidence": {
            "amc_coming_soon_catalog": bool(candidate.amc_coming_soon_catalog),
            "amc_theater_booking": bool(candidate.amc_theater_booking),
            "tmdb_us_theatrical": bool(candidate.tmdb_us_theatrical),
            "reel_seattle_scheduled": bool(candidate.reel_seattle_scheduled),
        },
        "classification": classification,
        "user_visible": user_visible,
        "exclusion_reason": None if user_visible else exclusion_reason,
        "presentation": presentation,
        "identity": {
            "method": candidate.identity_method(),
            "film_id_confirmed": film_id_confirmed,
            "tmdb_id_inferred": bool(tmdb_id is not None and not film_id_confirmed),
            "ambiguous": bool(candidate.film_id_conflict),
            "variant_titles": sorted(candidate.titles),
            "contributing_sources": sorted(candidate.contributing_sources),
        },
        "source_metadata": {
            "amc": candidate.amc_metadata,
            "tmdb": candidate.tmdb_metadata,
        },
    }


def build_coming_soon_current(
    *,
    amc_catalog: Mapping[str, Any] | None = None,
    tmdb_candidates_artifact: Mapping[str, Any] | None = None,
    showtimes_current: Mapping[str, Any] | None = None,
    amc_scrape_log_path: Path | None = None,
    registry: Mapping[str, Any] | None = None,
    identity_catalog: Mapping[str, Any] | None = None,
    enrichment_index: Mapping[str, Mapping[str, Any]] | None = None,
    amc_product_index: Mapping[str, Mapping[str, Any]] | None = None,
    today_date: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    current_availability_days: int = DEFAULT_CURRENT_AVAILABILITY_DAYS,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Build the public ``coming_soon_current`` artifact (user-visible rows only)."""
    public, _analysis = build_coming_soon_bundle(
        amc_catalog=amc_catalog,
        tmdb_candidates_artifact=tmdb_candidates_artifact,
        showtimes_current=showtimes_current,
        amc_scrape_log_path=amc_scrape_log_path,
        registry=registry,
        identity_catalog=identity_catalog,
        enrichment_index=enrichment_index,
        amc_product_index=amc_product_index,
        today_date=today_date,
        window_days=window_days,
        current_availability_days=current_availability_days,
        generated_at=generated_at,
    )
    return public


def build_coming_soon_bundle(
    *,
    amc_catalog: Mapping[str, Any] | None = None,
    tmdb_candidates_artifact: Mapping[str, Any] | None = None,
    showtimes_current: Mapping[str, Any] | None = None,
    amc_scrape_log_path: Path | None = None,
    registry: Mapping[str, Any] | None = None,
    identity_catalog: Mapping[str, Any] | None = None,
    enrichment_index: Mapping[str, Mapping[str, Any]] | None = None,
    amc_product_index: Mapping[str, Mapping[str, Any]] | None = None,
    today_date: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    current_availability_days: int = DEFAULT_CURRENT_AVAILABILITY_DAYS,
    generated_at: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build the public Coming Soon artifact and the analysis candidate dump."""
    today = today_date or pacific_today()
    window_end = today + timedelta(days=window_days)
    current_window_end = today + timedelta(days=current_availability_days)

    if generated_at is None:
        generated_at = datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    elif generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))

    catalog = identity_catalog if identity_catalog is not None else load_identity_catalog()
    film_id_index, _warnings = build_confirmed_tmdb_index(catalog)

    published_window_end: date | None = None
    local_future: dict[str, dict[str, Any]] = {}
    if showtimes_current:
        published_window_end = _parse_iso_date(
            (showtimes_current.get("window") or {}).get("end_date")
        )
        local_future = extract_reel_seattle_future_screenings(
            showtimes_current=showtimes_current,
            today_date=today,
        )

    theater_index = build_theater_index(registry) if registry else None
    theater_names = theater_name_lookup(registry)
    if enrichment_index is None:
        enrichment_index = load_enrichment_index(DEFAULT_ENRICHMENT_PATH)
    if amc_product_index is None:
        amc_product_index = load_amc_product_index(DEFAULT_PRODUCTS_PATH)

    booking_candidates: list[ComingSoonCandidate] = []
    if amc_scrape_log_path is not None:
        booking_candidates = extract_amc_theater_bookings(
            amc_scrape_log_path=amc_scrape_log_path,
            today_date=today,
            window_end=window_end,
            current_window_end=current_window_end,
            published_window_end=published_window_end,
            theater_index=theater_index,
            film_id_index=film_id_index,
        )

    catalog_candidates = candidates_from_amc_catalog(
        amc_catalog, film_id_index=film_id_index
    )
    tmdb_pool = candidates_from_tmdb(tmdb_candidates_artifact)
    local_candidates = candidates_from_reel_seattle(
        local_future,
        current_window_end=current_window_end,
        film_id_index=film_id_index,
    )

    merged = merge_candidates(
        [*catalog_candidates, *booking_candidates],
        local_candidates,
        tmdb_pool,
        current_window_end=current_window_end,
        film_id_index=film_id_index,
    )
    merged, collapsed_variants = collapse_amc_event_variants(merged)

    all_entries: list[dict[str, Any]] = []
    dropped: dict[str, int] = {
        DROP_REASON_CURRENTLY_AVAILABLE: 0,
        DROP_REASON_OUTSIDE_WINDOW: 0,
        DROP_REASON_NO_EXPECTED_DATE: 0,
        DROP_REASON_UNCLASSIFIED: 0,
        DROP_REASON_PRESENTATION_FILTER: 0,
    }

    for candidate in merged:
        classification = candidate.classify(
            window_start=today, window_end=window_end
        )
        if classification == CLASSIFICATION_CURRENTLY_AVAILABLE:
            dropped[DROP_REASON_CURRENTLY_AVAILABLE] += 1
            continue
        if classification == CLASSIFICATION_UNCLASSIFIED:
            known = [
                when
                for when in (
                    candidate.amc_catalog_release_date,
                    candidate.tmdb_us_release_date,
                    candidate.first_local_screening_date,
                )
                if when is not None
            ]
            if known and not any(today <= when <= window_end for when in known):
                dropped[DROP_REASON_OUTSIDE_WINDOW] += 1
            else:
                dropped[DROP_REASON_UNCLASSIFIED] += 1
            continue

        expected, expected_source = candidate.expected_release(classification)
        if expected is None or expected_source is None:
            dropped[DROP_REASON_NO_EXPECTED_DATE] += 1
            continue
        if not (today <= expected <= window_end):
            dropped[DROP_REASON_OUTSIDE_WINDOW] += 1
            continue

        entry = _entry_from_candidate(
            candidate,
            classification=classification,
            expected=expected,
            expected_source=expected_source,
            theater_names=theater_names,
            enrichment_index=enrichment_index,
            amc_product_index=amc_product_index,
        )
        if (
            classification in USER_VISIBLE_CLASSIFICATIONS
            and not entry["user_visible"]
        ):
            dropped[DROP_REASON_PRESENTATION_FILTER] += 1
        all_entries.append(entry)

    all_entries.sort(
        key=lambda item: (
            item["expected_release_date"],
            item["title"].casefold(),
            item["join_key"],
        )
    )
    public_entries = []
    for entry in all_entries:
        if not entry["user_visible"]:
            continue
        visible = dict(entry)
        visible.pop("exclusion_reason", None)
        public_entries.append(visible)

    sources = _source_health(
        amc_catalog=amc_catalog,
        tmdb_artifact=tmdb_candidates_artifact,
        showtimes_current=showtimes_current,
        amc_scrape_log_path=amc_scrape_log_path,
        published_window_end=published_window_end,
    )
    window = {
        "start_date": format_date_iso(today),
        "end_date": format_date_iso(window_end),
        "days": window_days,
        "current_availability_cutoff": format_date_iso(current_window_end),
        "current_availability_days": current_availability_days,
    }
    method = {
        "name": METHOD_NAME,
        "version": METHOD_VERSION,
        "description": METHOD_DESCRIPTION,
    }
    stamp = generated_at.isoformat(timespec="seconds")
    analysis_stats = _artifact_stats(
        all_entries,
        window_start=today,
        dropped=dropped,
        collapsed_variants=collapsed_variants,
        merged_count=len(merged),
        include_hidden=True,
    )
    public_stats = _artifact_stats(
        public_entries,
        window_start=today,
        dropped=dropped,
        collapsed_variants=collapsed_variants,
        merged_count=len(merged),
        include_hidden=False,
    )
    public_stats["analysis"] = {
        "path": DEFAULT_ANALYSIS_PATH.as_posix(),
        "entry_count": len(all_entries),
        "tmdb_only_count": analysis_stats["classification_counts"][
            CLASSIFICATION_TMDB_ONLY
        ],
        "presentation_filtered_count": int(
            dropped.get(DROP_REASON_PRESENTATION_FILTER, 0)
        ),
    }

    public = {
        "schema_version": COMING_SOON_SCHEMA_VERSION,
        "generated_at": stamp,
        "timezone": DEFAULT_TIMEZONE,
        "window": window,
        "method": method,
        "sources": sources,
        "stats": public_stats,
        "entries": public_entries,
    }
    analysis = {
        "schema_version": COMING_SOON_CANDIDATES_SCHEMA_VERSION,
        "generated_at": stamp,
        "timezone": DEFAULT_TIMEZONE,
        "window": window,
        "method": method,
        "sources": sources,
        "stats": analysis_stats,
        "entries": all_entries,
    }
    return public, analysis


def _source_health(
    *,
    amc_catalog: Mapping[str, Any] | None,
    tmdb_artifact: Mapping[str, Any] | None,
    showtimes_current: Mapping[str, Any] | None,
    amc_scrape_log_path: Path | None,
    published_window_end: date | None,
) -> dict[str, Any]:
    amc_fetch = (amc_catalog or {}).get("fetch") or {}
    tmdb_fetch = (tmdb_artifact or {}).get("fetch") or {}
    return {
        "amc_coming_soon_catalog": {
            "available": bool(amc_catalog),
            "generated_at": (amc_catalog or {}).get("generated_at"),
            "fetch_status": amc_fetch.get("status"),
            "movies": int(((amc_catalog or {}).get("stats") or {}).get("movies") or 0),
        },
        "tmdb_us_theatrical": {
            "available": bool(tmdb_artifact),
            "generated_at": (tmdb_artifact or {}).get("generated_at"),
            "fetch_status": tmdb_fetch.get("status"),
            "candidates": int(
                ((tmdb_artifact or {}).get("stats") or {}).get("candidates") or 0
            ),
        },
        "reel_seattle_showtimes": {
            "available": bool(showtimes_current),
            "generated_at": (showtimes_current or {}).get("generated_at"),
            "published_window_end": (
                format_date_iso(published_window_end) if published_window_end else None
            ),
        },
        "amc_theater_bookings": {
            "available": amc_scrape_log_path is not None
            and Path(amc_scrape_log_path).is_file(),
            "scrape_log": _relative_path_label(amc_scrape_log_path),
        },
    }


def _relative_path_label(path: Path | str | None) -> str | None:
    """Render a repo-relative label so no local filesystem path is published."""
    if path is None:
        return None
    candidate = Path(path)
    try:
        return candidate.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        parts = candidate.parts
        return Path(*parts[-2:]).as_posix() if len(parts) >= 2 else candidate.name


def _artifact_stats(
    entries: Sequence[Mapping[str, Any]],
    *,
    window_start: date,
    dropped: Mapping[str, int],
    collapsed_variants: int,
    merged_count: int,
    include_hidden: bool,
) -> dict[str, Any]:
    classification_counts = {
        CLASSIFICATION_CONFIRMED_LOCAL: 0,
        CLASSIFICATION_AMC_ANNOUNCED: 0,
    }
    if include_hidden:
        classification_counts[CLASSIFICATION_TMDB_ONLY] = 0
    evidence_counts = {
        "amc_coming_soon_catalog": 0,
        "amc_theater_booking": 0,
        "tmdb_us_theatrical": 0,
        "reel_seattle_scheduled": 0,
    }
    presentation_kind_counts: dict[str, int] = {}
    presentation_source_counts: dict[str, int] = {}
    horizon_counts = {"30_days": 0, "60_days": 0, "90_days": 0}
    horizons = ((30, "30_days"), (60, "60_days"), (90, "90_days"))

    dates = sorted(str(entry["expected_release_date"]) for entry in entries)
    user_visible = 0
    ambiguous = 0
    with_film_id = 0
    with_tmdb_id = 0
    with_poster = 0
    film_id_seen: dict[str, int] = {}
    join_key_seen: dict[str, int] = {}

    for entry in entries:
        classification = str(entry["classification"])
        if classification in classification_counts:
            classification_counts[classification] += 1
        if entry.get("user_visible"):
            user_visible += 1
            expected = date.fromisoformat(str(entry["expected_release_date"]))
            for days, label in horizons:
                if expected <= window_start + timedelta(days=days):
                    horizon_counts[label] += 1
        if (entry.get("identity") or {}).get("ambiguous"):
            ambiguous += 1
        film_id = entry.get("film_id")
        if film_id:
            with_film_id += 1
            film_id_seen[str(film_id)] = film_id_seen.get(str(film_id), 0) + 1
        if entry.get("tmdb_id") is not None:
            with_tmdb_id += 1
        join_key = str(entry.get("join_key") or "")
        join_key_seen[join_key] = join_key_seen.get(join_key, 0) + 1
        for flag, present in (entry.get("evidence") or {}).items():
            if present and flag in evidence_counts:
                evidence_counts[flag] += 1
        presentation = entry.get("presentation") or {}
        kind = str(presentation.get("kind") or "")
        if kind:
            presentation_kind_counts[kind] = presentation_kind_counts.get(kind, 0) + 1
        source = str(presentation.get("source") or "")
        if source:
            presentation_source_counts[source] = (
                presentation_source_counts.get(source, 0) + 1
            )
        if presentation.get("poster_url"):
            with_poster += 1

    return {
        "entry_count": len(entries),
        "user_visible_count": user_visible,
        "hidden_count": len(entries) - user_visible,
        "classification_counts": classification_counts,
        "evidence_counts": evidence_counts,
        "presentation_kind_counts": dict(sorted(presentation_kind_counts.items())),
        "presentation_source_counts": dict(sorted(presentation_source_counts.items())),
        "entries_with_poster": with_poster,
        "horizon_counts": horizon_counts,
        "earliest_expected_release_date": dates[0] if dates else None,
        "latest_expected_release_date": dates[-1] if dates else None,
        "entries_with_confirmed_film_id": with_film_id,
        "entries_without_confirmed_film_id": len(entries) - with_film_id,
        "entries_with_tmdb_id": with_tmdb_id,
        "ambiguous_identity_count": ambiguous,
        "duplicate_film_id_count": sum(
            count - 1 for count in film_id_seen.values() if count > 1
        ),
        "duplicate_join_key_count": sum(
            count - 1 for count in join_key_seen.values() if count > 1
        ),
        "merged_candidate_count": merged_count,
        "collapsed_event_variants": collapsed_variants,
        "excluded_counts": {
            "currently_available": int(dropped.get(DROP_REASON_CURRENTLY_AVAILABLE, 0)),
            "expected_release_date_outside_window": int(
                dropped.get(DROP_REASON_OUTSIDE_WINDOW, 0)
            ),
            "no_expected_release_date": int(dropped.get(DROP_REASON_NO_EXPECTED_DATE, 0)),
            "insufficient_evidence": int(dropped.get(DROP_REASON_UNCLASSIFIED, 0)),
            "presentation_filter": int(
                dropped.get(DROP_REASON_PRESENTATION_FILTER, 0)
            ),
        },
    }


# ---------------------------------------------------------------------------
# Loading / publication
# ---------------------------------------------------------------------------


def load_showtimes_current(
    path: Path | str = DEFAULT_SHOWTIMES_CURRENT_PATH,
) -> dict[str, Any] | None:
    """Load the published showtimes artifact, or ``None`` when unusable."""
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


def latest_amc_scrape_log(
    logs_dir: Path | str = DEFAULT_LOGS_DIR,
    *,
    run_date: date | None = None,
) -> Path | None:
    """Return the preferred AMC scrape log path, newest last."""
    directory = Path(logs_dir)
    if run_date is not None:
        dated = daily_log_path(run_date.isoformat(), "amc", logs_dir=directory)
        if Path(dated).is_file():
            return Path(dated)
    if not directory.is_dir():
        return None
    candidates = sorted(directory.glob("*_amc.json"))
    return candidates[-1] if candidates else None


def membership_payload(artifact: Mapping[str, Any]) -> dict[str, Any]:
    """Artifact fields that define membership, ignoring the timestamp."""
    return {
        key: value
        for key, value in artifact.items()
        if key not in {"generated_at", "sources"}
    }


def existing_artifact_matches(path: Path, artifact: Mapping[str, Any]) -> bool:
    """True when *path* already holds the same membership payload."""
    if not path.is_file():
        return False
    try:
        existing = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(existing, Mapping):
        return False
    return membership_payload(existing) == membership_payload(artifact)


def publish_coming_soon_current(
    *,
    output_path: Path | str = DEFAULT_OUTPUT_PATH,
    analysis_path: Path | str = DEFAULT_ANALYSIS_PATH,
    amc_catalog: Mapping[str, Any] | None = None,
    tmdb_candidates_artifact: Mapping[str, Any] | None = None,
    showtimes_current: Mapping[str, Any] | None = None,
    amc_scrape_log_path: Path | None = None,
    registry: Mapping[str, Any] | None = None,
    identity_catalog: Mapping[str, Any] | None = None,
    enrichment_index: Mapping[str, Mapping[str, Any]] | None = None,
    amc_product_index: Mapping[str, Mapping[str, Any]] | None = None,
    today_date: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    current_availability_days: int = DEFAULT_CURRENT_AVAILABILITY_DAYS,
    generated_at: datetime | None = None,
    require_amc_catalog: bool = True,
) -> dict[str, Any]:
    """Build, validate, and write public + analysis artifacts.

    When the optional AMC catalog snapshot is missing and a previous public
    artifact exists, both files are left untouched: a temporary upstream
    outage must not empty the page.
    """
    target = Path(output_path)
    analysis_target = Path(analysis_path)
    previous_exists = target.is_file()

    if require_amc_catalog and not amc_catalog:
        if previous_exists:
            return {
                "published": False,
                "skipped_reason": "amc_catalog_unavailable_retained_previous",
                "artifact": None,
                "analysis_artifact": None,
                "output_path": str(target),
                "analysis_path": str(analysis_target),
            }
        return {
            "published": False,
            "skipped_reason": "amc_catalog_unavailable_no_previous_artifact",
            "artifact": None,
            "analysis_artifact": None,
            "output_path": str(target),
            "analysis_path": str(analysis_target),
        }

    public, analysis = build_coming_soon_bundle(
        amc_catalog=amc_catalog,
        tmdb_candidates_artifact=tmdb_candidates_artifact,
        showtimes_current=showtimes_current,
        amc_scrape_log_path=amc_scrape_log_path,
        registry=registry,
        identity_catalog=identity_catalog,
        enrichment_index=enrichment_index,
        amc_product_index=amc_product_index,
        today_date=today_date,
        window_days=window_days,
        current_availability_days=current_availability_days,
        generated_at=generated_at,
    )
    validate_coming_soon_current(public)
    validate_coming_soon_candidates(analysis)

    public_unchanged = existing_artifact_matches(target, public)
    analysis_unchanged = existing_artifact_matches(analysis_target, analysis)
    if public_unchanged and analysis_unchanged:
        return {
            "published": False,
            "skipped_reason": "unchanged_membership",
            "artifact": public,
            "analysis_artifact": analysis,
            "output_path": str(target),
            "analysis_path": str(analysis_target),
        }

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(public, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    analysis_target.parent.mkdir(parents=True, exist_ok=True)
    analysis_target.write_text(
        json.dumps(analysis, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return {
        "published": True,
        "skipped_reason": None,
        "artifact": public,
        "analysis_artifact": analysis,
        "output_path": str(target),
        "analysis_path": str(analysis_target),
    }
