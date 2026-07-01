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

from reel_seattle.analysis.special_screening_flags import (
    classify_run_type,
    classify_special_screening_flags,
)
from reel_seattle.normalize import normalize_film_title, showtime_film_key

# Strip from end of title (order matters: longer phrases first).
_VARIANT_SUFFIX_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r":\s*sensory\s+friendly(?:\s+screening)?",
        r"\s+sensory\s+friendly(?:\s+screening)?",
        r":\s*early\s+access",
        r"\s+early\s+access",
        r":\s*fan\s+event",
        r"\s+fan\s+event",
        r":\s*opening\s+night(?:\s+fan\s+event)?",
        r"\s+opening\s+night(?:\s+fan\s+event)?",
        r":\s*imax\s+opening\s+night(?:\s+fan\s+event)?",
        r"\s+imax\s+opening\s+night(?:\s+fan\s+event)?",
        r":\s*double\s+feature",
        r"\s+double\s+feature",
        r":\s*\d+(?:st|nd|rd|th)\s+anniversary(?:\s+double\s+feature)?",
        r"\s+\d+(?:st|nd|rd|th)\s+anniversary(?:\s+double\s+feature)?",
        r":\s*anniversary",
        r"\s+anniversary",
        r":\s*encore",
        r"\s+encore",
        r":\s*live(?:\s+in\s+concert)?",
        r"\s+live(?:\s+in\s+concert)?",
        r"\s+\(\s*imax\s*\)",
        r"\s+\(\s*3d\s*\)",
        r"\s+\(\s*dolby\s+cinema\s*\)",
        r"\s+-\s*imax\b",
        r"\s+-\s*3d\b",
        r"\s+-\s*dolby\s+cinema\b",
        r":\s*imax\b",
        r"\s+imax\b",
        r":\s*3d\b",
        r"\s+3d\b",
        r":\s*dolby\s+cinema\b",
        r"\s+dolby\s+cinema\b",
        r":\s*reald\s+3d\b",
        r"\s+reald\s+3d\b",
        r":\s*open\s+caption(?:\s*\(in\s+english\))?",
        r"\s+open\s+caption(?:\s*\(in\s+english\))?",
        r":\s*subtitled\b",
        r"\s+subtitled\b",
        r":\s*dubbed\b",
        r"\s+dubbed\b",
        r"\s+\(\s*\d{4}\s+event\s*\)",
        r":\s*\d{4}\s+event\b",
    )
)

_FORMAT_ONLY_SUFFIXES = frozenset(
    {
        "imax",
        "3d",
        "dolby cinema",
        "reald 3d",
    }
)


def infer_parent_display_title(title: str) -> str:
    """Conservatively strip known screening/event/format suffixes for parent inference."""
    text = normalize_film_title(title) or title.strip()
    if not text:
        return ""
    changed = True
    while changed:
        changed = False
        for pattern in _VARIANT_SUFFIX_PATTERNS:
            updated = pattern.sub("", text).strip(" :-\u2013\u2014")
            if updated and updated != text:
                text = updated
                changed = True
                break
    return text.strip()


def infer_parent_film_key(title: str) -> str | None:
    parent = infer_parent_display_title(title)
    if not parent:
        return None
    return showtime_film_key(parent)


def classify_screening_variant_type(title: str) -> str:
    """Map title to a variant type label for audit columns."""
    lowered = title.lower()
    # Check explicit phrases before broad opening_night_like (includes early access).
    if "early access" in lowered:
        return "early_access"
    flags = classify_special_screening_flags(title)
    if flags.get("sensory_friendly_like"):
        return "sensory_friendly"
    if flags.get("opening_night_like"):
        return "opening_night"
    if flags.get("fan_event_like"):
        return "fan_event"
    if "early access" in lowered:
        return "early_access"
    if flags.get("double_feature_like"):
        return "double_feature"
    if flags.get("anniversary_like"):
        return "anniversary"
    if flags.get("live_or_concert_like"):
        return "live_encore"
    if any(token in lowered for token in ("imax", "dolby cinema", "reald 3d", " 3d")):
        return "format_variant"
    if flags.get("special_event_like") or classify_run_type(title) != "normal_first_run":
        return classify_run_type(title)
    return "none"


def is_likely_screening_variant(title: str) -> bool:
    parent = infer_parent_display_title(title)
    normalized = normalize_film_title(title) or title.strip()
    if not parent or parent.casefold() == normalized.casefold():
        return False
    variant_type = classify_screening_variant_type(title)
    if variant_type in {"none", "normal_first_run"}:
        # Format-only suffix stripping may still indicate a variant.
        return parent.casefold() != normalized.casefold()
    return True


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
