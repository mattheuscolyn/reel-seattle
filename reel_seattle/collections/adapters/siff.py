"""SIFF collection discovery — Programs & Events pages with explicit member film links."""

from __future__ import annotations

import re
from urllib.parse import urlparse
from typing import Iterable

from bs4 import BeautifulSoup, Tag

from reel_seattle.adapters.siff import (
    SIFF_BASE_URL,
    canonicalize_siff_program_url,
    siff_program_path_id,
)
from reel_seattle.collections.adapters.common import (
    FetchText,
    default_fetch_text,
    first_heading,
    meta_description,
    og_image,
    sleep_if_needed,
)
from reel_seattle.collections.ids import collection_id
from reel_seattle.collections.model import (
    EVIDENCE_COLLECTION_PAGE_LINK,
    EVIDENCE_NESTED_URL_CORROBORATION,
    CollectionRecord,
    MembershipRecord,
    SourceDiscoveryResult,
)
from reel_seattle.ingestion.independent_contract import normalize_exact_source_title

SIFF_PROGRAMS_INDEX = f"{SIFF_BASE_URL}/programs-and-events"

# Index pages / non-curated groupings that must not become Collections.
_SIFF_OMIT_SLUGS = frozenset(
    {
        "cinema",
        "in-theaters",
        "talking-pictures",
        "siff-filmmaking-camps",
        "filmmaking-camps",
        "marquee-gala",
        "nffty",
        "national-film-festival-for-talented-youth",
        "grant-programs",
        "7-movie-tuesdays",
        "movie-tuesdays",
        "open-caption-screenings",
        "open-captions",
        "siff-cinema",
        "seattle-international-film-festival",
        "festival",
        "celluloid-screenings",
    }
)

_DATE_RANGE_RE = re.compile(
    r"(?P<start>(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+\d{1,2}(?:\s*,\s*\d{4})?)"
    r"\s*[-–—]\s*"
    r"(?P<end>(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December)?\s*\d{1,2},\s*\d{4})",
    re.IGNORECASE,
)


def is_siff_collection_landing(url: str, *, base_url: str = SIFF_BASE_URL) -> bool:
    """True for ``/programs-and-events/{slug}`` landings, including omitted slugs."""
    film = canonicalize_siff_program_url(url, base_url=base_url)
    if not film:
        return False
    path = urlparse(film).path.strip("/")
    parts = path.split("/")
    return len(parts) == 2 and parts[0] == "programs-and-events"


def canonicalize_siff_collection_url(url: str, *, base_url: str = SIFF_BASE_URL) -> str | None:
    """``/programs-and-events/{slug}`` only — not nested film pages or omitted indexes."""
    if not is_siff_collection_landing(url, base_url=base_url):
        return None
    film = canonicalize_siff_program_url(url, base_url=base_url)
    if not film:
        return None
    slug = urlparse(film).path.strip("/").split("/")[-1].casefold()
    if slug in _SIFF_OMIT_SLUGS:
        return None
    return film


def siff_collection_slug(url: str) -> str | None:
    canonical = canonicalize_siff_collection_url(url)
    if not canonical:
        return None
    return urlparse(canonical).path.strip("/").split("/")[-1]


def parent_siff_collection_url(film_url: str) -> str | None:
    """Parent ``/programs-and-events/{slug}`` for a nested film URL, if any.

    Nested URL structure is corroboration / extra discovery only — never
    membership by itself.
    """
    film = canonicalize_siff_program_url(film_url)
    if not film:
        return None
    path = urlparse(film).path.strip("/")
    parts = path.split("/")
    if len(parts) < 3 or parts[0] != "programs-and-events":
        return None
    return canonicalize_siff_collection_url(f"{SIFF_BASE_URL}/programs-and-events/{parts[1]}")


def extract_siff_collection_index_links(html: str) -> list[str]:
    return [url for url, _kind in extract_siff_collection_index_entries(html)]


def extract_siff_collection_index_entries(html: str) -> list[tuple[str, str]]:
    """Return ``(collection_url, source_collection_type)`` from the Programs index.

    Heading context distinguishes Film Series vs Cinema Programs when present.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    current_kind = "program"
    for node in soup.find_all(["h1", "h2", "h3", "h4", "a"]):
        if node.name in {"h1", "h2", "h3", "h4"}:
            heading = (node.get_text(" ", strip=True) or "").casefold()
            if "film series" in heading:
                current_kind = "series"
            elif "cinema program" in heading or heading == "programs":
                current_kind = "program"
            continue
        if not node.has_attr("href"):
            continue
        canonical = canonicalize_siff_collection_url(node["href"])
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        found.append((canonical, current_kind))
    return found


def parse_siff_collection_page(
    html: str,
    *,
    collection_url: str,
    observed_at: str,
    source_collection_type: str = "program",
) -> tuple[CollectionRecord | None, list[MembershipRecord], list[str]]:
    canonical = canonicalize_siff_collection_url(collection_url)
    if not canonical:
        return None, [], [f"SIFF collection URL rejected: {collection_url}"]
    slug = siff_collection_slug(canonical)
    assert slug
    kind = (source_collection_type or "program").strip().casefold()
    if kind not in {"program", "series"}:
        kind = "program"
    soup = BeautifulSoup(html, "html.parser")
    title = normalize_exact_source_title(first_heading(soup) or "") or slug.replace("-", " ").title()
    description = _siff_description(soup)
    dates = _siff_date_range(soup)
    image = og_image(soup)
    cid = collection_id(source="siff", source_collection_type=kind, source_collection_id=slug)
    collection = CollectionRecord(
        collection_id=cid,
        source="siff",
        source_collection_type=kind,
        source_collection_id=slug,
        title=title,
        source_url=canonical,
        description=description,
        image_url=image,
        start_date=dates[0],
        end_date=dates[1],
        first_observed_at=observed_at,
        last_observed_at=observed_at,
        last_successful_scrape_at=observed_at,
        status="active",
    )
    memberships = _siff_member_links(soup, collection=collection, observed_at=observed_at)
    return collection, memberships, []


def _siff_member_links(
    soup: BeautifulSoup,
    *,
    collection: CollectionRecord,
    observed_at: str,
) -> list[MembershipRecord]:
    members: list[MembershipRecord] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = str(anchor["href"])
        film_url = canonicalize_siff_program_url(href)
        if not film_url or film_url == collection.source_url:
            continue
        if is_siff_collection_landing(film_url):
            continue
        if film_url in seen:
            continue
        seen.add(film_url)
        raw_title = normalize_exact_source_title(anchor.get_text(" ", strip=True)) or film_url
        film_id = siff_program_path_id(film_url)
        evidence = [EVIDENCE_COLLECTION_PAGE_LINK]
        nested = _nested_under_collection(film_url, collection.source_collection_id)
        if nested:
            evidence.append(EVIDENCE_NESTED_URL_CORROBORATION)
        members.append(
            MembershipRecord(
                collection_id=collection.collection_id,
                source="siff",
                source_film_url=film_url,
                raw_title=raw_title,
                source_film_id=film_id,
                membership_evidence=tuple(evidence),
                first_observed_at=observed_at,
                last_observed_at=observed_at,
            )
        )
    return members


def _nested_under_collection(film_url: str, collection_slug: str) -> bool:
    path = urlparse(film_url).path.strip("/")
    parts = path.split("/")
    return (
        len(parts) >= 3
        and parts[0] == "programs-and-events"
        and parts[1].casefold() == collection_slug.casefold()
    )


def _siff_description(soup: BeautifulSoup) -> str | None:
    meta = meta_description(soup)
    if meta:
        return meta
    paragraphs = []
    for node in soup.find_all("p"):
        if not isinstance(node, Tag):
            continue
        text = normalize_exact_source_title(node.get_text(" ", strip=True))
        if text and len(text) > 80:
            paragraphs.append(text)
        if len(paragraphs) >= 2:
            break
    if not paragraphs:
        return None
    return " ".join(paragraphs)


def _siff_date_range(soup: BeautifulSoup) -> tuple[str | None, str | None]:
    text = soup.get_text(" ", strip=True)
    match = _DATE_RANGE_RE.search(text)
    if not match:
        return None, None
    return match.group("start"), match.group("end")


def discover_siff_collections(
    *,
    fetch_text: FetchText | None = None,
    extra_collection_urls: Iterable[str] = (),
    observed_at: str,
    sleep_seconds: float = 0.0,
) -> SourceDiscoveryResult:
    fetch = fetch_text or default_fetch_text
    warnings: list[str] = []
    omitted: list[dict[str, str]] = []
    index_html = fetch(SIFF_PROGRAMS_INDEX)
    if not index_html:
        return SourceDiscoveryResult(
            source="siff",
            ok=False,
            warnings=[f"Failed to fetch SIFF programs index {SIFF_PROGRAMS_INDEX}"],
            stats={"index_ok": False},
        )

    typed = extract_siff_collection_index_entries(index_html)
    kind_by_url = {url: kind for url, kind in typed}
    candidates = [url for url, _kind in typed]
    seen = set(candidates)
    for extra in extra_collection_urls:
        canonical = canonicalize_siff_collection_url(extra)
        if canonical and canonical not in seen:
            seen.add(canonical)
            kind_by_url.setdefault(canonical, "series")
            candidates.append(canonical)

    collections: list[CollectionRecord] = []
    memberships: list[MembershipRecord] = []
    pages_ok = 0
    pages_failed = 0
    for url in candidates:
        html = fetch(url)
        sleep_if_needed(sleep_seconds)
        if not html:
            pages_failed += 1
            warnings.append(f"Failed to fetch SIFF collection {url}")
            continue
        collection, members, page_warnings = parse_siff_collection_page(
            html,
            collection_url=url,
            observed_at=observed_at,
            source_collection_type=kind_by_url.get(url, "program"),
        )
        warnings.extend(page_warnings)
        if collection is None:
            pages_failed += 1
            continue
        if not members:
            omitted.append(
                {
                    "url": url,
                    "reason": "no_explicit_member_film_links",
                    "title": collection.title,
                }
            )
            continue
        pages_ok += 1
        collections.append(collection)
        memberships.extend(members)

    return SourceDiscoveryResult(
        source="siff",
        ok=pages_failed == 0,
        collections=collections,
        memberships=memberships,
        warnings=warnings,
        omitted=omitted,
        stats={
            "index_ok": True,
            "candidate_pages": len(candidates),
            "pages_ok": pages_ok,
            "pages_failed": pages_failed,
            "collections": len(collections),
            "memberships": len(memberships),
        },
    )
