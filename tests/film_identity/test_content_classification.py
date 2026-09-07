"""Public content_classification attach from unresolved event identity."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from reel_seattle.emit.current import build_showtimes_current
from reel_seattle.film_identity.content_classification import (
    CONTENT_CLASSIFICATION_NON_FILM_EVENT,
    attach_content_classifications,
    index_unresolved_event_classifications,
    resolve_content_classification,
)
from reel_seattle.normalize import format_date_csv
from reel_seattle.validate import validate_showtimes_current

PACIFIC = ZoneInfo("America/Los_Angeles")
REFERENCE = date(2026, 6, 26)


CLASSIFICATIONS = {
    "schema_version": "1.0.0",
    "classifications": [
        {
            "classification": "non_film_event",
            "source": "central_cinema",
            "source_film_id": "private-rental-event",
            "showtime_film_key": "private-rental-event",
            "source_title": "Venue rental placeholder",
            "notes": "not a film title",
        },
        {
            "classification": "shorts_program",
            "source": "central_cinema",
            "source_film_id": "cartoon-happy-hour",
            "showtime_film_key": "cartoon-happy-hour",
            "source_title": "Cartoon Happy Hour",
            "notes": "shorts block",
        },
    ],
}


def _history_row(film: str, source_film_id: str = "") -> dict[str, str]:
    return {
        "Date": format_date_csv(REFERENCE),
        "Time": "7:30PM",
        "Theater": "AMC Pacific Place 11",
        "Film": film,
        "Runtime": "120",
        "isAlmostSoldOut": "None",
        "posterDynamic": "https://example.com/p.jpg",
        "isCanceled": "false",
        "premiumFormat": "",
        "hasTrailers": "",
        "maximumIntendedAttendance": "",
        "first_seen_date": "2026-06-20",
        "last_updated": "2026-06-26",
        "source": "amc",
        "source_film_id": source_film_id,
    }


def test_index_joins_by_showtime_film_key():
    by_key, by_source, warnings = index_unresolved_event_classifications(
        CLASSIFICATIONS
    )
    assert by_key["private-rental-event"] == "non_film_event"
    assert by_key["cartoon-happy-hour"] == "shorts_program"
    assert by_source[("central_cinema", "private-rental-event")] == "non_film_event"
    assert warnings == []


def test_missing_classification_is_none_not_non_film():
    by_key, by_source, _warnings = index_unresolved_event_classifications(
        CLASSIFICATIONS
    )
    assert (
        resolve_content_classification(
            film_key="sinners",
            by_film_key=by_key,
            by_source_id=by_source,
        )
        is None
    )


def test_attach_sets_null_when_unclassified():
    films = [
        {"showtime_film_key": "sinners", "source_film_id": "111"},
        {"showtime_film_key": "private-rental-event", "source_film_id": "private-rental-event"},
    ]
    report = attach_content_classifications(
        films,
        classifications=CLASSIFICATIONS,
    )
    assert films[0]["content_classification"] is None
    assert films[1]["content_classification"] == CONTENT_CLASSIFICATION_NON_FILM_EVENT
    assert report["non_film_event"] == 1
    assert report["films_classified"] == 1


def test_emit_attaches_known_non_film_classification(theaters_registry):
    rows = [
        _history_row("Sinners", source_film_id="111"),
        _history_row("Private Rental Event", source_film_id="private-rental-event"),
    ]
    artifact = build_showtimes_current(
        rows,
        registry=theaters_registry,
        reference_date=REFERENCE,
        generated_at=datetime(2026, 6, 26, tzinfo=PACIFIC),
    )
    by_key = {film["showtime_film_key"]: film for film in artifact["films"]}
    assert "content_classification" in by_key["sinners"]
    assert by_key["sinners"]["content_classification"] is None
    rental = by_key["private-rental-event"]
    assert rental["content_classification"] == "non_film_event"
    for showtime in artifact["showtimes"]:
        assert "content_classification" not in showtime
    validate_showtimes_current(artifact)
