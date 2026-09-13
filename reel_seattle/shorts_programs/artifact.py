"""Deterministic shorts_programs_current artifact build + observation merge."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.shorts_programs.model import (
    SCHEMA_VERSION,
    ShortMembershipRecord,
    ShortRecord,
    ShortsProgramRecord,
    membership_from_dict,
    short_from_dict,
    shorts_program_from_dict,
    sort_memberships,
    sort_programs,
    sort_shorts,
)
from reel_seattle.validate import PROJECT_ROOT

PACIFIC = ZoneInfo("America/Los_Angeles")
DEFAULT_ARTIFACT_REL = "public/data/shorts_programs_current.json"
SCHEMA_REL = "schema/shorts_programs_current/v1.0.0.json"


def observed_at_now(moment: datetime | None = None) -> str:
    stamp = moment or datetime.now(PACIFIC)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=PACIFIC)
    else:
        stamp = stamp.astimezone(PACIFIC)
    return stamp.isoformat(timespec="seconds")


def load_artifact(path: Path | None = None) -> dict[str, Any] | None:
    target = path or (PROJECT_ROOT / DEFAULT_ARTIFACT_REL)
    if not target.is_file():
        return None
    try:
        doc = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return doc if isinstance(doc, dict) else None


def write_artifact(artifact: Mapping[str, Any], path: Path | None = None) -> Path:
    target = path or (PROJECT_ROOT / DEFAULT_ARTIFACT_REL)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return target


def merge_observations(
    *,
    previous: Mapping[str, Any] | None,
    discovered_programs: Sequence[ShortsProgramRecord],
    discovered_shorts: Sequence[ShortRecord],
    discovered_memberships: Sequence[ShortMembershipRecord],
    scraped_program_ids: set[str],
    source_ok: bool,
    observed_at: str,
) -> tuple[list[ShortsProgramRecord], list[ShortRecord], list[ShortMembershipRecord]]:
    """Preserve prior state on failed scrapes; replace memberships for successfully scraped programs."""
    prev_programs = [
        shorts_program_from_dict(row)
        for row in (previous or {}).get("shortsPrograms") or []
        if isinstance(row, Mapping)
    ]
    prev_shorts = [
        short_from_dict(row)
        for row in (previous or {}).get("shorts") or []
        if isinstance(row, Mapping)
    ]
    prev_memberships = [
        membership_from_dict(row)
        for row in (previous or {}).get("memberships") or []
        if isinstance(row, Mapping)
    ]

    programs_by_id: dict[str, ShortsProgramRecord] = {}
    if not source_ok:
        for row in prev_programs:
            programs_by_id[row.shorts_program_id] = row
    else:
        # Keep prior programs that were not re-scraped this run.
        for row in prev_programs:
            if row.shorts_program_id not in scraped_program_ids:
                programs_by_id[row.shorts_program_id] = row

    for row in discovered_programs:
        prior = next(
            (item for item in prev_programs if item.shorts_program_id == row.shorts_program_id),
            None,
        )
        programs_by_id[row.shorts_program_id] = ShortsProgramRecord(
            shorts_program_id=row.shorts_program_id,
            source=row.source,
            source_film_id=row.source_film_id,
            source_url=row.source_url,
            source_listing_key=row.source_listing_key,
            title=row.title,
            description=row.description or (prior.description if prior else None),
            image_url=row.image_url or (prior.image_url if prior else None),
            runtime_min=row.runtime_min
            if row.runtime_min is not None
            else (prior.runtime_min if prior else None),
            showtime_film_key=row.showtime_film_key
            or (prior.showtime_film_key if prior else None),
            collection_ids=row.collection_ids or (prior.collection_ids if prior else ()),
            member_count=row.member_count,
            first_observed_at=(prior.first_observed_at if prior else None) or observed_at,
            last_observed_at=observed_at,
            last_successful_scrape_at=observed_at,
            status="active",
        )

    memberships_by_key: dict[tuple[str, str], ShortMembershipRecord] = {}
    if not source_ok:
        for row in prev_memberships:
            memberships_by_key[(row.shorts_program_id, row.short_id)] = row
    else:
        for row in prev_memberships:
            if row.shorts_program_id not in scraped_program_ids:
                memberships_by_key[(row.shorts_program_id, row.short_id)] = row

    for row in discovered_memberships:
        prior = next(
            (
                item
                for item in prev_memberships
                if item.shorts_program_id == row.shorts_program_id
                and item.short_id == row.short_id
            ),
            None,
        )
        memberships_by_key[(row.shorts_program_id, row.short_id)] = ShortMembershipRecord(
            membership_id=row.membership_id,
            shorts_program_id=row.shorts_program_id,
            short_id=row.short_id,
            source=row.source,
            position=row.position,
            raw_title=row.raw_title,
            raw_metadata_block=row.raw_metadata_block,
            raw_description=row.raw_description,
            parsed_title=row.parsed_title,
            parsed_directors=row.parsed_directors,
            parsed_year=row.parsed_year,
            parsed_runtime_min=row.parsed_runtime_min,
            parsed_location_text=row.parsed_location_text,
            parsed_language=row.parsed_language,
            parsed_description=row.parsed_description,
            membership_evidence=row.membership_evidence
            or (prior.membership_evidence if prior else ()),
            first_observed_at=(prior.first_observed_at if prior else None) or observed_at,
            last_observed_at=observed_at,
        )

    active_short_ids = {member.short_id for member in memberships_by_key.values()}
    shorts_by_id: dict[str, ShortRecord] = {}
    if not source_ok:
        for row in prev_shorts:
            shorts_by_id[row.short_id] = row
    else:
        for row in prev_shorts:
            if row.short_id in active_short_ids:
                shorts_by_id[row.short_id] = row

    for row in discovered_shorts:
        prior = shorts_by_id.get(row.short_id) or next(
            (item for item in prev_shorts if item.short_id == row.short_id),
            None,
        )
        shorts_by_id[row.short_id] = ShortRecord(
            short_id=row.short_id,
            source=row.source,
            title=row.title,
            directors=row.directors or (prior.directors if prior else ()),
            year=row.year if row.year is not None else (prior.year if prior else None),
            runtime_min=row.runtime_min
            if row.runtime_min is not None
            else (prior.runtime_min if prior else None),
            location_text=row.location_text or (prior.location_text if prior else None),
            language=row.language or (prior.language if prior else None),
            description=row.description or (prior.description if prior else None),
            image_url=row.image_url or (prior.image_url if prior else None),
            canonical_film_id=row.canonical_film_id
            or (prior.canonical_film_id if prior else None),
            first_observed_at=(prior.first_observed_at if prior else None) or observed_at,
            last_observed_at=observed_at,
        )

    # Drop shorts no longer referenced by any membership after a successful scrape.
    if source_ok:
        shorts_by_id = {
            short_id: short
            for short_id, short in shorts_by_id.items()
            if short_id in active_short_ids
        }

    # Refresh member counts after merge.
    count_by_program: dict[str, int] = {}
    for member in memberships_by_key.values():
        count_by_program[member.shorts_program_id] = (
            count_by_program.get(member.shorts_program_id, 0) + 1
        )
    for program_id, program in list(programs_by_id.items()):
        programs_by_id[program_id] = ShortsProgramRecord(
            shorts_program_id=program.shorts_program_id,
            source=program.source,
            source_film_id=program.source_film_id,
            source_url=program.source_url,
            source_listing_key=program.source_listing_key,
            title=program.title,
            description=program.description,
            image_url=program.image_url,
            runtime_min=program.runtime_min,
            showtime_film_key=program.showtime_film_key,
            collection_ids=program.collection_ids,
            member_count=count_by_program.get(program_id, 0),
            first_observed_at=program.first_observed_at,
            last_observed_at=program.last_observed_at,
            last_successful_scrape_at=program.last_successful_scrape_at,
            status=program.status,
        )

    return (
        sort_programs(list(programs_by_id.values())),
        sort_shorts(list(shorts_by_id.values())),
        sort_memberships(list(memberships_by_key.values())),
    )


def build_artifact(
    *,
    programs: Sequence[ShortsProgramRecord],
    shorts: Sequence[ShortRecord],
    memberships: Sequence[ShortMembershipRecord],
    generated_at: str,
    source_stats: Mapping[str, Any],
    warnings: Sequence[str] | None = None,
    omitted: Sequence[Mapping[str, str]] | None = None,
) -> dict[str, Any]:
    canonical_short_count = sum(1 for short in shorts if short.canonical_film_id)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "timezone": "America/Los_Angeles",
        "shortsPrograms": [row.to_dict() for row in sort_programs(programs)],
        "shorts": [row.to_dict() for row in sort_shorts(shorts)],
        "memberships": [row.to_dict() for row in sort_memberships(memberships)],
        "stats": {
            "shorts_program_count": len(programs),
            "short_count": len(shorts),
            "membership_count": len(memberships),
            "canonical_short_count": canonical_short_count,
            "sources": dict(source_stats),
        },
        "warnings": sorted({str(item) for item in (warnings or []) if item}),
        "omitted": [dict(item) for item in (omitted or [])],
    }
