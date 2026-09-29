"""End-to-end matcher with mocked TMDB client."""

from __future__ import annotations

from reel_seattle.film_identity.decisions import empty_decisions_document
from reel_seattle.film_identity.matcher import build_match_artifacts, match_source_identity
from reel_seattle.film_identity.tmdb_client import TmdbClient, resolve_tmdb_auth


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


def test_auto_confirm_and_non_film_and_unmatched_usable():
    decisions = empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00")
    auto = match_source_identity(
        {
            "source": "amc",
            "source_film_id": "72474",
            "showtime_film_key": "moana",
            "source_title": "Moana",
            "normalized_title": "Moana",
            "year_hint": 2016,
            "release_year": 2016,
            "runtime_min": 107,
            "eligibility": "eligible",
            "eligibility_reasons": [],
            "film_id_fallback": "source:amc:72474",
        },
        client=FakeClient(),
        decisions_doc=decisions,
    )
    assert auto["match_status"] == "confirmed_automatic"
    assert auto["film_id"] == "tmdb:277355"

    mystery = match_source_identity(
        {
            "source": "amc",
            "source_film_id": "84361",
            "showtime_film_key": "amc-screen-unseen-july-20",
            "source_title": "AMC Screen Unseen: July 20",
            "normalized_title": "AMC Screen Unseen July 20",
            "eligibility": "non_film",
            "eligibility_reasons": ["mystery_or_unannounced"],
            "film_id_fallback": "source:amc:84361",
        },
        client=FakeClient(),
        decisions_doc=decisions,
    )
    assert mystery["match_status"] == "non_film"
    assert mystery["film_id"] == "source:amc:84361"


def test_build_artifacts_deterministic_ordering():
    decisions = empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00")
    identities = [
        {
            "source": "amc",
            "source_film_id": "72474",
            "showtime_film_key": "moana",
            "source_title": "Moana",
            "normalized_title": "Moana",
            "year_hint": 2016,
            "release_year": 2016,
            "runtime_min": 107,
            "eligibility": "eligible",
            "eligibility_reasons": [],
            "film_id_fallback": "source:amc:72474",
        },
        {
            "source": "beacon",
            "source_film_id": "xyz",
            "showtime_film_key": "xyz",
            "source_title": "AMC Screen Unseen: Night",
            "normalized_title": "AMC Screen Unseen Night",
            "eligibility": "non_film",
            "eligibility_reasons": ["mystery_or_unannounced"],
            "film_id_fallback": "source:beacon:xyz",
        },
    ]
    first = build_match_artifacts(
        identities,
        client=FakeClient(),
        decisions_doc=decisions,
        generated_at="2026-07-27T12:00:00+00:00",
    )
    second = build_match_artifacts(
        identities,
        client=FakeClient(),
        decisions_doc=decisions,
        generated_at="2026-07-27T12:00:00+00:00",
    )
    assert first["catalog"] == second["catalog"]
    assert first["coverage"]["confirmed_automatic"] == 1
    assert first["coverage"]["non_film"] == 1

class RecordingClient:
    def __init__(self):
        self.searches = []

    def search_movie(self, query, *, year=None, page=1):
        self.searches.append((query, year))
        candidates = {
            "Kanał": {
                "id": 1040,
                "title": "Kanał",
                "original_title": "Kanał",
                "release_date": "1957-04-20",
                "popularity": 5,
                "poster_path": "/kanal.jpg",
                "overview": "Wajda film.",
                "adult": False,
            },
            "Shambhala Story": {
                "id": 190001,
                "title": "Shambhala Story",
                "original_title": "Shambhala Story",
                "release_date": "2025-01-01",
                "popularity": 5,
                "poster_path": "/shambhala.jpg",
                "overview": "Tasveer film.",
                "adult": False,
            },
            "Wildwood": {
                "id": 190002,
                "title": "Wildwood",
                "original_title": "Wildwood",
                "release_date": "2026-01-01",
                "popularity": 5,
                "poster_path": "/wildwood.jpg",
                "overview": "Anderson film.",
                "adult": False,
            },
        }
        row = candidates.get(query)
        return {"results": [row] if row else []}

    def movie_details(self, tmdb_id):
        details = {
            1040: {
                "id": 1040,
                "title": "Kanał",
                "original_title": "Kanał",
                "release_date": "1957-04-20",
                "runtime": 96,
            },
            190001: {
                "id": 190001,
                "title": "Shambhala Story",
                "original_title": "Shambhala Story",
                "release_date": "2025-01-01",
                "runtime": 108,
            },
            190002: {
                "id": 190002,
                "title": "Wildwood",
                "original_title": "Wildwood",
                "release_date": "2026-01-01",
                "runtime": 132,
            },
        }
        return {
            **details[tmdb_id],
            "poster_path": "/x.jpg",
            "overview": "Film.",
            "external_ids": {},
            "credits": {"crew": []},
        }


def test_matcher_prefers_clean_source_identity_metadata_for_search():
    decisions = empty_decisions_document(updated_at="2026-09-29T00:00:00+00:00")
    cases = [
        (
            {
                "source": "siff",
                "source_film_id": "programs-and-events/andrzej-wajda/kanal",
                "showtime_film_key": "kanal",
                "source_title": "The Films of Andrzej Wajda: Kanał",
                "identity_title": "Kanał",
                "normalized_title": "Kanał",
                "release_year": 1957,
                "year_hint": 1957,
                "runtime_min": 96,
                "eligibility": "eligible",
                "eligibility_reasons": [],
                "film_id_fallback": "source:siff:programs-and-events/andrzej-wajda/kanal",
            },
            ("Kanał", 1957),
        ),
        (
            {
                "source": "tasveer",
                "source_film_id": "153164",
                "showtime_film_key": "shambhala-story",
                "source_title": "Shambhala Story (2025, Japan, Japanese subtitled in English)",
                "identity_title": "Shambhala Story",
                "normalized_title": "Shambhala Story",
                "release_year": 2025,
                "year_hint": 2025,
                "runtime_min": 108,
                "eligibility": "eligible",
                "eligibility_reasons": [],
                "film_id_fallback": "source:tasveer:153164",
            },
            ("Shambhala Story", 2025),
        ),
        (
            {
                "source": "anderson_school",
                "source_film_id": "ST00003282",
                "showtime_film_key": "wildwood",
                "source_title": "Wildwood (OCAP)",
                "identity_title": "Wildwood",
                "normalized_title": "Wildwood",
                "release_year": None,
                "year_hint": None,
                "runtime_min": 132,
                "eligibility": "eligible",
                "eligibility_reasons": [],
                "film_id_fallback": "source:anderson_school:ST00003282",
            },
            ("Wildwood", None),
        ),
    ]

    for identity, expected_search in cases:
        client = RecordingClient()
        result = match_source_identity(
            identity,
            client=client,
            decisions_doc=decisions,
        )
        assert client.searches[0] == expected_search
        assert result["normalized_title"] == expected_search[0]


def test_non_amc_source_release_year_remains_canonical_evidence():
    decisions = empty_decisions_document(updated_at="2026-09-29T00:00:00+00:00")
    client = RecordingClient()
    result = match_source_identity(
        {
            "source": "siff",
            "source_film_id": "programs-and-events/andrzej-wajda/kanal",
            "showtime_film_key": "kanal",
            "source_title": "The Films of Andrzej Wajda: Kanał",
            "identity_title": "Kanał",
            "normalized_title": "Kanał",
            "release_year": 1957,
            "year_hint": 1957,
            "runtime_min": 96,
            "eligibility": "eligible",
            "eligibility_reasons": [],
            "film_id_fallback": "source:siff:programs-and-events/andrzej-wajda/kanal",
        },
        client=client,
        decisions_doc=decisions,
    )
    assert result["year_hint"] == 1957
    assert result["year_interpretation"]["canonical_year_candidate"] == 1957
    assert result["year_interpretation"]["year_confidence"] == "explicit"
    assert result["year_interpretation"]["product_year_weak"] is False

