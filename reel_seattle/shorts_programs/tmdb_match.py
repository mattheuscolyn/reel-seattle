"""Conservative TMDB identity matching for individual Shorts.

Reuses film_identity search + scoring. ShortsProgram entities are never matched.
Exhibition ownership (program → screening) is unchanged.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    METHOD_AUTOMATIC,
    METHOD_FALLBACK,
    METHOD_NONE,
    SCHEMA_VERSION,
    STATUS_CONFIRMED_AUTOMATIC,
    STATUS_REVIEW_REQUIRED,
    STATUS_UNMATCHED,
)
from reel_seattle.film_identity.ids import film_id_from_tmdb
from reel_seattle.film_identity.io_util import atomic_write_json
from reel_seattle.film_identity.matcher import (
    collect_search_candidates,
    plan_tmdb_search_queries,
)
from reel_seattle.film_identity.scoring import (
    ScoredCandidate,
    classify_match_bucket,
    rank_candidates,
    score_candidate,
    top_candidate_margin,
)
from reel_seattle.film_identity.tmdb_client import (
    TmdbClient,
    enrich_candidate_from_details,
)
from reel_seattle.shorts_programs.model import ShortRecord, short_from_dict
from reel_seattle.validate import PROJECT_ROOT

AUDIT_REL = "data/audits/shorts_tmdb_identity_coverage.json"
DEFAULT_SHORTS_ARTIFACT_REL = "public/data/shorts_programs_current.json"

STATUS_AUTO = "matched_automatic"
STATUS_REVIEW = "review"
STATUS_UNMATCHED_LABEL = "unmatched"
STATUS_ERROR = "error"
STATUS_PRESERVED = "preserved_prior"


@dataclass(frozen=True)
class ShortMatchResult:
    short_id: str
    short_id_unchanged: str
    source_title: str | None
    source_year: int | None
    source_directors: tuple[str, ...]
    source_runtime_min: int | None
    match_status: str
    match_method: str
    canonical_film_id: str | None
    tmdb_id: int | None
    tmdb_title: str | None
    tmdb_year: int | None
    tmdb_runtime_min: int | None
    confidence: float | None
    reason: str | None
    blocked_reason: str | None
    top_candidate_margin: float | None
    candidates: tuple[dict[str, Any], ...]
    warnings: tuple[str, ...]
    signals: dict[str, Any] | None = None

    def to_audit_row(self) -> dict[str, Any]:
        return {
            "shortId": self.short_id,
            "sourceTitle": self.source_title,
            "sourceYear": self.source_year,
            "sourceDirectors": list(self.source_directors),
            "sourceRuntimeMin": self.source_runtime_min,
            "matchStatus": self.match_status,
            "matchMethod": self.match_method,
            "canonicalFilmId": self.canonical_film_id,
            "tmdbId": self.tmdb_id,
            "tmdbTitle": self.tmdb_title,
            "tmdbYear": self.tmdb_year,
            "tmdbRuntimeMin": self.tmdb_runtime_min,
            "confidence": self.confidence,
            "reason": self.reason,
            "blockedReason": self.blocked_reason,
            "topCandidateMargin": self.top_candidate_margin,
            "candidates": list(self.candidates),
            "warnings": list(self.warnings),
            "signals": self.signals,
            "shortIdUnchanged": self.short_id_unchanged,
        }


def shorts_auto_confirm_allowed(candidate: ScoredCandidate) -> bool:
    """Stricter than feature-film auto-confirm: require director or runtime.

    Title+year alone is insufficient for festival shorts (collision-prone).
    Explicit director conflicts also block auto-confirm.
    """
    signals = candidate.signals or {}
    if signals.get("hard_conflict"):
        return False
    if signals.get("year_conflict") or signals.get("runtime_conflict"):
        return False
    if signals.get("title_conflict"):
        return False
    if signals.get("director_conflict"):
        return False
    if "weak_title_only_match" in candidate.warnings:
        return False
    if "director_conflict" in candidate.warnings:
        return False
    if not signals.get("title_exact"):
        return False

    has_director = bool(signals.get("director_overlap"))
    has_runtime = bool(signals.get("runtime_near"))
    has_year = bool(signals.get("year_exact") or signals.get("year_near"))
    year_unavailable = signals.get("year_status") == "unavailable"

    if has_director and (has_year or year_unavailable or has_runtime):
        return True
    # Runtime corroboration alone requires a compatible year — title+runtime with
    # missing TMDB/source year is too weak for festival shorts without directors.
    if has_runtime and has_year and not signals.get("director_conflict"):
        return True
    return False


def classify_short_match_bucket(
    ranked: Sequence[ScoredCandidate],
    *,
    rejected_ids: set[int] | None = None,
) -> tuple[str, ScoredCandidate | None, str | None]:
    """Return (bucket, proposed, blocked_reason) for a Short.

    bucket: auto | review | unmatched
    """
    bucket, proposed = classify_match_bucket(ranked, rejected_ids=rejected_ids)
    if bucket != "auto" or proposed is None:
        blocked = None
        if proposed is not None and bucket == "review":
            if "same_title_remake_ambiguity" in proposed.warnings:
                blocked = "same_title_remake_ambiguity"
            elif "top_candidate_margin_too_small" in proposed.warnings:
                blocked = "top_candidate_margin_too_small"
            elif proposed.signals.get("hard_conflict"):
                blocked = "hard_conflict"
            elif "weak_title_only_match" in proposed.warnings:
                blocked = "weak_title_only_match"
            else:
                blocked = "below_auto_or_needs_review"
        return bucket, proposed, blocked

    if shorts_auto_confirm_allowed(proposed):
        return "auto", proposed, None

    # Demote title+year-only (or otherwise insufficient) auto hits.
    return "review", proposed, "shorts_requires_director_or_runtime_corroboration"


def alternate_short_search_title(title: str) -> str | None:
    """Build a punctuation-tolerant TMDB search alternate for Short titles.

    Festival titles often keep apostrophes that TMDB indexes without
    (e.g. ``Dick's-A-Thon`` → ``Dicks-A-Thon`` / ``Dicks A Thon``).
    """
    text = (title or "").strip()
    if not text:
        return None
    # Prefer removing apostrophes while keeping hyphens (matches TMDB slug style).
    no_apos = (
        text.replace("'", "")
        .replace("’", "")
        .replace("‘", "")
        .strip()
    )
    if no_apos and no_apos.casefold() != text.casefold():
        return no_apos
    # Fallback: replace punctuation runs with spaces.
    spaced = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE).strip()
    spaced = re.sub(r"\s+", " ", spaced)
    if spaced and spaced.casefold() != text.casefold():
        return spaced
    return None


def match_short(
    short: ShortRecord | Mapping[str, Any],
    *,
    client: TmdbClient | None,
    enrich_top_n: int = 5,
) -> ShortMatchResult:
    """Match one Short to TMDB using shared scoring + shorts auto-confirm gate."""
    record = short if isinstance(short, ShortRecord) else short_from_dict(dict(short))
    short_id = record.short_id
    title = (record.title or "").strip() or None
    year = record.year if isinstance(record.year, int) else None
    runtime = record.runtime_min if isinstance(record.runtime_min, int) else None
    directors = tuple(d for d in (record.directors or ()) if isinstance(d, str) and d.strip())

    base_kwargs = dict(
        short_id=short_id,
        short_id_unchanged=short_id,
        source_title=title,
        source_year=year,
        source_directors=directors,
        source_runtime_min=runtime,
        candidates=(),
        warnings=(),
        signals=None,
        top_candidate_margin=None,
        blocked_reason=None,
        tmdb_title=None,
        tmdb_year=None,
        tmdb_runtime_min=None,
    )

    if not title:
        return ShortMatchResult(
            **base_kwargs,
            match_status=STATUS_UNMATCHED_LABEL,
            match_method=METHOD_FALLBACK,
            canonical_film_id=None,
            tmdb_id=None,
            confidence=None,
            reason="missing_title",
        )

    if client is None:
        # Preserve prior stamp when offline; caller may re-apply.
        prior = record.canonical_film_id
        return ShortMatchResult(
            **base_kwargs,
            match_status=STATUS_PRESERVED if prior else STATUS_UNMATCHED_LABEL,
            match_method=METHOD_NONE if prior else METHOD_FALLBACK,
            canonical_film_id=prior,
            tmdb_id=_parse_tmdb_id(prior),
            confidence=None,
            reason="offline_no_tmdb_client",
            warnings=("offline_no_tmdb_client",),
        )

    try:
        queries = plan_tmdb_search_queries(
            search_title=title,
            alternate_title=alternate_short_search_title(title),
            search_year=year,
            rerelease_ambiguous=False,
        )
        results, _executed = collect_search_candidates(
            client,
            queries,
            rerelease_ambiguous=False,
        )
        enriched: list[dict[str, Any]] = []
        for row in results[:enrich_top_n]:
            try:
                details = client.movie_details(int(row["id"]))
                enriched.append(enrich_candidate_from_details(row, details))
            except Exception:  # noqa: BLE001
                enriched.append(dict(row))
        for row in results[enrich_top_n:]:
            enriched.append(dict(row))

        scored = [
            score_candidate(
                search_title=title,
                source_year=year,
                source_runtime=runtime,
                source_directors=", ".join(directors) if directors else None,
                source_external_ids=None,
                candidate=row,
                event_year_relaxed=False,
            )
            for row in enriched
        ]
        ranked = rank_candidates(scored)
        bucket, proposed, blocked = classify_short_match_bucket(ranked)
        margin = top_candidate_margin(ranked)
        candidate_payloads = tuple(_candidate_payload(c) for c in ranked[:8])

        if bucket == "auto" and proposed is not None:
            film_id = film_id_from_tmdb(proposed.tmdb_id)
            return ShortMatchResult(
                short_id=short_id,
                short_id_unchanged=short_id,
                source_title=title,
                source_year=year,
                source_directors=directors,
                source_runtime_min=runtime,
                match_status=STATUS_AUTO,
                match_method=METHOD_AUTOMATIC,
                canonical_film_id=film_id,
                tmdb_id=proposed.tmdb_id,
                tmdb_title=proposed.title,
                tmdb_year=proposed.release_year,
                tmdb_runtime_min=proposed.runtime_min,
                confidence=proposed.score,
                reason="auto_confirm_title_year_plus_director_or_runtime",
                blocked_reason=None,
                top_candidate_margin=margin,
                candidates=candidate_payloads,
                warnings=tuple(proposed.warnings),
                signals=dict(proposed.signals),
            )

        if bucket == "review" and proposed is not None:
            return ShortMatchResult(
                short_id=short_id,
                short_id_unchanged=short_id,
                source_title=title,
                source_year=year,
                source_directors=directors,
                source_runtime_min=runtime,
                match_status=STATUS_REVIEW,
                match_method=METHOD_NONE,
                canonical_film_id=None,
                tmdb_id=proposed.tmdb_id,
                tmdb_title=proposed.title,
                tmdb_year=proposed.release_year,
                tmdb_runtime_min=proposed.runtime_min,
                confidence=proposed.score,
                reason=blocked or "needs_review",
                blocked_reason=blocked,
                top_candidate_margin=margin,
                candidates=candidate_payloads,
                warnings=tuple(proposed.warnings),
                signals=dict(proposed.signals),
            )

        return ShortMatchResult(
            short_id=short_id,
            short_id_unchanged=short_id,
            source_title=title,
            source_year=year,
            source_directors=directors,
            source_runtime_min=runtime,
            match_status=STATUS_UNMATCHED_LABEL,
            match_method=METHOD_FALLBACK,
            canonical_film_id=None,
            tmdb_id=proposed.tmdb_id if proposed else None,
            tmdb_title=proposed.title if proposed else None,
            tmdb_year=proposed.release_year if proposed else None,
            tmdb_runtime_min=proposed.runtime_min if proposed else None,
            confidence=proposed.score if proposed else None,
            reason="no_sufficient_candidate",
            blocked_reason=blocked,
            top_candidate_margin=margin,
            candidates=candidate_payloads,
            warnings=tuple(proposed.warnings) if proposed else (),
            signals=dict(proposed.signals) if proposed else None,
        )
    except Exception as exc:  # noqa: BLE001
        return ShortMatchResult(
            **base_kwargs,
            match_status=STATUS_ERROR,
            match_method=METHOD_NONE,
            canonical_film_id=record.canonical_film_id,
            tmdb_id=_parse_tmdb_id(record.canonical_film_id),
            confidence=None,
            reason=f"match_error:{type(exc).__name__}",
            warnings=("match_error",),
        )


def match_shorts_artifact(
    artifact: Mapping[str, Any],
    *,
    client: TmdbClient | None,
    limit: int | None = None,
    preserve_prior_on_error: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Stamp canonicalFilmId onto Shorts; never mutate ShortsProgram rows.

    Returns (updated_artifact, audit_doc).
    TMDB failures leave the Short unresolved (or preserve prior) without aborting.
    """
    programs = list(artifact.get("shortsPrograms") or [])
    shorts_in = list(artifact.get("shorts") or [])
    memberships = list(artifact.get("memberships") or [])

    # Guard: programs must not gain TMDB movie IDs via this path.
    for program in programs:
        if isinstance(program, Mapping) and program.get("canonicalFilmId"):
            # Programs should not carry film TMDB IDs; leave as-is but do not set.
            pass

    to_match = shorts_in[: limit if limit is not None else len(shorts_in)]
    results: list[ShortMatchResult] = []
    updated_shorts: list[dict[str, Any]] = []
    result_by_id: dict[str, ShortMatchResult] = {}

    for row in to_match:
        if not isinstance(row, Mapping):
            continue
        prior_id = row.get("canonicalFilmId")
        result = match_short(row, client=client)
        # Deterministic reprocess: keep prior auto stamp if rematch agrees or errors.
        if (
            preserve_prior_on_error
            and result.match_status in {STATUS_ERROR, STATUS_UNMATCHED_LABEL}
            and isinstance(prior_id, str)
            and prior_id.startswith("tmdb:")
            and result.canonical_film_id is None
        ):
            # Only preserve prior when this run could not improve/confirm — do not
            # preserve when actively demoted to review with a conflicting candidate.
            if result.match_status == STATUS_ERROR:
                result = ShortMatchResult(
                    short_id=result.short_id,
                    short_id_unchanged=result.short_id_unchanged,
                    source_title=result.source_title,
                    source_year=result.source_year,
                    source_directors=result.source_directors,
                    source_runtime_min=result.source_runtime_min,
                    match_status=STATUS_PRESERVED,
                    match_method=METHOD_NONE,
                    canonical_film_id=prior_id,
                    tmdb_id=_parse_tmdb_id(prior_id),
                    tmdb_title=result.tmdb_title,
                    tmdb_year=result.tmdb_year,
                    tmdb_runtime_min=result.tmdb_runtime_min,
                    confidence=result.confidence,
                    reason="preserved_prior_after_error",
                    blocked_reason=result.blocked_reason,
                    top_candidate_margin=result.top_candidate_margin,
                    candidates=result.candidates,
                    warnings=tuple([*result.warnings, "preserved_prior_canonical_film_id"]),
                    signals=result.signals,
                )
        results.append(result)
        result_by_id[result.short_id] = result

        out = dict(row)
        out["shortId"] = result.short_id  # identity ownership unchanged
        if result.canonical_film_id:
            out["canonicalFilmId"] = result.canonical_film_id
        else:
            # Clear only when rematch explicitly reviewed/unmatched (not preserve).
            if result.match_status in {STATUS_REVIEW, STATUS_UNMATCHED_LABEL}:
                out["canonicalFilmId"] = None
            elif prior_id and result.match_status == STATUS_PRESERVED:
                out["canonicalFilmId"] = prior_id
            else:
                out["canonicalFilmId"] = None
        updated_shorts.append(out)

    # Append any shorts beyond limit unchanged.
    matched_ids = {r.get("shortId") for r in updated_shorts if isinstance(r, Mapping)}
    for row in shorts_in:
        if not isinstance(row, Mapping):
            continue
        if row.get("shortId") in matched_ids:
            continue
        updated_shorts.append(dict(row))

    # Stable order by shortId.
    updated_shorts.sort(key=lambda r: str(r.get("shortId") or ""))

    stats = dict(artifact.get("stats") or {})
    matched = sum(1 for r in results if r.canonical_film_id)
    stats["canonical_short_count"] = sum(
        1
        for row in updated_shorts
        if isinstance(row.get("canonicalFilmId"), str)
        and str(row["canonicalFilmId"]).startswith("tmdb:")
    )

    updated = {
        **dict(artifact),
        "shorts": updated_shorts,
        "shortsPrograms": programs,
        "memberships": memberships,
        "stats": stats,
    }

    audit = build_shorts_match_audit(results, generated_at=_now_iso())
    audit["stats"]["matched_in_artifact"] = matched
    return updated, audit


def build_shorts_match_audit(
    results: Sequence[ShortMatchResult],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    rows = [r.to_audit_row() for r in results]
    matched = [r for r in results if r.match_status == STATUS_AUTO]
    review = [r for r in results if r.match_status == STATUS_REVIEW]
    unmatched = [
        r
        for r in results
        if r.match_status in {STATUS_UNMATCHED_LABEL, STATUS_ERROR}
    ]
    preserved = [r for r in results if r.match_status == STATUS_PRESERVED]
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at or _now_iso(),
        "entity_kind": "short",
        "stats": {
            "total": len(results),
            "matched_automatic": len(matched),
            "review": len(review),
            "unmatched": len(unmatched),
            "preserved_prior": len(preserved),
            "with_canonical_film_id": sum(1 for r in results if r.canonical_film_id),
        },
        "shorts": rows,
    }


def write_shorts_match_audit(audit: Mapping[str, Any], path=None) -> None:
    target = path or (PROJECT_ROOT / AUDIT_REL)
    atomic_write_json(target, dict(audit))


def confirmed_tmdb_ids_from_shorts(
    shorts_artifact: Mapping[str, Any] | None,
) -> list[dict[str, Any]]:
    """Collect confirmed TMDB identities stamped on Shorts for enrichment."""
    if not isinstance(shorts_artifact, Mapping):
        return []
    by_id: dict[int, dict[str, Any]] = {}
    for row in shorts_artifact.get("shorts") or []:
        if not isinstance(row, Mapping):
            continue
        film_id = row.get("canonicalFilmId")
        tmdb_id = _parse_tmdb_id(film_id if isinstance(film_id, str) else None)
        if tmdb_id is None:
            continue
        existing = by_id.get(tmdb_id)
        short_id = row.get("shortId")
        sources = {"shorts"}
        if existing is None:
            by_id[tmdb_id] = {
                "film_id": f"tmdb:{tmdb_id}",
                "tmdb_id": tmdb_id,
                "match_status": STATUS_CONFIRMED_AUTOMATIC,
                "sources": sorted(sources),
                "normalized_title": row.get("title"),
                "short_ids": [short_id] if short_id else [],
            }
        else:
            existing["sources"] = sorted(set(existing["sources"]) | sources)
            if short_id and short_id not in existing["short_ids"]:
                existing["short_ids"].append(short_id)
    return sorted(by_id.values(), key=lambda row: row["tmdb_id"])


def _candidate_payload(candidate: ScoredCandidate) -> dict[str, Any]:
    return {
        "tmdbId": candidate.tmdb_id,
        "score": candidate.score,
        "title": candidate.title,
        "releaseYear": candidate.release_year,
        "runtimeMin": candidate.runtime_min,
        "director": candidate.director,
        "warnings": list(candidate.warnings),
        "signals": {
            "title_exact": candidate.signals.get("title_exact"),
            "year_exact": candidate.signals.get("year_exact"),
            "year_near": candidate.signals.get("year_near"),
            "runtime_near": candidate.signals.get("runtime_near"),
            "director_overlap": candidate.signals.get("director_overlap"),
            "hard_conflict": candidate.signals.get("hard_conflict"),
        },
    }


def _parse_tmdb_id(value: str | None) -> int | None:
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    if not text.startswith("tmdb:"):
        return None
    try:
        parsed = int(text.split(":", 1)[1])
    except (TypeError, ValueError, IndexError):
        return None
    return parsed if parsed >= 1 else None


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
