#!/usr/bin/env python3
"""Export Supabase admin film-identity reviews into a local matcher overlay.

Writes data/film_identity/admin_match_overrides.json (gitignored).

The matcher loads this overlay *after* authored tmdb_match_decisions.json.
Admin rows win for the same source_identity_key. Auto-matching is skipped for
not_film, multiple_shorts, and needs_follow_up (mapped to defer).

If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing, exits 0 with no file
write so local matching still works.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.film_identity.constants import (  # noqa: E402
    ADMIN_OVERRIDES_REL,
    SCHEMA_VERSION,
)
from reel_seattle.film_identity.decisions import (  # noqa: E402
    apply_decision_patch,
    empty_decisions_document,
    validate_decisions_document,
)
from reel_seattle.film_identity.env_local import load_dotenv_local  # noqa: E402
from reel_seattle.film_identity.io_util import atomic_write_json  # noqa: E402

ADMIN_TO_PIPELINE = {
    "matched": "confirm",
    "not_film": "non_film",
    "multiple_shorts": "multiple_shorts",
    "needs_follow_up": "defer",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _fetch_reviews(url: str, service_key: str) -> list[dict]:
    endpoint = url.rstrip("/") + "/rest/v1/film_identity_reviews"
    params = urllib.parse.urlencode(
        {
            "select": ",".join(
                [
                    "id",
                    "source_identity_key",
                    "source",
                    "source_film_id",
                    "showtime_film_key",
                    "decision",
                    "tmdb_id",
                    "admin_note",
                    "reviewed_by",
                    "reviewed_at",
                    "active",
                ]
            ),
            "active": "eq.true",
            "order": "reviewed_at.asc",
        }
    )
    request = urllib.request.Request(
        f"{endpoint}?{params}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise ValueError("unexpected film_identity_reviews payload")
    return payload


def reviews_to_decisions_document(rows: list[dict]) -> dict:
    doc = empty_decisions_document(updated_at=_now_iso())
    doc["schema_version"] = SCHEMA_VERSION
    for row in rows:
        admin_decision = str(row.get("decision") or "").strip()
        pipeline_decision = ADMIN_TO_PIPELINE.get(admin_decision)
        if not pipeline_decision:
            continue
        source = str(row.get("source") or "").strip()
        if not source:
            continue
        tmdb_id = row.get("tmdb_id")
        if isinstance(tmdb_id, str) and tmdb_id.isdigit():
            tmdb_id = int(tmdb_id)
        if pipeline_decision != "confirm":
            tmdb_id = None
        patch = {
            "decision_id": f"admin_{row.get('id') or 'unknown'}",
            "source_identity": {
                "source": source,
                "source_film_id": row.get("source_film_id"),
                "showtime_film_key": row.get("showtime_film_key"),
            },
            "decision": pipeline_decision,
            "tmdb_id": tmdb_id if isinstance(tmdb_id, int) else None,
            "notes": row.get("admin_note"),
            "reason": "admin-review",
            "reviewed_at": str(row.get("reviewed_at") or _now_iso()),
            "reviewed_by": str(row.get("reviewed_by") or "admin"),
        }
        doc = apply_decision_patch(doc, patch, reviewed_by=patch["reviewed_by"])
    validate_decisions_document(doc)
    return doc


def main() -> int:
    load_dotenv_local(PROJECT_ROOT)
    supabase_url = (
        os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    ).strip()
    service_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    out_path = PROJECT_ROOT / ADMIN_OVERRIDES_REL

    if not supabase_url or not service_key:
        print(
            "Skipping admin review export (SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY not set)."
        )
        return 0

    try:
        rows = _fetch_reviews(supabase_url, service_key)
    except urllib.error.HTTPError as exc:
        print(f"Admin review export failed: HTTP {exc.code}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"Admin review export failed: {exc}", file=sys.stderr)
        return 1

    doc = reviews_to_decisions_document(rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(out_path, doc)
    print(
        f"Exported {len(doc.get('decisions') or [])} admin overlay "
        f"decision(s) → {ADMIN_OVERRIDES_REL}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
