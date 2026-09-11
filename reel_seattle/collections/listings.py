"""Load source listings used to join collection memberships."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.adapters.base import RawShowtime
from reel_seattle.adapters.scrape_log import (
    DEFAULT_DAILY_LOGS_DIR,
    daily_log_path,
    load_scrape_daily_log,
    record_dict_to_raw_showtime,
)
from reel_seattle.collections.adapters.siff import parent_siff_collection_url
from reel_seattle.prototypes.nwff import canonical_film_url
from reel_seattle.validate import PROJECT_ROOT


COLLECTION_SOURCES = ("siff", "beacon", "nwff")


def load_latest_source_listings(
    *,
    logs_dir: Path | None = None,
    run_date: str | None = None,
    payloads: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, list[RawShowtime]]:
    """Load raw showtimes per source from daily logs or in-memory payloads."""
    if payloads is not None:
        out: dict[str, list[RawShowtime]] = {}
        for source, payload in payloads.items():
            records = []
            for row in payload.get("records") or []:
                if isinstance(row, Mapping):
                    records.append(record_dict_to_raw_showtime(dict(row)))
            out[source] = records
        return out

    directory = Path(logs_dir or (PROJECT_ROOT / DEFAULT_DAILY_LOGS_DIR))
    out = {}
    for source in COLLECTION_SOURCES:
        path = _latest_log_path(directory, source, run_date=run_date)
        if path is None:
            out[source] = []
            continue
        result = load_scrape_daily_log(path)
        out[source] = list(result.records)
    return out


def extra_siff_collection_urls(records: Sequence[RawShowtime]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for record in records:
        parent = parent_siff_collection_url(record.source_film_url or "")
        if parent and parent not in seen:
            seen.add(parent)
            found.append(parent)
    return found


def nwff_film_page_urls(records: Sequence[RawShowtime]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for record in records:
        url = canonical_film_url(record.source_film_url or "") if record.source_film_url else None
        if url and url not in seen:
            seen.add(url)
            found.append(url)
    return found


def load_showtimes_document(path: Path | None = None) -> dict[str, Any]:
    target = path or (PROJECT_ROOT / "public/data/showtimes_current.json")
    if not target.is_file():
        return {}
    try:
        doc = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return doc if isinstance(doc, dict) else {}


def load_catalog_canonical_map(path: Path | None = None) -> dict[str, str]:
    """Map ``source|id|{source_film_id}`` → confirmed TMDB ``film_id``."""
    from reel_seattle.collections.join import listing_key
    from reel_seattle.film_identity.constants import CATALOG_REL

    target = path or (PROJECT_ROOT / CATALOG_REL)
    if not target.is_file():
        return {}
    try:
        doc = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    confirmed = {"confirmed_manual", "confirmed_automatic"}
    out: dict[str, str] = {}
    for film in doc.get("films") or []:
        if not isinstance(film, Mapping):
            continue
        if film.get("identity_type") != "tmdb":
            continue
        if film.get("match_status") not in confirmed:
            continue
        film_id = str(film.get("film_id") or "").strip()
        if not film_id.startswith("tmdb:"):
            continue
        for identity in film.get("source_identities") or []:
            if not isinstance(identity, Mapping):
                continue
            key = listing_key(
                str(identity.get("source") or ""),
                str(identity.get("source_film_id") or "").strip() or None,
                None,
            )
            if key:
                out[key] = film_id
    return out


def _latest_log_path(
    directory: Path, source: str, *, run_date: str | None
) -> Path | None:
    if run_date:
        path = daily_log_path(run_date, source, logs_dir=directory)
        return path if path.is_file() else None
    matches = sorted(directory.glob(f"*_{source}.json"))
    return matches[-1] if matches else None
