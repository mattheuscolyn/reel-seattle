"""AMC ``wwmReleaseNumber`` relationship audit (manual measurement only)."""

from __future__ import annotations

import csv
import json
import re
import statistics
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.analysis.amc_movies_client import (
    STATUS_MALFORMED,
    STATUS_MISSING,
    STATUS_REQUEST_FAILED,
    STATUS_RESPONSE_INVALID,
    STATUS_VALID,
    MovieIdPlan,
    SourcePlan,
    assert_no_secret_leakage,
    normalize_title_for_grouping,
    run_movie_lookups as _run_movie_lookups,
    sanitize_error_message,
    truncate_text,
)
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE

SCHEMA_VERSION = "1.0.0"

WWM_STATUS_VALID = STATUS_VALID
WWM_STATUS_MISSING = STATUS_MISSING
WWM_STATUS_MALFORMED = STATUS_MALFORMED
WWM_STATUS_REQUEST_FAILED = STATUS_REQUEST_FAILED
WWM_STATUS_RESPONSE_INVALID = STATUS_RESPONSE_INVALID

PARSED_MOVIE_STATUSES = frozenset(
    {WWM_STATUS_VALID, WWM_STATUS_MISSING, WWM_STATUS_MALFORMED}
)

SAFE_MOVIE_FIELDS = (
    "id",
    "name",
    "sortableName",
    "wwmReleaseNumber",
    "runTime",
    "releaseDateUtc",
    "earliestShowingUtc",
    "hasScheduledShowtimes",
    "onlineTicketAvailabilityDateUtc",
    "starringActors",
    "directors",
    "genre",
    "mpaaRating",
    "synopsis",
    "distributorId",
    "distributorCode",
    "preferredMediaType",
    "availableForAList",
    "slug",
    "websiteUrl",
    "showtimesUrl",
)

MEDIA_URL_FIELDS = (
    "posterDynamic",
    "heroDesktopDynamic",
    "heroMobileDynamic",
    "trailerHd",
    "trailerMp4",
)

PRODUCT_CATEGORIES = (
    "standard",
    "q_and_a",
    "special_introduction",
    "sensory_friendly",
    "open_caption",
    "dubbed_or_subtitled",
    "anniversary_or_rerelease",
    "mystery_screening",
    "concert_or_event",
    "marathon_or_multi_feature",
    "other_special",
    "unknown",
)

# Category detection order (first match wins for primary category).
_CATEGORY_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("q_and_a", re.compile(r"\bq\s*&\s*a\b|\bq\s+and\s+a\b|\bqa\b", re.I)),
    (
        "special_introduction",
        re.compile(r"special introduction|introduction with|intro with|\bintro\b", re.I),
    ),
    ("sensory_friendly", re.compile(r"sensory[- ]friendly", re.I)),
    (
        "open_caption",
        re.compile(r"open caption|open-caption|\boc\b|closed caption", re.I),
    ),
    (
        "dubbed_or_subtitled",
        re.compile(r"\bdubbed\b|\bsubtitled\b|\bsubtitles\b|\bdub\b", re.I),
    ),
    (
        "anniversary_or_rerelease",
        re.compile(r"anniversary|rerelease|re-release|remaster", re.I),
    ),
    (
        "mystery_screening",
        re.compile(r"screen unseen|scream unseen|mystery screening|secret screening", re.I),
    ),
    (
        "concert_or_event",
        re.compile(r"\bconcert\b|\blive\b|fathom|\bopera\b|\bballet\b|\bevent\b", re.I),
    ),
    (
        "marathon_or_multi_feature",
        re.compile(r"marathon|double feature|triple feature", re.I),
    ),
)

# Attribute-code hints for *product* types only. Do not treat common capability
# flags such as OPENCAPTION/CLOSEDCAPTION on ordinary theatrical movies as the
# primary product category.
_ATTR_CATEGORY_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("sensory_friendly", ("sensoryfriendly", "sensory-friendly", "sensory_friendly")),
    ("q_and_a", ("qanda", "q-and-a")),
)


@dataclass
class ReleaseAuditRow:
    amc_movie_id: str
    source_title: str | None
    source_occurrence_count: int
    parent_display_title: str | None
    screening_variant_type: str | None
    is_special_screening: bool | None
    amc_movie_name: str | None
    sortable_name: str | None
    wwm_release_number_raw: str | None
    wwm_release_number: str | None
    wwm_status: str
    product_category: str
    run_time: int | None
    release_date_utc: str | None
    earliest_showing_utc: str | None
    has_scheduled_showtimes: bool | None
    online_ticket_availability_date_utc: str | None
    starring_actors: str | None
    directors: str | None
    genre: str | None
    mpaa_rating: str | None
    synopsis: str | None
    distributor_id: str | None
    distributor_code: str | None
    preferred_media_type: str | None
    available_for_a_list: bool | None
    slug: str | None
    website_url: str | None
    showtimes_url: str | None
    attribute_codes: list[str] = field(default_factory=list)
    attribute_names: list[str] = field(default_factory=list)
    poster_dynamic: str | None = None
    hero_desktop_dynamic: str | None = None
    hero_mobile_dynamic: str | None = None
    trailer_hd: str | None = None
    trailer_mp4: str | None = None
    http_status: int | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalize_wwm_release_number(raw: object) -> tuple[str | None, str, str | None]:
    """Return ``(normalized, status, raw_scalar)`` for ``wwmReleaseNumber``."""
    if raw is None:
        return None, WWM_STATUS_MISSING, None
    if isinstance(raw, bool):
        return None, WWM_STATUS_MALFORMED, str(raw)
    if isinstance(raw, int):
        if raw <= 0:
            return None, WWM_STATUS_MISSING if raw == 0 else WWM_STATUS_MALFORMED, str(raw)
        return str(raw), WWM_STATUS_VALID, str(raw)
    if isinstance(raw, float):
        if not raw.is_integer() or raw <= 0:
            return None, WWM_STATUS_MALFORMED if raw < 0 or not raw.is_integer() else WWM_STATUS_MISSING, str(raw)
        return str(int(raw)), WWM_STATUS_VALID, str(int(raw))
    if not isinstance(raw, str):
        return None, WWM_STATUS_MALFORMED, str(raw)

    trimmed = raw.strip()
    if not trimmed:
        return None, WWM_STATUS_MISSING, ""
    if not re.fullmatch(r"\d+", trimmed):
        return None, WWM_STATUS_MALFORMED, trimmed
    value = int(trimmed)
    if value <= 0:
        return None, WWM_STATUS_MISSING if value == 0 else WWM_STATUS_MALFORMED, trimmed
    return str(value), WWM_STATUS_VALID, trimmed


def classify_product_category(
    *,
    name: str | None,
    source_title: str | None,
    attribute_codes: Sequence[str],
    attribute_names: Sequence[str],
    preferred_media_type: str | None,
) -> str:
    """Audit-only primary product category from names/attributes."""
    blob = " ".join(
        part
        for part in (
            name or "",
            source_title or "",
            " ".join(attribute_codes),
            " ".join(attribute_names),
            preferred_media_type or "",
        )
        if part
    )
    if not blob.strip():
        return "unknown"

    attr_blob = " ".join([*attribute_codes, *attribute_names]).casefold()
    for category, needles in _ATTR_CATEGORY_HINTS:
        if any(needle in attr_blob for needle in needles):
            return category

    for category, pattern in _CATEGORY_PATTERNS:
        if pattern.search(blob):
            return category

    media = (preferred_media_type or "").casefold()
    if media in {"event", "events"}:
        return "concert_or_event"

    # Title has variant markers without a more specific match.
    lowered = blob.casefold()
    if any(
        token in lowered
        for token in ("special", "premium", "imax", "dolby", "3d", "fan")
    ) and "q&a" not in lowered:
        if any(token in lowered for token in ("special", "fan")):
            return "other_special"

    # Default: if no special cues, treat as standard theatrical product.
    if media in {"", "theatrical"} or media == "theatrical":
        return "standard"
    return "unknown"


def extract_attribute_lists(body: Mapping[str, Any]) -> tuple[list[str], list[str]]:
    """Pull attribute codes/names from common AMC Movies shapes."""
    codes: list[str] = []
    names: list[str] = []

    def absorb(items: object) -> None:
        if not isinstance(items, list):
            return
        for item in items:
            if isinstance(item, str):
                text = item.strip()
                if text:
                    codes.append(text)
                continue
            if not isinstance(item, Mapping):
                continue
            code = item.get("code") or item.get("Code") or item.get("attributeCode")
            name = item.get("name") or item.get("Name") or item.get("description")
            if code not in (None, ""):
                codes.append(str(code).strip())
            if name not in (None, ""):
                names.append(str(name).strip())

    for key in ("attributes", "movieAttributes", "attributeCodes"):
        if key in body:
            absorb(body.get(key))

    embedded = body.get("_embedded")
    if isinstance(embedded, Mapping):
        for key in ("attributes", "movieAttributes"):
            if key in embedded:
                absorb(embedded.get(key))

    # Deduplicate preserving order
    def uniq(values: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            out.append(value)
        return out

    return uniq(codes), uniq(names)


def extract_media_urls(body: Mapping[str, Any]) -> dict[str, str | None]:
    """Extract selected media URL fields from top-level or media maps."""
    result: dict[str, str | None] = {key: None for key in MEDIA_URL_FIELDS}
    for key in MEDIA_URL_FIELDS:
        if key in body and body.get(key) not in (None, ""):
            result[key] = truncate_text(body.get(key), limit=180)

    media = body.get("media")
    if isinstance(media, Mapping):
        for key in MEDIA_URL_FIELDS:
            if result[key] is None and media.get(key) not in (None, ""):
                result[key] = truncate_text(media.get(key), limit=180)
    return result


def _optional_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _optional_bool(value: object) -> bool | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().casefold()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
    return None


def sanitize_movie_body(body: Mapping[str, Any]) -> dict[str, Any]:
    """Retain only allowlisted movie fields for audit rows."""
    out: dict[str, Any] = {}
    for key in SAFE_MOVIE_FIELDS:
        if key in body:
            value = body.get(key)
            if key in {"synopsis", "websiteUrl", "showtimesUrl", "starringActors", "directors"}:
                out[key] = truncate_text(value, limit=240 if key == "synopsis" else 180)
            else:
                out[key] = value
    codes, names = extract_attribute_lists(body)
    out["attribute_codes"] = codes
    out["attribute_names"] = names
    out.update(extract_media_urls(body))
    return out


def classify_release_lookup(
    plan: MovieIdPlan,
    *,
    http_status: int | None,
    body: Mapping[str, Any] | None,
    error: str | None = None,
) -> ReleaseAuditRow:
    """Build one sanitized release-audit row."""
    base = ReleaseAuditRow(
        amc_movie_id=plan.amc_movie_id,
        source_title=plan.source_title,
        source_occurrence_count=plan.occurrence_count,
        parent_display_title=plan.parent_display_title,
        screening_variant_type=plan.screening_variant_type,
        is_special_screening=plan.is_special_screening,
        amc_movie_name=None,
        sortable_name=None,
        wwm_release_number_raw=None,
        wwm_release_number=None,
        wwm_status=WWM_STATUS_REQUEST_FAILED,
        product_category="unknown",
        run_time=None,
        release_date_utc=None,
        earliest_showing_utc=None,
        has_scheduled_showtimes=None,
        online_ticket_availability_date_utc=None,
        starring_actors=None,
        directors=None,
        genre=None,
        mpaa_rating=None,
        synopsis=None,
        distributor_id=None,
        distributor_code=None,
        preferred_media_type=None,
        available_for_a_list=None,
        slug=None,
        website_url=None,
        showtimes_url=None,
        http_status=http_status,
        error=sanitize_error_message(error),
    )

    if http_status is None:
        base.wwm_status = WWM_STATUS_REQUEST_FAILED
        base.error = sanitize_error_message(error or "request failed")
        return base

    if http_status != 200:
        base.wwm_status = WWM_STATUS_REQUEST_FAILED
        base.error = sanitize_error_message(error or f"HTTP {http_status}")
        return base

    if not isinstance(body, Mapping):
        base.wwm_status = WWM_STATUS_RESPONSE_INVALID
        base.error = sanitize_error_message(error or "response is not a JSON object")
        return base

    safe = sanitize_movie_body(body)
    if "id" not in safe and "name" not in safe and "wwmReleaseNumber" not in body:
        base.wwm_status = WWM_STATUS_RESPONSE_INVALID
        base.error = "movie payload missing expected fields"
        return base

    name = truncate_text(safe.get("name"), limit=180)
    base.amc_movie_name = name
    base.sortable_name = truncate_text(safe.get("sortableName"), limit=180)
    base.run_time = _optional_int(safe.get("runTime"))
    base.release_date_utc = truncate_text(safe.get("releaseDateUtc"), limit=64)
    base.earliest_showing_utc = truncate_text(safe.get("earliestShowingUtc"), limit=64)
    base.has_scheduled_showtimes = _optional_bool(safe.get("hasScheduledShowtimes"))
    base.online_ticket_availability_date_utc = truncate_text(
        safe.get("onlineTicketAvailabilityDateUtc"), limit=64
    )
    base.starring_actors = truncate_text(safe.get("starringActors"), limit=180)
    base.directors = truncate_text(safe.get("directors"), limit=180)
    base.genre = truncate_text(safe.get("genre"), limit=120)
    base.mpaa_rating = truncate_text(safe.get("mpaaRating"), limit=32)
    base.synopsis = truncate_text(safe.get("synopsis"), limit=240)
    dist_id = safe.get("distributorId")
    base.distributor_id = str(dist_id).strip() if dist_id not in (None, "") else None
    base.distributor_code = truncate_text(safe.get("distributorCode"), limit=64)
    base.preferred_media_type = truncate_text(safe.get("preferredMediaType"), limit=64)
    base.available_for_a_list = _optional_bool(safe.get("availableForAList"))
    base.slug = truncate_text(safe.get("slug"), limit=120)
    base.website_url = truncate_text(safe.get("websiteUrl"), limit=180)
    base.showtimes_url = truncate_text(safe.get("showtimesUrl"), limit=180)
    base.attribute_codes = list(safe.get("attribute_codes") or [])
    base.attribute_names = list(safe.get("attribute_names") or [])
    base.poster_dynamic = safe.get("posterDynamic")
    base.hero_desktop_dynamic = safe.get("heroDesktopDynamic")
    base.hero_mobile_dynamic = safe.get("heroMobileDynamic")
    base.trailer_hd = safe.get("trailerHd")
    base.trailer_mp4 = safe.get("trailerMp4")
    base.error = None

    if "wwmReleaseNumber" not in body:
        base.wwm_status = WWM_STATUS_MISSING
        base.product_category = classify_product_category(
            name=name,
            source_title=plan.source_title,
            attribute_codes=base.attribute_codes,
            attribute_names=base.attribute_names,
            preferred_media_type=base.preferred_media_type,
        )
        return base

    normalized, status, raw = normalize_wwm_release_number(body.get("wwmReleaseNumber"))
    base.wwm_release_number = normalized
    base.wwm_release_number_raw = raw
    base.wwm_status = status
    base.product_category = classify_product_category(
        name=name,
        source_title=plan.source_title,
        attribute_codes=base.attribute_codes,
        attribute_names=base.attribute_names,
        preferred_media_type=base.preferred_media_type,
    )
    return base


def base_like_title(title: str | None) -> str:
    """Strip common presentation suffixes for audit-only base title comparison."""
    text = normalize_title_for_grouping(title)
    if not text:
        return ""
    text = re.sub(
        r"\s*[-:]\s*(q\s*&\s*a|q\s+and\s+a|special introduction|sensory friendly.*|"
        r"open caption.*|anniversary.*)$",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\s+", " ", text).strip(" -:")
    return text


def _values_conflict(values: Sequence[object | None]) -> bool:
    cleaned = {json.dumps(v, sort_keys=True, default=str) for v in values if v not in (None, "", [])}
    return len(cleaned) > 1


def _presentation_signals(name: str | None, source_title: str | None) -> dict[str, bool]:
    blob = f"{name or ''} {source_title or ''}".casefold()
    return {
        "appears_standard": classify_product_category(
            name=name,
            source_title=source_title,
            attribute_codes=[],
            attribute_names=[],
            preferred_media_type="Theatrical",
        )
        == "standard"
        and not any(
            token in blob
            for token in ("q&a", "q and a", "introduction", "sensory", "caption", "mystery")
        ),
        "appears_q_and_a": bool(re.search(r"q\s*&\s*a|q\s+and\s+a", blob)),
        "appears_introduction": "introduction" in blob or bool(re.search(r"\bintro\b", blob)),
        "appears_sensory_friendly": "sensory" in blob,
        "appears_captioned": "caption" in blob,
        "appears_dubbed_or_subtitled": bool(re.search(r"dubbed|subtitled|subtitles", blob)),
        "appears_anniversary_or_rerelease": bool(
            re.search(r"anniversary|rerelease|re-release|remaster", blob)
        ),
        "appears_event_or_mystery": bool(
            re.search(r"screen unseen|scream unseen|mystery|concert|\bevent\b", blob)
        ),
        "appears_marathon_or_multi_feature": bool(
            re.search(r"marathon|double feature|triple feature", blob)
        ),
    }


def analyze_release_group(release_number: str, rows: Sequence[ReleaseAuditRow]) -> dict[str, Any]:
    """Build one release-number group analysis record."""
    members = sorted(rows, key=lambda row: row.amc_movie_id)
    categories = [row.product_category for row in members]
    runtimes = [row.run_time for row in members]
    release_dates = [row.release_date_utc for row in members]
    distributors = [row.distributor_code for row in members]
    genres = [row.genre for row in members]
    ratings = [row.mpaa_rating for row in members]
    directors = [row.directors for row in members]
    casts = [row.starring_actors for row in members]
    synopses = [row.synopsis for row in members]
    posters = [row.poster_dynamic for row in members]
    trailers = [row.trailer_hd or row.trailer_mp4 for row in members]
    scheduled = [row.has_scheduled_showtimes for row in members]
    base_titles = [base_like_title(row.amc_movie_name or row.source_title) for row in members]
    base_title_set = {t for t in base_titles if t}

    conflicts = {
        "base_like_title": len(base_title_set) > 1,
        "runtime": _values_conflict(runtimes),
        "release_date": _values_conflict(release_dates),
        "distributor": _values_conflict(distributors),
        "genre": _values_conflict(genres),
        "rating": _values_conflict(ratings),
        "directors": _values_conflict(directors),
        "cast": _values_conflict(casts),
        "synopsis": _values_conflict(synopses),
        "poster_url": _values_conflict(posters),
        "trailer_url": _values_conflict(trailers),
        "scheduled_showtimes": _values_conflict(scheduled),
        "attributes": _values_conflict([sorted(row.attribute_codes) for row in members]),
    }

    # Unrelated-title heuristic: multiple base-like titles with low token overlap.
    unrelated_candidate = False
    if len(base_title_set) > 1:
        tokensets = [set(t.split()) for t in sorted(base_title_set)]
        overlap_scores: list[float] = []
        for i, left in enumerate(tokensets):
            for right in tokensets[i + 1 :]:
                if not left or not right:
                    continue
                overlap = len(left & right) / max(1, len(left | right))
                overlap_scores.append(overlap)
        unrelated_candidate = bool(overlap_scores) and max(overlap_scores) < 0.34

    standardish = [
        row
        for row in members
        if row.product_category == "standard"
        or (
            row.product_category == "unknown"
            and (row.preferred_media_type or "").casefold() == "theatrical"
        )
    ]
    likely_standard = None
    if standardish:
        # Prefer shortest name among standard-ish products (audit inference only).
        pick = sorted(
            standardish,
            key=lambda row: (len(row.amc_movie_name or row.source_title or ""), row.amc_movie_id),
        )[0]
        likely_standard = {
            "amc_movie_id": pick.amc_movie_id,
            "amc_movie_name": pick.amc_movie_name,
            "label": "audit_inference_only",
        }

    runtime_values = [r for r in runtimes if isinstance(r, int)]
    runtime_span = (max(runtime_values) - min(runtime_values)) if len(runtime_values) > 1 else 0

    member_payloads = []
    for row in members:
        member_payloads.append(
            {
                "amc_movie_id": row.amc_movie_id,
                "source_title": row.source_title,
                "amc_movie_name": row.amc_movie_name,
                "product_category": row.product_category,
                "run_time": row.run_time,
                "release_date_utc": row.release_date_utc,
                "distributor_code": row.distributor_code,
                "preferred_media_type": row.preferred_media_type,
                "attribute_codes": row.attribute_codes,
                "presentation_signals": _presentation_signals(row.amc_movie_name, row.source_title),
                "source_occurrence_count": row.source_occurrence_count,
                "parent_display_title": row.parent_display_title,
                "screening_variant_type": row.screening_variant_type,
                "is_special_screening": row.is_special_screening,
            }
        )

    return {
        "wwm_release_number": release_number,
        "member_count": len(members),
        "amc_movie_ids": [row.amc_movie_id for row in members],
        "amc_movie_names": [row.amc_movie_name for row in members],
        "source_titles": [row.source_title for row in members],
        "categories": categories,
        "runtimes": runtimes,
        "release_dates": release_dates,
        "distributor_codes": distributors,
        "media_types": [row.preferred_media_type for row in members],
        "attribute_codes_union": sorted({code for row in members for code in row.attribute_codes}),
        "conflicts": conflicts,
        "runtime_span_minutes": runtime_span,
        "unrelated_title_candidate": unrelated_candidate,
        "likely_standard_product_candidate": likely_standard,
        "members": member_payloads,
        "review_flags": sorted(
            {
                *(["multi_product"] if len(members) > 1 else []),
                *(["unrelated_title_candidate"] if unrelated_candidate else []),
                *(["runtime_conflict"] if conflicts["runtime"] else []),
                *(["release_date_conflict"] if conflicts["release_date"] else []),
                *(["distributor_conflict"] if conflicts["distributor"] else []),
                *(["cast_or_director_conflict"] if conflicts["cast"] or conflicts["directors"] else []),
                *(["media_conflict"] if conflicts["poster_url"] or conflicts["trailer_url"] else []),
            }
        ),
    }


def detect_amc_id_release_conflicts(rows: Sequence[ReleaseAuditRow]) -> list[dict[str, Any]]:
    """Report AMC movie IDs that somehow map to multiple valid release numbers."""
    by_id: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if row.wwm_status == WWM_STATUS_VALID and row.wwm_release_number:
            by_id[row.amc_movie_id].add(row.wwm_release_number)

    conflicts = []
    for movie_id, releases in sorted(by_id.items()):
        if len(releases) > 1:
            conflicts.append(
                {
                    "amc_movie_id": movie_id,
                    "wwm_release_numbers": sorted(releases),
                }
            )
    return conflicts


def titles_with_multiple_release_numbers(rows: Sequence[ReleaseAuditRow]) -> list[dict[str, Any]]:
    """Normalized title keys that map to more than one valid release number."""
    by_title: dict[str, dict[str, Any]] = {}
    for row in rows:
        if row.wwm_status != WWM_STATUS_VALID or not row.wwm_release_number:
            continue
        key = base_like_title(row.amc_movie_name or row.source_title)
        if not key:
            continue
        bucket = by_title.setdefault(
            key,
            {
                "title_key": key,
                "wwm_release_numbers": set(),
                "amc_movie_ids": set(),
                "display_titles": set(),
            },
        )
        bucket["wwm_release_numbers"].add(row.wwm_release_number)
        bucket["amc_movie_ids"].add(row.amc_movie_id)
        if row.amc_movie_name or row.source_title:
            bucket["display_titles"].add(row.amc_movie_name or row.source_title)

    results = []
    for key, bucket in sorted(by_title.items()):
        releases = sorted(bucket["wwm_release_numbers"])
        if len(releases) <= 1:
            continue
        results.append(
            {
                "title_key": key,
                "wwm_release_numbers": releases,
                "amc_movie_ids": sorted(bucket["amc_movie_ids"]),
                "display_titles": sorted(bucket["display_titles"]),
            }
        )
    return results


def build_report(
    *,
    source: SourcePlan,
    rows: Sequence[ReleaseAuditRow],
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Assemble sanitized wwmReleaseNumber audit report."""
    pacific = ZoneInfo(DEFAULT_TIMEZONE)
    stamp = generated_at or datetime.now(pacific).isoformat(timespec="seconds")

    parsed = [row for row in rows if row.wwm_status in PARSED_MOVIE_STATUSES]
    request_failed = sum(1 for row in rows if row.wwm_status == WWM_STATUS_REQUEST_FAILED)
    response_invalid = sum(1 for row in rows if row.wwm_status == WWM_STATUS_RESPONSE_INVALID)
    valid = [row for row in rows if row.wwm_status == WWM_STATUS_VALID]
    missing = sum(1 for row in rows if row.wwm_status == WWM_STATUS_MISSING)
    malformed = sum(1 for row in rows if row.wwm_status == WWM_STATUS_MALFORMED)

    parsed_count = len(parsed)
    distinct = source.distinct_count
    coverage_parsed = round(100.0 * len(valid) / parsed_count, 2) if parsed_count else 0.0
    coverage_distinct = round(100.0 * len(valid) / distinct, 2) if distinct else 0.0

    by_release: dict[str, list[ReleaseAuditRow]] = defaultdict(list)
    for row in valid:
        assert row.wwm_release_number
        by_release[row.wwm_release_number].append(row)

    groups = [analyze_release_group(number, members) for number, members in sorted(by_release.items())]
    group_sizes = [group["member_count"] for group in groups]
    multi_groups = [group for group in groups if group["member_count"] > 1]
    singleton_count = sum(1 for size in group_sizes if size == 1)

    category_counter = Counter(row.product_category for row in rows)
    category_with_valid = Counter(
        row.product_category for row in rows if row.wwm_status == WWM_STATUS_VALID
    )

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source_artifact": source.source_artifact,
        "source_artifact_date": source.source_artifact_date,
        "raw_amc_records": source.raw_amc_records,
        "distinct_amc_movie_ids": distinct,
        "requests_attempted": len(rows),
        "requests_succeeded": parsed_count,
        "requests_failed": request_failed + response_invalid,
        "coverage": {
            "valid_wwm_release_number": len(valid),
            "missing_wwm_release_number": missing,
            "malformed_wwm_release_number": malformed,
            "request_failed": request_failed,
            "response_invalid": response_invalid,
            "coverage_percent_of_parsed_movies": coverage_parsed,
            "coverage_percent_of_distinct_ids": coverage_distinct,
        },
        "cardinality": {
            "distinct_wwm_release_numbers": len(groups),
            "singleton_groups": singleton_count,
            "multi_product_groups": len(multi_groups),
            "largest_group_size": max(group_sizes) if group_sizes else 0,
            "average_group_size": round(statistics.mean(group_sizes), 3) if group_sizes else 0.0,
            "median_group_size": float(statistics.median(group_sizes)) if group_sizes else 0.0,
            "group_size_histogram": dict(sorted(Counter(group_sizes).items())),
        },
        "categories": {
            "all_rows": dict(sorted(category_counter.items())),
            "rows_with_valid_wwm": dict(sorted(category_with_valid.items())),
        },
        "conflicts": {
            "amc_movie_ids_with_multiple_release_numbers": detect_amc_id_release_conflicts(rows),
            "titles_with_multiple_release_numbers": titles_with_multiple_release_numbers(rows),
            "unrelated_title_group_candidates": [
                {
                    "wwm_release_number": group["wwm_release_number"],
                    "amc_movie_ids": group["amc_movie_ids"],
                    "amc_movie_names": group["amc_movie_names"],
                    "source_titles": group["source_titles"],
                    "release_dates": group["release_dates"],
                    "distributor_codes": group["distributor_codes"],
                    "runtimes": group["runtimes"],
                    "genres": [row.genre for row in by_release[group["wwm_release_number"]]],
                }
                for group in groups
                if group["unrelated_title_candidate"]
            ],
        },
        "release_groups": groups,
        "multi_product_groups": multi_groups,
        "rows": [row.to_dict() for row in rows],
    }
    assert_no_secret_leakage(report)
    return report


def write_audit_outputs(report: Mapping[str, Any], output_dir: Path | str) -> dict[str, Path]:
    """Write JSON, movie-row CSV, group CSV, and Markdown summary."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    json_path = out / "amc_wwm_release_audit.json"
    rows_csv = out / "amc_wwm_release_rows.csv"
    groups_csv = out / "amc_wwm_release_groups.csv"
    md_path = out / "amc_wwm_release_summary.md"

    assert_no_secret_leakage(report)
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    row_fields = [
        "amc_movie_id",
        "source_title",
        "amc_movie_name",
        "wwm_release_number",
        "wwm_status",
        "product_category",
        "run_time",
        "release_date_utc",
        "distributor_code",
        "preferred_media_type",
        "attribute_codes",
        "parent_display_title",
        "screening_variant_type",
        "is_special_screening",
        "http_status",
        "error",
    ]
    with rows_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=row_fields)
        writer.writeheader()
        for row in report.get("rows", []):
            payload = {key: row.get(key) for key in row_fields}
            codes = payload.get("attribute_codes") or []
            payload["attribute_codes"] = "|".join(codes) if isinstance(codes, list) else codes
            writer.writerow(payload)

    group_fields = [
        "wwm_release_number",
        "member_count",
        "amc_movie_ids",
        "amc_movie_names",
        "categories",
        "runtimes",
        "release_dates",
        "distributor_codes",
        "has_field_conflicts",
        "review_flags",
        "unrelated_title_candidate",
        "likely_standard_product_candidate_id",
    ]
    with groups_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=group_fields)
        writer.writeheader()
        for group in report.get("release_groups", []):
            conflicts = group.get("conflicts") or {}
            has_conflicts = any(bool(v) for v in conflicts.values())
            likely = group.get("likely_standard_product_candidate") or {}
            writer.writerow(
                {
                    "wwm_release_number": group.get("wwm_release_number"),
                    "member_count": group.get("member_count"),
                    "amc_movie_ids": "|".join(group.get("amc_movie_ids") or []),
                    "amc_movie_names": "|".join(
                        str(x) for x in (group.get("amc_movie_names") or []) if x
                    ),
                    "categories": "|".join(str(x) for x in (group.get("categories") or [])),
                    "runtimes": "|".join(
                        "" if x is None else str(x) for x in (group.get("runtimes") or [])
                    ),
                    "release_dates": "|".join(
                        "" if x is None else str(x) for x in (group.get("release_dates") or [])
                    ),
                    "distributor_codes": "|".join(
                        "" if x is None else str(x) for x in (group.get("distributor_codes") or [])
                    ),
                    "has_field_conflicts": has_conflicts,
                    "review_flags": "|".join(group.get("review_flags") or []),
                    "unrelated_title_candidate": group.get("unrelated_title_candidate"),
                    "likely_standard_product_candidate_id": likely.get("amc_movie_id"),
                }
            )

    md_path.write_text(render_markdown_summary(report), encoding="utf-8")
    return {
        "json": json_path,
        "rows_csv": rows_csv,
        "groups_csv": groups_csv,
        "markdown": md_path,
    }


def render_markdown_summary(report: Mapping[str, Any]) -> str:
    """Human-readable markdown summary + architecture recommendation stub."""
    coverage = report.get("coverage") or {}
    cardinality = report.get("cardinality") or {}
    conflicts = report.get("conflicts") or {}
    multi = report.get("multi_product_groups") or []
    unrelated = conflicts.get("unrelated_title_group_candidates") or []
    multi_title = conflicts.get("titles_with_multiple_release_numbers") or []
    id_conflicts = conflicts.get("amc_movie_ids_with_multiple_release_numbers") or []

    lines = [
        "# AMC wwmReleaseNumber Relationship Audit",
        "",
        f"- Generated: `{report.get('generated_at')}`",
        f"- Source artifact: `{report.get('source_artifact')}`",
        f"- Source artifact date: `{report.get('source_artifact_date')}`",
        f"- Raw AMC records: **{report.get('raw_amc_records')}**",
        f"- Distinct AMC movie IDs: **{report.get('distinct_amc_movie_ids')}**",
        f"- Requests succeeded: **{report.get('requests_succeeded')}**",
        f"- Requests failed: **{report.get('requests_failed')}**",
        "",
        "## Coverage",
        "",
        f"- Valid release numbers: **{coverage.get('valid_wwm_release_number')}**",
        f"- Missing: **{coverage.get('missing_wwm_release_number')}**",
        f"- Malformed: **{coverage.get('malformed_wwm_release_number')}**",
        f"- Request failures: **{coverage.get('request_failed')}**",
        f"- Coverage of parsed responses: **{coverage.get('coverage_percent_of_parsed_movies')}%**",
        f"- Coverage of distinct IDs: **{coverage.get('coverage_percent_of_distinct_ids')}%**",
        "",
        "## Cardinality",
        "",
        f"- Distinct release numbers: **{cardinality.get('distinct_wwm_release_numbers')}**",
        f"- Singleton groups: **{cardinality.get('singleton_groups')}**",
        f"- Multi-product groups: **{cardinality.get('multi_product_groups')}**",
        f"- Largest group size: **{cardinality.get('largest_group_size')}**",
        f"- Average group size: **{cardinality.get('average_group_size')}**",
        f"- Median group size: **{cardinality.get('median_group_size')}**",
        "",
        "Shared release numbers do **not** automatically justify merging AMC movie products.",
        "",
        "## Multi-product group examples",
        "",
    ]

    if not multi:
        lines.append("- None observed in this run.")
        lines.append("")
    else:
        for group in sorted(multi, key=lambda g: (-g.get("member_count", 0), g.get("wwm_release_number", "")))[
            :15
        ]:
            lines.append(
                f"- `{group.get('wwm_release_number')}` ({group.get('member_count')} products): "
                + "; ".join(
                    f"{name or '?'} [{cat}]"
                    for name, cat in zip(
                        group.get("amc_movie_names") or [],
                        group.get("categories") or [],
                        strict=False,
                    )
                )
            )
        lines.append("")

    lines.extend(
        [
            "## Conflict / review candidates",
            "",
            f"- Unrelated-title group candidates: **{len(unrelated)}**",
            f"- Same title across multiple release numbers: **{len(multi_title)}**",
            f"- AMC IDs with conflicting release numbers: **{len(id_conflicts)}**",
            "",
        ]
    )

    if unrelated:
        lines.append("### Unrelated-title candidates")
        lines.append("")
        for item in unrelated[:10]:
            lines.append(
                f"- `{item.get('wwm_release_number')}`: "
                + ", ".join(f"`{n}`" for n in (item.get("amc_movie_names") or []) if n)
            )
        lines.append("")

    if multi_title:
        lines.append("### Titles spanning multiple release numbers")
        lines.append("")
        for item in multi_title[:10]:
            lines.append(
                f"- `{item.get('title_key')}` → "
                + ", ".join(f"`{n}`" for n in item.get("wwm_release_numbers") or [])
            )
        lines.append("")

    lines.extend(
        [
            "## Presentation metadata notes",
            "",
            "- Compare runtime spans, release dates, cast/directors, synopsis, and media within multi-product groups in the JSON/CSV outputs.",
            "- `likely_standard_product_candidate` is an audit inference only and must not modify data.",
            "",
            "## Limitations",
            "",
            "- Manual measurement only; not persisted into showtimes/history.",
            "- No TMDB/Letterboxd verification.",
            "- Categories are descriptive audit labels, not production identity rules.",
            "- Full AMC payloads and secrets are excluded from outputs.",
            "",
            "## Architecture recommendation",
            "",
            "_Filled by the operator/completion report after inspecting live results "
            "(Outcome A / B / C)._",
            "",
        ]
    )

    text = "\n".join(lines)
    assert_no_secret_leakage({"markdown": text})
    return text


def run_release_lookups(
    plans: Sequence[MovieIdPlan],
    fetch_movie,
    *,
    sleep_seconds: float = 1.0,
) -> list[ReleaseAuditRow]:
    return _run_movie_lookups(
        plans,
        fetch_movie,
        classify_release_lookup,
        sleep_seconds=sleep_seconds,
    )
