"""Film title variant detection and parent-title inference (investigation, PR Identity-A)."""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from reel_seattle.analysis.film_identity import (
    classify_screening_variant_type,
    infer_parent_display_title,
    infer_parent_film_key,
    is_likely_screening_variant,
)
from reel_seattle.normalize import normalize_film_title, showtime_film_key

# Re-export for backward compatibility (PR Identity-A audit module).
__all__ = [
    "classify_screening_variant_type",
    "infer_parent_display_title",
    "infer_parent_film_key",
    "is_likely_screening_variant",
]

@dataclass
class TitleRecord:
    source_title: str
    showtime_film_key: str
    parent_display_title: str
    parent_film_key: str | None
    variant_type: str
    is_variant: bool
    source: str = ""
    amc_movie_id: str = ""
    showtime_count: int = 0
    theater_count: int = 0
    earliest_date: str = ""
    latest_date: str = ""


@dataclass
class VariantGroup:
    parent_display_title: str
    parent_film_key: str | None
    titles: list[TitleRecord] = field(default_factory=list)

    @property
    def variant_count(self) -> int:
        return sum(1 for item in self.titles if item.is_variant)

    @property
    def distinct_film_keys(self) -> int:
        return len({item.showtime_film_key for item in self.titles})


def _merge_title_record(store: dict[str, TitleRecord], record: TitleRecord) -> None:
    existing = store.get(record.showtime_film_key)
    if existing is None:
        store[record.showtime_film_key] = record
        return
    existing.showtime_count += record.showtime_count
    existing.theater_count = max(existing.theater_count, record.theater_count)
    if record.earliest_date and (
        not existing.earliest_date or record.earliest_date < existing.earliest_date
    ):
        existing.earliest_date = record.earliest_date
    if record.latest_date and (
        not existing.latest_date or record.latest_date > existing.latest_date
    ):
        existing.latest_date = record.latest_date
    if record.amc_movie_id and not existing.amc_movie_id:
        existing.amc_movie_id = record.amc_movie_id


def build_title_records_from_showtimes_current(payload: Mapping[str, Any]) -> list[TitleRecord]:
    showtimes = payload.get("showtimes", [])
    if not isinstance(showtimes, list):
        return []
    agg: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "showtime_count": 0,
            "theater_ids": set(),
            "dates": set(),
            "film_title": "",
            "source": "",
        }
    )
    for row in showtimes:
        if not isinstance(row, dict):
            continue
        key = str(row.get("showtime_film_key", "")).strip()
        title = str(row.get("film_title", "")).strip()
        if not key or not title:
            continue
        bucket = agg[key]
        bucket["film_title"] = title
        bucket["showtime_count"] += 1
        bucket["theater_ids"].add(str(row.get("theater_id", "")).strip())
        bucket["dates"].add(str(row.get("date", "")).strip())
        bucket["source"] = str(row.get("source", "")).strip() or bucket["source"]
    records: list[TitleRecord] = []
    for key, bucket in agg.items():
        title = bucket["film_title"]
        dates = sorted(d for d in bucket["dates"] if d)
        parent = infer_parent_display_title(title)
        records.append(
            TitleRecord(
                source_title=title,
                showtime_film_key=key,
                parent_display_title=parent,
                parent_film_key=infer_parent_film_key(title),
                variant_type=classify_screening_variant_type(title),
                is_variant=is_likely_screening_variant(title),
                source=bucket["source"],
                showtime_count=bucket["showtime_count"],
                theater_count=len(bucket["theater_ids"]),
                earliest_date=dates[0] if dates else "",
                latest_date=dates[-1] if dates else "",
            )
        )
    return records


def build_title_records_from_footprint_csv(path: Path | str) -> list[TitleRecord]:
    agg: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "film_title": "",
            "showtime_count": 0,
            "theater_ids": set(),
            "dates": set(),
            "amc_movie_id": "",
        }
    )
    with Path(path).open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            key = row.get("showtime_film_key", "").strip()
            title = row.get("film_title", "").strip()
            if not key or not title:
                continue
            bucket = agg[key]
            bucket["film_title"] = title
            bucket["showtime_count"] += int(row.get("active_showtime_count", "0") or 0)
            bucket["theater_ids"].update(
                part.strip()
                for part in row.get("theater_list", "").split("|")
                if part.strip()
            )
            show_date = row.get("show_date", "").strip()
            if show_date:
                bucket["dates"].add(show_date)
            movie_id = row.get("amc_movie_id", "").strip()
            if movie_id and not bucket["amc_movie_id"]:
                bucket["amc_movie_id"] = movie_id
    records: list[TitleRecord] = []
    for key, bucket in agg.items():
        title = bucket["film_title"]
        dates = sorted(bucket["dates"])
        records.append(
            TitleRecord(
                source_title=title,
                showtime_film_key=key,
                parent_display_title=infer_parent_display_title(title),
                parent_film_key=infer_parent_film_key(title),
                variant_type=classify_screening_variant_type(title),
                is_variant=is_likely_screening_variant(title),
                source="amc",
                amc_movie_id=bucket["amc_movie_id"],
                showtime_count=bucket["showtime_count"],
                theater_count=len(bucket["theater_ids"]),
                earliest_date=dates[0] if dates else "",
                latest_date=dates[-1] if dates else "",
            )
        )
    return records


def group_title_records(records: Sequence[TitleRecord]) -> list[VariantGroup]:
    groups: dict[str, VariantGroup] = {}
    for record in records:
        parent_key = record.parent_film_key or record.showtime_film_key
        parent_title = record.parent_display_title or record.source_title
        group = groups.get(parent_key)
        if group is None:
            group = VariantGroup(parent_display_title=parent_title, parent_film_key=parent_key)
            groups[parent_key] = group
        group.titles.append(record)
    result = list(groups.values())
    result.sort(key=lambda item: (-item.distinct_film_keys, item.parent_display_title.lower()))
    return result


def split_groups(groups: Sequence[VariantGroup]) -> tuple[list[VariantGroup], list[VariantGroup]]:
    multi = [group for group in groups if group.distinct_film_keys > 1]
    single = [group for group in groups if group.distinct_film_keys <= 1]
    return multi, single


def audit_summary(
    *,
    current_records: Sequence[TitleRecord],
    footprint_records: Sequence[TitleRecord],
    groups: Sequence[VariantGroup],
) -> dict[str, Any]:
    multi, _single = split_groups(groups)
    variant_rows = [record for record in current_records if record.is_variant]
    return {
        "current_distinct_film_keys": len(current_records),
        "current_variant_like_keys": len(variant_rows),
        "footprint_distinct_film_keys": len(footprint_records),
        "footprint_with_amc_movie_id": sum(1 for r in footprint_records if r.amc_movie_id),
        "parent_groups_with_multiple_keys": len(multi),
        "top_split_groups": [
            {
                "parent_display_title": group.parent_display_title,
                "parent_film_key": group.parent_film_key,
                "distinct_film_keys": group.distinct_film_keys,
                "variant_count": group.variant_count,
                "titles": [
                    {
                        "source_title": item.source_title,
                        "showtime_film_key": item.showtime_film_key,
                        "variant_type": item.variant_type,
                        "showtime_count": item.showtime_count,
                        "theater_count": item.theater_count,
                        "date_range": [item.earliest_date, item.latest_date],
                    }
                    for item in sorted(group.titles, key=lambda t: t.source_title.lower())
                ],
            }
            for group in multi[:25]
        ],
        "example_variant_titles_current": [
            {
                "source_title": item.source_title,
                "showtime_film_key": item.showtime_film_key,
                "parent_display_title": item.parent_display_title,
                "parent_film_key": item.parent_film_key,
                "variant_type": item.variant_type,
            }
            for item in sorted(variant_rows, key=lambda t: t.source_title.lower())[:30]
        ],
    }


def write_variant_audit_csv(path: Path, groups: Sequence[VariantGroup]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "parent_display_title",
        "parent_film_key",
        "source_title",
        "showtime_film_key",
        "variant_type",
        "is_variant",
        "source",
        "amc_movie_id",
        "showtime_count",
        "theater_count",
        "earliest_date",
        "latest_date",
        "distinct_keys_in_parent_group",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for group in groups:
            if group.distinct_film_keys <= 1:
                continue
            for item in group.titles:
                writer.writerow(
                    {
                        "parent_display_title": group.parent_display_title,
                        "parent_film_key": group.parent_film_key or "",
                        "source_title": item.source_title,
                        "showtime_film_key": item.showtime_film_key,
                        "variant_type": item.variant_type,
                        "is_variant": "true" if item.is_variant else "false",
                        "source": item.source,
                        "amc_movie_id": item.amc_movie_id,
                        "showtime_count": item.showtime_count,
                        "theater_count": item.theater_count,
                        "earliest_date": item.earliest_date,
                        "latest_date": item.latest_date,
                        "distinct_keys_in_parent_group": group.distinct_film_keys,
                    }
                )


def run_variant_audit(
    *,
    showtimes_current_path: Path,
    footprint_csv_path: Path | None = None,
    csv_output: Path,
    json_output: Path,
) -> dict[str, Any]:
    current_payload = json.loads(showtimes_current_path.read_text(encoding="utf-8"))
    current_records = build_title_records_from_showtimes_current(current_payload)
    footprint_records: list[TitleRecord] = []
    if footprint_csv_path is not None and footprint_csv_path.is_file():
        footprint_records = build_title_records_from_footprint_csv(footprint_csv_path)
    # Group on union of current + footprint title keys for broader historical view.
    merged: dict[str, TitleRecord] = {}
    for record in current_records + footprint_records:
        _merge_title_record(merged, record)
    groups = group_title_records(list(merged.values()))
    summary = audit_summary(
        current_records=current_records,
        footprint_records=footprint_records,
        groups=groups,
    )
    write_variant_audit_csv(csv_output, groups)
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    summary["csv_output"] = str(csv_output)
    summary["json_output"] = str(json_output)
    return summary
