"""TMDB API client for identity matching (server-side only)."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from reel_seattle.film_identity.cache import TmdbResponseCache
from reel_seattle.film_identity.constants import TMDB_LANGUAGE
from reel_seattle.film_identity.security import (
    SECRET_ENV_NAMES,
    sanitize_error_message,
)

TMDB_API_BASE = "https://api.themoviedb.org/3"

FetchJsonFn = Callable[[str, Mapping[str, str]], tuple[int, dict[str, Any] | None, str | None]]


@dataclass(frozen=True)
class TmdbAuth:
    mode: str  # bearer | api_key
    token: str | None = None
    api_key: str | None = None


class TmdbAuthError(RuntimeError):
    """Raised when live TMDB auth is required but missing."""


def resolve_tmdb_auth(
    *,
    environ: Mapping[str, str] | None = None,
    require: bool = True,
) -> TmdbAuth | None:
    env = environ or os.environ
    bearer = (env.get("TMDB_READ_ACCESS_TOKEN") or "").strip()
    api_key = (env.get("TMDB_API_KEY") or "").strip()
    if bearer:
        return TmdbAuth(mode="bearer", token=bearer)
    if api_key:
        return TmdbAuth(mode="api_key", api_key=api_key)
    if require:
        raise TmdbAuthError(
            "Missing TMDB credentials. Set TMDB_READ_ACCESS_TOKEN "
            "(preferred) or TMDB_API_KEY. Never pass secrets on the CLI."
        )
    return None


class TmdbClient:
    """Small TMDB v3 client with cache + bounded retry."""

    def __init__(
        self,
        auth: TmdbAuth | None,
        *,
        cache: TmdbResponseCache | None = None,
        fetch_json: FetchJsonFn | None = None,
        max_retries: int = 3,
        sleep_fn: Callable[[float], None] | None = None,
        refresh: bool = False,
    ) -> None:
        self.auth = auth
        self.cache = cache
        self.fetch_json = fetch_json or _default_fetch_json
        self.max_retries = max(1, max_retries)
        self.sleep_fn = sleep_fn or time.sleep
        self.refresh = refresh

    def search_movie(
        self,
        query: str,
        *,
        year: int | None = None,
        page: int = 1,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "query": query,
            "include_adult": "false",
            "language": TMDB_LANGUAGE,
            "page": page,
        }
        if year is not None:
            params["year"] = year
        return self._request("search", "/search/movie", params)

    def movie_details(self, tmdb_id: int) -> dict[str, Any]:
        return self._request(
            "movie",
            f"/movie/{int(tmdb_id)}",
            {
                "language": TMDB_LANGUAGE,
                "append_to_response": "external_ids,credits,release_dates",
            },
        )

    def movie_external_ids(self, tmdb_id: int) -> dict[str, Any]:
        return self._request(
            "external_ids",
            f"/movie/{int(tmdb_id)}/external_ids",
            {},
        )

    def _request(self, kind: str, path: str, params: Mapping[str, Any]) -> dict[str, Any]:
        if self.cache is not None and not self.refresh:
            cached = self.cache.get(kind, {"path": path, **dict(params)})
            if cached is not None:
                return cached

        if self.auth is None:
            raise TmdbAuthError("TMDB auth is required for live requests")

        headers = {"Accept": "application/json"}
        query = dict(params)
        if self.auth.mode == "bearer":
            headers["Authorization"] = f"Bearer {self.auth.token}"
        else:
            query["api_key"] = self.auth.api_key

        url = f"{TMDB_API_BASE}{path}"
        if query:
            url = f"{url}?{urlencode(query)}"

        last_error: str | None = None
        for attempt in range(self.max_retries):
            status, body, error = self.fetch_json(url, headers)
            if status == 200 and isinstance(body, dict):
                if self.cache is not None:
                    self.cache.put(kind, {"path": path, **dict(params)}, body)
                return body
            last_error = sanitize_error_message(error or f"HTTP {status}")
            if status in {429, 500, 502, 503, 504} and attempt + 1 < self.max_retries:
                self.sleep_fn(min(8.0, 0.5 * (2**attempt)))
                continue
            break
        raise RuntimeError(last_error or "TMDB request failed")


def candidate_from_search_result(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "title": row.get("title"),
        "original_title": row.get("original_title"),
        "release_date": row.get("release_date"),
        "popularity": row.get("popularity"),
        "poster_path": row.get("poster_path"),
        "overview": row.get("overview"),
        "adult": row.get("adult"),
        "media_type": "movie",
    }


def enrich_candidate_from_details(
    base: Mapping[str, Any],
    details: Mapping[str, Any],
) -> dict[str, Any]:
    out = dict(base)
    out["runtime"] = details.get("runtime")
    out["overview"] = details.get("overview") or out.get("overview")
    out["poster_path"] = details.get("poster_path") or out.get("poster_path")
    out["release_date"] = details.get("release_date") or out.get("release_date")
    out["original_title"] = details.get("original_title") or out.get("original_title")
    out["title"] = details.get("title") or out.get("title")
    ext = details.get("external_ids")
    if isinstance(ext, Mapping):
        out["external_ids"] = {
            "imdb_id": ext.get("imdb_id"),
        }
    credits = details.get("credits")
    if isinstance(credits, Mapping):
        crew = credits.get("crew") or []
        directors = [
            c.get("name")
            for c in crew
            if isinstance(c, Mapping) and c.get("job") == "Director" and c.get("name")
        ]
        if directors:
            out["director"] = directors[0]
    return out


def _default_fetch_json(
    url: str,
    headers: Mapping[str, str],
) -> tuple[int, dict[str, Any] | None, str | None]:
    request = Request(url, headers=dict(headers), method="GET")
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310 - controlled URL
            status = int(getattr(response, "status", 200) or 200)
            raw = response.read().decode("utf-8")
            import json

            body = json.loads(raw) if raw else {}
            if not isinstance(body, dict):
                return status, None, "non-object JSON response"
            return status, body, None
    except Exception as exc:  # noqa: BLE001
        status = getattr(exc, "code", None)
        return (
            int(status) if status else 0,
            None,
            sanitize_error_message(str(exc)),
        )


def describe_auth_mode(auth: TmdbAuth | None) -> str:
    if auth is None:
        return "missing"
    return auth.mode


# Ensure env names stay discoverable for docs without exporting values.
AVAILABLE_SECRET_ENV_NAMES = SECRET_ENV_NAMES
