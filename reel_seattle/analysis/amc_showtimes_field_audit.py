"""AMC Showtimes field-population and attribute-taxonomy audit (read-only).

Operates on committed AMC daily scrape logs. P-18A expands ``api_showtime_to_raw``
so newer logs retain attributes, languages, identity fallbacks, pricing, and
auditorium fields under ``record.attributes``. Older logs remain readable; the
audit measures both captured-log population and any remaining capture gap.

Optional ``--api-payloads`` fixtures supply synthetic full API showtimes so
attribute/language/pricing classifiers can be tested without live API access.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from reel_seattle.analysis.amc_movies_client import assert_no_secret_leakage

SCHEMA_VERSION = "1.0.0"
TAXONOMY_VERSION = "1.0.0"
SOURCE = "amc"

ATTR_FORMAT = "format"
ATTR_ACCESSIBILITY = "accessibility"
ATTR_LANGUAGE = "language"
ATTR_EVENT = "event"
ATTR_TICKETING = "ticketing"
ATTR_OPERATIONAL = "operational"
ATTR_CONTENT_ADVISORY = "content_advisory"
ATTR_UNKNOWN = "unknown"

ATTR_CATEGORIES = (
    ATTR_FORMAT,
    ATTR_ACCESSIBILITY,
    ATTR_LANGUAGE,
    ATTR_EVENT,
    ATTR_TICKETING,
    ATTR_OPERATIONAL,
    ATTR_CONTENT_ADVISORY,
    ATTR_UNKNOWN,
)

RECOMMEND_KEEP = "keep_or_capture"
RECOMMEND_CAPTURE = "capture_for_future"
RECOMMEND_DERIVE = "derive_into_presentation_attributes"
RECOMMEND_SEPARATE = "keep_separate_from_presentation_attributes"
RECOMMEND_LOW = "low_priority"
RECOMMEND_SKIP = "do_not_surface"
RECOMMEND_UNKNOWN = "needs_review"


@dataclass(frozen=True)
class FieldSpec:
    api_path: str
    category: str
    log_path: str | None
    likely_grain: str
    recommendation: str
    notes: str = ""


# Documented AMC Showtimes API inventory mapped to scrape-log paths when retained.
FIELD_SPECS: tuple[FieldSpec, ...] = (
    FieldSpec("id", "identity", "source_showtime_id", "showtime", RECOMMEND_KEEP, "Mapped to source_showtime_id"),
    FieldSpec("performanceNumber", "identity", "attributes.performance_number", "showtime", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("internalReleaseNumber", "identity", "attributes.internal_release_number", "unknown", RECOMMEND_KEEP, "P-18A raw capture when present"),
    FieldSpec("movieId", "identity", "attributes.movie_id", "amc_movie_product", RECOMMEND_KEEP),
    FieldSpec("movieName", "identity", "title_raw", "amc_movie_product", RECOMMEND_KEEP),
    FieldSpec("sortableMovieName", "identity", None, "amc_movie_product", RECOMMEND_LOW, "Deferred; Movies catalog has sortable_title"),
    FieldSpec("theatreId", "identity", "attributes.theatre_id", "theater", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("wwmReleaseNumber", "identity", "attributes.wwm_release_number", "amc_release_observation", RECOMMEND_KEEP, "P-18A relationship field on showtime log"),
    FieldSpec("showDateTimeUtc", "time", "attributes.show_datetime_utc", "showtime", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("showDateTimeLocal", "time", "date_raw+time_raw", "showtime", RECOMMEND_KEEP, "Split into date_raw/time_raw"),
    FieldSpec("utcOffset", "time", None, "showtime", RECOMMEND_LOW, "Deferred; low value vs local+UTC timestamps"),
    FieldSpec("sellUntilDateTimeUtc", "time", "attributes.sell_until_utc", "showtime", RECOMMEND_KEEP),
    FieldSpec("lastUpdatedDateUtc", "time", "attributes.last_updated_utc", "operational_metadata", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("visibilityDateTimeUtc", "availability", "attributes.visibility_datetime_utc", "operational_metadata", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("isSoldOut", "availability", "attributes.is_sold_out", "operational_metadata", RECOMMEND_KEEP, "Distinct from almost_sold_out"),
    FieldSpec("isAlmostSoldOut", "availability", "almost_sold_out", "operational_metadata", RECOMMEND_KEEP),
    FieldSpec("isCanceled", "availability", "canceled", "operational_metadata", RECOMMEND_KEEP),
    FieldSpec("isEmbargoed", "availability", "attributes.is_embargoed", "operational_metadata", RECOMMEND_KEEP, "P-18A; check conflict with embargoed"),
    FieldSpec("embargoed", "availability", "attributes.embargoed", "operational_metadata", RECOMMEND_KEEP, "P-18A; check conflict with isEmbargoed"),
    FieldSpec("isComingSoon", "availability", "attributes.is_coming_soon", "operational_metadata", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("hasTrailers", "availability", "attributes.has_trailers", "operational_metadata", RECOMMEND_LOW),
    FieldSpec("inTheatreTicketingOnly", "availability", "attributes.in_theatre_ticketing_only", "ticketing", RECOMMEND_SEPARATE, "P-18A raw capture"),
    FieldSpec("maximumIntendedAttendance", "auditorium", "attributes.maximum_intended_attendance", "auditorium", RECOMMEND_KEEP),
    FieldSpec("auditorium", "auditorium", "attributes.auditorium", "auditorium", RECOMMEND_KEEP, "P-18A; no auditorium entity yet"),
    FieldSpec("virtualAuditoriumId", "auditorium", "attributes.virtual_auditorium_id", "auditorium", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("layoutId", "auditorium", "attributes.layout_id", "auditorium", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("layoutVersionNumber", "auditorium", "attributes.layout_version_number", "auditorium", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("genre", "movie_snapshot", "attributes.genre", "amc_movie_product", RECOMMEND_KEEP),
    FieldSpec("runTime", "movie_snapshot", "runtime_raw", "amc_movie_product", RECOMMEND_KEEP),
    FieldSpec("mpaaRating", "movie_snapshot", "attributes.mpaa_rating", "amc_movie_product", RECOMMEND_KEEP, "API key often rating"),
    FieldSpec("premiumFormat", "presentation", "format_raw", "showtime", RECOMMEND_DERIVE, "Also in attributes.premium_format_raw"),
    FieldSpec("movieUrl", "movie_snapshot", "attributes.movie_url", "amc_movie_product", RECOMMEND_KEEP),
    FieldSpec("purchaseUrl", "ticketing", "attributes.purchase_url", "pricing_ticket_offer", RECOMMEND_KEEP, "P-18A; not mapped to ticket_url_raw / public"),
    FieldSpec("mobilePurchaseUrl", "ticketing", "attributes.mobile_purchase_url", "pricing_ticket_offer", RECOMMEND_KEEP, "P-18A raw capture"),
    FieldSpec("isDiscountMatineePriced", "ticketing", "attributes.is_discount_matinee_priced", "pricing_ticket_offer", RECOMMEND_SEPARATE, "P-18A raw capture"),
    FieldSpec("discountMatineeMessage", "ticketing", "attributes.discount_matinee_message", "pricing_ticket_offer", RECOMMEND_SEPARATE, "P-18A raw capture"),
    FieldSpec("isDiscountDaysEligible", "ticketing", "attributes.is_discount_days_eligible", "pricing_ticket_offer", RECOMMEND_SEPARATE, "P-18A raw capture"),
    FieldSpec("estimatedFees", "ticketing", "attributes.estimated_fees", "pricing_ticket_offer", RECOMMEND_SEPARATE, "P-18A raw capture"),
    FieldSpec("ticketPrices", "ticketing", "attributes.ticket_prices", "pricing_ticket_offer", RECOMMEND_SEPARATE, "P-18A; keep separate from presentation_attributes"),
    FieldSpec("attributes", "presentation", "attributes.amc_attributes", "showtime", RECOMMEND_KEEP, "AMC source attributes[] as amc_attributes"),
    FieldSpec("languages", "presentation", "attributes.languages", "showtime", RECOMMEND_KEEP, "P-18A nested spoken/dubbed_over/subtitle"),
    FieldSpec("languages.spoken", "presentation", "attributes.languages.spoken", "showtime", RECOMMEND_KEEP, "Nested under attributes.languages"),
    FieldSpec("languages.dubbedOver", "presentation", "attributes.languages.dubbed_over", "showtime", RECOMMEND_KEEP, "Nested under attributes.languages"),
    FieldSpec("languages.subtitle", "presentation", "attributes.languages.subtitle", "showtime", RECOMMEND_KEEP, "Nested under attributes.languages"),
    FieldSpec("media.posterDynamic", "media", "poster_url_raw", "amc_movie_product", RECOMMEND_KEEP),
    FieldSpec("media.heroDesktopDynamic", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("media.heroMobileDynamic", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("media.posterAlternateDynamic", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("media.poster3DDynamic", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("media.posterIMAXDynamic", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("media.trailerTeaserDynamic", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("media.trailerAlternateDynamic", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("media.posterDynamic180X74", "media", None, "amc_movie_product", RECOMMEND_LOW, "Deferred to source catalog / product media"),
    FieldSpec("_links", "links", None, "unknown", RECOMMEND_LOW, "Deferred; avoid unbounded link envelopes"),
)


# Attribute code classification (audit-only). Codes are case-insensitive needles.
_ATTR_CODE_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (ATTR_ACCESSIBILITY, ("opencaption", "open_caption", "closedcaption", "cc", "audiodescription", "ad", "sensoryfriendly", "sensory", "assistivelistening")),
    (ATTR_FORMAT, ("imax", "dolby", "prime", "reald", "3d", "70mm", "laser", "xl", "plf")),
    (ATTR_LANGUAGE, ("dubbed", "subtitled", "subtitle", "spanish", "espanol")),
    (ATTR_EVENT, ("qa", "qanda", "inpersnqa", "fanevent", "earlyaccess", "anniversary", "mystery", "marathon", "doublefeature", "singalong", "concert", "event")),
    (ATTR_TICKETING, ("alist", "a-list", "membersonly", "discount")),
    (ATTR_OPERATIONAL, ("internal", "hidden", "nopublic")),
    (ATTR_CONTENT_ADVISORY, ("advisory", "warning", "violence")),
)

_ATTR_NAME_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (ATTR_ACCESSIBILITY, re.compile(r"open\s*caption|closed\s*caption|audio\s*description|sensory|assistive\s*listening", re.I)),
    (ATTR_FORMAT, re.compile(r"\bimax\b|dolby|prime|reald|3d|70\s*mm|laser|\bxl\b", re.I)),
    (ATTR_LANGUAGE, re.compile(r"dubbed|subtitled|subtitle|spanish|espa[nñ]ol", re.I)),
    (ATTR_EVENT, re.compile(r"q\s*&\s*a|q\s+and\s+a|fan\s*event|early\s*access|anniversary|mystery|marathon|double\s*feature|sing[- ]?along|concert", re.I)),
)


class ShowtimesFieldAuditError(ValueError):
    """Raised when audit inputs cannot be processed."""


def _dig(obj: Any, path: str) -> Any:
    if path == "date_raw+time_raw":
        if not isinstance(obj, Mapping):
            return None
        date_raw = obj.get("date_raw")
        time_raw = obj.get("time_raw")
        if date_raw in (None, "") and time_raw in (None, ""):
            return None
        return f"{date_raw or ''} {time_raw or ''}".strip()
    current: Any = obj
    for part in path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _is_present(value: Any) -> bool:
    return value is not None


def _is_nonempty(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def _type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int) and not isinstance(value, bool):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _stable_example(value: Any, *, limit: int = 120) -> str | None:
    if not _is_nonempty(value):
        return None
    if isinstance(value, (dict, list)):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    else:
        text = str(value)
    text = text.replace("\n", " ").strip()
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def list_amc_scrape_logs(logs_dir: Path | str, *, max_logs: int = 7) -> list[Path]:
    """Return the newest ``*_amc.json`` paths, limited to *max_logs*."""
    directory = Path(logs_dir)
    if not directory.is_dir():
        raise ShowtimesFieldAuditError(f"logs directory not found: {directory}")
    candidates = sorted(directory.glob("*_amc.json"))
    if not candidates:
        raise ShowtimesFieldAuditError(f"no AMC scrape logs under {directory}")
    selected = candidates[-max(1, max_logs) :]
    return selected


def load_scrape_log_records(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    """Load one scrape log; return envelope, valid records, skip reasons."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise ShowtimesFieldAuditError(f"scrape log is not an object: {path}")
    records_in = payload.get("records")
    if not isinstance(records_in, list):
        raise ShowtimesFieldAuditError(f"scrape log missing records array: {path}")
    valid: list[dict[str, Any]] = []
    skips: list[str] = []
    for index, row in enumerate(records_in):
        if not isinstance(row, Mapping):
            skips.append(f"{path.name}[{index}]: not an object")
            continue
        valid.append(dict(row))
    return dict(payload), valid, skips


def _code_matches_needle(code_key: str, needle: str) -> bool:
    """Match AMC attribute codes without short-needle false positives (e.g. ``qa`` in arbitrary text)."""
    token = needle.replace("_", "").replace("-", "").casefold()
    if not token or not code_key:
        return False
    if code_key == token:
        return True
    # Short needles need token-ish boundaries; longer needles may be embedded (OPENCAPTION).
    if len(token) <= 3:
        return (
            code_key.startswith(token)
            or code_key.endswith(token)
            or f"-{token}-" in f"-{code_key}-"
        )
    return token in code_key


def classify_attribute(
    *,
    code: str | None,
    name: str | None,
    description: str | None = None,
) -> dict[str, Any]:
    """Audit-only taxonomy classification for one AMC attribute."""
    code_text = (code or "").strip()
    name_text = (name or "").strip()
    desc_text = (description or "").strip()
    blob = " ".join(part for part in (code_text, name_text, desc_text) if part)
    code_key = code_text.casefold().replace(" ", "").replace("_", "").replace("-", "")

    if not code_text and not name_text:
        return {
            "category": ATTR_UNKNOWN,
            "review_status": "needs_review",
            "evidence": "missing code and name",
            "taxonomy_version": TAXONOMY_VERSION,
        }

    # Prefer code needles, then name patterns.
    for category, needles in _ATTR_CODE_RULES:
        if any(_code_matches_needle(code_key, needle) for needle in needles):
            # Keep open vs closed caption distinct via code/name evidence.
            return {
                "category": category,
                "review_status": "classified",
                "evidence": f"code_match:{code_text or name_text}",
                "taxonomy_version": TAXONOMY_VERSION,
            }

    for category, pattern in _ATTR_NAME_PATTERNS:
        if pattern.search(blob):
            return {
                "category": category,
                "review_status": "classified",
                "evidence": f"name_pattern:{category}",
                "taxonomy_version": TAXONOMY_VERSION,
            }

    return {
        "category": ATTR_UNKNOWN,
        "review_status": "needs_review",
        "evidence": "no taxonomy rule matched",
        "taxonomy_version": TAXONOMY_VERSION,
    }


def _normalize_attr_item(item: Any) -> dict[str, str | None]:
    if isinstance(item, str):
        text = item.strip()
        return {"code": text or None, "name": text or None, "description": None}
    if not isinstance(item, Mapping):
        return {"code": None, "name": None, "description": None}
    code = item.get("code") or item.get("Code") or item.get("attributeCode")
    name = item.get("name") or item.get("Name") or item.get("description")
    description = item.get("description") if "description" in item else item.get("Description")
    return {
        "code": str(code).strip() if code not in (None, "") else None,
        "name": str(name).strip() if name not in (None, "") else None,
        "description": str(description).strip() if description not in (None, "") else None,
    }


def analyze_api_attributes(payloads: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Inventory and classify attributes[] from synthetic/full API payloads."""
    return _analyze_attribute_items(
        _iter_api_attribute_contexts(payloads),
        source="api_payload_fixtures",
        empty_note=(
            "Attribute inventory from optional API payload fixtures. "
            "Prefer scrape-log attributes.amc_attributes when P-18A logs are present."
        ),
    )


def analyze_log_attributes(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Inventory and classify attributes.amc_attributes from scrape-log records."""
    return _analyze_attribute_items(
        _iter_log_attribute_contexts(records),
        source="scrape_logs",
        empty_note=(
            "No attributes.amc_attributes found in scrape logs "
            "(pre-P-18A logs or empty capture)."
        ),
    )


def _iter_api_attribute_contexts(
    payloads: Sequence[Mapping[str, Any]],
) -> Iterable[tuple[Any, str, str, str, Any, Mapping[str, Any]]]:
    for show in payloads:
        attrs = show.get("attributes")
        movie_id = str(show.get("movieId") or "")
        theater = str(show.get("theatreId") or show.get("theaterId") or "")
        title = str(show.get("movieName") or "")
        premium = show.get("premiumFormat")
        languages = show.get("languages") if isinstance(show.get("languages"), Mapping) else {}
        yield attrs, movie_id, theater, title, premium, languages


def _iter_log_attribute_contexts(
    records: Sequence[Mapping[str, Any]],
) -> Iterable[tuple[Any, str, str, str, Any, Mapping[str, Any]]]:
    for row in records:
        attrs = _dig(row, "attributes.amc_attributes")
        movie_id = str(_dig(row, "attributes.movie_id") or "")
        theater = str(_dig(row, "attributes.theatre_id") or row.get("theater_name_raw") or "")
        title = str(row.get("title_raw") or "")
        premium = row.get("format_raw") or _dig(row, "attributes.premium_format_raw")
        languages_raw = _dig(row, "attributes.languages")
        languages: Mapping[str, Any] = {}
        if isinstance(languages_raw, Mapping):
            languages = {
                "spoken": languages_raw.get("spoken"),
                "dubbedOver": languages_raw.get("dubbed_over"),
                "subtitle": languages_raw.get("subtitle"),
            }
        yield attrs, movie_id, theater, title, premium, languages


def _analyze_attribute_items(
    contexts: Iterable[tuple[Any, str, str, str, Any, Mapping[str, Any]]],
    *,
    source: str,
    empty_note: str,
) -> dict[str, Any]:
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    malformed = 0
    saw_any_container = False
    for attrs, movie_id, theater, title, premium, languages in contexts:
        if attrs is None:
            continue
        saw_any_container = True
        if not isinstance(attrs, list):
            malformed += 1
            continue
        for item in attrs:
            normalized = _normalize_attr_item(item)
            if normalized["code"] is None and normalized["name"] is None:
                malformed += 1
                continue
            key = (normalized["code"] or "", normalized["name"] or "")
            row = by_key.get(key)
            if row is None:
                classification = classify_attribute(
                    code=normalized["code"],
                    name=normalized["name"],
                    description=normalized["description"],
                )
                row = {
                    "code": normalized["code"],
                    "name": normalized["name"],
                    "description": normalized["description"],
                    "occurrence_count": 0,
                    "distinct_movie_ids": set(),
                    "distinct_theaters": set(),
                    "premium_formats": set(),
                    "spoken_languages": set(),
                    "dubbed_languages": set(),
                    "subtitle_languages": set(),
                    "representative_titles": set(),
                    **classification,
                }
                by_key[key] = row
            row["occurrence_count"] += 1
            if movie_id:
                row["distinct_movie_ids"].add(movie_id)
            if theater:
                row["distinct_theaters"].add(theater)
            if premium not in (None, ""):
                row["premium_formats"].add(str(premium))
            if title:
                row["representative_titles"].add(title)
            for lang_key, bucket in (
                ("spoken", "spoken_languages"),
                ("dubbedOver", "dubbed_languages"),
                ("subtitle", "subtitle_languages"),
            ):
                value = languages.get(lang_key)
                if value not in (None, ""):
                    row[bucket].add(str(value))

    rows: list[dict[str, Any]] = []
    for row in by_key.values():
        rows.append(
            {
                "code": row["code"],
                "name": row["name"],
                "description": row["description"],
                "occurrence_count": row["occurrence_count"],
                "distinct_movie_ids": len(row["distinct_movie_ids"]),
                "distinct_theaters": len(row["distinct_theaters"]),
                "category": row["category"],
                "review_status": row["review_status"],
                "evidence": row["evidence"],
                "taxonomy_version": row["taxonomy_version"],
                "co_occurring_premium_formats": sorted(row["premium_formats"]),
                "co_occurring_spoken": sorted(row["spoken_languages"]),
                "co_occurring_dubbed": sorted(row["dubbed_languages"]),
                "co_occurring_subtitles": sorted(row["subtitle_languages"]),
                "representative_titles": sorted(row["representative_titles"])[:5],
                "source": source,
            }
        )
    rows.sort(key=lambda item: (-int(item["occurrence_count"]), str(item["code"] or ""), str(item["name"] or "")))
    category_counts = Counter(str(item["category"]) for item in rows)
    note = empty_note
    if rows:
        note = (
            f"Attribute inventory from {source}. "
            "Taxonomy is audit-only; production mapping does not classify codes."
        )
    elif not saw_any_container:
        note = empty_note
    return {
        "unique_attributes": len(rows),
        "malformed_attribute_items": malformed,
        "category_counts": {key: category_counts.get(key, 0) for key in ATTR_CATEGORIES},
        "attributes": rows,
        "note": note,
    }


def analyze_languages(payloads: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Summarize languages.* from API payloads (fixture or live-shaped)."""
    return _analyze_language_maps(
        [
            (
                str(show.get("movieId") or ""),
                show.get("languages") if isinstance(show.get("languages"), Mapping) else None,
                "spoken",
                "dubbedOver",
                "subtitle",
            )
            for show in payloads
        ],
        note=(
            "Language objects from API payload fixtures. "
            "Prefer scrape-log attributes.languages when P-18A logs are present."
        ),
    )


def analyze_log_languages(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Summarize attributes.languages from scrape-log records."""
    return _analyze_language_maps(
        [
            (
                str(_dig(row, "attributes.movie_id") or ""),
                _dig(row, "attributes.languages")
                if isinstance(_dig(row, "attributes.languages"), Mapping)
                else None,
                "spoken",
                "dubbed_over",
                "subtitle",
            )
            for row in records
        ],
        note=(
            "Language objects from scrape-log attributes.languages (P-18A). "
            "Empty arrays and nulls are preserved distinctly from missing keys."
        ),
    )


def _analyze_language_maps(
    rows: Sequence[tuple[str, Mapping[str, Any] | None, str, str, str]],
    *,
    note: str,
) -> dict[str, Any]:
    total = len(rows)
    spoken_values: Counter[str] = Counter()
    dubbed_values: Counter[str] = Counter()
    subtitle_values: Counter[str] = Counter()
    present = 0
    by_movie: dict[str, set[str]] = defaultdict(set)
    for movie_id, languages, spoken_key, dubbed_key, subtitle_key in rows:
        if not isinstance(languages, Mapping):
            continue
        present += 1
        for key, counter, label in (
            (spoken_key, spoken_values, "spoken"),
            (dubbed_key, dubbed_values, "dubbedOver"),
            (subtitle_key, subtitle_values, "subtitle"),
        ):
            if key not in languages:
                continue
            value = languages.get(key)
            if value not in (None, ""):
                text = str(value).strip()
                counter[text] += 1
                if movie_id:
                    by_movie[movie_id].add(f"{label}={text}")
    varying_movies = sum(1 for values in by_movie.values() if len(values) > 1)
    return {
        "payloads_examined": total,
        "languages_object_present": present,
        "spoken_distinct": dict(spoken_values.most_common(20)),
        "dubbed_over_distinct": dict(dubbed_values.most_common(20)),
        "subtitle_distinct": dict(subtitle_values.most_common(20)),
        "movies_with_varying_language_across_showtimes": varying_movies,
        "recommended_concepts": [
            "spoken_language",
            "dubbed_language",
            "subtitle_language",
            "derived presentation attribute: dubbed",
            "derived presentation attribute: subtitled",
        ],
        "note": note,
    }


def _field_stats_for_records(
    records: Sequence[Mapping[str, Any]],
    spec: FieldSpec,
) -> dict[str, Any]:
    total = len(records)
    if spec.log_path is None:
        return {
            "api_path": spec.api_path,
            "category": spec.category,
            "log_path": None,
            "capture_status": "not_captured_in_scrape_log",
            "records_examined": total,
            "present_count": 0,
            "non_null_count": 0,
            "non_empty_count": 0,
            "population_pct_non_empty": 0.0,
            "distinct_values": 0,
            "observed_types": [],
            "likely_grain": spec.likely_grain,
            "recommendation": spec.recommendation,
            "notes": spec.notes,
            "examples": [],
        }

    present = 0
    non_null = 0
    non_empty = 0
    types: Counter[str] = Counter()
    distinct: set[str] = set()
    examples: list[str] = []
    by_movie: dict[str, set[str]] = defaultdict(set)
    by_theater: dict[str, set[str]] = defaultdict(set)

    for row in records:
        value = _dig(row, spec.log_path)
        if value is not None or (isinstance(row, Mapping) and _path_exists(row, spec.log_path)):
            present += 1
        if _is_present(value):
            non_null += 1
            types[_type_name(value)] += 1
        if _is_nonempty(value):
            non_empty += 1
            example = _stable_example(value)
            if example is not None:
                distinct.add(example)
                if len(examples) < 5 and example not in examples:
                    examples.append(example)
            movie_id = str(_dig(row, "attributes.movie_id") or "")
            theater = str(row.get("theater_name_raw") or "")
            if movie_id and example is not None:
                by_movie[movie_id].add(example)
            if theater and example is not None:
                by_theater[theater].add(example)

    varies_by_movie = sum(1 for values in by_movie.values() if len(values) > 1)
    varies_by_theater = sum(1 for values in by_theater.values() if len(values) > 1)
    return {
        "api_path": spec.api_path,
        "category": spec.category,
        "log_path": spec.log_path,
        "capture_status": "captured_in_scrape_log",
        "records_examined": total,
        "present_count": present,
        "non_null_count": non_null,
        "non_empty_count": non_empty,
        "population_pct_non_empty": round((100.0 * non_empty / total), 2) if total else 0.0,
        "distinct_values": len(distinct),
        "observed_types": sorted(types.keys()),
        "movies_with_varying_values": varies_by_movie,
        "theaters_with_varying_values": varies_by_theater,
        "likely_grain": spec.likely_grain,
        "recommendation": spec.recommendation,
        "notes": spec.notes,
        "examples": examples,
    }


def _path_exists(row: Mapping[str, Any], path: str) -> bool:
    if path == "date_raw+time_raw":
        return "date_raw" in row or "time_raw" in row
    parts = path.split(".")
    current: Any = row
    for part in parts[:-1]:
        if not isinstance(current, Mapping) or part not in current:
            return False
        current = current[part]
    return isinstance(current, Mapping) and parts[-1] in current


def analyze_identity(records_by_file: Mapping[str, Sequence[Mapping[str, Any]]]) -> dict[str, Any]:
    """Evaluate candidate showtime identities from captured log fields."""
    rows: list[dict[str, Any]] = []
    for file_label, records in records_by_file.items():
        for row in records:
            rows.append(
                {
                    "file": file_label,
                    "id": str(row.get("source_showtime_id") or "").strip() or None,
                    "performance_number": (
                        str(_dig(row, "attributes.performance_number")).strip()
                        if _dig(row, "attributes.performance_number") not in (None, "")
                        else None
                    ),
                    "theatre_id": (
                        str(_dig(row, "attributes.theatre_id")).strip()
                        if _dig(row, "attributes.theatre_id") not in (None, "")
                        else None
                    ),
                    "date_raw": str(row.get("date_raw") or "").strip() or None,
                    "time_raw": str(row.get("time_raw") or "").strip() or None,
                    "theater": str(row.get("theater_name_raw") or "").strip() or None,
                    "movie_id": str(_dig(row, "attributes.movie_id") or "").strip() or None,
                    "title": str(row.get("title_raw") or "").strip() or None,
                    "canceled": row.get("canceled"),
                }
            )

    total = len(rows)
    id_non_null = sum(1 for row in rows if row["id"])
    id_dups_within_files: dict[str, int] = {}
    for file_label, records in records_by_file.items():
        counter = Counter(
            str(row.get("source_showtime_id") or "").strip()
            for row in records
            if str(row.get("source_showtime_id") or "").strip()
        )
        id_dups_within_files[file_label] = sum(1 for count in counter.values() if count > 1)

    appearances: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if row["id"]:
            appearances[row["id"]].add(row["file"])
    multi_day_ids = sum(1 for files in appearances.values() if len(files) > 1)

    candidate_d: Counter[str] = Counter()
    for row in rows:
        if row["theater"] and row["movie_id"] and row["date_raw"] and row["time_raw"]:
            key = "|".join(
                [row["theater"], row["movie_id"], row["date_raw"], row["time_raw"]]
            )
            candidate_d[key] += 1

    perf_non_null = sum(1 for row in rows if row["performance_number"])
    theatre_non_null = sum(1 for row in rows if row["theatre_id"])
    composite_c: Counter[str] = Counter()
    composite_e: Counter[str] = Counter()
    for row in rows:
        if row["theatre_id"] and row["performance_number"]:
            composite_c["|".join([row["theatre_id"], row["performance_number"]])] += 1
            if row["date_raw"] and row["time_raw"]:
                composite_e[
                    "|".join(
                        [
                            row["theatre_id"],
                            row["performance_number"],
                            row["date_raw"],
                            row["time_raw"],
                        ]
                    )
                ] += 1
    perf_available = perf_non_null > 0
    theatre_available = theatre_non_null > 0

    return {
        "records_examined": total,
        "candidates": [
            {
                "candidate": "A: AMC showtime id (source_showtime_id)",
                "available_in_logs": True,
                "non_null_count": id_non_null,
                "null_rate_pct": round(100.0 * (total - id_non_null) / total, 2) if total else 0.0,
                "duplicate_keys_same_day_files": id_dups_within_files,
                "ids_appearing_on_multiple_days": multi_day_ids,
                "notes": "Fully populated in recent logs; no same-day duplicates observed in typical days.",
            },
            {
                "candidate": "B: performanceNumber",
                "available_in_logs": perf_available,
                "non_null_count": perf_non_null,
                "notes": (
                    "Captured as attributes.performance_number (P-18A)."
                    if perf_available
                    else "Not present in these logs (pre-P-18A or unset by API)."
                ),
            },
            {
                "candidate": "C: (theatreId, performanceNumber)",
                "available_in_logs": perf_available and theatre_available,
                "non_null_composite_count": sum(composite_c.values()),
                "duplicate_composites": sum(1 for count in composite_c.values() if count > 1),
                "notes": (
                    "Both theatre_id and performance_number available (P-18A)."
                    if perf_available and theatre_available
                    else "Requires both attributes.theatre_id and attributes.performance_number."
                ),
            },
            {
                "candidate": "D: (theater_name_raw, movie_id, date_raw, time_raw)",
                "available_in_logs": True,
                "non_null_composite_count": sum(candidate_d.values()),
                "duplicate_composites": sum(1 for count in candidate_d.values() if count > 1),
                "notes": "Uses theater name rather than theatreId; weaker than AMC id when available.",
            },
            {
                "candidate": "E: theatreId + performanceNumber + showDateTimeLocal",
                "available_in_logs": perf_available and theatre_available,
                "non_null_composite_count": sum(composite_e.values()),
                "duplicate_composites": sum(1 for count in composite_e.values() if count > 1),
                "notes": (
                    "Uses captured theatre_id, performance_number, and local date/time (P-18A)."
                    if perf_available and theatre_available
                    else "Requires theatreId + performanceNumber capture."
                ),
            },
        ],
        "recommendation": (
            "Prefer AMC showtime id (source_showtime_id) as the primary identity. "
            "Use performanceNumber + theatreId as supplementary evidence; do not replace AMC id."
        ),
        "performance_number_status": "captured" if perf_available else "not_captured",
    }


def analyze_premium_format(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Compare format_raw with attributes.premium_format_raw from logs."""
    both_empty = 0
    both_same = 0
    conflict = 0
    only_format = 0
    only_attr = 0
    compound = 0
    values: Counter[str] = Counter()
    for row in records:
        left = str(row.get("format_raw") or "").strip()
        right = str(_dig(row, "attributes.premium_format_raw") or "").strip()
        if not left and not right:
            both_empty += 1
            continue
        if left and right and left == right:
            both_same += 1
            values[left] += 1
        elif left and right and left != right:
            conflict += 1
        elif left:
            only_format += 1
            values[left] += 1
        else:
            only_attr += 1
            values[right] += 1
        text = left or right
        if text and ("3D" in text or "/" in text or " + " in text):
            compound += 1
    return {
        "records_examined": len(records),
        "both_empty": both_empty,
        "both_equal_nonempty": both_same,
        "conflicts_format_vs_attr": conflict,
        "only_format_raw": only_format,
        "only_attributes_premium_format_raw": only_attr,
        "compound_like_values": compound,
        "top_values": values.most_common(20),
        "recommendation": (
            "Retain raw premiumFormat (already duplicated as format_raw / premium_format_raw). "
            "Future presentation_attributes should derive format codes from premiumFormat and "
            "from attributes[] once attributes[] capture is added; do not drop the raw field."
        ),
        "attributes_array_overlap": (
            "Cannot compare to API attributes[] because the adapter discards that array."
        ),
    }


def build_showtimes_field_audit(
    *,
    log_paths: Sequence[Path],
    api_payloads: Sequence[Mapping[str, Any]] | None = None,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build the full audit report object."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from reel_seattle.normalize.dates import DEFAULT_TIMEZONE

    stamp = generated_at or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")
    records_by_file: dict[str, list[dict[str, Any]]] = {}
    all_records: list[dict[str, Any]] = []
    skip_reasons: list[str] = []
    envelopes: list[dict[str, Any]] = []
    dates: list[str] = []
    # Sort paths so input order does not affect aggregates or output ordering.
    ordered_paths = sorted(log_paths, key=lambda path: path.as_posix())

    for path in ordered_paths:
        envelope, records, skips = load_scrape_log_records(path)
        label = path.name
        records_by_file[label] = records
        all_records.extend(records)
        skip_reasons.extend(skips)
        envelopes.append(
            {
                "path": path.as_posix(),
                "generated_at": envelope.get("generated_at"),
                "records": len(records),
            }
        )
        if len(path.stem) >= 10:
            dates.append(path.stem[:10])

    movie_ids = {
        str(_dig(row, "attributes.movie_id"))
        for row in all_records
        if _dig(row, "attributes.movie_id") not in (None, "")
    }
    theaters = {
        str(row.get("theater_name_raw"))
        for row in all_records
        if row.get("theater_name_raw") not in (None, "")
    }
    showtime_ids = {
        str(row.get("source_showtime_id"))
        for row in all_records
        if row.get("source_showtime_id") not in (None, "")
    }

    # Duplicate records: identical id within same file already covered; also title/time collisions.
    field_rows = [_field_stats_for_records(all_records, spec) for spec in FIELD_SPECS]
    captured = [row for row in field_rows if row["capture_status"] == "captured_in_scrape_log"]
    missing = [row for row in field_rows if row["capture_status"] == "not_captured_in_scrape_log"]

    payloads = list(api_payloads or [])
    log_attribute_analysis = analyze_log_attributes(all_records)
    api_attribute_analysis = (
        analyze_api_attributes(payloads)
        if payloads
        else {
            "unique_attributes": 0,
            "malformed_attribute_items": 0,
            "category_counts": {key: 0 for key in ATTR_CATEGORIES},
            "attributes": [],
            "note": "No API payload fixtures supplied.",
        }
    )
    if log_attribute_analysis["unique_attributes"] > 0 or any(
        _dig(row, "attributes.amc_attributes") is not None for row in all_records
    ):
        attribute_analysis = log_attribute_analysis
        if api_attribute_analysis["unique_attributes"] > 0:
            attribute_analysis = dict(attribute_analysis)
            attribute_analysis["api_fixture_unique_attributes"] = api_attribute_analysis[
                "unique_attributes"
            ]
    else:
        attribute_analysis = api_attribute_analysis
        if not payloads:
            attribute_analysis = {
                **api_attribute_analysis,
                "note": (
                    "No API payload fixtures supplied and scrape logs lack "
                    "attributes.amc_attributes (pre-P-18A)."
                ),
            }

    log_language_analysis = analyze_log_languages(all_records)
    if log_language_analysis["languages_object_present"] > 0:
        language_analysis = log_language_analysis
    elif payloads:
        language_analysis = analyze_languages(payloads)
    else:
        language_analysis = {
            "payloads_examined": len(all_records),
            "languages_object_present": 0,
            "spoken_distinct": {},
            "dubbed_over_distinct": {},
            "subtitle_distinct": {},
            "movies_with_varying_language_across_showtimes": 0,
            "recommended_concepts": [
                "spoken_language",
                "dubbed_language",
                "subtitle_language",
                "derived presentation attribute: dubbed",
                "derived presentation attribute: subtitled",
            ],
            "note": (
                "attributes.languages not present in these scrape logs "
                "(pre-P-18A); supply --api-payloads for fixture analysis."
            ),
        }

    perf_numbers = {
        str(_dig(row, "attributes.performance_number"))
        for row in all_records
        if _dig(row, "attributes.performance_number") not in (None, "")
    }
    ticket_prices_present = sum(
        1
        for row in all_records
        if isinstance(_dig(row, "attributes.ticket_prices"), list)
    )
    auditorium_present = sum(
        1 for row in all_records if _dig(row, "attributes.auditorium") not in (None, "")
    )

    def _field_present(api_path: str) -> int:
        return next(
            (int(row["present_count"]) for row in field_rows if row["api_path"] == api_path),
            0,
        )

    amc_attrs_in_sample = _field_present("attributes") > 0
    languages_in_sample = _field_present("languages") > 0
    critical_presentation_missing = [
        row["api_path"]
        for row in field_rows
        if row["api_path"]
        in {
            "attributes",
            "languages",
            "languages.spoken",
            "languages.dubbedOver",
            "languages.subtitle",
        }
        and row["present_count"] == 0
    ]
    critical_identity_missing = [
        row["api_path"]
        for row in field_rows
        if row["api_path"] in {"performanceNumber", "theatreId"}
        and row["present_count"] == 0
    ]

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "taxonomy_version": TAXONOMY_VERSION,
        "audit_kind": "amc_showtimes_field_population_and_attribute_taxonomy",
        "inputs": {
            "log_files": envelopes,
            "log_count": len(log_paths),
            "date_range": {
                "start": min(dates) if dates else None,
                "end": max(dates) if dates else None,
            },
            "api_payload_fixture_count": len(payloads),
        },
        "counts": {
            "raw_showtime_records": len(all_records),
            "distinct_source_showtime_ids": len(showtime_ids),
            "distinct_performance_numbers": len(perf_numbers) if perf_numbers else 0,
            "distinct_movie_ids": len(movie_ids),
            "distinct_theaters": len(theaters),
            "malformed_records_skipped": len(skip_reasons),
            "skip_reasons_sample": skip_reasons[:20],
        },
        "capture_gap_summary": {
            "documented_fields": len(FIELD_SPECS),
            "captured_in_scrape_logs": len(captured),
            "not_captured_in_scrape_logs": len(missing),
            "critical_missing_for_presentation_attributes": critical_presentation_missing,
            "critical_missing_for_identity_fallbacks": critical_identity_missing,
            "adapter_note": (
                "P-18A expands api_showtime_to_raw to retain amc_attributes, languages, "
                "identity fallbacks, pricing, auditorium/layout, and availability fields in "
                "record.attributes. Older logs may still lack these keys."
                if amc_attrs_in_sample or languages_in_sample
                else (
                    "Current adapter maps expanded P-18A fields, but this log sample has no "
                    "populated attributes.amc_attributes / languages values (pre-P-18A logs)."
                )
            ),
        },
        "field_population": field_rows,
        "premium_format_analysis": analyze_premium_format(all_records),
        "attribute_taxonomy": attribute_analysis,
        "language_analysis": language_analysis,
        "identity_analysis": analyze_identity(records_by_file),
        "pricing_analysis": {
            "available_in_logs": ticket_prices_present > 0,
            "records_with_ticket_prices": ticket_prices_present,
            "note": (
                "ticketPrices retained as attributes.ticket_prices (P-18A)."
                if ticket_prices_present
                else "ticketPrices[] not present in these logs (pre-P-18A or unset)."
            ),
            "recommendation": (
                "Keep raw ticket-offer rows for audit; do not expose prices publicly or "
                "fold them into presentation_attributes[]."
            ),
            "fixture_summary": _pricing_from_payloads(payloads) if payloads else None,
            "log_summary": _pricing_from_log_records(all_records),
        },
        "auditorium_analysis": {
            "available_in_logs": auditorium_present > 0
            or any(
                _dig(row, "attributes.layout_id") not in (None, "") for row in all_records
            ),
            "maximum_intended_attendance_non_empty": next(
                (
                    row["non_empty_count"]
                    for row in field_rows
                    if row["api_path"] == "maximumIntendedAttendance"
                ),
                0,
            ),
            "note": (
                "auditorium/layout/virtualAuditoriumId retained under attributes.* (P-18A)."
                if auditorium_present
                else "auditorium/layout fields not present in these logs (pre-P-18A or unset)."
            ),
            "recommendation": (
                "Capture auditorium + layoutId before deciding on an auditorium entity. "
                "Attendance alone is insufficient."
            ),
            "fixture_summary": _auditorium_from_payloads(payloads) if payloads else None,
            "log_summary": _auditorium_from_log_records(all_records),
        },
        "embargo_availability_analysis": {
            "isCanceled_captured": True,
            "isAlmostSoldOut_captured": True,
            "isSoldOut_captured": _field_present("isSoldOut") > 0,
            "isEmbargoed_captured": _field_present("isEmbargoed") > 0,
            "embargoed_captured": _field_present("embargoed") > 0,
            "visibilityDateTimeUtc_captured": _field_present("visibilityDateTimeUtc") > 0,
            "canceled_true_count": sum(1 for row in all_records if row.get("canceled") is True),
            "almost_sold_out_true_count": sum(
                1 for row in all_records if row.get("almost_sold_out") is True
            ),
            "sold_out_true_count": sum(
                1 for row in all_records if _dig(row, "attributes.is_sold_out") is True
            ),
            "recommendation": (
                "Preserve isSoldOut, isEmbargoed/embargoed, visibilityDateTimeUtc, and "
                "sellUntilDateTimeUtc as operational showtime fields — "
                "not presentation_attributes."
            ),
        },
        "future_architecture": {
            "presentation_attributes_direction": {
                "collection": "presentation_attributes[]",
                "supports_multiple_per_showtime": True,
                "categories": list(ATTR_CATEGORIES),
                "example": [
                    {
                        "code": "imax",
                        "category": "format",
                        "label": "IMAX",
                        "source": "amc",
                        "source_code": "IMAX",
                        "source_name": "IMAX",
                        "source_grain": "showtime",
                        "derivation": "attributes[] and/or premiumFormat",
                    },
                    {
                        "code": "open_caption",
                        "category": "accessibility",
                        "label": "Open Caption",
                        "source": "amc",
                        "source_code": "OPENCAPTION",
                        "source_grain": "showtime",
                        "derivation": "attributes[]",
                    },
                    {
                        "code": "dubbed",
                        "category": "language",
                        "label": "Dubbed in English",
                        "language": "English",
                        "source": "amc",
                        "source_grain": "showtime",
                        "derivation": "languages.dubbedOver",
                    },
                    {
                        "code": "q_and_a",
                        "category": "event",
                        "label": "Q&A",
                        "source": "amc",
                        "source_code": "INPERSNQA",
                        "source_grain": "showtime_or_product",
                        "derivation": "attributes[] and/or product classifier",
                    },
                ],
                "principles": [
                    "One showtime may have multiple presentation attributes.",
                    "Raw premiumFormat, attributes[], and languages remain available.",
                    "Product-level and showtime-level attributes may combine for display with provenance.",
                    "Open caption and closed-caption-device remain distinct codes.",
                    "Pricing, ticket state, and auditorium data stay outside this collection.",
                    "No public UI change is implied by capture or contract design.",
                ],
            },
            "blocker": (
                None
                if amc_attrs_in_sample and languages_in_sample
                else (
                    "This log sample does not yet contain populated attributes.amc_attributes "
                    "and languages; accumulate P-18A expanded production logs before implementing "
                    "presentation_attributes[]."
                )
            ),
        },
        "warnings": _build_warnings(field_rows, attribute_analysis, skip_reasons),
        "recommendations": [
            "Accumulate multiple daily logs with P-18A expanded fields before taxonomy conclusions.",
            "Rerun this audit on real production observations for attribute codes, languages, pricing, and auditorium.",
            "Keep premiumFormat raw even after presentation_attributes derivation.",
            "Use source_showtime_id (AMC id) as the leading identity; treat performanceNumber as fallback evidence.",
            "Define versioned presentation_attributes[] only after sufficient expanded-log evidence.",
        ],
    }
    assert_no_secret_leakage(report)
    return report


def _pricing_from_log_records(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    present = 0
    types: Counter[str] = Counter()
    for row in records:
        prices = _dig(row, "attributes.ticket_prices")
        if isinstance(prices, list) and prices:
            present += 1
            for item in prices:
                if isinstance(item, Mapping):
                    ticket_type = item.get("ticketType") or item.get("type")
                    if ticket_type not in (None, ""):
                        types[str(ticket_type)] += 1
    return {
        "records_with_ticket_prices": present,
        "ticket_types": dict(types.most_common(20)),
    }


def _auditorium_from_log_records(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    auditoriums = Counter(
        str(_dig(row, "attributes.auditorium"))
        for row in records
        if _dig(row, "attributes.auditorium") not in (None, "")
    )
    layouts = Counter(
        str(_dig(row, "attributes.layout_id"))
        for row in records
        if _dig(row, "attributes.layout_id") not in (None, "")
    )
    return {
        "distinct_auditoriums": len(auditoriums),
        "distinct_layout_ids": len(layouts),
        "top_auditoriums": auditoriums.most_common(10),
    }


def _pricing_from_payloads(payloads: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    present = 0
    types: Counter[str] = Counter()
    for show in payloads:
        prices = show.get("ticketPrices")
        if isinstance(prices, list) and prices:
            present += 1
            for item in prices:
                if isinstance(item, Mapping):
                    ticket_type = item.get("ticketType") or item.get("type")
                    if ticket_type not in (None, ""):
                        types[str(ticket_type)] += 1
    return {
        "payloads_with_ticket_prices": present,
        "ticket_types": dict(types.most_common(20)),
    }


def _auditorium_from_payloads(payloads: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    auditoriums = Counter(
        str(show.get("auditorium"))
        for show in payloads
        if show.get("auditorium") not in (None, "")
    )
    layouts = Counter(
        str(show.get("layoutId"))
        for show in payloads
        if show.get("layoutId") not in (None, "")
    )
    return {
        "distinct_auditoriums": len(auditoriums),
        "distinct_layout_ids": len(layouts),
        "top_auditoriums": auditoriums.most_common(10),
    }


def _build_warnings(
    field_rows: Sequence[Mapping[str, Any]],
    attribute_analysis: Mapping[str, Any],
    skip_reasons: Sequence[str],
) -> list[str]:
    amc_attrs_in_sample = any(
        row["api_path"] == "attributes" and int(row.get("present_count") or 0) > 0
        for row in field_rows
    )
    warnings: list[str] = []
    if amc_attrs_in_sample:
        warnings.append(
            "P-18A expanded fields are present in scrape logs; older logs may still lack them."
        )
    else:
        warnings.append(
            "This log sample lacks populated attributes.amc_attributes "
            "(pre-P-18A logs or empty capture)."
        )
    if skip_reasons:
        warnings.append(f"Skipped {len(skip_reasons)} malformed records.")
    unknown = int((attribute_analysis.get("category_counts") or {}).get(ATTR_UNKNOWN) or 0)
    if unknown:
        warnings.append(f"{unknown} attributes classified as unknown (needs review).")
    high_missing = [
        row["api_path"]
        for row in field_rows
        if row["capture_status"] == "not_captured_in_scrape_log"
        and row["recommendation"] in {RECOMMEND_CAPTURE, RECOMMEND_DERIVE, RECOMMEND_KEEP}
    ]
    if high_missing:
        warnings.append(
            "High-value documented fields missing from adapter mapping: "
            + ", ".join(high_missing[:12])
        )
    return warnings


def render_markdown(report: Mapping[str, Any]) -> str:
    """Render a concise human-readable audit summary."""
    counts = report.get("counts") or {}
    gap = report.get("capture_gap_summary") or {}
    inputs = report.get("inputs") or {}
    date_range = inputs.get("date_range") or {}
    premium = report.get("premium_format_analysis") or {}
    identity = report.get("identity_analysis") or {}
    attrs = report.get("attribute_taxonomy") or {}
    lines = [
        "# AMC Showtimes Field Audit",
        "",
        f"Generated: `{report.get('generated_at')}`",
        f"Logs: {inputs.get('log_count')} files "
        f"({date_range.get('start')} → {date_range.get('end')})",
        f"Records: **{counts.get('raw_showtime_records')}** · "
        f"Movie IDs: **{counts.get('distinct_movie_ids')}** · "
        f"Theaters: **{counts.get('distinct_theaters')}** · "
        f"Showtime IDs: **{counts.get('distinct_source_showtime_ids')}**",
        "",
        "## Capture gap (primary finding)",
        "",
        f"- Documented fields inventoried: {gap.get('documented_fields')}",
        f"- Captured in scrape logs: {gap.get('captured_in_scrape_logs')}",
        f"- Not captured: {gap.get('not_captured_in_scrape_logs')}",
        f"- Adapter note: {gap.get('adapter_note')}",
        "",
        "Critical missing for future `presentation_attributes[]`:",
        "",
    ]
    for item in gap.get("critical_missing_for_presentation_attributes") or []:
        lines.append(f"- `{item}`")
    lines.extend(
        [
            "",
            "## High-value fields already captured",
            "",
        ]
    )
    for row in report.get("field_population") or []:
        if row.get("capture_status") != "captured_in_scrape_log":
            continue
        if float(row.get("population_pct_non_empty") or 0) < 1:
            continue
        if row.get("recommendation") not in {RECOMMEND_KEEP, RECOMMEND_DERIVE}:
            continue
        lines.append(
            f"- `{row['api_path']}` → `{row['log_path']}` "
            f"({row['population_pct_non_empty']}% non-empty)"
        )
    lines.extend(
        [
            "",
            "## Premium format",
            "",
            f"- Both empty: {premium.get('both_empty')}",
            f"- format_raw == premium_format_raw: {premium.get('both_equal_nonempty')}",
            f"- Conflicts: {premium.get('conflicts_format_vs_attr')}",
            f"- Recommendation: {premium.get('recommendation')}",
            "",
            "## Attribute taxonomy",
            "",
            f"- Unique attributes (fixture/API payloads): {attrs.get('unique_attributes')}",
            f"- Note: {attrs.get('note')}",
            f"- Category counts: {attrs.get('category_counts')}",
            "",
            "## Identity",
            "",
            f"- Recommendation: {identity.get('recommendation')}",
            "",
            "## Future architecture",
            "",
            "Use extensible `presentation_attributes[]` with categories "
            "`format|accessibility|language|event|...`, preserving source codes/labels/provenance.",
            "",
            f"**Blocker:** {(report.get('future_architecture') or {}).get('blocker')}",
            "",
            "## Recommendations",
            "",
        ]
    )
    for item in report.get("recommendations") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Warnings", ""])
    for item in report.get("warnings") or []:
        lines.append(f"- {item}")
    lines.append("")
    return "\n".join(lines)


def write_audit_outputs(report: Mapping[str, Any], output_dir: Path | str) -> dict[str, Path]:
    """Write JSON/CSV/Markdown audit artifacts."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    assert_no_secret_leakage(report)

    json_path = out / "amc_showtimes_field_audit.json"
    md_path = out / "amc_showtimes_field_audit.md"
    field_csv = out / "amc_showtimes_field_population.csv"
    attr_csv = out / "amc_showtime_attributes.csv"
    identity_csv = out / "amc_showtime_identity_candidates.csv"

    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(report), encoding="utf-8")

    with field_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "api_path",
                "category",
                "log_path",
                "capture_status",
                "records_examined",
                "present_count",
                "non_null_count",
                "non_empty_count",
                "population_pct_non_empty",
                "distinct_values",
                "observed_types",
                "likely_grain",
                "recommendation",
                "notes",
            ],
        )
        writer.writeheader()
        for row in report.get("field_population") or []:
            writer.writerow(
                {
                    "api_path": row.get("api_path"),
                    "category": row.get("category"),
                    "log_path": row.get("log_path"),
                    "capture_status": row.get("capture_status"),
                    "records_examined": row.get("records_examined"),
                    "present_count": row.get("present_count"),
                    "non_null_count": row.get("non_null_count"),
                    "non_empty_count": row.get("non_empty_count"),
                    "population_pct_non_empty": row.get("population_pct_non_empty"),
                    "distinct_values": row.get("distinct_values"),
                    "observed_types": "|".join(row.get("observed_types") or []),
                    "likely_grain": row.get("likely_grain"),
                    "recommendation": row.get("recommendation"),
                    "notes": row.get("notes"),
                }
            )

    with attr_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "code",
                "name",
                "description",
                "occurrence_count",
                "distinct_movie_ids",
                "distinct_theaters",
                "category",
                "review_status",
                "evidence",
                "taxonomy_version",
                "source",
            ],
        )
        writer.writeheader()
        for row in (report.get("attribute_taxonomy") or {}).get("attributes") or []:
            writer.writerow({key: row.get(key) for key in writer.fieldnames})

    with identity_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["candidate", "available_in_logs", "notes", "extra"],
        )
        writer.writeheader()
        for row in (report.get("identity_analysis") or {}).get("candidates") or []:
            extra = {
                key: value
                for key, value in row.items()
                if key not in {"candidate", "available_in_logs", "notes"}
            }
            writer.writerow(
                {
                    "candidate": row.get("candidate"),
                    "available_in_logs": row.get("available_in_logs"),
                    "notes": row.get("notes"),
                    "extra": json.dumps(extra, ensure_ascii=False, sort_keys=True),
                }
            )

    return {
        "json": json_path,
        "markdown": md_path,
        "field_csv": field_csv,
        "attribute_csv": attr_csv,
        "identity_csv": identity_csv,
    }
