"""Shared fetch / HTML helpers for collection adapters."""

from __future__ import annotations

import time
from typing import Callable
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

FetchText = Callable[[str], str | None]

USER_AGENT = (
    "ReelSeattle-Collections/0.1 "
    "(+https://github.com/mattheuscolyn/reel-seattle; read-only collections research)"
)


def default_fetch_text(url: str, *, timeout: float = 30.0) -> str | None:
    result = default_fetch_resolved(url, timeout=timeout)
    return result[1] if result else None


def default_fetch_resolved(
    url: str, *, timeout: float = 30.0
) -> tuple[str, str] | None:
    """Fetch URL following redirects. Returns (final_url, html)."""
    import urllib.error
    import urllib.request

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            final_url = str(response.geturl() or url)
            body = response.read().decode(charset, errors="replace")
            return final_url, body
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def canonical_https(url: str, *, allowed_hosts: set[str], base: str) -> str | None:
    absolute = urljoin(base.rstrip("/") + "/", str(url).strip())
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.casefold()
    if host not in allowed_hosts:
        return None
    path = parsed.path or "/"
    if path != "/" and path.endswith("/") and not path.endswith("//"):
        # Keep trailing slash only when the source conventionally uses it.
        pass
    return urlunparse(("https", parsed.netloc.casefold().removeprefix("www.") if False else _host(parsed.netloc), path, "", "", ""))


def _host(netloc: str) -> str:
    host = netloc.casefold()
    return host


def meta_content(soup: BeautifulSoup, *selectors: str) -> str | None:
    for selector in selectors:
        node = soup.select_one(selector)
        if node is None:
            continue
        content = node.get("content") or node.get("src")
        if content and str(content).strip():
            return str(content).strip()
    return None


def first_heading(soup: BeautifulSoup) -> str | None:
    h1 = soup.find("h1")
    if h1 is None:
        return None
    text = h1.get_text(" ", strip=True)
    return text or None


def og_image(soup: BeautifulSoup) -> str | None:
    return meta_content(soup, 'meta[property="og:image"]', 'meta[name="og:image"]')


def meta_description(soup: BeautifulSoup) -> str | None:
    return meta_content(soup, 'meta[name="description"]', 'meta[property="og:description"]')


def sleep_if_needed(seconds: float) -> None:
    if seconds and seconds > 0:
        time.sleep(seconds)
