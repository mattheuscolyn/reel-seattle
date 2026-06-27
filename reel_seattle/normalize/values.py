"""String and sentinel normalization shared across the pipeline.

This module handles generic value cleanup (null sentinels, booleans, whitespace).
It does not interpret domain-specific fields such as dates, times, or film titles.
"""

from __future__ import annotations

import re
from typing import Any

# Case-insensitive sentinels that should become absent values in normalized output.
NULL_STRINGS = frozenset({"", "none", "unknown", "n/a", "na", "null"})

_WHITESPACE_RE = re.compile(r"\s+")


def collapse_whitespace(value: str) -> str:
    """Strip leading/trailing whitespace and collapse internal runs to a single space."""
    return _WHITESPACE_RE.sub(" ", value.strip())


def normalize_optional_string(value: Any) -> str | None:
    """Return a cleaned string, or ``None`` if *value* is missing or a null sentinel.

    Literal strings such as ``"None"`` and ``"Unknown"`` (any casing) become ``None``.
    Non-string inputs are converted with ``str()`` when truthy after strip.
    """
    if value is None:
        return None
    if isinstance(value, str):
        text = collapse_whitespace(value)
    else:
        text = collapse_whitespace(str(value))
    if not text:
        return None
    if text.casefold() in NULL_STRINGS:
        return None
    return text


def normalize_bool_string(value: Any, *, default: bool = False) -> bool:
    """Parse booleans from CSV/API strings.

  Recognizes ``true``/``false``, ``1``/``0``, and ``yes``/``no`` (case-insensitive).
  Empty or null-sentinel strings return *default*.
    """
    optional = normalize_optional_string(value)
    if optional is None:
        return default
    lowered = optional.casefold()
    if lowered in {"true", "1", "yes"}:
        return True
    if lowered in {"false", "0", "no"}:
        return False
    return default


def empty_to_none(value: str | None) -> str | None:
    """Return ``None`` for blank strings; otherwise return *value* unchanged."""
    if value is None:
        return None
    if not value.strip():
        return None
    return value
