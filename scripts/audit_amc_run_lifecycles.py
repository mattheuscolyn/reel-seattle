#!/usr/bin/env python3
"""Reconstruct AMC theatrical-run lifecycles and write a modeling-ready audit.

Read-only. Does not scrape, restate history, or train a model.

Example:
  python scripts/audit_amc_run_lifecycles.py
  python scripts/audit_amc_run_lifecycles.py --skip-git-inventory --skip-history
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.amc_footprint import load_amc_snapshots  # noqa: E402
from reel_seattle.analysis.amc_run_lifecycle import (  # noqa: E402
    DEFAULT_GAP_THRESHOLD_DAYS,
    LEAKAGE_RULES,
    OBSERVATION_FIELDNAMES,
    SCHEMA_VERSION,
    SENSITIVITY_THRESHOLDS,
    active_product_ids,
    build_lifecycle_audit,
    facts_from_snapshots,
    inventory_committed_logs,
    json_ready,
    load_catalog_index,
    load_occurred_from_history,
    occurred_from_facts,
    resolve_product_identity,
    sensitivity_analysis,
    write_observation_csv,
)
from reel_seattle.normalize import build_theater_index  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Audit AMC theatrical-run identity, disappear/return gaps, and "
            "remaining-days time-to-event labels from committed snapshots."
        )
    )
    parser.add_argument(
        "--logs-dir",
        type=Path,
        default=Path("data/daily_logs"),
        help="Directory containing *_amc.json scrape logs.",
    )
    parser.add_argument(
        "--history",
        type=Path,
        default=Path("data/history/showtimes_history.csv"),
        help="Canonical history CSV (past AMC rows only; forward window ignored).",
    )
    parser.add_argument(
        "--theaters",
        type=Path,
        default=Path("data/theaters.json"),
        help="Theater registry path.",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=Path("data/source_catalog/amc_movie_products.json"),
        help="Optional AMC source-catalog products JSON.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("audit-output/amc-run-lifecycle"),
        help="Gitignored directory for generated audit datasets.",
    )
    parser.add_argument(
        "--gap-threshold-days",
        type=int,
        default=DEFAULT_GAP_THRESHOLD_DAYS,
        help="Default dark-day threshold used to increment network_run_sequence.",
    )
    parser.add_argument(
        "--skip-history",
        action="store_true",
        help="Do not join occurred dates from showtimes_history.csv.",
    )
    parser.add_argument(
        "--skip-git-inventory",
        action="store_true",
        help="Skip Git snapshot discovery (committed JSON logs are still inventoried).",
    )
    parser.add_argument(
        "--skip-observations-csv",
        action="store_true",
        help="Do not write the large observations CSV.",
    )
    return parser.parse_args(argv)


def _load_registry(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _git_inventory(repo_root: Path) -> dict:
    from reel_seattle.analysis.git_amc_snapshots import (
        default_git_runner,
        discover_snapshot_sources,
        inventory_summary,
        source_format_counts,
    )

    runner = default_git_runner(repo_root)
    sources = discover_snapshot_sources(runner)
    summary = inventory_summary(sources)
    summary["preserves_forward_booking_at_T"] = {
        "archive_csv": True,
        "daily_csv": "partial_legacy_csv_window",
        "json": True,
    }
    summary["source_film_id_typical"] = {
        "archive_csv": False,
        "daily_csv": False,
        "json": "from_2026-07-17_expanded_capture",
    }
    summary["source_breakdown"] = source_format_counts(sources)
    return summary


def _filter_history_to_snapshot_products(extra, product_ids: set[str]):
    return [row for row in extra if row.product_id in product_ids]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    registry = _load_registry(args.theaters)
    theater_index = build_theater_index(registry)
    log_inventory = inventory_committed_logs(args.logs_dir)
    snapshots = load_amc_snapshots(args.logs_dir)
    facts = facts_from_snapshots(snapshots, theater_index=theater_index, snapshot_format="json")
    catalog = load_catalog_index(args.catalog)
    as_of = max((fact.observation_date for fact in facts), default=date.today())
    snapshot_product_ids = {
        resolve_product_identity(
            source_film_id=fact.source_film_id,
            source_release_id=fact.source_release_id,
            title=fact.title,
            title_key=fact.title_key,
        ).product_id
        for fact in facts
    }

    extra = []
    history_note: dict | str = "skipped"
    if not args.skip_history and args.history.is_file():
        extra = load_occurred_from_history(
            args.history, theater_index=theater_index, as_of=as_of
        )
        matched = _filter_history_to_snapshot_products(extra, snapshot_product_ids)
        history_note = {
            "history_rows_loaded": len(extra),
            "rows_matching_snapshot_products": len(matched),
            "dropped_history_only_products": len(extra) - len(matched),
        }
        extra = matched

    git_summary: dict = {"skipped": True}
    if not args.skip_git_inventory:
        git_summary = _git_inventory(PROJECT_ROOT)

    result = build_lifecycle_audit(
        facts,
        gap_threshold_days=args.gap_threshold_days,
        extra_occurred=extra,
        catalog=catalog,
    )
    active_ids = active_product_ids(facts, as_of=result.as_of)
    occurred = occurred_from_facts(facts, as_of=result.as_of)
    seen = {(row.product_id, row.show_date, row.theater_id) for row in occurred}
    for row in extra:
        key = (row.product_id, row.show_date, row.theater_id)
        if key not in seen:
            occurred.append(row)
            seen.add(key)
    sensitivity = sensitivity_analysis(
        facts,
        occurred,
        result.identities,
        as_of=result.as_of,
        dataset_start=result.dataset_start,
        catalog=catalog,
        active_product_ids_at_as_of=active_ids,
        thresholds=SENSITIVITY_THRESHOLDS,
        baseline_threshold=args.gap_threshold_days,
    )

    recommendation = _recommend_threshold(result, sensitivity)

    summary = {
        "schema_version": SCHEMA_VERSION,
        "goal": (
            "Estimate remaining calendar days until the final Seattle-area AMC "
            "showtime of the current source-native theatrical run. Do not train here."
        ),
        "default_gap_threshold_days": args.gap_threshold_days,
        "recommended_gap_threshold_days": recommendation["threshold"],
        "recommendation_reason": recommendation["reason"],
        "as_of": result.as_of.isoformat(),
        "dataset_start": result.dataset_start.isoformat(),
        "committed_json_inventory": log_inventory,
        "git_snapshot_inventory": git_summary,
        "history_join": history_note,
        "fact_count": len(facts),
        "product_count": len(result.identities),
        "run_count": len(result.runs),
        "observation_count": len(result.observations),
        "gap_count": len(result.gaps),
        "observation_quality_counts": result.observation_quality_counts,
        "identity_kind_counts": _count_identity_kinds(result),
        "right_censored_runs": sum(1 for run in result.runs if run.right_censored),
        "left_truncated_runs": sum(1 for run in result.runs if run.left_truncated),
        "observed_targets": sum(1 for row in result.observations if row.event_observed),
        "right_censored_targets": sum(1 for row in result.observations if row.right_censored),
        "leakage_rules": LEAKAGE_RULES,
        "observation_contract_fields": OBSERVATION_FIELDNAMES,
        "all_announced_showtimes_branch": {
            "merged_to_this_branch": False,
            "historical_logs_still_14day_truncated": True,
            "note": (
                "feature/amc-all-announced-showtimes is not merged into this "
                "worktree. Historical JSON logs remain 14-day dated-scan "
                "snapshots. Do not treat announced horizon as true remaining lifetime."
            ),
        },
        "target_definition": {
            "observation_T": "Pacific calendar date of snapshot generated_at",
            "remaining_days": "(run_end_date - observation_date).days",
            "same_day_final_show": 0,
            "uses_final_show_date_not_timestamp": True,
            "right_censored_remaining_days": None,
            "event_observed": "not right_censored",
        },
    }

    _write_json(output_dir / "summary.json", summary)
    _write_json(output_dir / "gap_analysis.json", result.gap_summary)
    _write_json(output_dir / "run_type_stats.json", result.run_type_stats)
    _write_json(output_dir / "wednesday_cadence.json", result.wednesday_cadence)
    _write_json(output_dir / "sensitivity.json", sensitivity)
    _write_json(
        output_dir / "runs.json",
        [
            {
                "run_id": run.run_id,
                "product_id": run.product_id,
                "title": run.title,
                "run_type": run.run_type,
                "start_date": run.start_date.isoformat(),
                "end_date": run.end_date.isoformat(),
                "run_sequence": run.run_sequence,
                "right_censored": run.right_censored,
                "left_truncated": run.left_truncated,
                "theater_count": len(run.theater_ids),
                "showtime_count": run.showtime_count,
                "one_day": run.one_day,
                "identity_kind": run.identity_kind,
            }
            for run in result.runs
        ],
    )
    if not args.skip_observations_csv:
        write_observation_csv(output_dir / "observations.csv", result.observations)

    print(f"Wrote audit outputs under {output_dir}")
    print(
        f"products={len(result.identities)} runs={len(result.runs)} "
        f"observations={len(result.observations)} gaps={len(result.gaps)}"
    )
    print(
        f"recommended_gap_threshold_days={recommendation['threshold']} "
        f"({recommendation['reason']})"
    )
    return 0


def _count_identity_kinds(result) -> dict[str, int]:
    counts: dict[str, int] = {}
    for identity in result.identities.values():
        counts[identity.identity_kind] = counts.get(identity.identity_kind, 0) + 1
    return counts


def _recommend_threshold(result, sensitivity: dict) -> dict[str, str | int]:
    """Recommend a default from empirical gap mass plus sensitivity splits."""
    buckets = result.gap_summary.get("bucket_counts") or {}
    short = buckets.get("1_day", 0) + buckets.get("2_day", 0)
    weekly = buckets.get("3_to_7_days", 0)
    medium = buckets.get("8_to_14_days", 0)
    longish = buckets.get("15_to_21_days", 0) + buckets.get("22_to_30_days", 0)
    long_gap = buckets.get("over_30_days", 0)
    artifact = result.gap_summary.get("possibly_missing_snapshot_gaps", 0)
    splits_14 = (sensitivity.get("14") or {}).get("products_split_into_multiple_runs", 0)
    splits_7 = (sensitivity.get("7") or {}).get("products_split_into_multiple_runs", 0)

    if short + weekly >= medium + longish + long_gap and artifact < max(short, 1):
        reason = (
            "Most returns are 1–7 dark days (scheduling/weekly dark days), while "
            "14+ day gaps are the minority and align with separate engagements. "
            f"Threshold 14 splits {splits_14} products vs {splits_7} at 7 days."
        )
        return {"threshold": 14, "reason": reason}
    if medium + longish + long_gap == 0:
        return {
            "threshold": 14,
            "reason": (
                "No 14+ day returns in this window; keep 14 as a conservative "
                "new-engagement threshold and re-evaluate after more history."
            ),
        }
    return {
        "threshold": 14,
        "reason": (
            f"14-day default kept: short gaps={short}, weekly={weekly}, "
            f"8–14={medium}, 15+={longish + long_gap}, "
            f"possibly-missing-snapshot gaps={artifact}."
        ),
    }


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(json_ready(payload), indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    raise SystemExit(main())
