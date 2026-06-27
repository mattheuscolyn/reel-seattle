"""AMC theater allowlist filtering against the theater registry."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.normalize.theaters import _normalize_lookup_key

DEFAULT_REGISTRY_PATH = Path("data/theaters.json")


@dataclass(frozen=True, slots=True)
class AmcAllowlistIndex:
    """Lookup tables for enabled/disabled AMC registry entries."""

    enabled_by_external_id: Mapping[str, dict[str, Any]]
    disabled_by_external_id: Mapping[str, dict[str, Any]]
    enabled_by_name: Mapping[str, dict[str, Any]]
    disabled_by_name: Mapping[str, dict[str, Any]]


@dataclass
class AmcAllowlistStats:
    included: int = 0
    disabled: int = 0
    unknown: int = 0

    def as_message(self) -> str:
        return (
            f"AMC allowlist: {self.included} enabled theaters included, "
            f"{self.disabled} disabled registry matches skipped, "
            f"{self.unknown} unknown theaters skipped"
        )


def load_theater_registry(registry_path: Path | str = DEFAULT_REGISTRY_PATH) -> dict[str, Any]:
    path = Path(registry_path)
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_amc_allowlist_index(registry: Mapping[str, Any]) -> AmcAllowlistIndex:
    """Build AMC-specific allowlist indexes from a parsed registry document."""
    enabled_by_external_id: dict[str, dict[str, Any]] = {}
    disabled_by_external_id: dict[str, dict[str, Any]] = {}
    enabled_by_name: dict[str, dict[str, Any]] = {}
    disabled_by_name: dict[str, dict[str, Any]] = {}

    for entry in registry.get("theaters", []):
        if not isinstance(entry, dict):
            continue
        if entry.get("source") != "amc":
            continue

        enabled = bool(entry.get("enabled", False))
        external_id = entry.get("source_external_id")
        if external_id not in (None, ""):
            target = enabled_by_external_id if enabled else disabled_by_external_id
            target[str(external_id)] = entry

        for key in [entry.get("name"), *entry.get("aliases", [])]:
            if not key:
                continue
            lookup = _normalize_lookup_key(str(key))
            target = enabled_by_name if enabled else disabled_by_name
            target[lookup] = entry

    return AmcAllowlistIndex(
        enabled_by_external_id=enabled_by_external_id,
        disabled_by_external_id=disabled_by_external_id,
        enabled_by_name=enabled_by_name,
        disabled_by_name=disabled_by_name,
    )


def classify_amc_api_theater(
    api_theater: Mapping[str, Any],
    index: AmcAllowlistIndex,
) -> tuple[str, dict[str, Any] | None]:
    """Classify an AMC API theater as ``included``, ``disabled``, or ``unknown``."""
    api_id = str(api_theater.get("id", "")).strip()
    if api_id:
        if api_id in index.enabled_by_external_id:
            return "included", index.enabled_by_external_id[api_id]
        if api_id in index.disabled_by_external_id:
            return "disabled", index.disabled_by_external_id[api_id]

    long_name = str(api_theater.get("longName", "")).strip()
    if long_name:
        lookup = _normalize_lookup_key(long_name)
        if lookup in index.enabled_by_name:
            return "included", index.enabled_by_name[lookup]
        if lookup in index.disabled_by_name:
            return "disabled", index.disabled_by_name[lookup]

    return "unknown", None


def is_enabled_amc_theater(
    api_theater: Mapping[str, Any],
    registry: Mapping[str, Any] | AmcAllowlistIndex,
) -> bool:
    """Return True when *api_theater* matches an enabled AMC registry entry."""
    index = registry if isinstance(registry, AmcAllowlistIndex) else build_amc_allowlist_index(registry)
    status, _entry = classify_amc_api_theater(api_theater, index)
    return status == "included"


def filter_enabled_amc_theaters(
    api_theaters: list[Mapping[str, Any]],
    registry: Mapping[str, Any] | AmcAllowlistIndex,
) -> tuple[dict[str, str], AmcAllowlistStats]:
    """Return AMC API id → canonical registry name for enabled theaters only."""
    index = registry if isinstance(registry, AmcAllowlistIndex) else build_amc_allowlist_index(registry)
    allowed: dict[str, str] = {}
    stats = AmcAllowlistStats()

    for api_theater in api_theaters:
        status, entry = classify_amc_api_theater(api_theater, index)
        if status == "included" and entry is not None:
            allowed[str(api_theater["id"])] = str(entry["name"])
            stats.included += 1
        elif status == "disabled":
            stats.disabled += 1
        else:
            stats.unknown += 1

    return allowed, stats
