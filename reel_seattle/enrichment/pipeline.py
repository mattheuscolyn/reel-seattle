"""Build public TMDB enrichment artifact with last-good retention (T-ENR-01B)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.enrichment.audit import confirmed_tmdb_films, load_catalog
from reel_seattle.enrichment.constants import (
    ARTIFACT_VERSION,
    HARD_MAX_CACHE_DAYS,
    LANGUAGE,
    PROVIDER,
    PUBLIC_ARTIFACT_REL,
    REPORT_REL,
    STALE_AFTER_DAYS,
)
from reel_seattle.enrichment.normalize import (
    build_image_config,
    merge_partial_row,
    normalize_enrichment_row,
)
from reel_seattle.enrichment.validate import validate_film_enrichment_document
from reel_seattle.film_identity.io_util import atomic_write_json
from reel_seattle.film_identity.security import sanitize_error_message
from reel_seattle.film_identity.tmdb_client import TmdbAuthError, TmdbClient
from reel_seattle.validate import PROJECT_ROOT


def load_prior_artifact(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as handle:
            doc = json.load(handle)
        if isinstance(doc, dict) and isinstance(doc.get("films"), list):
            return doc
    except (OSError, json.JSONDecodeError):
        return None
    return None


def prior_rows_by_tmdb_id(doc: Mapping[str, Any] | None) -> dict[int, dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    if not doc:
        return out
    for row in doc.get("films") or []:
        if not isinstance(row, Mapping):
            continue
        tmdb_id = row.get("tmdb_id")
        if isinstance(tmdb_id, int):
            out[tmdb_id] = dict(row)
    return out


def is_stale(row: Mapping[str, Any] | None, *, now: datetime | None = None) -> bool:
    if row is None:
        return True
    provenance = row.get("provenance") if isinstance(row.get("provenance"), Mapping) else {}
    fetched = provenance.get("fetched_at")
    if not fetched:
        return True
    try:
        stamp = datetime.fromisoformat(str(fetched).replace("Z", "+00:00"))
    except ValueError:
        return True
    current = now or datetime.now(timezone.utc)
    age = current - stamp
    return age >= timedelta(days=STALE_AFTER_DAYS)


def exceeds_hard_max(row: Mapping[str, Any] | None, *, now: datetime | None = None) -> bool:
    if row is None:
        return True
    provenance = row.get("provenance") if isinstance(row.get("provenance"), Mapping) else {}
    fetched = provenance.get("fetched_at")
    if not fetched:
        return True
    try:
        stamp = datetime.fromisoformat(str(fetched).replace("Z", "+00:00"))
    except ValueError:
        return True
    current = now or datetime.now(timezone.utc)
    return (current - stamp) >= timedelta(days=HARD_MAX_CACHE_DAYS)


def fetch_image_config(client: TmdbClient | None) -> dict[str, str]:
    if client is None:
        return build_image_config()
    try:
        config = client._request("configuration", "/configuration", {})  # noqa: SLF001
        images = config.get("images") if isinstance(config, Mapping) else {}
        base = None
        if isinstance(images, Mapping):
            base = images.get("secure_base_url") or images.get("base_url")
        return build_image_config(secure_base_url=str(base) if base else None)
    except Exception:  # noqa: BLE001
        return build_image_config()


def build_enrichment_artifact(
    *,
    catalog: Mapping[str, Any],
    prior: Mapping[str, Any] | None,
    client: TmdbClient | None,
    refresh: bool = False,
    offline: bool = False,
    limit: int | None = None,
    only_tmdb_id: int | None = None,
    include_top_cast: bool = True,
    now: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (artifact, report). Never raises for per-film TMDB failures."""
    current = now or datetime.now(timezone.utc)
    eligible = confirmed_tmdb_films(catalog)
    if only_tmdb_id is not None:
        eligible = [row for row in eligible if row["tmdb_id"] == only_tmdb_id]
    if limit is not None:
        eligible = eligible[: max(0, limit)]

    prior_map = prior_rows_by_tmdb_id(prior)
    eligible_ids = {int(row["tmdb_id"]) for row in eligible}
    image_config = fetch_image_config(None if offline else client)

    metrics = {
        "status": "ok",
        "eligible_confirmed_tmdb_films": len(eligible),
        "emitted_rows": 0,
        "fresh_fetch_count": 0,
        "cache_reuse_count": 0,
        "retained_last_good_count": 0,
        "missing_first_fetch_count": 0,
        "partial_response_count": 0,
        "failed_fetch_count": 0,
        "stale_count": 0,
        "removed_orphan_count": 0,
        "validation_status": "pending",
        "warnings": [],
        "errors": [],
    }
    metrics["removed_orphan_count"] = len(set(prior_map) - eligible_ids)

    rows: list[dict[str, Any]] = []
    for identity in eligible:
        tmdb_id = int(identity["tmdb_id"])
        previous = prior_map.get(tmdb_id)
        needs_fetch = refresh or previous is None or is_stale(previous, now=current)
        if exceeds_hard_max(previous, now=current):
            needs_fetch = True
        if is_stale(previous, now=current) and previous is not None:
            metrics["stale_count"] += 1

        if offline or client is None or not needs_fetch:
            if previous is not None:
                rows.append(dict(previous))
                metrics["cache_reuse_count"] += 1
            else:
                metrics["missing_first_fetch_count"] += 1
                metrics["warnings"].append(f"missing_first_fetch:{tmdb_id}")
            continue

        try:
            details = client.movie_details(tmdb_id)
            incoming = normalize_enrichment_row(
                details,
                image_config=image_config,
                fetched_at=current.replace(microsecond=0).isoformat(),
                include_top_cast=include_top_cast,
            )
            merged = merge_partial_row(previous, incoming)
            # Detect sparse/partial: no directors and no overview and prior had them.
            if previous and (
                (previous.get("overview") and not merged.get("overview"))
                or (previous.get("directors") and not merged.get("directors"))
            ):
                metrics["partial_response_count"] += 1
                metrics["warnings"].append(f"partial_response:{tmdb_id}")
            rows.append(merged)
            metrics["fresh_fetch_count"] += 1
        except TmdbAuthError:
            raise
        except Exception as exc:  # noqa: BLE001
            metrics["failed_fetch_count"] += 1
            message = sanitize_error_message(str(exc))
            metrics["errors"].append({"tmdb_id": tmdb_id, "error": message})
            if previous is not None:
                rows.append(dict(previous))
                metrics["retained_last_good_count"] += 1
                metrics["warnings"].append(f"retained_last_good:{tmdb_id}")
            else:
                metrics["missing_first_fetch_count"] += 1
                metrics["warnings"].append(f"missing_first_fetch:{tmdb_id}")

    rows.sort(key=lambda row: int(row["tmdb_id"]))
    metrics["emitted_rows"] = len(rows)
    if metrics["failed_fetch_count"] and metrics["emitted_rows"]:
        metrics["status"] = "partial"
    elif metrics["failed_fetch_count"] and not metrics["emitted_rows"]:
        metrics["status"] = "failed"
    elif metrics["missing_first_fetch_count"] and metrics["emitted_rows"]:
        metrics["status"] = "partial"

    artifact = {
        "version": ARTIFACT_VERSION,
        "generated_at": current.replace(microsecond=0).isoformat(),
        "provider": PROVIDER,
        "language": LANGUAGE,
        "image_config": image_config,
        "films": rows,
    }
    return artifact, metrics


def write_enrichment_outputs(
    artifact: Mapping[str, Any],
    metrics: Mapping[str, Any],
    *,
    artifact_path: Path | None = None,
    report_path: Path | None = None,
    skip_write_on_invalid: bool = True,
) -> dict[str, Any]:
    """Validate then atomically write public artifact + internal report."""
    report = {
        "schema_version": "1.0.0",
        "generated_at": artifact.get("generated_at"),
        "provider": PROVIDER,
        **dict(metrics),
        "artifact_path": PUBLIC_ARTIFACT_REL,
        "notes": [
            "Enrichment status is independent of showtime pipeline success.",
            "UI activation remains deferred (T-ENR-10/20/30).",
        ],
    }
    target = artifact_path or (PROJECT_ROOT / PUBLIC_ARTIFACT_REL)
    report_target = report_path or (PROJECT_ROOT / REPORT_REL)

    try:
        validate_film_enrichment_document(artifact)
        report["validation_status"] = "ok"
    except Exception as exc:  # noqa: BLE001
        report["validation_status"] = "failed"
        report["status"] = "failed"
        report["warnings"] = list(report.get("warnings") or []) + [
            f"validation_failed:{sanitize_error_message(str(exc))}"
        ]
        atomic_write_json(report_target, report)
        if skip_write_on_invalid:
            raise
        return report

    atomic_write_json(target, artifact)
    atomic_write_json(report_target, report)
    return report
