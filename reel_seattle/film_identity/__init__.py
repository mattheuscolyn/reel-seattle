"""Canonical film identity foundation (T-FILMID-01)."""

from __future__ import annotations

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    REVIEW_MIN_SCORE,
)
from reel_seattle.film_identity.ids import (
    film_id_from_source,
    film_id_from_source_key,
    film_id_from_tmdb,
    parse_film_id,
)

__all__ = [
    "AUTO_CONFIRM_MIN_SCORE",
    "REVIEW_MIN_SCORE",
    "film_id_from_source",
    "film_id_from_source_key",
    "film_id_from_tmdb",
    "parse_film_id",
]
