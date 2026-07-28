"""Named thresholds and match vocabulary for film identity matching."""

from __future__ import annotations

SCHEMA_VERSION = "1.0.0"

# Auto-confirm only with strong corroboration; false merges are worse than fallbacks.
AUTO_CONFIRM_MIN_SCORE = 0.92
REVIEW_MIN_SCORE = 0.55
YEAR_PROXIMITY_MAX = 1
RUNTIME_PROXIMITY_MAX_MIN = 8

DECISION_CONFIRM = "confirm"
DECISION_REJECT_CANDIDATE = "reject_candidate"
DECISION_UNMAPPED = "unmapped"
DECISION_NON_FILM = "non_film"
DECISION_DEFER = "defer"

DECISIONS = frozenset(
    {
        DECISION_CONFIRM,
        DECISION_REJECT_CANDIDATE,
        DECISION_UNMAPPED,
        DECISION_NON_FILM,
        DECISION_DEFER,
    }
)

STATUS_CONFIRMED_MANUAL = "confirmed_manual"
STATUS_CONFIRMED_AUTOMATIC = "confirmed_automatic"
STATUS_REVIEW_REQUIRED = "review_required"
STATUS_UNMATCHED = "unmatched"
STATUS_REJECTED = "rejected"
STATUS_NON_FILM = "non_film"
STATUS_DEFERRED = "deferred"
STATUS_ERROR = "error"

IDENTITY_TMDB = "tmdb"
IDENTITY_SOURCE = "source"
IDENTITY_SOURCE_KEY = "source_key"

METHOD_MANUAL = "manual"
METHOD_AUTOMATIC = "automatic"
METHOD_FALLBACK = "fallback"
METHOD_NONE = "none"

TMDB_LANGUAGE = "en-US"
# region=US omitted from default search: title/year scoring is primary; region
# filtering can hide valid repertory titles. Documented choice for T-FILMID-01.

CACHE_DIR_REL = "data/cache/tmdb"
DECISIONS_REL = "data/film_identity/tmdb_match_decisions.json"
CATALOG_REL = "data/film_identity/film_identity_catalog.json"
REVIEW_QUEUE_REL = "data/film_identity/tmdb_match_review_queue.json"
COVERAGE_REL = "data/audits/tmdb_film_identity_coverage.json"
