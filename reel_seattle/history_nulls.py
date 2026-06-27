"""Null sentinel normalization for history CSV optional fields."""

from __future__ import annotations

from typing import Any

from reel_seattle.normalize.values import normalize_optional_string

# Optional history columns stored as empty strings when unknown (CSV has no null).
HISTORY_OPTIONAL_CSV_FIELDS = (
    "Runtime",
    "posterDynamic",
    "ticket_url",
    "source_showtime_id",
)


def nullish_to_csv_empty(value: Any) -> str:
    """Convert null-ish values to an empty CSV field."""
    cleaned = normalize_optional_string(value)
    return "" if cleaned is None else cleaned


def normalize_history_optional_fields(row: dict[str, Any]) -> None:
    """Normalize optional history fields in place."""
    for field in HISTORY_OPTIONAL_CSV_FIELDS:
        if field in row:
            row[field] = nullish_to_csv_empty(row.get(field, ""))
