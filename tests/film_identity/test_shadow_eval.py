"""Shadow evaluation invariants: no mutation, suppress-only, aggregates."""

from __future__ import annotations

from copy import deepcopy

from reel_seattle.film_identity.constants import STATUS_CONFIRMED_AUTOMATIC
from reel_seattle.film_identity.decisions import (
    apply_decision_patch,
    empty_decisions_document,
    resolve_active_decision,
    source_identity_key,
)
from reel_seattle.film_identity.matcher import match_source_identity
from reel_seattle.film_identity.shadow_eval import (
    OUTCOME_AUTO_CONFIRMED_CORRECT,
    OUTCOME_CORRECT_ABSENT,
    OUTCOME_REVIEW_TOP_CORRECT,
    OUTCOME_UNRESOLVED,
    OUTCOME_WRONG_TOP,
    aggregate_movie_metrics,
    classify_movie_shadow_outcome,
    decisions_with_suppressed_active,
    evaluate_movie_shadow_case,
    run_shadow_evaluation,
)


SOURCE = {
    "source": "amc",
    "source_film_id": "72474",
    "showtime_film_key": "moana",
}


class FakeClient:
    def search_movie(self, query, *, year=None, page=1):
        return {
            "results": [
                {
                    "id": 277355,
                    "title": "Moana",
                    "original_title": "Moana",
                    "release_date": "2016-11-23",
                    "popularity": 40,
                    "poster_path": "/x.jpg",
                    "overview": "A voyager.",
                    "adult": False,
                }
            ]
        }

    def movie_details(self, tmdb_id):
        return {
            "id": tmdb_id,
            "title": "Moana",
            "original_title": "Moana",
            "release_date": "2016-11-23",
            "runtime": 107,
            "poster_path": "/x.jpg",
            "overview": "A voyager.",
            "external_ids": {"imdb_id": "tt3521164"},
            "credits": {"crew": [{"job": "Director", "name": "Ron Clements"}]},
        }


class WrongTopClient(FakeClient):
    def search_movie(self, query, *, year=None, page=1):
        return {
            "results": [
                {
                    "id": 999001,
                    "title": "Moana",
                    "original_title": "Moana",
                    "release_date": "2016-11-23",
                    "popularity": 99,
                    "poster_path": "/x.jpg",
                    "overview": "Wrong hit.",
                    "adult": False,
                },
                {
                    "id": 277355,
                    "title": "Moana",
                    "original_title": "Moana",
                    "release_date": "2016-11-23",
                    "popularity": 1,
                    "poster_path": "/x.jpg",
                    "overview": "A voyager.",
                    "adult": False,
                },
            ]
        }

    def movie_details(self, tmdb_id):
        base = super().movie_details(tmdb_id)
        if tmdb_id == 999001:
            base["title"] = "Moana"
            base["runtime"] = 107
            base["credits"] = {"crew": [{"job": "Director", "name": "Someone Else"}]}
        return base


def _identity(**overrides):
    return {
        **SOURCE,
        "source_title": "Moana",
        "normalized_title": "Moana",
        "year_hint": 2016,
        "release_year": 2016,
        "runtime_min": 107,
        "directors_raw": "Ron Clements",
        "eligibility": "eligible",
        "eligibility_reasons": [],
        "film_id_fallback": "source:amc:72474",
        **overrides,
    }


def _confirm_doc(tmdb_id: int = 277355) -> dict:
    return apply_decision_patch(
        empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": tmdb_id,
            "reviewed_at": "2026-07-27T01:00:00+00:00",
        },
    )


def test_suppress_confirm_does_not_mutate_source_document():
    doc = _confirm_doc()
    before = deepcopy(doc)
    suppressed = decisions_with_suppressed_active(
        doc, source_identity_key(SOURCE), suppress_decisions=frozenset({"confirm"})
    )
    assert doc == before
    active = [r for r in suppressed["decisions"] if r.get("active") is not False]
    assert active == []
    assert any(r.get("decision") == "confirm" for r in suppressed["decisions"])


def test_suppress_keeps_reject_candidate_and_other_identities():
    doc = empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00")
    doc = apply_decision_patch(
        doc,
        {
            "source_identity": SOURCE,
            "decision": "reject_candidate",
            "tmdb_id": 1,
            "reviewed_at": "2026-07-27T01:00:00+00:00",
        },
    )
    doc = apply_decision_patch(
        doc,
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": 277355,
            "reviewed_at": "2026-07-27T02:00:00+00:00",
        },
    )
    other = {
        "source": "beacon",
        "source_film_id": "other",
        "showtime_film_key": "other",
    }
    doc = apply_decision_patch(
        doc,
        {
            "source_identity": other,
            "decision": "confirm",
            "tmdb_id": 42,
            "reviewed_at": "2026-07-27T03:00:00+00:00",
        },
    )
    suppressed = decisions_with_suppressed_active(
        doc, source_identity_key(SOURCE), suppress_decisions=frozenset({"confirm"})
    )
    assert (
        resolve_active_decision(SOURCE, suppressed) is None
        or resolve_active_decision(SOURCE, suppressed).get("decision") != "confirm"
    )
    # Reject rows remain for rejected_tmdb_ids_for (active flag irrelevant there).
    assert any(
        r.get("decision") == "reject_candidate" and r.get("tmdb_id") == 1
        for r in suppressed["decisions"]
    )
    other_active = resolve_active_decision(other, suppressed)
    assert other_active is not None
    assert other_active["tmdb_id"] == 42


def test_production_matching_unchanged_with_confirm_present():
    doc = _confirm_doc()
    with_decision = match_source_identity(
        _identity(),
        client=FakeClient(),
        decisions_doc=doc,
    )
    assert with_decision["match_status"] == "confirmed_manual"
    assert with_decision["tmdb_id"] == 277355
    assert with_decision["match_method"] == "manual"


def test_manual_confirm_can_be_suppressed_while_matcher_behavior_identical():
    doc = _confirm_doc()
    empty = empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00")
    suppressed = decisions_with_suppressed_active(
        doc, source_identity_key(SOURCE), suppress_decisions=frozenset({"confirm"})
    )
    shadow = match_source_identity(
        _identity(),
        client=FakeClient(),
        decisions_doc=suppressed,
    )
    baseline = match_source_identity(
        _identity(),
        client=FakeClient(),
        decisions_doc=empty,
    )
    assert shadow["match_status"] == STATUS_CONFIRMED_AUTOMATIC
    assert baseline["match_status"] == STATUS_CONFIRMED_AUTOMATIC
    assert shadow["tmdb_id"] == baseline["tmdb_id"] == 277355
    assert shadow["match_confidence"] == baseline["match_confidence"]
    # Original doc still short-circuits production matching.
    still_manual = match_source_identity(
        _identity(),
        client=FakeClient(),
        decisions_doc=doc,
    )
    assert still_manual["match_status"] == "confirmed_manual"


def test_shadow_evaluation_does_not_mutate_production_decisions():
    authored = _confirm_doc()
    admin = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-01T00:00:00+00:00"),
        {
            "source_identity": {
                "source": "siff",
                "source_film_id": "x",
                "showtime_film_key": "x",
            },
            "decision": "non_film",
            "reviewed_at": "2026-08-01T00:00:00+00:00",
        },
    )
    authored_before = deepcopy(authored)
    admin_before = deepcopy(admin)
    report = run_shadow_evaluation(
        identities=[_identity()],
        authored_doc=authored,
        admin_doc=admin,
        catalog=None,
        client=FakeClient(),
        generated_at="2026-09-15T00:00:00+00:00",
        tmdb_mode="fake",
    )
    assert authored == authored_before
    assert admin == admin_before
    assert report["movie_confirm_metrics"]["evaluated"] == 1
    assert report["movie_confirm_metrics"]["exact_automatic_agreement"] == 1


def test_aggregate_movie_metrics_counts():
    rows = [
        {"skipped": False, "exact_agreement": True, "outcome": OUTCOME_AUTO_CONFIRMED_CORRECT, "source": "amc", "would_auto_solve_today": True, "evidence": {"has_year": True, "has_runtime": True, "has_director": True}},
        {"skipped": False, "exact_agreement": False, "outcome": OUTCOME_REVIEW_TOP_CORRECT, "source": "amc", "would_auto_solve_today": False, "auto_confirm_blocked_reason": "below_auto_threshold", "evidence": {"has_year": True, "has_runtime": False, "has_director": False}},
        {"skipped": False, "exact_agreement": False, "outcome": OUTCOME_WRONG_TOP, "source": "beacon", "would_auto_solve_today": False, "evidence": {"has_year": False, "has_runtime": True, "has_director": False}},
        {"skipped": False, "exact_agreement": False, "outcome": OUTCOME_CORRECT_ABSENT, "source": "beacon", "would_auto_solve_today": False, "evidence": {}},
        {"skipped": False, "exact_agreement": False, "outcome": OUTCOME_UNRESOLVED, "source": "nwff", "would_auto_solve_today": False, "evidence": {}},
        {"skipped": True, "exact_agreement": False, "outcome": None, "source": "siff"},
    ]
    metrics = aggregate_movie_metrics(rows)
    assert metrics["population"] == 6
    assert metrics["evaluated"] == 5
    assert metrics["skipped_not_in_inventory"] == 1
    assert metrics["exact_automatic_agreement"] == 1
    assert metrics["exact_automatic_agreement_pct"] == 20.0
    assert metrics["auto_confirmed_correct"] == 1
    assert metrics["review_required_top_correct"] == 1
    assert metrics["wrong_top_candidate"] == 1
    assert metrics["correct_candidate_not_found"] == 1
    assert metrics["unresolved_no_viable_candidate"] == 1
    assert metrics["by_source"]["amc"]["n"] == 2
    assert metrics["by_blocker"]["below_auto_threshold"] == 1


def test_classify_movie_shadow_outcome_branches():
    assert (
        classify_movie_shadow_outcome(
            {"match_status": "confirmed_automatic", "tmdb_id": 1, "candidates": []},
            1,
        )
        == OUTCOME_AUTO_CONFIRMED_CORRECT
    )
    assert (
        classify_movie_shadow_outcome(
            {
                "match_status": "review_required",
                "tmdb_id": None,
                "candidates": [{"tmdb_id": 1}, {"tmdb_id": 2}],
            },
            1,
        )
        == OUTCOME_REVIEW_TOP_CORRECT
    )
    assert (
        classify_movie_shadow_outcome(
            {
                "match_status": "review_required",
                "candidates": [{"tmdb_id": 2}, {"tmdb_id": 1}],
            },
            1,
        )
        == OUTCOME_WRONG_TOP
    )
    assert (
        classify_movie_shadow_outcome(
            {"match_status": "unmatched", "candidates": [{"tmdb_id": 9}]},
            1,
        )
        == OUTCOME_CORRECT_ABSENT
    )
    assert (
        classify_movie_shadow_outcome({"match_status": "unmatched", "candidates": []}, 1)
        == OUTCOME_UNRESOLVED
    )


def test_evaluate_movie_case_records_agreement_and_leaves_docs_intact():
    doc = _confirm_doc()
    before = deepcopy(doc)
    row = evaluate_movie_shadow_case(
        {
            "source_identity_key": source_identity_key(SOURCE),
            "human_tmdb_id": 277355,
            "ground_truth_origin": "authored",
            "identity": _identity(),
        },
        client=FakeClient(),
        authored_doc=doc,
        admin_doc=None,
    )
    assert doc == before
    assert row["exact_agreement"] is True
    assert row["outcome"] == OUTCOME_AUTO_CONFIRMED_CORRECT
    assert row["would_auto_solve_today"] is True
    assert row["production_had_confirm"] is True
