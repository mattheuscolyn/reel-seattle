"""Shared secret-safe AMC Movies API helpers for manual audits.

Not used by the production scrape path. Supports offline fixtures and live lookups.
"""

from __future__ import annotations

import json
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

AMC_MOVIES_URL_TEMPLATE = "https://api.amctheatres.com/v2/movies/{movie_id}"

STATUS_VALID = "valid"
STATUS_MISSING = "missing"
STATUS_MALFORMED = "malformed"
STATUS_REQUEST_FAILED = "request_failed"
STATUS_RESPONSE_INVALID = "response_invalid"

SECRET_MARKERS = (
    "AMC_API_KEY",
    "X-AMC-Vendor-Key",
    "Authorization",
    "Bearer ",
)

FetchMovieFn = Callable[[str], tuple[int | None, Mapping[str, Any] | None, str | None]]
ClassifyLookupFn = Callable[..., Any]


@dataclass(frozen=True)
class MovieIdPlan:
    """One distinct AMC movie ID to look up."""

    amc_movie_id: str
    source_title: str | None
    occurrence_count: int
    parent_display_title: str | None = None
    screening_variant_type: str | None = None
    is_special_screening: bool | None = None


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


def normalize_title_for_grouping(title: str | None) -> str:
    """Restrained title key for audit-only grouping (never for merges)."""
    if not title:
        return ""
    return re.sub(r"\s+", " ", str(title).strip().casefold())


def _enrich_from_title(title: str | None) -> dict[str, Any]:
    """Compute optional Reel Seattle identity fields from a title when useful."""
    text = (title or "").strip()
    if not text:
        return {
            "parent_display_title": None,
            "screening_variant_type": None,
            "is_special_screening": None,
        }
    try:
        from reel_seattle.analysis.film_identity import (
            classify_screening_variant_type,
            infer_parent_display_title,
            is_likely_screening_variant,
        )

        parent = infer_parent_display_title(text) or None
        variant = classify_screening_variant_type(text)
        return {
            "parent_display_title": parent,
            "screening_variant_type": variant,
            "is_special_screening": bool(is_likely_screening_variant(text)),
        }
    except Exception:  # noqa: BLE001 - enrichment is optional
        return {
            "parent_display_title": None,
            "screening_variant_type": None,
            "is_special_screening": None,
        }


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

    plans_list: list[MovieIdPlan] = []
    for movie_id, titles in sorted(grouped.items(), key=lambda item: item[0]):
        source_title = next((t for t in titles if t), None)
        enrich = _enrich_from_title(source_title)
        plans_list.append(
            MovieIdPlan(
                amc_movie_id=movie_id,
                source_title=source_title,
                occurrence_count=len(titles),
                **enrich,
            )
        )

    generated = payload.get("generated_at")
    artifact_date = None
    if isinstance(generated, str) and len(generated) >= 10:
        artifact_date = generated[:10]

    return SourcePlan(
        source_artifact=source_label,
        source_artifact_date=artifact_date,
        raw_amc_records=raw_count,
        plans=tuple(plans_list),
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

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
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
        grouped[movie_id].append(showtime)

    plans_list: list[MovieIdPlan] = []
    for movie_id, rows in sorted(grouped.items(), key=lambda item: item[0]):
        source_title = None
        parent = None
        variant = None
        is_special = None
        for row in rows:
            title = str(row.get("film_title") or row.get("source_title") or "").strip()
            if title and not source_title:
                source_title = title
            if parent is None and row.get("parent_display_title"):
                parent = str(row.get("parent_display_title")).strip() or None
            if variant is None and row.get("screening_variant_type"):
                variant = str(row.get("screening_variant_type")).strip() or None
            if is_special is None and row.get("is_special_screening") is not None:
                is_special = bool(row.get("is_special_screening"))
        if parent is None or variant is None or is_special is None:
            enrich = _enrich_from_title(source_title)
            parent = parent or enrich["parent_display_title"]
            variant = variant or enrich["screening_variant_type"]
            if is_special is None:
                is_special = enrich["is_special_screening"]
        plans_list.append(
            MovieIdPlan(
                amc_movie_id=movie_id,
                source_title=source_title,
                occurrence_count=len(rows),
                parent_display_title=parent,
                screening_variant_type=variant,
                is_special_screening=is_special,
            )
        )

    generated = payload.get("generated_at")
    artifact_date = None
    if isinstance(generated, str) and len(generated) >= 10:
        artifact_date = generated[:10]

    return SourcePlan(
        source_artifact=source_label,
        source_artifact_date=artifact_date,
        raw_amc_records=raw_count,
        plans=plans_list and tuple(plans_list) or tuple(),
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


def truncate_text(value: object | None, *, limit: int = 240) -> str | None:
    """Truncate long text/URL fields for human-readable outputs."""
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


def run_movie_lookups(
    plans: Sequence[MovieIdPlan],
    fetch_movie: FetchMovieFn,
    classify: ClassifyLookupFn,
    *,
    sleep_seconds: float = 1.0,
) -> list[Any]:
    """Lookup each plan; never aborts the batch on one failure."""
    rows: list[Any] = []
    for index, plan in enumerate(plans):
        try:
            http_status, body, error = fetch_movie(plan.amc_movie_id)
        except Exception as exc:  # noqa: BLE001 - audit must continue
            rows.append(
                classify(plan, http_status=None, body=None, error=str(exc))
            )
        else:
            rows.append(
                classify(plan, http_status=http_status, body=body, error=error)
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
    """Build a fetch callable using a requests session with AMC headers already set."""

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
