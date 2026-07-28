"""AMC enrichment coverage + join audit (read-only, no API secrets).

Measures which Film Detail / Search enrichment fields exist in the durable AMC
source catalog versus the thin public showtimes artifact, and how reliably
current-window AMC showtimes join to catalog products via ``source_film_id``.

Does not mutate catalogs, public artifacts, or call the AMC API.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

SCHEMA_VERSION = "1.0.0"
AUDIT_ID = "amc_enrichment_coverage"

DEFAULT_PRODUCTS_REL = "data/source_catalog/amc_movie_products.json"
DEFAULT_RELEASES_REL = "data/source_catalog/amc_release_observations.json"
DEFAULT_SHOWTIMES_REL = "public/data/showtimes_current.json"

# Desired enrichment fields → catalog / derived source.
ENRICHMENT_FIELDS: tuple[dict[str, str], ...] = (
    {
        "field": "runtime_min",
        "catalog_path": "runtime_min",
        "ownership": "source_film_product",
        "notes": "Also emitted on public films when showtimes carry it.",
    },
    {
        "field": "release_date_utc",
        "catalog_path": "release_date_utc",
        "ownership": "source_film_product",
        "notes": "May be theatrical or re-release date; derive year carefully.",
    },
    {
        "field": "release_year",
        "catalog_path": "release_date_utc",
        "ownership": "derived_from_source_film_product",
        "notes": "Derived YYYY from release_date_utc; suppress for anniversary/rerelease presentations.",
    },
    {
        "field": "mpaa_rating",
        "catalog_path": "mpaa_rating",
        "ownership": "source_film_product",
        "notes": "AMC codes like PG13 (no hyphen).",
    },
    {
        "field": "genre",
        "catalog_path": "genre",
        "ownership": "source_film_product",
        "notes": "Single uppercase string; UI genres need normalize→array.",
    },
    {
        "field": "synopsis",
        "catalog_path": "synopsis",
        "ownership": "source_film_product",
        "notes": "Full marketing synopsis; high republish-rights sensitivity.",
    },
    {
        "field": "directors_raw",
        "catalog_path": "directors_raw",
        "ownership": "source_film_product",
        "notes": "Unparsed string; not a person index.",
    },
    {
        "field": "starring_actors_raw",
        "catalog_path": "starring_actors_raw",
        "ownership": "source_film_product",
        "notes": "Unparsed string; person search remains deferred.",
    },
    {
        "field": "distributor_code",
        "catalog_path": "distributor_code",
        "ownership": "source_film_product",
        "notes": "Studio/distributor code; not currently a FD slot.",
    },
    {
        "field": "poster_url",
        "catalog_path": "media.poster_url",
        "ownership": "source_film_product",
        "notes": "Public showtimes already emit poster_url for many films.",
    },
    {
        "field": "hero_desktop_url",
        "catalog_path": "media.hero_desktop_url",
        "ownership": "source_film_product",
        "notes": "Backdrop candidate; media CDN republish risk higher than text.",
    },
    {
        "field": "trailer_hd_url",
        "catalog_path": "media.trailer_hd_url",
        "ownership": "source_film_product",
        "notes": "Not an approved FD production slot today.",
    },
    {
        "field": "source_release_id",
        "catalog_path": "source_release_id",
        "ownership": "amc_release_observation",
        "notes": "Grouping evidence only; never canonical film_id.",
    },
    {
        "field": "imdb_id",
        "catalog_path": "",
        "ownership": "external_id_not_in_durable_catalog",
        "notes": "Movies API may expose imdbId; not persisted in amc_movie_products.",
    },
    {
        "field": "tmdb_id",
        "catalog_path": "",
        "ownership": "unavailable",
        "notes": "Not present in AMC durable catalog.",
    },
    {
        "field": "language",
        "catalog_path": "",
        "ownership": "performance_or_unavailable",
        "notes": "Not a product catalog field; showtimes attributes may carry language codes.",
    },
)

PUBLIC_FILM_ENRICHMENT_KEYS: tuple[str, ...] = (
    "year",
    "genres",
    "director",
    "synopsis",
    "mpaa_rating",
    "backdrop_url",
    "runtime_min",
    "poster_url",
)


class EnrichmentAuditError(ValueError):
    """Raised when required local inputs are missing or invalid."""


def nonempty(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def _load_json(path: Path) -> Any:
    if not path.exists():
        raise EnrichmentAuditError(f"Missing input file: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise EnrichmentAuditError(f"Invalid JSON: {path}: {exc}") from exc


def _dig(obj: Mapping[str, Any] | None, dotted: str) -> Any:
    if not dotted:
        return None
    cur: Any = obj
    for part in dotted.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)
    return cur


def derive_release_year(release_date_utc: Any) -> int | None:
    if not isinstance(release_date_utc, str) or not release_date_utc.strip():
        return None
    text = release_date_utc.strip()
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text).year
    except ValueError:
        if len(text) >= 4 and text[:4].isdigit():
            year = int(text[:4])
            if 1880 <= year <= 2100:
                return year
    return None


def _coverage_for_products(
    products: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    total = len(products)
    out: dict[str, Any] = {"denominator": total, "fields": {}}
    for spec in ENRICHMENT_FIELDS:
        field = spec["field"]
        path = spec["catalog_path"]
        present = 0
        blank = 0
        missing_key = 0
        for product in products:
            if field == "release_year":
                value = derive_release_year(product.get("release_date_utc"))
            elif path:
                value = _dig(product, path)
            else:
                value = None
                missing_key += 1
                continue
            if nonempty(value):
                present += 1
            else:
                blank += 1
        out["fields"][field] = {
            "present": present,
            "blank_or_null": blank,
            "absent_from_schema": missing_key if not path else 0,
            "coverage_percent": round((100.0 * present / total), 2) if total else 0.0,
            "ownership": spec["ownership"],
            "catalog_path": path or None,
            "notes": spec["notes"],
        }
    return out


def _public_film_coverage(films: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    total = len(films)
    fields: dict[str, Any] = {}
    for key in PUBLIC_FILM_ENRICHMENT_KEYS:
        present = sum(1 for film in films if nonempty(film.get(key)))
        fields[key] = {
            "present": present,
            "blank_or_null": total - present,
            "coverage_percent": round((100.0 * present / total), 2) if total else 0.0,
        }
    return {"denominator": total, "fields": fields}


def _amc_showtime_index(
    showtimes: Sequence[Mapping[str, Any]],
) -> tuple[set[str], dict[str, set[str]]]:
    source_film_ids: set[str] = set()
    film_key_to_ids: dict[str, set[str]] = defaultdict(set)
    for row in showtimes:
        if row.get("source") != "amc":
            continue
        sid = row.get("source_film_id")
        if not nonempty(sid):
            continue
        sid_s = str(sid).strip()
        source_film_ids.add(sid_s)
        film_key = row.get("showtime_film_key")
        if nonempty(film_key):
            film_key_to_ids[str(film_key)].add(sid_s)
    return source_film_ids, dict(film_key_to_ids)


def _join_analysis(
    *,
    catalog_ids: set[str],
    current_ids: set[str],
    film_key_to_ids: Mapping[str, set[str]],
) -> dict[str, Any]:
    matched_ids = sorted(current_ids & catalog_ids)
    missing_from_catalog = sorted(current_ids - catalog_ids)
    catalog_not_in_window = sorted(catalog_ids - current_ids)

    join_ok = 0
    join_miss = 0
    multi_product = 0
    ambiguous: list[dict[str, Any]] = []
    for film_key, ids in sorted(film_key_to_ids.items()):
        matched = sorted(i for i in ids if i in catalog_ids)
        if not matched:
            join_miss += 1
            continue
        join_ok += 1
        if len(ids) > 1:
            multi_product += 1
            ambiguous.append(
                {
                    "showtime_film_key": film_key,
                    "source_film_ids": sorted(ids),
                    "matched_catalog_ids": matched,
                }
            )

    denom = len(film_key_to_ids)
    return {
        "recommended_join_key": "source_film_id",
        "join_precedence": [
            "source_film_id (AMC movieId / catalog product key)",
            "showtime_film_key (frontend identity; join via showtimes carrying source_film_id)",
            "source_release_id (grouping evidence only; never primary)",
        ],
        "current_window_source_film_ids": len(current_ids),
        "catalog_source_film_ids": len(catalog_ids),
        "current_ids_matched_to_catalog": len(matched_ids),
        "current_ids_missing_from_catalog": missing_from_catalog,
        "catalog_ids_not_in_current_window": len(catalog_not_in_window),
        "showtime_film_keys_with_amc": denom,
        "join_success_film_keys": join_ok,
        "join_failure_film_keys": join_miss,
        "multi_source_film_id_film_keys": multi_product,
        "join_success_rate_percent": round((100.0 * join_ok / denom), 2) if denom else 0.0,
        "ambiguous_joins": ambiguous[:25],
        "failed_join_vs_missing_field": {
            "note": (
                "Join failure means no catalog product for the showtime source_film_id. "
                "Blank catalog fields on a matched product are missing-field, not failed join."
            )
        },
    }


def _presentation_breakdown(products: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for product in products:
        presentation = product.get("presentation") or {}
        category = presentation.get("category") if isinstance(presentation, Mapping) else None
        counter[str(category or "unknown")] += 1
    return dict(sorted(counter.items()))


def _genre_value_conflicts(
    products: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Detect identical titles with conflicting enrichment values (observation only)."""
    by_title: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for product in products:
        title = product.get("source_title") or product.get("sortable_title")
        if nonempty(title):
            by_title[str(title).strip().lower()].append(product)

    conflicts: list[dict[str, Any]] = []
    for title, group in sorted(by_title.items()):
        if len(group) < 2:
            continue
        genres = {p.get("genre") for p in group}
        ratings = {p.get("mpaa_rating") for p in group}
        runtimes = {p.get("runtime_min") for p in group}
        if len(genres) > 1 or len(ratings) > 1 or len(runtimes) > 1:
            conflicts.append(
                {
                    "title_key": title,
                    "source_film_ids": [p.get("source_film_id") for p in group],
                    "genres": sorted(str(g) for g in genres),
                    "mpaa_ratings": sorted(str(r) for r in ratings),
                    "runtimes_min": sorted(str(r) for r in runtimes),
                }
            )
    return conflicts[:50]


def build_amc_enrichment_audit(
    *,
    products_path: Path,
    releases_path: Path | None = None,
    showtimes_path: Path,
    generated_at: str | None = None,
) -> dict[str, Any]:
    products_doc = _load_json(products_path)
    showtimes_doc = _load_json(showtimes_path)

    if not isinstance(products_doc, Mapping):
        raise EnrichmentAuditError("Products catalog must be a JSON object")
    if not isinstance(showtimes_doc, Mapping):
        raise EnrichmentAuditError("Showtimes artifact must be a JSON object")

    products = products_doc.get("products")
    if not isinstance(products, list):
        raise EnrichmentAuditError("Products catalog missing products[]")
    films = showtimes_doc.get("films")
    showtimes = showtimes_doc.get("showtimes")
    if not isinstance(films, list) or not isinstance(showtimes, list):
        raise EnrichmentAuditError("Showtimes artifact missing films[] or showtimes[]")

    releases_stats: dict[str, Any] | None = None
    release_count = None
    if releases_path is not None and releases_path.exists():
        releases_doc = _load_json(releases_path)
        if isinstance(releases_doc, Mapping):
            releases = releases_doc.get("releases")
            if isinstance(releases, list):
                release_count = len(releases)
            stats = releases_doc.get("stats")
            if isinstance(stats, Mapping):
                releases_stats = dict(stats)

    current_ids, film_key_to_ids = _amc_showtime_index(showtimes)
    catalog_ids = {
        str(p.get("source_film_id")).strip()
        for p in products
        if isinstance(p, Mapping) and nonempty(p.get("source_film_id"))
    }
    typed_products = [p for p in products if isinstance(p, Mapping)]
    current_products = [
        p for p in typed_products if str(p.get("source_film_id")).strip() in current_ids
    ]

    stamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    return {
        "schema_version": SCHEMA_VERSION,
        "audit_id": AUDIT_ID,
        "generated_at": stamp,
        "inputs": {
            "products_path": str(products_path).replace("\\", "/"),
            "releases_path": (
                str(releases_path).replace("\\", "/") if releases_path else None
            ),
            "showtimes_path": str(showtimes_path).replace("\\", "/"),
            "products_generated_at": products_doc.get("generated_at"),
            "showtimes_generated_at": showtimes_doc.get("generated_at"),
            "requires_amc_api_secret": False,
        },
        "counts": {
            "catalog_products": len(typed_products),
            "release_observations": release_count,
            "public_films": len(films),
            "public_showtimes": len(showtimes),
            "current_window_amc_source_film_ids": len(current_ids),
            "current_window_joined_products": len(current_products),
        },
        "release_catalog_stats": releases_stats,
        "catalog_coverage": _coverage_for_products(typed_products),
        "current_window_joined_coverage": _coverage_for_products(current_products),
        "public_showtimes_film_coverage": _public_film_coverage(
            [f for f in films if isinstance(f, Mapping)]
        ),
        "join": _join_analysis(
            catalog_ids=catalog_ids,
            current_ids=current_ids,
            film_key_to_ids=film_key_to_ids,
        ),
        "presentation_categories": _presentation_breakdown(typed_products),
        "title_level_conflicts": _genre_value_conflicts(typed_products),
        "field_classification": {
            "A_available_now_public": [
                "title",
                "runtime_min (partial)",
                "poster_url (partial)",
                "format_tags / ticket_url / source ids on showtimes",
            ],
            "B_available_with_normalization": [
                "release_year (from release_date_utc)",
                "genres (from single genre string)",
                "director (from directors_raw)",
                "mpaa_rating display hyphenation",
            ],
            "C_amc_only_if_republished": [
                "synopsis",
                "mpaa_rating",
                "genre",
                "directors_raw",
                "starring_actors_raw",
                "release_date_utc / year",
                "hero/trailer media URLs",
                "distributor_code",
            ],
            "D_unreliable_or_ambiguous": [
                "release_year for anniversary_or_rerelease / special presentations",
                "attribute_codes as language (product-level codes are capability menus, not spoken language)",
                "inheriting metadata across source_release_id members",
            ],
            "E_unavailable_without_new_provider": [
                "tmdb_id",
                "Letterboxd ranks/stats",
                "awards",
                "durable imdb_id (not in catalog schema; prior showtimes-path IMDb audit was 0 usable)",
                "canonical film_id",
                "indie synopsis/year/genres/director",
            ],
        },
        "terms_gate": {
            "status": "uncleared",
            "summary": (
                "Public AMC catalog republish into Pages artifacts remains blocked pending "
                "PO/legal review of the AMC vendor agreement. Consumer website ToS and "
                "developer-portal marketing copy are not a substitute for the vendor contract."
            ),
        },
    }


def write_audit_outputs(report: Mapping[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "amc_enrichment_coverage.json"
    out_path.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return out_path
