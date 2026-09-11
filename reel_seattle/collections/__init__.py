"""Indie theater collection ingestion (source-evidence membership)."""

from reel_seattle.collections.ids import collection_id
from reel_seattle.collections.model import (
    CollectionRecord,
    MembershipRecord,
    SourceDiscoveryResult,
)

__all__ = [
    "CollectionRecord",
    "MembershipRecord",
    "SourceDiscoveryResult",
    "collection_id",
]
