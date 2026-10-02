"""Forecast remaining programming weeks before AMC publishes the next Fri–Thu week.

Does not change production Leaving Soon scores. The production discrete-hazard
model stays a comparison point: it is fit in days and uses the announced
horizon, which is exactly the signal this forecast is not allowed to see.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, log_loss, ndcg_score
from sklearn.preprocessing import StandardScaler

from reel_seattle.analysis.leaving_soon_feature_value import load_bundle, still_listed
from reel_seattle.analysis.leaving_soon_frozen import load_active_model
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    SEGMENT_ORDINARY,
    SEGMENT_RERELEASE,
    SEGMENT_SPECIAL,
    Engagement,
    Screening,
    programming_week_friday,
    time_block,
    weekday_name,
)
from reel_seattle.analysis.leaving_soon_survival import (
    NORMAL_FIRST_RUN,
    make_observation,
)

TRAIN_END = date(2026, 8, 16)
VAL_END = date(2026, 9, 6)
SUBSTANTIAL = 0.80
BUCKETS = ("final_week", "plus_1", "plus_2", "plus_3")

MATURITY = ("theatrical_week_number", "days_since_first_show", "left_truncated", "in_first_week", "in_second_week", "continuous_weeks")
CURRENT = (
    "current_week_screenings",
    "screenings_per_show_date",
    "distinct_show_dates",
    "thursday_screenings",
    "weekend_share",
    "prime_share",
    "premium_share",
    "days_with_1",
    "days_with_3plus",
)
TRAJECTORY = ("wow_pct_change", "decline_from_peak", "consecutive_decline_weeks", "is_weakest_week", "premium_lost", "prime_share_change")
MARKET = (
    "market_theater_count",
    "theater_count_wow",
    "market_screenings",
    "market_screenings_wow",
    "share_theaters_declining",
    "strongest_theater_screenings",
    "weakest_theater_screenings",
    "theaters_at_minimal",
)
COMMITMENT = ("share_of_theater", "rank_in_theater", "theater_week_vs_baseline", "has_premium", "has_prime")
SEGMENT = ("segment_rerelease", "segment_special", "segment_access", "segment_other")
INCOMING = ("next_week_titles_already_listed",)
FAMILY_ORDER = (
    ("maturity", MATURITY),
    ("current_week", CURRENT),
    ("trajectory", TRAJECTORY),
    ("market", MARKET),
    ("commitment", COMMITMENT),
    ("segment", SEGMENT),
    ("incoming", INCOMING),
)


def additional_programming_weeks(show_dates: Sequence[date], next_friday: date) -> int:
    """Consecutive Fri–Thu weeks starting at *next_friday* that contain a show."""
    present = set(show_dates)
    week = next_friday
    weeks = 0
    while weeks < 12:
        if any(week <= day <= week + timedelta(days=6) for day in present):
            weeks += 1
            week += timedelta(days=7)
            continue
        break
    return weeks


def classify_outcome(*, weeks: int, confirmed: bool, end_date: date, as_of: date) -> dict[str, Any]:
    """Bucket additional weeks. A run that reaches three more weeks is 3+ even if still open.

    Fewer than three observed future weeks and an unconfirmed end stay censored.
    """
    if weeks >= 3:
        return {"remaining_weeks": weeks, "bucket": 3, "censored": 0, "known_weeks": weeks}
    if confirmed and end_date < as_of:
        return {"remaining_weeks": weeks, "bucket": weeks, "censored": 0, "known_weeks": weeks}
    return {"remaining_weeks": None, "bucket": None, "censored": 1, "known_weeks": weeks}


def first_reaching(snapshot_dates: Sequence[date], counts: Mapping[date, int], typical: float, level: float) -> date | None:
    if typical <= 0:
        return None
    for day in snapshot_dates:
        if counts.get(day, 0) / typical >= level:
            return day
    return None


def last_snapshot_before(snapshot_dates: Sequence[date], transition: date | None) -> date | None:
    if transition is None:
        return None
    prior = [day for day in snapshot_dates if day < transition]
    return max(prior) if prior else None


def distribution_from_hazards(hazards: Sequence[float]) -> list[float]:
    """Turn three weekly exit hazards into P(0), P(1), P(2), P(3+)."""
    survival = 1.0
    mass = []
    for hazard in list(hazards)[:3]:
        hazard = min(1.0, max(0.0, float(hazard)))
        mass.append(survival * hazard)
        survival *= 1.0 - hazard
    mass.append(survival)
    total = sum(mass) or 1.0
    return [value / total for value in mass]


def _week_screenings(shows: Sequence[Screening], start: date, end: date, snapshot: date) -> list[Screening]:
    chosen = []
    for show in shows:
        if show.show_date < start or show.show_date > end:
            continue
        if still_listed(show, snapshot):
            chosen.append(show)
    return chosen


def _known_last(shows: Sequence[Screening], snapshot: date) -> date | None:
    dates = [show.show_date for show in shows if still_listed(show, snapshot) and show.show_date >= snapshot]
    if not dates:
        dates = [show.show_date for show in shows if still_listed(show, snapshot)]
    return max(dates) if dates else None


def _day_counts(shows: Sequence[Screening]) -> dict[date, int]:
    counts: dict[date, int] = defaultdict(int)
    for show in shows:
        counts[show.show_date] += 1
    return counts


def _segment_flags(segment: str) -> dict[str, float]:
    return {
        "segment_rerelease": 1.0 if segment == SEGMENT_RERELEASE else 0.0,
        "segment_special": 1.0 if segment == SEGMENT_SPECIAL else 0.0,
        "segment_access": 1.0 if segment == "accessibility_presentation" else 0.0,
        "segment_other": 1.0 if segment not in {SEGMENT_ORDINARY, SEGMENT_RERELEASE, SEGMENT_SPECIAL, "accessibility_presentation"} else 0.0,
    }


def _cover(engagements: Sequence[Engagement], start: date, end: date) -> Engagement | None:
    best = None
    for engagement in engagements:
        if engagement.start_date <= end and engagement.end_date >= start:
            if best is None or engagement.screening_count > best.screening_count:
                best = engagement
    return best


def build_booking_cycles(screenings: Sequence[Screening], snapshots: Sequence[date], theater_names: Mapping[str, str], as_of: date) -> list[dict[str, Any]]:
    """When each theater's next Friday reaches 50/80/95% of that theater's other Fridays."""
    played: dict[tuple[str, date], int] = defaultdict(int)
    for show in screenings:
        if show.canceled or show.removed_before_show or show.show_date.weekday() != 4 or show.show_date >= as_of:
            continue
        played[(show.theater_id, show.show_date)] += 1
    fridays = []
    friday = programming_week_friday(min(snapshots)) + timedelta(days=7)
    last = programming_week_friday(as_of)
    while friday <= last:
        fridays.append(friday)
        friday += timedelta(days=7)
    rows = []
    snapshot_list = list(snapshots)
    by_theater: dict[str, list[Screening]] = defaultdict(list)
    for show in screenings:
        by_theater[show.theater_id].append(show)
    for theater_id, theater_name in sorted(theater_names.items(), key=lambda item: item[1]):
        theater_shows = by_theater.get(theater_id, ())
        for upcoming in fridays:
            window = [day for day in snapshot_list if upcoming - timedelta(days=8) <= day < upcoming]
            if not window:
                continue
            typical_values = [count for (tid, day), count in played.items() if tid == theater_id and day != upcoming]
            typical = float(np.median(typical_values)) if typical_values else 0.0
            friday_counts: dict[date, int] = defaultdict(int)
            week_days: dict[date, set[date]] = defaultdict(set)
            for show in theater_shows:
                if show.canceled or show.show_date < upcoming or show.show_date > upcoming + timedelta(days=6):
                    continue
                for day in window:
                    if not still_listed(show, day):
                        continue
                    week_days[day].add(show.show_date)
                    if show.show_date == upcoming:
                        friday_counts[day] += 1
            hit50 = first_reaching(window, friday_counts, typical, 0.50)
            hit80 = first_reaching(window, friday_counts, typical, SUBSTANTIAL)
            hit95 = first_reaching(window, friday_counts, typical, 0.95)
            publication = hit80 or hit50
            pre = last_snapshot_before(snapshot_list, publication)
            monday = upcoming - timedelta(days=4)
            tuesday = upcoming - timedelta(days=3)
            days_at_80 = len(week_days.get(hit80, ())) if hit80 else 0
            first_any = next((day for day in window if week_days.get(day)), None)
            rows.append(
                {
                    "theater_id": theater_id,
                    "theater_name": theater_name,
                    "upcoming_friday": upcoming.isoformat(),
                    "typical_friday_volume": round(typical, 2),
                    "date_50": hit50.isoformat() if hit50 else "",
                    "weekday_50": weekday_name(hit50) if hit50 else "",
                    "date_80": hit80.isoformat() if hit80 else "",
                    "weekday_80": weekday_name(hit80) if hit80 else "",
                    "date_95": hit95.isoformat() if hit95 else "",
                    "weekday_95": weekday_name(hit95) if hit95 else "",
                    "publication_snapshot": publication.isoformat() if publication else "",
                    "prepublication_snapshot": pre.isoformat() if pre else "",
                    "monday_snapshot": monday.isoformat() if monday in snapshot_list and publication and monday < publication else "",
                    "tuesday_snapshot": tuesday.isoformat() if tuesday in snapshot_list and publication and tuesday < publication else "",
                    "weekdays_listed_at_80": days_at_80,
                    "full_week_same_snapshot": int(days_at_80 >= 6),
                    "incremental": int(bool(first_any and hit80 and first_any < hit80)),
                    "reached_80": int(hit80 is not None),
                }
            )
    return rows


def _film_features(
    shows: Sequence[Screening],
    *,
    snapshot: date,
    visible_friday: date,
    next_friday: date,
    first_show: date,
    dataset_start: date,
    left_truncated: bool,
    theater_total: int,
    rank: int,
    theater_baseline: float,
    peers: Sequence[Mapping[str, Any]],
) -> dict[str, float]:
    current = _week_screenings(shows, visible_friday, visible_friday + timedelta(days=6), snapshot)
    prior = _week_screenings(shows, visible_friday - timedelta(days=7), visible_friday - timedelta(days=1), snapshot)
    counts = _day_counts(current)
    total = len(current)
    distinct = len(counts)
    thursday = counts.get(visible_friday + timedelta(days=6), 0)
    weekend = sum(counts.get(visible_friday + timedelta(days=offset), 0) for offset in (0, 1, 2))
    prime = sum(1 for show in current if time_block(show.minutes) == "prime")
    premium = sum(1 for show in current if show.premium)
    history = []
    for back in range(1, 8):
        start = visible_friday - timedelta(days=7 * back)
        history.append(len(_week_screenings(shows, start, start + timedelta(days=6), snapshot)))
    peak = max([total] + history)
    decline_weeks = 0
    previous = total
    for count in history:
        if previous < count:
            decline_weeks += 1
            previous = count
            continue
        break
    prior_total = len(prior)
    prior_prime = sum(1 for show in prior if time_block(show.minutes) == "prime")
    prior_premium = sum(1 for show in prior if show.premium)
    origin = programming_week_friday(first_show)
    theatrical_week = 1 + max(0, (visible_friday - origin).days // 7) if first_show <= visible_friday + timedelta(days=6) else 0
    continuous = 0
    for count in [total] + history:
        if count:
            continuous += 1
            continue
        break
    next_titles = {
        show.film_id
        for show in shows
        if show.show_date >= next_friday and still_listed(show, snapshot) and show.show_date >= snapshot
    }
    known_last = _known_last(shows, snapshot)
    peer_counts = [int(peer["current_week_screenings"]) for peer in peers]
    peer_decline = 0
    for peer in peers:
        if peer.get("wow_pct_change") is not None and peer["wow_pct_change"] < 0:
            peer_decline += 1
    return {
        "current_week_screenings": float(total),
        "screenings_per_show_date": (total / distinct) if distinct else 0.0,
        "distinct_show_dates": float(distinct),
        "thursday_screenings": float(thursday),
        "weekend_share": (weekend / total) if total else 0.0,
        "prime_share": (prime / total) if total else 0.0,
        "premium_share": (premium / total) if total else 0.0,
        "days_with_1": float(sum(1 for count in counts.values() if count == 1)),
        "days_with_3plus": float(sum(1 for count in counts.values() if count >= 3)),
        "wow_pct_change": ((total - prior_total) / prior_total) if prior_total else float("nan"),
        "decline_from_peak": ((peak - total) / peak) if peak else 0.0,
        "consecutive_decline_weeks": float(decline_weeks),
        "is_weakest_week": 1.0 if history and total <= min(history) else 0.0,
        "premium_lost": 1.0 if prior_premium and not premium else 0.0,
        "prime_share_change": ((prime / total) if total else 0.0) - ((prior_prime / prior_total) if prior_total else 0.0),
        "theatrical_week_number": float(theatrical_week),
        "days_since_first_show": float((snapshot - first_show).days),
        "left_truncated": 1.0 if left_truncated or first_show <= dataset_start else 0.0,
        "in_first_week": 1.0 if theatrical_week <= 1 else 0.0,
        "in_second_week": 1.0 if theatrical_week == 2 else 0.0,
        "continuous_weeks": float(continuous),
        "share_of_theater": (total / theater_total) if theater_total else 0.0,
        "rank_in_theater": float(rank),
        "theater_week_vs_baseline": (theater_total / theater_baseline) if theater_baseline else float("nan"),
        "has_premium": 1.0 if premium else 0.0,
        "has_prime": 1.0 if prime else 0.0,
        "next_week_titles_already_listed": float(len(next_titles)),
        "market_theater_count": float(len(peers) or 1),
        "theater_count_wow": float("nan"),
        "market_screenings": float(sum(peer_counts) or total),
        "market_screenings_wow": float("nan"),
        "share_theaters_declining": (peer_decline / len(peers)) if peers else float("nan"),
        "strongest_theater_screenings": float(max(peer_counts) if peer_counts else total),
        "weakest_theater_screenings": float(min(peer_counts) if peer_counts else total),
        "theaters_at_minimal": float(sum(1 for count in (peer_counts or [total]) if count <= 2)),
        "days_to_known_last": float((known_last - snapshot).days) if known_last else float("nan"),
        "has_next_friday": 1.0 if known_last and known_last >= next_friday else 0.0,
        "weekend_screenings": float(weekend),
        "prime_screenings": float(prime),
        "premium_screenings": float(premium),
    }


def _attach_market(rows: list[dict[str, Any]]) -> None:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(row["snapshot_kind"], row["upcoming_friday"], row["film_id"])].append(row)
    prior: dict[tuple[str, str, str], dict[str, float]] = {}
    for key in sorted(grouped, key=lambda item: (item[0], item[1], item[2])):
        peers = grouped[key]
        kind, friday, film = key
        previous_friday = (date.fromisoformat(friday) - timedelta(days=7)).isoformat()
        earlier = prior.get((kind, previous_friday, film))
        screenings = [int(peer["current_week_screenings"]) for peer in peers]
        declining = 0
        for peer in peers:
            change = peer.get("wow_pct_change")
            if isinstance(change, float) and not math.isnan(change) and change < 0:
                declining += 1
        summary = {
            "market_theater_count": float(len(peers)),
            "market_screenings": float(sum(screenings)),
            "strongest_theater_screenings": float(max(screenings)),
            "weakest_theater_screenings": float(min(screenings)),
            "theaters_at_minimal": float(sum(1 for count in screenings if count <= 2)),
            "share_theaters_declining": declining / len(peers),
            "theater_count_wow": float(len(peers) - earlier["market_theater_count"]) if earlier else float("nan"),
            "market_screenings_wow": float(sum(screenings) - earlier["market_screenings"]) if earlier else float("nan"),
        }
        prior[(kind, friday, film)] = summary
        for peer in peers:
            peer.update(summary)


def build_observations(bundle, cycles: Sequence[Mapping[str, Any]], *, kind: str) -> list[dict[str, Any]]:
    snapshot_field = {"before_80": "prepublication_snapshot", "monday": "monday_snapshot", "tuesday": "tuesday_snapshot"}[kind]
    by_film_theater: dict[tuple[str, str], list[Engagement]] = defaultdict(list)
    by_market: dict[str, list[Engagement]] = defaultdict(list)
    shows_by_film_theater: dict[tuple[str, str], list[Screening]] = defaultdict(list)
    for engagement in bundle.film_theater:
        by_film_theater[(engagement.film_id, engagement.theater_id)].append(engagement)
    for engagement in bundle.market:
        by_market[engagement.film_id].append(engagement)
    for show in bundle.screenings:
        shows_by_film_theater[(show.film_id, show.theater_id)].append(show)
    week_totals: dict[tuple[str, date], int] = defaultdict(int)
    for show in bundle.screenings:
        if show.canceled or show.removed_before_show or show.show_date >= bundle.as_of:
            continue
        week_totals[(show.theater_id, programming_week_friday(show.show_date))] += 1
    rows: list[dict[str, Any]] = []
    for cycle in cycles:
        snapshot_text = cycle.get(snapshot_field) or ""
        publication_text = cycle.get("publication_snapshot") or ""
        if not snapshot_text or not publication_text:
            continue
        snapshot = date.fromisoformat(snapshot_text)
        publication = date.fromisoformat(publication_text)
        upcoming = date.fromisoformat(cycle["upcoming_friday"])
        visible = upcoming - timedelta(days=7)
        theater_id = cycle["theater_id"]
        baseline_values = [count for (tid, week), count in week_totals.items() if tid == theater_id and week < visible]
        baseline = float(np.median(baseline_values)) if baseline_values else 0.0
        film_counts: dict[str, int] = {}
        film_shows: dict[str, list[Screening]] = {}
        for (film_id, tid), shows in shows_by_film_theater.items():
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
        for (candidate_id, tid), candidate_shows in shows_by_film_theater.items():
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
            engagement = _cover(by_film_theater.get((film_id, theater_id), ()), visible, visible + timedelta(days=6))
            if engagement is None:
                continue
            outcome = classify_outcome(
                weeks=additional_programming_weeks([show.show_date for show in engagement.screenings], upcoming),
                confirmed=engagement.confirmed,
                end_date=engagement.end_date,
                as_of=bundle.as_of,
            )
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
            publication_shows = _week_screenings(film_shows[film_id], upcoming, upcoming + timedelta(days=6), publication)
            publication_last = _known_last(film_shows[film_id], publication)
            pre_date = date.fromisoformat(cycle["prepublication_snapshot"]) if cycle.get("prepublication_snapshot") else snapshot
            row = {
                "snapshot_kind": kind,
                "film_id": film_id,
                "title": engagement.title,
                "theater_id": theater_id,
                "theater_name": cycle["theater_name"],
                "observation_date": snapshot.isoformat(),
                "publication_snapshot": publication.isoformat(),
                "prepublication_snapshot": pre_date.isoformat(),
                "upcoming_friday": upcoming.isoformat(),
                "thursday": (upcoming - timedelta(days=1)).isoformat(),
                "visible_friday": visible.isoformat(),
                "segment": engagement.segment,
                "catalog_category": engagement.catalog_category,
                "split_date": pre_date.isoformat(),
                **features,
                **_segment_flags(engagement.segment),
                **outcome,
                "pub_next_week_screenings": float(len(publication_shows)),
                "pub_has_next_friday": 1.0 if publication_shows else 0.0,
                "pub_days_to_known_last": float((publication_last - publication).days) if publication_last else float("nan"),
            }
            rows.append(row)
    _attach_market(rows)
    for row in rows:
        market = _cover(by_market.get(row["film_id"], ()), date.fromisoformat(row["visible_friday"]), date.fromisoformat(row["visible_friday"]) + timedelta(days=6))
        if market is None:
            row["market_bucket"] = None
            row["market_censored"] = 1
            row["market_remaining_weeks"] = None
            continue
        market_outcome = classify_outcome(
            weeks=additional_programming_weeks([show.show_date for show in market.screenings], date.fromisoformat(row["upcoming_friday"])),
            confirmed=market.confirmed,
            end_date=market.end_date,
            as_of=bundle.as_of,
        )
        row["market_remaining_weeks"] = market_outcome["remaining_weeks"]
        row["market_bucket"] = market_outcome["bucket"]
        row["market_censored"] = market_outcome["censored"]
        row["market_known_weeks"] = market_outcome["known_weeks"]
    return rows


def _split(rows: Sequence[Mapping[str, Any]]) -> dict[str, list]:
    parts = {"train": [], "validation": [], "holdout": []}
    for row in rows:
        day = date.fromisoformat(row["split_date"])
        if day <= TRAIN_END:
            parts["train"].append(row)
        elif day <= VAL_END:
            parts["validation"].append(row)
        else:
            parts["holdout"].append(row)
    return parts


def _matrix(rows: Sequence[Mapping[str, Any]], names: Sequence[str], period: int | None = None) -> np.ndarray:
    matrix = np.empty((len(rows), len(names)), dtype=float)
    for i, row in enumerate(rows):
        for j, name in enumerate(names):
            if name == "period_1":
                matrix[i, j] = 1.0 if period == 1 else 0.0
            elif name == "period_2":
                matrix[i, j] = 1.0 if period == 2 else 0.0
            else:
                value = row.get(name, float("nan"))
                matrix[i, j] = float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else float("nan")
    return matrix


def _person_periods(rows: Sequence[Mapping[str, Any]]) -> list[tuple[Mapping[str, Any], int, int]]:
    periods = []
    for row in rows:
        if row["censored"]:
            for period in range(min(3, int(row["known_weeks"]))):
                periods.append((row, period, 0))
            continue
        weeks = int(row["remaining_weeks"])
        if weeks >= 3:
            for period in range(3):
                periods.append((row, period, 0))
            continue
        for period in range(weeks):
            periods.append((row, period, 0))
        periods.append((row, weeks, 1))
    return periods


def _fit_hazard(train: Sequence[Mapping[str, Any]], names: Sequence[str]):
    usable = [name for name in names if name not in {"period_1", "period_2"}]
    columns = [*usable, "period_1", "period_2"]
    periods = _person_periods(train)
    if len(periods) < 40 or len({event for _row, _period, event in periods}) < 2:
        return None
    matrix = np.vstack([_matrix([row], columns, period) for row, period, _event in periods])
    target = np.array([event for _row, _period, event in periods])
    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()
    model = LogisticRegression(C=1.0, max_iter=500, solver="lbfgs")
    filled = imputer.fit_transform(matrix)
    model.fit(scaler.fit_transform(filled), target)
    return {"imputer": imputer, "scaler": scaler, "model": model, "columns": columns}


def _hazards_for(model: Mapping[str, Any], row: Mapping[str, Any]) -> list[float]:
    hazards = []
    for period in range(3):
        matrix = _matrix([row], model["columns"], period)
        filled = model["scaler"].transform(model["imputer"].transform(matrix))
        hazards.append(float(model["model"].predict_proba(filled)[0, 1]))
    return hazards


def _predict_rows(model: Mapping[str, Any] | None, rows: Sequence[dict[str, Any]]) -> None:
    for row in rows:
        if model is None:
            row["p0"] = row["p1"] = row["p2"] = row["p3"] = float("nan")
            continue
        probs = distribution_from_hazards(_hazards_for(model, row))
        row["p0"], row["p1"], row["p2"], row["p3"] = probs
        row["expected_weeks"] = 0 * probs[0] + 1 * probs[1] + 2 * probs[2] + 3 * probs[3]


def _uncensored(rows: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    chosen = []
    for row in rows:
        probability = row.get("p0")
        if row["censored"] or row.get("bucket") is None:
            continue
        if not isinstance(probability, float) or math.isnan(probability):
            continue
        chosen.append(row)
    return chosen


def _distribution_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    chosen = _uncensored(rows)
    if not chosen:
        return {"n": 0}
    y = np.array([int(row["bucket"]) for row in chosen])
    proba = np.array([[row["p0"], row["p1"], row["p2"], row["p3"]] for row in chosen], dtype=float)
    proba = np.clip(proba, 1e-6, 1)
    proba = proba / proba.sum(axis=1, keepdims=True)
    onehot = np.eye(4)[y]
    brier = float(np.mean(np.sum((proba - onehot) ** 2, axis=1)))
    try:
        loss = float(log_loss(y, proba, labels=[0, 1, 2, 3]))
    except ValueError:
        loss = None
    predicted = proba.argmax(axis=1)
    expected = proba[:, 1] + 2 * proba[:, 2] + 3 * proba[:, 3]
    actual_capped = np.minimum(np.array([int(row["remaining_weeks"]) for row in chosen]), 3)
    errors = np.abs(expected - actual_capped)
    def pr(score: np.ndarray, label: np.ndarray) -> float | None:
        if len(set(label.tolist())) < 2:
            return None
        return float(average_precision_score(label, score))
    calibration = []
    for bucket in range(4):
        calibration.append(
            {
                "bucket": BUCKETS[bucket],
                "n": int(np.sum(y == bucket)),
                "observed_share": float(np.mean(y == bucket)),
                "mean_predicted": float(np.mean(proba[:, bucket])),
            }
        )
    confusion = np.zeros((4, 4), dtype=int)
    for actual, pred in zip(y, predicted):
        confusion[int(actual), int(pred)] += 1
    return {
        "n": int(len(chosen)),
        "bucket_counts": {BUCKETS[bucket]: int(np.sum(y == bucket)) for bucket in range(4)},
        "log_loss": loss,
        "brier": brier,
        "accuracy": float(np.mean(predicted == y)),
        "median_abs_error_capped": float(np.median(errors)),
        "pr_auc_final_week": pr(proba[:, 0], (y == 0).astype(int)),
        "pr_auc_exactly_1": pr(proba[:, 1], (y == 1).astype(int)),
        "pr_auc_exactly_2": pr(proba[:, 2], (y == 2).astype(int)),
        "pr_auc_3_plus": pr(proba[:, 3], (y == 3).astype(int)),
        "pr_auc_gone_within_2_weeks": pr(proba[:, 0] + proba[:, 1], (y <= 1).astype(int)),
        "calibration": calibration,
        "confusion": confusion.tolist(),
    }


def _empirical_predict(train: Sequence[Mapping[str, Any]], rows: Sequence[dict[str, Any]]) -> None:
    labeled = [row for row in train if not row["censored"]]
    global_share = _share(labeled)

    def key(row: Mapping[str, Any]) -> tuple[str, str]:
        week = int(row["theatrical_week_number"])
        week_label = "1" if week <= 1 else "2" if week == 2 else "3" if week == 3 else "4+"
        screenings = row["current_week_screenings"]
        screen_label = "1-4" if screenings <= 4 else "5-12" if screenings <= 12 else "13-24" if screenings <= 24 else "25+"
        return week_label, screen_label

    tables: dict[tuple[str, str], list] = defaultdict(list)
    week_tables: dict[str, list] = defaultdict(list)
    for row in labeled:
        week_label, screen_label = key(row)
        tables[(week_label, screen_label)].append(row)
        week_tables[week_label].append(row)
    for row in rows:
        week_label, screen_label = key(row)
        chosen = tables.get((week_label, screen_label)) or week_tables.get(week_label) or labeled
        share = _share(chosen) if len(chosen) >= 8 else global_share
        row["p0"], row["p1"], row["p2"], row["p3"] = share
        row["expected_weeks"] = 0 * share[0] + share[1] + 2 * share[2] + 3 * share[3]


def _share(rows: Sequence[Mapping[str, Any]]) -> list[float]:
    if not rows:
        return [0.25, 0.25, 0.25, 0.25]
    counts = [sum(1 for row in rows if row["bucket"] == bucket) for bucket in range(4)]
    total = sum(counts) or 1
    return [count / total for count in counts]


def _fit_multiclass(train: Sequence[Mapping[str, Any]], names: Sequence[str]):
    labeled = [row for row in train if not row["censored"]]
    if len(labeled) < 40 or len({row["bucket"] for row in labeled}) < 2:
        return None
    matrix = _matrix(labeled, names)
    target = np.array([int(row["bucket"]) for row in labeled])
    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()
    model = LogisticRegression(C=1.0, max_iter=500, solver="lbfgs")
    model.fit(scaler.fit_transform(imputer.fit_transform(matrix)), target)
    return {"imputer": imputer, "scaler": scaler, "model": model, "names": list(names)}


def _apply_multiclass(model, rows: Sequence[dict[str, Any]]) -> None:
    if model is None or not rows:
        return
    matrix = model["scaler"].transform(model["imputer"].transform(_matrix(rows, model["names"])))
    proba = model["model"].predict_proba(matrix)
    classes = list(model["model"].classes_)
    for row, probs in zip(rows, proba):
        mapped = [0.0, 0.0, 0.0, 0.0]
        for klass, prob in zip(classes, probs):
            mapped[int(klass)] = float(prob)
        row["p0"], row["p1"], row["p2"], row["p3"] = mapped
        row["expected_weeks"] = mapped[1] + 2 * mapped[2] + 3 * mapped[3]


def _ranking(rows: Sequence[Mapping[str, Any]], bucket_key: str = "bucket") -> dict[str, Any]:
    grouped: dict[str, list] = defaultdict(list)
    for row in rows:
        if row.get("censored") or row.get(bucket_key) is None or row.get("p0") != row.get("p0"):
            continue
        grouped[row["thursday"]].append(row)
    pairwise_hit = pairwise_n = 0
    top_hit = top_n = 0
    ndcgs = []
    for day, films in grouped.items():
        if len(films) < 3:
            continue
        ordered = sorted(films, key=lambda item: (-item["p0"], item["expected_weeks"]))
        for index, left in enumerate(films):
            for right in films[index + 1 :]:
                if left[bucket_key] == right[bucket_key]:
                    continue
                pairwise_n += 1
                sooner = left if left[bucket_key] < right[bucket_key] else right
                later = right if sooner is left else left
                if sooner["p0"] > later["p0"]:
                    pairwise_hit += 1
        actual_min = min(item[bucket_key] for item in films)
        urgent = ordered[:3]
        top_n += len(urgent)
        top_hit += sum(1 for item in urgent if item[bucket_key] == actual_min)
        relevance = np.array([[3 - int(item[bucket_key]) for item in films]])
        scores = np.array([[item["p0"] for item in films]])
        try:
            ndcgs.append(float(ndcg_score(relevance, scores)))
        except ValueError:
            continue
    return {
        "forecast_dates": len(grouped),
        "pairwise_accuracy": (pairwise_hit / pairwise_n) if pairwise_n else None,
        "pairwise_n": pairwise_n,
        "top3_share_in_soonest_group": (top_hit / top_n) if top_n else None,
        "mean_ndcg": float(np.mean(ndcgs)) if ndcgs else None,
    }


def _survival_rows(rows: Sequence[Mapping[str, Any]], key_fn, label: str) -> list[dict[str, Any]]:
    groups: dict[str, list] = defaultdict(list)
    for row in rows:
        groups[str(key_fn(row))].append(row)
    table = []
    for name, items in groups.items():
        record = {label: name, "n": len(items)}
        for weeks in (1, 2, 3, 4):
            known = []
            for item in items:
                if item["censored"]:
                    if int(item["known_weeks"]) >= weeks:
                        known.append(1)
                    continue
                known.append(1 if int(item["remaining_weeks"]) >= weeks else 0)
            record[f"survive_at_least_{weeks}"] = (sum(known) / len(known)) if known else None
            record[f"n_{weeks}"] = len(known)
        table.append(record)
    return table


def _screen_bucket(row: Mapping[str, Any]) -> str:
    count = row["current_week_screenings"]
    if count <= 4:
        return "1-4"
    if count <= 12:
        return "5-12"
    if count <= 24:
        return "13-24"
    return "25+"


def _wow_bucket(row: Mapping[str, Any]) -> str:
    change = row.get("wow_pct_change")
    if not isinstance(change, float) or math.isnan(change):
        return "no prior week"
    if change >= -0.05:
        return "flat or up"
    if change >= -0.30:
        return "down 5-30%"
    if change >= -0.60:
        return "down 30-60%"
    return "down >60%"


def _week_bucket(row: Mapping[str, Any]) -> str:
    week = int(row["theatrical_week_number"])
    if week <= 1:
        return "week 1"
    if week == 2:
        return "week 2"
    if week == 3:
        return "week 3"
    return "week 4+"


def _count_block(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    uncensored = [row for row in rows if not row["censored"]]
    buckets = {name: sum(1 for row in uncensored if row["bucket"] == index) for index, name in enumerate(BUCKETS)}
    return {
        "n": len(rows),
        "engagements": len({(row["film_id"], row["theater_id"], row["visible_friday"]) for row in rows}),
        "censored": sum(1 for row in rows if row["censored"]),
        "uncensored": len(uncensored),
        "buckets": buckets,
    }


def _feature_names(include_incoming: bool) -> list[str]:
    names = [*MATURITY, *CURRENT, *TRAJECTORY, *MARKET, *COMMITMENT, *SEGMENT]
    if include_incoming:
        names.extend(INCOMING)
    return names


def _ablation(train, validation, holdout, include_incoming: bool) -> list[dict[str, Any]]:
    results = []
    running: list[str] = []
    families = list(FAMILY_ORDER)
    if not include_incoming:
        families = [item for item in families if item[0] != "incoming"]
    for name, columns in families:
        running.extend(columns)
        model = _fit_hazard(train, running)
        scored = [dict(row) for row in holdout]
        _predict_rows(model, scored)
        metrics = _distribution_metrics(scored)
        val_rows = [dict(row) for row in validation]
        _predict_rows(model, val_rows)
        results.append({"model": name, "features": len(running), "holdout": metrics, "validation_log_loss": _distribution_metrics(val_rows).get("log_loss")})
    all_names = _feature_names(include_incoming)
    model = _fit_hazard(train, all_names)
    results.append({"model": "all_valid", "features": len(all_names), "holdout": _distribution_metrics(holdout), "coefficients": _coefficients(model)})
    return results


def _coefficients(model) -> list[dict[str, float]]:
    if model is None:
        return []
    weights = model["model"].coef_[0]
    paired = [{"feature": name, "coefficient": float(weight)} for name, weight in zip(model["columns"], weights)]
    paired.sort(key=lambda item: abs(item["coefficient"]), reverse=True)
    return paired


def _confirmation_metrics(train, holdout) -> dict[str, Any]:
    labeled_train = [row for row in train if not row["censored"]]
    labeled_hold = [row for row in holdout if not row["censored"]]
    if len(labeled_train) < 30:
        return {"status": "insufficient"}
    names = ["pub_has_next_friday", "pub_next_week_screenings", "pub_days_to_known_last"]
    matrix = _matrix(labeled_train, names)
    target = np.array([1 if row["bucket"] == 0 else 0 for row in labeled_train])
    if len(set(target.tolist())) < 2:
        return {"status": "one_class"}
    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()
    model = LogisticRegression(C=1.0, max_iter=400)
    model.fit(scaler.fit_transform(imputer.fit_transform(matrix)), target)
    hold_matrix = scaler.transform(imputer.transform(_matrix(labeled_hold, names)))
    scores = model.predict_proba(hold_matrix)[:, 1]
    y = np.array([1 if row["bucket"] == 0 else 0 for row in labeled_hold])
    naive_pre = np.array([1.0 if not row["has_next_friday"] else 0.0 for row in labeled_hold])
    naive_pub = np.array([1.0 if not row["pub_has_next_friday"] else 0.0 for row in labeled_hold])
    def pr(score):
        if len(set(y.tolist())) < 2:
            return None
        return float(average_precision_score(y, score))
    return {
        "status": "ok",
        "n": len(labeled_hold),
        "listed_end_after_publication_pr_auc": pr(scores),
        "naive_no_next_friday_at_prepublication_pr_auc": pr(naive_pre),
        "naive_no_next_friday_after_publication_pr_auc": pr(naive_pub),
        "share_prepublication_already_lists_next_week": float(np.mean([row["has_next_friday"] for row in holdout])) if holdout else None,
        "share_publication_lists_next_week": float(np.mean([row["pub_has_next_friday"] for row in holdout])) if holdout else None,
    }


def _production_scores(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    try:
        model = load_active_model()
    except Exception as exc:
        return {"status": "unavailable", "reason": str(exc)}
    labeled = [row for row in rows if not row["censored"]]
    scores = []
    y = []
    for row in labeled:
        run_type = NORMAL_FIRST_RUN if row["segment"] == SEGMENT_ORDINARY else "rerelease_anniversary" if row["segment"] == SEGMENT_RERELEASE else "unknown_other_special"
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
            weekend_showtime_count=int(row["weekend_screenings"]),
            prime_time_showtime_count=int(row["prime_screenings"]),
            premium_format_count=int(row["premium_screenings"]),
            premium_format_share=float(row["premium_share"]),
            left_truncated=bool(row["left_truncated"]),
        )
        scores.append(float(model.predict_calibrated(observation)["p_end_within_7d"]))
        y.append(1 if row["bucket"] == 0 else 0)
    y_arr = np.array(y)
    score_arr = np.array(scores)
    pr = float(average_precision_score(y_arr, score_arr)) if len(set(y)) > 1 else None
    return {"status": "ok", "n": len(labeled), "pr_auc_final_week": pr, "note": "Production P(end within 7 days), scored at the pre-publication snapshot. It still sees days_to_known_last."}


def _market_rows(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    chosen: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        key = (row["film_id"], row["upcoming_friday"])
        current = chosen.get(key)
        if current is None or row["observation_date"] < current["observation_date"]:
            chosen[key] = dict(row)
    market = []
    for row in chosen.values():
        row["current_week_screenings"] = float(row.get("market_screenings") or row["current_week_screenings"])
        row["censored"] = row.get("market_censored", 1)
        row["bucket"] = row.get("market_bucket")
        row["remaining_weeks"] = row.get("market_remaining_weeks")
        row["known_weeks"] = row.get("market_known_weeks", 0)
        row["theater_name"] = "Seattle AMC market"
        market.append(row)
    return market


def _combine_theaters(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Independence combination: the market survives a week unless every theater has exited."""
    grouped: dict[tuple[str, str], list] = defaultdict(list)
    for row in rows:
        if row.get("p0") != row.get("p0") or row.get("market_censored"):
            continue
        grouped[(row["film_id"], row["upcoming_friday"])].append(row)
    y = []
    proba = []
    for peers in grouped.values():
        if len(peers) < 2 or peers[0].get("market_bucket") is None:
            continue
        def exited_before(peer: Mapping[str, Any], week: int) -> float:
            probs = (peer["p0"], peer["p1"], peer["p2"], peer["p3"])
            return float(sum(probs[:week]))

        survive = [1.0 - float(np.prod([exited_before(peer, week) for peer in peers])) for week in (1, 2, 3)]
        raw = [max(0.0, 1.0 - survive[0]), max(0.0, survive[0] - survive[1]), max(0.0, survive[1] - survive[2]), max(0.0, survive[2])]
        total = sum(raw) or 1.0
        proba.append([value / total for value in raw])
        y.append(int(peers[0]["market_bucket"]))
    if not y:
        return {"n": 0}
    fake = []
    for bucket, probs in zip(y, proba):
        fake.append({"censored": 0, "bucket": bucket, "remaining_weeks": bucket if bucket < 3 else 3, "p0": probs[0], "p1": probs[1], "p2": probs[2], "p3": probs[3]})
    metrics = _distribution_metrics(fake)
    metrics["films"] = len(y)
    return metrics


def feature_dictionary(include_incoming: bool) -> list[dict[str, str]]:
    included = set(_feature_names(include_incoming))
    definitions = {
        "theatrical_week_number": "Programming weeks since this engagement's first show, as of the visible week.",
        "days_since_first_show": "Days from the snapshot back to the engagement's first show.",
        "left_truncated": "1 when the run was already underway on the first day of the dataset.",
        "in_first_week": "1 in theatrical week 1.",
        "in_second_week": "1 in theatrical week 2.",
        "continuous_weeks": "Consecutive weeks with at least one listed show, ending at the visible week.",
        "current_week_screenings": "Showtimes listed in the visible Fri–Thu week.",
        "screenings_per_show_date": "Those showtimes divided by distinct show dates.",
        "distinct_show_dates": "Distinct dates with a listing in the visible week.",
        "thursday_screenings": "Showtimes on the Thursday that closes the visible week.",
        "weekend_share": "Share of visible-week showtimes on Friday, Saturday, or Sunday.",
        "prime_share": "Share of visible-week showtimes in prime time.",
        "premium_share": "Share of visible-week showtimes in a premium format.",
        "days_with_1": "Visible-week dates with exactly one screening.",
        "days_with_3plus": "Visible-week dates with three or more screenings.",
        "wow_pct_change": "Change from the prior programming week's showtimes, divided by that week.",
        "decline_from_peak": "Drop from the busiest observed week so far to this week, divided by the peak.",
        "consecutive_decline_weeks": "How many steps back the weekly count keeps falling.",
        "is_weakest_week": "1 when this week is at or below every prior observed week.",
        "premium_lost": "1 when the prior week had a premium show and this week does not.",
        "prime_share_change": "Change in prime-time share from the prior week.",
        "market_theater_count": "Seattle AMC theaters listing the film in the visible week.",
        "theater_count_wow": "Change in that theater count from the prior week.",
        "market_screenings": "Visible-week showtimes across those theaters.",
        "market_screenings_wow": "Change in market showtimes from the prior week.",
        "share_theaters_declining": "Share of theaters whose own week is down from the prior week.",
        "strongest_theater_screenings": "Highest single-theater visible-week count.",
        "weakest_theater_screenings": "Lowest single-theater visible-week count.",
        "theaters_at_minimal": "Theaters with two or fewer visible-week showtimes.",
        "share_of_theater": "This film's share of the theater's visible-week showtimes.",
        "rank_in_theater": "Rank of this film by visible-week showtimes at the theater. 1 is the fullest.",
        "theater_week_vs_baseline": "The theater's visible-week volume divided by its earlier weekly median.",
        "has_premium": "1 when the visible week includes a premium-format show.",
        "has_prime": "1 when the visible week includes a prime-time show.",
        "next_week_titles_already_listed": "Titles at this theater that have not played yet and already list a show on or after the upcoming Friday. This is an advance listing, not the published Friday allocation.",
        "days_to_known_last": "Days from the snapshot to the latest listed show. Excluded: at this snapshot it is usually just the edge of the visible week.",
        "has_next_friday": "1 when a show on or after the upcoming Friday is already listed. Excluded from the forecast model.",
        "pub_has_next_friday": "Same flag measured on the publication snapshot. Confirmation only.",
        "pub_next_week_screenings": "Showtimes in the new week on the publication snapshot. Confirmation only.",
        "pub_days_to_known_last": "Days to the latest listed show after publication. Confirmation only.",
        "tmdb_popularity": "Current TMDB popularity is not a historical point-in-time series.",
        "box_office": "No historical point-in-time box office series is in this dataset.",
    }
    rows = []
    for name, text in definitions.items():
        included_flag = "included" if name in included else "excluded"
        leakage = "answer-revealing once the next week is published" if name.startswith("pub_") or name in {"days_to_known_last", "has_next_friday"} else "low"
        if name in {"tmdb_popularity", "box_office"}:
            leakage = "hindsight if joined from a current extract"
        rows.append(
            {
                "feature": name,
                "definition": text,
                "available_pre_publication": "no" if name.startswith("pub_") or name in {"tmdb_popularity", "box_office"} else "yes",
                "source": "screening lifecycle listings on or before the snapshot",
                "leakage_risk": leakage,
                "included": included_flag,
            }
        )
    return rows


def _weekday_summary(cycles: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    reached = [row for row in cycles if row.get("weekday_80")]
    counts: dict[str, int] = defaultdict(int)
    by_theater: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in reached:
        counts[row["weekday_80"]] += 1
        by_theater[row["theater_name"]][row["weekday_80"]] += 1
    total = sum(counts.values()) or 1
    full = sum(int(row.get("full_week_same_snapshot") or 0) for row in reached)
    incremental = sum(int(row.get("incremental") or 0) for row in reached)
    same_jump = sum(1 for row in reached if row.get("date_50") and row.get("date_80") and row["date_50"] == row["date_80"])
    never_95 = sum(1 for row in reached if not row.get("date_95"))
    return {
        "theater_weeks": len(cycles),
        "reached_80": len(reached),
        "weekday_80_counts": dict(counts),
        "weekday_80_share": {day: counts[day] / total for day in counts},
        "dominant_weekday": max(counts, key=counts.get) if counts else None,
        "full_week_same_snapshot_share": full / len(reached) if reached else None,
        "incremental_share": incremental / len(reached) if reached else None,
        "friday_50_and_80_same_day": same_jump,
        "friday_50_and_80_same_day_share": same_jump / len(reached) if reached else None,
        "never_reached_95": never_95,
        "by_theater": {name: dict(days) for name, days in by_theater.items()},
    }


def run_prepublication_audit(root: Path) -> dict[str, Any]:
    bundle = load_bundle(root)
    cycles = build_booking_cycles(bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of)
    primary = build_observations(bundle, cycles, kind="before_80")
    monday = build_observations(bundle, cycles, kind="monday")
    tuesday = build_observations(bundle, cycles, kind="tuesday")
    incoming_share = float(np.mean([row["next_week_titles_already_listed"] > 0 for row in primary])) if primary else 0.0
    include_incoming = incoming_share >= 0.10
    names = _feature_names(include_incoming)
    parts = _split(primary)
    hazard = _fit_hazard(parts["train"], names)
    _predict_rows(hazard, primary)
    empirical_rows = [dict(row) for row in primary]
    _empirical_predict(parts["train"], empirical_rows)
    multi = _fit_multiclass(parts["train"], names)
    multi_rows = [dict(row) for row in primary]
    _apply_multiclass(multi, multi_rows)
    for kind_rows in (monday, tuesday):
        kind_parts = _split(kind_rows)
        kind_model = _fit_hazard(kind_parts["train"], names)
        _predict_rows(kind_model, kind_rows)
    market = _market_rows(primary)
    market_parts = _split(market)
    market_model = _fit_hazard(market_parts["train"], names)
    _predict_rows(market_model, market)
    ordinary = [row for row in primary if row["segment"] == SEGMENT_ORDINARY]
    ordinary_parts = _split(ordinary)
    holdout_examples = _thursday_examples(market_parts["holdout"])
    ablation = _ablation(parts["train"], parts["validation"], parts["holdout"], include_incoming)
    return {
        "as_of": bundle.as_of.isoformat(),
        "dataset_start": bundle.dataset_start.isoformat(),
        "train_end": TRAIN_END.isoformat(),
        "validation_end": VAL_END.isoformat(),
        "substantial_threshold": SUBSTANTIAL,
        "booking": _weekday_summary(cycles),
        "cycles": cycles,
        "incoming_included": include_incoming,
        "incoming_share_of_rows_with_any_next_week_title": incoming_share,
        "primary_reason": (
            "The forecast snapshot is the last daily snapshot before that theater's upcoming Friday "
            "listings reach 80% of the theater's other Friday volumes. Monday and Tuesday are scored separately "
            "when they are still before that publication snapshot."
        ),
        "counts": {
            "film_theater": _count_block(primary),
            "market": _count_block(market),
            "train": _count_block(parts["train"]),
            "validation": _count_block(parts["validation"]),
            "holdout": _count_block(parts["holdout"]),
            "monday": _count_block(monday),
            "tuesday": _count_block(tuesday),
        },
        "survival": {
            "by_week": _survival_rows(primary, _week_bucket, "theatrical_week"),
            "by_screenings": _survival_rows(primary, _screen_bucket, "screenings"),
            "by_wow": _survival_rows(primary, _wow_bucket, "wow"),
            "by_theaters": _survival_rows(primary, lambda row: str(min(4, int(row["market_theater_count"]))) + ("+" if row["market_theater_count"] >= 4 else ""), "theaters"),
            "by_segment": _survival_rows(primary, lambda row: row["segment"], "segment"),
            "by_theater": _survival_rows(primary, lambda row: row["theater_name"], "theater"),
        },
        "models": {
            "hazard": _distribution_metrics(parts["holdout"]),
            "hazard_validation": _distribution_metrics(parts["validation"]),
            "empirical": _distribution_metrics(_split(empirical_rows)["holdout"]),
            "multiclass": _distribution_metrics(_split(multi_rows)["holdout"]),
            "monday": _distribution_metrics(_split(monday)["holdout"]),
            "tuesday": _distribution_metrics(_split(tuesday)["holdout"]),
            "ordinary_hazard": _distribution_metrics(ordinary_parts["holdout"]),
            "market_hazard": _distribution_metrics(market_parts["holdout"]),
            "independence_combination": _combine_theaters(parts["holdout"]),
        },
        "ranking": {
            "market": _ranking(market_parts["holdout"]),
            "market_ordinary": _ranking([row for row in market_parts["holdout"] if row["segment"] == SEGMENT_ORDINARY]),
            "film_theater": _ranking(parts["holdout"]),
        },
        "confirmation": _confirmation_metrics(parts["train"], parts["holdout"]),
        "production": _production_scores(parts["holdout"]),
        "ablation": ablation,
        "coefficients": _coefficients(hazard),
        "thursday_examples": holdout_examples,
        "observations": primary,
        "market_observations": market,
    }


def _thursday_examples(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list] = defaultdict(list)
    for row in rows:
        if row.get("p0") != row.get("p0"):
            continue
        grouped[row["thursday"]].append(row)
    ranked_days = sorted(grouped, key=lambda day: len(grouped[day]), reverse=True)[:4]
    examples = []
    for day in sorted(ranked_days):
        films = sorted(grouped[day], key=lambda item: item["p0"], reverse=True)
        ordinary = [row for row in films if row.get("segment") == "ordinary"]
        pool = ordinary or films
        if len(pool) <= 6:
            picks = list(pool)
        else:
            middle = len(pool) // 2
            picks = pool[:2] + pool[middle - 1 : middle + 1] + pool[-2:]
        seen: set[int] = set()
        chosen = []
        for row in picks:
            marker = id(row)
            if marker in seen:
                continue
            seen.add(marker)
            chosen.append(row)
        rank_of = {id(row): index for index, row in enumerate(films, start=1)}
        for row in chosen:
            rank = rank_of[id(row)]
            if row["censored"]:
                actual = "censored"
            elif row["bucket"] == 0:
                actual = "Final"
            elif row["bucket"] == 3:
                actual = "3+"
            else:
                actual = f"+{row['bucket']}"
            examples.append(
                {
                    "thursday": day,
                    "forecast_snapshot": row["observation_date"],
                    "title": row["title"],
                    "segment": row["segment"],
                    "final_week": f"{row['p0'] * 100:.0f}%",
                    "plus_1": f"{row['p1'] * 100:.0f}%",
                    "plus_2": f"{row['p2'] * 100:.0f}%",
                    "plus_3": f"{row['p3'] * 100:.0f}%",
                    "expected_weeks": round(row["expected_weeks"], 2),
                    "urgency_rank": rank,
                    "urgency_percentile": round(100 * (len(films) - rank + 1) / max(1, len(films)), 1),
                    "actual": actual,
                    "theatrical_week": row["theatrical_week_number"],
                    "current_week_screenings": row["current_week_screenings"],
                    "market_theater_count": row["market_theater_count"],
                }
            )
    return examples
