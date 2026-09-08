"""Eligibility rules for TMDB movie matching + entity classification."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

from reel_seattle.film_identity.constants import (
    ENTITY_BROADCAST_EVENT,
    ENTITY_COMPOSITE_EVENT,
    ENTITY_DOUBLE_FEATURE,
    ENTITY_FEATURE_FILM,
    ENTITY_FESTIVAL_PROGRAM,
    ENTITY_LIVE_EVENT,
    ENTITY_MYSTERY_SCREENING,
    ENTITY_SHORTS_PROGRAM,
    ENTITY_UNKNOWN_PROGRAM,
)
from reel_seattle.film_identity.presentation import (
    interpret_source_years,
    looks_like_feature_presentation,
    normalize_match_title,
)

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
_BROADCAST_RE = re.compile(r"\bnt\s*live\b|\bmet\s+opera\b|\bfathom\b", re.IGNORECASE)
_EVENT_RE = re.compile(
    r"\bq\s*&\s*a\b|\btalkback\b|\bpanel\b|\bworkshop\b|\bmeetup\b",
    re.IGNORECASE,
)
_ANNIVERSARY_RE = re.compile(r"\d+(?:st|nd|rd|th)\s+anniversary|\banniversary\b", re.I)
_COMPOSITE_SPLIT_RE = re.compile(r"\s+\+\s+")
_COMPOSITE_TOKEN_RE = re.compile(r"[A-Za-z0-9']+")
_COMPOSITE_EVENT_RE = re.compile(
    r"\banniversary\b|\bevent\b|\bdouble\s+feature\b|\bprogram\b|\bmarathon\b",
    re.I,
)
_COMPOSITE_VARIANTS = frozenset(
    {
        "anniversary",
        "anniversary_re_release",
        "special_event",
        "double_feature",
    }
)


@dataclass(frozen=True)
class EligibilityResult:
    status: str
    reasons: tuple[str, ...]
    search_title: str | None
    entity_kind: str = ENTITY_FEATURE_FILM


def normalize_search_title(title: str | None, *, source: str | None = None) -> str | None:
    """Conservative search title with presentation/festival stripping."""
    return normalize_match_title(title, source=source)


def classify_eligibility(
    *,
    source_title: str | None,
    screening_variant_type: str | None = None,
    is_special_screening: bool | None = None,
    extra: Mapping[str, Any] | None = None,
    source: str | None = None,
) -> EligibilityResult:
    """Decide whether a source identity should be searched on TMDB movies."""
    _ = (is_special_screening, extra)
    title = (source_title or "").strip()
    years = interpret_source_years(source_title=title, source=source)
    search = years.base_title or normalize_search_title(title, source=source)
    reasons: list[str] = []

    if not search:
        return EligibilityResult(
            NON_FILM, ("empty_title",), None, ENTITY_UNKNOWN_PROGRAM
        )

    if _MYSTERY_RE.search(title):
        reasons.append("mystery_or_unannounced")
    if _DOUBLE_RE.search(title):
        reasons.append("double_feature")
    if looks_like_composite_program(
        source_title=title,
        search_title=search,
        screening_variant_type=screening_variant_type,
        presentation_labels=years.presentation_labels,
    ):
        reasons.append("composite_title_pair")
    if _LIVE_RE.search(title):
        reasons.append("live_or_broadcast_event")
    if _EVENT_RE.search(title) and len(search.split()) <= 3:
        reasons.append("event_like_title")

    fest_like = bool(_SHORTS_RE.search(title))
    feature_like = looks_like_feature_presentation(title, search)
    anniversary_like = bool(_ANNIVERSARY_RE.search(title))

    if fest_like:
        if feature_like and (anniversary_like or not re.search(r"\bshorts?\b", title, re.I)):
            # Feature film shown under a festival banner (e.g. Ghibli Fest).
            reasons.append("festival_presentation")
        else:
            reasons.append("shorts_or_festival_program")

    variant = (screening_variant_type or "").strip().casefold()
    if variant in {"fan_event", "mystery", "program", "live_event"}:
        if "mystery_or_unannounced" not in reasons and "screen unseen" in title.casefold():
            reasons.append("mystery_or_unannounced")

    entity_kind = _entity_kind(title, reasons, feature_like)

    if reasons:
        hard = {
            "mystery_or_unannounced",
            "double_feature",
            "composite_title_pair",
            "live_or_broadcast_event",
        }
        if hard.intersection(reasons):
            return EligibilityResult(
                NON_FILM, tuple(sorted(set(reasons))), search, entity_kind
            )
        if "shorts_or_festival_program" in reasons and not feature_like:
            return EligibilityResult(
                NON_FILM,
                tuple(sorted(set(reasons) | {"program_entity_not_tmdb_movie"})),
                search,
                entity_kind,
            )
        if "festival_presentation" in reasons and feature_like:
            # Eligible for TMDB movie match; fest wording is presentation only.
            return EligibilityResult(
                ELIGIBLE, tuple(sorted(set(reasons))), search, ENTITY_FEATURE_FILM
            )
        return EligibilityResult(
            AMBIGUOUS_PROGRAM, tuple(sorted(set(reasons))), search, entity_kind
        )

    return EligibilityResult(ELIGIBLE, (), search, ENTITY_FEATURE_FILM)


def _entity_kind(title: str, reasons: list[str], feature_like: bool) -> str:
    if "mystery_or_unannounced" in reasons:
        return ENTITY_MYSTERY_SCREENING
    if "double_feature" in reasons:
        return ENTITY_DOUBLE_FEATURE
    if "composite_title_pair" in reasons:
        return ENTITY_COMPOSITE_EVENT
    if "live_or_broadcast_event" in reasons:
        if _BROADCAST_RE.search(title):
            return ENTITY_BROADCAST_EVENT
        return ENTITY_LIVE_EVENT
    if "shorts_or_festival_program" in reasons:
        if re.search(r"\bshorts?\b|\bshort\s+film\b|\bcatvideofest\b", title, re.I):
            return ENTITY_SHORTS_PROGRAM
        return ENTITY_FESTIVAL_PROGRAM
    if "festival_presentation" in reasons and feature_like:
        return ENTITY_FEATURE_FILM
    if "event_like_title" in reasons:
        return ENTITY_UNKNOWN_PROGRAM
    return ENTITY_FEATURE_FILM


def looks_like_composite_program(
    *,
    source_title: str | None,
    search_title: str | None = None,
    screening_variant_type: str | None = None,
    presentation_labels: tuple[str, ...] | list[str] | None = None,
) -> bool:
    """True for obvious multi-title packages such as ``Title A + Title B``.

    Conservative: requires spaced `` + `` separators that survive search-title
    cleanup, plus two title-like sides. Single-word pairs such as
    ``Thelma + Louise`` stay eligible. Event/anniversary context can confirm a
    pair when only one side has two or more tokens.
    """
    raw = (source_title or "").strip()
    search = (search_title or raw).strip()
    if not raw or not search:
        return False
    parts = [part.strip() for part in _COMPOSITE_SPLIT_RE.split(search) if part.strip()]
    if len(parts) < 2:
        return False

    token_sets = [_composite_tokens(part) for part in parts]
    if any(len(tokens) == 0 for tokens in token_sets):
        return False

    multi_word_sides = sum(1 for tokens in token_sets if len(tokens) >= 2)
    if multi_word_sides >= 2:
        return True

    variant = (screening_variant_type or "").strip().casefold()
    labels = [str(label).casefold() for label in (presentation_labels or ())]
    has_event_context = (
        variant in _COMPOSITE_VARIANTS
        or bool(_COMPOSITE_EVENT_RE.search(raw))
        or any("anniversary" in label or "event" in label for label in labels)
    )
    return has_event_context and multi_word_sides >= 1


def _composite_tokens(text: str) -> list[str]:
    return [token for token in _COMPOSITE_TOKEN_RE.findall(text) if token]
