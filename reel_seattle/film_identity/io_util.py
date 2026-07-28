"""Atomic JSON artifact IO for film identity."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage


def atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    """Validate secret hygiene, write via temp + replace, keep .bak on replace."""
    assert_no_tmdb_secret_leakage(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    if path.exists():
        bak = path.with_suffix(path.suffix + ".bak")
        try:
            if bak.exists():
                bak.unlink()
            os.replace(path, bak)
        except OSError:
            pass
    os.replace(tmp, path)
