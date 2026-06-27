"""Thin CLI wrapper for SIFF and Beacon indie source adapters."""

from __future__ import annotations

from datetime import datetime

import requests

from reel_seattle.adapters.beacon import fetch_beacon_showtimes
from reel_seattle.adapters.indie_legacy import (
    DEFAULT_INDIE_CSV_PATH,
    DEFAULT_HEADERS,
    build_default_indie_fetch_context,
    raw_showtime_to_legacy_row,
    write_legacy_indie_csv,
)
from reel_seattle.adapters.scrape_log import daily_log_path, write_scrape_daily_log
from reel_seattle.adapters.siff import fetch_siff_showtimes

CSV_FILENAME = str(DEFAULT_INDIE_CSV_PATH)


def collect_indie_showtimes(context):
    """Run SIFF and Beacon adapters and return per-source fetch results."""
    siff_result = fetch_siff_showtimes(context)
    beacon_result = fetch_beacon_showtimes(context)

    for message in siff_result.warnings + beacon_result.warnings:
        print(message)
    for message in siff_result.errors + beacon_result.errors:
        print(message)

    return siff_result, beacon_result


def main() -> None:
    run_date = datetime.today().date()
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    context = build_default_indie_fetch_context(run_date=run_date, session=session)

    siff_result, beacon_result = collect_indie_showtimes(context)

    siff_json_path = daily_log_path(run_date, "siff")
    beacon_json_path = daily_log_path(run_date, "beacon")
    siff_artifact = write_scrape_daily_log(siff_json_path, "siff", siff_result)
    beacon_artifact = write_scrape_daily_log(beacon_json_path, "beacon", beacon_result)
    print(
        f"Wrote normalized scrape log {siff_json_path}: "
        f"{siff_artifact['stats']['record_count']} records"
    )
    print(
        f"Wrote normalized scrape log {beacon_json_path}: "
        f"{beacon_artifact['stats']['record_count']} records"
    )

    records = siff_result.records + beacon_result.records
    rows = [raw_showtime_to_legacy_row(record) for record in records]
    write_legacy_indie_csv(CSV_FILENAME, rows)
    print(f"Saved {len(rows)} showtimes to {CSV_FILENAME}.")


if __name__ == "__main__":
    main()
