"""Named thresholds and match vocabulary for film identity matching."""

from __future__ import annotations

SCHEMA_VERSION = "1.0.0"

# Auto-confirm only with strong corroboration; false merges are worse than fallbacks.
AUTO_CONFIRM_MIN_SCORE = 0.92
REVIEW_MIN_SCORE = 0.55
YEAR_PROXIMITY_MAX = 1
RUNTIME_PROXIMITY_MAX_MIN = 8
# Top vs second candidate margin; near-ties with same-title remakes go to review.
TOP_CANDIDATE_MARGIN_MIN = 0.08

# Available-evidence weights (T-FILMID-01E). Missing signals do not enter the denominator.
WEIGHT_EXTERNAL_EXACT = 0.70
WEIGHT_TITLE_EXACT = 0.45
WEIGHT_ORIGINAL_EXACT = 0.38
WEIGHT_YEAR_EXACT = 0.30
WEIGHT_YEAR_NEAR = 0.12
WEIGHT_RUNTIME_NEAR = 0.15
WEIGHT_DIRECTOR_OVERLAP = 0.20
WEIGHT_DIRECTOR_WEAK = 0.08

# Entity kinds for source-backed programs (still valid showtimes entities).
ENTITY_FEATURE_FILM = "feature_film"
ENTITY_SHORT_FILM = "short_film"
ENTITY_SHORTS_PROGRAM = "shorts_program"
ENTITY_DOUBLE_FEATURE = "double_feature"
ENTITY_FESTIVAL_PROGRAM = "festival_program"
ENTITY_MYSTERY_SCREENING = "mystery_screening"
ENTITY_LIVE_EVENT = "live_event"
ENTITY_BROADCAST_EVENT = "broadcast_event"
ENTITY_UNKNOWN_PROGRAM = "unknown_program"

ENTITY_KINDS = frozenset(
    {
        ENTITY_FEATURE_FILM,
        ENTITY_SHORT_FILM,
        ENTITY_SHORTS_PROGRAM,
        ENTITY_DOUBLE_FEATURE,
        ENTITY_FESTIVAL_PROGRAM,
        ENTITY_MYSTERY_SCREENING,
        ENTITY_LIVE_EVENT,
        ENTITY_BROADCAST_EVENT,
        ENTITY_UNKNOWN_PROGRAM,
    }
)

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
