"""Product Special Events classifier (screening/performance grain).

This module is the authoritative production classifier for Explore → Special
Events. It is intentionally narrower than ``special_screening_flags`` /
``is_strict_event_like``, which serve leaving-soon / identity analysis and
intentionally over-match anniversary, language, anime, and legacy ``vs.`` titles.

A film must never become globally "special" because one of its showtimes has a
Q&A. Classification is always performance/screening-level.

Format / accessibility / language tags remain orthogonal: a Dolby Q&A is both
Dolby (``format_tags``) and a special event (``special_event``).
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

SCHEMA_VERSION = "1.0.0"
METHOD_NAME = "screening_event_explicit_v1"
METHOD_VERSION = "1.0.0"

CONFIDENCE_HIGH = "high"
CONFIDENCE_MEDIUM = "medium"
CONFIDENCE_LOW = "low"

# Published Explore Special Events types.
TYPE_Q_AND_A = "q_and_a"
TYPE_INTRO_OR_DISCUSSION = "intro_or_discussion"
TYPE_EARLY_ACCESS = "early_access"
TYPE_SNEAK_PREVIEW = "sneak_preview"
TYPE_OPENING_NIGHT = "opening_night"
TYPE_FAN_EVENT = "fan_event"
TYPE_MYSTERY_SCREENING = "mystery_screening"
TYPE_SPECIAL_PRESENTATION = "special_presentation"
TYPE_OTHER_EVENT = "other_event"

PUBLISHED_TYPES = (
    TYPE_Q_AND_A,
    TYPE_INTRO_OR_DISCUSSION,
    TYPE_EARLY_ACCESS,
    TYPE_SNEAK_PREVIEW,
    TYPE_OPENING_NIGHT,
    TYPE_FAN_EVENT,
    TYPE_MYSTERY_SCREENING,
    TYPE_SPECIAL_PRESENTATION,
    TYPE_OTHER_EVENT,
)

# Audit-only signals — not published as Explore Special Events by themselves.
AUDIT_CONCERT_OR_EVENT_CINEMA = "concert_or_event_cinema"
AUDIT_DOUBLE_FEATURE = "double_feature"
AUDIT_SING_ALONG = "sing_along"
AUDIT_GENERIC_EVENT_CODE = "generic_event_attribute"
AUDIT_ANNIVERSARY_ONLY = "anniversary_only"
AUDIT_AMBIGUOUS = "ambiguous_wording"

# AMC attribute codes that are high-confidence product event markers.
# Generic ``EVENT`` alone is NOT enough (concerts / alternative content share it).
_HIGH_ATTR_CODES: dict[str, str] = {
    "INPERSNQA": TYPE_Q_AND_A,
    "QANDA": TYPE_Q_AND_A,
    "QA": TYPE_Q_AND_A,
    "FANEVENT": TYPE_FAN_EVENT,
    "EARLYACCESS": TYPE_EARLY_ACCESS,
    "SCREENUNSEEN": TYPE_MYSTERY_SCREENING,
    "SCREAMUNSEEN": TYPE_MYSTERY_SCREENING,
}

# Title patterns — first match order within a multi-type scan collects all hits.
_TITLE_TYPE_PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        TYPE_Q_AND_A,
        re.compile(
            r"(?:"
            r"q\s*&\s*a|q\s*and\s*a|\bq\s*a\b|"
            r"with\s+(?:the\s+)?(?:director|filmmaker|cast|guest|actor|actress)\b|"
            r"in[\s-]?person\s+(?:q|appearance)|"
            r"cast\s+member\s+q|"
            r"live\s+q"
            r")",
            re.IGNORECASE,
        ),
        "title_q_and_a",
    ),
    (
        TYPE_INTRO_OR_DISCUSSION,
        re.compile(
            r"(?:"
            r"special\s+introduction|introduction\s+with|intro\s+with|"
            r"\bpanel\b|\bdiscussion\b|"
            r"followed\s+by\s+(?:a\s+)?(?:conversation|discussion|intro)"
            r")",
            re.IGNORECASE,
        ),
        "title_intro_or_discussion",
    ),
    (
        TYPE_EARLY_ACCESS,
        re.compile(r"early\s+access|advance\s+screening", re.IGNORECASE),
        "title_early_access",
    ),
    (
        TYPE_SNEAK_PREVIEW,
        re.compile(r"sneak\s+(?:peek|preview)|sneak\s*peek", re.IGNORECASE),
        "title_sneak_preview",
    ),
    (
        TYPE_OPENING_NIGHT,
        re.compile(
            r"opening\s+night(?:\s+(?:event|fan\s+event|screening))?|"
            r"premiere\s+event",
            re.IGNORECASE,
        ),
        "title_opening_night",
    ),
    (
        TYPE_FAN_EVENT,
        re.compile(
            r"fan\s+(?:event|first(?:\s+screening)?)|fan[\s-]?first",
            re.IGNORECASE,
        ),
        "title_fan_event",
    ),
    (
        TYPE_MYSTERY_SCREENING,
        re.compile(
            r"screen\s+unseen|scream\s+unseen|"
            r"mystery\s+(?:movie|screening)|secret\s+screening",
            re.IGNORECASE,
        ),
        "title_mystery_screening",
    ),
    (
        TYPE_SPECIAL_PRESENTATION,
        re.compile(
            r"special\s+screening|special\s+presentation|"
            r"special\s+in[\s-]?person",
            re.IGNORECASE,
        ),
        "title_special_presentation",
    ),
    (
        TYPE_OTHER_EVENT,
        re.compile(
            r"community\s+screening|one[\s-]?night\s+(?:only\s+)?(?:screening|event)",
            re.IGNORECASE,
        ),
        "title_other_event",
    ),
)

_AUDIT_TITLE_PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        AUDIT_SING_ALONG,
        re.compile(r"sing[\s-]?along", re.IGNORECASE),
        "title_sing_along",
    ),
    (
        AUDIT_DOUBLE_FEATURE,
        re.compile(r"double\s+feature|triple\s+feature|marathon", re.IGNORECASE),
        "title_double_feature_or_marathon",
    ),
    (
        AUDIT_CONCERT_OR_EVENT_CINEMA,
        re.compile(
            r"(?:"
            r"\bmet\s+opera\b|\bnt\s+live\b|\bfathom\b|"
            r"live\s+in\s+concert|live\s+on\s+stage|"
            r"\bopera\b|\bballet\b|\bconcert\b|\bufc\b|\bwwe\b"
            r")",
            re.IGNORECASE,
        ),
        "title_concert_or_event_cinema",
    ),
    (
        AUDIT_ANNIVERSARY_ONLY,
        re.compile(
            r"\d+(?:st|nd|rd|th)\s+anniversary|anniversary\s+(?:screening|remaster)|"
            r"\bre[\s-]?release\b|\bremaster(?:ed)?\b",
            re.IGNORECASE,
        ),
        "title_anniversary_or_rerelease",
    ),
)

# Phrases that look like "event" but are ordinary product / rerelease labels.
_FALSE_EVENT_TITLE = re.compile(
    r"\(\s*\d{4}\s+event\s*\)|\b\d{4}\s+event\b",
    re.IGNORECASE,
)

_LABEL_SEGMENT = re.compile(
    r"(?:"
    r"early\s+access(?:\s+screening)?(?:\s+with\s+[^-\|:]+)?"
    r"|opening\s+night(?:\s+(?:event|fan\s+event))?"
    r"|fan\s+(?:event|first(?:\s+screening)?)"
    r"|sneak\s+(?:peek|preview)(?:\s*[-–—:].+)?"
    r"|screen\s+unseen(?:\s*:\s*[^|\n]+)?"
    r"|scream\s+unseen(?:\s*:\s*[^|\n]+)?"
    r"|special\s+(?:screening|presentation|introduction)(?:\s*\+\s*q\s*&\s*a)?"
    r"|q\s*&\s*a(?:\s+with\s+[^-|:]+)?"
    r"|q\s*and\s*a(?:\s+with\s+[^-|:]+)?"
    r"|with\s+(?:the\s+)?(?:director|filmmaker|cast|guest|actor)[^-|:]*"
    r"|community\s+screening"
    r"|one[\s-]?night\s+(?:only\s+)?(?:screening|event)"
    r")",
    re.IGNORECASE,
)


def empty_special_event() -> dict[str, Any]:
    """Stable non-event payload for every showtime row."""
    return {
        "is_special_event": False,
        "types": [],
        "labels": [],
        "confidence": None,
        "evidence": [],
    }


def _normalize_codes(attribute_codes: Sequence[str] | None) -> list[str]:
    out: list[str] = []
    for code in attribute_codes or ():
        text = str(code or "").strip().upper()
        if text:
            out.append(text)
    return out


def _extract_codes_from_amc_attributes(amc_attributes: Sequence[Mapping[str, Any]] | None) -> list[str]:
    codes: list[str] = []
    for item in amc_attributes or ():
        if isinstance(item, Mapping) and item.get("code") not in (None, ""):
            codes.append(str(item["code"]).strip().upper())
    return codes


def _collect_text_blobs(
    *,
    title: str | None,
    source_title: str | None,
    description: str | None,
    event_text: str | None,
) -> str:
    parts = [
        str(source_title or "").strip(),
        str(title or "").strip(),
        str(description or "").strip(),
        str(event_text or "").strip(),
    ]
    # Prefer source_title first but keep unique joined blob for matching.
    seen: set[str] = set()
    ordered: list[str] = []
    for part in parts:
        key = part.casefold()
        if part and key not in seen:
            seen.add(key)
            ordered.append(part)
    return "\n".join(ordered)


def _extract_labels(blob: str) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for match in _LABEL_SEGMENT.finditer(blob):
        label = re.sub(r"\s+", " ", match.group(0)).strip(" -–—:")
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        labels.append(label)
    return labels


def _title_case_label(text: str) -> str:
    """Light title-case for evidence snippets without shouting acronyms."""
    cleaned = re.sub(r"\s+", " ", text).strip(" -–—:")
    if not cleaned:
        return cleaned
    parts: list[str] = []
    for word in cleaned.split(" "):
        upper = word.upper()
        if upper in {"Q&A", "QA"} or upper.replace(".", "") == "QA":
            parts.append("Q&A")
        elif word.casefold() in {"imax", "3d"}:
            parts.append(upper)
        else:
            parts.append(word[:1].upper() + word[1:] if word else word)
    return " ".join(parts)


def _labels_from_evidence(
    evidence: Sequence[Mapping[str, Any]], types: Sequence[str]
) -> list[str]:
    """Build display labels from high-confidence evidence details."""
    generic = {_human_label(t).casefold() for t in types}
    type_folds = {t.replace("_", " ").casefold() for t in types}
    labels: list[str] = []
    seen: set[str] = set()
    for item in evidence:
        if not isinstance(item, Mapping):
            continue
        if item.get("confidence") != CONFIDENCE_HIGH:
            continue
        if item.get("kind") == "orthogonal_format_tags":
            continue
        detail = item.get("detail")
        if not isinstance(detail, str):
            continue
        label = _title_case_label(detail)
        if not label:
            continue
        key = label.casefold()
        if key in seen or key in generic or key in type_folds:
            continue
        seen.add(key)
        labels.append(label)
    return labels


def classify_special_event(
    *,
    title: str | None = None,
    source_title: str | None = None,
    description: str | None = None,
    event_text: str | None = None,
    attribute_codes: Sequence[str] | None = None,
    amc_attributes: Sequence[Mapping[str, Any]] | None = None,
    format_tags: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Classify one screening/performance as a product Special Event.

    Parameters are source-agnostic. Callers should pass structured attribute
    codes / descriptions when available (AMC ``amc_attributes``, SIFF program
    copy, etc.) before relying on title regex alone.

    ``format_tags`` are accepted for orthogonality documentation in evidence
    only — they never create an event by themselves.
    """
    codes = _normalize_codes(attribute_codes)
    if amc_attributes:
        for code in _extract_codes_from_amc_attributes(amc_attributes):
            if code not in codes:
                codes.append(code)

    blob = _collect_text_blobs(
        title=title,
        source_title=source_title,
        description=description,
        event_text=event_text,
    )

    types: list[str] = []
    evidence: list[dict[str, Any]] = []
    audit_signals: list[str] = []
    confidence_rank = 0  # 0 none, 1 low, 2 medium, 3 high

    def add_type(event_type: str, *, reason: str, confidence: str, detail: str | None = None) -> None:
        nonlocal confidence_rank
        if event_type not in types:
            types.append(event_type)
        payload: dict[str, Any] = {
            "kind": reason,
            "type": event_type,
            "confidence": confidence,
        }
        if detail:
            payload["detail"] = detail
        evidence.append(payload)
        rank = {"low": 1, "medium": 2, "high": 3}.get(confidence, 0)
        if rank > confidence_rank:
            confidence_rank = rank

    # 1) Structured AMC (or future) attribute codes — high confidence when specific.
    for code in codes:
        mapped = _HIGH_ATTR_CODES.get(code)
        if mapped:
            add_type(
                mapped,
                reason="attribute_code",
                confidence=CONFIDENCE_HIGH,
                detail=code,
            )
        elif code in {"EVENT", "ALTERNATIVECONTENT", "LIVE", "FATHOM"}:
            audit_signals.append(AUDIT_GENERIC_EVENT_CODE)
            evidence.append(
                {
                    "kind": "attribute_code_audit",
                    "signal": AUDIT_GENERIC_EVENT_CODE,
                    "detail": code,
                    "confidence": CONFIDENCE_LOW,
                }
            )

    # 2) Explicit title / description wording.
    if blob:
        for event_type, pattern, reason in _TITLE_TYPE_PATTERNS:
            match = pattern.search(blob)
            if match:
                add_type(
                    event_type,
                    reason=reason,
                    confidence=CONFIDENCE_HIGH,
                    detail=match.group(0),
                )

        for signal, pattern, reason in _AUDIT_TITLE_PATTERNS:
            match = pattern.search(blob)
            if match:
                audit_signals.append(signal)
                evidence.append(
                    {
                        "kind": reason,
                        "signal": signal,
                        "detail": match.group(0),
                        "confidence": CONFIDENCE_MEDIUM
                        if signal != AUDIT_ANNIVERSARY_ONLY
                        else CONFIDENCE_LOW,
                    }
                )

        # Bare "(2026 Event)" / "YYYY Event" is a rerelease product label, not an event.
        false_event = _FALSE_EVENT_TITLE.search(blob)
        if false_event and not types:
            audit_signals.append(AUDIT_AMBIGUOUS)
            evidence.append(
                {
                    "kind": "false_event_product_label",
                    "signal": AUDIT_AMBIGUOUS,
                    "detail": false_event.group(0),
                    "confidence": CONFIDENCE_LOW,
                }
            )

    # Format tags never create events; record orthogonality when both present.
    formats = [str(tag) for tag in (format_tags or ()) if str(tag).strip()]
    if types and formats:
        evidence.append(
            {
                "kind": "orthogonal_format_tags",
                "detail": formats,
                "confidence": CONFIDENCE_HIGH,
            }
        )

    # Sing-along alone → other_event (programmed screening event, not a format).
    if AUDIT_SING_ALONG in audit_signals and not types:
        add_type(
            TYPE_OTHER_EVENT,
            reason="title_sing_along_as_other_event",
            confidence=CONFIDENCE_MEDIUM,
            detail="sing-along",
        )

    # Double feature / marathon / concert cinema / anniversary alone stay audit-only.
    publish = bool(types) and confidence_rank >= 2

    labels = _extract_labels(blob) if publish else []
    # If extraction missed, prefer high-confidence evidence details (e.g.
    # "Community Screening") over generic type fallbacks ("Special event").
    if publish and not labels:
        labels = _labels_from_evidence(evidence, types)
    if publish and not labels:
        labels = [_human_label(t) for t in types]
    elif publish and labels:
        # Upgrade purely generic type fallbacks when richer evidence exists.
        generic = {_human_label(t).casefold() for t in types}
        if all(lab.casefold() in generic for lab in labels):
            richer = _labels_from_evidence(evidence, types)
            if richer:
                labels = richer

    confidence = None
    if confidence_rank >= 3:
        confidence = CONFIDENCE_HIGH
    elif confidence_rank == 2:
        confidence = CONFIDENCE_MEDIUM
    elif confidence_rank == 1:
        confidence = CONFIDENCE_LOW

    result = empty_special_event()
    if publish:
        result["is_special_event"] = True
        result["types"] = types
        result["labels"] = labels
        result["confidence"] = confidence
        result["evidence"] = evidence
    else:
        # Retain audit evidence for ambiguous / rejected cases (empty published types).
        result["confidence"] = confidence
        result["evidence"] = evidence
        if audit_signals:
            result["audit_signals"] = sorted(set(audit_signals))
    return result


def _human_label(event_type: str) -> str:
    return {
        TYPE_Q_AND_A: "Q&A",
        TYPE_INTRO_OR_DISCUSSION: "Introduction / discussion",
        TYPE_EARLY_ACCESS: "Early access",
        TYPE_SNEAK_PREVIEW: "Sneak preview",
        TYPE_OPENING_NIGHT: "Opening night",
        TYPE_FAN_EVENT: "Fan event",
        TYPE_MYSTERY_SCREENING: "Mystery screening",
        TYPE_SPECIAL_PRESENTATION: "Special presentation",
        TYPE_OTHER_EVENT: "Special event",
    }.get(event_type, event_type)


def is_published_special_event(payload: Mapping[str, Any] | None) -> bool:
    return bool(payload and payload.get("is_special_event") is True)
