"""Production-compatible Central Cinema adapter (manual / non-scheduled).

Pipeline:
  HTTP (or fixtures) → prototype extraction → IndependentSourceResult v1.0.0
  → contract validation → contract-to-indie mapping → Option C scrape-log envelope

Used by the manual CLI and workflow_dispatch workflow only.
Daily scheduling, tracked daily logs, and restatement remain P-17E.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from reel_seattle.adapters.base import FetchResult, RawShowtime
from reel_seattle.adapters.scrape_log import (
    SCRAPE_LOG_SCHEMA_VERSION,
    load_scrape_daily_log_payload,
    raw_showtimes_to_legacy_rows,
    record_dict_to_raw_showtime,
    scrape_log_generated_at,
)
from reel_seattle.ingestion.central_cinema_mapping import (
    CENTRAL_THEATER_ID,
    CentralCinemaMappingError,
    CentralCinemaMappingResult,
    map_central_cinema_contract_to_indie,
    parse_checkout_url,
    serialize_central_cinema_mapping_log,
)
from reel_seattle.ingestion.independent_contract import (
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    IndependentContractError,
    assert_valid_independent_source_result,
    load_theater_ids_from_registry,
)
from reel_seattle.normalize import parse_time
from reel_seattle.prototypes.central_cinema import (
    FetchFn,
    FetchResponse,
    CentralCinemaPrototypeError,
    build_central_cinema_result,
    fixture_fetch_map,
)
from reel_seattle.source_identity import (
    source_film_id_from_raw,
    source_showtime_id_from_raw,
    source_title_from_raw,
)

SOURCE = "central_cinema"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)
USER_AGENT = (
    "ReelSeattle-CentralCinema-Adapter/0.1 "
    "(+https://github.com/mattheuscolyn/reel-seattle; read-only showtimes research)"
)
DEFAULT_SLEEP_SECONDS = 0.35
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_RETRIES = 2
WINDOW_DAYS_INCLUSIVE = 14
_SHOWING_ID_RE = re.compile(r"^\d+$")


class CentralCinemaAdapterError(ValueError):
    """Raised for programmer/structural invocation errors."""


class CentralCinemaLogValidationError(ValueError):
    """Raised when a production-shaped Central Cinema log fails validation."""


@dataclass
class CentralCinemaAdapterResult:
    """Production-compatible Central Cinema collection result."""

    records: list[RawShowtime]
    stats: dict[str, Any]
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    contract: dict[str, Any] = field(default_factory=dict)
    mapping: CentralCinemaMappingResult | None = None
    log_envelope: dict[str, Any] = field(default_factory=dict)
    restate_safe: bool = False
    requested_window: dict[str, str] = field(default_factory=dict)
    inspected_window: dict[str, Any] = field(default_factory=dict)

    def to_fetch_result(self) -> FetchResult:
        return FetchResult(
            records=list(self.records),
            stats=dict(self.stats),
            warnings=list(self.warnings),
            errors=list(self.errors),
        )


def default_central_cinema_window(*, now: datetime | None = None) -> tuple[date, date]:
    """Inclusive 14-day Pacific window: today .. today+13."""
    moment = now or datetime.now(PACIFIC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=PACIFIC)
    else:
        moment = moment.astimezone(PACIFIC)
    start = moment.date()
    end = start + timedelta(days=WINDOW_DAYS_INCLUSIVE - 1)
    return start, end


def production_fetch(
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    retries: int = DEFAULT_RETRIES,
) -> FetchResponse:
    """Live HTTP fetch with User-Agent, timeout, and transient retries."""
    import urllib.error
    import urllib.request

    last: FetchResponse | None = None
    for attempt in range(retries + 1):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                text = response.read().decode(charset, errors="replace")
                return FetchResponse(url=url, status_code=getattr(response, "status", 200), text=text)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace") if exc.fp else None
            last = FetchResponse(url=url, status_code=int(exc.code), text=body)
            if int(exc.code) not in {408, 429, 500, 502, 503, 504} or attempt >= retries:
                return last
        except Exception:  # noqa: BLE001 - adapter boundary
            last = FetchResponse(url=url, status_code=0, text=None)
            if attempt >= retries:
                return last
        time.sleep(min(1.0, 0.25 * (attempt + 1)))
    return last or FetchResponse(url=url, status_code=0, text=None)


def central_cinema_log_path(run_date: date | str, *, output_dir: Path | str) -> Path:
    """Return ``YYYY-MM-DD_central_cinema.json`` under an explicit output directory."""
    if isinstance(run_date, date):
        date_part = run_date.isoformat()
    else:
        date_part = str(run_date)
    return Path(output_dir) / f"{date_part}_{SOURCE}.json"


def write_central_cinema_scrape_log(
    output_path: Path | str,
    envelope: Mapping[str, Any],
) -> dict[str, Any]:
    """Write a deterministic Option C Central Cinema scrape-log envelope."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.loads(json.dumps(envelope))
    text = serialize_central_cinema_mapping_log(payload)
    path.write_text(text, encoding="utf-8")
    return payload


def validate_central_cinema_scrape_log(
    envelope: Mapping[str, Any],
    *,
    theater_ids: Iterable[str] | None = None,
) -> None:
    """Validate a production-shaped Central Option C scrape log."""
    if not isinstance(envelope, Mapping):
        raise CentralCinemaLogValidationError("log envelope must be an object")

    issues: list[str] = []
    if envelope.get("schema_version") != SCRAPE_LOG_SCHEMA_VERSION:
        issues.append(f"schema_version must be {SCRAPE_LOG_SCHEMA_VERSION!r}")
    if envelope.get("source") != SOURCE:
        issues.append("source must be 'central_cinema'")
    if not isinstance(envelope.get("generated_at"), str) or not envelope.get("generated_at"):
        issues.append("generated_at must be a non-empty string")

    contract = envelope.get("independent_source_result")
    if not isinstance(contract, Mapping):
        issues.append("independent_source_result must be an object")
        raise CentralCinemaLogValidationError("; ".join(issues))

    known_ids = set(theater_ids) if theater_ids is not None else None
    if known_ids is None:
        try:
            known_ids = load_theater_ids_from_registry()
        except Exception:  # noqa: BLE001
            known_ids = {CENTRAL_THEATER_ID}
    try:
        assert_valid_independent_source_result(contract, theater_ids=known_ids)
    except IndependentContractError as exc:
        issues.append(f"contract invalid: {exc}")

    if str(contract.get("contract_version") or "") != CONTRACT_VERSION:
        issues.append(f"contract_version must be {CONTRACT_VERSION!r}")

    mapping = envelope.get("mapping")
    if not isinstance(mapping, Mapping):
        issues.append("mapping must be an object")
    else:
        for key in ("status", "restate_safe", "accepted_records", "rejected_records"):
            if key not in mapping:
                issues.append(f"mapping.{key} is required")
        if not isinstance(mapping.get("restate_safe"), bool):
            issues.append("mapping.restate_safe must be a boolean")

    records = envelope.get("records")
    if not isinstance(records, list):
        issues.append("records must be a list")
        raise CentralCinemaLogValidationError("; ".join(issues))

    stats = envelope.get("stats") if isinstance(envelope.get("stats"), Mapping) else {}
    final_safe = bool(mapping.get("restate_safe")) if isinstance(mapping, Mapping) else False
    if "restate_safe" in stats and bool(stats.get("restate_safe")) != final_safe:
        issues.append("stats.restate_safe must match mapping.restate_safe")

    contract_safe = bool(contract.get("restate_safe"))
    if final_safe and not contract_safe:
        issues.append("mapping cannot upgrade unsafe contract to restate_safe=true")

    requested = contract.get("requested_window") if isinstance(contract.get("requested_window"), Mapping) else {}
    req_start = str(requested.get("start") or "")
    req_end = str(requested.get("end") or "")

    accepted_slugs = {
        str(row.get("source_program_id"))
        for row in (contract.get("showtimes") or [])
        if isinstance(row, Mapping) and row.get("source_program_id")
    }

    for index, record in enumerate(records):
        if not isinstance(record, Mapping):
            issues.append(f"records[{index}] must be an object")
            continue
        try:
            raw = record_dict_to_raw_showtime(dict(record))
        except Exception as exc:  # noqa: BLE001
            issues.append(f"records[{index}] invalid RawShowtime: {exc}")
            continue

        slug = source_film_id_from_raw(raw)
        if not slug:
            issues.append(f"records[{index}] missing source_film_id / source_program_id")
        if not raw.title_raw or not str(raw.title_raw).strip():
            issues.append(f"records[{index}] missing exact title")

        showing_id = source_showtime_id_from_raw(raw)
        if not showing_id or not _SHOWING_ID_RE.fullmatch(showing_id):
            issues.append(f"records[{index}] missing or non-numeric source_showtime_id")

        attrs = raw.attributes or {}
        if str(attrs.get("theater_id") or "") != CENTRAL_THEATER_ID:
            issues.append(f"records[{index}] theater_id must be {CENTRAL_THEATER_ID}")

        local_date = str(attrs.get("local_date") or "")
        if req_start and req_end and local_date:
            if local_date < req_start or local_date > req_end:
                issues.append(f"records[{index}] local_date {local_date} outside requested window")

        ticket = raw.ticket_url_raw or attrs.get("ticket_url")
        ticket_canonical, ticket_slug, ticket_id = parse_checkout_url(
            str(ticket) if ticket not in (None, "") else None
        )
        if not ticket_canonical:
            issues.append(f"records[{index}] missing or invalid Central checkout ticket URL")
        else:
            if showing_id and ticket_id != showing_id:
                issues.append(f"records[{index}] checkout URL ID does not match source_showtime_id")
            if slug and ticket_slug != slug:
                issues.append(f"records[{index}] checkout slug does not match program slug")

        if raw.source_film_url:
            host = urlparse(str(raw.source_film_url)).netloc.casefold()
            if host and host not in {"central-cinema.com", "www.central-cinema.com"}:
                issues.append(f"records[{index}] program URL host is not Central Cinema")

        venue_proof = attrs.get("venue_proof")
        if venue_proof not in (None, "canonical_central_site_page"):
            issues.append(f"records[{index}] unexpected venue_proof {venue_proof!r}")

        location = attrs.get("location_name")
        if location is not None:
            label = str(location).casefold()
            if label not in {"central cinema", "central", "central cinema seattle"}:
                issues.append(f"records[{index}] accepted off-site/unknown location {location!r}")

        if slug and accepted_slugs and slug not in accepted_slugs:
            issues.append(f"records[{index}] slug {slug!r} not present on contract showtimes")

        if parse_time(raw.time_raw) is None:
            issues.append(f"records[{index}] unparseable time_raw {raw.time_raw!r}")

    if isinstance(mapping, Mapping) and mapping.get("accepted_records") != len(records):
        issues.append("mapping.accepted_records must equal len(records)")

    blob = json.dumps(envelope, ensure_ascii=False)
    if "<html" in blob.casefold() or "</html>" in blob.casefold():
        issues.append("log must not contain full HTML")
    if "user-agent" in blob.casefold() and "ReelSeattle" in blob:
        # Headers should not appear; User-Agent string in module docs is fine only if absent from payload.
        pass
    if re.search(r"[A-Za-z]:\\\\|/Users/|/home/", blob):
        issues.append("log must not contain local absolute paths")

    if issues:
        raise CentralCinemaLogValidationError("; ".join(issues))


def summarize_central_cinema_result(result: CentralCinemaAdapterResult) -> dict[str, Any]:
    contract = result.contract if isinstance(result.contract, Mapping) else {}
    mapping = result.mapping
    stats = contract.get("stats") if isinstance(contract.get("stats"), Mapping) else {}
    return {
        "source": SOURCE,
        "contract_status": contract.get("status"),
        "contract_restate_safe": contract.get("restate_safe"),
        "mapping_status": mapping.mapping_status if mapping else None,
        "restate_safe": result.restate_safe,
        "requested_window": result.requested_window,
        "inspected_window": result.inspected_window,
        "accepted_records": len(result.records),
        "warning_count": len(result.warnings),
        "error_count": len(result.errors),
        "unique_programs": len(
            {
                source_film_id_from_raw(record)
                for record in result.records
                if source_film_id_from_raw(record)
            }
        ),
        "calendar_pages_attempted": stats.get("calendar_pages_attempted"),
        "discovered_programs": stats.get("discovered_programs"),
        "program_pages_succeeded": stats.get("program_pages_succeeded"),
        "program_pages_failed": stats.get("program_pages_failed"),
        "showing_id_coverage": stats.get("showing_id_coverage"),
        "ticket_url_coverage": stats.get("ticket_url_coverage"),
        "rejected_entries": stats.get("rejected_entries"),
        "malformed_showings": stats.get("malformed_showings"),
    }


def prove_indie_parser_compatibility(envelope: Mapping[str, Any]) -> dict[str, Any]:
    """Prove mapped records are readable by the current indie scrape-input path.

    Does **not** write history or invoke restatement.
    """
    validate_central_cinema_scrape_log(envelope)
    fetch_result = load_scrape_daily_log_payload(dict(envelope), label="central-cinema-envelope")
    rows = raw_showtimes_to_legacy_rows(SOURCE, fetch_result.records)
    recovered: list[dict[str, Any]] = []
    for raw, row in zip(fetch_result.records, rows, strict=True):
        slug = source_film_id_from_raw(raw)
        showing_id = source_showtime_id_from_raw(raw)
        title = source_title_from_raw(raw)
        parsed = parse_time(raw.time_raw)
        recovered.append(
            {
                "source_film_id": slug,
                "source_showtime_id": showing_id,
                "source_title": title,
                "date": row.get("Date"),
                "time": row.get("Time"),
                "time_24h": parsed.time_24h if parsed else None,
                "theater": row.get("Theater"),
            }
        )
        if not slug:
            raise CentralCinemaLogValidationError("legacy conversion lost source_film_id")
        if not showing_id or not _SHOWING_ID_RE.fullmatch(showing_id):
            raise CentralCinemaLogValidationError("legacy conversion lost numeric source_showtime_id")
        if not title:
            raise CentralCinemaLogValidationError("legacy conversion lost source_title")
        if parsed is None:
            raise CentralCinemaLogValidationError(f"unparseable time_raw {raw.time_raw!r}")
    return {
        "record_count": len(fetch_result.records),
        "legacy_row_count": len(rows),
        "samples": recovered[:5],
        "history_written": False,
        "restatement_invoked": False,
    }


def fetch_central_cinema(
    start_date: date | None = None,
    end_date: date | None = None,
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
    scraped_at: str | None = None,
    generated_at: str | None = None,
    sleep_seconds: float = DEFAULT_SLEEP_SECONDS,
    theater_ids: Iterable[str] | None = None,
) -> CentralCinemaAdapterResult:
    """Collect Central Cinema showtimes into a production-compatible Option C result."""
    if start_date is None or end_date is None:
        default_start, default_end = default_central_cinema_window(now=now)
        start_date = start_date or default_start
        end_date = end_date or default_end
    if end_date < start_date:
        raise CentralCinemaAdapterError("end_date must be >= start_date")

    fetch_fn = fetch or production_fetch
    try:
        contract = build_central_cinema_result(
            start_date=start_date,
            end_date=end_date,
            fetch=fetch_fn,
            scraped_at=scraped_at,
            sleep_seconds=sleep_seconds,
        )
    except CentralCinemaPrototypeError as exc:
        raise CentralCinemaAdapterError(str(exc)) from exc

    known_ids: set[str]
    if theater_ids is not None:
        known_ids = {str(item) for item in theater_ids}
    else:
        try:
            known_ids = load_theater_ids_from_registry()
        except Exception:  # noqa: BLE001
            known_ids = {CENTRAL_THEATER_ID}

    try:
        assert_valid_independent_source_result(contract, theater_ids=known_ids)
    except IndependentContractError as exc:
        raise CentralCinemaAdapterError(f"Central Cinema contract validation failed: {exc}") from exc

    stamp = generated_at or scrape_log_generated_at(now)
    try:
        mapped = map_central_cinema_contract_to_indie(
            contract,
            theater_ids=known_ids,
            generated_at=stamp,
        )
    except CentralCinemaMappingError as exc:
        raise CentralCinemaAdapterError(f"Central Cinema mapping failed: {exc}") from exc

    envelope = mapped.log_envelope
    validate_central_cinema_scrape_log(envelope, theater_ids=known_ids)

    warning_messages: list[str] = []
    for row in contract.get("warnings") or []:
        if isinstance(row, Mapping) and row.get("message"):
            warning_messages.append(str(row["message"]))
        elif isinstance(row, Mapping) and row.get("code"):
            warning_messages.append(str(row["code"]))
    warning_messages.extend(str(item) for item in (envelope.get("warnings") or []))
    if mapped.warnings:
        warning_messages.extend(item.message for item in mapped.warnings)
    seen_warn: set[str] = set()
    deduped_warnings: list[str] = []
    for message in warning_messages:
        if message in seen_warn:
            continue
        seen_warn.add(message)
        deduped_warnings.append(message)

    error_messages = [str(item) for item in envelope.get("errors") or []]
    if mapped.mapping_status == "failure":
        error_messages = [item.message for item in mapped.rejected if item.affects_completeness]

    stats = dict(envelope.get("stats") or {})
    stats.update(
        {
            "adapter": SOURCE,
            "contract_status": contract.get("status"),
            "contract_restate_safe": contract.get("restate_safe"),
            "mapping_status": mapped.mapping_status,
            "restate_safe": mapped.restate_safe,
            "requested_window": contract.get("requested_window"),
            "inspected_window": contract.get("inspected_window"),
            "window_days_inclusive": WINDOW_DAYS_INCLUSIVE,
        }
    )

    return CentralCinemaAdapterResult(
        records=list(mapped.records),
        stats=stats,
        warnings=deduped_warnings,
        errors=error_messages,
        contract=mapped.contract,
        mapping=mapped,
        log_envelope=envelope,
        restate_safe=mapped.restate_safe,
        requested_window=dict(contract.get("requested_window") or {}),
        inspected_window=dict(contract.get("inspected_window") or {}),
    )


def fetch_central_cinema_from_fixture_dir(
    fixture_dir: Path | str,
    start_date: date,
    end_date: date,
    *,
    scraped_at: str | None = None,
    generated_at: str | None = None,
    theater_ids: Iterable[str] | None = None,
) -> CentralCinemaAdapterResult:
    """Offline fixture collection through the same adapter path."""
    root = Path(fixture_dir)
    if not root.is_dir():
        raise CentralCinemaAdapterError(f"fixture dir not found: {root}")
    pages: dict[str, str] = {}
    manifest = root / "manifest.json"
    if manifest.is_file():
        mapping = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(mapping, dict):
            raise CentralCinemaAdapterError("manifest.json must be an object of url->filename")
        for url, filename in mapping.items():
            pages[str(url)] = (root / str(filename)).read_text(encoding="utf-8")
    else:
        for path in sorted(root.glob("*.html")):
            pages[path.name] = path.read_text(encoding="utf-8")
    return fetch_central_cinema(
        start_date,
        end_date,
        fetch=fixture_fetch_map(pages),
        scraped_at=scraped_at,
        generated_at=generated_at,
        sleep_seconds=0.0,
        theater_ids=theater_ids,
    )
