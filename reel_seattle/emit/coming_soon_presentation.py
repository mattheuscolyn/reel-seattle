"""Coming Soon presentation classification and display metadata.

This module never writes canonical ``film_id``. Inferred TMDB ids may supply
artwork/overview with explicit ``inferred_tmdb`` provenance, but they are not
treated as reviewed identity.
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.enrichment.constants import (
    DEFAULT_SECURE_BASE_URL,
    POSTER_SIZE,
    BACKDROP_SIZE,
    OVERVIEW_MAX_LEN,
)
from reel_seattle.enrichment.normalize import resolve_image_url

KIND_FILM = "film"
KIND_RERELEASE = "rerelease"
KIND_EVENT = "event"
KIND_MYSTERY = "mystery_screening"
KIND_PLACEHOLDER = "placeholder"
KIND_RENTAL = "rental"
KIND_OTHER = "other"

PUBLIC_KINDS = frozenset(
    {KIND_FILM, KIND_RERELEASE, KIND_EVENT, KIND_MYSTERY, KIND_OTHER}
)
EXCLUDED_KINDS = frozenset({KIND_RENTAL, KIND_PLACEHOLDER})

PRESENTATION_SOURCE_ENRICHMENT = "confirmed_enrichment"
PRESENTATION_SOURCE_AMC = "amc_catalog"
PRESENTATION_SOURCE_TMDB = "inferred_tmdb"
PRESENTATION_SOURCE_FALLBACK = "fallback"

LOCAL_STATUS_SCHEDULED = "scheduled"
LOCAL_STATUS_NOT_ANNOUNCED = "not_announced"

EXCLUSION_RENTAL = "private_theatre_rental"
EXCLUSION_PLACEHOLDER = "untitled_distributor_placeholder"
EXCLUSION_OPERATIONAL = "operational_or_test_row"

DEFAULT_PRODUCTS_PATH = Path("data/source_catalog/amc_movie_products.json")
DEFAULT_ENRICHMENT_PATH = Path("public/data/film_enrichment_current.json")

_RENTAL_RE = re.compile(
    r"private\s+theat(?:re|er)\s+rental",
    re.IGNORECASE,
)
_DATED_PARENS_RE = re.compile(
    r"\(\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*\)",
)
_UNTITLED_RE = re.compile(r"^untitled\b", re.IGNORECASE)
_EVENT_WORD_RE = re.compile(r"\bevents?\b", re.IGNORECASE)
_MYSTERY_RE = re.compile(
    r"\b(?:screen\s+unseen|scream\s+unseen|mystery\s+(?:movie|screening))\b",
    re.IGNORECASE,
)
_RERELEASE_RE = re.compile(
    r"\b(?:anniversary|re-?release|ghibli\s+fest)\b",
    re.IGNORECASE,
)
_OPERATIONAL_RE = re.compile(
    r"^(?:ene\s+repeat|test\s+(?:film|screening|title|movie))\b",
    re.IGNORECASE,
)

_AMC_CATEGORY_TO_KIND = {
    "standard": KIND_FILM,
    "sensory_friendly": KIND_FILM,
    "open_caption": KIND_FILM,
    "dubbed_or_subtitled": KIND_FILM,
    "anniversary_or_rerelease": KIND_RERELEASE,
    "concert_or_event": KIND_EVENT,
    "q_and_a": KIND_EVENT,
    "marathon_or_multi_feature": KIND_EVENT,
    "special_introduction": KIND_EVENT,
    "mystery_screening": KIND_MYSTERY,
    "other_special": KIND_OTHER,
    "unknown": KIND_OTHER,
}


def classify_presentation_kind(
    title: str,
    *,
    amc_presentation_category: str | None = None,
    variant_titles: Sequence[str] = (),
) -> tuple[str, str | None]:
    """Return ``(kind, exclusion_reason)`` for a Coming Soon title.

    High-confidence non-film SKUs (private rentals, dated Untitled distributor
    slots, operational repeats) are excluded from the public list. Mystery
    screenings such as AMC Screen Unseen are classified, not dropped, so the
    product/UI layer can decide whether to show them. Anniversary rereleases,
    Ghibli Fest, Q&As, and other event cinema stay visible.
    """
    samples = [title, *variant_titles]
    blob = " ".join(sample for sample in samples if sample)

    if any(_RENTAL_RE.search(sample or "") for sample in samples):
        return KIND_RENTAL, EXCLUSION_RENTAL
    if any(_OPERATIONAL_RE.search((sample or "").strip()) for sample in samples):
        return KIND_OTHER, EXCLUSION_OPERATIONAL
    if _is_untitled_placeholder(samples):
        return KIND_PLACEHOLDER, EXCLUSION_PLACEHOLDER
    if _MYSTERY_RE.search(blob):
        return KIND_MYSTERY, None
    if _RERELEASE_RE.search(blob):
        return KIND_RERELEASE, None

    kind = _AMC_CATEGORY_TO_KIND.get(str(amc_presentation_category or ""), KIND_FILM)
    return kind, None


def is_public_presentation(kind: str, exclusion_reason: str | None) -> bool:
    """True when the row may appear as a consumer-facing Coming Soon card."""
    if exclusion_reason:
        return False
    return kind in PUBLIC_KINDS


def _is_untitled_placeholder(titles: Sequence[str]) -> bool:
    """Dated or event-tagged Untitled rows are distributor slots, not films.

    Working titles such as ``Untitled Elon Musk Documentary`` have neither a
    date stamp nor an event marker and are retained.
    """
    for title in titles:
        text = (title or "").strip()
        if not _UNTITLED_RE.search(text):
            continue
        if _DATED_PARENS_RE.search(text) or _EVENT_WORD_RE.search(text):
            return True
    return False


def load_enrichment_index(
    path: Path | str | None = DEFAULT_ENRICHMENT_PATH,
) -> dict[str, Mapping[str, Any]]:
    """Index confirmed enrichment rows by ``film_id``."""
    document = _load_json_mapping(path)
    if not document:
        return {}
    index: dict[str, Mapping[str, Any]] = {}
    for row in document.get("films") or []:
        if not isinstance(row, Mapping):
            continue
        film_id = str(row.get("film_id") or "").strip()
        if film_id:
            index[film_id] = row
    return index


def load_amc_product_index(
    path: Path | str | None = DEFAULT_PRODUCTS_PATH,
) -> dict[str, Mapping[str, Any]]:
    """Index AMC movie products by ``source_film_id`` for poster/synopsis overlay."""
    document = _load_json_mapping(path)
    if not document:
        return {}
    index: dict[str, Mapping[str, Any]] = {}
    for row in document.get("products") or []:
        if not isinstance(row, Mapping):
            continue
        movie_id = str(row.get("source_film_id") or "").strip()
        if movie_id:
            index[movie_id] = row
    return index


def theater_name_lookup(registry: Mapping[str, Any] | None) -> dict[str, str]:
    """``theater_id -> display name`` from the theaters registry."""
    if not registry:
        return {}
    names: dict[str, str] = {}
    for row in registry.get("theaters") or []:
        if not isinstance(row, Mapping):
            continue
        theater_id = str(row.get("id") or row.get("theater_id") or "").strip()
        name = str(row.get("name") or "").strip()
        if theater_id and name:
            names[theater_id] = name
    return names


def local_theaters_payload(
    theater_ids: Sequence[str],
    names: Mapping[str, str],
) -> list[dict[str, str]]:
    payload = []
    for theater_id in theater_ids:
        item = {"theater_id": theater_id, "name": names.get(theater_id) or theater_id}
        payload.append(item)
    return payload


def local_status_for(*, scheduled: bool) -> str:
    return LOCAL_STATUS_SCHEDULED if scheduled else LOCAL_STATUS_NOT_ANNOUNCED


def resolve_presentation(
    *,
    film_id: str | None,
    film_id_confirmed: bool,
    expected_release_date: date | None,
    amc_metadata: Mapping[str, Any] | None,
    tmdb_metadata: Mapping[str, Any] | None,
    amc_movie_ids: Sequence[str],
    enrichment_index: Mapping[str, Mapping[str, Any]] | None = None,
    amc_product_index: Mapping[str, Mapping[str, Any]] | None = None,
    kind: str,
) -> dict[str, Any]:
    """Build the UI presentation object with explicit provenance.

    Field fill order is conservative:
    1. confirmed TMDB enrichment, only when ``film_id`` is review-confirmed
    2. AMC Coming Soon catalog (or same-id AMC product overlay)
    3. inferred TMDB discover metadata
    4. null / derived fallback (release year from the expected date)
    """
    enrichment = None
    if film_id_confirmed and film_id and enrichment_index:
        enrichment = enrichment_index.get(film_id)

    product = _first_product(amc_movie_ids, amc_product_index or {})
    amc = dict(amc_metadata or {})
    if product:
        amc = _overlay_amc_product(amc, product)
    tmdb = tmdb_metadata or {}

    poster_url, poster_path, poster_source = _first_image(
        enrichment_url=_nested_url(enrichment, "poster"),
        enrichment_path=_nested_path(enrichment, "poster"),
        amc_url=_optional_str(amc.get("poster_url")),
        tmdb_path=_optional_str(tmdb.get("poster_path")),
        tmdb_size=POSTER_SIZE,
    )
    backdrop_url, backdrop_path, backdrop_source = _first_image(
        enrichment_url=_nested_url(enrichment, "backdrop"),
        enrichment_path=_nested_path(enrichment, "backdrop"),
        amc_url=_optional_str(amc.get("hero_desktop_url") or amc.get("hero_mobile_url")),
        tmdb_path=_optional_str(tmdb.get("backdrop_path")),
        tmdb_size=BACKDROP_SIZE,
    )

    overview, overview_source = _first_text(
        _optional_str((enrichment or {}).get("overview")) if enrichment else None,
        PRESENTATION_SOURCE_ENRICHMENT,
        _optional_str(amc.get("synopsis")),
        PRESENTATION_SOURCE_AMC,
        _optional_str(tmdb.get("overview")),
        PRESENTATION_SOURCE_TMDB,
    )
    if overview and len(overview) > OVERVIEW_MAX_LEN:
        overview = overview[:OVERVIEW_MAX_LEN].rstrip()

    runtime, runtime_source = _first_int(
        (enrichment or {}).get("runtime_minutes") if enrichment else None,
        PRESENTATION_SOURCE_ENRICHMENT,
        amc.get("runtime_min"),
        PRESENTATION_SOURCE_AMC,
        tmdb.get("runtime_minutes"),
        PRESENTATION_SOURCE_TMDB,
    )
    rating, rating_source = _first_text(
        _optional_str((enrichment or {}).get("us_certification")) if enrichment else None,
        PRESENTATION_SOURCE_ENRICHMENT,
        _optional_str(amc.get("mpaa_rating")),
        PRESENTATION_SOURCE_AMC,
        None,
        PRESENTATION_SOURCE_TMDB,
    )

    release_year = None
    year_source = PRESENTATION_SOURCE_FALLBACK
    if enrichment and enrichment.get("release_year"):
        release_year = int(enrichment["release_year"])
        year_source = PRESENTATION_SOURCE_ENRICHMENT
    elif expected_release_date is not None:
        release_year = expected_release_date.year
        year_source = PRESENTATION_SOURCE_FALLBACK

    source = (
        poster_source
        or backdrop_source
        or overview_source
        or runtime_source
        or rating_source
        or year_source
        or PRESENTATION_SOURCE_FALLBACK
    )

    return {
        "kind": kind,
        "source": source,
        "poster_url": poster_url,
        "poster_path": poster_path,
        "backdrop_url": backdrop_url,
        "backdrop_path": backdrop_path,
        "overview": overview,
        "runtime_minutes": runtime,
        "rating": rating,
        "release_year": release_year,
    }


def _first_product(
    amc_movie_ids: Sequence[str],
    index: Mapping[str, Mapping[str, Any]],
) -> Mapping[str, Any] | None:
    for movie_id in amc_movie_ids:
        hit = index.get(str(movie_id))
        if hit:
            return hit
    return None


def _overlay_amc_product(
    amc: dict[str, Any], product: Mapping[str, Any]
) -> dict[str, Any]:
    """Fill missing AMC catalog media from the durable movie-products snapshot.

    Same AMC movie id only — never a fuzzy title join.
    """
    merged = dict(amc)
    media = product.get("media") or {}
    if not merged.get("poster_url"):
        merged["poster_url"] = _optional_str(media.get("poster_url"))
    if not merged.get("hero_desktop_url"):
        merged["hero_desktop_url"] = _optional_str(media.get("hero_desktop_url"))
    if not merged.get("hero_mobile_url"):
        merged["hero_mobile_url"] = _optional_str(media.get("hero_mobile_url"))
    if not merged.get("synopsis"):
        merged["synopsis"] = _optional_str(product.get("synopsis"))
    if merged.get("runtime_min") in (None, 0) and product.get("runtime_min"):
        merged["runtime_min"] = product.get("runtime_min")
    if not merged.get("mpaa_rating"):
        merged["mpaa_rating"] = _optional_str(product.get("mpaa_rating"))
    return merged


def _first_image(
    *,
    enrichment_url: str | None,
    enrichment_path: str | None,
    amc_url: str | None,
    tmdb_path: str | None,
    tmdb_size: str,
) -> tuple[str | None, str | None, str | None]:
    if enrichment_url or enrichment_path:
        return enrichment_url, enrichment_path, PRESENTATION_SOURCE_ENRICHMENT
    if amc_url:
        return amc_url, None, PRESENTATION_SOURCE_AMC
    if tmdb_path:
        url = resolve_image_url(
            tmdb_path, base_url=DEFAULT_SECURE_BASE_URL, size=tmdb_size
        )
        return url, tmdb_path, PRESENTATION_SOURCE_TMDB
    return None, None, None


def _first_text(
    first: str | None,
    first_source: str,
    second: str | None,
    second_source: str,
    third: str | None,
    third_source: str,
) -> tuple[str | None, str | None]:
    if first:
        return first, first_source
    if second:
        return second, second_source
    if third:
        return third, third_source
    return None, None


def _first_int(
    first: Any,
    first_source: str,
    second: Any,
    second_source: str,
    third: Any,
    third_source: str,
) -> tuple[int | None, str | None]:
    for value, source in (
        (first, first_source),
        (second, second_source),
        (third, third_source),
    ):
        parsed = _positive_int(value)
        if parsed is not None:
            return parsed, source
    return None, None


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _optional_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _nested_url(row: Mapping[str, Any] | None, field: str) -> str | None:
    if not row:
        return None
    image = row.get(field)
    if isinstance(image, Mapping):
        return _optional_str(image.get("url"))
    return None


def _nested_path(row: Mapping[str, Any] | None, field: str) -> str | None:
    if not row:
        return None
    image = row.get(field)
    if isinstance(image, Mapping):
        return _optional_str(image.get("path"))
    return None


def _load_json_mapping(path: Path | str | None) -> dict[str, Any] | None:
    if path is None:
        return None
    target = Path(path)
    if not target.is_file():
        return None
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return dict(payload) if isinstance(payload, Mapping) else None
