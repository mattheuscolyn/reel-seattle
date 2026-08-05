#!/usr/bin/env python3
"""Build current-window canonical film / enrichment diagnostics + review CSV."""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.public_emit import (  # noqa: E402
    attach_public_film_ids,
    load_identity_catalog,
)
from reel_seattle.validate import PROJECT_ROOT as ROOT  # noqa: E402

FOCUS_KEYS = (
    "one-night-only",
    "exorcist-ii-the-heretic",
    "spider-man-brand-new-day",
    "spider-man-brand-new-day-sensory-friendly-screening",
)


def _load(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    showtimes_path = ROOT / "public" / "data" / "showtimes_current.json"
    enrichment_path = ROOT / "public" / "data" / "film_enrichment_current.json"
    catalog = load_identity_catalog()
    showtimes_doc = _load(showtimes_path)
    enrichment_doc = _load(enrichment_path) if enrichment_path.exists() else {"films": []}

    films = [dict(f) for f in showtimes_doc.get("films") or []]
    showtimes = list(showtimes_doc.get("showtimes") or [])
    emit_report = attach_public_film_ids(films, showtimes, catalog=catalog)

    enrichment_by_id = {
        row["film_id"]: row
        for row in enrichment_doc.get("films") or []
        if isinstance(row, dict) and row.get("film_id")
    }

    by_source = Counter()
    matched_by_source = Counter()
    for st in showtimes:
        src = str(st.get("source") or "unknown")
        by_source[src] += 1
    film_by_key = {f["showtime_film_key"]: f for f in films}
    for st in showtimes:
        src = str(st.get("source") or "unknown")
        film = film_by_key.get(st.get("showtime_film_key"))
        if film and film.get("film_id"):
            matched_by_source[src] += 1

    complete_fields = (
        "display_title",
        "release_year",
        "runtime_minutes",
        "us_certification",
        "overview",
        "genres",
        "directors",
        "poster",
        "backdrop",
    )
    field_missing = Counter()
    complete_count = 0
    for film in films:
        fid = film.get("film_id")
        row = enrichment_by_id.get(fid) if fid else None
        if not row:
            continue
        ok = True
        for field in complete_fields:
            value = row.get(field)
            missing = value in (None, "", [])
            if field in {"genres", "directors"} and isinstance(value, list):
                missing = len(value) == 0
            if field in {"poster", "backdrop"} and isinstance(value, dict):
                missing = not value.get("path")
            if missing:
                field_missing[field] += 1
                ok = False
        if ok:
            complete_count += 1

    catalog_status = Counter(
        f.get("match_status") for f in ((catalog or {}).get("films") or [])
    )
    unique_tmdb = {f.get("film_id") for f in films if f.get("film_id")}
    showtime_only = sum(1 for f in films if not f.get("film_id"))

    aliases = defaultdict(list)
    for f in films:
        if f.get("film_id"):
            aliases[f["film_id"]].append(f["showtime_film_key"])
    duplicate_canonical = sum(1 for keys in aliases.values() if len(keys) > 1)

    focus_rows = []
    for key in FOCUS_KEYS:
        film = film_by_key.get(key)
        if not film:
            focus_rows.append({"showtime_film_key": key, "status": "missing_from_window"})
            continue
        fid = film.get("film_id")
        enr = enrichment_by_id.get(fid) if fid else None
        venues = {
            st.get("theater_id")
            for st in showtimes
            if st.get("showtime_film_key") == key and st.get("theater_id")
        }
        show_count = sum(1 for st in showtimes if st.get("showtime_film_key") == key)
        focus_rows.append(
            {
                "showtime_film_key": key,
                "source_title": film.get("title"),
                "canonical_title": (enr or {}).get("display_title")
                or film.get("parent_display_title")
                or film.get("title"),
                "canonical_film_key": fid,
                "tmdb_id": (enr or {}).get("tmdb_id")
                or (int(str(fid).split(":")[1]) if fid and ":" in str(fid) else None),
                "match_status": "confirmed" if fid else "unmatched",
                "screening_variant_type": film.get("screening_variant_type"),
                "parent_film_key": film.get("parent_film_key"),
                "poster": bool((enr or {}).get("poster") or film.get("poster_url")),
                "backdrop": bool((enr or {}).get("backdrop")),
                "year": (enr or {}).get("release_year"),
                "runtime_minutes": (enr or {}).get("runtime_minutes")
                or film.get("runtime_min"),
                "us_certification": (enr or {}).get("us_certification"),
                "genres": [
                    g.get("name")
                    for g in ((enr or {}).get("genres") or [])
                    if isinstance(g, dict)
                ],
                "synopsis": bool((enr or {}).get("overview")),
                "director": [
                    d.get("name")
                    for d in ((enr or {}).get("directors") or [])
                    if isinstance(d, dict)
                ],
                "source_aliases": aliases.get(fid or "", [key]),
                "venue_count": len(venues),
                "showtime_count": show_count,
            }
        )

    unmatched_films = [f for f in films if not f.get("film_id")]
    review_items = []
    for film in unmatched_films:
        key = film["showtime_film_key"]
        related = [st for st in showtimes if st.get("showtime_film_key") == key]
        sources = sorted({str(st.get("source") or "") for st in related if st.get("source")})
        venues = sorted(
            {str(st.get("theater_id") or "") for st in related if st.get("theater_id")}
        )
        review_items.append(
            {
                "theater_sources": "|".join(sources),
                "source_film_key": film.get("source_film_id") or "",
                "showtime_film_key": key,
                "source_title": film.get("title") or "",
                "normalized_title": film.get("parent_display_title")
                or film.get("title")
                or "",
                "screening_variant_type": film.get("screening_variant_type") or "",
                "source_runtime": film.get("runtime_min") or "",
                "showtime_count": len(related),
                "venues": "|".join(venues),
                "current_identity": "",
                "suggested_action": "manual_review",
                "notes": "No confirmed public film_id in catalog emit.",
            }
        )

    out_dir = ROOT / "data" / "audits"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    report = {
        "generated_at": stamp,
        "unique_source_films_in_window": len(films),
        "canonical_tmdb_films_in_window": len(unique_tmdb),
        "public_film_id_attached": emit_report["non_null_film_id"],
        "public_film_id_null": emit_report["null_film_id"],
        "coverage_rate": emit_report["coverage_rate"],
        "showtime_or_source_identity_only": showtime_only,
        "catalog_match_status": dict(catalog_status),
        "enrichment_rows": len(enrichment_doc.get("films") or []),
        "enrichment_complete_for_attached_films": complete_count,
        "enrichment_field_missing_counts": dict(field_missing),
        "duplicate_canonical_alias_groups": duplicate_canonical,
        "match_rate_by_theater_source_showtimes": {
            src: {
                "showtimes": by_source[src],
                "matched_showtimes": matched_by_source[src],
                "rate": (matched_by_source[src] / by_source[src])
                if by_source[src]
                else 0.0,
            }
            for src in sorted(by_source)
        },
        "focus_films": focus_rows,
        "emit_report_summary": {
            "index_size": emit_report.get("index_size"),
            "collisions": emit_report.get("collisions"),
            "mapping_misses": emit_report.get("mapping_misses"),
            "per_source": emit_report.get("per_source"),
        },
        "manual_review_count": len(review_items),
    }

    json_path = out_dir / "canonical_film_current_window_report.json"
    json_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    csv_path = out_dir / "tmdb_match_manual_review_current.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "theater_sources",
                "source_film_key",
                "showtime_film_key",
                "source_title",
                "normalized_title",
                "screening_variant_type",
                "source_runtime",
                "showtime_count",
                "venues",
                "current_identity",
                "suggested_action",
                "notes",
            ],
        )
        writer.writeheader()
        writer.writerows(review_items)

    review_json = out_dir / "tmdb_match_manual_review_current.json"
    review_json.write_text(
        json.dumps(
            {
                "generated_at": stamp,
                "item_count": len(review_items),
                "items": review_items,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "report": str(json_path),
                "review_csv": str(csv_path),
                "summary": {
                    "films": report["unique_source_films_in_window"],
                    "with_film_id": report["public_film_id_attached"],
                    "complete": complete_count,
                    "review": len(review_items),
                },
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
