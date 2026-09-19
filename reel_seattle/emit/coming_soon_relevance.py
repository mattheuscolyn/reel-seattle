"""Seattle relevance tiers and film-calendar eligibility for Coming Soon.

``classification`` remains the pipeline/source label (confirmed_local,
amc_announced, tmdb_only). ``relevance_tier`` is the Seattle-relevance answer
that drives public film-calendar visibility.

strongly_expected is an explicit *proxy*: AMC national catalog membership plus
TMDB US theatrical evidence for an underlying film. It is not proven Seattle
availability.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.film_identity import infer_parent_display_title
from reel_seattle.emit.coming_soon_presentation import (
    EXCLUSION_OPERATIONAL,
    EXCLUSION_PLACEHOLDER,
    EXCLUSION_RENTAL,
    KIND_EVENT,
    KIND_FILM,
    KIND_MYSTERY,
    KIND_OTHER,
    KIND_RERELEASE,
)
from reel_seattle.normalize import normalize_film_title

RELEVANCE_CONFIRMED_LOCAL = "confirmed_local"
RELEVANCE_LOCALLY_ANNOUNCED = "locally_announced"
RELEVANCE_STRONGLY_EXPECTED = "strongly_expected"
RELEVANCE_WEAK_NATIONAL_ONLY = "weak_national_only"

PUBLIC_RELEVANCE_TIERS = frozenset(
    {
        RELEVANCE_CONFIRMED_LOCAL,
        RELEVANCE_LOCALLY_ANNOUNCED,
        RELEVANCE_STRONGLY_EXPECTED,
    }
)

RELEVANCE_SORT_RANK = {
    RELEVANCE_CONFIRMED_LOCAL: 0,
    RELEVANCE_LOCALLY_ANNOUNCED: 1,
    RELEVANCE_STRONGLY_EXPECTED: 2,
    RELEVANCE_WEAK_NATIONAL_ONLY: 3,
}

# Film-calendar presentation kinds that may become public (when relevance allows).
FILM_CALENDAR_KINDS = frozenset({KIND_FILM, KIND_RERELEASE, KIND_OTHER})

VISIBILITY_TMDB_ONLY = "tmdb_only_analysis_only"
VISIBILITY_WEAK_NATIONAL = "weak_national_only"
VISIBILITY_SPECIAL_PROGRAMMING = "special_programming_not_film_calendar"
VISIBILITY_PRESENTATION_FILTER = "presentation_filter"
VISIBILITY_NOT_FILM_KIND = "non_film_presentation_kind"

ENGAGEMENT_Q_AND_A = "q_and_a"
ENGAGEMENT_EARLY_ACCESS = "early_access"
ENGAGEMENT_FAN_FIRST = "fan_first"
ENGAGEMENT_FAN_EVENT = "fan_event"
ENGAGEMENT_SPECIAL_SCREENING = "special_screening"
ENGAGEMENT_OTHER = "other_engagement"

_ENGAGEMENT_KIND_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)\bearly\s+access\b"), ENGAGEMENT_EARLY_ACCESS),
    (re.compile(r"(?i)\bfan\s+first\b"), ENGAGEMENT_FAN_FIRST),
    (re.compile(r"(?i)\bfan\s+event\b"), ENGAGEMENT_FAN_EVENT),
    (re.compile(r"(?i)(?:live\s+)?q\s*&\s*a|q\s*and\s*a"), ENGAGEMENT_Q_AND_A),
    (
        re.compile(r"(?i)\bspecial\s+(?:screening|presentation|event)\b"),
        ENGAGEMENT_SPECIAL_SCREENING,
    ),
)

# Non-film / non-Seattle programming that must not appear as ordinary Coming Soon films.
_SPECIAL_PROGRAMMING_TITLE_RE = re.compile(
    r"(?i)(?:"
    r"\bmet\s+opera\b|"
    r"\bnt\s+live\b|"
    r"\bufc\b|"
    r"\bwwe\b|"
    r"ohio\s+goes\s+to\s+the\s+movies|"
    r"welcome\s+to\s+horrorwood|"
    r"\bscreen\s+unseen\b|"
    r"\bscream\s+unseen\b|"
    r"mystery\s+(?:movie|screening)|"
    r"\bvr\s+concert\b|"
    r"\blive\s+viewing\b|"
    r"\blive\s+in\s+imax\b|"
    r"\bin\s+cinemas\b.*\bconcert\b|"
    r"\bconcert\b.*\bin\s+cinemas\b|"
    r"f1\s+on\s+apple\s+tv|"
    r"victoria'?s\s+secret\s+fashion\s+show|"
    r"sight\s*&\s*sound\s+presents"
    r")"
)

# AMC genres that indicate alternative content even when the title is plain.
_NON_FILM_AMC_GENRE_RE = re.compile(
    r"(?i)\b(?:"
    r"concert|opera|theatre|theater|rock\s*/\s*pop|"
    r"wrestling|wwe|ufc|sports?|live\s*entertainment"
    r")\b"
)

# Promotional wrappers that still leave a deterministic base film title.
_PROMO_FAN_EVENT_RE = re.compile(
    r"(?i)^(?:Blumhouse\s+Presents:\s*)?(.+?)\s+Fan\s+Event(?:\s+Screening)?\s*$"
)
_FAN_FIRST_RE = re.compile(r"(?i)^(.+?)\s+Fan\s+First(?:\s+Screening)?\s*$")
_EARLY_ACCESS_RE = re.compile(
    r"(?i)^(.+?)\s+Early\s+Access(?:\s+with\b.*)?\s*$"
)
_FEATURING_QA_RE = re.compile(
    r"(?i)^(.+?)\s+featuring\s+(?:LIVE\s+)?Q\s*&\s*A\b.*$"
)
_PLUS_QA_RE = re.compile(
    r"(?i)^(.+?)\s*\+\s*Special\s+In-Person\s+Q\s*&\s*A\b.*$"
)


def is_engagement_title(title: str) -> bool:
    """True when *title* looks like a screening/event SKU of a film."""
    text = normalize_film_title(title) or str(title or "").strip()
    if not text:
        return False
    if infer_engagement_kind(text) is not None:
        return True
    parent = infer_parent_display_title(text)
    return bool(parent and parent.casefold() != text.casefold())


def infer_engagement_kind(title: str) -> str | None:
    text = normalize_film_title(title) or str(title or "").strip()
    if not text:
        return None
    for pattern, kind in _ENGAGEMENT_KIND_PATTERNS:
        if pattern.search(text):
            return kind
    return None


# Delimited suffix split — mirrors coming_soon.strip_event_suffix without a
# circular import on the emit package.
_EVENT_SUFFIX_PATTERN = re.compile(
    r"(?:"
    r"q\s*&\s*a|q\s*and\s*a|fan\s*event|fan\s*first|early\s*access|"
    r"opening\s*night|premiere\s*event|sneak\s*peek|advance\s*screening|"
    r"sing[-\s]?along|encore|marathon|double\s*feature|triple\s*feature|"
    r"anniversary|re[-\s]?release|special\s*(?:screening|presentation|event)|"
    r"live\s*(?:in\s*concert|event|stream)|presented\s*by|with\s*director|"
    r"screen\s*unseen|scream\s*unseen|mystery\s*(?:movie|screening)|"
    r"private\s*theat(?:re|er)\s*rental|insider\s*screening"
    r")",
    re.IGNORECASE,
)
_SUFFIX_SPLIT_PATTERN = re.compile(
    r"\s+[-\u2013\u2014]\s+|\s*:\s+|\s*\(|\s*\u2013\s*"
)


def _strip_delimited_event_suffix(title: str) -> str | None:
    text = normalize_film_title(title) or str(title or "").strip()
    if not text:
        return None
    for match in _SUFFIX_SPLIT_PATTERN.finditer(text):
        head = text[: match.start()].strip()
        tail = text[match.end() :].strip()
        if head and tail and _EVENT_SUFFIX_PATTERN.match(tail):
            return head
    return None


def infer_engagement_base_title(title: str) -> str | None:
    """Deterministically strip a recognized engagement SKU to a base film title.

    Returns None when the title does not match a known engagement pattern.
    Does not invent catalog membership or identifiers.
    """
    text = normalize_film_title(title) or str(title or "").strip()
    if not text:
        return None

    for pattern in (
        _PROMO_FAN_EVENT_RE,
        _FAN_FIRST_RE,
        _EARLY_ACCESS_RE,
        _FEATURING_QA_RE,
        _PLUS_QA_RE,
    ):
        match = pattern.match(text)
        if match:
            base = match.group(1).strip(" :-\u2013\u2014")
            if base and base.casefold() != text.casefold():
                return base

    delimited = _strip_delimited_event_suffix(text)
    if delimited and delimited.casefold() != text.casefold():
        return delimited

    parent = infer_parent_display_title(text)
    if parent and parent.casefold() != text.casefold() and infer_engagement_kind(text):
        return parent
    return None


def is_special_programming(
    title: str,
    *,
    presentation_kind: str | None = None,
    amc_presentation_category: str | None = None,
    amc_genre: str | None = None,
    variant_titles: Sequence[str] = (),
) -> bool:
    """True for non-film / non-local series products kept off the film calendar.

    AMC ``concert_or_event`` alone is not enough: many Seattle-booked films are
    miscategorized that way. Require a title pattern (MET Opera, WWE, branded
    regional series, live concert viewing, …) or a non-film AMC genre.
    """
    kind = str(presentation_kind or "")
    if kind == KIND_MYSTERY:
        return True
    category = str(amc_presentation_category or "")
    if category == "mystery_screening":
        return True

    samples = [title, *variant_titles]
    for sample in samples:
        if sample and _SPECIAL_PROGRAMMING_TITLE_RE.search(sample):
            return True

    # Engagement SKUs (Q&A / fan / early access) are film calendar material.
    if infer_engagement_kind(title):
        return False

    if category == "concert_or_event" and _NON_FILM_AMC_GENRE_RE.search(
        str(amc_genre or "")
    ):
        return True
    return False


def is_film_calendar_kind(kind: str) -> bool:
    return kind in FILM_CALENDAR_KINDS


def assign_relevance_and_visibility(
    *,
    classification: str,
    presentation_kind: str,
    exclusion_reason: str | None,
    evidence: Mapping[str, Any],
    title: str,
    amc_presentation_category: str | None = None,
    amc_genre: str | None = None,
    variant_titles: Sequence[str] = (),
) -> tuple[str | None, bool, str | None]:
    """Return ``(relevance_tier, user_visible, visibility_reason)``.

    ``classification`` is unchanged pipeline state. Public film-calendar rows
    require a public relevance tier and no presentation/special-programming block.
    """
    if exclusion_reason in {
        EXCLUSION_RENTAL,
        EXCLUSION_PLACEHOLDER,
        EXCLUSION_OPERATIONAL,
    }:
        tier = (
            RELEVANCE_CONFIRMED_LOCAL
            if classification == "confirmed_local"
            else RELEVANCE_WEAK_NATIONAL_ONLY
            if classification == "amc_announced"
            else None
        )
        return tier, False, exclusion_reason or VISIBILITY_PRESENTATION_FILTER

    if classification == "tmdb_only":
        return None, False, VISIBILITY_TMDB_ONLY

    special = is_special_programming(
        title,
        presentation_kind=presentation_kind,
        amc_presentation_category=amc_presentation_category,
        amc_genre=amc_genre,
        variant_titles=variant_titles,
    )
    if special:
        tier = (
            RELEVANCE_CONFIRMED_LOCAL
            if classification == "confirmed_local"
            else RELEVANCE_WEAK_NATIONAL_ONLY
        )
        return tier, False, VISIBILITY_SPECIAL_PROGRAMMING

    if not is_film_calendar_kind(presentation_kind):
        # Standalone event/mystery kinds that were not folded into a film.
        tier = (
            RELEVANCE_CONFIRMED_LOCAL
            if classification == "confirmed_local"
            else RELEVANCE_WEAK_NATIONAL_ONLY
            if classification == "amc_announced"
            else None
        )
        return tier, False, VISIBILITY_NOT_FILM_KIND

    if classification == "confirmed_local":
        return RELEVANCE_CONFIRMED_LOCAL, True, None

    if classification == "amc_announced":
        # strongly_expected proxy: national AMC catalog + TMDB US theatrical
        # for an underlying film. Not proven Seattle availability.
        if evidence.get("amc_coming_soon_catalog") and evidence.get(
            "tmdb_us_theatrical"
        ):
            return RELEVANCE_STRONGLY_EXPECTED, True, None
        return RELEVANCE_WEAK_NATIONAL_ONLY, False, VISIBILITY_WEAK_NATIONAL

    return None, False, "unclassified"


def build_engagement_record(
    *,
    title: str,
    amc_movie_ids: Sequence[str] = (),
    kind: str | None = None,
) -> dict[str, Any]:
    engagement_kind = kind or infer_engagement_kind(title) or ENGAGEMENT_OTHER
    amc_id = None
    ids = [str(value).strip() for value in amc_movie_ids if str(value).strip()]
    if ids:
        amc_id = sorted(ids, key=lambda value: (len(value), value))[0]
    return {
        "kind": engagement_kind,
        "title": title,
        "amc_movie_id": amc_id,
    }
