"""Presentation / year interpretation for TMDB matching (T-FILMID-01E)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from reel_seattle.normalize import normalize_film_title
from reel_seattle.film_identity.title_rules import (
    apply_program_series_prefix,
    is_event_suffix_segment,
    lookup_exact_alias,
    strip_recognized_event_suffix,
)

_ANNIVERSARY_RE = re.compile(
    r"(?P<num>\d{1,3})(?:st|nd|rd|th)\s+anniversary",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
_FEST_OR_PROGRAM_RE = re.compile(
    r"\b(shorts?\s+program|short\s+film\s+fest(?:ival)?|"
    r"film\s+festival|catvideofest|programs?)\b|\bfest\b",
    re.IGNORECASE,
)
_SHORTS_PROGRAM_RE = re.compile(
    r"\bshorts?\b|\bshort\s+film\b|\bshorts?\s+fest|\bshorts?\s+program\b|"
    r"\bcatvideofest\b",
    re.IGNORECASE,
)

# Complete presentation atoms (phrase-aware; never delete isolated tokens mid-title).
_PRESENTATION_ATOM = (
    r"(?:"
    r"\d+(?:st|nd|rd|th)\s+anniversary(?:\s+(?:screening|event|double\s+feature))?"
    r"|anniversary(?:\s+(?:screening|event|remastered|restored|double\s+feature))?"
    r"|newly\s+remastered"
    r"|remastered(?:\s*&\s*revived|\s+and\s+revived)?"
    r"|remastered\s*&\s*revived"
    r"|restored"
    r"|restoration"
    r"|(?:new\s+)?4k(?:\s+restoration)?"
    r"|4k\s+restoration"
    r"|re-?release|rerelease"
    r"|director'?s\s+cut|extended\s+edition"
    r"|special\s+presentation"
    r"|fan\s+event|one\s+night\s+only|opening\s+night(?:\s+fan\s+event)?"
    r"|early\s+access|encore(?:\s+screening)?"
    r"|roadshow"
    r"|studio\s+ghibli\s+fest(?:ival)?(?:\s+\d{4})?"
    r"|ghibli\s+fest(?:ival)?(?:\s+\d{4})?"
    r"|film\s+festival(?:\s+\d{4})?"
    r"|fest(?:ival)?(?:\s+\d{4})?"
    r"|q\s*&\s*a|talkback|panel"
    r"|sensory\s+friendly(?:\s+screening)?"
    r"|community\s+screening"
    r"|sing[- ]?along(?:\s+screening)?"
    r"|open\s+caption(?:s|ing)?(?:\s*\(\s*in\s+english\s*\))?"
    r"|closed\s+caption(?:ed|ing)?"
    r"|audio\s+description"
    r"|dubbed|subtitled"
    r"|35mm|70mm|imax(?:\s*70mm)?|dolby(?:\s+cinema)?|reald\s+3d|3d"
    r"|revived"
    r")"
)
_PRESENTATION_SEGMENT_RE = re.compile(
    rf"^{_PRESENTATION_ATOM}"
    rf"(?:\s*(?:&|and|/|,|-)?\s*{_PRESENTATION_ATOM})*"
    rf"(?:\s+\d{{4}})?"
    rf"$",
    re.IGNORECASE,
)
_PAREN_PRESENTATION_RE = re.compile(
    r"\s*\(\s*("
    r"35mm|70mm|imax(?:\s*70mm)?|dolby\s+cinema|"
    r"(?:new\s+)?4k(?:\s+restoration)?|4k\s+restoration|"
    r"open\s+caption(?:s|ing)?(?:\s+in\s+english)?|"
    r"sensory\s+friendly|dubbed|subtitled|restored|remastered|"
    r"special\s+presentation|fan\s+event|one\s+night\s+only|"
    r"\d+(?:st|nd|rd|th)\s+anniversary|"
    r"\d{4}\s+event|3d"
    r")\s*\)\s*$",
    re.IGNORECASE,
)
# Mid-title anniversary phrase (e.g. "Only Yesterday 35th Anniversary …").
_INLINE_ANNIVERSARY_RE = re.compile(
    r"\s+\d+(?:st|nd|rd|th)\s+anniversary(?:\s+screening)?\b",
    re.IGNORECASE,
)
_PRESENTATION_TOKEN_RE = re.compile(
    r"\b("
    r"anniversary|restoration|restored|remastered|re-?release|rerelease|"
    r"director'?s\s+cut|extended\s+edition|special\s+presentation|"
    r"roadshow|new\s+4k(?:\s+restoration)?|4k\s+restoration|"
    r"studio\s+ghibli\s+fest(?:ival)?|ghibli\s+fest(?:ival)?|"
    r"film\s+festival|fest(?:ival)?|"
    r"q\s*&\s*a|talkback|panel|"
    r"35mm|70mm|imax|dolby(?:\s+cinema)?|"
    r"dubbed|subtitled|open\s+caption(?:s|ing)?|"
    r"sensory\s+friendly(?:\s+screening)?|"
    r"early\s+access|fan\s+event|encore|one\s+night\s+only|"
    r"remastered\s*&\s*revived|revived"
    r")\b",
    re.IGNORECASE,
)
_ORPHAN_PUNCT_RE = re.compile(r"\s*[&/,|:–—-]+\s*$")
_EMPTY_PARENS_RE = re.compile(r"\(\s*\)")
_MULTI_SPACE_RE = re.compile(r"\s+")
_FORMAT_LABELS = {
    "35mm",
    "70mm",
    "imax",
    "imax 70mm",
    "dolby",
    "dolby cinema",
    "4k",
    "4k restoration",
    "new 4k",
    "new 4k restoration",
}


@dataclass(frozen=True)
class MatchTitleExtraction:
    """Phrase-aware title normalization for TMDB search."""

    original_title: str
    base_title: str | None
    removed_phrases: tuple[str, ...] = ()
    presentation_labels: tuple[str, ...] = ()
    format_tags: tuple[str, ...] = ()
    event_labels: tuple[str, ...] = ()
    program_series: str | None = None
    applied_alias_id: str | None = None
    applied_alias: str | None = None
    event_phrase: str | None = None
    applied_rules: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "original_title": self.original_title,
            "base_title": self.base_title,
            "removed_phrases": list(self.removed_phrases),
            "presentation_labels": list(self.presentation_labels),
            "format_tags": list(self.format_tags),
            "event_labels": list(self.event_labels),
            "program_series": self.program_series,
            "applied_alias_id": self.applied_alias_id,
            "applied_alias": self.applied_alias,
            "event_phrase": self.event_phrase,
            "applied_rules": list(self.applied_rules),
        }


@dataclass(frozen=True)
class YearInterpretation:
    """Canonical vs event/presentation year semantics."""

    canonical_year_candidate: int | None = None
    event_year: int | None = None
    anniversary_years: int | None = None
    product_year: int | None = None
    title_years: tuple[int, ...] = ()
    year_confidence: str = "none"  # none|explicit|derived|product|title
    presentation_labels: tuple[str, ...] = ()
    base_title: str | None = None
    event_year_not_canonical: bool = False
    anniversary_year_derived: bool = False
    warnings: tuple[str, ...] = ()
    removed_phrases: tuple[str, ...] = ()
    format_tags: tuple[str, ...] = ()
    event_labels: tuple[str, ...] = ()
    program_series: str | None = None
    applied_alias_id: str | None = None
    applied_alias: str | None = None
    event_phrase: str | None = None
    applied_rules: tuple[str, ...] = ()

    def scoring_year(self) -> int | None:
        """Year used for TMDB year comparison (never raw event year alone)."""
        if self.canonical_year_candidate is not None:
            return self.canonical_year_candidate
        if self.event_year_not_canonical:
            return None
        return self.product_year or (self.title_years[0] if self.title_years else None)

    def search_year(self) -> int | None:
        """Optional year hint for TMDB search; omit when evidence is absent/uncertain."""
        return self.scoring_year()

    def to_dict(self) -> dict[str, Any]:
        return {
            "canonical_year_candidate": self.canonical_year_candidate,
            "event_year": self.event_year,
            "anniversary_years": self.anniversary_years,
            "product_year": self.product_year,
            "title_years": list(self.title_years),
            "year_confidence": self.year_confidence,
            "presentation_labels": list(self.presentation_labels),
            "base_title": self.base_title,
            "event_year_not_canonical": self.event_year_not_canonical,
            "anniversary_year_derived": self.anniversary_year_derived,
            "warnings": list(self.warnings),
            "scoring_year": self.scoring_year(),
            "search_year": self.search_year(),
            "removed_phrases": list(self.removed_phrases),
            "format_tags": list(self.format_tags),
            "event_labels": list(self.event_labels),
            "program_series": self.program_series,
            "applied_alias_id": self.applied_alias_id,
            "applied_alias": self.applied_alias,
            "event_phrase": self.event_phrase,
            "applied_rules": list(self.applied_rules),
            "year_evidence": (
                "missing"
                if self.scoring_year() is None and not self.event_year_not_canonical
                else "uncertain_rerelease_restoration"
                if self.event_year_not_canonical and self.scoring_year() is None
                else "derived_or_explicit"
                if self.scoring_year() is not None
                else "missing"
            ),
        }


def interpret_source_years(
    *,
    source_title: str | None,
    product_year: int | None = None,
    explicit_canonical_year: int | None = None,
    source: str | None = None,
) -> YearInterpretation:
    """Separate event/presentation years from a canonical film year candidate."""
    title = (source_title or "").strip()
    warnings: list[str] = []
    extracted = extract_match_title(title, source=source)
    labels = list(extracted.presentation_labels) or _presentation_labels(title)
    base = extracted.base_title
    title_years = tuple(int(m.group(1)) for m in _YEAR_RE.finditer(title))

    anniversary = None
    ann_match = _ANNIVERSARY_RE.search(title)
    if ann_match:
        anniversary = int(ann_match.group("num"))
        if anniversary < 5 or anniversary > 120:
            warnings.append("implausible_anniversary_number")
            anniversary = None

    has_presentation = (
        bool(labels)
        or anniversary is not None
        or bool(extracted.removed_phrases)
        or bool(extracted.program_series)
        or bool(extracted.applied_alias_id)
    )
    event_year = None
    if has_presentation and title_years:
        # Prefer trailing / fest-associated year as event year.
        event_year = title_years[-1]
    elif has_presentation and product_year is not None:
        event_year = product_year

    derived = None
    anniversary_derived = False
    if (
        anniversary is not None
        and event_year is not None
        and 1888 <= event_year <= 2100
        and 5 <= anniversary <= 120
    ):
        candidate = event_year - anniversary
        if 1888 <= candidate <= 2100:
            derived = candidate
            anniversary_derived = True
        else:
            warnings.append("implausible_anniversary_arithmetic")

    canonical = explicit_canonical_year
    confidence = "none"
    if canonical is not None:
        confidence = "explicit"
    elif derived is not None:
        canonical = derived
        confidence = "derived"
    elif not has_presentation:
        if product_year is not None:
            canonical = product_year
            confidence = "product"
        elif title_years:
            canonical = title_years[0]
            confidence = "title"

    event_not_canonical = bool(
        has_presentation
        and event_year is not None
        and (canonical is None or event_year != canonical)
    )
    if event_not_canonical:
        warnings.append("event_year_not_canonical")
    if anniversary_derived:
        warnings.append("anniversary_year_derived")

    # Product year on anniversary/re-release presentations is event-like.
    if has_presentation and product_year is not None and canonical != product_year:
        event_year = event_year or product_year
        if "event_year_not_canonical" not in warnings:
            warnings.append("event_year_not_canonical")
            event_not_canonical = True

    return YearInterpretation(
        canonical_year_candidate=canonical,
        event_year=event_year,
        anniversary_years=anniversary,
        product_year=product_year,
        title_years=title_years,
        year_confidence=confidence,
        presentation_labels=tuple(labels),
        base_title=base,
        event_year_not_canonical=event_not_canonical,
        anniversary_year_derived=anniversary_derived,
        warnings=tuple(dict.fromkeys(warnings)),
        removed_phrases=extracted.removed_phrases,
        format_tags=extracted.format_tags,
        event_labels=extracted.event_labels,
        program_series=extracted.program_series,
        applied_alias_id=extracted.applied_alias_id,
        applied_alias=extracted.applied_alias,
        event_phrase=extracted.event_phrase,
        applied_rules=extracted.applied_rules,
    )


def extract_match_title(
    title: str | None,
    *,
    source: str | None = None,
) -> MatchTitleExtraction:
    """Prepare TMDB search title with documented precedence.

    1. Exact reviewed source-title alias
    2. Recognized series/program prefix extraction
    3. Recognized screening/event suffix extraction
    4. Existing format/accessibility normalization
    5. Normalized source title fallback
    """
    original = (title or "").strip()
    if not original:
        return MatchTitleExtraction(original_title="", base_title=None)

    text = unicodedata.normalize("NFKC", original).strip()
    working = normalize_film_title(text) or text
    removed: list[str] = []
    format_tags: list[str] = []
    event_labels: list[str] = []
    applied_rules: list[str] = []
    program_series: str | None = None
    applied_alias_id: str | None = None
    applied_alias: str | None = None
    event_phrase: str | None = None

    # 1) Exact reviewed alias (unsafe-to-generalize cases).
    alias = lookup_exact_alias(original, source=source)
    if alias is not None:
        applied_alias_id = alias.alias_id
        applied_alias = alias.search_title
        applied_rules.append(f"exact_alias:{alias.alias_id}")
        for label in alias.labels:
            if label not in event_labels:
                event_labels.append(label)
        removed.append(f"alias:{original}")
        working = alias.search_title
        # Aliases replace search title; still allow light format cleanup below if needed.
    else:
        # 2) Registered program-series prefix (source-scoped when configured).
        series = apply_program_series_prefix(working, source=source)
        if series is not None:
            program_series = series.prefix
            removed.append(series.prefix)
            applied_rules.append(f"program_series:{series.prefix_id}")
            working = series.remainder

        # 3) Recognized complete event suffixes.
        head, event = strip_recognized_event_suffix(working)
        if event and head:
            removed.append(event)
            event_labels.append(event)
            event_phrase = event
            applied_rules.append("event_suffix")
            working = head

    # 4) Existing format / accessibility / anniversary normalization.
    changed = True
    while changed:
        changed = False
        paren = _PAREN_PRESENTATION_RE.search(working)
        if paren:
            phrase = paren.group(0).strip()
            inner = re.sub(r"\s+", " ", paren.group(1).strip())
            removed.append(phrase)
            label = inner.casefold()
            if label in _FORMAT_LABELS or any(
                label.startswith(x) for x in ("35mm", "70mm", "imax", "dolby", "4k")
            ):
                format_tags.append(inner)
            else:
                event_labels.append(inner)
            working = working[: paren.start()].strip()
            working = _cleanup_title_fragment(working)
            applied_rules.append("format_or_accessibility_paren")
            changed = True
            continue

        # Prefer trailing separator segments classified as complete presentation/event phrases.
        for sep in (" - ", " – ", " — ", ": ", ":"):
            if sep not in working:
                continue
            head, tail = working.rsplit(sep, 1)
            head = head.strip()
            tail = tail.strip()
            if not head or not tail:
                continue
            if is_event_suffix_segment(tail) or _is_presentation_segment(tail):
                removed.append(tail)
                _classify_removed_phrase(tail, format_tags, event_labels)
                if is_event_suffix_segment(tail):
                    event_phrase = event_phrase or tail
                    applied_rules.append("event_suffix_segment")
                else:
                    applied_rules.append("presentation_segment")
                working = _cleanup_title_fragment(head)
                changed = True
                break
        if changed:
            continue

        # Trailing space-delimited presentation phrase without separator.
        match = re.search(
            rf"(?P<head>.+?)\s+(?P<tail>{_PRESENTATION_ATOM}"
            rf"(?:\s*(?:&|and|/|,|-)?\s*{_PRESENTATION_ATOM})*)\s*$",
            working,
            flags=re.IGNORECASE,
        )
        if match and _is_presentation_segment(match.group("tail")):
            head = match.group("head").strip()
            tail = match.group("tail").strip()
            if head and len(head) >= 2:
                removed.append(tail)
                _classify_removed_phrase(tail, format_tags, event_labels)
                working = _cleanup_title_fragment(head)
                applied_rules.append("presentation_trailing_atoms")
                changed = True
                continue

        # Inline anniversary left in the middle (Only Yesterday 35th Anniversary …).
        inline = _INLINE_ANNIVERSARY_RE.search(working)
        if inline:
            phrase = inline.group(0).strip()
            removed.append(phrase)
            event_labels.append(phrase)
            working = _cleanup_title_fragment(
                working[: inline.start()] + " " + working[inline.end() :]
            )
            applied_rules.append("inline_anniversary")
            changed = True
            continue

        # Known fest tails still attached without separator cleanup.
        fest = re.search(
            r"\s*[-:–—]?\s*studio\s+ghibli\s+fest(?:ival)?(?:\s+\d{4})?\s*$",
            working,
            flags=re.IGNORECASE,
        )
        if fest:
            phrase = fest.group(0).strip(" :-–—")
            removed.append(phrase)
            event_labels.append(phrase)
            working = _cleanup_title_fragment(working[: fest.start()])
            applied_rules.append("ghibli_fest_tail")
            changed = True
            continue

        trailing_year = re.search(r"\s+\d{4}\s*$", working)
        # Only strip a bare trailing year when presentation metadata was already removed.
        if trailing_year and removed:
            phrase = trailing_year.group(0).strip()
            removed.append(phrase)
            working = _cleanup_title_fragment(working[: trailing_year.start()])
            applied_rules.append("trailing_event_year")
            changed = True

    labels = _presentation_labels(original)
    for item in event_labels + format_tags:
        folded = re.sub(r"\s+", " ", item.casefold().strip())
        if folded and folded not in labels:
            labels.append(folded)
    if program_series:
        folded = program_series.casefold()
        if folded not in labels:
            labels.append(folded)

    base = _cleanup_title_fragment(working) or None
    if not applied_rules and base:
        applied_rules.append("normalized_source_fallback")

    return MatchTitleExtraction(
        original_title=original,
        base_title=base,
        removed_phrases=tuple(dict.fromkeys(p for p in removed if p)),
        presentation_labels=tuple(labels),
        format_tags=tuple(dict.fromkeys(format_tags)),
        event_labels=tuple(dict.fromkeys(event_labels)),
        program_series=program_series,
        applied_alias_id=applied_alias_id,
        applied_alias=applied_alias,
        event_phrase=event_phrase,
        applied_rules=tuple(dict.fromkeys(applied_rules)),
    )


def normalize_match_title(title: str | None, *, source: str | None = None) -> str | None:
    """Unicode-aware presentation strip → base search/compare title."""
    return extract_match_title(title, source=source).base_title


def looks_like_feature_presentation(source_title: str | None, base_title: str | None) -> bool:
    """True when fest/program wording wraps a distinct feature title."""
    base = (base_title or "").strip()
    raw = (source_title or "").strip()
    if not base or len(base) < 2:
        return False
    if _SHORTS_PROGRAM_RE.search(raw) and not _ANNIVERSARY_RE.search(raw):
        if re.search(r"\bshorts?\b|\bshort\s+film\b", raw, re.I) and not _ANNIVERSARY_RE.search(
            raw
        ):
            if re.search(r"\bshorts?\b|\bfestival\b|\bfest\b|\bprogram\b", base, re.I):
                return False
    if re.fullmatch(r"(?i)fest(?:ival)?|programs?|shorts?", base):
        return False
    return True


def _is_presentation_segment(segment: str) -> bool:
    text = _cleanup_title_fragment(segment)
    if not text:
        return False
    # Whole segment must be presentation atoms — never a genuine subtitle.
    if _PRESENTATION_SEGMENT_RE.fullmatch(text):
        return True
    # Allow "10th Anniversary Remastered & Revived" style with loose ampersands.
    compacted = re.sub(r"\s+", " ", text)
    return bool(_PRESENTATION_SEGMENT_RE.fullmatch(compacted))


def _classify_removed_phrase(
    phrase: str, format_tags: list[str], event_labels: list[str]
) -> None:
    folded = re.sub(r"\s+", " ", phrase.casefold().strip())
    if any(
        token in folded
        for token in ("35mm", "70mm", "imax", "dolby", "4k restoration", "4k")
    ) and not any(
        token in folded for token in ("anniversary", "remastered", "restored", "revived")
    ):
        format_tags.append(phrase.strip())
    else:
        event_labels.append(phrase.strip())


def _cleanup_title_fragment(text: str) -> str:
    cleaned = text.strip()
    cleaned = _EMPTY_PARENS_RE.sub("", cleaned)
    cleaned = _ORPHAN_PUNCT_RE.sub("", cleaned)
    cleaned = cleaned.strip(" :-–—,/&")
    # Remove orphaned leading/trailing conjunctions left by phrase stripping.
    cleaned = re.sub(r"^(?:&|and|/|,)\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+(?:&|and|/|,)$", "", cleaned, flags=re.IGNORECASE)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned).strip()
    return cleaned


def _presentation_labels(title: str) -> list[str]:
    found: list[str] = []
    for match in _PRESENTATION_TOKEN_RE.finditer(title):
        label = re.sub(r"\s+", " ", match.group(1).casefold().strip())
        if label not in found:
            found.append(label)
    if _ANNIVERSARY_RE.search(title) and "anniversary" not in found:
        found.append("anniversary")
    return found
