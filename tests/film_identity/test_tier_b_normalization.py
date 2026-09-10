"""Tier B deterministic TMDB title normalization and search-recall."""

from __future__ import annotations

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    REMAKE_RUNTIME_AUTO_MARGIN_MIN,
    REVIEW_MIN_SCORE,
    TOP_CANDIDATE_MARGIN_MIN,
)
from reel_seattle.film_identity.matcher import (
    collect_search_candidates,
    match_source_identity,
    plan_tmdb_search_queries,
)
from reel_seattle.film_identity.decisions import empty_decisions_document
from reel_seattle.film_identity.normalize_text import normalize_title_key
from reel_seattle.film_identity.presentation import extract_match_title, normalize_match_title
from reel_seattle.film_identity.scoring import (
    classify_match_bucket,
    score_candidate,
    subtitle_like_prefix_title,
)
from reel_seattle.film_identity.title_rules import expand_known_search_abbreviations


def test_safety_thresholds_unchanged():
    assert AUTO_CONFIRM_MIN_SCORE == 0.92
    assert REVIEW_MIN_SCORE == 0.55
    assert TOP_CANDIDATE_MARGIN_MIN == 0.08
    assert REMAKE_RUNTIME_AUTO_MARGIN_MIN == 0.20


def test_mst3k_prefix_expansion_and_normalized_equivalence():
    source = "MST3K: The RiffTrax Experiments - Sting of Death"
    tmdb = "Mystery Science Theater 3000: The RiffTrax Experiments — Sting of Death"
    expanded, abbrev = expand_known_search_abbreviations(source)
    assert abbrev == "mst3k"
    assert expanded.startswith("Mystery Science Theater 3000")
    extracted = extract_match_title(source, source="amc")
    assert extracted.base_title == expanded
    assert extracted.search_abbreviation == "mst3k"
    assert extracted.alternate_search_title == source
    assert extracted.original_title == source
    assert normalize_title_key(extracted.base_title) == normalize_title_key(tmdb)


def test_unrelated_acronym_not_expanded():
    title = "NASA: A Space Documentary"
    expanded, abbrev = expand_known_search_abbreviations(title)
    assert abbrev is None
    assert expanded == title
    mid = "The MST3K Reunion"
    expanded_mid, abbrev_mid = expand_known_search_abbreviations(mid)
    assert abbrev_mid is None
    assert expanded_mid == mid
    assert normalize_match_title(title, source="amc") == title


def test_program_series_prefixes_and_source_scope():
    siff_club = extract_match_title("SIFF Movie Club: Serial Mom", source="siff")
    assert siff_club.base_title == "Serial Mom"
    assert siff_club.program_series == "SIFF Movie Club"
    assert (
        extract_match_title("SIFF Movie Club: Serial Mom", source="amc").base_title
        == "SIFF Movie Club: Serial Mom"
    )

    breathless = extract_match_title("Nouvelles Femmes: Breathless", source="siff")
    assert breathless.base_title == "Breathless"
    assert breathless.program_series == "Nouvelles Femmes"

    dolly = extract_match_title(
        "Celebrating Dolly: Steel Magnolias",
        source="central_cinema",
    )
    assert dolly.base_title == "Steel Magnolias"
    assert dolly.program_series == "Celebrating Dolly"
    assert (
        extract_match_title(
            "Celebrating Dolly: Steel Magnolias",
            source="siff",
        ).base_title
        == "Celebrating Dolly: Steel Magnolias"
    )

    secs = extract_match_title(
        "SECS FEST PRESENTS THE RASPBERRY REICH",
        source="beacon",
    )
    assert secs.base_title == "The Raspberry Reich"
    assert secs.program_series == "Secs Fest Presents"

    wtf = extract_match_title("WTF with STUFF - Neptune Frost", source="nwff")
    assert wtf.base_title == "Neptune Frost"
    assert wtf.program_series == "WTF with STUFF"

    assert (
        normalize_match_title("Mystery Marathon: Some Obscure Film", source="siff")
        == "Mystery Marathon: Some Obscure Film"
    )


def test_event_parenthetical_strip_keeps_genuine_subtitles():
    matewan = extract_match_title("Matewan (Unite Here Fundraiser)", source="beacon")
    assert matewan.base_title == "Matewan"
    assert "event_parenthetical" in matewan.applied_rules

    pain = extract_match_title(
        "The Pain And The Power (Advance Screening)",
        source="siff",
    )
    assert pain.base_title == "The Pain And The Power"

    benefit = extract_match_title("Local Film (Community Benefit)", source="beacon")
    assert benefit.base_title == "Local Film"

    member = extract_match_title("Local Film (Member Screening)", source="siff")
    assert member.base_title == "Local Film"

    genuine = extract_match_title("Serial Mom (A John Waters Film)", source="siff")
    assert genuine.base_title == "Serial Mom (A John Waters Film)"
    assert "event_parenthetical" not in genuine.applied_rules


def test_contextual_premium_and_control():
    hope = extract_match_title("HOPE Premium Early Access", source="amc")
    assert hope.base_title == "HOPE"
    assert "Premium" in " ".join(hope.removed_phrases) or "premium" in (
        hope.event_phrase or ""
    ).casefold()

    rush = extract_match_title("Premium Rush", source="amc")
    assert rush.base_title == "Premium Rush"

    leftover_control = extract_match_title("HOPE Premium", source="amc")
    assert leftover_control.base_title == "HOPE Premium"


def test_query_plan_alternate_and_dedupe():
    queries = plan_tmdb_search_queries(
        search_title="Mystery Science Theater 3000: The RiffTrax Experiments - Sting of Death",
        alternate_title="MST3K: The RiffTrax Experiments - Sting of Death",
        search_year=2026,
    )
    assert [q["reason"] for q in queries] == [
        "normalized_title_year",
        "normalized_title",
        "alternate_normalized_title",
    ]
    assert len(queries) <= 3

    yearless = plan_tmdb_search_queries(
        search_title="Serial Mom",
        alternate_title=None,
        search_year=None,
    )
    assert yearless == [
        {"title": "Serial Mom", "year": None, "reason": "normalized_title"}
    ]


class _RecordingClient:
    def __init__(self, results_by_key):
        self.results_by_key = results_by_key
        self.calls = []

    def search_movie(self, query, *, year=None, page=1):
        self.calls.append({"title": query, "year": year})
        key = (query, year)
        return {"results": list(self.results_by_key.get(key, []))}


def test_collect_search_candidates_dedupes_and_bounds_requests():
    client = _RecordingClient(
        {
            ("Hope", 2026): [
                {"id": 1, "title": "Hope", "release_date": "2026-01-01"},
                {"id": 2, "title": "Other", "release_date": "2026-01-01"},
            ],
            ("Hope", None): [
                {"id": 1, "title": "Hope", "release_date": "2025-01-01"},
                {"id": 3, "title": "Hope Restored", "release_date": "1990-01-01"},
            ],
            ("HOPE Premium", None): [
                {"id": 4, "title": "Should Not Run", "release_date": "2020-01-01"},
            ],
        }
    )
    queries = plan_tmdb_search_queries(
        search_title="Hope",
        alternate_title="HOPE Premium",
        search_year=2026,
        rerelease_ambiguous=True,
    )
    results, executed = collect_search_candidates(
        client,
        queries,
        rerelease_ambiguous=True,
    )
    ids = [row["id"] for row in results]
    assert ids == [1, 2, 3]
    assert len(executed) == 2
    assert len(client.calls) == 2
    assert all(row.get("search_query_reason") for row in results)
    assert results[0]["search_query_reason"] == "normalized_title_year"

    trusted = _RecordingClient(
        {
            ("Moana", 2016): [{"id": 277355, "title": "Moana", "release_date": "2016-11-23"}],
            ("Moana", None): [{"id": 99, "title": "Moana II", "release_date": "2024-01-01"}],
        }
    )
    _, executed_trusted = collect_search_candidates(
        trusted,
        plan_tmdb_search_queries(search_title="Moana", search_year=2016),
        rerelease_ambiguous=False,
    )
    assert len(executed_trusted) == 1
    assert trusted.calls == [{"title": "Moana", "year": 2016}]


def test_alternate_query_runs_when_primary_empty():
    client = _RecordingClient(
        {
            (
                "Mystery Science Theater 3000: Sting of Death",
                None,
            ): [],
            ("MST3K: Sting of Death", None): [
                {"id": 1725104, "title": "Mystery Science Theater 3000: Sting of Death"}
            ],
        }
    )
    results, executed = collect_search_candidates(
        client,
        plan_tmdb_search_queries(
            search_title="Mystery Science Theater 3000: Sting of Death",
            alternate_title="MST3K: Sting of Death",
            search_year=None,
        ),
    )
    assert [row["id"] for row in results] == [1725104]
    assert [row["reason"] for row in executed] == [
        "normalized_title",
        "alternate_normalized_title",
    ]
    assert results[0]["search_query_reason"] == "alternate_normalized_title"


def test_mirzapur_corroborated_prefix_can_auto():
    scored = score_candidate(
        search_title="Mirzapur",
        source_year=2026,
        source_runtime=195,
        source_directors="Gurmmeet Singh",
        source_external_ids=None,
        candidate={
            "id": 1378537,
            "title": "Mirzapur: The Movie",
            "release_date": "2026-01-01",
            "runtime": 197,
            "director": "Gurmmeet Singh",
            "popularity": 2.5,
            "adult": False,
            "media_type": "movie",
        },
    )
    assert scored.signals["title_prefix_equivalence"] is True
    assert scored.signals["title_exact"] is True
    assert scored.signals["title_conflict"] is False
    assert scored.score >= AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "auto"


def test_prefix_only_without_corroboration_cannot_auto():
    scored = score_candidate(
        search_title="Invasion",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 9,
            "title": "Invasion of the Body Snatchers",
            "release_date": "1978-12-22",
            "runtime": 115,
            "popularity": 20,
            "adult": False,
            "media_type": "movie",
        },
    )
    assert subtitle_like_prefix_title(("invasion",), ("invasion", "of", "the", "body", "snatchers")) is False
    assert scored.signals["title_prefix_equivalence"] is False
    assert scored.signals["title_conflict"] is True
    assert scored.score < AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket != "auto"


def test_sahaa_prefix_with_runtime_conflict_stays_review():
    scored = score_candidate(
        search_title="Sahaa",
        source_year=2026,
        source_runtime=140,
        source_directors="Nishanth Doti",
        source_external_ids=None,
        candidate={
            "id": 1516092,
            "title": "Sahaa - Life of Sanju",
            "release_date": "2026-01-01",
            "runtime": 165,
            "director": "Nishanth Doti",
            "popularity": 1.3,
            "adult": False,
            "media_type": "movie",
        },
    )
    assert scored.signals["title_prefix_equivalence"] is True
    assert scored.signals["runtime_conflict"] is True
    assert scored.signals["hard_conflict"] is True
    assert scored.score < AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "review"


def test_beacon_same_title_remains_review():
    scored = score_candidate(
        search_title="Capone Cries A Lot",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 111,
            "title": "Capone Cries a Lot",
            "release_date": "1985-01-01",
            "runtime": 0,
            "popularity": 1.2,
            "adult": False,
            "media_type": "movie",
        },
    )
    assert "weak_title_only_match" in scored.warnings
    assert scored.score < AUTO_CONFIRM_MIN_SCORE
    bucket, _ = classify_match_bucket([scored])
    assert bucket == "review"


def test_remake_ambiguity_still_blocks_auto():
    a = score_candidate(
        search_title="The Face Of Another",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 1,
            "title": "The Face of Another",
            "release_date": "1966-01-01",
            "runtime": 124,
            "popularity": 8,
            "adult": False,
            "media_type": "movie",
        },
    )
    b = score_candidate(
        search_title="The Face Of Another",
        source_year=None,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate={
            "id": 2,
            "title": "The Face of Another",
            "release_date": "2013-01-01",
            "runtime": 90,
            "popularity": 7,
            "adult": False,
            "media_type": "movie",
        },
    )
    bucket, proposed = classify_match_bucket([a, b])
    assert bucket == "review"
    assert proposed is not None
    assert "same_title_remake_ambiguity" in proposed.warnings or bucket == "review"


def test_matcher_records_query_provenance():
    class Client:
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
                "credits": {"crew": [{"job": "Director", "name": "Ron Clements"}]},
            }

    result = match_source_identity(
        {
            "source": "amc",
            "source_film_id": "72474",
            "showtime_film_key": "moana",
            "source_title": "Moana (2016)",
            "normalized_title": "Moana",
            "year_hint": 2016,
            "release_year": 2016,
            "runtime_min": 107,
            "eligibility": "eligible",
            "eligibility_reasons": [],
            "film_id_fallback": "source:amc:72474",
        },
        client=Client(),
        decisions_doc=empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00"),
    )
    queries = result["provenance"]["tmdb_search_queries"]
    assert queries
    assert queries[0]["reason"] == "normalized_title_year"
    assert result["candidates"][0]["search_query_reason"] == "normalized_title_year"
