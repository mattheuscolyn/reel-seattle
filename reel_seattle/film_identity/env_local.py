"""Tiny local env helpers (no third-party dotenv dependency)."""

from __future__ import annotations

import os
from pathlib import Path


def load_dotenv_local(root: Path) -> bool:
    """Load KEY=VALUE pairs from gitignored ``.env.local`` if present.

    Existing process environment wins. Values are never logged.
    Returns True when the file existed.
    """
    path = root / ".env.local"
    if not path.exists():
        return False
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value
    return True
