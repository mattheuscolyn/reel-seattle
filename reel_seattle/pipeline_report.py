"""Build and write the daily pipeline observability report."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.adapters.scrape_log import DEFAULT_DAILY_LOGS_DIR, daily_log_path
from reel_seattle.adapters.indie_completeness import derived_indie_completeness_warnings
from reel_seattle.source_freshness import KNOWN_SOURCES
from reel_seattle.validate import validate_pipeline_report

PIPELINE_REPORT_SCHEMA_VERSION = "1.0.0"
DEFAULT_OUTPUT_PATH = Path("public/data/pipeline_report.json")


@dataclass(frozen=True)
class SourceScrapeDiagnostics:
    """Per-source scrape log warnings and errors for pipeline_report."""

    warnings: tuple[str, ...] = ()
    errors: tuple[str, ...] = ()


def _format_run_date(run_date: date | str) -> str:
    if isinstance(run_date, date):
        return run_date.isoformat()
    return str(run_date)


def _coerce_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def _theater_labels(theaters: object) -> list[str]:
    """Extract human-readable labels (name, else id) from skipped-theater dicts."""
    if not isinstance(theaters, list):
        return []
    labels: list[str] = []
    for theater in theaters:
        if not isinstance(theater, dict):
            continue
        label = str(theater.get("name") or "").strip() or str(theater.get("id") or "").strip()
        if label:
            labels.append(label)
    return labels


def _derived_amc_warnings(stats: Mapping[str, object]) -> list[str]:
    """Build AMC allowlist warnings from scrape-log stats without scraper changes.

    Names are appended when structured ``allowlist_*_theaters`` lists are present;
    older logs without them fall back to count-only messages.
    """
    warnings: list[str] = []
    unknown = stats.get("allowlist_unknown")
    if isinstance(unknown, int) and unknown > 0:
        labels = _theater_labels(stats.get("allowlist_unknown_theaters"))
        message = f"AMC allowlist: {unknown} unknown theaters skipped"
        if labels:
            message += ": " + ", ".join(labels)
        warnings.append(message)
    disabled = stats.get("allowlist_disabled")
    if isinstance(disabled, int) and disabled > 0:
        labels = _theater_labels(stats.get("allowlist_disabled_theaters"))
        message = f"AMC allowlist: {disabled} disabled registry matches skipped"
        if labels:
            message += ": " + ", ".join(labels)
        warnings.append(message)
    return warnings


def load_daily_scrape_diagnostics(
    run_date: date | str,
    *,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    expected_sources: tuple[str, ...] = KNOWN_SOURCES,
) -> dict[str, SourceScrapeDiagnostics]:
    """Load per-source warnings/errors from normalized daily scrape logs."""
    date_label = _format_run_date(run_date)
    logs_path = Path(logs_dir)
    diagnostics: dict[str, SourceScrapeDiagnostics] = {}

    for source in expected_sources:
        warnings: list[str] = []
        errors: list[str] = []
        log_path = daily_log_path(run_date, source, logs_dir=logs_path)

        if not log_path.is_file():
            warnings.append(
                f"No daily scrape log found for {source} on {date_label}; "
                "diagnostics may be incomplete."
            )
            diagnostics[source] = SourceScrapeDiagnostics(tuple(warnings), tuple(errors))
            continue

        try:
            payload = json.loads(log_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            warnings.append(
                f"Could not read daily scrape log for {source} on {date_label}."
            )
            diagnostics[source] = SourceScrapeDiagnostics(tuple(warnings), tuple(errors))
            continue

        if not isinstance(payload, dict):
            warnings.append(f"Invalid daily scrape log for {source} on {date_label}.")
            diagnostics[source] = SourceScrapeDiagnostics(tuple(warnings), tuple(errors))
            continue

        warnings.extend(_coerce_string_list(payload.get("warnings")))
        errors.extend(_coerce_string_list(payload.get("errors")))

        stats = payload.get("stats")
        if isinstance(stats, dict):
            if source == "amc":
                for message in _derived_amc_warnings(stats):
                    if message not in warnings:
                        warnings.append(message)
            elif source in {"siff", "beacon", "nwff", "central_cinema"}:
                for message in derived_indie_completeness_warnings(source, stats):
                    if message not in warnings:
                        warnings.append(message)

        diagnostics[source] = SourceScrapeDiagnostics(tuple(warnings), tuple(errors))

    return diagnostics


def build_pipeline_report(
    artifact: dict[str, Any],
    *,
    messages: list[str] | None = None,
    status: str = "success",
    scrape_diagnostics: Mapping[str, SourceScrapeDiagnostics] | None = None,
) -> dict[str, Any]:
    """Build ``pipeline_report.json`` from a validated showtimes_current artifact."""
    diagnostics = scrape_diagnostics or {}
    sources: dict[str, Any] = {}
    for source in KNOWN_SOURCES:
        source_meta = artifact["sources"][source]
        source_diag = diagnostics.get(source)
        sources[source] = {
            "status": source_meta["status"],
            "showtime_count": source_meta["showtime_count"],
            "film_count": source_meta["film_count"],
            "theater_count": source_meta["theater_count"],
            "last_successful_run": source_meta["last_successful_run"],
            "warnings": list(source_diag.warnings) if source_diag else [],
            "errors": list(source_diag.errors) if source_diag else [],
        }

    return {
        "schema_version": PIPELINE_REPORT_SCHEMA_VERSION,
        "generated_at": artifact["generated_at"],
        "status": status,
        "window": artifact["window"],
        "sources": sources,
        "totals": dict(artifact["stats"]),
        "messages": list(messages or []),
    }


def write_pipeline_report(
    artifact: dict[str, Any],
    *,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    messages: list[str] | None = None,
    status: str = "success",
    run_date: date | str | None = None,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    scrape_diagnostics: Mapping[str, SourceScrapeDiagnostics] | None = None,
) -> dict[str, Any]:
    """Validate and write ``pipeline_report.json``."""
    diagnostics = scrape_diagnostics
    if diagnostics is None and run_date is not None:
        diagnostics = load_daily_scrape_diagnostics(run_date, logs_dir=logs_dir)

    report = build_pipeline_report(
        artifact,
        messages=messages,
        status=status,
        scrape_diagnostics=diagnostics,
    )
    validate_pipeline_report(report)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    return report
