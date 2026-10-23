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
import gzip
from dataclasses import replace
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



def audit_hindsight_history(bundle, rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Test direct historical maturity and theater baseline leakage.

    build_observations computes theater historical-week counts from the final
    lifecycle without conditioning on screening.first_snapshot <= observation.
    Its engagement origin also comes from the eventual segmented calendar.
    """
    by_theater = defaultdict(list)
    by_pair = defaultdict(list)
    for show in bundle.screenings:
        by_theater[show.theater_id].append(show)
        by_pair[(show.film_id, show.theater_id)].append(show)
    from reel_seattle.analysis.leaving_soon_scheduling_assumptions import programming_week_friday
    from reel_seattle.analysis.leaving_soon_prepublication_survival import _cover
    engagement_pairs = defaultdict(list)
    for engagement in bundle.film_theater:
        engagement_pairs[(engagement.film_id, engagement.theater_id)].append(engagement)
    counters = Counter()
    examples = []
    for row in rows:
        when = date.fromisoformat(row["observation_date"])
        visible = date.fromisoformat(row["visible_friday"])
        friday_baseline_before = defaultdict(int)
        friday_baseline_asof = defaultdict(int)
        late_history = 0
        for show in by_theater[row["theater_id"]]:
            if show.canceled or show.removed_before_show or show.show_date >= visible or show.show_date >= bundle.as_of:
                continue
            friday_week = programming_week_friday(show.show_date)
            friday_baseline_before[friday_week] += 1
            if show.first_snapshot <= when:
                friday_baseline_asof[friday_week] += 1
            else:
                late_history += 1
        import statistics
        before = float(statistics.median(friday_baseline_before.values())) if friday_baseline_before else 0.0
        after = float(statistics.median(friday_baseline_asof.values())) if friday_baseline_asof else 0.0
        if late_history:
            counters["observations_with_later_discovered_historical_showtimes"] += 1
            counters["later_discovered_past_showtime_exposures"] += late_history
        if not _equal(before, after):
            counters["observations_with_hindsight_theater_baseline_change"] += 1
            if len(examples) < 20:
                examples.append({
                    "type": "historical_theater_baseline", "film": row["title"],
                    "theater": row["theater_id"], "forecast_date": row["observation_date"],
                    "full_history_baseline": before, "asof_baseline": after,
                    "late_discovered_past_showtimes": late_history,
                })
        engagement = _cover(
            engagement_pairs.get((row["film_id"], row["theater_id"]), ()),
            visible, visible + timedelta(days=6),
        )
        if engagement is not None:
            visible_dates = [
                show.show_date
                for show in engagement.screenings if still_listed(show, when)
            ]
            if visible_dates and engagement.start_date < min(visible_dates):
                counters["observations_with_unwitnessed_eventual_run_start"] += 1
                if len(examples) < 30:
                    examples.append({
                        "type": "eventual_run_start",
                        "film": row["title"], "theater": row["theater_id"],
                        "forecast_date": row["observation_date"],
                        "eventual_run_start": engagement.start_date.isoformat(),
                        "earliest_show_visible_then": min(visible_dates).isoformat(),
                    })
    return {
        "rows": len(rows), "counts": dict(counters), "examples": examples,
        "interpretation": (
            "A changed historical theater baseline is direct lookahead in "
            "theater_week_vs_baseline, which is in the selected feature list. "
            "An unwitnessed run start is a provenance gap in maturity features; "
            "it may be a late source backfill rather than a false event date."
        ),
    }



def load_cancellation_dates(root: Path) -> dict[str, date]:
    """Restore the dated cancellation events discarded by the Screening loader."""
    path = root / "data/history/screening_lifecycle.jsonl.gz"
    dates: dict[str, date] = {}
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        next(fh)  # header
        for line in fh:
            item = json.loads(line)
            if item.get("source") != "amc" or not item.get("cancelled_at"):
                continue
            when = str(item["cancelled_at"])[:10]
            try:
                dates[str(item["screening_id"])] = date.fromisoformat(when)
            except ValueError:
                continue
    return dates


def audit_cancelled_after_forecast(
    bundle,
    rows: Sequence[Mapping[str, Any]],
    cancellations: Mapping[str, date],
) -> dict[str, Any]:
    """Prove whether eventual canceled flags alter earlier direct features.

    Restoring only a *later-dated* cancellation is safe, unless a separate
    known earlier removal remains. This is distinct from future-first-seen
    screening censoring and demonstrates source-event lookahead.
    """
    pairs = defaultdict(list)
    for show in bundle.screenings:
        pairs[(show.film_id, show.theater_id)].append(show)
    impacted = Counter()
    changed_features = Counter()
    examples = []
    for row in rows:
        when = date.fromisoformat(row["observation_date"])
        restored = 0
        replay_shows = []
        original = pairs[(row["film_id"], row["theater_id"])]
        for show in original:
            canceled_at = cancellations.get(show.screening_id)
            if (
                show.canceled and canceled_at is not None
                and show.first_snapshot <= when < canceled_at
                and not (show.removed_at is not None and show.removed_at <= when)
            ):
                replay_shows.append(replace(
                    show, canceled=False, removed_before_show=False,
                ))
                restored += 1
            else:
                replay_shows.append(show)
        if not restored:
            continue
        impacted["film_theater_forecasts_with_future_cancellation"] += 1
        impacted["later_canceled_screening_exposures"] += restored
        anchor = date.fromisoformat(row["visible_friday"])
        upcoming = date.fromisoformat(row["upcoming_friday"])
        kw = dict(
            snapshot=when, visible_friday=anchor,
            next_friday=upcoming,
            first_show=when - timedelta(days=max(0, int(row["days_since_first_show"]))),
            dataset_start=bundle.dataset_start,
            left_truncated=bool(row["left_truncated"]),
            theater_total=1, rank=1, theater_baseline=1.0, peers=(),
        )
        before = _film_features(original, **kw)
        after = _film_features(replay_shows, **kw)
        diffs = [
            key for key in sorted(INVARIANT) if key in before and not _equal(before[key], after[key])
        ]
        if diffs:
            impacted["forecasts_with_changed_direct_model_features"] += 1
            for key in diffs:
                changed_features[key] += 1
            if len(examples) < 25:
                examples.append({
                    "film": row["title"], "theater": row["theater_id"],
                    "date": row["observation_date"],
                    "later_cancelled_showtimes": restored,
                    "changed_features": diffs,
                    "before_current_week_screenings": before["current_week_screenings"],
                    "after_current_week_screenings": after["current_week_screenings"],
                })
    return {
        "source_ledger_cancelled_show_ids": len(cancellations),
        "counts": dict(impacted),
        "changed_model_feature_counts": dict(changed_features),
        "examples": examples,
        "limitation": (
            "This reverses only cancellations explicitly dated AFTER the "
            "forecast and not already removed before it; multiple-stage "
            "status transitions or undated per-theater feed failures remain "
            "unverifiable from final lifecycle rows alone."
        ),
    }



def audit_source_identity_splits(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Flag same-title/Friday source-ID splits without assuming equivalence.

    These can be legitimate different AMC products (e.g. event screenings).
    A source ID is not automatically a canonical film ID for market scope.
    """
    groups = defaultdict(dict)
    for row in rows:
        title = " ".join(str(row["title"]).casefold().split())
        key = (title, row["upcoming_friday"])
        groups[key].setdefault(str(row["film_id"]), row)
    splits = [(key, ids) for key, ids in groups.items() if len(ids) > 1]
    return {
        "title_friday_groups": len(groups),
        "multi_source_id_title_friday_groups": len(splits),
        "additional_source_ids_in_splits": sum(len(ids) - 1 for _, ids in splits),
        "examples": [
            {
                "title": key[0], "upcoming_friday": key[1],
                "source_ids": list(ids),
                "segments": [r.get("segment") for r in ids.values()],
                "theaters_represented": [r.get("market_theater_count") for r in ids.values()],
            }
            for key, ids in splits[:25]
        ],
        "limitation": (
            "These are title collisions requiring canonical-identity and "
            "event-product review. Do not merge automatically: screenings "
            "of separate products can legitimately share a title."
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
    identity = audit_source_identity_splits(rows)
    hindsight = audit_hindsight_history(bundle, rows)
    cancellation = audit_cancelled_after_forecast(
        bundle, rows, load_cancellation_dates(root),
    )
    market.pop("paired_market_feature_corrections")
    result = {
        "audit_version": PROVENANCE_VERSION,
        "as_of": bundle.as_of.isoformat(),
        "direct_local": direct, "historical_origin_and_baselines": hindsight,
        "future_cancellation": cancellation,
        "market": market, "potential_market_identity_splits": identity,
        "proven_pit_safe": False,
        "known_uncertainties": [
            "Engagement origin, left truncation and film segment are reconstructed using eventual runs.",
            "Global Screening.canceled loses the source ledger cancelled_at timestamp; dated source cancellations require time-aware reconstruction.",
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
