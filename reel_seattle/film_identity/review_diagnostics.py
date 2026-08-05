"""Film Identity Review diagnostics (evidence-first; does not change match rules)."""

from __future__ import annotations

import csv
import io
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    AUTO_CONFIRM_MIN_SCORE,
    CATALOG_REL,
    DECISIONS_REL,
    REVIEW_MIN_SCORE,
    TOP_CANDIDATE_MARGIN_MIN,
)
from reel_seattle.film_identity.eligibility import (
    AMBIGUOUS_PROGRAM,
    ELIGIBLE,
    NON_FILM,
    classify_eligibility,
)
from reel_seattle.film_identity.normalize_text import parse_person_names
from reel_seattle.film_identity.presentation import interpret_source_years
from reel_seattle.film_identity.scoring import (
    classify_match_bucket,
    rank_candidates,
    score_candidate,
    top_candidate_margin,
)

DIAGNOSTIC_CATEGORIES = (
    "decorated_theater_title",
    "series_or_event_prefix_suffix",
    "accessibility_qualifier",
    "premium_format_qualifier",
    "festival_program_block",
    "shorts_collection",
    "missing_or_misleading_year",
    "missing_runtime",
    "same_title_remake_ambiguity",
    "alternate_language_title",
    "rerelease_restoration_mismatch",
    "tmdb_zero_results",
    "tmdb_likely_lacks_title",
    "non_film_event",
    "catalog_decision_inventory_lag",
    "scoring_threshold_issue",
    "unknown",
)

NOTES_REL = "data/film_identity/review_notes.json"
EXPORTS_REL = "data/audits/film_identity_review_exports"
REVIEW_PACK_REL = "data/audits/film_identity_review_pack.json"

_TOKEN_RE = re.compile(
    r"Bearer\s+\S+|api_key=[^&\s]+|Authorization:\s*Bearer\s+\S+|Authorization:\s*\S+",
    re.IGNORECASE,
)
_PREFIX_RE = re.compile(
    r"^(?P<prefix>.{8,60}?)\s*[-:–—]\s+(?P<body>.+)$",
)
_SUFFIX_RE = re.compile(
    r"^(?P<body>.+?)\s*[-:–—]\s+(?P<suffix>.{4,50})$",
)


def redact_secrets(text: str | None) -> str:
    """Strip bearer tokens / api_key query values from diagnostic text."""
    if not text:
        return ""

    def _sub(match: re.Match[str]) -> str:
        raw = match.group(0)
        lower = raw.lower()
        if lower.startswith("bearer "):
            return "Bearer [redacted]"
        if lower.startswith("api_key="):
            return "api_key=[redacted]"
        if lower.startswith("authorization:"):
            return "Authorization: [redacted]"
        return "[redacted]"

    return _TOKEN_RE.sub(_sub, str(text))


def title_transform_diff(
    original: str | None,
    normalized: str | None,
    *,
    source: str | None = None,
) -> dict[str, Any]:
    """Compare original source title → normalized TMDB search title."""
    from reel_seattle.film_identity.presentation import extract_match_title

    src = (original or "").strip()
    extracted = extract_match_title(src, source=source) if src else None
    norm = (normalized or (extracted.base_title if extracted else None) or "").strip()
    removed: list[str] = []
    if extracted and extracted.removed_phrases:
        removed = [
            p for p in extracted.removed_phrases if not str(p).startswith("alias:")
        ]
        if extracted.applied_alias and src:
            removed = [f"(alias) {src} → {extracted.applied_alias}", *removed]
    elif src and norm and src.casefold() != norm.casefold():
        if norm.casefold() in src.casefold():
            idx = src.casefold().find(norm.casefold())
            before = src[:idx].strip(" :-–—")
            after = src[idx + len(norm) :].strip(" :-–—")
            if before:
                removed.append(before)
            if after:
                removed.append(after)
        else:
            removed.append(src)
    return {
        "original_title": src or None,
        "normalized_search_title": norm or None,
        "changed": bool(src and norm and src.casefold() != norm.casefold()),
        "removed_segments": removed,
        "format_tags": list(extracted.format_tags) if extracted else [],
        "event_labels": list(extracted.event_labels) if extracted else [],
        "program_series": extracted.program_series if extracted else None,
        "applied_alias": extracted.applied_alias if extracted else None,
        "applied_alias_id": extracted.applied_alias_id if extracted else None,
        "event_phrase": extracted.event_phrase if extracted else None,
        "applied_rules": list(extracted.applied_rules) if extracted else [],
        "display": (
            f"{src} → {norm}" if src and norm and src.casefold() != norm.casefold() else (src or norm or None)
        ),
    }


def classify_failure(
    *,
    eligibility_status: str | None,
    entity_kind: str | None,
    presentation_labels: Sequence[str] | None,
    screening_variant_type: str | None,
    year_missing: bool,
    runtime_missing: bool,
    request_status: str | None,
    bucket: str | None,
    best_score: float | None,
    margin: float | None,
    warnings: Sequence[str] | None = None,
    title_changed: bool = False,
    candidate_count: int = 0,
) -> str:
    """Heuristic diagnostic category for unresolved / reviewable films."""
    warnings = list(warnings or [])
    variant = (screening_variant_type or "").strip().casefold()
    labels = {str(x).casefold() for x in (presentation_labels or [])}
    kind = (entity_kind or "").strip()

    if eligibility_status == NON_FILM or kind in {
        "live_event",
        "broadcast_event",
        "mystery_screening",
    }:
        return "non_film_event"
    if kind in {"shorts_program"} or "shorts" in " ".join(warnings):
        return "shorts_collection"
    if kind in {"festival_program", "unknown_program", "double_feature"}:
        return "festival_program_block"
    if variant in {"sensory_friendly", "open_caption", "open_captions"} or any(
        "sensory" in x or "caption" in x for x in labels
    ):
        return "accessibility_qualifier"
    if any(x in labels for x in {"imax", "dolby", "70mm", "35mm", "dolby cinema"}):
        return "premium_format_qualifier"
    if any("restoration" in x or "rerelease" in x or "re-release" in x for x in labels):
        return "rerelease_restoration_mismatch"
    if "same_title_remake_ambiguity" in warnings or "remake_ambiguity" in warnings:
        return "same_title_remake_ambiguity"
    if "matched_original_title" in warnings:
        return "alternate_language_title"
    if request_status == "zero_results":
        return "tmdb_zero_results"
    if request_status == "api_error":
        return "unknown"
    if request_status == "skipped_by_eligibility":
        return "non_film_event" if eligibility_status == NON_FILM else "festival_program_block"
    if request_status == "blocked_by_existing_decision":
        return "catalog_decision_inventory_lag"
    if title_changed and any(
        x in labels
        for x in {
            "studio ghibli fest",
            "film festival",
            "fest",
            "anniversary",
            "special presentation",
        }
    ):
        return "series_or_event_prefix_suffix"
    if title_changed:
        return "decorated_theater_title"
    if year_missing and (best_score is not None and best_score >= REVIEW_MIN_SCORE):
        return "missing_or_misleading_year"
    if runtime_missing and year_missing:
        return "missing_runtime"
    if bucket == "review" or (
        best_score is not None
        and REVIEW_MIN_SCORE <= best_score < AUTO_CONFIRM_MIN_SCORE
    ):
        return "scoring_threshold_issue"
    if (
        best_score is not None
        and best_score < REVIEW_MIN_SCORE
        and candidate_count > 0
    ):
        return "scoring_threshold_issue"
    if candidate_count == 0 and request_status in {None, "success", "not_run"}:
        return "tmdb_likely_lacks_title"
    if year_missing:
        return "missing_or_misleading_year"
    if runtime_missing:
        return "missing_runtime"
    return "unknown"


def plain_language_reason(
    *,
    eligibility_status: str | None,
    request_status: str | None,
    bucket: str | None,
    best: Mapping[str, Any] | None,
    runner_up: Mapping[str, Any] | None,
    margin: float | None,
    year_source: int | None = None,
) -> str:
    """Human-readable acceptance / rejection explanation."""
    if eligibility_status == NON_FILM:
        return "Skipped: title classified as a program block or non-film event rather than an individual film"
    if eligibility_status == AMBIGUOUS_PROGRAM and request_status == "skipped_by_eligibility":
        return "Skipped: title classified as an ambiguous program rather than a clear feature film"
    if request_status == "zero_results":
        return "Search returned no candidates for the normalized title"
    if request_status == "api_error":
        return "TMDB request failed (API error); no candidates scored"
    if request_status == "blocked_by_existing_decision":
        return "Blocked by an existing authored decision; matcher did not re-search"
    if not best:
        return "Unmatched: no scored candidates available"
    score = best.get("score")
    title = best.get("title") or f"tmdb:{best.get('tmdb_id')}"
    cand_year = best.get("release_year")
    signals = best.get("signals") or {}
    if signals.get("year_conflict") and year_source is not None and cand_year is not None:
        return (
            f"Rejected: title matched, but source year was {year_source} "
            f"and candidate year was {cand_year}"
        )
    if bucket == "review" and margin is not None and margin < TOP_CANDIDATE_MARGIN_MIN:
        second = runner_up.get("title") if runner_up else "runner-up"
        return (
            f"Review required: two candidates scored within {margin:.2f} "
            f"(best “{title}”, second “{second}”)"
        )
    if "same_title_remake_ambiguity" in (best.get("warnings") or []):
        return f"Review required: same-title remake ambiguity around “{title}”"
    if bucket == "auto":
        return (
            f"Accepted: best score {score} meets AUTO_CONFIRM threshold "
            f"{AUTO_CONFIRM_MIN_SCORE} (“{title}”)"
        )
    if score is not None and score < REVIEW_MIN_SCORE:
        return (
            f"Unmatched: best score {score}, below REVIEW threshold {REVIEW_MIN_SCORE}"
        )
    if score is not None and score < AUTO_CONFIRM_MIN_SCORE:
        gap = round(AUTO_CONFIRM_MIN_SCORE - float(score), 4)
        return (
            f"Review required: best score {score} is {gap} below AUTO_CONFIRM "
            f"{AUTO_CONFIRM_MIN_SCORE} (“{title}”)"
        )
    return f"Outcome bucket={bucket} for “{title}” (score={score})"


def score_factor_rows(signals: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """Flatten scoring contributions into display rows."""
    signals = signals or {}
    rows: list[dict[str, Any]] = []
    contrib = signals.get("contributions") or {}
    for name, meta in contrib.items():
        if not isinstance(meta, Mapping):
            continue
        rows.append(
            {
                "factor": name,
                "weight": meta.get("weight"),
                "matched": meta.get("matched"),
                "kind": meta.get("kind"),
            }
        )
    # Explicit named values used by the scorer (even when not weighted).
    extras = [
        ("title_similarity_exact", signals.get("title_exact")),
        ("original_title_exact", signals.get("original_title_exact")),
        ("year_status", signals.get("year_status")),
        ("runtime_status", signals.get("runtime_status")),
        ("runtime_delta_minutes", signals.get("runtime_delta_minutes")),
        ("director_status", signals.get("director_status")),
        ("external_id_exact", signals.get("external_id_exact")),
        ("hard_conflict", signals.get("hard_conflict")),
        ("event_year_relaxed", signals.get("event_year_relaxed")),
        ("popularity", signals.get("popularity")),
        ("matched_weight", signals.get("matched_weight")),
        ("available_weight", signals.get("available_weight")),
    ]
    for name, value in extras:
        rows.append({"factor": name, "value": value, "kind": "signal"})
    return rows


def build_logical_tmdb_request(
    *,
    search_title: str | None,
    year: int | None,
    include_year: bool = True,
    page: int = 1,
    from_cache: bool = False,
    alternate_title_lookup: bool = False,
    follow_up_detail_ids: Sequence[int] | None = None,
    status: str = "not_run",
) -> dict[str, Any]:
    """Logical TMDB request diagnostics — never includes tokens/headers."""
    query = {
        "endpoint": "/search/movie",
        "query": search_title,
        "year": year if include_year else None,
        "include_year_parameter": bool(include_year and year is not None),
        "language": "en-US",
        "region": None,
        "page": page,
        "include_adult": False,
        "alternate_title_lookup": alternate_title_lookup,
        "from_cache": from_cache,
        "follow_up_detail_requests": [
            {"endpoint": f"/movie/{tid}", "append_to_response": "external_ids,credits"}
            for tid in (follow_up_detail_ids or [])
        ],
        "status": status,
    }
    return query


def threshold_distances(score: float | None) -> dict[str, Any]:
    if score is None:
        return {
            "auto_confirm_threshold": AUTO_CONFIRM_MIN_SCORE,
            "review_threshold": REVIEW_MIN_SCORE,
            "distance_to_auto_confirm": None,
            "distance_to_review": None,
        }
    return {
        "auto_confirm_threshold": AUTO_CONFIRM_MIN_SCORE,
        "review_threshold": REVIEW_MIN_SCORE,
        "distance_to_auto_confirm": round(float(score) - AUTO_CONFIRM_MIN_SCORE, 4),
        "distance_to_review": round(float(score) - REVIEW_MIN_SCORE, 4),
    }


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def notes_path(root: Path) -> Path:
    return root / NOTES_REL


def load_review_notes(root: Path) -> dict[str, Any]:
    path = notes_path(root)
    if not path.exists():
        return {
            "schema_version": "1.0.0",
            "updated_at": None,
            "notes": {},
        }
    doc = load_json(path)
    if not isinstance(doc, dict):
        return {"schema_version": "1.0.0", "updated_at": None, "notes": {}}
    doc.setdefault("schema_version", "1.0.0")
    doc.setdefault("notes", {})
    return doc


def save_review_note(
    root: Path,
    *,
    record_id: str,
    diagnostic_category: str | None = None,
    notes: str | None = None,
    normalization_proposal: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    doc = load_review_notes(root)
    entry = dict(doc["notes"].get(record_id) or {})
    if diagnostic_category is not None:
        if diagnostic_category not in DIAGNOSTIC_CATEGORIES:
            raise ValueError(f"Unknown diagnostic category: {diagnostic_category}")
        entry["diagnostic_category"] = diagnostic_category
        entry["category_overridden"] = True
    if notes is not None:
        entry["notes"] = notes
    if normalization_proposal is not None:
        entry["normalization_proposal"] = dict(normalization_proposal)
        entry["normalization_proposal"]["applies_to_production"] = False
    entry["updated_at"] = datetime.now(timezone.utc).isoformat()
    doc["notes"][record_id] = entry
    doc["updated_at"] = entry["updated_at"]
    path = notes_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return doc


def _theater_name_map(theaters: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in theaters:
        tid = str(row.get("theater_id") or row.get("id") or "")
        name = row.get("name") or row.get("display_name") or tid
        if tid:
            out[tid] = str(name)
    return out


def _aggregate_showtimes(
    showtimes: Sequence[Mapping[str, Any]],
    theater_names: Mapping[str, str],
) -> dict[str, dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for row in showtimes:
        key = str(row.get("showtime_film_key") or "")
        if not key:
            continue
        bucket = by_key.setdefault(
            key,
            {
                "showtime_count": 0,
                "venues": set(),
                "sources": set(),
                "source_titles": set(),
                "source_film_ids": set(),
                "ticket_urls": set(),
            },
        )
        bucket["showtime_count"] += 1
        tid = str(row.get("theater_id") or "")
        if tid:
            bucket["venues"].add(theater_names.get(tid, tid))
        src = row.get("source")
        if src:
            bucket["sources"].add(str(src))
        st = row.get("source_title")
        if st:
            bucket["source_titles"].add(str(st))
        sid = row.get("source_film_id")
        if sid not in (None, ""):
            bucket["source_film_ids"].add(str(sid))
        url = row.get("ticket_url")
        if url:
            bucket["ticket_urls"].add(_sanitize_url(str(url)))
    for bucket in by_key.values():
        bucket["venues"] = sorted(bucket["venues"])
        bucket["sources"] = sorted(bucket["sources"])
        bucket["source_titles"] = sorted(bucket["source_titles"])
        bucket["source_film_ids"] = sorted(bucket["source_film_ids"])
        bucket["ticket_urls"] = sorted(bucket["ticket_urls"])[:3]
    return by_key


def _sanitize_url(url: str) -> str:
    # Drop query secrets if any; keep path for review.
    return re.sub(r"([?&](?:api_key|token|access_token)=)[^&]+", r"\1[redacted]", url)


def _enrichment_thin(row: Mapping[str, Any] | None) -> bool:
    if not row:
        return True
    missing = 0
    for field in ("overview", "poster", "runtime_minutes", "release_year", "directors"):
        val = row.get(field)
        if val in (None, "", [], {}):
            missing += 1
    return missing >= 2


def _catalog_index(catalog: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for film in catalog.get("films") or []:
        for sid in film.get("source_identities") or []:
            key = sid.get("showtime_film_key")
            if key:
                by_key[str(key)] = film
            src = sid.get("source")
            sfid = sid.get("source_film_id")
            if src and sfid not in (None, ""):
                by_key[f"{src}|id|{sfid}"] = film
    return by_key


def _decision_index(decisions: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in decisions.get("decisions") or []:
        if row.get("active") is False:
            continue
        si = row.get("source_identity") or {}
        key = si.get("showtime_film_key")
        if key:
            out[str(key)] = row
        src = si.get("source")
        sfid = si.get("source_film_id")
        if src and sfid not in (None, ""):
            out[f"{src}|id|{sfid}"] = row
    return out


def _review_modes(
    *,
    film_id: str | None,
    match_status: str | None,
    eligibility_status: str | None,
    enrichment_thin: bool,
    has_decision: bool,
) -> list[str]:
    modes: list[str] = []
    status = (match_status or "").strip()
    if not film_id or str(film_id).startswith("source:") or str(film_id).startswith("source_key:"):
        modes.append("source_only_identity")
    if status == "unmatched" or (not film_id and status not in {"non_film"}):
        modes.append("unmatched")
    if status == "review_required" or eligibility_status == AMBIGUOUS_PROGRAM:
        modes.append("ambiguous")
    if status == "review_required" or (
        has_decision is False and status not in {"confirmed_manual", "confirmed_automatic", "non_film"}
    ):
        modes.append("probable_review")
    if film_id and str(film_id).startswith("tmdb:") and enrichment_thin:
        modes.append("confirmed_thin_enrichment")
    if eligibility_status == NON_FILM or status == "non_film":
        modes.append("non_film")
    return modes or ["unmatched"]


def build_review_pack(root: Path) -> dict[str, Any]:
    """Offline review pack from showtimes + catalog + enrichment + decisions."""
    showtimes_doc = load_json(root / "public/data/showtimes_current.json")
    catalog = load_json(root / CATALOG_REL)
    decisions = load_json(root / DECISIONS_REL)
    notes = load_review_notes(root)
    enrichment_path = root / "public/data/film_enrichment_current.json"
    enrichment_by_id: dict[str, dict[str, Any]] = {}
    if enrichment_path.exists():
        enrichment = load_json(enrichment_path)
        for row in enrichment.get("films") or []:
            fid = row.get("film_id")
            if fid:
                enrichment_by_id[str(fid)] = row

    theater_names = _theater_name_map(showtimes_doc.get("theaters") or [])
    show_agg = _aggregate_showtimes(showtimes_doc.get("showtimes") or [], theater_names)
    cat_idx = _catalog_index(catalog)
    dec_idx = _decision_index(decisions)

    records: list[dict[str, Any]] = []
    for film in showtimes_doc.get("films") or []:
        key = str(film.get("showtime_film_key") or "")
        agg = show_agg.get(key) or {
            "showtime_count": 0,
            "venues": [],
            "sources": [],
            "source_titles": [],
            "source_film_ids": [],
            "ticket_urls": [],
        }
        source_title = (
            (agg["source_titles"][0] if agg["source_titles"] else None)
            or film.get("title")
        )
        source_name = (agg["sources"][0] if agg["sources"] else None) or "unknown"
        source_film_id = film.get("source_film_id") or (
            agg["source_film_ids"][0] if agg["source_film_ids"] else None
        )
        catalog_row = cat_idx.get(key) or cat_idx.get(f"{source_name}|id|{source_film_id}")
        decision = dec_idx.get(key) or dec_idx.get(f"{source_name}|id|{source_film_id}")
        years = interpret_source_years(
            source_title=source_title,
            product_year=None,
            source=source_name if source_name != "unknown" else None,
        )
        eligibility = classify_eligibility(
            source_title=source_title,
            screening_variant_type=film.get("screening_variant_type"),
            is_special_screening=film.get("is_special_screening"),
            source=source_name if source_name != "unknown" else None,
        )
        search_title = eligibility.search_title or years.base_title or source_title
        transform = title_transform_diff(
            source_title,
            search_title,
            source=source_name if source_name != "unknown" else None,
        )
        film_id = film.get("film_id") or (catalog_row or {}).get("film_id")
        match_status = (catalog_row or {}).get("match_status")
        if not match_status:
            if film_id and str(film_id).startswith("tmdb:"):
                match_status = "confirmed_manual"
            elif eligibility.status == NON_FILM:
                match_status = "non_film"
            else:
                match_status = "unmatched"
        enrich = enrichment_by_id.get(str(film_id)) if film_id else None
        thin = _enrichment_thin(enrich) if film_id and str(film_id).startswith("tmdb:") else False
        modes = _review_modes(
            film_id=film_id,
            match_status=match_status,
            eligibility_status=eligibility.status,
            enrichment_thin=thin,
            has_decision=bool(decision),
        )
        # Skip fully healthy confirmed rows unless thin enrichment.
        if (
            film_id
            and str(film_id).startswith("tmdb:")
            and match_status in {"confirmed_manual", "confirmed_automatic"}
            and not thin
            and "confirmed_thin_enrichment" not in modes
        ):
            continue

        year_missing = years.scoring_year() is None
        runtime_missing = film.get("runtime_min") in (None, "")
        best_score = (catalog_row or {}).get("match_confidence")
        margin = (catalog_row or {}).get("top_candidate_margin")
        category = classify_failure(
            eligibility_status=eligibility.status,
            entity_kind=eligibility.entity_kind,
            presentation_labels=years.presentation_labels,
            screening_variant_type=film.get("screening_variant_type"),
            year_missing=year_missing,
            runtime_missing=runtime_missing,
            request_status="not_run",
            bucket=None,
            best_score=float(best_score) if best_score is not None else None,
            margin=float(margin) if margin is not None else None,
            warnings=(catalog_row or {}).get("warnings") or [],
            title_changed=transform["changed"],
            candidate_count=len((catalog_row or {}).get("candidates") or []),
        )
        note_entry = (notes.get("notes") or {}).get(key) or {}
        if note_entry.get("diagnostic_category"):
            category = note_entry["diagnostic_category"]

        record = {
            "record_id": key,
            "review_modes": modes,
            "source": {
                "source_name": source_name,
                "sources": agg["sources"],
                "source_film_id": source_film_id,
                "showtime_film_key": key,
                "original_source_title": source_title,
                "presentation_title": film.get("title"),
                "parent_display_title": film.get("parent_display_title"),
                "normalized_search_title": search_title,
                "extracted_parent_title": years.base_title,
                "title_transform": transform,
                "program_series": years.program_series or transform.get("program_series"),
                "applied_alias": years.applied_alias or transform.get("applied_alias"),
                "applied_alias_id": years.applied_alias_id
                or transform.get("applied_alias_id"),
                "event_phrase": years.event_phrase or transform.get("event_phrase"),
                "applied_rules": list(years.applied_rules or transform.get("applied_rules") or []),
                "screening_variant_type": film.get("screening_variant_type"),
                "is_special_screening": film.get("is_special_screening"),
                "presentation_labels": list(years.presentation_labels),
                "source_release_year": years.scoring_year(),
                "year_interpretation": years.to_dict(),
                "source_runtime": film.get("runtime_min"),
                "source_poster_url": film.get("poster_url"),
                "source_urls": agg["ticket_urls"],
                "venues": agg["venues"],
                "venue_count": len(agg["venues"]),
                "showtime_count": agg["showtime_count"],
                "aliases": (
                    [years.applied_alias]
                    if years.applied_alias
                    else []
                ),
                "canonical_key": film_id,
                "match_status": match_status,
            },
            "eligibility": {
                "status": eligibility.status,
                "entity_kind": eligibility.entity_kind,
                "reasons": list(eligibility.reasons),
            },
            "catalog": {
                "film_id": (catalog_row or {}).get("film_id"),
                "match_status": (catalog_row or {}).get("match_status"),
                "match_confidence": best_score,
                "top_candidate_margin": margin,
                "candidates": (catalog_row or {}).get("candidates") or [],
                "warnings": (catalog_row or {}).get("warnings") or [],
                "auto_confirm_blocked_reason": (catalog_row or {}).get(
                    "auto_confirm_blocked_reason"
                ),
            },
            "decision": decision,
            "enrichment_thin": thin,
            "enrichment_summary": (
                {
                    "has_overview": bool((enrich or {}).get("overview")),
                    "has_poster": bool((enrich or {}).get("poster")),
                    "runtime_minutes": (enrich or {}).get("runtime_minutes"),
                    "release_year": (enrich or {}).get("release_year"),
                }
                if enrich
                else None
            ),
            "diagnostic_category": category,
            "reviewer_notes": note_entry.get("notes"),
            "category_overridden": bool(note_entry.get("category_overridden")),
            "normalization_proposal": note_entry.get("normalization_proposal"),
            "thresholds": {
                "auto_confirm": AUTO_CONFIRM_MIN_SCORE,
                "review": REVIEW_MIN_SCORE,
                "top_margin_min": TOP_CANDIDATE_MARGIN_MIN,
            },
            "sort_keys": {
                "showtime_count": agg["showtime_count"],
                "venue_count": len(agg["venues"]),
                "best_score": float(best_score) if best_score is not None else -1.0,
                "distance_to_auto_confirm": (
                    round(float(best_score) - AUTO_CONFIRM_MIN_SCORE, 4)
                    if best_score is not None
                    else None
                ),
                "missing_year": year_missing,
                "missing_runtime": runtime_missing,
                "has_qualifier": bool(
                    film.get("screening_variant_type")
                    and film.get("screening_variant_type") not in {"none", "", None}
                ),
                "likely_non_film": eligibility.status == NON_FILM
                or match_status == "non_film",
                "current_window": True,
                "discovery_surface": agg["showtime_count"] >= 5
                or len(agg["venues"]) >= 2,
            },
        }
        records.append(record)

    records.sort(
        key=lambda r: (
            -int(r["sort_keys"]["showtime_count"]),
            -int(r["sort_keys"]["venue_count"]),
            -float(r["sort_keys"]["best_score"]),
            0 if r["sort_keys"]["discovery_surface"] else 1,
            str(r["source"]["original_source_title"] or ""),
        )
    )

    pack = {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": {
            "auto_confirm": AUTO_CONFIRM_MIN_SCORE,
            "review": REVIEW_MIN_SCORE,
            "top_margin_min": TOP_CANDIDATE_MARGIN_MIN,
        },
        "counts": {
            "records": len(records),
            "unmatched": sum(1 for r in records if "unmatched" in r["review_modes"]),
            "ambiguous": sum(1 for r in records if "ambiguous" in r["review_modes"]),
            "probable_review": sum(
                1 for r in records if "probable_review" in r["review_modes"]
            ),
            "source_only": sum(
                1 for r in records if "source_only_identity" in r["review_modes"]
            ),
            "thin_enrichment": sum(
                1 for r in records if "confirmed_thin_enrichment" in r["review_modes"]
            ),
        },
        "records": records,
        "bulk_patterns": cluster_bulk_patterns(records),
        "reference_cases": reference_cases(root),
        "diagnostic_categories": list(DIAGNOSTIC_CATEGORIES),
    }
    out_path = root / REVIEW_PACK_REL
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")
    return pack


def cluster_bulk_patterns(records: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Summary clusters for common unresolved patterns."""
    clusters: list[dict[str, Any]] = []

    prefix_groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    suffix_groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in records:
        title = str((row.get("source") or {}).get("original_source_title") or "")
        pref = _PREFIX_RE.match(title)
        if pref:
            prefix_groups[pref.group("prefix").strip()].append(row)
        suf = _SUFFIX_RE.match(title)
        if suf:
            suffix_groups[suf.group("suffix").strip()].append(row)

    def _emit(
        cluster_id: str,
        label: str,
        rows: Sequence[Mapping[str, Any]],
        remediation: str,
        risk: str,
    ) -> None:
        if len(rows) < 2 and cluster_id not in {
            "nwff_unmatched",
            "zero_results",
            "narrowly_below_threshold",
        }:
            return
        if not rows:
            return
        showtimes = sum(int((r.get("sort_keys") or {}).get("showtime_count") or 0) for r in rows)
        examples = [
            str((r.get("source") or {}).get("original_source_title") or r.get("record_id"))
            for r in rows[:5]
        ]
        clusters.append(
            {
                "cluster_id": cluster_id,
                "label": label,
                "film_count": len(rows),
                "showtime_count": showtimes,
                "example_titles": examples,
                "likely_remediation": remediation,
                "general_rule_risk": risk,
                "record_ids": [r.get("record_id") for r in rows],
            }
        )

    for prefix, rows in sorted(prefix_groups.items(), key=lambda kv: -len(kv[1])):
        if len(rows) < 2:
            continue
        _emit(
            f"prefix:{prefix.casefold()[:40]}",
            f"Titles beginning with “{prefix}”",
            rows,
            "Consider a reusable prefix strip only after false-positive review.",
            "medium" if len(rows) >= 3 else "high",
        )

    for suffix, rows in sorted(suffix_groups.items(), key=lambda kv: -len(kv[1])):
        if len(rows) < 2:
            continue
        _emit(
            f"suffix:{suffix.casefold()[:40]}",
            f"Titles ending with “{suffix}”",
            rows,
            "Event/format qualifier strip may help if base titles are stable.",
            "medium",
        )

    nwff = [
        r
        for r in records
        if "nwff" in " ".join((r.get("source") or {}).get("sources") or []).casefold()
        or "northwest" in str((r.get("source") or {}).get("original_source_title") or "").casefold()
    ]
    _emit(
        "nwff_unmatched",
        "NWFF / Northwest Film Forum unmatched records",
        nwff,
        "Review program blocks vs feature presentations separately.",
        "high",
    )

    missing_year = [r for r in records if (r.get("sort_keys") or {}).get("missing_year")]
    _emit(
        "missing_year",
        "Missing-year records",
        missing_year,
        "Prefer runtime/director corroboration; avoid inventing years.",
        "low",
    )

    programs = [
        r
        for r in records
        if r.get("diagnostic_category") in {"festival_program_block", "shorts_collection", "non_film_event"}
        or (r.get("eligibility") or {}).get("status") == NON_FILM
    ]
    _emit(
        "program_blocks",
        "Program blocks / non-film events",
        programs,
        "Mark non-film or program entity; do not force TMDB movie matches.",
        "low",
    )

    narrow = []
    for r in records:
        score = (r.get("sort_keys") or {}).get("best_score")
        if score is None or score < 0:
            continue
        if REVIEW_MIN_SCORE <= float(score) < AUTO_CONFIRM_MIN_SCORE:
            narrow.append(r)
    _emit(
        "narrowly_below_threshold",
        "Candidates narrowly below AUTO_CONFIRM",
        narrow,
        "Manual confirm when evidence is strong; do not lower threshold casually.",
        "high",
    )

    first_rejected = [
        r
        for r in records
        if (r.get("catalog") or {}).get("auto_confirm_blocked_reason")
        and (r.get("catalog") or {}).get("candidates")
    ]
    _emit(
        "first_rejected",
        "Correct-looking first candidate rejected / blocked",
        first_rejected,
        "Inspect blocked reason and margin; confirm manually if warranted.",
        "medium",
    )

    zeroish = [
        r
        for r in records
        if r.get("diagnostic_category") == "tmdb_zero_results"
        or (
            not ((r.get("catalog") or {}).get("candidates") or [])
            and "unmatched" in (r.get("review_modes") or [])
            and (r.get("eligibility") or {}).get("status") == ELIGIBLE
        )
    ]
    _emit(
        "zero_results",
        "Likely zero TMDB candidates / empty catalog candidates",
        zeroish,
        "Try experimental alternate titles; check TMDB coverage.",
        "medium",
    )

    series_groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in records:
        series = (row.get("source") or {}).get("program_series")
        if series:
            series_groups[str(series)].append(row)
    for series_name, rows in sorted(series_groups.items(), key=lambda kv: -len(kv[1])):
        _emit(
            f"program_series:{series_name.casefold()[:48]}",
            f"Program series prefix “{series_name}”",
            rows,
            "Confirm whether to keep this series in program_series_prefixes.json.",
            "low" if len(rows) >= 2 else "medium",
        )

    clusters.sort(key=lambda c: (-int(c["showtime_count"]), -int(c["film_count"])))
    return clusters


def reference_cases(root: Path) -> list[dict[str, Any]]:
    """Fully explained reference cases for cockpit education."""
    ono = {
        "case_id": "one_night_only",
        "title": "One Night Only",
        "kind": "manual_ambiguity_resolution",
        "summary": (
            "Multiple 2026 TMDB hits made automatic matching ambiguous. "
            "A human confirmed TMDB 1433367 (Will Gluck / runtime ~102). "
            "The durable decision now overrides future ambiguity."
        ),
        "original_source_evidence": {
            "source_title": "One Night Only",
            "normalized_search_title": "One Night Only",
            "why_ambiguous": (
                "Same-title / same-year candidates scored closely enough that "
                "auto-confirm was unsafe without director/runtime corroboration."
            ),
        },
        "selected_tmdb_id": 1433367,
        "durable_decision": {
            "decision": "confirm",
            "tmdb_id": 1433367,
            "reason": "manual-review",
            "effect": "Future matcher runs prefer this authored decision over re-scoring ambiguity.",
        },
        "tmdb_url": "https://www.themoviedb.org/movie/1433367",
    }
    spider = {
        "case_id": "spider_man_sensory",
        "title": "Spider-Man: Brand New Day: Sensory Friendly Screening",
        "kind": "successful_normalization",
        "summary": (
            "Decorated sensory-friendly screening title normalizes to the parent "
            "feature “Spider-Man: Brand New Day” with screening_variant_type=sensory_friendly "
            "and shares canonical film_id tmdb:969681."
        ),
        "original_source_evidence": {
            "original_source_title": "Spider-Man: Brand New Day: Sensory Friendly Screening",
            "normalized_search_title": "Spider-Man: Brand New Day",
            "screening_variant_type": "sensory_friendly",
            "title_transform": title_transform_diff(
                "Spider-Man: Brand New Day: Sensory Friendly Screening",
                "Spider-Man: Brand New Day",
            ),
        },
        "selected_tmdb_id": 969681,
        "tmdb_url": "https://www.themoviedb.org/movie/969681",
    }
    # Attach live decision snippets when present.
    decisions_path = root / DECISIONS_REL
    if decisions_path.exists():
        decisions = load_json(decisions_path)
        for row in decisions.get("decisions") or []:
            if row.get("tmdb_id") == 1433367 and row.get("decision") == "confirm":
                ono["durable_decision"] = {
                    **ono["durable_decision"],
                    "source_identity": row.get("source_identity"),
                    "active": row.get("active", True),
                }
                break
    return [ono, spider]


def scored_candidate_to_dict(c: Any, *, role: str) -> dict[str, Any]:
    return {
        "tmdb_id": c.tmdb_id,
        "title": c.title,
        "original_title": c.original_title,
        "release_year": c.release_year,
        "runtime_min": c.runtime_min,
        "overview_excerpt": c.overview_excerpt,
        "poster_path": c.poster_path,
        "popularity": c.popularity,
        "director": c.director,
        "score": c.score,
        "warnings": list(c.warnings),
        "signals": c.signals,
        "score_factors": score_factor_rows(c.signals),
        "role": role,
        "tmdb_url": f"https://www.themoviedb.org/movie/{c.tmdb_id}",
        **threshold_distances(c.score),
    }


def explain_from_candidates(
    *,
    source_title: str,
    search_title: str | None,
    scoring_year: int | None,
    runtime_min: int | None,
    directors_raw: str | None,
    eligibility: Any,
    years: Any,
    candidates: Sequence[Mapping[str, Any]],
    request_status: str,
    logical_request: Mapping[str, Any],
    experimental: bool = False,
) -> dict[str, Any]:
    scored = [
        score_candidate(
            search_title=str(search_title or source_title or ""),
            source_year=scoring_year,
            source_runtime=runtime_min,
            source_directors=directors_raw,
            source_external_ids=None,
            candidate=row,
            event_year_relaxed=bool(years.event_year_not_canonical),
        )
        for row in candidates
        if isinstance(row, Mapping) and row.get("id") is not None
    ]
    ranked = rank_candidates(scored)
    bucket, proposed = classify_match_bucket(ranked)
    margin = top_candidate_margin(ranked)
    top_n = ranked[:10]
    best = scored_candidate_to_dict(top_n[0], role="winning") if top_n else None
    runner = scored_candidate_to_dict(top_n[1], role="runner_up") if len(top_n) > 1 else None
    candidate_rows = []
    for idx, c in enumerate(top_n):
        role = "winning" if idx == 0 else "runner_up" if idx == 1 else "scored_rejected"
        if bucket == "unmatched":
            role = "scored_rejected"
        row = scored_candidate_to_dict(c, role=role)
        row["result_order"] = idx + 1
        candidate_rows.append(row)

    transform = title_transform_diff(source_title, search_title)
    category = classify_failure(
        eligibility_status=eligibility.status,
        entity_kind=eligibility.entity_kind,
        presentation_labels=years.presentation_labels,
        screening_variant_type=None,
        year_missing=scoring_year is None,
        runtime_missing=runtime_min is None,
        request_status=request_status,
        bucket=bucket,
        best_score=best["score"] if best else None,
        margin=margin,
        warnings=list(best["warnings"]) if best else [],
        title_changed=transform["changed"],
        candidate_count=len(candidate_rows),
    )
    reason = plain_language_reason(
        eligibility_status=eligibility.status,
        request_status=request_status,
        bucket=bucket,
        best=best,
        runner_up=runner,
        margin=margin,
        year_source=scoring_year,
    )
    return {
        "experimental": experimental,
        "persists_decision": False,
        "source_title": source_title,
        "normalized_search_title": search_title,
        "title_transform": transform,
        "eligibility": {
            "status": eligibility.status,
            "entity_kind": eligibility.entity_kind,
            "reasons": list(eligibility.reasons),
        },
        "year_interpretation": years.to_dict(),
        "directors_raw": directors_raw,
        "directors_normalized": parse_person_names(directors_raw),
        "runtime_min": runtime_min,
        "tmdb_request": dict(logical_request),
        "request_status": request_status,
        "bucket": bucket,
        "top_candidate_margin": margin,
        "first_second_margin": margin,
        "winning_candidate": best,
        "runner_up_candidate": runner,
        "candidates": candidate_rows,
        "plain_language_reason": reason,
        "diagnostic_category": category,
        "thresholds": threshold_distances(best["score"] if best else None),
        "auto_confirm_eligible": bucket == "auto",
        "review_eligible": bucket in {"auto", "review"},
    }


def live_explain(
    root: Path,
    *,
    source_title: str,
    runtime_min: int | None = None,
    directors_raw: str | None = None,
    product_year: int | None = None,
    include_year: bool = True,
    experimental_title: str | None = None,
    experimental: bool = False,
    offline_candidates: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run explain diagnostics (live TMDB or offline candidates). Never saves decisions."""
    from reel_seattle.film_identity.env_local import load_dotenv_local
    from reel_seattle.film_identity.tmdb_client import (
        TmdbAuthError,
        TmdbClient,
        candidate_from_search_result,
        enrich_candidate_from_details,
        resolve_tmdb_auth,
    )

    load_dotenv_local(root)
    title_for_pipeline = source_title
    years = interpret_source_years(
        source_title=title_for_pipeline,
        product_year=product_year,
    )
    eligibility = classify_eligibility(source_title=title_for_pipeline)
    pipeline_search = eligibility.search_title or years.base_title or title_for_pipeline
    search_title = experimental_title if experimental_title is not None else pipeline_search
    scoring_year = years.scoring_year() if include_year else None
    if experimental and product_year is not None and include_year:
        scoring_year = product_year

    if eligibility.status == NON_FILM and not experimental:
        req = build_logical_tmdb_request(
            search_title=search_title,
            year=scoring_year,
            include_year=include_year,
            status="skipped_by_eligibility",
        )
        return explain_from_candidates(
            source_title=source_title,
            search_title=search_title,
            scoring_year=scoring_year,
            runtime_min=runtime_min,
            directors_raw=directors_raw,
            eligibility=eligibility,
            years=years,
            candidates=[],
            request_status="skipped_by_eligibility",
            logical_request=req,
            experimental=experimental,
        )

    candidates: list[dict[str, Any]] = []
    request_status = "success"
    detail_ids: list[int] = []
    from_cache = False

    if offline_candidates is not None:
        candidates = [dict(row) for row in offline_candidates if isinstance(row, Mapping)]
        request_status = "success" if candidates else "zero_results"
    else:
        try:
            auth = resolve_tmdb_auth(require=True)
            client = TmdbClient(auth)
            year_param = scoring_year if include_year else None
            search = client.search_movie(str(search_title or ""), year=year_param)
            raw = [
                candidate_from_search_result(row)
                for row in (search.get("results") or [])[:10]
                if isinstance(row, dict) and row.get("id") is not None
            ]
            if not raw and year_param is not None:
                search = client.search_movie(str(search_title or ""), year=None)
                raw = [
                    candidate_from_search_result(row)
                    for row in (search.get("results") or [])[:10]
                    if isinstance(row, dict) and row.get("id") is not None
                ]
            if not raw:
                request_status = "zero_results"
            for row in raw[:8]:
                tid = int(row["id"])
                detail_ids.append(tid)
                try:
                    details = client.movie_details(tid)
                    enriched = enrich_candidate_from_details(row, details)
                    enriched["_detail_enriched"] = True
                    candidates.append(enriched)
                except Exception:  # noqa: BLE001
                    row = dict(row)
                    row["_detail_enriched"] = False
                    candidates.append(row)
        except TmdbAuthError as exc:
            request_status = "api_error"
            return {
                "error": redact_secrets(str(exc)),
                "request_status": "api_error",
                "experimental": experimental,
                "persists_decision": False,
                "tmdb_request": build_logical_tmdb_request(
                    search_title=search_title,
                    year=scoring_year,
                    include_year=include_year,
                    status="api_error",
                ),
            }
        except Exception as exc:  # noqa: BLE001
            request_status = "api_error"
            return {
                "error": redact_secrets(str(exc)),
                "request_status": "api_error",
                "experimental": experimental,
                "persists_decision": False,
                "tmdb_request": build_logical_tmdb_request(
                    search_title=search_title,
                    year=scoring_year,
                    include_year=include_year,
                    status="api_error",
                ),
            }

    req = build_logical_tmdb_request(
        search_title=search_title,
        year=scoring_year,
        include_year=include_year,
        from_cache=from_cache,
        follow_up_detail_ids=detail_ids,
        status=request_status,
    )
    payload = explain_from_candidates(
        source_title=source_title,
        search_title=search_title,
        scoring_year=scoring_year,
        runtime_min=runtime_min,
        directors_raw=directors_raw,
        eligibility=eligibility,
        years=years,
        candidates=candidates,
        request_status=request_status,
        logical_request=req,
        experimental=experimental,
    )
    for row, raw in zip(payload["candidates"], candidates):
        row["detail_enriched"] = bool(raw.get("_detail_enriched"))
        row["original_language"] = raw.get("original_language")
        row["vote_count"] = raw.get("vote_count")
        row["adult"] = raw.get("adult")
        row["release_date"] = raw.get("release_date")
    payload["pipeline_search_title"] = pipeline_search
    payload["experimental_overrides"] = (
        {
            "search_title": experimental_title,
            "year": scoring_year,
            "include_year": include_year,
            "runtime_min": runtime_min,
        }
        if experimental
        else None
    )
    return payload


def propose_normalization_rule(
    *,
    original_title: str,
    proposed_base_title: str,
    records: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Suggest a reusable rule without modifying production normalization code."""
    affected = []
    for row in records:
        src = str((row.get("source") or {}).get("original_source_title") or "")
        if original_title and original_title.casefold()[:12] in src.casefold():
            affected.append(
                {
                    "record_id": row.get("record_id"),
                    "before": src,
                    "after": proposed_base_title,
                }
            )
        elif proposed_base_title and proposed_base_title.casefold() in src.casefold():
            # Same parent family decorations
            if src.casefold() != proposed_base_title.casefold():
                affected.append(
                    {
                        "record_id": row.get("record_id"),
                        "before": src,
                        "after": proposed_base_title,
                    }
                )
    return {
        "proposed_pattern": original_title,
        "proposed_extracted_base_title": proposed_base_title,
        "current_window_affected_count": len(affected),
        "affected_examples": affected[:12],
        "possible_false_positives": (
            "Titles that legitimately include the pattern as part of the film name."
        ),
        "applies_to_production": False,
        "requires_separate_implementation_decision": True,
    }


def export_review_report(
    root: Path,
    *,
    records: Sequence[Mapping[str, Any]],
    explains: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Write JSON + CSV review export under audits (unstaged by default)."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = root / EXPORTS_REL
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "records": list(records),
        "explains": dict(explains or {}),
        "note": "Does not include TMDB tokens or Authorization headers.",
    }
    json_path = out_dir / f"review_export_{stamp}.json"
    csv_path = out_dir / f"review_export_{stamp}.csv"
    json_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=[
            "record_id",
            "original_title",
            "normalized_search_title",
            "match_status",
            "diagnostic_category",
            "showtime_count",
            "venue_count",
            "best_score",
            "plain_language_reason",
            "reviewer_notes",
        ],
    )
    writer.writeheader()
    for row in records:
        src = row.get("source") or {}
        expl = (explains or {}).get(str(row.get("record_id"))) or {}
        writer.writerow(
            {
                "record_id": row.get("record_id"),
                "original_title": src.get("original_source_title"),
                "normalized_search_title": src.get("normalized_search_title"),
                "match_status": src.get("match_status"),
                "diagnostic_category": row.get("diagnostic_category"),
                "showtime_count": (row.get("sort_keys") or {}).get("showtime_count"),
                "venue_count": (row.get("sort_keys") or {}).get("venue_count"),
                "best_score": (row.get("sort_keys") or {}).get("best_score"),
                "plain_language_reason": expl.get("plain_language_reason"),
                "reviewer_notes": row.get("reviewer_notes"),
            }
        )
    csv_path.write_text(buf.getvalue(), encoding="utf-8")
    return {
        "json_path": str(json_path.relative_to(root)).replace("\\", "/"),
        "csv_path": str(csv_path.relative_to(root)).replace("\\", "/"),
    }


def build_decision_patch(
    *,
    source_name: str,
    source_film_id: Any,
    showtime_film_key: str | None,
    decision: str,
    tmdb_id: int | None = None,
    reason: str = "manual-review",
) -> dict[str, Any]:
    """Build the expected decision patch document (does not apply it)."""
    return {
        "decisions": [
            {
                "source_identity": {
                    "source": source_name,
                    "source_film_id": source_film_id,
                    "showtime_film_key": showtime_film_key,
                },
                "decision": decision,
                "tmdb_id": tmdb_id,
                "reason": reason,
            }
        ]
    }
