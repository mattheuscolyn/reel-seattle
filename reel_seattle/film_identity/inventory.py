"""Inventory unique source film identities from public showtimes (+ AMC catalog)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.film_identity.eligibility import classify_eligibility, normalize_search_title
from reel_seattle.film_identity.ids import fallback_film_id
from reel_seattle.film_identity.normalize_text import parse_person_names
from reel_seattle.film_identity.presentation import interpret_source_years
from reel_seattle.normalize import extract_year_hint
from reel_seattle.validate import PROJECT_ROOT

DEFAULT_SHOWTIMES_REL = "public/data/showtimes_current.json"
DEFAULT_PRODUCTS_REL = "data/source_catalog/amc_movie_products.json"


@dataclass
class SourceIdentityRecord:
    source: str
    source_film_id: str | None
    showtime_film_key: str | None
    source_title: str | None
    normalized_title: str | None
    year_hint: int | None
    runtime_min: int | None
    directors_raw: str | None
    release_year: int | None
    screening_variant_type: str | None
    is_special_screening: bool | None
    eligibility: str
    eligibility_reasons: list[str] = field(default_factory=list)
    film_id_fallback: str | None = None
    occurrence_count: int = 0
    first_start: str | None = None
    last_start: str | None = None
    entity_kind: str | None = None
    year_interpretation: dict | None = None
    presentation_labels: list[str] = field(default_factory=list)
    directors_normalized: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"expected object JSON: {path}")
    return data


def inventory_source_identities(
    *,
    showtimes_path: Path | None = None,
    products_path: Path | None = None,
    root: Path | None = None,
) -> dict[str, Any]:
    base = root or PROJECT_ROOT
    showtimes_path = showtimes_path or (base / DEFAULT_SHOWTIMES_REL)
    products_path = products_path or (base / DEFAULT_PRODUCTS_REL)

    showtimes_doc = load_json(showtimes_path)
    films = {
        f.get("showtime_film_key"): f
        for f in (showtimes_doc.get("films") or [])
        if isinstance(f, Mapping) and f.get("showtime_film_key")
    }
    products_by_id: dict[str, Mapping[str, Any]] = {}
    if products_path.exists():
        products_doc = load_json(products_path)
        for product in products_doc.get("products") or []:
            if not isinstance(product, Mapping):
                continue
            sid = product.get("source_film_id")
            if sid not in (None, ""):
                products_by_id[str(sid)] = product

    grouped: dict[str, SourceIdentityRecord] = {}
    for row in showtimes_doc.get("showtimes") or []:
        if not isinstance(row, Mapping):
            continue
        source = str(row.get("source") or "").strip()
        if not source:
            continue
        source_film_id = _opt_str(row.get("source_film_id"))
        showtime_film_key = _opt_str(row.get("showtime_film_key"))
        source_title = _opt_str(row.get("source_title")) or _opt_str(row.get("film_title"))
        group_key = (
            f"{source}|id|{source_film_id}"
            if source_film_id
            else f"{source}|key|{showtime_film_key}"
        )
        film = films.get(showtime_film_key) or {}
        product = products_by_id.get(source_film_id or "") if source == "amc" else None

        if group_key not in grouped:
            runtime = _opt_int(film.get("runtime_min"))
            directors = None
            product_year = None
            if product:
                runtime = runtime or _opt_int(product.get("runtime_min"))
                directors = _opt_str(product.get("directors_raw"))
                product_year = _year_from_date(product.get("release_date_utc"))
            year_info = interpret_source_years(
                source_title=source_title,
                product_year=product_year,
            )
            release_year = year_info.scoring_year()
            year_hint = release_year or extract_year_hint(source_title)
            eligibility = classify_eligibility(
                source_title=source_title,
                screening_variant_type=_opt_str(
                    row.get("screening_variant_type") or film.get("screening_variant_type")
                ),
                is_special_screening=bool(
                    row.get("is_special_screening")
                    if row.get("is_special_screening") is not None
                    else film.get("is_special_screening")
                ),
            )
            try:
                fallback = fallback_film_id(
                    source=source,
                    source_film_id=source_film_id,
                    showtime_film_key=showtime_film_key,
                )
            except ValueError:
                fallback = None
            grouped[group_key] = SourceIdentityRecord(
                source=source,
                source_film_id=source_film_id,
                showtime_film_key=showtime_film_key,
                source_title=source_title,
                normalized_title=eligibility.search_title
                or year_info.base_title
                or normalize_search_title(source_title),
                year_hint=year_hint,
                runtime_min=runtime,
                directors_raw=directors,
                release_year=release_year,
                screening_variant_type=_opt_str(
                    row.get("screening_variant_type") or film.get("screening_variant_type")
                ),
                is_special_screening=bool(film.get("is_special_screening"))
                if film
                else None,
                eligibility=eligibility.status,
                eligibility_reasons=list(eligibility.reasons),
                film_id_fallback=fallback,
                occurrence_count=0,
                entity_kind=eligibility.entity_kind,
                year_interpretation=year_info.to_dict(),
                presentation_labels=list(year_info.presentation_labels),
                directors_normalized=parse_person_names(directors),
            )

        record = grouped[group_key]
        record.occurrence_count += 1
        start = _opt_str(row.get("start_datetime") or row.get("starts_at"))
        if start:
            if record.first_start is None or start < record.first_start:
                record.first_start = start
            if record.last_start is None or start > record.last_start:
                record.last_start = start

    identities = sorted(
        grouped.values(),
        key=lambda r: (r.source, r.source_film_id or "", r.showtime_film_key or ""),
    )
    by_source: dict[str, dict[str, int]] = {}
    for record in identities:
        bucket = by_source.setdefault(
            record.source,
            {
                "total": 0,
                "with_source_film_id": 0,
                "eligible": 0,
                "non_film": 0,
                "ambiguous_program": 0,
                "with_runtime": 0,
                "with_year": 0,
                "with_directors": 0,
            },
        )
        bucket["total"] += 1
        if record.source_film_id:
            bucket["with_source_film_id"] += 1
        bucket[record.eligibility] = bucket.get(record.eligibility, 0) + 1
        if record.runtime_min is not None:
            bucket["with_runtime"] += 1
        if record.year_hint is not None:
            bucket["with_year"] += 1
        if record.directors_raw:
            bucket["with_directors"] += 1

    return {
        "schema_version": "1.0.0",
        "showtimes_path": str(showtimes_path.as_posix()),
        "products_path": str(products_path.as_posix()) if products_path.exists() else None,
        "total_unique_source_identities": len(identities),
        "by_source": by_source,
        "identities": [r.to_dict() for r in identities],
    }


def _opt_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _opt_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _year_from_date(value: Any) -> int | None:
    text = _opt_str(value)
    if not text or len(text) < 4 or not text[:4].isdigit():
        return None
    return int(text[:4])
