"""AMC API showtime metadata extraction (adapter layer, PR D5)."""

from __future__ import annotations

from typing import Any, Mapping


def extract_showtime_metadata(showtime: Mapping[str, Any]) -> dict[str, object]:
    """Extract optional AMC metadata into a JSON-safe attributes dict."""
    payload: dict[str, object] = {}
    for api_key, attr_key in (
        ("movieId", "movie_id"),
        ("movieUrl", "movie_url"),
        ("sellUntilDateTimeUtc", "sell_until_utc"),
        ("genre", "genre"),
        ("rating", "mpaa_rating"),
    ):
        value = showtime.get(api_key)
        if value not in (None, ""):
            payload[attr_key] = value
    return payload
