"""Offline tests for the TMDB US theatrical discover query."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from reel_seattle.film_identity.tmdb_discover import (
    FLAG_MISSING_OVERVIEW,
    FLAG_MISSING_POSTER,
    FLAG_NO_VOTES_LOW_POPULARITY,
    FLAG_VERY_LOW_POPULARITY,
    REASON_OUTSIDE_WINDOW,
    TmdbDiscoverValidationError,
    build_us_theatrical_candidates,
    discover_params,
    fetch_us_theatrical,
    load_us_theatrical_candidates,
    normalize_discover_row,
    quality_flags_for,
    validate_us_theatrical_candidates,
    write_us_theatrical_candidates,
)

START = date(2026, 9, 15)
END = date(2026, 12, 14)
GENERATED_AT = "2026-09-15T23:00:00-07:00"


class FakeClient:
    """Minimal stand-in for ``TmdbClient`` returning canned discover pages."""

    def __init__(self, pages, *, fail_on_page: int | None = None):
        self.pages = pages
        self.fail_on_page = fail_on_page
        self.calls: list[dict] = []

    def discover_movie(self, params):
        self.calls.append(dict(params))
        page = int(params["page"])
        if self.fail_on_page is not None and page == self.fail_on_page:
            raise RuntimeError("upstream unavailable")
        if page > len(self.pages):
            return {"page": page, "total_pages": len(self.pages), "total_results": 0, "results": []}
        return {
            "page": page,
            "total_pages": len(self.pages),
            "total_results": sum(len(rows) for rows in self.pages),
            "results": self.pages[page - 1],
        }


def _row(tmdb_id: int, title: str, **overrides):
    base = {
        "id": tmdb_id,
        "title": title,
        "original_title": title,
        "original_language": "en",
        "release_date": "2026-10-30",
        "popularity": 12.5,
        "vote_count": 40,
        "poster_path": "/poster.jpg",
        "overview": "An overview.",
        "adult": False,
    }
    base.update(overrides)
    return base


def test_discover_params_match_the_product_definition():
    params = discover_params(start_date=START, end_date=END, page=2)

    assert params == {
        "page": 2,
        "include_adult": "false",
        "language": "en-US",
        "region": "US",
        "release_date.gte": "2026-09-15",
        "release_date.lte": "2026-12-14",
        "with_release_type": "2|3",
        "sort_by": "release_date.asc",
    }


def test_fetch_pages_until_total_pages_reached():
    client = FakeClient([[_row(1, "Alpha")], [_row(2, "Beta")]])

    result = fetch_us_theatrical(client, start_date=START, end_date=END, max_pages=10)

    assert result.status == "success"
    assert result.pages_fetched == 2
    assert result.reported_total_pages == 2
    assert result.reported_total_results == 2
    assert result.exhausted is True
    assert [row["id"] for row in result.rows] == [1, 2]


def test_fetch_records_failure_as_partial():
    client = FakeClient([[_row(1, "Alpha")], [_row(2, "Beta")]], fail_on_page=2)

    result = fetch_us_theatrical(client, start_date=START, end_date=END, max_pages=10)

    assert result.status == "partial"
    assert result.pages_fetched == 1
    assert result.errors[0]["page"] == 2
    assert "upstream unavailable" in result.errors[0]["error"]


def test_fetch_with_immediate_failure_is_failed():
    client = FakeClient([[_row(1, "Alpha")]], fail_on_page=1)

    result = fetch_us_theatrical(client, start_date=START, end_date=END)

    assert result.status == "failed"
    assert result.ok is False


def test_fetch_respects_max_pages():
    client = FakeClient([[_row(i, f"Film {i}")] for i in range(1, 6)])

    result = fetch_us_theatrical(client, start_date=START, end_date=END, max_pages=2)

    assert result.pages_fetched == 2
    assert result.exhausted is False


def test_quality_flags_cover_all_diagnostics():
    flags = quality_flags_for(
        has_poster=False, popularity=0.2, vote_count=0, has_overview=False
    )

    assert flags == [
        FLAG_MISSING_POSTER,
        FLAG_VERY_LOW_POPULARITY,
        FLAG_NO_VOTES_LOW_POPULARITY,
        FLAG_MISSING_OVERVIEW,
    ]


def test_quality_flags_empty_for_healthy_candidate():
    assert (
        quality_flags_for(has_poster=True, popularity=25.0, vote_count=300, has_overview=True)
        == []
    )


def test_normalize_row_keeps_diagnostics_without_dropping_low_quality():
    candidate, reasons = normalize_discover_row(
        _row(99, "Tiny Indie", popularity=0.4, vote_count=0, poster_path=None, overview=""),
        start_date=START,
        end_date=END,
    )

    assert reasons == []
    assert candidate["has_poster"] is False
    assert candidate["quality_flags"] == [
        FLAG_MISSING_POSTER,
        FLAG_VERY_LOW_POPULARITY,
        FLAG_NO_VOTES_LOW_POPULARITY,
        FLAG_MISSING_OVERVIEW,
    ]


def test_normalize_row_flags_out_of_window_release():
    _candidate, reasons = normalize_discover_row(
        _row(99, "Next Year", release_date="2027-05-01"),
        start_date=START,
        end_date=END,
    )

    assert REASON_OUTSIDE_WINDOW in reasons


def test_normalize_row_rejects_missing_identity():
    candidate, reasons = normalize_discover_row(
        {"title": "", "id": None}, start_date=START, end_date=END
    )

    assert candidate is None
    assert "missing_tmdb_id" in reasons
    assert "missing_title" in reasons


def test_build_candidates_excludes_out_of_window_rows_but_counts_them():
    client = FakeClient(
        [
            [
                _row(1, "In Window", release_date="2026-10-01"),
                _row(2, "Too Late", release_date="2027-01-01"),
            ]
        ]
    )
    result = fetch_us_theatrical(client, start_date=START, end_date=END)

    artifact = build_us_theatrical_candidates(
        result, start_date=START, end_date=END, window_days=90, generated_at=GENERATED_AT
    )

    assert [c["title"] for c in artifact["candidates"]] == ["In Window"]
    assert artifact["stats"]["raw_rows"] == 2
    assert artifact["stats"]["rejected_rows"] == 1
    assert artifact["stats"]["rejected_reason_counts"][REASON_OUTSIDE_WINDOW] == 1
    validate_us_theatrical_candidates(artifact)


def test_build_candidates_sorts_by_release_date_then_title():
    client = FakeClient(
        [
            [
                _row(1, "Zebra", release_date="2026-10-05"),
                _row(2, "Alpha", release_date="2026-10-05"),
                _row(3, "Earliest", release_date="2026-09-20"),
            ]
        ]
    )
    artifact = build_us_theatrical_candidates(
        fetch_us_theatrical(client, start_date=START, end_date=END),
        start_date=START,
        end_date=END,
        window_days=90,
        generated_at=GENERATED_AT,
    )

    assert [c["title"] for c in artifact["candidates"]] == ["Earliest", "Alpha", "Zebra"]


def test_build_candidates_deduplicates_repeated_ids():
    client = FakeClient([[_row(1, "Alpha")], [_row(1, "Alpha")]])
    artifact = build_us_theatrical_candidates(
        fetch_us_theatrical(client, start_date=START, end_date=END),
        start_date=START,
        end_date=END,
        window_days=90,
        generated_at=GENERATED_AT,
    )

    assert artifact["stats"]["duplicate_ids_skipped"] == 1
    assert len(artifact["candidates"]) == 1


def test_query_block_records_the_exact_contract():
    artifact = build_us_theatrical_candidates(
        fetch_us_theatrical(FakeClient([[_row(1, "Alpha")]]), start_date=START, end_date=END),
        start_date=START,
        end_date=END,
        window_days=90,
        generated_at=GENERATED_AT,
    )

    assert artifact["query"]["region"] == "US"
    assert artifact["query"]["release_types"] == "2|3"
    assert artifact["query"]["window_days"] == 90
    assert artifact["query"]["start_date"] == "2026-09-15"
    assert artifact["query"]["end_date"] == "2026-12-14"


def test_validation_rejects_candidate_outside_query_window():
    artifact = build_us_theatrical_candidates(
        fetch_us_theatrical(FakeClient([[_row(1, "Alpha")]]), start_date=START, end_date=END),
        start_date=START,
        end_date=END,
        window_days=90,
        generated_at=GENERATED_AT,
    )
    artifact["candidates"][0]["release_date"] = "2027-03-01"

    with pytest.raises(TmdbDiscoverValidationError, match="outside query window"):
        validate_us_theatrical_candidates(artifact)


def test_write_and_load_round_trip(tmp_path: Path):
    artifact = build_us_theatrical_candidates(
        fetch_us_theatrical(FakeClient([[_row(1, "Alpha")]]), start_date=START, end_date=END),
        start_date=START,
        end_date=END,
        window_days=90,
        generated_at=GENERATED_AT,
    )
    target = tmp_path / "tmdb_us_theatrical_candidates.json"

    write_us_theatrical_candidates(artifact, target)

    assert load_us_theatrical_candidates(target) == artifact
    assert load_us_theatrical_candidates(tmp_path / "missing.json") is None
