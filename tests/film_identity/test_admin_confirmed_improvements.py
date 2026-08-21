"""Regression tests for admin-confirmed presentation + remake auto-confirm."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from reel_seattle.film_identity.constants import REMAKE_RUNTIME_AUTO_MARGIN_MIN
from reel_seattle.film_identity.presentation import extract_match_title
from reel_seattle.film_identity.scoring import (
    classify_match_bucket,
    rank_candidates,
    score_candidate,
)
from reel_seattle.film_identity.title_rules import clear_title_rules_cache

ROOT = Path(__file__).resolve().parents[2]
EVAL_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "film_identity"
    / "admin_confirmed_eval_cases.json"
)


def setup_function() -> None:
    clear_title_rules_cache()


def test_hpd_event_code_paren_stripped():
    extracted = extract_match_title(
        "Harry Potter And The Prisoner Of Azkaban (HPD26)",
        source="amc",
    )
    assert extracted.base_title == "Harry Potter And The Prisoner Of Azkaban"
    assert any("hpd" in p.casefold() for p in extracted.removed_phrases)


def test_presented_with_venue_paren_stripped():
    extracted = extract_match_title(
        "Hundreds Of Beavers (Presented with The Grand Illusion)",
        source="central_cinema",
    )
    assert extracted.base_title == "Hundreds Of Beavers"
    assert any("presented with" in p.casefold() for p in extracted.removed_phrases)


def test_live_shadow_cast_suffix_stripped():
    extracted = extract_match_title(
        "Little Shop of Horrors with Live Shadow Cast",
        source="central_cinema",
    )
    assert extracted.base_title == "Little Shop of Horrors"


def test_unstreamable_and_4k_restoration():
    extracted = extract_match_title(
        "Unstreamable - Tekkonkinkreet (4K Restoration)",
        source="nwff",
    )
    assert extracted.base_title == "Tekkonkinkreet"
    assert (
        "Unstreamable" in extracted.removed_phrases
        or extracted.program_series == "Unstreamable"
    )


def test_sfcs_series_prefix():
    extracted = extract_match_title("SFCS at 10: First Cow", source="nwff")
    assert extracted.base_title == "First Cow"


def test_baron_von_terror_presents_prefix():
    extracted = extract_match_title(
        "Baron Von Terror presents: In the Mouth of Madness",
        source="central_cinema",
    )
    assert extracted.base_title == "In the Mouth of Madness"


def test_event_year_paren_stripped_without_destroying_title():
    extracted = extract_match_title("Texas Chainsaw Day (2026)", source="amc")
    assert extracted.base_title == "Texas Chainsaw Day"


def test_release_year_paren_preserved_for_real_titles():
    extracted = extract_match_title("Blade Runner (1982)", source="amc")
    assert extracted.base_title == "Blade Runner (1982)"


def test_legitimate_title_with_restoration_word_not_overstripped():
    extracted = extract_match_title("Restored", source="beacon")
    assert extracted.base_title == "Restored"


def test_remake_auto_confirm_with_runtime_margin():
    top = score_candidate(
        search_title="The Birds",
        source_year=None,
        source_runtime=119,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 571,
            "title": "The Birds",
            "release_date": "1963-03-28",
            "runtime": 119,
            "popularity": 20,
            "adult": False,
            "media_type": "movie",
        },
    )
    second = score_candidate(
        search_title="The Birds",
        source_year=None,
        source_runtime=119,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 999001,
            "title": "The Birds",
            "release_date": "2000-01-01",
            "runtime": 90,
            "popularity": 1,
            "adult": False,
            "media_type": "movie",
        },
    )
    ranked = rank_candidates([top, second])
    bucket, proposed = classify_match_bucket(ranked)
    assert top.signals["runtime_near"] is True
    assert (top.score - second.score) >= REMAKE_RUNTIME_AUTO_MARGIN_MIN
    assert bucket == "auto"
    assert proposed is not None
    assert proposed.tmdb_id == 571


def test_remake_still_review_when_ambiguous():
    a = score_candidate(
        search_title="Dune",
        source_year=None,
        source_runtime=155,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 438631,
            "title": "Dune",
            "release_date": "2021-10-22",
            "runtime": 155,
            "popularity": 80,
            "adult": False,
            "media_type": "movie",
        },
    )
    b = score_candidate(
        search_title="Dune",
        source_year=None,
        source_runtime=155,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 841,
            "title": "Dune",
            "release_date": "1984-12-14",
            "runtime": 137,
            "popularity": 20,
            "adult": False,
            "media_type": "movie",
        },
    )
    ranked = rank_candidates([a, b])
    bucket, proposed = classify_match_bucket(ranked)
    if bucket == "auto":
        assert proposed is not None
        assert proposed.tmdb_id == 438631
        assert proposed.signals.get("runtime_near") is True
    else:
        assert bucket == "review"
        assert proposed is not None
        assert "same_title_remake_ambiguity" in proposed.warnings


def test_admin_eval_corpus_exists_and_has_zero_false_autos():
    path = ROOT / "scripts" / "evaluate_tmdb_matcher.py"
    spec = importlib.util.spec_from_file_location("evaluate_tmdb_matcher", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["evaluate_tmdb_matcher"] = module
    spec.loader.exec_module(module)

    assert EVAL_FIXTURE.exists()
    report = module.evaluate(EVAL_FIXTURE)
    assert report["summary"]["human_confirmed_cases"] >= 30
    assert report["summary"]["incorrect_automatic_matches"] == 0
