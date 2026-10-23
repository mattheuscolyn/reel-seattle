#!/usr/bin/env python3
"""Read-only Phase 2 evidence audit for AMC remaining-run forecasting.

The output distinguishes *potential* contamination from proven bad labels.
It never creates AMC snapshots, changes historical ledgers, trains a model,
edits model versions, or publishes predictions. Every row is retained.
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


COLUMNS = (
    "cohort", "film_id", "film_title", "theater_id", "segment",
    "observation_date", "upcoming_friday", "label_horizon_end",
    "bucket", "censored", "known_weeks",
    "observation_coverage", "evidence_state",
    "feature_window_start", "feature_missing_dates",
    "outcome_missing_dates",
    "publication_snapshot", "prepublication_snapshot",
)


def _days(items: Sequence[str]) -> list[date]:
    return sorted({date.fromisoformat(item) for item in items})


def _missing_dates(coverage: Mapping[str, Any]) -> list[date]:
    dates = list(coverage.get("missing_dates", ()))
    dates.extend(item["date"] for item in coverage.get("incomplete_dates", ()))
    return _days(dates)


def _label_window_end(row: Mapping[str, Any]) -> date:
    """End of the 3+ bucket evidence window (Fri through third Thu)."""
    return date.fromisoformat(row["upcoming_friday"]) + timedelta(days=20)


def provenance_row(
    row: Mapping[str, Any],
    *,
    cohort: str,
    missing: Sequence[date],
    dataset_start: date,
    valid_snapshots: set[date],
) -> dict[str, Any]:
    """Classify evidence without silently relabeling a completed engagement.

    This is intentionally conservative. An interrupted observation interval
    means an outcome could have been misclassified; it does NOT prove an exit
    happened then. The feature window is approximate because this historical
    model does not yet persist a complete per-feature source lineage.
    """
    anchor = date.fromisoformat(row["observation_date"])
    label_end = _label_window_end(row)
    age = row.get("days_since_first_show")
    try:
        age_days = max(0, int(float(age)))
    except (ValueError, TypeError, OverflowError):
        age_days = 0
    feature_start = max(dataset_start, anchor - timedelta(days=age_days))
    feature_gaps = [d.isoformat() for d in missing if feature_start <= d <= anchor]
    outcome_gaps = [d.isoformat() for d in missing if anchor < d <= label_end]
    known_anchor = anchor in valid_snapshots
    censored = bool(row["censored"])
    if not known_anchor:
        evidence_state = "untrusted_observation"
    elif feature_gaps or outcome_gaps:
        evidence_state = "potential_gap_exposure"
    elif censored:
        evidence_state = "unresolved_censored"
    else:
        evidence_state = "coverage_clear_not_label_verified"
    return {
        "cohort": cohort,
        "film_id": str(row.get("film_id") or ""),
        "film_title": str(row.get("title") or ""),
        "theater_id": str(row.get("theater_id") or ""),
        "segment": str(row.get("segment") or ""),
        "observation_date": anchor.isoformat(),
        "upcoming_friday": str(row["upcoming_friday"]),
        "label_horizon_end": label_end.isoformat(),
        "bucket": row.get("bucket"),
        "censored": int(censored),
        "known_weeks": row.get("known_weeks"),
        "observation_coverage": "complete" if known_anchor else "missing_or_incomplete",
        "evidence_state": evidence_state,
        "feature_window_start": feature_start.isoformat(),
        "feature_missing_dates": feature_gaps,
        "outcome_missing_dates": outcome_gaps,
        "publication_snapshot": str(row.get("publication_snapshot") or ""),
        "prepublication_snapshot": str(row.get("prepublication_snapshot") or ""),
    }


def audit_label_cohorts(
    partitions: Mapping[str, Sequence[Mapping[str, Any]]],
    coverage: Mapping[str, Any],
    *,
    dataset_start: date,
) -> dict[str, Any]:
    """Full row-level inventory; no affected examples are discarded."""
    missing = _missing_dates(coverage)
    observed = set(_days(coverage.get("snapshot_dates", ())))
    invalid = set(missing)
    valid = observed - invalid
    rows = [
        provenance_row(row, cohort=cohort, missing=missing,
                       dataset_start=dataset_start, valid_snapshots=valid)
        for cohort in ("train", "validation", "holdout")
        for row in partitions.get(cohort, ())
    ]
    counts = Counter(item["evidence_state"] for item in rows)
    by_cohort: dict[str, dict[str, Any]] = {}
    for cohort in ("train", "validation", "holdout"):
        selected = [item for item in rows if item["cohort"] == cohort]
        by_cohort[cohort] = {
            "rows": len(selected),
            "resolved_labels": sum(not item["censored"] for item in selected),
            "censored_labels": sum(bool(item["censored"]) for item in selected),
            "evidence_states": dict(Counter(item["evidence_state"] for item in selected)),
            "feature_gap_exposed": sum(bool(item["feature_missing_dates"]) for item in selected),
            "outcome_gap_exposed": sum(bool(item["outcome_missing_dates"]) for item in selected),
            "resolved_outcome_gap_exposed": sum(
                bool(item["outcome_missing_dates"]) and not item["censored"] for item in selected
            ),
        }
    return {
        "rows": rows,
        "summary": {
            "rows": len(rows),
            "evidence_states": dict(counts),
            "by_cohort": by_cohort,
            "missing_or_incomplete_days": [d.isoformat() for d in missing],
            "caveat": (
                "Coverage-clear is not label-verified. A missing observation is "
                "not an inferred film exit. Feature lineage predating the "
                "observation may extend beyond the approximate film-age window."
            ),
        },
    }


def audit_booking_cycle_baselines(
    cycles: Sequence[Mapping[str, Any]],
    screenings: Sequence[Any],
    snapshots: Sequence[date],
    *,
    as_of: date,
    still_listed: Callable[[Any, date], bool],
) -> dict[str, Any]:
    """Detect retrospective Friday baselines using future Friday show dates.

    The existing build_booking_cycles median includes *all* observed Fridays
    except the target one, including weeks after that target. This independent
    counterfactual uses only Friday dates BEFORE the target programming week.
    """
    played: dict[tuple[str, date], int] = defaultdict(int)
    friday_shows: dict[tuple[str, date], list[Any]] = defaultdict(list)
    for show in screenings:
        if show.canceled or show.removed_before_show:
            continue
        if show.show_date.weekday() == 4 and show.show_date < as_of:
            played[(show.theater_id, show.show_date)] += 1
        if show.show_date.weekday() == 4:
            friday_shows[(show.theater_id, show.show_date)].append(show)

    examples = []
    count_changed_baseline = 0
    count_changed_publication = 0
    count_changed_feature_snapshot = 0
    cycles_with_future_fridays = 0
    first_snapshot = min(snapshots) if snapshots else as_of
    for cycle in cycles:
        theater_id = str(cycle["theater_id"])
        upcoming = date.fromisoformat(str(cycle["upcoming_friday"]))
        past = [count for (tid, friday), count in played.items()
                if tid == theater_id and friday < upcoming]
        future = [count for (tid, friday), count in played.items()
                  if tid == theater_id and friday > upcoming]
        if future:
            cycles_with_future_fridays += 1
        past_typical = float(statistics.median(past)) if past else 0.0
        historical_typical = float(cycle.get("typical_friday_volume") or 0.0)
        changed_baseline = abs(past_typical - historical_typical) > 0.055
        if changed_baseline:
            count_changed_baseline += 1
        window = [d for d in snapshots
                  if max(first_snapshot, upcoming - timedelta(days=8)) <= d < upcoming]
        counterfactual_50 = ""
        counterfactual_80 = ""
        if past_typical:
            for snap in window:
                count = sum(still_listed(show, snap) for show in friday_shows[(theater_id, upcoming)])
                if not counterfactual_50 and count >= 0.50 * past_typical:
                    counterfactual_50 = snap.isoformat()
                if not counterfactual_80 and count >= 0.80 * past_typical:
                    counterfactual_80 = snap.isoformat()
        original_80 = str(cycle.get("date_80") or "")
        changed_publication = counterfactual_80 != original_80
        if changed_publication:
            count_changed_publication += 1
        counterfactual_pub = counterfactual_80 or counterfactual_50
        counterfactual_pre = max(
            (snap for snap in snapshots if snap < date.fromisoformat(counterfactual_pub)),
            default=None,
        ) if counterfactual_pub else None
        counterfactual_pre_iso = counterfactual_pre.isoformat() if counterfactual_pre else ""
        changed_features = counterfactual_pre_iso != (cycle.get("prepublication_snapshot") or "")
        if changed_features:
            count_changed_feature_snapshot += 1
        if (changed_baseline or changed_publication or changed_features) and len(examples) < 100:
            examples.append({
                "theater_id": theater_id,
                "upcoming_friday": upcoming.isoformat(),
                "original_baseline": historical_typical,
                "past_only_baseline": past_typical,
                "future_fridays_used_by_original": len(future),
                "original_date_80": original_80,
                "past_only_date_80": counterfactual_80,
                "original_prepublication_snapshot": cycle.get("prepublication_snapshot") or "",
                "past_only_prepublication_snapshot": counterfactual_pre_iso,
            })
    return {
        "cycles": len(cycles),
        "cycles_with_later_fridays_available_to_original": cycles_with_future_fridays,
        "cycles_with_changed_past_only_baseline": count_changed_baseline,
        "cycles_with_changed_80pct_publication_date": count_changed_publication,
        "cycles_with_changed_prepublication_snapshot": count_changed_feature_snapshot,
        "examples": examples,
        "caveat": (
            "A changed historical publication date is point-in-time contamination "
            "of the booking-cycle selection procedure, not proof a particular "
            "film's outcome label was wrong. Do not change the frozen benchmark."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/audits/leaving_soon_phase2_evidence.json"))
    parser.add_argument("--csv", type=Path, default=Path("data/audits/leaving_soon_phase2_rows.csv"))
    args = parser.parse_args()

    from reel_seattle.analysis.leaving_soon_feature_value import load_bundle, still_listed
    from reel_seattle.analysis.leaving_soon_prepublication_survival import (
        _split, build_booking_cycles, build_observations,
    )
    from reel_seattle.analysis.remaining_run_shadow import snapshot_coverage
    from reel_seattle.analysis.leaving_soon_feature_expansion import (
        enrich_observations, load_stable_metadata,
    )

    root = args.root.resolve()
    bundle = load_bundle(root)
    coverage = snapshot_coverage(root, since=bundle.dataset_start)
    # Use only source=amc and completeness=complete dates as valid evidence.
    from reel_seattle.analysis.leaving_soon_scheduling_assumptions import load_snapshot_infos
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    coverage["snapshot_dates"] = [
        item.snapshot_date.isoformat() for item in statuses
        if item.completeness == "complete"
    ]
    cycles = build_booking_cycles(
        bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of
    )
    primary = build_observations(bundle, cycles, kind="before_80")
    enrich_observations(primary, bundle.screenings, load_stable_metadata(root), {}, bundle.dataset_start)
    classified = audit_label_cohorts(
        _split(primary), coverage, dataset_start=bundle.dataset_start
    )
    retrospective = audit_booking_cycle_baselines(
        cycles, bundle.screenings, bundle.snapshot_dates,
        as_of=bundle.as_of, still_listed=still_listed,
    )
    report = {
        "schema_version": 1,
        "source": "AMC screening lifecycle + AMC snapshot statuses",
        "as_of": bundle.as_of.isoformat(),
        "snapshot_coverage": {k: v for k, v in coverage.items() if k != "snapshot_dates"},
        "labels": classified["summary"],
        "booking_cycle_point_in_time_audit": retrospective,
        "effect_on_production": "none; read-only research",
        "decision": "Do not retrain, relabel, or promote a model on the basis of this audit alone.",
    }
    out = (root / args.output).resolve()
    csv_out = (root / args.csv).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    csv_out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with csv_out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        for item in classified["rows"]:
            writer.writerow({
                key: ";".join(val) if isinstance(val, list) else val
                for key, val in item.items()
            })
    print(json.dumps({
        "as_of": report["as_of"],
        "coverage": {k: coverage[k] for k in ("expected_days", "observed_days", "missing_count", "incomplete_count")},
        "labels": classified["summary"],
        "booking_cycle_point_in_time_audit": {
            k: v for k, v in retrospective.items() if k != "examples"
        },
        "report": str(out),
        "row_level_csv": str(csv_out),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
