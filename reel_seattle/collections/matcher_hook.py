"""Expose collection identity-title candidates to the existing TMDB matcher."""

from __future__ import annotations

from typing import Any, Mapping

from reel_seattle.film_identity.normalize_text import normalize_title_key


WARNING_USED_CANDIDATE = "used_collection_identity_title_candidate"
WARNING_CONFLICT = "collection_identity_title_candidate_conflict"
BLOCKED_CONFLICT = "collection_title_conflict"


def preferred_search_title(
    identity: Mapping[str, Any],
    *,
    fallback: str | None,
) -> tuple[str | None, list[str]]:
    """Prefer a high-confidence collection identity title when present."""
    candidate = str(identity.get("identity_title_candidate") or "").strip() or None
    raw = (fallback or "").strip() or None
    if candidate:
        warnings = [WARNING_USED_CANDIDATE]
        return candidate, warnings
    return raw, []


def titles_conflict(candidate: str | None, raw: str | None) -> bool:
    left = normalize_title_key(candidate or "")
    right = normalize_title_key(raw or "")
    if not left or not right:
        return False
    return left != right


def conflict_review_payload(*, candidate_tmdb_id: int | None, raw_tmdb_id: int | None) -> bool:
    """True when candidate and raw titles confidently resolve to different TMDB IDs."""
    if candidate_tmdb_id is None or raw_tmdb_id is None:
        return False
    return int(candidate_tmdb_id) != int(raw_tmdb_id)
