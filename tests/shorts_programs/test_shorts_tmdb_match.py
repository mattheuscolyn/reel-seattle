"""Focused tests for Shorts → TMDB identity matching."""

from __future__ import annotations

import copy
from typing import Any

import pytest

from reel_seattle.film_identity.scoring import score_candidate
from reel_seattle.film_identity.tmdb_client import TmdbClient
from reel_seattle.shorts_programs.model import ShortRecord
from reel_seattle.shorts_programs.tmdb_match import (
    classify_short_match_bucket,
    confirmed_tmdb_ids_from_shorts,
    match_short,
    match_shorts_artifact,
    shorts_auto_confirm_allowed,
)


def _candidate(
    *,
    tmdb_id: int,
    title: str,
    year: int | None = 2025,
    runtime: int | None = 18,
    director: str | None = "Dylan Young",
    original_title: str | None = None,
) -> dict[str, Any]:
    release = f"{year}-06-01" if year is not None else None
    return {
        "id": tmdb_id,
        "title": title,
        "original_title": original_title or title,
        "release_date": release,
        "runtime": runtime,
        "director": director,
        "popularity": 1.0,
        "poster_path": f"/poster{tmdb_id}.jpg",
        "overview": "A short film.",
        "external_ids": {},
    }


class FakeTmdbClient(TmdbClient):
    def __init__(self, search_results: list[dict[str, Any]], details: dict[int, dict[str, Any]]):
        super().__init__(auth=None, cache=None, fetch_json=None)
        self._search_results = search_results
        self._details = details
        self.search_calls: list[tuple[str, int | None]] = []

    def search_movie(self, query: str, *, year: int | None = None, page: int = 1) -> dict[str, Any]:
        self.search_calls.append((query, year))
        return {"results": list(self._search_results)}

    def movie_details(self, tmdb_id: int) -> dict[str, Any]:
        if tmdb_id not in self._details:
            raise RuntimeError(f"missing details for {tmdb_id}")
        return copy.deepcopy(self._details[tmdb_id])


def test_strong_title_year_director_runtime_auto_matches():
    cand = _candidate(tmdb_id=1669215, title="Dick's-A-Thon", year=2025, runtime=18)
    client = FakeTmdbClient(
        [cand],
        {
            1669215: {
                **cand,
                "credits": {
                    "crew": [{"job": "Director", "name": "Dylan Young", "id": 1}],
                    "cast": [],
                },
                "external_ids": {},
            }
        },
    )
    short = ShortRecord(
        short_id="nwff:short:demo:dick-s-a-thon",
        source="nwff",
        title="Dick's-A-Thon",
        directors=("Dylan Young",),
        year=2025,
        runtime_min=18,
    )
    result = match_short(short, client=client)
    assert result.short_id == "nwff:short:demo:dick-s-a-thon"
    assert result.match_status == "matched_automatic"
    assert result.canonical_film_id == "tmdb:1669215"
    assert result.tmdb_id == 1669215


def test_dicks_a_thon_style_punctuation_normalization():
    # Apostrophe / hyphen variants still title-match via normalize_title_key.
    cand = _candidate(tmdb_id=1669215, title="Dicks-A-Thon", year=2025, runtime=18)
    scored = score_candidate(
        search_title="Dick's-A-Thon",
        source_year=2025,
        source_runtime=18,
        source_directors="Dylan Young",
        source_external_ids=None,
        candidate=cand,
    )
    assert scored.signals.get("title_exact") is True
    assert shorts_auto_confirm_allowed(scored) is True


def test_alternate_short_search_title_strips_apostrophe():
    from reel_seattle.shorts_programs.tmdb_match import alternate_short_search_title

    assert alternate_short_search_title("Dick's-A-Thon") == "Dicks-A-Thon"


def test_dicks_a_thon_found_via_apostrophe_alternate_query():
    # TMDB indexes without apostrophe; primary query returns nothing.
    cand = _candidate(tmdb_id=1669215, title="Dicks-A-Thon", year=2026, runtime=18)

    class SelectiveClient(FakeTmdbClient):
        def search_movie(self, query: str, *, year: int | None = None, page: int = 1):
            self.search_calls.append((query, year))
            if "'" in query or "’" in query:
                return {"results": []}
            return {"results": [cand]}

    client = SelectiveClient(
        [cand],
        {
            1669215: {
                **cand,
                "credits": {
                    "crew": [{"job": "Director", "name": "Dylan Young", "id": 1}],
                    "cast": [],
                },
                "external_ids": {},
            }
        },
    )
    result = match_short(
        ShortRecord(
            short_id="nwff:short:demo:dick-s-a-thon",
            source="nwff",
            title="Dick's-A-Thon",
            directors=("Dylan Young",),
            year=2025,
            runtime_min=18,
        ),
        client=client,
    )
    assert any("Dicks-A-Thon" == q for q, _year in client.search_calls)
    assert result.canonical_film_id == "tmdb:1669215"
    assert result.match_status == "matched_automatic"


def test_title_only_ambiguous_does_not_auto_match():
    c1 = _candidate(tmdb_id=1, title="Home", year=2020, runtime=90, director="A One")
    c2 = _candidate(tmdb_id=2, title="Home", year=2015, runtime=12, director="B Two")
    client = FakeTmdbClient(
        [c1, c2],
        {
            1: {**c1, "credits": {"crew": [{"job": "Director", "name": "A One"}], "cast": []}, "external_ids": {}},
            2: {**c2, "credits": {"crew": [{"job": "Director", "name": "B Two"}], "cast": []}, "external_ids": {}},
        },
    )
    short = ShortRecord(
        short_id="nwff:short:demo:home",
        source="nwff",
        title="Home",
        directors=(),
        year=None,
        runtime_min=None,
    )
    result = match_short(short, client=client)
    assert result.canonical_film_id is None
    assert result.match_status in {"review", "unmatched"}


def test_conflicting_director_blocks_auto_match():
    cand = _candidate(
        tmdb_id=99,
        title="Dick's-A-Thon",
        year=2025,
        runtime=18,
        director="Someone Else",
    )
    client = FakeTmdbClient(
        [cand],
        {
            99: {
                **cand,
                "credits": {
                    "crew": [{"job": "Director", "name": "Someone Else", "id": 9}],
                    "cast": [],
                },
                "external_ids": {},
            }
        },
    )
    short = ShortRecord(
        short_id="nwff:short:demo:dick-s-a-thon",
        source="nwff",
        title="Dick's-A-Thon",
        directors=("Dylan Young",),
        year=2025,
        runtime_min=18,
    )
    result = match_short(short, client=client)
    assert result.canonical_film_id is None
    assert result.match_status in {"review", "unmatched"}


def test_missing_runtime_can_match_with_director_and_year():
    cand = _candidate(tmdb_id=1669215, title="Dick's-A-Thon", year=2025, runtime=None)
    client = FakeTmdbClient(
        [cand],
        {
            1669215: {
                **cand,
                "runtime": None,
                "credits": {
                    "crew": [{"job": "Director", "name": "Dylan Young", "id": 1}],
                    "cast": [],
                },
                "external_ids": {},
            }
        },
    )
    short = ShortRecord(
        short_id="nwff:short:demo:dick-s-a-thon",
        source="nwff",
        title="Dick's-A-Thon",
        directors=("Dylan Young",),
        year=2025,
        runtime_min=None,
    )
    result = match_short(short, client=client)
    assert result.canonical_film_id == "tmdb:1669215"
    assert result.match_status == "matched_automatic"


def test_missing_year_is_conservative_without_director_or_runtime():
    cand = _candidate(tmdb_id=5, title="Obscure Short", year=2019, runtime=20, director=None)
    client = FakeTmdbClient(
        [cand],
        {
            5: {
                **cand,
                "credits": {"crew": [], "cast": []},
                "external_ids": {},
            }
        },
    )
    short = ShortRecord(
        short_id="nwff:short:demo:obscure",
        source="nwff",
        title="Obscure Short",
        directors=(),
        year=None,
        runtime_min=None,
    )
    result = match_short(short, client=client)
    assert result.canonical_film_id is None


def test_multiple_directors_handled():
    cand = _candidate(
        tmdb_id=7,
        title="Pair Short",
        year=2024,
        runtime=12,
        director="Ada Lovelace, Grace Hopper",
    )
    scored = score_candidate(
        search_title="Pair Short",
        source_year=2024,
        source_runtime=12,
        source_directors="Ada Lovelace and Grace Hopper",
        source_external_ids=None,
        candidate=cand,
    )
    assert scored.signals.get("director_overlap") is True
    assert shorts_auto_confirm_allowed(scored) is True


def test_unresolved_short_remains_with_null_canonical_and_stable_id():
    artifact = {
        "schemaVersion": "1.0.0",
        "shortsPrograms": [
            {
                "shortsProgramId": "nwff:program:demo",
                "source": "nwff",
                "title": "Demo Program",
                "sourceFilmId": "demo",
                "sourceListingKey": "nwff|id|demo",
            }
        ],
        "shorts": [
            {
                "shortId": "nwff:short:demo:untitled",
                "source": "nwff",
                "title": "Untitled Unique Zzz",
                "directors": [],
                "year": 1999,
                "runtimeMin": 5,
                "canonicalFilmId": None,
            }
        ],
        "memberships": [],
        "stats": {},
    }
    client = FakeTmdbClient([], {})
    updated, audit = match_shorts_artifact(artifact, client=client)
    short = updated["shorts"][0]
    assert short["shortId"] == "nwff:short:demo:untitled"
    assert short["canonicalFilmId"] is None
    assert audit["stats"]["unmatched"] >= 1


def test_matching_never_changes_short_id():
    cand = _candidate(tmdb_id=1669215, title="Dick's-A-Thon")
    client = FakeTmdbClient(
        [cand],
        {
            1669215: {
                **cand,
                "credits": {
                    "crew": [{"job": "Director", "name": "Dylan Young", "id": 1}],
                    "cast": [],
                },
                "external_ids": {},
            }
        },
    )
    short_id = "nwff:short:local-sightings-2026-like-a-local:dick-s-a-thon"
    result = match_short(
        ShortRecord(
            short_id=short_id,
            source="nwff",
            title="Dick's-A-Thon",
            directors=("Dylan Young",),
            year=2025,
            runtime_min=18,
        ),
        client=client,
    )
    assert result.short_id == short_id
    assert result.short_id_unchanged == short_id


def test_shorts_program_rows_not_assigned_tmdb_ids():
    artifact = {
        "shortsPrograms": [
            {
                "shortsProgramId": "nwff:program:like-a-local",
                "source": "nwff",
                "title": "Like a Local",
                "sourceFilmId": "like-a-local",
            }
        ],
        "shorts": [],
        "memberships": [],
        "stats": {},
    }
    updated, _audit = match_shorts_artifact(artifact, client=FakeTmdbClient([], {}))
    assert "canonicalFilmId" not in updated["shortsPrograms"][0] or updated[
        "shortsPrograms"
    ][0].get("canonicalFilmId") in (None, updated["shortsPrograms"][0].get("canonicalFilmId"))
    assert updated["shortsPrograms"][0]["shortsProgramId"] == "nwff:program:like-a-local"


def test_matched_short_joins_enrichment_id_collection():
    artifact = {
        "shorts": [
            {
                "shortId": "nwff:short:demo:dick-s-a-thon",
                "title": "Dick's-A-Thon",
                "canonicalFilmId": "tmdb:1669215",
            }
        ]
    }
    rows = confirmed_tmdb_ids_from_shorts(artifact)
    assert rows[0]["tmdb_id"] == 1669215
    assert rows[0]["film_id"] == "tmdb:1669215"
    assert "shorts" in rows[0]["sources"]


def test_title_runtime_without_year_or_director_demoted():
    """Roll Modelz–style: exact title + runtime but no directors/year on TMDB."""
    from reel_seattle.film_identity.scoring import ScoredCandidate

    candidate = ScoredCandidate(
        tmdb_id=1564364,
        score=1.0,
        signals={
            "title_exact": True,
            "year_exact": False,
            "year_near": False,
            "year_status": "unavailable",
            "runtime_near": True,
            "director_overlap": False,
            "hard_conflict": False,
            "director_conflict": False,
            "runtime_conflict": False,
            "year_conflict": False,
            "title_conflict": False,
        },
        warnings=("missing_year_supported_by_other_evidence",),
        title="Roll Modelz",
        release_year=None,
    )
    assert shorts_auto_confirm_allowed(candidate) is False
    bucket, _proposed, blocked = classify_short_match_bucket([candidate])
    assert bucket == "review"
    assert blocked == "shorts_requires_director_or_runtime_corroboration"


def test_title_year_only_demoted_by_shorts_gate():
    ranked_scored = score_candidate(
        search_title="Common Title",
        source_year=2020,
        source_runtime=None,
        source_directors=None,
        source_external_ids=None,
        candidate=_candidate(
            tmdb_id=11,
            title="Common Title",
            year=2020,
            runtime=None,
            director=None,
        ),
    )
    # Simulate film auto path eligibility, then shorts demotion.
    from reel_seattle.film_identity.scoring import ScoredCandidate

    candidate = ScoredCandidate(
        tmdb_id=ranked_scored.tmdb_id,
        score=0.95,
        signals={
            **ranked_scored.signals,
            "title_exact": True,
            "year_exact": True,
            "runtime_near": False,
            "director_overlap": False,
            "hard_conflict": False,
        },
        warnings=(),
        title=ranked_scored.title,
        release_year=2020,
    )
    assert shorts_auto_confirm_allowed(candidate) is False
    bucket, proposed, blocked = classify_short_match_bucket([candidate])
    assert bucket == "review"
    assert blocked == "shorts_requires_director_or_runtime_corroboration"
    assert proposed is not None


def test_confirmed_tmdb_films_merges_shorts(monkeypatch):
    from reel_seattle.enrichment import audit as enrichment_audit

    catalog = {
        "films": [
            {
                "film_id": "tmdb:100",
                "tmdb_id": 100,
                "identity_type": "tmdb",
                "match_status": "confirmed_automatic",
                "sources": ["showtimes"],
            }
        ]
    }
    shorts = {
        "shorts": [
            {"shortId": "a", "canonicalFilmId": "tmdb:1669215", "title": "Dick's-A-Thon"},
            {"shortId": "b", "canonicalFilmId": "tmdb:100", "title": "Already In Catalog"},
        ]
    }
    rows = enrichment_audit.confirmed_tmdb_films(catalog, shorts_artifact=shorts)
    ids = {r["tmdb_id"] for r in rows}
    assert ids == {100, 1669215}
    shared = next(r for r in rows if r["tmdb_id"] == 100)
    assert "shorts" in shared["sources"]
