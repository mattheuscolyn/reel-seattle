"""Canonical ShortsProgram / Short / membership records."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence


SCHEMA_VERSION = "1.0.0"
PRODUCT_TYPE_SHORTS_PROGRAM = "shorts_program"
PRODUCT_TYPE_SHORT = "short"

EVIDENCE_FILMS_IN_THIS_PROGRAM = "films_in_this_program_section"
EVIDENCE_CHILD_COPY_SECTION = "child_copy_section"


@dataclass(frozen=True, slots=True)
class ShortsProgramRecord:
    shorts_program_id: str
    source: str
    source_film_id: str
    source_url: str
    source_listing_key: str
    title: str
    description: str | None = None
    image_url: str | None = None
    runtime_min: int | None = None
    showtime_film_key: str | None = None
    collection_ids: tuple[str, ...] = ()
    member_count: int = 0
    first_observed_at: str | None = None
    last_observed_at: str | None = None
    last_successful_scrape_at: str | None = None
    status: str = "active"

    def to_dict(self) -> dict[str, Any]:
        return {
            "shortsProgramId": self.shorts_program_id,
            "productType": PRODUCT_TYPE_SHORTS_PROGRAM,
            "source": self.source,
            "sourceFilmId": self.source_film_id,
            "sourceUrl": self.source_url,
            "sourceListingKey": self.source_listing_key,
            "title": self.title,
            "description": self.description,
            "imageUrl": self.image_url,
            "runtimeMin": self.runtime_min,
            "showtimeFilmKey": self.showtime_film_key,
            "collectionIds": list(self.collection_ids),
            "memberCount": self.member_count,
            "firstObservedAt": self.first_observed_at,
            "lastObservedAt": self.last_observed_at,
            "lastSuccessfulScrapeAt": self.last_successful_scrape_at,
            "status": self.status,
        }


@dataclass(frozen=True, slots=True)
class ShortRecord:
    short_id: str
    source: str
    title: str
    directors: tuple[str, ...] = ()
    year: int | None = None
    runtime_min: int | None = None
    location_text: str | None = None
    language: str | None = None
    description: str | None = None
    image_url: str | None = None
    canonical_film_id: str | None = None
    first_observed_at: str | None = None
    last_observed_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "shortId": self.short_id,
            "productType": PRODUCT_TYPE_SHORT,
            "source": self.source,
            "title": self.title,
            "directors": list(self.directors),
            "year": self.year,
            "runtimeMin": self.runtime_min,
            "locationText": self.location_text,
            "language": self.language,
            "description": self.description,
            "imageUrl": self.image_url,
            "canonicalFilmId": self.canonical_film_id,
            "firstObservedAt": self.first_observed_at,
            "lastObservedAt": self.last_observed_at,
        }


@dataclass(frozen=True, slots=True)
class ShortMembershipRecord:
    membership_id: str
    shorts_program_id: str
    short_id: str
    source: str
    position: int
    raw_title: str
    raw_metadata_block: str
    raw_description: str
    parsed_title: str | None = None
    parsed_directors: tuple[str, ...] = ()
    parsed_year: int | None = None
    parsed_runtime_min: int | None = None
    parsed_location_text: str | None = None
    parsed_language: str | None = None
    parsed_description: str | None = None
    membership_evidence: tuple[str, ...] = ()
    first_observed_at: str | None = None
    last_observed_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "membershipId": self.membership_id,
            "shortsProgramId": self.shorts_program_id,
            "shortId": self.short_id,
            "source": self.source,
            "position": self.position,
            "rawTitle": self.raw_title,
            "rawMetadataBlock": self.raw_metadata_block,
            "rawDescription": self.raw_description,
            "parsedTitle": self.parsed_title,
            "parsedDirectors": list(self.parsed_directors),
            "parsedYear": self.parsed_year,
            "parsedRuntimeMin": self.parsed_runtime_min,
            "parsedLocationText": self.parsed_location_text,
            "parsedLanguage": self.parsed_language,
            "parsedDescription": self.parsed_description,
            "membershipEvidence": list(self.membership_evidence),
            "firstObservedAt": self.first_observed_at,
            "lastObservedAt": self.last_observed_at,
        }


@dataclass(frozen=True, slots=True)
class ChildOccurrence:
    """One structural child block under Films in this program."""

    position: int
    raw_title: str
    raw_metadata_block: str
    raw_description: str
    image_url: str | None = None
    parsed_title: str | None = None
    parsed_directors: tuple[str, ...] = ()
    parsed_year: int | None = None
    parsed_runtime_min: int | None = None
    parsed_location_text: str | None = None
    parsed_language: str | None = None
    parsed_description: str | None = None


@dataclass
class ShortsDiscoveryResult:
    source: str
    ok: bool
    programs: list[ShortsProgramRecord] = field(default_factory=list)
    shorts: list[ShortRecord] = field(default_factory=list)
    memberships: list[ShortMembershipRecord] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    omitted: list[dict[str, str]] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    # Programs whose page scrape completed with a valid Films-in-this-program section.
    scraped_program_ids: set[str] = field(default_factory=set)


def _opt(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _opt_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number


def shorts_program_from_dict(row: Mapping[str, Any]) -> ShortsProgramRecord:
    collection_ids = row.get("collectionIds") or row.get("collection_ids") or []
    return ShortsProgramRecord(
        shorts_program_id=str(row.get("shortsProgramId") or row.get("shorts_program_id") or ""),
        source=str(row.get("source") or ""),
        source_film_id=str(row.get("sourceFilmId") or row.get("source_film_id") or ""),
        source_url=str(row.get("sourceUrl") or row.get("source_url") or ""),
        source_listing_key=str(
            row.get("sourceListingKey") or row.get("source_listing_key") or ""
        ),
        title=str(row.get("title") or ""),
        description=_opt(row.get("description")),
        image_url=_opt(row.get("imageUrl") or row.get("image_url")),
        runtime_min=_opt_int(row.get("runtimeMin") or row.get("runtime_min")),
        showtime_film_key=_opt(row.get("showtimeFilmKey") or row.get("showtime_film_key")),
        collection_ids=tuple(str(item) for item in collection_ids if item),
        member_count=int(row.get("memberCount") or row.get("member_count") or 0),
        first_observed_at=_opt(row.get("firstObservedAt") or row.get("first_observed_at")),
        last_observed_at=_opt(row.get("lastObservedAt") or row.get("last_observed_at")),
        last_successful_scrape_at=_opt(
            row.get("lastSuccessfulScrapeAt") or row.get("last_successful_scrape_at")
        ),
        status=str(row.get("status") or "active"),
    )


def short_from_dict(row: Mapping[str, Any]) -> ShortRecord:
    directors = row.get("directors") or []
    return ShortRecord(
        short_id=str(row.get("shortId") or row.get("short_id") or ""),
        source=str(row.get("source") or ""),
        title=str(row.get("title") or ""),
        directors=tuple(str(item) for item in directors if item),
        year=_opt_int(row.get("year")),
        runtime_min=_opt_int(row.get("runtimeMin") or row.get("runtime_min")),
        location_text=_opt(row.get("locationText") or row.get("location_text")),
        language=_opt(row.get("language")),
        description=_opt(row.get("description")),
        image_url=_opt(row.get("imageUrl") or row.get("image_url")),
        canonical_film_id=_opt(row.get("canonicalFilmId") or row.get("canonical_film_id")),
        first_observed_at=_opt(row.get("firstObservedAt") or row.get("first_observed_at")),
        last_observed_at=_opt(row.get("lastObservedAt") or row.get("last_observed_at")),
    )


def membership_from_dict(row: Mapping[str, Any]) -> ShortMembershipRecord:
    directors = row.get("parsedDirectors") or row.get("parsed_directors") or []
    evidence = row.get("membershipEvidence") or row.get("membership_evidence") or []
    return ShortMembershipRecord(
        membership_id=str(row.get("membershipId") or row.get("membership_id") or ""),
        shorts_program_id=str(
            row.get("shortsProgramId") or row.get("shorts_program_id") or ""
        ),
        short_id=str(row.get("shortId") or row.get("short_id") or ""),
        source=str(row.get("source") or ""),
        position=int(row.get("position") or 0),
        raw_title=str(row.get("rawTitle") or row.get("raw_title") or ""),
        raw_metadata_block=str(
            row.get("rawMetadataBlock") or row.get("raw_metadata_block") or ""
        ),
        raw_description=str(row.get("rawDescription") or row.get("raw_description") or ""),
        parsed_title=_opt(row.get("parsedTitle") or row.get("parsed_title")),
        parsed_directors=tuple(str(item) for item in directors if item),
        parsed_year=_opt_int(row.get("parsedYear") or row.get("parsed_year")),
        parsed_runtime_min=_opt_int(
            row.get("parsedRuntimeMin") or row.get("parsed_runtime_min")
        ),
        parsed_location_text=_opt(
            row.get("parsedLocationText") or row.get("parsed_location_text")
        ),
        parsed_language=_opt(row.get("parsedLanguage") or row.get("parsed_language")),
        parsed_description=_opt(
            row.get("parsedDescription") or row.get("parsed_description")
        ),
        membership_evidence=tuple(str(item) for item in evidence if item),
        first_observed_at=_opt(row.get("firstObservedAt") or row.get("first_observed_at")),
        last_observed_at=_opt(row.get("lastObservedAt") or row.get("last_observed_at")),
    )


def sort_programs(rows: Sequence[ShortsProgramRecord]) -> list[ShortsProgramRecord]:
    return sorted(rows, key=lambda row: (row.source, row.title.casefold(), row.shorts_program_id))


def sort_shorts(rows: Sequence[ShortRecord]) -> list[ShortRecord]:
    return sorted(rows, key=lambda row: (row.source, row.title.casefold(), row.short_id))


def sort_memberships(rows: Sequence[ShortMembershipRecord]) -> list[ShortMembershipRecord]:
    return sorted(
        rows,
        key=lambda row: (row.shorts_program_id, row.position, row.short_id),
    )
