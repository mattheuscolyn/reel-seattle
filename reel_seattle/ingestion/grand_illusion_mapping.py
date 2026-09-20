"""Map Grand Illusion IndependentSourceResult → indie RawShowtime + Option C log.

Multi-venue programmer source: theater_id is the physical partner venue while
``source`` remains ``grand_illusion``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Iterable, Mapping

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.adapters.scrape_log import (
    SCRAPE_LOG_SCHEMA_VERSION,
    raw_showtime_to_record_dict,
    scrape_log_generated_at,
)
from reel_seattle.ingestion.independent_contract import (
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    IndependentContractError,
    assert_valid_independent_source_result,
    fixture_theater_ids,
    load_theater_ids_from_registry,
    normalize_exact_source_title,
    serialize_independent_source_result,
)
from reel_seattle.normalize.times import format_time_display
from reel_seattle.prototypes.grand_illusion import (
    DISTINCTIVE_FORMATS,
    PRESENTER_ID,
    PRESENTER_NAME,
    history_format_from_raw,
    presenter_attribute,
)

SOURCE = "grand_illusion"

# Partner venues Grand Illusion currently programs at (allowlist).
GI_PARTNER_THEATER_IDS = frozenset(
    {
        "siff-film-center",
        "siff-cinema-uptown",
        "siff-cinema-downtown",
        "northwest-film-forum",
        "central-cinema",
        "the-beacon",
    }
)

MAPPING_STATUS_SUCCESS = "success"
MAPPING_STATUS_SUCCESS_WITH_WARNINGS = "success_with_warnings"
MAPPING_STATUS_UNSAFE = "unsafe"
MAPPING_STATUS_FAILURE = "failure"

THEATER_DISPLAY_NAMES = {
    "siff-film-center": "SIFF Film Center",
    "siff-cinema-uptown": "SIFF Cinema Uptown",
    "siff-cinema-downtown": "SIFF Cinema Downtown",
    "northwest-film-forum": "Northwest Film Forum",
    "central-cinema": "Central Cinema",
    "the-beacon": "The Beacon",
}


class GrandIllusionMappingError(ValueError):
    """Raised when a contract result cannot be mapped."""


@dataclass(frozen=True, slots=True)
class MappingIssue:
    code: str
    message: str
    source_program_id: str | None = None
    source_value: str | None = None
    affects_completeness: bool = False


@dataclass
class GrandIllusionMappingResult:
    records: list[RawShowtime]
    mapping_status: str
    restate_safe: bool
    warnings: list[MappingIssue] = field(default_factory=list)
    rejected: list[MappingIssue] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    contract: dict[str, Any] = field(default_factory=dict)
    log_envelope: dict[str, Any] = field(default_factory=dict)


def _iso_date_to_indie(local_date: str) -> str:
    parsed = date.fromisoformat(local_date)
    return f"{parsed.month:02d}/{parsed.day:02d}/{parsed.year:04d}"


def _local_time_to_indie(local_time: str) -> str:
    hour_s, minute_s = local_time.split(":", 1)
    hour = int(hour_s)
    minute = int(minute_s[:2])
    return format_time_display(hour * 60 + minute)


def _resolve_theater_ids(theater_ids: Iterable[str] | None) -> set[str]:
    if theater_ids is not None:
        return {str(item) for item in theater_ids}
    try:
        return load_theater_ids_from_registry()
    except Exception:  # noqa: BLE001
        return fixture_theater_ids(include_planned=True)


def _issue_dict(issue: MappingIssue) -> dict[str, Any]:
    return {
        "code": issue.code,
        "message": issue.message,
        "source_program_id": issue.source_program_id,
        "source_value": issue.source_value,
        "affects_completeness": issue.affects_completeness,
    }


def map_grand_illusion_contract_to_indie(
    result: Mapping[str, Any],
    *,
    theater_ids: Iterable[str] | None = None,
    generated_at: str | None = None,
) -> GrandIllusionMappingResult:
    if not isinstance(result, Mapping):
        raise GrandIllusionMappingError("contract result must be an object")
    if result.get("source") != SOURCE:
        raise GrandIllusionMappingError(
            f"expected source {SOURCE!r}, got {result.get('source')!r}"
        )
    if result.get("contract_version") != CONTRACT_VERSION:
        raise GrandIllusionMappingError(
            f"unsupported contract_version {result.get('contract_version')!r}"
        )

    known_ids = _resolve_theater_ids(theater_ids)
    try:
        assert_valid_independent_source_result(result, theater_ids=known_ids)
    except IndependentContractError as exc:
        raise GrandIllusionMappingError(
            f"invalid IndependentSourceResult: {exc}"
        ) from exc

    contract = json.loads(serialize_independent_source_result(result))
    programs = {
        str(row.get("source_program_id")): row
        for row in (contract.get("programs") or [])
        if isinstance(row, Mapping) and row.get("source_program_id")
    }

    warnings: list[MappingIssue] = []
    rejected: list[MappingIssue] = []
    for row in contract.get("rejected_observations") or []:
        if not isinstance(row, Mapping):
            continue
        rejected.append(
            MappingIssue(
                code=str(row.get("code") or "contract_rejection"),
                message=str(row.get("message") or "Rejected by contract result."),
                source_program_id=(
                    str(row["source_program_id"])
                    if row.get("source_program_id") not in (None, "")
                    else None
                ),
                source_value=(
                    str(row["source_value"])
                    if row.get("source_value") not in (None, "")
                    else None
                ),
                affects_completeness=bool(row.get("affects_completeness")),
            )
        )

    contract_safe = bool(contract.get("restate_safe"))
    mapping_unsafe = False
    mapping_failed = False
    records: list[RawShowtime] = []
    seen_ids: set[str] = set()

    for index, showtime in enumerate(contract.get("showtimes") or []):
        if not isinstance(showtime, Mapping):
            mapping_failed = True
            rejected.append(
                MappingIssue(
                    code="invalid_showtime",
                    message=f"showtimes[{index}] is not an object",
                    affects_completeness=True,
                )
            )
            continue

        slug = str(showtime.get("source_program_id") or "").strip()
        theater_id = str(showtime.get("theater_id") or "").strip()
        local_date = str(showtime.get("local_date") or "").strip()
        local_time = str(showtime.get("local_time") or "").strip()
        title = normalize_exact_source_title(str(showtime.get("source_title") or ""))
        program = programs.get(slug) or {}
        raw = showtime.get("raw") if isinstance(showtime.get("raw"), Mapping) else {}
        program_raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}

        if theater_id not in GI_PARTNER_THEATER_IDS:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="unknown_theater_id",
                    message="Showtime theater_id is not an approved Grand Illusion partner venue.",
                    source_program_id=slug or None,
                    source_value=theater_id or None,
                    affects_completeness=True,
                )
            )
            continue

        if theater_id not in known_ids:
            mapping_failed = True
            rejected.append(
                MappingIssue(
                    code="theater_not_in_registry",
                    message="Partner theater_id is not present in the theater ID set.",
                    source_program_id=slug or None,
                    source_value=theater_id,
                    affects_completeness=True,
                )
            )
            continue

        showtime_id = str(showtime.get("source_showtime_id") or "").strip()
        if not showtime_id:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="missing_source_showtime_id",
                    message="Composite source_showtime_id is required.",
                    source_program_id=slug or None,
                    affects_completeness=True,
                )
            )
            continue

        if showtime_id in seen_ids:
            warnings.append(
                MappingIssue(
                    code="duplicate_source_showtime_id",
                    message="Duplicate composite occurrence id skipped.",
                    source_program_id=slug or None,
                    source_value=showtime_id,
                    affects_completeness=False,
                )
            )
            continue
        seen_ids.add(showtime_id)

        theater_name = (
            str(raw.get("theater_name") or "").strip()
            or THEATER_DISPLAY_NAMES.get(theater_id)
            or theater_id
        )
        format_raw = str(raw.get("format_raw") or program_raw.get("format_raw") or "").strip() or None
        history_format = str(raw.get("history_format") or "").strip()
        if not history_format:
            history_format = history_format_from_raw(format_raw)

        runtime_min = raw.get("runtime_min")
        if runtime_min is None:
            runtime_min = program_raw.get("runtime_min")
        runtime_raw = str(runtime_min) if runtime_min not in (None, "") else None

        ticket_url = showtime.get("ticket_url")
        if ticket_url in ("", None):
            ticket_url = program_raw.get("ticket_url")
        program_url = str(
            showtime.get("source_occurrence_url")
            or program.get("source_program_url")
            or ""
        ).strip()

        presenters = raw.get("presenters")
        if not isinstance(presenters, list) or not presenters:
            presenters = presenter_attribute(program_url)

        attributes: dict[str, object] = {
            "source_film_id": slug,
            "source_program_id": slug,
            "source_showtime_id": showtime_id,
            "theater_id": theater_id,
            "local_date": local_date,
            "local_time": local_time,
            "timezone": str(showtime.get("timezone") or DEFAULT_TIMEZONE),
            "showtime_identity": "composite_program_theater_datetime",
            "program_url": program_url,
            "ticket_url": ticket_url,
            "screening_location_raw": raw.get("screening_location_raw")
            or program_raw.get("screening_location_raw"),
            "director": raw.get("director") or program_raw.get("director"),
            "year_raw": raw.get("year_raw") or program_raw.get("year_raw"),
            "format_raw": format_raw,
            "history_format": history_format,
            "presenters": presenters,
            "presenter_id": PRESENTER_ID,
            "presenter_name": PRESENTER_NAME,
            "wp_film_id": raw.get("wp_film_id") or program_raw.get("wp_film_id"),
            # Coming Soon compatibility fields (not consumed in this PR).
            "first_observed_at": contract.get("scraped_at"),
            "announced_local_date": local_date,
            "announced_theater_id": theater_id,
        }

        records.append(
            RawShowtime(
                theater_name_raw=theater_name,
                title_raw=title or slug,
                date_raw=_iso_date_to_indie(local_date),
                time_raw=_local_time_to_indie(local_time),
                runtime_raw=runtime_raw,
                format_raw=history_format or None,
                poster_url_raw=(
                    str(raw.get("poster_url") or program_raw.get("poster_url") or "")
                    or None
                ),
                ticket_url_raw=str(ticket_url) if ticket_url else None,
                source_showtime_id=showtime_id,
                source_film_url=program_url or None,
                attributes=attributes,
            )
        )

    if mapping_failed:
        mapping_status = MAPPING_STATUS_FAILURE
        mapping_safe = False
    elif mapping_unsafe or any(i.affects_completeness for i in rejected):
        mapping_status = MAPPING_STATUS_UNSAFE
        mapping_safe = False
    elif warnings:
        mapping_status = MAPPING_STATUS_SUCCESS_WITH_WARNINGS
        mapping_safe = contract_safe
    else:
        mapping_status = MAPPING_STATUS_SUCCESS
        mapping_safe = contract_safe

    # Mapping cannot upgrade an unsafe contract.
    restate_safe = bool(contract_safe and mapping_safe)

    generated = generated_at or scrape_log_generated_at()
    record_dicts = [raw_showtime_to_record_dict(row) for row in records]
    # Carry premiumFormat for distinctive formats into legacy/history via attributes
    # mirror on the record dict (daily_processor history field).
    for record, raw in zip(records, record_dicts):
        hist = ""
        if record.attributes and record.attributes.get("history_format"):
            hist = str(record.attributes.get("history_format") or "")
        if hist:
            raw["premiumFormat"] = hist

    stats = {
        "accepted_records": len(records),
        "rejected_records": len([r for r in rejected if r.affects_completeness]),
        "warning_count": len(warnings),
        "mapping_status": mapping_status,
        "restate_safe": restate_safe,
        "contract_restate_safe": contract_safe,
        "record_count": len(records),
        "stale_retention_recommended": not restate_safe,
    }

    envelope = {
        "schema_version": SCRAPE_LOG_SCHEMA_VERSION,
        "generated_at": generated,
        "source": SOURCE,
        "records": record_dicts,
        "stats": stats,
        "warnings": [_issue_dict(item) for item in warnings],
        "errors": [
            _issue_dict(item)
            for item in rejected
            if item.affects_completeness
        ],
        "independent_source_result": contract,
        "mapping": {
            "status": mapping_status,
            "restate_safe": restate_safe,
            "accepted_records": len(records),
            "rejected_records": len(rejected),
            "warnings": [_issue_dict(item) for item in warnings],
            "rejected": [_issue_dict(item) for item in rejected],
        },
    }

    return GrandIllusionMappingResult(
        records=records,
        mapping_status=mapping_status,
        restate_safe=restate_safe,
        warnings=warnings,
        rejected=rejected,
        stats=stats,
        contract=contract,
        log_envelope=envelope,
    )


def serialize_grand_illusion_mapping_log(
    mapped: GrandIllusionMappingResult,
) -> dict[str, Any]:
    return dict(mapped.log_envelope)
