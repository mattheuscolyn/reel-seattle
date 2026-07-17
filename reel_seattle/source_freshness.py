"""Source freshness metadata derived from history and current artifacts."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Mapping

from reel_seattle.normalize import (
    TheaterIndex,
    format_date_iso,
    parse_iso_date,
    parse_show_date,
    resolve_theater,
)

KNOWN_SOURCES: tuple[str, ...] = ("amc", "siff", "beacon", "nwff", "central_cinema")
SOURCE_STATUSES: tuple[str, ...] = ("success", "stale", "empty", "failed")


@dataclass
class HistorySourceEvidence:
    """Best-available historical signals for a source (not a scrape success guarantee)."""

    has_evidence: bool = False
    max_show_date: date | None = None
    max_last_updated: date | None = None

    def observe_show_date(self, show_date: date | None) -> None:
        if show_date is None:
            return
        self.has_evidence = True
        if self.max_show_date is None or show_date > self.max_show_date:
            self.max_show_date = show_date

    def observe_last_updated(self, last_updated: date | None) -> None:
        if last_updated is None:
            return
        self.has_evidence = True
        if self.max_last_updated is None or last_updated > self.max_last_updated:
            self.max_last_updated = last_updated

    def best_last_successful_run(self) -> str | None:
        """Return the latest known show or update date for this source."""
        candidates: list[date] = []
        if self.max_show_date is not None:
            candidates.append(self.max_show_date)
        if self.max_last_updated is not None:
            candidates.append(self.max_last_updated)
        if not candidates:
            return None
        return format_date_iso(max(candidates))


def empty_history_evidence() -> dict[str, HistorySourceEvidence]:
    return {source: HistorySourceEvidence() for source in KNOWN_SOURCES}


def resolve_history_row_source(
    row: Mapping[str, Any],
    theater_index: TheaterIndex,
) -> str | None:
    """Map a history CSV row to a known adapter source, if possible."""
    resolution = resolve_theater(row.get("Theater", ""), theater_index)
    if resolution is not None:
        entry = theater_index.theaters_by_id.get(resolution.theater_id)
        if entry is not None:
            source = entry.get("source")
            if source in KNOWN_SOURCES:
                return str(source)

    raw_source = str(row.get("source", "")).strip().casefold()
    if raw_source in KNOWN_SOURCES:
        return raw_source

    theater_name = str(row.get("Theater", "")).strip()
    if theater_name.startswith("AMC "):
        return "amc"

    return None


def _parse_metadata_date(value: Any, *, reference_date: date | None) -> date | None:
    if value is None:
        return None
    parsed = parse_iso_date(str(value))
    if parsed is not None:
        return parsed
    return parse_show_date(value, reference_date=reference_date)


def update_history_evidence(
    evidence: HistorySourceEvidence,
    row: Mapping[str, Any],
    *,
    reference_date: date | None,
) -> None:
    """Incorporate one history row into source evidence."""
    show_date = parse_show_date(row.get("Date", ""), reference_date=reference_date)
    last_updated = _parse_metadata_date(row.get("last_updated"), reference_date=reference_date)
    evidence.observe_show_date(show_date)
    evidence.observe_last_updated(last_updated)


def scan_history_source_evidence(
    history_rows: list[Mapping[str, Any]],
    theater_index: TheaterIndex,
    *,
    reference_date: date | None = None,
) -> dict[str, HistorySourceEvidence]:
    """Scan history once and collect per-source evidence."""
    evidence_by_source = empty_history_evidence()
    for row in history_rows:
        source = resolve_history_row_source(row, theater_index)
        if source is None:
            continue
        update_history_evidence(
            evidence_by_source[source],
            row,
            reference_date=reference_date,
        )
    return evidence_by_source


def _max_iso_date(values: list[str | None]) -> str | None:
    dated = [value for value in values if value]
    return max(dated) if dated else None


def build_sources_metadata(
    showtimes: list[Mapping[str, Any]],
    history_evidence: Mapping[str, HistorySourceEvidence],
) -> dict[str, dict[str, Any]]:
    """Build per-source freshness metadata for the current artifact."""
    metadata: dict[str, dict[str, Any]] = {}

    for source in KNOWN_SOURCES:
        source_showtimes = [row for row in showtimes if row.get("source") == source]
        showtime_count = len(source_showtimes)
        film_count = len({row["showtime_film_key"] for row in source_showtimes})
        theater_count = len({row["theater_id"] for row in source_showtimes})
        evidence = history_evidence[source]

        if showtime_count > 0:
            status = "success"
            last_successful_run = _max_iso_date(
                [row.get("last_seen_at") for row in source_showtimes]
            )
        elif evidence.has_evidence:
            status = "stale"
            last_successful_run = evidence.best_last_successful_run()
        else:
            status = "empty"
            last_successful_run = None

        metadata[source] = {
            "status": status,
            "showtime_count": showtime_count,
            "film_count": film_count,
            "theater_count": theater_count,
            "last_successful_run": last_successful_run,
        }

    return metadata
