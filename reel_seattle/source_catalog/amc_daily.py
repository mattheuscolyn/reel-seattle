"""Daily AMC source-catalog orchestration (non-blocking workflow stage).

Coordinates discovery → refresh → merge → validate → atomic promotion.
Does not reimplement merge/refresh logic. Soft-fails by default so showtimes
can still commit when catalog enrichment fails.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from reel_seattle.analysis.amc_movies_client import assert_no_secret_leakage
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.source_catalog.amc import (
    MOVIES_FETCH_FAILED,
    MOVIES_FETCH_INVALID,
    MOVIES_FETCH_SUCCESS,
    SourceCatalogValidationError,
    update_amc_source_catalog,
    validate_amc_source_catalog_pair,
    validate_product_catalog,
    validate_release_catalog,
    write_amc_source_catalog,
)
from reel_seattle.source_catalog.amc_refresh import (
    POLICY_ALL_ACTIVE,
    OBSERVATIONS_FILENAME,
    RefreshStageError,
    build_fetch_movie,
    discover_active_products,
    observations_for_merge,
    run_amc_catalog_refresh,
    select_refresh_targets,
    write_observations_artifact,
)

DEFAULT_PRODUCTS_NAME = "amc_movie_products.json"
DEFAULT_RELEASES_NAME = "amc_release_observations.json"
DEFAULT_DURABLE_DIR = Path("data/source_catalog")

OUTCOME_PROMOTED = "promoted"
OUTCOME_RETAINED = "retained_previous"
OUTCOME_SKIPPED = "skipped"
OUTCOME_INITIALIZED = "initialized"


@dataclass
class DailyCatalogResult:
    """Structured result for daily catalog orchestration."""

    outcome: str
    promoted: bool
    soft_failure: bool
    message: str
    diagnostics: list[str] = field(default_factory=list)
    discovery_path: str | None = None
    active_ids: int = 0
    selected: int = 0
    success: int = 0
    failed: int = 0
    invalid: int = 0
    products: int = 0
    active_products: int = 0
    inactive_products: int = 0
    release_observations: int = 0
    products_path: str | None = None
    releases_path: str | None = None
    work_dir: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DailyCatalogHardError(RuntimeError):
    """Raised for invalid CLI usage or unexpected programmer errors."""


def _now_pacific_iso() -> str:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")


def _today_pacific() -> date:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()


def resolve_daily_discovery_source(
    discovery_source: str,
    *,
    repo_root: Path,
    run_date: date | None = None,
    logs_dir: Path | str = "data/daily_logs",
) -> str:
    """Prefer the current-run-date AMC scrape log when using auto/scrape-log."""
    source = (discovery_source or "auto").strip()
    day = run_date or _today_pacific()
    dated = Path(repo_root) / logs_dir / f"{day.isoformat()}_amc.json"
    if source in {"auto", "scrape-log"} and dated.is_file():
        return str(dated)
    return source


def inspect_prior_catalog_pair(
    products_path: Path,
    releases_path: Path,
) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
    """Classify prior durable catalog state.

    Returns ``(state, products, releases)`` where state is one of:
    ``absent``, ``consistent``, ``inconsistent``, ``invalid``.
    """
    products_exists = products_path.is_file()
    releases_exists = releases_path.is_file()
    if not products_exists and not releases_exists:
        return "absent", None, None
    if products_exists != releases_exists:
        return "inconsistent", None, None

    try:
        products = json.loads(products_path.read_text(encoding="utf-8"))
        releases = json.loads(releases_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "invalid", None, None

    if not isinstance(products, Mapping) or not isinstance(releases, Mapping):
        return "invalid", None, None

    try:
        validate_amc_source_catalog_pair(products, releases)
    except SourceCatalogValidationError:
        return "invalid", None, None

    return "consistent", dict(products), dict(releases)


def _all_selected_fetches_failed(observations_artifact: Mapping[str, Any]) -> bool:
    """True when every *selected* fetch is failed/invalid (no successes)."""
    selected = int((observations_artifact.get("stats") or {}).get("selected") or 0)
    if selected <= 0:
        return False
    success = int((observations_artifact.get("stats") or {}).get("success") or 0)
    return success == 0


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def promote_catalog_pair(
    *,
    temp_products: Path,
    temp_releases: Path,
    durable_products: Path,
    durable_releases: Path,
) -> None:
    """Promote validated temp catalogs with best-effort paired replacement.

    Stages ``.tmp`` siblings beside the durable paths, backs up existing files
    to ``.bak``, replaces products then releases, and restores products from
    backup if the second replace fails.
    """
    durable_products = Path(durable_products)
    durable_releases = Path(durable_releases)
    durable_products.parent.mkdir(parents=True, exist_ok=True)

    products_tmp = durable_products.with_suffix(durable_products.suffix + ".tmp")
    releases_tmp = durable_releases.with_suffix(durable_releases.suffix + ".tmp")
    products_bak = durable_products.with_suffix(durable_products.suffix + ".bak")
    releases_bak = durable_releases.with_suffix(durable_releases.suffix + ".bak")

    # Clean leftover temps from a previous crash.
    for path in (products_tmp, releases_tmp, products_bak, releases_bak):
        if path.exists():
            path.unlink()

    shutil.copy2(temp_products, products_tmp)
    shutil.copy2(temp_releases, releases_tmp)

    had_products = durable_products.is_file()
    had_releases = durable_releases.is_file()
    if had_products:
        shutil.copy2(durable_products, products_bak)
    if had_releases:
        shutil.copy2(durable_releases, releases_bak)

    try:
        os.replace(products_tmp, durable_products)
        try:
            os.replace(releases_tmp, durable_releases)
        except OSError:
            # Roll back products to the pre-promotion backup when possible.
            if products_bak.is_file():
                os.replace(products_bak, durable_products)
            elif durable_products.is_file():
                # First-run: remove the half-promoted products file.
                durable_products.unlink(missing_ok=True)
            raise
    finally:
        for path in (products_tmp, releases_tmp, products_bak, releases_bak):
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    pass


def format_diagnostics(result: DailyCatalogResult) -> list[str]:
    """Build concise sanitized stdout lines."""
    lines = list(result.diagnostics)
    if result.promoted:
        lines.append(
            "AMC source catalog: "
            f"{result.active_ids} active, {result.selected} selected, "
            f"{result.success} refreshed, {result.failed} failed, "
            f"{result.invalid} invalid"
        )
        lines.append(
            "AMC source catalog: "
            f"{result.products} products "
            f"({result.active_products} active, {result.inactive_products} inactive), "
            f"{result.release_observations} release groups"
        )
        if result.outcome == OUTCOME_INITIALIZED:
            lines.append("AMC source catalog: initialized and promoted (first run)")
        else:
            lines.append("AMC source catalog: promoted durable product and release files")
    else:
        lines.append(result.message)
    for line in lines:
        assert_no_secret_leakage(line)
    return lines


def run_daily_amc_source_catalog(
    *,
    discovery_source: str = "auto",
    products_path: Path | str = DEFAULT_DURABLE_DIR / DEFAULT_PRODUCTS_NAME,
    releases_path: Path | str = DEFAULT_DURABLE_DIR / DEFAULT_RELEASES_NAME,
    policy: str = POLICY_ALL_ACTIVE,
    fixture_responses: Path | str | None = None,
    live: bool | None = None,
    generated_at: str | None = None,
    temp_dir: Path | str | None = None,
    repo_root: Path | str = ".",
    run_date: date | None = None,
    sleep_seconds: float | None = None,
    retain_on_all_failed: bool = True,
) -> DailyCatalogResult:
    """Run the daily catalog stage. Soft-fails via ``soft_failure=True`` results."""
    root = Path(repo_root)
    durable_products = Path(products_path)
    if not durable_products.is_absolute():
        durable_products = root / durable_products
    durable_releases = Path(releases_path)
    if not durable_releases.is_absolute():
        durable_releases = root / durable_releases

    stamp = generated_at or _now_pacific_iso()
    use_live = live if live is not None else fixture_responses is None
    pacing = (
        sleep_seconds
        if sleep_seconds is not None
        else (1.0 if use_live else 0.0)
    )

    work_parent = Path(temp_dir) if temp_dir else None
    if work_parent is not None:
        work_parent.mkdir(parents=True, exist_ok=True)
        work_dir = Path(
            tempfile.mkdtemp(prefix="amc-source-catalog-", dir=str(work_parent))
        )
    else:
        work_dir = Path(tempfile.mkdtemp(prefix="amc-source-catalog-"))

    result = DailyCatalogResult(
        outcome=OUTCOME_SKIPPED,
        promoted=False,
        soft_failure=False,
        message="",
        work_dir=str(work_dir),
    )

    try:
        prior_state, prior_products, _prior_releases = inspect_prior_catalog_pair(
            durable_products, durable_releases
        )
        if prior_state == "inconsistent":
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED
            result.message = (
                "AMC source catalog error: inconsistent prior durable pair "
                "(exactly one of products/releases exists); retained existing file(s); "
                "no files promoted"
            )
            result.diagnostics.append(result.message)
            return result

        if prior_state == "invalid":
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED
            result.message = (
                "AMC source catalog error: existing durable catalog failed validation; "
                "retained previous catalog; no files promoted"
            )
            result.diagnostics.append(result.message)
            return result

        resolved_discovery = resolve_daily_discovery_source(
            discovery_source, repo_root=root, run_date=run_date
        )

        try:
            discovery = discover_active_products(
                resolved_discovery, repo_root=root
            )
        except RefreshStageError as exc:
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED if prior_state == "consistent" else OUTCOME_SKIPPED
            result.message = (
                f"AMC source catalog warning: discovery failed ({exc}); "
                "retained previous catalog"
                if prior_state == "consistent"
                else f"AMC source catalog warning: discovery failed ({exc}); no catalog created"
            )
            result.diagnostics.append(result.message)
            return result

        result.discovery_path = discovery.source_path
        result.active_ids = len(discovery.active_ids)

        try:
            fetch_movie = build_fetch_movie(
                fixture_dir=fixture_responses, live=use_live
            )
        except RefreshStageError as exc:
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED if prior_state == "consistent" else OUTCOME_SKIPPED
            result.message = (
                f"AMC source catalog warning: {exc}; retained previous catalog"
                if prior_state == "consistent"
                else f"AMC source catalog warning: {exc}; no catalog created"
            )
            result.diagnostics.append(result.message)
            return result

        selection = select_refresh_targets(
            discovery,
            prior_products,
            policy=policy,
            stale_after_hours=None,
            as_of=stamp,
        )
        result.selected = len(selection.selected_ids)

        try:
            observations = run_amc_catalog_refresh(
                discovery=discovery,
                selection=selection,
                fetch_movie=fetch_movie,
                generated_at=stamp,
                sleep_seconds=pacing,
                include_skipped_presence=True,
            )
            write_observations_artifact(observations, work_dir)
        except Exception as exc:  # noqa: BLE001 - soft-fail catalog stage
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED if prior_state == "consistent" else OUTCOME_SKIPPED
            result.message = (
                f"AMC source catalog warning: refresh failed ({exc}); "
                "retained previous catalog"
            )
            result.diagnostics.append(result.message)
            return result

        stats = observations.get("stats") or {}
        result.success = int(stats.get("success") or 0)
        result.failed = int(stats.get("failed") or 0)
        result.invalid = int(stats.get("invalid") or 0)

        if (
            retain_on_all_failed
            and prior_state == "consistent"
            and _all_selected_fetches_failed(observations)
        ):
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED
            result.message = (
                "AMC source catalog warning: all Movies refreshes failed; "
                "retained previous catalog"
            )
            result.diagnostics.append(result.message)
            return result

        try:
            try:
                products_artifact_path = durable_products.relative_to(root).as_posix()
            except ValueError:
                products_artifact_path = durable_products.as_posix()
            products, releases = update_amc_source_catalog(
                existing_products=prior_products,
                observations=observations_for_merge(observations),
                active_ids=discovery.active_ids,
                generated_at=stamp,
                as_of=stamp,
                products_artifact_path=products_artifact_path,
            )
            validate_amc_source_catalog_pair(products, releases)
            # Extra explicit single-artifact checks (defense in depth).
            validate_product_catalog(products)
            validate_release_catalog(releases, products_artifact=products)
        except Exception as exc:  # noqa: BLE001
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED if prior_state == "consistent" else OUTCOME_SKIPPED
            result.message = (
                "AMC source catalog error: generated catalog validation failed; "
                f"no files promoted ({exc})"
            )
            result.diagnostics.append(result.message)
            return result

        temp_paths = write_amc_source_catalog(products, releases, work_dir)
        assert_no_secret_leakage(products)
        assert_no_secret_leakage(releases)

        try:
            promote_catalog_pair(
                temp_products=temp_paths["products"],
                temp_releases=temp_paths["releases"],
                durable_products=durable_products,
                durable_releases=durable_releases,
            )
        except OSError as exc:
            result.soft_failure = True
            result.outcome = OUTCOME_RETAINED if prior_state == "consistent" else OUTCOME_SKIPPED
            result.message = (
                f"AMC source catalog error: promotion failed ({exc}); "
                "prior catalog retained/restored where possible"
            )
            result.diagnostics.append(result.message)
            return result

        result.promoted = True
        result.soft_failure = False
        result.outcome = (
            OUTCOME_INITIALIZED if prior_state == "absent" else OUTCOME_PROMOTED
        )
        result.products = int(products["stats"]["products"])
        result.active_products = int(products["stats"]["active_products"])
        result.inactive_products = int(products["stats"]["inactive_products"])
        result.release_observations = int(releases["stats"]["release_observations"])
        result.products_path = str(durable_products)
        result.releases_path = str(durable_releases)
        result.message = "AMC source catalog: promoted"
        return result

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def run_daily_amc_source_catalog_safe(**kwargs: Any) -> DailyCatalogResult:
    """Wrapper that converts unexpected RefreshStageError into soft results.

    Programmer errors (TypeError, etc.) still propagate for nonzero CLI exit.
    """
    try:
        return run_daily_amc_source_catalog(**kwargs)
    except DailyCatalogHardError:
        raise
    except RefreshStageError as exc:
        return DailyCatalogResult(
            outcome=OUTCOME_SKIPPED,
            promoted=False,
            soft_failure=True,
            message=f"AMC source catalog warning: {exc}; no files promoted",
            diagnostics=[f"AMC source catalog warning: {exc}; no files promoted"],
        )
