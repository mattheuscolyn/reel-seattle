"""Parent film identity derivation for analysis (PR Identity-C)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Mapping, Sequence

from reel_seattle.analysis.special_screening_flags import (
    classify_run_type,
    classify_special_screening_flags,
)
from reel_seattle.normalize import normalize_film_title, showtime_film_key, extract_year_hint

IDENTITY_MODE_TITLE = "title"
IDENTITY_MODE_PARENT = "parent"

PARENT_METHOD_SOURCE_FILM_ID = "source_film_id"
PARENT_METHOD_TITLE_VARIANT_STRIP = "title_variant_strip"
PARENT_METHOD_TITLE_EXACT = "title_exact"
PARENT_METHOD_AMBIGUOUS = "ambiguous"

CONFIDENCE_HIGH = "high"
CONFIDENCE_MEDIUM = "medium"
CONFIDENCE_LOW = "low"

_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")

_VARIANT_SUFFIX_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r":\s*sensory\s+friendly(?:\s+screening)?",
        r"\s+sensory\s+friendly(?:\s+screening)?",
        r":\s*early\s+access",
        r"\s+early\s+access",
        r":\s*fan\s+event",
        r"\s+fan\s+event",
        r":\s*opening\s+night(?:\s+fan\s+event)?",
        r"\s+opening\s+night(?:\s+fan\s+event)?",
        r":\s*imax\s+opening\s+night(?:\s+fan\s+event)?",
        r"\s+imax\s+opening\s+night(?:\s+fan\s+event)?",
        r":\s*double\s+feature",
        r"\s+double\s+feature",
        r":\s*\d+(?:st|nd|rd|th)\s+anniversary(?:\s+double\s+feature)?",
        r"\s+\d+(?:st|nd|rd|th)\s+anniversary(?:\s+double\s+feature)?",
        r":\s*anniversary",
        r"\s+anniversary",
        r":\s*encore",
        r"\s+encore",
        r":\s*live(?:\s+in\s+concert)?",
        r"\s+live(?:\s+in\s+concert)?",
        r"\s+\(\s*imax\s*\)",
        r"\s+\(\s*3d\s*\)",
        r"\s+\(\s*dolby\s+cinema\s*\)",
        r"\s+-\s*imax\b",
        r"\s+-\s*3d\b",
        r"\s+-\s*dolby\s+cinema\b",
        r":\s*imax\b",
        r"\s+imax\b",
        r":\s*3d\b",
        r"\s+3d\b",
        r":\s*dolby\s+cinema\b",
        r"\s+dolby\s+cinema\b",
        r":\s*reald\s+3d\b",
        r"\s+reald\s+3d\b",
        r":\s*open\s+caption(?:\s*\(in\s+english\))?",
        r"\s+open\s+caption(?:\s*\(in\s+english\))?",
        r":\s*subtitled\b",
        r"\s+subtitled\b",
        r":\s*dubbed\b",
        r"\s+dubbed\b",
        r"\s+\(\s*\d{4}\s+event\s*\)",
        r":\s*\d{4}\s+event\b",
    )
)


def infer_parent_display_title(title: str) -> str:
    """Conservatively strip known screening/event/format suffixes for parent inference."""
    text = normalize_film_title(title) or title.strip()
    if not text:
        return ""
    changed = True
    while changed:
        changed = False
        for pattern in _VARIANT_SUFFIX_PATTERNS:
            updated = pattern.sub("", text).strip(" :-\u2013\u2014")
            if updated and updated != text:
                text = updated
                changed = True
                break
    return text.strip()


def infer_parent_film_key(title: str) -> str | None:
    parent = infer_parent_display_title(title)
    if not parent:
        return None
    return showtime_film_key(parent)


def classify_screening_variant_type(title: str) -> str:
    """Map title to a variant type label for audit columns."""
    lowered = title.lower()
    if "early access" in lowered:
        return "early_access"
    flags = classify_special_screening_flags(title)
    if flags.get("sensory_friendly_like"):
        return "sensory_friendly"
    if flags.get("opening_night_like"):
        return "opening_night"
    if flags.get("fan_event_like"):
        return "fan_event"
    if flags.get("double_feature_like"):
        return "double_feature"
    if flags.get("anniversary_like"):
        return "anniversary"
    if flags.get("live_or_concert_like"):
        return "live_encore"
    if any(token in lowered for token in ("imax", "dolby cinema", "reald 3d", " 3d")):
        return "format_variant"
    if flags.get("special_event_like") or classify_run_type(title) != "normal_first_run":
        return classify_run_type(title)
    return "none"


def is_likely_screening_variant(title: str) -> bool:
    parent = infer_parent_display_title(title)
    normalized = normalize_film_title(title) or title.strip()
    if not parent or parent.casefold() == normalized.casefold():
        return False
    variant_type = classify_screening_variant_type(title)
    if variant_type in {"none", "normal_first_run"}:
        return parent.casefold() != normalized.casefold()
    return True


def parent_film_key_from_source_film_id(source_film_id: str) -> str:
    """Stable parent key slug from a vendor film id."""
    slug = _NON_ALNUM_RE.sub("-", source_film_id.strip().casefold()).strip("-")
    return f"amc-movie-{slug}" if slug else ""


@dataclass(frozen=True)
class ParentFilmIdentity:
    parent_film_key: str
    parent_display_title: str
    variant_source_title: str
    screening_variant_type: str
    is_special_screening: bool
    parent_identity_method: str
    parent_identity_confidence: str
    source_film_id: str


def derive_parent_identity(
    title: str,
    *,
    source_film_id: str = "",
    amc_movie_id: str = "",
) -> ParentFilmIdentity:
    """Derive conservative parent identity for one source title."""
    variant_source_title = str(title or "").strip()
    source_id = (source_film_id or amc_movie_id or "").strip()
    variant_type = classify_screening_variant_type(variant_source_title)
    is_special = is_likely_screening_variant(variant_source_title)
    parent_title = infer_parent_display_title(variant_source_title) or variant_source_title

    if variant_type == "double_feature":
        parent_key = showtime_film_key(variant_source_title) or ""
        return ParentFilmIdentity(
            parent_film_key=parent_key,
            parent_display_title=normalize_film_title(variant_source_title) or variant_source_title,
            variant_source_title=variant_source_title,
            screening_variant_type=variant_type,
            is_special_screening=True,
            parent_identity_method=PARENT_METHOD_AMBIGUOUS,
            parent_identity_confidence=CONFIDENCE_LOW,
            source_film_id=source_id,
        )

    # Use title-based grouping for all films UNLESS the title itself contains a year
    # (which indicates potential disambiguation is needed, like Moana 2016 vs 2026).
    # This ensures variants and their base films group together.
    title_parent_key = infer_parent_film_key(variant_source_title) or showtime_film_key(
        variant_source_title
    ) or ""
    has_year_in_title = bool(extract_year_hint(variant_source_title))
    
    # Prioritize title-based grouping for:
    # 1. Known screening variants (sensory friendly, IMAX, etc.)
    # 2. Titles without embedded years (won't collide with remakes)
    if is_special or not has_year_in_title:
        normalized = normalize_film_title(variant_source_title) or variant_source_title
        if parent_title.casefold() == normalized.casefold():
            method = PARENT_METHOD_TITLE_EXACT
            confidence = CONFIDENCE_HIGH
        elif is_special:
            method = PARENT_METHOD_TITLE_VARIANT_STRIP
            confidence = CONFIDENCE_HIGH
        else:
            method = PARENT_METHOD_TITLE_EXACT
            confidence = CONFIDENCE_HIGH
        
        return ParentFilmIdentity(
            parent_film_key=title_parent_key,
            parent_display_title=parent_title,
            variant_source_title=variant_source_title,
            screening_variant_type=variant_type,
            is_special_screening=is_special,
            parent_identity_method=method,
            parent_identity_confidence=confidence,
            source_film_id=source_id,
        )

    # Only use source_film_id-based grouping when title has embedded year
    # (for disambiguating remakes like Moana 2016 vs 2026)
    if source_id:
        parent_key = parent_film_key_from_source_film_id(source_id)
        return ParentFilmIdentity(
            parent_film_key=parent_key,
            parent_display_title=parent_title,
            variant_source_title=variant_source_title,
            screening_variant_type=variant_type,
            is_special_screening=is_special,
            parent_identity_method=PARENT_METHOD_SOURCE_FILM_ID,
            parent_identity_confidence=CONFIDENCE_HIGH,
            source_film_id=source_id,
        )

    title_parent_key = infer_parent_film_key(variant_source_title) or showtime_film_key(
        variant_source_title
    ) or ""
    normalized = normalize_film_title(variant_source_title) or variant_source_title
    if parent_title.casefold() == normalized.casefold():
        method = PARENT_METHOD_TITLE_EXACT
        confidence = CONFIDENCE_HIGH
    elif is_special:
        method = PARENT_METHOD_TITLE_VARIANT_STRIP
        confidence = CONFIDENCE_MEDIUM
    else:
        method = PARENT_METHOD_AMBIGUOUS
        confidence = CONFIDENCE_LOW

    return ParentFilmIdentity(
        parent_film_key=title_parent_key,
        parent_display_title=parent_title,
        variant_source_title=variant_source_title,
        screening_variant_type=variant_type,
        is_special_screening=is_special,
        parent_identity_method=method,
        parent_identity_confidence=confidence,
        source_film_id="",
    )


def build_film_key_identity_map(
    rows: Sequence[Mapping[str, str]],
) -> dict[str, ParentFilmIdentity]:
    """Map each ``showtime_film_key`` to a parent identity from footprint rows."""
    key_titles: dict[str, str] = {}
    key_source_ids: dict[str, str] = {}
    for row in rows:
        film_key = str(row.get("showtime_film_key", "")).strip()
        if not film_key:
            continue
        title = str(row.get("film_title", "")).strip()
        if title:
            key_titles.setdefault(film_key, title)
        source_id = str(row.get("amc_movie_id", "")).strip()
        if source_id and film_key not in key_source_ids:
            key_source_ids[film_key] = source_id

    identities: dict[str, ParentFilmIdentity] = {}
    for film_key, title in key_titles.items():
        identities[film_key] = derive_parent_identity(
            title,
            source_film_id=key_source_ids.get(film_key, ""),
        )

    _unify_parent_keys_by_source_film_id(identities)
    return identities


def _unify_parent_keys_by_source_film_id(
    identities: dict[str, ParentFilmIdentity],
) -> None:
    by_source: dict[str, list[str]] = {}
    for film_key, identity in identities.items():
        if identity.source_film_id:
            by_source.setdefault(identity.source_film_id, []).append(film_key)

    for source_id, film_keys in by_source.items():
        if len(film_keys) < 2:
            continue
        canonical_key = parent_film_key_from_source_film_id(source_id)
        parent_titles = [identities[key].parent_display_title for key in film_keys]
        canonical_title = min(parent_titles, key=lambda text: (len(text), text.lower()))
        for film_key in film_keys:
            current = identities[film_key]
            identities[film_key] = ParentFilmIdentity(
                parent_film_key=canonical_key,
                parent_display_title=canonical_title,
                variant_source_title=current.variant_source_title,
                screening_variant_type=current.screening_variant_type,
                is_special_screening=current.is_special_screening,
                parent_identity_method=PARENT_METHOD_SOURCE_FILM_ID,
                parent_identity_confidence=CONFIDENCE_HIGH,
                source_film_id=source_id,
            )


def parent_identity_fields(
    identity: ParentFilmIdentity,
    *,
    identity_mode: str,
    film_key: str,
    variant_keys: Sequence[str] | None = None,
    variant_titles: Sequence[str] | None = None,
) -> dict[str, str]:
    """Serialize parent identity columns for weekly label rows."""
    keys = list(variant_keys or [film_key])
    titles = list(variant_titles or [identity.variant_source_title])
    special_count = sum(
        1
        for title in titles
        if is_likely_screening_variant(title)
    )
    row_key = identity.parent_film_key if identity_mode == IDENTITY_MODE_PARENT else film_key
    return {
        "identity_mode": identity_mode,
        "showtime_film_key": row_key,
        "parent_film_key": identity.parent_film_key,
        "parent_display_title": identity.parent_display_title,
        "screening_variant_type": identity.screening_variant_type,
        "is_special_screening": "true" if identity.is_special_screening else "false",
        "variant_source_title": identity.variant_source_title,
        "parent_identity_method": identity.parent_identity_method,
        "parent_identity_confidence": identity.parent_identity_confidence,
        "variant_key_count": str(len(keys) if keys else 1),
        "variant_titles": " | ".join(sorted(set(titles))),
        "special_variant_count": str(special_count),
        "has_special_variants": "true" if special_count > 0 else "false",
    }


def group_film_keys_by_parent(
    identities: Mapping[str, ParentFilmIdentity],
) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    for film_key, identity in identities.items():
        groups.setdefault(identity.parent_film_key, []).append(film_key)
    for parent_key in groups:
        groups[parent_key].sort()
    return groups
