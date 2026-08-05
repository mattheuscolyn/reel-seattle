"""Conservative TMDB matching pipeline."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    IDENTITY_SOURCE,
    IDENTITY_SOURCE_KEY,
    IDENTITY_TMDB,
    METHOD_AUTOMATIC,
    METHOD_FALLBACK,
    METHOD_MANUAL,
    METHOD_NONE,
    SCHEMA_VERSION,
    STATUS_CONFIRMED_AUTOMATIC,
    STATUS_CONFIRMED_MANUAL,
    STATUS_DEFERRED,
    STATUS_ERROR,
    STATUS_NON_FILM,
    STATUS_REJECTED,
    STATUS_REVIEW_REQUIRED,
    STATUS_UNMATCHED,
)
from reel_seattle.film_identity.decisions import (
    DECISION_CONFIRM,
    DECISION_DEFER,
    DECISION_NON_FILM,
    DECISION_REJECT_CANDIDATE,
    DECISION_UNMAPPED,
    active_decisions_by_source_key,
    rejected_tmdb_ids_for,
    source_identity_key,
)
from reel_seattle.film_identity.eligibility import AMBIGUOUS_PROGRAM, ELIGIBLE, NON_FILM
from reel_seattle.film_identity.ids import fallback_film_id, film_id_from_tmdb, parse_film_id
from reel_seattle.film_identity.scoring import (
    ScoredCandidate,
    classify_match_bucket,
    rank_candidates,
    score_candidate,
    top_candidate_margin,
)
from reel_seattle.film_identity.presentation import interpret_source_years
from reel_seattle.film_identity.normalize_text import parse_person_names
from reel_seattle.film_identity.tmdb_client import (
    TmdbAuthError,
    TmdbClient,
    candidate_from_search_result,
    enrich_candidate_from_details,
)


def match_source_identity(
    identity: Mapping[str, Any],
    *,
    client: TmdbClient | None,
    decisions_doc: Mapping[str, Any],
    enrich_top_n: int = 5,
) -> dict[str, Any]:
    """Match one inventoried source identity; never raises for per-item API errors."""
    source = str(identity.get("source") or "")
    source_film_id = identity.get("source_film_id")
    showtime_film_key = identity.get("showtime_film_key")
    source_identity = {
        "source": source,
        "source_film_id": source_film_id,
        "showtime_film_key": showtime_film_key,
    }
    fallback = identity.get("film_id_fallback") or fallback_film_id(
        source=source,
        source_film_id=source_film_id,
        showtime_film_key=showtime_film_key,
    )
    parsed_fallback = parse_film_id(fallback)

    year_info_raw = identity.get("year_interpretation")
    if isinstance(year_info_raw, Mapping):
        year_info = dict(year_info_raw)
    else:
        year_info = interpret_source_years(
            source_title=identity.get("source_title"),
            explicit_canonical_year=identity.get("release_year") or identity.get("year_hint"),
        ).to_dict()
    scoring_year = year_info.get("scoring_year")
    if scoring_year is None:
        scoring_year = identity.get("release_year") or identity.get("year_hint")
    event_relaxed = bool(year_info.get("event_year_not_canonical"))
    directors_normalized = identity.get("directors_normalized") or parse_person_names(
        identity.get("directors_raw")
    )

    base = {
        "source_identities": [
            {
                **source_identity,
                "source_title": identity.get("source_title"),
            }
        ],
        "eligibility": identity.get("eligibility"),
        "entity_kind": identity.get("entity_kind"),
        "warnings": list(
            dict.fromkeys(
                list(identity.get("eligibility_reasons") or [])
                + list(year_info.get("warnings") or [])
            )
        ),
        "candidates": [],
        "signals": None,
        "normalized_title": identity.get("normalized_title"),
        "year_hint": scoring_year,
        "runtime_min": identity.get("runtime_min"),
        "directors_raw": identity.get("directors_raw"),
        "directors_normalized": directors_normalized,
        "year_interpretation": year_info,
        "presentation_labels": list(
            identity.get("presentation_labels") or year_info.get("presentation_labels") or []
        ),
        "first_observed_at": identity.get("first_start"),
        "last_observed_at": identity.get("last_start"),
        "provenance": {
            "source_identity_key": source_identity_key(source_identity),
        },
        "auto_confirm_blocked_reason": None,
        "top_candidate_margin": None,
    }

    active = active_decisions_by_source_key(decisions_doc).get(
        source_identity_key(source_identity)
    )
    rejected = rejected_tmdb_ids_for(source_identity, decisions_doc)

    if active:
        decision = active.get("decision")
        if decision == DECISION_CONFIRM and isinstance(active.get("tmdb_id"), int):
            tmdb_id = int(active["tmdb_id"])
            return {
                **base,
                "film_id": film_id_from_tmdb(tmdb_id),
                "identity_type": IDENTITY_TMDB,
                "tmdb_id": tmdb_id,
                "match_status": STATUS_CONFIRMED_MANUAL,
                "match_method": METHOD_MANUAL,
                "match_confidence": 1.0,
                "provenance": {
                    **base["provenance"],
                    "decision_id": active.get("decision_id"),
                },
            }
        if decision == DECISION_NON_FILM:
            return {
                **base,
                "film_id": fallback,
                "identity_type": parsed_fallback.identity_type,
                "tmdb_id": None,
                "match_status": STATUS_NON_FILM,
                "match_method": METHOD_MANUAL,
                "match_confidence": None,
            }
        if decision == DECISION_UNMAPPED:
            return {
                **base,
                "film_id": fallback,
                "identity_type": parsed_fallback.identity_type,
                "tmdb_id": None,
                "match_status": STATUS_UNMATCHED,
                "match_method": METHOD_MANUAL,
                "match_confidence": None,
            }
        if decision == DECISION_DEFER:
            return {
                **base,
                "film_id": fallback,
                "identity_type": parsed_fallback.identity_type,
                "tmdb_id": None,
                "match_status": STATUS_DEFERRED,
                "match_method": METHOD_MANUAL,
                "match_confidence": None,
            }
        if decision == DECISION_REJECT_CANDIDATE:
            # Continue automatic matching excluding rejected IDs.
            pass

    eligibility = identity.get("eligibility")
    if eligibility == NON_FILM:
        warnings = list(base["warnings"])
        if "program_entity_not_tmdb_movie" not in warnings:
            warnings.append("program_entity_not_tmdb_movie")
        return {
            **base,
            "film_id": fallback,
            "identity_type": parsed_fallback.identity_type,
            "tmdb_id": None,
            "match_status": STATUS_NON_FILM,
            "match_method": METHOD_NONE,
            "match_confidence": None,
            "warnings": warnings,
        }

    if eligibility == AMBIGUOUS_PROGRAM:
        # Keep as reviewable source entity; do not discard. Optional TMDB probe below
        # is skipped to avoid forcing weak movie matches onto true programs.
        return {
            **base,
            "film_id": fallback,
            "identity_type": parsed_fallback.identity_type,
            "tmdb_id": None,
            "match_status": STATUS_REVIEW_REQUIRED,
            "match_method": METHOD_NONE,
            "match_confidence": None,
            "warnings": list(base["warnings"]) + ["ambiguous_program_needs_review"],
            "auto_confirm_blocked_reason": "program_entity_not_tmdb_movie",
        }

    if eligibility != ELIGIBLE:
        return {
            **base,
            "film_id": fallback,
            "identity_type": parsed_fallback.identity_type,
            "tmdb_id": None,
            "match_status": STATUS_UNMATCHED,
            "match_method": METHOD_FALLBACK,
            "match_confidence": None,
        }

    search_title = identity.get("normalized_title") or identity.get("source_title")
    if not search_title:
        return {
            **base,
            "film_id": fallback,
            "identity_type": parsed_fallback.identity_type,
            "tmdb_id": None,
            "match_status": STATUS_UNMATCHED,
            "match_method": METHOD_FALLBACK,
            "match_confidence": None,
        }

    if client is None:
        return {
            **base,
            "film_id": fallback,
            "identity_type": parsed_fallback.identity_type,
            "tmdb_id": None,
            "match_status": STATUS_UNMATCHED,
            "match_method": METHOD_FALLBACK,
            "match_confidence": None,
            "warnings": list(base["warnings"]) + ["offline_no_tmdb_client"],
        }

    try:
        # Prefer canonical/scoring year for search; never send raw event year alone.
        year = scoring_year if isinstance(scoring_year, int) else None
        search = client.search_movie(str(search_title), year=year)
        results = [
            candidate_from_search_result(row)
            for row in (search.get("results") or [])[:10]
            if isinstance(row, Mapping) and row.get("id") is not None
        ]
        # Also search without year if year-filtered search is empty.
        if not results and year is not None:
            search = client.search_movie(str(search_title), year=None)
            results = [
                candidate_from_search_result(row)
                for row in (search.get("results") or [])[:10]
                if isinstance(row, Mapping) and row.get("id") is not None
            ]

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
                search_title=str(search_title),
                source_year=year,
                source_runtime=identity.get("runtime_min"),
                source_directors=identity.get("directors_raw"),
                source_external_ids=None,
                candidate=row,
                event_year_relaxed=event_relaxed,
            )
            for row in enriched
        ]
        ranked = rank_candidates(scored)
        bucket, proposed = classify_match_bucket(ranked, rejected_ids=rejected)
        candidate_payloads = [_candidate_payload(c) for c in ranked[:8]]
        margin = top_candidate_margin(ranked)
        blocked = None
        if bucket != "auto" and proposed is not None:
            if "same_title_remake_ambiguity" in proposed.warnings:
                blocked = "same_title_remake_ambiguity"
            elif "top_candidate_margin_too_small" in proposed.warnings:
                blocked = "top_candidate_margin_too_small"
            elif proposed.signals.get("hard_conflict"):
                blocked = "hard_conflict"
            elif "weak_title_only_match" in proposed.warnings:
                blocked = "weak_title_only_match"
            elif proposed.score < AUTO_CONFIRM_MIN_SCORE:
                blocked = "below_auto_threshold"
        base["top_candidate_margin"] = margin
        base["auto_confirm_blocked_reason"] = blocked

        if bucket == "auto" and proposed is not None:
            return {
                **base,
                "film_id": film_id_from_tmdb(proposed.tmdb_id),
                "identity_type": IDENTITY_TMDB,
                "tmdb_id": proposed.tmdb_id,
                "match_status": STATUS_CONFIRMED_AUTOMATIC,
                "match_method": METHOD_AUTOMATIC,
                "match_confidence": proposed.score,
                "signals": proposed.signals,
                "warnings": list(proposed.warnings),
                "candidates": candidate_payloads,
                "tmdb_title": proposed.title,
                "tmdb_original_title": proposed.original_title,
                "tmdb_release_year": proposed.release_year,
                "tmdb_runtime_min": proposed.runtime_min,
                "tmdb_poster_path": proposed.poster_path,
                "tmdb_overview_excerpt": proposed.overview_excerpt,
            }

        if bucket == "review" and proposed is not None:
            status = STATUS_REVIEW_REQUIRED
            if rejected and proposed.tmdb_id in rejected:
                status = STATUS_REJECTED
            return {
                **base,
                "film_id": fallback,
                "identity_type": parsed_fallback.identity_type,
                "tmdb_id": None,
                "match_status": status,
                "match_method": METHOD_FALLBACK,
                "match_confidence": proposed.score,
                "signals": proposed.signals,
                "warnings": list(proposed.warnings),
                "candidates": candidate_payloads,
                "tmdb_title": proposed.title,
                "tmdb_original_title": proposed.original_title,
                "tmdb_release_year": proposed.release_year,
                "tmdb_runtime_min": proposed.runtime_min,
                "tmdb_poster_path": proposed.poster_path,
                "tmdb_overview_excerpt": proposed.overview_excerpt,
            }

        return {
            **base,
            "film_id": fallback,
            "identity_type": parsed_fallback.identity_type,
            "tmdb_id": None,
            "match_status": STATUS_UNMATCHED,
            "match_method": METHOD_FALLBACK,
            "match_confidence": proposed.score if proposed else None,
            "signals": proposed.signals if proposed else None,
            "warnings": list(proposed.warnings) if proposed else list(base["warnings"]),
            "candidates": candidate_payloads,
        }
    except TmdbAuthError:
        raise
    except Exception as exc:  # noqa: BLE001
        return {
            **base,
            "film_id": fallback,
            "identity_type": parsed_fallback.identity_type,
            "tmdb_id": None,
            "match_status": STATUS_ERROR,
            "match_method": METHOD_FALLBACK,
            "match_confidence": None,
            "warnings": list(base["warnings"]) + [f"match_error:{type(exc).__name__}"],
        }


def build_match_artifacts(
    identities: Sequence[Mapping[str, Any]],
    *,
    client: TmdbClient | None,
    decisions_doc: Mapping[str, Any],
    generated_at: str | None = None,
) -> dict[str, Any]:
    stamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    films: list[dict[str, Any]] = []
    errors = 0
    for identity in identities:
        result = match_source_identity(
            identity,
            client=client,
            decisions_doc=decisions_doc,
        )
        if result.get("match_status") == STATUS_ERROR:
            errors += 1
        films.append(result)

    films = sorted(
        films,
        key=lambda f: (
            (f.get("source_identities") or [{}])[0].get("source") or "",
            (f.get("source_identities") or [{}])[0].get("source_film_id") or "",
            f.get("film_id") or "",
        ),
    )

    catalog = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "films": films,
    }
    review_queue = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "items": _build_review_items(films),
    }
    coverage = build_coverage_report(catalog, review_queue, errors=errors)
    return {
        "catalog": catalog,
        "review_queue": review_queue,
        "coverage": coverage,
        "partial_failure": errors > 0,
        "error_count": errors,
    }


def build_coverage_report(
    catalog: Mapping[str, Any],
    review_queue: Mapping[str, Any],
    *,
    errors: int = 0,
) -> dict[str, Any]:
    films = list(catalog.get("films") or [])
    by_status: dict[str, int] = {}
    by_source: dict[str, dict[str, int]] = {}
    fallback = 0
    confidences: list[float] = []
    warning_counts: dict[str, int] = {}
    entity_counts: dict[str, int] = {}
    margins: list[float] = []
    calibration = {
        "event_year_titles": 0,
        "anniversary_derived_years": 0,
        "normalized_title_exact_matches": 0,
        "director_comparisons": 0,
        "director_unavailable": 0,
        "auto_confirm_blocked_by_ambiguity": 0,
        "auto_confirm_blocked_by_hard_conflict": 0,
        "review_required_sparse_evidence": 0,
        "top_candidate_margin_buckets": {
            "none": 0,
            "0.00-0.07": 0,
            "0.08-0.19": 0,
            "0.20+": 0,
        },
    }

    for film in films:
        status = str(film.get("match_status") or "unknown")
        by_status[status] = by_status.get(status, 0) + 1
        identity_type = film.get("identity_type")
        if identity_type in {IDENTITY_SOURCE, IDENTITY_SOURCE_KEY}:
            fallback += 1
        conf = film.get("match_confidence")
        if isinstance(conf, (int, float)):
            confidences.append(float(conf))
        for warning in film.get("warnings") or []:
            warning_counts[str(warning)] = warning_counts.get(str(warning), 0) + 1
        entity = film.get("entity_kind") or "unknown"
        entity_counts[str(entity)] = entity_counts.get(str(entity), 0) + 1
        year_info = film.get("year_interpretation") or {}
        if isinstance(year_info, Mapping):
            if year_info.get("event_year_not_canonical"):
                calibration["event_year_titles"] += 1
            if year_info.get("anniversary_year_derived"):
                calibration["anniversary_derived_years"] += 1
        signals = film.get("signals") or {}
        if isinstance(signals, Mapping):
            if signals.get("title_exact"):
                calibration["normalized_title_exact_matches"] += 1
            if signals.get("director_status") == "unavailable":
                calibration["director_unavailable"] += 1
            elif signals.get("director_status") in {"match", "weak", "conflict"}:
                calibration["director_comparisons"] += 1
        blocked = film.get("auto_confirm_blocked_reason")
        if blocked in {"same_title_remake_ambiguity", "top_candidate_margin_too_small"}:
            calibration["auto_confirm_blocked_by_ambiguity"] += 1
        if blocked == "hard_conflict":
            calibration["auto_confirm_blocked_by_hard_conflict"] += 1
        if blocked == "weak_title_only_match" or "weak_title_only_match" in (
            film.get("warnings") or []
        ):
            calibration["review_required_sparse_evidence"] += 1
        margin = film.get("top_candidate_margin")
        if isinstance(margin, (int, float)):
            margins.append(float(margin))
            if margin < 0.08:
                calibration["top_candidate_margin_buckets"]["0.00-0.07"] += 1
            elif margin < 0.20:
                calibration["top_candidate_margin_buckets"]["0.08-0.19"] += 1
            else:
                calibration["top_candidate_margin_buckets"]["0.20+"] += 1
        else:
            calibration["top_candidate_margin_buckets"]["none"] += 1
        for src in film.get("source_identities") or []:
            source = str(src.get("source") or "unknown")
            bucket = by_source.setdefault(source, {"total": 0})
            bucket["total"] += 1
            bucket[status] = bucket.get(status, 0) + 1

    eligible = sum(
        1
        for f in films
        if f.get("eligibility") == ELIGIBLE
        or f.get("match_status")
        in {
            STATUS_CONFIRMED_AUTOMATIC,
            STATUS_CONFIRMED_MANUAL,
            STATUS_REVIEW_REQUIRED,
            STATUS_UNMATCHED,
            STATUS_REJECTED,
            STATUS_ERROR,
        }
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": catalog.get("generated_at"),
        "total_unique_source_identities": len(films),
        "eligible_movie_like": eligible,
        "confirmed_automatic": by_status.get(STATUS_CONFIRMED_AUTOMATIC, 0),
        "confirmed_manual": by_status.get(STATUS_CONFIRMED_MANUAL, 0),
        "review_required": by_status.get(STATUS_REVIEW_REQUIRED, 0),
        "unmatched": by_status.get(STATUS_UNMATCHED, 0),
        "non_film": by_status.get(STATUS_NON_FILM, 0),
        "deferred": by_status.get(STATUS_DEFERRED, 0),
        "rejected": by_status.get(STATUS_REJECTED, 0),
        "errors": by_status.get(STATUS_ERROR, 0) or errors,
        "fallback_usage": fallback,
        "review_queue_size": len(review_queue.get("items") or []),
        "by_status": by_status,
        "by_source": by_source,
        "confidence_distribution": _confidence_distribution(confidences),
        "common_warning_categories": dict(
            sorted(warning_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:20]
        ),
        "entity_kind_counts": dict(sorted(entity_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
        "calibration": calibration,
        "duplicate_merge_counts": {
            "note": "Cross-source merges only via shared confirmed tmdb_id; not auto-merged in T-FILMID-01",
            "distinct_tmdb_ids": len(
                {f.get("tmdb_id") for f in films if isinstance(f.get("tmdb_id"), int)}
            ),
        },
    }


def _build_review_items(films: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for film in films:
        status = film.get("match_status")
        if status not in {STATUS_REVIEW_REQUIRED, STATUS_DEFERRED, STATUS_REJECTED}:
            # Also include ambiguous errors with candidates.
            if status != STATUS_ERROR or not film.get("candidates"):
                continue
        src = (film.get("source_identities") or [{}])[0]
        candidates = film.get("candidates") or []
        proposed = candidates[0] if candidates else {}
        queue_id = (
            f"{src.get('source')}:{src.get('source_film_id') or src.get('showtime_film_key')}"
        )
        items.append(
            {
                "queue_id": queue_id,
                "source": src.get("source"),
                "source_film_id": src.get("source_film_id"),
                "showtime_film_key": src.get("showtime_film_key"),
                "source_title": src.get("source_title"),
                "normalized_title": film.get("normalized_title")
                or src.get("source_title")
                or "",
                "year_hint": film.get("year_hint"),
                "runtime_min": film.get("runtime_min"),
                "directors_raw": film.get("directors_raw"),
                "directors_normalized": film.get("directors_normalized"),
                "match_status": status,
                "proposed_tmdb_id": proposed.get("tmdb_id"),
                "match_confidence": film.get("match_confidence"),
                "signals": film.get("signals") or proposed.get("signals"),
                "warnings": list(film.get("warnings") or []),
                "candidates": candidates,
                "film_id_fallback": film.get("film_id"),
                "entity_kind": film.get("entity_kind"),
                "year_interpretation": film.get("year_interpretation"),
                "presentation_labels": film.get("presentation_labels") or [],
                "top_candidate_margin": film.get("top_candidate_margin"),
                "auto_confirm_blocked_reason": film.get("auto_confirm_blocked_reason"),
            }
        )
    return sorted(items, key=lambda i: (i.get("source") or "", i.get("queue_id") or ""))


def _candidate_payload(candidate: ScoredCandidate) -> dict[str, Any]:
    return {
        "tmdb_id": candidate.tmdb_id,
        "score": candidate.score,
        "signals": candidate.signals,
        "warnings": list(candidate.warnings),
        "title": candidate.title,
        "original_title": candidate.original_title,
        "release_year": candidate.release_year,
        "runtime_min": candidate.runtime_min,
        "popularity": candidate.popularity,
        "poster_path": candidate.poster_path,
        "overview_excerpt": candidate.overview_excerpt,
        "director": candidate.director,
    }


def _confidence_distribution(values: Sequence[float]) -> dict[str, int]:
    buckets = {
        "0.00-0.54": 0,
        "0.55-0.79": 0,
        "0.80-0.91": 0,
        "0.92-1.00": 0,
    }
    for value in values:
        if value < 0.55:
            buckets["0.00-0.54"] += 1
        elif value < 0.80:
            buckets["0.55-0.79"] += 1
        elif value < 0.92:
            buckets["0.80-0.91"] += 1
        else:
            buckets["0.92-1.00"] += 1
    return buckets
