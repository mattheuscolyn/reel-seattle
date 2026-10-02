"""Write a research-only TMDB popularity snapshot for films playing this week.

Does not score Leaving Soon. Refuses to run without TMDB credentials.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.tmdb_weekly_snapshot import build_snapshot, write_snapshot  # noqa: E402
from reel_seattle.film_identity.tmdb_client import TmdbClient, resolve_tmdb_auth  # noqa: E402


def main() -> None:
    if resolve_tmdb_auth() is None:
        print("TMDB credentials are not set. No snapshot written.")
        return
    today = date.today().isoformat()
    observed_at = datetime.now(timezone.utc).isoformat()
    # Callers pass film_id,tmdb_id rows on stdin as JSON lines when they want a live pull.
    # This script does not scan production catalogs, so an empty stdin writes nothing.
    films = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        import json

        films.append(json.loads(line))
    rows = build_snapshot(TmdbClient(), films, observed_at)
    path = PROJECT_ROOT / "data" / "research" / "tmdb_weekly" / f"{today}.jsonl"
    write_snapshot(path, rows)
    print(f"wrote {len(rows)} rows to {path}")


if __name__ == "__main__":
    main()
