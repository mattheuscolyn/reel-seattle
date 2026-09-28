"""Allowlisted Anderson School title suffixes.

Only a terminal open-caption marker is removed from the identity title.
Other parentheticals stay on the title.
"""

from __future__ import annotations

import re

from reel_seattle.ingestion.independent_contract import normalize_exact_source_title

# Terminal only. Mid-title "OCAP" and other parentheticals are not suffixes.
_SUFFIXES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\s*\(\s*OCAP\s*\)\s*$", re.IGNORECASE), "(OCAP)"),
    (re.compile(r"\s*\(\s*open\s+captions?\s*\)\s*$", re.IGNORECASE), "(open captions)"),
    (re.compile(r"\s+OCAP\s*$", re.IGNORECASE), "OCAP"),
)


def normalize_anderson_title(source_title: str) -> tuple[str, str | None]:
    """Return ``(identity_title, matched_suffix)``.

    ``matched_suffix`` is ``None`` when the title is unchanged.
    """
    title = normalize_exact_source_title(source_title)
    for pattern, label in _SUFFIXES:
        if pattern.search(title):
            cleaned = normalize_exact_source_title(pattern.sub("", title))
            if cleaned and cleaned != title:
                return cleaned, label
    return title, None
