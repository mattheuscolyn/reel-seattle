"""Append research TMDB dynamic and stable snapshots.

One movie-details call supplies both. History files are append-only.
Does not score Leaving Soon. An empty stdin writes nothing and does not call TMDB.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.tmdb_weekly_snapshot import append_jsonl_gz, split_tmdb_payload  # noqa: E402
from reel_seattle.film_identity.tmdb_client import TmdbClient, resolve_tmdb_auth  # noqa: E402

DYNAMIC_LEDGER = PROJECT_ROOT / "data" / "history" / "tmdb_dynamic_snapshots.jsonl.gz"
STABLE_LEDGER = PROJECT_ROOT / "data" / "history" / "tmdb_stable_enrichment.jsonl.gz"


def main() -> None:
    films = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        films.append(json.loads(line))
    if not films:
        print("No film rows on stdin. No snapshot written.")
        return
    if resolve_tmdb_auth(require=False) is None:
        print("TMDB credentials are not set. No snapshot written.")
        return
    observed_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    client = TmdbClient(resolve_tmdb_auth(require=False))
    dynamic = []
    stable = []
    for film in films:
        tmdb_id = film.get("tmdb_id")
        film_id = film.get("film_id")
        if not isinstance(tmdb_id, int) or not film_id:
            continue
        details = client.movie_details(tmdb_id)
        dynamic_row, stable_row = split_tmdb_payload(details, film_id=str(film_id), observed_at=observed_at)
        dynamic.append(dynamic_row)
        stable.append(stable_row)
    added_dynamic = append_jsonl_gz(DYNAMIC_LEDGER, dynamic, key_fn=lambda row: f"{row['tmdb_id']}|{str(row['observed_at'])[:10]}")
    added_stable = append_jsonl_gz(
        STABLE_LEDGER,
        stable,
        key_fn=lambda row: f"{row['tmdb_id']}|{row.get('original_language')}|{row.get('runtime_minutes')}|{row.get('belongs_to_collection_id')}|{row.get('us_certification')}",
    )
    print(f"appended dynamic {added_dynamic} stable {added_stable}")


if __name__ == "__main__":
    main()
