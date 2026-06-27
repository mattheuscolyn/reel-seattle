"""Film title display normalization and deterministic film keys.

Display titles preserve theater-facing punctuation and most casing. Film keys
(``showtime_film_key``) are stable slugs used for deduplication until
authority-backed ``film_id`` values exist in Phase 3.

This module does not perform fuzzy matching, TMDB lookup, or cross-theater
unification beyond exact key rules.
"""

from __future__ import annotations

import re
from typing import Any

from reel_seattle.normalize.values import collapse_whitespace, normalize_optional_string

_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_ARTICLE_PREFIX_RE = re.compile(r"^(the|a|an)\s+")

# Minimum length for ALL-CAPS → title case conversion.
_ALL_CAPS_MIN_LEN = 4


def normalize_film_title(value: Any) -> str | None:
    """Normalize a film title for display.

    Steps: strip, collapse whitespace, and convert all-caps titles longer than
    four characters to title case. Intentional punctuation (``:``, ``*``, etc.)
    is preserved.
    """
    text = normalize_optional_string(value)
    if text is None:
        return None

    if (
        len(text) > _ALL_CAPS_MIN_LEN
        and any(char.isalpha() for char in text)
        and text == text.upper()
    ):
        text = text.title()

    return text


def extract_year_hint(value: Any) -> int | None:
    """Extract the first four-digit year (19xx or 20xx) from *value*, if any."""
    text = normalize_optional_string(value)
    if text is None:
        return None
    match = _YEAR_RE.search(text)
    if match is None:
        return None
    return int(match.group(1))


def _slugify_for_key(text: str) -> str:
    lowered = text.casefold()
    # Remove leading articles for keys only.
    lowered = _ARTICLE_PREFIX_RE.sub("", lowered)
    slug = _NON_ALNUM_RE.sub("-", lowered).strip("-")
    return slug


def showtime_film_key(title: Any, *, year: int | None = None) -> str | None:
    """Derive a deterministic ``showtime_film_key`` from a display title.

    Parameters
    ----------
    title:
        Raw or display-normalized film title.
    year:
        Optional release year appended as ``-YYYY`` when confidently known.

    Returns
    -------
    str | None
        Kebab-case key such as ``sinners`` or ``sinners-2025``, or ``None`` if
        the title is empty after normalization.
    """
    display = normalize_film_title(title)
    if display is None:
        return None

    slug = _slugify_for_key(display)
    if not slug:
        return None

    resolved_year = year if year is not None else extract_year_hint(display)
    if resolved_year is not None:
        year_suffix = f"-{resolved_year}"
        if not slug.endswith(year_suffix):
            return f"{slug}{year_suffix}"
    return slug
