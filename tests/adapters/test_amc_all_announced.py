"""Tests for AMC all-announced-future showtimes collection."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from reel_seattle.adapters.amc import (
    COLLECTION_MODE_ALL_ANNOUNCED_FUTURE,
    SHOWTIME_PAGE_SIZE,
    TheaterShowtimesResult,
    api_showtime_to_raw,
    fetch_amc_showtimes,
    get_theater_future_showtimes,
    paginate_showtimes_collection,
    raw_showtime_to_legacy_row,
)
from reel_seattle.adapters.base import FetchContext
from reel_seattle.source_identity import (
    source_film_id_from_raw,
    source_showtime_id_from_raw,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "adapters"
RUN_DATE = date(2026, 6, 26)
WITHIN_14 = date(2026, 7, 2)  # 6 days ahead
MAJOR_RELEASE = date(2026, 8, 15)  # 50 days ahead
ISOLATED_EVENT = date(2026, 10, 31)  # 127 days ahead, after empty dates


class FakeResponse:
    def __init__(self, status_code: int, payload: dict | None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        if self._payload is None:
            raise ValueError("no JSON body")
        return self._payload


class FakeSession:
    def __init__(self, routes: dict[str, FakeResponse | list[FakeResponse]]):
        self.routes = routes
        self.requested: list[str] = []

    def get(self, url: str, timeout: float | None = None):
        self.requested.append(url)
        response = self.routes.get(url)
        if response is None:
            return FakeResponse(404, None)
        if isinstance(response, list):
            if not response:
                return FakeResponse(500, None)
            return response.pop(0)
        return response


def _registry() -> dict:
    return {
        "schema_version": "1.0.0",
        "updated_at": "2026-06-26",
        "theaters": [
            {
                "id": "amc-pacific-place-11",
                "name": "AMC Pacific Place 11",
                "aliases": [],
                "source": "amc",
                "source_external_id": "601",
                "enabled": True,
                "type": "chain",
            },
            {
                "id": "amc-oak-tree-6",
                "name": "AMC Oak Tree 6",
                "aliases": [],
                "source": "amc",
                "source_external_id": "602",
                "enabled": True,
                "type": "chain",
            },
        ],
    }


def _api_theater(*, api_id: str, long_name: str) -> dict:
    return {
        "id": api_id,
        "longName": long_name,
        "location": {"latitude": 47.6, "longitude": -122.3},
    }


def _showtime(
    *,
    show_id: str,
    movie_id: str,
    movie_name: str,
    show_date: date,
    hour: int = 20,
) -> dict:
    payload = json.loads((FIXTURES_DIR / "amc_api_showtime_full.json").read_text(encoding="utf-8"))
    local = f"{show_date.isoformat()}T{hour:02d}:00:00"
    payload.update(
        {
            "id": show_id,
            "movieId": movie_id,
            "movieName": movie_name,
            "showDateTimeLocal": local,
            "showDateTimeUtc": f"{show_date.isoformat()}T{hour + 7:02d}:00:00Z",
        }
    )
    return payload


def _collection_page(
    showtimes: list[dict],
    *,
    page_number: int,
    count: int,
    next_href: str | None = None,
    page_size: int = 2,
) -> dict:
    links: dict[str, object] = {
        "self": {"href": f"https://example.test/showtimes?page-number={page_number}"}
    }
    if next_href:
        links["next"] = {"href": next_href}
    return {
        "pageSize": page_size,
        "pageNumber": page_number,
        "count": count,
        "_embedded": {"showtimes": showtimes},
        "_links": links,
    }


def _context(registry: dict) -> FetchContext:
    return FetchContext(
        run_date=RUN_DATE,
        window_start=RUN_DATE,
        window_end=RUN_DATE,
        theaters_registry=registry,
        session=object(),  # type: ignore[arg-type]
    )


def test_fetch_keeps_near_far_and_isolated_future_showtimes():
    registry = _registry()
    near = _showtime(
        show_id="near-1",
        movie_id="movie-now-playing",
        movie_name="Now Playing Film",
        show_date=WITHIN_14,
    )
    major = _showtime(
        show_id="major-1",
        movie_id="movie-major-advance",
        movie_name="Major Advance Release",
        show_date=MAJOR_RELEASE,
    )
    isolated = _showtime(
        show_id="event-1",
        movie_id="movie-anniversary",
        movie_name="Anniversary Screening",
        show_date=ISOLATED_EVENT,
    )

    def fake_showtimes(_session, theater_id):
        if theater_id == "601":
            return [near, major, isolated]
        if theater_id == "602":
            return [
                _showtime(
                    show_id="oak-near",
                    movie_id="movie-now-playing",
                    movie_name="Now Playing Film",
                    show_date=WITHIN_14,
                    hour=19,
                )
            ]
        return []

    result = fetch_amc_showtimes(
        _context(registry),
        sleep_seconds=0,
        get_all_theaters_fn=lambda _s: [
            _api_theater(api_id="601", long_name="AMC Pacific Place 11"),
            _api_theater(api_id="602", long_name="AMC Oak Tree 6"),
        ],
        get_theater_showtimes_fn=fake_showtimes,
    )

    titles = {record.title_raw for record in result.records}
    dates = {record.date_raw for record in result.records}
    assert titles == {"Now Playing Film", "Major Advance Release", "Anniversary Screening"}
    assert "07/02/2026" in dates
    assert "08/15/2026" in dates
    assert "10/31/2026" in dates
    assert result.stats["theaters_scraped"] == 2
    assert result.stats["theaters_succeeded"] == 2
    assert result.stats["theaters_failed"] == 0
    assert result.stats["collection_mode"] == COLLECTION_MODE_ALL_ANNOUNCED_FUTURE
    assert result.stats["restate_safe"] is True
    assert result.stats["farthest_show_date"] == "2026-10-31"
    assert result.errors == []
    # Isolated event is retained even though many empty dates exist before it.
    assert (ISOLATED_EVENT - MAJOR_RELEASE).days > 14


def test_fetch_does_not_truncate_to_fourteen_days():
    registry = _registry()
    far = _showtime(
        show_id="far-1",
        movie_id="movie-far",
        movie_name="Far Future Only",
        show_date=RUN_DATE + timedelta(days=40),
    )
    result = fetch_amc_showtimes(
        _context(registry),
        sleep_seconds=0,
        get_all_theaters_fn=lambda _s: [
            _api_theater(api_id="601", long_name="AMC Pacific Place 11"),
        ],
        get_theater_showtimes_fn=lambda _s, _id: [far],
    )
    assert len(result.records) == 1
    assert result.records[0].date_raw == "08/05/2026"
    assert result.stats["restate_safe"] is True


def test_partial_theater_failure_is_not_restate_safe():
    registry = _registry()
    ok = _showtime(
        show_id="ok-1",
        movie_id="movie-ok",
        movie_name="Ok Film",
        show_date=WITHIN_14,
    )

    def fake_showtimes(_session, theater_id):
        if theater_id == "601":
            return [ok]
        return TheaterShowtimesResult(
            showtimes=(),
            request_count=1,
            page_count=0,
            error="HTTP 500",
        )

    result = fetch_amc_showtimes(
        _context(registry),
        sleep_seconds=0,
        get_all_theaters_fn=lambda _s: [
            _api_theater(api_id="601", long_name="AMC Pacific Place 11"),
            _api_theater(api_id="602", long_name="AMC Oak Tree 6"),
        ],
        get_theater_showtimes_fn=fake_showtimes,
    )

    assert result.stats["restate_safe"] is False
    assert result.stats["theaters_failed"] == 1
    assert result.stats["theaters_succeeded"] == 1
    assert any("602" in message for message in result.errors)
    # Partial records are retained on the scrape log, but must not be restated.
    assert len(result.records) == 1


def test_empty_theatres_list_is_not_restate_safe():
    registry = _registry()
    result = fetch_amc_showtimes(
        _context(registry),
        sleep_seconds=0,
        get_all_theaters_fn=lambda _s: [],
        get_theater_showtimes_fn=lambda _s, _id: [],
    )
    assert result.records == []
    assert result.stats["restate_safe"] is False
    assert result.errors


def test_successful_empty_theater_is_restate_safe():
    registry = _registry()
    result = fetch_amc_showtimes(
        _context(registry),
        sleep_seconds=0,
        get_all_theaters_fn=lambda _s: [
            _api_theater(api_id="601", long_name="AMC Pacific Place 11"),
        ],
        get_theater_showtimes_fn=lambda _s, _id: [],
    )
    assert result.records == []
    assert result.stats["restate_safe"] is True
    assert result.stats["theaters_succeeded"] == 1
    assert result.errors == []


def test_paginate_follows_next_and_keeps_far_future_pages():
    page1_url = (
        f"https://api.amctheatres.com/v2/theatres/601/showtimes"
        f"?page-number=1&page-size={SHOWTIME_PAGE_SIZE}"
    )
    page2_url = (
        f"https://api.amctheatres.com/v2/theatres/601/showtimes"
        f"?page-number=2&page-size={SHOWTIME_PAGE_SIZE}"
    )
    near = _showtime(
        show_id="p1",
        movie_id="movie-now-playing",
        movie_name="Now Playing Film",
        show_date=WITHIN_14,
    )
    isolated = _showtime(
        show_id="p2",
        movie_id="movie-anniversary",
        movie_name="Anniversary Screening",
        show_date=ISOLATED_EVENT,
    )
    session = FakeSession(
        {
            page1_url: FakeResponse(
                200,
                _collection_page([near], page_number=1, count=2, next_href=page2_url),
            ),
            page2_url: FakeResponse(
                200,
                _collection_page([isolated], page_number=2, count=2),
            ),
        }
    )
    result = get_theater_future_showtimes(session, "601")
    assert result.error is None
    assert result.page_count == 2
    assert result.request_count == 2
    assert [item["id"] for item in result.showtimes] == ["p1", "p2"]
    assert session.requested == [page1_url, page2_url]


def test_paginate_http_failure_does_not_return_partial_pages():
    url = "https://example.test/showtimes?page-number=1"
    session = FakeSession({url: FakeResponse(404, None)})
    result = paginate_showtimes_collection(session, url)
    assert result.error == "HTTP 404"
    assert result.showtimes == ()
    assert result.request_count == 1


def test_paginate_incomplete_count_is_an_error():
    url = "https://example.test/showtimes?page-number=1"
    payload = _collection_page(
        [
            _showtime(
                show_id="only",
                movie_id="movie-now-playing",
                movie_name="Now Playing Film",
                show_date=WITHIN_14,
            )
        ],
        page_number=1,
        count=4,
        next_href=None,
    )
    session = FakeSession({url: FakeResponse(200, payload)})
    result = paginate_showtimes_collection(session, url)
    assert result.error is not None
    assert "pagination incomplete" in result.error
    assert result.showtimes == ()


def test_source_identity_unchanged_for_far_future_product():
    payload = _showtime(
        show_id="event-99",
        movie_id="movie-anniversary",
        movie_name="Anniversary Screening",
        show_date=ISOLATED_EVENT,
    )
    raw = api_showtime_to_raw(payload, "AMC Pacific Place 11")
    row = raw_showtime_to_legacy_row(raw)
    assert source_film_id_from_raw(raw) == "movie-anniversary"
    assert source_showtime_id_from_raw(raw) == "event-99"
    assert row["source_film_id"] == "movie-anniversary"
    assert row["source_showtime_id"] == "event-99"
    assert row["source_title"] == "Anniversary Screening"
    assert raw.attributes["movie_id"] == "movie-anniversary"
    assert raw.attributes["wwm_release_number"] == 44001
