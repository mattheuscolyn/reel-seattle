"""Provider-specific collection discovery adapters."""

from reel_seattle.collections.adapters.beacon import discover_beacon_collections
from reel_seattle.collections.adapters.nwff import discover_nwff_collections
from reel_seattle.collections.adapters.siff import discover_siff_collections

__all__ = [
    "discover_beacon_collections",
    "discover_nwff_collections",
    "discover_siff_collections",
]
