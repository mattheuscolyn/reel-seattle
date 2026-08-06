"""Premium format and presentation tag normalization.

Raw format strings from AMC or other sources are split into lowercase slug
tokens (``imax``, ``dolby-cinema``, etc.). The original raw string is not
preserved here—that remains the processor's responsibility for history CSV
columns.

This module does not validate that a format is offered for a specific showtime.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from reel_seattle.normalize.values import collapse_whitespace, normalize_optional_string

_SPLIT_RE = re.compile(r"[,;/]+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")

# Known vendor labels mapped to canonical slugs.
_KNOWN_FORMATS: dict[str, str] = {
    "imax": "imax",
    "imax 3d": "imax-3d",
    "dolby": "dolby",
    "dolby cinema": "dolby-cinema",
    "dolby atmos": "dolby-atmos",
    "prime": "prime",
    "prime at amc": "prime",
    "reald 3d": "reald-3d",
    "reald3d": "reald-3d",
    "3d": "3d",
    "closed caption": "closed-caption",
    "cc": "closed-caption",
    "open caption": "open-caption",
    "oc": "open-caption",
    "audio description": "audio-description",
    "descriptive video": "audio-description",
}


def _slugify_token(text: str) -> str:
    slug = _NON_ALNUM_RE.sub("-", text.casefold().strip()).strip("-")
    return slug


def _canonicalize_token(text: str) -> str:
    key = collapse_whitespace(text).casefold()
    if key in _KNOWN_FORMATS:
        return _KNOWN_FORMATS[key]
    slug = _slugify_token(text)
    return slug


def parse_format_tags(value: Any) -> tuple[str, ...]:
    """Parse a raw premium-format field into ordered, deduplicated slug tokens.

    Accepts a string (possibly comma-/slash-separated), a list of strings, or
    ``None``. Empty input returns an empty tuple.
    """
    if value is None:
        return ()

    parts: list[str] = []
    if isinstance(value, str):
        optional = normalize_optional_string(value)
        if optional is None:
            return ()
        parts = [part.strip() for part in _SPLIT_RE.split(optional) if part.strip()]
    elif isinstance(value, Iterable):
        for item in value:
            optional = normalize_optional_string(item)
            if optional is not None:
                parts.append(optional)
    else:
        optional = normalize_optional_string(value)
        if optional is None:
            return ()
        parts = [optional]

    seen: set[str] = set()
    result: list[str] = []
    for part in parts:
        token = _canonicalize_token(part)
        if not token or token in seen:
            continue
        seen.add(token)
        result.append(token)
    return tuple(result)
