"""Presentation / year interpretation for TMDB matching (T-FILMID-01E)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from reel_seattle.analysis.film_identity import infer_parent_display_title
from reel_seattle.normalize import normalize_film_title

_ANNIVERSARY_RE = re.compile(
    r"(?P<num>\d{1,3})(?:st|nd|rd|th)\s+anniversary",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
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
    r"early\s+access|fan\s+event|encore"
    r")\b",
    re.IGNORECASE,
)
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

    def scoring_year(self) -> int | None:
        """Year used for TMDB year comparison (never raw event year alone)."""
        if self.canonical_year_candidate is not None:
            return self.canonical_year_candidate
        if self.event_year_not_canonical:
            return None
        return self.product_year or (self.title_years[0] if self.title_years else None)

    def search_year(self) -> int | None:
        """Optional year hint for TMDB search; prefer canonical candidate."""
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
        }


def interpret_source_years(
    *,
    source_title: str | None,
    product_year: int | None = None,
    explicit_canonical_year: int | None = None,
) -> YearInterpretation:
    """Separate event/presentation years from a canonical film year candidate."""
    title = (source_title or "").strip()
    warnings: list[str] = []
    labels = _presentation_labels(title)
    base = normalize_match_title(title)
    title_years = tuple(int(m.group(1)) for m in _YEAR_RE.finditer(title))

    anniversary = None
    ann_match = _ANNIVERSARY_RE.search(title)
    if ann_match:
        anniversary = int(ann_match.group("num"))
        if anniversary < 5 or anniversary > 120:
            warnings.append("implausible_anniversary_number")
            anniversary = None

    has_presentation = bool(labels) or anniversary is not None
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
    )


def normalize_match_title(title: str | None) -> str | None:
    """Unicode-aware presentation strip → base search/compare title."""
    if not title:
        return None
    text = unicodedata.normalize("NFKC", str(title)).strip()
    display = normalize_film_title(text) or text
    parent = infer_parent_display_title(display) or display
    # Extra festival / program tails not fully covered by parent strip.
    parent = re.sub(
        r"\s*[-:–—]\s*studio\s+ghibli\s+fest(?:ival)?(?:\s+\d{4})?\s*$",
        "",
        parent,
        flags=re.IGNORECASE,
    )
    parent = re.sub(
        r"\s+studio\s+ghibli\s+fest(?:ival)?(?:\s+\d{4})?\s*$",
        "",
        parent,
        flags=re.IGNORECASE,
    )
    parent = re.sub(
        r"\s+(?:new\s+)?4k(?:\s+restoration)?|\s+restoration|\s+restored|\s+remastered|"
        r"\s+re-?release",
        " ",
        parent,
        flags=re.IGNORECASE,
    )
    parent = re.sub(r"\s+fest(?:ival)?(?:\s+\d{4})?\s*$", "", parent, flags=re.IGNORECASE)
    parent = re.sub(r"\s+\d{4}\s*$", "", parent).strip(" :-–—")
    parent = re.sub(r"\s+", " ", parent).strip()
    return parent or None


def looks_like_feature_presentation(source_title: str | None, base_title: str | None) -> bool:
    """True when fest/program wording wraps a distinct feature title."""
    base = (base_title or "").strip()
    raw = (source_title or "").strip()
    if not base or len(base) < 2:
        return False
    if _SHORTS_PROGRAM_RE.search(raw) and not _ANNIVERSARY_RE.search(raw):
        # "Emerald City Short Film Festival" — base may still be long.
        if re.search(r"\bshorts?\b|\bshort\s+film\b", raw, re.I) and not _ANNIVERSARY_RE.search(
            raw
        ):
            # If base still contains "short" / "festival", treat as program.
            if re.search(r"\bshorts?\b|\bfestival\b|\bfest\b|\bprogram\b", base, re.I):
                return False
    if re.fullmatch(r"(?i)fest(?:ival)?|programs?|shorts?", base):
        return False
    return True


def _presentation_labels(title: str) -> list[str]:
    found: list[str] = []
    for match in _PRESENTATION_TOKEN_RE.finditer(title):
        label = re.sub(r"\s+", " ", match.group(1).casefold().strip())
        if label not in found:
            found.append(label)
    if _ANNIVERSARY_RE.search(title) and "anniversary" not in found:
        found.append("anniversary")
    return found
