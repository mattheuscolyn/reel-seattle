"""Screening observation lifecycle ledger (P0C).

Rebuildable from ``data/daily_logs/``. Daily logs remain authoritative raw
provenance until this ledger has been validated in production — do not delete
or compact them based on ledger presence alone.

Product surfaces (Home / Showtimes / Planner) do NOT read this ledger yet.
"""

from __future__ import annotations

SCHEMA_VERSION = "1.0.0"

KNOWN_SOURCES = ("amc", "siff", "beacon", "nwff", "central_cinema")

STATUS_ACTIVE = "active"
STATUS_PAST = "past"
STATUS_NO_LONGER_OBSERVED = "no_longer_observed"
STATUS_EXPLICITLY_CANCELLED = "explicitly_cancelled"

CONFIDENCE_HIGH = "high"
CONFIDENCE_MEDIUM = "medium"
CONFIDENCE_LOW = "low"

SNAPSHOT_COMPLETE = "complete"
SNAPSHOT_PARTIAL = "partial"
SNAPSHOT_FAILED = "failed"
SNAPSHOT_UNKNOWN = "unknown"
SNAPSHOT_MISSING = "missing"

DEFAULT_OBSERVATIONS_PATH = "data/history/screening_observations.jsonl.gz"
DEFAULT_LIFECYCLE_PATH = "data/history/screening_lifecycle.jsonl.gz"
DEFAULT_SNAPSHOT_STATUS_PATH = "data/history/screening_snapshot_status.jsonl"
DEFAULT_METRICS_PATH = "data/history/screening_observation_metrics.json"
