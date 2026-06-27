"""Showtime clock parsing and formatting.

Canonical storage uses 24-hour ``HH:MM``. Display strings use 12-hour ``h:mm AM/PM``
with a space before the meridiem.

This module does not interpret show dates or timezones—it operates on clock times
within a single calendar day.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from reel_seattle.normalize.values import normalize_optional_string

_TIME_12H_RE = re.compile(
    r"^(\d{1,2}):(\d{2})\s*([AP]M)$",
    re.IGNORECASE,
)
_TIME_24H_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


@dataclass(frozen=True, slots=True)
class ParsedTime:
    """Normalized representation of a single clock time."""

    minutes_since_midnight: int
    time_24h: str
    time_display: str


def _minutes_to_parts(minutes: int) -> tuple[int, int]:
    if minutes < 0 or minutes >= 24 * 60:
        msg = f"minutes_since_midnight out of range: {minutes}"
        raise ValueError(msg)
    return divmod(minutes, 60)


def format_time_24h(minutes_since_midnight: int) -> str:
    """Format minutes since midnight as zero-padded ``HH:MM``."""
    hours, mins = _minutes_to_parts(minutes_since_midnight)
    return f"{hours:02d}:{mins:02d}"


def format_time_display(minutes_since_midnight: int) -> str:
    """Format minutes since midnight as ``h:mm AM/PM``."""
    hours, mins = _minutes_to_parts(minutes_since_midnight)
    meridiem = "AM" if hours < 12 else "PM"
    display_hour = hours % 12
    if display_hour == 0:
        display_hour = 12
    return f"{display_hour}:{mins:02d} {meridiem}"


def parsed_time_from_minutes(minutes_since_midnight: int) -> ParsedTime:
    """Build a :class:`ParsedTime` from minutes since midnight."""
    return ParsedTime(
        minutes_since_midnight=minutes_since_midnight,
        time_24h=format_time_24h(minutes_since_midnight),
        time_display=format_time_display(minutes_since_midnight),
    )


def parse_time(value: Any) -> ParsedTime | None:
    """Parse a showtime clock string into canonical and display forms.

    Accepted inputs include ``7:30PM``, ``7:30 PM``, ``07:30PM``, and ``19:30``.
    Seconds, if present, are not supported and will cause parsing to fail.
    """
    text = normalize_optional_string(value)
    if text is None:
        return None

    normalized = re.sub(r"\s+", "", text).upper()
    # Re-insert optional space pattern by trying both collapsed and original.
    candidates = [text.strip(), normalized]
    for candidate in candidates:
        match_12h = _TIME_12H_RE.match(candidate.replace(" ", ""))
        if match_12h:
            hour = int(match_12h.group(1))
            minute = int(match_12h.group(2))
            meridiem = match_12h.group(3).upper()
            if minute >= 60:
                return None
            if meridiem == "AM":
                if hour == 12:
                    hour = 0
                elif hour > 12:
                    return None
            else:
                if hour == 12:
                    hour = 12
                elif hour < 12:
                    hour += 12
                elif hour > 12:
                    return None
            minutes = hour * 60 + minute
            return parsed_time_from_minutes(minutes)

    for candidate in candidates:
        match_24h = _TIME_24H_RE.match(candidate)
        if match_24h:
            hour = int(match_24h.group(1))
            minute = int(match_24h.group(2))
            if hour >= 24 or minute >= 60:
                return None
            # Without AM/PM, only accept unambiguous 24-hour values (13:00–23:59, 00:xx).
            if hour != 0 and hour < 13:
                return None
            return parsed_time_from_minutes(hour * 60 + minute)

    return None


def parse_time_to_minutes(value: Any) -> int | None:
    """Return minutes since midnight, or ``None`` if parsing fails."""
    parsed = parse_time(value)
    if parsed is None:
        return None
    return parsed.minutes_since_midnight
