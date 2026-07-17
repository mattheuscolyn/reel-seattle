"""Indie scrape completeness and restatement-safety helpers (SIFF / Beacon).

Internal contract only — not a public schema. Used by adapters and
``daily_processor`` to avoid destructive future-window restatement when a
scrape cannot prove completeness.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

# Internal scrape outcome labels (not necessarily mirrored in pipeline_report enums).
STATUS_SUCCESS = "success"
STATUS_SUCCESS_WITH_WARNINGS = "success_with_warnings"
STATUS_VALID_EMPTY = "valid_empty"
STATUS_PARTIAL_FAILURE = "partial_failure"
STATUS_STRUCTURAL_FAILURE = "structural_failure"
STATUS_REQUEST_FAILURE = "request_failure"


def window_stats(window_start: object, window_end: object) -> dict[str, object]:
    return {
        "requested_window_start": str(window_start) if window_start is not None else None,
        "requested_window_end": str(window_end) if window_end is not None else None,
    }


def build_completeness_stats(
    *,
    scrape_status: str,
    restate_safe: bool,
    discovery_ok: bool,
    expected_structure_present: bool,
    discovered_programs: int,
    program_pages_attempted: int,
    program_pages_succeeded: int,
    program_pages_failed: int,
    failed_program_urls: Sequence[str] | None = None,
    valid_empty_proof: bool = False,
    inspected_scope_complete: bool | None = None,
    requested_window_start: object = None,
    requested_window_end: object = None,
    extra: Mapping[str, object] | None = None,
) -> dict[str, object]:
    """Build adapter stats fields for indie restatement eligibility."""
    failed_urls = [str(url) for url in (failed_program_urls or []) if str(url).strip()]
    scope_complete = (
        inspected_scope_complete
        if inspected_scope_complete is not None
        else bool(restate_safe)
    )
    stats: dict[str, object] = {
        "scrape_status": scrape_status,
        "restate_safe": bool(restate_safe),
        "expected_structure_present": bool(expected_structure_present),
        "discovery_ok": bool(discovery_ok),
        "discovered_programs": int(discovered_programs),
        "program_pages_attempted": int(program_pages_attempted),
        "program_pages_succeeded": int(program_pages_succeeded),
        "program_pages_failed": int(program_pages_failed),
        "failed_program_urls": failed_urls[:20],
        "valid_empty_proof": bool(valid_empty_proof),
        "stale_retention_recommended": not bool(restate_safe),
        "inspected_scope_complete": bool(scope_complete),
        **window_stats(requested_window_start, requested_window_end),
    }
    if extra:
        for key, value in extra.items():
            if key not in stats:
                stats[key] = value
    return stats


def decide_siff_completeness(
    *,
    discovery_ok: bool,
    expected_structure_present: bool,
    discovered_programs: int,
    program_pages_succeeded: int,
    program_pages_failed: int,
    record_count: int,
    failed_program_urls: Sequence[str] | None = None,
    window_start: object = None,
    window_end: object = None,
    affirmative_empty_proof: bool = False,
    extra: Mapping[str, object] | None = None,
) -> tuple[dict[str, object], list[str]]:
    """Decide SIFF scrape_status / restate_safe and return (stats, extra_warnings)."""
    warnings: list[str] = []
    failed = int(program_pages_failed)
    succeeded = int(program_pages_succeeded)
    discovered = int(discovered_programs)

    if not discovery_ok:
        status = STATUS_REQUEST_FAILURE
        restate_safe = False
        structure = False
        valid_empty = False
        warnings.append(
            "SIFF listing request failed; retained prior future rows if present "
            "(restate blocked)."
        )
    elif not expected_structure_present:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
        structure = False
        valid_empty = False
        warnings.append(
            "SIFF scrape structurally empty or unexpected listing markup; "
            "retained prior future rows if present (restate blocked)."
        )
    elif failed > 0:
        # Source-wide restatement: any failed discovered program page is unsafe.
        status = STATUS_PARTIAL_FAILURE
        restate_safe = False
        structure = True
        valid_empty = False
        warnings.append(
            f"SIFF scrape partial: {succeeded} of {discovered} program pages parsed; "
            "retained prior future rows (restate blocked)."
        )
    elif (
        record_count == 0
        and expected_structure_present
        and failed == 0
        and discovered > 0
        and succeeded == discovered
    ):
        # Affirmative empty schedule: every discovered program page loaded and
        # yielded no showtimes (parent-event / unscheduled pages included).
        status = STATUS_VALID_EMPTY
        restate_safe = True
        structure = True
        valid_empty = True
    elif discovered == 0 and record_count == 0 and affirmative_empty_proof:
        status = STATUS_VALID_EMPTY
        restate_safe = True
        structure = True
        valid_empty = True
    elif discovered == 0 and record_count == 0:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
        structure = expected_structure_present
        valid_empty = False
        warnings.append(
            "SIFF listing returned zero programs without affirmative empty proof; "
            "retained prior future rows if present (restate blocked)."
        )
    elif record_count == 0:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
        structure = expected_structure_present
        valid_empty = False
        warnings.append(
            "SIFF scrape returned zero showtimes without valid-empty proof; "
            "retained prior future rows if present (restate blocked)."
        )
    else:
        status = STATUS_SUCCESS
        restate_safe = True
        structure = True
        valid_empty = False

    stats = build_completeness_stats(
        scrape_status=status,
        restate_safe=restate_safe,
        discovery_ok=discovery_ok,
        expected_structure_present=structure and expected_structure_present,
        discovered_programs=discovered,
        program_pages_attempted=discovered,
        program_pages_succeeded=succeeded,
        program_pages_failed=failed,
        failed_program_urls=failed_program_urls,
        valid_empty_proof=valid_empty,
        inspected_scope_complete=restate_safe,
        requested_window_start=window_start,
        requested_window_end=window_end,
        extra=extra,
    )
    return stats, warnings


def decide_beacon_completeness(
    *,
    discovery_ok: bool,
    expected_structure_present: bool,
    discovered_programs: int,
    program_pages_succeeded: int,
    program_pages_failed: int,
    record_count: int,
    failed_program_urls: Sequence[str] | None = None,
    window_start: object = None,
    window_end: object = None,
    extra: Mapping[str, object] | None = None,
) -> tuple[dict[str, object], list[str]]:
    """Decide Beacon scrape_status / restate_safe and return (stats, extra_warnings)."""
    warnings: list[str] = []
    failed = int(program_pages_failed)
    succeeded = int(program_pages_succeeded)
    discovered = int(discovered_programs)

    if not discovery_ok:
        status = STATUS_REQUEST_FAILURE
        restate_safe = False
        structure = False
        valid_empty = False
        warnings.append(
            "Beacon calendar request failed; retained prior future rows if present "
            "(restate blocked)."
        )
    elif not expected_structure_present:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
        structure = False
        valid_empty = False
        warnings.append(
            "Beacon scrape structurally empty: no trusted current rows; "
            "retained stale future rows if present (restate blocked)."
        )
    elif failed > 0:
        status = STATUS_PARTIAL_FAILURE
        restate_safe = False
        structure = True
        valid_empty = False
        warnings.append(
            f"Beacon scrape partial: {succeeded} of {discovered} movie pages parsed; "
            "retained prior future rows (restate blocked)."
        )
    elif (
        record_count == 0
        and expected_structure_present
        and failed == 0
        and discovered > 0
        and succeeded == discovered
    ):
        # Affirmative empty: every discovered movie page loaded and yielded no showtimes.
        # Zero discovered links is NOT enough proof (site markup may have drifted).
        status = STATUS_VALID_EMPTY
        restate_safe = True
        structure = True
        valid_empty = True
    elif record_count == 0:
        status = STATUS_STRUCTURAL_FAILURE
        restate_safe = False
        structure = expected_structure_present
        valid_empty = False
        warnings.append(
            "Beacon scrape returned zero showtimes without valid-empty proof; "
            "retained prior future rows if present (restate blocked)."
        )
    else:
        status = STATUS_SUCCESS
        restate_safe = True
        structure = True
        valid_empty = False

    stats = build_completeness_stats(
        scrape_status=status,
        restate_safe=restate_safe,
        discovery_ok=discovery_ok,
        expected_structure_present=structure,
        discovered_programs=discovered,
        program_pages_attempted=discovered,
        program_pages_succeeded=succeeded,
        program_pages_failed=failed,
        failed_program_urls=failed_program_urls,
        valid_empty_proof=valid_empty,
        inspected_scope_complete=restate_safe,
        requested_window_start=window_start,
        requested_window_end=window_end,
        extra=extra,
    )
    return stats, warnings


def restate_safe_from_scrape_stats(stats: Mapping[str, Any] | None) -> bool | None:
    """Return explicit restate_safe, or None when metadata is absent (legacy logs)."""
    if not isinstance(stats, Mapping):
        return None
    if "restate_safe" not in stats:
        return None
    value = stats.get("restate_safe")
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().casefold()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
    return bool(value)


def reconcile_option_c_restate_safe(payload: Mapping[str, Any] | None) -> bool | None:
    """AND contract + mapping + stats restate_safe for Option C envelopes.

    Returns ``None`` when no layer exposes ``restate_safe`` (legacy SIFF/Beacon logs).
    """
    if not isinstance(payload, Mapping):
        return None

    flags: list[bool] = []
    mapping = payload.get("mapping")
    if isinstance(mapping, Mapping) and "restate_safe" in mapping:
        flags.append(bool(mapping["restate_safe"]))

    contract = payload.get("independent_source_result")
    if isinstance(contract, Mapping) and "restate_safe" in contract:
        flags.append(bool(contract["restate_safe"]))

    stats = payload.get("stats")
    if isinstance(stats, Mapping) and "restate_safe" in stats:
        flags.append(bool(stats["restate_safe"]))

    if not flags:
        return None
    return all(flags)


def is_indie_restate_allowed(
    *,
    input_kind: str,
    stats: Mapping[str, Any] | None,
    existing_future: int,
    incoming_future: int,
) -> tuple[bool, str | None]:
    """Decide whether indie future-window restatement may proceed.

    Returns ``(allowed, skip_reason)``.

    Fallback rules:
    * JSON logs with ``restate_safe`` → honor the flag.
    * JSON logs lacking completeness metadata → conservative: block when
      ``existing_future > 0`` (do not treat old empty logs as valid empty).
    * CSV-only legacy input → keep the historical empty-incoming guard only
      (production scrapes write JSON with explicit metadata).
    """
    if input_kind == "csv":
        if existing_future > 0 and incoming_future == 0:
            return False, (
                "incoming scrape has 0 future rows, but history has "
                f"{existing_future} future rows (legacy CSV empty guard)."
            )
        return True, None

    decision = restate_safe_from_scrape_stats(stats)
    if decision is None:
        # Historical JSON without completeness fields.
        if existing_future > 0:
            return False, (
                "scrape log lacks restate_safe completeness metadata; "
                f"conservatively retained {existing_future} future rows."
            )
        if incoming_future == 0:
            return False, (
                "scrape log lacks restate_safe completeness metadata and "
                "incoming future rows are 0; skip empty restatement."
            )
        return True, None

    if not decision:
        status = ""
        if isinstance(stats, Mapping) and stats.get("scrape_status"):
            status = f" (scrape_status={stats.get('scrape_status')})"
        if existing_future > 0:
            return False, (
                f"scrape not restate_safe{status}; "
                f"retained prior future rows ({existing_future} existing)."
            )
        return False, f"scrape not restate_safe{status}; restatement skipped."

    # restate_safe True — including valid_empty clearing futures.
    return True, None


def derived_indie_completeness_warnings(
    source: str,
    stats: Mapping[str, object],
) -> list[str]:
    """Pipeline-report warnings derived from indie completeness stats."""
    if source not in {"siff", "beacon", "nwff", "central_cinema"}:
        return []
    if "restate_safe" not in stats:
        return []

    warnings: list[str] = []
    restate_safe = restate_safe_from_scrape_stats(stats)
    status = str(stats.get("scrape_status") or "").strip()
    succeeded = stats.get("program_pages_succeeded")
    discovered = stats.get("discovered_programs")
    if source == "siff":
        label = "SIFF"
    elif source == "beacon":
        label = "Beacon"
    elif source == "central_cinema":
        label = "Central Cinema"
    else:
        label = "NWFF"

    if restate_safe is False:
        if status == STATUS_PARTIAL_FAILURE and isinstance(succeeded, int) and isinstance(
            discovered, int
        ):
            warnings.append(
                f"{label} scrape partial: {succeeded} of {discovered} program pages "
                "parsed; retained prior future rows."
            )
        elif source == "beacon" and (
            status in {STATUS_STRUCTURAL_FAILURE, STATUS_REQUEST_FAILURE}
            or not stats.get("valid_empty_proof")
        ):
            warnings.append(
                "Beacon scrape structurally empty: no trusted current rows; "
                "retained stale future rows."
            )
        elif source == "central_cinema" and status == STATUS_STRUCTURAL_FAILURE:
            warnings.append(
                "Central Cinema scrape structural failure "
                f"(scrape_status={status or 'unknown'}); retained prior future rows."
            )
        elif source in {"nwff", "central_cinema"}:
            warnings.append(
                f"{label} scrape incomplete or unsafe (scrape_status={status or 'unknown'}); "
                "retained prior future rows."
            )
        else:
            warnings.append(
                f"{label} scrape incomplete or structurally empty; "
                "retained prior future rows."
            )

    return warnings
