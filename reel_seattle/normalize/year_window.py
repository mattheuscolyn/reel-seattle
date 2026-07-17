"""Requested-window-aware year inference for month/day show dates."""

from __future__ import annotations

from datetime import date


def infer_year_for_month_day(
    month: int,
    day: int,
    *,
    window_start: date,
    window_end: date,
    scrape_date: date,
) -> tuple[date | None, str | None]:
    """Select the unique year whose date falls in the requested window.

    Returns ``(resolved_date, error_code)``.

    Explicit caller-supplied years are handled by the caller. This helper only
    resolves omitted years. Error codes:

    * ``date_outside_window_or_unresolvable`` — no in-window candidate
    * ``ambiguous_year`` — more than one in-window candidate
    """
    years = set(range(window_start.year - 1, window_end.year + 2))
    years.add(scrape_date.year)
    years.add(scrape_date.year - 1)
    years.add(scrape_date.year + 1)
    candidates: list[date] = []
    for year in sorted(years):
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if window_start <= candidate <= window_end:
            candidates.append(candidate)
    if len(candidates) == 1:
        return candidates[0], None
    if not candidates:
        return None, "date_outside_window_or_unresolvable"
    return None, "ambiguous_year"
