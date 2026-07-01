"""Granular special-screening title flags for Leaving Soon modeling."""

from __future__ import annotations

import re
from typing import Mapping

from reel_seattle.analysis.amc_footprint import EVENT_TITLE_PATTERNS

FLAG_PATTERNS: dict[str, re.Pattern[str]] = {
    "anniversary_like": re.compile(
        r"\b\d+(?:st|nd|rd|th)\s+anniversary\b|anniversary",
        re.IGNORECASE,
    ),
    "fan_event_like": re.compile(
        r"fan event|opening night|early access|sneak|screen unseen|scream unseen",
        re.IGNORECASE,
    ),
    "sensory_friendly_like": re.compile(r"sensory friendly", re.IGNORECASE),
    "double_feature_like": re.compile(r"double feature", re.IGNORECASE),
    "live_encore_like": re.compile(
        r"live in (concert|theater)|encore|met opera|fathom|telemundo|ufc\b|world cup",
        re.IGNORECASE,
    ),
    "classic_rerelease_like": re.compile(
        r"studio ghibli fest|4k remaster|remastered|50th anniversary|classic",
        re.IGNORECASE,
    ),
}

STRICT_EVENT_FLAG_NAMES = tuple(FLAG_PATTERNS.keys())


def classify_special_screening_flags(title: str) -> dict[str, bool]:
    """Return auditable title-pattern flags for a film title."""
    return {name: bool(pattern.search(title)) for name, pattern in FLAG_PATTERNS.items()}


def strict_event_like_reason(title: str) -> str:
    """Pipe-delimited reasons when a title matches strict event/special patterns."""
    flags = classify_special_screening_flags(title)
    reasons = [name.replace("_like", "") for name, matched in flags.items() if matched]
    if EVENT_TITLE_PATTERNS.search(title):
        reasons.append("legacy_event_pattern")
    return "|".join(reasons)


def is_strict_event_like(title: str) -> bool:
    return bool(strict_event_like_reason(title))


def flags_to_csv_fields(title: str) -> Mapping[str, str]:
    """Map title flags to weekly-label CSV boolean columns."""
    flags = classify_special_screening_flags(title)
    return {
        "strict_event_like_flag": "true" if is_strict_event_like(title) else "false",
        "strict_event_like_reason": strict_event_like_reason(title),
        **{f"flag_{name}": "true" if matched else "false" for name, matched in flags.items()},
    }
