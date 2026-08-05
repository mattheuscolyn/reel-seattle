"""Constants for TMDB public enrichment pipeline (T-ENR-01B)."""

from __future__ import annotations

ARTIFACT_VERSION = 1
PROVIDER = "tmdb"
LANGUAGE = "en-US"

PUBLIC_ARTIFACT_REL = "public/data/film_enrichment_current.json"
REPORT_REL = "data/audits/tmdb_enrichment_pipeline_report.json"
SCHEMA_REL = "schema/film_enrichment/film_enrichment_current/v1.0.0.json"

POSTER_SIZE = "w500"
BACKDROP_SIZE = "w780"
DEFAULT_SECURE_BASE_URL = "https://image.tmdb.org/t/p/"

# Refresh mutable display fields within 90 days; hard max 6 months (TMDB terms).
STALE_AFTER_DAYS = 90
HARD_MAX_CACHE_DAYS = 180

OVERVIEW_MAX_LEN = 4000
TOP_CAST_MAX = 5

ALLOWED_FILM_KEYS = frozenset(
    {
        "film_id",
        "tmdb_id",
        "imdb_id",
        "original_title",
        "display_title",
        "original_language",
        "release_date",
        "release_year",
        "runtime_minutes",
        "us_certification",
        "overview",
        "genres",
        "directors",
        "top_cast",
        "poster",
        "backdrop",
        "provenance",
        "field_provenance",
    }
)
