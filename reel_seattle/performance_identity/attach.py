"""Attach stable ``performance_id`` values to showtimes (GI-related)."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Sequence

from reel_seattle.ingestion.grand_illusion_reconcile import (
    film_identity_keys,
    identities_compatible,
    occurrence_slot,
)
from reel_seattle.performance_identity.catalog import (
    DEFAULT_REGISTRY_PATH,
    PerformanceIdentityRegistry,
    load_registry,
    save_registry,
)
from reel_seattle.performance_identity.constants import GI_SOURCE, HOST_SOURCES
from reel_seattle.performance_identity.ids import (
    gi_alias,
    gi_performance_id,
    host_compatible_performance_id,
    public_alias,
)


def _source_occurrence_id(showtime: Mapping[str, Any]) -> str | None:
    """Durable GI occurrence id from public field or attributes."""
    raw = showtime.get("source_showtime_id")
    if raw not in (None, "", "null"):
        return str(raw).strip()
    attrs = showtime.get("attributes")
    if isinstance(attrs, Mapping):
        for key in ("source_occurrence_id", "source_showtime_id"):
            value = attrs.get(key)
            if value not in (None, "", "null"):
                return str(value).strip()
    return None


def _is_gi(showtime: Mapping[str, Any]) -> bool:
    return str(showtime.get("source") or "").strip().casefold() == GI_SOURCE


def _is_host(showtime: Mapping[str, Any]) -> bool:
    return str(showtime.get("source") or "").strip().casefold() in HOST_SOURCES


def attach_performance_ids(
    showtimes: Sequence[MutableMapping[str, Any]],
    *,
    registry_path: Path | str | None = None,
    reference_date: date | None = None,
    persist: bool = True,
    registry: PerformanceIdentityRegistry | None = None,
) -> dict[str, Any]:
    """Assign ``performance_id`` for GI-related performances and persist registry.

    Non-GI showtimes without a GI relation are left without ``performance_id``
    so HomeData continues to use existing opportunity-key fallbacks.

    Assignment rules:
    - Host already in registry / host-first: ``id:<public_showtime_id>``
    - GI-only first observation: ``xsrc:grand-illusion:<hash(occurrence)>``
    - Host appears later: inherits persisted GI-first identity via aliases/slot
    - Simultaneous: prefer host-compatible identity
    """
    path = Path(registry_path) if registry_path is not None else DEFAULT_REGISTRY_PATH
    reg = registry or PerformanceIdentityRegistry(load_registry(path))
    seen_on = (reference_date or date.today()).isoformat()

    hosts = [row for row in showtimes if _is_host(row)]
    gi_rows = [row for row in showtimes if _is_gi(row)]

    by_slot: dict[tuple[str, str, str], list[MutableMapping[str, Any]]] = {}
    for host in hosts:
        slot = occurrence_slot(host)
        if slot is None:
            continue
        by_slot.setdefault(slot, []).append(host)

    # Classify GI rows against hosts (same rules as reconcile).
    matched: list[tuple[MutableMapping[str, Any], MutableMapping[str, Any]]] = []
    unmatched_gi: list[MutableMapping[str, Any]] = []
    ambiguous_gi: list[MutableMapping[str, Any]] = []

    for gi in gi_rows:
        slot = occurrence_slot(gi)
        if slot is None:
            continue
        candidates = by_slot.get(slot) or []
        matches = [h for h in candidates if identities_compatible(gi, h)]
        if len(matches) == 1:
            matched.append((gi, matches[0]))
        elif len(matches) > 1:
            ambiguous_gi.append(gi)
        else:
            unmatched_gi.append(gi)

    report: dict[str, Any] = {
        "matched": 0,
        "unmatched_gi": 0,
        "ambiguous": 0,
        "registry_upserts": 0,
        "inherited_from_registry": 0,
    }

    # --- Matched pairs (simultaneous or host already present) ---
    for gi, host in matched:
        host_id = str(host.get("id") or "").strip()
        occ = _source_occurrence_id(gi)
        aliases = []
        if host_id:
            aliases.append(public_alias(host_id))
        if occ:
            aliases.append(gi_alias(occ))
        gi_public = str(gi.get("id") or "").strip()
        if gi_public:
            aliases.append(public_alias(gi_public))

        # Prefer existing registry identity (GI-first continuity).
        existing = None
        for alias in aliases:
            existing = reg.get_by_alias(alias)
            if existing:
                break
        if existing is None and occ:
            existing = reg.get_by_alias(gi_alias(occ))
        if existing is None and slot_keys_ok(gi):
            slot = occurrence_slot(gi)
            assert slot is not None
            existing = reg.find_by_slot_and_film(
                theater_id=slot[0],
                local_date=slot[1],
                local_time=slot[2],
                film_keys=film_identity_keys(gi) | film_identity_keys(host),
            )

        if existing is not None:
            perf_id = str(existing["performance_id"])
            report["inherited_from_registry"] += 1
        else:
            # Simultaneous / host-first: preserve host opportunity identity.
            perf_id = host_compatible_performance_id(host_id)

        slot = occurrence_slot(host) or occurrence_slot(gi)
        assert slot is not None
        _, changed = reg.upsert(
            performance_id=perf_id,
            theater_id=slot[0],
            local_date=slot[1],
            local_time=slot[2],
            aliases=aliases,
            film_id=_opt_str(host.get("film_id")) or _opt_str(gi.get("film_id")),
            parent_film_key=_opt_str(host.get("parent_film_key"))
            or _opt_str(gi.get("parent_film_key")),
            film_keys=film_identity_keys(host) | film_identity_keys(gi),
            seen_on=seen_on,
        )
        host["performance_id"] = perf_id
        gi["performance_id"] = perf_id
        report["matched"] += 1
        if changed:
            report["registry_upserts"] += 1

    # --- Unmatched GI (publishable fallbacks) ---
    for gi in unmatched_gi:
        occ = _source_occurrence_id(gi)
        if not occ:
            # Without durable occurrence id we cannot assign a stable identity.
            continue
        slot = occurrence_slot(gi)
        if slot is None:
            continue
        aliases = [gi_alias(occ)]
        gi_public = str(gi.get("id") or "").strip()
        if gi_public:
            aliases.append(public_alias(gi_public))

        existing = reg.get_by_alias(gi_alias(occ))
        if existing is None:
            existing = reg.find_by_slot_and_film(
                theater_id=slot[0],
                local_date=slot[1],
                local_time=slot[2],
                film_keys=film_identity_keys(gi),
            )

        if existing is not None:
            perf_id = str(existing["performance_id"])
            report["inherited_from_registry"] += 1
        else:
            perf_id = gi_performance_id(occ)

        _, changed = reg.upsert(
            performance_id=perf_id,
            theater_id=slot[0],
            local_date=slot[1],
            local_time=slot[2],
            aliases=aliases,
            film_id=_opt_str(gi.get("film_id")),
            parent_film_key=_opt_str(gi.get("parent_film_key")),
            film_keys=film_identity_keys(gi),
            seen_on=seen_on,
        )
        gi["performance_id"] = perf_id
        report["unmatched_gi"] += 1
        if changed:
            report["registry_upserts"] += 1

    report["ambiguous"] = len(ambiguous_gi)

    # --- Host rows that may inherit a prior GI-first identity (GI disappeared) ---
    matched_host_ids = {id(host) for _, host in matched}
    for host in hosts:
        if id(host) in matched_host_ids:
            continue
        if host.get("performance_id"):
            continue
        slot = occurrence_slot(host)
        if slot is None:
            continue
        host_id = str(host.get("id") or "").strip()
        existing = None
        if host_id:
            existing = reg.get_by_alias(public_alias(host_id))
        if existing is None:
            existing = reg.find_by_slot_and_film(
                theater_id=slot[0],
                local_date=slot[1],
                local_time=slot[2],
                film_keys=film_identity_keys(host),
            )
        if existing is None:
            continue
        # Only inherit when registry row looks GI-related (has GI alias or xsrc id).
        aliases = existing.get("aliases") or []
        perf_id = str(existing["performance_id"])
        has_gi_alias = any(str(a).startswith("grand_illusion:") for a in aliases)
        is_xsrc = perf_id.startswith("xsrc:grand-illusion:")
        if not (has_gi_alias or is_xsrc):
            continue
        new_aliases = list(aliases)
        if host_id:
            new_aliases.append(public_alias(host_id))
        _, changed = reg.upsert(
            performance_id=perf_id,
            theater_id=slot[0],
            local_date=slot[1],
            local_time=slot[2],
            aliases=new_aliases,
            film_id=_opt_str(host.get("film_id")),
            parent_film_key=_opt_str(host.get("parent_film_key")),
            film_keys=film_identity_keys(host),
            seen_on=seen_on,
        )
        host["performance_id"] = perf_id
        report["inherited_from_registry"] += 1
        if changed:
            report["registry_upserts"] += 1

    material = report["registry_upserts"] > 0
    if persist and material:
        reg.touch_generated_at()
        # Deterministic row order for stable serialization / git diffs.
        reg.payload["performances"] = sorted(
            reg.payload["performances"],
            key=lambda row: str(row.get("performance_id") or ""),
        )
        save_registry(reg.payload, path)
    elif persist and not Path(path).exists():
        # Ensure the empty registry artifact exists for first-time setup.
        save_registry(reg.payload, path)
    report["registry_path"] = str(path)
    report["registry_persisted"] = bool(persist and (material or not Path(path).exists()))
    return report


def slot_keys_ok(showtime: Mapping[str, Any]) -> bool:
    return occurrence_slot(showtime) is not None


def _opt_str(value: object) -> str | None:
    if value in (None, "", "null"):
        return None
    text = str(value).strip()
    return text or None
