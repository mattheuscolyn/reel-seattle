"""Deterministic collections_current artifact build + observation merge."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.collections.identity_title import derive_shared_member_prefix
from reel_seattle.collections.model import (
    SCHEMA_VERSION,
    CollectionRecord,
    MembershipRecord,
    collection_from_dict,
    membership_from_dict,
    sort_collections,
    sort_memberships,
)
from reel_seattle.validate import PROJECT_ROOT

PACIFIC = ZoneInfo("America/Los_Angeles")
DEFAULT_ARTIFACT_REL = "public/data/collections_current.json"
SCHEMA_REL = "schema/collections_current/v1.0.0.json"


def observed_at_now(moment: datetime | None = None) -> str:
    stamp = moment or datetime.now(PACIFIC)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=PACIFIC)
    else:
        stamp = stamp.astimezone(PACIFIC)
    return stamp.isoformat(timespec="seconds")


def merge_observations(
    *,
    previous: Mapping[str, Any] | None,
    discovered_collections: Sequence[CollectionRecord],
    discovered_memberships: Sequence[MembershipRecord],
    source_ok: Mapping[str, bool],
    observed_at: str,
) -> tuple[list[CollectionRecord], list[MembershipRecord]]:
    """Preserve prior valid state for sources whose scrape failed."""
    prev_collections = [
        collection_from_dict(row)
        for row in (previous or {}).get("collections") or []
        if isinstance(row, Mapping)
    ]
    prev_memberships = [
        membership_from_dict(row)
        for row in (previous or {}).get("memberships") or []
        if isinstance(row, Mapping)
    ]

    collections_by_id: dict[str, CollectionRecord] = {}
    for row in prev_collections:
        if not source_ok.get(row.source, True):
            collections_by_id[row.collection_id] = row

    for row in discovered_collections:
        prior = next((item for item in prev_collections if item.collection_id == row.collection_id), None)
        aliases = list(row.title_prefix_aliases)
        shared = derive_shared_member_prefix(
            row.title,
            [m.raw_title for m in discovered_memberships if m.collection_id == row.collection_id],
        )
        if shared and shared not in aliases:
            aliases.append(shared)
        collections_by_id[row.collection_id] = CollectionRecord(
            collection_id=row.collection_id,
            source=row.source,
            source_collection_type=row.source_collection_type,
            source_collection_id=row.source_collection_id,
            title=row.title,
            source_url=row.source_url,
            description=row.description or (prior.description if prior else None),
            image_url=row.image_url or (prior.image_url if prior else None),
            start_date=row.start_date or (prior.start_date if prior else None),
            end_date=row.end_date or (prior.end_date if prior else None),
            title_prefix_aliases=tuple(aliases),
            first_observed_at=(prior.first_observed_at if prior else None) or observed_at,
            last_observed_at=observed_at,
            last_successful_scrape_at=observed_at,
            status="active",
        )

    memberships_by_key: dict[tuple[str, str], MembershipRecord] = {}
    for row in prev_memberships:
        if not source_ok.get(row.source, True):
            memberships_by_key[(row.collection_id, row.source_film_url)] = row

    for row in discovered_memberships:
        key = (row.collection_id, row.source_film_url)
        prior = next(
            (
                item
                for item in prev_memberships
                if item.collection_id == row.collection_id
                and item.source_film_url.rstrip("/").casefold()
                == row.source_film_url.rstrip("/").casefold()
            ),
            None,
        )
        memberships_by_key[key] = MembershipRecord(
            collection_id=row.collection_id,
            source=row.source,
            source_film_url=row.source_film_url,
            raw_title=row.raw_title or (prior.raw_title if prior else ""),
            source_film_id=row.source_film_id or (prior.source_film_id if prior else None),
            source_listing_key=row.source_listing_key or (prior.source_listing_key if prior else None),
            canonical_film_id=row.canonical_film_id or (prior.canonical_film_id if prior else None),
            identity_title_candidate=row.identity_title_candidate
            or (prior.identity_title_candidate if prior else None),
            membership_evidence=row.membership_evidence
            or (prior.membership_evidence if prior else ()),
            first_observed_at=(prior.first_observed_at if prior else None) or observed_at,
            last_observed_at=observed_at,
        )

    return sort_collections(collections_by_id.values()), sort_memberships(memberships_by_key.values())


def build_artifact(
    *,
    collections: Sequence[CollectionRecord],
    memberships: Sequence[MembershipRecord],
    generated_at: str,
    source_stats: Mapping[str, Any] | None = None,
    warnings: Sequence[str] | None = None,
    omitted: Sequence[Mapping[str, str]] | None = None,
    showtimes: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    from reel_seattle.collections.join import listing_key

    show_counts: dict[str, int] = {}
    upcoming_counts: dict[str, int] = {}
    if showtimes:
        for row in showtimes:
            source = str(row.get("source") or "")
            sid = str(row.get("source_film_id") or "").strip() or None
            key = listing_key(source, sid, None)
            if not key:
                continue
            show_counts[key] = show_counts.get(key, 0) + 1
            status = str(row.get("status") or "active")
            if status == "active":
                upcoming_counts[key] = upcoming_counts.get(key, 0) + 1

    collection_payloads = []
    for collection in sort_collections(collections):
        members = [m for m in memberships if m.collection_id == collection.collection_id]
        current_showtimes = 0
        for member in members:
            key = member.source_listing_key or listing_key(
                member.source, member.source_film_id, member.source_film_url
            )
            if key:
                current_showtimes += upcoming_counts.get(key, 0)
        payload = collection.to_dict()
        payload["memberCount"] = len(members)
        payload["resolvedCanonicalCount"] = sum(1 for m in members if m.canonical_film_id)
        payload["currentShowtimeCount"] = current_showtimes
        collection_payloads.append(payload)

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "timezone": "America/Los_Angeles",
        "collections": collection_payloads,
        "memberships": [row.to_dict() for row in sort_memberships(memberships)],
        "stats": {
            "collection_count": len(collection_payloads),
            "membership_count": len(memberships),
            "canonical_film_count": len(
                {m.canonical_film_id for m in memberships if m.canonical_film_id}
            ),
            "unresolved_membership_count": sum(
                1 for m in memberships if not m.canonical_film_id
            ),
            "sources": dict(source_stats or {}),
        },
        "warnings": sorted(set(warnings or [])),
        "omitted": sorted(
            (dict(row) for row in (omitted or [])),
            key=lambda row: (row.get("url") or "", row.get("reason") or ""),
        ),
    }


def load_artifact(path: Path | None = None) -> dict[str, Any] | None:
    target = path or (PROJECT_ROOT / DEFAULT_ARTIFACT_REL)
    if not target.is_file():
        return None
    try:
        doc = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return doc if isinstance(doc, dict) else None


def write_artifact(document: Mapping[str, Any], path: Path | None = None) -> Path:
    target = path or (PROJECT_ROOT / DEFAULT_ARTIFACT_REL)
    target.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    target.write_text(text, encoding="utf-8")
    return target
