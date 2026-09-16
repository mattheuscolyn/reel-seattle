"""Daily Coming Soon orchestration (non-blocking workflow stage).

Coordinates the two optional upstream refreshes (AMC Coming Soon catalog, TMDB
US theatrical discover) and then the public artifact build. Every stage soft
fails: a temporary AMC or TMDB outage retains the last-known-good durable
snapshot and, if the public artifact cannot be rebuilt safely, leaves the
existing ``public/data/coming_soon_current.json`` untouched rather than
emptying the page.

Mirrors ``reel_seattle.source_catalog.amc_daily`` and does not reimplement
fetch, merge, classification, or validation logic.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping
from zoneinfo import ZoneInfo

from reel_seattle.emit.coming_soon import (
    DEFAULT_ANALYSIS_PATH,
    DEFAULT_CURRENT_AVAILABILITY_DAYS,
    DEFAULT_LOGS_DIR,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REGISTRY_PATH,
    DEFAULT_SHOWTIMES_CURRENT_PATH,
    DEFAULT_WINDOW_DAYS,
    latest_amc_scrape_log,
    load_showtimes_current,
    pacific_today,
    publish_coming_soon_current,
)
from reel_seattle.film_identity.tmdb_discover import (
    DEFAULT_CANDIDATES_PATH,
    DEFAULT_MAX_PAGES as TMDB_MAX_PAGES,
    TmdbDiscoverError,
    TmdbDiscoverValidationError,
    build_us_theatrical_candidates,
    fetch_us_theatrical,
    load_us_theatrical_candidates,
    validate_us_theatrical_candidates,
    write_us_theatrical_candidates,
)
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.source_catalog.amc_coming_soon import (
    DEFAULT_CATALOG_PATH,
    DEFAULT_MAX_PAGES as AMC_MAX_PAGES,
    DEFAULT_PAGE_SIZE,
    ComingSoonCatalogError,
    ComingSoonCatalogValidationError,
    build_coming_soon_catalog,
    build_live_session,
    fetch_coming_soon_catalog,
    load_coming_soon_catalog,
    load_offline_fixture_pages,
    make_requests_fetch_page,
    validate_coming_soon_catalog,
    write_coming_soon_catalog,
)

STAGE_REFRESHED = "refreshed"
STAGE_RETAINED = "retained_previous"
STAGE_SKIPPED = "skipped"
STAGE_UNAVAILABLE = "unavailable"

OUTCOME_PUBLISHED = "published"
OUTCOME_UNCHANGED = "unchanged"
OUTCOME_RETAINED = "retained_previous"
OUTCOME_SKIPPED = "skipped"


@dataclass
class SourceStageResult:
    """Outcome of one optional upstream refresh."""

    name: str
    outcome: str
    soft_failure: bool = False
    message: str = ""
    records: int = 0
    generated_at: str | None = None
    artifact_path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ComingSoonDailyResult:
    """Structured result for the daily Coming Soon stage."""

    outcome: str
    published: bool
    soft_failure: bool
    message: str
    diagnostics: list[str] = field(default_factory=list)
    stages: list[SourceStageResult] = field(default_factory=list)
    entry_count: int = 0
    user_visible_count: int = 0
    confirmed_local_count: int = 0
    amc_announced_count: int = 0
    tmdb_only_count: int = 0
    excluded_currently_available: int = 0
    output_path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["stages"] = [stage.to_dict() for stage in self.stages]
        return payload


class ComingSoonDailyHardError(RuntimeError):
    """Raised for invalid CLI usage or unexpected programmer errors."""


def _now_pacific_iso() -> str:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")


def refresh_amc_catalog_stage(
    *,
    catalog_path: Path,
    fixture_pages: Path | None,
    live: bool,
    generated_at: str,
    page_size: int = DEFAULT_PAGE_SIZE,
    max_pages: int = AMC_MAX_PAGES,
    sleep_seconds: float = 0.0,
) -> tuple[SourceStageResult, dict[str, Any] | None]:
    """Refresh the durable AMC Coming Soon catalog, retaining prior on failure."""
    previous = load_coming_soon_catalog(catalog_path)
    stage = SourceStageResult(
        name="amc_coming_soon_catalog",
        outcome=STAGE_SKIPPED,
        artifact_path=str(catalog_path),
    )

    if not live and fixture_pages is None:
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        stage.message = (
            "AMC Coming Soon catalog: refresh skipped (no live mode or fixtures); "
            + ("using previous snapshot" if previous else "no snapshot available")
        )
        stage.records = int(((previous or {}).get("stats") or {}).get("movies") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    try:
        if fixture_pages is not None:
            fetch_page = load_offline_fixture_pages(fixture_pages)
        else:
            fetch_page = make_requests_fetch_page(build_live_session())
        fetch_result = fetch_coming_soon_catalog(
            fetch_page,
            page_size=page_size,
            max_pages=max_pages,
            sleep_seconds=sleep_seconds,
        )
    except (ComingSoonCatalogError, OSError) as exc:
        stage.soft_failure = True
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        stage.message = f"AMC Coming Soon catalog warning: fetch failed ({exc})"
        stage.records = int(((previous or {}).get("stats") or {}).get("movies") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    if not fetch_result.ok:
        stage.soft_failure = True
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        detail = fetch_result.errors[0].get("error") if fetch_result.errors else "no records"
        stage.message = (
            f"AMC Coming Soon catalog warning: fetch status={fetch_result.status} ({detail}); "
            + ("retained previous snapshot" if previous else "no snapshot available")
        )
        stage.records = int(((previous or {}).get("stats") or {}).get("movies") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    artifact = build_coming_soon_catalog(fetch_result, generated_at=generated_at)
    try:
        validate_coming_soon_catalog(artifact)
    except ComingSoonCatalogValidationError as exc:
        stage.soft_failure = True
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        stage.message = (
            f"AMC Coming Soon catalog error: generated snapshot failed validation ({exc}); "
            "not promoted"
        )
        stage.records = int(((previous or {}).get("stats") or {}).get("movies") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    write_coming_soon_catalog(artifact, catalog_path)
    stage.outcome = STAGE_REFRESHED
    stage.records = int(artifact["stats"]["movies"])
    stage.generated_at = artifact["generated_at"]
    stage.message = (
        f"AMC Coming Soon catalog: {stage.records} movies "
        f"({fetch_result.pages_fetched} pages, status={fetch_result.status})"
    )
    return stage, artifact


def refresh_tmdb_stage(
    *,
    candidates_path: Path,
    live: bool,
    start_date: date,
    end_date: date,
    window_days: int,
    generated_at: str,
    max_pages: int = TMDB_MAX_PAGES,
    client: Any | None = None,
) -> tuple[SourceStageResult, dict[str, Any] | None]:
    """Refresh the durable TMDB candidates snapshot, retaining prior on failure."""
    previous = load_us_theatrical_candidates(candidates_path)
    stage = SourceStageResult(
        name="tmdb_us_theatrical",
        outcome=STAGE_SKIPPED,
        artifact_path=str(candidates_path),
    )

    if not live and client is None:
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        stage.message = (
            "TMDB US theatrical: refresh skipped (no live mode); "
            + ("using previous snapshot" if previous else "no snapshot available")
        )
        stage.records = int(((previous or {}).get("stats") or {}).get("candidates") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    try:
        if client is None:
            from reel_seattle.film_identity.tmdb_discover import build_live_client

            client = build_live_client()
        fetch_result = fetch_us_theatrical(
            client,
            start_date=start_date,
            end_date=end_date,
            max_pages=max_pages,
        )
    except (TmdbDiscoverError, OSError) as exc:
        stage.soft_failure = True
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        stage.message = f"TMDB US theatrical warning: fetch failed ({exc})"
        stage.records = int(((previous or {}).get("stats") or {}).get("candidates") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    if not fetch_result.ok:
        stage.soft_failure = True
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        detail = fetch_result.errors[0].get("error") if fetch_result.errors else "no rows"
        stage.message = (
            f"TMDB US theatrical warning: fetch status={fetch_result.status} ({detail}); "
            + ("retained previous snapshot" if previous else "no snapshot available")
        )
        stage.records = int(((previous or {}).get("stats") or {}).get("candidates") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    artifact = build_us_theatrical_candidates(
        fetch_result,
        start_date=start_date,
        end_date=end_date,
        window_days=window_days,
        generated_at=generated_at,
    )
    try:
        validate_us_theatrical_candidates(artifact)
    except TmdbDiscoverValidationError as exc:
        stage.soft_failure = True
        stage.outcome = STAGE_RETAINED if previous else STAGE_UNAVAILABLE
        stage.message = (
            f"TMDB US theatrical error: generated snapshot failed validation ({exc}); "
            "not promoted"
        )
        stage.records = int(((previous or {}).get("stats") or {}).get("candidates") or 0)
        stage.generated_at = (previous or {}).get("generated_at")
        return stage, previous

    write_us_theatrical_candidates(artifact, candidates_path)
    stage.outcome = STAGE_REFRESHED
    stage.records = int(artifact["stats"]["candidates"])
    stage.generated_at = artifact["generated_at"]
    stage.message = (
        f"TMDB US theatrical: {stage.records} candidates "
        f"({fetch_result.pages_fetched} pages, status={fetch_result.status})"
    )
    return stage, artifact


def _load_registry(path: Path) -> Mapping[str, Any] | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, Mapping) else None


def format_diagnostics(result: ComingSoonDailyResult) -> list[str]:
    """Build concise stdout lines for the workflow log."""
    lines = [stage.message for stage in result.stages if stage.message]
    lines.append(result.message)
    if result.published or result.outcome == OUTCOME_UNCHANGED:
        lines.append(
            "Coming Soon: "
            f"{result.entry_count} entries / {result.user_visible_count} user-visible "
            f"({result.confirmed_local_count} confirmed local, "
            f"{result.amc_announced_count} AMC announced, "
            f"{result.tmdb_only_count} TMDB-only hidden)"
        )
    return lines


def run_daily_coming_soon(
    *,
    output_path: Path | str = DEFAULT_OUTPUT_PATH,
    analysis_path: Path | str = DEFAULT_ANALYSIS_PATH,
    catalog_path: Path | str = DEFAULT_CATALOG_PATH,
    tmdb_candidates_path: Path | str = DEFAULT_CANDIDATES_PATH,
    showtimes_current_path: Path | str = DEFAULT_SHOWTIMES_CURRENT_PATH,
    registry_path: Path | str = DEFAULT_REGISTRY_PATH,
    logs_dir: Path | str = DEFAULT_LOGS_DIR,
    repo_root: Path | str = ".",
    live: bool = False,
    refresh_amc: bool = True,
    refresh_tmdb: bool = True,
    amc_fixture_pages: Path | str | None = None,
    tmdb_client: Any | None = None,
    today_date: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    current_availability_days: int = DEFAULT_CURRENT_AVAILABILITY_DAYS,
    generated_at: str | None = None,
    run_date: date | None = None,
    sleep_seconds: float = 0.0,
) -> ComingSoonDailyResult:
    """Run the daily Coming Soon stage. Soft-fails via the returned result."""
    root = Path(repo_root)

    def resolve(path: Path | str) -> Path:
        candidate = Path(path)
        return candidate if candidate.is_absolute() else root / candidate

    stamp = generated_at or _now_pacific_iso()
    today = today_date or pacific_today()
    window_end = today + timedelta(days=window_days)

    result = ComingSoonDailyResult(
        outcome=OUTCOME_SKIPPED,
        published=False,
        soft_failure=False,
        message="",
        output_path=str(resolve(output_path)),
    )

    amc_stage, amc_catalog = refresh_amc_catalog_stage(
        catalog_path=resolve(catalog_path),
        fixture_pages=Path(amc_fixture_pages) if amc_fixture_pages else None,
        live=live and refresh_amc,
        generated_at=stamp,
        sleep_seconds=sleep_seconds,
    )
    result.stages.append(amc_stage)

    tmdb_stage, tmdb_artifact = refresh_tmdb_stage(
        candidates_path=resolve(tmdb_candidates_path),
        live=live and refresh_tmdb,
        start_date=today,
        end_date=window_end,
        window_days=window_days,
        generated_at=stamp,
        client=tmdb_client,
    )
    result.stages.append(tmdb_stage)

    result.soft_failure = amc_stage.soft_failure or tmdb_stage.soft_failure

    showtimes = load_showtimes_current(resolve(showtimes_current_path))
    registry = _load_registry(resolve(registry_path))
    scrape_log = latest_amc_scrape_log(resolve(logs_dir), run_date=run_date)

    try:
        published = publish_coming_soon_current(
            output_path=resolve(output_path),
            analysis_path=resolve(analysis_path),
            amc_catalog=amc_catalog,
            tmdb_candidates_artifact=tmdb_artifact,
            showtimes_current=showtimes,
            amc_scrape_log_path=scrape_log,
            registry=registry,
            today_date=today,
            window_days=window_days,
            current_availability_days=current_availability_days,
        )
    except Exception as exc:  # noqa: BLE001 - publication must never hard-fail the daily run
        result.soft_failure = True
        result.outcome = OUTCOME_RETAINED
        result.message = (
            f"Coming Soon error: build/validation failed ({exc}); "
            "retained previous public artifact"
        )
        result.diagnostics = format_diagnostics(result)
        return result

    artifact = published.get("artifact")
    if artifact:
        stats = artifact.get("stats") or {}
        classification = stats.get("classification_counts") or {}
        result.entry_count = int(stats.get("entry_count") or 0)
        result.user_visible_count = int(stats.get("user_visible_count") or 0)
        result.confirmed_local_count = int(classification.get("confirmed_local") or 0)
        result.amc_announced_count = int(classification.get("amc_announced") or 0)
        result.tmdb_only_count = int(
            (stats.get("analysis") or {}).get("tmdb_only_count") or 0
        )
        result.excluded_currently_available = int(
            (stats.get("excluded_counts") or {}).get("currently_available") or 0
        )

    if published.get("published"):
        result.outcome = OUTCOME_PUBLISHED
        result.published = True
        result.message = f"Coming Soon: published {result.entry_count} entries"
    elif published.get("skipped_reason") == "unchanged_membership":
        result.outcome = OUTCOME_UNCHANGED
        result.message = "Coming Soon: membership unchanged; existing artifact kept"
    else:
        result.soft_failure = True
        result.outcome = OUTCOME_RETAINED
        result.message = (
            "Coming Soon warning: not published "
            f"({published.get('skipped_reason')}); previous artifact retained"
        )

    result.diagnostics = format_diagnostics(result)
    return result
