"""Conservative Short identity resolution across program occurrences."""

from __future__ import annotations

from dataclasses import dataclass

from reel_seattle.shorts_programs.ids import (
    membership_id,
    merged_short_id,
    program_scoped_short_id,
)
from reel_seattle.shorts_programs.model import (
    ChildOccurrence,
    ShortMembershipRecord,
    ShortRecord,
    EVIDENCE_CHILD_COPY_SECTION,
    EVIDENCE_FILMS_IN_THIS_PROGRAM,
)


@dataclass(frozen=True, slots=True)
class OccurrenceIdentity:
    short: ShortRecord
    membership: ShortMembershipRecord


def normalize_title_key(title: str) -> str:
    return " ".join((title or "").casefold().split())


def normalize_directors_key(directors: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    return tuple(sorted(" ".join(str(item).casefold().split()) for item in directors if item))


def can_merge_occurrences(
    left: ChildOccurrence | ShortRecord,
    right: ChildOccurrence | ShortRecord,
) -> bool:
    """Require strong evidence beyond title alone.

    Merge only when normalized titles match AND year matches AND at least one of:
    - directors match (both non-empty)
    - runtime matches (both non-empty)
    """
    left_title = normalize_title_key(_title_of(left))
    right_title = normalize_title_key(_title_of(right))
    if not left_title or left_title != right_title:
        return False

    left_year = _year_of(left)
    right_year = _year_of(right)
    if left_year is None or right_year is None or left_year != right_year:
        return False

    left_dirs = normalize_directors_key(_directors_of(left))
    right_dirs = normalize_directors_key(_directors_of(right))
    directors_ok = bool(left_dirs) and left_dirs == right_dirs

    left_runtime = _runtime_of(left)
    right_runtime = _runtime_of(right)
    runtime_ok = (
        left_runtime is not None
        and right_runtime is not None
        and left_runtime == right_runtime
    )
    return directors_ok or runtime_ok


def resolve_occurrence_identity(
    *,
    source: str,
    program_source_film_id: str,
    shorts_program_id: str,
    occurrence: ChildOccurrence,
    observed_at: str,
) -> OccurrenceIdentity:
    """Map one child occurrence to a provisional program-scoped Short + membership.

    Cross-program reuse is applied later by ``consolidate_short_identities``.
    """
    title = (occurrence.parsed_title or occurrence.raw_title or "").strip() or "Untitled short"
    short_id = program_scoped_short_id(
        source=source,
        program_source_film_id=program_source_film_id,
        title=title,
    )
    short = ShortRecord(
        short_id=short_id,
        source=source,
        title=title,
        directors=occurrence.parsed_directors,
        year=occurrence.parsed_year,
        runtime_min=occurrence.parsed_runtime_min,
        location_text=occurrence.parsed_location_text,
        language=occurrence.parsed_language,
        description=occurrence.parsed_description,
        image_url=occurrence.image_url,
        canonical_film_id=None,
        first_observed_at=observed_at,
        last_observed_at=observed_at,
    )
    membership = ShortMembershipRecord(
        membership_id=membership_id(
            shorts_program_id=shorts_program_id, short_id=short.short_id
        ),
        shorts_program_id=shorts_program_id,
        short_id=short.short_id,
        source=source,
        position=occurrence.position,
        raw_title=occurrence.raw_title,
        raw_metadata_block=occurrence.raw_metadata_block,
        raw_description=occurrence.raw_description,
        parsed_title=occurrence.parsed_title,
        parsed_directors=occurrence.parsed_directors,
        parsed_year=occurrence.parsed_year,
        parsed_runtime_min=occurrence.parsed_runtime_min,
        parsed_location_text=occurrence.parsed_location_text,
        parsed_language=occurrence.parsed_language,
        parsed_description=occurrence.parsed_description,
        membership_evidence=(
            EVIDENCE_FILMS_IN_THIS_PROGRAM,
            EVIDENCE_CHILD_COPY_SECTION,
        ),
        first_observed_at=observed_at,
        last_observed_at=observed_at,
    )
    return OccurrenceIdentity(short=short, membership=membership)


def consolidate_short_identities(
    *,
    shorts: list[ShortRecord],
    memberships: list[ShortMembershipRecord],
    observed_at: str,
) -> tuple[list[ShortRecord], list[ShortMembershipRecord]]:
    """Merge only when strong evidence agrees; otherwise keep provisional ids."""
    if not shorts:
        return [], memberships

    parent: dict[str, str] = {short.short_id: short.short_id for short in shorts}

    def find(short_id: str) -> str:
        while parent[short_id] != short_id:
            parent[short_id] = parent[parent[short_id]]
            short_id = parent[short_id]
        return short_id

    def union(left_id: str, right_id: str) -> None:
        root_left = find(left_id)
        root_right = find(right_id)
        if root_left != root_right:
            parent[root_right] = root_left

    by_id = {short.short_id: short for short in shorts}
    ids = list(by_id)
    for index, left_id in enumerate(ids):
        for right_id in ids[index + 1 :]:
            if can_merge_occurrences(by_id[left_id], by_id[right_id]):
                union(left_id, right_id)

    groups: dict[str, list[ShortRecord]] = {}
    for short in shorts:
        groups.setdefault(find(short.short_id), []).append(short)

    remap: dict[str, str] = {}
    consolidated: dict[str, ShortRecord] = {}
    for root, group in groups.items():
        representative = group[0]
        year = next((item.year for item in group if item.year is not None), None)
        if len(group) > 1 and year is not None:
            target_id = merged_short_id(
                source=representative.source,
                title=representative.title,
                year=year,
            )
        else:
            target_id = root if len(group) == 1 else root
            # Multiple members without year: keep the lexicographically first provisional id.
            if len(group) > 1:
                target_id = sorted(item.short_id for item in group)[0]

        merged = ShortRecord(
            short_id=target_id,
            source=representative.source,
            title=next((item.title for item in group if item.title), representative.title),
            directors=next((item.directors for item in group if item.directors), ()),
            year=year,
            runtime_min=next(
                (item.runtime_min for item in group if item.runtime_min is not None),
                None,
            ),
            location_text=next(
                (item.location_text for item in group if item.location_text), None
            ),
            language=next((item.language for item in group if item.language), None),
            description=next(
                (item.description for item in group if item.description), None
            ),
            image_url=next((item.image_url for item in group if item.image_url), None),
            canonical_film_id=next(
                (item.canonical_film_id for item in group if item.canonical_film_id),
                None,
            ),
            first_observed_at=min(
                (item.first_observed_at or observed_at for item in group),
                default=observed_at,
            ),
            last_observed_at=observed_at,
        )
        consolidated[target_id] = merged
        for item in group:
            remap[item.short_id] = target_id

    rewritten: list[ShortMembershipRecord] = []
    for member in memberships:
        new_short_id = remap.get(member.short_id, member.short_id)
        rewritten.append(
            ShortMembershipRecord(
                membership_id=membership_id(
                    shorts_program_id=member.shorts_program_id,
                    short_id=new_short_id,
                ),
                shorts_program_id=member.shorts_program_id,
                short_id=new_short_id,
                source=member.source,
                position=member.position,
                raw_title=member.raw_title,
                raw_metadata_block=member.raw_metadata_block,
                raw_description=member.raw_description,
                parsed_title=member.parsed_title,
                parsed_directors=member.parsed_directors,
                parsed_year=member.parsed_year,
                parsed_runtime_min=member.parsed_runtime_min,
                parsed_location_text=member.parsed_location_text,
                parsed_language=member.parsed_language,
                parsed_description=member.parsed_description,
                membership_evidence=member.membership_evidence,
                first_observed_at=member.first_observed_at,
                last_observed_at=member.last_observed_at,
            )
        )
    return list(consolidated.values()), rewritten


def _title_of(row: ChildOccurrence | ShortRecord) -> str:
    if isinstance(row, ChildOccurrence):
        return row.parsed_title or row.raw_title or ""
    return row.title or ""


def _year_of(row: ChildOccurrence | ShortRecord) -> int | None:
    if isinstance(row, ChildOccurrence):
        return row.parsed_year
    return row.year


def _directors_of(row: ChildOccurrence | ShortRecord) -> tuple[str, ...]:
    if isinstance(row, ChildOccurrence):
        return row.parsed_directors
    return row.directors


def _runtime_of(row: ChildOccurrence | ShortRecord) -> int | None:
    if isinstance(row, ChildOccurrence):
        return row.parsed_runtime_min
    return row.runtime_min
