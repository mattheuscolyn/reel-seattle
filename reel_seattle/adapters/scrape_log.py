"""Normalized raw JSON daily scrape logs for source adapters."""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from reel_seattle.adapters.amc import raw_showtime_to_legacy_row as amc_raw_to_legacy_row
from reel_seattle.adapters.base import FetchResult, RawShowtime
from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row as indie_raw_to_legacy_row
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE

SCRAPE_LOG_SCHEMA_VERSION = "1.0.0"
DEFAULT_DAILY_LOGS_DIR = Path("data/daily_logs")

PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)


class ScrapeLogError(ValueError):
    """Raised when a scrape daily log exists but cannot be parsed."""


def daily_log_path(run_date: date | str, source: str, *, logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR) -> Path:
    """Return ``data/daily_logs/YYYY-MM-DD_{source}.json``."""
    if isinstance(run_date, date):
        date_part = run_date.isoformat()
    else:
        date_part = str(run_date)
    return Path(logs_dir) / f"{date_part}_{source}.json"


def scrape_log_generated_at(reference: datetime | None = None) -> str:
    moment = reference or datetime.now(PACIFIC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=PACIFIC)
    else:
        moment = moment.astimezone(PACIFIC)
    return moment.isoformat(timespec="seconds")


def raw_showtime_to_record_dict(raw: RawShowtime) -> dict[str, Any]:
    """Serialize one RawShowtime to a JSON-safe dict."""
    payload = asdict(raw)
    for key, value in list(payload.items()):
        if isinstance(value, dict):
            payload[key] = {str(k): v for k, v in value.items()}
    return payload


def record_dict_to_raw_showtime(record: dict[str, Any]) -> RawShowtime:
    """Deserialize one JSON record dict into RawShowtime."""
    required = ("theater_name_raw", "date_raw", "time_raw", "title_raw")
    missing = [key for key in required if key not in record]
    if missing:
        raise ScrapeLogError(f"record missing required fields: {', '.join(missing)}")

    attributes = record.get("attributes")
    if attributes is not None and not isinstance(attributes, dict):
        raise ScrapeLogError("record.attributes must be an object when present")

    return RawShowtime(
        theater_name_raw=str(record["theater_name_raw"]),
        date_raw=str(record["date_raw"]),
        time_raw=str(record["time_raw"]),
        title_raw=str(record["title_raw"]),
        runtime_raw=_optional_str(record.get("runtime_raw")),
        poster_url_raw=_optional_str(record.get("poster_url_raw")),
        ticket_url_raw=_optional_str(record.get("ticket_url_raw")),
        canceled=_optional_bool(record.get("canceled")),
        almost_sold_out=_optional_bool(record.get("almost_sold_out")),
        format_raw=_optional_str(record.get("format_raw")),
        source_showtime_id=_optional_str(record.get("source_showtime_id")),
        source_film_url=_optional_str(record.get("source_film_url")),
        attributes=attributes,
    )


def build_scrape_log_artifact(source: str, result: FetchResult, *, generated_at: str | None = None) -> dict[str, Any]:
    """Build the normalized raw JSON envelope for one adapter fetch."""
    warnings = list(result.warnings)
    errors = list(result.errors)
    return {
        "schema_version": SCRAPE_LOG_SCHEMA_VERSION,
        "generated_at": generated_at or scrape_log_generated_at(),
        "source": source,
        "records": [raw_showtime_to_record_dict(record) for record in result.records],
        "stats": {
            "record_count": len(result.records),
            "warning_count": len(warnings),
            "error_count": len(errors),
            **{key: value for key, value in result.stats.items() if key not in {"record_count", "warning_count", "error_count"}},
        },
        "warnings": warnings,
        "errors": errors,
    }


def write_scrape_daily_log(
    output_path: Path | str,
    source: str,
    result: FetchResult,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Write one per-source normalized raw JSON daily log."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    artifact = build_scrape_log_artifact(source, result, generated_at=generated_at)
    path.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return artifact


def load_scrape_daily_log_payload(payload: Mapping[str, Any], *, label: str = "<payload>") -> FetchResult:
    """Load a normalized raw JSON daily log from an in-memory envelope."""
    if not isinstance(payload, dict):
        raise ScrapeLogError(f"expected JSON object in {label}")

    schema_version = payload.get("schema_version")
    if schema_version != SCRAPE_LOG_SCHEMA_VERSION:
        raise ScrapeLogError(
            f"unsupported schema_version {schema_version!r} in {label}; "
            f"expected {SCRAPE_LOG_SCHEMA_VERSION}"
        )

    source = payload.get("source")
    if not isinstance(source, str) or not source:
        raise ScrapeLogError(f"missing or invalid source in {label}")

    records_payload = payload.get("records")
    if not isinstance(records_payload, list):
        raise ScrapeLogError(f"records must be a list in {label}")

    records: list[RawShowtime] = []
    for index, record in enumerate(records_payload):
        if not isinstance(record, dict):
            raise ScrapeLogError(f"records[{index}] must be an object in {label}")
        try:
            records.append(record_dict_to_raw_showtime(record))
        except ScrapeLogError as exc:
            raise ScrapeLogError(f"records[{index}] in {label}: {exc}") from exc

    warnings = payload.get("warnings", [])
    errors = payload.get("errors", [])
    if not isinstance(warnings, list) or not isinstance(errors, list):
        raise ScrapeLogError(f"warnings/errors must be lists in {label}")

    stats_payload = payload.get("stats", {})
    if not isinstance(stats_payload, dict):
        raise ScrapeLogError(f"stats must be an object in {label}")

    stats = dict(stats_payload)
    stats.setdefault("record_count", len(records))
    stats.setdefault("warning_count", len(warnings))
    stats.setdefault("error_count", len(errors))

    return FetchResult(
        records=records,
        stats=stats,
        warnings=[str(item) for item in warnings],
        errors=[str(item) for item in errors],
    )


def load_scrape_daily_log(path: Path | str) -> FetchResult:
    """Load a normalized raw JSON daily log. Raises ScrapeLogError when malformed."""
    log_path = Path(path)
    try:
        payload = json.loads(log_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ScrapeLogError(f"invalid JSON in {log_path}: {exc}") from exc
    return load_scrape_daily_log_payload(payload, label=str(log_path))


def raw_showtimes_to_legacy_rows(source: str, records: list[RawShowtime]) -> list[dict[str, str]]:
    """Convert adapter records to legacy CSV row dicts for daily_processor.py."""
    if source == "amc":
        return [amc_raw_to_legacy_row(record) for record in records]
    if source in {"siff", "beacon", "nwff", "central_cinema"}:
        return [indie_raw_to_legacy_row(record) for record in records]
    raise ValueError(f"unsupported scrape source: {source}")


def _optional_str(value: object | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _optional_bool(value: object | None) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
    raise ScrapeLogError(f"expected boolean or null, got {value!r}")
