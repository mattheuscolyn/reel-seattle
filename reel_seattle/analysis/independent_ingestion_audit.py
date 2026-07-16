"""Read-only inventory of SIFF/Beacon scrape-log behavior for P-16A.

Does not modify production scrapers, history, or public artifacts.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, Mapping, Sequence

SCHEMA_VERSION = "1.0.0"
SOURCES = ("siff", "beacon")


class IndependentIngestionAuditError(ValueError):
    """Raised when audit inputs cannot be processed."""


def list_source_scrape_logs(
    logs_dir: Path | str,
    source: str,
    *,
    max_logs: int = 7,
) -> list[Path]:
    """Return newest ``*_ {source}.json`` paths, limited to *max_logs*."""
    directory = Path(logs_dir)
    if not directory.is_dir():
        raise IndependentIngestionAuditError(f"logs directory not found: {directory}")
    if source not in SOURCES:
        raise IndependentIngestionAuditError(f"unsupported source: {source}")
    candidates = sorted(directory.glob(f"*_{source}.json"))
    if not candidates:
        raise IndependentIngestionAuditError(f"no {source} scrape logs under {directory}")
    return candidates[-max(1, max_logs) :]


def _load_log(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise IndependentIngestionAuditError(f"scrape log is not an object: {path}")
    records = payload.get("records")
    if records is None:
        records = []
    if not isinstance(records, list):
        raise IndependentIngestionAuditError(f"records must be an array: {path}")
    return {
        "path": path.as_posix(),
        "name": path.name,
        "generated_at": payload.get("generated_at"),
        "source": payload.get("source"),
        "warnings": list(payload.get("warnings") or []),
        "errors": list(payload.get("errors") or []),
        "stats": dict(payload.get("stats") or {}),
        "records": [row for row in records if isinstance(row, Mapping)],
        "malformed_records": sum(1 for row in records if not isinstance(row, Mapping)),
    }


def summarize_source_logs(logs: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Aggregate identity and emptiness metrics for one source's logs."""
    total_records = 0
    with_program_url = 0
    with_showtime_id = 0
    with_film_id_attr = 0
    empty_days = 0
    empty_days_without_warnings = 0
    theaters: Counter[str] = Counter()
    titles: Counter[str] = Counter()
    program_urls: set[str] = set()
    showtime_ids: set[str] = set()
    files: list[dict[str, Any]] = []

    for log in sorted(logs, key=lambda item: str(item.get("name") or "")):
        records = list(log.get("records") or [])
        warnings = list(log.get("warnings") or [])
        total_records += len(records)
        if not records:
            empty_days += 1
            if not warnings:
                empty_days_without_warnings += 1

        day_theaters: Counter[str] = Counter()
        for row in records:
            theater = str(row.get("theater_name_raw") or "").strip() or "(blank)"
            theaters[theater] += 1
            day_theaters[theater] += 1
            title = str(row.get("title_raw") or "")
            if title:
                titles[title] += 1
            url = row.get("source_film_url")
            if url not in (None, ""):
                with_program_url += 1
                program_urls.add(str(url))
            sid = row.get("source_showtime_id")
            if sid not in (None, ""):
                with_showtime_id += 1
                showtime_ids.add(str(sid))
            attrs = row.get("attributes")
            if isinstance(attrs, Mapping) and (
                attrs.get("movie_id") or attrs.get("source_film_id") or attrs.get("movieId")
            ):
                with_film_id_attr += 1

        files.append(
            {
                "name": log.get("name"),
                "records": len(records),
                "warnings": len(warnings),
                "errors": len(log.get("errors") or []),
                "theaters": dict(sorted(day_theaters.items())),
                "malformed_records": log.get("malformed_records", 0),
            }
        )

    return {
        "log_count": len(logs),
        "files": files,
        "raw_showtime_records": total_records,
        "empty_log_days": empty_days,
        "empty_log_days_without_warnings": empty_days_without_warnings,
        "records_with_source_film_url": with_program_url,
        "records_with_source_showtime_id": with_showtime_id,
        "records_with_source_film_id_attributes": with_film_id_attr,
        "distinct_source_film_urls": len(program_urls),
        "distinct_source_showtime_ids": len(showtime_ids),
        "distinct_theaters": len(theaters),
        "theater_counts": dict(theaters.most_common()),
        "distinct_titles": len(titles),
        "title_samples": [title for title, _ in titles.most_common(20)],
        "identity_notes": {
            "source_showtime_id_populated": with_showtime_id > 0,
            "source_program_id_in_attributes": with_film_id_attr > 0,
            "source_film_url_present_in_logs": with_program_url > 0,
        },
    }


def build_independent_ingestion_audit(
    *,
    logs_dir: Path | str,
    max_logs: int = 7,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build a deterministic inventory report from committed scrape logs."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from reel_seattle.normalize.dates import DEFAULT_TIMEZONE

    stamp = generated_at or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")
    by_source: dict[str, Any] = {}
    for source in SOURCES:
        paths = list_source_scrape_logs(logs_dir, source, max_logs=max_logs)
        loaded = [_load_log(path) for path in paths]
        by_source[source] = summarize_source_logs(loaded)

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "audit_kind": "independent_theater_ingestion_inventory",
        "sources": by_source,
        "findings": {
            "both_lack_source_showtime_ids_in_recent_logs": all(
                not by_source[source]["identity_notes"]["source_showtime_id_populated"]
                for source in SOURCES
            ),
            "both_lack_source_film_id_attributes_in_recent_logs": all(
                not by_source[source]["identity_notes"]["source_program_id_in_attributes"]
                for source in SOURCES
            ),
            "siff_retains_source_film_url_in_logs": by_source["siff"]["identity_notes"][
                "source_film_url_present_in_logs"
            ],
            "beacon_empty_days_without_warnings": by_source["beacon"][
                "empty_log_days_without_warnings"
            ],
        },
        "documentation": "docs/independent-theater-ingestion-audit.md",
    }


def write_audit_json(report: Mapping[str, Any], output_path: Path | str) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
