"""Shadow remaining-run forecasts.

The selected model is the PR #140 pre-publication hazard plus the PR #141
opening-footprint family. Auditorium, price, schedule-quality, market-shape,
and archetype families are not in the feature list. Production Leaving Soon
scoring is read for comparison and is not written.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from reel_seattle.analysis.leaving_soon_feature_expansion import OPENING, _score, enrich_observations, load_stable_metadata
from reel_seattle.analysis.leaving_soon_feature_value import load_bundle, still_listed
from reel_seattle.analysis.leaving_soon_frozen import load_active_model
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    SUBSTANTIAL,
    _attach_market,
    _feature_names,
    _film_features,
    _fit_hazard,
    _market_rows,
    _predict_rows,
    _segment_flags,
    _split,
    _week_screenings,
    build_booking_cycles,
    build_observations,
    distribution_from_hazards,
)
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import programming_week_friday
from reel_seattle.analysis.leaving_soon_survival import NORMAL_FIRST_RUN, make_observation
from reel_seattle.analysis.tmdb_weekly_snapshot import append_jsonl_gz, estimate_tmdb_cost

MODEL_VERSION = "remaining_run_shadow_v1"
PUBLICATION_THRESHOLD = SUBSTANTIAL
THEATER_FEATURES = [*_feature_names(True), *OPENING]
MARKET_FEATURES = list(_feature_names(True))
REFERENCE_HOLDOUT = {
    "log_loss": 0.7273115637950004,
    "brier": 0.3537960657253071,
    "pr_auc_final_week": 0.9095179805895279,
    "pr_auc_exactly_1": 0.45369365392339034,
    "pr_auc_exactly_2": 0.24539076741720792,
    "pr_auc_3_plus": 0.796162092634904,
    "median_abs_error_capped": 0.20659650923107392,
    "ranking_pairwise": 0.8770447921004104,
}
COMPACT_FEATURES = (
    "current_week_screenings",
    "opening_week_screenings",
    "peak_week_screenings",
    "theatrical_week_number",
    "days_since_first_show",
    "market_theater_count",
    "market_screenings",
    "share_of_theater",
    "rank_in_theater",
    "theater_week_vs_baseline",
    "has_premium",
    "has_prime",
    "decline_from_peak",
    "wow_pct_change",
    "segment",
    "opening_market_theaters",
    "opening_market_screenings",
    "current_over_opening",
    "current_over_peak",
    "next_week_titles_already_listed",
)

FORECAST_LEDGER = Path("data/history/remaining_run_forecasts.jsonl.gz")
EVALUATION_LEDGER = Path("data/history/remaining_run_forecast_evaluation.jsonl.gz")
TMDB_DYNAMIC_LEDGER = Path("data/history/tmdb_dynamic_snapshots.jsonl.gz")
TMDB_STABLE_LEDGER = Path("data/history/tmdb_stable_enrichment.jsonl.gz")
SHADOW_MODEL_PATH = Path("data/models/remaining_run_shadow/current.json")
SHADOW_CURRENT = Path("data/model_predictions/remaining_run_shadow/current.json")


def selected_feature_names() -> list[str]:
    names = list(THEATER_FEATURES)
    blocked = ("auditorium", "layout", "adult_price", "sold_out", "archetype", "arch_")
    for name in names:
        lowered = name.lower()
        if any(token in lowered for token in blocked):
            raise RuntimeError(f"selected model includes a rejected feature: {name}")
    return names


def horizon_friday(snapshot: date) -> date:
    """Friday that opens the programming week after the week containing snapshot."""
    return programming_week_friday(snapshot) + timedelta(days=7)


def friday_listing_count(screenings, theater_id: str, friday: date, snapshot: date) -> int:
    return sum(
        1
        for show in screenings
        if show.theater_id == theater_id and show.show_date == friday and not show.canceled and still_listed(show, snapshot)
    )


def typical_friday_volume(screenings, theater_id: str, upcoming: date, as_of: date) -> float:
    counts: dict[date, int] = defaultdict(int)
    for show in screenings:
        if show.theater_id != theater_id or show.canceled or show.removed_before_show:
            continue
        if show.show_date.weekday() != 4 or show.show_date >= upcoming or show.show_date >= as_of:
            continue
        counts[show.show_date] += 1
    if not counts:
        return 0.0
    return float(np.median(list(counts.values())))


def publication_status(screenings, theater_id: str, snapshots: Sequence[date], upcoming: date, latest: date) -> dict[str, Any]:
    """80% of other Fridays, using only listings visible on each snapshot."""
    typical = typical_friday_volume(screenings, theater_id, upcoming, latest)
    window = [day for day in snapshots if upcoming - timedelta(days=8) <= day <= latest and day < upcoming]
    hit = None
    latest_completeness = 0.0
    for day in window:
        count = friday_listing_count(screenings, theater_id, upcoming, day)
        share = (count / typical) if typical else 0.0
        if day == latest or (window and day == window[-1] and latest >= day):
            latest_completeness = share
        if hit is None and typical and share >= PUBLICATION_THRESHOLD:
            hit = day
    if latest in snapshots:
        latest_completeness = (friday_listing_count(screenings, theater_id, upcoming, latest) / typical) if typical else 0.0
    if hit is None:
        return {
            "forecast_state": "pre_publication",
            "feature_snapshot": latest,
            "publication_snapshot": None,
            "publication_completeness": latest_completeness,
            "publication_threshold": PUBLICATION_THRESHOLD,
            "typical_friday_volume": typical,
        }
    prior = [day for day in snapshots if day < hit]
    return {
        "forecast_state": "post_publication",
        "feature_snapshot": max(prior) if prior else hit,
        "publication_snapshot": hit,
        "publication_completeness": latest_completeness,
        "publication_threshold": PUBLICATION_THRESHOLD,
        "typical_friday_volume": typical,
    }


def serialize_hazard(model: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if model is None:
        return None
    return {
        "columns": list(model["columns"]),
        "imputer_statistics": [None if math.isnan(float(value)) else float(value) for value in model["imputer"].statistics_],
        "scaler_mean": [float(value) for value in model["scaler"].mean_],
        "scaler_scale": [float(value) for value in model["scaler"].scale_],
        "coef": [float(value) for value in model["model"].coef_[0]],
        "intercept": float(model["model"].intercept_[0]),
        "positive_class_index": int(list(model["model"].classes_).index(1)) if 1 in list(model["model"].classes_) else 1,
    }


def _sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def hazards_from_serialized(spec: Mapping[str, Any], row: Mapping[str, Any]) -> list[float]:
    columns = list(spec["columns"])
    stats = spec["imputer_statistics"]
    mean = spec["scaler_mean"]
    scale = spec["scaler_scale"]
    coef = spec["coef"]
    intercept = float(spec["intercept"])
    hazards = []
    for period in range(3):
        raw = []
        for index, name in enumerate(columns):
            if name == "period_1":
                value = 1.0 if period == 1 else 0.0
            elif name == "period_2":
                value = 1.0 if period == 2 else 0.0
            else:
                candidate = row.get(name, float("nan"))
                value = float(candidate) if isinstance(candidate, (int, float)) and not isinstance(candidate, bool) else float("nan")
            if math.isnan(value):
                fill = stats[index]
                value = 0.0 if fill is None else float(fill)
            denom = scale[index] or 1.0
            raw.append((value - mean[index]) / denom)
        score = intercept + sum(weight * item for weight, item in zip(coef, raw))
        hazards.append(_sigmoid(score))
    return hazards


def probabilities_from_serialized(spec: Mapping[str, Any], row: Mapping[str, Any]) -> dict[str, float]:
    probs = distribution_from_hazards(hazards_from_serialized(spec, row))
    expected = probs[1] + 2 * probs[2] + 3 * probs[3]
    return {
        "p_final_week": probs[0],
        "p_plus_1_week": probs[1],
        "p_plus_2_weeks": probs[2],
        "p_plus_3_plus": probs[3],
        "expected_remaining_weeks": expected,
    }


def reproduce_selected_model(root: Path) -> dict[str, Any]:
    """Train on the PR #141 split and score the same holdout."""
    bundle = load_bundle(root)
    cycles = build_booking_cycles(bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of)
    primary = build_observations(bundle, cycles, kind="before_80")
    enrich_observations(primary, bundle.screenings, load_stable_metadata(root), {}, bundle.dataset_start)
    parts = _split(primary)
    metrics, _rows = _score(parts["train"], parts["holdout"], selected_feature_names())
    market = _market_rows_local(primary)
    market_parts = _split(market)
    market_metrics, _market_rows = _score(market_parts["train"], market_parts["holdout"], MARKET_FEATURES)
    return {"theater": metrics, "market": market_metrics, "primary": primary, "bundle": bundle, "cycles": cycles}


def _market_rows_local(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return _market_rows(rows)


def within_reference(metrics: Mapping[str, Any], *, log_loss_tolerance: float = 0.02) -> bool:
    loss = metrics.get("log_loss")
    if not isinstance(loss, float):
        return False
    return abs(loss - REFERENCE_HOLDOUT["log_loss"]) <= log_loss_tolerance


def fit_shadow_models(primary: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    theater = _fit_hazard(primary, selected_feature_names())
    market_rows = _market_rows_local(primary)
    market = _fit_hazard(market_rows, MARKET_FEATURES)
    return {"theater": theater, "market": market, "market_rows": len(market_rows), "theater_rows": len(primary)}


def _jsonable(value: Any) -> Any:
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, date):
        return value.isoformat()
    return value


def build_live_observations(bundle, snapshot: date, upcoming: date, theater_ids: set[str] | None = None) -> list[dict[str, Any]]:
    """Film x theater rows for one horizon, using listings visible at snapshot."""
    from reel_seattle.analysis.leaving_soon_prepublication_survival import _cover

    visible = upcoming - timedelta(days=7)
    shows_by_pair: dict[tuple[str, str], list] = defaultdict(list)
    for show in bundle.screenings:
        shows_by_pair[(show.film_id, show.theater_id)].append(show)
    engagements = defaultdict(list)
    for engagement in bundle.film_theater:
        engagements[(engagement.film_id, engagement.theater_id)].append(engagement)
    week_totals: dict[tuple[str, date], int] = defaultdict(int)
    for show in bundle.screenings:
        if show.canceled or show.removed_before_show or show.show_date >= snapshot:
            continue
        week_totals[(show.theater_id, programming_week_friday(show.show_date))] += 1
    rows: list[dict[str, Any]] = []
    for theater_id, theater_name in sorted(bundle.theater_names.items(), key=lambda item: item[1]):
        if theater_ids is not None and theater_id not in theater_ids:
            continue
        baseline_values = [count for (tid, week), count in week_totals.items() if tid == theater_id and week < visible]
        baseline = float(np.median(baseline_values)) if baseline_values else 0.0
        film_counts: dict[str, int] = {}
        film_shows: dict[str, list] = {}
        for (film_id, tid), shows in shows_by_pair.items():
            if tid != theater_id:
                continue
            listed = _week_screenings(shows, visible, visible + timedelta(days=6), snapshot)
            if not listed:
                continue
            film_counts[film_id] = len(listed)
            film_shows[film_id] = shows
        ranking = sorted(film_counts, key=lambda film: (-film_counts[film], film))
        ranks = {film: index + 1 for index, film in enumerate(ranking)}
        theater_total = sum(film_counts.values())
        new_films = 0
        for (candidate_id, tid), candidate_shows in shows_by_pair.items():
            if tid != theater_id:
                continue
            played = False
            listed_next = False
            for show in candidate_shows:
                if show.canceled:
                    continue
                if show.show_date < snapshot and not show.removed_before_show:
                    played = True
                elif show.show_date >= upcoming and still_listed(show, snapshot):
                    listed_next = True
            if listed_next and not played:
                new_films += 1
        for film_id, total in film_counts.items():
            engagement = _cover(engagements.get((film_id, theater_id), ()), visible, visible + timedelta(days=6))
            if engagement is None:
                continue
            features = _film_features(
                film_shows[film_id],
                snapshot=snapshot,
                visible_friday=visible,
                next_friday=upcoming,
                first_show=engagement.start_date,
                dataset_start=bundle.dataset_start,
                left_truncated=engagement.left_truncated,
                theater_total=theater_total,
                rank=ranks[film_id],
                theater_baseline=baseline,
                peers=(),
            )
            features["next_week_titles_already_listed"] = float(new_films)
            rows.append(
                {
                    "snapshot_kind": "shadow",
                    "film_id": film_id,
                    "title": engagement.title,
                    "theater_id": theater_id,
                    "theater_name": theater_name,
                    "observation_date": snapshot.isoformat(),
                    "upcoming_friday": upcoming.isoformat(),
                    "visible_friday": visible.isoformat(),
                    "thursday": (upcoming - timedelta(days=1)).isoformat(),
                    "segment": engagement.segment,
                    "split_date": snapshot.isoformat(),
                    "censored": 1,
                    "bucket": None,
                    "remaining_weeks": None,
                    "known_weeks": 0,
                    **features,
                    **_segment_flags(engagement.segment),
                }
            )
    _attach_market(rows)
    return rows


def _production_probability(model, row: Mapping[str, Any]) -> float | None:
    if model is None:
        return None
    from reel_seattle.analysis.leaving_soon_scheduling_assumptions import SEGMENT_ORDINARY as _ORD, SEGMENT_RERELEASE as _RER

    run_type = NORMAL_FIRST_RUN if row["segment"] == _ORD else "rerelease_anniversary" if row["segment"] == _RER else "unknown_other_special"
    horizon = row.get("days_to_known_last")
    observation = make_observation(
        observation_date=row["observation_date"],
        title=row["title"],
        product_id=row["film_id"],
        run_id=f"{row['film_id']}#{row['theater_id']}",
        run_type=run_type,
        announced_horizon_days=int(horizon) if isinstance(horizon, float) and not math.isnan(horizon) else 6,
        days_since_run_start=max(0, int(row["days_since_first_show"])),
        theater_count=max(1, int(row["market_theater_count"])),
        showtime_count=int(row["current_week_screenings"]),
        days_with_announced_showtimes=int(row["distinct_show_dates"]),
        showtimes_per_active_day=float(row["screenings_per_show_date"]),
        weekend_showtime_count=int(row.get("weekend_screenings") or 0),
        prime_time_showtime_count=int(row.get("prime_screenings") or 0),
        premium_format_count=int(row.get("premium_screenings") or 0),
        premium_format_share=float(row["premium_share"]),
        left_truncated=bool(row["left_truncated"]),
    )
    return float(model.predict_calibrated(observation)["p_end_within_7d"])


def _confirmed_tmdb(root: Path) -> dict[str, int]:
    """AMC source film id to TMDB id from the identity catalog, then reviewed decisions."""
    matched: dict[str, int] = {}
    catalog_path = root / "data" / "film_identity" / "film_identity_catalog.json"
    if catalog_path.exists():
        payload = json.loads(catalog_path.read_text(encoding="utf-8"))
        for film in payload.get("films") or []:
            if film.get("match_status") not in {"confirmed_automatic", "confirmed_manual"}:
                continue
            tmdb_id = film.get("tmdb_id")
            if not isinstance(tmdb_id, int):
                continue
            for source in film.get("source_identities") or []:
                source_id = str(source.get("source_film_id") or "")
                if source_id:
                    matched[source_id] = tmdb_id
    path = root / "data" / "film_identity" / "tmdb_match_decisions.json"
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
        for decision in payload.get("decisions") or []:
            if not decision.get("active") or decision.get("decision") != "confirm":
                continue
            source = str((decision.get("source_identity") or {}).get("source_film_id") or "")
            tmdb_id = decision.get("tmdb_id")
            if source and isinstance(tmdb_id, int):
                matched[source] = tmdb_id
    return matched


def _prediction_id(grain: str, film_id: str, theater_id: str, upcoming: str, state: str, observation: str) -> str:
    return "|".join((MODEL_VERSION, grain, film_id, theater_id, upcoming, state, observation))


def _compact(row: Mapping[str, Any], probs: Mapping[str, float], *, grain: str, state: Mapping[str, Any], generated_at: str, production_p7: float | None, rank: int | None) -> dict[str, Any]:
    features = {name: _jsonable(row.get(name)) for name in selected_feature_names()}
    features["segment"] = row.get("segment")
    return {
        "record_type": "forecast",
        "prediction_id": _prediction_id(grain, row["film_id"], row.get("theater_id") or "market", row["upcoming_friday"], state["forecast_state"], row["observation_date"]),
        "generated_at": generated_at,
        "model_version": MODEL_VERSION,
        "grain": grain,
        "film_id": row["film_id"],
        "title": row.get("title"),
        "theater_id": None if grain == "market" else row.get("theater_id"),
        "theater_name": row.get("theater_name"),
        "observation_date": row["observation_date"],
        "prediction_date": row["observation_date"],
        "current_programming_week": row["visible_friday"],
        "upcoming_friday": row["upcoming_friday"],
        "forecast_state": state["forecast_state"],
        "publication_completeness": state.get("publication_completeness"),
        "publication_threshold": PUBLICATION_THRESHOLD,
        "publication_snapshot": state["publication_snapshot"].isoformat() if state.get("publication_snapshot") else None,
        "booking_cycle_snapshot": row["observation_date"],
        "p_final_week": probs["p_final_week"],
        "p_plus_1_week": probs["p_plus_1_week"],
        "p_plus_2_weeks": probs["p_plus_2_weeks"],
        "p_plus_3_plus": probs["p_plus_3_plus"],
        "expected_remaining_weeks": probs["expected_remaining_weeks"],
        "urgency_score": probs["p_final_week"],
        "urgency_rank": rank,
        "production_p_end_within_7d": production_p7,
        "segment": row.get("segment"),
        "features": features,
        "compact_features": {name: _jsonable(row.get(name)) for name in COMPACT_FEATURES},
        "censoring_state": "unresolved",
        "eventual_remaining_weeks": None,
        "eventual_bucket": None,
    }


def score_live(bundle, spec_theater: Mapping[str, Any], spec_market: Mapping[str, Any], *, generated_at: str, production_model=None, tmdb_index: Mapping[str, int] | None = None) -> dict[str, Any]:
    latest = max(bundle.snapshot_dates)
    upcoming = horizon_friday(latest)
    per_theater_state = {
        theater_id: publication_status(bundle.screenings, theater_id, bundle.snapshot_dates, upcoming, latest)
        for theater_id in bundle.theater_names
    }
    grouped: dict[date, set[str]] = defaultdict(set)
    for theater_id, state in per_theater_state.items():
        grouped[state["feature_snapshot"]].add(theater_id)
    theater_rows: list[dict[str, Any]] = []
    for snapshot, theater_ids in grouped.items():
        theater_rows.extend(build_live_observations(bundle, snapshot, upcoming, theater_ids))
    _attach_market(theater_rows)
    if theater_rows:
        enrich_observations(theater_rows, bundle.screenings, {}, {}, bundle.dataset_start)
    scored = []
    for row in theater_rows:
        state = per_theater_state[row["theater_id"]]
        probs = probabilities_from_serialized(spec_theater, row)
        production_p7 = _production_probability(production_model, row) if production_model is not None else None
        record = _compact(row, probs, grain="theater", state=state, generated_at=generated_at, production_p7=production_p7, rank=None)
        if tmdb_index and row["film_id"] in tmdb_index:
            record["tmdb_id"] = tmdb_index[row["film_id"]]
            record["canonical_film_id"] = f"tmdb:{tmdb_index[row['film_id']]}"
        scored.append(record)
    for theater_id in {row["theater_id"] for row in scored}:
        peers = sorted((row for row in scored if row["theater_id"] == theater_id), key=lambda item: (-item["urgency_score"], item["film_id"]))
        for rank, row in enumerate(peers, start=1):
            row["urgency_rank"] = rank
    market_source = []
    for row in theater_rows:
        copy = dict(row)
        copy["current_week_screenings"] = float(row.get("market_screenings") or row["current_week_screenings"])
        copy["theater_name"] = "Seattle AMC market"
        market_source.append(copy)
    chosen: dict[str, dict[str, Any]] = {}
    for row in market_source:
        current = chosen.get(row["film_id"])
        if current is None or row["observation_date"] < current["observation_date"]:
            chosen[row["film_id"]] = row
    market_records = []
    states_for_market = list(per_theater_state.values())
    market_state = {
        "forecast_state": "post_publication" if states_for_market and all(item["forecast_state"] == "post_publication" for item in states_for_market) else "pre_publication",
        "publication_snapshot": None,
        "publication_completeness": float(np.median([item["publication_completeness"] for item in states_for_market])) if states_for_market else None,
    }
    for row in chosen.values():
        probs = probabilities_from_serialized(spec_market, row)
        record = _compact(row, probs, grain="market", state=market_state, generated_at=generated_at, production_p7=None, rank=None)
        if tmdb_index and row["film_id"] in tmdb_index:
            record["tmdb_id"] = tmdb_index[row["film_id"]]
            record["canonical_film_id"] = f"tmdb:{tmdb_index[row['film_id']]}"
        market_records.append(record)
    market_records.sort(key=lambda item: (-item["urgency_score"], item["film_id"]))
    for rank, row in enumerate(market_records, start=1):
        row["urgency_rank"] = rank
    return {
        "as_of": latest.isoformat(),
        "upcoming_friday": upcoming.isoformat(),
        "publication_by_theater": {
            theater_id: {
                "forecast_state": state["forecast_state"],
                "feature_snapshot": state["feature_snapshot"].isoformat(),
                "publication_snapshot": state["publication_snapshot"].isoformat() if state["publication_snapshot"] else None,
                "publication_completeness": state["publication_completeness"],
                "typical_friday_volume": state["typical_friday_volume"],
            }
            for theater_id, state in per_theater_state.items()
        },
        "theaters": scored,
        "market": market_records,
    }


def disagreement_rows(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows = []
    by_film: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in payload["theaters"]:
        by_film[row["film_id"]].append(row)
        production = row.get("production_p_end_within_7d")
        if isinstance(production, float) and production >= 0.5 and row["p_final_week"] < 0.35 and row["expected_remaining_weeks"] >= 1.5:
            rows.append({**_public_probs(row), "disagreement": "production says leaving soon, shadow says a longer runway"})
        elif isinstance(production, float) and production < 0.3 and row["p_final_week"] >= 0.6:
            rows.append({**_public_probs(row), "disagreement": "production says safer, shadow says final week"})
    market_by_film = {row["film_id"]: row for row in payload["market"]}
    for film_id, peers in by_film.items():
        finals = [peer["p_final_week"] for peer in peers]
        if len(finals) >= 2 and max(finals) - min(finals) >= 0.40:
            rows.append(
                {
                    "film_id": film_id,
                    "title": peers[0].get("title"),
                    "grain": "theater",
                    "disagreement": "theater final-week probabilities differ by at least 0.40",
                    "p_final_week_min": min(finals),
                    "p_final_week_max": max(finals),
                }
            )
        market = market_by_film.get(film_id)
        if market and finals and abs(market["p_final_week"] - float(np.median(finals))) >= 0.25:
            rows.append(
                {
                    "film_id": film_id,
                    "title": market.get("title"),
                    "grain": "market",
                    "disagreement": "market model disagrees with the median theater by at least 0.25",
                    "market_p_final_week": market["p_final_week"],
                    "median_theater_p_final_week": float(np.median(finals)),
                }
            )
    return rows


def _public_probs(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "film_id": row["film_id"],
        "title": row.get("title"),
        "theater_id": row.get("theater_id"),
        "theater_name": row.get("theater_name"),
        "grain": row.get("grain"),
        "forecast_state": row.get("forecast_state"),
        "p_final_week": row["p_final_week"],
        "p_plus_1_week": row["p_plus_1_week"],
        "p_plus_2_weeks": row["p_plus_2_weeks"],
        "p_plus_3_plus": row["p_plus_3_plus"],
        "expected_remaining_weeks": row["expected_remaining_weeks"],
        "production_p_end_within_7d": row.get("production_p_end_within_7d"),
    }


def append_ledger(path: Path, rows: Sequence[Mapping[str, Any]]) -> int:
    return append_jsonl_gz(path, rows, key_fn=lambda row: row["prediction_id"] + "|" + row["record_type"])


def evaluation_seed(forecasts: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    seeded = []
    for row in forecasts:
        seeded.append(
            {
                "record_type": "evaluation",
                "prediction_id": row["prediction_id"],
                "model_version": row["model_version"],
                "grain": row["grain"],
                "film_id": row["film_id"],
                "theater_id": row.get("theater_id"),
                "prediction_date": row["prediction_date"],
                "upcoming_friday": row["upcoming_friday"],
                "forecast_state": row["forecast_state"],
                "p_final_week": row["p_final_week"],
                "p_plus_1_week": row["p_plus_1_week"],
                "p_plus_2_weeks": row["p_plus_2_weeks"],
                "p_plus_3_plus": row["p_plus_3_plus"],
                "expected_remaining_weeks": row["expected_remaining_weeks"],
                "censoring_state": "unresolved",
                "eventual_remaining_weeks": None,
                "eventual_bucket": None,
                "resolved_at": None,
            }
        )
    return seeded


def playing_tmdb_films(root: Path, theater_rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    index = _confirmed_tmdb(root)
    films = []
    seen = set()
    for row in theater_rows:
        tmdb_id = index.get(row["film_id"])
        if tmdb_id is None or tmdb_id in seen:
            continue
        seen.add(tmdb_id)
        films.append({"film_id": row["film_id"], "tmdb_id": tmdb_id, "title": row.get("title")})
    return films


def run_shadow_forecast(root: Path, *, generated_at: str | None = None) -> dict[str, Any]:
    generated_at = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    reproduced = reproduce_selected_model(root)
    metrics = reproduced["theater"]
    if not within_reference(metrics):
        raise RuntimeError(f"selected model log loss {metrics.get('log_loss')} is outside the PR #141 reference")
    fitted = fit_shadow_models(reproduced["primary"])
    spec_theater = serialize_hazard(fitted["theater"])
    spec_market = serialize_hazard(fitted["market"])
    if spec_theater is None or spec_market is None:
        raise RuntimeError("shadow model failed to fit")
    check_rows = [dict(row) for row in reproduced["primary"][:25]]
    _predict_rows(fitted["theater"], check_rows)
    for row in check_rows:
        if row.get("p0") != row.get("p0"):
            continue
        again = probabilities_from_serialized(spec_theater, row)
        if abs(again["p_final_week"] - row["p0"]) > 1e-8:
            raise RuntimeError("serialized hazard does not reproduce the fitted model")
    try:
        production = load_active_model(root / "data" / "models" / "leaving_soon" / "active.json")
    except (OSError, ValueError, KeyError):
        production = None
    live = score_live(
        reproduced["bundle"],
        spec_theater,
        spec_market,
        generated_at=generated_at,
        production_model=production,
        tmdb_index=_confirmed_tmdb(root),
    )
    films = playing_tmdb_films(root, live["theaters"])
    disagreements = disagreement_rows(live)
    manifest = {
        "role": "research_shadow_not_production",
        "model_version": MODEL_VERSION,
        "source_research": ["PR #140 pre-publication weekly hazard", "PR #141 opening footprint"],
        "excluded_families": [
            "schedule quality",
            "market shape beyond the PR #140 market block",
            "film archetypes",
            "PR #141 competition block",
            "auditorium hierarchy and movement",
            "price",
            "sold-out flags",
        ],
        "theater_features": selected_feature_names(),
        "market_features": MARKET_FEATURES,
        "market_method": "direct hazard on the film x week row, not an independence combination of theaters",
        "training_window": "all pre-publication rows available at generation, including censored rows only through their known survival periods",
        "verification_split": "train through 2026-08-16, holdout after 2026-09-06",
        "verification_holdout": {key: metrics.get(key) for key in REFERENCE_HOLDOUT},
        "verification_reference": REFERENCE_HOLDOUT,
        "market_holdout_pr140_features": {key: reproduced["market"].get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week")},
        "theater_model": spec_theater,
        "market_model": spec_market,
        "training_rows": {"theater": fitted["theater_rows"], "market": fitted["market_rows"]},
        "publication_threshold": PUBLICATION_THRESHOLD,
        "tmdb_cost": estimate_tmdb_cost(len(films)),
        "generated_at": generated_at,
    }
    return {"manifest": manifest, "live": live, "disagreements": disagreements, "tmdb_films": films, "generated_at": generated_at}


def write_shadow_outputs(root: Path, result: Mapping[str, Any]) -> dict[str, Path]:
    live = result["live"]
    day = live["as_of"]
    prediction_dir = root / "data" / "model_predictions" / "remaining_run_shadow"
    prediction_dir.mkdir(parents=True, exist_ok=True)
    current = {
        "generatedAt": result["generated_at"],
        "modelVersion": MODEL_VERSION,
        "asOf": live["as_of"],
        "upcomingFriday": live["upcoming_friday"],
        "publicationByTheater": live["publication_by_theater"],
        "market": [_artifact_row(row) for row in live["market"]],
        "theaters": [_artifact_row(row) for row in live["theaters"]],
        "disagreements": result["disagreements"],
    }
    (prediction_dir / f"{day}.json").write_text(json.dumps(current, indent=2), encoding="utf-8")
    (prediction_dir / "current.json").write_text(json.dumps(current, indent=2), encoding="utf-8")
    model_path = root / SHADOW_MODEL_PATH
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(json.dumps(result["manifest"], indent=2), encoding="utf-8")
    forecasts = [*live["theaters"], *live["market"]]
    append_ledger(root / FORECAST_LEDGER, forecasts)
    append_ledger(root / EVALUATION_LEDGER, evaluation_seed(forecasts))
    from reel_seattle.analysis.remaining_run_shadow_report import write_review

    write_review(root / "data" / "audits" / "remaining_run_shadow", current, result["manifest"])
    return {
        "current": prediction_dir / "current.json",
        "dated": prediction_dir / f"{day}.json",
        "model": model_path,
        "forecasts": root / FORECAST_LEDGER,
        "evaluation": root / EVALUATION_LEDGER,
    }


def _artifact_row(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "filmId": row.get("canonical_film_id") or row["film_id"],
        "sourceFilmId": row["film_id"],
        "title": row.get("title"),
        "theaterId": row.get("theater_id"),
        "theaterName": row.get("theater_name"),
        "predictionDate": row["prediction_date"],
        "currentProgrammingWeek": row["current_programming_week"],
        "pFinalWeek": row["p_final_week"],
        "pPlus1Week": row["p_plus_1_week"],
        "pPlus2Weeks": row["p_plus_2_weeks"],
        "pPlus3PlusWeeks": row["p_plus_3_plus"],
        "expectedRemainingWeeks": row["expected_remaining_weeks"],
        "urgencyScore": row["urgency_score"],
        "urgencyRank": row["urgency_rank"],
        "forecastState": row["forecast_state"],
        "publicationCompleteness": row.get("publication_completeness"),
        "publicationThreshold": row.get("publication_threshold"),
        "publicationSnapshot": row.get("publication_snapshot"),
        "bookingCycleSnapshot": row.get("booking_cycle_snapshot"),
        "modelVersion": row["model_version"],
        "productionPEndWithin7d": row.get("production_p_end_within_7d"),
        "segment": row.get("segment"),
        "inputs": row.get("compact_features"),
    }


def assert_probabilities(probs: Sequence[float]) -> None:
    if any(value < -1e-9 for value in probs):
        raise AssertionError("negative probability")
    if abs(sum(probs) - 1.0) > 1e-6:
        raise AssertionError("probabilities do not sum to 1")
