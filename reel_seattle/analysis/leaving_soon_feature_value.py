"""Point-in-time feature audit for Leaving Soon. Does not change production scoring.

Grain is film × theater × snapshot date, which is the decision a shelf would make
for one theater. The shipped model scores a film's market-wide run. That score is
recomputed here only as a baseline.

A number is a feature only when it can be computed from showtimes whose
``first_snapshot`` is on or before the observation date, and from removals whose
``removed_at`` is on or before that date. Labels may use the eventual end.
"""

from __future__ import annotations

import csv
import html
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss
from sklearn.preprocessing import StandardScaler

from reel_seattle.analysis.amc_run_lifecycle import (
    DEFAULT_GAP_THRESHOLD_DAYS,
    segment_occurred_dates,
)
from reel_seattle.analysis.leaving_soon_frozen import load_active_model
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    SEGMENT_ORDINARY,
    SEGMENT_RERELEASE,
    SEGMENT_SPECIAL,
    Engagement,
    Screening,
    build_engagements,
    dense_horizon,
    load_catalog_index,
    load_premium_ids,
    load_screenings,
    load_snapshot_infos,
    programming_week_friday,
    time_block,
    upcoming_friday,
    weekday_name,
)
from reel_seattle.analysis.leaving_soon_survival import (
    NORMAL_FIRST_RUN,
    make_observation,
)
from reel_seattle.normalize import build_theater_index

SOURCE = "amc"
TRAIN_END = date(2026, 8, 16)
VAL_END = date(2026, 9, 6)
HORIZON_7 = 7
HORIZON_3 = 3
PUBLISHED_BAR = 0.80
PUBLISHED_HIGH = 0.95

FAMILIES = (
    "existing",
    "publication",
    "contraction",
    "market",
    "segment",
    "theater",
    "stability",
    "maturity",
)


def still_listed(screening: Screening, observation: date) -> bool:
    """True when this screening was on the schedule as of *observation*."""
    if screening.canceled or screening.first_snapshot > observation:
        return False
    if screening.removed_before_show and screening.removed_at is not None and screening.removed_at <= observation:
        return False
    return True


def played_by(screening: Screening, observation: date) -> bool:
    """True when the screening had already happened and was not withdrawn before showtime."""
    if screening.canceled or screening.removed_before_show:
        return False
    if screening.show_date >= observation:
        return False
    return screening.first_snapshot <= screening.show_date


def label_departure(
    *,
    end_date: date,
    confirmed: bool,
    observation: date,
    horizon: int,
    as_of: date,
) -> int | None:
    """1 if the run ends in fewer than *horizon* days.

    Matches production ``binary_outcome``: remaining_days < horizon.
    A negative label requires the window to be fully observed, or a still-open
    schedule whose current end is already past the horizon.
    """
    if observation > end_date:
        return None
    remaining = (end_date - observation).days
    window_elapsed = (as_of - observation).days >= horizon
    if confirmed:
        if remaining < 0:
            return None
        return 1 if remaining < horizon else 0
    if remaining >= horizon and window_elapsed:
        return 0
    if remaining < horizon and window_elapsed:
        return None
    return None


def completeness_estimate(known: int, baseline: float | None) -> float | None:
    """Published count divided by a past-only weekday baseline. Capped at 1."""
    if baseline is None or baseline <= 0:
        return None
    return min(1.0, known / baseline)


def _median(values: Sequence[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[mid])
    return float(ordered[mid - 1] + ordered[mid]) / 2.0


def _mean(values: Sequence[float]) -> float | None:
    if not values:
        return None
    return float(sum(values) / len(values))


@dataclass
class Bundle:
    screenings: list[Screening]
    film_theater: list[Engagement]
    market: list[Engagement]
    snapshot_dates: list[date]
    as_of: date
    dataset_start: date
    theater_names: dict[str, str]


def load_bundle(root: Path) -> Bundle:
    history = root / "data" / "history"
    snapshots = load_snapshot_infos(history / "screening_snapshot_status.jsonl")
    catalog = load_catalog_index(root / "data" / "source_catalog" / "amc_movie_products.json")
    registry = __import__("json").loads((root / "data" / "theaters.json").read_text(encoding="utf-8"))
    theater_index = build_theater_index(registry)
    enabled = set(theater_index.enabled_ids) if hasattr(theater_index, "enabled_ids") else set()
    theater_names: dict[str, str] = {}
    if not enabled:
        for theater in registry.get("theaters", []):
            if theater.get("source") != SOURCE or theater.get("enabled") is False:
                continue
            enabled.add(theater["id"])
            theater_names[theater["id"]] = theater.get("name") or theater["id"]
    else:
        for theater in registry.get("theaters", []):
            if theater.get("id") in enabled:
                theater_names[theater["id"]] = theater.get("name") or theater["id"]
    premium_ids = load_premium_ids(history / "screening_observations.jsonl.gz")
    screenings, as_of = load_screenings(
        history / "screening_lifecycle.jsonl.gz",
        catalog=catalog,
        enabled_theaters=enabled,
        premium_ids=premium_ids,
    )
    dataset_start = min(item.snapshot_date for item in snapshots)
    snapshot_dates = sorted({item.snapshot_date for item in snapshots if item.snapshot_date <= as_of})
    daily: dict[tuple[str, date], int] = Counter(
        (item.theater_id, item.show_date)
        for item in screenings
        if not item.canceled and not item.removed_before_show and item.show_date < as_of
    )
    horizons = {}
    friday_baseline = {}
    for theater_id in theater_names:
        counts = {day: daily[(theater_id, day)] for (tid, day) in daily if tid == theater_id}
        horizons[theater_id] = dense_horizon(counts, baseline_end=as_of)
        fridays = [count for day, count in counts.items() if day.weekday() == 4]
        friday_baseline[theater_id] = float(np.median(fridays)) if fridays else 0.0
    shared = dict(
        gap_threshold_days=DEFAULT_GAP_THRESHOLD_DAYS,
        dataset_start=dataset_start,
        snapshot_dates=snapshot_dates,
        as_of=as_of,
        horizons=horizons,
        friday_baseline=friday_baseline,
        theater_daily=daily,
    )
    return Bundle(
        screenings=screenings,
        film_theater=build_engagements(screenings, level="film_theater", **shared),
        market=build_engagements(screenings, level="market", **shared),
        snapshot_dates=snapshot_dates,
        as_of=as_of,
        dataset_start=dataset_start,
        theater_names=theater_names,
    )


def _cover(engagements: Sequence[Engagement], anchor: date) -> Engagement | None:
    chosen = None
    for engagement in engagements:
        if engagement.start_date <= anchor <= engagement.end_date:
            chosen = engagement
    return chosen


def _counts_by_date(shows: Sequence[Screening]) -> dict[date, int]:
    counts: dict[date, int] = Counter(item.show_date for item in shows)
    return dict(counts)


def _streak(dates_desc: Sequence[date], counts: Mapping[date, int], limit: int) -> int:
    streak = 0
    previous = None
    for day in dates_desc:
        if previous is not None and previous - day != timedelta(days=1):
            break
        if counts.get(day, 0) > limit:
            break
        streak += 1
        previous = day
    return streak


def _longest_run(dates: Sequence[date]) -> int:
    ordered = sorted(set(dates))
    if not ordered:
        return 0
    best = current = 1
    for earlier, later in zip(ordered, ordered[1:]):
        if later - earlier == timedelta(days=1):
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


def _run_type_for_segment(segment: str) -> str:
    if segment == SEGMENT_RERELEASE:
        return "rerelease_anniversary"
    if segment == SEGMENT_ORDINARY:
        return NORMAL_FIRST_RUN
    return "unknown_other_special"


def build_feature_rows(bundle: Bundle) -> list[dict[str, Any]]:
    snaps = bundle.snapshot_dates
    index = {day: pos for pos, day in enumerate(snaps)}
    n_snaps = len(snaps)
    by_ft: dict[tuple[str, str], list[Engagement]] = defaultdict(list)
    for engagement in bundle.film_theater:
        by_ft[(engagement.film_id, engagement.theater_id)].append(engagement)
    by_market: dict[str, list[Engagement]] = defaultdict(list)
    for engagement in bundle.market:
        by_market[engagement.film_id].append(engagement)

    theater_dates: dict[str, list[tuple[date, int]]] = defaultdict(list)
    occurred = Counter(
        (item.theater_id, item.show_date)
        for item in bundle.screenings
        if played_by(item, bundle.as_of)
    )
    for (theater_id, show_date), count in occurred.items():
        theater_dates[theater_id].append((show_date, count))
    for theater_id in theater_dates:
        theater_dates[theater_id].sort()
    played_history: dict[str, list[tuple[date, str]]] = defaultdict(list)
    for screening in bundle.screenings:
        if played_by(screening, bundle.as_of):
            played_history[screening.theater_id].append((screening.show_date, screening.film_id))
    played_days_sorted: dict[str, list[date]] = {}
    played_day_films: dict[str, dict[date, Counter]] = {}
    for theater_id, pairs in played_history.items():
        by_day: dict[date, Counter] = defaultdict(Counter)
        for played_day, played_film in pairs:
            by_day[played_day][played_film] += 1
        played_day_films[theater_id] = by_day
        played_days_sorted[theater_id] = sorted(by_day)

    # Per snapshot, per theater: show_date -> (count, films, premium count)
    theater_known: list[dict[str, dict[date, list[int]]]] = []
    film_known_theaters: list[dict[str, set[str]]] = []
    film_show_counts: list[dict[str, Counter]] = []
    for _day in snaps:
        theater_known.append({})
        film_known_theaters.append(defaultdict(set))
        film_show_counts.append(defaultdict(Counter))
    for screening in bundle.screenings:
        if screening.canceled:
            continue
        start = index.get(screening.first_snapshot)
        if start is None:
            later = [pos for day, pos in index.items() if day >= screening.first_snapshot]
            if not later:
                continue
            start = min(later)
        stop = n_snaps
        if screening.removed_before_show and screening.removed_at is not None:
            stop = next((pos for pos, day in enumerate(snaps) if day >= screening.removed_at), n_snaps)
        prime = 1 if time_block(screening.minutes) == "prime" else 0
        premium = 1 if screening.premium else 0
        for pos in range(start, stop):
            if screening.show_date < snaps[pos]:
                continue
            bucket = theater_known[pos].setdefault(screening.theater_id, {})
            cell = bucket.get(screening.show_date)
            if cell is None:
                cell = [0, 0, 0, Counter()]
                bucket[screening.show_date] = cell
            cell[0] += 1
            cell[1] += premium
            cell[2] += prime
            cell[3][screening.film_id] += 1
            film_known_theaters[pos][screening.film_id].add(screening.theater_id)
            film_show_counts[pos][screening.film_id][screening.show_date] += 1

    def baseline(theater_id: str, observation: date, weekday: int) -> float | None:
        values = [count for day, count in theater_dates.get(theater_id, ()) if day < observation and day.weekday() == weekday]
        return _median([float(value) for value in values])

    rows: list[dict[str, Any]] = []
    model = load_active_model()
    for (film_id, theater_id), engagements in by_ft.items():
        shows = []
        for engagement in engagements:
            shows.extend(engagement.screenings)
            shows.extend(engagement.removed_screenings)
        if not shows:
            continue
        first_seen = min(item.first_snapshot for item in shows)
        prev_showtime_count = None
        prev_final = None
        stable_run = 0
        extension_count = 0
        last_extension: date | None = None
        last_magnitude = 0
        recent_finals: list[date] = []
        prev_premium = None
        history_days = played_days_sorted.get(theater_id, [])
        history_films = played_day_films.get(theater_id, {})
        history_pos = 0
        films_before: set[str] = set()
        title = engagements[0].title
        segment = engagements[0].segment
        for engagement in engagements:
            if engagement.segment_confidence == "high":
                segment = engagement.segment
                title = engagement.title
                break
        sample = next((item for item in shows if item.segment == segment), shows[0])
        for observation in snaps:
            if observation < first_seen:
                continue
            pos = index[observation]
            listed = [item for item in shows if still_listed(item, observation)]
            future = [item for item in listed if item.show_date >= observation]
            if not future:
                prev_showtime_count = 0
                continue
            anchor = min(item.show_date for item in future)
            engagement = _cover(engagements, anchor)
            if engagement is None:
                continue
            played = [item for item in shows if played_by(item, observation)]
            known_dates = sorted({item.show_date for item in played} | {item.show_date for item in future})
            segments = segment_occurred_dates(known_dates, gap_threshold_days=DEFAULT_GAP_THRESHOLD_DAYS) if known_dates else []
            cluster = next((part for part in segments if part[0] <= anchor <= part[-1]), None)
            run_start = cluster[0] if cluster else anchor
            final = max(item.show_date for item in future)
            if prev_final is None or final != prev_final:
                if prev_final is not None and final > prev_final:
                    extension_count += 1
                    last_extension = observation
                    last_magnitude = (final - prev_final).days
                stable_run = 1
            else:
                stable_run += 1
            moved = [1 if recent != final else 0 for recent in recent_finals[-3:]]
            while len(moved) < 3:
                moved.insert(0, 0)
            friday = upcoming_friday(observation)
            week_start = programming_week_friday(friday)
            week_days = [week_start + timedelta(days=offset) for offset in range(7)]
            theater_bucket = theater_known[pos].get(theater_id, {})
            friday_known = theater_bucket.get(friday, [0, 0, 0])[0]
            week_known = sum(theater_bucket.get(day, [0, 0, 0])[0] for day in week_days)
            friday_base = baseline(theater_id, observation, 4)
            week_base_parts = [baseline(theater_id, observation, day.weekday()) for day in week_days]
            week_base = sum(part for part in week_base_parts if part is not None) if any(part is not None for part in week_base_parts) else None
            friday_complete = completeness_estimate(friday_known, friday_base)
            week_complete = completeness_estimate(week_known, week_base)
            future_dates = _counts_by_date(future)
            played_counts = _counts_by_date(played)
            played_days = sorted(played_counts)
            last3 = played_days[-3:]
            prior3 = played_days[-6:-3]
            last7 = played_days[-7:]
            prior7 = played_days[-14:-7]
            avg3 = _mean([float(played_counts[day]) for day in last3])
            avg3_prior = _mean([float(played_counts[day]) for day in prior3])
            avg7 = _mean([float(played_counts[day]) for day in last7])
            avg7_prior = _mean([float(played_counts[day]) for day in prior7])
            peak = max(played_counts.values()) if played_counts else 0
            last_play = played_counts[played_days[-1]] if played_days else 0
            decline = ((peak - last_play) / peak) if peak else 0.0
            today_n = future_dates.get(observation, 0)
            tomorrow_n = future_dates.get(observation + timedelta(days=1), 0)
            next3 = sum(count for day, count in future_dates.items() if observation <= day < observation + timedelta(days=3))
            next7 = sum(count for day, count in future_dates.items() if observation <= day < observation + timedelta(days=7))
            weekend_days = {friday, friday + timedelta(days=1), friday + timedelta(days=2)}
            film_friday = sum(1 for item in future if item.show_date == friday)
            film_weekend = sum(1 for item in future if item.show_date in weekend_days)
            film_week = sum(1 for item in future if item.show_date in set(week_days))
            prime_n = sum(1 for item in future if time_block(item.minutes) == "prime")
            premium_n = sum(1 for item in future if item.premium)
            showtime_count = len(future)
            distinct_days = len(future_dates)
            weekend_n = sum(1 for item in future if item.show_date.weekday() >= 4)
            current_week_count = film_week
            previous_week_days = {week_start - timedelta(days=7) + timedelta(days=offset) for offset in range(7)}
            previous_week_count = sum(played_counts.get(day, 0) for day in previous_week_days)
            previous_week_count += sum(future_dates.get(day, 0) for day in previous_week_days if day >= observation)
            market_theaters = film_known_theaters[pos].get(film_id, set())
            market_counts = film_show_counts[pos].get(film_id, Counter())
            market_today = market_counts.get(observation, 0)
            market_next7 = sum(count for day, count in market_counts.items() if observation <= day < observation + timedelta(days=7))
            week_films: set[str] = set()
            for day in week_days:
                cell = theater_bucket.get(day)
                if cell is not None:
                    week_films.update(cell[3])
            while history_pos < len(history_days) and history_days[history_pos] < observation:
                films_before.update(history_films[history_days[history_pos]])
                history_pos += 1
            recent_counts: Counter[str] = Counter()
            window_start = observation - timedelta(days=7)
            for played_day in history_days[max(0, history_pos - 14) : history_pos]:
                if played_day >= window_start:
                    recent_counts.update(history_films[played_day])
            friday_cell = theater_bucket.get(friday)
            friday_film_counts = friday_cell[3] if friday_cell is not None else {}
            incoming_friday = sum(
                count for played_film, count in friday_film_counts.items() if played_film not in films_before
            )
            new_films = sum(1 for played_film in friday_film_counts if played_film not in films_before)
            incumbent_absent = sum(
                count for played_film, count in recent_counts.items() if played_film not in friday_film_counts
            )
            age_days = (observation - run_start).days
            first_played = min((item.show_date for item in played), default=None)
            y7 = label_departure(
                end_date=engagement.end_date,
                confirmed=engagement.confirmed,
                observation=observation,
                horizon=HORIZON_7,
                as_of=bundle.as_of,
            )
            y3 = label_departure(
                end_date=engagement.end_date,
                confirmed=engagement.confirmed,
                observation=observation,
                horizon=HORIZON_3,
                as_of=bundle.as_of,
            )
            market_engagement = _cover(by_market.get(film_id, ()), anchor)
            y_market = None
            if market_engagement is not None:
                y_market = label_departure(
                    end_date=market_engagement.end_date,
                    confirmed=market_engagement.confirmed,
                    observation=observation,
                    horizon=HORIZON_7,
                    as_of=bundle.as_of,
                )
            features = _feature_dict(
                observation=observation,
                friday=friday,
                friday_known=friday_known,
                friday_complete=friday_complete,
                week_complete=week_complete,
                film_friday=film_friday,
                film_weekend=film_weekend,
                film_week=film_week,
                final=final,
                today_n=today_n,
                tomorrow_n=tomorrow_n,
                next3=next3,
                next7=next7,
                avg3=avg3,
                avg3_prior=avg3_prior,
                avg7=avg7,
                avg7_prior=avg7_prior,
                current_week_count=current_week_count,
                previous_week_count=previous_week_count,
                decline=decline,
                played_counts=played_counts,
                played_days=played_days,
                prime_n=prime_n,
                premium_n=premium_n,
                showtime_count=showtime_count,
                prev_premium=prev_premium,
                distinct_days=distinct_days,
                weekend_n=weekend_n,
                age_days=age_days,
                observations=((observation - first_seen).days + 1),
                left_truncated=1.0 if run_start <= bundle.dataset_start else 0.0,
                prev_showtime_count=prev_showtime_count,
                prev_final=prev_final,
                segment=sample.segment,
                catalog_category=sample.catalog_category,
                segment_source=sample.segment_source,
                segment_confidence=sample.segment_confidence,
                pre_opening=1.0 if observation < engagement.start_date else 0.0,
                first_played=first_played,
                known_dates=known_dates,
                stable_run=stable_run,
                extension_count=extension_count,
                last_extension=last_extension,
                last_magnitude=last_magnitude,
                moved=moved,
                theater_bucket=theater_bucket,
                week_days=week_days,
                observation_theater=theater_id,
                market_theaters=market_theaters,
                market_today=market_today,
                market_next7=market_next7,
                baseline=baseline,
                distinct_films=float(len(week_films)),
                new_films=float(new_films),
                incoming_friday=float(incoming_friday),
                incumbent_absent=float(incumbent_absent),
            )
            production = _production_probability(
                model,
                observation=observation,
                film_id=film_id,
                title=title,
                segment=sample.segment,
                market_counts=market_counts,
                market_theaters=market_theaters,
                run_start=run_start,
                left_truncated=run_start <= bundle.dataset_start,
                prev_showtime_count=prev_showtime_count,
                prev_final=prev_final,
                final=final,
                premium_share=features["premium_format_share"],
            )
            rows.append(
                {
                    "film_id": film_id,
                    "title": title,
                    "theater_id": theater_id,
                    "theater_name": bundle.theater_names.get(theater_id, theater_id),
                    "observation_date": observation.isoformat(),
                    "segment": sample.segment,
                    "catalog_category": sample.catalog_category,
                    "y7": y7,
                    "y3": y3,
                    "y_market7": y_market,
                    "production_p7": production,
                    "known_last_show_date": final.isoformat(),
                    "friday_completeness": friday_complete if friday_complete is not None else "",
                    "film_friday": film_friday,
                    "today_n": today_n,
                    "next7": next7,
                    "days_since_opening": (observation - engagement.start_date).days,
                    "stable_snapshots": stable_run,
                    "features": features,
                }
            )
            prev_showtime_count = showtime_count
            prev_final = final
            prev_premium = premium_n
            recent_finals.append(final)
            recent_finals = recent_finals[-3:]
    return rows


def _feature_dict(**kw: Any) -> dict[str, float]:
    observation: date = kw["observation"]
    final: date = kw["final"]
    friday: date = kw["friday"]
    showtime_count = int(kw["showtime_count"])
    prime_n = int(kw["prime_n"])
    premium_n = int(kw["premium_n"])
    weekend_n = int(kw["weekend_n"])
    distinct_days = int(kw["distinct_days"])
    friday_complete = kw["friday_complete"]
    week_complete = kw["week_complete"]
    prev_count = kw["prev_showtime_count"]
    prev_final = kw["prev_final"]
    segment = kw["segment"]
    avg3 = kw["avg3"]
    avg7 = kw["avg7"]
    values: dict[str, float] = {}
    values["days_since_run_start"] = float(max(0, kw["age_days"]))
    values["observations_since_run_start"] = float(kw["observations"])
    values["showtime_count"] = float(showtime_count)
    values["days_with_announced_showtimes"] = float(distinct_days)
    values["announced_horizon_days"] = float((final - observation).days)
    values["showtimes_per_active_day"] = float(showtime_count / distinct_days) if distinct_days else 0.0
    values["weekend_showtime_count"] = float(weekend_n)
    values["prime_time_showtime_count"] = float(prime_n)
    values["premium_format_count"] = float(premium_n)
    values["premium_format_share"] = float(premium_n / showtime_count) if showtime_count else 0.0
    values["weekend_share"] = float(weekend_n / showtime_count) if showtime_count else 0.0
    values["prime_share"] = float(prime_n / showtime_count) if showtime_count else 0.0
    values["delta_showtime_count"] = float(showtime_count - prev_count) if prev_count is not None else 0.0
    values["farthest_show_date_delta"] = float((final - prev_final).days) if prev_final is not None else 0.0
    values["days_to_wednesday"] = float((2 - observation.weekday()) % 7)
    values["weekday"] = float(observation.weekday())
    values["left_truncated"] = float(kw["left_truncated"])
    values["lost_prime_time_coverage"] = 1.0 if prime_n == 0 and showtime_count > 0 else 0.0
    values["horizon_at_ceiling"] = 1.0 if values["announced_horizon_days"] >= 13 else 0.0
    values["has_weekend"] = 1.0 if weekend_n else 0.0
    values["is_first_week"] = 1.0 if values["days_since_run_start"] < 7 else 0.0
    values["is_special"] = 0.0 if segment == SEGMENT_ORDINARY else 1.0
    values["days_until_friday"] = float((friday - observation).days)
    values["friday_published_any"] = 1.0 if kw["friday_known"] else 0.0
    values["friday_completeness"] = float(friday_complete) if friday_complete is not None else float("nan")
    values["week_completeness"] = float(week_complete) if week_complete is not None else float("nan")
    values["friday_substantially_published"] = 1.0 if friday_complete is not None and friday_complete >= PUBLISHED_BAR else 0.0
    values["week_substantially_published"] = 1.0 if week_complete is not None and week_complete >= PUBLISHED_BAR else 0.0
    values["friday_highly_complete"] = 1.0 if friday_complete is not None and friday_complete >= PUBLISHED_HIGH else 0.0
    values["film_has_friday"] = 1.0 if kw["film_friday"] else 0.0
    values["film_has_weekend"] = 1.0 if kw["film_weekend"] else 0.0
    values["film_has_programming_week"] = 1.0 if kw["film_week"] else 0.0
    values["days_to_known_last"] = float((final - observation).days)
    values["screenings_today"] = float(kw["today_n"])
    values["screenings_tomorrow"] = float(kw["tomorrow_n"])
    values["screenings_next_3"] = float(kw["next3"])
    values["screenings_next_7"] = float(kw["next7"])
    values["avg_screenings_prior_3_play_days"] = float(avg3) if avg3 is not None else float("nan")
    values["avg_screenings_prior_7_play_days"] = float(avg7) if avg7 is not None else float("nan")
    values["delta_vs_prior_programming_week"] = float(kw["current_week_count"] - kw["previous_week_count"])
    values["delta_3day_avg"] = float(avg3 - kw["avg3_prior"]) if avg3 is not None and kw["avg3_prior"] is not None else float("nan")
    values["delta_7day_avg"] = float(avg7 - kw["avg7_prior"]) if avg7 is not None and kw["avg7_prior"] is not None else float("nan")
    values["percent_decline_from_peak"] = float(kw["decline"])
    played_days = kw["played_days"]
    played_counts = kw["played_counts"]
    desc = list(reversed(played_days))
    values["consecutive_days_at_most_1"] = float(_streak(desc, played_counts, 1))
    values["consecutive_days_at_most_2"] = float(_streak(desc, played_counts, 2))
    values["premium_disappeared"] = 1.0 if premium_n == 0 and kw["prev_premium"] not in (None, 0) else 0.0
    values["market_theater_count"] = float(len(kw["market_theaters"]))
    values["market_screenings_today"] = float(kw["market_today"])
    values["market_screenings_next_7"] = float(kw["market_next7"])
    values["market_theaters_with_friday"] = 1.0 if kw["film_friday"] else 0.0
    values["market_theaters_absent_friday"] = float("nan")
    values["market_share_absent_friday"] = float("nan")
    # 3- and 7-day-ago theater counts are filled by the caller if provided; default nan and patched below.
    values["market_theater_count_3d_ago"] = float("nan")
    values["market_theater_count_7d_ago"] = float("nan")
    values["segment_ordinary"] = 1.0 if segment == SEGMENT_ORDINARY else 0.0
    values["segment_rerelease"] = 1.0 if segment == SEGMENT_RERELEASE else 0.0
    values["segment_special"] = 1.0 if segment == SEGMENT_SPECIAL else 0.0
    values["segment_other"] = 1.0 if segment not in {SEGMENT_ORDINARY, SEGMENT_RERELEASE, SEGMENT_SPECIAL} else 0.0
    values["segment_from_catalog"] = 1.0 if kw["segment_source"] == "catalog" else 0.0
    values["segment_confidence_high"] = 1.0 if kw["segment_confidence"] == "high" else 0.0
    values["pre_opening"] = float(kw["pre_opening"])
    known_span = (max(kw["known_dates"]) - min(kw["known_dates"])).days + 1 if kw["known_dates"] else 0
    values["known_span_days"] = float(known_span)
    values["known_span_at_least_7"] = 1.0 if known_span >= 7 else 0.0
    values["second_week_visible"] = 1.0 if known_span >= 8 else 0.0
    first_played = kw["first_played"]
    values["days_since_first_screening"] = float((observation - first_played).days) if first_played else float("nan")
    week_number = 0 if observation < (first_played or observation) else ((observation - (first_played or observation)).days // 7) + 1
    if kw["pre_opening"]:
        week_number = 0
    values["theatrical_week_number"] = float(week_number)
    values["in_first_week"] = 1.0 if week_number == 1 else 0.0
    values["in_second_week"] = 1.0 if week_number == 2 else 0.0
    values["in_later_week"] = 1.0 if week_number >= 3 else 0.0
    values["longest_continuous_run_so_far"] = float(_longest_run([day for day in played_days]))
    values["final_date_stable_snapshots"] = float(kw["stable_run"])
    values["final_date_moved_last_1"] = float(kw["moved"][-1])
    values["final_date_moved_last_2"] = float(max(kw["moved"][-2:]))
    values["final_date_moved_last_3"] = float(max(kw["moved"]))
    values["extension_count_so_far"] = float(kw["extension_count"])
    last_extension = kw["last_extension"]
    values["days_since_last_extension"] = float((observation - last_extension).days) if last_extension else float(kw["observations"])
    values["last_extension_days"] = float(kw["last_magnitude"])
    values["known_last_is_wednesday"] = 1.0 if final.weekday() == 2 else 0.0
    values["known_last_is_thursday"] = 1.0 if final.weekday() == 3 else 0.0
    values["days_to_thursday"] = float((3 - observation.weekday()) % 7)
    today_base = kw["baseline"](kw["observation_theater"], observation, observation.weekday())
    values["theater_weekday_baseline"] = float(today_base) if today_base is not None else float("nan")
    today_theater = sum(cell[0] for day, cell in kw["theater_bucket"].items() if day == observation)
    values["theater_screenings_today"] = float(today_theater)
    values["theater_today_vs_baseline"] = (
        float(today_theater / today_base) if today_base else float("nan")
    )
    values["friday_volume_vs_baseline"] = float(friday_complete) if friday_complete is not None else float("nan")
    values["distinct_films_upcoming_week"] = float(kw["distinct_films"])
    values["incoming_friday_screenings"] = float(kw["incoming_friday"])
    values["new_films_on_friday"] = float(kw["new_films"])
    values["incumbent_absent_friday_screenings"] = float(kw["incumbent_absent"])
    return values


def _production_probability(model: Any, **kw: Any) -> float:
    counts: Counter = kw["market_counts"]
    if not counts:
        return float("nan")
    observation: date = kw["observation"]
    final: date = kw["final"]
    showtime_count = int(sum(counts.values()))
    distinct_days = len(counts)
    theaters = len(kw["market_theaters"])
    weekend = sum(count for day, count in counts.items() if day.weekday() >= 4)
    horizon = max(0, (final - observation).days)
    prev_count = kw["prev_showtime_count"]
    prev_final = kw["prev_final"]
    row = make_observation(
        observation_date=observation,
        run_id=f"{kw['film_id']}#pit",
        product_id=str(kw["film_id"]),
        title=kw["title"],
        run_type=_run_type_for_segment(kw["segment"]),
        remaining_days=None,
        event_observed=False,
        right_censored=True,
        left_truncated=bool(kw["left_truncated"]),
        announced_horizon_days=horizon,
        days_since_run_start=max(0, (observation - kw["run_start"]).days),
        observations_since_run_start=max(1, (observation - kw["run_start"]).days + 1),
        theater_count=theaters,
        showtime_count=showtime_count,
        days_with_announced_showtimes=distinct_days,
        showtimes_per_active_day=(showtime_count / distinct_days) if distinct_days else 0.0,
        weekend_showtime_count=weekend,
        prime_time_showtime_count=0,
        premium_format_count=0,
        premium_format_share=float(kw["premium_share"]),
        delta_theater_count=0,
        delta_showtime_count=(showtime_count - prev_count) if prev_count is not None else 0,
        farthest_show_date_delta=(final - prev_final).days if prev_final is not None else 0,
        lost_theater_since_prior=False,
        lost_weekend_coverage=weekend == 0,
        lost_prime_time_coverage=False,
    )
    try:
        return float(model.predict_calibrated(row)["p_end_within_7d"])
    except Exception:
        return float("nan")


# The builder above leaves a few market-Friday and theater-inflow features incomplete.
# They are filled by a second pass that only reads the point-in-time caches.
FEATURE_FAMILIES: dict[str, tuple[str, ...]] = {}


def _finalize_market_and_theater_features(rows: list[dict[str, Any]], bundle: Bundle) -> None:
    """Fill lagged market counts and Friday-absence features from already-built rows."""
    by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    by_film_date: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_key[(row["film_id"], row["theater_id"], row["observation_date"])] = row
        by_film_date[(row["film_id"], row["observation_date"])].append(row)
    snaps = [day.isoformat() for day in bundle.snapshot_dates]
    snap_set = set(snaps)
    for row in rows:
        observation = date.fromisoformat(row["observation_date"])
        features = row["features"]
        def prior(days: int) -> float:
            target = (observation - timedelta(days=days)).isoformat()
            if target not in snap_set:
                # nearest earlier snapshot
                earlier = [day for day in snaps if day <= target]
                if not earlier:
                    return float("nan")
                target = earlier[-1]
            found = by_key.get((row["film_id"], row["theater_id"], target))
            if found is None:
                return float("nan")
            return float(found["features"]["market_theater_count"])
        count_3 = prior(3)
        count_7 = prior(7)
        features["market_theater_count_3d_ago"] = count_3
        features["market_theater_count_7d_ago"] = count_7
        current = features["market_theater_count"]
        features["delta_market_theater_count_7d"] = current - count_7 if not math.isnan(count_7) else float("nan")
        peers = by_film_date[(row["film_id"], row["observation_date"])]
        with_friday = sum(1 for peer in peers if peer["features"]["film_has_friday"] >= 1)
        features["market_theaters_with_friday"] = float(with_friday)
        absent = len(peers) - with_friday
        features["market_theaters_absent_friday"] = float(absent)
        features["market_share_absent_friday"] = float(absent / len(peers)) if peers else float("nan")


def feature_names(family: str) -> list[str]:
    return list(FEATURE_SPECS_BY_FAMILY[family])


FEATURE_SPECS_BY_FAMILY: dict[str, list[str]] = {
    "existing": [
        "days_since_run_start",
        "observations_since_run_start",
        "showtime_count",
        "days_with_announced_showtimes",
        "announced_horizon_days",
        "showtimes_per_active_day",
        "weekend_showtime_count",
        "prime_time_showtime_count",
        "premium_format_count",
        "premium_format_share",
        "weekend_share",
        "prime_share",
        "delta_showtime_count",
        "farthest_show_date_delta",
        "days_to_wednesday",
        "weekday",
        "left_truncated",
        "lost_prime_time_coverage",
        "horizon_at_ceiling",
        "has_weekend",
        "is_first_week",
        "is_special",
    ],
    "publication": [
        "days_until_friday",
        "friday_published_any",
        "friday_completeness",
        "week_completeness",
        "friday_substantially_published",
        "week_substantially_published",
        "friday_highly_complete",
        "film_has_friday",
        "film_has_weekend",
        "film_has_programming_week",
        "days_to_known_last",
    ],
    "contraction": [
        "screenings_today",
        "screenings_tomorrow",
        "screenings_next_3",
        "screenings_next_7",
        "avg_screenings_prior_3_play_days",
        "avg_screenings_prior_7_play_days",
        "delta_vs_prior_programming_week",
        "delta_3day_avg",
        "delta_7day_avg",
        "percent_decline_from_peak",
        "consecutive_days_at_most_1",
        "consecutive_days_at_most_2",
        "premium_disappeared",
    ],
    "market": [
        "market_theater_count",
        "market_theater_count_3d_ago",
        "market_theater_count_7d_ago",
        "delta_market_theater_count_7d",
        "market_screenings_today",
        "market_screenings_next_7",
        "market_theaters_with_friday",
        "market_theaters_absent_friday",
        "market_share_absent_friday",
    ],
    "segment": [
        "segment_ordinary",
        "segment_rerelease",
        "segment_special",
        "segment_other",
        "segment_from_catalog",
        "segment_confidence_high",
        "pre_opening",
        "known_span_at_least_7",
        "second_week_visible",
    ],
    "theater": [
        "theater_weekday_baseline",
        "theater_screenings_today",
        "theater_today_vs_baseline",
        "friday_volume_vs_baseline",
        "distinct_films_upcoming_week",
        "incoming_friday_screenings",
        "new_films_on_friday",
        "incumbent_absent_friday_screenings",
    ],
    "stability": [
        "final_date_stable_snapshots",
        "final_date_moved_last_1",
        "final_date_moved_last_2",
        "final_date_moved_last_3",
        "extension_count_so_far",
        "days_since_last_extension",
        "last_extension_days",
    ],
    "maturity": [
        "days_since_first_screening",
        "theatrical_week_number",
        "in_first_week",
        "in_second_week",
        "in_later_week",
        "known_span_days",
        "longest_continuous_run_so_far",
    ],
    "calendar_extra": [
        "days_to_thursday",
        "known_last_is_wednesday",
        "known_last_is_thursday",
    ],
}


def _matrix(rows: Sequence[Mapping[str, Any]], names: Sequence[str]) -> np.ndarray:
    data = np.empty((len(rows), len(names)), dtype=float)
    for i, row in enumerate(rows):
        features = row["features"]
        for j, name in enumerate(names):
            value = features.get(name, float("nan"))
            data[i, j] = float(value) if value is not None else float("nan")
    return data


def _split(rows: Sequence[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    train, val, holdout = [], [], []
    for row in rows:
        day = date.fromisoformat(row["observation_date"])
        if day <= TRAIN_END:
            train.append(row)
        elif day <= VAL_END:
            val.append(row)
        else:
            holdout.append(row)
    return {"train": train, "validation": val, "holdout": holdout}


def _labeled(rows: Sequence[dict[str, Any]], target: str) -> list[dict[str, Any]]:
    return [row for row in rows if isinstance(row.get(target), int)]


def precision_at_recall(y: np.ndarray, scores: np.ndarray, target_recall: float) -> float | None:
    if y.size == 0 or int(y.sum()) == 0:
        return None
    order = np.argsort(-scores)
    tp = 0
    seen = 0
    total = int(y.sum())
    for idx in order:
        seen += 1
        tp += int(y[idx] == 1)
        if tp / total >= target_recall:
            return tp / seen
    return None


def choose_threshold(y: np.ndarray, scores: np.ndarray) -> float:
    if y.size == 0:
        return 0.5
    candidates = np.quantile(scores, np.linspace(0.05, 0.95, 19)) if len(scores) else [0.5]
    best_precise = None
    best_f1 = ( -1.0, 0.5)
    for threshold in candidates:
        pred = scores >= threshold
        tp = int(np.sum((pred == 1) & (y == 1)))
        fp = int(np.sum((pred == 1) & (y == 0)))
        fn = int(np.sum((pred == 0) & (y == 1)))
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
        if f1 > best_f1[0]:
            best_f1 = (f1, float(threshold))
        if precision >= 0.75 and (best_precise is None or recall > best_precise[0]):
            best_precise = (recall, float(threshold))
    if best_precise is not None:
        return best_precise[1]
    return best_f1[1]


def score_binary(y: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, Any]:
    if y.size == 0:
        return {"n": 0, "positives": 0}
    pred = scores >= threshold
    tp = int(np.sum(pred & (y == 1)))
    fp = int(np.sum(pred & (y == 0)))
    fn = int(np.sum(~pred & (y == 1)))
    tn = int(np.sum(~pred & (y == 0)))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    ap = float(average_precision_score(y, scores)) if y.min() != y.max() else None
    try:
        brier = float(brier_score_loss(y, np.clip(scores, 0, 1)))
    except ValueError:
        brier = None
    return {
        "n": int(y.size),
        "positives": int(y.sum()),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "pr_auc": ap,
        "brier": brier,
        "predicted_positive": int(tp + fp),
        "false_positives": fp,
        "false_negatives": fn,
        "true_positives": tp,
        "true_negatives": tn,
        "threshold": threshold,
        "precision_at_recall_25": precision_at_recall(y, scores, 0.25),
        "precision_at_recall_50": precision_at_recall(y, scores, 0.50),
        "precision_at_recall_75": precision_at_recall(y, scores, 0.75),
    }


def _fit(train_x: np.ndarray, train_y: np.ndarray) -> tuple[SimpleImputer, StandardScaler, LogisticRegression]:
    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()
    model = LogisticRegression(
        C=1.0,
        class_weight="balanced",
        max_iter=500,
        solver="lbfgs",
    )
    filled = imputer.fit_transform(train_x)
    scaled = scaler.fit_transform(filled)
    model.fit(scaled, train_y)
    return imputer, scaler, model


def _apply(imputer: SimpleImputer, scaler: StandardScaler, model: LogisticRegression, data: np.ndarray) -> np.ndarray:
    if len(data) == 0:
        return np.array([])
    return model.predict_proba(scaler.transform(imputer.transform(data)))[:, 1]


def _fit_eval(train: list[dict[str, Any]], val: list[dict[str, Any]], holdout: list[dict[str, Any]], names: Sequence[str], target: str) -> dict[str, Any]:
    train_l = _labeled(train, target)
    val_l = _labeled(val, target)
    hold_l = _labeled(holdout, target)
    if len(train_l) < 30 or len({row[target] for row in train_l}) < 2:
        return {"status": "insufficient_train", "n_train": len(train_l)}
    y_train = np.array([row[target] for row in train_l])
    imputer, scaler, model = _fit(_matrix(train_l, names), y_train)
    val_scores = _apply(imputer, scaler, model, _matrix(val_l, names)) if val_l else np.array([])
    y_val = np.array([row[target] for row in val_l]) if val_l else np.array([])
    threshold = choose_threshold(y_val, val_scores) if len(y_val) else 0.5
    hold_scores = _apply(imputer, scaler, model, _matrix(hold_l, names)) if hold_l else np.array([])
    y_hold = np.array([row[target] for row in hold_l]) if hold_l else np.array([])
    coefficients = [
        {"feature": name, "coefficient": float(weight)}
        for name, weight in zip(names, model.coef_[0])
    ]
    coefficients.sort(key=lambda item: abs(item["coefficient"]), reverse=True)
    return {
        "status": "ok",
        "n_train": len(train_l),
        "n_validation": len(val_l),
        "n_holdout": len(hold_l),
        "validation": score_binary(y_val, val_scores, threshold) if len(y_val) else {},
        "holdout": score_binary(y_hold, hold_scores, threshold) if len(y_hold) else {},
        "coefficients": coefficients,
        "threshold": threshold,
        "holdout_rows": hold_l,
        "holdout_scores": hold_scores,
    }


def _rule_scores(rows: Sequence[dict[str, Any]], kind: str) -> np.ndarray:
    scores = []
    for row in rows:
        features = row["features"]
        if kind == "known_last_7":
            scores.append(1.0 if features.get("days_to_known_last", 99) < 7 else 0.0)
        elif kind == "publication":
            absent = features.get("film_has_friday", 1) == 0
            complete = features.get("friday_highly_complete", 0) == 1
            scores.append(1.0 if absent and complete else 0.0)
        elif kind == "contraction":
            low = features.get("screenings_next_7", 99) <= 3
            declining = features.get("percent_decline_from_peak", 0) >= 0.5 or (
                not math.isnan(features.get("delta_3day_avg", float("nan"))) and features.get("delta_3day_avg", 0) < 0
            )
            scores.append(1.0 if low and declining else 0.0)
        elif kind == "production":
            value = row.get("production_p7")
            scores.append(float(value) if isinstance(value, float) and not math.isnan(value) else 0.0)
        else:
            scores.append(0.0)
    return np.array(scores, dtype=float)


def _eval_fixed(rows: Sequence[dict[str, Any]], target: str, scores: np.ndarray, threshold: float) -> dict[str, Any]:
    labeled_idx = [i for i, row in enumerate(rows) if isinstance(row.get(target), int)]
    if not labeled_idx:
        return {"n": 0, "positives": 0}
    y = np.array([rows[i][target] for i in labeled_idx])
    chosen = scores[np.array(labeled_idx)]
    return score_binary(y, chosen, threshold)


def publication_table(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets = (("lt_50", 0.0, 0.50), ("50_80", 0.50, 0.80), ("80_95", 0.80, 0.95), ("ge_95", 0.95, 1.01))
    out = []
    for segment in (SEGMENT_ORDINARY, SEGMENT_RERELEASE, SEGMENT_SPECIAL):
        for weekday in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"):
            for name, low, high in buckets:
                chosen = []
                for row in rows:
                    if row["segment"] != segment or not isinstance(row.get("y7"), int):
                        continue
                    if row["features"].get("film_has_friday", 1) != 0:
                        continue
                    complete = row["features"].get("friday_completeness")
                    if complete is None or (isinstance(complete, float) and math.isnan(complete)):
                        continue
                    if not (low <= float(complete) < high):
                        continue
                    if weekday_name(date.fromisoformat(row["observation_date"])) != weekday:
                        continue
                    chosen.append(row["y7"])
                out.append(
                    {
                        "segment": segment,
                        "weekday": weekday,
                        "completeness_bucket": name,
                        "n": len(chosen),
                        "leaves_within_7_rate": (sum(chosen) / len(chosen)) if chosen else None,
                    }
                )
    return out


def theater_weekday_table(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    theaters = sorted({row["theater_name"] for row in rows})
    for theater in theaters:
        for label, pred in (
            ("known_last_thursday", lambda row: row["features"]["known_last_is_thursday"] == 1),
            ("known_last_wednesday", lambda row: row["features"]["known_last_is_wednesday"] == 1),
            ("known_last_other", lambda row: row["features"]["known_last_is_thursday"] == 0 and row["features"]["known_last_is_wednesday"] == 0),
        ):
            chosen = [row["y7"] for row in rows if row["theater_name"] == theater and isinstance(row.get("y7"), int) and pred(row)]
            out.append({"theater": theater, "slice": label, "n": len(chosen), "leaves_within_7_rate": (sum(chosen) / len(chosen)) if chosen else None})
    return out


def market_signal_table(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets = (("lost_2_or_more", lambda value: value <= -2), ("lost_1", lambda value: value == -1), ("flat", lambda value: value == 0), ("gained", lambda value: value >= 1))
    out = []
    for name, pred in buckets:
        chosen = []
        for row in rows:
            if not isinstance(row.get("y7"), int):
                continue
            value = row["features"].get("delta_market_theater_count_7d")
            if not isinstance(value, float) or math.isnan(value):
                continue
            if pred(value):
                chosen.append(row["y7"])
        out.append({"slice": name, "n": len(chosen), "leaves_within_7_rate": (sum(chosen) / len(chosen)) if chosen else None})
    return out


def contraction_table(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    slices = (
        ("next_7_at_most_3", lambda row: row["features"]["screenings_next_7"] <= 3),
        ("decline_at_least_half", lambda row: row["features"]["percent_decline_from_peak"] >= 0.5),
        ("both", lambda row: row["features"]["screenings_next_7"] <= 3 and row["features"]["percent_decline_from_peak"] >= 0.5),
        ("neither", lambda row: row["features"]["screenings_next_7"] > 3 and row["features"]["percent_decline_from_peak"] < 0.5),
    )
    out = []
    for name, pred in slices:
        chosen = [row["y7"] for row in rows if isinstance(row.get("y7"), int) and pred(row)]
        out.append({"slice": name, "n": len(chosen), "leaves_within_7_rate": (sum(chosen) / len(chosen)) if chosen else None})
    return out


def stability_table(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for segment in (SEGMENT_ORDINARY, SEGMENT_RERELEASE, SEGMENT_SPECIAL):
        for label, pred in (
            ("stable_3_and_last_within_7", lambda row: row["features"]["final_date_stable_snapshots"] >= 3 and row["features"]["days_to_known_last"] < 7),
            ("moved_within_2_snapshots_and_last_within_7", lambda row: row["features"]["final_date_moved_last_2"] == 1 and row["features"]["days_to_known_last"] < 7),
            ("last_within_7", lambda row: row["features"]["days_to_known_last"] < 7),
            ("stable_3_and_last_beyond_7", lambda row: row["features"]["final_date_stable_snapshots"] >= 3 and row["features"]["days_to_known_last"] >= 7),
        ):
            chosen = [row["y7"] for row in rows if row["segment"] == segment and isinstance(row.get("y7"), int) and pred(row)]
            out.append(
                {
                    "segment": segment,
                    "slice": label,
                    "n": len(chosen),
                    "leaves_within_7_rate": (sum(chosen) / len(chosen)) if chosen else None,
                }
            )
    return out


def _dedupe_latest(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """One holdout row per film×theater engagement: the earliest holdout observation."""
    chosen: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in rows:
        key = (row["film_id"], row["theater_id"], row["known_last_show_date"][:7] if False else row["title"])
        # Engagement identity is film, theater, and the run start implied by days_since_opening.
        start = date.fromisoformat(row["observation_date"]) - timedelta(days=int(row["days_since_opening"]))
        identity = (row["film_id"], row["theater_id"], start.isoformat())
        current = chosen.get(identity)
        if current is None or row["observation_date"] < current["observation_date"]:
            chosen[identity] = row
    return list(chosen.values())


def run_audit(root: Path) -> dict[str, Any]:
    bundle = load_bundle(root)
    rows = build_feature_rows(bundle)
    _finalize_market_and_theater_features(rows, bundle)
    labeled = _labeled(rows, "y7")
    parts = _split(labeled)
    # Dedupe is applied inside evaluation copies so training still sees daily rows,
    # matching the production observation-date discipline, while headline holdout
    # metrics use one row per engagement.
    train = parts["train"]
    validation = _dedupe_latest(parts["validation"])
    holdout = _dedupe_latest(parts["holdout"])
    existing = feature_names("existing")
    specs = {
        "existing": existing,
        "existing_publication": existing + feature_names("publication"),
        "existing_contraction": existing + feature_names("contraction"),
        "existing_market": existing + feature_names("market"),
        "existing_segment": existing + feature_names("segment"),
        "existing_theater": existing + feature_names("theater"),
        "all_new": existing
        + feature_names("publication")
        + feature_names("contraction")
        + feature_names("market")
        + feature_names("segment")
        + feature_names("theater")
        + feature_names("stability")
        + feature_names("maturity")
        + feature_names("calendar_extra"),
    }
    ablations = {}
    fitted = {}
    for name, columns in specs.items():
        fitted[name] = _fit_eval(train, validation, holdout, columns, "y7")
        result = fitted[name]
        ablations[name] = {
            "status": result.get("status"),
            "validation": {key: value for key, value in result.get("validation", {}).items()},
            "holdout": {key: value for key, value in result.get("holdout", {}).items()},
            "n_features": len(columns),
        }
    y_hold = np.array([row["y7"] for row in holdout]) if holdout else np.array([])
    baselines = {}
    for kind, threshold in (
        ("production", 0.6792084024655126),
        ("known_last_7", 0.5),
        ("publication", 0.5),
        ("contraction", 0.5),
    ):
        scores = _rule_scores(holdout, kind)
        baselines[kind] = _eval_fixed(holdout, "y7", scores, threshold) if len(holdout) else {"n": 0}
        baselines[kind]["scores_are_probabilities"] = kind == "production"
    # Target variants on the all-features model.
    target_metrics = {}
    for target in ("y7", "y3", "y_market7"):
        subset = _labeled(rows, target)
        split = _split(subset)
        target_metrics[target] = _public(_fit_eval(
            split["train"],
            _dedupe_latest(split["validation"]),
            _dedupe_latest(split["holdout"]),
            specs["all_new"],
            target,
        ))
    best_name = _select_best(ablations)
    best = fitted.get(best_name, {})
    examples = _error_examples(best.get("holdout_rows", []), best.get("holdout_scores", np.array([])), best.get("threshold", 0.5))
    segment_models = _segment_models(train, validation, holdout, specs)
    calendar = _calendar_models(train, validation, holdout)
    stability = _stability_models(train, validation, holdout, existing)
    counts = _count_summary(rows, labeled, parts, holdout)
    return {
        "as_of": bundle.as_of.isoformat(),
        "dataset_start": bundle.dataset_start.isoformat(),
        "train_end": TRAIN_END.isoformat(),
        "validation_end": VAL_END.isoformat(),
        "counts": counts,
        "ablations": ablations,
        "baselines": baselines,
        "targets": target_metrics,
        "best_model": best_name,
        "publication_rows": publication_table(holdout),
        "stability_rows": stability_table(holdout),
        "theater_weekday_rows": theater_weekday_table(holdout),
        "market_signal_rows": market_signal_table(holdout),
        "contraction_rows": contraction_table(holdout),
        "segment_models": segment_models,
        "calendar_models": calendar,
        "stability_models": stability,
        "examples": examples,
        "coefficients": fitted.get(best_name, {}).get("coefficients", []),
        "feature_summary": _feature_summary(labeled),
        "holdout_for_charts": _chart_payload(holdout, fitted, baselines, best_name),
        "bundle_theater_names": bundle.theater_names,
    }


def _public(result: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "status": result.get("status"),
        "n_train": result.get("n_train"),
        "validation": result.get("validation", {}),
        "holdout": result.get("holdout", {}),
    }


def _select_best(ablations: Mapping[str, Mapping[str, Any]]) -> str:
    best_name = "existing"
    best_score = -1.0
    for name, block in ablations.items():
        validation = block.get("validation") or {}
        score = validation.get("pr_auc")
        if isinstance(score, float) and score > best_score:
            best_score = score
            best_name = name
    return best_name


def _segment_models(train, validation, holdout, specs) -> dict[str, Any]:
    shared = _public(_fit_eval(train, validation, holdout, specs["all_new"], "y7"))
    groups = {
        "ordinary_rerelease": lambda row: row["segment"] in {SEGMENT_ORDINARY, SEGMENT_RERELEASE},
        "special": lambda row: row["segment"] == SEGMENT_SPECIAL,
        "ordinary": lambda row: row["segment"] == SEGMENT_ORDINARY,
        "rerelease": lambda row: row["segment"] == SEGMENT_RERELEASE,
    }
    separate = {}
    for name, pred in groups.items():
        separate[name] = _public(_fit_eval(
            [row for row in train if pred(row)],
            [row for row in validation if pred(row)],
            [row for row in holdout if pred(row)],
            specs["all_new"],
            "y7",
        ))
    # Deterministic specials rule on the specials holdout.
    specials = [row for row in holdout if row["segment"] == SEGMENT_SPECIAL]
    scores = _rule_scores(specials, "known_last_7")
    separate["special_known_last_rule"] = _eval_fixed(specials, "y7", scores, 0.5)
    return {"shared_all_features": shared, "separate": separate}


def _calendar_models(train, validation, holdout) -> dict[str, Any]:
    base = ["days_to_known_last"]
    extra = base + feature_names("calendar_extra") + ["film_has_friday", "friday_highly_complete", "days_to_wednesday"]
    return {
        "known_last_only": _public(_fit_eval(train, validation, holdout, base, "y7")),
        "known_last_plus_calendar": _public(_fit_eval(train, validation, holdout, extra, "y7")),
    }


def _stability_models(train, validation, holdout, existing) -> dict[str, Any]:
    base = ["days_to_known_last"]
    plus = base + feature_names("stability")
    out = {
        "all": {
            "known_last_only": _public(_fit_eval(train, validation, holdout, base, "y7")),
            "plus_stability": _public(_fit_eval(train, validation, holdout, plus, "y7")),
        }
    }
    for segment in (SEGMENT_ORDINARY, SEGMENT_RERELEASE, SEGMENT_SPECIAL):
        pred = lambda row, segment=segment: row["segment"] == segment
        out[segment] = {
            "known_last_only": _public(_fit_eval([r for r in train if pred(r)], [r for r in validation if pred(r)], [r for r in holdout if pred(r)], base, "y7")),
            "plus_stability": _public(_fit_eval([r for r in train if pred(r)], [r for r in validation if pred(r)], [r for r in holdout if pred(r)], plus, "y7")),
        }
    _ = existing
    return out


def _count_summary(rows, labeled, parts, holdout) -> dict[str, Any]:
    def block(sample: Sequence[dict[str, Any]]) -> dict[str, int]:
        return {
            "n": len(sample),
            "positives_y7": sum(1 for row in sample if row.get("y7") == 1),
        }
    return {
        "rows_built": len(rows),
        "labeled_y7": block(labeled),
        "train": block(parts["train"]),
        "validation_daily": block(parts["validation"]),
        "holdout_daily": block(parts["holdout"]),
        "holdout_one_per_engagement": block(holdout),
        "by_segment_holdout": {
            segment: block([row for row in holdout if row["segment"] == segment])
            for segment in (SEGMENT_ORDINARY, SEGMENT_RERELEASE, SEGMENT_SPECIAL)
        },
    }


def _error_examples(rows: Sequence[dict[str, Any]], scores: np.ndarray, threshold: float) -> dict[str, list[dict[str, Any]]]:
    if len(rows) == 0 or len(scores) == 0:
        return {"false_positives": [], "false_negatives": [], "true_positives": [], "borderline": []}
    packed = []
    for row, score in zip(rows, scores):
        if not isinstance(row.get("y7"), int):
            continue
        predicted = int(score >= threshold)
        kind = "tp" if predicted and row["y7"] else "fp" if predicted else "fn" if row["y7"] else "tn"
        packed.append((kind, float(score), row))
    def take(kind: str, reverse: bool) -> list[dict[str, Any]]:
        chosen = [item for item in packed if item[0] == kind]
        chosen.sort(key=lambda item: item[1], reverse=reverse)
        return [_example(score, row) for _kind, score, row in chosen[:25]]
    borderline = sorted(packed, key=lambda item: abs(item[1] - threshold))[:25]
    return {
        "false_positives": take("fp", True),
        "false_negatives": take("fn", False),
        "true_positives": take("tp", True),
        "borderline": [_example(score, row) for _kind, score, row in borderline],
    }


def _example(score: float, row: Mapping[str, Any]) -> dict[str, Any]:
    features = row["features"]
    return {
        "title": row["title"],
        "theater": row["theater_name"],
        "observation_date": row["observation_date"],
        "predicted_positive": int(score >= 0.5),
        "score": round(score, 4),
        "actual_leaves_within_7": row.get("y7"),
        "segment": row["segment"],
        "known_last_show_date": row["known_last_show_date"],
        "friday_completeness": row["friday_completeness"],
        "film_has_friday": int(features.get("film_has_friday", 0)),
        "screenings_today": row["today_n"],
        "screenings_next_7": row["next7"],
        "market_theater_count": features.get("market_theater_count"),
        "delta_market_theater_count_7d": features.get("delta_market_theater_count_7d"),
        "days_since_opening": row["days_since_opening"],
        "final_date_stable_snapshots": row["stable_snapshots"],
        "production_p7": row.get("production_p7"),
        "new_model_score": round(score, 4),
    }


def _feature_summary(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    names = [name for family in FEATURE_SPECS_BY_FAMILY.values() for name in family]
    out = []
    for name in names:
        values = []
        missing = 0
        for row in rows:
            value = row["features"].get(name)
            if value is None or (isinstance(value, float) and math.isnan(value)):
                missing += 1
            else:
                values.append(float(value))
        out.append(
            {
                "feature": name,
                "family": next(family for family, group in FEATURE_SPECS_BY_FAMILY.items() if name in group),
                "n": len(rows),
                "missing_share": missing / len(rows) if rows else None,
                "median": _median(values),
                "mean": _mean(values),
            }
        )
    return out


def _chart_payload(holdout, fitted, baselines, best_name) -> dict[str, Any]:
    """Small arrays for charts. Scores stay in memory only for the selected model."""
    best = fitted.get(best_name, {})
    scores = best.get("holdout_scores", np.array([]))
    y = np.array([row["y7"] for row in best.get("holdout_rows", [])]) if best.get("holdout_rows") else np.array([])
    production = _rule_scores(best.get("holdout_rows", []), "production")
    return {
        "y": y.tolist(),
        "best_scores": scores.tolist() if hasattr(scores, "tolist") else [],
        "production_scores": production.tolist(),
        "best_name": best_name,
    }


def feature_dictionary_rows() -> list[dict[str, str]]:
    definitions = {
        "days_since_run_start": "Days from the point-in-time run cluster start to the observation. Cluster uses only dates known that day.",
        "observations_since_run_start": "Days since the first snapshot that listed this film at this theater.",
        "showtime_count": "Showtimes with show date on or after the observation and first snapshot on or before it.",
        "days_with_announced_showtimes": "Distinct future show dates on the current listing.",
        "announced_horizon_days": "Days from the observation to the latest show date on the current listing.",
        "showtimes_per_active_day": "Current listed showtimes divided by distinct listed dates.",
        "weekend_showtime_count": "Listed showtimes on Friday, Saturday, or Sunday.",
        "prime_time_showtime_count": "Listed showtimes from 5pm to 10pm.",
        "premium_format_count": "Listed premium-format showtimes.",
        "premium_format_share": "Premium showtimes divided by listed showtimes.",
        "weekend_share": "Weekend showtimes divided by listed showtimes.",
        "prime_share": "Prime showtimes divided by listed showtimes.",
        "delta_showtime_count": "Change in listed showtimes versus the previous snapshot.",
        "farthest_show_date_delta": "Change in days of the latest listed date versus the previous snapshot.",
        "days_to_wednesday": "Days until Wednesday, 0 on Wednesday.",
        "weekday": "Monday=0 through Sunday=6.",
        "left_truncated": "1 when the point-in-time cluster reaches the first day of the dataset.",
        "lost_prime_time_coverage": "1 when the current listing has showtimes and none are prime.",
        "horizon_at_ceiling": "1 when the listed horizon is at least 13 days.",
        "has_weekend": "1 when any listed show falls on Friday–Sunday.",
        "is_first_week": "1 when run age is under 7 days.",
        "is_special": "1 when the catalog segment is not ordinary. This matches the production special flag closely, not a future label.",
        "days_until_friday": "Days until the Friday on or after the observation.",
        "friday_published_any": "1 when this theater has any film's showtimes on that Friday already listed.",
        "friday_completeness": "This theater's listed Friday showtimes divided by its median past Friday volume. Past days only. Capped at 1.",
        "week_completeness": "Listed Fri–Thu showtimes divided by the sum of past weekday baselines.",
        "friday_substantially_published": "1 when the Friday estimate is at least 0.80.",
        "week_substantially_published": "1 when the week estimate is at least 0.80.",
        "friday_highly_complete": "1 when the Friday estimate is at least 0.95.",
        "film_has_friday": "1 when this film has a listed show at this theater on the upcoming Friday.",
        "film_has_weekend": "1 when this film has a listed Fri–Sun show.",
        "film_has_programming_week": "1 when this film has a listed show in the upcoming Fri–Thu week.",
        "days_to_known_last": "Days from the observation to the latest show date listed that day.",
        "screenings_today": "Listed showtimes on the observation date.",
        "screenings_tomorrow": "Listed showtimes on the next date.",
        "screenings_next_3": "Listed showtimes in the next 3 dates, including today.",
        "screenings_next_7": "Listed showtimes in the next 7 dates, including today.",
        "avg_screenings_prior_3_play_days": "Mean showtimes on the last 3 dates that had already played.",
        "avg_screenings_prior_7_play_days": "Mean showtimes on the last 7 dates that had already played.",
        "delta_vs_prior_programming_week": "Showtimes in the current Fri–Thu week minus the previous week, using played dates and the current listing.",
        "delta_3day_avg": "Last 3 play-day average minus the 3 play days before that.",
        "delta_7day_avg": "Last 7 play-day average minus the 7 before that.",
        "percent_decline_from_peak": "Drop from the highest played day so far to the most recent played day, divided by the peak.",
        "consecutive_days_at_most_1": "Trailing played days, walking backward, with at most 1 screening.",
        "consecutive_days_at_most_2": "Trailing played days with at most 2 screenings.",
        "premium_disappeared": "1 when this snapshot lists no premium show and the previous snapshot did.",
        "market_theater_count": "Enabled theaters where this film has a listed future show today.",
        "market_theater_count_3d_ago": "Same count on the snapshot about 3 days earlier.",
        "market_theater_count_7d_ago": "Same count on the snapshot about 7 days earlier.",
        "delta_market_theater_count_7d": "Today's theater count minus the count 7 days earlier.",
        "market_screenings_today": "This film's listed showtimes today across theaters.",
        "market_screenings_next_7": "This film's listed showtimes over the next 7 dates across theaters.",
        "market_theaters_with_friday": "Theaters in today's active set that list this film on Friday.",
        "market_theaters_absent_friday": "Active theaters that do not list this film on Friday.",
        "market_share_absent_friday": "Absent Friday theaters divided by active theaters.",
        "segment_ordinary": "1 for catalog ordinary.",
        "segment_rerelease": "1 for catalog anniversary/rerelease.",
        "segment_special": "1 for catalog special.",
        "segment_other": "1 for accessibility, ambiguous, or title-only segments.",
        "segment_from_catalog": "1 when the segment came from the catalog rather than the title.",
        "segment_confidence_high": "1 when catalog and title agree.",
        "pre_opening": "1 when the observation is before the engagement's first show.",
        "known_span_at_least_7": "1 when dates known today already span 7 days.",
        "second_week_visible": "1 when dates known today span 8 or more days.",
        "days_since_first_screening": "Days since the first show that had already played.",
        "theatrical_week_number": "0 before the first played show, then 1, 2, 3…",
        "in_first_week": "1 in theatrical week 1.",
        "in_second_week": "1 in theatrical week 2.",
        "in_later_week": "1 in theatrical week 3 or later.",
        "known_span_days": "Span of dates known today, played or listed.",
        "longest_continuous_run_so_far": "Longest streak of consecutive played dates before today.",
        "final_date_stable_snapshots": "Consecutive snapshots, ending today, with the same latest listed date.",
        "final_date_moved_last_1": "1 when the latest date changed on this snapshot.",
        "final_date_moved_last_2": "1 when it changed on this snapshot or the one before.",
        "final_date_moved_last_3": "1 when it changed within the last three snapshots.",
        "extension_count_so_far": "Times the latest listed date moved later, up to today.",
        "days_since_last_extension": "Days since the latest date last moved later. If it never has, days since the first listing.",
        "last_extension_days": "How many days the latest extension added. 0 if none yet.",
        "days_to_thursday": "Days until Thursday, 0 on Thursday.",
        "known_last_is_wednesday": "1 when the latest listed date is a Wednesday.",
        "known_last_is_thursday": "1 when the latest listed date is a Thursday.",
        "theater_weekday_baseline": "Median showtimes at this theater on this weekday, using dates before today.",
        "theater_screenings_today": "All films' listed showtimes at this theater today.",
        "theater_today_vs_baseline": "Today's theater volume divided by the weekday baseline.",
        "friday_volume_vs_baseline": "Same as the Friday completeness estimate.",
        "distinct_films_upcoming_week": "Distinct films with a listed show in the upcoming Fri–Thu week at this theater.",
        "incoming_friday_screenings": "Friday showtimes for films that have not yet played at this theater.",
        "new_films_on_friday": "Count of those not-yet-played films listed on Friday.",
        "incumbent_absent_friday_screenings": "Showtimes in the last 7 played days for films that have no Friday listing.",
    }
    rows = []
    for family, names in FEATURE_SPECS_BY_FAMILY.items():
        for name in names:
            rows.append(
                {
                    "feature": name,
                    "family": family,
                    "definition": definitions.get(name, ""),
                    "available_at_prediction_time": "yes",
                    "source": "screening lifecycle first_snapshot / removed_at, past dates only for baselines",
                    "leakage_risk": "low",
                }
            )
    return rows
