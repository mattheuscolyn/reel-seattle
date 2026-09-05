"""Emit the ``leaving_soon_current.json`` artifact.

The production publisher uses the frozen remaining-run survival model v1.
``build_leaving_soon_current`` keeps the historical ``visible_dates_le_1``
heuristic for regression tests and comparison.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.analysis.amc_footprint import EVENT_TITLE_PATTERNS, MATINEE_END_MIN
from reel_seattle.normalize import DEFAULT_TIMEZONE, format_date_iso, showtime_film_key
from reel_seattle.validate import validate_leaving_soon_current

LEAVING_SOON_SCHEMA_VERSION = "1.0.0"
MODEL_PUBLIC_SCHEMA_VERSION = "1.1.0"
DEFAULT_OUTPUT_PATH = Path("public/data/leaving_soon_current.json")
DEFAULT_SHOWTIMES_CURRENT_PATH = Path("public/data/showtimes_current.json")

RULE_NAME = "visible_dates_le_1"
RULE_DESCRIPTION = (
    "Flags non-event AMC films with only one visible show date in the current "
    "schedule snapshot."
)
EVALUATED_PRECISION = 0.916
EVALUATED_RECALL = 0.258
EVALUATED_COVERAGE = 0.222
EVALUATION_NOTE = (
    "Historical held-out backtest only (PR D); not a guarantee of leaving soon. "
    "PR D target and this rule are likely tautological (end-of-visible-schedule); "
    "do not use for product decisions until weekly-extension labels (PR C2) pass review."
)

REASON_TEXT = "Only one visible AMC play date remains in the current schedule."


@dataclass
class _FilmAggregate:
    film_key: str
    film_title: str
    show_dates: set[date] = field(default_factory=set)
    theater_ids: set[str] = field(default_factory=set)
    showtime_count: int = 0
    has_primetime: bool = False
    has_weekend_show: bool = False
    runtime_min: int | None = None
    poster_url: str | None = None

    @property
    def visible_show_date_count(self) -> int:
        return len(self.show_dates)

    def min_show_date(self) -> date | None:
        return min(self.show_dates) if self.show_dates else None

    def max_show_date(self) -> date | None:
        return max(self.show_dates) if self.show_dates else None


def _parse_show_date_iso(text: str) -> date | None:
    text = str(text).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _minutes_from_time_24h(text: str) -> int | None:
    text = str(text).strip()
    if not text or ":" not in text:
        return None
    hour_str, minute_str = text.split(":", 1)
    try:
        return int(hour_str) * 60 + int(minute_str)
    except ValueError:
        return None


def is_event_like_title(title: str) -> bool:
    return bool(EVENT_TITLE_PATTERNS.search(title))


def passes_visible_dates_le_1(visible_show_date_count: int) -> bool:
    return visible_show_date_count <= 1


def enabled_amc_theater_ids(registry: Mapping[str, Any]) -> set[str]:
    ids: set[str] = set()
    for entry in registry.get("theaters", []):
        if not isinstance(entry, dict):
            continue
        if entry.get("source") != "amc":
            continue
        if entry.get("enabled") is False:
            continue
        theater_id = str(entry.get("id", "")).strip()
        if theater_id:
            ids.add(theater_id)
    return ids


def _theater_name_map(registry: Mapping[str, Any]) -> dict[str, str]:
    names: dict[str, str] = {}
    for entry in registry.get("theaters", []):
        if not isinstance(entry, dict):
            continue
        theater_id = str(entry.get("id", "")).strip()
        name = str(entry.get("name", "")).strip()
        if theater_id and name:
            names[theater_id] = name
    return names


def aggregate_amc_films_from_current(
    current_artifact: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
) -> dict[str, _FilmAggregate]:
    """Aggregate enabled AMC showtimes from a showtimes_current artifact."""
    allowed_theaters = enabled_amc_theater_ids(registry)
    aggregates: dict[str, _FilmAggregate] = {}

    for showtime in current_artifact.get("showtimes", []):
        if not isinstance(showtime, dict):
            continue
        if str(showtime.get("source", "")).strip() != "amc":
            continue
        theater_id = str(showtime.get("theater_id", "")).strip()
        if theater_id not in allowed_theaters:
            continue

        film_key = str(showtime.get("showtime_film_key", "")).strip()
        film_title = str(showtime.get("film_title", "")).strip()
        if not film_key or not film_title:
            continue

        show_date = _parse_show_date_iso(showtime.get("date", ""))
        if show_date is None:
            continue

        agg = aggregates.get(film_key)
        if agg is None:
            agg = _FilmAggregate(film_key=film_key, film_title=film_title)
            aggregates[film_key] = agg

        agg.show_dates.add(show_date)
        agg.theater_ids.add(theater_id)
        agg.showtime_count += 1

        minutes = _minutes_from_time_24h(showtime.get("time", ""))
        if minutes is not None and minutes >= MATINEE_END_MIN:
            agg.has_primetime = True
        if show_date.weekday() >= 5:
            agg.has_weekend_show = True

        runtime = showtime.get("runtime_min")
        if isinstance(runtime, int) and agg.runtime_min is None:
            agg.runtime_min = runtime
        poster = showtime.get("poster_url")
        if isinstance(poster, str) and poster.strip() and agg.poster_url is None:
            agg.poster_url = poster.strip()

    return aggregates


def build_leaving_soon_current(
    current_artifact: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    generated_at: datetime | None = None,
    exclude_event_like: bool = True,
) -> dict[str, Any]:
    """Build leaving_soon_current from showtimes_current + registry."""
    if generated_at is None:
        generated_at = datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    elif generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))

    theater_names = _theater_name_map(registry)
    aggregates = aggregate_amc_films_from_current(current_artifact, registry=registry)

    items: list[dict[str, Any]] = []
    for film_key in sorted(aggregates):
        agg = aggregates[film_key]
        if not passes_visible_dates_le_1(agg.visible_show_date_count):
            continue
        if exclude_event_like and is_event_like_title(agg.film_title):
            continue

        min_date = agg.min_show_date()
        max_date = agg.max_show_date()
        if min_date is None or max_date is None:
            continue

        theaters = [
            {
                "theater_id": theater_id,
                "theater_name": theater_names.get(theater_id, theater_id),
            }
            for theater_id in sorted(agg.theater_ids)
        ]
        items.append(
            {
                "film_key": film_key,
                "film_title": agg.film_title,
                "risk_level": "high",
                "reason": REASON_TEXT,
                "visible_show_date_count": agg.visible_show_date_count,
                "min_show_date": format_date_iso(min_date),
                "max_show_date": format_date_iso(max_date),
                "total_visible_showtimes": agg.showtime_count,
                "total_visible_theaters": len(agg.theater_ids),
                "theaters": theaters,
                "show_dates": [format_date_iso(d) for d in sorted(agg.show_dates)],
                "has_primetime": agg.has_primetime,
                "has_weekend_show": agg.has_weekend_show,
                "poster_url": agg.poster_url,
                "runtime_min": agg.runtime_min,
            }
        )

    window = current_artifact.get("window", {})
    return {
        "schema_version": LEAVING_SOON_SCHEMA_VERSION,
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "source": "amc",
        "window": window if isinstance(window, dict) else {},
        "method": {
            "name": RULE_NAME,
            "description": RULE_DESCRIPTION,
            "evaluated_precision": EVALUATED_PRECISION,
            "evaluated_recall": EVALUATED_RECALL,
            "evaluated_coverage": EVALUATED_COVERAGE,
            "evaluation_note": EVALUATION_NOTE,
        },
        "stats": {
            "candidate_film_count": len(aggregates),
            "flagged_film_count": len(items),
        },
        "items": items,
    }


def write_leaving_soon_current(
    current_artifact: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    output_path: Path | str = DEFAULT_OUTPUT_PATH,
    generated_at: datetime | None = None,
    exclude_event_like: bool = True,
) -> dict[str, Any]:
    """Build, validate, and write ``leaving_soon_current.json``."""
    artifact = build_leaving_soon_current(
        current_artifact,
        registry=registry,
        generated_at=generated_at,
        exclude_event_like=exclude_event_like,
    )
    validate_leaving_soon_current(artifact)
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return artifact


def load_showtimes_current(path: Path | str = DEFAULT_SHOWTIMES_CURRENT_PATH) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_registry(path: Path | str = Path("data/theaters.json")) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build_model_leaving_soon_current(
    items: Sequence[Any],
    current_artifact: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    model: Any,
    generated_at: datetime | None = None,
    skipped_reason: str | None = None,
) -> dict[str, Any]:
    """Map scored runs onto the public Leaving Soon contract."""
    from reel_seattle.analysis.leaving_soon_frozen import MODEL_VERSION
    from reel_seattle.analysis.leaving_soon_inference import (
        BUCKET_LAST_CHANCE,
        BUCKET_LEAVING_SOON,
        REASON_LAST_CHANCE,
        REASON_LEAVING_SOON,
    )

    if generated_at is None:
        generated_at = datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    elif generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))

    theater_names = _theater_name_map(registry)
    aggregates = aggregate_amc_films_from_current(current_artifact, registry=registry)
    public_items: list[dict[str, Any]] = []
    rank = 0
    for item in items:
        if not item.bucket:
            continue
        rank += 1
        film_key = showtime_film_key(item.observation.title) or item.observation.run_id
        agg = aggregates.get(film_key)
        min_date = agg.min_show_date() if agg else None
        max_date = agg.max_show_date() if agg else None
        theaters = []
        if agg:
            theaters = [
                {
                    "theater_id": theater_id,
                    "theater_name": theater_names.get(theater_id, theater_id),
                }
                for theater_id in sorted(agg.theater_ids)
            ]
        risk_level, reason = ("high", REASON_LAST_CHANCE) if item.bucket == BUCKET_LAST_CHANCE else (
            "elevated",
            REASON_LEAVING_SOON,
        )
        public_items.append(
            {
                "film_key": film_key,
                "film_title": item.observation.title,
                "risk_level": risk_level,
                "reason": reason,
                "leaving_soon_bucket": item.bucket,
                "model_version": MODEL_VERSION,
                "source_film_id": item.observation.product_id,
                "run_id": item.observation.run_id,
                "run_type": item.observation.run_type,
                "sort_rank": rank,
                "visible_show_date_count": agg.visible_show_date_count if agg else 0,
                "min_show_date": format_date_iso(min_date) if min_date else None,
                "max_show_date": format_date_iso(max_date) if max_date else None,
                "total_visible_showtimes": agg.showtime_count if agg else 0,
                "total_visible_theaters": len(agg.theater_ids) if agg else 0,
                "theaters": theaters,
                "show_dates": [format_date_iso(d) for d in sorted(agg.show_dates)] if agg else [],
                "has_primetime": bool(agg.has_primetime) if agg else False,
                "has_weekend_show": bool(agg.has_weekend_show) if agg else False,
                "poster_url": agg.poster_url if agg else None,
                "runtime_min": agg.runtime_min if agg else None,
            }
        )

    window = current_artifact.get("window", {})
    last_chance_thr = model.threshold(horizon=7, min_precision="min_precision_0.95")
    leaving_soon_thr = model.threshold(horizon=14, min_precision="min_precision_0.90")
    return {
        "schema_version": MODEL_PUBLIC_SCHEMA_VERSION,
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "source": "amc",
        "model_version": MODEL_VERSION,
        "published": skipped_reason is None,
        "skipped_reason": skipped_reason,
        "window": window if isinstance(window, dict) else {},
        "method": {
            "name": MODEL_VERSION,
            "description": (
                "Frozen daily discrete-time logistic remaining-run model. "
                "Public copy is bucketed; exact remaining days are not shown as certainty."
            ),
            "evaluated_precision": 0.925,
            "evaluated_recall": 0.715,
            "evaluated_coverage": 0.715,
            "evaluation_note": (
                "Held-out backtest of amc_remaining_run_survival_v1. "
                "The validation 95% 7-day operating point held at about 92.5% test precision; "
                "the 90% point did not. Production use does not mean the model is final. "
                "Ship-gate remains promising_continue."
            ),
            "model_version": MODEL_VERSION,
            "last_chance_threshold": last_chance_thr,
            "leaving_soon_threshold": leaving_soon_thr,
        },
        "stats": {
            "candidate_film_count": len(items),
            "flagged_film_count": len(public_items),
            "last_chance_count": sum(
                1 for row in public_items if row["leaving_soon_bucket"] == BUCKET_LAST_CHANCE
            ),
            "leaving_soon_count": sum(
                1 for row in public_items if row["leaving_soon_bucket"] == BUCKET_LEAVING_SOON
            ),
        },
        "items": public_items,
    }


def publish_leaving_soon_current(
    current_artifact: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    output_path: Path | str = DEFAULT_OUTPUT_PATH,
    snapshot_dir: Path | str | None = None,
    generated_at: datetime | None = None,
    model: Any | None = None,
    logs_dir: Path | str | None = None,
    history_path: Path | str | None = None,
    theaters_path: Path | str | None = None,
    catalog_path: Path | str | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Run frozen-model inference and write public + internal artifacts when safe.

    If the latest AMC snapshot is not trustworthy, the existing public file is
    left unchanged and no new Leaving Soon badges are published from partial data.
    """
    from reel_seattle.analysis.leaving_soon_frozen import FrozenModelError, load_active_model
    from reel_seattle.analysis.leaving_soon_inference import (
        DEFAULT_HISTORY_PATH,
        DEFAULT_SNAPSHOT_DIR,
        DEFAULT_THEATERS_PATH,
        DEFAULT_CATALOG_PATH,
        run_leaving_soon_inference,
        write_internal_snapshot,
    )
    from reel_seattle.adapters.scrape_log import DEFAULT_DAILY_LOGS_DIR

    output = Path(output_path)
    snapshot_root = Path(snapshot_dir) if snapshot_dir is not None else DEFAULT_SNAPSHOT_DIR
    try:
        fitted = model if model is not None else load_active_model()
        snapshot, items, _status = run_leaving_soon_inference(
            model=fitted,
            logs_dir=logs_dir or DEFAULT_DAILY_LOGS_DIR,
            history_path=history_path or DEFAULT_HISTORY_PATH,
            theaters_path=theaters_path or DEFAULT_THEATERS_PATH,
            catalog_path=catalog_path or DEFAULT_CATALOG_PATH,
            today=today,
            generated_at=generated_at,
        )
    except FrozenModelError as exc:
        return {
            "published": False,
            "skipped_reason": f"model_load_failure:{exc}",
            "artifact": None,
            "snapshot_path": None,
        }

    skipped = snapshot.get("skipped_reason")
    write_internal_snapshot(snapshot, directory=snapshot_root)
    if skipped:
        return {
            "published": False,
            "skipped_reason": skipped,
            "artifact": None,
            "snapshot_path": str(snapshot_root / f"{snapshot['observation_date']}.json"),
        }

    artifact = build_model_leaving_soon_current(
        items,
        current_artifact,
        registry=registry,
        model=fitted,
        generated_at=generated_at,
    )
    validate_leaving_soon_current(artifact)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {
        "published": True,
        "skipped_reason": None,
        "artifact": artifact,
        "snapshot_path": str(snapshot_root / f"{snapshot['observation_date']}.json"),
    }
