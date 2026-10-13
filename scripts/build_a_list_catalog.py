#!/usr/bin/env python3
"""Export a minimal, allowlisted AMC A-List planning feed.

The durable AMC source catalog is INTERNAL. Never copy it to public/data.
Only product identity, explicit AMC A-List eligibility, release date, and a
predefined presentation category are exported. No raw API payload or secrets.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

SOURCE = Path("data/source_catalog/amc_movie_products.json")
TARGET = Path("public/data/a_list_catalog_current.json")
PRESENTATION_KINDS = {
    "standard", "anniversary_or_rerelease", "concert_or_event",
    "mystery_screening", "other_special",
}

def build_public_a_list_catalog(catalog: dict) -> dict:
    if not isinstance(catalog, dict) or not isinstance(catalog.get("products"), list):
        raise ValueError("Missing AMC product catalog")
    generated = catalog.get("generated_at")
    if not isinstance(generated, str) or not generated:
        raise ValueError("Missing catalog generated_at")
    products = []
    ids = set()
    for item in catalog["products"]:
        if not isinstance(item, dict):
            continue
        movie_id = str(item.get("source_film_id") or "").strip()
        eligible = item.get("available_for_a_list")
        if not movie_id.isdecimal() or eligible is not True and eligible is not False:
            continue
        if movie_id in ids:
            raise ValueError(f"Duplicate AMC product ID: {movie_id}")
        ids.add(movie_id)
        raw_date = item.get("release_date_utc")
        release_date = raw_date[:10] if isinstance(raw_date, str) and len(raw_date) >= 10 else None
        category = (item.get("presentation") or {}).get("category")
        kind = category if category in PRESENTATION_KINDS else "unknown"
        products.append({
            "amc_movie_id": movie_id,
            "a_list_eligible": eligible,
            "release_date": release_date,
            "presentation_kind": kind,
        })
    if not products:
        raise ValueError("No products with explicit A-List eligibility (retain previous feed)")
    products.sort(key=lambda p: int(p["amc_movie_id"]))
    return {"schema_version": 1, "generated_at": generated, "products": products}

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=TARGET)
    args = parser.parse_args()
    document = build_public_a_list_catalog(json.loads(args.source.read_text(encoding="utf-8")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Published {len(document['products'])} AMC product eligibility records")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
