"""Canonical Collection + CollectionMembership records."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence


SCHEMA_VERSION = "1.0.0"
PRODUCT_TYPE = "collection"

EVIDENCE_COLLECTION_PAGE_LINK = "collection_page_link"
EVIDENCE_FILM_PAGE_SERIES_LINK = "film_page_series_link"
EVIDENCE_NESTED_URL_CORROBORATION = "nested_url_corroboration"
EVIDENCE_COLLECTION_PAGE_TITLE_AND_SOURCE_URL = "collection_page_title+source_url"


@dataclass(frozen=True, slots=True)
class CollectionRecord:
    collection_id: str
    source: str
    source_collection_type: str
    source_collection_id: str
    title: str
    source_url: str
    description: str | None = None
    image_url: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    title_prefix_aliases: tuple[str, ...] = ()
    first_observed_at: str | None = None
    last_observed_at: str | None = None
    last_successful_scrape_at: str | None = None
    status: str = "active"

    def to_dict(self) -> dict[str, Any]:
        return {
            "collectionId": self.collection_id,
            "productType": PRODUCT_TYPE,
            "source": self.source,
            "sourceCollectionType": self.source_collection_type,
            "sourceCollectionId": self.source_collection_id,
            "title": self.title,
            "description": self.description,
            "sourceUrl": self.source_url,
            "imageUrl": self.image_url,
            "startDate": self.start_date,
            "endDate": self.end_date,
            "titlePrefixAliases": list(self.title_prefix_aliases),
            "firstObservedAt": self.first_observed_at,
            "lastObservedAt": self.last_observed_at,
            "lastSuccessfulScrapeAt": self.last_successful_scrape_at,
            "status": self.status,
        }


@dataclass(frozen=True, slots=True)
class MembershipRecord:
    collection_id: str
    source: str
    source_film_url: str
    raw_title: str
    source_film_id: str | None = None
    source_listing_key: str | None = None
    canonical_film_id: str | None = None
    identity_title_candidate: str | None = None
    membership_evidence: tuple[str, ...] = ()
    first_observed_at: str | None = None
    last_observed_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "collectionId": self.collection_id,
            "source": self.source,
            "sourceFilmUrl": self.source_film_url,
            "sourceFilmId": self.source_film_id,
            "sourceListingKey": self.source_listing_key,
            "canonicalFilmId": self.canonical_film_id,
            "rawTitle": self.raw_title,
            "identityTitleCandidate": self.identity_title_candidate,
            "membershipEvidence": list(self.membership_evidence),
            "firstObservedAt": self.first_observed_at,
            "lastObservedAt": self.last_observed_at,
        }


@dataclass
class SourceDiscoveryResult:
    source: str
    ok: bool
    collections: list[CollectionRecord] = field(default_factory=list)
    memberships: list[MembershipRecord] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    omitted: list[dict[str, str]] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)


def collection_from_dict(row: Mapping[str, Any]) -> CollectionRecord:
    aliases = row.get("titlePrefixAliases") or row.get("title_prefix_aliases") or []
    return CollectionRecord(
        collection_id=str(row.get("collectionId") or row.get("collection_id") or ""),
        source=str(row.get("source") or ""),
        source_collection_type=str(
            row.get("sourceCollectionType") or row.get("source_collection_type") or "collection"
        ),
        source_collection_id=str(
            row.get("sourceCollectionId") or row.get("source_collection_id") or ""
        ),
        title=str(row.get("title") or ""),
        source_url=str(row.get("sourceUrl") or row.get("source_url") or ""),
        description=_opt(row.get("description")),
        image_url=_opt(row.get("imageUrl") or row.get("image_url")),
        start_date=_opt(row.get("startDate") or row.get("start_date")),
        end_date=_opt(row.get("endDate") or row.get("end_date")),
        title_prefix_aliases=tuple(str(item) for item in aliases if item),
        first_observed_at=_opt(row.get("firstObservedAt") or row.get("first_observed_at")),
        last_observed_at=_opt(row.get("lastObservedAt") or row.get("last_observed_at")),
        last_successful_scrape_at=_opt(
            row.get("lastSuccessfulScrapeAt") or row.get("last_successful_scrape_at")
        ),
        status=str(row.get("status") or "active"),
    )


def membership_from_dict(row: Mapping[str, Any]) -> MembershipRecord:
    evidence = row.get("membershipEvidence") or row.get("membership_evidence") or []
    return MembershipRecord(
        collection_id=str(row.get("collectionId") or row.get("collection_id") or ""),
        source=str(row.get("source") or ""),
        source_film_url=str(row.get("sourceFilmUrl") or row.get("source_film_url") or ""),
        raw_title=str(row.get("rawTitle") or row.get("raw_title") or ""),
        source_film_id=_opt(row.get("sourceFilmId") or row.get("source_film_id")),
        source_listing_key=_opt(row.get("sourceListingKey") or row.get("source_listing_key")),
        canonical_film_id=_opt(row.get("canonicalFilmId") or row.get("canonical_film_id")),
        identity_title_candidate=_opt(
            row.get("identityTitleCandidate") or row.get("identity_title_candidate")
        ),
        membership_evidence=tuple(str(item) for item in evidence if item),
        first_observed_at=_opt(row.get("firstObservedAt") or row.get("first_observed_at")),
        last_observed_at=_opt(row.get("lastObservedAt") or row.get("last_observed_at")),
    )


def _opt(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def sort_collections(rows: Sequence[CollectionRecord]) -> list[CollectionRecord]:
    return sorted(rows, key=lambda row: (row.source, row.collection_id))


def sort_memberships(rows: Sequence[MembershipRecord]) -> list[MembershipRecord]:
    return sorted(
        rows,
        key=lambda row: (row.collection_id, row.source_film_url, row.source_film_id or ""),
    )
