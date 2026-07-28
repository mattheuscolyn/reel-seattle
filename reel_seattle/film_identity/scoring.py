"""Deterministic TMDB candidate scoring."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    REVIEW_MIN_SCORE,
    RUNTIME_PROXIMITY_MAX_MIN,
    YEAR_PROXIMITY_MAX,
)

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class ScoredCandidate:
    tmdb_id: int
    score: float
    signals: dict[str, Any]
    warnings: tuple[str, ...]
    title: str | None = None
    original_title: str | None = None
    release_year: int | None = None
    runtime_min: int | None = None
    popularity: float | None = None
    poster_path: str | None = None
    overview_excerpt: str | None = None
    director: str | None = None


def normalize_title_key(value: str | None) -> str:
    if not value:
        return ""
    text = value.casefold().strip()
    text = re.sub(r"^(the|a|an)\s+", "", text)
    return _NON_ALNUM.sub("", text)


def score_candidate(
    *,
    search_title: str,
    source_year: int | None,
    source_runtime: int | None,
    source_directors: str | None,
    source_external_ids: Mapping[str, str] | None,
    candidate: Mapping[str, Any],
) -> ScoredCandidate:
    """Score one TMDB movie candidate against source facts."""
    tmdb_id = int(candidate["id"])
    title = _as_str(candidate.get("title"))
    original = _as_str(candidate.get("original_title"))
    release_year = _year_from_candidate(candidate)
    runtime = _as_int(candidate.get("runtime"))
    popularity = _as_float(candidate.get("popularity"))
    poster = _as_str(candidate.get("poster_path"))
    overview = _excerpt(_as_str(candidate.get("overview")))
    director = _as_str(candidate.get("director"))

    search_key = normalize_title_key(search_title)
    title_key = normalize_title_key(title)
    original_key = normalize_title_key(original)

    title_exact = bool(search_key) and search_key == title_key
    original_exact = bool(search_key) and search_key == original_key and not title_exact
    title_conflict = bool(search_key and title_key and search_key != title_key and not original_exact)

    year_exact = (
        source_year is not None
        and release_year is not None
        and source_year == release_year
    )
    year_near = False
    year_conflict = False
    if source_year is not None and release_year is not None and not year_exact:
        delta = abs(source_year - release_year)
        year_near = delta <= YEAR_PROXIMITY_MAX
        year_conflict = delta > YEAR_PROXIMITY_MAX

    runtime_delta = None
    runtime_near = False
    runtime_conflict = False
    if source_runtime is not None and runtime is not None:
        runtime_delta = abs(int(source_runtime) - int(runtime))
        runtime_near = runtime_delta <= RUNTIME_PROXIMITY_MAX_MIN
        runtime_conflict = runtime_delta > max(RUNTIME_PROXIMITY_MAX_MIN * 2, 25)

    external_exact = False
    if source_external_ids:
        cand_ext = candidate.get("external_ids") or {}
        if isinstance(cand_ext, Mapping):
            for key, value in source_external_ids.items():
                if value and str(cand_ext.get(key) or "") == str(value):
                    external_exact = True
                    break

    director_overlap = False
    if source_directors and director:
        src_bits = {normalize_title_key(p) for p in re.split(r"[,;/]", source_directors) if p.strip()}
        dir_key = normalize_title_key(director)
        director_overlap = bool(dir_key and dir_key in src_bits)

    adult = bool(candidate.get("adult"))
    media_type = _as_str(candidate.get("media_type")) or "movie"

    warnings: list[str] = []
    score = 0.0

    if external_exact:
        score += 0.70
    if title_exact:
        score += 0.45
    elif original_exact:
        score += 0.38
        warnings.append("matched_original_title")
    elif title_conflict and not external_exact:
        score -= 0.35
        warnings.append("title_conflict")

    if year_exact:
        score += 0.30
    elif year_near:
        score += 0.10
        warnings.append("year_proximity")
    elif year_conflict:
        score -= 0.30
        warnings.append("year_conflict")

    if runtime_near:
        score += 0.10
    elif runtime_conflict:
        score -= 0.20
        warnings.append("runtime_conflict")

    if director_overlap:
        score += 0.05

    if adult:
        score -= 0.5
        warnings.append("adult_flag")
    if media_type != "movie":
        score -= 0.5
        warnings.append("non_movie_media_type")

    # Popularity is tie-break only — tiny epsilon, never overrides conflicts.
    if popularity is not None:
        score += min(0.01, float(popularity) / 100000.0)

    # Strong corroboration floors.
    if external_exact:
        score = max(score, AUTO_CONFIRM_MIN_SCORE)
    elif title_exact and year_exact:
        score = max(score, AUTO_CONFIRM_MIN_SCORE)

    score = max(0.0, min(1.0, score))

    # Same-title remake ambiguity: title exact without year/external corroboration.
    if title_exact and source_year is None and not external_exact:
        warnings.append("remake_ambiguity")
        score = min(score, REVIEW_MIN_SCORE + 0.2)

    if (year_conflict or runtime_conflict or (title_conflict and not external_exact)) and not external_exact:
        # Hard conflicts cannot auto-confirm.
        score = min(score, AUTO_CONFIRM_MIN_SCORE - 0.01)

    signals = {
        "title_exact": title_exact,
        "original_title_exact": original_exact,
        "title_conflict": title_conflict,
        "year_exact": year_exact,
        "year_near": year_near,
        "year_conflict": year_conflict,
        "runtime_delta_minutes": runtime_delta,
        "runtime_near": runtime_near,
        "runtime_conflict": runtime_conflict,
        "external_id_exact": external_exact,
        "director_overlap": director_overlap,
        "popularity": popularity,
    }

    return ScoredCandidate(
        tmdb_id=tmdb_id,
        score=round(score, 4),
        signals=signals,
        warnings=tuple(warnings),
        title=title,
        original_title=original if original and original != title else None,
        release_year=release_year,
        runtime_min=runtime,
        popularity=popularity,
        poster_path=poster,
        overview_excerpt=overview,
        director=director,
    )


def rank_candidates(
    scored: Sequence[ScoredCandidate],
) -> list[ScoredCandidate]:
    """Stable rank: score desc, then tmdb_id asc."""
    return sorted(scored, key=lambda c: (-c.score, c.tmdb_id))


def classify_match_bucket(
    ranked: Sequence[ScoredCandidate],
    *,
    rejected_ids: set[int] | None = None,
) -> tuple[str, ScoredCandidate | None]:
    """Return (bucket, proposed) where bucket is auto|review|unmatched."""
    rejected = rejected_ids or set()
    usable = [c for c in ranked if c.tmdb_id not in rejected]
    if not usable:
        return "unmatched", None
    top = usable[0]
    if top.score >= AUTO_CONFIRM_MIN_SCORE and _auto_confirm_allowed(top):
        # Remake ambiguity: another close same-title candidate blocks auto.
        close = [
            c
            for c in usable[1:5]
            if c.score >= REVIEW_MIN_SCORE
            and c.signals.get("title_exact")
            and c.release_year != top.release_year
        ]
        if close:
            return "review", top
        return "auto", top
    if top.score >= REVIEW_MIN_SCORE:
        return "review", top
    return "unmatched", top


def _auto_confirm_allowed(candidate: ScoredCandidate) -> bool:
    if "remake_ambiguity" in candidate.warnings:
        return False
    if candidate.signals.get("year_conflict") or candidate.signals.get("runtime_conflict"):
        return False
    if candidate.signals.get("title_conflict"):
        return False
    if candidate.signals.get("external_id_exact"):
        return True
    if candidate.signals.get("title_exact") and candidate.signals.get("year_exact"):
        return True
    if candidate.signals.get("title_exact") and candidate.signals.get("runtime_near") and candidate.signals.get("year_near"):
        return True
    return False


def _year_from_candidate(candidate: Mapping[str, Any]) -> int | None:
    for key in ("release_year", "year"):
        value = candidate.get(key)
        if isinstance(value, int):
            return value
    date = _as_str(candidate.get("release_date"))
    if date and len(date) >= 4 and date[:4].isdigit():
        return int(date[:4])
    return None


def _as_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _as_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _excerpt(text: str | None, limit: int = 220) -> str | None:
    if not text:
        return None
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"
