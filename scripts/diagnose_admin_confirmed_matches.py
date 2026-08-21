#!/usr/bin/env python3
"""Diagnostic analysis of admin-confirmed TMDB matches (Phases 1–4)."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reel_seattle.film_identity.decisions import source_identity_key
from reel_seattle.film_identity.presentation import extract_match_title, interpret_source_years


def load_json(rel: str) -> Any:
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def catalog_index(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for film in catalog.get("films") or []:
        src = (film.get("source_identities") or [{}])[0]
        out[source_identity_key(src)] = film
    return out


def queue_index(queue: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for item in queue.get("items") or []:
        key = source_identity_key(
            {
                "source": item.get("source"),
                "source_film_id": item.get("source_film_id"),
                "showtime_film_key": item.get("showtime_film_key"),
            }
        )
        out[key] = item
    return out


def candidate_rank(candidates: list[dict[str, Any]], tmdb_id: int | None) -> int | None:
    if not isinstance(tmdb_id, int):
        return None
    for index, cand in enumerate(candidates):
        if cand.get("tmdb_id") == tmdb_id:
            return index + 1
    return None


def build_rows() -> list[dict[str, Any]]:
    reviews = load_json("data/audits/admin_film_identity_reviews_export.json")
    catalog = load_json("data/film_identity/film_identity_catalog.json")
    queue = load_json("data/film_identity/tmdb_match_review_queue.json")
    cindex = catalog_index(catalog)
    qindex = queue_index(queue)

    rows: list[dict[str, Any]] = []
    for review in reviews:
        if not review.get("active"):
            continue
        if review.get("decision") != "matched":
            continue
        key = review["source_identity_key"]
        film = cindex.get(key) or {}
        queue_item = qindex.get(key) or {}
        src = (film.get("source_identities") or [{}])[0]
        snapshot = review.get("snapshot") if isinstance(review.get("snapshot"), dict) else {}
        raw_title = (
            snapshot.get("raw_title")
            or src.get("source_title")
            or queue_item.get("source_title")
            or ""
        )
        year_info = interpret_source_years(
            source_title=raw_title,
            explicit_canonical_year=film.get("year_hint") or queue_item.get("year_hint"),
            source=review.get("source"),
        )
        presentation = extract_match_title(raw_title, source=review.get("source"))
        candidates = list(film.get("candidates") or queue_item.get("candidates") or [])
        confirmed_id = review.get("tmdb_id")
        rank = candidate_rank(candidates, confirmed_id if isinstance(confirmed_id, int) else None)
        top = candidates[0] if candidates else {}
        second = candidates[1] if len(candidates) > 1 else {}
        confirmed = next((c for c in candidates if c.get("tmdb_id") == confirmed_id), None)
        rows.append(
            {
                "source_identity_key": key,
                "source": review.get("source"),
                "source_film_id": review.get("source_film_id"),
                "showtime_film_key": review.get("showtime_film_key"),
                "raw_source_title": raw_title,
                "display_title": snapshot.get("display_title"),
                "catalog_normalized_title": film.get("normalized_title"),
                "presentation_base_title": presentation.base_title,
                "presentation_labels": list(presentation.presentation_labels),
                "removed_phrases": list(presentation.removed_phrases),
                "applied_rules": list(presentation.applied_rules),
                "year_interpretation": year_info.to_dict(),
                "confirmed_tmdb_id": confirmed_id,
                "confirmed_candidate_title": (confirmed or {}).get("title"),
                "confirmed_candidate_original_title": (confirmed or {}).get("original_title"),
                "confirmed_candidate_year": (confirmed or {}).get("release_year"),
                "confirmed_candidate_runtime": (confirmed or {}).get("runtime_min"),
                "source_runtime": snapshot.get("runtime_min")
                or film.get("runtime_min")
                or queue_item.get("runtime_min"),
                "directors_raw": film.get("directors_raw") or queue_item.get("directors_raw"),
                "catalog_match_status": film.get("match_status"),
                "proposed_tmdb_id": (top.get("tmdb_id") if top else None)
                or queue_item.get("proposed_tmdb_id")
                or film.get("tmdb_id"),
                "confirmed_rank": rank,
                "confirmed_score": (confirmed or {}).get("score"),
                "top_score": top.get("score"),
                "second_score": second.get("score"),
                "top_candidate_margin": film.get("top_candidate_margin")
                or queue_item.get("top_candidate_margin"),
                "auto_confirm_blocked_reason": film.get("auto_confirm_blocked_reason")
                or queue_item.get("auto_confirm_blocked_reason"),
                "candidate_count": len(candidates),
                "in_review_queue": key in qindex,
                "in_catalog": key in cindex,
                "snapshot_keys": sorted(snapshot.keys()),
                "admin_note": review.get("admin_note"),
                "reviewed_at": review.get("reviewed_at"),
                "pre_review_canonical_film_id": snapshot.get("canonical_film_id"),
                "candidate_warnings": list((confirmed or top or {}).get("warnings") or []),
                "candidate_signals": (confirmed or top or {}).get("signals"),
            }
        )
    return rows


def classify_bucket(row: dict[str, Any]) -> str:
    rank = row.get("confirmed_rank")
    blocked = row.get("auto_confirm_blocked_reason")
    margin = row.get("top_candidate_margin")
    score = row.get("confirmed_score")
    if rank is None:
        return "E"  # not retrieved / not in persisted candidates
    if rank == 1:
        if blocked in {None, ""} and (score or 0) >= 0.92:
            # already auto-confirmable by score+rank; unusual for admin confirm path
            return "A"
        if blocked and margin is not None and margin >= 0.15:
            return "B"
        if blocked and score is not None and 0.80 <= score < 0.92:
            return "C"
        if blocked:
            return "B" if (margin or 0) >= 0.08 else "A"
        return "A"
    if rank >= 2:
        # if second is close, ambiguous; else ranking failure
        margin = row.get("top_candidate_margin")
        if margin is not None and margin < 0.08:
            return "F"
        return "D"
    return "F"


def title_diff_tokens(raw: str, base: str) -> list[str]:
    raw_l = re.findall(r"[A-Za-z0-9']+", (raw or "").lower())
    base_l = set(re.findall(r"[A-Za-z0-9']+", (base or "").lower()))
    return [t for t in raw_l if t not in base_l]


KNOWN_PHRASE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("35mm", re.compile(r"\b35\s*mm\b", re.I)),
    ("70mm", re.compile(r"\b70\s*mm\b", re.I)),
    ("4k_restoration", re.compile(r"\b4k(?:\s+restoration)?\b|\brestoration\b|\brestored\b", re.I)),
    ("remastered", re.compile(r"\bremastered\b", re.I)),
    ("early_access", re.compile(r"\bearly\s+access\b", re.I)),
    ("anniversary", re.compile(r"\b\d{1,3}(?:st|nd|rd|th)\s+anniversary\b|\banniversary\b", re.I)),
    ("ghibli_fest", re.compile(r"\bghibli\s+fest|\bstudio\s+ghibli\b", re.I)),
    ("festival", re.compile(r"\bfest(?:ival)?\b", re.I)),
    ("fan_event", re.compile(r"\bfan\s+event\b|\bone\s+night\s+only\b|\bencore\b", re.I)),
    ("special_presentation", re.compile(r"\bspecial\s+presentation\b", re.I)),
    ("qa_panel", re.compile(r"\bq\s*&\s*a\b|\btalkback\b|\bpanel\b", re.I)),
    ("live_event", re.compile(r"\blive!\b|\bnt\s+live\b|\blive\s+shadow\s+cast\b|\bwith\s+live\b", re.I)),
    ("presented_with", re.compile(r"\bpresented\s+with\b|\bpresents\s*:", re.I)),
    ("series_prefix", re.compile(r"\bsfcs\s+at\s+\d+\b|\bbaron\s+von\s+terror\s+presents\b|\bunstreamable\b", re.I)),
    ("harry_potter_day", re.compile(r"\bhpd\d+\b|\bhogwarts|\bharry\s+potter.*day", re.I)),
    ("year_suffix", re.compile(r"\(\s*(?:19|20)\d{2}\s*\)|\b(?:19|20)\d{2}\b")),
]


def main() -> int:
    rows = build_rows()
    out_dir = ROOT / "data" / "audits"
    out_dir.mkdir(parents=True, exist_ok=True)
    dataset_path = out_dir / "admin_confirmed_match_diagnostics.json"
    dataset_path.write_text(json.dumps({"cases": rows}, indent=2), encoding="utf-8")

    buckets: Counter[str] = Counter()
    for row in rows:
        row["bucket"] = classify_bucket(row)
        buckets[row["bucket"]] += 1

    # rewrite with buckets
    dataset_path.write_text(json.dumps({"cases": rows}, indent=2), encoding="utf-8")

    print("=== PHASE 1 SUMMARY ===")
    print(f"matched_confirmations={len(rows)}")
    print(f"dataset={dataset_path.relative_to(ROOT)}")
    print("snapshot_keys_union=", sorted({k for r in rows for k in r["snapshot_keys"]}))
    print("in_review_queue", sum(1 for r in rows if r["in_review_queue"]))
    print("missing_from_queue", sum(1 for r in rows if not r["in_review_queue"]))
    print("confirmed_in_candidates", sum(1 for r in rows if r["confirmed_rank"] is not None))
    print("confirmed_absent_from_candidates", sum(1 for r in rows if r["confirmed_rank"] is None))

    print("\n=== BUCKETS A-F ===")
    for key in "ABCDEF":
        print(f"  {key}: {buckets[key]}")

    print("\n=== BLOCKED REASONS (rank1) ===")
    blocked = Counter(
        r.get("auto_confirm_blocked_reason") or "(none)"
        for r in rows
        if r.get("confirmed_rank") == 1
    )
    print(dict(blocked))

    print("\n=== TITLE PHRASE HITS ===")
    for name, pattern in KNOWN_PHRASE_PATTERNS:
        hits = [r for r in rows if pattern.search(r["raw_source_title"] or "")]
        if not hits:
            continue
        print(f"\n[{name}] count={len(hits)}")
        for row in hits[:4]:
            handled = name.replace("_", " ") in " ".join(row["presentation_labels"]).lower() or (
                row["presentation_base_title"]
                and row["presentation_base_title"].lower()
                != (row["raw_source_title"] or "").lower()
            )
            print(
                f"  raw={row['raw_source_title']!r}\n"
                f"  base={row['presentation_base_title']!r} labels={row['presentation_labels']}\n"
                f"  confirmed_title={row['confirmed_candidate_title']!r} id={row['confirmed_tmdb_id']} "
                f"rank={row['confirmed_rank']} blocked={row['auto_confirm_blocked_reason']}"
            )

    print("\n=== REPRESENTATIVE CASES ===")
    for row in rows:
        if row["bucket"] in {"A", "B", "C"} or (
            row["confirmed_rank"] is None and row["raw_source_title"]
        ):
            print(
                f"{row['bucket']} rank={row['confirmed_rank']} score={row['confirmed_score']} "
                f"margin={row['top_candidate_margin']} blocked={row['auto_confirm_blocked_reason']}\n"
                f"  {row['raw_source_title']!r} -> {row['confirmed_candidate_title']!r} "
                f"(tmdb:{row['confirmed_tmdb_id']})\n"
                f"  base={row['presentation_base_title']!r} labels={row['presentation_labels']}"
            )

    # extra leftover tokens analysis
    leftover: Counter[str] = Counter()
    leftovers_examples: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        for token in title_diff_tokens(row["raw_source_title"], row["presentation_base_title"] or ""):
            leftover[token] += 1
            if len(leftovers_examples[token]) < 3:
                leftovers_examples[token].append(row["raw_source_title"])
    print("\n=== LEFTOVER TOKENS AFTER PRESENTATION STRIP (freq>=2) ===")
    for token, count in leftover.most_common(40):
        if count < 2:
            continue
        print(f"  {token}: {count}  e.g. {leftovers_examples[token]}")

    summary = {
        "matched_confirmations": len(rows),
        "buckets": dict(buckets),
        "blocked_reasons_rank1": dict(blocked),
        "in_review_queue": sum(1 for r in rows if r["in_review_queue"]),
        "confirmed_absent_from_candidates": sum(
            1 for r in rows if r["confirmed_rank"] is None
        ),
        "lost_fields": [
            "matcher_version",
            "ranked candidate snapshot at review time (only Aug-17 queue/catalog available)",
            "selected_candidate_rank at review UI time",
            "selection_method (proposed vs manual search)",
            "confirmed TMDB title/year at save time",
            "search query used in admin UI",
        ],
        "available_fields": [
            "source_identity_key/source/source_film_id",
            "decision/tmdb_id/reviewed_at/admin_note",
            "snapshot.raw_title/display_title/theaters/runtime_min/canonical_film_id",
            "joinable catalog candidates/scores/blocked_reason for identities present in Aug-17 catalog",
        ],
    }
    (out_dir / "admin_confirmed_match_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print("\nsummary written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
