"""Secret-safe helpers for credentialed live audits run in CI.

Live audits touch AMC and TMDB with real credentials and upload their output as
build artifacts, so every string that reaches disk, stdout, or an artifact has
to pass through :func:`scrub_secrets` first.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Mapping

SECRET_ENV_NAMES = (
    "AMC_API_KEY",
    "TMDB_READ_ACCESS_TOKEN",
    "TMDB_API_KEY",
)

SENSITIVE_HEADER_NAMES = (
    "authorization",
    "x-amc-vendor-key",
    "x-api-key",
    "api-key",
)

REDACTED = "[redacted]"

# Short env values are not treated as secrets: replacing a 3-character string
# everywhere would mangle titles and dates without protecting anything.
MIN_SECRET_LENGTH = 8

_QUERY_SECRET_PATTERN = re.compile(
    r"((?:api_key|api-key|vendor-key|key|token)=)([^&\s\"']+)",
    re.IGNORECASE,
)
_BEARER_PATTERN = re.compile(r"(bearer)\s+\S+", re.IGNORECASE)
_JWT_PATTERN = re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-.]{10,}")
_SENSITIVE_HEADER_VALUE_PATTERN = re.compile(
    r"\"(?:" + "|".join(SENSITIVE_HEADER_NAMES) + r")\"\s*:\s*\"([^\"]*)\"",
    re.IGNORECASE,
)


def secret_values(environ: Mapping[str, str] | None = None) -> tuple[str, ...]:
    """Return the non-trivial credential values present in the environment."""
    env = environ if environ is not None else os.environ
    values: list[str] = []
    for name in SECRET_ENV_NAMES:
        value = (env.get(name) or "").strip()
        if len(value) >= MIN_SECRET_LENGTH:
            values.append(value)
    # Longest first so a credential that contains another is redacted whole.
    return tuple(sorted(set(values), key=len, reverse=True))


def scrub_text(text: str, environ: Mapping[str, str] | None = None) -> str:
    """Redact credential values and credential-shaped substrings from ``text``."""
    cleaned = text
    for value in secret_values(environ):
        cleaned = cleaned.replace(value, REDACTED)
    cleaned = _QUERY_SECRET_PATTERN.sub(lambda m: f"{m.group(1)}{REDACTED}", cleaned)
    cleaned = _BEARER_PATTERN.sub(lambda m: f"{m.group(1)} {REDACTED}", cleaned)
    cleaned = _JWT_PATTERN.sub(REDACTED, cleaned)
    return cleaned


def scrub_secrets(value: Any, environ: Mapping[str, str] | None = None) -> Any:
    """Recursively scrub strings, dict values, and sensitive header names."""
    if isinstance(value, str):
        return scrub_text(value, environ)
    if isinstance(value, Mapping):
        scrubbed: dict[Any, Any] = {}
        for key, item in value.items():
            if isinstance(key, str) and key.casefold() in SENSITIVE_HEADER_NAMES:
                scrubbed[key] = REDACTED
            else:
                scrubbed[key] = scrub_secrets(item, environ)
        return scrubbed
    if isinstance(value, (list, tuple)):
        return [scrub_secrets(item, environ) for item in value]
    return value


def assert_no_secret_leakage(payload: Any, environ: Mapping[str, str] | None = None) -> None:
    """Raise ``ValueError`` when a payload still contains credential material."""
    blob = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, default=str)
    for value in secret_values(environ):
        if value in blob:
            raise ValueError("credential value present in audit payload")
    for match in _SENSITIVE_HEADER_VALUE_PATTERN.finditer(blob):
        if match.group(1) not in ("", REDACTED):
            raise ValueError("unredacted credential header present in audit payload")
    for match in _BEARER_PATTERN.finditer(blob):
        if not match.group(0).casefold().endswith(REDACTED):
            raise ValueError("bearer credential present in audit payload")
    for match in _QUERY_SECRET_PATTERN.finditer(blob):
        if match.group(2) != REDACTED:
            raise ValueError("credential-shaped query parameter present in audit payload")


def credential_presence(environ: Mapping[str, str] | None = None) -> dict[str, bool]:
    """Report which credentials are present, without revealing any value."""
    env = environ if environ is not None else os.environ
    return {name.lower() + "_present": bool((env.get(name) or "").strip()) for name in SECRET_ENV_NAMES}


def write_sanitized_json(path: Any, payload: Any, environ: Mapping[str, str] | None = None) -> Any:
    """Scrub, verify, then write ``payload`` as JSON. Returns the scrubbed payload."""
    from pathlib import Path

    scrubbed = scrub_secrets(payload, environ)
    assert_no_secret_leakage(scrubbed, environ)
    out_path = Path(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(scrubbed, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return scrubbed


def write_sanitized_text(path: Any, text: str, environ: Mapping[str, str] | None = None) -> str:
    """Scrub, verify, then write ``text``. Returns the scrubbed text."""
    from pathlib import Path

    scrubbed = scrub_text(text, environ)
    assert_no_secret_leakage(scrubbed, environ)
    out_path = Path(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(scrubbed, encoding="utf-8")
    return scrubbed
