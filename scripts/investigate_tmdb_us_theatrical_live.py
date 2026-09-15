#!/usr/bin/env python3
"""Run the live TMDB Discover query for upcoming US theatrical releases.

Query under test (exactly as reported in the artifact)::

    GET /discover/movie
        region=US
        with_release_type=2|3
        release_date.gte=<Pacific today>
        release_date.lte=<Pacific today + 90d>
        sort_by=release_date.asc
        include_adult=false
        language=en-US

Reports raw vs valid candidate counts, AMC overlap, Reel Seattle overlap,
TMDB-only counts with representative titles, poster availability, questionable
candidates, and 30/60/90-day horizons.

TMDB credentials come from the environment. Nothing derived from them is
printed or serialized; the client keeps bearer tokens in headers and all
recorded strings pass through the live-audit sanitizer.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Mapping

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from reel_seattle.emit.coming_soon_live import (
    HORIZONS,
    load_amc_theater_bookings,
    load_reel_seattle_scheduled,
    match_key,
    pacific_today,
)
from reel_seattle.film_identity.tmdb_client import (
    TmdbAuthError,
    TmdbClient,
    resolve_tmdb_auth,
)
from reel_seattle.live_audit_security import (
    credential_presence,
    scrub_text,
    write_sanitized_json,
)

SCHEMA_VERSION = "1.0.0"

DISCOVER_PATH = "/discover/movie"
RELEASE_TYPES = "2|3"
REGION = "US"

LOW_POPULARITY_THRESHOLD = 1.0
UNVETTED_POPULARITY_THRESHOLD = 3.0


def discover_params(*, start: date, end: date, page: int) -> dict[str, Any]:
    return {
        "page": page,
        "include_adult": "false",
        "language": "en-US",
        "region": REGION,
        "release_date.gte": start.isoformat(),
        "release_date.lte": end.isoformat(),
        "with_release_type": RELEASE_TYPES,
        "sort_by": "release_date.asc",
    }


def fetch_discover(
    client: TmdbClient,
    *,
    start: date,
    end: date,
    max_pages: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Page through Discover, recording pagination facts."""
    rows: list[dict[str, Any]] = []
    pagination: dict[str, Any] = {
        "pages_fetched": 0,
        "max_pages": max_pages,
        "total_results_reported": None,
        "total_pages_reported": None,
        "exhausted": False,
        "errors": [],
    }

    for page in range(1, max_pages + 1):
        try:
            response = client._request("discover", DISCOVER_PATH, discover_params(start=start, end=end, page=page))
        except Exception as exc:  # noqa: BLE001 - recorded as sanitized evidence
            pagination["errors"].append(
                {"page": page, "error": scrub_text(f"{type(exc).__name__}: {exc}"[:300])}
            )
            break

        results = [row for row in response.get("results", []) if isinstance(row, Mapping)]
        if page == 1:
            pagination["total_results_reported"] = response.get("total_results")
            pagination["total_pages_reported"] = response.get("total_pages")

        rows.extend(dict(row) for row in results)
        pagination["pages_fetched"] = page

        total_pages = response.get("total_pages") or 0
        if not results or page >= total_pages:
            pagination["exhausted"] = True
            break
    else:
        pagination["stopped_reason"] = f"hit max_pages={max_pages}"

    pagination["rows_collected"] = len(rows)
    return rows, pagination


def _parse_date(value: Any) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def classify_candidate(
    row: Mapping[str, Any],
    *,
    start: date,
    end: date,
) -> dict[str, Any]:
    """Project one Discover row and record validity + quality flags."""
    title = scrub_text(str(row.get("title") or "").strip())
    release_date = _parse_date(row.get("release_date"))
    popularity = row.get("popularity") or 0.0
    vote_count = row.get("vote_count") or 0
    has_poster = bool(row.get("poster_path"))

    invalid_reasons: list[str] = []
    if row.get("id") is None:
        invalid_reasons.append("missing_tmdb_id")
    if not title:
        invalid_reasons.append("missing_title")
    if release_date is None:
        invalid_reasons.append("unparseable_release_date")
    elif not (start <= release_date <= end):
        invalid_reasons.append("release_date_outside_window")
    if row.get("adult") is True:
        invalid_reasons.append("adult_flagged")

    quality_flags: list[str] = []
    if not has_poster:
        quality_flags.append("missing_poster")
    if float(popularity) < LOW_POPULARITY_THRESHOLD:
        quality_flags.append("very_low_popularity")
    if not str(row.get("overview") or "").strip():
        quality_flags.append("missing_overview")
    if int(vote_count) == 0 and float(popularity) < UNVETTED_POPULARITY_THRESHOLD:
        quality_flags.append("no_votes_and_low_popularity")

    return {
        "tmdb_id": row.get("id"),
        "title": title,
        "original_title": scrub_text(str(row.get("original_title") or "")),
        "original_language": row.get("original_language"),
        "release_date": release_date.isoformat() if release_date else None,
        "popularity": round(float(popularity), 2),
        "vote_count": int(vote_count),
        "has_poster": has_poster,
        "match_key": match_key(title),
        "valid": not invalid_reasons,
        "invalid_reasons": invalid_reasons,
        "quality_flags": quality_flags,
    }


def load_amc_catalog_keys(path: Path | str) -> tuple[set[str], dict[str, Any]]:
    """Read AMC catalog match keys from the AMC investigation artifact."""
    amc_path = Path(path)
    if not amc_path.exists():
        return set(), {"available": False, "reason": f"{amc_path} not found"}
    payload = json.loads(amc_path.read_text(encoding="utf-8"))
    catalog = payload.get("catalog") or {}
    keys = {match_key(str(movie.get("name") or "")) for movie in catalog.get("movies") or []}
    keys.discard("")
    return keys, {
        "available": True,
        "accessible": bool(catalog.get("accessible")),
        "endpoint": catalog.get("selected_endpoint"),
        "title_count": len(catalog.get("movies") or []),
    }


def summarize(
    candidates: list[dict[str, Any]],
    *,
    amc_catalog_keys: set[str],
    amc_booking_keys: set[str],
    reel_seattle_keys: set[str],
) -> dict[str, int]:
    valid = [c for c in candidates if c["valid"]]
    catalog_overlap = [c for c in valid if c["match_key"] in amc_catalog_keys]
    booking_overlap = [c for c in valid if c["match_key"] in amc_booking_keys]
    amc_any = [c for c in valid if c["match_key"] in (amc_catalog_keys | amc_booking_keys)]
    reel_overlap = [c for c in valid if c["match_key"] in reel_seattle_keys]
    tmdb_only = [
        c
        for c in valid
        if c["match_key"] not in (amc_catalog_keys | amc_booking_keys | reel_seattle_keys)
    ]
    return {
        "raw_candidates": len(candidates),
        "valid_candidates": len(valid),
        "invalid_candidates": len(candidates) - len(valid),
        "with_poster": sum(1 for c in valid if c["has_poster"]),
        "without_poster": sum(1 for c in valid if not c["has_poster"]),
        "amc_coming_soon_catalog_overlap": len(catalog_overlap),
        "amc_theater_booking_overlap": len(booking_overlap),
        "amc_overlap_any": len(amc_any),
        "reel_seattle_overlap": len(reel_overlap),
        "tmdb_only": len(tmdb_only),
        "questionable_candidates": sum(1 for c in valid if c["quality_flags"]),
    }


def horizon_summaries(
    candidates: list[dict[str, Any]],
    *,
    today: date,
    amc_catalog_keys: set[str],
    amc_booking_keys: set[str],
    reel_seattle_keys: set[str],
    horizons: Iterable[int] = HORIZONS,
) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for days in horizons:
        cutoff = today + timedelta(days=days)
        subset = [
            c
            for c in candidates
            if c["release_date"] and date.fromisoformat(c["release_date"]) <= cutoff
        ]
        result[f"{days}_days"] = summarize(
            subset,
            amc_catalog_keys=amc_catalog_keys,
            amc_booking_keys=amc_booking_keys,
            reel_seattle_keys=reel_seattle_keys,
        )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="audit-output")
    parser.add_argument(
        "--amc-investigation",
        default=None,
        help="AMC investigation artifact for catalog overlap (defaults to <output-dir>/amc_coming_soon_endpoint_investigation.json)",
    )
    parser.add_argument("--amc-log", default=None, help="AMC daily scrape log (defaults to newest)")
    parser.add_argument("--logs-dir", default="data/daily_logs")
    parser.add_argument("--showtimes", default="public/data/showtimes_current.json")
    parser.add_argument("--window-days", type=int, default=90)
    parser.add_argument("--max-pages", type=int, default=30)
    args = parser.parse_args()

    presence = credential_presence()
    print("TMDB US theatrical investigation (live)")
    print(f"  credential presence: {json.dumps(presence)}")

    today = pacific_today()
    window_end = today + timedelta(days=args.window_days)

    amc_investigation_path = Path(
        args.amc_investigation
        or Path(args.output_dir) / "amc_coming_soon_endpoint_investigation.json"
    )
    amc_catalog_keys, amc_catalog_meta = load_amc_catalog_keys(amc_investigation_path)

    if args.amc_log:
        amc_log_path = Path(args.amc_log)
    else:
        logs = sorted(Path(args.logs_dir).glob("*_amc.json"))
        amc_log_path = logs[-1] if logs else Path(args.logs_dir) / "missing_amc.json"

    amc_bookings = load_amc_theater_bookings(amc_log_path, today=today, window_end=window_end)
    reel_seattle = load_reel_seattle_scheduled(args.showtimes, today=today)
    amc_booking_keys = set(amc_bookings)
    reel_seattle_keys = set(reel_seattle)

    print(f"  AMC catalog keys for overlap: {len(amc_catalog_keys)} (accessible={amc_catalog_meta.get('accessible')})")
    print(f"  AMC theater booking keys: {len(amc_booking_keys)}")
    print(f"  Reel Seattle scheduled keys: {len(reel_seattle_keys)}")

    query_record: dict[str, Any] = {
        "endpoint": DISCOVER_PATH,
        "params": discover_params(start=today, end=window_end, page="1..N"),
        "region": REGION,
        "release_types": RELEASE_TYPES,
        "window": {
            "start_date": today.isoformat(),
            "end_date": window_end.isoformat(),
            "days": args.window_days,
            "timezone": "America/Los_Angeles",
        },
        "executed": False,
    }

    auth = None
    auth_error = None
    try:
        auth = resolve_tmdb_auth(require=True)
    except TmdbAuthError as exc:
        auth_error = scrub_text(str(exc))

    candidates: list[dict[str, Any]] = []
    pagination: dict[str, Any] = {"pages_fetched": 0}

    if auth is not None:
        # cache=None forces live HTTP for every page.
        client = TmdbClient(auth, cache=None)
        rows, pagination = fetch_discover(
            client,
            start=today,
            end=window_end,
            max_pages=args.max_pages,
        )
        query_record["executed"] = bool(pagination.get("pages_fetched"))
        candidates = [classify_candidate(row, start=today, end=window_end) for row in rows]
        print(
            f"  discover returned {pagination.get('total_results_reported')} total results "
            f"across {pagination.get('total_pages_reported')} pages; "
            f"fetched {pagination.get('pages_fetched')} pages ({len(candidates)} rows)"
        )
    else:
        print(f"  TMDB auth unavailable: {auth_error}")

    counts = summarize(
        candidates,
        amc_catalog_keys=amc_catalog_keys,
        amc_booking_keys=amc_booking_keys,
        reel_seattle_keys=reel_seattle_keys,
    )

    valid = [c for c in candidates if c["valid"]]
    for candidate in valid:
        candidate["overlap"] = {
            "amcComingSoonCatalog": candidate["match_key"] in amc_catalog_keys,
            "amcTheaterBooking": candidate["match_key"] in amc_booking_keys,
            "reelSeattleScheduled": candidate["match_key"] in reel_seattle_keys,
        }

    tmdb_only = [
        c
        for c in valid
        if not any(c["overlap"].values())
    ]
    representative = sorted(tmdb_only, key=lambda c: c["popularity"], reverse=True)[:25]
    questionable = sorted(
        (c for c in valid if c["quality_flags"]),
        key=lambda c: (-len(c["quality_flags"]), c["popularity"]),
    )[:25]

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "artifact": "tmdb_us_theatrical_investigation",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "pacific_today": today.isoformat(),
        "evidence_concept": "tmdbUsTheatrical",
        "credentials": {
            "presence": presence,
            "auth_mode": auth.mode if auth else None,
            "auth_available": auth is not None,
            "auth_error": auth_error,
        },
        "query": query_record,
        "pagination": pagination,
        "counts": counts,
        "horizons": horizon_summaries(
            candidates,
            today=today,
            amc_catalog_keys=amc_catalog_keys,
            amc_booking_keys=amc_booking_keys,
            reel_seattle_keys=reel_seattle_keys,
        ),
        "overlap_inputs": {
            "amc_coming_soon_catalog": {
                **amc_catalog_meta,
                "source": str(amc_investigation_path),
                "keys": len(amc_catalog_keys),
            },
            "amc_theater_booking": {"source": str(amc_log_path), "keys": len(amc_booking_keys)},
            "reel_seattle_scheduled": {"source": str(args.showtimes), "keys": len(reel_seattle_keys)},
        },
        "representative_tmdb_only_titles": representative,
        "questionable_candidates": questionable,
        "candidates": valid,
        "invalid_candidates": [c for c in candidates if not c["valid"]][:50],
    }

    output_path = Path(args.output_dir) / "tmdb_us_theatrical_investigation.json"
    write_sanitized_json(output_path, artifact)
    print(f"  wrote {output_path}")
    print(f"  counts: {json.dumps(counts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
