#!/usr/bin/env python3
"""Build offline evaluation corpus from admin-confirmed TMDB reviews + catalog snapshots."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reel_seattle.film_identity.decisions import source_identity_key
from reel_seattle.film_identity.presentation import extract_match_title

REVIEWS = ROOT / "data" / "audits" / "admin_film_identity_reviews_export.json"
CATALOG = ROOT / "data" / "film_identity" / "film_identity_catalog.json"
OUT = ROOT / "tests" / "fixtures" / "film_identity" / "admin_confirmed_eval_cases.json"


def main() -> int:
    reviews = json.loads(REVIEWS.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    cmap = {}
    for film in catalog.get("films") or []:
        src = (film.get("source_identities") or [{}])[0]
        cmap[source_identity_key(src)] = film

    cases = []
    for review in reviews:
        if not review.get("active") or review.get("decision") != "matched":
            continue
        key = review["source_identity_key"]
        film = cmap.get(key) or {}
        snap = review.get("snapshot") if isinstance(review.get("snapshot"), dict) else {}
        src = (film.get("source_identities") or [{}])[0]
        raw = snap.get("raw_title") or src.get("source_title") or ""
        extraction = extract_match_title(raw, source=review.get("source"))
        candidates = []
        for cand in film.get("candidates") or []:
            candidates.append(
                {
                    "id": cand.get("tmdb_id"),
                    "title": cand.get("title"),
                    "original_title": cand.get("original_title"),
                    "release_date": (
                        f"{cand['release_year']}-01-01"
                        if isinstance(cand.get("release_year"), int)
                        else None
                    ),
                    "runtime": cand.get("runtime_min"),
                    "director": cand.get("director"),
                    "popularity": cand.get("popularity") or 0,
                    "adult": False,
                    "media_type": "movie",
                    "snapshot_score": cand.get("score"),
                    "snapshot_warnings": list(cand.get("warnings") or []),
                }
            )
        cases.append(
            {
                "id": key,
                "source": review.get("source"),
                "source_film_id": review.get("source_film_id"),
                "showtime_film_key": review.get("showtime_film_key"),
                "source_title": raw,
                "runtime_min": snap.get("runtime_min") or film.get("runtime_min"),
                "directors_raw": film.get("directors_raw"),
                "expected": {
                    "confirmed_tmdb_id": review.get("tmdb_id"),
                    "normalized_title": extraction.base_title,
                    "decision": "matched",
                    "reviewed_at": review.get("reviewed_at"),
                },
                "catalog_snapshot": {
                    "match_status": film.get("match_status"),
                    "auto_confirm_blocked_reason": film.get(
                        "auto_confirm_blocked_reason"
                    ),
                    "top_candidate_margin": film.get("top_candidate_margin"),
                    "proposed_tmdb_id": (candidates[0]["id"] if candidates else None),
                },
                "offline_candidates": candidates,
            }
        )

    payload = {
        "schema_version": "1.0.0",
        "description": (
            "Human-confirmed admin TMDB matches with offline candidate snapshots "
            "from film_identity_catalog.json. Used by scripts/evaluate_tmdb_matcher.py."
        ),
        "source_reviews": str(REVIEWS.relative_to(ROOT)).replace("\\", "/"),
        "source_catalog": str(CATALOG.relative_to(ROOT)).replace("\\", "/"),
        "cases": cases,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} cases={len(cases)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
