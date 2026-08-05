#!/usr/bin/env python3
"""Audit TMDB enrichment field coverage for confirmed film identities (T-ENR-01A).

Examples:
  python scripts/audit_tmdb_enrichment.py --limit 5
  python scripts/audit_tmdb_enrichment.py --refresh-cache
  python scripts/audit_tmdb_enrichment.py --dry-run-identities-only
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.enrichment import (  # noqa: E402
    COVERAGE_REL,
    build_coverage_report,
    confirmed_tmdb_films,
    extract_enrichment_fields,
    field_presence,
    load_catalog,
    write_coverage,
)
from reel_seattle.film_identity.cache import TmdbResponseCache  # noqa: E402
from reel_seattle.film_identity.env_local import load_dotenv_local  # noqa: E402
from reel_seattle.film_identity.security import sanitize_error_message  # noqa: E402
from reel_seattle.film_identity.tmdb_client import (  # noqa: E402
    TmdbAuthError,
    TmdbClient,
    resolve_tmdb_auth,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit TMDB enrichment coverage.")
    parser.add_argument("--catalog-path", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / COVERAGE_REL)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--refresh-cache", action="store_true")
    parser.add_argument(
        "--dry-run-identities-only",
        action="store_true",
        help="List confirmed TMDB ids and write empty coverage without live calls.",
    )
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="Print summary only; do not write coverage JSON.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    load_dotenv_local(PROJECT_ROOT)
    args = parse_args(argv)
    catalog = load_catalog(args.catalog_path)
    films = confirmed_tmdb_films(catalog)
    if args.limit is not None:
        films = films[: max(0, args.limit)]

    if args.dry_run_identities_only:
        report = build_coverage_report(
            films=films,
            field_hits={},
            errors=[],
            live_run=False,
            limit=args.limit,
        )
        report["notes"] = list(report["notes"]) + [
            "dry-run-identities-only: no TMDB HTTP calls were made."
        ]
        _print_summary(report)
        if not args.no_write:
            path = write_coverage(report, args.output)
            print(f"Wrote {path}")
        return 0

    try:
        auth = resolve_tmdb_auth(require=True)
    except TmdbAuthError as exc:
        print(str(exc), file=sys.stderr)
        print(
            "Hint: set TMDB_READ_ACCESS_TOKEN in the environment or .env.local, "
            "or pass --dry-run-identities-only.",
            file=sys.stderr,
        )
        return 2

    client = TmdbClient(
        auth,
        cache=TmdbResponseCache(PROJECT_ROOT),
        refresh=args.refresh_cache,
    )
    field_hits: dict[str, int] = {}
    errors: list[dict[str, Any]] = []
    for row in films:
        tmdb_id = int(row["tmdb_id"])
        try:
            # movie_details appends external_ids,credits (identity client).
            details = client.movie_details(tmdb_id)
            extracted = extract_enrichment_fields(details)
            presence = field_presence(extracted)
            for key, ok in presence.items():
                if ok:
                    field_hits[key] = field_hits.get(key, 0) + 1
        except Exception as exc:  # noqa: BLE001
            errors.append(
                {
                    "tmdb_id": tmdb_id,
                    "error": sanitize_error_message(str(exc)),
                }
            )

    report = build_coverage_report(
        films=films,
        field_hits=field_hits,
        errors=errors,
        live_run=True,
        limit=args.limit,
    )
    _print_summary(report)
    if not args.no_write:
        path = write_coverage(report, args.output)
        print(f"Wrote {path}")
    return 0


def _print_summary(report: dict[str, Any]) -> None:
    print(
        f"Confirmed TMDB films: {report['total_confirmed_tmdb_films']} "
        f"(live_run={report['live_run']}, errors={report['error_count']})"
    )
    for field, row in (report.get("field_coverage") or {}).items():
        print(
            f"  {field}: {row['present']}/{report['total_confirmed_tmdb_films']} "
            f"({row['rate']:.1%})"
        )


if __name__ == "__main__":
    raise SystemExit(main())
