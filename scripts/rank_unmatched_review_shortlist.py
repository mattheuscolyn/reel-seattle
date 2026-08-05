#!/usr/bin/env python3
"""Rank unmatched current-window films for high-impact manual review."""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.validate import PROJECT_ROOT as ROOT  # noqa: E402

NON_FILM_RE = re.compile(
    r"\b("
    r"meet[- ]?up|meetup|fundraiser|private rental|happy hour|crossfaded|"
    r"screen unseen|mystery movie|shorts?\b|festival|fest\b|cartoon|"
    r"dci\b|concert|live\b|opera|ballet|wrestling|gcw|"
    r"special broken|with .+ in[- ]person|panel|q\s*&\s*a"
    r")\b",
    re.I,
)
PROGRAM_RE = re.compile(
    r"\b(program|series|presents|cinemancy|scare society|studio ghibli fest)\b",
    re.I,
)
AMBIGUOUS_RE = re.compile(
    r"\b(remake|reboot|\(\d{4}\)|19\d{2}|20\d{2})\b",
    re.I,
)


def classify(title: str, variant: str) -> str:
    text = f"{title} {variant}".strip()
    if NON_FILM_RE.search(text):
        return "non_film_event"
    if PROGRAM_RE.search(text):
        return "festival_or_program"
    if AMBIGUOUS_RE.search(text) and ":" in title:
        return "ambiguous_same_title"
    # Specialty / sparse titles: very long compound event titles
    if len(title) > 70 or title.count(":") >= 2:
        return "specialty_or_sparse"
    return "likely_normal_film"


def main() -> int:
    review_path = ROOT / "data" / "audits" / "tmdb_match_manual_review_current.json"
    showtimes = json.loads(
        (ROOT / "public" / "data" / "showtimes_current.json").read_text(encoding="utf-8")
    )
    if not review_path.exists():
        print("missing review artifact; run scripts/report_canonical_film_window.py first")
        return 1

    review = json.loads(review_path.read_text(encoding="utf-8"))
    films_by_key = {f["showtime_film_key"]: f for f in showtimes.get("films") or []}
    opps = showtimes.get("showtimes") or []

    rows = []
    for item in review.get("items") or []:
        key = item["showtime_film_key"]
        film = films_by_key.get(key) or {}
        related = [st for st in opps if st.get("showtime_film_key") == key]
        venues = {st.get("theater_id") for st in related if st.get("theater_id")}
        sources = sorted({str(st.get("source") or "") for st in related if st.get("source")})
        title = item.get("source_title") or film.get("title") or key
        bucket = classify(title, item.get("screening_variant_type") or "")
        # Impact score: showtimes dominate, then venues, then missing poster.
        score = (
            len(related) * 10
            + len(venues) * 25
            + (0 if film.get("poster_url") else 40)
            + (0 if film.get("runtime_min") else 15)
        )
        if "amc" in sources:
            score += 20  # Home/Explore visibility bias
        rows.append(
            {
                "rank_score": score,
                "bucket": bucket,
                "showtime_count": len(related),
                "venue_count": len(venues),
                "theater_sources": "|".join(sources),
                "showtime_film_key": key,
                "source_title": title,
                "screening_variant_type": film.get("screening_variant_type") or "",
                "has_poster": bool(film.get("poster_url")),
                "runtime_min": film.get("runtime_min") or "",
                "source_film_id": film.get("source_film_id") or "",
                "suggested_action": (
                    "review_now"
                    if bucket == "likely_normal_film" and score >= 80
                    else "later"
                ),
            }
        )

    rows.sort(key=lambda r: (-r["rank_score"], -r["showtime_count"], r["source_title"]))
    out_json = ROOT / "data" / "audits" / "tmdb_match_manual_review_shortlist.json"
    out_csv = ROOT / "data" / "audits" / "tmdb_match_manual_review_shortlist.csv"
    out_json.write_text(json.dumps({"items": rows}, indent=2) + "\n", encoding="utf-8")
    with out_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else [])
        if rows:
            writer.writeheader()
            writer.writerows(rows)

    now = [r for r in rows if r["suggested_action"] == "review_now"][:12]
    buckets = {}
    for r in rows:
        buckets[r["bucket"]] = buckets.get(r["bucket"], 0) + 1

    # NWFF diagnosis
    nwff = [
        st
        for st in opps
        if str(st.get("source") or "").lower() == "nwff"
    ]
    nwff_keys = sorted({st.get("showtime_film_key") for st in nwff})
    nwff_films = [films_by_key[k] for k in nwff_keys if k in films_by_key]
    nwff_matched = sum(1 for f in nwff_films if f.get("film_id"))
    nwff_diag = {
        "showtimes": len(nwff),
        "unique_films": len(nwff_films),
        "matched_films": nwff_matched,
        "unmatched_titles": [
            {
                "title": f.get("title"),
                "key": f.get("showtime_film_key"),
                "film_id": f.get("film_id"),
                "variant": f.get("screening_variant_type"),
            }
            for f in nwff_films
        ],
    }
    diag_path = ROOT / "data" / "audits" / "nwff_match_rate_diagnosis.json"
    diag_path.write_text(json.dumps(nwff_diag, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "shortlist_csv": str(out_csv),
                "bucket_counts": buckets,
                "review_now": [
                    {
                        "title": r["source_title"],
                        "showtimes": r["showtime_count"],
                        "venues": r["venue_count"],
                        "sources": r["theater_sources"],
                        "score": r["rank_score"],
                    }
                    for r in now
                ],
                "nwff": {
                    "unique_films": nwff_diag["unique_films"],
                    "matched_films": nwff_diag["matched_films"],
                    "titles": [t["title"] for t in nwff_diag["unmatched_titles"]],
                },
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
