"""Production-compatible Grand Illusion adapter (Option C).

Pipeline:
  HTTP (or fixtures) → prototype extraction → IndependentSourceResult v1.0.0
  → contract validation → contract-to-indie mapping → Option C scrape-log envelope

Grand Illusion is a programmer/presenter source. Physical ``theater_id`` values
are partner venues; ``source`` remains ``grand_illusion``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from reel_seattle.adapters.base import FetchResult, RawShowtime
from reel_seattle.adapters.scrape_log import (
    SCRAPE_LOG_SCHEMA_VERSION,
    scrape_log_generated_at,
)
from reel_seattle.ingestion.grand_illusion_mapping import (
    GI_PARTNER_THEATER_IDS,
    GrandIllusionMappingError,
    GrandIllusionMappingResult,
    map_grand_illusion_contract_to_indie,
)
from reel_seattle.ingestion.independent_contract import (
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    IndependentContractError,
    assert_valid_independent_source_result,
    load_theater_ids_from_registry,
)
from reel_seattle.prototypes.grand_illusion import (
    FIXTURE_WP_ID_TO_SLUG,
    FetchFn,
    FetchResponse,
    GrandIllusionPrototypeError,
    USER_AGENT,
    build_grand_illusion_result,
    fixture_fetch_map,
)
from reel_seattle.showtime_horizon import INDIE_SCRAPE_HORIZON_DAYS

SOURCE = "grand_illusion"
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)
DEFAULT_SLEEP_SECONDS = 0.35
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_RETRIES = 2
WINDOW_DAYS_INCLUSIVE = INDIE_SCRAPE_HORIZON_DAYS + 1


class GrandIllusionAdapterError(ValueError):
    """Raised for programmer/structural invocation errors."""


class GrandIllusionLogValidationError(ValueError):
    """Raised when a production-shaped Grand Illusion log fails validation."""


@dataclass
class GrandIllusionAdapterResult:
    records: list[RawShowtime]
    stats: dict[str, Any]
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    contract: dict[str, Any] = field(default_factory=dict)
    mapping: GrandIllusionMappingResult | None = None
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


def default_grand_illusion_window(*, now: datetime | None = None) -> tuple[date, date]:
    moment = now or datetime.now(PACIFIC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=PACIFIC)
    else:
        moment = moment.astimezone(PACIFIC)
    start = moment.date()
    end = start.fromordinal(start.toordinal() + INDIE_SCRAPE_HORIZON_DAYS)
    return start, end


def production_fetch(
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    retries: int = DEFAULT_RETRIES,
) -> FetchResponse:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            # POST for admin-ajax query-style fallback is not used in production
            # path when ?p= redirect works; GET covers calendars + film pages.
            method = "GET"
            parsed = urlparse(url)
            if parsed.path.endswith("admin-ajax.php") and "action=cinema_theme_ajax_call" in (
                parsed.query or ""
            ):
                # Convert query AJAX into POST body for WordPress.
                from urllib.parse import parse_qs

                qs = parse_qs(parsed.query)
                action = (qs.get("action") or ["cinema_theme_ajax_call"])[0]
                film_id = (qs.get("filmId") or [""])[0]
                data = f"action={action}&filmId={film_id}".encode("utf-8")
                req = Request(
                    f"{parsed.scheme}://{parsed.netloc}{parsed.path}",
                    data=data,
                    headers={
                        "User-Agent": USER_AGENT,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    method="POST",
                )
            with urlopen(req, timeout=timeout) as resp:  # noqa: S310 - trusted host
                body = resp.read().decode("utf-8", errors="replace")
                final = getattr(resp, "geturl", lambda: url)()
                headers = {k.lower(): v for k, v in resp.headers.items()}
                return FetchResponse(
                    url=url,
                    status_code=getattr(resp, "status", 200) or 200,
                    text=body,
                    final_url=final,
                    headers=headers,
                )
        except HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                body = ""
            loc = exc.headers.get("Location") if exc.headers else None
            if exc.code in {301, 302, 303, 307, 308} and loc:
                return FetchResponse(
                    url=url,
                    status_code=exc.code,
                    text=body,
                    final_url=loc,
                    headers={k.lower(): v for k, v in (exc.headers.items() if exc.headers else [])},
                )
            last_error = exc
            if attempt >= retries:
                return FetchResponse(
                    url=url,
                    status_code=exc.code,
                    text=body,
                    final_url=loc or url,
                )
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt >= retries:
                raise GrandIllusionAdapterError(f"fetch failed for {url}: {exc}") from exc
    raise GrandIllusionAdapterError(f"fetch failed for {url}: {last_error}")


def validate_grand_illusion_scrape_log(
    envelope: Mapping[str, Any],
    *,
    theater_ids: Iterable[str] | None = None,
) -> None:
    if not isinstance(envelope, Mapping):
        raise GrandIllusionLogValidationError("envelope must be an object")
    if envelope.get("schema_version") != SCRAPE_LOG_SCHEMA_VERSION:
        raise GrandIllusionLogValidationError("unexpected schema_version")
    if envelope.get("source") != SOURCE:
        raise GrandIllusionLogValidationError(f"expected source {SOURCE}")
    mapping = envelope.get("mapping")
    if not isinstance(mapping, Mapping):
        raise GrandIllusionLogValidationError("mapping block required")
    for key in ("status", "restate_safe", "accepted_records", "rejected_records"):
        if key not in mapping:
            raise GrandIllusionLogValidationError(f"mapping.{key} required")
    if not isinstance(mapping.get("restate_safe"), bool):
        raise GrandIllusionLogValidationError("mapping.restate_safe must be boolean")
    stats = envelope.get("stats") if isinstance(envelope.get("stats"), Mapping) else {}
    if "restate_safe" in stats and bool(stats.get("restate_safe")) != bool(
        mapping.get("restate_safe")
    ):
        raise GrandIllusionLogValidationError("stats.restate_safe must match mapping.restate_safe")
    contract = envelope.get("independent_source_result")
    if not isinstance(contract, Mapping):
        raise GrandIllusionLogValidationError("independent_source_result required")
    if bool(mapping.get("restate_safe")) and not bool(contract.get("restate_safe")):
        raise GrandIllusionLogValidationError(
            "mapping cannot upgrade unsafe contract to restate_safe=true"
        )
    known = set(theater_ids) if theater_ids is not None else set(GI_PARTNER_THEATER_IDS)
    for record in envelope.get("records") or []:
        if not isinstance(record, Mapping):
            continue
        attrs = record.get("attributes") if isinstance(record.get("attributes"), Mapping) else {}
        theater_id = str((attrs or {}).get("theater_id") or "").strip()
        if theater_id and theater_id not in known and theater_id not in GI_PARTNER_THEATER_IDS:
            raise GrandIllusionLogValidationError(
                f"record theater_id {theater_id!r} not in allowlist"
            )


def write_grand_illusion_scrape_log(
    output_path: Path | str,
    envelope: Mapping[str, Any],
) -> dict[str, Any]:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(envelope)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def fetch_grand_illusion(
    start_date: date | None = None,
    end_date: date | None = None,
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
    scraped_at: str | None = None,
    generated_at: str | None = None,
    sleep_seconds: float = DEFAULT_SLEEP_SECONDS,
    theater_ids: Iterable[str] | None = None,
) -> GrandIllusionAdapterResult:
    if start_date is None or end_date is None:
        default_start, default_end = default_grand_illusion_window(now=now)
        start_date = start_date or default_start
        end_date = end_date or default_end
    if end_date < start_date:
        raise GrandIllusionAdapterError("end_date must be >= start_date")

    fetch_fn = fetch or production_fetch
    try:
        contract = build_grand_illusion_result(
            start_date=start_date,
            end_date=end_date,
            fetch=fetch_fn,
            scraped_at=scraped_at,
            sleep_seconds=sleep_seconds,
        )
    except GrandIllusionPrototypeError as exc:
        raise GrandIllusionAdapterError(str(exc)) from exc

    if theater_ids is not None:
        known_ids = {str(item) for item in theater_ids}
    else:
        try:
            known_ids = load_theater_ids_from_registry()
        except Exception:  # noqa: BLE001
            known_ids = set(GI_PARTNER_THEATER_IDS)

    try:
        assert_valid_independent_source_result(contract, theater_ids=known_ids)
    except IndependentContractError as exc:
        raise GrandIllusionAdapterError(
            f"Grand Illusion contract validation failed: {exc}"
        ) from exc

    stamp = generated_at or scrape_log_generated_at(now)
    try:
        mapped = map_grand_illusion_contract_to_indie(
            contract,
            theater_ids=known_ids,
            generated_at=stamp,
        )
    except GrandIllusionMappingError as exc:
        raise GrandIllusionAdapterError(f"Grand Illusion mapping failed: {exc}") from exc

    envelope = mapped.log_envelope
    validate_grand_illusion_scrape_log(envelope, theater_ids=known_ids)

    warning_messages: list[str] = []
    for row in contract.get("warnings") or []:
        if isinstance(row, Mapping) and row.get("message"):
            warning_messages.append(str(row["message"]))
    warning_messages.extend(str(item) for item in (envelope.get("warnings") or []))
    if mapped.warnings:
        warning_messages.extend(item.message for item in mapped.warnings)

    error_messages = [str(item) for item in envelope.get("errors") or []]
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
            "contract_version": CONTRACT_VERSION,
        }
    )

    return GrandIllusionAdapterResult(
        records=list(mapped.records),
        stats=stats,
        warnings=list(dict.fromkeys(warning_messages)),
        errors=error_messages,
        contract=mapped.contract,
        mapping=mapped,
        log_envelope=envelope,
        restate_safe=mapped.restate_safe,
        requested_window=dict(contract.get("requested_window") or {}),
        inspected_window=dict(contract.get("inspected_window") or {}),
    )


def fetch_grand_illusion_from_fixture_dir(
    fixture_dir: Path | str,
    start_date: date,
    end_date: date,
    *,
    scraped_at: str | None = None,
    generated_at: str | None = None,
    theater_ids: Iterable[str] | None = None,
    wp_id_to_slug: Mapping[str, str] | None = None,
) -> GrandIllusionAdapterResult:
    root = Path(fixture_dir)
    if not root.is_dir():
        raise GrandIllusionAdapterError(f"fixture dir not found: {root}")
    return fetch_grand_illusion(
        start_date,
        end_date,
        fetch=fixture_fetch_map(root, wp_id_to_slug=wp_id_to_slug or FIXTURE_WP_ID_TO_SLUG),
        scraped_at=scraped_at,
        generated_at=generated_at,
        sleep_seconds=0.0,
        theater_ids=theater_ids,
    )
