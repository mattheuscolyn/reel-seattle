"""Cross-source reconciliation for Grand Illusion programmer occurrences.

When Grand Illusion and a host venue source describe the same physical
screening, keep ONE user-visible showtime:

- Prefer the host venue's native record (stronger venue/ticket identity).
- Attach Grand Illusion presenter provenance under ``attributes.presenters``.
- Do not overwrite richer host facts with weaker GI data.

Matching requires strong evidence only:
same theater_id + local date + local time + film identity via film_id
(when both sides have one) or presentation-stripped parent title keys.
Never fuzzy-match titles.

Unmatched GI occurrences are retained in the Grand Illusion daily log /
history for audit and Coming Soon readiness, but are NOT published as
fallback public showtimes in this PR. Publishing GI-only rows would create
Planner identity churn when a host record appears later under a different
``showtime_film_key`` while ``make_showtime_id`` stays theater|date|time|film_key.
Fallback publication requires a stable cross-source performance identity
that does not churn existing AMC/SIFF/Beacon/NWFF/Central IDs.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, MutableMapping, Sequence

from reel_seattle.film_identity.presentation import normalize_match_title
from reel_seattle.normalize import showtime_film_key
from reel_seattle.prototypes.grand_illusion import PRESENTER_ID, PRESENTER_NAME

GI_SOURCE = "grand_illusion"
HOST_SOURCES = frozenset({"siff", "beacon", "nwff", "central_cinema"})


def parent_identity_key(title: str | None, *, source: str | None = None) -> str | None:
    """Deterministic parent key from presentation-stripped title.

    Also strips trailing ``in 35mm`` / ``in 16mm`` phrasing used by Grand Illusion
    titles so they share a parent key with host titles like ``The Hole (35mm)``.
    """
    if not title:
        return None
    text = str(title)
    # Explicit format-in-title variants before general presentation cleanup.
    text = re.sub(
        r"\s+in\s+(?:35|16|70)\s*mm\b",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()
    cleaned = normalize_match_title(text, source=source) or text
    cleaned = re.sub(
        r"\s+in\s+(?:35|16|70)\s*mm\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    if not cleaned:
        return None
    return showtime_film_key(cleaned)


def film_identity_keys(showtime: Mapping[str, Any]) -> set[str]:
    """Collect strong identity keys for reconciliation (not fuzzy titles)."""
    keys: set[str] = set()
    film_id = showtime.get("film_id")
    if film_id not in (None, "", "null"):
        keys.add(f"film_id:{film_id}")

    parent = showtime.get("parent_film_key")
    if parent not in (None, "", "null"):
        keys.add(f"parent:{parent}")

    for field in ("film_title", "source_title", "showtime_film_key"):
        title = showtime.get(field)
        if not title:
            continue
        source = str(showtime.get("source") or "") or None
        parent_key = parent_identity_key(str(title), source=source)
        if parent_key:
            keys.add(f"parent:{parent_key}")
        raw_key = showtime_film_key(str(title))
        if raw_key:
            keys.add(f"raw:{raw_key}")
    return keys


def identities_compatible(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    left_keys = film_identity_keys(left)
    right_keys = film_identity_keys(right)
    if not left_keys or not right_keys:
        return False
    # Prefer film_id / parent overlap; raw keys alone only count when both
    # sides share an exact raw key AND at least one presentation-stripped
    # parent key also overlaps (prevents pure fuzzy/title accidents).
    left_strong = {k for k in left_keys if k.startswith(("film_id:", "parent:"))}
    right_strong = {k for k in right_keys if k.startswith(("film_id:", "parent:"))}
    if left_strong & right_strong:
        return True
    return False


def occurrence_slot(showtime: Mapping[str, Any]) -> tuple[str, str, str] | None:
    theater_id = str(showtime.get("theater_id") or "").strip()
    local_date = str(showtime.get("date") or "").strip()
    local_time = str(showtime.get("time") or "").strip()
    if not (theater_id and local_date and local_time):
        return None
    return theater_id, local_date, local_time


def _presenter_from_gi(showtime: Mapping[str, Any]) -> dict[str, str]:
    attrs = showtime.get("attributes") if isinstance(showtime.get("attributes"), Mapping) else {}
    presenters = attrs.get("presenters") if isinstance(attrs, Mapping) else None
    if isinstance(presenters, list) and presenters:
        first = presenters[0]
        if isinstance(first, Mapping) and first.get("id"):
            return {
                "id": str(first.get("id")),
                "name": str(first.get("name") or PRESENTER_NAME),
                "source_url": str(first.get("source_url") or ""),
            }
    program_url = ""
    if isinstance(attrs, Mapping):
        program_url = str(attrs.get("program_url") or "")
    if not program_url:
        program_url = str(showtime.get("source_title") or "")
    return {
        "id": PRESENTER_ID,
        "name": PRESENTER_NAME,
        "source_url": program_url if program_url.startswith("http") else "",
    }


def attach_presenter(
    host: MutableMapping[str, Any],
    gi: Mapping[str, Any],
) -> None:
    attrs = host.get("attributes")
    if not isinstance(attrs, dict):
        attrs = {}
        host["attributes"] = attrs
    presenters = attrs.get("presenters")
    if not isinstance(presenters, list):
        presenters = []
        attrs["presenters"] = presenters
    incoming = _presenter_from_gi(gi)
    existing_ids = {
        str(item.get("id"))
        for item in presenters
        if isinstance(item, Mapping) and item.get("id")
    }
    if incoming["id"] not in existing_ids:
        presenters.append(incoming)
    # Safe fill-only for missing host ticket_url from GI ticket target.
    if not host.get("ticket_url"):
        gi_attrs = gi.get("attributes") if isinstance(gi.get("attributes"), Mapping) else {}
        ticket = None
        if isinstance(gi_attrs, Mapping):
            ticket = gi_attrs.get("ticket_url")
        if ticket:
            host["ticket_url"] = ticket


def reconcile_grand_illusion_showtimes(
    showtimes: Sequence[MutableMapping[str, Any]],
) -> list[MutableMapping[str, Any]]:
    """Return public showtimes with GI duplicates suppressed and presenters attached.

    Unmatched GI rows are omitted from the public list (retained upstream in
    history / daily logs only).
    """
    hosts: list[MutableMapping[str, Any]] = []
    gi_rows: list[MutableMapping[str, Any]] = []
    others: list[MutableMapping[str, Any]] = []

    for row in showtimes:
        source = str(row.get("source") or "").strip().casefold()
        if source == GI_SOURCE:
            gi_rows.append(row)
        elif source in HOST_SOURCES:
            hosts.append(row)
            others.append(row)
        else:
            others.append(row)

    if not gi_rows:
        return list(showtimes)

    # Index hosts by occurrence slot.
    by_slot: dict[tuple[str, str, str], list[MutableMapping[str, Any]]] = {}
    for host in hosts:
        slot = occurrence_slot(host)
        if slot is None:
            continue
        by_slot.setdefault(slot, []).append(host)

    matched_gi_ids: set[str] = set()
    for gi in gi_rows:
        slot = occurrence_slot(gi)
        if slot is None:
            continue
        candidates = by_slot.get(slot) or []
        matches = [host for host in candidates if identities_compatible(gi, host)]
        if len(matches) == 1:
            attach_presenter(matches[0], gi)
            matched_gi_ids.add(str(gi.get("id") or id(gi)))
        elif len(matches) > 1:
            # Ambiguous — do not attach; leave GI unpublished.
            continue
        # zero matches → unmatched; omit from public emit

    # Public list: all non-GI rows (with presenters updated on matched hosts).
    # Explicitly drop all GI rows from public output in this PR.
    return others
