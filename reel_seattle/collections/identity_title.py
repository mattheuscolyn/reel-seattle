"""Safe identity-title derivation from explicit collection membership.

Never strip a generic colon. Only known collection titles/aliases may be removed.
"""

from __future__ import annotations

import re
from typing import Sequence

from reel_seattle.film_identity.presentation import extract_match_title

_SEP = r"\s*[:–—-]\s*"
_PRESENTS_SEP = rf"(?:{_SEP}|\s+)"


def collection_prefix_candidates(
    title: str | None,
    aliases: Sequence[str] | None = None,
) -> tuple[str, ...]:
    """Conservative prefixes: collection title plus explicit aliases only."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in (title, *(aliases or ())):
        text = (raw or "").strip()
        if not text:
            continue
        folded = text.casefold()
        if folded in seen:
            continue
        seen.add(folded)
        out.append(text)
        # If the formal title itself has a colon, the leading clause may be the
        # abbreviated series brand ("SFCS at 10: A Decade of Favorites").
        for sep in (": ", " — ", " – ", " - "):
            if sep in text:
                head = text.split(sep, 1)[0].strip()
                if head and len(head) >= 4 and head.casefold() not in seen:
                    seen.add(head.casefold())
                    out.append(head)
                break
    return tuple(out)


def derive_shared_member_prefix(
    collection_title: str,
    member_titles: Sequence[str],
    *,
    min_members: int = 2,
) -> str | None:
    """If 2+ explicit members share a leading brand that is part of the collection title."""
    title = (collection_title or "").strip()
    if not title:
        return None
    candidates = collection_prefix_candidates(title)
    counts: dict[str, int] = {prefix: 0 for prefix in candidates}
    for member in member_titles:
        text = (member or "").strip()
        if not text:
            continue
        for prefix in candidates:
            if _prefix_match(text, prefix) is not None:
                counts[prefix] += 1
    best = None
    best_count = 0
    for prefix, count in counts.items():
        if count < min_members:
            continue
        if count > best_count or (
            count == best_count and best is not None and len(prefix) < len(best)
        ):
            best = prefix
            best_count = count
    if best and best.casefold() != title.casefold():
        return best
    return None


def strip_known_collection_prefix(raw_title: str | None, prefixes: Sequence[str]) -> str | None:
    """Return remainder after a known prefix, or None if no known prefix matched."""
    text = (raw_title or "").strip()
    if not text or not prefixes:
        return None
    ordered = sorted({p.strip() for p in prefixes if p and p.strip()}, key=len, reverse=True)
    for prefix in ordered:
        remainder = _prefix_match(text, prefix)
        if remainder:
            return remainder
    return None


def identity_title_candidate(
    raw_title: str | None,
    *,
    prefixes: Sequence[str],
    source: str | None = None,
) -> str | None:
    """Preferred TMDB/search title after evidence-based prefix + format cleanup."""
    remainder = strip_known_collection_prefix(raw_title, prefixes)
    if remainder is None:
        return None
    extracted = extract_match_title(remainder, source=source)
    return extracted.base_title or remainder


def _prefix_match(title: str, prefix: str) -> str | None:
    separator = _PRESENTS_SEP if prefix.casefold().rstrip().endswith("presents") else _SEP
    pattern = re.compile(
        rf"^{re.escape(prefix)}{separator}(?P<body>.+)$",
        re.IGNORECASE,
    )
    match = pattern.match(title.strip())
    if not match:
        return None
    body = match.group("body").strip()
    return body or None
