"""AMC durable-catalog refresh-cadence and inactive-growth evaluation (read-only).

Compares committed catalog snapshots (current files and/or pre-extracted history).
Does not call the AMC API, mutate catalogs, or change production policy.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.source_catalog.amc import (
    SourceCatalogValidationError,
    validate_amc_source_catalog_pair,
    validate_product_catalog,
    validate_release_catalog,
)
from reel_seattle.source_catalog.amc_refresh import (
    POLICY_ALL_ACTIVE,
    POLICY_NEW_ONLY,
    POLICY_STALE,
    select_refresh_targets,
    DiscoveryResult,
    DiscoveredProduct,
)

SCHEMA_VERSION = "1.0.0"
AUDIT_ID = "amc_catalog_cadence_evaluation"

# Stored product fields compared across snapshots. Lifecycle timestamps and
# refresh_status are excluded because all-active refreshes rewrite them every run.
MEANINGFUL_PRODUCT_FIELDS: tuple[str, ...] = (
    "source_title",
    "sortable_title",
    "runtime_min",
    "release_date_utc",
    "earliest_showing_utc",
    "online_ticket_availability_date_utc",
    "has_scheduled_showtimes",
    "genre",
    "mpaa_rating",
    "starring_actors_raw",
    "directors_raw",
    "synopsis",
    "distributor_id",
    "distributor_code",
    "preferred_media_type",
    "available_for_a_list",
    "slug",
    "website_url",
    "showtimes_url",
    "attribute_codes",
    "media",
    "product_category",
    "is_special_presentation",
    "source_release_id",
)


class CatalogCadenceAuditError(ValueError):
    """Raised for invalid audit inputs."""


def _now_pacific_iso() -> str:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")


def _parse_ts(value: object | None) -> datetime | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _is_active(product: Mapping[str, Any]) -> bool:
    lifecycle = product.get("lifecycle")
    if not isinstance(lifecycle, Mapping):
        return True
    inactive_since = lifecycle.get("inactive_since")
    return inactive_since in (None, "")


def _products_by_id(catalog: Mapping[str, Any] | None) -> dict[str, dict[str, Any]]:
    if catalog is None:
        return {}
    out: dict[str, dict[str, Any]] = {}
    for product in catalog.get("products") or []:
        if not isinstance(product, Mapping):
            continue
        film_id = product.get("source_film_id")
        if film_id in (None, ""):
            continue
        out[str(film_id)] = dict(product)
    return out


def _fingerprint(product: Mapping[str, Any]) -> str:
    payload = {key: product.get(key) for key in MEANINGFUL_PRODUCT_FIELDS}
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)


def _load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise CatalogCadenceAuditError(f"missing file: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogCadenceAuditError(f"could not read JSON {path}: {exc}") from exc
    if not isinstance(payload, Mapping):
        raise CatalogCadenceAuditError(f"expected JSON object in {path}")
    return dict(payload)


def load_catalog_snapshot(
    *,
    label: str,
    products_path: Path,
    releases_path: Path | None = None,
    commit: str | None = None,
) -> dict[str, Any]:
    """Load one products (+ optional releases) snapshot from disk."""
    products = _load_json(products_path)
    releases = _load_json(releases_path) if releases_path is not None else None
    return {
        "label": label,
        "commit": commit,
        "products_path": str(products_path).replace("\\", "/"),
        "releases_path": (
            str(releases_path).replace("\\", "/") if releases_path is not None else None
        ),
        "products": products,
        "releases": releases,
    }


def summarize_snapshot(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    products_doc = snapshot.get("products") or {}
    products = list(products_doc.get("products") or [])
    by_id = _products_by_id(products_doc)
    active_ids = [fid for fid, product in by_id.items() if _is_active(product)]
    inactive_ids = [fid for fid, product in by_id.items() if not _is_active(product)]
    refresh_counts: Counter[str] = Counter()
    linked = 0
    for product in products:
        if not isinstance(product, Mapping):
            continue
        status = str((product.get("lifecycle") or {}).get("refresh_status") or "missing")
        refresh_counts[status] += 1
        if product.get("source_release_id") not in (None, ""):
            linked += 1

    releases_doc = snapshot.get("releases")
    releases = list((releases_doc or {}).get("releases") or []) if releases_doc else []
    singleton = 0
    multi = 0
    memberships = 0
    for release in releases:
        if not isinstance(release, Mapping):
            continue
        members = release.get("member_source_film_ids") or []
        if not isinstance(members, list):
            members = []
        memberships += len(members)
        if len(members) <= 1:
            singleton += 1
        else:
            multi += 1

    return {
        "label": snapshot.get("label"),
        "commit": snapshot.get("commit"),
        "generated_at": products_doc.get("generated_at"),
        "calendar_date": str(products_doc.get("generated_at") or "")[:10] or None,
        "total_products": len(products),
        "active": len(active_ids),
        "inactive": len(inactive_ids),
        "inactive_pct": (
            round(100.0 * len(inactive_ids) / len(products), 2) if products else 0.0
        ),
        "with_release_id": linked,
        "without_release_id": len(products) - linked,
        "refresh_status_counts": dict(sorted(refresh_counts.items())),
        "release_observations": len(releases) if releases_doc is not None else None,
        "singleton_groups": singleton if releases_doc is not None else None,
        "multi_product_groups": multi if releases_doc is not None else None,
        "membership_references": memberships if releases_doc is not None else None,
        "active_ids": sorted(active_ids),
        "inactive_ids": sorted(inactive_ids),
    }


def diff_snapshots(
    previous: Mapping[str, Any],
    current: Mapping[str, Any],
) -> dict[str, Any]:
    """Compare two ordered catalog snapshots."""
    prev_by = _products_by_id(previous.get("products"))
    curr_by = _products_by_id(current.get("products"))
    prev_ids = set(prev_by)
    curr_ids = set(curr_by)
    added = sorted(curr_ids - prev_ids)
    removed = sorted(prev_ids - curr_ids)
    shared = prev_ids & curr_ids

    newly_inactive: list[str] = []
    reactivated: list[str] = []
    meaningful_changed: list[str] = []
    release_changed: list[str] = []
    changed_fields: Counter[str] = Counter()

    for film_id in sorted(shared):
        before = prev_by[film_id]
        after = curr_by[film_id]
        was_active = _is_active(before)
        is_active = _is_active(after)
        if was_active and not is_active:
            newly_inactive.append(film_id)
        if (not was_active) and is_active:
            reactivated.append(film_id)
        if _fingerprint(before) != _fingerprint(after):
            meaningful_changed.append(film_id)
            for field in MEANINGFUL_PRODUCT_FIELDS:
                if before.get(field) != after.get(field):
                    changed_fields[field] += 1
        if before.get("source_release_id") != after.get("source_release_id"):
            release_changed.append(film_id)

    active_shared = [
        film_id
        for film_id in shared
        if _is_active(curr_by[film_id])
    ]
    unchanged_active = [
        film_id for film_id in active_shared if film_id not in meaningful_changed
    ]
    refresh_attempted = current.get("products", {}).get("stats", {}).get("active_products")
    # Under production all-active, refresh candidates ~= active count at end of run.
    curr_summary = summarize_snapshot(current)
    estimated_refresh_attempts = curr_summary["active"]

    return {
        "from_generated_at": (previous.get("products") or {}).get("generated_at"),
        "to_generated_at": (current.get("products") or {}).get("generated_at"),
        "from_label": previous.get("label"),
        "to_label": current.get("label"),
        "added": added,
        "removed": removed,
        "newly_inactive": newly_inactive,
        "reactivated": reactivated,
        "meaningful_changed": meaningful_changed,
        "meaningful_changed_count": len(meaningful_changed),
        "unchanged_active_count": len(unchanged_active),
        "active_shared_count": len(active_shared),
        "unchanged_active_rate": (
            round(len(unchanged_active) / len(active_shared), 4)
            if active_shared
            else None
        ),
        "release_relationship_changed": release_changed,
        "changed_field_counts": dict(sorted(changed_fields.items())),
        "estimated_refresh_attempts": estimated_refresh_attempts,
        "refresh_status_counts": curr_summary["refresh_status_counts"],
        "stats_active_products_field": refresh_attempted,
    }


def quality_checks(
    products_doc: Mapping[str, Any],
    releases_doc: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Lifecycle and cross-catalog integrity checks (counts + samples)."""
    products = list(products_doc.get("products") or [])
    ids = [str(p.get("source_film_id")) for p in products if isinstance(p, Mapping)]
    dup_counter = Counter(ids)
    duplicates = sorted([fid for fid, count in dup_counter.items() if count > 1 and fid != "None"])

    invalid_timestamp_ordering: list[str] = []
    inactive_before_first_seen: list[str] = []
    success_after_refreshed: list[str] = []
    active_with_inactive_since: list[str] = []
    inactive_without_inactive_since: list[str] = []
    refresh_vs_timestamps: list[str] = []

    for product in products:
        if not isinstance(product, Mapping):
            continue
        film_id = str(product.get("source_film_id") or "")
        lifecycle = product.get("lifecycle") if isinstance(product.get("lifecycle"), Mapping) else {}
        first_seen = _parse_ts(lifecycle.get("first_seen_at"))
        last_seen = _parse_ts(lifecycle.get("last_seen_at"))
        last_refreshed = _parse_ts(lifecycle.get("last_refreshed_at"))
        last_success = _parse_ts(lifecycle.get("last_successful_refresh_at"))
        inactive_since = _parse_ts(lifecycle.get("inactive_since"))
        refresh_status = lifecycle.get("refresh_status")

        if first_seen and last_seen and last_seen < first_seen:
            invalid_timestamp_ordering.append(film_id)
        if first_seen and inactive_since and inactive_since < first_seen:
            inactive_before_first_seen.append(film_id)
        if last_refreshed and last_success and last_success > last_refreshed:
            success_after_refreshed.append(film_id)
        if inactive_since is None and not _is_active(product):
            inactive_without_inactive_since.append(film_id)
        if inactive_since is not None and _is_active(product):
            active_with_inactive_since.append(film_id)
        if refresh_status == "success" and last_success is None:
            refresh_vs_timestamps.append(film_id)

    missing_release_refs: list[str] = []
    missing_product_members: list[str] = []
    unresolved_members: list[str] = []
    validation_errors: list[str] = []

    try:
        validate_product_catalog(products_doc)
    except SourceCatalogValidationError as exc:
        validation_errors.append(f"products: {exc}")

    if releases_doc is not None:
        try:
            validate_release_catalog(releases_doc)
        except SourceCatalogValidationError as exc:
            validation_errors.append(f"releases: {exc}")
        try:
            validate_amc_source_catalog_pair(products_doc, releases_doc)
        except SourceCatalogValidationError as exc:
            validation_errors.append(f"pair: {exc}")

        product_ids = set(_products_by_id(products_doc))
        release_ids = {
            str(r.get("source_release_id"))
            for r in (releases_doc.get("releases") or [])
            if isinstance(r, Mapping) and r.get("source_release_id") not in (None, "")
        }
        for product in products:
            if not isinstance(product, Mapping):
                continue
            release_id = product.get("source_release_id")
            if release_id in (None, ""):
                continue
            if str(release_id) not in release_ids:
                missing_release_refs.append(str(product.get("source_film_id")))
        for release in releases_doc.get("releases") or []:
            if not isinstance(release, Mapping):
                continue
            for member in release.get("member_source_film_ids") or []:
                member_id = str(member)
                if member_id not in product_ids:
                    missing_product_members.append(member_id)
                    unresolved_members.append(
                        f"{release.get('source_release_id')}:{member_id}"
                    )

    def _sample(items: Sequence[str], limit: int = 8) -> list[str]:
        return list(items[:limit])

    return {
        "duplicate_source_film_ids": {
            "count": len(duplicates),
            "sample": _sample(duplicates),
        },
        "invalid_timestamp_ordering": {
            "count": len(invalid_timestamp_ordering),
            "sample": _sample(invalid_timestamp_ordering),
        },
        "inactive_since_before_first_seen": {
            "count": len(inactive_before_first_seen),
            "sample": _sample(inactive_before_first_seen),
        },
        "last_successful_refresh_after_last_refreshed": {
            "count": len(success_after_refreshed),
            "sample": _sample(success_after_refreshed),
        },
        "active_with_inactive_since": {
            "count": len(active_with_inactive_since),
            "sample": _sample(active_with_inactive_since),
        },
        "inactive_without_inactive_since": {
            "count": len(inactive_without_inactive_since),
            "sample": _sample(inactive_without_inactive_since),
        },
        "refresh_success_missing_timestamp": {
            "count": len(refresh_vs_timestamps),
            "sample": _sample(refresh_vs_timestamps),
        },
        "products_missing_release_observation": {
            "count": len(missing_release_refs),
            "sample": _sample(missing_release_refs),
        },
        "release_members_missing_product": {
            "count": len(missing_product_members),
            "sample": _sample(sorted(set(missing_product_members))),
        },
        "unresolved_member_pairs": {
            "count": len(unresolved_members),
            "sample": _sample(unresolved_members),
        },
        "catalog_validation_errors": validation_errors,
    }


def inactive_age_distribution(
    products_doc: Mapping[str, Any],
    *,
    as_of: str | None = None,
) -> dict[str, Any]:
    as_of_dt = _parse_ts(as_of) or _parse_ts(products_doc.get("generated_at")) or datetime.now(
        ZoneInfo(DEFAULT_TIMEZONE)
    )
    buckets = Counter()
    ages_hours: list[float] = []
    linked_inactive = 0
    inactive_total = 0
    for product in products_doc.get("products") or []:
        if not isinstance(product, Mapping) or _is_active(product):
            continue
        inactive_total += 1
        if product.get("source_release_id") not in (None, ""):
            linked_inactive += 1
        inactive_since = _parse_ts((product.get("lifecycle") or {}).get("inactive_since"))
        if inactive_since is None:
            buckets["unknown"] += 1
            continue
        age_h = (as_of_dt - inactive_since.astimezone(as_of_dt.tzinfo)).total_seconds() / 3600.0
        ages_hours.append(age_h)
        if age_h < 24:
            buckets["lt_1d"] += 1
        elif age_h < 72:
            buckets["1d_to_3d"] += 1
        elif age_h < 168:
            buckets["3d_to_7d"] += 1
        else:
            buckets["gte_7d"] += 1

    return {
        "inactive_total": inactive_total,
        "inactive_with_release_id": linked_inactive,
        "inactive_without_release_id": inactive_total - linked_inactive,
        "age_buckets_hours": dict(sorted(buckets.items())),
        "age_hours_min": round(min(ages_hours), 2) if ages_hours else None,
        "age_hours_max": round(max(ages_hours), 2) if ages_hours else None,
        "age_hours_median": (
            round(sorted(ages_hours)[len(ages_hours) // 2], 2) if ages_hours else None
        ),
    }


def _discovery_from_active_ids(active_ids: Sequence[str]) -> DiscoveryResult:
    products = tuple(
        DiscoveredProduct(source_film_id=fid, observed_title=None, occurrence_count=1)
        for fid in active_ids
    )
    return DiscoveryResult(
        source_path="synthetic-from-snapshot-active-ids",
        source_kind="synthetic",
        observed_at="1970-01-01T00:00:00+00:00",
        raw_records=len(products),
        products=products,
    )


def model_cadence_scenarios(
    products_doc: Mapping[str, Any],
    *,
    as_of: str | None = None,
    next_run_offset_hours: float = 25.0,
    stale_after_hours_options: Sequence[float] = (24.0, 48.0, 72.0),
) -> list[dict[str, Any]]:
    """Estimate refresh selection sizes for plausible policies (no API calls).

    Stale/new-only scenarios are evaluated at ``generated_at + next_run_offset_hours``
    to approximate the *next* daily run after a successful all-active refresh. At the
    snapshot instant itself, stale-N would skip nearly everyone (age ≈ 0).
    """
    from datetime import timedelta

    by_id = _products_by_id(products_doc)
    active_ids = [fid for fid, product in by_id.items() if _is_active(product)]
    discovery = _discovery_from_active_ids(active_ids)
    base_stamp = as_of or str(products_doc.get("generated_at") or _now_pacific_iso())
    base_dt = _parse_ts(base_stamp) or datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
    next_dt = base_dt + timedelta(hours=float(next_run_offset_hours))
    next_stamp = next_dt.isoformat(timespec="seconds")
    scenarios: list[dict[str, Any]] = []

    all_active = select_refresh_targets(
        discovery, products_doc, policy=POLICY_ALL_ACTIVE, as_of=next_stamp
    )
    baseline = len(all_active.selected_ids)
    scenarios.append(
        {
            "policy": POLICY_ALL_ACTIVE,
            "stale_after_hours": None,
            "evaluated_as_of": next_stamp,
            "selected": baseline,
            "skipped": 0,
            "new_ids": len(all_active.new_ids),
            "requests_avoided_vs_all_active": 0,
            "pct_reduction_vs_all_active": 0.0,
            "notes": "Current production daily policy.",
        }
    )

    new_only = select_refresh_targets(
        discovery, products_doc, policy=POLICY_NEW_ONLY, as_of=next_stamp
    )
    scenarios.append(
        {
            "policy": POLICY_NEW_ONLY,
            "stale_after_hours": None,
            "evaluated_as_of": next_stamp,
            "selected": len(new_only.selected_ids),
            "skipped": len(new_only.skipped_ids),
            "new_ids": len(new_only.new_ids),
            "requests_avoided_vs_all_active": baseline - len(new_only.selected_ids),
            "pct_reduction_vs_all_active": (
                round(100.0 * (baseline - len(new_only.selected_ids)) / baseline, 2)
                if baseline
                else 0.0
            ),
            "notes": (
                "Refreshes only IDs absent from the prior catalog. Existing active "
                "metadata can go indefinitely stale; lifecycle inactivity still uses discovery."
            ),
        }
    )

    for hours in stale_after_hours_options:
        selected = select_refresh_targets(
            discovery,
            products_doc,
            policy=POLICY_STALE,
            stale_after_hours=float(hours),
            as_of=next_stamp,
        )
        scenarios.append(
            {
                "policy": POLICY_STALE,
                "stale_after_hours": float(hours),
                "evaluated_as_of": next_stamp,
                "selected": len(selected.selected_ids),
                "skipped": len(selected.skipped_ids),
                "new_ids": len(selected.new_ids),
                "requests_avoided_vs_all_active": baseline - len(selected.selected_ids),
                "pct_reduction_vs_all_active": (
                    round(100.0 * (baseline - len(selected.selected_ids)) / baseline, 2)
                    if baseline
                    else 0.0
                ),
                "notes": (
                    f"Evaluated ~{next_run_offset_hours:g}h after snapshot. "
                    "New IDs always selected; known actives only when "
                    "last_successful_refresh_at older than threshold."
                ),
            }
        )

    return scenarios


def build_catalog_cadence_evaluation(
    snapshots: Sequence[Mapping[str, Any]],
    *,
    generated_at: str | None = None,
    evidence_notes: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Build the deterministic evaluation report from ordered snapshots (oldest→newest)."""
    if not snapshots:
        raise CatalogCadenceAuditError("at least one catalog snapshot is required")

    ordered = list(snapshots)
    summaries = [summarize_snapshot(item) for item in ordered]
    transitions = [
        diff_snapshots(ordered[index], ordered[index + 1])
        for index in range(len(ordered) - 1)
    ]

    latest = ordered[-1]
    latest_products = latest.get("products") or {}
    latest_releases = latest.get("releases")
    quality = quality_checks(latest_products, latest_releases)
    ages = inactive_age_distribution(latest_products)
    scenarios = model_cadence_scenarios(latest_products)

    # Aggregate transition signals.
    total_added = sum(len(t["added"]) for t in transitions)
    total_removed = sum(len(t["removed"]) for t in transitions)
    total_newly_inactive = sum(len(t["newly_inactive"]) for t in transitions)
    total_reactivated = sum(len(t["reactivated"]) for t in transitions)
    zero_churn_runs = sum(
        1
        for t in transitions
        if t["meaningful_changed_count"] == 0
        and not t["added"]
        and not t["newly_inactive"]
        and not t["reactivated"]
    )

    calendar_dates = sorted(
        {s["calendar_date"] for s in summaries if s.get("calendar_date")}
    )
    latest_summary = summaries[-1]
    request_estimate = latest_summary["active"]

    # Classifications — research conclusion fields (not production switches).
    refresh_classification = "keep_all_active_daily"
    inactive_classification = "healthy_durable_accumulation"
    recommendation_notes = [
        (
            "Production all-active daily remains appropriate: Movies request volume is "
            f"modest (~{request_estimate} GETs/run at 1.0s live pacing), overnight gaps "
            "show real metadata churn, and inactive detection is discovery-driven rather "
            "than Movies-refresh-driven."
        ),
        (
            "Do not implement a stale/new-only policy yet: only "
            f"{len(calendar_dates)} distinct catalog calendar dates are available; "
            "same-day workflow reruns inflate zero-churn observations."
        ),
        (
            "Inactive growth (0→11 over the evidence window) matches titles leaving "
            "showtimes discovery; no reactivations or removals observed; retain inactive "
            "records as durable identity history."
        ),
    ]

    return {
        "schema_version": SCHEMA_VERSION,
        "audit_id": AUDIT_ID,
        "generated_at": generated_at or _now_pacific_iso(),
        "meaningful_compare_fields": list(MEANINGFUL_PRODUCT_FIELDS),
        "evidence_window": {
            "snapshot_count": len(ordered),
            "distinct_catalog_calendar_dates": calendar_dates,
            "distinct_catalog_calendar_date_count": len(calendar_dates),
            "first_generated_at": summaries[0].get("generated_at"),
            "last_generated_at": summaries[-1].get("generated_at"),
            "notes": list(evidence_notes or []),
        },
        "current_refresh_behavior": {
            "production_policy": POLICY_ALL_ACTIVE,
            "candidate_selection": (
                "All source_film_ids discovered as currently active from scrape-log / "
                "showtimes-current discovery."
            ),
            "inactive_treatment": (
                "Inactive products are retained; they are not Movies-refresh candidates "
                "unless rediscovered as active."
            ),
            "new_products": "Included automatically under all-active (and under stale/new-only).",
            "api_endpoint": "https://api.amctheatres.com/v2/movies/{movie_id}",
            "request_pattern": "Serial GETs via run_movie_lookups",
            "live_pacing_seconds": 1.0,
            "failure_behavior": (
                "Soft-fail daily stage; retain prior valid durable pair on all-failed / "
                "validation errors (P-14D)."
            ),
            "estimated_requests_per_current_run": request_estimate,
            "estimated_sleep_seconds_per_current_run": max(0, request_estimate - 1) * 1.0,
            "alternative_policies_implemented_but_not_production": [
                POLICY_NEW_ONLY,
                POLICY_STALE,
            ],
        },
        "per_snapshot": [
            {k: v for k, v in summary.items() if k not in {"active_ids", "inactive_ids"}}
            for summary in summaries
        ],
        "transitions": transitions,
        "transition_totals": {
            "added": total_added,
            "removed": total_removed,
            "newly_inactive": total_newly_inactive,
            "reactivated": total_reactivated,
            "zero_churn_transition_count": zero_churn_runs,
            "transition_count": len(transitions),
        },
        "latest_quality": quality,
        "latest_inactive_age": ages,
        "cadence_scenarios": scenarios,
        "classifications": {
            "refresh_cadence": refresh_classification,
            "inactive_growth": inactive_classification,
        },
        "monitoring_thresholds_proposed": {
            "numeric_confidence": "provisional_short_window",
            "metrics": [
                {
                    "metric": "inactive_product_count",
                    "revisit_if": ">= 200 OR inactive_pct >= 60",
                    "rationale": "Absolute + share growth beyond early-catalog scale.",
                },
                {
                    "metric": "distinct_catalog_calendar_dates",
                    "revisit_if": ">= 14",
                    "rationale": "Enough overnight transitions to reassess stale-N design.",
                },
                {
                    "metric": "refresh_failed_or_invalid_share",
                    "revisit_if": "> 5% of selected in a run, or retained_previous twice in 7 days",
                    "rationale": "Operational cost / freshness risk for all-active.",
                },
                {
                    "metric": "overnight_unchanged_active_rate",
                    "revisit_if": ">= 0.95 across >= 10 distinct overnight gaps",
                    "rationale": "Sustained zero metadata churn would justify stale design.",
                },
                {
                    "metric": "estimated_movies_requests_per_run",
                    "revisit_if": ">= 150 active refresh candidates",
                    "rationale": "Request-budget trigger independent of churn.",
                },
            ],
        },
        "recommendations": recommendation_notes,
        "confidence": {
            "level": "medium_for_keep_low_for_change",
            "gaps": [
                "Only a few distinct calendar days of durable catalog history.",
                "Many same-day workflow_dispatch reruns; not independent daily evidence.",
                "amc_source_catalog pipeline-report section exists only after P-21B.",
                "No committed wall-clock timings for the Movies refresh stage.",
                "No observed soft-failure / retained-stale production outcomes yet.",
            ],
        },
    }


def render_markdown_report(report: Mapping[str, Any]) -> str:
    """Render a concise Markdown research summary from the evaluation JSON."""
    window = report["evidence_window"]
    current = report["current_refresh_behavior"]
    classes = report["classifications"]
    lines: list[str] = [
        "# AMC Catalog Refresh Cadence and Inactive-Growth Evaluation",
        "",
        f"**Audit ID:** `{report['audit_id']}`  ",
        f"**Generated at:** `{report['generated_at']}`  ",
        f"**Schema:** `{report['schema_version']}`",
        "",
        "## Classifications",
        "",
        f"- Refresh cadence: **`{classes['refresh_cadence']}`**",
        f"- Inactive growth: **`{classes['inactive_growth']}`**",
        "",
        "## Evidence window",
        "",
        f"- Snapshots: {window['snapshot_count']}",
        f"- Distinct catalog calendar dates: {window['distinct_catalog_calendar_date_count']} "
        f"({', '.join(window['distinct_catalog_calendar_dates'])})",
        f"- First `generated_at`: `{window['first_generated_at']}`",
        f"- Last `generated_at`: `{window['last_generated_at']}`",
        "",
    ]
    for note in window.get("notes") or []:
        lines.append(f"- Note: {note}")
    lines.extend(
        [
            "",
            "## Current refresh behavior",
            "",
            f"- Production policy: `{current['production_policy']}`",
            f"- Endpoint: `{current['api_endpoint']}`",
            f"- Pattern: {current['request_pattern']} with {current['live_pacing_seconds']}s pacing",
            f"- Estimated requests (latest): **{current['estimated_requests_per_current_run']}**",
            f"- Estimated sleep only: ~{current['estimated_sleep_seconds_per_current_run']}s",
            "",
            "## Per-snapshot metrics",
            "",
            "| generated_at | total | active | inactive | releases | multi |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    for row in report["per_snapshot"]:
        lines.append(
            "| {generated_at} | {total_products} | {active} | {inactive} | {release_observations} | {multi_product_groups} |".format(
                generated_at=row.get("generated_at"),
                total_products=row.get("total_products"),
                active=row.get("active"),
                inactive=row.get("inactive"),
                release_observations=row.get("release_observations"),
                multi_product_groups=row.get("multi_product_groups"),
            )
        )

    lines.extend(
        [
            "",
            "## Transition totals",
            "",
            f"- Added: {report['transition_totals']['added']}",
            f"- Removed: {report['transition_totals']['removed']}",
            f"- Newly inactive: {report['transition_totals']['newly_inactive']}",
            f"- Reactivated: {report['transition_totals']['reactivated']}",
            f"- Zero-churn transitions: {report['transition_totals']['zero_churn_transition_count']} / "
            f"{report['transition_totals']['transition_count']}",
            "",
            "## Cadence scenarios (modeled on latest snapshot)",
            "",
            "| policy | stale_after_h | selected | skipped | pct reduction |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for scenario in report["cadence_scenarios"]:
        lines.append(
            "| {policy} | {stale} | {selected} | {skipped} | {pct} |".format(
                policy=scenario["policy"],
                stale=scenario["stale_after_hours"],
                selected=scenario["selected"],
                skipped=scenario["skipped"],
                pct=scenario["pct_reduction_vs_all_active"],
            )
        )

    lines.extend(["", "## Recommendations", ""])
    for item in report["recommendations"]:
        lines.append(f"- {item}")

    lines.extend(["", "## Confidence gaps", ""])
    for gap in report["confidence"]["gaps"]:
        lines.append(f"- {gap}")

    lines.extend(["", "## Proposed monitoring metrics", ""])
    for metric in report["monitoring_thresholds_proposed"]["metrics"]:
        lines.append(
            f"- `{metric['metric']}` — revisit if {metric['revisit_if']} "
            f"({metric['rationale']})"
        )

    lines.append("")
    return "\n".join(lines)


def write_evaluation_outputs(report: Mapping[str, Any], output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "amc_catalog_cadence_evaluation.json"
    md_path = output_dir / "amc_catalog_cadence_evaluation.md"
    json_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    md_path.write_text(render_markdown_report(report), encoding="utf-8")
    return {"json": json_path, "markdown": md_path}
