"""Film runtime parsing.

Runtimes are normalized to integer minutes. Non-numeric or event-style strings
(``"ALL NIGHT LONG"``, ``"Unknown"``) return ``None`` so planners can exclude
them while explorers may still list the showtime.

This module does not infer runtime from TMDB or other metadata sources.
"""

from __future__ import annotations

import re
from typing import Any

from reel_seattle.normalize.values import normalize_optional_string

_MINUTES_ONLY_RE = re.compile(r"^(\d+)\s*(?:min\.?|minutes?)?$", re.IGNORECASE)
_H_M_RE = re.compile(
    r"^(\d+)\s*h(?:ours?)?\s*(?:(\d+)\s*m(?:in\.?|inutes?)?)?$",
    re.IGNORECASE,
)
_H_M_COMPACT_RE = re.compile(r"^(\d+)h\s*(\d+)m$", re.IGNORECASE)


def parse_runtime_minutes(value: Any) -> int | None:
    """Parse a runtime into integer minutes.

    Accepted forms include ``137``, ``137 min``, ``137 min.``, ``2h 17m``, and
    ``2h17m``. Returns ``None`` when the value is missing, a null sentinel, or
    cannot be interpreted as a length in minutes.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float):
        if value <= 0:
            return None
        return int(value)

    text = normalize_optional_string(value)
    if text is None:
        return None

    if text.isdigit():
        minutes = int(text)
        return minutes if minutes > 0 else None

    match = _MINUTES_ONLY_RE.match(text)
    if match:
        minutes = int(match.group(1))
        return minutes if minutes > 0 else None

    match = _H_M_COMPACT_RE.match(text.replace(" ", ""))
    if match:
        hours = int(match.group(1))
        mins = int(match.group(2))
        return hours * 60 + mins

    match = _H_M_RE.match(text)
    if match:
        hours = int(match.group(1))
        mins = int(match.group(2) or 0)
        return hours * 60 + mins

    # Last resort: extract the first integer before "min" anywhere in the string.
    loose = re.search(r"(\d+)\s*min", text, re.IGNORECASE)
    if loose:
        return int(loose.group(1))

    return None
