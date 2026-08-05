"""Title and person-name normalization for film identity matching."""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_WHITESPACE = re.compile(r"\s+")
_AND_RE = re.compile(r"\s+&\s+|\s+and\s+", re.IGNORECASE)
_DIRECTOR_LABEL_RE = re.compile(
    r"^(?:directed\s+by|director(?:s)?\s*:)\s+",
    re.IGNORECASE,
)
_SUFFIX_RE = re.compile(r"\b(jr\.?|sr\.?|ii|iii|iv)\b", re.IGNORECASE)
_INITIALS_GAP_RE = re.compile(r"\b([a-z])\.\s*", re.IGNORECASE)


def fold_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    text = "".join(
        ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
    )
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace("…", "...")
    text = _AND_RE.sub(" and ", text)
    text = text.casefold().strip()
    text = _WHITESPACE.sub(" ", text)
    return text


def normalize_title_key(value: str | None) -> str:
    """Comparable title key: fold, drop leading article, strip non-alnum."""
    text = fold_text(value)
    if not text:
        return ""
    text = re.sub(r"^(the|a|an)\s+", "", text)
    return _NON_ALNUM.sub("", text)


def title_tokens(value: str | None) -> tuple[str, ...]:
    text = fold_text(value)
    text = re.sub(r"^(the|a|an)\s+", "", text)
    parts = [p for p in _NON_ALNUM.split(text) if p]
    return tuple(parts)


def titles_equivalent(a: str | None, b: str | None) -> bool:
    return bool(normalize_title_key(a) and normalize_title_key(a) == normalize_title_key(b))


def parse_person_names(raw: str | None) -> list[str]:
    """Split a source director string into individual people."""
    if not raw:
        return []
    text = fold_text(raw)
    text = _DIRECTOR_LABEL_RE.sub("", text)
    # Normalize separators.
    text = re.sub(r"[;/]|&|\band\b", ",", text)
    people: list[str] = []
    for part in text.split(","):
        name = _normalize_person(part)
        if name and name not in people:
            people.append(name)
    return people


def person_keys(raw: str | None) -> set[str]:
    return {_person_key(name) for name in parse_person_names(raw) if _person_key(name)}


def directors_overlap(source_raw: str | None, candidate_raw: str | None) -> dict[str, object]:
    """Set-based director comparison with exact and weak surname signals."""
    src = parse_person_names(source_raw)
    cand = parse_person_names(candidate_raw)
    if not src or not cand:
        return {
            "available": False,
            "overlap": False,
            "weak_overlap": False,
            "conflict": False,
            "source_normalized": src,
            "candidate_normalized": cand,
        }
    src_keys = {_person_key(n) for n in src}
    cand_keys = {_person_key(n) for n in cand}
    overlap = bool(src_keys & cand_keys)
    weak = False
    if not overlap:
        src_surnames = {_surname(n) for n in src}
        cand_surnames = {_surname(n) for n in cand}
        shared = src_surnames & cand_surnames - {""}
        # Same surname alone is weak only when given-name/initial compatible on one pair.
        for s in src:
            for c in cand:
                if _surname(s) and _surname(s) == _surname(c) and _given_compatible(s, c):
                    weak = True
                    break
            if weak:
                break
        if shared and not weak:
            # Distinct people sharing a surname → treat as non-overlap (soft conflict).
            pass
    conflict = not overlap and not weak
    return {
        "available": True,
        "overlap": overlap,
        "weak_overlap": weak,
        "conflict": conflict,
        "source_normalized": src,
        "candidate_normalized": cand,
    }


def _normalize_person(value: str) -> str:
    text = fold_text(value)
    text = _DIRECTOR_LABEL_RE.sub("", text)
    text = _SUFFIX_RE.sub("", text)
    text = _INITIALS_GAP_RE.sub(r"\1 ", text)
    text = _WHITESPACE.sub(" ", text).strip(" ,.-")
    return text


def _person_key(name: str) -> str:
    return _NON_ALNUM.sub("", name)


def _surname(name: str) -> str:
    parts = name.split()
    return parts[-1] if parts else ""


def _given_compatible(a: str, b: str) -> bool:
    ap = a.split()
    bp = b.split()
    if len(ap) < 2 or len(bp) < 2:
        return False
    ga, gb = ap[0], bp[0]
    if ga == gb:
        return True
    if len(ga) == 1 and gb.startswith(ga):
        return True
    if len(gb) == 1 and ga.startswith(gb):
        return True
    return False
