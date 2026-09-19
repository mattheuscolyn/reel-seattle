"""Shared public showtime horizon policy.

Two different horizons — do not conflate them:

PUBLIC EMIT (``showtimes_current.json``)
  Policy: ``all_known_future``.
  Include every retained future screening in history (date >= reference).
  No arbitrary upper date clip on the public artifact.
  ``window.start_date`` = reference/current date.
  ``window.end_date`` = latest included future showtime date (schema requires a
  concrete date; if there are no future rows, end_date == start_date).
  Individual UI surfaces apply any shorter *display* horizon themselves.

SOURCE COLLECTION (daily scrapers / adapters)
  AMC: all announced future performances (unbounded ingest).
  SIFF / Beacon: adapter fetch context may use a long safety window (e.g. 365d).
  NWFF / Central: HTTP pagination uses ``INDIE_SCRAPE_HORIZON_DAYS`` below.
  A source collection safety bound is NOT the public artifact horizon.
"""

from __future__ import annotations

# Public emit: all retained future history rows. Not a day count.
PUBLIC_SHOWTIME_HORIZON_POLICY = "all_known_future"

# Source-collection HTTP pagination bound for NWFF / Central Cinema only
# (end = run_date + INDIE_SCRAPE_HORIZON_DAYS). Does not clip public emit.
INDIE_SCRAPE_HORIZON_DAYS = 365
