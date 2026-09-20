"""Durable cross-source performance identity for physical screenings.

Maps strong source/occurrence aliases to one stable ``performance_id`` so
Grand Illusion fallback rows and later host-backed rows share the same
Reel Seattle opportunity / Planner identity.
"""

from __future__ import annotations

from reel_seattle.performance_identity.attach import attach_performance_ids
from reel_seattle.performance_identity.catalog import (
    DEFAULT_REGISTRY_PATH,
    PerformanceIdentityRegistry,
    load_registry,
    save_registry,
)
from reel_seattle.performance_identity.ids import (
    gi_performance_id,
    host_compatible_performance_id,
    is_valid_performance_id,
)

__all__ = [
    "DEFAULT_REGISTRY_PATH",
    "PerformanceIdentityRegistry",
    "attach_performance_ids",
    "gi_performance_id",
    "host_compatible_performance_id",
    "is_valid_performance_id",
    "load_registry",
    "save_registry",
]
