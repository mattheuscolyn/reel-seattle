"""Fail a completed daily scrape job if a source remains silently stale.

Run this *after* publishing validated showtime data, so an independent
source outage cannot hold AMC/SIFF/etc data hostage. A failing step remains
visible to job-failure monitoring.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")


def check_freshness(report: dict, *, source: str, today: date, max_age_days: int = 2) -> tuple[int, str]:
    sources = report.get("sources") or {}
    row = sources.get(source)
    if not isinstance(row, dict):
        return 1, f"Source {source} missing from pipeline report."
    last = row.get("last_successful_run")
    if not isinstance(last, str) or not last:
        return 1, f"Source {source} has no recorded successful ingestion."
    try:
        last_date = date.fromisoformat(last)
    except ValueError:
        return 1, f"Source {source} has invalid last_successful_run={last!r}."
    age = (today - last_date).days
    if age < 0:
        return 1, f"Source {source} has a future successful-run date: {last!r}."
    if age >= max_age_days:
        return 1, (
            f"Source {source} last ingested successfully {age} days ago ({last}); "
            "the main pipeline can still report success while preserving old rows."
        )
    if age:
        return 0, f"Source {source} has not successfully refreshed today (last: {last})."
    return 0, f"Source {source} successfully ingested today ({last})."


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=Path("public/data/pipeline_report.json"))
    parser.add_argument("--source", default="central_cinema")
    parser.add_argument("--max-age-days", type=int, default=2)
    args = parser.parse_args(argv)
    if args.max_age_days < 1:
        parser.error("--max-age-days must be >= 1")
    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"::error::Cannot read pipeline report: {exc}")
        return 1
    today = datetime.now(PACIFIC).date()
    code, message = check_freshness(
        report, source=args.source, today=today, max_age_days=args.max_age_days
    )
    annotation = "error" if code else "warning" if "not successfully refreshed today" in message else "notice"
    print(f"::{annotation}::{message}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
