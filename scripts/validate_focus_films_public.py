#!/usr/bin/env python3
"""Validate focus films against final public artifacts only."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

FOCUS = (
    "one-night-only",
    "exorcist-ii-the-heretic",
    "spider-man-brand-new-day",
    "spider-man-brand-new-day-sensory-friendly-screening",
)


def main() -> int:
    showtimes = json.loads(
        (PROJECT_ROOT / "public/data/showtimes_current.json").read_text(encoding="utf-8")
    )
    enrichment = json.loads(
        (PROJECT_ROOT / "public/data/film_enrichment_current.json").read_text(
            encoding="utf-8"
        )
    )
    by_key = {f["showtime_film_key"]: f for f in showtimes["films"]}
    by_id = {r["film_id"]: r for r in enrichment["films"]}
    aliases = {}
    for f in showtimes["films"]:
        fid = f.get("film_id")
        if fid:
            aliases.setdefault(fid, []).append(f["showtime_film_key"])

    out = []
    errors = []
    for key in FOCUS:
        film = by_key.get(key)
        if not film:
            errors.append(f"missing film {key}")
            continue
        fid = film.get("film_id")
        row = by_id.get(fid) if fid else None
        if not fid:
            errors.append(f"{key}: missing film_id")
        if not row:
            errors.append(f"{key}: missing enrichment for {fid}")
        record = {
            "showtime_film_key": key,
            "film_id": fid,
            "canonical_title": (row or {}).get("display_title"),
            "source_title": film.get("title"),
            "parent_film_key": film.get("parent_film_key"),
            "screening_variant_type": film.get("screening_variant_type"),
            "is_special_screening": film.get("is_special_screening"),
            "source_aliases": aliases.get(fid, []),
            "poster": bool((row or {}).get("poster")),
            "backdrop": bool((row or {}).get("backdrop")),
            "release_year": (row or {}).get("release_year"),
            "runtime_minutes": (row or {}).get("runtime_minutes"),
            "us_certification": (row or {}).get("us_certification"),
            "genres": [g.get("name") for g in ((row or {}).get("genres") or [])],
            "synopsis": bool((row or {}).get("overview")),
            "director": [d.get("name") for d in ((row or {}).get("directors") or [])],
        }
        for required in (
            "film_id",
            "canonical_title",
            "poster",
            "backdrop",
            "release_year",
            "runtime_minutes",
            "us_certification",
            "synopsis",
        ):
            if not record.get(required):
                errors.append(f"{key}: missing {required}")
        if not record["genres"] or not record["director"]:
            errors.append(f"{key}: missing genres/director")
        out.append(record)

    spider = [r for r in out if "spider-man" in r["showtime_film_key"]]
    if len(spider) == 2:
        if spider[0]["film_id"] != spider[1]["film_id"]:
            errors.append("Spider-Man standard/sensory do not share film_id")
        sensory = next(
            r
            for r in spider
            if r["showtime_film_key"].endswith("sensory-friendly-screening")
        )
        if sensory["screening_variant_type"] != "sensory_friendly":
            errors.append("sensory row missing screening_variant_type")
        if sensory["canonical_title"] != "Spider-Man: Brand New Day":
            errors.append("sensory canonical title incorrect")

    path = PROJECT_ROOT / "data/audits/canonical_focus_films_public_artifact_check.json"
    path.write_text(
        json.dumps({"ok": not errors, "errors": errors, "films": out}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": not errors, "errors": errors, "path": str(path)}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
