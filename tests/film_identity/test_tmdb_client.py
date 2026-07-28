"""TMDB client auth, cache, retry, and secret hygiene tests (no live calls)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.film_identity.cache import TmdbResponseCache
from reel_seattle.film_identity.security import (
    assert_no_tmdb_secret_leakage,
    sanitize_error_message,
)
from reel_seattle.film_identity.tmdb_client import (
    TmdbAuthError,
    TmdbClient,
    resolve_tmdb_auth,
)


def test_bearer_preferred_over_api_key():
    auth = resolve_tmdb_auth(
        environ={
            "TMDB_READ_ACCESS_TOKEN": "token-value",
            "TMDB_API_KEY": "key-value",
        },
        require=True,
    )
    assert auth is not None
    assert auth.mode == "bearer"


def test_api_key_fallback_and_missing():
    auth = resolve_tmdb_auth(environ={"TMDB_API_KEY": "key-value"}, require=True)
    assert auth is not None
    assert auth.mode == "api_key"
    with pytest.raises(TmdbAuthError):
        resolve_tmdb_auth(environ={}, require=True)


def test_cache_hit_and_secret_redaction(tmp_path: Path):
    cache = TmdbResponseCache(tmp_path)
    client_calls = {"n": 0}

    def fetch(url, headers):
        client_calls["n"] += 1
        assert "Authorization" in headers
        return 200, {"results": [{"id": 1, "title": "Moana"}]}, None

    auth = resolve_tmdb_auth(environ={"TMDB_READ_ACCESS_TOKEN": "secret-token"}, require=True)
    client = TmdbClient(auth, cache=cache, fetch_json=fetch, sleep_fn=lambda _s: None)
    first = client.search_movie("Moana")
    second = client.search_movie("Moana")
    assert first == second
    assert client_calls["n"] == 1
    # Cache files must not contain the token.
    for path in (tmp_path / "data" / "cache" / "tmdb").rglob("*.json"):
        blob = path.read_text(encoding="utf-8")
        assert "secret-token" not in blob


def test_429_retry_then_success():
    states = {"n": 0}

    def fetch(url, headers):
        states["n"] += 1
        if states["n"] == 1:
            return 429, None, "rate limited"
        return 200, {"id": 5, "title": "Moana", "runtime": 107}, None

    auth = resolve_tmdb_auth(environ={"TMDB_API_KEY": "k"}, require=True)
    client = TmdbClient(auth, cache=None, fetch_json=fetch, sleep_fn=lambda _s: None)
    body = client.movie_details(5)
    assert body["id"] == 5
    assert states["n"] == 2


def test_sanitize_and_leak_guard():
    assert "redacted" in (sanitize_error_message("Authorization: Bearer abcdef") or "")
    with pytest.raises(ValueError):
        assert_no_tmdb_secret_leakage({"url": "https://x?api_key=abc"})
