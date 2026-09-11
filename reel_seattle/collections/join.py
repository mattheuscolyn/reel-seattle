"""Join collection memberships to source listings / showtimes."""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.collections.identity_title import (
    collection_prefix_candidates,
    derive_shared_member_prefix,
    identity_title_candidate,
)
from reel_seattle.collections.model import CollectionRecord, MembershipRecord
from reel_seattle.source_identity import source_film_id_from_raw


def listing_key(source: str, source_film_id: str | None, source_film_url: str | None) -> str | None:
    src = (source or "").strip().casefold()
    sid = (source_film_id or "").strip()
    url = (source_film_url or "").strip()
    if src and sid:
        return f"{src}|id|{sid}"
    if src and url:
        return f"{src}|url|{url.rstrip('/').casefold()}"
    return None


def index_raw_listings(
    *,
    source: str,
    records: Sequence[RawShowtime],
) -> dict[str, list[RawShowtime]]:
    indexed: dict[str, list[RawShowtime]] = {}
    for record in records:
        sid = source_film_id_from_raw(record)
        url = record.source_film_url
        for key in filter(
            None,
            [
                listing_key(source, sid, None),
                listing_key(source, None, url),
            ],
        ):
            indexed.setdefault(key, []).append(record)
    return indexed


def index_showtimes(showtimes: Sequence[Mapping[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    indexed: dict[str, list[dict[str, Any]]] = {}
    for row in showtimes:
        if not isinstance(row, Mapping):
            continue
        source = str(row.get("source") or "")
        sid = str(row.get("source_film_id") or "").strip() or None
        key = listing_key(source, sid, None)
        if not key:
            continue
        indexed.setdefault(key, []).append(dict(row))
    return indexed


def enrich_memberships(
    memberships: Sequence[MembershipRecord],
    collections: Sequence[CollectionRecord],
    *,
    listings_by_key: Mapping[str, Sequence[RawShowtime]] | None = None,
    showtimes_by_key: Mapping[str, Sequence[Mapping[str, Any]]] | None = None,
    canonical_by_listing_key: Mapping[str, str | None] | None = None,
) -> list[MembershipRecord]:
    prefixes_by_id = _prefixes_for_collections(collections, memberships)
    listings_by_key = listings_by_key or {}
    showtimes_by_key = showtimes_by_key or {}
    canonical_by_listing_key = canonical_by_listing_key or {}
    out: list[MembershipRecord] = []
    for member in memberships:
        prefixes = prefixes_by_id.get(member.collection_id, ())
        sid = member.source_film_id
        url = member.source_film_url
        key = listing_key(member.source, sid, url)
        listings = []
        if key:
            listings = list(listings_by_key.get(key) or [])
        if not listings and sid:
            listings = list(listings_by_key.get(listing_key(member.source, sid, None) or "") or [])
        if not listings and url:
            listings = list(listings_by_key.get(listing_key(member.source, None, url) or "") or [])
        joined_sid = sid
        joined_url = url
        listing_key_value = key
        raw_title = member.raw_title
        if listings:
            first = listings[0]
            joined_sid = joined_sid or source_film_id_from_raw(first) or None
            joined_url = joined_url or first.source_film_url or url
            listing_key_value = listing_key(member.source, joined_sid, joined_url)
            if first.title_raw:
                raw_title = first.title_raw
        showtimes = []
        show_key = listing_key(member.source, joined_sid, None)
        if show_key:
            showtimes = list(showtimes_by_key.get(show_key) or [])
        canonical = member.canonical_film_id
        if not canonical and show_key:
            canonical = canonical_by_listing_key.get(show_key)
        if not canonical and showtimes:
            canonical = showtimes[0].get("film_id")
        candidate = identity_title_candidate(
            raw_title,
            prefixes=prefixes,
            source=member.source,
        )
        out.append(
            MembershipRecord(
                collection_id=member.collection_id,
                source=member.source,
                source_film_url=joined_url,
                raw_title=raw_title,
                source_film_id=joined_sid,
                source_listing_key=listing_key_value,
                canonical_film_id=canonical if isinstance(canonical, str) else None,
                identity_title_candidate=candidate,
                membership_evidence=member.membership_evidence,
                first_observed_at=member.first_observed_at,
                last_observed_at=member.last_observed_at,
            )
        )
    return out


def attach_collection_ids_to_showtimes(
    showtimes: Sequence[dict[str, Any]],
    memberships: Sequence[MembershipRecord],
) -> list[dict[str, Any]]:
    """Stamp ``attributes.collection_ids`` onto matching source listings only."""
    by_listing: dict[str, list[str]] = {}
    for member in memberships:
        keys = [
            listing_key(member.source, member.source_film_id, None),
            listing_key(member.source, None, member.source_film_url),
            member.source_listing_key,
        ]
        for key in keys:
            if not key:
                continue
            bucket = by_listing.setdefault(key, [])
            if member.collection_id not in bucket:
                bucket.append(member.collection_id)
    out: list[dict[str, Any]] = []
    for row in showtimes:
        source = str(row.get("source") or "")
        sid = str(row.get("source_film_id") or "").strip() or None
        key = listing_key(source, sid, None)
        ids = list(by_listing.get(key) or []) if key else []
        attributes = dict(row.get("attributes") or {})
        if ids:
            attributes["collection_ids"] = sorted(ids)
        elif "collection_ids" in attributes:
            attributes.pop("collection_ids", None)
        next_row = dict(row)
        next_row["attributes"] = attributes
        out.append(next_row)
    return out


def identity_title_for_source_film(
    *,
    source: str,
    source_film_id: str | None,
    source_title: str | None,
    memberships: Sequence[MembershipRecord],
) -> str | None:
    """Preferred identity title when explicit membership exists for this listing."""
    key = listing_key(source, source_film_id, None)
    if not key:
        return None
    for member in memberships:
        member_key = listing_key(member.source, member.source_film_id, None)
        if member_key != key:
            continue
        if member.identity_title_candidate:
            return member.identity_title_candidate
        return identity_title_candidate(
            source_title or member.raw_title,
            prefixes=(),
            source=source,
        )
    return None


def _prefixes_for_collections(
    collections: Sequence[CollectionRecord],
    memberships: Sequence[MembershipRecord],
) -> dict[str, tuple[str, ...]]:
    titles_by_id: dict[str, list[str]] = {}
    for member in memberships:
        titles_by_id.setdefault(member.collection_id, []).append(member.raw_title)
    out: dict[str, tuple[str, ...]] = {}
    for collection in collections:
        aliases = list(collection.title_prefix_aliases)
        shared = derive_shared_member_prefix(collection.title, titles_by_id.get(collection.collection_id, []))
        if shared and shared not in aliases:
            aliases.append(shared)
        out[collection.collection_id] = collection_prefix_candidates(collection.title, aliases)
    return out
