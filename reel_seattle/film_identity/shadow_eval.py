"""Read-only shadow evaluation of automatic TMDB matching vs human decisions.

Suppresses only the evaluated identity's authoritative manual decision in memory,
then runs the production matcher. Never writes decision artifacts or public IDs.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    DECISION_CONFIRM,
    DECISION_MULTIPLE_SHORTS,
    DECISION_NON_FILM,
    METHOD_MANUAL,
    SCHEMA_VERSION,
    STATUS_CONFIRMED_AUTOMATIC,
    STATUS_CONFIRMED_MANUAL,
    STATUS_MULTIPLE_SHORTS,
    STATUS_NON_FILM,
    STATUS_REVIEW_REQUIRED,
    STATUS_UNMATCHED,
)
from reel_seattle.film_identity.decisions import (
    active_decisions_by_source_key,
    empty_decisions_document,
    resolve_active_decision,
    source_identity_key,
)
from reel_seattle.film_identity.eligibility import AMBIGUOUS_PROGRAM, ELIGIBLE, NON_FILM
from reel_seattle.film_identity.matcher import match_source_identity

OUTCOME_AUTO_CONFIRMED_CORRECT = "auto_confirmed_correct"
OUTCOME_REVIEW_TOP_CORRECT = "review_required_top_correct"
OUTCOME_WRONG_TOP = "wrong_top_candidate"
OUTCOME_CORRECT_ABSENT = "correct_candidate_not_found"
OUTCOME_UNRESOLVED = "unresolved_no_viable_candidate"
OUTCOME_UNEXPECTED_MANUAL = "unexpected_manual_short_circuit"

MOVIE_OUTCOMES = (
    OUTCOME_AUTO_CONFIRMED_CORRECT,
    OUTCOME_REVIEW_TOP_CORRECT,
    OUTCOME_WRONG_TOP,
    OUTCOME_CORRECT_ABSENT,
    OUTCOME_UNRESOLVED,
    OUTCOME_UNEXPECTED_MANUAL,
)

PROGRAM_CORRECT = "classified_non_film_or_program_correctly"
PROGRAM_STILL_MOVIE_PATH = "incorrectly_enters_movie_matching_or_review"
PROGRAM_OTHER = "other_status"

# Manual program/non-film decisions evaluated separately from TMDB exact-match.
PROGRAM_DECISIONS = frozenset({DECISION_NON_FILM, DECISION_MULTIPLE_SHORTS})
CONFIRM_DECISIONS = frozenset({DECISION_CONFIRM})


def decisions_with_suppressed_active(
    doc: Mapping[str, Any] | None,
    source_key: str,
    *,
    suppress_decisions: frozenset[str],
) -> dict[str, Any]:
    """Return an in-memory copy with matching active decisions deactivated.

    ``reject_candidate`` rows are never suppressed. The input document is not
    mutated. Missing/empty docs become an empty decisions document.
    """
    if not doc:
        return empty_decisions_document()
    next_doc = deepcopy(dict(doc))
    rows = list(next_doc.get("decisions") or [])
    for row in rows:
        if row.get("active") is False:
            continue
        key = source_identity_key(row.get("source_identity") or {})
        if key != source_key:
            continue
        decision = str(row.get("decision") or "")
        if decision in suppress_decisions:
            row["active"] = False
    next_doc["decisions"] = rows
    return next_doc


def catalog_films_by_source_key(catalog: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for film in catalog.get("films") or []:
        src = (film.get("source_identities") or [{}])[0]
        out[source_identity_key(src)] = film
    return out


def collect_confirm_ground_truth(
    *,
    authored_doc: Mapping[str, Any],
    admin_doc: Mapping[str, Any] | None,
    catalog: Mapping[str, Any] | None,
    inventory_by_key: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Active manual TMDB confirms, joined to current inventory when possible.

    When the admin overlay file is absent but the catalog still carries
    ``confirmed_manual`` rows (from a prior match with overlay), those rows are
    included as ground truth so today's inventory can still be scored.
    """
    cases: dict[str, dict[str, Any]] = {}

    def _add(
        *,
        key: str,
        source_identity: Mapping[str, Any],
        tmdb_id: int,
        origin: str,
        decision_id: str | None = None,
        reviewed_at: str | None = None,
        reviewed_by: str | None = None,
    ) -> None:
        identity = inventory_by_key.get(key)
        cases[key] = {
            "source_identity_key": key,
            "source": source_identity.get("source"),
            "source_film_id": source_identity.get("source_film_id"),
            "showtime_film_key": source_identity.get("showtime_film_key"),
            "human_tmdb_id": int(tmdb_id),
            "ground_truth_origin": origin,
            "decision_id": decision_id,
            "reviewed_at": reviewed_at,
            "reviewed_by": reviewed_by,
            "in_inventory": identity is not None,
            "identity": dict(identity) if identity is not None else None,
        }

    for origin_name, doc in (("authored", authored_doc), ("admin_overlay", admin_doc or {})):
        for key, decision in active_decisions_by_source_key(doc).items():
            if decision.get("decision") != DECISION_CONFIRM:
                continue
            tmdb_id = decision.get("tmdb_id")
            if not isinstance(tmdb_id, int):
                continue
            # Admin wins over authored for the same key.
            if key in cases and origin_name == "authored":
                continue
            _add(
                key=key,
                source_identity=decision.get("source_identity") or {},
                tmdb_id=tmdb_id,
                origin=origin_name,
                decision_id=decision.get("decision_id"),
                reviewed_at=decision.get("reviewed_at"),
                reviewed_by=decision.get("reviewed_by"),
            )

    if catalog is not None:
        for key, film in catalog_films_by_source_key(catalog).items():
            if film.get("match_status") != STATUS_CONFIRMED_MANUAL:
                continue
            if film.get("match_method") != METHOD_MANUAL:
                continue
            tmdb_id = film.get("tmdb_id")
            if not isinstance(tmdb_id, int):
                continue
            if key in cases:
                continue
            src = (film.get("source_identities") or [{}])[0]
            _add(
                key=key,
                source_identity=src,
                tmdb_id=tmdb_id,
                origin="catalog_confirmed_manual",
            )

    return sorted(cases.values(), key=lambda c: c["source_identity_key"])


def collect_program_ground_truth(
    *,
    authored_doc: Mapping[str, Any],
    admin_doc: Mapping[str, Any] | None,
    catalog: Mapping[str, Any] | None,
    inventory_by_key: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Manually reviewed non-film / multiple-shorts decisions only."""
    cases: dict[str, dict[str, Any]] = {}

    def _add(
        *,
        key: str,
        source_identity: Mapping[str, Any],
        decision_name: str,
        origin: str,
        decision_id: str | None = None,
        reviewed_at: str | None = None,
    ) -> None:
        identity = inventory_by_key.get(key)
        cases[key] = {
            "source_identity_key": key,
            "source": source_identity.get("source"),
            "source_film_id": source_identity.get("source_film_id"),
            "showtime_film_key": source_identity.get("showtime_film_key"),
            "human_decision": decision_name,
            "ground_truth_origin": origin,
            "decision_id": decision_id,
            "reviewed_at": reviewed_at,
            "in_inventory": identity is not None,
            "identity": dict(identity) if identity is not None else None,
        }

    for origin_name, doc in (("authored", authored_doc), ("admin_overlay", admin_doc or {})):
        for key, decision in active_decisions_by_source_key(doc).items():
            name = str(decision.get("decision") or "")
            if name not in PROGRAM_DECISIONS:
                continue
            if key in cases and origin_name == "authored":
                continue
            _add(
                key=key,
                source_identity=decision.get("source_identity") or {},
                decision_name=name,
                origin=origin_name,
                decision_id=decision.get("decision_id"),
                reviewed_at=decision.get("reviewed_at"),
            )

    if catalog is not None:
        for key, film in catalog_films_by_source_key(catalog).items():
            if film.get("match_method") != METHOD_MANUAL:
                continue
            status = film.get("match_status")
            if status == STATUS_NON_FILM:
                decision_name = DECISION_NON_FILM
            elif status == STATUS_MULTIPLE_SHORTS:
                decision_name = DECISION_MULTIPLE_SHORTS
            else:
                continue
            if key in cases:
                continue
            src = (film.get("source_identities") or [{}])[0]
            _add(
                key=key,
                source_identity=src,
                decision_name=decision_name,
                origin="catalog_manual_program",
            )

    return sorted(cases.values(), key=lambda c: c["source_identity_key"])


def _candidate_ids(result: Mapping[str, Any]) -> list[int]:
    ids: list[int] = []
    for row in result.get("candidates") or []:
        tid = row.get("tmdb_id")
        if isinstance(tid, int):
            ids.append(tid)
    return ids


def _top_candidate(result: Mapping[str, Any]) -> dict[str, Any] | None:
    candidates = list(result.get("candidates") or [])
    return candidates[0] if candidates else None


def classify_movie_shadow_outcome(
    result: Mapping[str, Any],
    human_tmdb_id: int,
) -> str:
    if result.get("match_status") == STATUS_CONFIRMED_MANUAL:
        return OUTCOME_UNEXPECTED_MANUAL

    candidate_ids = _candidate_ids(result)
    top = _top_candidate(result)
    top_id = top.get("tmdb_id") if top else None
    human_present = human_tmdb_id in candidate_ids

    if result.get("match_status") == STATUS_CONFIRMED_AUTOMATIC:
        if result.get("tmdb_id") == human_tmdb_id:
            return OUTCOME_AUTO_CONFIRMED_CORRECT
        return OUTCOME_WRONG_TOP

    if result.get("match_status") == STATUS_REVIEW_REQUIRED:
        if top_id == human_tmdb_id:
            return OUTCOME_REVIEW_TOP_CORRECT
        if human_present:
            return OUTCOME_WRONG_TOP
        return OUTCOME_CORRECT_ABSENT

    # unmatched / rejected / error / deferred-like automatic paths
    if not candidate_ids:
        return OUTCOME_UNRESOLVED
    if top_id == human_tmdb_id:
        # Top is correct but below review/auto thresholds → treat as review-top-correct
        return OUTCOME_REVIEW_TOP_CORRECT
    if human_present:
        return OUTCOME_WRONG_TOP
    return OUTCOME_CORRECT_ABSENT


def classify_program_shadow_outcome(result: Mapping[str, Any]) -> str:
    status = result.get("match_status")
    eligibility = result.get("eligibility")
    if status in {STATUS_NON_FILM, STATUS_MULTIPLE_SHORTS}:
        return PROGRAM_CORRECT
    if status == STATUS_REVIEW_REQUIRED and (
        eligibility == AMBIGUOUS_PROGRAM
        or result.get("auto_confirm_blocked_reason") == "program_entity_not_tmdb_movie"
        or "ambiguous_program_needs_review" in (result.get("warnings") or [])
    ):
        # Ambiguous program held out of movie auto-confirm is still correct classification.
        return PROGRAM_CORRECT
    if status in {
        STATUS_CONFIRMED_AUTOMATIC,
        STATUS_CONFIRMED_MANUAL,
        STATUS_REVIEW_REQUIRED,
        STATUS_UNMATCHED,
    } or eligibility == ELIGIBLE:
        return PROGRAM_STILL_MOVIE_PATH
    return PROGRAM_OTHER


def _evidence_flags(identity: Mapping[str, Any] | None) -> dict[str, bool]:
    identity = identity or {}
    year = identity.get("release_year") or identity.get("year_hint")
    runtime = identity.get("runtime_min")
    directors = identity.get("directors_raw") or identity.get("directors_normalized")
    return {
        "has_year": isinstance(year, int),
        "has_runtime": isinstance(runtime, int) and runtime > 0,
        "has_director": bool(directors),
        "has_external_ids": bool(identity.get("external_ids")),
    }


def evaluate_movie_shadow_case(
    case: Mapping[str, Any],
    *,
    client: Any,
    authored_doc: Mapping[str, Any],
    admin_doc: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """Run automatic matching with this identity's confirm suppressed."""
    key = str(case["source_identity_key"])
    human_tmdb_id = int(case["human_tmdb_id"])
    identity = case.get("identity")
    if not identity:
        return {
            **{k: case.get(k) for k in (
                "source_identity_key",
                "source",
                "source_film_id",
                "showtime_film_key",
                "human_tmdb_id",
                "ground_truth_origin",
            )},
            "skipped": True,
            "skip_reason": "not_in_inventory",
            "source_title": None,
            "shadow_tmdb_id": None,
            "shadow_match_status": None,
            "shadow_confidence": None,
            "exact_agreement": False,
            "outcome": None,
            "human_candidate_present": None,
            "human_candidate_absent": None,
            "auto_confirm_blocked_reason": None,
            "top_candidate_score": None,
            "top_candidate_margin": None,
            "top_candidate_tmdb_id": None,
            "warnings": [],
            "evidence": _evidence_flags(None),
            "would_auto_solve_today": False,
        }

    suppressed_authored = decisions_with_suppressed_active(
        authored_doc, key, suppress_decisions=CONFIRM_DECISIONS
    )
    suppressed_admin = decisions_with_suppressed_active(
        admin_doc, key, suppress_decisions=CONFIRM_DECISIONS
    )

    # Guard: production docs must still resolve to confirm when not suppressed.
    production_active = resolve_active_decision(
        {
            "source": identity.get("source"),
            "source_film_id": identity.get("source_film_id"),
            "showtime_film_key": identity.get("showtime_film_key"),
        },
        authored_doc,
        admin_doc,
    )
    shadow_active = resolve_active_decision(
        {
            "source": identity.get("source"),
            "source_film_id": identity.get("source_film_id"),
            "showtime_film_key": identity.get("showtime_film_key"),
        },
        suppressed_authored,
        suppressed_admin,
    )
    if shadow_active and shadow_active.get("decision") == DECISION_CONFIRM:
        raise RuntimeError(f"failed to suppress confirm for {key}")

    result = match_source_identity(
        identity,
        client=client,
        decisions_doc=suppressed_authored,
        admin_decisions_doc=suppressed_admin,
    )

    candidate_ids = _candidate_ids(result)
    top = _top_candidate(result)
    human_present = human_tmdb_id in candidate_ids
    outcome = classify_movie_shadow_outcome(result, human_tmdb_id)
    exact = (
        result.get("match_status") == STATUS_CONFIRMED_AUTOMATIC
        and result.get("tmdb_id") == human_tmdb_id
    )
    would_auto_solve = exact

    blocked = result.get("auto_confirm_blocked_reason")
    confidence = result.get("match_confidence")
    # Matcher sometimes leaves blocked_reason null when the auto-confirm gate
    # rejects a high score (e.g. soft runtime / missing year). Surface that.
    if (
        blocked in (None, "")
        and result.get("match_status") == STATUS_REVIEW_REQUIRED
        and isinstance(confidence, (int, float))
        and float(confidence) >= AUTO_CONFIRM_MIN_SCORE
    ):
        blocked = "auto_confirm_gate_failed"

    return {
        "source_identity_key": key,
        "source": identity.get("source"),
        "source_film_id": identity.get("source_film_id"),
        "showtime_film_key": identity.get("showtime_film_key"),
        "source_title": identity.get("source_title"),
        "human_tmdb_id": human_tmdb_id,
        "ground_truth_origin": case.get("ground_truth_origin"),
        "skipped": False,
        "production_had_confirm": bool(
            production_active and production_active.get("decision") == DECISION_CONFIRM
        ),
        "shadow_tmdb_id": result.get("tmdb_id"),
        "shadow_match_status": result.get("match_status"),
        "shadow_match_method": result.get("match_method"),
        "shadow_confidence": result.get("match_confidence"),
        "exact_agreement": exact,
        "outcome": outcome,
        "human_candidate_present": human_present,
        "human_candidate_absent": not human_present,
        "auto_confirm_blocked_reason": blocked,
        "top_candidate_score": top.get("score") if top else None,
        "top_candidate_margin": result.get("top_candidate_margin"),
        "top_candidate_tmdb_id": top.get("tmdb_id") if top else None,
        "warnings": list(result.get("warnings") or []),
        "evidence": _evidence_flags(identity),
        "would_auto_solve_today": would_auto_solve,
        "candidate_count": len(candidate_ids),
        "eligibility": result.get("eligibility"),
        "entity_kind": result.get("entity_kind"),
    }


def evaluate_program_shadow_case(
    case: Mapping[str, Any],
    *,
    client: Any,
    authored_doc: Mapping[str, Any],
    admin_doc: Mapping[str, Any] | None,
) -> dict[str, Any]:
    key = str(case["source_identity_key"])
    identity = case.get("identity")
    if not identity:
        return {
            "source_identity_key": key,
            "source": case.get("source"),
            "source_film_id": case.get("source_film_id"),
            "showtime_film_key": case.get("showtime_film_key"),
            "source_title": None,
            "human_decision": case.get("human_decision"),
            "ground_truth_origin": case.get("ground_truth_origin"),
            "skipped": True,
            "skip_reason": "not_in_inventory",
            "shadow_match_status": None,
            "shadow_eligibility": None,
            "outcome": None,
        }

    suppressed_authored = decisions_with_suppressed_active(
        authored_doc, key, suppress_decisions=PROGRAM_DECISIONS
    )
    suppressed_admin = decisions_with_suppressed_active(
        admin_doc, key, suppress_decisions=PROGRAM_DECISIONS
    )
    result = match_source_identity(
        identity,
        client=client,
        decisions_doc=suppressed_authored,
        admin_decisions_doc=suppressed_admin,
    )
    outcome = classify_program_shadow_outcome(result)
    return {
        "source_identity_key": key,
        "source": identity.get("source"),
        "source_film_id": identity.get("source_film_id"),
        "showtime_film_key": identity.get("showtime_film_key"),
        "source_title": identity.get("source_title"),
        "human_decision": case.get("human_decision"),
        "ground_truth_origin": case.get("ground_truth_origin"),
        "skipped": False,
        "shadow_match_status": result.get("match_status"),
        "shadow_match_method": result.get("match_method"),
        "shadow_eligibility": result.get("eligibility"),
        "shadow_entity_kind": result.get("entity_kind"),
        "inventory_eligibility": identity.get("eligibility"),
        "warnings": list(result.get("warnings") or []),
        "outcome": outcome,
        "classified_correctly": outcome == PROGRAM_CORRECT,
        "incorrectly_enters_movie_path": outcome == PROGRAM_STILL_MOVIE_PATH,
    }


def _pct(count: int, denom: int) -> float:
    if denom <= 0:
        return 0.0
    return round(100.0 * count / denom, 1)


def _count_by(rows: Sequence[Mapping[str, Any]], field: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in rows:
        key = str(row.get(field) or "(none)")
        out[key] = out.get(key, 0) + 1
    return dict(sorted(out.items(), key=lambda kv: (-kv[1], kv[0])))


def aggregate_movie_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    evaluated = [r for r in rows if not r.get("skipped")]
    n = len(evaluated)
    by_outcome = {name: 0 for name in MOVIE_OUTCOMES}
    for row in evaluated:
        outcome = row.get("outcome")
        if outcome in by_outcome:
            by_outcome[outcome] += 1

    exact = sum(1 for r in evaluated if r.get("exact_agreement"))
    auto_correct = by_outcome[OUTCOME_AUTO_CONFIRMED_CORRECT]
    review_top = by_outcome[OUTCOME_REVIEW_TOP_CORRECT]
    wrong = by_outcome[OUTCOME_WRONG_TOP]
    absent = by_outcome[OUTCOME_CORRECT_ABSENT]
    unresolved = by_outcome[OUTCOME_UNRESOLVED]

    by_source: dict[str, dict[str, Any]] = {}
    for row in evaluated:
        source = str(row.get("source") or "unknown")
        bucket = by_source.setdefault(
            source,
            {
                "n": 0,
                "exact_agreement": 0,
                "auto_confirmed_correct": 0,
                "review_required_top_correct": 0,
                "wrong_top_candidate": 0,
                "correct_candidate_not_found": 0,
                "unresolved_no_viable_candidate": 0,
            },
        )
        bucket["n"] += 1
        if row.get("exact_agreement"):
            bucket["exact_agreement"] += 1
        outcome = row.get("outcome")
        if outcome in bucket:
            bucket[outcome] += 1

    for source, bucket in by_source.items():
        bucket["exact_agreement_pct"] = _pct(bucket["exact_agreement"], bucket["n"])

    evidence_buckets = {
        "year+runtime+director": 0,
        "year+runtime": 0,
        "year_only": 0,
        "runtime_only": 0,
        "director_only": 0,
        "title_only": 0,
    }
    evidence_outcomes: dict[str, dict[str, int]] = {}
    for row in evaluated:
        ev = row.get("evidence") or {}
        has_y = bool(ev.get("has_year"))
        has_r = bool(ev.get("has_runtime"))
        has_d = bool(ev.get("has_director"))
        if has_y and has_r and has_d:
            label = "year+runtime+director"
        elif has_y and has_r:
            label = "year+runtime"
        elif has_y:
            label = "year_only"
        elif has_r:
            label = "runtime_only"
        elif has_d:
            label = "director_only"
        else:
            label = "title_only"
        evidence_buckets[label] += 1
        outcome = str(row.get("outcome") or "unknown")
        slot = evidence_outcomes.setdefault(label, {})
        slot[outcome] = slot.get(outcome, 0) + 1

    return {
        "population": len(rows),
        "evaluated": n,
        "skipped_not_in_inventory": sum(1 for r in rows if r.get("skipped")),
        "exact_automatic_agreement": exact,
        "exact_automatic_agreement_pct": _pct(exact, n),
        "auto_confirmed_correct": auto_correct,
        "auto_confirmed_correct_pct": _pct(auto_correct, n),
        "review_required_top_correct": review_top,
        "review_required_top_correct_pct": _pct(review_top, n),
        "wrong_top_candidate": wrong,
        "wrong_top_candidate_pct": _pct(wrong, n),
        "correct_candidate_not_found": absent,
        "correct_candidate_not_found_pct": _pct(absent, n),
        "unresolved_no_viable_candidate": unresolved,
        "unresolved_no_viable_candidate_pct": _pct(unresolved, n),
        "would_auto_solve_today": sum(1 for r in evaluated if r.get("would_auto_solve_today")),
        "by_outcome": by_outcome,
        "by_source": dict(sorted(by_source.items())),
        "by_blocker": _count_by(
            [r for r in evaluated if r.get("auto_confirm_blocked_reason")],
            "auto_confirm_blocked_reason",
        ),
        "by_shadow_status": _count_by(evaluated, "shadow_match_status"),
        "by_evidence_availability": evidence_buckets,
        "outcomes_by_evidence_availability": evidence_outcomes,
    }


def aggregate_program_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    evaluated = [r for r in rows if not r.get("skipped")]
    n = len(evaluated)
    correct = sum(1 for r in evaluated if r.get("classified_correctly"))
    movie_path = sum(1 for r in evaluated if r.get("incorrectly_enters_movie_path"))
    return {
        "population": len(rows),
        "evaluated": n,
        "skipped_not_in_inventory": sum(1 for r in rows if r.get("skipped")),
        "classified_correctly": correct,
        "classified_correctly_pct": _pct(correct, n),
        "incorrectly_enters_movie_matching_or_review": movie_path,
        "incorrectly_enters_movie_matching_or_review_pct": _pct(movie_path, n),
        "by_outcome": _count_by(evaluated, "outcome"),
        "by_source": _count_by(evaluated, "source"),
        "by_human_decision": _count_by(evaluated, "human_decision"),
    }


def run_shadow_evaluation(
    *,
    identities: Sequence[Mapping[str, Any]],
    authored_doc: Mapping[str, Any],
    admin_doc: Mapping[str, Any] | None,
    catalog: Mapping[str, Any] | None,
    client: Any,
    generated_at: str | None = None,
    tmdb_mode: str = "unknown",
) -> dict[str, Any]:
    stamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    inventory_by_key = {source_identity_key(i): i for i in identities}

    confirm_cases = collect_confirm_ground_truth(
        authored_doc=authored_doc,
        admin_doc=admin_doc,
        catalog=catalog,
        inventory_by_key=inventory_by_key,
    )
    program_cases = collect_program_ground_truth(
        authored_doc=authored_doc,
        admin_doc=admin_doc,
        catalog=catalog,
        inventory_by_key=inventory_by_key,
    )

    # Snapshot decision docs before eval to prove no mutation.
    authored_before = deepcopy(dict(authored_doc))
    admin_before = deepcopy(dict(admin_doc)) if admin_doc is not None else None

    movie_rows = [
        evaluate_movie_shadow_case(
            case,
            client=client,
            authored_doc=authored_doc,
            admin_doc=admin_doc,
        )
        for case in confirm_cases
    ]
    program_rows = [
        evaluate_program_shadow_case(
            case,
            client=client,
            authored_doc=authored_doc,
            admin_doc=admin_doc,
        )
        for case in program_cases
    ]

    if authored_doc != authored_before:
        raise RuntimeError("shadow evaluation mutated authored decisions document")
    if admin_doc is not None and admin_doc != admin_before:
        raise RuntimeError("shadow evaluation mutated admin decisions document")

    movie_metrics = aggregate_movie_metrics(movie_rows)
    program_metrics = aggregate_program_metrics(program_rows)

    surprising = [
        row
        for row in movie_rows
        if not row.get("skipped")
        and row.get("outcome")
        in {
            OUTCOME_WRONG_TOP,
            OUTCOME_CORRECT_ABSENT,
            OUTCOME_UNRESOLVED,
            OUTCOME_UNEXPECTED_MANUAL,
        }
    ][:25]
    newly_solvable = [
        row
        for row in movie_rows
        if row.get("would_auto_solve_today") and row.get("production_had_confirm")
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "kind": "tmdb_matcher_shadow_evaluation",
        "tmdb_mode": tmdb_mode,
        "notes": [
            "Read-only shadow eval: per-identity confirm/non-film decisions are "
            "suppressed only in memory.",
            "Authored and admin decision files are never written.",
            "Public film IDs and production matching thresholds are unchanged.",
            "Program/non-film manual decisions are scored separately from TMDB "
            "exact-match denominators.",
        ],
        "movie_confirm_metrics": movie_metrics,
        "program_decision_metrics": program_metrics,
        "movie_confirm_cases": movie_rows,
        "program_decision_cases": program_rows,
        "newly_auto_solvable_examples": newly_solvable[:40],
        "surprising_examples": surprising,
    }


def build_shadow_summary_markdown(report: Mapping[str, Any]) -> str:
    movie = report.get("movie_confirm_metrics") or {}
    program = report.get("program_decision_metrics") or {}
    lines = [
        "# TMDB matcher shadow evaluation",
        "",
        f"- schema_version: `{report.get('schema_version')}`",
        f"- generated_at: `{report.get('generated_at')}`",
        f"- tmdb_mode: `{report.get('tmdb_mode')}`",
        f"- movie confirm population (evaluated): **{movie.get('evaluated', 0)}** "
        f"(skipped not in inventory: {movie.get('skipped_not_in_inventory', 0)})",
        f"- exact automatic agreement: **{movie.get('exact_automatic_agreement', 0)}** "
        f"/ {movie.get('exact_automatic_agreement_pct', 0)}%",
        f"- auto-confirmed correct: **{movie.get('auto_confirmed_correct', 0)}** "
        f"/ {movie.get('auto_confirmed_correct_pct', 0)}%",
        f"- review-required but top candidate correct: "
        f"**{movie.get('review_required_top_correct', 0)}** "
        f"/ {movie.get('review_required_top_correct_pct', 0)}%",
        f"- wrong top candidate: **{movie.get('wrong_top_candidate', 0)}** "
        f"/ {movie.get('wrong_top_candidate_pct', 0)}%",
        f"- correct candidate not found: **{movie.get('correct_candidate_not_found', 0)}** "
        f"/ {movie.get('correct_candidate_not_found_pct', 0)}%",
        f"- unresolved / no viable candidate: "
        f"**{movie.get('unresolved_no_viable_candidate', 0)}** "
        f"/ {movie.get('unresolved_no_viable_candidate_pct', 0)}%",
        f"- would auto-solve an old manual confirm today: "
        f"**{movie.get('would_auto_solve_today', 0)}**",
        "",
        "## By source (movie confirms)",
        "",
        "| source | n | exact auto | auto correct | review top correct | wrong top | not found | unresolved |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for source, bucket in (movie.get("by_source") or {}).items():
        lines.append(
            "| {source} | {n} | {exact} | {auto} | {review} | {wrong} | {absent} | {unresolved} |".format(
                source=source,
                n=bucket.get("n", 0),
                exact=bucket.get("exact_agreement", 0),
                auto=bucket.get("auto_confirmed_correct", 0),
                review=bucket.get("review_required_top_correct", 0),
                wrong=bucket.get("wrong_top_candidate", 0),
                absent=bucket.get("correct_candidate_not_found", 0),
                unresolved=bucket.get("unresolved_no_viable_candidate", 0),
            )
        )

    lines.extend(
        [
            "",
            "## Blockers (auto-confirm blocked reason)",
            "",
        ]
    )
    blockers = movie.get("by_blocker") or {}
    if not blockers:
        lines.append("_None recorded on evaluated rows._")
    else:
        for reason, count in blockers.items():
            lines.append(f"- `{reason}`: {count}")

    lines.extend(
        [
            "",
            "## Evidence availability",
            "",
        ]
    )
    for label, count in (movie.get("by_evidence_availability") or {}).items():
        lines.append(f"- `{label}`: {count}")

    lines.extend(
        [
            "",
            "## Manual non-film / program decisions (separate denominator)",
            "",
            f"- population evaluated: **{program.get('evaluated', 0)}** "
            f"(skipped: {program.get('skipped_not_in_inventory', 0)})",
            f"- classified correctly by today's eligibility/matcher: "
            f"**{program.get('classified_correctly', 0)}** "
            f"/ {program.get('classified_correctly_pct', 0)}%",
            f"- still incorrectly enters movie matching/review: "
            f"**{program.get('incorrectly_enters_movie_matching_or_review', 0)}** "
            f"/ {program.get('incorrectly_enters_movie_matching_or_review_pct', 0)}%",
            "",
            "## Notes",
            "",
        ]
    )
    for note in report.get("notes") or []:
        lines.append(f"- {note}")

    newly = list(report.get("newly_auto_solvable_examples") or [])
    lines.extend(["", "## Would auto-solve an old manual confirm today", ""])
    if not newly:
        # Catalog-sourced GT often has production_had_confirm=false when the
        # admin overlay file is absent; still list exact agreements.
        newly = [
            row
            for row in (report.get("movie_confirm_cases") or [])
            if row.get("would_auto_solve_today")
        ][:20]
    if not newly:
        lines.append("_None in this run._")
    else:
        for row in newly[:20]:
            lines.append(
                f"- `{row.get('source')}` {row.get('source_title')!r} → "
                f"tmdb:{row.get('human_tmdb_id')}"
            )

    surprising = list(report.get("surprising_examples") or [])
    lines.extend(["", "## Surprising / failure examples", ""])
    if not surprising:
        lines.append("_None flagged._")
    else:
        for row in surprising[:15]:
            lines.append(
                f"- `{row.get('outcome')}` `{row.get('source')}` "
                f"{row.get('source_title')!r} human=tmdb:{row.get('human_tmdb_id')} "
                f"top={row.get('top_candidate_tmdb_id')} "
                f"blocked={row.get('auto_confirm_blocked_reason')}"
            )

    lines.extend(
        [
            "",
            "## Interpretation hints",
            "",
            "- Zero wrong-top with many review-top-correct rows usually means "
              "ranking is fine; auto-confirm gates / evidence are the bottleneck.",
            "- Unresolved rows often point at search-title normalization "
              "(series prefixes, encoding, AN/AND) rather than score weights.",
            "- Re-run with local `TMDB_READ_ACCESS_TOKEN` for bit-identical "
              "search (year param + top-10) when proxy mode was used.",
            "",
        ]
    )
    return "\n".join(lines)
