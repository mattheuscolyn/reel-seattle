"""AMC source-catalog health section for ``pipeline_report.json``.

Builds an additive operational summary from ``DailyCatalogResult`` plus the
durable catalog artifacts on disk. Does not change catalog generation semantics.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.source_catalog.amc import (
    SourceCatalogValidationError,
    validate_amc_source_catalog_pair,
    validate_product_catalog,
    validate_release_catalog,
)
from reel_seattle.source_catalog.amc_daily import (
    OUTCOME_INITIALIZED,
    OUTCOME_PROMOTED,
    OUTCOME_RETAINED,
    OUTCOME_SKIPPED,
    DailyCatalogResult,
)
from reel_seattle.validate import validate_pipeline_report

PRODUCTS_REPO_PATH = "data/source_catalog/amc_movie_products.json"
RELEASES_REPO_PATH = "data/source_catalog/amc_release_observations.json"

CATALOG_STATUS_SUCCESS = "success"
CATALOG_STATUS_STALE = "stale"
CATALOG_STATUS_FAILED = "failed"
CATALOG_STATUS_SKIPPED = "skipped"


def _now_pacific_iso() -> str:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")


def _repo_relative(path: Path | str | None, *, fallback: str) -> str:
    """Return a stable repository-relative catalog path (never absolute).

    The pipeline report always identifies the durable AMC catalogs by their
    canonical repo paths. Local/temp write locations used by tests or offline
    runs must not appear as absolute filesystem paths in the public report.
    """
    if path is None or str(path).strip() == "":
        return fallback
    text = str(path).replace("\\", "/")
    for marker in (
        PRODUCTS_REPO_PATH,
        RELEASES_REPO_PATH,
    ):
        idx = text.find(marker)
        if idx >= 0:
            return marker
    # Non-canonical write location (fixtures, tempdirs): keep the operational
    # identity of the durable artifact, not the ephemeral absolute path.
    return fallback


def _load_json_object(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, Mapping):
        return None
    return dict(payload)


def _product_lifecycle_active(product: Mapping[str, Any]) -> bool:
    lifecycle = product.get("lifecycle")
    if not isinstance(lifecycle, Mapping):
        return True
    inactive_since = lifecycle.get("inactive_since")
    return inactive_since is None or inactive_since == ""


def _build_products_summary(products_doc: Mapping[str, Any] | None) -> dict[str, Any]:
    products = (
        products_doc.get("products")
        if isinstance(products_doc, Mapping) and isinstance(products_doc.get("products"), list)
        else []
    )
    active = 0
    inactive = 0
    with_release = 0
    without_release = 0
    refresh_counts = {
        "pending": 0,
        "success": 0,
        "stale": 0,
        "failed": 0,
        "invalid": 0,
        "missing": 0,
    }
    for product in products:
        if not isinstance(product, Mapping):
            continue
        if _product_lifecycle_active(product):
            active += 1
        else:
            inactive += 1
        release_id = product.get("source_release_id")
        if release_id is None or release_id == "":
            without_release += 1
        else:
            with_release += 1
        lifecycle = product.get("lifecycle")
        status = None
        if isinstance(lifecycle, Mapping):
            status = lifecycle.get("refresh_status")
        if status in refresh_counts:
            refresh_counts[str(status)] += 1
        else:
            refresh_counts["missing"] += 1

    stored = products_doc.get("stats") if isinstance(products_doc, Mapping) else None
    return {
        "total": len(products),
        "active": active,
        "inactive": inactive,
        "with_release_id": with_release,
        "without_release_id": without_release,
        "refresh_pending": refresh_counts["pending"],
        "refresh_success": refresh_counts["success"],
        "refresh_stale": refresh_counts["stale"],
        "refresh_failed": refresh_counts["failed"],
        "refresh_invalid": refresh_counts["invalid"],
        "refresh_status_missing": refresh_counts["missing"],
        "stored_stats": dict(stored) if isinstance(stored, Mapping) else None,
    }


def _build_releases_summary(
    releases_doc: Mapping[str, Any] | None,
    *,
    product_ids: set[str],
) -> dict[str, Any]:
    releases = (
        releases_doc.get("releases")
        if isinstance(releases_doc, Mapping) and isinstance(releases_doc.get("releases"), list)
        else []
    )
    singleton = 0
    multi = 0
    memberships = 0
    unresolved = 0
    for release in releases:
        if not isinstance(release, Mapping):
            continue
        members = release.get("member_source_film_ids")
        member_list = members if isinstance(members, list) else []
        memberships += len(member_list)
        count = release.get("member_count")
        size = int(count) if isinstance(count, int) else len(member_list)
        if size > 1:
            multi += 1
        else:
            singleton += 1
        for member_id in member_list:
            if member_id is None or member_id == "":
                unresolved += 1
                continue
            if str(member_id) not in product_ids:
                unresolved += 1

    stored = releases_doc.get("stats") if isinstance(releases_doc, Mapping) else None
    return {
        "total": len(releases),
        "singleton_groups": singleton,
        "multi_product_groups": multi,
        "membership_references": memberships,
        "unresolved_member_references": unresolved,
        "stored_stats": dict(stored) if isinstance(stored, Mapping) else None,
    }


def _inspect_artifact(
    *,
    kind: str,
    path: Path,
    repo_path: str,
    written_this_run: bool,
    retained_from_prior: bool,
    validate_fn,
) -> dict[str, Any]:
    exists = path.is_file()
    warnings: list[str] = []
    errors: list[str] = []
    schema_version = None
    generated_at = None
    record_count = 0
    valid = False
    document = None

    if not exists:
        errors.append(f"{kind} artifact missing at {repo_path}")
    else:
        document = _load_json_object(path)
        if document is None:
            errors.append(f"{kind} artifact unreadable or not a JSON object")
        else:
            schema_version = document.get("schema_version")
            generated_at = document.get("generated_at")
            try:
                validate_fn(document)
                valid = True
            except SourceCatalogValidationError as exc:
                errors.append(str(exc))
            if kind == "amc_movie_products":
                products = document.get("products")
                record_count = len(products) if isinstance(products, list) else 0
            else:
                releases = document.get("releases")
                record_count = len(releases) if isinstance(releases, list) else 0

    return {
        "id": kind,
        "path": repo_path,
        "exists": exists,
        "valid": valid,
        "schema_version": schema_version if isinstance(schema_version, str) else None,
        "generated_at": generated_at if isinstance(generated_at, str) else None,
        "record_count": record_count,
        "written_this_run": bool(written_this_run),
        "retained_from_prior": bool(retained_from_prior),
        "warnings": warnings,
        "errors": errors,
        "_document": document,
    }


def _map_subsystem_status(result: DailyCatalogResult) -> str:
    if result.outcome in {OUTCOME_PROMOTED, OUTCOME_INITIALIZED}:
        return CATALOG_STATUS_SUCCESS
    if result.outcome == OUTCOME_RETAINED:
        return CATALOG_STATUS_STALE
    if result.outcome == OUTCOME_SKIPPED:
        return CATALOG_STATUS_SKIPPED
    return CATALOG_STATUS_FAILED


def build_amc_source_catalog_health(
    result: DailyCatalogResult,
    *,
    products_path: Path | str = PRODUCTS_REPO_PATH,
    releases_path: Path | str = RELEASES_REPO_PATH,
    reported_at: str | None = None,
) -> dict[str, Any]:
    """Build the ``amc_source_catalog`` pipeline-report section."""
    products_file = Path(products_path)
    releases_file = Path(releases_path)
    written = result.outcome in {OUTCOME_PROMOTED, OUTCOME_INITIALIZED}
    retained = result.outcome == OUTCOME_RETAINED

    products_artifact = _inspect_artifact(
        kind="amc_movie_products",
        path=products_file,
        repo_path=_repo_relative(result.products_path or products_file, fallback=PRODUCTS_REPO_PATH),
        written_this_run=written,
        retained_from_prior=retained,
        validate_fn=validate_product_catalog,
    )
    releases_artifact = _inspect_artifact(
        kind="amc_release_observations",
        path=releases_file,
        repo_path=_repo_relative(result.releases_path or releases_file, fallback=RELEASES_REPO_PATH),
        written_this_run=written,
        retained_from_prior=retained,
        validate_fn=validate_release_catalog,
    )

    products_doc = products_artifact.pop("_document", None)
    releases_doc = releases_artifact.pop("_document", None)

    pair_errors: list[str] = []
    if products_doc is not None and releases_doc is not None:
        try:
            validate_amc_source_catalog_pair(products_doc, releases_doc)
        except SourceCatalogValidationError as exc:
            pair_errors.append(str(exc))
            products_artifact["valid"] = False
            releases_artifact["valid"] = False

    product_ids: set[str] = set()
    if isinstance(products_doc, Mapping):
        for product in products_doc.get("products") or []:
            if isinstance(product, Mapping) and product.get("source_film_id"):
                product_ids.add(str(product["source_film_id"]))

    products_summary = _build_products_summary(products_doc)
    releases_summary = _build_releases_summary(releases_doc, product_ids=product_ids)

    warnings = [str(item) for item in (result.diagnostics or []) if str(item).strip()]
    errors = list(pair_errors)
    if result.soft_failure and result.message:
        # Soft-failure message is operational; keep as error when not a clean success.
        if result.outcome != OUTCOME_PROMOTED and result.outcome != OUTCOME_INITIALIZED:
            errors.append(str(result.message))

    for artifact in (products_artifact, releases_artifact):
        warnings.extend(artifact.get("warnings") or [])
        errors.extend(artifact.get("errors") or [])

    # Deduplicate while preserving order.
    def _unique(items: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for item in items:
            if item in seen:
                continue
            seen.add(item)
            out.append(item)
        return out

    warnings = _unique(warnings)
    errors = _unique(errors)

    status = _map_subsystem_status(result)
    # Invalid retained pair should not look merely "stale healthy".
    if retained and (not products_artifact["valid"] or not releases_artifact["valid"]):
        status = CATALOG_STATUS_FAILED

    last_successful_build_at = None
    if products_artifact["valid"] and products_artifact.get("generated_at"):
        last_successful_build_at = products_artifact["generated_at"]
    elif releases_artifact["valid"] and releases_artifact.get("generated_at"):
        last_successful_build_at = releases_artifact["generated_at"]

    return {
        "id": "amc_source_catalog",
        "status": status,
        "build_attempted": True,
        "build_succeeded": written and not result.soft_failure,
        "soft_failure": bool(result.soft_failure),
        "outcome": result.outcome,
        "artifacts_written_this_run": written,
        "artifacts_retained_from_prior": retained,
        "reported_at": reported_at or _now_pacific_iso(),
        "last_successful_build_at": last_successful_build_at,
        "message": str(result.message or ""),
        "warnings": warnings,
        "errors": errors,
        "refresh": {
            "active_ids": int(result.active_ids or 0),
            "selected": int(result.selected or 0),
            "success": int(result.success or 0),
            "failed": int(result.failed or 0),
            "invalid": int(result.invalid or 0),
        },
        "artifacts": {
            "amc_movie_products": products_artifact,
            "amc_release_observations": releases_artifact,
        },
        "products_summary": products_summary,
        "releases_summary": releases_summary,
    }


def build_not_attempted_amc_source_catalog_health(
    *,
    products_path: Path | str = PRODUCTS_REPO_PATH,
    releases_path: Path | str = RELEASES_REPO_PATH,
    reported_at: str | None = None,
    message: str = "AMC source catalog build was not attempted.",
) -> dict[str, Any]:
    """Optional placeholder when the catalog stage has not run."""
    products_file = Path(products_path)
    releases_file = Path(releases_path)
    products_artifact = _inspect_artifact(
        kind="amc_movie_products",
        path=products_file,
        repo_path=PRODUCTS_REPO_PATH,
        written_this_run=False,
        retained_from_prior=products_file.is_file(),
        validate_fn=validate_product_catalog,
    )
    releases_artifact = _inspect_artifact(
        kind="amc_release_observations",
        path=releases_file,
        repo_path=RELEASES_REPO_PATH,
        written_this_run=False,
        retained_from_prior=releases_file.is_file(),
        validate_fn=validate_release_catalog,
    )
    products_doc = products_artifact.pop("_document", None)
    releases_doc = releases_artifact.pop("_document", None)
    product_ids: set[str] = set()
    if isinstance(products_doc, Mapping):
        for product in products_doc.get("products") or []:
            if isinstance(product, Mapping) and product.get("source_film_id"):
                product_ids.add(str(product["source_film_id"]))

    return {
        "id": "amc_source_catalog",
        "status": CATALOG_STATUS_SKIPPED,
        "build_attempted": False,
        "build_succeeded": False,
        "soft_failure": False,
        "outcome": "not_attempted",
        "artifacts_written_this_run": False,
        "artifacts_retained_from_prior": products_file.is_file() or releases_file.is_file(),
        "reported_at": reported_at or _now_pacific_iso(),
        "last_successful_build_at": products_artifact.get("generated_at")
        if products_artifact.get("valid")
        else None,
        "message": message,
        "warnings": [message],
        "errors": [],
        "refresh": {
            "active_ids": 0,
            "selected": 0,
            "success": 0,
            "failed": 0,
            "invalid": 0,
        },
        "artifacts": {
            "amc_movie_products": products_artifact,
            "amc_release_observations": releases_artifact,
        },
        "products_summary": _build_products_summary(products_doc),
        "releases_summary": _build_releases_summary(releases_doc, product_ids=product_ids),
    }


def apply_amc_catalog_health_to_pipeline_report(
    report_path: Path | str,
    result: DailyCatalogResult,
    *,
    products_path: Path | str = PRODUCTS_REPO_PATH,
    releases_path: Path | str = RELEASES_REPO_PATH,
    reported_at: str | None = None,
) -> dict[str, Any]:
    """Merge catalog health into an existing pipeline report and re-validate."""
    path = Path(report_path)
    if not path.is_file():
        raise FileNotFoundError(f"pipeline report not found: {path}")

    report = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(report, dict):
        raise ValueError("pipeline report must be a JSON object")

    section = build_amc_source_catalog_health(
        result,
        products_path=products_path,
        releases_path=releases_path,
        reported_at=reported_at,
    )
    report["amc_source_catalog"] = section
    validate_pipeline_report(report)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return report
