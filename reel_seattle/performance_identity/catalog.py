"""Load / save / upsert the durable performance identity registry."""

from __future__ import annotations

import copy
from datetime import date, datetime
from pathlib import Path
from typing import Any, Mapping, MutableMapping

from reel_seattle.film_identity.io_util import atomic_write_json
from reel_seattle.performance_identity.constants import (
    DEFAULT_REGISTRY_REL,
    SCHEMA_VERSION,
)
from reel_seattle.performance_identity.ids import is_valid_performance_id

DEFAULT_REGISTRY_PATH = DEFAULT_REGISTRY_REL


class PerformanceIdentityError(ValueError):
    """Raised when the registry is malformed or an identity rule is violated."""


def empty_registry(*, generated_at: str | None = None) -> dict[str, Any]:
    stamp = generated_at or datetime.now().isoformat(timespec="seconds")
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "performances": [],
    }


def load_registry(path: Path | str | None = None) -> dict[str, Any]:
    """Load registry JSON; missing file yields empty valid registry."""
    target = Path(path) if path is not None else DEFAULT_REGISTRY_PATH
    if not target.exists():
        return empty_registry()
    import json

    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PerformanceIdentityError(
            f"Malformed performance identity registry at {target}: {exc}"
        ) from exc
    validate_registry(payload)
    return payload


def save_registry(payload: Mapping[str, Any], path: Path | str | None = None) -> Path:
    target = Path(path) if path is not None else DEFAULT_REGISTRY_PATH
    validate_registry(payload)
    # Deterministic serialization via atomic_write_json (sort_keys=True).
    atomic_write_json(target, payload)
    return target


def validate_registry(payload: Mapping[str, Any]) -> None:
    if not isinstance(payload, Mapping):
        raise PerformanceIdentityError("registry must be an object")
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise PerformanceIdentityError(
            f"unsupported schema_version: {payload.get('schema_version')!r}"
        )
    performances = payload.get("performances")
    if not isinstance(performances, list):
        raise PerformanceIdentityError("performances must be an array")

    seen_ids: set[str] = set()
    alias_owner: dict[str, str] = {}
    for index, row in enumerate(performances):
        if not isinstance(row, Mapping):
            raise PerformanceIdentityError(f"performances[{index}] must be an object")
        perf_id = row.get("performance_id")
        if not is_valid_performance_id(perf_id):
            raise PerformanceIdentityError(
                f"performances[{index}].performance_id invalid: {perf_id!r}"
            )
        assert isinstance(perf_id, str)
        if perf_id in seen_ids:
            raise PerformanceIdentityError(f"duplicate performance_id: {perf_id}")
        seen_ids.add(perf_id)

        for field in ("theater_id", "local_date", "local_time"):
            value = row.get(field)
            if not isinstance(value, str) or not value.strip():
                raise PerformanceIdentityError(
                    f"performances[{index}].{field} required"
                )

        aliases = row.get("aliases")
        if not isinstance(aliases, list) or not aliases:
            raise PerformanceIdentityError(
                f"performances[{index}].aliases must be a non-empty array"
            )
        for alias in aliases:
            if not isinstance(alias, str) or not alias.strip():
                raise PerformanceIdentityError(
                    f"performances[{index}] has empty alias"
                )
            owner = alias_owner.get(alias)
            if owner is not None and owner != perf_id:
                raise PerformanceIdentityError(
                    f"alias collision: {alias!r} claimed by {owner} and {perf_id}"
                )
            alias_owner[alias] = perf_id


class PerformanceIdentityRegistry:
    """In-memory mutable view over the durable registry."""

    def __init__(self, payload: MutableMapping[str, Any] | None = None) -> None:
        base = payload if payload is not None else empty_registry()
        validate_registry(base)
        self._payload: dict[str, Any] = copy.deepcopy(dict(base))
        self._by_id: dict[str, dict[str, Any]] = {}
        self._by_alias: dict[str, str] = {}
        self._rebuild_indexes()

    def _rebuild_indexes(self) -> None:
        self._by_id.clear()
        self._by_alias.clear()
        for row in self._payload["performances"]:
            perf_id = str(row["performance_id"])
            self._by_id[perf_id] = row
            for alias in row.get("aliases") or []:
                self._by_alias[str(alias)] = perf_id

    @property
    def payload(self) -> dict[str, Any]:
        return self._payload

    def get_by_alias(self, alias: str) -> dict[str, Any] | None:
        perf_id = self._by_alias.get(alias)
        if perf_id is None:
            return None
        return self._by_id.get(perf_id)

    def get_by_id(self, performance_id: str) -> dict[str, Any] | None:
        return self._by_id.get(performance_id)

    def find_by_slot_and_film(
        self,
        *,
        theater_id: str,
        local_date: str,
        local_time: str,
        film_keys: set[str],
    ) -> dict[str, Any] | None:
        """Locate a unique registry row for a physical slot + film identity.

        Used when GI disappears and a host row appears later. Requires strong
        film key overlap with stored film_id / parent_film_key / film_keys.
        Returns None when zero or multiple candidates match (fail closed).
        """
        matches: list[dict[str, Any]] = []
        for row in self._payload["performances"]:
            if (
                str(row.get("theater_id") or "") != theater_id
                or str(row.get("local_date") or "") != local_date
                or str(row.get("local_time") or "") != local_time
            ):
                continue
            stored = set(row.get("film_keys") or [])
            if row.get("film_id") not in (None, "", "null"):
                stored.add(f"film_id:{row['film_id']}")
            if row.get("parent_film_key") not in (None, "", "null"):
                stored.add(f"parent:{row['parent_film_key']}")
            if not stored or not film_keys:
                continue
            if stored & film_keys:
                matches.append(row)
        if len(matches) == 1:
            return matches[0]
        return None

    def upsert(
        self,
        *,
        performance_id: str,
        theater_id: str,
        local_date: str,
        local_time: str,
        aliases: list[str],
        film_id: str | None = None,
        parent_film_key: str | None = None,
        film_keys: set[str] | None = None,
        seen_on: str | None = None,
    ) -> tuple[dict[str, Any], bool]:
        """Create or extend a performance identity.

        Never overwrites an existing ``performance_id`` with a different one
        for the same alias. Extends aliases / film keys additively.

        Returns ``(row, changed)`` where ``changed`` is True only when identity
        evidence materially changed (new row, new alias, new film key, or
        first-time film_id/parent fill). Timestamp-only touches do not count.
        """
        if not is_valid_performance_id(performance_id):
            raise PerformanceIdentityError(f"invalid performance_id: {performance_id!r}")

        today = seen_on or date.today().isoformat()
        cleaned_aliases = sorted({a.strip() for a in aliases if a and str(a).strip()})
        if not cleaned_aliases:
            raise PerformanceIdentityError("at least one alias is required")

        # Resolve collisions: aliases must not point at a different identity.
        existing_ids: set[str] = set()
        for alias in cleaned_aliases:
            owner = self._by_alias.get(alias)
            if owner is not None:
                existing_ids.add(owner)
        if len(existing_ids) > 1:
            raise PerformanceIdentityError(
                f"alias collision across performance ids: {sorted(existing_ids)}"
            )
        if existing_ids and performance_id not in existing_ids:
            raise PerformanceIdentityError(
                f"refusing to rebind aliases from {sorted(existing_ids)[0]} "
                f"to {performance_id}"
            )

        row = self._by_id.get(performance_id)
        if row is None and existing_ids:
            # Aliases already owned by this id under a prior upsert path.
            row = self._by_id[next(iter(existing_ids))]

        if row is None:
            row = {
                "performance_id": performance_id,
                "theater_id": theater_id,
                "local_date": local_date,
                "local_time": local_time,
                "film_id": film_id,
                "parent_film_key": parent_film_key,
                "film_keys": sorted(film_keys or []),
                "aliases": cleaned_aliases,
                "first_seen_at": today,
                "last_seen_at": today,
            }
            self._payload["performances"].append(row)
            self._rebuild_indexes()
            validate_registry(self._payload)
            return row, True

        # Stable identity: never change performance_id; never move slot.
        if (
            str(row.get("theater_id")) != theater_id
            or str(row.get("local_date")) != local_date
            or str(row.get("local_time")) != local_time
        ):
            raise PerformanceIdentityError(
                f"performance_id {performance_id} slot mismatch"
            )

        changed = False
        alias_set = set(row.get("aliases") or [])
        before_aliases = set(alias_set)
        alias_set.update(cleaned_aliases)
        if alias_set != before_aliases:
            row["aliases"] = sorted(alias_set)
            changed = True
        else:
            # Keep aliases sorted deterministically even on no-op.
            row["aliases"] = sorted(alias_set)

        key_set = set(row.get("film_keys") or [])
        before_keys = set(key_set)
        if film_keys:
            key_set.update(film_keys)
        if key_set != before_keys:
            row["film_keys"] = sorted(key_set)
            changed = True
        else:
            row["film_keys"] = sorted(key_set)

        # Enrich film_id / parent only when previously empty (no churn of id).
        if row.get("film_id") in (None, "", "null") and film_id not in (
            None,
            "",
            "null",
        ):
            row["film_id"] = film_id
            changed = True
        if row.get("parent_film_key") in (None, "", "null") and parent_film_key not in (
            None,
            "",
            "null",
        ):
            row["parent_film_key"] = parent_film_key
            changed = True

        if changed:
            row["last_seen_at"] = today

        self._rebuild_indexes()
        validate_registry(self._payload)
        return row, changed

    def touch_generated_at(self, stamp: str | None = None) -> None:
        self._payload["generated_at"] = stamp or datetime.now().isoformat(
            timespec="seconds"
        )
