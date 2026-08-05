#!/usr/bin/env python3
"""Explain TMDB candidate scoring for one source identity (T-FILMID-01E).

Examples:
  python scripts/explain_tmdb_match.py --title "Only Yesterday 35th Anniversary - Studio Ghibli Fest 2026"
  python scripts/explain_tmdb_match.py --source amc --source-film-id 83588
  python scripts/explain_tmdb_match.py --title "Moana" --offline-candidate-json path.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.eligibility import classify_eligibility  # noqa: E402
from reel_seattle.film_identity.env_local import load_dotenv_local  # noqa: E402
from reel_seattle.film_identity.inventory import inventory_source_identities  # noqa: E402
from reel_seattle.film_identity.normalize_text import parse_person_names  # noqa: E402
from reel_seattle.film_identity.presentation import interpret_source_years  # noqa: E402
from reel_seattle.film_identity.scoring import (  # noqa: E402
    classify_match_bucket,
    rank_candidates,
    score_candidate,
    top_candidate_margin,
)
from reel_seattle.film_identity.tmdb_client import (  # noqa: E402
    TmdbAuthError,
    TmdbClient,
    candidate_from_search_result,
    enrich_candidate_from_details,
    resolve_tmdb_auth,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Explain TMDB match scoring.")
    parser.add_argument("--title", default=None)
    parser.add_argument("--source", default=None)
    parser.add_argument("--source-film-id", default=None)
    parser.add_argument("--runtime", type=int, default=None)
    parser.add_argument("--directors", default=None)
    parser.add_argument("--product-year", type=int, default=None)
    parser.add_argument(
        "--offline-candidate-json",
        type=Path,
        default=None,
        help="JSON list of TMDB-like candidate objects (no live API).",
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    load_dotenv_local(PROJECT_ROOT)
    args = parse_args(argv)
    identity = _resolve_identity(args)
    eligibility = classify_eligibility(source_title=identity["source_title"])
    years = interpret_source_years(
        source_title=identity["source_title"],
        product_year=identity.get("product_year"),
    )
    search_title = eligibility.search_title or years.base_title or identity["source_title"]
    scoring_year = years.scoring_year()

    payload: dict[str, Any] = {
        "source_title": identity["source_title"],
        "normalized_search_title": search_title,
        "eligibility": eligibility.status,
        "entity_kind": eligibility.entity_kind,
        "eligibility_reasons": list(eligibility.reasons),
        "year_interpretation": years.to_dict(),
        "directors_raw": identity.get("directors_raw"),
        "directors_normalized": parse_person_names(identity.get("directors_raw")),
        "runtime_min": identity.get("runtime_min"),
        "candidates": [],
        "bucket": None,
        "top_candidate_margin": None,
        "auto_confirm_eligible": False,
        "review_eligible": False,
    }

    candidates = _load_candidates(args, search_title=str(search_title or ""), year=scoring_year)
    scored = [
        score_candidate(
            search_title=str(search_title or ""),
            source_year=scoring_year,
            source_runtime=identity.get("runtime_min"),
            source_directors=identity.get("directors_raw"),
            source_external_ids=None,
            candidate=row,
            event_year_relaxed=years.event_year_not_canonical,
        )
        for row in candidates
    ]
    ranked = rank_candidates(scored)
    bucket, proposed = classify_match_bucket(ranked)
    payload["bucket"] = bucket
    payload["top_candidate_margin"] = top_candidate_margin(ranked)
    payload["auto_confirm_eligible"] = bucket == "auto"
    payload["review_eligible"] = bucket in {"auto", "review"}
    payload["candidates"] = [
        {
            "tmdb_id": c.tmdb_id,
            "title": c.title,
            "release_year": c.release_year,
            "score": c.score,
            "warnings": list(c.warnings),
            "signals": c.signals,
            "director": c.director,
        }
        for c in ranked[:8]
    ]
    if proposed:
        payload["proposed_tmdb_id"] = proposed.tmdb_id
        payload["proposed_score"] = proposed.score

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    _print_human(payload)
    return 0


def _resolve_identity(args: argparse.Namespace) -> dict[str, Any]:
    if args.source and args.source_film_id:
        inventory = inventory_source_identities(root=PROJECT_ROOT)
        for row in inventory.get("identities") or []:
            if (
                row.get("source") == args.source
                and str(row.get("source_film_id") or "") == str(args.source_film_id)
            ):
                return {
                    "source_title": row.get("source_title"),
                    "runtime_min": row.get("runtime_min"),
                    "directors_raw": row.get("directors_raw"),
                    "product_year": (row.get("year_interpretation") or {}).get("product_year"),
                }
        raise SystemExit(f"No inventory row for {args.source}:{args.source_film_id}")
    if not args.title:
        raise SystemExit("Provide --title or --source + --source-film-id")
    return {
        "source_title": args.title,
        "runtime_min": args.runtime,
        "directors_raw": args.directors,
        "product_year": args.product_year,
    }


def _load_candidates(
    args: argparse.Namespace,
    *,
    search_title: str,
    year: int | None,
) -> list[dict[str, Any]]:
    if args.offline_candidate_json:
        data = json.loads(args.offline_candidate_json.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "candidates" in data:
            data = data["candidates"]
        if not isinstance(data, list):
            raise SystemExit("offline candidate JSON must be a list")
        return [row for row in data if isinstance(row, dict) and row.get("id") is not None]
    try:
        auth = resolve_tmdb_auth(require=True)
    except TmdbAuthError as exc:
        raise SystemExit(str(exc)) from exc
    client = TmdbClient(auth)
    search = client.search_movie(search_title, year=year)
    results = [
        candidate_from_search_result(row)
        for row in (search.get("results") or [])[:8]
        if isinstance(row, dict) and row.get("id") is not None
    ]
    if not results and year is not None:
        search = client.search_movie(search_title, year=None)
        results = [
            candidate_from_search_result(row)
            for row in (search.get("results") or [])[:8]
            if isinstance(row, dict) and row.get("id") is not None
        ]
    enriched: list[dict[str, Any]] = []
    for row in results[:5]:
        try:
            details = client.movie_details(int(row["id"]))
            enriched.append(enrich_candidate_from_details(row, details))
        except Exception:  # noqa: BLE001
            enriched.append(dict(row))
    return enriched


def _print_human(payload: dict[str, Any]) -> None:
    print(f"source_title: {payload['source_title']}")
    print(f"normalized_search_title: {payload['normalized_search_title']}")
    print(f"eligibility: {payload['eligibility']} ({payload['entity_kind']})")
    print(f"reasons: {', '.join(payload['eligibility_reasons']) or '—'}")
    years = payload["year_interpretation"]
    print(
        "years: "
        f"canonical={years.get('canonical_year_candidate')} "
        f"event={years.get('event_year')} "
        f"anniversary={years.get('anniversary_years')} "
        f"confidence={years.get('year_confidence')}"
    )
    print(f"presentation_labels: {', '.join(years.get('presentation_labels') or []) or '—'}")
    print(
        f"directors: raw={payload.get('directors_raw')!r} "
        f"normalized={payload.get('directors_normalized')}"
    )
    print(
        f"bucket={payload['bucket']} margin={payload['top_candidate_margin']} "
        f"auto={payload['auto_confirm_eligible']} review={payload['review_eligible']}"
    )
    for row in payload["candidates"]:
        print(
            f"- tmdb:{row['tmdb_id']} {row['title']} ({row['release_year']}) "
            f"score={row['score']} warnings={row['warnings']}"
        )
        contrib = (row.get("signals") or {}).get("contributions") or {}
        for name, meta in contrib.items():
            print(
                f"    {name}: weight={meta.get('weight')} matched={meta.get('matched')} "
                f"kind={meta.get('kind')}"
            )


if __name__ == "__main__":
    raise SystemExit(main())
