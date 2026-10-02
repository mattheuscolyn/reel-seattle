"""Research-only weekly TMDB popularity snapshot.

This is not a historical feature and it is not used by Leaving Soon scoring.
The writer accepts any object with movie_details(tmdb_id) so tests never call TMDB.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence

from reel_seattle.analysis.leaving_soon_auditorium_commitment import tmdb_snapshot_row


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
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")
