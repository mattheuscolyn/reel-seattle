"""Secret-safe helpers for TMDB identity work."""

from __future__ import annotations

import json
import re
from typing import Any

SECRET_ENV_NAMES = (
    "TMDB_READ_ACCESS_TOKEN",
    "TMDB_API_KEY",
)

SECRET_MARKERS = (
    "TMDB_READ_ACCESS_TOKEN",
    "TMDB_API_KEY",
    "Authorization",
    "Bearer ",
    "api_key=",
)


def sanitize_error_message(message: str | None) -> str | None:
    if message is None:
        return None
    text = str(message)
    lowered = text.casefold()
    for marker in SECRET_MARKERS:
        if marker.casefold() in lowered:
            return "request error (details redacted)"
    # Redact long token-like strings.
    text = re.sub(r"eyJ[a-zA-Z0-9_\-]{10,}", "[redacted]", text)
    text = re.sub(r"Bearer\s+\S+", "Bearer [redacted]", text, flags=re.IGNORECASE)
    text = re.sub(r"api_key=[^&\s]+", "api_key=[redacted]", text, flags=re.IGNORECASE)
    return text[:300]


def assert_no_tmdb_secret_leakage(payload: object) -> None:
    blob = json.dumps(payload, ensure_ascii=False)
    lowered = blob.casefold()
    for marker in (
        "tmdb_read_access_token",
        "tmdb_api_key=",
        "authorization: bearer",
        "api_key=",
    ):
        if marker in lowered:
            # Allow documenting the env var *names* in prose fields is risky;
            # block credential-shaped values and authorization headers.
            if marker == "api_key=" or "bearer " in lowered:
                raise ValueError(f"secret-like marker present in output: {marker}")


def redact_headers(headers: dict[str, Any] | None) -> dict[str, Any]:
    if not headers:
        return {}
    out: dict[str, Any] = {}
    for key, value in headers.items():
        if key.casefold() in {"authorization", "x-api-key"}:
            out[key] = "[redacted]"
        else:
            out[key] = value
    return out
