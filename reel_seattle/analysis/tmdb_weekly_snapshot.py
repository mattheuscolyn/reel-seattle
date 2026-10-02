"""Research-only TMDB snapshots.

Dynamic popularity and vote fields are append-only. Stable metadata is stored
beside them and is not fed to the remaining-run model. The writer accepts any
object with movie_details(tmdb_id) so tests never call TMDB.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence

from reel_seattle.analysis.leaving_soon_auditorium_commitment import tmdb_snapshot_row
from reel_seattle.enrichment.normalize import extract_us_certification


class TmdbDetails(Protocol):
    def movie_details(self, tmdb_id: int) -> Mapping[str, Any]:
        """Return a TMDB movie payload."""


def build_snapshot(client: TmdbDetails, films: Sequence[Mapping[str, Any]], observed_at: str) -> list[dict[str, Any]]:
    rows = []
    for film in films:
        tmdb_id = film.get("tmdb_id")
        film_id = film.get("film_id")
        if not isinstance(tmdb_id, int) or not film_id:
            continue
        rows.append(tmdb_snapshot_row(client.movie_details(tmdb_id), film_id=str(film_id), observed_at=observed_at))
    return rows


def write_snapshot(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    """Write one daily research file. History belongs in append_jsonl_gz."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")


def read_jsonl_gz(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def append_jsonl_gz(path: Path, rows: Sequence[Mapping[str, Any]], *, key_fn) -> int:
    """Append rows whose key is not already in the file. Existing lines stay byte-for-byte."""
    path.parent.mkdir(parents=True, exist_ok=True)
    seen = {key_fn(row) for row in read_jsonl_gz(path)}
    fresh = [row for row in rows if key_fn(row) not in seen]
    if not fresh:
        return 0
    with gzip.open(path, "ab") as handle:
        for row in fresh:
            handle.write(json.dumps(row, ensure_ascii=True).encode("utf-8") + b"\n")
    return len(fresh)


def us_release_rows(details: Mapping[str, Any]) -> list[dict[str, Any]]:
    payload = details.get("release_dates")
    if not isinstance(payload, Mapping):
        return []
    results = payload.get("results")
    if not isinstance(results, list):
        return []
    chosen = None
    for entry in results:
        if isinstance(entry, Mapping) and str(entry.get("iso_3166_1") or "").upper() == "US":
            chosen = entry
            break
    if not isinstance(chosen, Mapping):
        return []
    rows = []
    for item in chosen.get("release_dates") or []:
        if not isinstance(item, Mapping):
            continue
        rows.append(
            {
                "release_date": item.get("release_date"),
                "type": item.get("type"),
                "certification": item.get("certification") or None,
            }
        )
    return rows


def stable_tmdb_row(details: Mapping[str, Any], *, film_id: str, observed_at: str) -> dict[str, Any]:
    """Stable fields already present on the movie-details payload. Keywords are not requested."""
    tmdb_id = details.get("id")
    if not isinstance(tmdb_id, int):
        raise ValueError("TMDB details require an integer id")
    collection = details.get("belongs_to_collection") if isinstance(details.get("belongs_to_collection"), Mapping) else {}
    genres = []
    for genre in details.get("genres") or []:
        if isinstance(genre, Mapping) and genre.get("name"):
            genres.append({"id": genre.get("id"), "name": genre.get("name")})
    companies = []
    for company in details.get("production_companies") or []:
        if isinstance(company, Mapping) and company.get("name"):
            companies.append({"id": company.get("id"), "name": company.get("name")})
    countries = []
    for country in details.get("production_countries") or []:
        if isinstance(country, Mapping) and country.get("iso_3166_1"):
            countries.append({"iso_3166_1": country.get("iso_3166_1"), "name": country.get("name")})
    return {
        "observed_at": observed_at,
        "film_id": film_id,
        "tmdb_id": tmdb_id,
        "original_language": details.get("original_language"),
        "genres": genres,
        "runtime_minutes": details.get("runtime"),
        "release_date": details.get("release_date"),
        "us_certification": extract_us_certification(details.get("release_dates")),
        "us_release_dates": us_release_rows(details),
        "belongs_to_collection_id": collection.get("id"),
        "belongs_to_collection_name": collection.get("name"),
        "production_companies": companies,
        "production_countries": countries,
    }


def split_tmdb_payload(details: Mapping[str, Any], *, film_id: str, observed_at: str) -> tuple[dict[str, Any], dict[str, Any]]:
    return (
        tmdb_snapshot_row(details, film_id=film_id, observed_at=observed_at),
        stable_tmdb_row(details, film_id=film_id, observed_at=observed_at),
    )


def estimate_tmdb_cost(active_films: int) -> dict[str, Any]:
    """One movie-details call per film supplies popularity, votes, and the stable fields."""
    per_dynamic = 180
    per_stable_change = 900
    return {
        "active_films": active_films,
        "requests_per_run": active_films,
        "requests_per_day": active_films,
        "requests_per_week": active_films,
        "dynamic_bytes_per_row": per_dynamic,
        "dynamic_megabytes_per_month_daily": round(active_films * 30 * per_dynamic / 1_000_000, 3),
        "dynamic_megabytes_per_month_weekly": round(active_films * 4 * per_dynamic / 1_000_000, 3),
        "stable_megabytes_per_refresh": round(active_films * per_stable_change / 1_000_000, 3),
        "extra_requests_beyond_movie_details": 0,
        "keywords_included": False,
        "cadence": "daily",
        "reason": "A few hundred movie-details calls a day is inside normal TMDB throughput, and daily rows are small enough to keep. The same call already returns popularity, vote_count, and vote_average.",
    }
