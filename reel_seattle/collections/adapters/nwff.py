"""NWFF series pages + film-page series labels."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

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
    EVIDENCE_FILM_PAGE_SERIES_LINK,
    CollectionRecord,
    MembershipRecord,
    SourceDiscoveryResult,
)
from reel_seattle.ingestion.independent_contract import normalize_exact_source_title
from reel_seattle.prototypes.nwff import NWFF_BASE, canonical_film_url, film_slug_from_url

NWFF_SERIES_INDEX = f"{NWFF_BASE}/series/"
_ALLOWED_HOSTS = {"nwfilmforum.org", "www.nwfilmforum.org"}


def canonicalize_nwff_series_url(url: str) -> str | None:
    absolute = urljoin(NWFF_BASE.rstrip("/") + "/", str(url).strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    if parsed.netloc.casefold() not in _ALLOWED_HOSTS:
        return None
    match = re.fullmatch(r"/series/([^/]+)/?", parsed.path)
    if not match:
        return None
    slug = match.group(1).strip()
    if not slug:
        return None
    return urlunparse(("https", "nwfilmforum.org", f"/series/{slug}/", "", "", ""))


def extract_nwff_series_index_links(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        canonical = canonicalize_nwff_series_url(anchor["href"])
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        found.append(canonical)
    return found


def extract_nwff_series_links_from_film_page(html: str) -> list[str]:
    """Explicit series labels on the film page — never site-nav series menus."""
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        if _in_nav_chrome(anchor):
            continue
        canonical = canonicalize_nwff_series_url(anchor["href"])
        if not canonical or canonical in seen:
            continue
        label = normalize_exact_source_title(anchor.get_text(" ", strip=True)) or ""
        href = str(anchor["href"])
        if "series" not in href.casefold() and not re.search(r"\bseries\b", label, re.I):
            continue
        seen.add(canonical)
        found.append(canonical)
    return found


def parse_nwff_series_page(
    html: str,
    *,
    series_url: str,
    observed_at: str,
) -> tuple[CollectionRecord | None, list[MembershipRecord], list[str]]:
    canonical = canonicalize_nwff_series_url(series_url)
    if not canonical:
        return None, [], [f"NWFF series URL rejected: {series_url}"]
    slug = urlparse(canonical).path.strip("/").split("/")[-1]
    soup = BeautifulSoup(html, "html.parser")
    title = normalize_exact_source_title(first_heading(soup) or "") or slug.replace("-", " ").title()
    cid = collection_id(source="nwff", source_collection_type="series", source_collection_id=slug)
    dates = _nwff_date_range(soup)
    collection = CollectionRecord(
        collection_id=cid,
        source="nwff",
        source_collection_type="series",
        source_collection_id=slug,
        title=title,
        source_url=canonical,
        description=meta_description(soup) or _first_long_paragraph(soup),
        image_url=og_image(soup),
        start_date=dates[0],
        end_date=dates[1],
        first_observed_at=observed_at,
        last_observed_at=observed_at,
        last_successful_scrape_at=observed_at,
        status="active",
    )
    members: list[MembershipRecord] = []
    seen: set[str] = set()
    anchors = soup.select("article a.preview--film, article a[href*='/films/']") or soup.find_all("a", href=True)
    for anchor in anchors:
        if _in_nav_chrome(anchor):
            continue
        film_url = canonical_film_url(anchor["href"])
        if not film_url or film_url in seen:
            continue
        seen.add(film_url)
        raw_title = _nwff_member_title(anchor.get_text(" ", strip=True)) or film_url
        members.append(
            MembershipRecord(
                collection_id=cid,
                source="nwff",
                source_film_url=film_url,
                raw_title=raw_title,
                source_film_id=film_slug_from_url(film_url),
                membership_evidence=(EVIDENCE_COLLECTION_PAGE_LINK,),
                first_observed_at=observed_at,
                last_observed_at=observed_at,
            )
        )
    return collection, members, []


_NAV_CLASS_MARKERS = ("menu__", "nav", "footer", "site-header", "site-footer")
_PREVIEW_WHEN_RE = re.compile(
    r"^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{1,2}\.\d{2}\s*(?:am|pm)\s+",
    re.IGNORECASE,
)


def _in_nav_chrome(node) -> bool:
    current = node
    for _ in range(8):
        if current is None:
            return False
        getter = getattr(current, "get", None)
        classes = " ".join(getter("class") or []).casefold() if callable(getter) else ""
        name = (getattr(current, "name", None) or "").casefold()
        if name in {"nav", "header", "footer"}:
            return True
        if any(marker in classes for marker in _NAV_CLASS_MARKERS):
            return True
        current = getattr(current, "parent", None)
    return False


def _nwff_member_title(text: str) -> str:
    cleaned = normalize_exact_source_title(text) or ""
    cleaned = _PREVIEW_WHEN_RE.sub("", cleaned).strip()
    if cleaned.casefold().endswith(" film"):
        cleaned = cleaned[: -len(" film")].strip()
    return cleaned


def _first_long_paragraph(soup: BeautifulSoup) -> str | None:
    for node in soup.find_all("p"):
        text = normalize_exact_source_title(node.get_text(" ", strip=True))
        if text and len(text) > 80:
            return text
    return None


_NWFF_DATES = re.compile(
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}"
    r"(?:\s*[-–—]\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{1,2})?"
    r",?\s+\d{4}",
    re.IGNORECASE,
)


def _nwff_date_range(soup: BeautifulSoup) -> tuple[str | None, str | None]:
    text = soup.get_text(" ", strip=True)
    matches = list(_NWFF_DATES.finditer(text))
    if not matches:
        return None, None
    first = matches[0].group(0)
    if " - " in first or "–" in first or "—" in first:
        parts = re.split(r"\s*[-–—]\s*", first)
        if len(parts) == 2:
            return parts[0], parts[1]
    if len(matches) >= 2:
        return matches[0].group(0), matches[1].group(0)
    return first, None


def discover_nwff_collections(
    *,
    fetch_text: FetchText | None = None,
    observed_at: str,
    sleep_seconds: float = 0.0,
    film_page_urls: list[str] | None = None,
) -> SourceDiscoveryResult:
    fetch = fetch_text or default_fetch_text
    warnings: list[str] = []
    omitted: list[dict[str, str]] = []
    index_html = fetch(NWFF_SERIES_INDEX)
    if not index_html:
        return SourceDiscoveryResult(
            source="nwff",
            ok=False,
            warnings=[f"Failed to fetch NWFF series index {NWFF_SERIES_INDEX}"],
            stats={"index_ok": False},
        )

    candidates = extract_nwff_series_index_links(index_html)
    collections: list[CollectionRecord] = []
    memberships: list[MembershipRecord] = []
    by_id: dict[str, CollectionRecord] = {}
    members_by_key: dict[tuple[str, str], MembershipRecord] = {}
    omitted_collections: dict[str, CollectionRecord] = {}
    pages_ok = 0
    pages_failed = 0
    for url in candidates:
        html = fetch(url)
        sleep_if_needed(sleep_seconds)
        if not html:
            pages_failed += 1
            warnings.append(f"Failed to fetch NWFF series {url}")
            continue
        collection, members, page_warnings = parse_nwff_series_page(
            html, series_url=url, observed_at=observed_at
        )
        warnings.extend(page_warnings)
        if collection is None:
            pages_failed += 1
            continue
        if not members:
            omitted_collections[collection.collection_id] = collection
            omitted.append(
                {
                    "url": url,
                    "reason": "no_explicit_member_film_links",
                    "title": collection.title,
                }
            )
            continue
        pages_ok += 1
        by_id[collection.collection_id] = collection
        for member in members:
            members_by_key[(member.collection_id, member.source_film_url)] = member

    film_corroborations = 0
    for film_url in film_page_urls or []:
        canonical_film = canonical_film_url(film_url) or film_url
        html = fetch(canonical_film)
        sleep_if_needed(sleep_seconds)
        if not html:
            continue
        for series_url in extract_nwff_series_links_from_film_page(html):
            slug = urlparse(series_url).path.strip("/").split("/")[-1]
            cid = collection_id(
                source="nwff",
                source_collection_type="series",
                source_collection_id=slug,
            )
            if cid not in by_id and cid in omitted_collections:
                by_id[cid] = omitted_collections[cid]
            if cid not in by_id:
                series_html = fetch(series_url)
                parsed = (
                    parse_nwff_series_page(
                        series_html or "",
                        series_url=series_url,
                        observed_at=observed_at,
                    )[0]
                    if series_html
                    else None
                )
                if parsed is not None:
                    by_id[cid] = parsed
            if cid not in by_id:
                continue
            heading = normalize_exact_source_title(first_heading(BeautifulSoup(html, "html.parser")) or "")
            key = (cid, canonical_film)
            existing = members_by_key.get(key)
            evidence = [EVIDENCE_FILM_PAGE_SERIES_LINK]
            if existing:
                evidence = list(dict.fromkeys([*existing.membership_evidence, *evidence]))
                members_by_key[key] = MembershipRecord(
                    collection_id=cid,
                    source="nwff",
                    source_film_url=canonical_film,
                    raw_title=existing.raw_title or heading or canonical_film,
                    source_film_id=existing.source_film_id or film_slug_from_url(canonical_film),
                    membership_evidence=tuple(evidence),
                    first_observed_at=existing.first_observed_at,
                    last_observed_at=observed_at,
                )
                film_corroborations += 1
            else:
                members_by_key[key] = MembershipRecord(
                    collection_id=cid,
                    source="nwff",
                    source_film_url=canonical_film,
                    raw_title=heading or canonical_film,
                    source_film_id=film_slug_from_url(canonical_film),
                    membership_evidence=(EVIDENCE_FILM_PAGE_SERIES_LINK,),
                    first_observed_at=observed_at,
                    last_observed_at=observed_at,
                )

    collections = list(by_id.values())
    memberships = list(members_by_key.values())
    return SourceDiscoveryResult(
        source="nwff",
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
            "series": len(collections),
            "collections": len(collections),
            "memberships": len(memberships),
            "film_page_corroborations": film_corroborations,
        },
    )
