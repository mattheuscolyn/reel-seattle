"""Prospective evaluation of historical Leaving Soon prediction snapshots.

Joins date-stamped prediction snapshots to later realized run ends.
Never used at prediction time. Does not retrain or rewrite snapshots.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_inference import DEFAULT_SNAPSHOT_DIR
from reel_seattle.analysis.leaving_soon_survival import (
    brier_score,
    classification_metrics,
    reliability_table,
)


def load_prediction_snapshots(directory: Path | str = DEFAULT_SNAPSHOT_DIR) -> list[dict[str, Any]]:
    root = Path(directory)
    if not root.is_dir():
        return []
    snapshots = []
    for path in sorted(root.glob("*.json")):
        if path.name.startswith("."):
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and payload.get("predictions") is not None:
            snapshots.append(payload)
    return snapshots


def realized_remaining_days(
    *,
    observation_date: date,
    run_end_date: date | None,
    as_of: date,
) -> int | None:
    """Return remaining days at T if the run end is known by ``as_of``."""
    if run_end_date is None:
        return None
    if run_end_date > as_of:
        return None
    return (run_end_date - observation_date).days


def binary_from_remaining(remaining: int | None, *, horizon: int, follow_up_days: int) -> int | None:
    if remaining is not None:
        return 1 if remaining < horizon else 0
    if follow_up_days >= horizon:
        return 0
    return None


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def evaluate_matured_predictions(
    snapshots: Sequence[Mapping[str, Any]],
    *,
    run_ends: Mapping[str, date | None],
    as_of: date,
    last_chance_threshold: float,
    leaving_soon_threshold: float,
) -> dict[str, Any]:
    """Score snapshots whose outcome window has matured. Skips recent rows."""
    rows_7: list[tuple[int, float, str, str]] = []
    rows_14: list[tuple[int, float, str, str]] = []
    remaining_errors: list[float] = []
    segments: dict[str, list[tuple[int, float]]] = defaultdict(list)
    skipped_immature = 0
    scored = 0
    for snapshot in snapshots:
        if snapshot.get("skipped"):
            continue
        for pred in snapshot.get("predictions") or []:
            if not pred.get("eligible"):
                continue
            p7 = pred.get("p_end_within_7d")
            p14 = pred.get("p_end_within_14d")
            if p7 is None or p14 is None:
                continue
            obs_date = _parse_date(pred.get("observation_date"))
            if obs_date is None:
                continue
            run_id = str(pred.get("run_id") or "")
            remaining = realized_remaining_days(
                observation_date=obs_date,
                run_end_date=run_ends.get(run_id),
                as_of=as_of,
            )
            follow = (as_of - obs_date).days
            y7 = binary_from_remaining(remaining, horizon=7, follow_up_days=follow)
            y14 = binary_from_remaining(remaining, horizon=14, follow_up_days=follow)
            if y7 is None and y14 is None:
                skipped_immature += 1
                continue
            scored += 1
            run_type = str(pred.get("run_type") or "unknown")
            if y7 is not None:
                rows_7.append((y7, float(p7), run_type, obs_date.isoformat()))
                segments[run_type].append((y7, float(p7)))
            if y14 is not None:
                rows_14.append((y14, float(p14), run_type, obs_date.isoformat()))
            median = pred.get("median_remaining_days")
            if remaining is not None and median is not None:
                remaining_errors.append(abs(float(median) - float(remaining)))

    def _horizon_block(rows: Sequence[tuple[int, float, str, str]], threshold: float) -> dict[str, Any]:
        y = [row[0] for row in rows]
        p = [row[1] for row in rows]
        if not y:
            return {"n": 0, "note": "no matured predictions"}
        metrics = classification_metrics(y, p, threshold=threshold)
        return {
            **metrics,
            "brier": brier_score(y, p),
            "reliability": reliability_table(y, p),
            "cohorts": _cohort_counts(rows),
        }

    return {
        "as_of": as_of.isoformat(),
        "scored_predictions": scored,
        "immature_predictions": skipped_immature,
        "end_within_7d": _horizon_block(rows_7, last_chance_threshold),
        "end_within_14d": _horizon_block(rows_14, leaving_soon_threshold),
        "remaining_days_mae": (
            sum(remaining_errors) / len(remaining_errors) if remaining_errors else None
        ),
        "remaining_days_n": len(remaining_errors),
        "segments": {
            name: classification_metrics(
                [y for y, _p in pairs],
                [p for _y, p in pairs],
                threshold=last_chance_threshold,
            )
            for name, pairs in sorted(segments.items())
            if pairs
        },
        "note": (
            "Prospective scores use later realized run ends only. "
            "They do not update production predictions or retrain v1."
        ),
    }


def _cohort_counts(rows: Sequence[tuple[int, float, str, str]]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for _y, _p, _run_type, obs_date in rows:
        counts[obs_date] += 1
    return dict(sorted(counts.items()))


def run_ends_from_lifecycle_rows(rows: Sequence[Any]) -> dict[str, date | None]:
    """Map run_id to the latest known run end date from later observations."""
    ends: dict[str, date | None] = {}
    for row in rows:
        run_id = getattr(row, "run_id", None) or (row.get("run_id") if isinstance(row, Mapping) else None)
        if not run_id:
            continue
        remaining = getattr(row, "remaining_days", None)
        if remaining is None and isinstance(row, Mapping):
            remaining = row.get("remaining_days")
        event_observed = getattr(row, "event_observed", None)
        if event_observed is None and isinstance(row, Mapping):
            event_observed = row.get("event_observed")
        obs = getattr(row, "observation_date", None)
        if obs is None and isinstance(row, Mapping):
            obs = _parse_date(row.get("observation_date"))
        if remaining is None or obs is None or not event_observed:
            continue
        if isinstance(obs, str):
            obs = _parse_date(obs)
        if obs is None:
            continue
        ends[str(run_id)] = obs + timedelta(days=int(remaining))
    return ends
