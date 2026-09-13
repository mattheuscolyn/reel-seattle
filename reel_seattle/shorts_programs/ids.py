"""Stable ShortsProgram / Short / membership identifiers."""

from __future__ import annotations

import re


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify_token(value: str) -> str | None:
    text = (value or "").strip().casefold()
    if not text:
        return None
    text = _SLUG_RE.sub("-", text).strip("-")
    return text or None


def shorts_program_id(*, source: str, source_film_id: str) -> str:
    src = (source or "").strip().casefold()
    sid = (source_film_id or "").strip().strip("/").casefold()
    sid = sid.replace("_", "-")
    sid = re.sub(r"[^a-z0-9:./-]+", "-", sid).strip("-")
    if not src or not sid:
        raise ValueError("shorts_program_id requires source and source_film_id")
    return f"{src}:program:{sid}"


def listing_key(*, source: str, source_film_id: str) -> str:
    src = (source or "").strip().casefold()
    sid = (source_film_id or "").strip()
    if not src or not sid:
        raise ValueError("listing_key requires source and source_film_id")
    return f"{src}|id|{sid}"


def program_scoped_short_id(
    *,
    source: str,
    program_source_film_id: str,
    title: str,
) -> str:
    """Default conservative Short id: scoped to the program listing.

    Title alone is never used as a global identity.
    """
    src = (source or "").strip().casefold()
    program = (program_source_film_id or "").strip().strip("/").casefold()
    title_slug = slugify_token(title) or "untitled"
    if not src or not program:
        raise ValueError("program_scoped_short_id requires source and program id")
    return f"{src}:short:{program}:{title_slug}"


def merged_short_id(
    *,
    source: str,
    title: str,
    year: int | None,
) -> str:
    """Strong-evidence reusable Short id when year is known."""
    src = (source or "").strip().casefold()
    title_slug = slugify_token(title) or "untitled"
    if year is None:
        raise ValueError("merged_short_id requires year")
    return f"{src}:short:{title_slug}:{year}"


def membership_id(*, shorts_program_id: str, short_id: str) -> str:
    return f"{shorts_program_id}|{short_id}"
