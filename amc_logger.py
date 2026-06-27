"""Thin CLI wrapper for the AMC source adapter."""

from __future__ import annotations

from datetime import datetime

from reel_seattle.adapters.amc import (
    DEFAULT_CSV_PATH,
    allowlist_message,
    build_default_fetch_context,
    fetch_amc_showtimes,
    load_past_legacy_rows,
    raw_showtime_to_legacy_row,
    write_legacy_csv,
)
from reel_seattle.adapters.scrape_log import daily_log_path, write_scrape_daily_log

CSV_FILENAME = str(DEFAULT_CSV_PATH)
TODAY = datetime.today().date()


def main() -> None:
    print("Loading past AMC showtimes...")
    past_rows = load_past_legacy_rows(CSV_FILENAME, before_date=TODAY)

    print("Scraping current and future AMC showtimes (full restate)...")
    context = build_default_fetch_context(run_date=TODAY)
    result = fetch_amc_showtimes(context)
    print(allowlist_message(result.stats))

    json_path = daily_log_path(TODAY, "amc")
    artifact = write_scrape_daily_log(json_path, "amc", result)
    print(
        f"Wrote normalized scrape log {json_path}: "
        f"{artifact['stats']['record_count']} records"
    )

    future_rows = [raw_showtime_to_legacy_row(record) for record in result.records]
    all_rows = past_rows + future_rows
    write_legacy_csv(CSV_FILENAME, all_rows)

    print(
        f"Updated {CSV_FILENAME}: {len(past_rows)} past rows retained, "
        f"{len(future_rows)} current/future rows from API. Total: {len(all_rows)}"
    )


if __name__ == "__main__":
    main()
