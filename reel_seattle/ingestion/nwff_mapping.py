"""Map validated NWFF IndependentSourceResult → indie RawShowtime + scrape-log envelope.

Non-scheduled production foundation (P-16F). Does not fetch HTML or invoke restatement.
"""

from __future__ import annotations

import json
import re
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from typing import Any, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

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

SOURCE = "nwff"
NWFF_THEATER_ID = "northwest-film-forum"
NWFF_CANONICAL_NAME = "Northwest Film Forum"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)

# Conservatively normalized main-venue labels (casefold + whitespace collapse).
MAIN_VENUE_LABELS = frozenset({"northwest film forum", "nwff"})
ONLINE_TOKENS = ("online", "virtual", "zoom", "streaming", "livestream", "webinar")

MAPPING_STATUS_SUCCESS = "success"
MAPPING_STATUS_SUCCESS_WITH_WARNINGS = "success_with_warnings"
MAPPING_STATUS_UNSAFE = "unsafe"
MAPPING_STATUS_FAILURE = "failure"

ALLOWED_MAPPING_STATUSES = frozenset(
    {
        MAPPING_STATUS_SUCCESS,
        MAPPING_STATUS_SUCCESS_WITH_WARNINGS,
        MAPPING_STATUS_UNSAFE,
        MAPPING_STATUS_FAILURE,
    }
)


class NwffMappingError(ValueError):
    """Raised when a contract result cannot be mapped."""


@dataclass(frozen=True, slots=True)
class MappingIssue:
    code: str
    message: str
    source_program_id: str | None = None
    source_value: str | None = None
    affects_completeness: bool = False


@dataclass
class NwffMappingResult:
    """Outputs of contract→indie mapping."""

    records: list[RawShowtime]
    mapping_status: str
    restate_safe: bool
    warnings: list[MappingIssue] = field(default_factory=list)
    rejected: list[MappingIssue] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    contract: dict[str, Any] = field(default_factory=dict)
    log_envelope: dict[str, Any] = field(default_factory=dict)


def normalize_location_label(value: str | None) -> str:
    """Trim, collapse whitespace, casefold. No fuzzy matching."""
    if value is None:
        return ""
    text = str(value).replace("\u00a0", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text.casefold()


def is_online_or_virtual_location(location: str | None) -> bool:
    label = normalize_location_label(location)
    if not label:
        return False
    return any(token in label for token in ONLINE_TOKENS)


def resolve_nwff_main_venue(location: str | None) -> bool:
    """Return True only when the label clearly identifies the main NWFF venue."""
    label = normalize_location_label(location)
    return label in MAIN_VENUE_LABELS


def _iso_date_to_indie(local_date: str) -> str:
    parsed = date.fromisoformat(local_date)
    return f"{parsed.month:02d}/{parsed.day:02d}/{parsed.year:04d}"


def _runtime_raw_from_program(program: Mapping[str, Any] | None) -> str | None:
    if not program:
        return None
    raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}
    value = raw.get("runtime_min")
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return str(value)
    if isinstance(value, str) and value.isdigit() and int(value) > 0:
        return value
    return None


def _release_year_from_program(program: Mapping[str, Any] | None) -> int | None:
    if not program:
        return None
    raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}
    value = raw.get("release_year")
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and 1888 <= value <= 2100:
        return value
    if isinstance(value, str) and value.isdigit():
        year = int(value)
        if 1888 <= year <= 2100:
            return year
    return None


def _image_from_program(program: Mapping[str, Any] | None) -> str | None:
    if not program:
        return None
    raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}
    for key in ("image_url", "poster_url"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _location_from_showtime(showtime: Mapping[str, Any]) -> str | None:
    raw = showtime.get("raw") if isinstance(showtime.get("raw"), Mapping) else {}
    value = raw.get("location_name")
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _discriminator_from_showtime(showtime: Mapping[str, Any]) -> str | None:
    ticket = showtime.get("ticket_url")
    if isinstance(ticket, str) and ticket.strip():
        return ticket.strip()
    raw = showtime.get("raw") if isinstance(showtime.get("raw"), Mapping) else {}
    for key in ("occurrence_discriminator", "start_iso", "calendar_ticket_url"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _composite_key(showtime: Mapping[str, Any]) -> str:
    return "|".join(
        [
            str(showtime.get("source_program_id") or ""),
            str(showtime.get("theater_id") or ""),
            str(showtime.get("local_date") or ""),
            str(showtime.get("local_time") or ""),
        ]
    )


def _issue_dict(issue: MappingIssue) -> dict[str, Any]:
    return {
        "code": issue.code,
        "message": issue.message,
        "source_program_id": issue.source_program_id,
        "source_value": issue.source_value,
        "affects_completeness": issue.affects_completeness,
    }


def _resolve_theater_ids(theater_ids: Iterable[str] | None) -> set[str]:
    if theater_ids is not None:
        return {str(item) for item in theater_ids}
    try:
        return load_theater_ids_from_registry()
    except Exception:  # noqa: BLE001 - fall back for isolated unit contexts
        return fixture_theater_ids(include_planned=True)


def map_nwff_contract_to_indie(
    result: Mapping[str, Any],
    *,
    theater_ids: Iterable[str] | None = None,
    generated_at: str | None = None,
) -> NwffMappingResult:
    """Validate and map an NWFF IndependentSourceResult into indie records + log envelope.

    Raises:
        NwffMappingError: invalid / wrong-source / unsupported contract input.
    """
    if not isinstance(result, Mapping):
        raise NwffMappingError("contract result must be an object")

    source = result.get("source")
    if source != SOURCE:
        raise NwffMappingError(f"expected source {SOURCE!r}, got {source!r}")

    version = result.get("contract_version")
    if version != CONTRACT_VERSION:
        raise NwffMappingError(
            f"unsupported contract_version {version!r}; expected {CONTRACT_VERSION!r}"
        )

    known_ids = _resolve_theater_ids(theater_ids)
    try:
        assert_valid_independent_source_result(result, theater_ids=known_ids)
    except IndependentContractError as exc:
        raise NwffMappingError(f"invalid IndependentSourceResult: {exc}") from exc

    contract = json.loads(serialize_independent_source_result(result))
    programs = {
        str(row.get("source_program_id")): row
        for row in (contract.get("programs") or [])
        if isinstance(row, Mapping) and row.get("source_program_id")
    }

    warnings: list[MappingIssue] = []
    rejected: list[MappingIssue] = []
    # Carry forward contract workshop / non-film rejects (non-completeness by default).
    for row in contract.get("rejected_observations") or []:
        if not isinstance(row, Mapping):
            continue
        rejected.append(
            MappingIssue(
                code=str(row.get("code") or "contract_rejection"),
                message=str(row.get("message") or "Rejected by contract result."),
                source_program_id=(
                    str(row["source_program_id"]) if row.get("source_program_id") not in (None, "") else None
                ),
                source_value=str(row["source_value"]) if row.get("source_value") not in (None, "") else None,
                affects_completeness=bool(row.get("affects_completeness")),
            )
        )

    contract_safe = bool(contract.get("restate_safe"))
    mapping_unsafe = False
    mapping_failed = False

    # Stage candidates after venue checks; then resolve identity collisions.
    staged: list[dict[str, Any]] = []

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
        timezone = str(showtime.get("timezone") or "").strip() or DEFAULT_TIMEZONE
        title = normalize_exact_source_title(str(showtime.get("source_title") or ""))
        program = programs.get(slug)
        location = _location_from_showtime(showtime)

        if theater_id != NWFF_THEATER_ID:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="unknown_theater_id",
                    message="Showtime theater_id is not the canonical NWFF venue.",
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
                    message="Canonical NWFF theater_id is not present in the theater ID set.",
                    source_program_id=slug or None,
                    source_value=theater_id,
                    affects_completeness=True,
                )
            )
            continue

        if location is None:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="missing_location",
                    message="Occurrence missing source location; cannot confirm main venue.",
                    source_program_id=slug or None,
                    source_value=None,
                    affects_completeness=True,
                )
            )
            continue

        if is_online_or_virtual_location(location):
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="online_or_virtual_location",
                    message="Online/virtual occurrence rejected under main-venue-only policy.",
                    source_program_id=slug or None,
                    source_value=location,
                    affects_completeness=True,
                )
            )
            continue

        if not resolve_nwff_main_venue(location):
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="unknown_location",
                    message="Off-site or unknown location does not map to Northwest Film Forum.",
                    source_program_id=slug or None,
                    source_value=location,
                    affects_completeness=True,
                )
            )
            continue

        if timezone != DEFAULT_TIMEZONE:
            warnings.append(
                MappingIssue(
                    code="unexpected_timezone",
                    message=f"Expected timezone {DEFAULT_TIMEZONE!r}.",
                    source_program_id=slug or None,
                    source_value=timezone,
                    affects_completeness=False,
                )
            )

        discriminator = _discriminator_from_showtime(showtime)
        ticket = showtime.get("ticket_url")
        ticket_url = ticket.strip() if isinstance(ticket, str) and ticket.strip() else None
        occurrence_url = showtime.get("source_occurrence_url")
        program_url = program.get("source_program_url") if program else None
        program_title = program.get("source_title") if program else None
        title_differs = bool(
            (showtime.get("raw") or {}).get("title_differs_from_program")
            if isinstance(showtime.get("raw"), Mapping)
            else (program_title and program_title != title)
        )
        runtime_raw = _runtime_raw_from_program(program)
        release_year = _release_year_from_program(program)
        image_url = _image_from_program(program)
        program_kind = program.get("program_kind") if program else None
        program_ticket = None
        if program and isinstance(program.get("raw"), Mapping):
            pt = program["raw"].get("ticket_url")
            if isinstance(pt, str) and pt.strip():
                program_ticket = pt.strip()

        attributes: dict[str, object] = {
            "source_film_id": slug,
            "source_program_id": slug,
            "theater_id": theater_id,
            "local_date": local_date,
            "local_time": local_time,
            "timezone": timezone,
            "fallback_identity": "composite_program_theater_datetime",
            "occurrence_discriminator": discriminator,
            "program_page_title": program_title,
            "title_differs_from_program": title_differs,
            "location_name": location,
            "program_kind": program_kind,
            "calendar_ticket_url": ticket_url,
            "program_page_ticket_url": program_ticket,
            "source_occurrence_url": occurrence_url,
        }
        if release_year is not None:
            attributes["release_year"] = release_year

        staged.append(
            {
                "composite": _composite_key(showtime),
                "discriminator": discriminator or "",
                "raw": RawShowtime(
                    theater_name_raw=NWFF_CANONICAL_NAME,
                    date_raw=_iso_date_to_indie(local_date),
                    time_raw=local_time,
                    title_raw=title,
                    runtime_raw=runtime_raw,
                    poster_url_raw=image_url,
                    ticket_url_raw=ticket_url,
                    source_showtime_id=None,
                    source_film_url=str(program_url) if program_url else (
                        str(occurrence_url) if occurrence_url else None
                    ),
                    attributes=attributes,
                ),
            }
        )

    # Deterministic dedupe + collision handling.
    accepted: list[RawShowtime] = []
    by_composite: dict[str, list[dict[str, Any]]] = {}
    for item in staged:
        by_composite.setdefault(item["composite"], []).append(item)

    for composite, items in by_composite.items():
        by_disc: dict[str, dict[str, Any]] = {}
        empty_disc: list[dict[str, Any]] = []
        for item in items:
            disc = item["discriminator"]
            if not disc:
                empty_disc.append(item)
                continue
            if disc in by_disc:
                warnings.append(
                    MappingIssue(
                        code="exact_duplicate_deduped",
                        message="Exact duplicate occurrence deduplicated.",
                        source_program_id=composite.split("|", 1)[0] or None,
                        source_value=composite,
                        affects_completeness=False,
                    )
                )
                continue
            by_disc[disc] = item

        if len(empty_disc) > 1:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="unresolved_identity_collision",
                    message=(
                        "Multiple occurrences share program/theater/date/time "
                        "without a stable discriminator."
                    ),
                    source_program_id=composite.split("|", 1)[0] or None,
                    source_value=composite,
                    affects_completeness=True,
                )
            )
            continue

        retained = list(by_disc.values())
        if len(empty_disc) == 1:
            # Single undifferenced row is fine only when it is alone for this composite.
            if by_disc:
                mapping_unsafe = True
                rejected.append(
                    MappingIssue(
                        code="unresolved_identity_collision",
                        message=(
                            "Occurrence lacks discriminator while other same-time "
                            "occurrences exist."
                        ),
                        source_program_id=composite.split("|", 1)[0] or None,
                        source_value=composite,
                        affects_completeness=True,
                    )
                )
                continue
            retained.extend(empty_disc)

        if len(retained) > 1:
            warnings.append(
                MappingIssue(
                    code="identity_collision_distinguished",
                    message="Same-time occurrences retained using ticket/discriminator.",
                    source_program_id=composite.split("|", 1)[0] or None,
                    source_value=composite,
                    affects_completeness=False,
                )
            )
        for row in retained:
            accepted.append(row["raw"])

    completeness_hit = any(item.affects_completeness for item in rejected)
    if mapping_failed:
        mapping_status = MAPPING_STATUS_FAILURE
        final_safe = False
    elif (not contract_safe) or mapping_unsafe or completeness_hit:
        mapping_status = MAPPING_STATUS_UNSAFE
        final_safe = False
    elif warnings:
        mapping_status = MAPPING_STATUS_SUCCESS_WITH_WARNINGS
        final_safe = True
    else:
        mapping_status = MAPPING_STATUS_SUCCESS
        final_safe = True

    # Mapping cannot upgrade an unsafe contract.
    if not contract_safe:
        final_safe = False
        if mapping_status == MAPPING_STATUS_SUCCESS:
            mapping_status = MAPPING_STATUS_UNSAFE
        elif mapping_status == MAPPING_STATUS_SUCCESS_WITH_WARNINGS:
            mapping_status = MAPPING_STATUS_UNSAFE

    stamp = generated_at or scrape_log_generated_at()
    stats = {
        "accepted_records": len(accepted),
        "rejected_records": len(rejected),
        "warning_count": len(warnings),
        "mapping_status": mapping_status,
        "restate_safe": final_safe,
        "contract_restate_safe": contract_safe,
        "contract_status": contract.get("status"),
        "requested_window": contract.get("requested_window"),
        "inspected_window": contract.get("inspected_window"),
        "scrape_status": contract.get("status"),
        "stale_retention_recommended": not final_safe,
        "prototype_theater_id": NWFF_THEATER_ID,
    }

    mapping_block = {
        "status": mapping_status,
        "restate_safe": final_safe,
        "accepted_records": len(accepted),
        "rejected_records": len(rejected),
        "warnings": [_issue_dict(item) for item in warnings],
        "rejected_observations": [_issue_dict(item) for item in rejected],
    }

    log_envelope = {
        "schema_version": SCRAPE_LOG_SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "independent_source_result": contract,
        "mapping": mapping_block,
        "records": [raw_showtime_to_record_dict(record) for record in accepted],
        "stats": {
            "record_count": len(accepted),
            "warning_count": len(warnings),
            "error_count": 1 if mapping_status == MAPPING_STATUS_FAILURE else 0,
            **stats,
        },
        "warnings": [item.message for item in warnings],
        "errors": [item.message for item in rejected if item.affects_completeness and mapping_failed],
    }

    return NwffMappingResult(
        records=accepted,
        mapping_status=mapping_status,
        restate_safe=final_safe,
        warnings=warnings,
        rejected=rejected,
        stats=stats,
        contract=contract,
        log_envelope=log_envelope,
    )


def serialize_nwff_mapping_log(envelope: Mapping[str, Any]) -> str:
    """Deterministic JSON serialization for NWFF mapping log envelopes."""
    return json.dumps(envelope, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def mapping_result_to_dict(result: NwffMappingResult) -> dict[str, Any]:
    """Test/debug helper."""
    return {
        "mapping_status": result.mapping_status,
        "restate_safe": result.restate_safe,
        "stats": result.stats,
        "warnings": [_issue_dict(item) for item in result.warnings],
        "rejected": [_issue_dict(item) for item in result.rejected],
        "records": [asdict(record) for record in result.records],
        "log_envelope": result.log_envelope,
    }
