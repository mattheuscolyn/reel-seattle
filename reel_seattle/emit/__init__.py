"""Build client-facing data artifacts from processed showtime history."""

from reel_seattle.emit.current import (
    CURRENT_SCHEMA_VERSION,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REGISTRY_PATH,
    WINDOW_DAYS,
    build_showtimes_current,
    make_showtime_id,
    write_showtimes_current,
)
from reel_seattle.emit.leaving_soon import (
    LEAVING_SOON_SCHEMA_VERSION,
    MODEL_PUBLIC_SCHEMA_VERSION,
    build_leaving_soon_current,
    publish_leaving_soon_current,
    write_leaving_soon_current,
)
from reel_seattle.emit.newly_added import (
    NEWLY_ADDED_DAYS_BACK,
    NEWLY_ADDED_SCHEMA_VERSION,
    build_newly_added_current,
    filter_recent_announcements,
    write_newly_added_current,
)
from reel_seattle.emit.opening_this_week import (
    OPENING_THIS_WEEK_SCHEMA_VERSION,
    build_opening_this_week_current,
    write_opening_this_week_current,
)

__all__ = [
    "CURRENT_SCHEMA_VERSION",
    "DEFAULT_OUTPUT_PATH",
    "DEFAULT_REGISTRY_PATH",
    "LEAVING_SOON_SCHEMA_VERSION",
    "MODEL_PUBLIC_SCHEMA_VERSION",
    "NEWLY_ADDED_DAYS_BACK",
    "NEWLY_ADDED_SCHEMA_VERSION",
    "OPENING_THIS_WEEK_SCHEMA_VERSION",
    "WINDOW_DAYS",
    "build_leaving_soon_current",
    "publish_leaving_soon_current",
    "build_newly_added_current",
    "build_opening_this_week_current",
    "build_showtimes_current",
    "filter_recent_announcements",
    "make_showtime_id",
    "write_leaving_soon_current",
    "write_newly_added_current",
    "write_opening_this_week_current",
    "write_showtimes_current",
]
