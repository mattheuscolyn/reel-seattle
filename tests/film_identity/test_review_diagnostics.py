"""Tests for Film Identity Review diagnostics (evidence-first; no rule changes)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.film_identity.constants import AUTO_CONFIRM_MIN_SCORE, REVIEW_MIN_SCORE
from reel_seattle.film_identity.eligibility import classify_eligibility
from reel_seattle.film_identity.presentation import interpret_source_years
from reel_seattle.film_identity.review_diagnostics import (
    build_decision_patch,
    build_logical_tmdb_request,
    build_review_pack,
    classify_failure,
    cluster_bulk_patterns,
    explain_from_candidates,
    export_review_report,
    live_explain,
    plain_language_reason,
    propose_normalization_rule,
    redact_secrets,
    reference_cases,
    save_review_note,
    score_factor_rows,
    title_transform_diff,
)


def test_redact_secrets_strips_bearer_and_api_key():
    raw = "Authorization: Bearer SECRETTOKEN api_key=abc123&foo=1"
    out = redact_secrets(raw)
    assert "SECRETTOKEN" not in out
    assert "abc123" not in out
    assert "[redacted]" in out


def test_title_transform_decorated_sensory():
    diff = title_transform_diff(
        "Spider-Man: Brand New Day: Sensory Friendly Screening",
        "Spider-Man: Brand New Day",
    )
    assert diff["changed"] is True
    assert "Sensory Friendly Screening" in " ".join(diff["removed_segments"])
    assert diff["normalized_search_title"] == "Spider-Man: Brand New Day"


def test_logical_request_never_includes_secrets():
    req = build_logical_tmdb_request(
        search_title="One Night Only",
        year=2026,
        status="success",
        follow_up_detail_ids=[1433367],
    )
    blob = json.dumps(req)
    assert "Bearer" not in blob
    assert "api_key" not in blob
    assert "Authorization" not in blob
    assert req["endpoint"] == "/search/movie"
    assert req["query"] == "One Night Only"
    assert req["year"] == 2026


def test_zero_result_and_api_error_distinction():
    years = interpret_source_years(source_title="Definitely Missing Film ZZZ")
    eligibility = classify_eligibility(source_title="Definitely Missing Film ZZZ")
    zero = explain_from_candidates(
        source_title="Definitely Missing Film ZZZ",
        search_title="Definitely Missing Film ZZZ",
        scoring_year=None,
        runtime_min=None,
        directors_raw=None,
        eligibility=eligibility,
        years=years,
        candidates=[],
        request_status="zero_results",
        logical_request=build_logical_tmdb_request(
            search_title="Definitely Missing Film ZZZ",
            year=None,
            status="zero_results",
        ),
    )
    assert zero["request_status"] == "zero_results"
    assert "no candidates" in zero["plain_language_reason"].lower()

    err_reason = plain_language_reason(
        eligibility_status="eligible",
        request_status="api_error",
        bucket=None,
        best=None,
        runner_up=None,
        margin=None,
    )
    assert "API error" in err_reason


def test_candidate_list_retention_and_score_factors():
    years = interpret_source_years(source_title="Moana")
    eligibility = classify_eligibility(source_title="Moana")
    candidates = [
        {
            "id": 10 + i,
            "title": f"Moana {i}",
            "original_title": f"Moana {i}",
            "release_date": "2016-11-23",
            "runtime": 107,
            "overview": "x" * 80,
            "poster_path": "/p.jpg",
            "popularity": 50 - i,
            "adult": False,
        }
        for i in range(12)
    ]
    payload = explain_from_candidates(
        source_title="Moana",
        search_title="Moana",
        scoring_year=2016,
        runtime_min=107,
        directors_raw=None,
        eligibility=eligibility,
        years=years,
        candidates=candidates,
        request_status="success",
        logical_request=build_logical_tmdb_request(
            search_title="Moana", year=2016, status="success"
        ),
    )
    assert len(payload["candidates"]) == 10
    assert payload["winning_candidate"] is not None
    assert payload["runner_up_candidate"] is not None
    assert payload["first_second_margin"] is not None
    factors = payload["candidates"][0]["score_factors"]
    assert any(f["factor"] == "title_exact" or f.get("factor") == "title_similarity_exact" for f in factors)
    assert payload["thresholds"]["auto_confirm_threshold"] == AUTO_CONFIRM_MIN_SCORE
    assert payload["thresholds"]["review_threshold"] == REVIEW_MIN_SCORE


def test_threshold_explanations_below_review():
    reason = plain_language_reason(
        eligibility_status="eligible",
        request_status="success",
        bucket="unmatched",
        best={"score": 0.48, "title": "X", "tmdb_id": 1, "signals": {}, "warnings": []},
        runner_up=None,
        margin=None,
    )
    assert "0.48" in reason
    assert str(REVIEW_MIN_SCORE) in reason


def test_review_margin_explanation():
    reason = plain_language_reason(
        eligibility_status="eligible",
        request_status="success",
        bucket="review",
        best={"score": 0.8, "title": "A", "tmdb_id": 1, "signals": {}, "warnings": []},
        runner_up={"title": "B", "tmdb_id": 2},
        margin=0.02,
    )
    assert "within 0.02" in reason


def test_failure_classification_categories():
    assert (
        classify_failure(
            eligibility_status="non_film",
            entity_kind="live_event",
            presentation_labels=[],
            screening_variant_type=None,
            year_missing=False,
            runtime_missing=False,
            request_status="skipped_by_eligibility",
            bucket=None,
            best_score=None,
            margin=None,
        )
        == "non_film_event"
    )
    assert (
        classify_failure(
            eligibility_status="eligible",
            entity_kind="feature_film",
            presentation_labels=["sensory friendly screening"],
            screening_variant_type="sensory_friendly",
            year_missing=False,
            runtime_missing=False,
            request_status="success",
            bucket="unmatched",
            best_score=0.4,
            margin=None,
            title_changed=True,
        )
        == "accessibility_qualifier"
    )


def test_experimental_search_does_not_save_decisions(tmp_path: Path, monkeypatch):
    # Offline explain marked experimental + persists_decision False.
    years = interpret_source_years(source_title="One Night Only")
    eligibility = classify_eligibility(source_title="One Night Only")
    payload = explain_from_candidates(
        source_title="One Night Only",
        search_title="One Night Only",
        scoring_year=2026,
        runtime_min=102,
        directors_raw="Will Gluck",
        eligibility=eligibility,
        years=years,
        candidates=[
            {
                "id": 1433367,
                "title": "One Night Only",
                "release_date": "2026-01-01",
                "runtime": 102,
                "overview": "test",
                "popularity": 1,
            },
            {
                "id": 999,
                "title": "One Night Only",
                "release_date": "2026-06-01",
                "runtime": 90,
                "overview": "other",
                "popularity": 1,
            },
        ],
        request_status="success",
        logical_request=build_logical_tmdb_request(
            search_title="One Night Only", year=2026, status="success"
        ),
        experimental=True,
    )
    assert payload["experimental"] is True
    assert payload["persists_decision"] is False


def test_decision_patch_shape():
    patch = build_decision_patch(
        source_name="amc",
        source_film_id="123",
        showtime_film_key="one-night-only",
        decision="confirm",
        tmdb_id=1433367,
    )
    assert patch["decisions"][0]["tmdb_id"] == 1433367
    assert patch["decisions"][0]["decision"] == "confirm"
    assert patch["decisions"][0]["source_identity"]["showtime_film_key"] == "one-night-only"


def test_normalization_proposal_does_not_touch_code(tmp_path: Path):
    records = [
        {
            "record_id": "a",
            "source": {
                "original_source_title": "SIFF Presents: Example Film",
            },
        },
        {
            "record_id": "b",
            "source": {
                "original_source_title": "SIFF Presents: Other Film",
            },
        },
    ]
    proposal = propose_normalization_rule(
        original_title="SIFF Presents: Example Film",
        proposed_base_title="Example Film",
        records=records,
    )
    assert proposal["applies_to_production"] is False
    assert proposal["requires_separate_implementation_decision"] is True
    elig_path = Path("reel_seattle/film_identity/eligibility.py")
    before = elig_path.read_text(encoding="utf-8")
    after = elig_path.read_text(encoding="utf-8")
    assert before == after
    assert "SIFF Presents" not in before


def test_notes_persistence(tmp_path: Path):
    root = tmp_path
    (root / "data/film_identity").mkdir(parents=True)
    doc = save_review_note(
        root,
        record_id="one-night-only",
        diagnostic_category="same_title_remake_ambiguity",
        notes="Confirm Will Gluck cut.",
    )
    assert doc["notes"]["one-night-only"]["notes"] == "Confirm Will Gluck cut."
    assert (
        doc["notes"]["one-night-only"]["diagnostic_category"]
        == "same_title_remake_ambiguity"
    )
    saved = json.loads((root / "data/film_identity/review_notes.json").read_text(encoding="utf-8"))
    assert saved["notes"]["one-night-only"]["category_overridden"] is True


def test_bulk_pattern_clustering():
    records = [
        {
            "record_id": f"id-{i}",
            "review_modes": ["unmatched"],
            "diagnostic_category": "series_or_event_prefix_suffix",
            "eligibility": {"status": "eligible"},
            "catalog": {"candidates": []},
            "sort_keys": {
                "showtime_count": 3,
                "best_score": -1,
                "missing_year": True,
            },
            "source": {
                "original_source_title": f"Festival Presents: Film {i}",
                "sources": ["nwff"],
            },
        }
        for i in range(4)
    ]
    clusters = cluster_bulk_patterns(records)
    ids = {c["cluster_id"] for c in clusters}
    assert any(x.startswith("prefix:") for x in ids)
    assert "missing_year" in ids
    assert "nwff_unmatched" in ids


def test_reference_cases_include_one_night_only_and_spider(tmp_path: Path):
    root = Path(".")
    cases = reference_cases(root)
    ids = {c["case_id"] for c in cases}
    assert "one_night_only" in ids
    assert "spider_man_sensory" in ids
    ono = next(c for c in cases if c["case_id"] == "one_night_only")
    assert ono["selected_tmdb_id"] == 1433367


def test_score_factor_rows_include_contributions():
    rows = score_factor_rows(
        {
            "contributions": {
                "title_exact": {"weight": 0.45, "matched": True, "kind": "match"}
            },
            "title_exact": True,
            "matched_weight": 0.45,
            "available_weight": 0.45,
        }
    )
    assert any(r["factor"] == "title_exact" for r in rows)


def test_build_review_pack_smoke():
    root = Path(".")
    pack = build_review_pack(root)
    assert pack["counts"]["records"] >= 1
    assert "bulk_patterns" in pack
    assert any(c["case_id"] == "one_night_only" for c in pack["reference_cases"])
    # High-impact ordering: showtimes desc
    records = pack["records"]
    if len(records) >= 2:
        assert records[0]["sort_keys"]["showtime_count"] >= records[1]["sort_keys"]["showtime_count"]


def test_export_review_report(tmp_path: Path, monkeypatch):
    root = tmp_path
    (root / "data/audits").mkdir(parents=True)
    paths = export_review_report(
        root,
        records=[
            {
                "record_id": "x",
                "diagnostic_category": "unknown",
                "reviewer_notes": "n",
                "source": {
                    "original_source_title": "X",
                    "normalized_search_title": "X",
                    "match_status": "unmatched",
                },
                "sort_keys": {"showtime_count": 1, "venue_count": 1, "best_score": 0.1},
            }
        ],
        explains={"x": {"plain_language_reason": "Unmatched: best score 0.1, below REVIEW threshold 0.55"}},
    )
    assert paths["json_path"].endswith(".json")
    assert paths["csv_path"].endswith(".csv")
    json_body = (root / paths["json_path"]).read_text(encoding="utf-8")
    assert "Bearer" not in json_body
    assert "api_key" not in json_body


def test_live_explain_offline_candidates_no_network():
    payload = live_explain(
        Path("."),
        source_title="One Night Only",
        runtime_min=102,
        product_year=2026,
        offline_candidates=[
            {
                "id": 1433367,
                "title": "One Night Only",
                "release_date": "2026-02-14",
                "runtime": 102,
                "overview": "Will Gluck",
                "popularity": 12,
                "vote_count": 10,
                "adult": False,
                "original_language": "en",
            }
        ],
    )
    assert payload["request_status"] == "success"
    assert payload["persists_decision"] is False
    assert any(c["tmdb_id"] == 1433367 for c in payload["candidates"])
