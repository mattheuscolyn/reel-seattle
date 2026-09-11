"""Beacon Series + Programs → Reel Seattle Collections."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

from reel_seattle.adapters.beacon import (
    BEACON_BASE_URL,
    beacon_slug_from_url,
    canonicalize_beacon_movie_url,
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
    CollectionRecord,
    MembershipRecord,
    SourceDiscoveryResult,
)
from reel_seattle.ingestion.independent_contract import normalize_exact_source_title

BEACON_SERIES_INDEX = f"{BEACON_BASE_URL}/series"
BEACON_PROGRAMS_INDEX = f"{BEACON_BASE_URL}/programs"

_ALLOWED_HOSTS = {"thebeacon.film", "www.thebeacon.film"}


def canonicalize_beacon_collection_url(url: str) -> tuple[str, str] | None:
    """Return ``(canonical_url, source_collection_type)`` for series or program pages."""
    absolute = urljoin(BEACON_BASE_URL + "/", str(url).strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    if parsed.netloc.casefold() not in _ALLOWED_HOSTS:
        return None
    match = re.fullmatch(r"/(series|programs)/([^/]+)/?", parsed.path)
    if not match:
        return None
    kind = "series" if match.group(1) == "series" else "program"
    slug = match.group(2).strip()
    if not slug:
        return None
    prefix = "series" if kind == "series" else "programs"
    canonical = urlunparse(("https", "thebeacon.film", f"/{prefix}/{slug}", "", "", ""))
    return canonical, kind


def extract_beacon_index_links(html: str, *, kind: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        parsed = canonicalize_beacon_collection_url(anchor["href"])
        if not parsed:
            continue
        url, parsed_kind = parsed
        if parsed_kind != kind or url in seen:
            continue
        seen.add(url)
        found.append(url)
    return found


def parse_beacon_collection_page(
    html: str,
    *,
    collection_url: str,
    observed_at: str,
) -> tuple[CollectionRecord | None, list[MembershipRecord], list[str]]:
    parsed = canonicalize_beacon_collection_url(collection_url)
    if not parsed:
        return None, [], [f"Beacon collection URL rejected: {collection_url}"]
    canonical, kind = parsed
    slug = urlparse(canonical).path.strip("/").split("/")[-1]
    soup = BeautifulSoup(html, "html.parser")
    title = normalize_exact_source_title(first_heading(soup) or "") or slug.replace("-", " ").title()
    cid = collection_id(
        source="beacon",
        source_collection_type=kind,
        source_collection_id=slug,
    )
    collection = CollectionRecord(
        collection_id=cid,
        source="beacon",
        source_collection_type=kind,
        source_collection_id=slug,
        title=title,
        source_url=canonical,
        description=meta_description(soup) or _first_long_paragraph(soup),
        image_url=og_image(soup),
        first_observed_at=observed_at,
        last_observed_at=observed_at,
        last_successful_scrape_at=observed_at,
        status="active",
    )
    members: list[MembershipRecord] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        film_url = canonicalize_beacon_movie_url(anchor["href"])
        if not film_url or film_url in seen:
            continue
        seen.add(film_url)
        raw_title = normalize_exact_source_title(anchor.get_text(" ", strip=True)) or film_url
        members.append(
            MembershipRecord(
                collection_id=cid,
                source="beacon",
                source_film_url=film_url,
                raw_title=raw_title,
                source_film_id=beacon_slug_from_url(film_url),
                membership_evidence=(EVIDENCE_COLLECTION_PAGE_LINK,),
                first_observed_at=observed_at,
                last_observed_at=observed_at,
            )
        )
    return collection, members, []


def _first_long_paragraph(soup: BeautifulSoup) -> str | None:
    for node in soup.find_all("p"):
        text = normalize_exact_source_title(node.get_text(" ", strip=True))
        if text and len(text) > 80:
            return text
    return None


def discover_beacon_collections(
    *,
    fetch_text: FetchText | None = None,
    observed_at: str,
    sleep_seconds: float = 0.0,
) -> SourceDiscoveryResult:
    fetch = fetch_text or default_fetch_text
    warnings: list[str] = []
    omitted: list[dict[str, str]] = []
    series_html = fetch(BEACON_SERIES_INDEX)
    programs_html = fetch(BEACON_PROGRAMS_INDEX)
    if not series_html and not programs_html:
        return SourceDiscoveryResult(
            source="beacon",
            ok=False,
            warnings=["Failed to fetch Beacon series and programs indexes"],
            stats={"index_ok": False},
        )
    if not series_html:
        warnings.append(f"Failed to fetch {BEACON_SERIES_INDEX}")
    if not programs_html:
        warnings.append(f"Failed to fetch {BEACON_PROGRAMS_INDEX}")
    indexes_complete = bool(series_html and programs_html)

    candidates: list[tuple[str, str]] = []
    if series_html:
        for url in extract_beacon_index_links(series_html, kind="series"):
            candidates.append((url, "series"))
    if programs_html:
        for url in extract_beacon_index_links(programs_html, kind="program"):
            candidates.append((url, "program"))

    collections: list[CollectionRecord] = []
    memberships: list[MembershipRecord] = []
    pages_ok = 0
    pages_failed = 0
    series_count = 0
    program_count = 0
    for url, _kind in candidates:
        html = fetch(url)
        sleep_if_needed(sleep_seconds)
        if not html:
            pages_failed += 1
            warnings.append(f"Failed to fetch Beacon collection {url}")
            continue
        collection, members, page_warnings = parse_beacon_collection_page(
            html, collection_url=url, observed_at=observed_at
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
                    "sourceCollectionType": collection.source_collection_type,
                }
            )
            continue
        pages_ok += 1
        if collection.source_collection_type == "series":
            series_count += 1
        else:
            program_count += 1
        collections.append(collection)
        memberships.extend(members)

    return SourceDiscoveryResult(
        source="beacon",
        ok=indexes_complete and pages_failed == 0,
        collections=collections,
        memberships=memberships,
        warnings=warnings,
        omitted=omitted,
        stats={
            "index_ok": bool(series_html or programs_html),
            "candidate_pages": len(candidates),
            "pages_ok": pages_ok,
            "pages_failed": pages_failed,
            "series": series_count,
            "programs": program_count,
            "collections": len(collections),
            "memberships": len(memberships),
        },
    )
