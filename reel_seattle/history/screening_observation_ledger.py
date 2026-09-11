"""Build durable screening observations + lifecycle summaries from daily logs.

Identity strategy
-----------------
HIGH   – stable ``(source, source_showtime_id)``
MEDIUM – ``(source, source_film_id, theater_id, local_date, local_time)``
         or NWFF occurrence discriminator + theater + datetime
LOW    – ``(source, film_key, theater_id, local_date, local_time)``

False splits preferred over false merges. Datetime/theater changes without a
stable source showtime id become a new provisional identity.

Snapshot completeness
---------------------
Reuse the same ``restate_safe`` signal used by ``daily_processor``:
only ``complete`` snapshots may infer ``no_longer_observed``.
Absence alone never implies ``explicitly_cancelled``.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Mapping, TextIO

from reel_seattle.adapters.scrape_log import (
    DEFAULT_DAILY_LOGS_DIR,
    ScrapeLogError,
    load_scrape_daily_log_payload,
)
from reel_seattle.adapters.indie_completeness import reconcile_option_c_restate_safe
from reel_seattle.analysis.film_identity import derive_parent_identity
from reel_seattle.history import (
    CONFIDENCE_HIGH,
    CONFIDENCE_LOW,
    CONFIDENCE_MEDIUM,
    DEFAULT_LIFECYCLE_PATH,
    DEFAULT_METRICS_PATH,
    DEFAULT_OBSERVATIONS_PATH,
    DEFAULT_SNAPSHOT_STATUS_PATH,
    KNOWN_SOURCES,
    SCHEMA_VERSION,
    SNAPSHOT_COMPLETE,
    SNAPSHOT_FAILED,
    SNAPSHOT_MISSING,
    SNAPSHOT_PARTIAL,
    SNAPSHOT_UNKNOWN,
    STATUS_ACTIVE,
    STATUS_EXPLICITLY_CANCELLED,
    STATUS_NO_LONGER_OBSERVED,
    STATUS_PAST,
)
from reel_seattle.history_keys import load_theater_index
from reel_seattle.normalize import (
    TheaterIndex,
    parse_show_date,
    parse_time,
    resolve_theater,
    showtime_film_key,
)
from reel_seattle.source_identity import (
    source_film_id_from_raw,
    source_showtime_id_from_raw,
    source_title_from_raw,
)

_LOG_NAME_RE = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})_(?P<source>[a-z0-9_]+)\.json$"
)
_OPTION_C = frozenset({"nwff", "central_cinema"})

_TRACKED_ATTR_KEYS = (
    "source_title",
    "ticket_url",
    "format_raw",
    "local_date",
    "local_time",
    "theater_id",
    "theater_name",
    "canceled",
)


@dataclass(frozen=True)
class SnapshotRef:
    source: str
    snapshot_date: str
    path: Path


@dataclass
class SnapshotStatus:
    source: str
    snapshot_date: str
    completeness: str
    generated_at: str | None
    record_count: int
    restate_safe: bool | None
    error_count: int
    warning_count: int
    path: str
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "source": self.source,
            "snapshot_date": self.snapshot_date,
            "completeness": self.completeness,
            "generated_at": self.generated_at,
            "record_count": self.record_count,
            "restate_safe": self.restate_safe,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "path": self.path,
            "reason": self.reason,
        }


@dataclass
class NormalizedObservation:
    screening_id: str
    identity_confidence: str
    identity_method: str
    source: str
    source_showtime_id: str | None
    source_film_id: str | None
    showtime_film_key: str | None
    parent_film_key: str | None
    parent_display_title: str | None
    theater_id: str | None
    theater_name: str
    local_date: str
    local_time: str
    scheduled_local: str
    source_title: str
    ticket_url: str | None
    format_raw: str | None
    canceled: bool | None
    snapshot_date: str
    observed_at: str
    log_path: str

    def observation_key(self) -> str:
        return f"{self.screening_id}|{self.snapshot_date}"

    def tracked_attrs(self) -> dict[str, Any]:
        return {
            "source_title": self.source_title,
            "ticket_url": self.ticket_url,
            "format_raw": self.format_raw,
            "local_date": self.local_date,
            "local_time": self.local_time,
            "theater_id": self.theater_id,
            "theater_name": self.theater_name,
            "canceled": self.canceled,
        }

    def to_observation_row(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "record_type": "observation",
            "screening_id": self.screening_id,
            "identity_confidence": self.identity_confidence,
            "identity_method": self.identity_method,
            "source": self.source,
            "source_showtime_id": self.source_showtime_id,
            "source_film_id": self.source_film_id,
            "showtime_film_key": self.showtime_film_key,
            "parent_film_key": self.parent_film_key,
            "parent_display_title": self.parent_display_title,
            "theater_id": self.theater_id,
            "theater_name": self.theater_name,
            "local_date": self.local_date,
            "local_time": self.local_time,
            "scheduled_local": self.scheduled_local,
            "source_title": self.source_title,
            "ticket_url": self.ticket_url,
            "format_raw": self.format_raw,
            "canceled": self.canceled,
            "snapshot_date": self.snapshot_date,
            "observed_at": self.observed_at,
            "present_in_feed": True,
            "log_path": self.log_path,
        }


@dataclass
class ScreeningLifecycle:
    screening_id: str
    identity_confidence: str
    identity_method: str
    source: str
    source_showtime_id: str | None
    source_film_id: str | None
    showtime_film_key: str | None
    parent_film_key: str | None
    parent_display_title: str | None
    theater_id: str | None
    scheduled_local: str
    first_observed_at: str
    last_observed_at: str
    first_snapshot_date: str
    last_snapshot_date: str
    removed_at: str | None = None
    cancelled_at: str | None = None
    current_status: str = STATUS_ACTIVE
    observation_count: int = 0
    reappearance_count: int = 0
    attribute_change_count: int = 0
    changed_fields: list[str] = field(default_factory=list)
    removal_events: list[dict[str, Any]] = field(default_factory=list)
    latest_attrs: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "screening_id": self.screening_id,
            "identity_confidence": self.identity_confidence,
            "identity_method": self.identity_method,
            "source": self.source,
            "source_showtime_id": self.source_showtime_id,
            "source_film_id": self.source_film_id,
            "showtime_film_key": self.showtime_film_key,
            "parent_film_key": self.parent_film_key,
            "parent_display_title": self.parent_display_title,
            "theater_id": self.theater_id,
            "scheduled_local": self.scheduled_local,
            "first_observed_at": self.first_observed_at,
            "last_observed_at": self.last_observed_at,
            "first_snapshot_date": self.first_snapshot_date,
            "last_snapshot_date": self.last_snapshot_date,
            "removed_at": self.removed_at,
            "cancelled_at": self.cancelled_at,
            "current_status": self.current_status,
            "observation_count": self.observation_count,
            "reappearance_count": self.reappearance_count,
            "attribute_change_count": self.attribute_change_count,
            "changed_fields": list(self.changed_fields),
            "removal_events": list(self.removal_events),
            "latest_attrs": dict(self.latest_attrs),
        }


def list_daily_log_snapshots(
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    *,
    sources: Iterable[str] = KNOWN_SOURCES,
) -> list[SnapshotRef]:
    """List tracked daily logs chronologically (by date, then source)."""
    root = Path(logs_dir)
    allowed = set(sources)
    refs: list[SnapshotRef] = []
    if not root.is_dir():
        return refs
    for path in sorted(root.glob("*.json")):
        match = _LOG_NAME_RE.match(path.name)
        if not match:
            continue
        source = match.group("source")
        if source not in allowed:
            continue
        refs.append(
            SnapshotRef(
                source=source,
                snapshot_date=match.group("date"),
                path=path,
            )
        )
    refs.sort(key=lambda item: (item.snapshot_date, item.source, str(item.path)))
    return refs


def classify_snapshot_completeness(
    source: str,
    payload: Mapping[str, Any] | None,
    *,
    load_error: str | None = None,
) -> tuple[str, str | None, bool | None]:
    """Return (completeness, reason, restate_safe)."""
    if load_error:
        return SNAPSHOT_FAILED, load_error, False
    if payload is None:
        return SNAPSHOT_MISSING, "missing_payload", False
    if not isinstance(payload, dict):
        return SNAPSHOT_FAILED, "payload_not_object", False

    stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
    errors = payload.get("errors") if isinstance(payload.get("errors"), list) else []
    restate_safe = stats.get("restate_safe")
    if source in _OPTION_C:
        reconciled = reconcile_option_c_restate_safe(payload)
        if reconciled is not None:
            restate_safe = reconciled

    error_count = int(stats.get("error_count") or len(errors) or 0)
    theaters_failed = int(stats.get("theaters_failed") or 0)
    record_count = int(stats.get("record_count") or 0)
    if isinstance(payload.get("records"), list):
        record_count = max(record_count, len(payload["records"]))

    if error_count > 0 or theaters_failed > 0:
        return (
            SNAPSHOT_PARTIAL,
            f"errors_or_theater_failures(error_count={error_count}, theaters_failed={theaters_failed})",
            False,
        )

    if restate_safe is False:
        return SNAPSHOT_PARTIAL, "restate_safe=false", False

    if restate_safe is True:
        # Empty complete scrapes are allowed only with valid_empty_proof.
        if record_count == 0 and not bool(stats.get("valid_empty_proof")):
            # Treat as unknown rather than complete — avoid mass-removal.
            return SNAPSHOT_UNKNOWN, "empty_without_valid_empty_proof", None
        return SNAPSHOT_COMPLETE, None, True

    if restate_safe is None:
        # Older logs without the flag: require records and zero errors.
        if record_count > 0 and error_count == 0:
            return SNAPSHOT_UNKNOWN, "restate_safe_missing_with_records", None
        return SNAPSHOT_UNKNOWN, "restate_safe_missing", None

    return SNAPSHOT_UNKNOWN, f"unexpected_restate_safe={restate_safe!r}", None


def _stable_hash(parts: Iterable[str]) -> str:
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()
    return digest[:20]


def resolve_screening_identity(
    *,
    source: str,
    source_showtime_id: str | None,
    source_film_id: str | None,
    theater_id: str | None,
    local_date: str,
    local_time: str,
    film_key: str | None,
    occurrence_discriminator: str | None = None,
) -> tuple[str, str, str]:
    """Return (screening_id, confidence, method)."""
    sid = (source_showtime_id or "").strip()
    if sid:
        screening_id = f"scr:{source}:sid:{sid}"
        return screening_id, CONFIDENCE_HIGH, "source_showtime_id"

    film_id = (source_film_id or "").strip()
    theater = (theater_id or "").strip()
    disc = (occurrence_discriminator or "").strip()
    if film_id and theater and local_date and local_time:
        token = _stable_hash(
            [source, "med", film_id, theater, local_date, local_time, disc]
        )
        return f"scr:{source}:med:{token}", CONFIDENCE_MEDIUM, "film_theater_datetime"

    if disc and theater and local_date and local_time:
        token = _stable_hash([source, "occ", disc, theater, local_date, local_time])
        return f"scr:{source}:med:{token}", CONFIDENCE_MEDIUM, "occurrence_datetime"

    key = (film_key or "").strip() or "unknown-film"
    theater_part = theater or "unknown-theater"
    token = _stable_hash(
        [source, "low", key, theater_part, local_date, local_time, disc]
    )
    return f"scr:{source}:low:{token}", CONFIDENCE_LOW, "film_key_theater_datetime"


def _as_optional_str(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_local_time(time_raw: str) -> str | None:
    parsed = parse_time(time_raw)
    if parsed is None:
        return None
    return parsed.time_24h


def _normalize_local_date(date_raw: str, *, snapshot_date: str) -> str | None:
    parsed = parse_show_date(date_raw, reference_date=date.fromisoformat(snapshot_date))
    if parsed is None:
        # Try ISO already
        try:
            return date.fromisoformat(str(date_raw).strip()).isoformat()
        except ValueError:
            return None
    if hasattr(parsed, "isoformat"):
        return parsed.isoformat()
    return str(parsed)


def normalize_raw_record(
    *,
    source: str,
    raw: Any,
    snapshot_date: str,
    observed_at: str,
    log_path: str,
    theater_index: Any,
) -> NormalizedObservation | None:
    attrs = raw.attributes if isinstance(getattr(raw, "attributes", None), dict) else {}
    local_date = _as_optional_str(attrs.get("local_date"))
    local_time = _as_optional_str(attrs.get("local_time"))
    if not local_date:
        local_date = _normalize_local_date(raw.date_raw, snapshot_date=snapshot_date)
    if not local_time:
        local_time = _normalize_local_time(raw.time_raw)
    if not local_date or not local_time:
        return None

    theater_name = str(raw.theater_name_raw or "").strip()
    theater_id = _as_optional_str(attrs.get("theater_id"))
    if not theater_id and theater_name:
        resolution = resolve_theater(theater_name, theater_index)
        theater_id = resolution.theater_id if resolution else None

    source_title = source_title_from_raw(raw)
    source_showtime_id = _as_optional_str(source_showtime_id_from_raw(raw)) or None
    source_film_id = _as_optional_str(source_film_id_from_raw(raw)) or None
    film_key = showtime_film_key(source_title)
    parent = derive_parent_identity(
        source_title,
        source_film_id=source_film_id or "",
    )
    occurrence = _as_optional_str(attrs.get("occurrence_discriminator"))
    if not occurrence:
        occurrence = _as_optional_str(raw.ticket_url_raw) or _as_optional_str(
            attrs.get("ticket_url")
        )

    screening_id, confidence, method = resolve_screening_identity(
        source=source,
        source_showtime_id=source_showtime_id,
        source_film_id=source_film_id,
        theater_id=theater_id,
        local_date=local_date,
        local_time=local_time,
        film_key=film_key,
        occurrence_discriminator=occurrence,
    )

    ticket_url = _as_optional_str(raw.ticket_url_raw) or _as_optional_str(
        attrs.get("ticket_url")
    ) or _as_optional_str(attrs.get("purchase_url"))
    format_raw = _as_optional_str(raw.format_raw) or _as_optional_str(
        attrs.get("premium_format_raw")
    )

    return NormalizedObservation(
        screening_id=screening_id,
        identity_confidence=confidence,
        identity_method=method,
        source=source,
        source_showtime_id=source_showtime_id,
        source_film_id=source_film_id,
        showtime_film_key=film_key,
        parent_film_key=parent.parent_film_key or film_key,
        parent_display_title=parent.parent_display_title or source_title,
        theater_id=theater_id,
        theater_name=theater_name,
        local_date=local_date,
        local_time=local_time,
        scheduled_local=f"{local_date}T{local_time}",
        source_title=source_title,
        ticket_url=ticket_url,
        format_raw=format_raw,
        canceled=raw.canceled,
        snapshot_date=snapshot_date,
        observed_at=observed_at,
        log_path=log_path,
    )


def load_snapshot(
    ref: SnapshotRef,
    *,
    theater_index: TheaterIndex | None = None,
) -> tuple[SnapshotStatus, list[NormalizedObservation], Mapping[str, Any] | None]:
    """Load one daily log into snapshot status + normalized observations."""
    index = theater_index or load_theater_index()
    try:
        text = ref.path.read_text(encoding="utf-8")
        payload = json.loads(text)
    except (OSError, json.JSONDecodeError) as exc:
        status = SnapshotStatus(
            source=ref.source,
            snapshot_date=ref.snapshot_date,
            completeness=SNAPSHOT_FAILED,
            generated_at=None,
            record_count=0,
            restate_safe=False,
            error_count=1,
            warning_count=0,
            path=str(ref.path).replace("\\", "/"),
            reason=str(exc),
        )
        return status, [], None

    completeness, reason, restate_safe = classify_snapshot_completeness(
        ref.source, payload if isinstance(payload, dict) else None
    )
    generated_at = None
    record_count = 0
    error_count = 0
    warning_count = 0
    if isinstance(payload, dict):
        generated_at = _as_optional_str(payload.get("generated_at"))
        stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
        errors = payload.get("errors") if isinstance(payload.get("errors"), list) else []
        warnings = (
            payload.get("warnings") if isinstance(payload.get("warnings"), list) else []
        )
        error_count = int(stats.get("error_count") or len(errors) or 0)
        warning_count = int(stats.get("warning_count") or len(warnings) or 0)
        if isinstance(payload.get("records"), list):
            record_count = len(payload["records"])

    status = SnapshotStatus(
        source=ref.source,
        snapshot_date=ref.snapshot_date,
        completeness=completeness,
        generated_at=generated_at,
        record_count=record_count,
        restate_safe=restate_safe,
        error_count=error_count,
        warning_count=warning_count,
        path=str(ref.path).replace("\\", "/"),
        reason=reason,
    )

    observations: list[NormalizedObservation] = []
    if not isinstance(payload, dict):
        return status, observations, None

    try:
        result = load_scrape_daily_log_payload(payload, label=str(ref.path))
    except ScrapeLogError:
        status.completeness = SNAPSHOT_FAILED
        status.reason = "scrape_log_parse_error"
        status.restate_safe = False
        return status, observations, payload

    observed_at = generated_at or f"{ref.snapshot_date}T00:00:00"
    log_path = str(ref.path).replace("\\", "/")
    for raw in result.records:
        obs = normalize_raw_record(
            source=ref.source,
            raw=raw,
            snapshot_date=ref.snapshot_date,
            observed_at=observed_at,
            log_path=log_path,
            theater_index=index,
        )
        if obs is not None:
            observations.append(obs)

    # Deterministic order within a snapshot.
    observations.sort(
        key=lambda item: (
            item.screening_id,
            item.scheduled_local,
            item.source_title,
            item.observation_key(),
        )
    )
    return status, observations, payload


def _attrs_changed(
    previous: Mapping[str, Any], current: Mapping[str, Any]
) -> list[str]:
    changed: list[str] = []
    for key in _TRACKED_ATTR_KEYS:
        if previous.get(key) != current.get(key):
            changed.append(key)
    return changed


def build_ledger_from_logs(
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    *,
    sources: Iterable[str] = KNOWN_SOURCES,
    as_of_date: str | None = None,
    theater_index: TheaterIndex | None = None,
) -> dict[str, Any]:
    """Deterministically rebuild observations + lifecycle from daily logs."""
    refs = list_daily_log_snapshots(logs_dir, sources=sources)
    index = theater_index or load_theater_index()
    source_list = tuple(sources)

    snapshot_statuses: list[SnapshotStatus] = []
    observations: list[NormalizedObservation] = []
    # Deduplicate observation keys while preserving first-seen order.
    observation_keys: set[str] = set()

    lifecycles: dict[str, ScreeningLifecycle] = {}
    # Per-source set of screening_ids last seen on each complete snapshot date.
    last_complete_ids: dict[str, set[str]] = {source: set() for source in source_list}

    for ref in refs:
        status, snapshot_obs, _payload = load_snapshot(ref, theater_index=index)
        snapshot_statuses.append(status)

        present_ids: set[str] = set()
        for obs in snapshot_obs:
            key = obs.observation_key()
            if key in observation_keys:
                continue
            observation_keys.add(key)
            observations.append(obs)
            present_ids.add(obs.screening_id)

            existing = lifecycles.get(obs.screening_id)
            attrs = obs.tracked_attrs()
            if existing is None:
                lifecycles[obs.screening_id] = ScreeningLifecycle(
                    screening_id=obs.screening_id,
                    identity_confidence=obs.identity_confidence,
                    identity_method=obs.identity_method,
                    source=obs.source,
                    source_showtime_id=obs.source_showtime_id,
                    source_film_id=obs.source_film_id,
                    showtime_film_key=obs.showtime_film_key,
                    parent_film_key=obs.parent_film_key,
                    parent_display_title=obs.parent_display_title,
                    theater_id=obs.theater_id,
                    scheduled_local=obs.scheduled_local,
                    first_observed_at=obs.observed_at,
                    last_observed_at=obs.observed_at,
                    first_snapshot_date=obs.snapshot_date,
                    last_snapshot_date=obs.snapshot_date,
                    cancelled_at=obs.snapshot_date if obs.canceled is True else None,
                    observation_count=1,
                    latest_attrs=attrs,
                )
            else:
                if existing.latest_attrs:
                    changed = _attrs_changed(existing.latest_attrs, attrs)
                    if changed:
                        existing.attribute_change_count += 1
                        for field_name in changed:
                            if field_name not in existing.changed_fields:
                                existing.changed_fields.append(field_name)
                # Stable source id: metadata/schedule edits stay on same screening.
                # Provisional ids encode datetime/theater, so a change is a new id.
                if obs.canceled is True and existing.cancelled_at is None:
                    existing.cancelled_at = obs.snapshot_date
                if (
                    existing.removed_at
                    and obs.snapshot_date > existing.removed_at
                    and existing.last_snapshot_date <= existing.removed_at
                ):
                    existing.reappearance_count += 1
                    existing.removed_at = None
                existing.last_observed_at = obs.observed_at
                existing.last_snapshot_date = obs.snapshot_date
                existing.observation_count += 1
                existing.latest_attrs = attrs
                # Prefer parent title / film ids from latest observation.
                existing.parent_film_key = obs.parent_film_key
                existing.parent_display_title = obs.parent_display_title
                existing.showtime_film_key = obs.showtime_film_key
                existing.source_film_id = obs.source_film_id or existing.source_film_id
                existing.theater_id = obs.theater_id or existing.theater_id
                existing.scheduled_local = obs.scheduled_local

        if status.completeness == SNAPSHOT_COMPLETE:
            # Infer removals: previously known future screenings absent now.
            previous_ids = last_complete_ids.get(ref.source, set())
            for screening_id in sorted(previous_ids):
                if screening_id in present_ids:
                    continue
                life = lifecycles.get(screening_id)
                if life is None or life.source != ref.source:
                    continue
                scheduled_date = life.scheduled_local[:10]
                # Only future-as-of-snapshot disappearances count as removals.
                if scheduled_date <= ref.snapshot_date:
                    continue
                if life.cancelled_at:
                    continue
                if life.removed_at is None:
                    life.removed_at = ref.snapshot_date
                    life.removal_events.append(
                        {
                            "removed_at": ref.snapshot_date,
                            "last_seen_snapshot_date": life.last_snapshot_date,
                            "reason": "absent_from_complete_snapshot",
                        }
                    )
            # Refresh source complete set: survivors + new presents that are still future.
            refreshed = {sid for sid in previous_ids if sid in present_ids}
            refreshed.update(present_ids)
            last_complete_ids[ref.source] = {
                sid
                for sid in refreshed
                if lifecycles[sid].scheduled_local[:10] > ref.snapshot_date
            }

    if as_of_date is None:
        as_of_date = max((ref.snapshot_date for ref in refs), default=date.today().isoformat())

    lifecycle_rows: list[dict[str, Any]] = []
    for screening_id in sorted(lifecycles.keys()):
        life = lifecycles[screening_id]
        if life.cancelled_at:
            life.current_status = STATUS_EXPLICITLY_CANCELLED
        else:
            scheduled_date = life.scheduled_local[:10]
            if scheduled_date < as_of_date:
                life.current_status = STATUS_PAST
            elif life.removed_at and life.last_snapshot_date < life.removed_at:
                life.current_status = STATUS_NO_LONGER_OBSERVED
            elif life.removed_at and life.last_snapshot_date >= life.removed_at:
                # Reappeared after a recorded removal.
                life.current_status = STATUS_ACTIVE
            else:
                life.current_status = STATUS_ACTIVE
        lifecycle_rows.append(life.to_dict())

    observations.sort(
        key=lambda item: (
            item.snapshot_date,
            item.source,
            item.screening_id,
            item.scheduled_local,
            item.source_title,
        )
    )
    snapshot_statuses.sort(key=lambda item: (item.snapshot_date, item.source))

    metrics = compute_ledger_metrics(
        snapshots=snapshot_statuses,
        observations=observations,
        lifecycles=lifecycle_rows,
        as_of_date=as_of_date,
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "as_of_date": as_of_date,
        "snapshots": snapshot_statuses,
        "observations": observations,
        "lifecycles": lifecycle_rows,
        "metrics": metrics,
    }


def compute_ledger_metrics(
    *,
    snapshots: list[SnapshotStatus],
    observations: list[NormalizedObservation],
    lifecycles: list[dict[str, Any]],
    as_of_date: str,
) -> dict[str, Any]:
    by_source_files: dict[str, int] = {}
    for snap in snapshots:
        by_source_files[snap.source] = by_source_files.get(snap.source, 0) + 1

    confidence_counts = {CONFIDENCE_HIGH: 0, CONFIDENCE_MEDIUM: 0, CONFIDENCE_LOW: 0}
    status_counts = {
        STATUS_ACTIVE: 0,
        STATUS_PAST: 0,
        STATUS_NO_LONGER_OBSERVED: 0,
        STATUS_EXPLICITLY_CANCELLED: 0,
    }
    provider_screenings: dict[str, int] = {}
    with_source_id = 0
    provisional = 0
    reappearances = 0
    attribute_changes = 0

    for life in lifecycles:
        conf = life.get("identity_confidence")
        if conf in confidence_counts:
            confidence_counts[conf] += 1
        status = life.get("current_status")
        if status in status_counts:
            status_counts[status] += 1
        source = str(life.get("source") or "unknown")
        provider_screenings[source] = provider_screenings.get(source, 0) + 1
        if life.get("source_showtime_id"):
            with_source_id += 1
        else:
            provisional += 1
        reappearances += int(life.get("reappearance_count") or 0)
        attribute_changes += int(life.get("attribute_change_count") or 0)

    dates = [snap.snapshot_date for snap in snapshots]
    return {
        "schema_version": SCHEMA_VERSION,
        "as_of_date": as_of_date,
        "daily_log_files_consumed": len(snapshots),
        "date_range": {
            "start": min(dates) if dates else None,
            "end": max(dates) if dates else None,
        },
        "provider_file_counts": dict(sorted(by_source_files.items())),
        "observation_count": len(observations),
        "unique_screening_count": len(lifecycles),
        "identity_confidence_counts": confidence_counts,
        "lifecycle_status_counts": status_counts,
        "reappearance_count": reappearances,
        "attribute_change_event_count": attribute_changes,
        "screenings_with_source_showtime_id": with_source_id,
        "screenings_provisional_identity": provisional,
        "provider_screening_counts": dict(sorted(provider_screenings.items())),
        "snapshot_completeness_counts": _count_by(
            (snap.completeness for snap in snapshots)
        ),
    }


def _count_by(values: Iterable[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for value in values:
        out[value] = out.get(value, 0) + 1
    return dict(sorted(out.items()))


def _open_text_write(path: Path) -> TextIO[str]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if str(path).endswith(".gz"):
        # mtime=0 keeps rebuilds byte-identical across runs.
        raw = gzip.GzipFile(filename="", mode="wb", fileobj=path.open("wb"), mtime=0)
        return io.TextIOWrapper(raw, encoding="utf-8", newline="\n")
    return path.open("w", encoding="utf-8", newline="\n")


def _open_text_read(path: Path) -> TextIO[str]:
    if str(path).endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8")
    return path.open("r", encoding="utf-8")


def write_ledger_artifacts(
    ledger: Mapping[str, Any],
    *,
    observations_path: Path | str = DEFAULT_OBSERVATIONS_PATH,
    lifecycle_path: Path | str = DEFAULT_LIFECYCLE_PATH,
    snapshot_status_path: Path | str = DEFAULT_SNAPSHOT_STATUS_PATH,
    metrics_path: Path | str = DEFAULT_METRICS_PATH,
) -> dict[str, str]:
    """Write deterministic JSONL/JSON artifacts. Returns written paths.

    Large observation/lifecycle payloads default to ``.jsonl.gz`` so the
    committed artifacts stay under GitHub's 100MB file limit.
    """
    obs_path = Path(observations_path)
    life_path = Path(lifecycle_path)
    snap_path = Path(snapshot_status_path)
    met_path = Path(metrics_path)
    for path in (obs_path, life_path, snap_path, met_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    with _open_text_write(obs_path) as handle:
        for obs in ledger["observations"]:
            row = obs.to_observation_row() if hasattr(obs, "to_observation_row") else obs
            handle.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            )
            handle.write("\n")

    with _open_text_write(snap_path) as handle:
        for snap in ledger["snapshots"]:
            row = snap.to_dict() if hasattr(snap, "to_dict") else snap
            handle.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            )
            handle.write("\n")

    # Lifecycle as JSONL (header + one screening per line) for streaming + gzip.
    with _open_text_write(life_path) as handle:
        header = {
            "schema_version": SCHEMA_VERSION,
            "record_type": "lifecycle_header",
            "as_of_date": ledger["as_of_date"],
            # NOTE: daily logs remain authoritative raw provenance.
            "raw_daily_logs_remain_authoritative": True,
            "screening_count": len(ledger["lifecycles"]),
        }
        handle.write(
            json.dumps(header, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        )
        handle.write("\n")
        for life in ledger["lifecycles"]:
            row = dict(life)
            row["record_type"] = "lifecycle"
            # Drop bulky per-row latest attrs from the durable summary; full
            # attribute history remains in observation rows.
            row.pop("latest_attrs", None)
            handle.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            )
            handle.write("\n")

    met_path.write_text(
        json.dumps(ledger["metrics"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {
        "observations": str(obs_path).replace("\\", "/"),
        "lifecycle": str(life_path).replace("\\", "/"),
        "snapshot_status": str(snap_path).replace("\\", "/"),
        "metrics": str(met_path).replace("\\", "/"),
    }


def rebuild_screening_observation_ledger(
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    *,
    observations_path: Path | str = DEFAULT_OBSERVATIONS_PATH,
    lifecycle_path: Path | str = DEFAULT_LIFECYCLE_PATH,
    snapshot_status_path: Path | str = DEFAULT_SNAPSHOT_STATUS_PATH,
    metrics_path: Path | str = DEFAULT_METRICS_PATH,
    as_of_date: str | None = None,
) -> dict[str, Any]:
    """Rebuild ledger artifacts from daily logs (idempotent)."""
    ledger = build_ledger_from_logs(logs_dir, as_of_date=as_of_date)
    written = write_ledger_artifacts(
        ledger,
        observations_path=observations_path,
        lifecycle_path=lifecycle_path,
        snapshot_status_path=snapshot_status_path,
        metrics_path=metrics_path,
    )
    return {"metrics": ledger["metrics"], "written": written, "as_of_date": ledger["as_of_date"]}


def explain_screening_observation(
    lifecycle_path: Path | str,
    screening_id: str,
) -> dict[str, Any] | None:
    """Small Leaving-Soon-ready helper: first/last/absent reconstruction."""
    path = Path(lifecycle_path)
    if not path.is_file():
        return None
    with _open_text_read(path) as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("record_type") == "lifecycle_header":
                continue
            if row.get("screening_id") != screening_id:
                continue
            return {
                "screening_id": screening_id,
                "first_seen_on": row.get("first_snapshot_date"),
                "last_seen_on": row.get("last_snapshot_date"),
                "absent_by": row.get("removed_at"),
                "current_status": row.get("current_status"),
                "scheduled_local": row.get("scheduled_local"),
                "source": row.get("source"),
                "identity_confidence": row.get("identity_confidence"),
            }
    return None