"""Show date parsing and formatting.

Canonical JSON dates use ISO 8601 (``YYYY-MM-DD``). History CSV dates use
``MM/DD/YYYY``. All show dates are interpreted in the theater's local calendar
day (default ``America/Los_Angeles`` at the pipeline layer).

This module does not perform timezone conversion of clock times—only calendar
date extraction and formatting.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

from reel_seattle.normalize.values import collapse_whitespace, normalize_optional_string

DEFAULT_TIMEZONE = "America/Los_Angeles"

_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_CSV_DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
_MONTH_DAY_YEAR_RE = re.compile(
    r"^(?:[A-Za-z]+,\s*)?"  # optional weekday
    r"([A-Za-z]+)\s+(\d{1,2})"  # month day
    r"(?:,\s*(\d{4}))?"  # optional year
    r"\s*$"
)

_MONTH_NAMES = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_iso_date(value: str) -> date | None:
    """Parse ``YYYY-MM-DD`` into a :class:`datetime.date`."""
    text = normalize_optional_string(value)
    if text is None:
        return None
    match = _ISO_DATE_RE.match(text)
    if not match:
        return None
    year, month, day = (int(match.group(i)) for i in range(1, 4))
    return _safe_date(year, month, day)


def parse_csv_date(value: str) -> date | None:
    """Parse ``MM/DD/YYYY`` (or ``M/D/YYYY``) into a :class:`datetime.date`."""
    text = normalize_optional_string(value)
    if text is None:
        return None
    match = _CSV_DATE_RE.match(text)
    if not match:
        return None
    month, day, year = (int(match.group(i)) for i in range(1, 4))
    return _safe_date(year, month, day)


def _infer_year(
    month: int,
    day: int,
    *,
    explicit_year: int | None,
    reference_date: date | None,
    default_year: int | None,
) -> int | None:
    if explicit_year is not None:
        return explicit_year
    if default_year is not None:
        return default_year
    if reference_date is None:
        return None
    candidate = _safe_date(reference_date.year, month, day)
    if candidate is None:
        return None
    # If the month/day looks far in the past relative to the reference date,
    # assume the next calendar year (e.g. scraping in December for January films).
    if candidate < reference_date - timedelta(days=30):
        return reference_date.year + 1
    return reference_date.year


def parse_show_date(
    value: Any,
    *,
    reference_date: date | None = None,
    default_year: int | None = None,
) -> date | None:
    """Parse a show date from common scraper and CSV forms.

    Accepted inputs include ISO dates, ``MM/DD/YYYY``, and strings such as
    ``"July 11, 2025"`` or ``"Friday, July 11"`` (year inferred when omitted).

    Parameters
    ----------
    value:
        Raw date string from a scraper or CSV row.
    reference_date:
        Date of the pipeline run (or "today") used to infer a missing year.
    default_year:
        Explicit year when the source omits it (e.g. page context).

    Returns
    -------
    date | None
        Parsed calendar date, or ``None`` if parsing fails.
    """
    text = normalize_optional_string(value)
    if text is None:
        return None

    parsed = parse_iso_date(text)
    if parsed is not None:
        return parsed

    parsed = parse_csv_date(text)
    if parsed is not None:
        return parsed

    match = _MONTH_DAY_YEAR_RE.match(collapse_whitespace(text))
    if not match:
        return None

    month_name = match.group(1).casefold()
    month = _MONTH_NAMES.get(month_name)
    if month is None:
        return None

    day = int(match.group(2))
    explicit_year = int(match.group(3)) if match.group(3) else None
    year = _infer_year(
        month,
        day,
        explicit_year=explicit_year,
        reference_date=reference_date,
        default_year=default_year,
    )
    if year is None:
        return None
    return _safe_date(year, month, day)


def format_date_iso(value: date) -> str:
    """Format a date as ISO ``YYYY-MM-DD``."""
    return value.isoformat()


def format_date_csv(value: date) -> str:
    """Format a date as ``MM/DD/YYYY`` for history CSV columns."""
    return f"{value.month:02d}/{value.day:02d}/{value.year}"


def parse_datetime_iso(value: str) -> datetime | None:
    """Parse an ISO-8601 date-time string when present in API payloads.

    Returns ``None`` on failure. Timezone offsets are preserved when supplied.
    """
    text = normalize_optional_string(value)
    if text is None:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None
