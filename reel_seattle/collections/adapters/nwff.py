"""NWFF series pages + film-page series labels."""

from __future__ import annotations

import re
from typing import Callable
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

from reel_seattle.collections.adapters.common import (
    FetchText,
    default_fetch_resolved,
    default_fetch_text,
    first_heading,
    meta_description,
    og_image,
    sleep_if_needed,
)
from reel_seattle.collections.ids import collection_id
from reel_seattle.collections.model import (
    EVIDENCE_COLLECTION_PAGE_LINK,
    EVIDENCE_FESTIVAL_CATALOGUE_PAGE_LINK,
    EVIDENCE_FESTIVAL_PAGE_LINK,
    EVIDENCE_FILM_PAGE_SERIES_LINK,
    CollectionRecord,
    MembershipRecord,
    SourceDiscoveryResult,
)
from reel_seattle.ingestion.independent_contract import normalize_exact_source_title
from reel_seattle.prototypes.nwff import NWFF_BASE, canonical_film_url, film_slug_from_url

NWFF_SERIES_INDEX = f"{NWFF_BASE}/series/"
NWFF_FESTIVALS_INDEX = f"{NWFF_BASE}/festivals/"
_ALLOWED_HOSTS = {"nwfilmforum.org", "www.nwfilmforum.org"}
_SHORTLINK_HOSTS = {
    "bit.ly",
    "bitly.com",
    "j.mp",
    "tinyurl.com",
    "t.co",
    "ow.ly",
}
_MONTH_DATE_YEAR_RE = re.compile(
    r"(?:January|February|March|April|May|June|July|August|September|October|"
    r"November|December)\s+\d{1,2}\s*[-–]\s*\d{1,2},?\s*(20\d{2})",
    re.IGNORECASE,
)
FetchResolved = Callable[[str], tuple[str, str] | None]


def canonicalize_nwff_festival_url(url: str) -> str | None:
    absolute = urljoin(NWFF_BASE.rstrip("/") + "/", str(url).strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    if parsed.netloc.casefold() not in _ALLOWED_HOSTS:
        return None
    match = re.fullmatch(r"/festivals/([^/]+)/?", parsed.path)
    if not match:
        return None
    slug = match.group(1).strip()
    if not slug:
        return None
    return urlunparse(("https", "nwfilmforum.org", f"/festivals/{slug}/", "", "", ""))


def extract_nwff_festival_index_links(html: str) -> list[str]:
    """Current festival landing pages only — stop before Past / archive sections.

    NWFF lists the live festival roster in site nav as well as the Current
    content block, so nav links are intentionally kept for this index page.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()
    for node in soup.find_all(["h1", "h2", "h3", "a"]):
        if getattr(node, "name", None) in {"h1", "h2", "h3"}:
            heading = node.get_text(" ", strip=True).casefold().strip()
            if heading in {"past", "past festivals"} or heading.startswith("past festival"):
                break
            continue
        if getattr(node, "name", None) != "a" or not node.get("href"):
            continue
        canonical = canonicalize_nwff_festival_url(node["href"])
        if not canonical or canonical in seen:
            continue
        if urlparse(canonical).path.rstrip("/") == "/festivals":
            continue
        seen.add(canonical)
        found.append(canonical)
    return found


def extract_festival_catalogue_candidate_urls(html: str, *, festival_url: str) -> list[str]:
    """Explicit catalogue/member-page candidates from a festival landing page.

    Includes same-site festival/film links and known shortlinks that may resolve
    back onto NWFF. Stops before a Past Festivals archive section.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen: set[str] = set()
    festival_canonical = canonicalize_nwff_festival_url(festival_url)

    for node in soup.find_all(["h1", "h2", "h3", "a"]):
        if getattr(node, "name", None) in {"h1", "h2", "h3"}:
            heading = node.get_text(" ", strip=True).casefold()
            if heading.startswith("past festival"):
                break
            continue
        if getattr(node, "name", None) != "a" or not node.get("href"):
            continue
        if _in_nav_chrome(node):
            continue
        href = str(node["href"]).strip()
        if not href or href.startswith("#"):
            continue
        absolute = urljoin(NWFF_BASE.rstrip("/") + "/", href)
        parsed = urlparse(absolute)
        host = parsed.netloc.casefold()
        film = canonical_film_url(absolute)
        festival = canonicalize_nwff_festival_url(absolute)
        if film:
            candidate = film
        elif festival:
            candidate = festival
        elif host in _SHORTLINK_HOSTS:
            candidate = absolute
        else:
            # Do not follow Instagram, Eventive, ticket vendors, etc.
            continue
        if festival_canonical and candidate.rstrip("/") == festival_canonical.rstrip("/"):
            continue
        if urlparse(candidate).path.rstrip("/") == "/festivals":
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        found.append(candidate)
    return found


def _festival_edition_year(soup: BeautifulSoup) -> str | None:
    """Prefer explicit festival date-range / heading years over archive chrome."""
    for node in soup.find_all(["h1", "h2", "h3"]):
        heading = node.get_text(" ", strip=True)
        if heading.casefold().startswith("past festival"):
            break
        date_match = _MONTH_DATE_YEAR_RE.search(heading)
        if date_match:
            return date_match.group(1)
        year_match = re.search(r"\b(20\d{2})\b", heading)
        if year_match:
            return year_match.group(1)
    body = soup.get_text(" ", strip=True)
    date_match = _MONTH_DATE_YEAR_RE.search(body)
    if date_match:
        return date_match.group(1)
    return None


def extract_nwff_film_memberships_from_page(
    html: str,
    *,
    collection_id_value: str,
    observed_at: str,
    evidence: str,
) -> list[MembershipRecord]:
    soup = BeautifulSoup(html, "html.parser")
    members: list[MembershipRecord] = []
    seen: set[str] = set()
    anchors = soup.select("article a.preview--film, article a[href*='/films/']") or soup.find_all(
        "a", href=True
    )
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
                collection_id=collection_id_value,
                source="nwff",
                source_film_url=film_url,
                raw_title=raw_title,
                source_film_id=film_slug_from_url(film_url),
                membership_evidence=(evidence,),
                first_observed_at=observed_at,
                last_observed_at=observed_at,
            )
        )
    return members


def parse_nwff_festival_page(
    html: str,
    *,
    festival_url: str,
    observed_at: str,
) -> tuple[CollectionRecord | None, list[str]]:
    canonical = canonicalize_nwff_festival_url(festival_url)
    if not canonical:
        return None, [f"NWFF festival URL rejected: {festival_url}"]
    slug = urlparse(canonical).path.strip("/").split("/")[-1]
    soup = BeautifulSoup(html, "html.parser")
    title = normalize_exact_source_title(first_heading(soup) or "") or slug.replace("-", " ").title()
    # Prefer a year-qualified title when the page states an edition year.
    edition_year = _festival_edition_year(soup)
    if edition_year and edition_year not in title:
        title = f"{title} {edition_year}"
    dates = _nwff_date_range(soup)
    cid = collection_id(
        source="nwff",
        source_collection_type="festival",
        source_collection_id=slug,
    )
    collection = CollectionRecord(
        collection_id=cid,
        source="nwff",
        source_collection_type="festival",
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
    return collection, []


def discover_nwff_festival_collections(
    *,
    fetch_text: FetchText | None = None,
    fetch_resolved: FetchResolved | None = None,
    observed_at: str,
    sleep_seconds: float = 0.0,
) -> SourceDiscoveryResult:
    """Discover NWFF festival/category Collections via explicit member listing links."""
    fetch = fetch_text or default_fetch_text
    resolve = fetch_resolved or default_fetch_resolved
    warnings: list[str] = []
    omitted: list[dict[str, str]] = []
    index_html = fetch(NWFF_FESTIVALS_INDEX)
    if not index_html:
        return SourceDiscoveryResult(
            source="nwff",
            ok=True,
            warnings=[f"Failed to fetch NWFF festivals index {NWFF_FESTIVALS_INDEX}"],
            stats={"festivals_index_ok": False},
        )

    candidates = extract_nwff_festival_index_links(index_html)
    by_id: dict[str, CollectionRecord] = {}
    members_by_key: dict[tuple[str, str], MembershipRecord] = {}
    pages_ok = 0
    pages_failed = 0
    catalogue_pages = 0

    for festival_url in candidates:
        html = fetch(festival_url)
        sleep_if_needed(sleep_seconds)
        if not html:
            pages_failed += 1
            warnings.append(f"Failed to fetch NWFF festival {festival_url}")
            continue
        collection, page_warnings = parse_nwff_festival_page(
            html, festival_url=festival_url, observed_at=observed_at
        )
        warnings.extend(page_warnings)
        if collection is None:
            pages_failed += 1
            continue

        # Direct film links on the festival landing page (rare but valid).
        for member in extract_nwff_film_memberships_from_page(
            html,
            collection_id_value=collection.collection_id,
            observed_at=observed_at,
            evidence=EVIDENCE_FESTIVAL_PAGE_LINK,
        ):
            members_by_key[(member.collection_id, member.source_film_url)] = member

        for candidate in extract_festival_catalogue_candidate_urls(
            html, festival_url=festival_url
        ):
            resolved_url = candidate
            resolved_html = None
            parsed = urlparse(candidate)
            if parsed.netloc.casefold() not in _ALLOWED_HOSTS:
                if parsed.netloc.casefold() not in _SHORTLINK_HOSTS:
                    continue
                resolved = resolve(candidate)
                sleep_if_needed(sleep_seconds)
                if not resolved:
                    warning = f"Failed to resolve NWFF festival shortlink {candidate}"
                    if warning not in warnings:
                        warnings.append(warning)
                    continue
                resolved_url, resolved_html = resolved
                if urlparse(resolved_url).netloc.casefold() not in _ALLOWED_HOSTS:
                    # Ticket vendors / social destinations are not collection evidence.
                    continue
            film_url = canonical_film_url(resolved_url)
            festival_child = canonicalize_nwff_festival_url(resolved_url)
            if film_url:
                raw_title = film_slug_from_url(film_url) or film_url
                members_by_key[(collection.collection_id, film_url)] = MembershipRecord(
                    collection_id=collection.collection_id,
                    source="nwff",
                    source_film_url=film_url,
                    raw_title=raw_title.replace("-", " "),
                    source_film_id=film_slug_from_url(film_url),
                    membership_evidence=(EVIDENCE_FESTIVAL_PAGE_LINK,),
                    first_observed_at=observed_at,
                    last_observed_at=observed_at,
                )
                continue
            if not festival_child:
                continue
            if festival_child.rstrip("/") == collection.source_url.rstrip("/"):
                continue
            child_html = resolved_html or fetch(festival_child)
            sleep_if_needed(sleep_seconds)
            if not child_html:
                warnings.append(f"Failed to fetch NWFF festival catalogue {festival_child}")
                continue
            catalogue_pages += 1
            child_members = extract_nwff_film_memberships_from_page(
                child_html,
                collection_id_value=collection.collection_id,
                observed_at=observed_at,
                evidence=EVIDENCE_FESTIVAL_CATALOGUE_PAGE_LINK,
            )
            for member in child_members:
                key = (member.collection_id, member.source_film_url)
                existing = members_by_key.get(key)
                if existing:
                    evidence = list(
                        dict.fromkeys(
                            [*existing.membership_evidence, *member.membership_evidence]
                        )
                    )
                    members_by_key[key] = MembershipRecord(
                        collection_id=existing.collection_id,
                        source=existing.source,
                        source_film_url=existing.source_film_url,
                        raw_title=existing.raw_title or member.raw_title,
                        source_film_id=existing.source_film_id or member.source_film_id,
                        membership_evidence=tuple(evidence),
                        first_observed_at=existing.first_observed_at,
                        last_observed_at=observed_at,
                    )
                else:
                    members_by_key[key] = member

        festival_members = [
            member
            for member in members_by_key.values()
            if member.collection_id == collection.collection_id
        ]
        if not festival_members:
            omitted.append(
                {
                    "url": collection.source_url,
                    "reason": "no_explicit_member_film_links",
                    "title": collection.title,
                }
            )
            continue
        pages_ok += 1
        by_id[collection.collection_id] = collection

    return SourceDiscoveryResult(
        source="nwff",
        ok=pages_failed == 0,
        collections=list(by_id.values()),
        memberships=[
            member
            for member in members_by_key.values()
            if member.collection_id in by_id
        ],
        warnings=warnings,
        omitted=omitted,
        stats={
            "festivals_index_ok": True,
            "festival_candidate_pages": len(candidates),
            "festival_pages_ok": pages_ok,
            "festival_pages_failed": pages_failed,
            "festival_catalogue_pages": catalogue_pages,
            "festivals": len(by_id),
            "festival_memberships": sum(
                1 for member in members_by_key.values() if member.collection_id in by_id
            ),
        },
    )


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
    fetch_resolved: FetchResolved | None = None,
    observed_at: str,
    sleep_seconds: float = 0.0,
    film_page_urls: list[str] | None = None,
) -> SourceDiscoveryResult:
    fetch = fetch_text or default_fetch_text
    resolve = fetch_resolved or default_fetch_resolved
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

    festival_result = discover_nwff_festival_collections(
        fetch_text=fetch,
        fetch_resolved=resolve,
        observed_at=observed_at,
        sleep_seconds=sleep_seconds,
    )
    warnings.extend(festival_result.warnings)
    omitted.extend(festival_result.omitted)
    for collection in festival_result.collections:
        by_id[collection.collection_id] = collection
    for member in festival_result.memberships:
        key = (member.collection_id, member.source_film_url)
        existing = members_by_key.get(key)
        if existing:
            evidence = list(
                dict.fromkeys([*existing.membership_evidence, *member.membership_evidence])
            )
            members_by_key[key] = MembershipRecord(
                collection_id=existing.collection_id,
                source=existing.source,
                source_film_url=existing.source_film_url,
                raw_title=existing.raw_title or member.raw_title,
                source_film_id=existing.source_film_id or member.source_film_id,
                membership_evidence=tuple(evidence),
                first_observed_at=existing.first_observed_at,
                last_observed_at=observed_at,
            )
        else:
            members_by_key[key] = member

    collections = list(by_id.values())
    memberships = list(members_by_key.values())
    festival_ok = True
    if festival_result.stats.get("festivals_index_ok"):
        festival_ok = festival_result.ok
    return SourceDiscoveryResult(
        source="nwff",
        ok=pages_failed == 0 and festival_ok,
        collections=collections,
        memberships=memberships,
        warnings=warnings,
        omitted=omitted,
        stats={
            "index_ok": True,
            "candidate_pages": len(candidates),
            "pages_ok": pages_ok,
            "pages_failed": pages_failed,
            "series": len([c for c in collections if c.source_collection_type == "series"]),
            "festivals": len([c for c in collections if c.source_collection_type == "festival"]),
            "collections": len(collections),
            "memberships": len(memberships),
            "film_page_corroborations": film_corroborations,
            **{
                f"festival_{key}" if not key.startswith("festival") else key: value
                for key, value in festival_result.stats.items()
            },
        },
    )
