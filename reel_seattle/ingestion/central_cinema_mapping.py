"""Map validated Central Cinema IndependentSourceResult → indie RawShowtime + Option C log.

Non-scheduled production foundation (P-17C). Does not fetch HTML or invoke restatement.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse, urlunparse

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.adapters.scrape_log import (
    SCRAPE_LOG_SCHEMA_VERSION,
    raw_showtime_to_record_dict,
    scrape_log_generated_at,
)
from reel_seattle.ingestion.independent_contract import (
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    IndependentContractError,
    assert_valid_independent_source_result,
    fixture_theater_ids,
    load_theater_ids_from_registry,
    normalize_exact_source_title,
    serialize_independent_source_result,
)
from reel_seattle.normalize.times import format_time_display

SOURCE = "central_cinema"
CENTRAL_THEATER_ID = "central-cinema"
CENTRAL_CANONICAL_NAME = "Central Cinema"
APPROVED_HOSTS = frozenset({"central-cinema.com", "www.central-cinema.com"})
ONLINE_TOKENS = ("online", "virtual", "zoom", "streaming", "livestream", "webinar")
OFFSITE_TOKENS = (
    "off-site",
    "offsite",
    "partner",
    "outdoor",
    "drive-in",
    "grand illusion",
    "elsewhere",
)
LOCATION_RAW_KEYS = (
    "location_name",
    "venue",
    "venue_name",
    "location",
    "screening_location",
)

MAPPING_STATUS_SUCCESS = "success"
MAPPING_STATUS_SUCCESS_WITH_WARNINGS = "success_with_warnings"
MAPPING_STATUS_UNSAFE = "unsafe"
MAPPING_STATUS_FAILURE = "failure"

_MOVIE_PATH_RE = re.compile(r"^/movie/([a-zA-Z0-9\-]+)/?$")
_CHECKOUT_PATH_RE = re.compile(r"^/checkout/showing/([a-zA-Z0-9\-]+)/(\d+)/?$")
_SHOWING_ID_RE = re.compile(r"^\d+$")


class CentralCinemaMappingError(ValueError):
    """Raised when a contract result cannot be mapped."""


@dataclass(frozen=True, slots=True)
class MappingIssue:
    code: str
    message: str
    source_program_id: str | None = None
    source_value: str | None = None
    affects_completeness: bool = False


@dataclass
class CentralCinemaMappingResult:
    """Outputs of contract→indie mapping."""

    records: list[RawShowtime]
    mapping_status: str
    restate_safe: bool
    warnings: list[MappingIssue] = field(default_factory=list)
    rejected: list[MappingIssue] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    contract: dict[str, Any] = field(default_factory=dict)
    log_envelope: dict[str, Any] = field(default_factory=dict)


def normalize_location_label(value: str | None) -> str:
    if value is None:
        return ""
    text = str(value).replace("\u00a0", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text.casefold()


def _iso_date_to_indie(local_date: str) -> str:
    parsed = date.fromisoformat(local_date)
    return f"{parsed.month:02d}/{parsed.day:02d}/{parsed.year:04d}"


def _local_time_to_indie(local_time: str) -> str:
    """Convert contract ``HH:MM`` to indie-parseable ``h:mm AM/PM``."""
    hour_s, minute_s = local_time.split(":", 1)
    hour = int(hour_s)
    minute = int(minute_s[:2])
    return format_time_display(hour * 60 + minute)


def canonicalize_central_url(url: str | None) -> str | None:
    if not isinstance(url, str) or not url.strip():
        return None
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.casefold()
    if host not in APPROVED_HOSTS:
        return None
    path = parsed.path.rstrip("/") + "/" if parsed.path not in {"", "/"} else "/"
    return urlunparse(("https", "central-cinema.com", path, "", "", ""))


def parse_movie_url(url: str | None) -> tuple[str | None, str | None]:
    """Return ``(canonical_url, slug)`` for a Central movie page URL."""
    canonical = canonicalize_central_url(url)
    if not canonical:
        return None, None
    path = urlparse(canonical).path
    match = _MOVIE_PATH_RE.fullmatch(path.rstrip("/") or path)
    if not match:
        # path always ends with / from canonicalize
        match = _MOVIE_PATH_RE.fullmatch(path)
    if not match:
        path_no_slash = path.rstrip("/")
        match = re.fullmatch(r"/movie/([a-zA-Z0-9\-]+)", path_no_slash)
    if not match:
        return None, None
    slug = match.group(1)
    return f"https://central-cinema.com/movie/{slug}/", slug


def parse_checkout_url(url: str | None) -> tuple[str | None, str | None, str | None]:
    """Return ``(canonical_ticket_url, slug, showing_id)``."""
    if not isinstance(url, str) or not url.strip():
        return None, None, None
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        return None, None, None
    host = parsed.netloc.casefold()
    if host not in APPROVED_HOSTS:
        return None, None, None
    match = _CHECKOUT_PATH_RE.fullmatch(parsed.path.rstrip("/") + "/") or _CHECKOUT_PATH_RE.fullmatch(
        parsed.path
    )
    if not match:
        match = re.fullmatch(r"/checkout/showing/([a-zA-Z0-9\-]+)/(\d+)/?", parsed.path)
    if not match:
        return None, None, None
    slug, showing_id = match.group(1), match.group(2)
    canonical = f"https://www.central-cinema.com/checkout/showing/{slug}/{showing_id}"
    return canonical, slug, showing_id


def normalize_showing_id(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or not _SHOWING_ID_RE.fullmatch(text):
        return None
    return text


def _venue_evidence_from_raw(raw: Mapping[str, Any] | None) -> str | None:
    if not isinstance(raw, Mapping):
        return None
    for key in LOCATION_RAW_KEYS:
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def classify_venue_evidence(location: str | None) -> str | None:
    """Return rejection code for explicit bad venue evidence, else None."""
    label = normalize_location_label(location)
    if not label:
        return None
    if any(token in label for token in ONLINE_TOKENS):
        return "online_or_virtual_location"
    if any(token in label for token in OFFSITE_TOKENS):
        return "offsite_or_partner_location"
    if label in {"tba", "tbd", "various", "multiple venues", "see listing"}:
        return "ambiguous_venue"
    if label not in {
        CENTRAL_CANONICAL_NAME.casefold(),
        "central",
        "central cinema seattle",
    }:
        # Explicit non-empty label that is not Central → treat as off-site/ambiguous.
        return "unknown_location"
    return None


def site_scoped_venue_ok(
    *,
    program_url: str | None,
    ticket_url: str | None,
    program_slug: str,
    structural_passed: bool,
    venue_evidence: str | None,
) -> tuple[bool, str | None]:
    """Affirmative Central site/page venue proof.

    Returns ``(ok, rejection_code)``.
    """
    evidence_code = classify_venue_evidence(venue_evidence)
    if evidence_code:
        return False, evidence_code

    movie_canonical, movie_slug = parse_movie_url(program_url)
    if not movie_canonical or movie_slug != program_slug:
        return False, "invalid_program_url"

    ticket_canonical, ticket_slug, _showing_id = parse_checkout_url(ticket_url)
    if not ticket_canonical or ticket_slug != program_slug:
        return False, "invalid_ticket_url"

    if not structural_passed:
        return False, "missing_structural_venue_proof"

    return True, None


def _runtime_raw_from_program(program: Mapping[str, Any] | None) -> str | None:
    if not program:
        return None
    raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}
    value = raw.get("runtime_min")
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return str(value)
    if isinstance(value, str) and value.isdigit() and int(value) > 0:
        return value
    return None


def _release_year_from_program(
    program: Mapping[str, Any] | None,
) -> tuple[int | None, str | None]:
    """Credible release year only — never ``dateCreated``.

    Returns ``(year, warning_code)``. Warning when an explicit invalid year is present.
    """
    if not program:
        return None, None
    raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}
    if "release_year" not in raw or raw.get("release_year") in (None, ""):
        return None, None
    value = raw.get("release_year")
    if isinstance(value, bool):
        return None, "invalid_release_year"
    if isinstance(value, int) and 1888 <= value <= 2100:
        return value, None
    if isinstance(value, str) and value.isdigit():
        year = int(value)
        if 1888 <= year <= 2100:
            return year, None
    return None, "invalid_release_year"


def _image_from_program(program: Mapping[str, Any] | None) -> str | None:
    if not program:
        return None
    raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}
    for key in ("image_url", "poster_url"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    schema = raw.get("schema_org") if isinstance(raw.get("schema_org"), Mapping) else {}
    image = schema.get("image")
    if isinstance(image, str) and image.strip():
        return image.strip()
    return None


def _issue_dict(issue: MappingIssue) -> dict[str, Any]:
    return {
        "code": issue.code,
        "message": issue.message,
        "source_program_id": issue.source_program_id,
        "source_value": issue.source_value,
        "affects_completeness": issue.affects_completeness,
    }


def _resolve_theater_ids(theater_ids: Iterable[str] | None) -> set[str]:
    if theater_ids is not None:
        return {str(item) for item in theater_ids}
    try:
        return load_theater_ids_from_registry()
    except Exception:  # noqa: BLE001
        return fixture_theater_ids(include_planned=True)


def _structural_passed(contract: Mapping[str, Any]) -> bool:
    block = contract.get("structural_validation")
    if not isinstance(block, Mapping):
        return False
    return bool(block.get("passed"))


def map_central_cinema_contract_to_indie(
    result: Mapping[str, Any],
    *,
    theater_ids: Iterable[str] | None = None,
    generated_at: str | None = None,
) -> CentralCinemaMappingResult:
    """Validate and map a Central IndependentSourceResult into indie records + log envelope."""
    if not isinstance(result, Mapping):
        raise CentralCinemaMappingError("contract result must be an object")

    source = result.get("source")
    if source != SOURCE:
        raise CentralCinemaMappingError(f"expected source {SOURCE!r}, got {source!r}")

    version = result.get("contract_version")
    if version != CONTRACT_VERSION:
        raise CentralCinemaMappingError(
            f"unsupported contract_version {version!r}; expected {CONTRACT_VERSION!r}"
        )

    identity = result.get("identity") if isinstance(result.get("identity"), Mapping) else {}
    if identity.get("showtime_strategy") != "source_showing_id":
        raise CentralCinemaMappingError(
            "Central mapping requires identity.showtime_strategy='source_showing_id'"
        )

    known_ids = _resolve_theater_ids(theater_ids)
    try:
        assert_valid_independent_source_result(result, theater_ids=known_ids)
    except IndependentContractError as exc:
        raise CentralCinemaMappingError(f"invalid IndependentSourceResult: {exc}") from exc

    contract = json.loads(serialize_independent_source_result(result))
    programs = {
        str(row.get("source_program_id")): row
        for row in (contract.get("programs") or [])
        if isinstance(row, Mapping) and row.get("source_program_id")
    }

    warnings: list[MappingIssue] = []
    rejected: list[MappingIssue] = []
    for row in contract.get("rejected_observations") or []:
        if not isinstance(row, Mapping):
            continue
        rejected.append(
            MappingIssue(
                code=str(row.get("code") or "contract_rejection"),
                message=str(row.get("message") or "Rejected by contract result."),
                source_program_id=(
                    str(row["source_program_id"])
                    if row.get("source_program_id") not in (None, "")
                    else None
                ),
                source_value=(
                    str(row["source_value"]) if row.get("source_value") not in (None, "") else None
                ),
                affects_completeness=bool(row.get("affects_completeness")),
            )
        )

    contract_safe = bool(contract.get("restate_safe"))
    mapping_unsafe = False
    mapping_failed = False
    structural_ok = _structural_passed(contract)
    staged: list[dict[str, Any]] = []

    for index, showtime in enumerate(contract.get("showtimes") or []):
        if not isinstance(showtime, Mapping):
            mapping_failed = True
            rejected.append(
                MappingIssue(
                    code="invalid_showtime",
                    message=f"showtimes[{index}] is not an object",
                    affects_completeness=True,
                )
            )
            continue

        slug = str(showtime.get("source_program_id") or "").strip()
        theater_id = str(showtime.get("theater_id") or "").strip()
        local_date = str(showtime.get("local_date") or "").strip()
        local_time = str(showtime.get("local_time") or "").strip()
        timezone = str(showtime.get("timezone") or "").strip() or DEFAULT_TIMEZONE
        title = normalize_exact_source_title(str(showtime.get("source_title") or ""))
        program = programs.get(slug)
        show_raw = showtime.get("raw") if isinstance(showtime.get("raw"), Mapping) else {}
        venue_evidence = _venue_evidence_from_raw(show_raw)

        if theater_id != CENTRAL_THEATER_ID:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="unknown_theater_id",
                    message="Showtime theater_id is not the canonical Central Cinema venue.",
                    source_program_id=slug or None,
                    source_value=theater_id or None,
                    affects_completeness=True,
                )
            )
            continue

        if theater_id not in known_ids:
            mapping_failed = True
            rejected.append(
                MappingIssue(
                    code="theater_not_in_registry",
                    message="Canonical Central theater_id is not present in the theater ID set.",
                    source_program_id=slug or None,
                    source_value=theater_id,
                    affects_completeness=True,
                )
            )
            continue

        showing_id = normalize_showing_id(showtime.get("source_showtime_id"))
        if showing_id is None:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="missing_or_malformed_showing_id",
                    message="Central showtimes require a numeric source_showtime_id.",
                    source_program_id=slug or None,
                    source_value=str(showtime.get("source_showtime_id") or "") or None,
                    affects_completeness=True,
                )
            )
            continue

        ticket = showtime.get("ticket_url")
        ticket_url = ticket.strip() if isinstance(ticket, str) and ticket.strip() else None
        occurrence_url = showtime.get("source_occurrence_url")
        program_url = program.get("source_program_url") if program else occurrence_url

        ticket_canonical, ticket_slug, ticket_id = parse_checkout_url(ticket_url)
        if ticket_url and (not ticket_canonical or ticket_id != showing_id or ticket_slug != slug):
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="checkout_url_id_mismatch",
                    message="Checkout URL does not match program slug and numeric showing ID.",
                    source_program_id=slug or None,
                    source_value=ticket_url,
                    affects_completeness=True,
                )
            )
            continue

        if not ticket_url:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="missing_ticket_url",
                    message="Central showtimes require a checkout ticket URL for venue/ID proof.",
                    source_program_id=slug or None,
                    source_value=None,
                    affects_completeness=True,
                )
            )
            continue

        venue_ok, venue_code = site_scoped_venue_ok(
            program_url=str(program_url) if program_url else None,
            ticket_url=ticket_url,
            program_slug=slug,
            structural_passed=structural_ok,
            venue_evidence=venue_evidence,
        )
        if not venue_ok:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code=venue_code or "venue_proof_failed",
                    message="Central site-scoped venue proof failed.",
                    source_program_id=slug or None,
                    source_value=venue_evidence or ticket_url,
                    affects_completeness=True,
                )
            )
            continue

        if timezone != DEFAULT_TIMEZONE:
            mapping_unsafe = True
            rejected.append(
                MappingIssue(
                    code="invalid_timezone",
                    message=f"Timezone must be {DEFAULT_TIMEZONE!r}.",
                    source_program_id=slug or None,
                    source_value=timezone,
                    affects_completeness=True,
                )
            )
            continue

        program_title = program.get("source_title") if program else None
        calendar_title = None
        if program and isinstance(program.get("raw"), Mapping):
            ct = program["raw"].get("calendar_title")
            if isinstance(ct, str) and ct.strip():
                calendar_title = ct.strip()
        title_differs = bool(program_title and program_title != title)
        runtime_raw = _runtime_raw_from_program(program)
        release_year, year_warn = _release_year_from_program(program)
        if year_warn:
            warnings.append(
                MappingIssue(
                    code=year_warn,
                    message="Invalid optional release_year ignored; mapped null.",
                    source_program_id=slug or None,
                    source_value=str((program or {}).get("raw", {}).get("release_year")),
                    affects_completeness=False,
                )
            )
        image_url = _image_from_program(program)
        program_kind = program.get("program_kind") if program else None

        attributes: dict[str, object] = {
            "source_film_id": slug,
            "source_program_id": slug,
            "source_showtime_id": showing_id,
            "checkout_showing_segment": showing_id,
            "theater_id": theater_id,
            "local_date": local_date,
            "local_time": local_time,
            "timezone": timezone,
            "showtime_identity": "source_showing_id",
            "program_page_title": program_title,
            "calendar_title": calendar_title,
            "title_differs_from_program": title_differs,
            "program_kind": program_kind,
            "source_occurrence_url": occurrence_url,
            "ticket_url": ticket_canonical or ticket_url,
            "source_display_date": show_raw.get("source_display_date"),
            "year_rollover_inferred": show_raw.get("year_rollover_inferred"),
            "venue_proof": "canonical_central_site_page",
            "prototype_theater_id": CENTRAL_THEATER_ID,
            "theater_id_production_enabled": True,
        }
        if release_year is not None:
            attributes["release_year"] = release_year
        if venue_evidence:
            attributes["location_name"] = venue_evidence

        staged.append(
            {
                "showing_id": showing_id,
                "facts": {
                    "source_program_id": slug,
                    "theater_id": theater_id,
                    "local_date": local_date,
                    "local_time": local_time,
                    "ticket_url": ticket_canonical or ticket_url,
                },
                "raw": RawShowtime(
                    theater_name_raw=CENTRAL_CANONICAL_NAME,
                    date_raw=_iso_date_to_indie(local_date),
                    time_raw=_local_time_to_indie(local_time),
                    title_raw=title,
                    runtime_raw=runtime_raw,
                    poster_url_raw=image_url,
                    ticket_url_raw=ticket_canonical or ticket_url,
                    source_showtime_id=showing_id,
                    source_film_url=str(program_url) if program_url else (
                        str(occurrence_url) if occurrence_url else None
                    ),
                    attributes=attributes,
                ),
            }
        )

    # Deduplicate / conflict by mandatory showing ID.
    accepted: list[RawShowtime] = []
    by_id: dict[str, dict[str, Any]] = {}
    for item in staged:
        showing_id = item["showing_id"]
        prior = by_id.get(showing_id)
        if prior is None:
            by_id[showing_id] = item
            continue
        if prior["facts"] == item["facts"]:
            # Exact duplicate — keep first deterministically.
            warnings.append(
                MappingIssue(
                    code="exact_duplicate_deduped",
                    message=f"Exact duplicate source_showtime_id {showing_id!r} deduplicated.",
                    source_program_id=str(item["facts"]["source_program_id"]),
                    source_value=showing_id,
                    affects_completeness=False,
                )
            )
            continue
        mapping_unsafe = True
        rejected.append(
            MappingIssue(
                code="conflicting_showing_id",
                message=f"Conflicting duplicate source_showtime_id {showing_id!r}.",
                source_program_id=str(item["facts"]["source_program_id"]),
                source_value=showing_id,
                affects_completeness=True,
            )
        )

    if any(issue.affects_completeness and issue.code == "conflicting_showing_id" for issue in rejected):
        # Do not emit either side of a conflicting ID pair.
        conflict_ids = {
            issue.source_value
            for issue in rejected
            if issue.code == "conflicting_showing_id" and issue.source_value
        }
        accepted = [
            item["raw"] for sid, item in sorted(by_id.items()) if sid not in conflict_ids
        ]
        # Still unsafe overall.
    else:
        accepted = [item["raw"] for _, item in sorted(by_id.items())]

    # Mapping cannot upgrade an unsafe contract.
    if mapping_failed:
        mapping_status = MAPPING_STATUS_FAILURE
        final_safe = False
    elif mapping_unsafe or not contract_safe:
        mapping_status = MAPPING_STATUS_UNSAFE
        final_safe = False
    elif warnings:
        mapping_status = MAPPING_STATUS_SUCCESS_WITH_WARNINGS
        final_safe = True
    else:
        mapping_status = MAPPING_STATUS_SUCCESS
        final_safe = True

    if not contract_safe:
        final_safe = False
        if mapping_status == MAPPING_STATUS_SUCCESS:
            mapping_status = MAPPING_STATUS_UNSAFE
        elif mapping_status == MAPPING_STATUS_SUCCESS_WITH_WARNINGS:
            mapping_status = MAPPING_STATUS_UNSAFE

    stamp = generated_at or scrape_log_generated_at()
    stats = {
        "accepted_records": len(accepted),
        "rejected_records": len(rejected),
        "warning_count": len(warnings),
        "mapping_status": mapping_status,
        "restate_safe": final_safe,
        "contract_restate_safe": contract_safe,
        "contract_status": contract.get("status"),
        "requested_window": contract.get("requested_window"),
        "inspected_window": contract.get("inspected_window"),
        "scrape_status": contract.get("status"),
        "stale_retention_recommended": not final_safe,
        "prototype_theater_id": CENTRAL_THEATER_ID,
        "showtime_identity": "source_showing_id",
    }

    mapping_block = {
        "status": mapping_status,
        "restate_safe": final_safe,
        "accepted_records": len(accepted),
        "rejected_records": len(rejected),
        "warnings": [_issue_dict(item) for item in warnings],
        "rejected_observations": [_issue_dict(item) for item in rejected],
    }

    log_envelope = {
        "schema_version": SCRAPE_LOG_SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "independent_source_result": contract,
        "mapping": mapping_block,
        "records": [raw_showtime_to_record_dict(record) for record in accepted],
        "stats": {
            "record_count": len(accepted),
            "warning_count": len(warnings),
            "error_count": 1 if mapping_status == MAPPING_STATUS_FAILURE else 0,
            **stats,
        },
        "warnings": [item.message for item in warnings],
        "errors": [
            item.message for item in rejected if item.affects_completeness and mapping_failed
        ],
    }

    return CentralCinemaMappingResult(
        records=accepted,
        mapping_status=mapping_status,
        restate_safe=final_safe,
        warnings=warnings,
        rejected=rejected,
        stats=stats,
        contract=contract,
        log_envelope=log_envelope,
    )


def serialize_central_cinema_mapping_log(envelope: Mapping[str, Any]) -> str:
    """Deterministic JSON serialization for Central mapping log envelopes."""
    return json.dumps(envelope, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def mapping_result_to_dict(result: CentralCinemaMappingResult) -> dict[str, Any]:
    """Test/debug helper."""
    return {
        "mapping_status": result.mapping_status,
        "restate_safe": result.restate_safe,
        "stats": result.stats,
        "warnings": [_issue_dict(item) for item in result.warnings],
        "rejected": [_issue_dict(item) for item in result.rejected],
        "records": [asdict(record) for record in result.records],
        "log_envelope": result.log_envelope,
    }
