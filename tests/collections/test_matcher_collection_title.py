"""Collection identity-title candidate is preferred by the TMDB matcher."""

from __future__ import annotations

from reel_seattle.collections.matcher_hook import WARNING_CONFLICT, WARNING_USED_CANDIDATE
from reel_seattle.film_identity.decisions import empty_decisions_document
from reel_seattle.film_identity.matcher import match_source_identity


class _TitleClient:
    def search_movie(self, query, *, year=None, page=1):
        title = str(query).strip()
        if title.casefold() == "breathless":
            tmdb_id, name = 62, "Breathless"
        else:
            tmdb_id, name = 999001, title
        return {
            "results": [
                {
                    "id": tmdb_id,
                    "title": name,
                    "original_title": name,
                    "release_date": "1960-03-16",
                    "popularity": 40,
                    "poster_path": "/x.jpg",
                    "overview": "A film.",
                    "adult": False,
                }
            ]
        }

    def movie_details(self, tmdb_id):
        title = "Breathless" if tmdb_id == 62 else "Nouvelles Femmes Anthology"
        return {
            "id": tmdb_id,
            "title": title,
            "original_title": title,
            "release_date": "1960-03-16",
            "runtime": 90,
            "poster_path": "/x.jpg",
            "overview": "A film.",
            "external_ids": {"imdb_id": "tt0053472"},
            "credits": {"crew": [{"job": "Director", "name": "Jean-Luc Godard"}]},
        }


def test_matcher_prefers_collection_identity_title_candidate():
    decisions = empty_decisions_document(updated_at="2026-09-11T00:00:00+00:00")
    matched = match_source_identity(
        {
            "source": "siff",
            "source_film_id": "programs-and-events/nouvelles-femmes/breathless",
            "showtime_film_key": "nouvelles-femmes-breathless",
            "source_title": "Nouvelles Femmes: Breathless",
            "normalized_title": "Nouvelles Femmes: Breathless",
            "identity_title_candidate": "Breathless",
            "year_hint": 1960,
            "release_year": 1960,
            "runtime_min": 90,
            "eligibility": "eligible",
            "eligibility_reasons": [],
            "film_id_fallback": "source:siff:programs-and-events/nouvelles-femmes/breathless",
        },
        client=_TitleClient(),
        decisions_doc=decisions,
    )
    assert WARNING_USED_CANDIDATE in matched["warnings"]
    assert matched["film_id"] == "tmdb:62"
    assert matched["match_status"] == "confirmed_automatic"


def test_matcher_reviews_when_raw_and_candidate_confirm_different_ids():
    decisions = empty_decisions_document(updated_at="2026-09-11T00:00:00+00:00")
    matched = match_source_identity(
        {
            "source": "siff",
            "source_film_id": "programs-and-events/qwerty-program/breathless",
            "showtime_film_key": "qwerty-program-breathless",
            "source_title": "Qwerty Program: Breathless",
            "normalized_title": "Qwerty Program: Breathless",
            "identity_title_candidate": "Breathless",
            "year_hint": 1960,
            "release_year": 1960,
            "runtime_min": 90,
            "eligibility": "eligible",
            "eligibility_reasons": [],
            "film_id_fallback": "source:siff:programs-and-events/qwerty-program/breathless",
        },
        client=_TitleClient(),
        decisions_doc=decisions,
    )
    assert matched["match_status"] == "review_required"
    assert WARNING_CONFLICT in matched["warnings"]
    assert matched["tmdb_id"] is None
