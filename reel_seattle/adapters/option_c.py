"""Build Option C daily-log envelopes for independent showtime sources."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.adapters.indie_completeness import build_completeness_stats
from reel_seattle.adapters.scrape_log import (
    SCRAPE_LOG_SCHEMA_VERSION,
    raw_showtime_to_record_dict,
    scrape_log_generated_at,
)
from reel_seattle.ingestion.independent_contract import (
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    STATUS_PARTIAL_FAILURE,
    STATUS_REQUEST_FAILURE,
    STATUS_STRUCTURAL_FAILURE,
    STATUS_SUCCESS,
    STATUS_VALID_EMPTY,
    assert_valid_independent_source_result,
    normalize_exact_source_title,
)

PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)


@dataclass
class Screen:
    """One accepted screening before contract assembly."""

    program_id: str
    source_title: str
    identity_title: str
    program_url: str
    showtime_id: str
    theater_id: str
    theater_name: str
    local_date: date
    local_time: str
    ticket_url: str | None = None
    runtime_minutes: int | None = None
    year: int | None = None
    format_raw: str | None = None
    poster_url: str | None = None
    program_raw: dict[str, Any] = field(default_factory=dict)
    showtime_raw: dict[str, Any] = field(default_factory=dict)
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass
class OptionCAdapterResult:
    records: list[RawShowtime]
    stats: dict[str, Any]
    warnings: list[str]
    errors: list[str]
    contract: dict[str, Any]
    mapping: dict[str, Any]
    log_envelope: dict[str, Any]
    restate_safe: bool

    def to_fetch_result_records(self) -> list[RawShowtime]:
        return list(self.records)


def display_time(hhmm: str) -> str:
    hour_text, minute_text = hhmm.split(":", 1)
    hour = int(hour_text)
    minute = int(minute_text)
    suffix = "AM" if hour < 12 else "PM"
    hour12 = hour % 12 or 12
    return f"{hour12}:{minute:02d} {suffix}"


def csv_date(value: date) -> str:
    return f"{value.month:02d}/{value.day:02d}/{value.year}"


def load_registry_theater_ids(path: Path | str | None = None) -> set[str] | None:
    registry = Path(path) if path is not None else Path("data/theaters.json")
    if not registry.exists():
        return None
    payload = json.loads(registry.read_text(encoding="utf-8"))
    theaters = payload.get("theaters") if isinstance(payload, dict) else None
    if not isinstance(theaters, list):
        return None
    ids = {str(row["id"]) for row in theaters if isinstance(row, dict) and row.get("id")}
    return ids or None


def write_option_c_scrape_log(output_path: Path | str, envelope: Mapping[str, Any]) -> dict[str, Any]:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(envelope)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def assemble_option_c(
    *,
    source: str,
    window_start: date,
    window_end: date,
    screens: list[Screen],
    rejected: list[dict[str, Any]] | None = None,
    contract_warnings: list[dict[str, str]] | None = None,
    request_error: str | None = None,
    structural_error: str | None = None,
    structure_present: bool = False,
    inspected_complete: bool = False,
    valid_empty_proof: bool = False,
    discovered_programs: int = 0,
    pages_attempted: int = 0,
    pages_succeeded: int = 0,
    pages_failed: int = 0,
    failed_urls: list[str] | None = None,
    program_strategy: str = "source_numeric_id",
    showtime_strategy: str = "source_showing_id",
    scraped_at: str | None = None,
    generated_at: str | None = None,
    theater_ids: set[str] | None = None,
) -> OptionCAdapterResult:
    """Validate an independent-source result and wrap it as an Option C log."""
    rejected_rows = list(rejected or [])
    warnings_in = list(contract_warnings or [])
    observed = scraped_at or datetime.now(PACIFIC).isoformat(timespec="seconds")
    generated = generated_at or scrape_log_generated_at()

    affects = any(bool(row.get("affects_completeness")) for row in rejected_rows)
    if request_error:
        status = STATUS_REQUEST_FAILURE
        structure_present = False
        inspected_complete = False
        valid_empty_proof = False
    elif structural_error:
        status = STATUS_STRUCTURAL_FAILURE
        inspected_complete = False
        valid_empty_proof = False
    elif affects or not inspected_complete or pages_failed > 0:
        status = STATUS_PARTIAL_FAILURE
        valid_empty_proof = False
    elif not screens:
        if structure_present and inspected_complete and valid_empty_proof:
            status = STATUS_VALID_EMPTY
        else:
            status = STATUS_STRUCTURAL_FAILURE
            structural_error = structural_error or (
                "scrape returned no showtimes without valid-empty proof"
            )
    else:
        status = STATUS_SUCCESS
        valid_empty_proof = False

    restate_safe = status in {STATUS_SUCCESS, STATUS_VALID_EMPTY}
    check_passed = status in {STATUS_SUCCESS, STATUS_VALID_EMPTY}
    check_message = {
        STATUS_SUCCESS: "expected source structure was present",
        STATUS_VALID_EMPTY: "expected source structure was present and no showtimes were published",
        STATUS_REQUEST_FAILURE: request_error or "request failed",
        STATUS_STRUCTURAL_FAILURE: structural_error or "source structure did not match the adapter",
        STATUS_PARTIAL_FAILURE: "source was inspected but the scrape is not restatement-safe",
    }[status]
    structural = {
        "passed": check_passed,
        "checks": [
            {
                "code": "expected_structure",
                "passed": check_passed,
                "severity": "info" if check_passed else "error",
                "message": check_message,
            }
        ],
    }

    programs: list[dict[str, Any]] = []
    showtimes: list[dict[str, Any]] = []
    records: list[RawShowtime] = []
    seen_programs: set[str] = set()
    accepted = screens if status != STATUS_VALID_EMPTY else []
    if status in {STATUS_REQUEST_FAILURE, STATUS_STRUCTURAL_FAILURE}:
        accepted = []

    for screen in accepted:
        title = normalize_exact_source_title(screen.source_title)
        identity = normalize_exact_source_title(screen.identity_title) or title
        if screen.program_id not in seen_programs:
            seen_programs.add(screen.program_id)
            program_raw = {
                "source_title": title,
                "identity_title": identity,
                **screen.program_raw,
            }
            if screen.year is not None:
                program_raw["year_raw"] = screen.year
            if screen.runtime_minutes is not None:
                program_raw["runtime_minutes"] = screen.runtime_minutes
            programs.append(
                {
                    "contract_version": CONTRACT_VERSION,
                    "source": source,
                    "source_program_id": screen.program_id,
                    "source_title": title,
                    "source_program_url": screen.program_url,
                    "observed_at": observed,
                    "program_kind": "film",
                    "raw": program_raw,
                }
            )
        show_raw = {
            "theater_id": screen.theater_id,
            "local_date": screen.local_date.isoformat(),
            "local_time": screen.local_time,
            **screen.showtime_raw,
        }
        showtimes.append(
            {
                "contract_version": CONTRACT_VERSION,
                "source": source,
                "source_program_id": screen.program_id,
                "source_title": title,
                "source_showtime_id": screen.showtime_id,
                "theater_id": screen.theater_id,
                "local_date": screen.local_date.isoformat(),
                "local_time": screen.local_time,
                "timezone": DEFAULT_TIMEZONE,
                "source_occurrence_url": screen.program_url,
                "ticket_url": screen.ticket_url,
                "observed_at": observed,
                "raw": show_raw,
            }
        )
        attributes: dict[str, Any] = {
            "source_film_id": screen.program_id,
            "source_program_id": screen.program_id,
            "source_showtime_id": screen.showtime_id,
            "theater_id": screen.theater_id,
            "local_date": screen.local_date.isoformat(),
            "local_time": screen.local_time,
            "timezone": DEFAULT_TIMEZONE,
        }
        if identity != title:
            attributes["identity_title"] = identity
        if screen.year is not None:
            attributes["year_raw"] = screen.year
        attributes.update(screen.attributes)
        records.append(
            RawShowtime(
                theater_name_raw=screen.theater_name,
                date_raw=csv_date(screen.local_date),
                time_raw=display_time(screen.local_time),
                title_raw=title,
                runtime_raw=(
                    str(screen.runtime_minutes) if screen.runtime_minutes is not None else None
                ),
                poster_url_raw=screen.poster_url,
                ticket_url_raw=screen.ticket_url,
                format_raw=screen.format_raw,
                source_showtime_id=screen.showtime_id,
                source_film_url=screen.program_url,
                attributes=attributes,
            )
        )

    contract_warning_rows = list(warnings_in)
    for row in rejected_rows:
        contract_warning_rows.append(
            {"code": str(row.get("code") or "rejected"), "message": str(row.get("message") or "")}
        )
    if request_error:
        contract_warning_rows.append({"code": "request_failure", "message": request_error})
    if structural_error and status == STATUS_STRUCTURAL_FAILURE:
        contract_warning_rows.append({"code": "structural_failure", "message": structural_error})

    evidence = {"proven": True, "reason": "expected structure contained zero in-window showtimes"}
    result: dict[str, Any] = {
        "contract_version": CONTRACT_VERSION,
        "source": source,
        "scraped_at": observed,
        "requested_window": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
        },
        "inspected_window": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
            "complete": bool(inspected_complete) and status in {STATUS_SUCCESS, STATUS_VALID_EMPTY, STATUS_PARTIAL_FAILURE},
        },
        "status": status,
        "restate_safe": restate_safe,
        "identity": {
            "program_strategy": program_strategy,
            "showtime_strategy": showtime_strategy,
        },
        "structural_validation": structural,
        "stats": {"accepted_showtimes": len(showtimes), "rejected_observations": len(rejected_rows)},
        "warnings": contract_warning_rows,
        "rejected_observations": rejected_rows,
        "programs": programs,
        "showtimes": showtimes,
    }
    if status == STATUS_VALID_EMPTY:
        result["valid_empty_evidence"] = evidence
        result["inspected_window"]["complete"] = True

    assert_valid_independent_source_result(
        result,
        theater_ids=theater_ids if theater_ids else None,
    )

    string_warnings = [f"{row['code']}: {row['message']}" for row in contract_warning_rows if row.get("message")]
    string_errors: list[str] = []
    if status == STATUS_REQUEST_FAILURE and request_error:
        string_errors.append(request_error)
    if status == STATUS_STRUCTURAL_FAILURE and structural_error:
        string_errors.append(structural_error)

    completeness = build_completeness_stats(
        scrape_status=status,
        restate_safe=restate_safe,
        discovery_ok=status not in {STATUS_REQUEST_FAILURE, STATUS_STRUCTURAL_FAILURE},
        expected_structure_present=bool(structure_present) and status != STATUS_REQUEST_FAILURE,
        discovered_programs=discovered_programs,
        program_pages_attempted=pages_attempted,
        program_pages_succeeded=pages_succeeded,
        program_pages_failed=pages_failed,
        failed_program_urls=failed_urls,
        valid_empty_proof=status == STATUS_VALID_EMPTY,
        inspected_scope_complete=bool(result["inspected_window"]["complete"]),
        requested_window_start=window_start.isoformat(),
        requested_window_end=window_end.isoformat(),
    )
    stats = dict(completeness)
    stats["record_count"] = len(records)
    stats["warning_count"] = len(string_warnings)
    stats["error_count"] = len(string_errors)

    mapping = {
        "status": status,
        "restate_safe": restate_safe,
        "accepted_records": len(records),
        "rejected_records": len(rejected_rows),
    }
    envelope = {
        "schema_version": SCRAPE_LOG_SCHEMA_VERSION,
        "generated_at": generated,
        "source": source,
        "records": [raw_showtime_to_record_dict(record) for record in records],
        "stats": stats,
        "warnings": string_warnings,
        "errors": string_errors,
        "mapping": mapping,
        "independent_source_result": result,
    }
    return OptionCAdapterResult(
        records=records,
        stats=stats,
        warnings=string_warnings,
        errors=string_errors,
        contract=result,
        mapping=mapping,
        log_envelope=envelope,
        restate_safe=restate_safe,
    )
