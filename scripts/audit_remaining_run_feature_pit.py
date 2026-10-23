#!/usr/bin/env python3
"""Audit historical feature provenance and market as-of synchronization.

Read only. This tests whether selected model features are invariant to future-
first-seen screenings, and whether every market aggregate could have existed
on its recorded feature date. It deliberately reports *unproven* provenance
for mutable cancellations/segments and incomplete legacy snapshot days.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_feature_value import still_listed
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    _film_features, _week_screenings, time_block,
)
from reel_seattle.analysis.remaining_run_shadow import selected_feature_names
from scripts.evaluate_remaining_run_calendar_v2 import _point_in_time_rows

PROVENANCE_VERSION = "remaining_run_pit_feature_audit_v1"
INVARIANT = set(selected_feature_names()) - {
    "market_theater_count", "market_screenings", "strongest_theater_screenings",
    "weakest_theater_screenings", "theaters_at_minimal", "share_theaters_declining",
    "theater_count_wow", "market_screenings_wow", "next_week_titles_already_listed",
    "segment_rerelease", "segment_special", "segment_access", "segment_other",
}


def _equal(a: Any, b: Any) -> bool:
    if isinstance(a, (float, int)) and isinstance(b, (float, int)):
        return (math.isnan(float(a)) and math.isnan(float(b))) or math.isclose(
            float(a), float(b), rel_tol=1e-9, abs_tol=1e-9,
        )
    return a == b


def synchronized_market_features(
    screenings: Sequence,
    film_id: str,
    upcoming_friday: date,
    as_of: date,
    *,
    theater_ids: Sequence[str] | None = None,
) -> dict[str, float]:
    """Compute film's simultaneous market footprint from ONE historical date.

    This replaces the asynchronous aggregate's cross-theater date mixture. It
    uses no show that was first observed after as_of, and no show announced
    after the date under the standard AMC visibility semantics.
    """
    visible = upcoming_friday - timedelta(days=7)
    theaters = set(theater_ids) if theater_ids is not None else None
    current = defaultdict(list)
    prior = defaultdict(list)
    for show in screenings:
        if show.film_id != film_id or (theaters is not None and show.theater_id not in theaters):
            continue
        if not still_listed(show, as_of):
            continue
        if visible <= show.show_date < upcoming_friday:
            current[show.theater_id].append(show)
        elif visible - timedelta(days=7) <= show.show_date < visible:
            prior[show.theater_id].append(show)
    counts = [len(v) for v in current.values()]
    past_counts = [len(v) for v in prior.values()]
    declining = 0
    for theater, shows in current.items():
        earlier = len(prior.get(theater, ()))
        if earlier and len(shows) < earlier:
            declining += 1
    return {
        "current_week_screenings": float(sum(counts)),
        "market_theater_count": float(len(counts)),
        "market_screenings": float(sum(counts)),
        "strongest_theater_screenings": float(max(counts)) if counts else 0.0,
        "weakest_theater_screenings": float(min(counts)) if counts else 0.0,
        "theaters_at_minimal": float(sum(count <= 2 for count in counts)),
        "share_theaters_declining": (declining / len(counts)) if counts else float("nan"),
        "theater_count_wow": float(len(counts) - len(past_counts)),
        "market_screenings_wow": float(sum(counts) - sum(past_counts)),
    }


def audit_feature_invariance(bundle, rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Recalculate the direct, local feature family with unseen future removed."""
    pairs = defaultdict(list)
    for show in bundle.screenings:
        pairs[(show.film_id, show.theater_id)].append(show)
    changes = Counter()
    investigated = Counter()
    examples = []
    after_date_counts = Counter()
    for row in rows:
        when = date.fromisoformat(row["observation_date"])
        visible = date.fromisoformat(row["visible_friday"])
        upcoming = date.fromisoformat(row["upcoming_friday"])
        shows = pairs[(row["film_id"], row["theater_id"])]
        visible_shows = [show for show in shows if show.first_snapshot <= when]
        future_first_seen = [show for show in shows if show.first_snapshot > when]
        if future_first_seen:
            after_date_counts["rows_with_future_first_seen_screenings"] += 1
            after_date_counts["future_first_seen_screening_exposures"] += len(future_first_seen)
        # The original _film_features construction does not use peers, so
        # match the same static inputs and ask whether unobserved future rows
        # influence its outputs. Cross-theater features are audited separately.
        kw = {
            "snapshot": when,
            "visible_friday": visible,
            "next_friday": upcoming,
            "first_show": visible - timedelta(days=max(0, int(row["days_since_first_show"]))),
            "dataset_start": bundle.dataset_start,
            "left_truncated": bool(row["left_truncated"]),
            "theater_total": 1,
            "rank": 1,
            "theater_baseline": 1.0,
            "peers": (),
        }
        all_features = _film_features(shows, **kw)
        pruned_features = _film_features(visible_shows, **kw)
        for name in sorted(INVARIANT):
            if name not in all_features:
                continue
            investigated[name] += 1
            if not _equal(all_features[name], pruned_features[name]):
                changes[name] += 1
                if len(examples) < 25:
                    examples.append({
                        "film": row["title"], "theater": row["theater_id"],
                        "forecast_date": row["observation_date"],
                        "feature": name, "full": all_features[name],
                        "pruned": pruned_features[name],
                    })
    return {
        "rows": len(rows),
        "direct_local_features_checked": len(investigated),
        "comparisons": sum(investigated.values()),
        "features_with_future_first_seen_dependency": dict(changes),
        "future_record_exposure": dict(after_date_counts),
        "counterexamples": examples,
        "limitation": (
            "This is a controlled future-first-seen perturbation, not a proof that "
            "eventual cancellation, segment classification, opening metadata, "
            "engagement origins, market peers, or legacy snapshot quality are PIT safe."
        ),
    }


def audit_market_as_of(bundle, rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    by_week = defaultdict(list)
    for row in rows:
        by_week[(row["film_id"], row["upcoming_friday"])].append(row)
    # Pre-index showtimes to avoid a full scan for every film/week cohort.
    by_film = defaultdict(list)
    for show in bundle.screenings:
        by_film[show.film_id].append(show)
    count = Counter()
    time_gaps = Counter()
    differences = Counter()
    examples = []
    by_row = {}
    all_anchors = []
    for (film, friday), peers in by_week.items():
        anchor = min(row["observation_date"] for row in peers)
        unique_snapshots = sorted(set(row["observation_date"] for row in peers))
        if len(unique_snapshots) > 1:
            count["mixed_snapshot_film_weeks"] += 1
            time_gaps[str((date.fromisoformat(unique_snapshots[-1]) - date.fromisoformat(anchor)).days)] += 1
        count["market_film_weeks"] += 1
        selected = next(row for row in peers if row["observation_date"] == anchor)
        actual = synchronized_market_features(
            by_film[film], film, date.fromisoformat(friday), date.fromisoformat(anchor),
            theater_ids=tuple(bundle.theater_names),
        )
        baseline = {
            "market_screenings": float(selected["market_screenings"]),
            "market_theater_count": float(selected["market_theater_count"]),
            "theater_count_wow": float(selected["theater_count_wow"]),
            "market_screenings_wow": float(selected["market_screenings_wow"]),
        }
        changed = [key for key in baseline if not _equal(baseline[key], actual[key])]
        if changed:
            count["as_of_market_footprint_differs"] += 1
            for key in changed:
                differences[key] += 1
            if len(examples) < 35:
                examples.append({
                    "film": selected["title"], "friday": friday,
                    "selected_anchor": anchor, "peer_snapshots": unique_snapshots,
                    "original_market_screenings": baseline["market_screenings"],
                    "as_of_market_screenings": actual["market_screenings"],
                    "original_theaters": baseline["market_theater_count"],
                    "as_of_theaters": actual["market_theater_count"],
                    "different_features": changed,
                })
        key = (film, friday)
        by_row[key] = actual
        all_anchors.append(anchor)
    return {
        "counts": dict(count),
        "mixed_snapshot_day_spreads": dict(time_gaps),
        "original_vs_single_snapshot_mismatch": dict(differences),
        "examples": examples,
        "paired_market_feature_corrections": by_row,
        "caveat": (
            "The synchronized reconstruction uses the single earliest film/week "
            "snapshot and recalculates weekly footprint from available AMC listings. "
            "Prior-week comparison uses listings visible on the same anchor. It is a "
            "diagnostic comparator, not a certified complete live market feature set."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/audits/remaining_run_feature_pit_audit.json"))
    args = parser.parse_args()
    root = args.root.resolve()
    bundle, rows = _point_in_time_rows(root)
    direct = audit_feature_invariance(bundle, rows)
    market = audit_market_as_of(bundle, rows)
    market.pop("paired_market_feature_corrections")
    result = {
        "audit_version": PROVENANCE_VERSION,
        "as_of": bundle.as_of.isoformat(),
        "direct_local": direct, "market": market,
        "proven_pit_safe": False,
        "known_uncertainties": [
            "Engagement origin, left truncation and film segment are reconstructed using eventual runs.",
            "Global canceled flag has no cancellation timestamp; historical pre-cancellation visibility cannot be certified.",
            "AMC older complete-status metadata is unknown for early training snapshots.",
            "Market aggregation previously mixes theaters with different forecast observation dates.",
            "Historical week totals and historical snapshot denominators require separate visibility checks.",
            "Opening and metadata enrichment from the later catalog is excluded from this audit.",
        ],
        "decision": "Do not certify all historical features or promote a model until remaining uncertainties are resolved.",
    }
    out = (root / args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
