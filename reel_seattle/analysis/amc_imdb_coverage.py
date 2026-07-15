"""AMC IMDb coverage audit helpers (manual measurement only).

Does not mutate production artifacts. Designed for workflow_dispatch / offline fixtures.
Shared Movies request/source helpers live in ``amc_movies_client``.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.analysis.amc_movies_client import (
    STATUS_MALFORMED,
    STATUS_MISSING,
    STATUS_REQUEST_FAILED,
    STATUS_RESPONSE_INVALID,
    STATUS_VALID,
    MovieIdPlan,
    SourcePlan,
    assert_no_secret_leakage,
    extract_movie_plans_from_scrape_log,
    extract_movie_plans_from_showtimes_current,
    find_latest_amc_scrape_log,
    load_offline_fixture_fetch,
    make_requests_fetch_movie,
    normalize_title_for_grouping,
    resolve_source_plan,
    run_movie_lookups as _run_movie_lookups,
    sanitize_error_message,
)
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE

SCHEMA_VERSION = "1.0.0"

IMDB_STATUS_VALID = STATUS_VALID
IMDB_STATUS_MISSING = STATUS_MISSING
IMDB_STATUS_MALFORMED = STATUS_MALFORMED
IMDB_STATUS_REQUEST_FAILED = STATUS_REQUEST_FAILED
IMDB_STATUS_RESPONSE_INVALID = STATUS_RESPONSE_INVALID

PARSED_MOVIE_STATUSES = frozenset(
    {IMDB_STATUS_VALID, IMDB_STATUS_MISSING, IMDB_STATUS_MALFORMED}
)

IMDB_ID_RE = re.compile(r"^tt\d+$")


@dataclass
class AuditRow:
    amc_movie_id: str
    source_title: str | None
    amc_movie_name: str | None
    imdb_id_raw: str | None
    imdb_id: str | None
    imdb_status: str
    preferred_media_type: str | None
    http_status: int | None
    error: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalize_imdb_id(raw: object) -> tuple[str | None, str, str | None]:
    """Return ``(normalized_id, status, raw_string_or_none)``."""
    if raw is None:
        return None, IMDB_STATUS_MISSING, None
    if isinstance(raw, bool):
        return None, IMDB_STATUS_MALFORMED, str(raw)
    if isinstance(raw, (int, float)):
        return None, IMDB_STATUS_MALFORMED, str(raw)
    if not isinstance(raw, str):
        return None, IMDB_STATUS_MALFORMED, str(raw)

    trimmed = raw.strip()
    if not trimmed:
        return None, IMDB_STATUS_MISSING, ""

    candidate = trimmed
    if candidate[:2].casefold() == "tt":
        candidate = "tt" + candidate[2:]

    if IMDB_ID_RE.fullmatch(candidate):
        return candidate, IMDB_STATUS_VALID, trimmed
    return None, IMDB_STATUS_MALFORMED, trimmed


def classify_movie_lookup(
    plan: MovieIdPlan,
    *,
    http_status: int | None,
    body: Mapping[str, Any] | None,
    error: str | None = None,
) -> AuditRow:
    """Build one sanitized audit row from a Movies API lookup result."""
    if http_status is None:
        return AuditRow(
            amc_movie_id=plan.amc_movie_id,
            source_title=plan.source_title,
            amc_movie_name=None,
            imdb_id_raw=None,
            imdb_id=None,
            imdb_status=IMDB_STATUS_REQUEST_FAILED,
            preferred_media_type=None,
            http_status=None,
            error=sanitize_error_message(error or "request failed"),
        )

    if http_status != 200:
        return AuditRow(
            amc_movie_id=plan.amc_movie_id,
            source_title=plan.source_title,
            amc_movie_name=None,
            imdb_id_raw=None,
            imdb_id=None,
            imdb_status=IMDB_STATUS_REQUEST_FAILED,
            preferred_media_type=None,
            http_status=http_status,
            error=sanitize_error_message(error or f"HTTP {http_status}"),
        )

    if not isinstance(body, Mapping):
        return AuditRow(
            amc_movie_id=plan.amc_movie_id,
            source_title=plan.source_title,
            amc_movie_name=None,
            imdb_id_raw=None,
            imdb_id=None,
            imdb_status=IMDB_STATUS_RESPONSE_INVALID,
            preferred_media_type=None,
            http_status=http_status,
            error=sanitize_error_message(error or "response is not a JSON object"),
        )

    name = body.get("name")
    movie_name = str(name).strip() if name not in (None, "") else None
    media = body.get("preferredMediaType")
    preferred = str(media).strip() if media not in (None, "") else None

    if "imdbId" not in body:
        looks_like_movie = "id" in body or "name" in body
        status = IMDB_STATUS_MISSING if looks_like_movie else IMDB_STATUS_RESPONSE_INVALID
        return AuditRow(
            amc_movie_id=plan.amc_movie_id,
            source_title=plan.source_title,
            amc_movie_name=movie_name,
            imdb_id_raw=None,
            imdb_id=None,
            imdb_status=status,
            preferred_media_type=preferred,
            http_status=http_status,
            error=None if status == IMDB_STATUS_MISSING else "movie payload missing imdbId key",
        )

    imdb_normalized, imdb_status, imdb_raw = normalize_imdb_id(body.get("imdbId"))
    return AuditRow(
        amc_movie_id=plan.amc_movie_id,
        source_title=plan.source_title,
        amc_movie_name=movie_name,
        imdb_id_raw=imdb_raw,
        imdb_id=imdb_normalized,
        imdb_status=imdb_status,
        preferred_media_type=preferred,
        http_status=http_status,
        error=None,
    )


def analyze_relationships(rows: Sequence[AuditRow]) -> dict[str, list[dict[str, Any]]]:
    """Compute audit-only relationship groups (not merge decisions)."""
    by_imdb: dict[str, list[AuditRow]] = defaultdict(list)
    by_title: dict[str, list[AuditRow]] = defaultdict(list)

    for row in rows:
        if row.imdb_status == IMDB_STATUS_VALID and row.imdb_id:
            by_imdb[row.imdb_id].append(row)
            title_key = normalize_title_for_grouping(row.amc_movie_name or row.source_title)
            if title_key:
                by_title[title_key].append(row)

    shared_imdb: list[dict[str, Any]] = []
    for imdb_id, group in sorted(by_imdb.items()):
        ids = sorted({row.amc_movie_id for row in group})
        if len(ids) <= 1:
            continue
        shared_imdb.append(
            {
                "imdb_id": imdb_id,
                "amc_movie_ids": ids,
                "amc_movie_names": sorted(
                    {row.amc_movie_name for row in group if row.amc_movie_name}
                ),
                "source_titles": sorted(
                    {row.source_title for row in group if row.source_title}
                ),
            }
        )

    multi_imdb_titles: list[dict[str, Any]] = []
    for title_key, group in sorted(by_title.items()):
        imdb_ids = sorted({row.imdb_id for row in group if row.imdb_id})
        if len(imdb_ids) <= 1:
            continue
        multi_imdb_titles.append(
            {
                "title_key": title_key,
                "imdb_ids": imdb_ids,
                "amc_movie_ids": sorted({row.amc_movie_id for row in group}),
                "display_titles": sorted(
                    {
                        (row.amc_movie_name or row.source_title or "")
                        for row in group
                        if (row.amc_movie_name or row.source_title)
                    }
                ),
            }
        )

    return {
        "imdb_ids_used_by_multiple_amc_movie_ids": shared_imdb,
        "titles_with_multiple_imdb_ids": multi_imdb_titles,
    }


def build_report(
    *,
    source: SourcePlan,
    rows: Sequence[AuditRow],
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Assemble the sanitized machine-readable audit report."""
    pacific = ZoneInfo(DEFAULT_TIMEZONE)
    stamp = generated_at or datetime.now(pacific).isoformat(timespec="seconds")

    parsed_ok = [row for row in rows if row.imdb_status in PARSED_MOVIE_STATUSES]
    request_failed = sum(1 for row in rows if row.imdb_status == IMDB_STATUS_REQUEST_FAILED)
    response_invalid = sum(1 for row in rows if row.imdb_status == IMDB_STATUS_RESPONSE_INVALID)

    valid = sum(1 for row in rows if row.imdb_status == IMDB_STATUS_VALID)
    missing = sum(1 for row in rows if row.imdb_status == IMDB_STATUS_MISSING)
    malformed = sum(1 for row in rows if row.imdb_status == IMDB_STATUS_MALFORMED)

    parsed_count = len(parsed_ok)
    coverage_of_parsed = round((100.0 * valid / parsed_count), 2) if parsed_count else 0.0
    distinct = source.distinct_count
    coverage_of_distinct = round((100.0 * valid / distinct), 2) if distinct else 0.0

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source_artifact": source.source_artifact,
        "source_artifact_date": source.source_artifact_date,
        "raw_amc_records": source.raw_amc_records,
        "distinct_amc_movie_ids": distinct,
        "requests_attempted": len(rows),
        "requests_succeeded": parsed_count,
        "requests_failed": request_failed + response_invalid,
        "coverage": {
            "valid_imdb_id": valid,
            "missing_imdb_id": missing,
            "malformed_imdb_id": malformed,
            "request_failed": request_failed,
            "response_invalid": response_invalid,
            "coverage_percent": coverage_of_parsed,
            "coverage_percent_of_parsed_movies": coverage_of_parsed,
            "coverage_percent_of_distinct_ids": coverage_of_distinct,
        },
        "relationships": analyze_relationships(rows),
        "rows": [row.to_dict() for row in rows],
    }
    assert_no_secret_leakage(report)
    return report


def write_audit_outputs(report: Mapping[str, Any], output_dir: Path | str) -> dict[str, Path]:
    """Write JSON, CSV, and Markdown summary files."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    json_path = out / "amc_imdb_coverage_audit.json"
    csv_path = out / "amc_imdb_coverage_audit.csv"
    md_path = out / "amc_imdb_coverage_summary.md"

    assert_no_secret_leakage(report)
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    fieldnames = [
        "amc_movie_id",
        "source_title",
        "amc_movie_name",
        "imdb_id",
        "imdb_id_raw",
        "imdb_status",
        "preferred_media_type",
        "http_status",
        "error",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in report.get("rows", []):
            writer.writerow({key: row.get(key) for key in fieldnames})

    md_path.write_text(render_markdown_summary(report), encoding="utf-8")
    return {"json": json_path, "csv": csv_path, "markdown": md_path}


def render_markdown_summary(report: Mapping[str, Any]) -> str:
    """Human-readable markdown summary."""
    coverage = report.get("coverage") or {}
    relationships = report.get("relationships") or {}
    shared = relationships.get("imdb_ids_used_by_multiple_amc_movie_ids") or []
    multi = relationships.get("titles_with_multiple_imdb_ids") or []

    lines = [
        "# AMC IMDb Coverage Audit",
        "",
        f"- Generated: `{report.get('generated_at')}`",
        f"- Source artifact: `{report.get('source_artifact')}`",
        f"- Source artifact date: `{report.get('source_artifact_date')}`",
        f"- Raw AMC records examined: **{report.get('raw_amc_records')}**",
        f"- Distinct AMC movie IDs: **{report.get('distinct_amc_movie_ids')}**",
        f"- Requests attempted: **{report.get('requests_attempted')}**",
        f"- Requests succeeded (HTTP 200 parsed): **{report.get('requests_succeeded')}**",
        f"- Requests failed: **{report.get('requests_failed')}**",
        "",
        "## Coverage",
        "",
        f"- Valid IMDb IDs: **{coverage.get('valid_imdb_id')}**",
        f"- Missing IMDb IDs: **{coverage.get('missing_imdb_id')}**",
        f"- Malformed IMDb IDs: **{coverage.get('malformed_imdb_id')}**",
        f"- Request failures: **{coverage.get('request_failed')}**",
        f"- Invalid responses: **{coverage.get('response_invalid')}**",
        f"- Coverage of parsed movie responses: **{coverage.get('coverage_percent_of_parsed_movies')}%**",
        f"- Coverage of distinct AMC IDs: **{coverage.get('coverage_percent_of_distinct_ids')}%**",
        "",
        "Coverage percentages count **valid** IMDb IDs only. Request failures are separate from missing IDs.",
        "",
        "## Relationships",
        "",
        f"- IMDb IDs used by multiple AMC movie IDs: **{len(shared)}**",
        f"- Titles associated with multiple IMDb IDs: **{len(multi)}**",
        "",
        "Shared IMDb IDs are **not** automatically errors; AMC may use separate movie records for formats, events, or presentations.",
        "",
        "## Limitations",
        "",
        "- This audit does not verify IDs against IMDb or TMDB.",
        "- Results are measurement-only and are not written into production showtimes or history.",
        "- Sensory/event AMC records are not forced to inherit another record's IMDb ID.",
        "",
    ]

    if shared:
        lines.extend(["### Shared IMDb examples", ""])
        for item in shared[:20]:
            lines.append(
                f"- `{item.get('imdb_id')}` → AMC ids "
                f"{', '.join(f'`{x}`' for x in item.get('amc_movie_ids') or [])}"
            )
        lines.append("")

    if multi:
        lines.extend(["### Title collisions examples", ""])
        for item in multi[:20]:
            lines.append(
                f"- `{item.get('title_key')}` → IMDb "
                f"{', '.join(f'`{x}`' for x in item.get('imdb_ids') or [])}"
            )
        lines.append("")

    failed = [
        row
        for row in report.get("rows", [])
        if row.get("imdb_status")
        in {IMDB_STATUS_REQUEST_FAILED, IMDB_STATUS_RESPONSE_INVALID}
    ]
    if failed:
        lines.extend(["## Notable failures", ""])
        for row in failed[:30]:
            lines.append(
                f"- AMC `{row.get('amc_movie_id')}` HTTP {row.get('http_status')}: {row.get('error')}"
            )
        lines.append("")

    text = "\n".join(lines)
    assert_no_secret_leakage({"markdown": text})
    return text


def run_movie_lookups(
    plans: Sequence[MovieIdPlan],
    fetch_movie,
    *,
    sleep_seconds: float = 1.0,
) -> list[AuditRow]:
    """IMDb-audit wrapper around shared lookup runner."""
    return _run_movie_lookups(
        plans,
        fetch_movie,
        classify_movie_lookup,
        sleep_seconds=sleep_seconds,
    )


__all__ = [
    "AuditRow",
    "IMDB_STATUS_MALFORMED",
    "IMDB_STATUS_MISSING",
    "IMDB_STATUS_REQUEST_FAILED",
    "IMDB_STATUS_RESPONSE_INVALID",
    "IMDB_STATUS_VALID",
    "MovieIdPlan",
    "PARSED_MOVIE_STATUSES",
    "SCHEMA_VERSION",
    "SourcePlan",
    "analyze_relationships",
    "assert_no_secret_leakage",
    "build_report",
    "classify_movie_lookup",
    "extract_movie_plans_from_scrape_log",
    "extract_movie_plans_from_showtimes_current",
    "find_latest_amc_scrape_log",
    "load_offline_fixture_fetch",
    "make_requests_fetch_movie",
    "normalize_imdb_id",
    "normalize_title_for_grouping",
    "resolve_source_plan",
    "run_movie_lookups",
    "sanitize_error_message",
    "write_audit_outputs",
]
