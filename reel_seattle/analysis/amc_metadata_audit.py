"""AMC API metadata audit and documentation helpers (PR D5)."""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from reel_seattle.adapters.amc_metadata import extract_showtime_metadata

__all__ = ["AMC_METADATA_AUDIT", "extract_showtime_metadata", "metadata_audit_summary", "audit_table_markdown"]

# Auditable metadata inventory. Update when AMC payload shape changes.
AMC_METADATA_AUDIT: tuple[dict[str, str], ...] = (
    {
        "field": "movieId",
        "source": "showtime.movieId",
        "persisted": "partial",
        "historical": "no",
        "usefulness": "high",
        "difficulty": "low",
        "notes": "Stable film identity; footprint column amc_movie_id exists but adapter did not map until PR D5.",
    },
    {
        "field": "movieUrl",
        "source": "showtime.movieUrl",
        "persisted": "no",
        "historical": "no",
        "usefulness": "medium",
        "difficulty": "low",
        "notes": "Links to Movies API for release metadata.",
    },
    {
        "field": "sellUntilDateTimeUtc",
        "source": "showtime.sellUntilDateTimeUtc",
        "persisted": "no",
        "historical": "no",
        "usefulness": "high",
        "difficulty": "low",
        "notes": "Ticketing cutoff; may signal limited engagements.",
    },
    {
        "field": "genre",
        "source": "showtime.genre",
        "persisted": "no",
        "historical": "no",
        "usefulness": "medium",
        "difficulty": "low",
        "notes": "Genre priors for lifecycle; not in current fixture history.",
    },
    {
        "field": "rating",
        "source": "showtime.rating",
        "persisted": "no",
        "historical": "no",
        "usefulness": "low",
        "difficulty": "low",
        "notes": "MPAA rating when present on showtime object.",
    },
    {
        "field": "runTime",
        "source": "showtime.runTime",
        "persisted": "yes",
        "historical": "yes",
        "usefulness": "low",
        "difficulty": "n/a",
        "notes": "Mapped to runtime_raw and legacy CSV Runtime.",
    },
    {
        "field": "premiumFormat",
        "source": "showtime.premiumFormat",
        "persisted": "yes",
        "historical": "partial",
        "usefulness": "medium",
        "difficulty": "n/a",
        "notes": "format_raw + attributes.premium_format_raw; legacy CSV from 2025+.",
    },
    {
        "field": "isCanceled",
        "source": "showtime.isCanceled",
        "persisted": "yes",
        "historical": "partial",
        "usefulness": "medium",
        "difficulty": "n/a",
        "notes": "Footprint canceled_count aggregates.",
    },
    {
        "field": "isAlmostSoldOut",
        "source": "showtime.isAlmostSoldOut",
        "persisted": "yes",
        "historical": "partial",
        "usefulness": "medium",
        "difficulty": "n/a",
        "notes": "Footprint almost_sold_out_count.",
    },
    {
        "field": "id",
        "source": "showtime.id",
        "persisted": "yes",
        "historical": "yes",
        "usefulness": "low",
        "difficulty": "n/a",
        "notes": "source_showtime_id.",
    },
    {
        "field": "media.posterDynamic",
        "source": "showtime.media.posterDynamic",
        "persisted": "yes",
        "historical": "yes",
        "usefulness": "low",
        "difficulty": "n/a",
        "notes": "poster_url_raw only.",
    },
    {
        "field": "engagementType / eventType",
        "source": "showtime or Movies API",
        "persisted": "no",
        "historical": "no",
        "usefulness": "high",
        "difficulty": "medium",
        "notes": "Not observed in repo fixtures; may require Movies API follow-up.",
    },
    {
        "field": "auditorium",
        "source": "showtime.auditorium",
        "persisted": "no",
        "historical": "no",
        "usefulness": "low",
        "difficulty": "medium",
        "notes": "Screen-level metadata not mapped.",
    },
    {
        "field": "releaseDateUtc",
        "source": "Movies API via movieId",
        "persisted": "no",
        "historical": "no",
        "usefulness": "high",
        "difficulty": "medium",
        "notes": "Requires movieId persistence + optional Movies API fetch.",
    },
    {
        "field": "now-playing / coming-soon views",
        "source": "Movies API collections",
        "persisted": "no",
        "historical": "no",
        "usefulness": "high",
        "difficulty": "high",
        "notes": "Endpoint-level metadata; future scrape extension.",
    },
)

IMPLEMENTED_IN_PR_D5 = (
    "movieId → attributes.movie_id",
    "movieUrl → attributes.movie_url",
    "sellUntilDateTimeUtc → attributes.sell_until_utc",
    "genre → attributes.genre",
    "rating → attributes.mpaa_rating",
)

RECOMMENDED_FUTURE_COLLECTION = (
    "movieId (now mapped; backfill only on new scrapes)",
    "sellUntilDateTimeUtc",
    "genre",
    "releaseDateUtc via Movies API",
    "engagement/event category when available",
    "normalized premium format tags",
)


def metadata_audit_summary() -> dict[str, Any]:
    """Return structured audit for reports and documentation."""
    return {
        "fields": list(AMC_METADATA_AUDIT),
        "implemented_in_pr_d5": list(IMPLEMENTED_IN_PR_D5),
        "recommended_future_collection": list(RECOMMENDED_FUTURE_COLLECTION),
        "persisted_now": [
            row["field"]
            for row in AMC_METADATA_AUDIT
            if row["persisted"] == "yes"
        ],
        "high_value_not_historical": [
            row["field"]
            for row in AMC_METADATA_AUDIT
            if row["usefulness"] == "high" and row["historical"] == "no"
        ],
    }


def audit_table_markdown(rows: Sequence[Mapping[str, str]] | None = None) -> str:
    """Render audit rows as a markdown table."""
    data = rows or AMC_METADATA_AUDIT
    lines = [
        "| Field | Source | Persisted | Historical | Usefulness | Difficulty | Notes |",
        "|-------|--------|-----------|------------|------------|------------|-------|",
    ]
    for row in data:
        lines.append(
            f"| {row['field']} | {row['source']} | {row['persisted']} | "
            f"{row['historical']} | {row['usefulness']} | {row['difficulty']} | {row['notes']} |"
        )
    return "\n".join(lines)
