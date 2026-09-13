"""NWFF ShortsProgram discovery from explicit Films-in-this-program structure."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from reel_seattle.collections.adapters.common import (
    FetchText,
    default_fetch_text,
    first_heading,
    meta_description,
    og_image,
    sleep_if_needed,
)
from reel_seattle.ingestion.independent_contract import normalize_exact_source_title
from reel_seattle.prototypes.nwff import NWFF_BASE, canonical_film_url, film_slug_from_url
from reel_seattle.shorts_programs.identity import (
    consolidate_short_identities,
    resolve_occurrence_identity,
)
from reel_seattle.shorts_programs.ids import listing_key, shorts_program_id
from reel_seattle.shorts_programs.model import (
    ChildOccurrence,
    ShortMembershipRecord,
    ShortRecord,
    ShortsDiscoveryResult,
    ShortsProgramRecord,
)
from reel_seattle.shorts_programs.parse_metadata import (
    parse_child_block,
    split_child_text_blocks,
)

SOURCE = "nwff"
FILMS_IN_PROGRAM_RE = re.compile(r"films\s+in\s+this\s+program", re.IGNORECASE)
RUNTIME_META_RE = re.compile(r"PT(\d+)M", re.IGNORECASE)


def has_films_in_this_program_section(html: str) -> bool:
    soup = BeautifulSoup(html or "", "html.parser")
    for heading in soup.find_all(["h1", "h2", "h3"]):
        text = heading.get_text(" ", strip=True)
        if text and FILMS_IN_PROGRAM_RE.search(text):
            return True
    return False


def extract_child_occurrences(html: str) -> list[ChildOccurrence]:
    """Extract ordered child blocks after the explicit Films-in-this-program heading."""
    soup = BeautifulSoup(html or "", "html.parser")
    start = None
    for item in soup.select(".module-list__item"):
        heading = item.find(["h1", "h2", "h3"])
        if heading and FILMS_IN_PROGRAM_RE.search(heading.get_text(" ", strip=True) or ""):
            start = item
            break
    if start is None:
        return []

    occurrences: list[ChildOccurrence] = []
    position = 0
    for sibling in start.find_next_siblings("div", class_="module-list__item"):
        classes = " ".join(sibling.get("class") or [])
        if "module-list__item--headline" in classes and sibling.find(["h1", "h2"]):
            break
        if "module-list__item--copy-section" not in classes:
            continue
        title_node = sibling.select_one("h3")
        if title_node is None:
            continue
        raw_title = normalize_exact_source_title(title_node.get_text(" ", strip=True)) or ""
        if not raw_title:
            continue
        text_editor = sibling.select_one(".text-editor")
        raw_body = text_editor.get_text("\n", strip=True) if text_editor else ""
        metadata_line, description = split_child_text_blocks(raw_body)
        parsed = parse_child_block(title=raw_title, text_editor=raw_body)
        image_node = sibling.select_one("[component-graceful-image-load]")
        image_url = None
        if image_node is not None:
            image_url = (
                image_node.get("component-graceful-image-load")
                or image_node.get("large-url")
                or image_node.get("mobile-url")
            )
            if image_url:
                image_url = str(image_url).strip() or None
        position += 1
        occurrences.append(
            ChildOccurrence(
                position=position,
                raw_title=raw_title,
                raw_metadata_block=metadata_line or "",
                raw_description=description or "",
                image_url=image_url,
                parsed_title=parsed.title,
                parsed_directors=parsed.directors,
                parsed_year=parsed.year,
                parsed_runtime_min=parsed.runtime_min,
                parsed_location_text=parsed.location_text,
                parsed_language=parsed.language,
                parsed_description=parsed.description,
            )
        )
    return occurrences


def parse_nwff_shorts_program_page(
    html: str,
    *,
    film_url: str,
    observed_at: str,
) -> tuple[ShortsProgramRecord | None, list[ChildOccurrence], list[str]]:
    canonical = canonical_film_url(film_url)
    if not canonical:
        return None, [], [f"NWFF film URL rejected: {film_url}"]
    if not has_films_in_this_program_section(html):
        return None, [], []

    slug = film_slug_from_url(canonical)
    if not slug:
        return None, [], [f"NWFF film slug missing: {canonical}"]

    soup = BeautifulSoup(html, "html.parser")
    title = normalize_exact_source_title(first_heading(soup) or "") or slug.replace("-", " ").title()
    runtime_min = _runtime_from_soup(soup)
    program_id = shorts_program_id(source=SOURCE, source_film_id=slug)
    program = ShortsProgramRecord(
        shorts_program_id=program_id,
        source=SOURCE,
        source_film_id=slug,
        source_url=canonical,
        source_listing_key=listing_key(source=SOURCE, source_film_id=slug),
        title=title,
        description=meta_description(soup),
        image_url=og_image(soup),
        runtime_min=runtime_min,
        first_observed_at=observed_at,
        last_observed_at=observed_at,
        last_successful_scrape_at=observed_at,
        status="active",
    )
    children = extract_child_occurrences(html)
    return program, children, []


def discover_nwff_shorts_programs(
    *,
    fetch_text: FetchText | None = None,
    observed_at: str,
    film_page_urls: list[str] | None = None,
    sleep_seconds: float = 0.0,
) -> ShortsDiscoveryResult:
    fetch = fetch_text or default_fetch_text
    warnings: list[str] = []
    omitted: list[dict[str, str]] = []
    programs: list[ShortsProgramRecord] = []
    shorts_by_id: dict[str, ShortRecord] = {}
    memberships: list[ShortMembershipRecord] = []
    scraped_program_ids: set[str] = set()

    candidates = list(dict.fromkeys(film_page_urls or []))
    pages_ok = 0
    pages_failed = 0
    pages_skipped = 0

    for url in candidates:
        canonical = canonical_film_url(url) or url
        html = fetch(canonical)
        sleep_if_needed(sleep_seconds)
        if not html:
            pages_failed += 1
            warnings.append(f"Failed to fetch NWFF film page {canonical}")
            continue
        program, children, page_warnings = parse_nwff_shorts_program_page(
            html, film_url=canonical, observed_at=observed_at
        )
        warnings.extend(page_warnings)
        if program is None:
            pages_skipped += 1
            continue
        if not children:
            omitted.append(
                {
                    "url": program.source_url,
                    "reason": "films_in_this_program_section_empty",
                    "title": program.title,
                }
            )
            pages_ok += 1
            scraped_program_ids.add(program.shorts_program_id)
            programs.append(
                ShortsProgramRecord(
                    shorts_program_id=program.shorts_program_id,
                    source=program.source,
                    source_film_id=program.source_film_id,
                    source_url=program.source_url,
                    source_listing_key=program.source_listing_key,
                    title=program.title,
                    description=program.description,
                    image_url=program.image_url,
                    runtime_min=program.runtime_min,
                    member_count=0,
                    first_observed_at=program.first_observed_at,
                    last_observed_at=program.last_observed_at,
                    last_successful_scrape_at=program.last_successful_scrape_at,
                    status=program.status,
                )
            )
            continue

        pages_ok += 1
        scraped_program_ids.add(program.shorts_program_id)
        program_memberships: list[ShortMembershipRecord] = []
        for child in children:
            resolved = resolve_occurrence_identity(
                source=SOURCE,
                program_source_film_id=program.source_film_id,
                shorts_program_id=program.shorts_program_id,
                occurrence=child,
                observed_at=observed_at,
            )
            shorts_by_id[resolved.short.short_id] = resolved.short
            program_memberships.append(resolved.membership)

        programs.append(
            ShortsProgramRecord(
                shorts_program_id=program.shorts_program_id,
                source=program.source,
                source_film_id=program.source_film_id,
                source_url=program.source_url,
                source_listing_key=program.source_listing_key,
                title=program.title,
                description=program.description,
                image_url=program.image_url,
                runtime_min=program.runtime_min,
                member_count=len(program_memberships),
                first_observed_at=program.first_observed_at,
                last_observed_at=program.last_observed_at,
                last_successful_scrape_at=program.last_successful_scrape_at,
                status=program.status,
            )
        )
        memberships.extend(program_memberships)

    consolidated_shorts, consolidated_memberships = consolidate_short_identities(
        shorts=list(shorts_by_id.values()),
        memberships=memberships,
        observed_at=observed_at,
    )
    # Refresh member counts after consolidation (ids may collapse).
    count_by_program: dict[str, int] = {}
    for member in consolidated_memberships:
        count_by_program[member.shorts_program_id] = (
            count_by_program.get(member.shorts_program_id, 0) + 1
        )
    refreshed_programs = [
        ShortsProgramRecord(
            shorts_program_id=program.shorts_program_id,
            source=program.source,
            source_film_id=program.source_film_id,
            source_url=program.source_url,
            source_listing_key=program.source_listing_key,
            title=program.title,
            description=program.description,
            image_url=program.image_url,
            runtime_min=program.runtime_min,
            member_count=count_by_program.get(program.shorts_program_id, program.member_count),
            first_observed_at=program.first_observed_at,
            last_observed_at=program.last_observed_at,
            last_successful_scrape_at=program.last_successful_scrape_at,
            status=program.status,
        )
        for program in programs
    ]

    return ShortsDiscoveryResult(
        source=SOURCE,
        ok=pages_failed == 0,
        programs=refreshed_programs,
        shorts=consolidated_shorts,
        memberships=consolidated_memberships,
        warnings=warnings,
        omitted=omitted,
        scraped_program_ids=scraped_program_ids,
        stats={
            "candidate_pages": len(candidates),
            "pages_ok": pages_ok,
            "pages_failed": pages_failed,
            "pages_skipped_not_shorts_program": pages_skipped,
            "shorts_programs": len(refreshed_programs),
            "shorts": len(consolidated_shorts),
            "memberships": len(consolidated_memberships),
        },
    )


def _runtime_from_soup(soup: BeautifulSoup) -> int | None:
    node = soup.select_one('meta[itemprop="duration"]')
    if node is None:
        return None
    content = str(node.get("content") or "").strip()
    match = RUNTIME_META_RE.fullmatch(content)
    if not match:
        return None
    return int(match.group(1))
