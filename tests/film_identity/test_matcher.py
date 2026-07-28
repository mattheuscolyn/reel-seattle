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
