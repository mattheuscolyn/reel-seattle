"""Eligibility rules for TMDB movie matching."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

from reel_seattle.analysis.film_identity import infer_parent_display_title
from reel_seattle.normalize import normalize_film_title

ELIGIBLE = "eligible"
NON_FILM = "non_film"
AMBIGUOUS_PROGRAM = "ambiguous_program"

_MYSTERY_RE = re.compile(
    r"\bscreen\s+unseen\b|\bscream\s+unseen\b|\bmystery\s+movie\b|"
    r"\bunannounced\b|\bsecret\s+screening\b",
    re.IGNORECASE,
)
_SHORTS_RE = re.compile(
    r"\bshorts?\b|\bshort\s+film\b|\bfilm\s+festival\b|\bfest\b|"
    r"\bcatvideofest\b|\bprograms?\b",
    re.IGNORECASE,
)
_DOUBLE_RE = re.compile(r"\bdouble\s+feature\b", re.IGNORECASE)
_LIVE_RE = re.compile(
    r"\bnt\s*live\b|\bmet\s+opera\b|\blive\s+in\s+(concert|theater)\b|"
    r"\bfathom\b|\bufc\b|\bworld\s+cup\b|\bconcert\b|\bstand[- ]?up\b",
    re.IGNORECASE,
)
_EVENT_RE = re.compile(
    r"\bq\s*&\s*a\b|\btalkback\b|\bpanel\b|\bworkshop\b|\bmeetup\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class EligibilityResult:
    status: str
    reasons: tuple[str, ...]
    search_title: str | None


def normalize_search_title(title: str | None) -> str | None:
    """Conservative search title: display-normalize then strip known variant suffixes."""
    if not title:
        return None
    display = normalize_film_title(title) or str(title).strip()
    if not display:
        return None
    parent = infer_parent_display_title(display) or display
    text = re.sub(r"\s+", " ", parent).strip(" :-")
    return text or None


def classify_eligibility(
    *,
    source_title: str | None,
    screening_variant_type: str | None = None,
    is_special_screening: bool | None = None,
    extra: Mapping[str, Any] | None = None,
) -> EligibilityResult:
    """Decide whether a source identity should be searched on TMDB movies."""
    _ = extra
    title = (source_title or "").strip()
    search = normalize_search_title(title)
    reasons: list[str] = []

    if not search:
        return EligibilityResult(NON_FILM, ("empty_title",), None)

    if _MYSTERY_RE.search(title):
        reasons.append("mystery_or_unannounced")
    if _SHORTS_RE.search(title):
        reasons.append("shorts_or_festival_program")
    if _DOUBLE_RE.search(title):
        reasons.append("double_feature")
    if _LIVE_RE.search(title):
        reasons.append("live_or_broadcast_event")
    if _EVENT_RE.search(title) and len(search.split()) <= 3:
        reasons.append("event_like_title")

    variant = (screening_variant_type or "").strip().casefold()
    if variant in {"fan_event", "mystery", "program", "live_event"}:
        if "mystery_or_unannounced" not in reasons and "screen unseen" in title.casefold():
            reasons.append("mystery_or_unannounced")

    if reasons:
        hard = {
            "mystery_or_unannounced",
            "double_feature",
            "live_or_broadcast_event",
        }
        if hard.intersection(reasons):
            return EligibilityResult(NON_FILM, tuple(sorted(set(reasons))), search)
        return EligibilityResult(AMBIGUOUS_PROGRAM, tuple(sorted(set(reasons))), search)

    return EligibilityResult(ELIGIBLE, (), search)

