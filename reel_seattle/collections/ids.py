"""Provider-namespaced collection identifiers."""

from __future__ import annotations

import re
from urllib.parse import urlparse

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def slugify_token(value: str) -> str | None:
    text = (value or "").strip().casefold()
    if not text:
        return None
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or None


def collection_id(*, source: str, source_collection_type: str, source_collection_id: str) -> str:
    """Stable provider-namespaced collection id. Never display-title-only."""
    src = (source or "").strip().casefold()
    kind = slugify_token(source_collection_type) or "collection"
    ident = (source_collection_id or "").strip().strip("/").casefold()
    ident = ident.replace("_", "-")
    ident = re.sub(r"[^a-z0-9:.-]+", "-", ident).strip("-")
    if not src or not ident:
        raise ValueError("collection_id requires source and source_collection_id")
    if src == "beacon":
        return f"beacon:{kind}:{ident}"
    if src == "siff":
        return f"siff:{ident}"
    if src == "nwff":
        return f"nwff:{ident}"
    return f"{src}:{kind}:{ident}"


def path_slug(url: str, *, expected_prefix: str | None = None) -> str | None:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    if expected_prefix:
        prefix_parts = [part for part in expected_prefix.strip("/").split("/") if part]
        if parts[: len(prefix_parts)] != prefix_parts:
            return None
        parts = parts[len(prefix_parts) :]
    if len(parts) != 1:
        return None
    return parts[0].casefold() or None
