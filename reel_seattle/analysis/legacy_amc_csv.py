"""Parse legacy AMC CSV snapshots into RawShowtime records for footprint derivation."""

from __future__ import annotations

import csv
import io
from datetime import date
from pathlib import Path
from typing import Mapping

from reel_seattle.adapters.amc import parse_row_date
from reel_seattle.adapters.base import RawShowtime
from reel_seattle.analysis.amc_footprint import ParsedSnapshot


def _optional_bool_field(value: object | None) -> bool | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text.lower() in ("true", "1", "yes")


def legacy_row_to_raw(row: Mapping[str, str]) -> RawShowtime | None:
    """Convert one legacy AMC CSV row to RawShowtime; return None when incomplete."""
    title = (row.get("Film") or "").strip()
    theater = (row.get("Theater") or "").strip()
    if not title or not theater:
        return None
    return RawShowtime(
        theater_name_raw=theater,
        date_raw=row.get("Date", ""),
        time_raw=row.get("Time", ""),
        title_raw=title,
        runtime_raw=row.get("Runtime") or None,
        poster_url_raw=row.get("posterDynamic") or None,
        canceled=_optional_bool_field(row.get("isCanceled")),
        almost_sold_out=_optional_bool_field(row.get("isAlmostSoldOut")),
        format_raw=row.get("premiumFormat") or None,
    )


def load_forward_legacy_records(
    csv_text: str,
    snapshot_date: date,
) -> list[RawShowtime]:
    """Load legacy AMC CSV rows with show date on or after *snapshot_date*.

    Legacy archive files retain cumulative past rows from earlier scrapes. Only
    rows at or after the snapshot calendar date represent the forward window
    visible when that snapshot was taken.
    """
    records: list[RawShowtime] = []
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        row_date = parse_row_date(row.get("Date", ""))
        if row_date is None or row_date < snapshot_date:
            continue
        raw = legacy_row_to_raw(row)
        if raw is not None:
            records.append(raw)
    return records


def parsed_snapshot_from_legacy_csv(
    csv_text: str,
    *,
    snapshot_date: date,
    source_path: Path | str,
    snapshot_timestamp: str | None = None,
) -> ParsedSnapshot:
    """Build a ParsedSnapshot from legacy AMC CSV text."""
    return ParsedSnapshot(
        path=Path(source_path),
        snapshot_date=snapshot_date,
        snapshot_timestamp=snapshot_timestamp,
        records=load_forward_legacy_records(csv_text, snapshot_date),
    )
