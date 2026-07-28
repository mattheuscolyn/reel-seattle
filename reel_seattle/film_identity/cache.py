"""Repository-local TMDB response cache (gitignored directory)."""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.film_identity.constants import CACHE_DIR_REL
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage
from reel_seattle.validate import PROJECT_ROOT


def cache_root(root: Path | None = None) -> Path:
    return (root or PROJECT_ROOT) / CACHE_DIR_REL


def cache_key(kind: str, params: Mapping[str, Any]) -> str:
    payload = json.dumps(
        {"kind": kind, "params": _normalize(params)},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class TmdbResponseCache:
    def __init__(self, root: Path | None = None) -> None:
        self.root = cache_root(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def get(self, kind: str, params: Mapping[str, Any]) -> dict[str, Any] | None:
        path = self._path(kind, params)
        if not path.exists():
            return None
        with path.open(encoding="utf-8") as handle:
            doc = json.load(handle)
        return doc.get("body")

    def put(
        self,
        kind: str,
        params: Mapping[str, Any],
        body: Mapping[str, Any],
    ) -> None:
        assert_no_tmdb_secret_leakage(body)
        path = self._path(kind, params)
        path.parent.mkdir(parents=True, exist_ok=True)
        doc = {
            "kind": kind,
            "params": _normalize(params),
            "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "body": dict(body),
        }
        tmp = path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(doc, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        tmp.replace(path)

    def _path(self, kind: str, params: Mapping[str, Any]) -> Path:
        digest = cache_key(kind, params)
        return self.root / kind / f"{digest}.json"


def _normalize(params: Mapping[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in sorted(params.keys()):
        value = params[key]
        if value is None:
            continue
        # Never persist credentials in cache keys/bodies.
        if str(key).casefold() in {"api_key", "authorization", "access_token"}:
            continue
        out[str(key)] = value
    return out
