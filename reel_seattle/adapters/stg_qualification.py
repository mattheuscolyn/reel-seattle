"""Deterministic STG film-screening qualification.

Genre=Film is not sufficient. Ambiguous events are neither accepted nor
silently dropped; callers record a rejected observation.
"""

from __future__ import annotations

import re
from typing import Literal

Decision = Literal["accept", "deny", "ambiguous"]

_SERIES_RE = re.compile(
    r"^Silent Movie Mondays\s*[:\u2013\u2014\-]\s*(?P<remainder>.+)$",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"^(?P<title>.+?)\s*\((?P<year>(?:19|20)\d{2})\)\s*$")
_NON_FILM_REMAINDER_RE = re.compile(
    r"\b(conversation|panel|talk|lecture|workshop|concert|musical|q\s*&\s*a)\b",
    re.IGNORECASE,
)
# Exhibition language only. A biography that says a concert film "screened"
# somewhere else, or that merely mentions "the film", is not this event.
_SCREENING_RE = re.compile(
    r"("
    r"\bscreenings?\b|"
    r"\bon the big screen\b|"
    r"\bbig-screen presentation\b|"
    r"\bpresentation of the film\b|"
    r"\bprojected on\b|"
    r"\bcinema screen\b|"
    r"\b(?:the )?film (?:is shown|plays)\b|"
    r"\bas the film plays\b|"
    r"\bfeature film\b|"
    r"\bfilm screening\b|"
    r"\bdcp\b|"
    r"\b35\s*mm\b|"
    r"\b16\s*mm\b"
    r")",
    re.IGNORECASE,
)
_DENY_RE = re.compile(
    r"("
    r"\bsoundtrack\b|\bsongs from\b|\bmusic from the film\b|\bperforms the score\b|"
    r"\bscore concert\b|\bconcert\b|\blecture\b|\bdemonstration\b|\bpanel\b|\btalks?\b|"
    r"\bq\s*&\s*a\b|\bstage production\b|\bbroadway\b|\bmusical\b|"
    r"\bworkshop\b|\bclass\b|\bcamp\b"
    r")",
    re.IGNORECASE,
)
_GENERIC_TITLE_RE = re.compile(r"^(film|films|movie|movies|event|events)$", re.IGNORECASE)


def split_stg_title(source_title: str) -> tuple[str, int | None, str | None]:
    """Return ``(identity_title, year, series)``.

    Strips a Silent Movie Mondays prefix and one trailing ``(YYYY)`` only.
    ``(Part II)`` and other non-year parentheticals stay in the identity title.
    """
    title = re.sub(r"\s+", " ", source_title.replace("\u00a0", " ")).strip()
    series = None
    remainder = title
    match = _SERIES_RE.match(remainder)
    if match:
        series = "Silent Movie Mondays"
        remainder = match.group("remainder").strip()
    year = None
    year_match = _YEAR_RE.match(remainder)
    if year_match:
        year = int(year_match.group("year"))
        remainder = year_match.group("title").strip()
    identity = remainder or title
    return identity, year, series


def _identifiable_film_title(identity: str) -> bool:
    text = identity.strip()
    if len(re.sub(r"[^A-Za-z0-9]", "", text)) < 2:
        return False
    return _GENERIC_TITLE_RE.match(text) is None


def _has_screening(text: str) -> bool:
    for match in _SCREENING_RE.finditer(text):
        prefix = text[max(0, match.start() - 16) : match.start()]
        if re.search(r"\b(no|not|without)\s*$", prefix, re.IGNORECASE):
            continue
        return True
    return False


def qualify_stg_event(source_title: str, body_text: str) -> tuple[Decision, str]:
    """Return ``(accept|deny|ambiguous, reason)`` for one event's title and text."""
    identity, _year, series = split_stg_title(source_title)
    haystack = f"{source_title}\n{body_text}"
    screening = _has_screening(haystack)
    film_like_series = (
        series == "Silent Movie Mondays"
        and _identifiable_film_title(identity)
        and _NON_FILM_REMAINDER_RE.search(identity) is None
    )

    if film_like_series:
        return "accept", "silent_movie_mondays_film"
    if screening and _identifiable_film_title(identity):
        return "accept", "explicit_screening"
    if _DENY_RE.search(haystack):
        return "deny", "non_screening_event"
    return "ambiguous", "insufficient_screening_evidence"
