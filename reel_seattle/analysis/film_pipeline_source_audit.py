"""Read-only per-source film metadata audit for Reel Seattle.

This audit answers a different question from TMDB match coverage: did each source
provide the identity evidence Reel Seattle can reasonably collect before matching?
It works from normalized daily scrape logs and never mutates production artifacts.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.film_identity.eligibility import ELIGIBLE, classify_eligibility
from reel_seattle.film_identity.presentation import extract_match_title
from reel_seattle.normalize import DEFAULT_TIMEZONE, parse_runtime_minutes

SCHEMA_VERSION = "1.0.0"
SOURCES = (
    "amc",
    "siff",
    "beacon",
    "nwff",
    "central_cinema",
    "grand_illusion",
    "tasveer",
    "anderson_school",
    "stg",
    "majestic_bay",
)

# This is source capability, not desired product behavior. Some public listings
# simply do not publish original release year, so an empty year is not always a
# scraper regression.
RELEASE_YEAR_STRATEGY: dict[str, str] = {
    "amc": "source_catalog_join",
    "siff": "source_page_metadata",
    "beacon": "source_page_metadata",
    "nwff": "source_page_metadata",
    "central_cinema": "source_page_when_published",
    "grand_illusion": "source_page_when_published",
    "tasveer": "source_title_metadata",
    "anderson_school": "not_exposed_by_listing",
    "stg": "source_title_or_page_metadata",
    "majestic_bay": "not_exposed_by_listing",
}

_YEAR_MIN = 1888
_YEAR_MAX = 2100


class FilmPipelineSourceAuditError(ValueError):
    """Raised when an audit input is structurally invalid."""


def latest_source_log(logs_dir: Path | str, source: str) -> Path | None:
    """Return the newest committed daily JSON log for one source."""
    directory = Path(logs_dir)
    if not directory.is_dir():
        raise FilmPipelineSourceAuditError(f"logs directory not found: {directory}")
    paths = sorted(directory.glob(f"*_{source}.json"))
    return paths[-1] if paths else None


def _load_log(path: Path, expected_source: str) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise FilmPipelineSourceAuditError(f"scrape log is not an object: {path}")
    source = str(payload.get("source") or "")
    if source and source != expected_source:
        raise FilmPipelineSourceAuditError(
            f"scrape log source mismatch: expected {expected_source!r}, got {source!r}"
        )
    records = payload.get("records") or []
    if not isinstance(records, list):
        raise FilmPipelineSourceAuditError(f"records must be an array: {path}")
    return {
        "path": path.as_posix(),
        "generated_at": payload.get("generated_at"),
        "records": [row for row in records if isinstance(row, Mapping)],
        "malformed_record_count": sum(1 for row in records if not isinstance(row, Mapping)),
        "warnings": list(payload.get("warnings") or []),
        "errors": list(payload.get("errors") or []),
    }


def _opt_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _source_identity_key(row: Mapping[str, Any]) -> str:
    attrs = row.get("attributes") if isinstance(row.get("attributes"), Mapping) else {}
    for key in ("source_film_id", "source_program_id", "movie_id", "movieId"):
        value = _opt_text(attrs.get(key))
        if value:
            return f"id:{value}"
    url = _opt_text(row.get("source_film_url"))
    if url:
        return f"url:{url}"
    title = _opt_text(row.get("title_raw"))
    if title:
        return f"title:{title.casefold()}"
    return "missing-title"


def _release_year(row: Mapping[str, Any]) -> int | None:
    attrs = row.get("attributes") if isinstance(row.get("attributes"), Mapping) else {}
    for key in ("release_year", "year_raw"):
        value = attrs.get(key)
        if isinstance(value, bool) or value in (None, ""):
            continue
        text = str(value).strip()
        if not text.isdigit():
            continue
        year = int(text)
        if _YEAR_MIN <= year <= _YEAR_MAX:
            return year
    return None


def _runtime(row: Mapping[str, Any]) -> int | None:
    return parse_runtime_minutes(row.get("runtime_raw"))


def summarize_source_log(
    *,
    source: str,
    log: Mapping[str, Any],
) -> dict[str, Any]:
    """Summarize one source's latest daily log at source-film/program grain."""
    grouped: dict[str, list[Mapping[str, Any]]] = {}
    for row in log.get("records") or []:
        grouped.setdefault(_source_identity_key(row), []).append(row)

    identities: list[dict[str, Any]] = []
    for key, rows in sorted(grouped.items()):
        source_title = next(
            (_opt_text(row.get("title_raw")) for row in rows if _opt_text(row.get("title_raw"))),
            None,
        )
        attrs_rows = [
            row.get("attributes") if isinstance(row.get("attributes"), Mapping) else {}
            for row in rows
        ]
        adapter_identity_title = next(
            (
                _opt_text(attrs.get("identity_title"))
                for attrs in attrs_rows
                if _opt_text(attrs.get("identity_title"))
            ),
            None,
        )
        program_series = next(
            (
                _opt_text(attrs.get("program_series"))
                for attrs in attrs_rows
                if _opt_text(attrs.get("program_series"))
            ),
            None,
        )
        runtime = next((_runtime(row) for row in rows if _runtime(row) is not None), None)
        year = next((_release_year(row) for row in rows if _release_year(row) is not None), None)

        extraction = extract_match_title(source_title, source=source)
        matcher_title = extraction.base_title
        eligibility = classify_eligibility(source_title=source_title, source=source)
        adapter_cleanup = bool(
            adapter_identity_title
            and source_title
            and adapter_identity_title.casefold() != source_title.casefold()
        )
        matcher_cleanup = bool(
            matcher_title
            and source_title
            and matcher_title.casefold() != source_title.casefold()
        )

        identities.append(
            {
                "source_identity_key": key,
                "source_title": source_title,
                "adapter_identity_title": adapter_identity_title,
                "matcher_title": matcher_title,
                "program_series": program_series or extraction.program_series,
                "runtime_min": runtime,
                "release_year": year,
                "eligibility": eligibility.status,
                "entity_kind": eligibility.entity_kind,
                "adapter_cleanup": adapter_cleanup,
                "matcher_cleanup": matcher_cleanup,
                "normalization_rules": list(extraction.applied_rules),
            }
        )

    feature_rows = [
        row
        for row in identities
        if row["eligibility"] == ELIGIBLE and row["entity_kind"] == "feature_film"
    ]
    entity_counts = Counter(str(row["entity_kind"] or "unknown") for row in identities)
    release_strategy = RELEASE_YEAR_STRATEGY.get(source, "unknown")

    missing_title = [row for row in identities if not row["source_title"]]
    missing_runtime_features = [row for row in feature_rows if row["runtime_min"] is None]
    missing_year_features = [row for row in feature_rows if row["release_year"] is None]
    adapter_cleanup = [row for row in identities if row["adapter_cleanup"]]
    matcher_cleanup = [row for row in identities if row["matcher_cleanup"]]
    series_rows = [row for row in identities if row["program_series"]]

    return {
        "latest_log": log.get("path"),
        "generated_at": log.get("generated_at"),
        "record_count": len(log.get("records") or []),
        "malformed_record_count": int(log.get("malformed_record_count") or 0),
        "warning_count": len(log.get("warnings") or []),
        "error_count": len(log.get("errors") or []),
        "source_identity_count": len(identities),
        "eligible_feature_count": len(feature_rows),
        "title": {
            "with_title": len(identities) - len(missing_title),
            "missing": len(missing_title),
        },
        "runtime": {
            "eligible_features_with_runtime": len(feature_rows) - len(missing_runtime_features),
            "eligible_features_missing_runtime": len(missing_runtime_features),
            "missing_feature_samples": [
                row["source_title"] for row in missing_runtime_features[:10]
            ],
        },
        "release_year": {
            "strategy": release_strategy,
            "eligible_features_with_year": len(feature_rows) - len(missing_year_features),
            "eligible_features_missing_year": len(missing_year_features),
            "missing_feature_samples": [
                row["source_title"] for row in missing_year_features[:10]
            ],
        },
        "cleanup": {
            "adapter_cleaned_identity_count": len(adapter_cleanup),
            "matcher_cleaned_identity_count": len(matcher_cleanup),
            "adapter_cleanup_samples": [
                {
                    "source_title": row["source_title"],
                    "identity_title": row["adapter_identity_title"],
                }
                for row in adapter_cleanup[:10]
            ],
            "matcher_cleanup_samples": [
                {
                    "source_title": row["source_title"],
                    "matcher_title": row["matcher_title"],
                    "rules": row["normalization_rules"],
                }
                for row in matcher_cleanup[:10]
            ],
        },
        "series": {
            "identity_count": len(series_rows),
            "samples": [
                {
                    "source_title": row["source_title"],
                    "program_series": row["program_series"],
                }
                for row in series_rows[:10]
            ],
        },
        "entity_kind_counts": dict(sorted(entity_counts.items())),
        "identities": identities,
    }


def build_film_pipeline_source_audit(
    *,
    logs_dir: Path | str,
    sources: Sequence[str] = SOURCES,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build a deterministic source-metadata audit from each source's latest log."""
    stamp = generated_at or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")
    source_blocks: dict[str, Any] = {}
    missing_logs: list[str] = []

    for source in sources:
        if source not in SOURCES:
            raise FilmPipelineSourceAuditError(f"unsupported source: {source}")
        path = latest_source_log(logs_dir, source)
        if path is None:
            missing_logs.append(source)
            source_blocks[source] = {
                "status": "missing_log",
                "release_year": {"strategy": RELEASE_YEAR_STRATEGY.get(source, "unknown")},
            }
            continue
        block = summarize_source_log(source=source, log=_load_log(path, source))
        source_blocks[source] = {"status": "ok", **block}

    runtime_gaps = [
        source
        for source, block in source_blocks.items()
        if block.get("status") == "ok"
        and (block.get("runtime") or {}).get("eligible_features_missing_runtime", 0) > 0
    ]
    year_gaps = [
        source
        for source, block in source_blocks.items()
        if block.get("status") == "ok"
        and (block.get("release_year") or {}).get("eligible_features_missing_year", 0) > 0
        and (block.get("release_year") or {}).get("strategy")
        not in {"source_catalog_join", "not_exposed_by_listing"}
    ]
    source_year_limitations = [
        source
        for source in sources
        if RELEASE_YEAR_STRATEGY.get(source) == "not_exposed_by_listing"
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "audit_kind": "film_pipeline_source_metadata",
        "logs_dir": Path(logs_dir).as_posix(),
        "sources": source_blocks,
        "findings": {
            "missing_logs": missing_logs,
            "sources_with_feature_runtime_gaps": runtime_gaps,
            "sources_with_actionable_feature_year_gaps": year_gaps,
            "sources_where_listing_does_not_expose_release_year": source_year_limitations,
        },
    }


def write_audit_json(report: Mapping[str, Any], output_path: Path | str) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
