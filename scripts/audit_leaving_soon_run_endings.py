#!/usr/bin/env python3
"""Evidence-based, read-only verification of historical AMC run-end labels.

This audit does not rewrite reconstructed labels or production artifacts.
'Supported' means corroborated by the available complete AMC schedule snapshots,
not proof AMC could never add a new screening later.
"""

from __future__ import annotations

import argparse
import csv
import json
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
    CONFIRMED, Engagement, Screening, load_snapshot_infos,
)
from reel_seattle.analysis.leaving_soon_feature_value import load_bundle, still_listed
from reel_seattle.analysis.leaving_soon_prepublication_survival import (
    _cover, _split, build_booking_cycles, build_observations,
)

DAY = timedelta(days=1)
WEEK = timedelta(days=7)
AUDIT_COLUMNS = (
    "cohort", "film_id", "film_title", "theater_id", "upcoming_friday",
    "observation_date", "original_bucket", "original_censored",
    "engagement_sequence", "run_start", "last_show", "run_end",
    "engagement_end_status", "first_absent_week", "first_absent_week_ends",
    "end_verdict", "reason", "last_show_complete_snapshot",
    "post_end_schedule_snapshot", "post_end_schedule_showtimes",
    "post_end_schedule_days", "post_end_schedule_other_films",
    "evidence_missing_dates", "contradicting_show_dates",
    "next_engagement_show", "market_verdict", "market_reason",
    "market_theaters_checked", "market_theaters_supported",
)


def _iso(day: date | None) -> str:
    return day.isoformat() if day else ""


def _valid_complete_dates(statuses, as_of: date) -> list[date]:
    # All known statuses are AMC-only when loaded with load_snapshot_infos;
    # a later duplicate incomplete record overrides any earlier complete one.
    states = {item.snapshot_date: item.completeness for item in statuses if item.snapshot_date <= as_of}
    return sorted(day for day, quality in states.items() if quality == "complete")


def _missing_or_incomplete_dates(statuses, start: date, end: date) -> set[date]:
    states = {item.snapshot_date: item.completeness for item in statuses if start <= item.snapshot_date <= end}
    bad = set()
    cursor = start
    while cursor <= end:
        if states.get(cursor) != "complete":
            bad.add(cursor)
        cursor += DAY
    return bad


class ScheduleEvidence:
    def __init__(self, screenings: Sequence[Screening], complete_dates: Sequence[date]):
        self.complete = sorted(set(complete_dates))
        self.complete_set = set(self.complete)
        self.by_theater: dict[str, list[Screening]] = defaultdict(list)
        self.by_film_theater: dict[tuple[str, str], list[Screening]] = defaultdict(list)
        self.by_film: dict[str, list[Screening]] = defaultdict(list)
        for show in screenings:
            self.by_theater[show.theater_id].append(show)
            self.by_film_theater[(show.film_id, show.theater_id)].append(show)
            self.by_film[show.film_id].append(show)
        self.schedule_cache: dict[tuple[str, date, date], dict[str, Any]] = {}

    def _complete_on_or_before_show(self, show: Screening) -> date | None:
        if show.canceled or show.removed_before_show:
            return None
        pos = bisect_left(self.complete, show.first_snapshot)
        if pos >= len(self.complete):
            return None
        observed = self.complete[pos]
        if observed > show.show_date:
            return None
        if still_listed(show, observed):
            return observed
        return None

    def observed_positive_show(self, shows: Sequence[Screening], as_of: date) -> tuple[date, date] | None:
        """A show that has elapsed and was listed on an earlier complete scrape."""
        for show in sorted(shows, key=lambda x: x.show_date, reverse=True):
            if show.show_date >= as_of:
                continue
            witnessed = self._complete_on_or_before_show(show)
            if witnessed:
                return show.show_date, witnessed
        return None

    def full_following_week(self, theater_id: str, week: date, last_show: date) -> dict[str, Any]:
        """Find an actual complete snapshot containing a substantial future week.

        Uses ONLY listings already visible on the chosen complete snapshot.
        Require >=5 calendar days of bookings, >=2 distinct other films and
        >=8 showtimes, and a snapshot after the claimed last show but no later
        than the upcoming Friday.
        """
        key = (theater_id, week, last_show)
        if key in self.schedule_cache:
            return self.schedule_cache[key]
        candidates = [
            snap for snap in self.complete
            if max(last_show + DAY, week - timedelta(days=8)) <= snap <= week
        ]
        result = {"snapshot": "", "screenings": 0, "days": 0, "other_films": 0}
        shows = [
            show for show in self.by_theater.get(theater_id, ())
            if week <= show.show_date <= week + timedelta(days=6)
        ]
        for snap in reversed(candidates):
            visible = [show for show in shows if still_listed(show, snap)]
            days = len({show.show_date for show in visible})
            films = len({show.film_id for show in visible})
            if days >= 5 and films >= 2 and len(visible) >= 8:
                result = {
                    "snapshot": snap.isoformat(),
                    "screenings": len(visible),
                    "days": days,
                    "other_films": films,
                }
                break
        self.schedule_cache[key] = result
        return result

    def source_positive(self, engagement: Engagement, as_of: date) -> tuple[date, date] | None:
        if engagement.last_occurred is None:
            return None
        terminal = [
            show for show in engagement.screenings
            if show.show_date == engagement.last_occurred
        ]
        return self.observed_positive_show(terminal, as_of)


def _matching_engagement(
    row: Mapping[str, Any], engagements: Mapping[tuple[str, str], list[Engagement]],
) -> Engagement | None:
    visible = date.fromisoformat(row["visible_friday"])
    return _cover(engagements.get((str(row["film_id"]), str(row["theater_id"])), ()),
                  visible, visible + timedelta(days=6))


def _market_engagement(row: Mapping[str, Any], markets: Mapping[str, list[Engagement]]) -> Engagement | None:
    visible = date.fromisoformat(row["visible_friday"])
    return _cover(markets.get(str(row["film_id"]), ()), visible, visible + timedelta(days=6))


def _end_evidence(
    row: Mapping[str, Any],
    engagement: Engagement | None,
    schedule: ScheduleEvidence,
    incomplete: set[date],
    *,
    as_of: date,
    market: bool = False,
) -> dict[str, Any]:
    """Verify a single historical outcome against direct schedule evidence."""
    if engagement is None:
        return {"verdict": "unresolved_no_engagement", "reason": "Cannot identify original run", "end": None}
    friday = date.fromisoformat(row["upcoming_friday"])
    bucket = row["market_bucket"] if market else row["bucket"]
    censored = row["market_censored"] if market else row["censored"]
    result: dict[str, Any] = {
        "verdict": "unresolved", "reason": "", "end": engagement,
        "last_observed_on": "", "schedule": {},
        "bad_dates": [], "contradictions": [], "next_engagement_show": "",
        "theaters_checked": 0, "theaters_supported": 0,
    }

    # The 3+ outcome is positive evidence: third-week showtimes are required.
    if bucket == 3 and not censored:
        third_start = friday + timedelta(days=14)
        eligible = [
            show for show in engagement.screenings
            if third_start <= show.show_date <= third_start + timedelta(days=6)
            and not show.canceled and not show.removed_before_show
        ]
        if not eligible:
            result.update(verdict="contradicted_bucket", reason="No qualifying third-week show exists in the run")
            return result
        witnessed = [show for show in eligible if schedule._complete_on_or_before_show(show)]
        occurred = [show for show in witnessed if show.show_date < as_of]
        if occurred:
            result.update(verdict="supported_three_plus", reason="Elapsed third-week screening observed on a complete AMC snapshot",
                          last_observed_on=_iso(schedule._complete_on_or_before_show(occurred[0])))
        elif witnessed:
            result.update(verdict="unresolved_future_show", reason="Third-week showing announced on a complete snapshot but not yet occurred")
        else:
            result.update(verdict="unresolved_unwitnessed_three_plus", reason="Third-week screening has no complete snapshot before its date")
        return result

    if censored or bucket is None:
        result.update(verdict="unresolved_censored", reason="Existing outcome right-censored; not an observed run ending")
        return result

    bucket = int(bucket)
    absent_start = friday + timedelta(days=7 * bucket)
    absent_end = absent_start + timedelta(days=6)
    result.update(absent_week=absent_start, absent_week_end=absent_end)

    if engagement.end_status != CONFIRMED:
        result.update(verdict="contradicted_bucket", reason="Resolved exit label but original engagement has unconfirmed ending")
        return result

    # The first week called 'absent' must not contain a showing. Look ahead to
    # catch a one-week hole followed by an actual performance in the SAME run.
    later_same_run = sorted({
        show.show_date for show in engagement.screenings
        if absent_start <= show.show_date <= absent_start + timedelta(days=20)
        and not show.canceled and not show.removed_before_show
    })
    if later_same_run:
        result.update(verdict="contradicted_later_show", reason="The same run has actual later showtimes after a supposedly terminal empty week",
                      contradictions=[_iso(x) for x in later_same_run[:8]])
        return result

    # Separate engagements are not necessarily the same run, but surface a
    # nearby return for manual adjudication instead of hiding the evidence.
    nearby = sorted({
        show.show_date for show in schedule.by_film.get(engagement.film_id, ())
        if show.show_date > engagement.end_date
        and show.show_date <= absent_start + timedelta(days=20)
        and not show.canceled and not show.removed_before_show
        and (market or show.theater_id == engagement.theater_id)
    })
    if nearby:
        result["next_engagement_show"] = nearby[0].isoformat()

    if absent_end >= as_of:
        result.update(verdict="unresolved_future_week", reason="Claimed first absent week has not completely elapsed")
        return result
    if engagement.last_occurred is None:
        result.update(verdict="unresolved_no_last_show", reason="No elapsed terminal screening")
        return result
    positive = schedule.source_positive(engagement, as_of)
    if not positive:
        result.update(verdict="unresolved_unwitnessed_end", reason="Terminal show was not independently observed on any complete AMC snapshot")
        return result
    result["last_observed_on"] = positive[1].isoformat()

    anchor = date.fromisoformat(row["observation_date"])
    bad = sorted(day for day in incomplete if max(anchor, engagement.last_occurred) <= day <= absent_start)
    if bad:
        result.update(verdict="unresolved_coverage_gap", reason="Missing/incomplete AMC observations between last show and confirmation week",
                      bad_dates=[_iso(day) for day in bad])
        return result

    theater_ids = (
        sorted({show.theater_id for show in engagement.screenings})
        if market else [engagement.theater_id]
    )
    supported: dict[str, dict[str, Any]] = {}
    for theater_id in theater_ids:
        status = schedule.full_following_week(theater_id, absent_start, engagement.last_occurred)
        supported[theater_id] = status
    enough = sum(bool(state["snapshot"]) for state in supported.values())
    result.update(theaters_checked=len(theater_ids), theaters_supported=enough,
                  schedule=supported.get(engagement.theater_id) if not market else {})
    if enough != len(theater_ids):
        result.update(verdict="unresolved_unpublished_week", reason="No complete snapshot demonstrates substantial future schedules at every affected AMC")
        return result

    # Verify no announced showing for this film, even at another AMC for
    # market-wide labels, on the claimed absent programming week.
    if market:
        all_matches = schedule.by_film.get(engagement.film_id, ())
    else:
        all_matches = schedule.by_film_theater.get((engagement.film_id, engagement.theater_id), ())
    evidence_of_presence = sorted({
        show.show_date for show in all_matches
        if absent_start <= show.show_date <= absent_end
        and not show.canceled and not show.removed_before_show
    })
    if evidence_of_presence:
        result.update(verdict="contradicted_absent_week", reason="Another screening exists in first absent week",
                      contradictions=[_iso(day) for day in evidence_of_presence])
        return result

    result.update(verdict="supported_exit", reason="Terminal screening witnessed, intervening observations complete, and following elapsed programming week fully published without film")
    return result


def verify_endings(
    rows: Sequence[Mapping[str, Any]],
    bundle,
    statuses,
) -> dict[str, Any]:
    complete = _valid_complete_dates(statuses, bundle.as_of)
    incomplete = _missing_or_incomplete_dates(statuses, bundle.dataset_start, bundle.as_of)
    schedule = ScheduleEvidence(bundle.screenings, complete)
    theater_runs: dict[tuple[str, str], list[Engagement]] = defaultdict(list)
    market_runs: dict[str, list[Engagement]] = defaultdict(list)
    for item in bundle.film_theater:
        theater_runs[(item.film_id, item.theater_id)].append(item)
    for item in bundle.market:
        market_runs[item.film_id].append(item)

    audit_rows = []
    for row in rows:
        run = _matching_engagement(row, theater_runs)
        verdict = _end_evidence(row, run, schedule, incomplete, as_of=bundle.as_of)
        market = _market_engagement(row, market_runs)
        market_verdict = _end_evidence(row, market, schedule, incomplete, as_of=bundle.as_of, market=True)
        chosen = verdict.get("end")
        schedule_meta = verdict.get("schedule") or {}
        audit_rows.append({
            "cohort": row.get("_audit_cohort") or "",
            "film_id": row["film_id"],
            "film_title": row["title"],
            "theater_id": row["theater_id"],
            "upcoming_friday": row["upcoming_friday"],
            "observation_date": row["observation_date"],
            "original_bucket": row["bucket"],
            "original_censored": row["censored"],
            "engagement_sequence": chosen.sequence if chosen else "",
            "run_start": _iso(chosen.start_date) if chosen else "",
            "last_show": _iso(chosen.last_occurred) if chosen else "",
            "run_end": _iso(chosen.end_date) if chosen else "",
            "engagement_end_status": chosen.end_status if chosen else "",
            "first_absent_week": _iso(verdict.get("absent_week")),
            "first_absent_week_ends": _iso(verdict.get("absent_week_end")),
            "end_verdict": verdict["verdict"],
            "reason": verdict["reason"],
            "last_show_complete_snapshot": verdict.get("last_observed_on") or "",
            "post_end_schedule_snapshot": schedule_meta.get("snapshot", ""),
            "post_end_schedule_showtimes": schedule_meta.get("screenings", ""),
            "post_end_schedule_days": schedule_meta.get("days", ""),
            "post_end_schedule_other_films": schedule_meta.get("other_films", ""),
            "evidence_missing_dates": ";".join(verdict.get("bad_dates", ())),
            "contradicting_show_dates": ";".join(verdict.get("contradictions", ())),
            "next_engagement_show": verdict.get("next_engagement_show") or "",
            "market_verdict": market_verdict["verdict"],
            "market_reason": market_verdict["reason"],
            "market_theaters_checked": market_verdict.get("theaters_checked", 0),
            "market_theaters_supported": market_verdict.get("theaters_supported", 0),
        })

    return {
        "rows": audit_rows,
        "summary": {
            "as_of": bundle.as_of.isoformat(),
            "historical_rows": len(audit_rows),
            "theater_label_verdicts": dict(Counter(row["end_verdict"] for row in audit_rows)),
            "market_label_verdicts": dict(Counter(row["market_verdict"] for row in audit_rows)),
            "by_cohort": {
                cohort: {
                    "rows": len(chosen),
                    "theater_verdicts": dict(Counter(row["end_verdict"] for row in chosen)),
                    "market_verdicts": dict(Counter(row["market_verdict"] for row in chosen)),
                }
                for cohort in ("train", "validation", "holdout")
                for chosen in [[item for item in audit_rows if item["cohort"] == cohort]]
            },
            "scope": (
                "A supported exit is corroborated by reconstructed historical schedule "
                "presence/absence, not actual ticket scans or an AMC-confirmed closure. "
                "A complete AMC source snapshot is global, not independently audited "
                "per-theater response. Market verification requires every previously "
                "engaged theater to have following-week coverage."
            ),
        },
    }



def verify_distinct_runs(bundle, statuses) -> dict[str, Any]:
    """One row per underlying engagement, independently of model cohort selection.

    The model examples above are observations and can reference the same run
    many times. This inventory prevents them from being misread as unique ends.
    """
    from reel_seattle.analysis.leaving_soon_scheduling_assumptions import (
        next_programming_friday,
    )

    schedule = ScheduleEvidence(bundle.screenings, _valid_complete_dates(statuses, bundle.as_of))
    incomplete = _missing_or_incomplete_dates(statuses, bundle.dataset_start, bundle.as_of)
    run_rows = []
    for level, engagements in (("theater", bundle.film_theater), ("market", bundle.market)):
        for eng in engagements:
            if eng.last_occurred is None:
                result = {
                    "verdict": "unresolved_future_only",
                    "reason": "No elapsed film screening",
                }
                first_absent_week = None
            else:
                first_absent_week = next_programming_friday(eng.last_occurred)
                synthetic = {
                    "film_id": eng.film_id,
                    "theater_id": eng.theater_id,
                    "observation_date": eng.last_occurred.isoformat(),
                    "upcoming_friday": first_absent_week.isoformat(),
                    "bucket": 0,
                    "censored": 0 if eng.confirmed else 1,
                    "market_bucket": 0,
                    "market_censored": 0 if eng.confirmed else 1,
                }
                result = _end_evidence(
                    synthetic, eng, schedule, incomplete, as_of=bundle.as_of,
                    market=(level == "market"),
                )
            schedule_meta = result.get("schedule") or {}
            run_rows.append({
                "level": level,
                "film_id": eng.film_id,
                "film_title": eng.title,
                "theater_id": eng.theater_id,
                "run_sequence": eng.sequence,
                "run_start": eng.start_date.isoformat(),
                "last_show": _iso(eng.last_occurred),
                "last_scheduled": eng.end_date.isoformat(),
                "original_end_status": eng.end_status,
                "first_absent_week": _iso(first_absent_week),
                "end_verdict": result["verdict"],
                "reason": result["reason"],
                "terminal_show_observed_complete": result.get("last_observed_on") or "",
                "post_end_schedule_snapshot": schedule_meta.get("snapshot") or "",
                "post_end_schedule_showtimes": schedule_meta.get("screenings") or "",
                "post_end_schedule_days": schedule_meta.get("days") or "",
                "post_end_schedule_other_films": schedule_meta.get("other_films") or "",
                "evidence_missing_dates": ";".join(result.get("bad_dates", ())),
                "contradicting_show_dates": ";".join(result.get("contradictions", ())),
                "next_engagement_show": result.get("next_engagement_show") or "",
                "theaters_checked": result.get("theaters_checked", 0),
                "theaters_supported": result.get("theaters_supported", 0),
            })

    return {
        "rows": run_rows,
        "summary": {
            "as_of": bundle.as_of.isoformat(),
            "distinct_engagements": len(run_rows),
            "by_grain": {
                level: {
                    "runs": len(group),
                    "original_confirmed": sum(item["original_end_status"] == CONFIRMED for item in group),
                    "verdicts": dict(Counter(item["end_verdict"] for item in group)),
                }
                for level in ("theater", "market")
                for group in [[item for item in run_rows if item["level"] == level]]
            },
            "scope": "Distinct film-theater and film-market engagements from the existing 14-day gap segmentation; schedule-corroborated, not AMC-certified closure.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/audits/leaving_soon_run_endings.json"))
    parser.add_argument("--csv", type=Path, default=Path("data/audits/leaving_soon_run_endings_rows.csv"))
    parser.add_argument("--distinct-csv", type=Path, default=Path("data/audits/leaving_soon_distinct_run_endings_rows.csv"))
    args = parser.parse_args()
    root = args.root.resolve()
    bundle = load_bundle(root)
    statuses = load_snapshot_infos(root / "data/history/screening_snapshot_status.jsonl")
    cycles = build_booking_cycles(bundle.screenings, bundle.snapshot_dates, bundle.theater_names, bundle.as_of)
    original = build_observations(bundle, cycles, kind="before_80")
    parts = _split(original)
    samples = []
    for cohort, group in parts.items():
        for row in group:
            samples.append({**row, "_audit_cohort": cohort})
    result = verify_endings(samples, bundle, statuses)
    distinct = verify_distinct_runs(bundle, statuses)
    result["summary"]["distinct_run_verification"] = distinct["summary"]
    output = (root / args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result["summary"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
    out_csv = (root / args.csv).resolve()
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=AUDIT_COLUMNS)
        writer.writeheader()
        writer.writerows(result["rows"])
    distinct_csv = (root / args.distinct_csv).resolve()
    distinct_csv.parent.mkdir(parents=True, exist_ok=True)
    with distinct_csv.open("w", newline="", encoding="utf-8") as fh:
        names = tuple(distinct["rows"][0]) if distinct["rows"] else ()
        writer = csv.DictWriter(fh, fieldnames=names)
        writer.writeheader()
        writer.writerows(distinct["rows"])
    print(json.dumps({
        **result["summary"],
        "report": str(output), "row_level_csv": str(out_csv),
        "distinct_run_csv": str(distinct_csv),
        "examples_contested": [
            {key: item[key] for key in (
                "film_title", "theater_id", "upcoming_friday", "last_show",
                "original_bucket", "end_verdict", "reason", "contradicting_show_dates"
            )}
            for item in result["rows"]
            if item["end_verdict"].startswith("contradicted")
        ][:15],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
