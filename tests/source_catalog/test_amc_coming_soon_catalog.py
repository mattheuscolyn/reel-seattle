"""Offline tests for AMC Coming Soon catalog ingestion."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.source_catalog.amc_coming_soon import (
    COMING_SOON_VIEW_PATH,
    COMING_SOON_VIEW_URL,
    ComingSoonCatalogError,
    ComingSoonCatalogValidationError,
    build_coming_soon_catalog,
    fetch_coming_soon_catalog,
    load_coming_soon_catalog,
    load_offline_fixture_pages,
    normalize_catalog_movie,
    validate_coming_soon_catalog,
    write_coming_soon_catalog,
)

GENERATED_AT = "2026-09-15T23:00:00-07:00"


def _movie(movie_id: str, name: str, **overrides):
    base = {
        "id": int(movie_id),
        "name": name,
        "sortableName": name,
        "wwmReleaseNumber": 1000 + int(movie_id),
        "runTime": 118,
        "releaseDateUtc": "2026-11-20T00:00:00Z",
        "hasScheduledShowtimes": False,
        "onlineTicketAvailabilityDateUtc": None,
        "earliestShowingUtc": None,
        "genre": "Drama",
        "mpaaRating": "PG-13",
        "slug": name.lower().replace(" ", "-"),
        "websiteUrl": f"https://amc.test/{movie_id}",
        "showtimesUrl": None,
        "synopsis": "A synopsis.",
        "directors": "Some Director",
        "starringActors": "A, B",
        "distributorId": 7,
        "distributorCode": "UNI",
        "preferredMediaType": None,
        "availableForAList": True,
        "media": {"posterDynamic": "https://amc.test/poster.jpg"},
    }
    base.update(overrides)
    return base


def _page(movies, *, count: int, has_next: bool):
    payload = {
        "count": count,
        "_embedded": {"movies": movies},
        "_links": {"self": {"href": COMING_SOON_VIEW_URL}},
    }
    if has_next:
        payload["_links"]["next"] = {"href": f"{COMING_SOON_VIEW_URL}?page-number=2"}
    return payload


def _fetch_from_pages(pages):
    def fetch_page(page_number: int, _page_size: int):
        if page_number > len(pages):
            return 200, _page([], count=0, has_next=False), None
        return 200, pages[page_number - 1], None

    return fetch_page


def test_fetch_walks_all_pages_until_next_link_absent():
    pages = [
        _page([_movie("1", "Alpha"), _movie("2", "Beta")], count=3, has_next=True),
        _page([_movie("3", "Gamma")], count=3, has_next=False),
    ]

    result = fetch_coming_soon_catalog(_fetch_from_pages(pages), page_size=2, max_pages=10)

    assert result.status == "success"
    assert result.pages_fetched == 2
    assert result.reported_total == 3
    assert result.exhausted is True
    assert result.next_link_observed is True
    assert [movie["id"] for movie in result.movies] == [1, 2, 3]


def test_fetch_deduplicates_repeated_ids_across_pages():
    pages = [
        _page([_movie("1", "Alpha")], count=2, has_next=True),
        _page([_movie("1", "Alpha"), _movie("2", "Beta")], count=2, has_next=False),
    ]

    result = fetch_coming_soon_catalog(_fetch_from_pages(pages), max_pages=5)

    assert result.duplicate_ids == 1
    assert [movie["id"] for movie in result.movies] == [1, 2]


def test_fetch_respects_max_pages_guard():
    def always_more(page_number: int, _page_size: int):
        return 200, _page([_movie(str(page_number), f"Film {page_number}")], count=99, has_next=True), None

    result = fetch_coming_soon_catalog(always_more, max_pages=3)

    assert result.pages_fetched == 3
    assert result.exhausted is False
    assert len(result.movies) == 3


def test_fetch_records_http_failure_and_reports_partial():
    pages = [_page([_movie("1", "Alpha")], count=5, has_next=True)]

    def fetch_page(page_number: int, _page_size: int):
        if page_number == 1:
            return 200, pages[0], None
        return 503, None, "HTTP 503"

    result = fetch_coming_soon_catalog(fetch_page, max_pages=5)

    assert result.status == "partial"
    assert result.errors == [{"page": 2, "http_status": 503, "error": "HTTP 503"}]
    assert result.ok is True


def test_fetch_with_no_records_is_failed():
    def fetch_page(_page_number: int, _page_size: int):
        return 401, None, "HTTP 401"

    result = fetch_coming_soon_catalog(fetch_page, max_pages=2)

    assert result.status == "failed"
    assert result.ok is False


def test_normalize_catalog_movie_projects_source_metadata():
    record = normalize_catalog_movie(_movie("8001", "Announced Film"))

    assert record["source"] == "amc"
    assert record["source_film_id"] == "8001"
    assert record["source_title"] == "Announced Film"
    assert record["source_release_id"] == "9001"
    assert record["release_date_utc"] == "2026-11-20T00:00:00Z"
    assert record["has_scheduled_showtimes"] is False
    assert record["media"]["poster_url"] == "https://amc.test/poster.jpg"
    assert record["presentation"]["category"] == "standard"
    assert record["presentation"]["is_special_presentation"] is False


def test_normalize_catalog_movie_requires_id():
    with pytest.raises(ComingSoonCatalogError):
        normalize_catalog_movie({"name": "No Id"})


def test_normalize_flags_special_presentation_variants():
    record = normalize_catalog_movie(
        _movie("8002", "Announced Film Q&A With The Director")
    )

    assert record["presentation"]["is_special_presentation"] is True


def test_build_catalog_sorts_and_summarizes():
    pages = [
        _page(
            [
                _movie("20", "Later Film", releaseDateUtc="2026-12-05T00:00:00Z"),
                _movie("3", "Earlier Film", releaseDateUtc="2026-10-02T00:00:00Z"),
                _movie("7", "Scheduled Film", hasScheduledShowtimes=True),
            ],
            count=3,
            has_next=False,
        )
    ]
    result = fetch_coming_soon_catalog(_fetch_from_pages(pages), max_pages=2)

    artifact = build_coming_soon_catalog(result, generated_at=GENERATED_AT)

    assert artifact["schema_version"] == "1.0.0"
    assert artifact["fetch"]["endpoint"] == COMING_SOON_VIEW_PATH
    assert [movie["source_film_id"] for movie in artifact["movies"]] == ["3", "7", "20"]
    assert artifact["stats"]["movies"] == 3
    assert artifact["stats"]["earliest_release_date"] == "2026-10-02"
    assert artifact["stats"]["latest_release_date"] == "2026-12-05"
    assert artifact["stats"]["with_scheduled_showtimes"] == 1
    assert artifact["stats"]["without_scheduled_showtimes"] == 2
    validate_coming_soon_catalog(artifact)


def test_build_catalog_tracks_missing_release_dates():
    pages = [
        _page([_movie("1", "Undated Film", releaseDateUtc=None)], count=1, has_next=False)
    ]
    artifact = build_coming_soon_catalog(
        fetch_coming_soon_catalog(_fetch_from_pages(pages)), generated_at=GENERATED_AT
    )

    assert artifact["stats"]["without_release_date"] == 1
    assert artifact["stats"]["earliest_release_date"] is None
    validate_coming_soon_catalog(artifact)


def test_validate_rejects_duplicate_ids():
    pages = [_page([_movie("1", "Alpha")], count=1, has_next=False)]
    artifact = build_coming_soon_catalog(
        fetch_coming_soon_catalog(_fetch_from_pages(pages)), generated_at=GENERATED_AT
    )
    artifact["movies"].append(dict(artifact["movies"][0]))
    artifact["stats"]["movies"] = 2

    with pytest.raises(ComingSoonCatalogValidationError, match="duplicate catalog id"):
        validate_coming_soon_catalog(artifact)


def test_validate_rejects_stats_mismatch():
    pages = [_page([_movie("1", "Alpha")], count=1, has_next=False)]
    artifact = build_coming_soon_catalog(
        fetch_coming_soon_catalog(_fetch_from_pages(pages)), generated_at=GENERATED_AT
    )
    artifact["stats"]["movies"] = 99

    with pytest.raises(ComingSoonCatalogValidationError, match="stats mismatch"):
        validate_coming_soon_catalog(artifact)


def test_write_and_load_round_trip(tmp_path: Path):
    pages = [_page([_movie("1", "Alpha")], count=1, has_next=False)]
    artifact = build_coming_soon_catalog(
        fetch_coming_soon_catalog(_fetch_from_pages(pages)), generated_at=GENERATED_AT
    )
    target = tmp_path / "amc_coming_soon_catalog.json"

    write_coming_soon_catalog(artifact, target)

    assert load_coming_soon_catalog(target) == artifact
    assert load_coming_soon_catalog(tmp_path / "missing.json") is None


def test_load_returns_none_for_corrupt_file(tmp_path: Path):
    target = tmp_path / "bad.json"
    target.write_text("{not json", encoding="utf-8")

    assert load_coming_soon_catalog(target) is None


def test_offline_fixture_pages_are_usable(tmp_path: Path):
    (tmp_path / "page-1.json").write_text(
        json.dumps(_page([_movie("1", "Fixture Film")], count=1, has_next=False)),
        encoding="utf-8",
    )

    result = fetch_coming_soon_catalog(load_offline_fixture_pages(tmp_path), max_pages=3)

    assert [movie["id"] for movie in result.movies] == [1]
    assert result.status == "success"


def test_view_url_does_not_double_the_api_version():
    assert COMING_SOON_VIEW_URL.count("/v2") == 1
    assert COMING_SOON_VIEW_URL.endswith("/v2/movies/views/coming-soon")
