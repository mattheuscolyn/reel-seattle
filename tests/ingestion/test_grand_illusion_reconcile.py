"""Grand Illusion cross-source reconciliation tests."""

from __future__ import annotations

from reel_seattle.ingestion.grand_illusion_reconcile import (
    identities_compatible,
    parent_identity_key,
    reconcile_grand_illusion_showtimes,
)
from reel_seattle.prototypes.grand_illusion import PRESENTER_ID


def test_parent_identity_matches_hole_title_variants():
    a = parent_identity_key("The Hole in 35mm", source="grand_illusion")
    b = parent_identity_key("The Hole (35mm)", source="siff")
    assert a and b and a == b


def test_no_fuzzy_title_merge():
    left = {
        "theater_id": "siff-film-center",
        "date": "2026-09-20",
        "time": "19:15",
        "film_title": "Don't Play With Fire",
        "source": "siff",
    }
    right = {
        "theater_id": "siff-film-center",
        "date": "2026-09-20",
        "time": "19:15",
        "film_title": "Play With Fire Festival",
        "source": "grand_illusion",
    }
    assert not identities_compatible(left, right)


def test_reconcile_prefers_host_and_attaches_presenter():
    host = {
        "id": "host-1",
        "theater_id": "siff-film-center",
        "date": "2026-09-20",
        "time": "18:30",
        "film_title": "The Hole (35mm)",
        "source": "siff",
        "source_title": "The Hole (35mm)",
        "attributes": {},
        "ticket_url": "https://siff.example/hole",
    }
    gi = {
        "id": "gi-1",
        "theater_id": "siff-film-center",
        "date": "2026-09-20",
        "time": "18:30",
        "film_title": "The Hole in 35mm",
        "source": "grand_illusion",
        "source_title": "The Hole in 35mm",
        "attributes": {
            "presenters": [
                {
                    "id": PRESENTER_ID,
                    "name": "Grand Illusion Cinema",
                    "source_url": "https://grandillusioncinema.org/film/the-hole-in-35mm/",
                }
            ],
            "ticket_url": "https://siff.example/other",
        },
    }
    out = reconcile_grand_illusion_showtimes([host, gi])
    assert len(out) == 1
    assert out[0]["id"] == "host-1"
    assert out[0]["source"] == "siff"
    assert out[0]["ticket_url"] == "https://siff.example/hole"
    presenters = out[0]["attributes"]["presenters"]
    assert presenters[0]["id"] == PRESENTER_ID


def test_unmatched_gi_published_when_eligible():
    gi = {
        "id": "gi-only",
        "theater_id": "northwest-film-forum",
        "date": "2026-09-28",
        "time": "19:00",
        "film_title": "Shu Lea Cheang double feature",
        "source": "grand_illusion",
        "source_film_id": "shu-lea-cheang-double-feature",
        "performance_id": "xsrc:grand-illusion:0123456789abcdef",
        "attributes": {"source_occurrence_id": "gi-occurrence-1"},
    }
    host = {
        "id": "other",
        "theater_id": "northwest-film-forum",
        "date": "2026-09-28",
        "time": "21:00",
        "film_title": "Something Else",
        "source": "nwff",
        "attributes": {},
    }
    out = reconcile_grand_illusion_showtimes([host, gi])
    assert [row["id"] for row in out] == ["other", "gi-only"]


def test_unmatched_gi_without_performance_id_not_published():
    gi = {
        "id": "gi-only",
        "theater_id": "northwest-film-forum",
        "date": "2026-09-28",
        "time": "19:00",
        "film_title": "Shu Lea Cheang double feature",
        "source": "grand_illusion",
        "source_film_id": "shu-lea-cheang-double-feature",
        "attributes": {"source_occurrence_id": "gi-occurrence-1"},
    }

    assert reconcile_grand_illusion_showtimes([gi]) == []
