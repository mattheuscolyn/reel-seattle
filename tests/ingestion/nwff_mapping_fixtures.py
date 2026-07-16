"""Builders for NWFF IndependentSourceResult mapping fixtures."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

SCRAPED_AT = "2026-07-18T12:00:00-07:00"
CONTRACT_VERSION = "1.0.0"


def base_result(**overrides: Any) -> dict[str, Any]:
    result: dict[str, Any] = {
        "contract_version": CONTRACT_VERSION,
        "source": "nwff",
        "scraped_at": SCRAPED_AT,
        "requested_window": {"start": "2026-07-18", "end": "2026-07-20"},
        "inspected_window": {"start": "2026-07-18", "end": "2026-07-20", "complete": True},
        "status": "success",
        "restate_safe": True,
        "identity": {
            "program_strategy": "canonical_url_slug",
            "showtime_strategy": "composite_program_theater_datetime",
        },
        "structural_validation": {
            "passed": True,
            "checks": [
                {"code": "calendar_pages_present", "passed": True, "severity": "error", "message": None}
            ],
        },
        "stats": {"calendar_pages_visited": 1},
        "warnings": [],
        "rejected_observations": [],
        "programs": [],
        "showtimes": [],
    }
    result.update(overrides)
    return result


def program(
    *,
    slug: str = "asco-without-permission",
    title: str = "ASCO: Without Permission",
    kind: str = "film",
    runtime_min: int | None = 90,
    release_year: int | None = 2024,
    image_url: str | None = "https://nwfilmforum.org/images/asco.jpg",
    ticket_url: str | None = "https://nwfilmforum.eventive.org/tickets/program",
    extra_raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "directors": ["Ada Director"],
        "country": "USA",
        "runtime_min": runtime_min,
        "release_year": release_year,
        "image_url": image_url,
        "ticket_url": ticket_url,
        "source_classification": kind,
    }
    if extra_raw:
        raw.update(extra_raw)
    return {
        "contract_version": CONTRACT_VERSION,
        "source": "nwff",
        "source_program_id": slug,
        "source_title": title,
        "source_program_url": f"https://nwfilmforum.org/films/{slug}/",
        "program_kind": kind,
        "observed_at": SCRAPED_AT,
        "raw": raw,
    }


def showtime(
    *,
    slug: str = "asco-without-permission",
    title: str = "Staff Selects - ASCO: Without Permission",
    local_date: str = "2026-07-19",
    local_time: str = "19:00",
    theater_id: str = "northwest-film-forum",
    location_name: str = "Northwest Film Forum",
    ticket_url: str | None = "https://nwfilmforum.eventive.org/tickets/asco-1900",
    title_differs: bool = True,
    discriminator: str | None = None,
    start_iso: str | None = None,
) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "authority": "calendar",
        "fallback_identity": "composite_program_theater_datetime",
        "location_name": location_name,
        "title_differs_from_program": title_differs,
        "program_page_title": "ASCO: Without Permission",
        "start_iso": start_iso or f"{local_date}T{local_time}:00",
    }
    if discriminator:
        raw["occurrence_discriminator"] = discriminator
    return {
        "contract_version": CONTRACT_VERSION,
        "source": "nwff",
        "source_program_id": slug,
        "source_showtime_id": None,
        "source_title": title,
        "theater_id": theater_id,
        "local_date": local_date,
        "local_time": local_time,
        "timezone": "America/Los_Angeles",
        "source_occurrence_url": f"https://nwfilmforum.org/films/{slug}/",
        "ticket_url": ticket_url,
        "observed_at": SCRAPED_AT,
        "raw": raw,
    }


def safe_success() -> dict[str, Any]:
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [
        showtime(local_time="15:30", ticket_url="https://nwfilmforum.eventive.org/tickets/a"),
        showtime(local_time="17:30", ticket_url="https://nwfilmforum.eventive.org/tickets/b"),
        showtime(local_time="19:30", ticket_url=None),
    ]
    result["rejected_observations"] = [
        {
            "code": "non_film_category",
            "message": "Rejected workshop.",
            "source_program_id": None,
            "source_value": "workshop",
            "affects_completeness": False,
        }
    ]
    return result


def shorts_program() -> dict[str, Any]:
    result = base_result()
    result["programs"] = [
        program(
            slug="local-shorts-program",
            title="Local Shorts Program",
            kind="shorts_program",
            runtime_min=None,
            release_year=None,
            ticket_url=None,
        )
    ]
    result["showtimes"] = [
        showtime(
            slug="local-shorts-program",
            title="Local Shorts Program",
            title_differs=False,
            ticket_url=None,
        )
    ]
    return result


def clone(result: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(result)
