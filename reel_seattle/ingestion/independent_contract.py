"""Shared independent-source observation contract (internal, v1.0.0).

Different extraction strategies, one explicit ingestion contract.

This module defines program/showtime observations and scrape-result shapes for
SIFF, Beacon, Northwest Film Forum, and Central Cinema. It does **not** change
production adapters or restatement behavior.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

CONTRACT_VERSION = "1.0.0"
DEFAULT_TIMEZONE = "America/Los_Angeles"

KNOWN_SOURCES = frozenset({"siff", "beacon", "nwff", "central_cinema"})

STATUS_SUCCESS = "success"
STATUS_VALID_EMPTY = "valid_empty"
STATUS_PARTIAL_FAILURE = "partial_failure"
STATUS_STRUCTURAL_FAILURE = "structural_failure"
STATUS_REQUEST_FAILURE = "request_failure"

ALLOWED_STATUSES = frozenset(
    {
        STATUS_SUCCESS,
        STATUS_VALID_EMPTY,
        STATUS_PARTIAL_FAILURE,
        STATUS_STRUCTURAL_FAILURE,
        STATUS_REQUEST_FAILURE,
    }
)

RESTATE_SAFE_STATUSES = frozenset({STATUS_SUCCESS, STATUS_VALID_EMPTY})
RESTATE_UNSAFE_STATUSES = frozenset(
    {STATUS_PARTIAL_FAILURE, STATUS_STRUCTURAL_FAILURE, STATUS_REQUEST_FAILURE}
)

SEVERITIES = frozenset({"info", "warning", "error"})

PROGRAM_IDENTITY_STRATEGIES = frozenset(
    {
        "canonical_url_slug",
        "canonical_detail_url",
        "source_numeric_id",
    }
)
SHOWTIME_IDENTITY_STRATEGIES = frozenset(
    {
        "source_showing_id",
        "screening_anchor_id",
        "composite_program_theater_datetime",
        "nullable_absent",
    }
)

# Planned theater IDs for fixtures (not necessarily in production registry yet).
PLANNED_FIXTURE_THEATER_IDS = frozenset(
    {
        "siff-cinema-downtown",
        "siff-cinema-uptown",
        "siff-film-center",
        "the-beacon",
        "northwest-film-forum",
        "central-cinema",
    }
)

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{2}:\d{2}(?::\d{2})?$")
_ISO_DT_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"
    r"(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


class IndependentContractError(ValueError):
    """Raised when a contract payload fails validation."""

    def __init__(self, issues: Sequence["ContractIssue"] | str):
        if isinstance(issues, str):
            parsed = [ContractIssue(code="contract_error", message=issues, path="$")]
        else:
            parsed = list(issues)
        self.issues = parsed
        super().__init__(format_issues(parsed))


@dataclass(frozen=True, slots=True)
class ContractIssue:
    code: str
    message: str
    path: str = "$"
    severity: str = "error"


def format_issues(issues: Sequence[ContractIssue]) -> str:
    if not issues:
        return "independent contract validation failed"
    return "; ".join(f"[{item.path}] {item.code}: {item.message}" for item in issues)


def normalize_exact_source_title(value: str) -> str:
    """Preserve source title except for trimming and collapsing internal whitespace."""
    text = str(value).replace("\u00a0", " ").strip()
    return re.sub(r"\s+", " ", text)


def _is_mapping(value: Any) -> bool:
    return isinstance(value, Mapping)


def _require_str(
    obj: Mapping[str, Any],
    key: str,
    *,
    path: str,
    issues: list[ContractIssue],
    allow_empty: bool = False,
) -> str | None:
    if key not in obj:
        issues.append(ContractIssue("missing_field", f"missing required field {key!r}", path))
        return None
    value = obj[key]
    if not isinstance(value, str):
        issues.append(ContractIssue("invalid_type", f"{key} must be a string", f"{path}.{key}"))
        return None
    if not allow_empty and not value.strip():
        issues.append(ContractIssue("empty_field", f"{key} must be non-empty", f"{path}.{key}"))
        return None
    return value


def _require_bool(
    obj: Mapping[str, Any],
    key: str,
    *,
    path: str,
    issues: list[ContractIssue],
) -> bool | None:
    if key not in obj:
        issues.append(ContractIssue("missing_field", f"missing required field {key!r}", path))
        return None
    value = obj[key]
    if not isinstance(value, bool):
        issues.append(ContractIssue("invalid_type", f"{key} must be a boolean", f"{path}.{key}"))
        return None
    return value


def _optional_str(obj: Mapping[str, Any], key: str) -> str | None:
    value = obj.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _validate_date(value: str, *, path: str, issues: list[ContractIssue]) -> None:
    if not _DATE_RE.match(value):
        issues.append(ContractIssue("invalid_date", f"expected YYYY-MM-DD, got {value!r}", path))
        return
    try:
        year, month, day = map(int, value.split("-"))
        from datetime import date as date_cls

        date_cls(year, month, day)
    except ValueError:
        issues.append(ContractIssue("invalid_date", f"invalid calendar date {value!r}", path))


def _validate_time(value: str, *, path: str, issues: list[ContractIssue]) -> None:
    if not _TIME_RE.match(value):
        issues.append(
            ContractIssue("invalid_time", f"expected HH:MM or HH:MM:SS, got {value!r}", path)
        )
        return
    parts = [int(part) for part in value.split(":")]
    hour, minute = parts[0], parts[1]
    second = parts[2] if len(parts) > 2 else 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        issues.append(ContractIssue("invalid_time", f"out-of-range time {value!r}", path))


def _validate_observed_at(value: str, *, path: str, issues: list[ContractIssue]) -> None:
    if not _ISO_DT_RE.match(value):
        issues.append(
            ContractIssue(
                "invalid_datetime",
                f"expected ISO-8601 datetime with timezone, got {value!r}",
                path,
            )
        )


def _validate_raw(value: Any, *, path: str, issues: list[ContractIssue]) -> None:
    if not _is_mapping(value):
        issues.append(ContractIssue("invalid_type", "raw must be an object", path))
        return
    try:
        json.dumps(value)
    except (TypeError, ValueError):
        issues.append(ContractIssue("raw_not_serializable", "raw must be JSON-serializable", path))
        return
    blob = json.dumps(value).casefold()
    if "<html" in blob or "</html>" in blob:
        issues.append(ContractIssue("raw_contains_html", "raw must not embed full HTML pages", path))


def _validate_window(
    window: Any,
    *,
    path: str,
    issues: list[ContractIssue],
    require_complete: bool,
) -> dict[str, Any] | None:
    if not _is_mapping(window):
        issues.append(ContractIssue("invalid_type", "window must be an object", path))
        return None
    start = _require_str(window, "start", path=path, issues=issues)
    end = _require_str(window, "end", path=path, issues=issues)
    if start:
        _validate_date(start, path=f"{path}.start", issues=issues)
    if end:
        _validate_date(end, path=f"{path}.end", issues=issues)
    if start and end and start > end:
        issues.append(
            ContractIssue("invalid_window", "window start must be <= end", path)
        )
    complete: bool | None = None
    if require_complete:
        complete = _require_bool(window, "complete", path=path, issues=issues)
    elif "complete" in window:
        complete = _require_bool(window, "complete", path=path, issues=issues)
    return {"start": start, "end": end, "complete": complete}


def validate_program_observation(
    program: Mapping[str, Any],
    *,
    path: str = "$.programs[*]",
    expected_source: str | None = None,
) -> list[ContractIssue]:
    issues: list[ContractIssue] = []
    if not _is_mapping(program):
        return [ContractIssue("invalid_type", "program must be an object", path)]

    version = _require_str(program, "contract_version", path=path, issues=issues)
    if version is not None and version != CONTRACT_VERSION:
        issues.append(
            ContractIssue(
                "unsupported_version",
                f"expected contract_version {CONTRACT_VERSION!r}",
                f"{path}.contract_version",
            )
        )

    source = _require_str(program, "source", path=path, issues=issues)
    if source is not None and source not in KNOWN_SOURCES:
        issues.append(
            ContractIssue("unknown_source", f"unsupported source {source!r}", f"{path}.source")
        )
    if expected_source is not None and source is not None and source != expected_source:
        issues.append(
            ContractIssue(
                "source_mismatch",
                f"program source {source!r} != result source {expected_source!r}",
                f"{path}.source",
            )
        )

    program_id = _require_str(program, "source_program_id", path=path, issues=issues)
    if program_id is not None and program_id.casefold() == normalize_exact_source_title(
        str(program.get("source_title") or "")
    ).casefold().replace(" ", "-"):
        # Soft signal only when title slug equals id AND raw says normalized_title_identity.
        if program.get("identity_is_normalized_title") is True:
            issues.append(
                ContractIssue(
                    "normalized_title_identity_forbidden",
                    "source_program_id must not be derived from normalized title alone",
                    f"{path}.source_program_id",
                )
            )

    title = _require_str(program, "source_title", path=path, issues=issues)
    if title is not None:
        normalized = normalize_exact_source_title(title)
        if title != normalized:
            issues.append(
                ContractIssue(
                    "title_whitespace",
                    "source_title must use exact text with only whitespace normalization applied",
                    f"{path}.source_title",
                )
            )

    _require_str(program, "source_program_url", path=path, issues=issues)
    observed = _require_str(program, "observed_at", path=path, issues=issues)
    if observed:
        _validate_observed_at(observed, path=f"{path}.observed_at", issues=issues)

    if "raw" not in program:
        issues.append(ContractIssue("missing_field", "missing required field 'raw'", path))
    else:
        _validate_raw(program.get("raw"), path=f"{path}.raw", issues=issues)

    kind = program.get("program_kind")
    if kind is not None and not isinstance(kind, str):
        issues.append(
            ContractIssue("invalid_type", "program_kind must be a string when present", f"{path}.program_kind")
        )

    return issues


def validate_showtime_observation(
    showtime: Mapping[str, Any],
    *,
    path: str = "$.showtimes[*]",
    expected_source: str | None = None,
    theater_ids: Iterable[str] | None = None,
) -> list[ContractIssue]:
    issues: list[ContractIssue] = []
    if not _is_mapping(showtime):
        return [ContractIssue("invalid_type", "showtime must be an object", path)]

    version = _require_str(showtime, "contract_version", path=path, issues=issues)
    if version is not None and version != CONTRACT_VERSION:
        issues.append(
            ContractIssue(
                "unsupported_version",
                f"expected contract_version {CONTRACT_VERSION!r}",
                f"{path}.contract_version",
            )
        )

    source = _require_str(showtime, "source", path=path, issues=issues)
    if source is not None and source not in KNOWN_SOURCES:
        issues.append(
            ContractIssue("unknown_source", f"unsupported source {source!r}", f"{path}.source")
        )
    if expected_source is not None and source is not None and source != expected_source:
        issues.append(
            ContractIssue(
                "source_mismatch",
                f"showtime source {source!r} != result source {expected_source!r}",
                f"{path}.source",
            )
        )

    _require_str(showtime, "source_program_id", path=path, issues=issues)
    title = _require_str(showtime, "source_title", path=path, issues=issues)
    if title is not None:
        normalized = normalize_exact_source_title(title)
        if title != normalized:
            issues.append(
                ContractIssue(
                    "title_whitespace",
                    "source_title must use exact text with only whitespace normalization applied",
                    f"{path}.source_title",
                )
            )

    sid = showtime.get("source_showtime_id")
    if sid is not None and not isinstance(sid, str):
        issues.append(
            ContractIssue(
                "invalid_type",
                "source_showtime_id must be a string or null",
                f"{path}.source_showtime_id",
            )
        )
    elif isinstance(sid, str) and not sid.strip():
        issues.append(
            ContractIssue(
                "empty_field",
                "source_showtime_id must be null or non-empty",
                f"{path}.source_showtime_id",
            )
        )

    theater_id = _require_str(showtime, "theater_id", path=path, issues=issues)
    allowed = set(theater_ids) if theater_ids is not None else None
    if theater_id is not None and allowed is not None and theater_id not in allowed:
        issues.append(
            ContractIssue(
                "unknown_theater_id",
                f"theater_id {theater_id!r} is not in the theater registry",
                f"{path}.theater_id",
            )
        )

    local_date = _require_str(showtime, "local_date", path=path, issues=issues)
    if local_date:
        _validate_date(local_date, path=f"{path}.local_date", issues=issues)
    local_time = _require_str(showtime, "local_time", path=path, issues=issues)
    if local_time:
        _validate_time(local_time, path=f"{path}.local_time", issues=issues)

    timezone = _require_str(showtime, "timezone", path=path, issues=issues)
    if timezone is not None and timezone != DEFAULT_TIMEZONE:
        issues.append(
            ContractIssue(
                "invalid_timezone",
                f"timezone must be {DEFAULT_TIMEZONE!r}",
                f"{path}.timezone",
            )
        )

    _require_str(showtime, "source_occurrence_url", path=path, issues=issues)
    ticket = showtime.get("ticket_url")
    if ticket is not None and not isinstance(ticket, str):
        issues.append(
            ContractIssue("invalid_type", "ticket_url must be a string or null", f"{path}.ticket_url")
        )
    elif isinstance(ticket, str) and not ticket.strip():
        issues.append(
            ContractIssue("empty_field", "ticket_url must be null or non-empty", f"{path}.ticket_url")
        )

    observed = _require_str(showtime, "observed_at", path=path, issues=issues)
    if observed:
        _validate_observed_at(observed, path=f"{path}.observed_at", issues=issues)

    if "raw" not in showtime:
        issues.append(ContractIssue("missing_field", "missing required field 'raw'", path))
    else:
        _validate_raw(showtime.get("raw"), path=f"{path}.raw", issues=issues)

    return issues


def _validate_structural_validation(
    payload: Any,
    *,
    path: str,
    issues: list[ContractIssue],
    require_checks: bool,
    restate_safe: bool | None,
) -> None:
    if not _is_mapping(payload):
        issues.append(ContractIssue("invalid_type", "structural_validation must be an object", path))
        return
    passed = _require_bool(payload, "passed", path=path, issues=issues)
    checks = payload.get("checks")
    if not isinstance(checks, list):
        issues.append(ContractIssue("invalid_type", "checks must be an array", f"{path}.checks"))
        return
    if require_checks and len(checks) < 1:
        issues.append(
            ContractIssue(
                "missing_structural_checks",
                "successful/valid_empty results require at least one structural check",
                f"{path}.checks",
            )
        )
    error_failures = 0
    for index, check in enumerate(checks):
        check_path = f"{path}.checks[{index}]"
        if not _is_mapping(check):
            issues.append(ContractIssue("invalid_type", "check must be an object", check_path))
            continue
        _require_str(check, "code", path=check_path, issues=issues)
        check_passed = _require_bool(check, "passed", path=check_path, issues=issues)
        severity = _require_str(check, "severity", path=check_path, issues=issues)
        if severity is not None and severity not in SEVERITIES:
            issues.append(
                ContractIssue(
                    "invalid_severity",
                    f"severity must be one of {sorted(SEVERITIES)}",
                    f"{check_path}.severity",
                )
            )
        message = check.get("message")
        if message is not None and not isinstance(message, str):
            issues.append(
                ContractIssue("invalid_type", "message must be a string or null", f"{check_path}.message")
            )
        if check_passed is False and severity == "error":
            error_failures += 1
    if passed is True and error_failures:
        issues.append(
            ContractIssue(
                "structural_aggregate_mismatch",
                "structural_validation.passed cannot be true with failed error checks",
                path,
            )
        )
    if restate_safe is True and error_failures:
        issues.append(
            ContractIssue(
                "restate_safe_with_structural_errors",
                "restate_safe=true cannot accompany failed error-level structural checks",
                path,
            )
        )


def _validate_warnings(warnings: Any, *, path: str, issues: list[ContractIssue]) -> None:
    if not isinstance(warnings, list):
        issues.append(ContractIssue("invalid_type", "warnings must be an array", path))
        return
    for index, warning in enumerate(warnings):
        warn_path = f"{path}[{index}]"
        if not _is_mapping(warning):
            issues.append(ContractIssue("invalid_type", "warning must be an object", warn_path))
            continue
        _require_str(warning, "code", path=warn_path, issues=issues)
        _require_str(warning, "message", path=warn_path, issues=issues)


def _validate_rejected(
    rejected: Any,
    *,
    path: str,
    issues: list[ContractIssue],
) -> None:
    if not isinstance(rejected, list):
        issues.append(ContractIssue("invalid_type", "rejected_observations must be an array", path))
        return
    for index, row in enumerate(rejected):
        row_path = f"{path}[{index}]"
        if not _is_mapping(row):
            issues.append(ContractIssue("invalid_type", "rejected observation must be an object", row_path))
            continue
        _require_str(row, "code", path=row_path, issues=issues)
        _require_str(row, "message", path=row_path, issues=issues)
        affects = _require_bool(row, "affects_completeness", path=row_path, issues=issues)
        if affects is None:
            continue


def validate_independent_source_result(
    result: Mapping[str, Any],
    *,
    theater_ids: Iterable[str] | None = None,
) -> list[ContractIssue]:
    """Validate a full independent-source scrape result. Returns issues (empty if valid)."""
    issues: list[ContractIssue] = []
    if not _is_mapping(result):
        return [ContractIssue("invalid_type", "result must be an object", "$")]

    version = _require_str(result, "contract_version", path="$", issues=issues)
    if version is not None and version != CONTRACT_VERSION:
        issues.append(
            ContractIssue(
                "unsupported_version",
                f"expected contract_version {CONTRACT_VERSION!r}",
                "$.contract_version",
            )
        )

    source = _require_str(result, "source", path="$", issues=issues)
    if source is not None and source not in KNOWN_SOURCES:
        issues.append(ContractIssue("unknown_source", f"unsupported source {source!r}", "$.source"))

    scraped_at = _require_str(result, "scraped_at", path="$", issues=issues)
    if scraped_at:
        _validate_observed_at(scraped_at, path="$.scraped_at", issues=issues)

    requested = _validate_window(
        result.get("requested_window"),
        path="$.requested_window",
        issues=issues,
        require_complete=False,
    )
    inspected = _validate_window(
        result.get("inspected_window"),
        path="$.inspected_window",
        issues=issues,
        require_complete=True,
    )

    status = _require_str(result, "status", path="$", issues=issues)
    if status is not None and status not in ALLOWED_STATUSES:
        issues.append(
            ContractIssue(
                "invalid_status",
                f"status must be one of {sorted(ALLOWED_STATUSES)}",
                "$.status",
            )
        )

    restate_safe = _require_bool(result, "restate_safe", path="$", issues=issues)

    if status in RESTATE_SAFE_STATUSES and restate_safe is False:
        issues.append(
            ContractIssue(
                "status_restate_mismatch",
                f"status={status!r} requires restate_safe=true",
                "$.restate_safe",
            )
        )
    if status in RESTATE_UNSAFE_STATUSES and restate_safe is True:
        issues.append(
            ContractIssue(
                "status_restate_mismatch",
                f"status={status!r} requires restate_safe=false",
                "$.restate_safe",
            )
        )

    if status in RESTATE_SAFE_STATUSES:
        if inspected and inspected.get("complete") is not True:
            issues.append(
                ContractIssue(
                    "incomplete_inspected_window",
                    f"status={status!r} requires inspected_window.complete=true",
                    "$.inspected_window.complete",
                )
            )
        if requested and inspected:
            if requested.get("start") and inspected.get("start") and inspected["start"] > requested["start"]:
                issues.append(
                    ContractIssue(
                        "inspected_window_gap",
                        "inspected window starts after requested window",
                        "$.inspected_window",
                    )
                )
            if requested.get("end") and inspected.get("end") and inspected["end"] < requested["end"]:
                issues.append(
                    ContractIssue(
                        "inspected_window_gap",
                        "inspected window ends before requested window while marked complete",
                        "$.inspected_window",
                    )
                )

    if status == STATUS_VALID_EMPTY:
        evidence = result.get("valid_empty_evidence")
        if not _is_mapping(evidence) or evidence.get("proven") is not True:
            issues.append(
                ContractIssue(
                    "valid_empty_unproven",
                    "valid_empty requires valid_empty_evidence.proven=true",
                    "$.valid_empty_evidence",
                )
            )

    identity = result.get("identity")
    if not _is_mapping(identity):
        issues.append(ContractIssue("missing_field", "identity object is required", "$.identity"))
    else:
        program_strategy = _require_str(identity, "program_strategy", path="$.identity", issues=issues)
        showtime_strategy = _require_str(identity, "showtime_strategy", path="$.identity", issues=issues)
        if program_strategy is not None and program_strategy not in PROGRAM_IDENTITY_STRATEGIES:
            issues.append(
                ContractIssue(
                    "invalid_identity_strategy",
                    f"unknown program_strategy {program_strategy!r}",
                    "$.identity.program_strategy",
                )
            )
        if showtime_strategy is not None and showtime_strategy not in SHOWTIME_IDENTITY_STRATEGIES:
            issues.append(
                ContractIssue(
                    "invalid_identity_strategy",
                    f"unknown showtime_strategy {showtime_strategy!r}",
                    "$.identity.showtime_strategy",
                )
            )

    require_checks = status in RESTATE_SAFE_STATUSES
    _validate_structural_validation(
        result.get("structural_validation"),
        path="$.structural_validation",
        issues=issues,
        require_checks=require_checks,
        restate_safe=restate_safe,
    )

    if "stats" not in result or not _is_mapping(result.get("stats")):
        issues.append(ContractIssue("invalid_type", "stats must be an object", "$.stats"))

    _validate_warnings(result.get("warnings"), path="$.warnings", issues=issues)
    _validate_rejected(result.get("rejected_observations"), path="$.rejected_observations", issues=issues)

    programs = result.get("programs")
    showtimes = result.get("showtimes")
    if not isinstance(programs, list):
        issues.append(ContractIssue("invalid_type", "programs must be an array", "$.programs"))
        programs = []
    if not isinstance(showtimes, list):
        issues.append(ContractIssue("invalid_type", "showtimes must be an array", "$.showtimes"))
        showtimes = []

    if status == STATUS_VALID_EMPTY and len(showtimes) != 0:
        issues.append(
            ContractIssue(
                "valid_empty_has_showtimes",
                "valid_empty results must have zero accepted showtimes",
                "$.showtimes",
            )
        )

    program_ids: dict[str, list[int]] = {}
    program_by_id: dict[str, Mapping[str, Any]] = {}
    for index, program in enumerate(programs):
        path = f"$.programs[{index}]"
        issues.extend(validate_program_observation(program, path=path, expected_source=source))
        if _is_mapping(program):
            pid = program.get("source_program_id")
            if isinstance(pid, str) and pid.strip():
                program_ids.setdefault(pid, []).append(index)
                if pid not in program_by_id:
                    program_by_id[pid] = program
                else:
                    # Conflicting duplicate detection.
                    prior = program_by_id[pid]
                    if (
                        prior.get("source_title") != program.get("source_title")
                        or prior.get("source_program_url") != program.get("source_program_url")
                    ):
                        issues.append(
                            ContractIssue(
                                "conflicting_duplicate_program",
                                f"conflicting duplicate source_program_id {pid!r}",
                                path,
                            )
                        )

    showtime_ids: dict[str, list[int]] = {}
    for index, showtime in enumerate(showtimes):
        path = f"$.showtimes[{index}]"
        issues.extend(
            validate_showtime_observation(
                showtime,
                path=path,
                expected_source=source,
                theater_ids=theater_ids,
            )
        )
        if not _is_mapping(showtime):
            continue
        pid = showtime.get("source_program_id")
        if isinstance(pid, str) and pid not in program_by_id:
            issues.append(
                ContractIssue(
                    "orphan_showtime",
                    f"showtime references unknown source_program_id {pid!r}",
                    path,
                )
            )
        elif isinstance(pid, str) and pid in program_by_id:
            program_title = program_by_id[pid].get("source_title")
            show_title = showtime.get("source_title")
            if (
                isinstance(program_title, str)
                and isinstance(show_title, str)
                and normalize_exact_source_title(program_title)
                != normalize_exact_source_title(show_title)
            ):
                raw = showtime.get("raw")
                allow_diff = (
                    isinstance(raw, Mapping) and raw.get("title_differs_from_program") is True
                )
                if not allow_diff:
                    issues.append(
                        ContractIssue(
                            "title_inconsistency",
                            "showtime source_title must match program source_title "
                            "unless raw.title_differs_from_program=true",
                            f"{path}.source_title",
                        )
                    )
        sid = showtime.get("source_showtime_id")
        if isinstance(sid, str) and sid.strip():
            showtime_ids.setdefault(sid, []).append(index)

    for sid, indexes in showtime_ids.items():
        if len(indexes) < 2:
            continue
        samples = [showtimes[i] for i in indexes if _is_mapping(showtimes[i])]
        keys = {
            (
                row.get("source_program_id"),
                row.get("theater_id"),
                row.get("local_date"),
                row.get("local_time"),
                row.get("source_occurrence_url"),
            )
            for row in samples
        }
        if len(keys) > 1:
            issues.append(
                ContractIssue(
                    "conflicting_duplicate_showtime_id",
                    f"conflicting duplicate source_showtime_id {sid!r}",
                    f"$.showtimes[{indexes[1]}]",
                )
            )

    return issues


def assert_valid_independent_source_result(
    result: Mapping[str, Any],
    *,
    theater_ids: Iterable[str] | None = None,
) -> Mapping[str, Any]:
    issues = validate_independent_source_result(result, theater_ids=theater_ids)
    if issues:
        raise IndependentContractError(issues)
    return result


def dedupe_identical_programs(programs: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Drop byte-identical duplicate programs; keep first occurrence order by id."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for program in programs:
        if not _is_mapping(program):
            continue
        pid = str(program.get("source_program_id") or "")
        fingerprint = json.dumps(program, sort_keys=True, ensure_ascii=False)
        key = f"{pid}::{fingerprint}"
        if key in seen:
            continue
        seen.add(key)
        out.append(dict(program))
    out.sort(key=lambda row: str(row.get("source_program_id") or ""))
    return out


def serialize_independent_source_result(result: Mapping[str, Any]) -> str:
    """Deterministic JSON serialization for fixtures and debugging."""
    payload = json.loads(json.dumps(result))  # deep copy via JSON
    programs = payload.get("programs") or []
    showtimes = payload.get("showtimes") or []
    warnings = payload.get("warnings") or []
    rejected = payload.get("rejected_observations") or []
    structural = payload.get("structural_validation") or {}
    checks = structural.get("checks") or []

    if isinstance(programs, list):
        payload["programs"] = sorted(
            programs,
            key=lambda row: str((row or {}).get("source_program_id") or ""),
        )
    if isinstance(showtimes, list):
        payload["showtimes"] = sorted(
            showtimes,
            key=lambda row: (
                str((row or {}).get("local_date") or ""),
                str((row or {}).get("local_time") or ""),
                str((row or {}).get("theater_id") or ""),
                str((row or {}).get("source_showtime_id") or ""),
                str((row or {}).get("source_program_id") or ""),
            ),
        )
    if isinstance(warnings, list):
        payload["warnings"] = sorted(
            warnings,
            key=lambda row: (
                str((row or {}).get("code") or ""),
                str((row or {}).get("source_program_id") or ""),
                str((row or {}).get("message") or ""),
            ),
        )
    if isinstance(rejected, list):
        payload["rejected_observations"] = sorted(
            rejected,
            key=lambda row: (
                str((row or {}).get("code") or ""),
                str((row or {}).get("source_program_id") or ""),
                str((row or {}).get("message") or ""),
            ),
        )
    if isinstance(checks, list):
        structural = dict(structural)
        structural["checks"] = sorted(
            checks,
            key=lambda row: str((row or {}).get("code") or ""),
        )
        payload["structural_validation"] = structural

    return json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def load_theater_ids_from_registry(registry_path: Path | str | None = None) -> set[str]:
    path = Path(registry_path) if registry_path else Path("data/theaters.json")
    payload = json.loads(path.read_text(encoding="utf-8"))
    theaters = payload.get("theaters") if isinstance(payload, Mapping) else None
    if not isinstance(theaters, list):
        raise IndependentContractError("theater registry missing theaters array")
    ids: set[str] = set()
    for row in theaters:
        if isinstance(row, Mapping) and isinstance(row.get("id"), str) and row["id"].strip():
            ids.add(row["id"].strip())
    return ids


def fixture_theater_ids(*, include_planned: bool = True) -> set[str]:
    """Registry IDs plus planned NWFF/Central IDs for contract fixtures."""
    ids = load_theater_ids_from_registry()
    if include_planned:
        ids |= set(PLANNED_FIXTURE_THEATER_IDS)
    return ids


def load_result_fixture(path: Path | str) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise IndependentContractError(f"fixture is not an object: {path}")
    return payload
