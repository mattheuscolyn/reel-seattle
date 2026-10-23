#!/usr/bin/env python3
"""Reconstruct point-in-time-safe remaining-run labels (research only).

A "run" is the existing film × theater (or market) engagement segmented on
>=14 consecutive dark performance dates. The outcome is the programming week
containing the LAST elapsed screening in that engagement, not the number of
uninterrupted weeks having showtimes. An empty Fri–Thu does not end the run
if screenings resume inside the same engagement.

Strict labels require complete source snapshots. Older unknown-completeness
AMC logs can independently corroborate a *provisional* label, never a strict
one. Missing days cannot corroborate an exit. All uncertain outcomes are
right-censored, retaining only evidenced survival weeks.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    CONFIRMED, Engagement, SnapshotInfo, programming_week_friday,
    load_snapshot_infos,
)
from reel_seattle.analysis.leaving_soon_feature_value import load_bundle
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    _cover, _split, build_booking_cycles, build_observations,
)
from scripts.audit_leaving_soon_phase2_evidence import audit_booking_cycle_baselines
from scripts.audit_leaving_soon_run_endings import ScheduleEvidence, _end_evidence


SCHEMA_VERSION = "remaining_run_labels_v2_audit"
COLUMNS = (
    "sample_source", "cohort", "film_id", "title", "theater_id",
    "upcoming_friday", "observation_date", "observation_quality",
    "grain", "run_start", "original_bucket", "original_censored",
    "original_known_weeks", "calendar_weeks_until_run_end",
    "corrected_bucket", "corrected_censored", "corrected_known_weeks",
    "evidence_tier", "evidence_reason", "terminal_show",
    "terminal_show_snapshot", "following_week_snapshot",
    "supporting_elapsed_screening", "actual_missing_dates",
    "label_changed", "next_engagement_show",
)


def calendar_remaining_weeks(last_show: date, upcoming_friday: date) -> int:
    """0=no showing from next Friday; n=last playing week index + 1.

    Unlike consecutive-week counts, an intervening week with no showtimes
    does not erase known continuation inside a still-unified engagement.
    """
    if last_show < upcoming_friday:
        return 0
    return (programming_week_friday(last_show) - upcoming_friday).days // 7 + 1


def eligible_legacy_days(
    statuses: Sequence[SnapshotInfo],
    *,
    as_of: date,
) -> tuple[set[date], set[date]]:
    """Separate defensible recorded pre-metadata scrapes from complete scrapes."""
    by_date = {status.snapshot_date: status for status in statuses if status.snapshot_date <= as_of}
    complete = {
        day for day, info in by_date.items()
        if info.completeness == "complete"
    }
    legacy = {
        day for day, info in by_date.items()
        if info.completeness == "unknown"
        and info.record_count > 0
        and info.reason == "restate_safe_missing_with_records"
    }
    return complete, legacy - complete


def uncovered_days(
    start: date,
    end: date,
    covered: set[date],
) -> set[date]:
    if start > end:
        return set()
    return {
        start + timedelta(days=n)
        for n in range((end - start).days + 1)
        if start + timedelta(days=n) not in covered
    }


def observed_survival(
    engagement: Engagement,
    schedule: ScheduleEvidence,
    upcoming: date,
    *,
    as_of: date,
) -> tuple[int, str, str]:
    """Return a lower bound on surviving calendar weeks supported by shows."""
    supported: list[tuple[date, date]] = []
    for show in engagement.screenings:
        if show.show_date < upcoming or show.show_date >= as_of:
            continue
        witness = schedule._complete_on_or_before_show(show)
        if witness is not None:
            supported.append((show.show_date, witness))
    if not supported:
        return 0, "", ""
    last, witness = max(supported, key=lambda pair: pair[0])
    return calendar_remaining_weeks(last, upcoming), last.isoformat(), witness.isoformat()


def _engagement_index(items: Sequence[Engagement], *, market: bool = False):
    grouped = defaultdict(list)
    for engagement in items:
        key = engagement.film_id if market else (engagement.film_id, engagement.theater_id)
        grouped[key].append(engagement)
    return grouped


def _find(row, grouped, *, market: bool):
    visible = date.fromisoformat(row["visible_friday"])
    key = row["film_id"] if market else (row["film_id"], row["theater_id"])
    return _cover(grouped.get(key, ()), visible, visible + timedelta(days=6))


def _exit_evidence(
    original: Mapping[str, Any],
    engagement: Engagement,
    *,
    bucket: int,
    schedule: ScheduleEvidence,
    uncovered: set[date],
    as_of: date,
    market: bool,
) -> Mapping[str, Any]:
    patched = dict(original)
    prefix = "market_" if market else ""
    patched[prefix + "bucket"] = bucket
    patched[prefix + "censored"] = 0
    return _end_evidence(
        patched, engagement, schedule, uncovered, as_of=as_of, market=market,
    )


def reconstruct_one(
    row: Mapping[str, Any],
    *,
    engagement: Engagement | None,
    grain: str,
    strict_schedule: ScheduleEvidence,
    provisional_schedule: ScheduleEvidence,
    strict_dates: set[date],
    provisional_dates: set[date],
    dataset_start: date,
    as_of: date,
) -> dict[str, Any]:
    """Never call a missing/imprecise observation a verified completed exit."""
    market = grain == "market"
    original_prefix = "market_" if market else ""
    original_bucket = row.get(original_prefix + "bucket")
    original_censored = bool(row.get(original_prefix + "censored", 1))
    original_known = row.get(original_prefix + "known_weeks")
    observation = date.fromisoformat(row["observation_date"])
    upcoming = date.fromisoformat(row["upcoming_friday"])
    is_strict_observation = observation in strict_dates
    is_legacy_observation = observation in provisional_dates
    obs_quality = (
        "complete" if is_strict_observation else
        "legacy_recorded_unverified" if is_legacy_observation else
        "missing_or_unusable"
    )
    base = {
        "film_id": row["film_id"],
        "title": row.get("title") or "",
        "theater_id": row.get("theater_id") or "",
        "upcoming_friday": upcoming.isoformat(),
        "observation_date": observation.isoformat(),
        "observation_quality": obs_quality,
        "grain": grain,
        "run_start": engagement.start_date.isoformat() if engagement else "",
        "original_bucket": original_bucket,
        "original_censored": int(original_censored),
        "original_known_weeks": original_known,
        "calendar_weeks_until_run_end": None,
        "corrected_bucket": None,
        "corrected_censored": 1,
        "corrected_known_weeks": 0,
        "evidence_tier": "unresolved",
        "evidence_reason": "",
        "terminal_show": "",
        "terminal_show_snapshot": "",
        "following_week_snapshot": "",
        "supporting_elapsed_screening": "",
        "actual_missing_dates": "",
        "label_changed": 0,
        "next_engagement_show": "",
    }
    def finish():
        old_state = (original_bucket, int(original_censored))
        new_state = (base["corrected_bucket"], base["corrected_censored"])
        base["label_changed"] = int(old_state != new_state)
        return base
    if engagement is None:
        base["evidence_reason"] = "no_matching_historical_run"
        return finish()
    if obs_quality == "missing_or_unusable":
        base["evidence_reason"] = "no_reliable_observation_snapshot"
        return finish()

    if engagement.last_occurred is not None:
        base["terminal_show"] = engagement.last_occurred.isoformat()
        base["calendar_weeks_until_run_end"] = calendar_remaining_weeks(
            engagement.last_occurred, upcoming,
        )

    strict_week, strict_show, strict_witness = observed_survival(
        engagement, strict_schedule, upcoming, as_of=as_of,
    )
    legacy_week, legacy_show, legacy_witness = observed_survival(
        engagement, provisional_schedule, upcoming, as_of=as_of,
    )
    base["corrected_known_weeks"] = strict_week if is_strict_observation else legacy_week
    base["supporting_elapsed_screening"] = strict_show or legacy_show
    base["terminal_show_snapshot"] = strict_witness or legacy_witness

    # If we have witnessed survival into the third (or later) future week,
    # the 3+ bucket is a certain positive, independent of eventual closing.
    if strict_week >= 3:
        base.update(
            corrected_bucket=3, corrected_censored=0,
            corrected_known_weeks=strict_week,
            evidence_tier="strict" if is_strict_observation else "provisional_legacy",
            evidence_reason="witnessed_elapsed_show_in_third_or_later_future_week",
        )
        return finish()
    if legacy_week >= 3:
        base.update(
            corrected_bucket=3, corrected_censored=0,
            corrected_known_weeks=legacy_week,
            evidence_tier="provisional_legacy",
            evidence_reason="third_or_later_week_witnessed_only_by_legacy_logs",
        )
        return finish()

    if engagement.last_occurred is None:
        base["evidence_reason"] = "no_elapsed_show"
        return finish()

    corrected_weeks = base["calendar_weeks_until_run_end"]
    if corrected_weeks >= 3:
        # The eventual ledger suggests a 3+ run, but no sufficiently
        # trustworthy witnessed third-week show supports a resolved target.
        base["evidence_reason"] = "third_week_not_witnessed_by_usable_snapshot"
        return finish()

    if engagement.end_status != CONFIRMED:
        base["evidence_reason"] = "end_of_run_censored_or_at_publication_frontier"
        return finish()

    # Strict completion uses only officially complete snapshot days.
    strict_gap = uncovered_days(
        max(dataset_start, engagement.last_occurred), upcoming + timedelta(days=7 * corrected_weeks),
        strict_dates,
    )
    strict = _exit_evidence(
        row, engagement, bucket=corrected_weeks, schedule=strict_schedule,
        uncovered=strict_gap, as_of=as_of, market=market,
    )
    if strict["verdict"] == "supported_exit":
        base.update(
            corrected_bucket=corrected_weeks, corrected_censored=0,
            evidence_tier="strict" if is_strict_observation else "provisional_legacy",
            evidence_reason="full_following_week_and_terminal_show_witnessed_on_complete_amc_snapshots",
            following_week_snapshot=(strict.get("schedule") or {}).get("snapshot") or "",
            terminal_show_snapshot=strict.get("last_observed_on") or "",
        )
        return finish()

    # Pre-Sept historical scrapes recorded screenings but did not store
    # restate_safe. Let these corroborate only a PROVISIONAL exit; never
    # pretend the old unknown-completeness feed is independently complete.
    available = strict_dates | provisional_dates
    legacy_gap = uncovered_days(
        max(dataset_start, engagement.last_occurred), upcoming + timedelta(days=7 * corrected_weeks),
        available,
    )
    provisional = _exit_evidence(
        row, engagement, bucket=corrected_weeks, schedule=provisional_schedule,
        uncovered=legacy_gap, as_of=as_of, market=market,
    )
    if provisional["verdict"] == "supported_exit":
        base.update(
            corrected_bucket=corrected_weeks, corrected_censored=0,
            evidence_tier="provisional_legacy",
            evidence_reason="terminal_show_and_later_published_schedule_witnessed_using_unverified_legacy_amc_snapshots",
            following_week_snapshot=(provisional.get("schedule") or {}).get("snapshot") or "",
            terminal_show_snapshot=provisional.get("last_observed_on") or "",
        )
    else:
        base["evidence_reason"] = provisional["verdict"] + ": " + provisional.get("reason", "")
        base["actual_missing_dates"] = ";".join(provisional.get("bad_dates") or ())
        base["next_engagement_show"] = provisional.get("next_engagement_show") or ""
    return finish()


def reconstruct_rows(
    rows: Sequence[Mapping[str, Any]],
    *,
    bundle,
    statuses: Sequence[SnapshotInfo],
    sample_source: str,
) -> list[dict[str, Any]]:
    strict, legacy = eligible_legacy_days(statuses, as_of=bundle.as_of)
    strict_schedule = ScheduleEvidence(bundle.screenings, sorted(strict))
    legacy_schedule = ScheduleEvidence(bundle.screenings, sorted(strict | legacy))
    theater_index = _engagement_index(bundle.film_theater)
    market_index = _engagement_index(bundle.market, market=True)
    reconstructed = []
    for cohort, part in _split(rows).items():
        for row in part:
            for grain, index in (("theater", theater_index), ("market", market_index)):
                eng = _find(row, index, market=(grain == "market"))
                result = reconstruct_one(
                    row, engagement=eng, grain=grain,
                    strict_schedule=strict_schedule,
                    provisional_schedule=legacy_schedule,
                    strict_dates=strict, provisional_dates=legacy,
                    dataset_start=bundle.dataset_start,
                    as_of=bundle.as_of,
                )
                reconstructed.append({"sample_source": sample_source, "cohort": cohort, **result})
    return reconstructed


def summarize(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    return {
        "rows": len(rows),
        "by_sample_source_and_grain": {
            source + ":" + grain: {
                "rows": len(items),
                "evidence_tier": dict(Counter(x["evidence_tier"] for x in items)),
                "corrected_bucket": dict(Counter(str(x["corrected_bucket"]) for x in items)),
                "labels_changed": sum(x["label_changed"] for x in items),
                "original_resolved": sum(not x["original_censored"] for x in items),
                "corrected_resolved": sum(not x["corrected_censored"] for x in items),
                "changed_resolved_bucket": sum(
                    x["label_changed"] and not x["original_censored"] and not x["corrected_censored"]
                    for x in items
                ),
                "unresolved_reasons": dict(Counter(
                    x["evidence_reason"].split(":")[0] for x in items if x["corrected_censored"]
                )),
                "by_cohort": {
                    cohort: {
                        "rows": len(chunk),
                        "strict": sum(x["evidence_tier"] == "strict" for x in chunk),
                        "provisional_legacy": sum(x["evidence_tier"] == "provisional_legacy" for x in chunk),
                        "unresolved": sum(x["corrected_censored"] for x in chunk),
                        "changed": sum(x["label_changed"] for x in chunk),
                    }
                    for cohort in ("train", "validation", "holdout")
                    for chunk in [[x for x in items if x["cohort"] == cohort]]
                },
            }
            for source in ("original_selection", "chronological_selection")
            for grain in ("theater", "market")
            for items in [[x for x in rows if x["sample_source"] == source and x["grain"] == grain]]
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/audits/leaving_soon_reconstructed_labels.json"))
    parser.add_argument("--csv", type=Path, default=Path("data/audits/leaving_soon_reconstructed_labels_rows.csv"))
    args = parser.parse_args()
    root = args.root.resolve()
    bundle = load_bundle(root)
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    cycles = build_booking_cycles(
        bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of
    )
    original_rows = build_observations(bundle, cycles, kind="before_80")
    retrospective = audit_booking_cycle_baselines(
        cycles, bundle.screenings, bundle.snapshot_dates,
        as_of=bundle.as_of, still_listed=__import__(
            "reel_seattle.analysis.leaving_soon_feature_value",
            fromlist=["still_listed"]
        ).still_listed,
    )
    chronological_rows = build_observations(
        bundle, retrospective["counterfactual_cycles"], kind="before_80",
    )
    data = [
        *reconstruct_rows(original_rows, bundle=bundle, statuses=statuses,
                          sample_source="original_selection"),
        *reconstruct_rows(chronological_rows, bundle=bundle, statuses=statuses,
                          sample_source="chronological_selection"),
    ]
    summary = {
        "schema_version": SCHEMA_VERSION,
        "as_of": bundle.as_of.isoformat(),
        "source_film_theater_observations": len(original_rows),
        "chronological_film_theater_observations": len(chronological_rows),
        "quality": {
            "strict_complete_dates": len(eligible_legacy_days(statuses, as_of=bundle.as_of)[0]),
            "recorded_but_unverified_legacy_dates": len(eligible_legacy_days(statuses, as_of=bundle.as_of)[1]),
            "guard": "legacy reconstruction is provisional; no production use without chronology-safe independent evaluation",
        },
        **summarize(data),
        "definition": (
            "Last playing Fri-Thu programming week of the unified 14-day-gap run. "
            "No-show weeks inside that run do not terminate its forecast target."
        ),
        "effect_on_production": "none",
    }
    output = (root / args.output).resolve()
    csv_out = (root / args.csv).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    csv_out.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with csv_out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(data)
    print(json.dumps({
        "as_of": summary["as_of"],
        "quality": summary["quality"],
        "by_sample_source_and_grain": summary["by_sample_source_and_grain"],
        "example_changed_resolved": [
            {
                "film": x["title"], "theater": x["theater_id"],
                "friday": x["upcoming_friday"],
                "original": x["original_bucket"], "corrected": x["corrected_bucket"],
                "evidence": x["evidence_tier"],
            }
            for x in data
            if x["sample_source"] == "chronological_selection"
            and x["grain"] == "theater"
            and not x["original_censored"]
            and not x["corrected_censored"]
            and x["original_bucket"] != x["corrected_bucket"]
        ][:12],
        "report": str(output), "row_level_csv": str(csv_out),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
