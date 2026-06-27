"""Normalization utilities for Reel Seattle showtime data.

Each submodule owns one slice of the ingest contract (dates, times, titles, etc.).
Functions are pure and deterministic unless documented otherwise.

Integration with scrapers and the daily processor begins in later PRs—import
from here rather than reimplementing rules in pipeline code.
"""

from reel_seattle.normalize.dates import (
    DEFAULT_TIMEZONE,
    format_date_csv,
    format_date_iso,
    parse_csv_date,
    parse_datetime_iso,
    parse_iso_date,
    parse_show_date,
)
from reel_seattle.normalize.formats import parse_format_tags
from reel_seattle.normalize.runtime import parse_runtime_minutes
from reel_seattle.normalize.theaters import (
    TheaterIndex,
    TheaterResolution,
    build_theater_index,
    list_enabled_theater_ids,
    resolve_theater,
)
from reel_seattle.normalize.times import (
    ParsedTime,
    format_time_24h,
    format_time_display,
    parse_time,
    parse_time_to_minutes,
    parsed_time_from_minutes,
)
from reel_seattle.normalize.titles import (
    extract_year_hint,
    normalize_film_title,
    showtime_film_key,
)
from reel_seattle.normalize.values import (
    NULL_STRINGS,
    collapse_whitespace,
    empty_to_none,
    normalize_bool_string,
    normalize_optional_string,
)

__all__ = [
    "DEFAULT_TIMEZONE",
    "NULL_STRINGS",
    "ParsedTime",
    "TheaterIndex",
    "TheaterResolution",
    "build_theater_index",
    "collapse_whitespace",
    "empty_to_none",
    "extract_year_hint",
    "format_date_csv",
    "format_date_iso",
    "format_time_24h",
    "format_time_display",
    "list_enabled_theater_ids",
    "normalize_bool_string",
    "normalize_film_title",
    "normalize_optional_string",
    "parse_csv_date",
    "parse_datetime_iso",
    "parse_format_tags",
    "parse_iso_date",
    "parse_runtime_minutes",
    "parse_show_date",
    "parse_time",
    "parse_time_to_minutes",
    "parsed_time_from_minutes",
    "resolve_theater",
    "showtime_film_key",
]
