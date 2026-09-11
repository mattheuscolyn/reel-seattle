#!/usr/bin/env python3
"""Rebuild durable screening observation + lifecycle artifacts from daily logs.

Daily logs under ``data/daily_logs/`` remain authoritative raw provenance.
This command is idempotent: the same logs always yield the same logical output.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from reel_seattle.adapters.scrape_log import DEFAULT_DAILY_LOGS_DIR
from reel_seattle.history import (
    DEFAULT_LIFECYCLE_PATH,
    DEFAULT_METRICS_PATH,
    DEFAULT_OBSERVATIONS_PATH,
    DEFAULT_SNAPSHOT_STATUS_PATH,
)
from reel_seattle.history.screening_observation_ledger import (
    rebuild_screening_observation_ledger,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--logs-dir",
        type=Path,
        default=Path(DEFAULT_DAILY_LOGS_DIR),
        help="Directory of YYYY-MM-DD_{source}.json daily logs",
    )
    parser.add_argument(
        "--observations-path",
        type=Path,
        default=Path(DEFAULT_OBSERVATIONS_PATH),
    )
    parser.add_argument(
        "--lifecycle-path",
        type=Path,
        default=Path(DEFAULT_LIFECYCLE_PATH),
    )
    parser.add_argument(
        "--snapshot-status-path",
        type=Path,
        default=Path(DEFAULT_SNAPSHOT_STATUS_PATH),
    )
    parser.add_argument(
        "--metrics-path",
        type=Path,
        default=Path(DEFAULT_METRICS_PATH),
    )
    parser.add_argument(
        "--as-of-date",
        type=str,
        default=None,
        help="Optional YYYY-MM-DD for lifecycle status derivation (default: latest log date)",
    )
    args = parser.parse_args(argv)

    result = rebuild_screening_observation_ledger(
        args.logs_dir,
        observations_path=args.observations_path,
        lifecycle_path=args.lifecycle_path,
        snapshot_status_path=args.snapshot_status_path,
        metrics_path=args.metrics_path,
        as_of_date=args.as_of_date,
    )
    print(json.dumps({"written": result["written"], "metrics": result["metrics"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
