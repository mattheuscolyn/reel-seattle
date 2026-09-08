"""Tier A matcher correctness: runtime 0, year/search title, emit, composites."""

from __future__ import annotations

import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.film_identity.constants import AUTO_CONFIRM_MIN_SCORE
from reel_seattle.film_identity.eligibility import (
    ELIGIBLE,
    NON_FILM,
    classify_eligibility,
)
from reel_seattle.film_identity.presentation import (
    extract_match_title,
    interpret_source_years,
    normalize_match_title,
)
from reel_seattle.film_identity.public_emit import reattach_public_film_ids_current
from reel_seattle.film_identity.scoring import classify_match_bucket, score_candidate
from reel_seattle.normalize import format_date_csv

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)


def _cand(**overrides):
    base = {
        "id": 1,
        "title": "The Fix",
        "original_title": "The Fix",
        "release_date": "2026-01-01",
        "runtime": 0,
        "director": "Guy Moshe",
        "popularity": 4,
        "adult": False,
        "media_type": "movie",
    }
    base.update(overrides)
    return base


def _history_row(show_date: date, *, film: str, source_film_id: str) -> dict[str, str]:
    return {
        "Date": format_date_csv(show_date),
        "Time": "7:30PM",
        "Theater": "AMC Pacific Place 11",
        "Film": film,
        "Runtime": "120",
        "isAlmostSoldOut": "None",
        "posterDynamic": "https://example.com/p.jpg",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": "amc",
        "source_film_id": source_film_id,
    }


def test_tmdb_runtime_zero_is_unavailable_and_can_auto_confirm():
    scored = score_candidate(
        search_title="The Fix",
        source_year=2026,
        source_runtime=142,
        source_directors="Guy Moshe",
        source_external_ids=None,
        candidate=_cand(id=1228834, runtime=0),
    )
    assert scored.signals["runtime_conflict"] is False
    assert scored.signals["runtime_status"] == "unavailable"
    assert scored.signals["contributions"].get("runtime", {}).get("kind") != "conflict"
    assert "runtime" not in scored.signals["contributions"] or scored.signals[
        "contributions"
    ]["runtime"]["weight"] == 0
    assert scored.signals["hard_conflict"] is False
    assert scored.score >= AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "auto"


def test_genuine_runtime_mismatch_still_hard_conflicts():
    scored = score_candidate(
        search_title="The Fix",
        source_year=2026,
        source_runtime=142,
        source_directors="Guy Moshe",
        source_external_ids=None,
        candidate=_cand(id=1228834, runtime=60),
    )
    assert scored.signals["runtime_conflict"] is True
    assert scored.signals["hard_conflict"] is True
    assert scored.score < AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket != "auto"


def test_presentation_trailing_year_is_not_canonical():
    years = interpret_source_years(
        source_title="Seven Samurai 4K Restoration 2024",
        product_year=2024,
    )
    assert years.event_year == 2024
    assert years.event_year_not_canonical is True
    assert years.canonical_year_candidate is None
    assert years.scoring_year() is None


def test_title_year_beats_amc_product_year():
    years = interpret_source_years(
        source_title="Batman (1989)",
        product_year=2026,
        source="amc",
    )
    extracted = extract_match_title("Batman (1989)", source="amc")
    assert extracted.base_title == "Batman"
    assert years.scoring_year() == 1989
    assert years.title_years == (1989,)
    assert years.product_year == 2026
    assert years.canonical_year_candidate == 1989
    assert years.year_confidence == "title"


def test_anniversary_derived_year_and_search_title_remain():
    cases = [
        ("Cars: 20th Anniversary", "Cars", 2006),
        ("The Transformers: The Movie 40th Anniversary", "The Transformers: The Movie", 1986),
        ("Ghost in the Shell 30th Anniversary", "Ghost in the Shell", 1996),
        ("The Nutty Professor: 30th Anniversary", "The Nutty Professor", 1996),
        ("Wicked Early Access", "Wicked", None),
    ]
    for title, search, year in cases:
        years = interpret_source_years(source_title=title, product_year=2026, source="amc")
        elig = classify_eligibility(source_title=title, source="amc")
        assert elig.status == ELIGIBLE, title
        assert years.base_title == search, title
        if year is not None:
            assert years.scoring_year() == year, title
            assert years.anniversary_year_derived is True, title


def test_product_year_only_is_weak_and_mismatch_relaxed():
    years = interpret_source_years(
        source_title="The Lego Batman Movie",
        product_year=2026,
        source="amc",
    )
    assert years.product_year_weak is True
    assert years.search_year() is None
    assert years.year_mismatch_relaxed() is True
    scored = score_candidate(
        search_title="The Lego Batman Movie",
        source_year=years.scoring_year(),
        source_runtime=104,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 324849,
            "title": "The Lego Batman Movie",
            "original_title": "The Lego Batman Movie",
            "release_date": "2017-02-08",
            "runtime": 104,
            "popularity": 14,
            "adult": False,
            "media_type": "movie",
        },
        event_year_relaxed=years.year_mismatch_relaxed(),
    )
    assert scored.signals["year_conflict"] is False
    assert scored.signals["year_status"] == "unavailable"
    assert scored.score >= AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "auto"


def test_same_title_remake_ambiguity_still_protected():
    years = interpret_source_years(source_title="Dune", product_year=2026)
    scored = [
        score_candidate(
            search_title="Dune",
            source_year=years.scoring_year(),
            source_runtime=None,
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
            event_year_relaxed=years.year_mismatch_relaxed(),
        ),
        score_candidate(
            search_title="Dune",
            source_year=years.scoring_year(),
            source_runtime=None,
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
            event_year_relaxed=years.year_mismatch_relaxed(),
        ),
    ]
    bucket, proposed = classify_match_bucket(scored)
    assert bucket != "auto"
    assert proposed is not None
    assert "same_title_remake_ambiguity" in proposed.warnings or bucket == "review"


def test_search_title_strips_bare_year_and_amc_product_code():
    batman = extract_match_title("Batman (1989)", source="amc")
    assert batman.base_title == "Batman"
    assert "film_year_paren" in batman.applied_rules
    years = interpret_source_years(source_title="Batman (1989)", product_year=2026)
    assert years.scoring_year() == 1989

    phantasm = extract_match_title(
        "Batman: Mask of the Phantasm (2026BD)",
        source="amc",
    )
    assert phantasm.base_title == "Batman: Mask of the Phantasm"
    assert "amc_product_code_paren" in phantasm.applied_rules

    meaningful = extract_match_title(
        "Hundreds Of Beavers (Unite Here Fundraiser)",
        source="amc",
    )
    assert meaningful.base_title == "Hundreds Of Beavers (Unite Here Fundraiser)"
    assert "amc_product_code_paren" not in meaningful.applied_rules
    assert "film_year_paren" not in meaningful.applied_rules


def test_composite_plus_programs_excluded_single_titles_remain():
    trek = classify_eligibility(
        source_title=(
            "Space Seed + Star Trek II: The Wrath of Khan - "
            "Director's Cut 60th Anniversary Event"
        ),
        screening_variant_type="anniversary",
        source="amc",
    )
    assert trek.status == NON_FILM
    assert trek.entity_kind == "composite_event"
    assert "composite_title_pair" in trek.reasons

    city = classify_eligibility(
        source_title=(
            "The City on The Edge of Forever + Star Trek IV: "
            "The Voyage Home 60th Anniversary Event"
        ),
        source="amc",
    )
    assert city.status == NON_FILM
    assert city.entity_kind == "composite_event"

    plus_title = classify_eligibility(source_title="Thelma + Louise")
    assert plus_title.status == ELIGIBLE
    assert plus_title.entity_kind == "feature_film"

    anniversary = classify_eligibility(source_title="Cars: 20th Anniversary")
    assert anniversary.status == ELIGIBLE
    assert anniversary.entity_kind == "feature_film"
    assert anniversary.search_title == "Cars"


def test_reattach_confirmed_film_id_onto_existing_current(
    theaters_registry, tmp_path
):
    artifact = build_showtimes_current(
        [_history_row(REFERENCE, film="Tombstone", source_film_id="84821")],
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=datetime(2026, 6, 26, tzinfo=PACIFIC),
    )
    for film in artifact["films"]:
        film["film_id"] = None
    showtimes_path = tmp_path / "showtimes_current.json"
    catalog_path = tmp_path / "catalog.json"
    report_path = tmp_path / "emit.json"
    showtimes_path.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    catalog_path.write_text(
        json.dumps(
            {
                "schema_version": "1.0.0",
                "generated_at": "2026-06-26T00:00:00+00:00",
                "films": [
                    {
                        "film_id": "tmdb:11969",
                        "identity_type": "tmdb",
                        "tmdb_id": 11969,
                        "match_status": "confirmed_automatic",
                        "match_method": "automatic",
                        "match_confidence": 0.95,
                        "source_identities": [
                            {
                                "source": "amc",
                                "source_film_id": "84821",
                                "showtime_film_key": "tombstone",
                                "source_title": "Tombstone",
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    before_keys = [row["showtime_film_key"] for row in artifact["showtimes"]]
    result = reattach_public_film_ids_current(
        showtimes_path=showtimes_path,
        catalog_path=catalog_path,
        report_path=report_path,
        write=True,
    )
    updated = json.loads(showtimes_path.read_text(encoding="utf-8"))
    by_key = {film["showtime_film_key"]: film["film_id"] for film in updated["films"]}
    assert by_key.get("tombstone") == "tmdb:11969"
    assert [row["showtime_film_key"] for row in updated["showtimes"]] == before_keys
    assert len(updated["showtimes"]) == len(artifact["showtimes"])
    assert result["non_null_film_id"] == 1
    enrichment_index = {"tmdb:11969": {"display_title": "Tombstone"}}
    assert enrichment_index[by_key["tombstone"]]["display_title"] == "Tombstone"


def test_thresholds_remain_conservative():
    from reel_seattle.film_identity.constants import (
        AUTO_CONFIRM_MIN_SCORE,
        REMAKE_RUNTIME_AUTO_MARGIN_MIN,
        REVIEW_MIN_SCORE,
        TOP_CANDIDATE_MARGIN_MIN,
    )

    assert AUTO_CONFIRM_MIN_SCORE == 0.92
    assert REVIEW_MIN_SCORE == 0.55
    assert TOP_CANDIDATE_MARGIN_MIN == 0.08
    assert REMAKE_RUNTIME_AUTO_MARGIN_MIN == 0.20
    assert normalize_match_title("Hercules (1997)") == "Hercules"
