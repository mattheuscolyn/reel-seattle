"""Granular special-screening title flags and run-segment classification (PR D4).

Title patterns and small curated lists are auditable in this module. Row-level
segments combine title flags with anchor timing (e.g. December holiday windows).
"""

from __future__ import annotations

import re
from typing import Mapping

from reel_seattle.analysis.amc_footprint import EVENT_TITLE_PATTERNS

# Small curated lists for recurring AMC holiday/classic engagements.
# Document additions here; avoid one-off hardcoding in evaluation rules.
FAMILY_HOLIDAY_TITLE_SUBSTRINGS = (
    "grinch",
    "elf",
    "home alone",
    "polar express",
    "miracle on 34th",
    "nightmare before christmas",
    "rudolph",
    "frosty",
    "charlie brown christmas",
    "it's a wonderful life",
    "a christmas story",
    "die hard",  # recurring December engagement at AMC
)

HOLIDAY_RERELEASE_TITLE_SUBSTRINGS = (
    "christmas",
    "holiday",
    "yuletide",
    "winter fest",
)

AWARDS_LIMITED_TITLE_SUBSTRINGS = (
    "hamnet",
    "merrily we roll along",
    "september 5",
    "the brutalist",
    "a complete unknown",
)

ANIME_EVENT_TITLE_SUBSTRINGS = (
    "chainsaw man",
    "demon slayer",
    "studio ghibli",
    "ghibli fest",
    "one piece",
    "dragon ball",
    "jujutsu kaisen",
    "your name",
    "suzume",
)

FOREIGN_LIMITED_PATTERNS = re.compile(
    r"\b(?:hindi|tamil|telugu|malayalam|kannada|punjabi|bengali|"
    r"chinese|korean|japanese|french|spanish|italian|german)\b",
    re.IGNORECASE,
)

FLAG_PATTERNS: dict[str, re.Pattern[str]] = {
    "anniversary_like": re.compile(
        r"\b\d+(?:st|nd|rd|th)\s+anniversary\b|\banniversary\b",
        re.IGNORECASE,
    ),
    "fan_event_like": re.compile(
        r"fan event|screen unseen|scream unseen|fan screening",
        re.IGNORECASE,
    ),
    "opening_night_like": re.compile(
        r"opening night|early access|sneak preview|sneak peek",
        re.IGNORECASE,
    ),
    "sensory_friendly_like": re.compile(r"sensory friendly", re.IGNORECASE),
    "double_feature_like": re.compile(r"double feature", re.IGNORECASE),
    "live_or_concert_like": re.compile(
        r"live in (concert|theater)|encore|met opera|fathom|telemundo|ufc\b|world cup|"
        r"\bopera\b|\bballet\b|\bconcert\b",
        re.IGNORECASE,
    ),
    "classic_rerelease_like": re.compile(
        r"4k remaster|remastered|50th anniversary|classic\b|restored\b",
        re.IGNORECASE,
    ),
    "holiday_rerelease_like": re.compile(
        r"\b\d{4}\s+event\b|holiday engagement|seasonal engagement|christmas event",
        re.IGNORECASE,
    ),
    "anime_event_like": re.compile(
        r"anime|manga|chainsaw man|demon slayer|ghibli|one piece",
        re.IGNORECASE,
    ),
    "awards_limited_like": re.compile(
        r"limited engagement|awards season|for your consideration|academy screening",
        re.IGNORECASE,
    ),
    "foreign_limited_like": FOREIGN_LIMITED_PATTERNS,
    "special_event_like": re.compile(
        r"\bevent\b|special presentation|one[\s-]?night|screening event",
        re.IGNORECASE,
    ),
}

SPECIAL_FLAG_NAMES = tuple(FLAG_PATTERNS.keys())

# Legacy alias used in PR D3 columns.
LEGACY_FLAG_ALIASES = {
    "live_encore_like": "live_or_concert_like",
}


def _title_has_substring(title: str, needles: tuple[str, ...]) -> bool:
    lowered = title.lower()
    return any(needle in lowered for needle in needles)


def classify_special_screening_flags(title: str) -> dict[str, bool]:
    """Return auditable title-pattern flags for a film title."""
    flags = {name: bool(pattern.search(title)) for name, pattern in FLAG_PATTERNS.items()}
    if _title_has_substring(title, FAMILY_HOLIDAY_TITLE_SUBSTRINGS):
        flags["family_holiday_like"] = True
    else:
        flags["family_holiday_like"] = False

    if flags["holiday_rerelease_like"] or (
        _title_has_substring(title, HOLIDAY_RERELEASE_TITLE_SUBSTRINGS)
        and re.search(r"\b(19|20)\d{2}\b", title)
    ):
        flags["holiday_rerelease_like"] = True

    if _title_has_substring(title, AWARDS_LIMITED_TITLE_SUBSTRINGS):
        flags["awards_limited_like"] = True

    if _title_has_substring(title, ANIME_EVENT_TITLE_SUBSTRINGS):
        flags["anime_event_like"] = True

    if EVENT_TITLE_PATTERNS.search(title):
        flags["special_event_like"] = True

    # Aggregate special: any non-normal signal.
    flags["probable_normal_first_run"] = not is_special_limited_title(flags)
    return flags


def is_special_limited_title(flags: Mapping[str, bool]) -> bool:
    """True when title flags indicate a non-standard theatrical run."""
    special_keys = (
        "anniversary_like",
        "fan_event_like",
        "opening_night_like",
        "sensory_friendly_like",
        "double_feature_like",
        "live_or_concert_like",
        "classic_rerelease_like",
        "holiday_rerelease_like",
        "anime_event_like",
        "awards_limited_like",
        "foreign_limited_like",
        "family_holiday_like",
        "special_event_like",
    )
    return any(flags.get(key) for key in special_keys)


def strict_event_like_reason(title: str) -> str:
    """Pipe-delimited reasons when a title matches strict event/special patterns."""
    flags = classify_special_screening_flags(title)
    reasons = [name.replace("_like", "") for name, matched in flags.items() if matched]
    if EVENT_TITLE_PATTERNS.search(title):
        reasons.append("legacy_event_pattern")
    return "|".join(sorted(set(reasons)))


def is_strict_event_like(title: str) -> bool:
    flags = classify_special_screening_flags(title)
    return is_special_limited_title(flags)


def classify_run_type(title: str, *, anchor_month: str = "") -> str:
    """Human-readable primary run type for error audits."""
    flags = classify_special_screening_flags(title)
    if flags.get("family_holiday_like"):
        return "family_holiday_title"
    if flags.get("holiday_rerelease_like") or (
        anchor_month.endswith("-12") and flags.get("classic_rerelease_like")
    ):
        return "holiday_re_release"
    if flags.get("anniversary_like"):
        return "anniversary_re_release"
    if flags.get("classic_rerelease_like"):
        return "classic_revival"
    if flags.get("fan_event_like"):
        return "fan_event"
    if flags.get("opening_night_like"):
        return "opening_night"
    if flags.get("live_or_concert_like"):
        return "concert_live_encore"
    if flags.get("anime_event_like"):
        return "anime_special_engagement"
    if flags.get("awards_limited_like"):
        return "awards_season_limited"
    if flags.get("foreign_limited_like"):
        return "foreign_language_limited"
    if flags.get("sensory_friendly_like"):
        return "sensory_friendly"
    if flags.get("double_feature_like"):
        return "double_feature"
    if flags.get("special_event_like"):
        return "special_event"
    if flags.get("probable_normal_first_run"):
        return "normal_first_run"
    return "unknown"


def assign_run_segment(title: str, *, anchor_month: str = "") -> str:
    """Evaluation segment bucket for segmentation experiments."""
    flags = classify_special_screening_flags(title)
    if flags.get("family_holiday_like") or (
        anchor_month.endswith("-12")
        and (flags.get("holiday_rerelease_like") or flags.get("classic_rerelease_like"))
    ):
        return "holiday_family_rerelease"
    if is_special_limited_title(flags):
        return "special_limited_run"
    return "normal_first_run"


def _parse_bool(text: str) -> bool:
    return str(text).strip().lower() == "true"


def assign_row_segment(row: Mapping[str, str]) -> str:
    """Row-level segment using stored flags when present, else recompute from title."""
    stored = str(row.get("run_segment", "")).strip()
    if stored:
        return stored
    anchor_month = str(row.get("anchor_date", ""))[:7]
    if str(row.get("flag_probable_normal_first_run", "")).strip().lower() == "true":
        return "normal_first_run"
    if _parse_bool(row.get("flag_family_holiday_like", "false")) or _parse_bool(
        row.get("flag_holiday_rerelease_like", "false")
    ):
        return "holiday_family_rerelease"
    if _parse_bool(row.get("strict_event_like_flag", "false")) or _parse_bool(
        row.get("flag_special_event_like", "false")
    ):
        return "special_limited_run"
    return assign_run_segment(row.get("film_title", ""), anchor_month=anchor_month)


def is_holiday_family_december(row: Mapping[str, str]) -> bool:
    anchor_month = str(row.get("anchor_date", ""))[:7]
    if not anchor_month.endswith("-12"):
        return False
    segment = assign_row_segment(row)
    return segment == "holiday_family_rerelease"


def flags_to_csv_fields(title: str, *, anchor_date: str = "") -> Mapping[str, str]:
    """Map title flags to weekly-label CSV boolean columns."""
    flags = classify_special_screening_flags(title)
    anchor_month = anchor_date[:7] if anchor_date else ""
    run_segment = assign_run_segment(title, anchor_month=anchor_month)
    run_type = classify_run_type(title, anchor_month=anchor_month)
    return {
        "strict_event_like_flag": "true" if is_strict_event_like(title) else "false",
        "strict_event_like_reason": strict_event_like_reason(title),
        "run_segment": run_segment,
        "run_type": run_type,
        **{f"flag_{name}": "true" if matched else "false" for name, matched in flags.items()},
        # PR D3 legacy column name maps to live_or_concert_like.
        "flag_live_encore_like": "true" if flags.get("live_or_concert_like") else "false",
    }
