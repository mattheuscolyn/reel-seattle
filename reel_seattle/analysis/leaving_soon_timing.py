"""Presentation-safe Leaving Soon departure timing (publisher-owned).

Translates internal median remaining days into public semantic fields.
Does not retrain or expose calibrated probabilities.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Mapping

TIMING_CONFIDENCE_HIGH = "high"
TIMING_CONFIDENCE_MODERATE = "moderate"
TIMING_CONFIDENCE_LOW = "low"

TIMING_MODE_LIKELY_AROUND = "likely_around"
TIMING_MODE_COULD_AROUND = "could_around"
TIMING_MODE_HORIZON_ONLY = "horizon_only"

SCOPE_AMC = "amc"

# Same safe-failure window as inference stale gate (STALE_MAX_AGE_DAYS).
TIMING_FRESHNESS_MAX_AGE_DAYS = 2


@dataclass(frozen=True)
class DepartureTiming:
    prediction_as_of: date
    timing_confidence: str
    timing_mode: str
    predicted_end_date: date | None
    max_show_date: date | None
    scope: str = SCOPE_AMC

    def as_public_fields(self) -> dict[str, Any]:
        return {
            "prediction_as_of": self.prediction_as_of.isoformat(),
            "predicted_end_date": (
                self.predicted_end_date.isoformat() if self.predicted_end_date else None
            ),
            "timing_confidence": self.timing_confidence,
            "timing_mode": self.timing_mode,
            "prediction_scope": self.scope,
        }


def parse_iso_date(value: Any) -> date | None:
    from datetime import datetime

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


def model_median_end_date(
    *,
    observation_date: date,
    median_remaining_days: float | int | None,
    median_beyond_horizon: bool = False,
) -> date | None:
    """Raw calendar point estimate before booking lower-bound."""
    if median_beyond_horizon or median_remaining_days is None:
        return None
    try:
        days = int(round(float(median_remaining_days)))
    except (TypeError, ValueError):
        return None
    if days < 0:
        return None
    return observation_date + timedelta(days=days)


def bound_predicted_end_date(
    *,
    model_median_date: date | None,
    max_show_date: date | None,
) -> date | None:
    """Presentation lower-bound: never before an already-booked show date."""
    if model_median_date is None:
        return max_show_date
    if max_show_date is None:
        return model_median_date
    return max(model_median_date, max_show_date)


def classify_departure_timing(
    *,
    observation_date: date,
    leaving_soon_bucket: str | None,
    median_remaining_days: float | int | None,
    median_beyond_horizon: bool = False,
    weak_segment: str | None = None,
    max_show_date: date | None = None,
    today: date | None = None,
) -> DepartureTiming | None:
    """Build public timing semantics for one flagged Leaving Soon row.

    Returns None when the row should carry no timing fields (unknown bucket).
    """
    if leaving_soon_bucket not in {"last_chance", "leaving_soon"}:
        return None

    as_of = observation_date
    current = today or as_of
    stale = (current - as_of).days > TIMING_FRESHNESS_MAX_AGE_DAYS

    raw_median = model_median_end_date(
        observation_date=as_of,
        median_remaining_days=median_remaining_days,
        median_beyond_horizon=median_beyond_horizon,
    )
    bounded = bound_predicted_end_date(
        model_median_date=raw_median,
        max_show_date=max_show_date,
    )

    weak = bool(weak_segment)
    exact_ok = (
        not stale
        and not weak
        and bounded is not None
        and not median_beyond_horizon
        and median_remaining_days is not None
    )

    if exact_ok and leaving_soon_bucket == "last_chance":
        return DepartureTiming(
            prediction_as_of=as_of,
            timing_confidence=TIMING_CONFIDENCE_HIGH,
            timing_mode=TIMING_MODE_LIKELY_AROUND,
            predicted_end_date=bounded,
            max_show_date=max_show_date,
        )

    if exact_ok and leaving_soon_bucket == "leaving_soon":
        return DepartureTiming(
            prediction_as_of=as_of,
            timing_confidence=TIMING_CONFIDENCE_MODERATE,
            timing_mode=TIMING_MODE_COULD_AROUND,
            predicted_end_date=bounded,
            max_show_date=max_show_date,
        )

    # LOW / horizon-only: keep prediction_as_of + mode, omit exact date.
    return DepartureTiming(
        prediction_as_of=as_of,
        timing_confidence=TIMING_CONFIDENCE_LOW,
        timing_mode=TIMING_MODE_HORIZON_ONLY,
        predicted_end_date=None,
        max_show_date=max_show_date,
    )


def timing_fields_from_ranked_item(
    item: Any,
    *,
    max_show_date: date | None,
    observation_date: date | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Map a RankedPrediction (+ booking max) onto public timing fields."""
    obs = getattr(item, "observation", None)
    scores = getattr(item, "scores", None) or {}
    obs_date = observation_date
    if obs_date is None and obs is not None:
        obs_date = getattr(obs, "observation_date", None)
    if obs_date is None:
        obs_date = parse_iso_date(scores.get("observation_date"))
    if obs_date is None:
        return {}

    timing = classify_departure_timing(
        observation_date=obs_date,
        leaving_soon_bucket=getattr(item, "bucket", None),
        median_remaining_days=scores.get("median_remaining_days"),
        median_beyond_horizon=bool(scores.get("median_beyond_horizon")),
        weak_segment=getattr(item, "weak_segment", None),
        max_show_date=max_show_date,
        today=today,
    )
    if timing is None:
        return {}
    return timing.as_public_fields()


def assert_no_raw_probability_leakage(public_item: Mapping[str, Any]) -> None:
    forbidden = (
        "p_end_within_3d",
        "p_end_within_7d",
        "p_end_within_14d",
        "p_end_within_21d",
        "median_remaining_days",
        "expected_remaining_days",
        "median_beyond_horizon",
        "weak_segment",
    )
    leaked = [key for key in forbidden if key in public_item]
    if leaked:
        raise AssertionError(f"public Leaving Soon item leaked internal fields: {leaked}")
