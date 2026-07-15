"""AMC IMDb coverage audit helpers (manual measurement only).

Does not mutate production artifacts. Designed for workflow_dispatch / offline fixtures.
"""

from __future__ import annotations

import csv
import json
import re
import time
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.normalize.dates import DEFAULT_TIMEZONE

SCHEMA_VERSION = "1.0.0"
AMC_MOVIES_URL_TEMPLATE = "https://api.amctheatres.com/v2/movies/{movie_id}"

IMDB_STATUS_VALID = "valid"
IMDB_STATUS_MISSING = "missing"
IMDB_STATUS_MALFORMED = "malformed"
IMDB_STATUS_REQUEST_FAILED = "request_failed"
IMDB_STATUS_RESPONSE_INVALID = "response_invalid"

PARSED_MOVIE_STATUSES = frozenset(
    {IMDB_STATUS_VALID, IMDB_STATUS_MISSING, IMDB_STATUS_MALFORMED}
)

IMDB_ID_RE = re.compile(r"^tt\d+$")
SECRET_MARKERS = (
    "AMC_API_KEY",
    "X-AMC-Vendor-Key",
    "Authorization",
    "Bearer ",
)


@dataclass(frozen=True)
class MovieIdPlan:
    """One distinct AMC movie ID to look up."""

    amc_movie_id: str
    source_title: str | None
    occurrence_count: int


@dataclass(frozen=True)
class SourcePlan:
    """Extraction result from a committed artifact."""

    source_artifact: str
    source_artifact_date: str | None
    raw_amc_records: int
    plans: tuple[MovieIdPlan, ...]

    @property
    def distinct_count(self) -> int:
        return len(self.plans)


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


def normalize_title_for_grouping(title: str | None) -> str:
    """Restrained title key for audit-only grouping (never for merges)."""
    if not title:
        return ""
    return re.sub(r"\s+", " ", str(title).strip().casefold())


def normalize_imdb_id(raw: object) -> tuple[str | None, str, str | None]:
    """Return ``(normalized_id, status, raw_string_or_none)``.

    Numeric-only values are malformed; do not invent a ``tt`` prefix.
    """
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


def _movie_id_from_scrape_record(record: Mapping[str, Any]) -> str | None:
    attrs = record.get("attributes")
    if not isinstance(attrs, dict):
        return None
    value = attrs.get("movie_id")
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def extract_movie_plans_from_scrape_log(
    payload: Mapping[str, Any],
    *,
    source_label: str,
) -> SourcePlan:
    """Extract distinct AMC movie IDs from a daily scrape-log envelope."""
    source_tag = payload.get("source")
    if source_tag not in (None, "") and str(source_tag).casefold() != "amc":
        raise ValueError(f"scrape log source is not amc: {source_tag!r}")

    records = payload.get("records")
    if not isinstance(records, list):
        raise ValueError("scrape log missing records array")

    grouped: dict[str, list[str]] = defaultdict(list)
    raw_count = 0
    for record in records:
        if not isinstance(record, dict):
            continue
        raw_count += 1
        movie_id = _movie_id_from_scrape_record(record)
        if not movie_id:
            continue
        title = str(record.get("title_raw") or "").strip()
        grouped[movie_id].append(title)

    plans = tuple(
        MovieIdPlan(
            amc_movie_id=movie_id,
            source_title=next((t for t in titles if t), None),
            occurrence_count=len(titles),
        )
        for movie_id, titles in sorted(grouped.items(), key=lambda item: item[0])
    )

    generated = payload.get("generated_at")
    artifact_date = None
    if isinstance(generated, str) and len(generated) >= 10:
        artifact_date = generated[:10]

    return SourcePlan(
        source_artifact=source_label,
        source_artifact_date=artifact_date,
        raw_amc_records=raw_count,
        plans=plans,
    )


def extract_movie_plans_from_showtimes_current(
    payload: Mapping[str, Any],
    *,
    source_label: str,
) -> SourcePlan:
    """Fallback: distinct AMC ``source_film_id`` values from showtimes_current.json."""
    showtimes = payload.get("showtimes")
    if not isinstance(showtimes, list):
        raise ValueError("showtimes_current missing showtimes array")

    grouped: dict[str, list[str]] = defaultdict(list)
    raw_count = 0
    for showtime in showtimes:
        if not isinstance(showtime, dict):
            continue
        if str(showtime.get("source") or "").casefold() != "amc":
            continue
        raw_count += 1
        movie_id = str(showtime.get("source_film_id") or "").strip()
        if not movie_id:
            continue
        title = str(showtime.get("film_title") or showtime.get("source_title") or "").strip()
        grouped[movie_id].append(title)

    plans = tuple(
        MovieIdPlan(
            amc_movie_id=movie_id,
            source_title=next((t for t in titles if t), None),
            occurrence_count=len(titles),
        )
        for movie_id, titles in sorted(grouped.items(), key=lambda item: item[0])
    )

    generated = payload.get("generated_at")
    artifact_date = None
    if isinstance(generated, str) and len(generated) >= 10:
        artifact_date = generated[:10]

    return SourcePlan(
        source_artifact=source_label,
        source_artifact_date=artifact_date,
        raw_amc_records=raw_count,
        plans=plans,
    )


def find_latest_amc_scrape_log(logs_dir: Path | str) -> Path | None:
    """Return newest ``YYYY-MM-DD_amc.json`` under *logs_dir*, if any."""
    directory = Path(logs_dir)
    if not directory.is_dir():
        return None
    candidates = sorted(directory.glob("*_amc.json"))
    return candidates[-1] if candidates else None


def _label_for_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def resolve_source_plan(
    *,
    source: str = "auto",
    logs_dir: Path | str = "data/daily_logs",
    showtimes_path: Path | str = "public/data/showtimes_current.json",
    repo_root: Path | str = ".",
) -> SourcePlan:
    """Load movie-ID plans from ``auto``, ``scrape-log``, ``showtimes-current``, or a path."""
    root = Path(repo_root)
    source = (source or "auto").strip()

    if source == "auto":
        latest = find_latest_amc_scrape_log(root / logs_dir)
        if latest is not None:
            payload = json.loads(latest.read_text(encoding="utf-8"))
            return extract_movie_plans_from_scrape_log(
                payload, source_label=_label_for_path(latest, root)
            )
        path = root / showtimes_path
        payload = json.loads(path.read_text(encoding="utf-8"))
        return extract_movie_plans_from_showtimes_current(
            payload, source_label=_label_for_path(path, root)
        )

    if source == "scrape-log":
        latest = find_latest_amc_scrape_log(root / logs_dir)
        if latest is None:
            raise FileNotFoundError(f"no AMC scrape logs found under {logs_dir}")
        payload = json.loads(latest.read_text(encoding="utf-8"))
        return extract_movie_plans_from_scrape_log(
            payload, source_label=_label_for_path(latest, root)
        )

    if source == "showtimes-current":
        path = root / showtimes_path
        payload = json.loads(path.read_text(encoding="utf-8"))
        return extract_movie_plans_from_showtimes_current(
            payload, source_label=_label_for_path(path, root)
        )

    path = Path(source)
    if not path.is_file():
        path = root / source
    if not path.is_file():
        raise FileNotFoundError(f"source artifact not found: {source}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    rel = _label_for_path(path, root)
    if "records" in payload:
        return extract_movie_plans_from_scrape_log(payload, source_label=rel)
    if "showtimes" in payload:
        return extract_movie_plans_from_showtimes_current(payload, source_label=rel)
    raise ValueError(f"unrecognized source artifact shape: {rel}")


def sanitize_error_message(message: str | None) -> str | None:
    """Strip potential secret material from error strings."""
    if message is None:
        return None
    text = str(message)
    lowered = text.casefold()
    for marker in SECRET_MARKERS:
        if marker.casefold() in lowered:
            return "request error (details redacted)"
    if "vendor-key" in lowered or "api_key=" in lowered or "apikey" in lowered:
        return "request error (details redacted)"
    return text[:300]


def assert_no_secret_leakage(payload: object) -> None:
    """Raise if serialized output appears to contain credential material."""
    blob = json.dumps(payload, ensure_ascii=False)
    lowered = blob.casefold()
    for marker in ("x-amc-vendor-key", "amc_api_key=", "authorization:"):
        if marker in lowered:
            raise ValueError(f"secret-like marker present in audit output: {marker}")


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


FetchMovieFn = Callable[[str], tuple[int | None, Mapping[str, Any] | None, str | None]]


def run_movie_lookups(
    plans: Sequence[MovieIdPlan],
    fetch_movie: FetchMovieFn,
    *,
    sleep_seconds: float = 1.0,
) -> list[AuditRow]:
    """Lookup each plan through *fetch_movie*; never aborts the batch on one failure."""
    rows: list[AuditRow] = []
    for index, plan in enumerate(plans):
        try:
            http_status, body, error = fetch_movie(plan.amc_movie_id)
        except Exception as exc:  # noqa: BLE001 - audit must continue
            rows.append(
                classify_movie_lookup(
                    plan,
                    http_status=None,
                    body=None,
                    error=str(exc),
                )
            )
        else:
            rows.append(
                classify_movie_lookup(
                    plan,
                    http_status=http_status,
                    body=body,
                    error=error,
                )
            )
        if sleep_seconds and index + 1 < len(plans):
            time.sleep(sleep_seconds)
    return rows


def make_requests_fetch_movie(
    session: Any,
    *,
    timeout_seconds: float = 30.0,
    max_retries: int = 2,
) -> FetchMovieFn:
    """Build a fetch callable using a requests session with AMC headers already set.

    Retries only transient failures (timeouts, connection errors, HTTP 429/5xx).
    Does not retry permanent 4xx responses.
    """

    def fetch_movie(movie_id: str) -> tuple[int | None, Mapping[str, Any] | None, str | None]:
        url = AMC_MOVIES_URL_TEMPLATE.format(movie_id=movie_id)
        last_error: str | None = None
        attempts = max(1, max_retries + 1)

        for attempt in range(attempts):
            try:
                response = session.get(url, timeout=timeout_seconds)
            except Exception as exc:  # noqa: BLE001
                last_error = sanitize_error_message(str(exc))
                if attempt + 1 < attempts:
                    time.sleep(min(2.0, 0.5 * (attempt + 1)))
                    continue
                return None, None, last_error

            status = int(response.status_code)
            if status in {429, 500, 502, 503, 504} and attempt + 1 < attempts:
                time.sleep(min(2.0, 0.5 * (attempt + 1)))
                continue

            if status != 200:
                return status, None, f"HTTP {status}"

            try:
                payload = response.json()
            except Exception as exc:  # noqa: BLE001
                return status, None, sanitize_error_message(f"invalid JSON: {exc}")

            if not isinstance(payload, dict):
                return status, None, "response JSON was not an object"
            return status, payload, None

        return None, None, last_error or "request failed"

    return fetch_movie


def load_offline_fixture_fetch(fixtures_dir: Path | str) -> FetchMovieFn:
    """Load offline fixtures: ``{movie_id}.json`` or ``{movie_id}.http.json`` envelopes."""

    directory = Path(fixtures_dir)

    def fetch_movie(movie_id: str) -> tuple[int | None, Mapping[str, Any] | None, str | None]:
        envelope_path = directory / f"{movie_id}.http.json"
        body_path = directory / f"{movie_id}.json"
        if envelope_path.is_file():
            envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
            status = envelope.get("http_status")
            body = envelope.get("body")
            error = envelope.get("error")
            return (
                int(status) if status is not None else None,
                body if isinstance(body, dict) else None,
                error,
            )
        if body_path.is_file():
            body = json.loads(body_path.read_text(encoding="utf-8"))
            if not isinstance(body, dict):
                return 200, None, "fixture body is not an object"
            return 200, body, None
        return 404, None, "HTTP 404"

    return fetch_movie
