"""Extension risk for a near-term listed ending. Does not change production scoring.

The question is not whether a film will leave within 7 days in general. It is
whether the final show date on today's listing is the date the run actually ends.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import roc_auc_score
from sklearn.tree import DecisionTreeClassifier, export_text

from reel_seattle.analysis.leaving_soon_feature_value import (
    TRAIN_END,
    VAL_END,
    Bundle,
    _apply,
    _dedupe_latest,
    _finalize_market_and_theater_features,
    _fit,
    _labeled,
    _matrix,
    _split,
    build_feature_rows,
    feature_names,
    load_bundle,
    precision_at_recall,
    score_binary,
    still_listed,
)
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    SEGMENT_ORDINARY,
    SEGMENT_RERELEASE,
    SEGMENT_SPECIAL,
    Engagement,
    Screening,
    time_block,
    upcoming_friday,
    weekday_name,
    wilson_interval,
)

PRIMARY_POPULATION = "earliest_within_7"
MODEL_FEATURES = (
    "days_to_known_last",
    "listed_end_wednesday",
    "listed_end_thursday",
    "listed_end_before_friday",
    "screenings_on_final_day",
    "screenings_final_3_days",
    "snapshots_on_this_final",
    "days_on_this_final",
    "prior_extension_count",
    "days_since_last_extension",
    "moved_within_3_snapshots",
    "distinct_final_dates",
    "final_vs_recent_average",
    "percent_decline_from_peak",
    "prime_share_final_3",
    "premium_in_final_3",
    "market_theater_count",
    "other_theaters_beyond_listed_end",
    "share_other_theaters_on_same_end",
    "this_theater_is_earliest_exit",
    "all_theaters_share_listed_end",
    "incoming_friday_screenings",
    "new_films_on_friday",
    "theater_today_vs_baseline",
    "segment_rerelease",
    "segment_special",
    "days_since_opening",
    "theatrical_week_number",
    "left_truncated",
)


def classify_listed_end(
    *,
    listed_final: date,
    observation: date,
    later_shows: Sequence[tuple[date, date]],
    confirmed: bool,
    as_of: date,
) -> dict[str, Any] | None:
    """Label whether listings after *observation* added a kept show past *listed_final*.

    ``later_shows`` is ``(show_date, first_snapshot)`` for kept, same-engagement
    screenings dated after the listed final. A show already visible on the
    observation date means this was not the listed final. No added show and an
    unconfirmed end is censored.
    """
    if any(show_date > listed_final and first_snapshot <= observation for show_date, first_snapshot in later_shows):
        return None
    added = [(show_date, first_snapshot) for show_date, first_snapshot in later_shows if show_date > listed_final and first_snapshot > observation]
    if added:
        first_published = min(first_snapshot for _show_date, first_snapshot in added)
        new_final = max(show_date for show_date, _first_snapshot in added)
        by_snapshot: dict[date, date] = {}
        for show_date, first_snapshot in added:
            current = by_snapshot.get(first_snapshot)
            if current is None or show_date > current:
                by_snapshot[first_snapshot] = show_date
        moves = 0
        running = listed_final
        for snapshot in sorted(by_snapshot):
            if by_snapshot[snapshot] > running:
                moves += 1
                running = by_snapshot[snapshot]
        return {
            "extended": 1,
            "extension_first_observed": first_published.isoformat(),
            "extension_magnitude_days": (new_final - listed_final).days,
            "days_until_extension_visible": (first_published - observation).days,
            "extension_published_before_listed_end": int(first_published < listed_final),
            "extension_published_on_listed_end": int(first_published == listed_final),
            "extension_published_after_listed_end": int(first_published > listed_final),
            "extension_timing_day": (first_published - listed_final).days,
            "later_final_date_moves": moves,
        }
    if confirmed and listed_final < as_of:
        return {
            "extended": 0,
            "extension_first_observed": "",
            "extension_magnitude_days": 0,
            "days_until_extension_visible": "",
            "extension_published_before_listed_end": 0,
            "extension_published_on_listed_end": 0,
            "extension_published_after_listed_end": 0,
            "extension_timing_day": "",
            "later_final_date_moves": 0,
        }
    return None


def _finite(value: Any, default: float | None = None) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and not math.isnan(float(value)):
        return float(value)
    return default


def _engagement_index(engagements: Sequence[Engagement]) -> dict[tuple[str, str], list[Engagement]]:
    indexed: dict[tuple[str, str], list[Engagement]] = defaultdict(list)
    for engagement in engagements:
        indexed[(engagement.film_id, engagement.theater_id)].append(engagement)
    return indexed


def _engagement_for(indexed: Mapping[tuple[str, str], Sequence[Engagement]], film_id: str, theater_id: str, listed_final: date) -> Engagement | None:
    chosen = None
    for engagement in indexed.get((film_id, theater_id), ()):
        if engagement.start_date <= listed_final <= engagement.end_date:
            chosen = engagement
    return chosen


def _later_kept_shows(engagement: Engagement, listed_final: date) -> list[tuple[date, date]]:
    shows: list[tuple[date, date]] = []
    for screening in engagement.screenings:
        if screening.canceled or screening.removed_before_show or screening.show_date <= listed_final:
            continue
        shows.append((screening.show_date, screening.first_snapshot))
    return shows


def _listed_counts(engagement: Engagement, observation: date, listed_final: date) -> dict[str, float]:
    listed = [item for item in list(engagement.screenings) + list(engagement.removed_screenings) if still_listed(item, observation)]
    def count_on(day: date) -> int:
        return sum(1 for item in listed if item.show_date == day)
    final_days = [listed_final - timedelta(days=offset) for offset in range(3)]
    final_shows = [item for item in listed if item.show_date in set(final_days)]
    prime = sum(1 for item in final_shows if time_block(item.minutes) == "prime")
    premium = sum(1 for item in final_shows if item.premium)
    return {
        "screenings_on_final_day": float(count_on(listed_final)),
        "screenings_final_2_days": float(count_on(listed_final) + count_on(listed_final - timedelta(days=1))),
        "screenings_final_3_days": float(sum(count_on(day) for day in final_days)),
        "prime_share_final_3": (prime / len(final_shows)) if final_shows else 0.0,
        "premium_in_final_3": 1.0 if premium else 0.0,
    }


def _history_from_prior(prior: Sequence[Mapping[str, Any]], current: Mapping[str, Any]) -> dict[str, float]:
    final = current["known_last_show_date"]
    appeared = date.fromisoformat(current["observation_date"])
    snapshots = 1
    for row in reversed(prior):
        if row["known_last_show_date"] != final:
            break
        appeared = date.fromisoformat(row["observation_date"])
        snapshots += 1
    distinct = len({row["known_last_show_date"] for row in prior} | {final})
    features = current["features"]
    return {
        "snapshots_on_this_final": float(snapshots),
        "days_on_this_final": float((date.fromisoformat(current["observation_date"]) - appeared).days),
        "prior_extension_count": float(_finite(features.get("extension_count_so_far"), 0.0) or 0.0),
        "days_since_last_extension": float(_finite(features.get("days_since_last_extension"), 0.0) or 0.0),
        "moved_within_3_snapshots": float(_finite(features.get("final_date_moved_last_3"), 0.0) or 0.0),
        "distinct_final_dates": float(distinct),
    }


def attach_extension_rows(rows: Sequence[dict[str, Any]], bundle: Bundle) -> list[dict[str, Any]]:
    indexed = _engagement_index(bundle.film_theater)
    by_film_date: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_film_date[(row["film_id"], row["observation_date"])].append(row)
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    full_history: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    prepared: list[dict[str, Any]] = []
    for row in rows:
        if row.get("known_last_show_date") and row.get("days_since_opening") is not None:
            start = date.fromisoformat(row["observation_date"]) - timedelta(days=int(row["days_since_opening"]))
            full_history[(row["film_id"], row["theater_id"], start.isoformat())].append(row)
    for row in rows:
        listed_final = date.fromisoformat(row["known_last_show_date"])
        observation = date.fromisoformat(row["observation_date"])
        days = _finite(row["features"].get("days_to_known_last"))
        if days is None or days > 7:
            continue
        engagement = _engagement_for(indexed, row["film_id"], row["theater_id"], listed_final)
        if engagement is None:
            continue
        later_shows = _later_kept_shows(engagement, listed_final)
        outcome = classify_listed_end(
            listed_final=listed_final,
            observation=observation,
            later_shows=later_shows,
            confirmed=engagement.confirmed,
            as_of=bundle.as_of,
        )
        if outcome is None:
            continue
        start = observation - timedelta(days=int(row["days_since_opening"]))
        record = {
            **{key: row[key] for key in ("film_id", "title", "theater_id", "theater_name", "observation_date", "segment", "known_last_show_date", "production_p7", "days_since_opening", "today_n", "next7", "y7", "features")},
            "engagement_start": start.isoformat(),
            "days_to_known_last": int(days),
            "full_stable_snapshots": row.get("stable_snapshots"),
            **outcome,
        }
        grouped[(record["film_id"], record["theater_id"], record["engagement_start"])].append(record)
        prepared.append(record)
    for sequence in grouped.values():
        sequence.sort(key=lambda item: item["observation_date"])
        seen_within_3 = False
        previous_final = None
        for index, record in enumerate(sequence):
            history = _history_from_prior(sequence[:index], record)
            record.update(history)
            stable = record.get("full_stable_snapshots")
            if isinstance(stable, int) and stable > 0:
                record["snapshots_on_this_final"] = float(stable)
                record["days_on_this_final"] = float(stable - 1)
            history_rows = full_history.get((record["film_id"], record["theater_id"], record["engagement_start"]), ())
            seen_finals = {
                item["known_last_show_date"]
                for item in history_rows
                if item["observation_date"] <= record["observation_date"]
            }
            if seen_finals:
                record["distinct_final_dates"] = float(len(seen_finals))
            record["in_population_a"] = 0
            record["in_population_b"] = 0
            record["in_population_c"] = 0
            if index == 0:
                record["in_population_a"] = 1
                record["in_population_c"] = 1
            if record["days_to_known_last"] <= 3 and not seen_within_3:
                record["in_population_b"] = 1
                record["in_population_c"] = 1
                seen_within_3 = True
            if previous_final is not None and record["known_last_show_date"] != previous_final:
                record["in_population_c"] = 1
            previous_final = record["known_last_show_date"]
    for record in prepared:
        _add_market_features(record, by_film_date[(record["film_id"], record["observation_date"])])
        _add_local_features(record)
    return prepared


def _add_market_features(record: dict[str, Any], peers: Sequence[Mapping[str, Any]]) -> None:
    listed = date.fromisoformat(record["known_last_show_date"])
    others = [peer for peer in peers if peer["theater_id"] != record["theater_id"]]
    other_finals = [date.fromisoformat(peer["known_last_show_date"]) for peer in others]
    beyond = sum(1 for final in other_finals if final > listed)
    same = sum(1 for final in other_finals if final == listed)
    record["other_theaters_beyond_listed_end"] = float(beyond)
    record["other_theaters_on_same_end"] = float(same)
    record["share_other_theaters_on_same_end"] = (same / len(other_finals)) if other_finals else float("nan")
    record["market_theater_count_today"] = float(1 + len(other_finals))
    record["this_theater_is_earliest_exit"] = 1.0 if not other_finals or listed <= min(other_finals) else 0.0
    record["this_theater_is_latest_exit"] = 1.0 if not other_finals or listed >= max(other_finals) else 0.0
    record["all_theaters_share_listed_end"] = 1.0 if other_finals and all(final == listed for final in other_finals) else 0.0
    record["solo_theater"] = 1.0 if not other_finals else 0.0


def _add_local_features(record: dict[str, Any]) -> None:
    features = record["features"]
    listed = date.fromisoformat(record["known_last_show_date"])
    observation = date.fromisoformat(record["observation_date"])
    recent = _finite(features.get("avg_screenings_prior_3_play_days"))
    on_final = record.get("screenings_on_final_day")
    record["listed_end_weekday"] = weekday_name(listed)
    record["observation_weekday"] = weekday_name(observation)
    record["listed_end_wednesday"] = 1.0 if listed.weekday() == 2 else 0.0
    record["listed_end_thursday"] = 1.0 if listed.weekday() == 3 else 0.0
    record["listed_end_before_friday"] = 1.0 if listed < upcoming_friday(observation) else 0.0
    record["final_vs_recent_average"] = (float(on_final) / recent) if on_final is not None and recent else float("nan")
    record["percent_decline_from_peak"] = _finite(features.get("percent_decline_from_peak"), 0.0)
    record["market_theater_count"] = record["market_theater_count_today"]
    record["incoming_friday_screenings"] = _finite(features.get("incoming_friday_screenings"), float("nan"))
    record["new_films_on_friday"] = _finite(features.get("new_films_on_friday"), float("nan"))
    record["theater_today_vs_baseline"] = _finite(features.get("theater_today_vs_baseline"), float("nan"))
    record["friday_completeness"] = _finite(features.get("friday_completeness"), float("nan"))
    record["segment_rerelease"] = 1.0 if record["segment"] == SEGMENT_RERELEASE else 0.0
    record["segment_special"] = 1.0 if record["segment"] == SEGMENT_SPECIAL else 0.0
    record["theatrical_week_number"] = _finite(features.get("theatrical_week_number"), 0.0)
    record["left_truncated"] = _finite(features.get("left_truncated"), 0.0)
    record["days_since_opening"] = float(record["days_since_opening"])


def _with_show_counts(records: list[dict[str, Any]], bundle: Bundle) -> None:
    indexed = _engagement_index(bundle.film_theater)
    for record in records:
        engagement = _engagement_for(indexed, record["film_id"], record["theater_id"], date.fromisoformat(record["known_last_show_date"]))
        if engagement is None:
            continue
        record.update(_listed_counts(engagement, date.fromisoformat(record["observation_date"]), date.fromisoformat(record["known_last_show_date"])))
        recent = _finite(record["features"].get("avg_screenings_prior_3_play_days"))
        on_final = record.get("screenings_on_final_day")
        record["final_vs_recent_average"] = (float(on_final) / recent) if on_final is not None and recent else float("nan")


def population(records: Sequence[dict[str, Any]], name: str) -> list[dict[str, Any]]:
    flag = {"a": "in_population_a", "b": "in_population_b", "c": "in_population_c"}[name]
    return [row for row in records if row.get(flag) == 1]


def _rate_table(rows: Sequence[Mapping[str, Any]], key_fn, label_name: str) -> list[dict[str, Any]]:
    buckets: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        buckets[str(key_fn(row))].append(int(row["extended"]))
    out = []
    for label, values in buckets.items():
        interval = wilson_interval(sum(values), len(values))
        out.append(
            {
                label_name: label,
                "n": len(values),
                "extensions": int(sum(values)),
                "extension_rate": (sum(values) / len(values)) if values else None,
                "ci_low": interval[0] if interval else None,
                "ci_high": interval[1] if interval else None,
            }
        )
    return out


def earliest_in_bucket(records: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """One row per engagement per days-to-end bucket: the first day the listing is in that bucket."""
    chosen: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in records:
        bucket = days_bucket(int(row["days_to_known_last"]))
        key = (row["film_id"], row["theater_id"], row["engagement_start"], bucket)
        current = chosen.get(key)
        if current is None or row["observation_date"] < current["observation_date"]:
            chosen[key] = row
    return list(chosen.values())


def earliest_within_days(records: Sequence[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    chosen: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in records:
        if int(row["days_to_known_last"]) > limit:
            continue
        key = (row["film_id"], row["theater_id"], row["engagement_start"])
        current = chosen.get(key)
        if current is None or row["observation_date"] < current["observation_date"]:
            chosen[key] = row
    return list(chosen.values())


def days_bucket(days: int) -> str:
    if days <= 1:
        return "1"
    if days == 2:
        return "2"
    if days == 3:
        return "3"
    if days <= 5:
        return "4-5"
    return "6-7"


def week_bucket(record: Mapping[str, Any]) -> str:
    if int(record["days_since_opening"]) < 0:
        return "pre-opening"
    week = int(record.get("theatrical_week_number") or 0)
    if week <= 1:
        return "week 1"
    if week == 2:
        return "week 2"
    return "week 3+"


def descriptive_tables(rows: Sequence[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    return {
        "by_days": _rate_table(rows, lambda row: days_bucket(int(row["days_to_known_last"])), "days_to_known_last"),
        "by_segment": _rate_table(rows, lambda row: row["segment"], "segment"),
        "by_theater": _rate_table(rows, lambda row: row["theater_name"], "theater"),
        "by_week": _rate_table(rows, week_bucket, "theatrical_week"),
        "by_listed_weekday": _rate_table(rows, lambda row: row["listed_end_weekday"], "listed_end_weekday"),
        "by_observation_weekday": _rate_table(rows, lambda row: row["observation_weekday"], "observation_weekday"),
        "by_other_theaters_beyond": _rate_table(
            rows,
            lambda row: "0" if row["other_theaters_beyond_listed_end"] == 0 else "1" if row["other_theaters_beyond_listed_end"] == 1 else "2+",
            "other_theaters_beyond",
        ),
        "by_shared_market_end": _rate_table(
            rows,
            lambda row: "shared" if row["all_theaters_share_listed_end"] == 1 else "solo" if row["solo_theater"] == 1 else "split",
            "market_end_state",
        ),
        "by_final_day_screenings": _rate_table(
            rows,
            lambda row: "0-1" if row.get("screenings_on_final_day", 99) <= 1 else "2-3" if row.get("screenings_on_final_day", 99) <= 3 else "4+",
            "final_day_screenings",
        ),
    }


def timing_rows(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for segment in (SEGMENT_ORDINARY, SEGMENT_RERELEASE, SEGMENT_SPECIAL, "all"):
        chosen = [row for row in rows if row["extended"] == 1 and (segment == "all" or row["segment"] == segment)]
        buckets: dict[int, int] = defaultdict(int)
        for row in chosen:
            day = row.get("extension_timing_day")
            if day == "" or day is None:
                continue
            buckets[int(day)] += 1
        total = sum(buckets.values())
        running = 0
        for day in range(min(buckets, default=0), max(buckets, default=0) + 1):
            running += buckets.get(day, 0)
            out.append(
                {
                    "segment": segment,
                    "days_from_listed_end": day,
                    "extensions_published": buckets.get(day, 0),
                    "cumulative_share": (running / total) if total else None,
                    "n_extensions": total,
                }
            )
    return out


def _split_records(rows: Sequence[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    train, validation, holdout = [], [], []
    for row in rows:
        day = date.fromisoformat(row["observation_date"])
        if day <= TRAIN_END:
            train.append(row)
        elif day <= VAL_END:
            validation.append(row)
        else:
            holdout.append(row)
    return {"train": train, "validation": validation, "holdout": holdout}


def _xy(rows: Sequence[Mapping[str, Any]]) -> tuple[np.ndarray, np.ndarray]:
    matrix = np.empty((len(rows), len(MODEL_FEATURES)), dtype=float)
    target = np.empty(len(rows), dtype=int)
    for i, row in enumerate(rows):
        target[i] = int(row["extended"])
        for j, name in enumerate(MODEL_FEATURES):
            value = row.get(name, float("nan"))
            matrix[i, j] = float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else float("nan")
    return matrix, target


def _binary_metrics(y: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, Any]:
    metrics = score_binary(y, scores, threshold)
    if y.size and len(set(y.tolist())) > 1:
        metrics["roc_auc"] = float(roc_auc_score(y, scores))
    else:
        metrics["roc_auc"] = None
    trust = scores < threshold
    trusted = int(np.sum(trust))
    false_trust = int(np.sum(trust & (y == 1)))
    genuine = y == 0
    metrics["predicted_genuine"] = trusted
    metrics["false_trust_count"] = false_trust
    metrics["false_trust_rate"] = (false_trust / trusted) if trusted else None
    metrics["genuine_precision"] = (1.0 - metrics["false_trust_rate"]) if metrics["false_trust_rate"] is not None else None
    caught = int(np.sum(trust & genuine))
    metrics["genuine_recall"] = (caught / int(genuine.sum())) if genuine.sum() else None
    return metrics


def _choose_trust_threshold(y: np.ndarray, scores: np.ndarray) -> float:
    """Prefer a trust rule whose false-trust rate stays at or under 20%, with broad coverage."""
    if y.size == 0:
        return 0.5
    best = ( -1.0, 1.0, 0.5)
    for threshold in np.quantile(scores, np.linspace(0.05, 0.95, 19)):
        metrics = _binary_metrics(y, scores, float(threshold))
        rate = metrics["false_trust_rate"]
        recall = metrics["genuine_recall"] or 0.0
        if rate is None:
            continue
        if rate <= 0.20 and recall > best[0]:
            best = (recall, -rate, float(threshold))
    if best[0] >= 0:
        return best[2]
    fallback = (1.0, 0.5)
    for threshold in np.quantile(scores, np.linspace(0.05, 0.95, 19)):
        rate = _binary_metrics(y, scores, float(threshold))["false_trust_rate"]
        if rate is not None and rate < fallback[0]:
            fallback = (rate, float(threshold))
    return fallback[1]


def _fit_extension(train: list[dict[str, Any]], validation: list[dict[str, Any]], holdout: list[dict[str, Any]]) -> dict[str, Any]:
    if len(train) < 40 or len({row["extended"] for row in train}) < 2:
        return {"status": "insufficient_train", "n_train": len(train)}
    x_train, y_train = _xy(train)
    imputer, scaler, model = _fit(x_train, y_train)
    def scores_for(rows: list[dict[str, Any]]) -> np.ndarray:
        if not rows:
            return np.array([])
        matrix, _target = _xy(rows)
        return _apply(imputer, scaler, model, matrix)
    validation_scores = scores_for(validation)
    holdout_scores = scores_for(holdout)
    y_validation = np.array([row["extended"] for row in validation]) if validation else np.array([])
    y_holdout = np.array([row["extended"] for row in holdout]) if holdout else np.array([])
    threshold = _choose_trust_threshold(y_validation, validation_scores) if len(y_validation) else 0.5
    coefficients = sorted(
        ({"feature": name, "coefficient": float(weight)} for name, weight in zip(MODEL_FEATURES, model.coef_[0])),
        key=lambda item: abs(item["coefficient"]),
        reverse=True,
    )
    return {
        "status": "ok",
        "threshold": threshold,
        "coefficients": coefficients,
        "validation": _binary_metrics(y_validation, validation_scores, threshold) if len(y_validation) else {},
        "holdout": _binary_metrics(y_holdout, holdout_scores, threshold) if len(y_holdout) else {},
        "holdout_scores": holdout_scores,
        "imputer": imputer,
        "scaler": scaler,
        "model": model,
    }


def _tree_model(train: list[dict[str, Any]], validation: list[dict[str, Any]], holdout: list[dict[str, Any]]) -> dict[str, Any]:
    if len(train) < 40 or len({row["extended"] for row in train}) < 2:
        return {"status": "insufficient_train"}
    imputer = SimpleImputer(strategy="median")
    x_train, y_train = _xy(train)
    filled = imputer.fit_transform(x_train)
    tree = DecisionTreeClassifier(max_depth=3, min_samples_leaf=20, class_weight="balanced", random_state=42)
    tree.fit(filled, y_train)
    def scores_for(rows: list[dict[str, Any]]) -> np.ndarray:
        if not rows:
            return np.array([])
        matrix, _target = _xy(rows)
        return tree.predict_proba(imputer.transform(matrix))[:, 1]
    y_validation = np.array([row["extended"] for row in validation]) if validation else np.array([])
    validation_scores = scores_for(validation)
    threshold = _choose_trust_threshold(y_validation, validation_scores) if len(y_validation) else 0.5
    y_holdout = np.array([row["extended"] for row in holdout]) if holdout else np.array([])
    return {
        "status": "ok",
        "threshold": threshold,
        "rules": export_text(tree, feature_names=list(MODEL_FEATURES), decimals=2),
        "validation": _binary_metrics(y_validation, validation_scores, threshold) if len(y_validation) else {},
        "holdout": _binary_metrics(y_holdout, scores_for(holdout), threshold) if len(y_holdout) else {},
    }


def _rule_metrics(rows: Sequence[dict[str, Any]], mask: Sequence[bool]) -> dict[str, Any]:
    chosen = [row for row, keep in zip(rows, mask) if keep]
    if not rows:
        return {"n": 0}
    extensions = sum(int(row["extended"]) for row in chosen)
    genuine_all = sum(1 for row in rows if row["extended"] == 0)
    genuine_caught = sum(1 for row in chosen if row["extended"] == 0)
    return {
        "n_population": len(rows),
        "coverage": len(chosen) / len(rows),
        "n_flagged": len(chosen),
        "extensions_among_flagged": extensions,
        "false_trust_rate": (extensions / len(chosen)) if chosen else None,
        "genuine_precision": ((len(chosen) - extensions) / len(chosen)) if chosen else None,
        "genuine_recall": (genuine_caught / genuine_all) if genuine_all else None,
        "extension_recall_if_inverted": None,
    }


def evaluate_rules(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    def days(row: Mapping[str, Any]) -> int:
        return int(row["days_to_known_last"])
    specs = {
        "always_trust": lambda row: True,
        "within_2_days": lambda row: days(row) <= 2,
        "within_2_and_no_other_theater_beyond": lambda row: days(row) <= 2 and row["other_theaters_beyond_listed_end"] == 0,
        "all_theaters_share_end": lambda row: row["all_theaters_share_listed_end"] == 1,
        "final_day_at_most_one": lambda row: row.get("screenings_on_final_day", 99) <= 1,
        "within_2_and_stable_3_snapshots": lambda row: days(row) <= 2 and row.get("moved_within_3_snapshots", 1) == 0,
        "special_within_7": lambda row: row["segment"] == SEGMENT_SPECIAL,
    }
    return {name: _rule_metrics(rows, [pred(row) for row in rows]) for name, pred in specs.items()}


def _baseline_scores(train: Sequence[dict[str, Any]], rows: Sequence[dict[str, Any]]) -> dict[str, np.ndarray]:
    segment_rate: dict[str, float] = {}
    for segment in {row["segment"] for row in train}:
        chosen = [row for row in train if row["segment"] == segment]
        segment_rate[segment] = sum(row["extended"] for row in chosen) / len(chosen) if chosen else 0.0
    overall = sum(row["extended"] for row in train) / len(train) if train else 0.0
    bucket_rate: dict[str, float] = {}
    for label in ("1", "2", "3", "4-5", "6-7"):
        chosen = [row for row in train if days_bucket(int(row["days_to_known_last"])) == label]
        bucket_rate[label] = (sum(row["extended"] for row in chosen) / len(chosen)) if chosen else overall
    segment_scores = np.array([segment_rate.get(row["segment"], overall) for row in rows], dtype=float)
    bucket_scores = np.array([bucket_rate[days_bucket(int(row["days_to_known_last"]))] for row in rows], dtype=float)
    production = []
    for row in rows:
        value = row.get("production_p7")
        if isinstance(value, float) and not math.isnan(value):
            production.append(1.0 - value)
        else:
            production.append(overall)
    return {
        "always_trust": np.zeros(len(rows)),
        "segment_rate": segment_scores,
        "days_bucket_rate": bucket_scores,
        "one_minus_production": np.array(production, dtype=float),
    }


def _count_block(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    engagements = {(row["film_id"], row["theater_id"], row["engagement_start"]) for row in rows}
    extensions = sum(int(row["extended"]) for row in rows)
    return {
        "n": len(rows),
        "engagements": len(engagements),
        "extensions": extensions,
        "extension_rate": (extensions / len(rows)) if rows else None,
    }


def _score_named(model_result: Mapping[str, Any], rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    if model_result.get("status") != "ok":
        return []
    matrix, _target = _xy(list(rows))
    scores = _apply(model_result["imputer"], model_result["scaler"], model_result["model"], matrix)
    threshold = float(model_result["threshold"])
    packed = []
    for row, score in zip(rows, scores):
        packed.append(_error_row(row, float(score), threshold))
    return packed


def _error_row(row: Mapping[str, Any], score: float, threshold: float) -> dict[str, Any]:
    trusted = score < threshold
    if row["extended"] == 1 and not trusted:
        kind = "extension_anticipated"
    elif row["extended"] == 1 and trusted:
        kind = "unexpected_extension"
    elif row["extended"] == 0 and not trusted:
        kind = "genuine_called_extension"
    else:
        kind = "genuine_trusted"
    return {
        "kind": kind,
        "title": row["title"],
        "theater": row["theater_name"],
        "observation_date": row["observation_date"],
        "listed_final_date": row["known_last_show_date"],
        "days_to_known_last": row["days_to_known_last"],
        "extended": row["extended"],
        "extension_first_observed": row.get("extension_first_observed", ""),
        "extension_magnitude_days": row.get("extension_magnitude_days", ""),
        "segment": row["segment"],
        "days_since_opening": row["days_since_opening"],
        "screenings_on_final_day": row.get("screenings_on_final_day", ""),
        "screenings_next_7": row.get("next7", ""),
        "other_theaters_beyond_listed_end": row.get("other_theaters_beyond_listed_end", ""),
        "all_theaters_share_listed_end": row.get("all_theaters_share_listed_end", ""),
        "prior_extension_count": row.get("prior_extension_count", ""),
        "snapshots_on_this_final": row.get("snapshots_on_this_final", ""),
        "extension_probability": round(score, 4),
        "production_p7": row.get("production_p7", ""),
        "trusted_as_genuine": int(trusted),
        "in_population_a": row.get("in_population_a", ""),
    }


def _spotlight(scored: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    wanted = ("buddy", "akira", "fall 2")
    found = []
    for row in scored:
        title = str(row["title"]).casefold()
        if not any(token in title for token in wanted):
            continue
        if row.get("in_population_a") == 1 or row.get("observation_date") == "2026-09-07":
            found.append(row)
    return found


def _boosted_model(train: list[dict[str, Any]], validation: list[dict[str, Any]], holdout: list[dict[str, Any]]) -> dict[str, Any]:
    extensions = sum(int(row["extended"]) for row in train)
    if len(train) < 100 or extensions < 25 or len({row["extended"] for row in train}) < 2:
        return {
            "status": "skipped",
            "reason": "Train sample or extension count is below the gate (100 rows and 25 extensions).",
            "n_train": len(train),
            "extensions": extensions,
        }
    imputer = SimpleImputer(strategy="median")
    x_train, y_train = _xy(train)
    model = GradientBoostingClassifier(n_estimators=80, max_depth=2, learning_rate=0.05, random_state=42)
    model.fit(imputer.fit_transform(x_train), y_train)

    def scores_for(rows: list[dict[str, Any]]) -> np.ndarray:
        if not rows:
            return np.array([])
        matrix, _target = _xy(rows)
        return model.predict_proba(imputer.transform(matrix))[:, 1]

    y_validation = np.array([row["extended"] for row in validation]) if validation else np.array([])
    validation_scores = scores_for(validation)
    threshold = _choose_trust_threshold(y_validation, validation_scores) if len(y_validation) else 0.5
    y_holdout = np.array([row["extended"] for row in holdout]) if holdout else np.array([])
    return {
        "status": "ok",
        "threshold": threshold,
        "validation": _binary_metrics(y_validation, validation_scores, threshold) if len(y_validation) else {},
        "holdout": _binary_metrics(y_holdout, scores_for(holdout), threshold) if len(y_holdout) else {},
    }


def simulate_leaving_soon(feature_rows: Sequence[dict[str, Any]], extension_model: Mapping[str, Any]) -> dict[str, Any]:
    """Compare leave-within-7 scores on the same one-row-per-engagement holdout as the feature audit.

    A listed end exactly 7 days out is inside the extension-risk population, but the
    leave-within-7 label used here matches production: remaining days 0 through 6.
    """
    from reel_seattle.analysis.leaving_soon_feature_value import _fit_eval

    labeled = _labeled(list(feature_rows), "y7")
    parts = _split(labeled)
    train = parts["train"]
    validation = _dedupe_latest(parts["validation"])
    holdout = _dedupe_latest(parts["holdout"])
    existing_result = _fit_eval(train, validation, holdout, feature_names("existing"), "y7")
    y = np.array([row["y7"] for row in holdout])
    production = np.array([
        float(row["production_p7"]) if isinstance(row.get("production_p7"), float) and not math.isnan(row["production_p7"]) else 0.0
        for row in holdout
    ])
    naive = np.array([1.0 if (_finite(row["features"].get("days_to_known_last"), 99) or 99) < 7 else 0.0 for row in holdout])
    existing_scores = np.array(existing_result.get("holdout_scores", []), dtype=float)
    matched = extension_model.get("scores_by_key", {})
    sim_soft = []
    sim_hard = []
    threshold = float(extension_model.get("threshold", 0.5))
    unmatched = 0
    for row, naive_score in zip(holdout, naive):
        key = (row["film_id"], row["theater_id"], row["observation_date"])
        probability = matched.get(key)
        if naive_score == 0:
            sim_soft.append(0.0)
            sim_hard.append(0.0)
            continue
        if probability is None:
            unmatched += 1
            sim_soft.append(1.0)
            sim_hard.append(1.0)
            continue
        sim_soft.append(1.0 - probability)
        sim_hard.append(1.0 if probability < threshold else 0.0)
    def pack(scores: np.ndarray, threshold_value: float) -> dict[str, Any]:
        if scores.size != y.size:
            return {"n": int(y.size), "note": "score length mismatch"}
        metrics = score_binary(y, scores, threshold_value)
        metrics["precision_at_recall_50"] = precision_at_recall(y, scores, 0.5)
        return metrics
    existing_threshold = float(existing_result.get("threshold", 0.5))
    return {
        "n": len(holdout),
        "positives": int(y.sum()) if y.size else 0,
        "production": pack(production, 0.6792084024655126),
        "naive_listed_end_within_7": pack(naive, 0.5),
        "existing_feature_logistic": pack(existing_scores, existing_threshold) if existing_scores.size == y.size else {"n": 0},
        "listed_end_times_genuine_probability": pack(np.array(sim_soft), 0.5),
        "listed_end_and_low_extension_risk": pack(np.array(sim_hard), 0.5),
        "near_term_rows_without_extension_score": unmatched,
    }


def feature_dictionary() -> list[dict[str, str]]:
    definitions = {
        "days_to_known_last": "Days from the observation to the latest show date listed that day.",
        "listed_end_wednesday": "1 when that listed final date is a Wednesday.",
        "listed_end_thursday": "1 when that listed final date is a Thursday.",
        "listed_end_before_friday": "1 when the listed final date falls before the Friday on or after the observation.",
        "screenings_on_final_day": "Showtimes listed on the current final date.",
        "screenings_final_3_days": "Showtimes listed on the final date and the two dates before it.",
        "snapshots_on_this_final": "Consecutive snapshots, ending today, that have shown this same final date.",
        "days_on_this_final": "Calendar days since this final date first appeared.",
        "prior_extension_count": "How many times the listed final date had already moved later before today.",
        "days_since_last_extension": "Days since the listed final last moved later.",
        "moved_within_3_snapshots": "1 when the listed final changed within the last three snapshots.",
        "distinct_final_dates": "How many different listed finals this engagement has shown up to today.",
        "final_vs_recent_average": "Final-day showtimes divided by the recent played-day average.",
        "percent_decline_from_peak": "Drop from the busiest played day so far to the latest played day.",
        "prime_share_final_3": "Share of listed final-three-day showtimes that fall in prime time.",
        "premium_in_final_3": "1 when any premium-format show is listed in those three days.",
        "market_theater_count": "Seattle AMC theaters listing this film with a future show today.",
        "other_theaters_beyond_listed_end": "Other theaters whose own listed final is after this theater's date.",
        "share_other_theaters_on_same_end": "Share of other active theaters whose listed final equals this date.",
        "this_theater_is_earliest_exit": "1 when no other theater lists an earlier final.",
        "all_theaters_share_listed_end": "1 when every other active theater lists this same final date.",
        "incoming_friday_screenings": "Friday showtimes for films that have not yet played at this theater.",
        "new_films_on_friday": "Count of those not-yet-played films.",
        "theater_today_vs_baseline": "This theater's listed volume today divided by its past weekday baseline.",
        "segment_rerelease": "1 for a catalog rerelease.",
        "segment_special": "1 for a catalog special.",
        "days_since_opening": "Days since this engagement's first show. Negative before opening.",
        "theatrical_week_number": "0 before the first played show, then 1, 2, 3…",
        "left_truncated": "1 when the run was already underway on the first day of the dataset.",
    }
    return [
        {
            "feature": name,
            "definition": definitions[name],
            "available_at_prediction_time": "yes",
            "source": "screening lifecycle listings on or before the observation date",
            "leakage_risk": "low",
        }
        for name in MODEL_FEATURES
    ]


def run_extension_audit(root: Path) -> dict[str, Any]:
    bundle = load_bundle(root)
    feature_rows = build_feature_rows(bundle)
    _finalize_market_and_theater_features(feature_rows, bundle)
    records = attach_extension_rows(feature_rows, bundle)
    _with_show_counts(records, bundle)
    for record in records:
        recent = _finite(record["features"].get("avg_screenings_prior_3_play_days"))
        on_final = record.get("screenings_on_final_day")
        record["final_vs_recent_average"] = (float(on_final) / recent) if on_final is not None and recent else float("nan")
    primary = population(records, "a")
    early = population(records, "b")
    changes = population(records, "c")
    split = _split_records(primary)
    logistic = _fit_extension(split["train"], split["validation"], split["holdout"])
    tree = _tree_model(split["train"], split["validation"], split["holdout"])
    boosted = _boosted_model(split["train"], split["validation"], split["holdout"])
    baselines = {}
    if split["holdout"]:
        y_holdout = np.array([row["extended"] for row in split["holdout"]])
        for name, scores in _baseline_scores(split["train"], split["holdout"]).items():
            threshold = 0.5 if name != "always_trust" else 0.5
            if name == "always_trust":
                baselines[name] = _binary_metrics(y_holdout, scores, 0.5)
            else:
                threshold = _choose_trust_threshold(
                    np.array([row["extended"] for row in split["validation"]]),
                    _baseline_scores(split["train"], split["validation"])[name],
                ) if split["validation"] else 0.5
                baselines[name] = _binary_metrics(y_holdout, scores, threshold)
    scores_by_key = {}
    if logistic.get("status") == "ok":
        matrix, _target = _xy(records)
        probabilities = _apply(logistic["imputer"], logistic["scaler"], logistic["model"], matrix)
        for row, probability in zip(records, probabilities):
            scores_by_key[(row["film_id"], row["theater_id"], row["observation_date"])] = float(probability)
        logistic["scores_by_key"] = scores_by_key
    scored_holdout = []
    if logistic.get("status") == "ok" and logistic.get("holdout_scores") is not None:
        scored_holdout = [
            _error_row(row, float(score), float(logistic["threshold"]))
            for row, score in zip(split["holdout"], logistic["holdout_scores"])
        ]
    scored_all = _score_named(logistic, records) if logistic.get("status") == "ok" else []
    simulation = simulate_leaving_soon(feature_rows, logistic)
    horizon = earliest_in_bucket(records)
    ordinary_horizon = [row for row in horizon if row["segment"] == SEGMENT_ORDINARY]
    opened_ordinary_horizon = [row for row in ordinary_horizon if float(row["days_since_opening"]) >= 0]
    within_2 = earliest_within_days(records, 2)
    within_2_split = _split_records(within_2)
    opened_ordinary = [row for row in primary if row["segment"] == SEGMENT_ORDINARY and float(row["days_since_opening"]) >= 0]
    return {
        "as_of": bundle.as_of.isoformat(),
        "dataset_start": bundle.dataset_start.isoformat(),
        "train_end": TRAIN_END.isoformat(),
        "validation_end": VAL_END.isoformat(),
        "primary_population": PRIMARY_POPULATION,
        "primary_reason": (
            "One row per engagement: the first snapshot on which the listed final date is within 7 days. "
            "That is the moment a near-term end becomes visible, without a stack of later days from the same run."
        ),
        "counts": {
            "population_a_within_7": _count_block(primary),
            "population_b_within_3": _count_block(early),
            "population_c_change_points": _count_block(changes),
            "train": _count_block(split["train"]),
            "validation": _count_block(split["validation"]),
            "holdout": _count_block(split["holdout"]),
            "opened_ordinary_first_entry": _count_block(opened_ordinary),
            "within_2_days": _count_block(within_2),
            "within_2_holdout": _count_block(within_2_split["holdout"]),
        },
        "descriptive": descriptive_tables(primary),
        "descriptive_current_horizon": descriptive_tables(horizon)["by_days"],
        "descriptive_ordinary_horizon": descriptive_tables(ordinary_horizon)["by_days"],
        "descriptive_opened_ordinary_horizon": descriptive_tables(opened_ordinary_horizon)["by_days"],
        "timing": timing_rows(primary),
        "rules_all": evaluate_rules(primary),
        "rules_holdout": evaluate_rules(split["holdout"]),
        "rules_within_2_holdout": evaluate_rules(within_2_split["holdout"]),
        "baselines": baselines,
        "logistic": {key: value for key, value in logistic.items() if key not in {"imputer", "scaler", "model", "holdout_scores", "scores_by_key"}},
        "tree": tree,
        "boosted": boosted,
        "simulation": simulation,
        "errors": {
            "anticipated": [row for row in scored_holdout if row["kind"] == "extension_anticipated"][:40],
            "unexpected": [row for row in scored_holdout if row["kind"] == "unexpected_extension"][:40],
            "genuine_called_extension": [row for row in scored_holdout if row["kind"] == "genuine_called_extension"][:40],
            "genuine_trusted": [row for row in scored_holdout if row["kind"] == "genuine_trusted"][:40],
        },
        "spotlight": _spotlight(scored_all),
        "observations": primary,
        "change_points": changes,
        "holdout_scores": logistic.get("holdout_scores", np.array([])),
        "holdout_rows": split["holdout"],
    }
