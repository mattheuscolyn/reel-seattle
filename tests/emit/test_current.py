"""Tests for showtimes_current.json emission."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from reel_seattle.emit.current import (
    CURRENT_SCHEMA_VERSION,
    build_showtimes_current,
    make_showtime_id,
    write_showtimes_current,
)
from reel_seattle.normalize import format_date_csv, format_date_iso

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)
GENERATED_AT = datetime(2026, 6, 26, 0, 0, 0, tzinfo=PACIFIC)


def _history_row(
    show_date: date,
    *,
    film: str = "Sinners",
    theater: str = "AMC Pacific Place 11",
    time: str = "7:30PM",
    runtime: str = "137",
    poster: str = "https://example.com/sinners.jpg",
    premium_format: str = "",
    canceled: bool = False,
    sold_out: bool = False,
    source: str = "amc",
) -> dict[str, str]:
    return {
        "Date": format_date_csv(show_date),
        "Time": time,
        "Theater": theater,
        "Film": film,
        "Runtime": runtime,
        "isAlmostSoldOut": "true" if sold_out else "None",
        "posterDynamic": poster,
        "isCanceled": "true" if canceled else "false",
        "premiumFormat": premium_format,
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": source,
    }


@pytest.fixture
def artifact(theaters_registry):
    rows = [
        _history_row(REFERENCE, premium_format="IMAX, Dolby Cinema"),
        _history_row(REFERENCE - timedelta(days=1), film="Past Film"),
        _history_row(REFERENCE + timedelta(days=15), film="Too Far"),
        _history_row(REFERENCE, film="Canceled Film", canceled=True),
        _history_row(
            REFERENCE,
            film="Bad Poster",
            runtime="Unknown",
            poster="None",
        ),
        _history_row(
            REFERENCE + timedelta(days=14),
            film="Beacon Film",
            theater="The Beacon",
            source="indie",
        ),
    ]
    return build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )


def test_window_includes_today_through_fourteen_days(artifact):
    dates = {row["date"] for row in artifact["showtimes"]}
    assert format_date_iso(REFERENCE) in dates
    assert format_date_iso(REFERENCE + timedelta(days=14)) in dates
    assert artifact["window"] == {
        "start_date": "2026-06-26",
        "end_date": "2026-07-10",
    }


def test_past_rows_excluded(artifact):
    assert all(row["film_title"] != "Past Film" for row in artifact["showtimes"])


def test_rows_beyond_window_excluded(artifact):
    assert all(row["film_title"] != "Too Far" for row in artifact["showtimes"])


def test_canceled_rows_excluded(artifact):
    assert all(row["film_title"] != "Canceled Film" for row in artifact["showtimes"])


def test_theater_names_resolve_to_theater_id(artifact):
    amc = next(row for row in artifact["showtimes"] if row["film_title"] == "Sinners")
    beacon = next(
        row for row in artifact["showtimes"] if row["film_title"] == "Beacon Film"
    )
    assert amc["theater_id"] == "amc-pacific-place-11"
    assert beacon["theater_id"] == "the-beacon"


def test_unknown_poster_and_runtime_become_null(artifact):
    bad = next(row for row in artifact["showtimes"] if row["film_title"] == "Bad Poster")
    assert bad["runtime_min"] is None
    assert bad["poster_url"] is None

    film_ref = next(
        film for film in artifact["films"] if film["showtime_film_key"] == bad["showtime_film_key"]
    )
    assert film_ref["runtime_min"] is None
    assert film_ref["poster_url"] is None


def test_films_are_deduplicated(theaters_registry):
    rows = [
        _history_row(REFERENCE, film="Sinners", time="7:30PM"),
        _history_row(REFERENCE, film="SINNERS", time="9:30PM"),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    assert artifact["stats"]["film_count"] == 1
    assert len(artifact["films"]) == 1
    assert artifact["stats"]["showtime_count"] == 2


def test_showtime_ids_are_stable(theaters_registry):
    rows = [_history_row(REFERENCE)]
    first = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    second = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=GENERATED_AT,
    )
    assert first["showtimes"][0]["id"] == second["showtimes"][0]["id"]
    assert first["showtimes"][0]["id"] == make_showtime_id(
        "amc-pacific-place-11",
        "2026-06-26",
        "19:30",
        "sinners",
    )


def test_format_tags_are_normalized(artifact):
    sinners = next(row for row in artifact["showtimes"] if row["film_title"] == "Sinners")
    assert sinners["format_tags"] == ["imax", "dolby-cinema"]


def test_json_shape_includes_required_sections(artifact):
    assert artifact["schema_version"] == CURRENT_SCHEMA_VERSION
    assert artifact["timezone"] == "America/Los_Angeles"
    assert artifact["generated_at"] == "2026-06-26T00:00:00-07:00"
    assert set(artifact) == {
        "schema_version",
        "generated_at",
        "timezone",
        "window",
        "sources_included",
        "sources",
        "stats",
        "theaters",
        "films",
        "showtimes",
    }
    assert artifact["stats"]["showtime_count"] == len(artifact["showtimes"])
    assert artifact["stats"]["film_count"] == len(artifact["films"])
    assert artifact["stats"]["theater_count"] == 2
    assert artifact["sources_included"] == ["amc", "beacon"]
    assert len(artifact["theaters"]) >= 11


def test_write_showtimes_current_writes_valid_json(tmp_path, theaters_registry):
    registry_path = tmp_path / "theaters.json"
    output_path = tmp_path / "showtimes_current.json"
    import json

    registry_path.write_text(json.dumps(theaters_registry), encoding="utf-8")

    rows = [_history_row(REFERENCE)]
    artifact = write_showtimes_current(
        rows,
        output_path=output_path,
        registry_path=registry_path,
        reference_date=REFERENCE,
    )

    loaded = json.loads(output_path.read_text(encoding="utf-8"))
    assert loaded == artifact
    assert output_path.exists()
