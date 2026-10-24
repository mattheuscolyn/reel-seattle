"""Research market features at a single AMC scheduling snapshot.

Keep distinct AMC source products separate unless a reviewed alias mapping
explicitly approves combining them. This module never publishes forecasts.
"""
from __future__ import annotations
import math
import statistics
from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_feature_value import still_listed
from reel_seattle.analysis.leaving_soon_prepublication_survival import _film_features, _segment_flags
from reel_seattle.analysis.leaving_soon_scheduling_assumptions import programming_week_friday

VERSION = "market_features_v3_research"
THEATER_ONLY = frozenset({"share_of_theater", "rank_in_theater", "theater_week_vs_baseline"})
MARKET_REPLACEMENT = ("share_of_market", "rank_in_market", "market_week_vs_baseline")


def build_market_snapshot(
    screenings: Sequence[Any], *, snapshot: date, upcoming_friday: date,
    dataset_start: date, theater_ids: Sequence[str] | None = None,
    approved_product_aliases: Mapping[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Every film and derived feature uses exactly one historical cutoff."""
    if snapshot < dataset_start or snapshot >= upcoming_friday:
        raise ValueError("Snapshot must be within history and before upcoming Friday")
    aliases = approved_product_aliases or {}
    allowed = set(theater_ids) if theater_ids is not None else None
    visible = upcoming_friday - timedelta(days=7)
    week = timedelta(days=7)
    by_film: dict[str, list[Any]] = defaultdict(list)
    for show in screenings:
        if (allowed is not None and show.theater_id not in allowed) or not still_listed(show, snapshot):
            continue
        by_film[aliases.get(show.film_id, show.film_id)].append(show)
    current = {
        film: [s for s in shows if visible <= s.show_date < upcoming_friday]
        for film, shows in by_film.items()
    }
    current = {f: v for f, v in current.items() if v}
    market_total = sum(len(shows) for shows in current.values())
    ranks = {f: i + 1 for i, f in enumerate(sorted(current, key=lambda k: (-len(current[k]), k)))}
    historic_week_totals: dict[date, int] = defaultdict(int)
    for shows in by_film.values():
        for show in shows:
            day = programming_week_friday(show.show_date)
            if show.show_date < snapshot and day < visible:
                historic_week_totals[day] += 1
    historical_counts = [v for v in historic_week_totals.values() if v > 0]
    median_week = float(statistics.median(historical_counts)) if historical_counts else 0.0
    upcoming_new = sum(
        any(s.show_date >= upcoming_friday for s in shows)
        and not any(s.show_date < snapshot for s in shows)
        for shows in by_film.values()
    )
    out = []
    for film in sorted(current):
        shows = by_film[film]
        present = current[film]
        previous = [s for s in shows if visible - week <= s.show_date < visible]
        theaters_now = Counter(s.theater_id for s in present)
        theaters_prior = Counter(s.theater_id for s in previous)
        known_first_show = min(s.show_date for s in shows)
        first_seen = min(s.first_snapshot for s in shows)
        segment = sorted(
            Counter(s.segment for s in present).items(),
            key=lambda t: (-t[1], t[0]),
        )[0][0]
        title = min(present, key=lambda s: (s.first_snapshot, s.show_date, s.theater_id)).title
        base = _film_features(
            shows, snapshot=snapshot, visible_friday=visible,
            next_friday=upcoming_friday, first_show=known_first_show,
            dataset_start=dataset_start, left_truncated=first_seen <= dataset_start,
            theater_total=market_total, rank=ranks[film],
            theater_baseline=median_week, peers=(),
        )
        for name in THEATER_ONLY:
            base.pop(name, None)
        base.update({
            "market_theater_count": float(len(theaters_now)),
            "market_screenings": float(len(present)),
            "market_screenings_wow": float(len(present) - len(previous)),
            "theater_count_wow": float(len(theaters_now) - len(theaters_prior)),
            "share_theaters_declining": (
                sum(theaters_now[t] < theaters_prior[t] for t in theaters_now if theaters_prior[t])
                / len(theaters_now)
            ),
            "strongest_theater_screenings": float(max(theaters_now.values())),
            "weakest_theater_screenings": float(min(theaters_now.values())),
            "theaters_at_minimal": float(sum(n <= 2 for n in theaters_now.values())),
            "share_of_market": len(present) / market_total if market_total else 0.0,
            "rank_in_market": float(ranks[film]),
            "market_week_vs_baseline": market_total / median_week if median_week else float("nan"),
            "next_week_titles_already_listed": float(upcoming_new),
        })
        if base["current_week_screenings"] != base["market_screenings"]:
            raise ValueError("Market/current film screening counts have different units")
        if any(key in base for key in THEATER_ONLY):
            raise ValueError("Theater-specific model feature leaked into market feature row")
        source_ids = sorted({s.film_id for s in shows})
        out.append({
            "feature_version": VERSION, "film_id": film,
            "title": title, "theater_id": "market", "theater_name": "Seattle AMC market",
            "observation_date": snapshot.isoformat(),
            "upcoming_friday": upcoming_friday.isoformat(),
            "visible_friday": visible.isoformat(),
            "thursday": (upcoming_friday - timedelta(days=1)).isoformat(),
            "split_date": snapshot.isoformat(), "snapshot_kind": "market_v3",
            "segment": segment,
            "segment_provenance": "retrospective_catalog_unverified",
            "source_product_ids": source_ids, "theaters_in_market": sorted(theaters_now),
            "identity_policy": "reviewed_alias" if len(source_ids) > 1 else "source_product",
            **base, **_segment_flags(segment),
        })
    return out
