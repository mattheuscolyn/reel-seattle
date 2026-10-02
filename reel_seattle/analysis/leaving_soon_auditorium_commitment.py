"""Auditorium assignment as a pre-publication commitment signal.

Does not change production Leaving Soon scoring. Auditorium strength at a
prediction date uses only showtimes that had already played before that date.
"""

from __future__ import annotations

import json
import math
import statistics
from bisect import bisect_left
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from reel_seattle.analysis.leaving_soon_feature_expansion import (
    OPENING,
    _bootstrap,
    _score,
    enrich_observations,
    load_stable_metadata,
)
from reel_seattle.analysis.leaving_soon_feature_value import load_bundle
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    TRAIN_END,
    VAL_END,
    _feature_names,
    _split,
    _survival_rows,
    _week_screenings,
    build_booking_cycles,
    build_observations,
)
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import programming_week_friday, time_block
from reel_seattle.normalize.times import parse_time_to_minutes

MIN_SHOWS = 40
CAPTURE_PROBE_START = date(2026, 7, 15)
PREMIUM_TOKENS = ("IMAX", "DOLBY", "PRIME", "3D", "LASER", "70MM")


def _parse_log_date(value: str) -> date | None:
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _premium_text(format_raw: Any, premium_raw: Any) -> str:
    return f"{format_raw or ''} {premium_raw or ''}".upper()


def is_premium_format(format_raw: Any, premium_raw: Any) -> bool:
    blob = _premium_text(format_raw, premium_raw)
    return any(token in blob for token in PREMIUM_TOKENS)


def programming_strength(stats: Mapping[str, float]) -> float | None:
    """Priority programming from prime time, weekend evenings, and opening-week share.

    Premium format and price are left out so this score is not an IMAX/Dolby proxy.
    """
    count = stats.get("n") or 0
    if count < MIN_SHOWS:
        return None
    prime = stats["prime"] / count
    evening = stats["friday_saturday_evening"] / count
    opening = stats.get("opening", 0.0) / count
    wide = stats.get("wide", 0.0) / count
    return (prime + evening + opening + wide) / 4


def within_theater_percentile(raw_scores: Mapping[str, float]) -> dict[str, float]:
    if len(raw_scores) < 2:
        return {}
    ordered = sorted(raw_scores, key=lambda key: (raw_scores[key], key))
    span = max(1, len(ordered) - 1)
    return {key: index / span for index, key in enumerate(ordered)}


def _empty_bucket() -> dict[str, float]:
    return {"n": 0.0, "premium": 0.0, "prime": 0.0, "friday_saturday_evening": 0.0, "opening": 0.0, "wide": 0.0, "price_sum": 0.0, "price_n": 0.0}


def _mark_opening_weeks(shows: Sequence[dict[str, Any]]) -> None:
    """Label each played showtime from shows on or before that showtime's date."""
    first_week: dict[tuple[str, str], date] = {}
    theaters_by_week: dict[tuple[str, date], set[str]] = defaultdict(set)
    by_day: dict[date, list[dict[str, Any]]] = defaultdict(list)
    for show in shows:
        by_day[show["show_date"]].append(show)
    for day in sorted(by_day):
        for show in by_day[day]:
            title = show["title"].casefold()
            week = programming_week_friday(day)
            first_week.setdefault((show["theater"], title), week)
            theaters_by_week[(title, week)].add(show["theater"])
        for show in by_day[day]:
            title = show["title"].casefold()
            week = programming_week_friday(day)
            show["opening_week"] = first_week[(show["theater"], title)] == week
            show["wide_opening"] = bool(show["opening_week"] and len(theaters_by_week[(title, week)]) >= 4)


def scores_from_totals(totals: Mapping[tuple[str, str], Mapping[str, float]]) -> dict[tuple[str, str], float]:
    by_theater: dict[str, dict[str, float]] = defaultdict(dict)
    for (theater, auditorium), stats in totals.items():
        raw = programming_strength(stats)
        if raw is None:
            continue
        by_theater[theater][auditorium] = raw
    scored = {}
    for theater, raw_scores in by_theater.items():
        for auditorium, percentile in within_theater_percentile(raw_scores).items():
            scored[(theater, auditorium)] = percentile
    return scored


def _adult_price(prices: Any) -> float | None:
    if not isinstance(prices, list):
        return None
    for item in prices:
        if isinstance(item, Mapping) and str(item.get("type") or "").upper() == "ADULT":
            try:
                return float(item["price"])
            except (TypeError, ValueError):
                return None
    return None


def load_showtime_facts(root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return compact showtime facts and a per-log coverage row."""
    facts: list[dict[str, Any]] = []
    coverage: list[dict[str, Any]] = []
    log_dir = root / "data" / "daily_logs"
    for path in sorted(log_dir.glob("*_amc.json")):
        day = date.fromisoformat(path.name[:10])
        if day < CAPTURE_PROBE_START:
            payload = json.loads(path.read_text(encoding="utf-8"))
            records = payload.get("records") or []
            sample = (records[0].get("attributes") or {}) if records else {}
            coverage.append(
                {
                    "log_date": day.isoformat(),
                    "showtimes": len(records),
                    "auditorium": int("auditorium" in sample),
                    "auditorium_showtimes": 0,
                    "layout_id": int("layout_id" in sample),
                    "layout_version": int("layout_version_number" in sample),
                    "adult_price": int("ticket_prices" in sample),
                    "adult_price_showtimes": 0,
                    "is_sold_out_true": 0,
                    "is_almost_sold_out_true": sum(1 for record in records if record.get("almost_sold_out") is True),
                }
            )
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        records = payload.get("records") or []
        sold = almost = with_auditorium = with_layout = with_version = with_price = 0
        for record in records:
            attrs = record.get("attributes") or {}
            show_day = _parse_log_date(str(record.get("date_raw") or ""))
            minutes = parse_time_to_minutes(record.get("time_raw"))
            auditorium = str(attrs.get("auditorium") or "")
            if auditorium:
                with_auditorium += 1
            if attrs.get("layout_id") not in (None, ""):
                with_layout += 1
            if attrs.get("layout_version_number") not in (None, ""):
                with_version += 1
            price = _adult_price(attrs.get("ticket_prices"))
            if price is not None:
                with_price += 1
            sold_flag = attrs.get("is_sold_out") is True
            almost_flag = record.get("almost_sold_out") is True
            sold += int(sold_flag)
            almost += int(almost_flag)
            if show_day is None or minutes is None:
                continue
            premium_raw = attrs.get("premium_format_raw")
            facts.append(
                {
                    "log_date": day,
                    "theater": str(record.get("theater_name_raw") or ""),
                    "title": str(record.get("title_raw") or ""),
                    "show_date": show_day,
                    "minutes": int(minutes),
                    "auditorium": auditorium,
                    "layout_id": str(attrs.get("layout_id") or ""),
                    "layout_version": str(attrs.get("layout_version_number") or ""),
                    "adult_price": price,
                    "premium": is_premium_format(record.get("format_raw"), premium_raw),
                    "premium_label": _premium_text(record.get("format_raw"), premium_raw).strip(),
                    "prime": time_block(minutes) == "prime",
                    "friday_saturday_evening": show_day.weekday() in (4, 5) and time_block(minutes) == "prime",
                    "daypart": time_block(minutes) or "unknown",
                    "sold_out": sold_flag,
                    "almost_sold_out": almost_flag,
                }
            )
        coverage.append(
            {
                "log_date": day.isoformat(),
                "showtimes": len(records),
                "auditorium": int(with_auditorium > 0),
                "auditorium_showtimes": with_auditorium,
                "layout_id": int(with_layout > 0),
                "layout_showtimes": with_layout,
                "layout_version": int(with_version > 0),
                "adult_price": int(with_price > 0),
                "adult_price_showtimes": with_price,
                "is_sold_out_true": sold,
                "is_almost_sold_out_true": almost,
            }
        )
    return facts, coverage


def unique_played(facts: Sequence[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """One row per showtime, using the listing on the show date when it exists."""
    grouped: dict[tuple, list[Mapping[str, Any]]] = defaultdict(list)
    for fact in facts:
        grouped[(fact["theater"], fact["title"], fact["show_date"], fact["minutes"])].append(fact)
    chosen = []
    changed_auditorium = 0
    changed_layout = 0
    for items in grouped.values():
        auditoriums = {item["auditorium"] for item in items if item["auditorium"]}
        layouts = {item["layout_id"] for item in items if item["layout_id"]}
        changed_auditorium += int(len(auditoriums) > 1)
        changed_layout += int(len(layouts) > 1)
        on_day = [item for item in items if item["log_date"] == item["show_date"] and item["auditorium"]]
        before = [item for item in items if item["log_date"] <= item["show_date"] and item["auditorium"]]
        pool = on_day or before or [item for item in items if item["auditorium"]] or list(items)
        chosen.append(max(pool, key=lambda item: item["log_date"]))
    return chosen, {
        "showtime_keys": len(grouped),
        "auditorium_changed_across_logs": changed_auditorium,
        "layout_changed_across_logs": changed_layout,
    }


def layout_mapping(facts: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], list[Mapping[str, Any]]] = defaultdict(list)
    for fact in facts:
        if not fact["auditorium"]:
            continue
        grouped[(fact["theater"], fact["auditorium"], fact["layout_id"])].append(fact)
    rows = []
    for (theater, auditorium, layout_id), items in sorted(grouped.items()):
        versions = {item["layout_version"] for item in items if item["layout_version"]}
        formats = sorted({item["premium_label"] for item in items if item["premium"] and item["premium_label"]})
        prices = [item["adult_price"] for item in items if item["adult_price"] is not None]
        rows.append(
            {
                "theater": theater,
                "auditorium_number": auditorium,
                "layout_id": layout_id,
                "layout_versions": "|".join(sorted(versions)),
                "first_seen": min(item["log_date"] for item in items).isoformat(),
                "last_seen": max(item["log_date"] for item in items).isoformat(),
                "number_of_showtimes": len(items),
                "number_of_distinct_films": len({item["title"].casefold() for item in items}),
                "premium_formats_seen": "|".join(formats[:8]),
                "median_adult_price": round(float(np.median(prices)), 2) if prices else "",
            }
        )
    by_auditorium: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_auditorium[(row["theater"], row["auditorium_number"])].append(row)
    for pair, members in by_auditorium.items():
        total = sum(int(member["number_of_showtimes"]) for member in members)
        top = max(int(member["number_of_showtimes"]) for member in members)
        layouts = {member["layout_id"] for member in members if member["layout_id"]}
        if not layouts:
            label = "layout missing"
        elif len(layouts) == 1 and top / total >= 0.95:
            label = "one auditorium, one layout"
        elif len(layouts) > 1:
            label = "auditorium uses multiple layouts"
        else:
            label = "layout mostly stable"
        for member in members:
            member["mapping_stability"] = label
    layout_auditoriums: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in rows:
        if row["layout_id"]:
            layout_auditoriums[(row["theater"], row["layout_id"])].add(row["auditorium_number"])
    for row in rows:
        shared = layout_auditoriums.get((row["theater"], row["layout_id"]), set())
        row["layout_auditorium_count"] = len(shared)
        if len(shared) > 1 and row["mapping_stability"] == "one auditorium, one layout":
            row["mapping_stability"] = "layout id shared by multiple auditoriums"
    return rows


def _index_facts(facts: Sequence[Mapping[str, Any]]) -> dict[tuple[str, str, date, int], dict[str, Any]]:
    index = {}
    for fact in facts:
        if not fact["auditorium"]:
            continue
        index[(fact["theater"].casefold(), fact["title"].casefold(), fact["show_date"], fact["minutes"])] = fact
    return index


def _week_facts(shows, theater_name: str, start: date, end: date, snapshot: date, index) -> list[dict[str, Any]]:
    matched = []
    for show in _week_screenings(shows, start, end, snapshot):
        if show.minutes is None:
            continue
        found = index.get((theater_name.casefold(), show.title.casefold(), show.show_date, int(show.minutes)))
        if found:
            matched.append(found)
    return matched


def _weighted(facts: Sequence[Mapping[str, Any]], scores: Mapping[tuple[str, str], float], theater: str) -> tuple[float, float, str, float]:
    if not facts:
        return float("nan"), float("nan"), "", float("nan")
    weights = defaultdict(int)
    valued = []
    high = 0
    for fact in facts:
        weights[fact["auditorium"]] += 1
        score = scores.get((theater, fact["auditorium"]))
        if score is None:
            continue
        valued.append(score)
        high += int(score >= 0.75)
    dominant = max(weights, key=weights.get)
    mean = float(statistics.fmean(valued)) if valued else float("nan")
    best = max(valued) if valued else float("nan")
    return mean, best, dominant, (high / len(facts)) if facts else float("nan")


def build_score_calendar(facts: Sequence[Mapping[str, Any]], days: Sequence[date]) -> dict[date, dict[tuple[str, str], float]]:
    ordered = sorted(facts, key=lambda item: item["show_date"])
    calendar = {}
    cursor = 0
    totals: dict[tuple[str, str], dict[str, float]] = defaultdict(_empty_bucket)
    for day in sorted(days):
        while cursor < len(ordered) and ordered[cursor]["show_date"] < day:
            show = ordered[cursor]
            cursor += 1
            if not show["auditorium"]:
                continue
            bucket = totals[(show["theater"], show["auditorium"])]
            bucket["n"] += 1
            bucket["premium"] += 1 if show["premium"] else 0
            bucket["prime"] += 1 if show["prime"] else 0
            bucket["friday_saturday_evening"] += 1 if show["friday_saturday_evening"] else 0
            bucket["opening"] += 1 if show.get("opening_week") else 0
            bucket["wide"] += 1 if show.get("wide_opening") else 0
            if show["adult_price"] is not None:
                bucket["price_sum"] += float(show["adult_price"])
                bucket["price_n"] += 1
        calendar[day] = scores_from_totals(totals)
    return calendar


def _price_history(facts: Sequence[Mapping[str, Any]]) -> dict[str, list[Mapping[str, Any]]]:
    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for fact in facts:
        if fact.get("adult_price") is not None:
            grouped[fact["theater"]].append(fact)
    for items in grouped.values():
        items.sort(key=lambda item: item["show_date"])
    return grouped


def _median_before(items: Sequence[Mapping[str, Any]], snapshot: date, *, premium: bool | None = None, daypart: str | None = None) -> float:
    if not items:
        return float("nan")
    end = bisect_left([item["show_date"] for item in items], snapshot)
    prices = []
    for fact in items[:end]:
        if premium is not None and bool(fact["premium"]) != premium:
            continue
        if daypart is not None and fact["daypart"] != daypart:
            continue
        prices.append(float(fact["adult_price"]))
    return float(np.median(prices)) if prices else float("nan")


def attach_auditorium_features(rows: list[dict[str, Any]], screenings, facts: Sequence[Mapping[str, Any]]) -> dict[date, dict[tuple[str, str], float]]:
    index = _index_facts(facts)
    by_pair = defaultdict(list)
    for show in screenings:
        by_pair[(show.film_id, show.theater_id)].append(show)
    needed = {date.fromisoformat(row["observation_date"]) for row in rows}
    for row in rows:
        visible = date.fromisoformat(row["visible_friday"])
        needed.add(visible + timedelta(days=7))
    if facts:
        day = min(fact["show_date"] for fact in facts)
        last = max(needed)
        while day <= last:
            needed.add(day)
            day += timedelta(days=1)
    calendar = build_score_calendar(facts, sorted(needed))
    prices = _price_history(facts)
    for row in rows:
        snapshot = date.fromisoformat(row["observation_date"])
        visible = date.fromisoformat(row["visible_friday"])
        theater = row["theater_name"]
        shows = by_pair.get((row["film_id"], row["theater_id"]), ())
        current = _week_facts(shows, theater, visible, visible + timedelta(days=6), snapshot, index)
        prior = _week_facts(shows, theater, visible - timedelta(days=7), visible - timedelta(days=1), snapshot, index)
        scores = calendar.get(snapshot, {})
        mean, best, dominant, high_share = _weighted(current, scores, theater)
        prior_mean, prior_best, prior_dominant, _prior_high = _weighted(prior, scores, theater)
        prime_high = 0
        prime_n = 0
        for fact in current:
            if not fact["prime"]:
                continue
            prime_n += 1
            score = scores.get((theater, fact["auditorium"]))
            if score is not None and score >= 0.75:
                prime_high += 1
        played = [show.show_date for show in shows if not show.canceled and not show.removed_before_show and show.show_date < snapshot]
        history_start = programming_week_friday(min(played)) if played else None
        opening_friday = None if row.get("opening_truncated") else history_start
        opening_mean = float("nan")
        if opening_friday is not None and opening_friday < visible:
            opening_end = opening_friday + timedelta(days=7)
            opening_facts = _week_facts(shows, theater, opening_friday, opening_friday + timedelta(days=6), snapshot, index)
            opening_scores = calendar.get(opening_end) or {}
            opening_mean, _opening_best, _opening_dom, _opening_high = _weighted(opening_facts, opening_scores, theater)
        elif opening_friday == visible:
            opening_mean = mean
        peak = mean
        streak = 1.0 if current and not math.isnan(mean) else float("nan")
        streak_open = not math.isnan(streak)
        cursor = visible - timedelta(days=7)
        current_tier = _tier(mean)
        while history_start is not None and cursor >= history_start:
            week_facts = _week_facts(shows, theater, cursor, cursor + timedelta(days=6), snapshot, index)
            week_scores = calendar.get(min(cursor + timedelta(days=7), snapshot), {})
            week_mean, _week_best, _week_dom, _week_high = _weighted(week_facts, week_scores, theater)
            if not math.isnan(week_mean):
                peak = week_mean if math.isnan(peak) else max(peak, week_mean)
            if streak_open:
                if _tier(week_mean) == current_tier and current_tier != "unknown":
                    streak += 1
                else:
                    streak_open = False
            cursor -= timedelta(days=7)
        listed_prices = [fact["adult_price"] for fact in current if fact["adult_price"] is not None]
        current_premium = any(fact["premium"] for fact in current)
        prior_premium = any(fact["premium"] for fact in prior)
        daypart = statistics.mode([fact["daypart"] for fact in current]) if current else None
        history = prices.get(theater, ())
        theater_median = _median_before(history, snapshot)
        format_median = _median_before(history, snapshot, premium=current_premium)
        daypart_median = _median_before(history, snapshot, daypart=daypart)
        mean_price = float(statistics.fmean(listed_prices)) if listed_prices else float("nan")
        row.update(
            {
                "auditorium_matched_shows": float(len(current)),
                "distinct_auditoriums": float(len({fact["auditorium"] for fact in current})) if current else float("nan"),
                "dominant_auditorium_number": float(dominant) if dominant.isdigit() else float("nan"),
                "dominant_layout_id": next((fact["layout_id"] for fact in current if fact["auditorium"] == dominant and fact["layout_id"]), ""),
                "best_auditorium_score": best,
                "mean_auditorium_score": mean,
                "high_tier_share": high_share if current else float("nan"),
                "prime_high_tier_share": (prime_high / prime_n) if prime_n else float("nan"),
                "premium_retained": 1.0 if current_premium and prior_premium else 0.0 if prior else float("nan"),
                "premium_lost_since_prior_week": 1.0 if prior_premium and not current_premium else 0.0 if prior else float("nan"),
                "moved_to_weaker": 1.0 if not math.isnan(mean) and not math.isnan(prior_mean) and mean + 0.15 < prior_mean else 0.0 if prior and current else float("nan"),
                "moved_to_stronger": 1.0 if not math.isnan(mean) and not math.isnan(prior_mean) and mean > prior_mean + 0.15 else 0.0 if prior and current else float("nan"),
                "auditorium_score_change": mean - prior_mean if not math.isnan(mean) and not math.isnan(prior_mean) else float("nan"),
                "opening_to_current_score": mean - opening_mean if not math.isnan(mean) and not math.isnan(opening_mean) else float("nan"),
                "consecutive_weeks_same_tier": streak,
                "current_over_peak_auditorium": mean / peak if not math.isnan(mean) and isinstance(peak, float) and peak > 0 else float("nan"),
                "peak_to_current_score": mean - peak if not math.isnan(mean) and isinstance(peak, float) and not math.isnan(peak) else float("nan"),
                "mean_adult_price": mean_price,
                "price_vs_theater_median": mean_price / theater_median if listed_prices and theater_median == theater_median and theater_median else float("nan"),
                "price_vs_format_median": mean_price / format_median if listed_prices and format_median == format_median and format_median else float("nan"),
                "price_vs_daypart_median": mean_price / daypart_median if listed_prices and daypart_median == daypart_median and daypart_median else float("nan"),
                "dominant_auditorium": dominant,
                "opening_auditorium_score": opening_mean,
            }
        )
    return calendar


def hierarchy_table(calendar: Mapping[date, Mapping[tuple[str, str], float]], facts: Sequence[Mapping[str, Any]], as_of: date) -> list[dict[str, Any]]:
    scores = calendar.get(as_of) or {}
    grouped: dict[tuple[str, str], list[Mapping[str, Any]]] = defaultdict(list)
    for fact in facts:
        if fact["auditorium"] and fact["show_date"] < as_of:
            grouped[(fact["theater"], fact["auditorium"])].append(fact)
    rows = []
    for (theater, auditorium), items in sorted(grouped.items()):
        score = scores.get((theater, auditorium))
        if score is None:
            continue
        prices = [item["adult_price"] for item in items if item["adult_price"] is not None]
        rows.append(
            {
                "as_of": as_of.isoformat(),
                "theater": theater,
                "auditorium_number": auditorium,
                "commitment_score": round(score, 3),
                "tier": "top" if score >= 0.75 else "upper-middle" if score >= 0.5 else "lower-middle" if score >= 0.25 else "low",
                "showtimes_before_as_of": len(items),
                "premium_share": round(sum(1 for item in items if item["premium"]) / len(items), 3),
                "opening_week_share": round(sum(1 for item in items if item.get("opening_week")) / len(items), 3),
                "wide_opening_share": round(sum(1 for item in items if item.get("wide_opening")) / len(items), 3),
                "prime_share": round(sum(1 for item in items if item["prime"]) / len(items), 3),
                "friday_saturday_evening_share": round(sum(1 for item in items if item["friday_saturday_evening"]) / len(items), 3),
                "median_adult_price": round(float(np.median(prices)), 2) if prices else "",
            }
        )
    return rows


def _tier(score: Any) -> str:
    if not isinstance(score, float) or math.isnan(score):
        return "unknown"
    if score >= 0.75:
        return "top"
    if score >= 0.5:
        return "upper-middle"
    if score >= 0.25:
        return "lower-middle"
    return "low"


def build_coverage_summary(log_coverage, played, primary, segment_of) -> list[dict[str, Any]]:
    rows = []

    def add(slice_name, key, showtimes, auditorium, layout, price, premium, sold, almost):
        rows.append(
            {
                "slice": slice_name,
                "key": key,
                "showtimes": showtimes,
                "auditorium_showtimes": auditorium,
                "layout_id_showtimes": layout,
                "adult_price_showtimes": price,
                "premium_format_showtimes": premium,
                "is_sold_out_true": sold,
                "is_almost_sold_out_true": almost,
                "auditorium_share": round(auditorium / showtimes, 4) if showtimes else None,
                "adult_price_share": round(price / showtimes, 4) if showtimes else None,
            }
        )

    for item in log_coverage:
        add(
            "log_date",
            item["log_date"],
            item["showtimes"],
            item.get("auditorium_showtimes", 0),
            item["showtimes"] if item.get("layout_id") and "layout_showtimes" not in item else item.get("layout_showtimes", 0),
            item.get("adult_price_showtimes", 0),
            0,
            item.get("is_sold_out_true", 0),
            item.get("is_almost_sold_out_true", 0),
        )
    buckets: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for fact in played:
        segment = segment_of.get(fact["title"].casefold(), "unmatched")
        ordinary = "ordinary" if segment == "ordinary" else "special_or_rerelease" if segment != "unmatched" else "unmatched"
        for slice_name, key in (("theater", fact["theater"]), ("segment", segment), ("ordinary_vs_special", ordinary)):
            bucket = buckets[(slice_name, key)]
            bucket["showtimes"] += 1
            bucket["auditorium"] += int(bool(fact["auditorium"]))
            bucket["layout"] += int(bool(fact["layout_id"]))
            bucket["price"] += int(fact["adult_price"] is not None)
            bucket["premium"] += int(bool(fact["premium"]))
            bucket["sold"] += int(bool(fact["sold_out"]))
            bucket["almost"] += int(bool(fact["almost_sold_out"]))
    for (slice_name, key), bucket in sorted(buckets.items()):
        add(slice_name, key, bucket["showtimes"], bucket["auditorium"], bucket["layout"], bucket["price"], bucket["premium"], bucket["sold"], bucket["almost"])
    model_buckets: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in primary:
        segment = row.get("segment") or "unknown"
        ordinary = "ordinary" if segment == "ordinary" else "special_or_rerelease"
        matched = int((row.get("auditorium_matched_shows") or 0) > 0)
        scored = int(isinstance(row.get("mean_auditorium_score"), float) and row["mean_auditorium_score"] == row["mean_auditorium_score"])
        priced = int(isinstance(row.get("mean_adult_price"), float) and row["mean_adult_price"] == row["mean_adult_price"])
        day = date.fromisoformat(row["split_date"])
        split = "train" if day <= TRAIN_END else "validation" if day <= VAL_END else "holdout"
        for slice_name, key in (("prepublication_segment", segment), ("prepublication_ordinary_vs_special", ordinary), ("prepublication_split", split)):
            bucket = model_buckets[(slice_name, key)]
            bucket["rows"] += 1
            bucket["matched"] += matched
            bucket["scored"] += scored
            bucket["priced"] += priced
    for (slice_name, key), bucket in sorted(model_buckets.items()):
        rows.append(
            {
                "slice": slice_name,
                "key": key,
                "showtimes": bucket["rows"],
                "auditorium_showtimes": bucket["matched"],
                "layout_id_showtimes": bucket["scored"],
                "adult_price_showtimes": bucket["priced"],
                "premium_format_showtimes": "",
                "is_sold_out_true": "",
                "is_almost_sold_out_true": "",
                "auditorium_share": round(bucket["matched"] / bucket["rows"], 4) if bucket["rows"] else None,
                "adult_price_share": round(bucket["priced"] / bucket["rows"], 4) if bucket["rows"] else None,
            }
        )
    return rows


def run_auditorium_audit(root: Path) -> dict[str, Any]:
    facts, log_coverage = load_showtime_facts(root)
    played, assignment_changes = unique_played(facts)
    _mark_opening_weeks(played)
    first_auditorium = next((row["log_date"] for row in log_coverage if row.get("auditorium")), None)
    mapping = layout_mapping(played)
    bundle = load_bundle(root)
    metadata = load_stable_metadata(root)
    cycles = build_booking_cycles(bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of)
    primary = build_observations(bundle, cycles, kind="before_80")
    enrich_observations(primary, bundle.screenings, metadata, {}, bundle.dataset_start)
    calendar = attach_auditorium_features(primary, bundle.screenings, played)
    for row in primary:
        row["tier"] = _tier(row.get("mean_auditorium_score"))
    parts = _split(primary)
    base_names = [*_feature_names(True), *OPENING]
    baseline, base_rows = _score(parts["train"], parts["holdout"], base_names)
    families = (
        ("raw_auditorium_count", ("distinct_auditoriums", "dominant_auditorium_number")),
        ("hierarchy_score", ("mean_auditorium_score", "best_auditorium_score", "high_tier_share", "prime_high_tier_share")),
        ("movement", ("auditorium_score_change", "moved_to_weaker", "moved_to_stronger", "opening_to_current_score", "peak_to_current_score", "consecutive_weeks_same_tier")),
        ("relative_price", ("mean_adult_price", "price_vs_theater_median", "price_vs_format_median", "price_vs_daypart_median")),
        ("premium_retention", ("premium_retained", "premium_lost_since_prior_week")),
    )
    results = [{"model": "pr141_opening", **{key: baseline.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "median_abs_error_capped", "ranking_pairwise")}}]
    best_name = "pr141_opening"
    best_loss = baseline.get("log_loss") or 99
    best_rows = base_rows
    alone_rows_by = {}
    cumulative = list(base_names)
    for label, names in families:
        cumulative = [*cumulative, *names]
        metrics, scored = _score(parts["train"], parts["holdout"], cumulative)
        results.append({"model": label, "mode": "cumulative", **{key: metrics.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "median_abs_error_capped", "ranking_pairwise")}})
        alone, alone_rows = _score(parts["train"], parts["holdout"], [*base_names, *names])
        alone_rows_by[label] = alone_rows
        results.append({"model": label, "mode": "added_alone", **{key: alone.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "median_abs_error_capped", "ranking_pairwise")}})
        chosen = scored if (metrics.get("log_loss") or 99) <= (alone.get("log_loss") or 99) else alone_rows
        chosen_loss = min(metrics.get("log_loss") or 99, alone.get("log_loss") or 99)
        if chosen_loss < best_loss and ((metrics if chosen is scored else alone).get("pr_auc_final_week") or 0) >= (baseline.get("pr_auc_final_week") or 0) - 0.02:
            best_loss = chosen_loss
            best_name = label
            best_rows = chosen
    all_metrics, all_rows = _score(parts["train"], parts["holdout"], cumulative)
    results.append({"model": "all_auditorium", "mode": "cumulative", **{key: all_metrics.get(key) for key in ("n", "log_loss", "brier", "pr_auc_final_week", "pr_auc_exactly_1", "pr_auc_exactly_2", "pr_auc_3_plus", "median_abs_error_capped", "ranking_pairwise")}})
    for row in base_rows:
        row["tier"] = _tier(row.get("mean_auditorium_score"))
    title_segment = defaultdict(list)
    for show in bundle.screenings:
        title_segment[show.title.casefold()].append(show.segment)
    segment_of = {title: max(set(values), key=values.count) for title, values in title_segment.items()}
    sold = [fact for fact in facts if fact["sold_out"]]
    almost = [fact for fact in facts if fact["almost_sold_out"]]
    matched_rows = [row for row in primary if row.get("auditorium_matched_shows", 0) > 0]
    stable_pairs = {(row["theater"], row["auditorium_number"]) for row in mapping if row["mapping_stability"] == "one auditorium, one layout"}
    mixed_pairs = {(row["theater"], row["auditorium_number"]) for row in mapping if row["mapping_stability"] != "one auditorium, one layout"}
    examples = []
    focus = ("cars: 20th anniversary", "by any means")
    for row in base_rows:
        probs = [row.get("p0"), row.get("p1"), row.get("p2"), row.get("p3")]
        if any(not isinstance(value, float) for value in probs):
            continue
        predicted = int(np.argmax(probs))
        actual = None if row.get("censored") else int(row["bucket"])
        kind = None
        if actual == 1 and predicted == 0:
            kind = "called final, played +1"
        elif actual is not None and actual >= 2 and predicted == 0:
            kind = "called final, played +2+"
        elif actual == 1 and predicted == 3:
            kind = "predicted long run, stopped after +1"
        elif actual is not None and actual >= 3 and predicted == 1:
            kind = "predicted +1, survived 3+"
        named = row["title"].casefold() in focus and "alderwood" in row["theater_name"].casefold()
        if kind or named:
            examples.append({**row, "error_class": kind or "named example", "predicted_bucket": predicted})
    examples.sort(key=lambda item: (item["error_class"], -(item.get("p0") or 0)))
    kept = []
    seen = set()
    per_class: dict[str, int] = defaultdict(int)
    for item in examples:
        key = (item["film_id"], item["theater_id"], item["observation_date"], item["error_class"])
        if key in seen:
            continue
        if item["error_class"] != "named example" and per_class[item["error_class"]] >= 12:
            continue
        seen.add(key)
        per_class[item["error_class"]] += 1
        kept.append(item)
    examples = kept
    hierarchy_as_of = date(2026, 9, 6)
    return {
        "first_auditorium_log": first_auditorium,
        "log_coverage": log_coverage,
        "mapping": mapping,
        "stable_auditoriums": len(stable_pairs),
        "mixed_auditoriums": len(mixed_pairs),
        "hierarchy": hierarchy_table(calendar, played, hierarchy_as_of),
        "hierarchy_as_of": hierarchy_as_of.isoformat(),
        "baseline": baseline,
        "best_model": best_name,
        "results": results,
        "assignment_changes": assignment_changes,
        "bootstrap_hierarchy": _bootstrap(base_rows, alone_rows_by["hierarchy_score"]),
        "bootstrap_price": _bootstrap(base_rows, alone_rows_by["relative_price"]),
        "bootstrap_raw": _bootstrap(base_rows, alone_rows_by["raw_auditorium_count"]),
        "bootstrap_all": _bootstrap(base_rows, all_rows),
        "coverage_summary": build_coverage_summary(log_coverage, played, primary, segment_of),
        "survival_tier": _survival_rows(base_rows, lambda row: row.get("tier") or "unknown", "tier"),
        "movement": _movement_summary(base_rows),
        "coverage": {
            "prepublication_rows": len(primary),
            "rows_with_auditorium": len(matched_rows),
            "holdout_with_score": sum(1 for row in parts["holdout"] if isinstance(row.get("mean_auditorium_score"), float) and not math.isnan(row["mean_auditorium_score"])),
        },
        "sold_out": _flag_summary(sold, "isSoldOut"),
        "almost_sold_out": _flag_summary(almost, "isAlmostSoldOut"),
        "capacity_note": "Exact auditorium capacity is not available from the currently accessible public/catalog API. maximumIntendedAttendance is present on the showtimes payload and empty in the daily logs. No seat-count field is documented on the showtimes or movies catalog records used here.",
        "examples": examples,
        "observations": primary,
        "segment_lookup_size": len(segment_of),
        "facts_n": len(facts),
    }


def _movement_summary(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    def rate(items):
        flagged = [row for row in items if isinstance(row.get("moved_to_weaker"), float) and not math.isnan(row["moved_to_weaker"])]
        if not flagged:
            return {"n": 0}
        return {"n": len(flagged), "share_moved_weaker": sum(row["moved_to_weaker"] for row in flagged) / len(flagged), "share_moved_stronger": sum(row["moved_to_stronger"] for row in flagged) / len(flagged)}

    labeled = [row for row in rows if not row.get("censored")]
    return {
        "final_week": rate([row for row in labeled if row.get("bucket") == 0]),
        "plus_1": rate([row for row in labeled if row.get("bucket") == 1]),
        "plus_3": rate([row for row in labeled if row.get("bucket") == 3]),
    }


def _flag_summary(facts: Sequence[Mapping[str, Any]], name: str) -> dict[str, Any]:
    same_day = sum(1 for fact in facts if fact["show_date"] == fact["log_date"])
    return {
        "field": name,
        "true_showtimes": len(facts),
        "films": len({fact["title"].casefold() for fact in facts}),
        "theaters": len({fact["theater"] for fact in facts}),
        "true_on_show_date": same_day,
        "true_before_show_date": len(facts) - same_day,
    }


def tmdb_snapshot_row(details: Mapping[str, Any], *, film_id: str, observed_at: str) -> dict[str, Any]:
    """Research row for a future weekly TMDB snapshot. Not a historical feature."""
    tmdb_id = details.get("id")
    if not isinstance(tmdb_id, int):
        raise ValueError("TMDB details require an integer id")
    return {
        "observed_at": observed_at,
        "film_id": film_id,
        "tmdb_id": tmdb_id,
        "popularity": details.get("popularity"),
        "vote_count": details.get("vote_count"),
        "vote_average": details.get("vote_average"),
    }
