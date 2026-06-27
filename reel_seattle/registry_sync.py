"""Sync canonical theater registry to the deployed public copy."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from reel_seattle.validate import validate_theaters_registry

DEFAULT_CANONICAL_REGISTRY_PATH = Path("data/theaters.json")
DEFAULT_PUBLIC_REGISTRY_PATH = Path("public/data/theaters.json")


@dataclass(frozen=True)
class RegistrySyncResult:
    """Outcome of syncing the public theater registry copy."""

    action: str  # "updated" | "unchanged"
    canonical_path: Path
    public_path: Path


def sync_public_theaters_registry(
    canonical_path: Path | str = DEFAULT_CANONICAL_REGISTRY_PATH,
    public_path: Path | str = DEFAULT_PUBLIC_REGISTRY_PATH,
) -> RegistrySyncResult:
    """Validate canonical ``data/theaters.json`` and copy bytes to ``public/data/theaters.json``."""
    canonical = Path(canonical_path)
    public = Path(public_path)

    if not canonical.is_file():
        raise FileNotFoundError(f"Theater registry not found: {canonical}")

    canonical_bytes = canonical.read_bytes()
    try:
        registry = json.loads(canonical_bytes.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise ValueError(f"Invalid theater registry encoding in {canonical}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid theater registry JSON in {canonical}: {exc.msg}") from exc

    validate_theaters_registry(registry)

    if public.is_file() and public.read_bytes() == canonical_bytes:
        return RegistrySyncResult("unchanged", canonical, public)

    public.parent.mkdir(parents=True, exist_ok=True)
    public.write_bytes(canonical_bytes)
    return RegistrySyncResult("updated", canonical, public)
