"""Thin CLI wrapper for SIFF, Beacon, NWFF, and Central Cinema indie adapters."""

from __future__ import annotations

from datetime import datetime, timedelta

import requests

from reel_seattle.adapters.beacon import fetch_beacon_showtimes
from reel_seattle.adapters.central_cinema import (
    fetch_central_cinema,
    write_central_cinema_scrape_log,
)
from reel_seattle.adapters.indie_legacy import (
    DEFAULT_INDIE_CSV_PATH,
    DEFAULT_HEADERS,
    build_default_indie_fetch_context,
    raw_showtime_to_legacy_row,
    write_legacy_indie_csv,
)
from reel_seattle.adapters.nwff import (
    fetch_nwff,
    write_nwff_scrape_log,
)
from reel_seattle.adapters.scrape_log import (
    DEFAULT_DAILY_LOGS_DIR,
    daily_log_path,
    write_scrape_daily_log,
)
from reel_seattle.adapters.siff import fetch_siff_showtimes

CSV_FILENAME = str(DEFAULT_INDIE_CSV_PATH)


def collect_indie_showtimes(context):
    """Run SIFF, Beacon, NWFF, and Central Cinema adapters; return per-source results.

    NWFF and Central failures are isolated: SIFF/Beacon still return successfully.
    NWFF or Central may be ``None`` when collection raises unexpectedly.
    """
    siff_result = fetch_siff_showtimes(context)
    beacon_result = fetch_beacon_showtimes(context)

    start = context.run_date
    end = start + timedelta(days=13)

    nwff_result = None
    try:
        nwff_result = fetch_nwff(start, end)
    except Exception as exc:  # noqa: BLE001 - source-local soft-fail
        print(f"ERROR: NWFF collection failed (source-local): {exc}")

    central_result = None
    try:
        central_result = fetch_central_cinema(start, end)
    except Exception as exc:  # noqa: BLE001 - source-local soft-fail
        print(f"ERROR: Central Cinema collection failed (source-local): {exc}")

    for message in siff_result.warnings + beacon_result.warnings:
        print(message)
    for message in siff_result.errors + beacon_result.errors:
        print(message)
    if nwff_result is not None:
        for message in nwff_result.warnings:
            print(f"NWFF: {message}")
        for message in nwff_result.errors:
            print(f"NWFF ERROR: {message}")
        print(
            f"NWFF status={nwff_result.contract.get('status')} "
            f"restate_safe={nwff_result.restate_safe} "
            f"records={len(nwff_result.records)}"
        )
    if central_result is not None:
        for message in central_result.warnings:
            print(f"Central Cinema: {message}")
        for message in central_result.errors:
            print(f"Central Cinema ERROR: {message}")
        print(
            f"Central Cinema status={central_result.contract.get('status')} "
            f"restate_safe={central_result.restate_safe} "
            f"records={len(central_result.records)}"
        )

    return siff_result, beacon_result, nwff_result, central_result


def main() -> None:
    run_date = datetime.today().date()
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    context = build_default_indie_fetch_context(run_date=run_date, session=session)

    siff_result, beacon_result, nwff_result, central_result = collect_indie_showtimes(context)

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

    if nwff_result is not None:
        nwff_json_path = daily_log_path(run_date, "nwff", logs_dir=DEFAULT_DAILY_LOGS_DIR)
        write_nwff_scrape_log(nwff_json_path, nwff_result.log_envelope)
        print(
            f"Wrote NWFF Option C scrape log {nwff_json_path}: "
            f"{len(nwff_result.records)} records "
            f"(restate_safe={nwff_result.restate_safe})"
        )

    if central_result is not None:
        central_json_path = daily_log_path(
            run_date, "central_cinema", logs_dir=DEFAULT_DAILY_LOGS_DIR
        )
        write_central_cinema_scrape_log(central_json_path, central_result.log_envelope)
        print(
            f"Wrote Central Cinema Option C scrape log {central_json_path}: "
            f"{len(central_result.records)} records "
            f"(restate_safe={central_result.restate_safe})"
        )

    records = list(siff_result.records) + list(beacon_result.records)
    if nwff_result is not None:
        records.extend(nwff_result.records)
    if central_result is not None:
        records.extend(central_result.records)
    rows = [raw_showtime_to_legacy_row(record) for record in records]
    write_legacy_indie_csv(CSV_FILENAME, rows)
    print(f"Saved {len(rows)} showtimes to {CSV_FILENAME}.")


if __name__ == "__main__":
    main()
