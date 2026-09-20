"""Constants for the durable performance identity registry."""

from __future__ import annotations

from pathlib import Path

SCHEMA_VERSION = "1.0.0"
DEFAULT_REGISTRY_REL = Path("data/performance_identity/performance_identity_current.json")

# Alias namespaces
ALIAS_GI = "grand_illusion"
ALIAS_PUBLIC = "public_showtime"

# performance_id prefixes
PREFIX_HOST = "id:"
PREFIX_XSRC_GI = "xsrc:grand-illusion:"

GI_SOURCE = "grand_illusion"
HOST_SOURCES = frozenset({"siff", "beacon", "nwff", "central_cinema"})

# Retention: keep mappings for occurrences whose local_date is within this
# many days of today (or any future date). Past occurrences older than this
# may be pruned in a later version; v1 does not prune aggressively.
RETENTION_PAST_DAYS = 120
