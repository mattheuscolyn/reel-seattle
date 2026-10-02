"""Fit the shadow remaining-run model and append today's forecasts.

Does not write production Leaving Soon artifacts. TMDB collection is separate
and runs only when --with-tmdb is passed and credentials exist.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.analysis.remaining_run_shadow import run_shadow_forecast, write_shadow_outputs  # noqa: E402
from reel_seattle.analysis.tmdb_weekly_snapshot import append_jsonl_gz, split_tmdb_payload  # noqa: E402
from reel_seattle.film_identity.tmdb_client import TmdbClient, resolve_tmdb_auth  # noqa: E402

DYNAMIC_LEDGER = PROJECT_ROOT / "data" / "history" / "tmdb_dynamic_snapshots.jsonl.gz"
STABLE_LEDGER = PROJECT_ROOT / "data" / "history" / "tmdb_stable_enrichment.jsonl.gz"


def _collect_tmdb(films) -> tuple[int, int]:
    if resolve_tmdb_auth(require=False) is None:
        print("TMDB credentials are not set. Dynamic snapshot skipped.")
        return 0, 0
    observed_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    client = TmdbClient(resolve_tmdb_auth(require=False))
    dynamic = []
    stable = []
    for film in films:
        details = client.movie_details(film["tmdb_id"])
        dynamic_row, stable_row = split_tmdb_payload(details, film_id=film["film_id"], observed_at=observed_at)
        dynamic.append(dynamic_row)
        stable.append(stable_row)
    day = observed_at[:10]
    added_dynamic = append_jsonl_gz(DYNAMIC_LEDGER, dynamic, key_fn=lambda row: f"{row['tmdb_id']}|{row['observed_at'][:10]}")
    added_stable = append_jsonl_gz(
        STABLE_LEDGER,
        stable,
        key_fn=lambda row: f"{row['tmdb_id']}|{row.get('original_language')}|{row.get('runtime_minutes')}|{row.get('belongs_to_collection_id')}|{row.get('us_certification')}",
    )
    print(f"tmdb dynamic appended {added_dynamic}; stable appended {added_stable}; day {day}")
    return added_dynamic, added_stable


def main() -> None:
    result = run_shadow_forecast(PROJECT_ROOT)
    paths = write_shadow_outputs(PROJECT_ROOT, result)
    metrics = result["manifest"]["verification_holdout"]
    live = result["live"]
    print(
        f"holdout log loss {metrics.get('log_loss')} final {metrics.get('pr_auc_final_week')}; "
        f"theaters {len(live['theaters'])} market {len(live['market'])}; wrote {paths['current']}"
    )
    if "--with-tmdb" in sys.argv:
        _collect_tmdb(result["tmdb_films"])


if __name__ == "__main__":
    main()
