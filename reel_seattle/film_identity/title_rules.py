"""Version-controlled title alias + program-series prefix rules for TMDB search prep."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.validate import PROJECT_ROOT

PREFIXES_REL = "data/film_identity/program_series_prefixes.json"
ALIASES_REL = "data/film_identity/title_search_aliases.json"

_SEP = r"\s*[:–—-]\s*"


@dataclass(frozen=True)
class AliasHit:
    alias_id: str
    source_title: str
    search_title: str
    labels: tuple[str, ...] = ()


@dataclass(frozen=True)
class SeriesPrefixHit:
    prefix_id: str
    prefix: str
    remainder: str
    metadata_field: str = "program_series"


def _load_json(rel: str, *, root: Path | None = None) -> dict[str, Any]:
    path = (root or PROJECT_ROOT) / rel
    if not path.exists():
        return {"schema_version": "1.0.0"}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=4)
def load_program_series_prefixes(*, root: str | None = None) -> dict[str, Any]:
    return _load_json(PREFIXES_REL, root=Path(root) if root else None)


@lru_cache(maxsize=4)
def load_title_search_aliases(*, root: str | None = None) -> dict[str, Any]:
    return _load_json(ALIASES_REL, root=Path(root) if root else None)


def clear_title_rules_cache() -> None:
    load_program_series_prefixes.cache_clear()
    load_title_search_aliases.cache_clear()


def _source_allowed(entry_sources: Sequence[str] | None, source: str | None) -> bool:
    if not entry_sources:
        return True
    if not source:
        # Scoped rules require a source when configured.
        return False
    return str(source).strip().casefold() in {
        str(s).strip().casefold() for s in entry_sources if s
    }


def lookup_exact_alias(
    title: str | None,
    *,
    source: str | None = None,
    root: Path | None = None,
) -> AliasHit | None:
    text = (title or "").strip()
    if not text:
        return None
    doc = load_title_search_aliases(root=str(root) if root else None)
    folded = text.casefold()
    for row in doc.get("aliases") or []:
        if not isinstance(row, Mapping):
            continue
        src_title = str(row.get("source_title") or "").strip()
        search = str(row.get("search_title") or "").strip()
        if not src_title or not search:
            continue
        if src_title.casefold() != folded:
            continue
        if not _source_allowed(row.get("sources"), source):
            continue
        labels = tuple(
            str(x) for x in (row.get("preserve_presentation_labels") or []) if x
        )
        return AliasHit(
            alias_id=str(row.get("id") or src_title),
            source_title=src_title,
            search_title=search,
            labels=labels,
        )
    return None


def apply_program_series_prefix(
    title: str | None,
    *,
    source: str | None = None,
    root: Path | None = None,
) -> SeriesPrefixHit | None:
    text = (title or "").strip()
    if not text:
        return None
    doc = load_program_series_prefixes(root=str(root) if root else None)
    for row in doc.get("prefixes") or []:
        if not isinstance(row, Mapping):
            continue
        prefix = str(row.get("prefix") or "").strip()
        if not prefix:
            continue
        if not _source_allowed(row.get("sources"), source):
            continue
        pattern = re.compile(
            rf"^{re.escape(prefix)}{_SEP}(?P<body>.+)$",
            re.IGNORECASE,
        )
        match = pattern.match(text)
        if not match:
            continue
        body = match.group("body").strip()
        if not body:
            continue
        return SeriesPrefixHit(
            prefix_id=str(row.get("id") or prefix),
            prefix=prefix,
            remainder=body,
            metadata_field=str(row.get("metadata_field") or "program_series"),
        )
    return None


def preview_prefix_impacts(
    titles: Sequence[str],
    *,
    source: str | None = None,
    root: Path | None = None,
) -> list[dict[str, Any]]:
    """Report every title each registered prefix would affect (before applying)."""
    doc = load_program_series_prefixes(root=str(root) if root else None)
    out: list[dict[str, Any]] = []
    for row in doc.get("prefixes") or []:
        if not isinstance(row, Mapping):
            continue
        prefix = str(row.get("prefix") or "").strip()
        if not prefix:
            continue
        if not _source_allowed(row.get("sources"), source) and source is not None:
            # When previewing a specific source, skip non-matching scopes.
            continue
        affected: list[dict[str, str]] = []
        pattern = re.compile(
            rf"^{re.escape(prefix)}{_SEP}(?P<body>.+)$",
            re.IGNORECASE,
        )
        for title in titles:
            match = pattern.match(str(title or "").strip())
            if not match:
                continue
            affected.append(
                {
                    "original": str(title),
                    "remainder": match.group("body").strip(),
                }
            )
        out.append(
            {
                "prefix_id": row.get("id"),
                "prefix": prefix,
                "sources": list(row.get("sources") or []),
                "affected_count": len(affected),
                "affected": affected,
            }
        )
    return out


# Complete trailing event phrases (never token-delete mid-title).
_EVENT_SUFFIX_RES: tuple[re.Pattern[str], ...] = (
    # "…: Special Broken Lizard Fan Event"
    re.compile(
        r"^(?P<head>.+?)(?P<sep>\s*[:–—-]\s+)(?P<event>Special\s+.+\s+Fan Event)\s*$",
        re.IGNORECASE,
    ),
    # "…: Fan Event" / "… Fan Event"
    re.compile(
        r"^(?P<head>.+?)(?P<sep>\s*[:–—-]\s+|\s+)(?P<event>Fan Event)\s*$",
        re.IGNORECASE,
    ),
    # "… Early Access – Green Day Intro + Bonus Performance"
    re.compile(
        r"^(?P<head>.+?)(?P<sep>\s+)(?P<event>Early Access(?:\s*[–—:-]\s*.+)?)\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?P<head>.+?)(?P<sep>\s*[:–—-]\s+)(?P<event>Early Access(?:\s*[–—:-]\s*.+)?)\s*$",
        re.IGNORECASE,
    ),
    # Trailing bonus / intro performance clauses after a separator.
    re.compile(
        r"^(?P<head>.+?)(?P<sep>\s*[:–—-]\s+|\s+)(?P<event>"
        r"(?:Green Day\s+)?Intro(?:duction)?\s*\+\s*Bonus Performance|"
        r"Bonus Performance|"
        r"Post[- ]?Film(?:\s+Performance)?|"
        r"(?:Live\s+)?Intro(?:duction)?(?:\s+Performance)?"
        r")\s*$",
        re.IGNORECASE,
    ),
)


def strip_recognized_event_suffix(title: str | None) -> tuple[str | None, str | None]:
    """Remove one complete trailing event phrase; return (head, removed_event)."""
    text = (title or "").strip()
    if not text:
        return None, None
    for pattern in _EVENT_SUFFIX_RES:
        match = pattern.match(text)
        if not match:
            continue
        head = match.group("head").strip()
        event = match.group("event").strip()
        if not head or len(head) < 2:
            continue
        # Guard: do not treat a bare registered-looking head as empty film.
        return head, event
    return text, None


def is_event_suffix_segment(segment: str | None) -> bool:
    """True when a separator tail is entirely a recognized event phrase."""
    text = (segment or "").strip()
    if not text:
        return False
    probe = f"Title: {text}"
    head, event = strip_recognized_event_suffix(probe)
    return bool(event) and (head or "").casefold() == "title"
