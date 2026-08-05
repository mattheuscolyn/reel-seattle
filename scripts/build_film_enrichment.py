#!/usr/bin/env python3
"""Build public TMDB film enrichment artifact (T-ENR-01B).

Examples:
  python scripts/build_film_enrichment.py
  python scripts/build_film_enrichment.py --limit 5
  python scripts/build_film_enrichment.py --refresh-cache
  python scripts/build_film_enrichment.py --offline
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.enrichment.audit import load_catalog  # noqa: E402
from reel_seattle.enrichment.constants import (  # noqa: E402
    PUBLIC_ARTIFACT_REL,
    REPORT_REL,
)
from reel_seattle.enrichment.pipeline import (  # noqa: E402
    build_enrichment_artifact,
    load_prior_artifact,
    write_enrichment_outputs,
)
from reel_seattle.film_identity.cache import TmdbResponseCache  # noqa: E402
from reel_seattle.film_identity.env_local import load_dotenv_local  # noqa: E402
from reel_seattle.film_identity.tmdb_client import (  # noqa: E402
    TmdbAuthError,
    TmdbClient,
    resolve_tmdb_auth,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build public/data/film_enrichment_current.json from confirmed TMDB identities."
    )
    parser.add_argument("--catalog-path", type=Path, default=None)
    parser.add_argument(
        "--artifact-path",
        type=Path,
        default=PROJECT_ROOT / PUBLIC_ARTIFACT_REL,
    )
    parser.add_argument(
        "--report-path",
        type=Path,
        default=PROJECT_ROOT / REPORT_REL,
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--tmdb-id", type=int, default=None)
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Bypass TMDB response cache and treat prior rows as stale.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Reuse prior artifact rows only; no live TMDB calls.",
    )
    parser.add_argument(
        "--no-top-cast",
        action="store_true",
        help="Omit top_cast (emit empty arrays).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and validate in memory; do not write artifact or report.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    load_dotenv_local(PROJECT_ROOT)
    args = parse_args(argv)
    catalog = load_catalog(args.catalog_path)
    prior = load_prior_artifact(args.artifact_path)

    client: TmdbClient | None = None
    if not args.offline:
        try:
            auth = resolve_tmdb_auth(require=True)
        except TmdbAuthError as exc:
            print(str(exc), file=sys.stderr)
            print(
                "Hint: set TMDB_READ_ACCESS_TOKEN in the environment or .env.local, "
                "or pass --offline to reuse the prior artifact.",
                file=sys.stderr,
            )
            return 2
        client = TmdbClient(
            auth,
            cache=TmdbResponseCache(PROJECT_ROOT),
            refresh=args.refresh_cache,
        )

    artifact, metrics = build_enrichment_artifact(
        catalog=catalog,
        prior=prior,
        client=client,
        refresh=args.refresh_cache,
        offline=args.offline,
        limit=args.limit,
        only_tmdb_id=args.tmdb_id,
        include_top_cast=not args.no_top_cast,
    )

    if args.dry_run:
        from reel_seattle.enrichment.validate import validate_film_enrichment_document

        validate_film_enrichment_document(artifact)
        print(json.dumps({**metrics, "validation_status": "ok", "dry_run": True}, indent=2))
        return 0

    try:
        report = write_enrichment_outputs(
            artifact,
            metrics,
            artifact_path=args.artifact_path,
            report_path=args.report_path,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Enrichment write failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"status={report.get('status')} emitted={report.get('emitted_rows')} "
        f"fresh={report.get('fresh_fetch_count')} reuse={report.get('cache_reuse_count')} "
        f"retained={report.get('retained_last_good_count')} "
        f"missing={report.get('missing_first_fetch_count')} "
        f"failed={report.get('failed_fetch_count')}"
    )
    print(f"Wrote {args.artifact_path}")
    print(f"Wrote {args.report_path}")
    if report.get("status") == "failed":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
