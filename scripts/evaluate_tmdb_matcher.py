#!/usr/bin/env python3
"""Evaluate TMDB matcher against human-confirmed admin decisions (offline).

Usage:
  python scripts/evaluate_tmdb_matcher.py
  python scripts/evaluate_tmdb_matcher.py --json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reel_seattle.film_identity.constants import AUTO_CONFIRM_MIN_SCORE
from reel_seattle.film_identity.eligibility import classify_eligibility
from reel_seattle.film_identity.presentation import extract_match_title, interpret_source_years
from reel_seattle.film_identity.scoring import (
    classify_match_bucket,
    rank_candidates,
    score_candidate,
    top_candidate_margin,
)
from reel_seattle.film_identity.title_rules import clear_title_rules_cache

DEFAULT_FIXTURE = (
    ROOT / "tests" / "fixtures" / "film_identity" / "admin_confirmed_eval_cases.json"
)


def _evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    title = case.get("source_title") or ""
    source = case.get("source")
    expected_id = (case.get("expected") or {}).get("confirmed_tmdb_id")
    years = interpret_source_years(
        source_title=title,
        source=source,
    )
    extraction = extract_match_title(title, source=source)
    search_title = extraction.base_title or years.base_title or title
    elig = classify_eligibility(source_title=title, source=source)

    offline = list(case.get("offline_candidates") or [])
    scored = []
    if elig.status == "eligible" and offline:
        scored = [
            score_candidate(
                search_title=str(search_title),
                source_year=years.scoring_year(),
                source_runtime=case.get("runtime_min"),
                source_directors=case.get("directors_raw"),
                source_external_ids=None,
                candidate=row,
                event_year_relaxed=years.event_year_not_canonical,
            )
            for row in offline
            if isinstance(row, dict) and row.get("id") is not None
        ]
    ranked = rank_candidates(scored)
    bucket, proposed = classify_match_bucket(ranked)
    margin = top_candidate_margin(ranked)

    ranks = [i + 1 for i, c in enumerate(ranked) if c.tmdb_id == expected_id]
    rank = ranks[0] if ranks else None
    retrieved = rank is not None
    auto_id = proposed.tmdb_id if bucket == "auto" and proposed else None
    auto_correct = auto_id == expected_id
    auto_incorrect = bucket == "auto" and auto_id is not None and auto_id != expected_id

    return {
        "id": case.get("id"),
        "source_title": title,
        "search_title": search_title,
        "expected_tmdb_id": expected_id,
        "eligibility": elig.status,
        "entity_kind": elig.entity_kind,
        "bucket": bucket,
        "proposed_tmdb_id": proposed.tmdb_id if proposed else None,
        "proposed_score": proposed.score if proposed else None,
        "confirmed_rank": rank,
        "retrieved": retrieved,
        "ranked_1": rank == 1,
        "ranked_top3": rank is not None and rank <= 3,
        "auto_correct": auto_correct,
        "auto_incorrect": auto_incorrect,
        "review_required": bucket == "review",
        "unmatched": bucket == "unmatched" or not offline,
        "margin": margin,
        "blocked_reason": (case.get("catalog_snapshot") or {}).get(
            "auto_confirm_blocked_reason"
        ),
        "offline_candidate_count": len(offline),
    }


def evaluate(fixture_path: Path) -> dict[str, Any]:
    clear_title_rules_cache()
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    cases = payload.get("cases") or []
    results = [_evaluate_case(case) for case in cases]
    n = len(results) or 1
    with_cands = [r for r in results if r["offline_candidate_count"] > 0]
    margins = [
        r["margin"]
        for r in results
        if r["ranked_1"] and isinstance(r["margin"], (int, float))
    ]

    def pct(count: int, denom: int | None = None) -> float:
        base = denom if denom is not None else len(results)
        if base <= 0:
            return 0.0
        return round(100.0 * count / base, 1)

    auto_incorrect = sum(1 for r in results if r["auto_incorrect"])
    summary = {
        "human_confirmed_cases": len(results),
        "cases_with_offline_candidates": len(with_cands),
        "correct_candidate_retrieved": sum(1 for r in results if r["retrieved"]),
        "correct_candidate_retrieved_pct": pct(sum(1 for r in results if r["retrieved"])),
        "correct_candidate_ranked_1": sum(1 for r in results if r["ranked_1"]),
        "correct_candidate_ranked_1_pct": pct(sum(1 for r in results if r["ranked_1"])),
        "correct_candidate_top3": sum(1 for r in results if r["ranked_top3"]),
        "correct_candidate_top3_pct": pct(sum(1 for r in results if r["ranked_top3"])),
        "auto_match_correct": sum(1 for r in results if r["auto_correct"]),
        "auto_match_correct_pct": pct(sum(1 for r in results if r["auto_correct"])),
        "review_required": sum(1 for r in results if r["review_required"]),
        "review_required_pct": pct(sum(1 for r in results if r["review_required"])),
        "unmatched": sum(1 for r in results if r["unmatched"]),
        "unmatched_pct": pct(sum(1 for r in results if r["unmatched"])),
        "incorrect_automatic_matches": auto_incorrect,
        "false_auto_match_rate_pct": pct(auto_incorrect),
        "median_correct_candidate_margin": (
            statistics.median(margins) if margins else None
        ),
        "margin_distribution": {
            "count": len(margins),
            "min": min(margins) if margins else None,
            "p25": statistics.quantiles(margins, n=4)[0] if len(margins) >= 4 else None,
            "median": statistics.median(margins) if margins else None,
            "p75": statistics.quantiles(margins, n=4)[2] if len(margins) >= 4 else None,
            "max": max(margins) if margins else None,
        },
        "by_eligibility": {},
        "auto_confirm_min_score": AUTO_CONFIRM_MIN_SCORE,
    }
    for status in sorted({r["eligibility"] for r in results}):
        subset = [r for r in results if r["eligibility"] == status]
        summary["by_eligibility"][status] = {
            "n": len(subset),
            "auto_correct": sum(1 for r in subset if r["auto_correct"]),
            "review_required": sum(1 for r in subset if r["review_required"]),
            "retrieved": sum(1 for r in subset if r["retrieved"]),
        }
    return {"summary": summary, "results": results}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE,
        help="Path to admin_confirmed_eval_cases.json",
    )
    parser.add_argument("--json", action="store_true", help="Emit full JSON report")
    args = parser.parse_args(argv)
    report = evaluate(args.fixture)
    if args.json:
        print(json.dumps(report, indent=2))
        return 0
    s = report["summary"]
    print("TMDB matcher evaluation (admin-confirmed corpus)")
    print(f"  human-confirmed cases: {s['human_confirmed_cases']}")
    print(
        f"  correct candidate retrieved: "
        f"{s['correct_candidate_retrieved']} / {s['correct_candidate_retrieved_pct']}%"
    )
    print(
        f"  correct candidate ranked #1: "
        f"{s['correct_candidate_ranked_1']} / {s['correct_candidate_ranked_1_pct']}%"
    )
    print(
        f"  correct candidate within top 3: "
        f"{s['correct_candidate_top3']} / {s['correct_candidate_top3_pct']}%"
    )
    print(
        f"  auto-match correct under current matcher: "
        f"{s['auto_match_correct']} / {s['auto_match_correct_pct']}%"
    )
    print(f"  review required: {s['review_required']} / {s['review_required_pct']}%")
    print(f"  unmatched: {s['unmatched']} / {s['unmatched_pct']}%")
    print(f"  incorrect automatic matches: {s['incorrect_automatic_matches']}")
    print(f"  false-auto-match rate: {s['false_auto_match_rate_pct']}%")
    print(f"  median correct-candidate margin: {s['median_correct_candidate_margin']}")
    return 0 if s["incorrect_automatic_matches"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
