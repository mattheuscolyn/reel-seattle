#!/usr/bin/env python3
"""Match Reel Seattle Shorts to TMDB and stamp canonicalFilmId.

Does not match ShortsProgram entities. Does not invent Short screenings.
TMDB outages leave Shorts unresolved without aborting the shorts artifact.

Examples:
  python scripts/match_shorts_tmdb.py
  python scripts/match_shorts_tmdb.py --limit 5
  python scripts/match_shorts_tmdb.py --offline
  python scripts/match_shorts_tmdb.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.cache import TmdbResponseCache  # noqa: E402
from reel_seattle.film_identity.env_local import load_dotenv_local  # noqa: E402
from reel_seattle.film_identity.io_util import atomic_write_json  # noqa: E402
from reel_seattle.film_identity.tmdb_client import (  # noqa: E402
    TmdbAuthError,
    TmdbClient,
    resolve_tmdb_auth,
)
from reel_seattle.shorts_programs.artifact import DEFAULT_ARTIFACT_REL  # noqa: E402
from reel_seattle.shorts_programs.tmdb_match import (  # noqa: E402
    AUDIT_REL,
    match_shorts_artifact,
    write_shorts_match_audit,
)
from reel_seattle.validate import validate_against_schema  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Match Shorts in shorts_programs_current.json to TMDB IDs."
    )
    parser.add_argument(
        "--shorts-path",
        type=Path,
        default=PROJECT_ROOT / DEFAULT_ARTIFACT_REL,
    )
    parser.add_argument(
        "--audit-path",
        type=Path,
        default=PROJECT_ROOT / AUDIT_REL,
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Ignore cached TMDB responses for this run.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Do not call TMDB; preserve prior canonicalFilmId stamps.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Match in memory; do not write shorts artifact or audit.",
    )
    parser.add_argument(
        "--no-write-shorts",
        action="store_true",
        help="Write audit only; leave shorts_programs_current.json unchanged.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    load_dotenv_local(PROJECT_ROOT)
    args = parse_args(argv)

    if not args.shorts_path.is_file():
        print(f"Shorts artifact not found: {args.shorts_path}", file=sys.stderr)
        return 1

    with args.shorts_path.open(encoding="utf-8") as handle:
        artifact = json.load(handle)
    if not isinstance(artifact, dict):
        print("shorts artifact must be a JSON object", file=sys.stderr)
        return 1

    client: TmdbClient | None = None
    if not args.offline:
        try:
            auth = resolve_tmdb_auth(require=True)
        except TmdbAuthError as exc:
            print(str(exc), file=sys.stderr)
            print(
                "Hint: set TMDB_READ_ACCESS_TOKEN or pass --offline.",
                file=sys.stderr,
            )
            return 2
        client = TmdbClient(
            auth,
            cache=TmdbResponseCache(PROJECT_ROOT),
            refresh=args.refresh_cache,
        )

    updated, audit = match_shorts_artifact(
        artifact,
        client=client,
        limit=args.limit,
    )

    schema_path = PROJECT_ROOT / "schema/shorts_programs_current/v1.0.0.json"
    if schema_path.is_file():
        validate_against_schema(updated, schema_path, label="shorts_programs_current")

    stats = audit.get("stats") or {}
    print(
        "shorts_tmdb_match "
        f"total={stats.get('total')} "
        f"matched={stats.get('matched_automatic')} "
        f"review={stats.get('review')} "
        f"unmatched={stats.get('unmatched')} "
        f"preserved={stats.get('preserved_prior')}"
    )

    if args.dry_run:
        print(json.dumps({"dry_run": True, "stats": stats}, indent=2))
        return 0

    write_shorts_match_audit(audit, args.audit_path)
    print(f"Wrote {args.audit_path}")

    if not args.no_write_shorts:
        atomic_write_json(args.shorts_path, updated)
        print(f"Wrote {args.shorts_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
