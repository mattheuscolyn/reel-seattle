"""Build and write the daily pipeline observability report."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from reel_seattle.source_freshness import KNOWN_SOURCES
from reel_seattle.validate import validate_pipeline_report

PIPELINE_REPORT_SCHEMA_VERSION = "1.0.0"
DEFAULT_OUTPUT_PATH = Path("public/data/pipeline_report.json")


def build_pipeline_report(
    artifact: dict[str, Any],
    *,
    messages: list[str] | None = None,
    status: str = "success",
) -> dict[str, Any]:
    """Build ``pipeline_report.json`` from a validated showtimes_current artifact."""
    sources: dict[str, Any] = {}
    for source in KNOWN_SOURCES:
        source_meta = artifact["sources"][source]
        sources[source] = {
            "status": source_meta["status"],
            "showtime_count": source_meta["showtime_count"],
            "film_count": source_meta["film_count"],
            "theater_count": source_meta["theater_count"],
            "last_successful_run": source_meta["last_successful_run"],
            "warnings": [],
            "errors": [],
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
) -> dict[str, Any]:
    """Validate and write ``pipeline_report.json``."""
    report = build_pipeline_report(artifact, messages=messages, status=status)
    validate_pipeline_report(report)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    return report
