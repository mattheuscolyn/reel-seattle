"""Parse NWFF child short metadata blocks. Parsing failure never drops membership."""

from __future__ import annotations

import re
from dataclasses import dataclass


_YEAR_RE = re.compile(r"^(18|19|20)\d{2}$")
_RUNTIME_RE = re.compile(r"^(\d+)\s*min\.?$", re.IGNORECASE)
# Language may itself contain commas; extract from the full metadata string first.
_LANGUAGE_TAIL_RE = re.compile(
    r"(?:,\s*)((?:in\s+.+|no dialogue))\s*$",
    re.IGNORECASE,
)
_REGION_ABBR_RE = re.compile(
    r"^(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|"
    r"O[HKR]|P[AWR]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY]|BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)$",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ParsedChildMetadata:
    title: str | None = None
    directors: tuple[str, ...] = ()
    year: int | None = None
    runtime_min: int | None = None
    location_text: str | None = None
    language: str | None = None
    description: str | None = None
    metadata_line: str | None = None


def split_child_text_blocks(raw_text: str) -> tuple[str, str]:
    """Split text-editor body into metadata line + description paragraphs."""
    text = (raw_text or "").strip()
    if not text:
        return "", ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return "", ""
    first = lines[0]
    if first.startswith("(") and first.endswith(")"):
        return first, "\n".join(lines[1:]).strip()
    return "", text


def parse_child_metadata_line(metadata_line: str) -> ParsedChildMetadata:
    """Parse `(Directors, Location, Year, Runtime, in Language)` from the end.

    Directors may contain commas, so fields are peeled right-to-left.
    Incomplete lines return whatever could be confidently peeled.
    """
    raw = (metadata_line or "").strip()
    if not raw:
        return ParsedChildMetadata()
    inner = raw
    if inner.startswith("(") and inner.endswith(")"):
        inner = inner[1:-1].strip()
    if not inner:
        return ParsedChildMetadata(metadata_line=raw)

    language = None
    language_match = _LANGUAGE_TAIL_RE.search(inner)
    if language_match:
        language = language_match.group(1).strip()
        if language.casefold().startswith("in "):
            language = language[3:].strip()
        inner = inner[: language_match.start()].rstrip(" ,")

    parts = [part.strip() for part in inner.split(",") if part.strip()]
    if not parts and language is None:
        return ParsedChildMetadata(metadata_line=raw)

    runtime_min = None
    year = None
    location_text = None
    directors: list[str] = []

    # Peel runtime
    if parts and _RUNTIME_RE.match(parts[-1]):
        runtime_min = int(_RUNTIME_RE.match(parts[-1]).group(1))  # type: ignore[union-attr]
        parts = parts[:-1]

    # Peel year
    if parts and _YEAR_RE.match(parts[-1]):
        year = int(parts[-1])
        parts = parts[:-1]

    # Remaining: directors..., optional location (may include region abbreviation).
    if len(parts) >= 2 and _REGION_ABBR_RE.match(parts[-1]):
        location_text = f"{parts[-2]}, {parts[-1]}"
        directors = [part for part in parts[:-2] if part]
    elif len(parts) >= 2:
        location_text = parts[-1]
        directors = [part for part in parts[:-1] if part]
    elif len(parts) == 1:
        # After year/runtime/language peels, a single leftover is the director.
        # Location-only rows without a director are not observed in NWFF programs.
        directors = [parts[0]]

    return ParsedChildMetadata(
        directors=tuple(directors),
        year=year,
        runtime_min=runtime_min,
        location_text=location_text,
        language=language,
        metadata_line=raw,
    )


def parse_child_block(*, title: str, text_editor: str) -> ParsedChildMetadata:
    metadata_line, description = split_child_text_blocks(text_editor)
    parsed = parse_child_metadata_line(metadata_line)
    return ParsedChildMetadata(
        title=(title or "").strip() or None,
        directors=parsed.directors,
        year=parsed.year,
        runtime_min=parsed.runtime_min,
        location_text=parsed.location_text,
        language=parsed.language,
        description=description or None,
        metadata_line=parsed.metadata_line,
    )
