"""Builders for Central Cinema IndependentSourceResult mapping fixtures."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

SCRAPED_AT = "2026-07-16T12:00:00-07:00"
CONTRACT_VERSION = "1.0.0"
THEATER_ID = "central-cinema"


def base_result(**overrides: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "contract_version": CONTRACT_VERSION,
        "source": "central_cinema",
        "scraped_at": SCRAPED_AT,
        "requested_window": {"start": "2026-07-16", "end": "2026-07-29"},
        "inspected_window": {"start": "2026-07-16", "end": "2026-07-29", "complete": True},
        "status": "success",
        "restate_safe": True,
        "identity": {
            "program_strategy": "canonical_url_slug",
            "showtime_strategy": "source_showing_id",
        },
        "structural_validation": {
            "passed": True,
            "checks": [
                {
                    "code": "movie_page_schema_org_present",
                    "passed": True,
                    "severity": "error",
                    "message": None,
                }
            ],
        },
        "stats": {
            "discovered_programs": 1,
            "program_pages_succeeded": 1,
            "program_pages_failed": 0,
        },
        "warnings": [],
        "rejected_observations": [],
        "programs": [],
        "showtimes": [],
    }
    result.update(overrides)
    return result


def program(
    *,
    slug: str = "faceslashoff",
    title: str = "Face/Off",
    kind: str = "film",
    host: str = "central-cinema.com",
    runtime_min: int | None = None,
    release_year: int | None = None,
    date_created: str | None = "2024-03-01",
    description: str | None = "A classic action double-feature opener.",
    directors: list[str] | None = None,
    cast: list[str] | None = None,
    calendar_title: str | None = None,
    presentation_note: str | None = None,
    image_url: str | None = None,
    extra_raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "schema_org": {
            "name": title,
            "dateCreated": date_created,
        },
        "dateCreated": date_created,
        "release_year": release_year,
        "runtime_min": runtime_min,
        "description_paragraphs": [description] if description else [],
        "directors": directors if directors is not None else ["John Woo"],
        "cast": cast if cast is not None else ["John Travolta", "Nicolas Cage"],
        "calendar_title": calendar_title,
        "presentation_note": presentation_note,
        "image_url": image_url,
    }
    if extra_raw:
        raw.update(extra_raw)
    return {
        "contract_version": CONTRACT_VERSION,
        "source": "central_cinema",
        "source_program_id": slug,
        "source_title": title,
        "source_program_url": f"https://{host}/movie/{slug}/",
        "program_kind": kind,
        "observed_at": SCRAPED_AT,
        "raw": raw,
    }


def showtime(
    *,
    slug: str = "faceslashoff",
    showing_id: str | None = "3387540",
    title: str = "Face/Off",
    local_date: str = "2026-07-18",
    local_time: str = "19:00",
    theater_id: str = THEATER_ID,
    host: str = "www.central-cinema.com",
    program_host: str = "central-cinema.com",
    ticket_url: str | None = None,
    location_name: str | None = None,
    timezone: str = "America/Los_Angeles",
    display_date: str | None = "July 18",
) -> dict[str, Any]:
    if ticket_url is None and showing_id:
        ticket_url = f"https://{host}/checkout/showing/{slug}/{showing_id}"
    raw: dict[str, Any] = {
        "checkout_showing_segment": showing_id,
        "year_rollover_inferred": False,
        "source_display_date": display_date,
    }
    if location_name is not None:
        raw["location_name"] = location_name
    return {
        "contract_version": CONTRACT_VERSION,
        "source": "central_cinema",
        "source_program_id": slug,
        "source_showtime_id": showing_id,
        "source_title": title,
        "theater_id": theater_id,
        "local_date": local_date,
        "local_time": local_time,
        "timezone": timezone,
        "source_occurrence_url": f"https://{program_host}/movie/{slug}/",
        "ticket_url": ticket_url,
        "observed_at": SCRAPED_AT,
        "raw": raw,
    }


def safe_success() -> dict[str, Any]:
    result = base_result()
    result["programs"] = [program(runtime_min=138, release_year=1997)]
    result["showtimes"] = [
        showtime(showing_id="3387540", local_time="19:00"),
        showtime(showing_id="3387541", local_time="21:30"),
    ]
    result["stats"]["discovered_programs"] = 1
    return result


def multi_program() -> dict[str, Any]:
    result = base_result()
    result["programs"] = [
        program(slug="faceslashoff", title="Face/Off", runtime_min=138, release_year=1997),
        program(
            slug="the-rock",
            title="The Rock",
            runtime_min=136,
            release_year=1996,
            directors=["Michael Bay"],
            cast=["Sean Connery"],
        ),
    ]
    result["showtimes"] = [
        showtime(slug="faceslashoff", showing_id="1001", title="Face/Off"),
        showtime(slug="the-rock", showing_id="1002", title="The Rock", local_time="21:00"),
    ]
    result["stats"]["discovered_programs"] = 2
    return result


def clone(result: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(result)
