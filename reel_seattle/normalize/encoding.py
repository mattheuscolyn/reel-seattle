"""Conservative repair for UTF-8 text that was mis-decoded as Latin-1/CP1252."""

from __future__ import annotations

import re

# High-bit Latin-1 letters that commonly appear in UTF-8→Latin-1 mojibake
# (Ã, Â, â, and C1 controls that JSON escapes as \u009c etc. after double encode).
_MOJIBAKE_MARKERS = re.compile(
    r"Ã[\x80-\xbf]|Â[\x80-\xbf]|â[\x80-\xbf]|Ã[\u0080-\u00bf]"
)


def looks_like_utf8_mojibake(value: str | None) -> bool:
    text = str(value or "")
    if not text:
        return False
    if _MOJIBAKE_MARKERS.search(text):
        return True
    # Double-encoded forms often leave C1 controls (e.g. U+009C from Ü).
    return any(0x80 <= ord(ch) <= 0x9F for ch in text)


def repair_utf8_mojibake(value: str | None) -> str:
    """If *value* looks like UTF-8 bytes decoded as Latin-1, reverse that once.

    Safe no-op when repair is impossible or does not improve the string.
    Does not change already-correct Unicode (e.g. ``SAMBA TRAORÉ``).
    """
    text = str(value or "")
    if not text or not looks_like_utf8_mojibake(text):
        return text
    try:
        repaired = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    if repaired == text:
        return text
    # Prefer repair only when markers/controls are reduced.
    if looks_like_utf8_mojibake(repaired) and _mojibake_penalty(repaired) >= _mojibake_penalty(
        text
    ):
        return text
    return repaired


def _mojibake_penalty(text: str) -> int:
    return len(_MOJIBAKE_MARKERS.findall(text)) + sum(
        1 for ch in text if 0x80 <= ord(ch) <= 0x9F
    )
