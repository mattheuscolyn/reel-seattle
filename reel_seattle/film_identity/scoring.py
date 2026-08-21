"""Deterministic TMDB candidate scoring (available-evidence model, T-FILMID-01E)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    REMAKE_RUNTIME_AUTO_MARGIN_MIN,
    REVIEW_MIN_SCORE,
    RUNTIME_COMPATIBLE_MAX_MIN,
    RUNTIME_CONFLICT_MIN,
    RUNTIME_PROXIMITY_MAX_MIN,
    RUNTIME_SOFT_MAX_MIN,
    TOP_CANDIDATE_MARGIN_MIN,
    WEIGHT_DIRECTOR_OVERLAP,
    WEIGHT_DIRECTOR_WEAK,
    WEIGHT_EXTERNAL_EXACT,
    WEIGHT_ORIGINAL_EXACT,
    WEIGHT_RUNTIME_NEAR,
    WEIGHT_TITLE_EXACT,
    WEIGHT_YEAR_EXACT,
    WEIGHT_YEAR_NEAR,
    YEAR_PROXIMITY_MAX,
)
from reel_seattle.film_identity.normalize_text import (
    directors_overlap,
    normalize_title_key,
    title_tokens,
)

# Re-export for existing callers/tests.
__all__ = [
    "ScoredCandidate",
    "classify_match_bucket",
    "normalize_title_key",
    "rank_candidates",
    "score_candidate",
    "top_candidate_margin",
]


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


def score_candidate(
    *,
    search_title: str,
    source_year: int | None,
    source_runtime: int | None,
    source_directors: str | None,
    source_external_ids: Mapping[str, str] | None,
    candidate: Mapping[str, Any],
    event_year_relaxed: bool = False,
) -> ScoredCandidate:
    """Score one TMDB movie candidate against available source evidence.

    Score = matched_weight / available_weight (missing signals are omitted).
    Hard conflicts are tracked separately and block auto-confirm.
    """
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
    search_tokens = title_tokens(search_title)
    title_toks = title_tokens(title)

    title_exact = bool(search_key) and search_key == title_key
    original_exact = bool(search_key) and search_key == original_key and not title_exact
    token_equal = bool(search_tokens) and search_tokens == title_toks and not title_exact
    title_conflict = bool(
        search_key and title_key and search_key != title_key and not original_exact and not token_equal
    )

    year_status = "unavailable"
    year_exact = False
    year_near = False
    year_conflict = False
    if source_year is not None and release_year is not None:
        year_status = "comparable"
        if source_year == release_year:
            year_exact = True
            year_status = "match"
        else:
            delta = abs(source_year - release_year)
            if delta <= YEAR_PROXIMITY_MAX:
                year_near = True
                year_status = "near"
            elif event_year_relaxed:
                # Presentation/event year was neutralized upstream; do not hard-conflict.
                year_status = "unavailable"
            else:
                year_conflict = True
                year_status = "conflict"

    runtime_delta = None
    runtime_near = False
    runtime_soft = False
    runtime_conflict = False
    runtime_status = "unavailable"
    runtime_soft_weight = 0.0
    if source_runtime is not None and runtime is not None:
        runtime_delta = abs(int(source_runtime) - int(runtime))
        runtime_status = "comparable"
        if runtime_delta <= RUNTIME_COMPATIBLE_MAX_MIN:
            runtime_near = True
            runtime_status = "match"
        elif runtime_delta <= RUNTIME_SOFT_MAX_MIN:
            runtime_soft = True
            # Gradual soft credit from just-over-compatible → soft max.
            span = max(1, RUNTIME_SOFT_MAX_MIN - RUNTIME_COMPATIBLE_MAX_MIN)
            soft_factor = max(
                0.0,
                1.0 - ((runtime_delta - RUNTIME_COMPATIBLE_MAX_MIN) / span),
            )
            runtime_soft_weight = round(WEIGHT_RUNTIME_NEAR * soft_factor, 4)
            runtime_status = "soft"
        elif runtime_delta >= RUNTIME_CONFLICT_MIN:
            runtime_conflict = True
            runtime_status = "conflict"
        else:
            runtime_status = "miss"

    external_exact = False
    if source_external_ids:
        cand_ext = candidate.get("external_ids") or {}
        if isinstance(cand_ext, Mapping):
            for key, value in source_external_ids.items():
                if value and str(cand_ext.get(key) or "") == str(value):
                    external_exact = True
                    break

    director_info = directors_overlap(source_directors, director)
    director_overlap = bool(director_info["overlap"])
    director_weak = bool(director_info["weak_overlap"])
    director_conflict = bool(director_info["conflict"])
    director_status = (
        "unavailable"
        if not director_info["available"]
        else "match"
        if director_overlap
        else "weak"
        if director_weak
        else "conflict"
    )

    adult = bool(candidate.get("adult"))
    media_type = _as_str(candidate.get("media_type")) or "movie"

    warnings: list[str] = []
    matched = 0.0
    available = 0.0
    contributions: dict[str, dict[str, float | str | bool]] = {}

    def add_signal(name: str, weight: float, *, hit: bool, kind: str) -> None:
        nonlocal matched, available
        available += weight
        if hit:
            matched += weight
        contributions[name] = {
            "weight": weight,
            "matched": hit,
            "kind": kind,
        }

    if external_exact:
        add_signal("external_id_exact", WEIGHT_EXTERNAL_EXACT, hit=True, kind="match")

    if search_key and (title_key or original_key):
        if title_exact or token_equal:
            add_signal("title_exact", WEIGHT_TITLE_EXACT, hit=True, kind="match")
        elif original_exact:
            add_signal("original_title_exact", WEIGHT_ORIGINAL_EXACT, hit=True, kind="match")
            warnings.append("matched_original_title")
        elif title_conflict and not external_exact:
            add_signal("title_exact", WEIGHT_TITLE_EXACT, hit=False, kind="conflict")
            warnings.append("title_conflict")
        else:
            add_signal("title_exact", WEIGHT_TITLE_EXACT, hit=False, kind="miss")

    if year_status in {"match", "near", "conflict", "comparable"}:
        if year_exact:
            add_signal("year", WEIGHT_YEAR_EXACT, hit=True, kind="match")
        elif year_near:
            add_signal("year", WEIGHT_YEAR_NEAR, hit=True, kind="near")
            warnings.append("year_proximity")
        elif year_conflict:
            add_signal("year", WEIGHT_YEAR_EXACT, hit=False, kind="conflict")
            warnings.append("year_conflict")
    elif source_year is None:
        # Missing source year is absent evidence — not a conflict/penalty signal.
        contributions["year"] = {
            "weight": 0.0,
            "matched": False,
            "kind": "absent",
        }
        warnings.append("year_evidence_absent")

    if runtime_status == "match":
        add_signal("runtime", WEIGHT_RUNTIME_NEAR, hit=True, kind="match")
    elif runtime_status == "soft":
        available += WEIGHT_RUNTIME_NEAR
        matched += runtime_soft_weight
        contributions["runtime"] = {
            "weight": WEIGHT_RUNTIME_NEAR,
            "matched": True,
            "kind": "soft",
            "soft_weight": runtime_soft_weight,
            "delta_minutes": runtime_delta,
        }
        warnings.append("runtime_soft_penalty")
    elif runtime_status == "miss":
        add_signal("runtime", WEIGHT_RUNTIME_NEAR, hit=False, kind="miss")
        warnings.append("runtime_mismatch")
    elif runtime_status == "conflict":
        add_signal("runtime", WEIGHT_RUNTIME_NEAR, hit=False, kind="conflict")
        warnings.append("runtime_conflict")
    elif source_runtime is None:
        contributions["runtime"] = {
            "weight": 0.0,
            "matched": False,
            "kind": "absent",
        }

    if director_status != "unavailable":
        if director_overlap:
            add_signal("director", WEIGHT_DIRECTOR_OVERLAP, hit=True, kind="match")
        elif director_weak:
            add_signal("director", WEIGHT_DIRECTOR_WEAK, hit=True, kind="weak")
            warnings.append("director_weak_overlap")
        else:
            add_signal("director", WEIGHT_DIRECTOR_OVERLAP, hit=False, kind="conflict")
            warnings.append("director_conflict")

    if adult:
        warnings.append("adult_flag")
    if media_type != "movie":
        warnings.append("non_movie_media_type")

    if available <= 0:
        score = 0.0
    else:
        score = matched / available

    # Tiny popularity epsilon for ranking only.
    if popularity is not None:
        score = min(1.0, score + min(0.01, float(popularity) / 100000.0))

    if adult or media_type != "movie":
        score = min(score, REVIEW_MIN_SCORE - 0.01)

    year_unavailable = year_status == "unavailable"

    # Strong corroboration floors.
    if external_exact:
        score = max(score, AUTO_CONFIRM_MIN_SCORE)
    elif title_exact and year_exact:
        score = max(score, AUTO_CONFIRM_MIN_SCORE)
    elif title_exact and (
        (runtime_near and director_overlap)
        or (year_near and runtime_near)
        or (year_exact and director_overlap)
        # Missing year is absent evidence; exact title + compatible runtime can floor.
        or (year_unavailable and runtime_near)
    ):
        score = max(score, AUTO_CONFIRM_MIN_SCORE)

    score = max(0.0, min(1.0, score))

    # Title-only with missing year and no supporting runtime/director → review band.
    # Same-title remake ambiguity is decided later when multiple candidates compete.
    if (title_exact or token_equal or original_exact) and year_unavailable and not external_exact:
        if not runtime_near and not director_overlap:
            warnings.append("weak_title_only_match")
            score = min(score, REVIEW_MIN_SCORE + 0.2)
        else:
            warnings.append("missing_year_supported_by_other_evidence")

    hard_conflict = bool(
        (year_conflict or runtime_conflict or (title_conflict and not external_exact))
        and not external_exact
    )
    if hard_conflict:
        score = min(score, AUTO_CONFIRM_MIN_SCORE - 0.01)

    if year_unavailable and source_directors in (None, "") and source_year is None:
        warnings.append("director_unavailable")

    if event_year_relaxed and "event_year_not_canonical" not in warnings:
        # Caller already recorded presentation warnings on the parent row.
        pass

    signals = {
        "title_exact": title_exact or token_equal,
        "original_title_exact": original_exact,
        "title_conflict": title_conflict,
        "year_exact": year_exact,
        "year_near": year_near,
        "year_conflict": year_conflict,
        "year_status": year_status,
        "year_evidence": (
            "conflict"
            if year_conflict
            else "compatible"
            if year_exact or year_near
            else "uncertain_rerelease_restoration"
            if event_year_relaxed and year_status == "unavailable"
            else "missing"
            if source_year is None
            else year_status
        ),
        "runtime_delta_minutes": runtime_delta,
        "runtime_near": runtime_near,
        "runtime_soft": runtime_soft,
        "runtime_conflict": runtime_conflict,
        "runtime_status": runtime_status,
        "runtime_compatible_max": RUNTIME_COMPATIBLE_MAX_MIN,
        "runtime_soft_max": RUNTIME_SOFT_MAX_MIN,
        "runtime_conflict_min": RUNTIME_CONFLICT_MIN,
        "external_id_exact": external_exact,
        "director_overlap": director_overlap,
        "director_weak_overlap": director_weak,
        "director_conflict": director_conflict,
        "director_status": director_status,
        "director_source_normalized": director_info["source_normalized"],
        "director_candidate_normalized": director_info["candidate_normalized"],
        "popularity": popularity,
        "matched_weight": round(matched, 4),
        "available_weight": round(available, 4),
        "contributions": contributions,
        "hard_conflict": hard_conflict,
        "event_year_relaxed": event_year_relaxed,
    }

    return ScoredCandidate(
        tmdb_id=tmdb_id,
        score=round(score, 4),
        signals=signals,
        warnings=tuple(dict.fromkeys(warnings)),
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
    margin = None
    if len(usable) > 1:
        margin = round(top.score - usable[1].score, 4)
    # Attach margin onto a shallow signals copy for callers via warning.
    if top.score >= AUTO_CONFIRM_MIN_SCORE and _auto_confirm_allowed(top):
        close_remakes = [
            c
            for c in usable[1:5]
            if c.score >= REVIEW_MIN_SCORE
            and c.signals.get("title_exact")
            and c.release_year != top.release_year
        ]
        remake_resolved_by_runtime = (
            margin is not None
            and margin >= REMAKE_RUNTIME_AUTO_MARGIN_MIN
            and top.signals.get("title_exact")
            and top.signals.get("runtime_near")
        )
        # Missing year + multiple same-title hits → require review, do not force a match
        # unless runtime corroboration and a clear score margin resolve the remake.
        if close_remakes and top.signals.get("year_status") == "unavailable":
            if remake_resolved_by_runtime:
                return "auto", top
            return "review", _with_warning(top, "same_title_remake_ambiguity")
        # Year/external corroboration resolves remakes; keep review only when unresolved.
        if close_remakes and not (
            top.signals.get("year_exact")
            or top.signals.get("external_id_exact")
            or remake_resolved_by_runtime
            or (
                top.signals.get("runtime_near")
                and top.signals.get("director_overlap")
                and top.signals.get("year_near")
            )
        ):
            return "review", _with_warning(top, "same_title_remake_ambiguity")
        if (
            margin is not None
            and margin < TOP_CANDIDATE_MARGIN_MIN
            and usable[1].signals.get("title_exact")
            and not top.signals.get("year_exact")
        ):
            return "review", _with_warning(top, "top_candidate_margin_too_small")
        return "auto", top
    if top.score >= REVIEW_MIN_SCORE:
        return "review", top
    return "unmatched", top


def top_candidate_margin(ranked: Sequence[ScoredCandidate]) -> float | None:
    usable = list(ranked)
    if len(usable) < 2:
        return None
    return round(usable[0].score - usable[1].score, 4)


def _with_warning(candidate: ScoredCandidate, warning: str) -> ScoredCandidate:
    if warning in candidate.warnings:
        return candidate
    return ScoredCandidate(
        tmdb_id=candidate.tmdb_id,
        score=candidate.score,
        signals=dict(candidate.signals),
        warnings=tuple([*candidate.warnings, warning]),
        title=candidate.title,
        original_title=candidate.original_title,
        release_year=candidate.release_year,
        runtime_min=candidate.runtime_min,
        popularity=candidate.popularity,
        poster_path=candidate.poster_path,
        overview_excerpt=candidate.overview_excerpt,
        director=candidate.director,
    )


def _auto_confirm_allowed(candidate: ScoredCandidate) -> bool:
    if "remake_ambiguity" in candidate.warnings:
        return False
    if "weak_title_only_match" in candidate.warnings:
        return False
    if candidate.signals.get("hard_conflict"):
        return False
    if candidate.signals.get("year_conflict") or candidate.signals.get("runtime_conflict"):
        return False
    if candidate.signals.get("title_conflict"):
        return False
    if candidate.signals.get("external_id_exact"):
        return True
    if candidate.signals.get("title_exact") and candidate.signals.get("year_exact"):
        return True
    if (
        candidate.signals.get("title_exact")
        and candidate.signals.get("runtime_near")
        and candidate.signals.get("year_near")
    ):
        return True
    if (
        candidate.signals.get("title_exact")
        and candidate.signals.get("runtime_near")
        and candidate.signals.get("director_overlap")
    ):
        return True
    # Exact title + compatible runtime with absent year is allowed when unambiguous
    # (multi-candidate remake checks happen in classify_match_bucket).
    if candidate.signals.get("title_exact") and candidate.signals.get("runtime_near"):
        if candidate.signals.get("year_status") == "unavailable":
            return True
    if (
        candidate.signals.get("title_exact")
        and candidate.signals.get("year_exact") is False
        and candidate.signals.get("anniversary_year_derived")
        and candidate.signals.get("runtime_near")
    ):
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
