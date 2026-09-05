"""Production inference for the frozen AMC remaining-run survival model v1.

Uses only information available at prediction time. Does not write outcomes
into prediction snapshots. Does not refit the model.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.adapters.scrape_log import DEFAULT_DAILY_LOGS_DIR, daily_log_path
from reel_seattle.analysis.amc_footprint import load_amc_snapshots
from reel_seattle.analysis.amc_run_lifecycle import (
    build_lifecycle_audit,
    facts_from_snapshots,
    load_catalog_index,
    load_occurred_from_history,
    resolve_product_identity,
)
from reel_seattle.analysis.leaving_soon_frozen import (
    ALL_ANNOUNCED_BOUNDARY,
    FEATURE_SCHEMA_VERSION,
    FrozenHazardModel,
    FrozenModelError,
    MODEL_VERSION,
    PREDICTION_HORIZON_DAYS,
    load_active_model,
)
from reel_seattle.analysis.leaving_soon_survival import (
    PRIMARY_IDENTITY,
    SurvivalObservation,
    observation_from_mapping,
)
from reel_seattle.normalize import DEFAULT_TIMEZONE, build_theater_index

PUBLIC_ELIGIBLE_RUN_TYPES = frozenset(
    {
        "probable_normal_first_run",
        "rerelease_anniversary",
        "family_holiday",
    }
)
EVENT_RUN_TYPES = frozenset(
    {
        "concert_live_event",
        "qa_fan_mystery",
        "accessibility_special_presentation",
        "anime_event",
        "awards_limited",
        "unknown_other_special",
    }
)
BUCKET_LAST_CHANCE = "last_chance"
BUCKET_LEAVING_SOON = "leaving_soon"
REASON_LAST_CHANCE = "This theatrical run looks likely to end this week."
REASON_LEAVING_SOON = "This theatrical run may be winding down soon."
SNAPSHOT_SCHEMA_VERSION = "1.0.0"
STALE_MAX_AGE_DAYS = 2
DEFAULT_SNAPSHOT_DIR = Path("data/model_predictions/leaving_soon")
DEFAULT_HISTORY_PATH = Path("data/history/showtimes_history.csv")
DEFAULT_THEATERS_PATH = Path("data/theaters.json")
DEFAULT_CATALOG_PATH = Path("data/source_catalog/amc_movie_products.json")
PACIFIC = ZoneInfo(DEFAULT_TIMEZONE)


@dataclass(frozen=True)
class SourceSnapshotStatus:
    path: Path
    observation_date: date
    generated_at: str
    collection_mode: str
    restate_safe: bool
    theaters_failed: int
    ok: bool
    ineligibility_reason: str | None


@dataclass
class RankedPrediction:
    observation: SurvivalObservation
    scores: dict[str, Any]
    eligible: bool
    ineligibility_reason: str | None
    public_eligible: bool
    public_ineligibility_reason: str | None
    bucket: str | None
    weak_segment: str | None


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes"}


def latest_amc_log_path(logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR) -> Path | None:
    paths = sorted(Path(logs_dir).glob("*_amc.json"))
    return paths[-1] if paths else None


def inspect_amc_log(path: Path) -> SourceSnapshotStatus:
    payload = json.loads(path.read_text(encoding="utf-8"))
    stats = payload.get("stats") if isinstance(payload.get("stats"), dict) else {}
    prefix = path.stem.rsplit("_", 1)[0]
    try:
        observation_date = date.fromisoformat(prefix)
    except ValueError:
        observation_date = date(1970, 1, 1)
    collection_mode = str(stats.get("collection_mode") or "")
    restate_safe = _parse_bool(stats.get("restate_safe"))
    theaters_failed = int(stats.get("theaters_failed") or 0)
    generated_at = str(payload.get("generated_at") or "")
    reason = None
    if collection_mode != "all_announced_future":
        reason = "collection_mode_not_all_announced_future"
    elif not restate_safe:
        reason = "restate_safe_false"
    elif theaters_failed:
        reason = "incomplete_theater_fetch"
    return SourceSnapshotStatus(
        path=path,
        observation_date=observation_date,
        generated_at=generated_at,
        collection_mode=collection_mode,
        restate_safe=restate_safe,
        theaters_failed=theaters_failed,
        ok=reason is None,
        ineligibility_reason=reason,
    )


def snapshot_is_stale(observation_date: date, *, today: date | None = None) -> bool:
    current = today or datetime.now(PACIFIC).date()
    return (current - observation_date).days > STALE_MAX_AGE_DAYS


def survival_from_lifecycle_row(row: Any) -> SurvivalObservation:
    return observation_from_mapping(row.to_csv_dict())


def load_lifecycle_observations(
    *,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    history_path: Path | str = DEFAULT_HISTORY_PATH,
    theaters_path: Path | str = DEFAULT_THEATERS_PATH,
    catalog_path: Path | str = DEFAULT_CATALOG_PATH,
    skip_history: bool = False,
) -> tuple[list[SurvivalObservation], SourceSnapshotStatus]:
    latest = latest_amc_log_path(logs_dir)
    if latest is None:
        raise FrozenModelError("no AMC daily logs found")
    status = inspect_amc_log(latest)
    registry = json.loads(Path(theaters_path).read_text(encoding="utf-8"))
    theater_index = build_theater_index(registry)
    snapshots = load_amc_snapshots(Path(logs_dir))
    facts = facts_from_snapshots(snapshots, theater_index=theater_index, snapshot_format="json")
    catalog = load_catalog_index(Path(catalog_path)) if Path(catalog_path).is_file() else {}
    extra = []
    if not skip_history and Path(history_path).is_file() and facts:
        as_of = max(fact.observation_date for fact in facts)
        product_ids = {
            resolve_product_identity(
                source_film_id=fact.source_film_id,
                source_release_id=fact.source_release_id,
                title=fact.title,
                title_key=fact.title_key,
            ).product_id
            for fact in facts
        }
        extra = [
            row
            for row in load_occurred_from_history(
                Path(history_path), theater_index=theater_index, as_of=as_of
            )
            if row.product_id in product_ids
        ]
    result = build_lifecycle_audit(facts, extra_occurred=extra, catalog=catalog)
    return [survival_from_lifecycle_row(row) for row in result.observations], status


def load_current_lifecycle_observations(
    *,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    history_path: Path | str = DEFAULT_HISTORY_PATH,
    theaters_path: Path | str = DEFAULT_THEATERS_PATH,
    catalog_path: Path | str = DEFAULT_CATALOG_PATH,
    skip_history: bool = False,
) -> tuple[list[SurvivalObservation], SourceSnapshotStatus]:
    rows, status = load_lifecycle_observations(
        logs_dir=logs_dir,
        history_path=history_path,
        theaters_path=theaters_path,
        catalog_path=catalog_path,
        skip_history=skip_history,
    )
    current = [row for row in rows if row.observation_date == status.observation_date]
    return current, status


def weak_segment_flag(row: SurvivalObservation) -> str | None:
    if row.run_type == "rerelease_anniversary":
        return "rerelease"
    if 3 <= row.theater_count <= 4:
        return "mid_footprint"
    return None


def eligibility_for_row(row: SurvivalObservation) -> tuple[bool, str | None]:
    if row.identity_kind != PRIMARY_IDENTITY or str(row.product_id).startswith("title:"):
        return False, "title_fallback_identity"
    return True, None


def public_eligibility_for_row(row: SurvivalObservation) -> tuple[bool, str | None]:
    eligible, reason = eligibility_for_row(row)
    if not eligible:
        return False, reason
    if row.run_type in EVENT_RUN_TYPES or row.run_type not in PUBLIC_ELIGIBLE_RUN_TYPES:
        return False, "special_presentation_excluded"
    return True, None


def assign_bucket(scores: Mapping[str, Any], model: FrozenHazardModel) -> str | None:
    last_chance_thr = model.threshold(horizon=7, min_precision="min_precision_0.95")
    leaving_soon_thr = model.threshold(horizon=14, min_precision="min_precision_0.90")
    p7 = float(scores["p_end_within_7d"])
    p14 = float(scores["p_end_within_14d"])
    if p7 >= last_chance_thr:
        return BUCKET_LAST_CHANCE
    if p14 >= leaving_soon_thr:
        return BUCKET_LEAVING_SOON
    return None


def rank_key(item: RankedPrediction) -> tuple:
    scores = item.scores
    p7 = scores.get("p_end_within_7d")
    p14 = scores.get("p_end_within_14d")
    median = scores.get("median_remaining_days")
    return (
        0 if item.eligible else 1,
        -float(p7) if p7 is not None else 0.0,
        -float(p14) if p14 is not None else 0.0,
        float(median) if median is not None else 999.0,
        item.observation.title.lower(),
        str(item.observation.product_id),
        item.observation.run_id,
    )


def score_observations(
    rows: Sequence[SurvivalObservation],
    *,
    model: FrozenHazardModel,
    source: SourceSnapshotStatus,
) -> list[RankedPrediction]:
    scored: list[RankedPrediction] = []
    for row in rows:
        eligible, reason = eligibility_for_row(row)
        public_ok, public_reason = public_eligibility_for_row(row)
        scores = {
            "p_end_within_3d": None,
            "p_end_within_7d": None,
            "p_end_within_14d": None,
            "p_end_within_21d": None,
            "median_remaining_days": None,
            "expected_remaining_days": None,
            "median_beyond_horizon": None,
        }
        bucket = None
        if eligible:
            scores = model.predict_calibrated(row)
            if public_ok:
                bucket = assign_bucket(scores, model)
        scored.append(
            RankedPrediction(
                observation=row,
                scores=scores,
                eligible=eligible,
                ineligibility_reason=reason,
                public_eligible=public_ok and eligible,
                public_ineligibility_reason=public_reason,
                bucket=bucket if public_ok and eligible else None,
                weak_segment=weak_segment_flag(row),
            )
        )
    scored.sort(key=rank_key)
    _ = source
    return scored


def prediction_record(
    item: RankedPrediction,
    *,
    source: SourceSnapshotStatus,
    generated_at: str,
    sort_rank: int | None,
) -> dict[str, Any]:
    row = item.observation
    scores = item.scores
    return {
        "source": "amc",
        "source_film_id": row.product_id if row.identity_kind == PRIMARY_IDENTITY else None,
        "run_id": row.run_id,
        "title": row.title,
        "run_type": row.run_type,
        "observation_at": row.raw.get("observation_at") or source.generated_at,
        "observation_date": row.observation_date.isoformat(),
        "source_snapshot_generated_at": source.generated_at,
        "collection_mode": source.collection_mode,
        "restate_safe": source.restate_safe,
        "model_version": MODEL_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "prediction_horizon_days": PREDICTION_HORIZON_DAYS,
        "p_end_within_3d": scores.get("p_end_within_3d"),
        "p_end_within_7d": scores.get("p_end_within_7d"),
        "p_end_within_14d": scores.get("p_end_within_14d"),
        "p_end_within_21d": scores.get("p_end_within_21d"),
        "median_remaining_days": scores.get("median_remaining_days"),
        "expected_remaining_days": scores.get("expected_remaining_days"),
        "median_beyond_horizon": scores.get("median_beyond_horizon"),
        "eligible": item.eligible,
        "ineligibility_reason": item.ineligibility_reason,
        "public_eligible": item.public_eligible,
        "public_ineligibility_reason": item.public_ineligibility_reason,
        "leaving_soon_bucket": item.bucket,
        "sort_rank": sort_rank,
        "identity_confidence": row.identity_confidence,
        "observation_quality": row.observation_quality,
        "historical_horizon_truncated": row.historical_horizon_truncated,
        "all_announced_boundary": ALL_ANNOUNCED_BOUNDARY,
        "weak_segment": item.weak_segment,
        "generated_at": generated_at,
    }


def build_internal_snapshot(
    items: Sequence[RankedPrediction],
    *,
    source: SourceSnapshotStatus,
    generated_at: datetime | None = None,
    skipped_reason: str | None = None,
) -> dict[str, Any]:
    stamp = generated_at or datetime.now(PACIFIC)
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=PACIFIC)
    generated = stamp.isoformat(timespec="seconds")
    public_ranked = [item for item in items if item.bucket]
    rank_by_run = {item.observation.run_id: idx + 1 for idx, item in enumerate(public_ranked)}
    records = [
        prediction_record(
            item,
            source=source,
            generated_at=generated,
            sort_rank=rank_by_run.get(item.observation.run_id),
        )
        for item in items
    ]
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "model_version": MODEL_VERSION,
        "generated_at": generated,
        "observation_date": source.observation_date.isoformat(),
        "source_snapshot_generated_at": source.generated_at,
        "collection_mode": source.collection_mode,
        "restate_safe": source.restate_safe,
        "skipped": skipped_reason is not None,
        "skipped_reason": skipped_reason,
        "stats": {
            "active_runs": len(items),
            "eligible": sum(1 for item in items if item.eligible),
            "ineligible": sum(1 for item in items if not item.eligible),
            "public_eligible": sum(1 for item in items if item.public_eligible),
            "last_chance": sum(1 for item in items if item.bucket == BUCKET_LAST_CHANCE),
            "leaving_soon": sum(1 for item in items if item.bucket == BUCKET_LEAVING_SOON),
        },
        "predictions": records,
    }


def write_internal_snapshot(snapshot: Mapping[str, Any], *, directory: Path | str = DEFAULT_SNAPSHOT_DIR) -> Path:
    observation_date = str(snapshot["observation_date"])
    path = Path(directory) / f"{observation_date}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def run_leaving_soon_inference(
    *,
    model: FrozenHazardModel | None = None,
    logs_dir: Path | str = DEFAULT_DAILY_LOGS_DIR,
    history_path: Path | str = DEFAULT_HISTORY_PATH,
    theaters_path: Path | str = DEFAULT_THEATERS_PATH,
    catalog_path: Path | str = DEFAULT_CATALOG_PATH,
    today: date | None = None,
    generated_at: datetime | None = None,
) -> tuple[dict[str, Any], list[RankedPrediction], SourceSnapshotStatus]:
    """Score current active AMC runs. Caller decides whether to publish."""
    fitted = model or load_active_model()
    latest = latest_amc_log_path(logs_dir)
    if latest is None:
        raise FrozenModelError("no AMC daily logs found")
    status = inspect_amc_log(latest)
    skipped = status.ineligibility_reason
    if skipped is None and snapshot_is_stale(status.observation_date, today=today):
        skipped = "stale_source_snapshot"
    if skipped:
        empty = build_internal_snapshot(
            [],
            source=status,
            generated_at=generated_at,
            skipped_reason=skipped,
        )
        return empty, [], status
    rows, status = load_current_lifecycle_observations(
        logs_dir=logs_dir,
        history_path=history_path,
        theaters_path=theaters_path,
        catalog_path=catalog_path,
    )
    items = score_observations(rows, model=fitted, source=status)
    snapshot = build_internal_snapshot(items, source=status, generated_at=generated_at)
    return snapshot, items, status
