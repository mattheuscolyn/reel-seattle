"""AMC Movies refresh stage for durable source-catalog observations (offline-capable).

Discovers active AMC source_film_ids, selects products to refresh, fetches Movies
API (or fixtures), and emits normalized observation input for
``reel_seattle.source_catalog.amc`` merge/derive.

Does not own catalog merge, lifecycle, or release derivation.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from reel_seattle.adapters.amc import build_amc_headers
from reel_seattle.analysis.amc_movies_client import (
    FetchMovieFn,
    MovieIdPlan,
    SourcePlan,
    assert_no_secret_leakage,
    extract_movie_plans_from_scrape_log,
    extract_movie_plans_from_showtimes_current,
    find_latest_amc_scrape_log,
    load_offline_fixture_fetch,
    make_requests_fetch_movie,
    run_movie_lookups,
    sanitize_error_message,
)
from reel_seattle.analysis.amc_source_observations import is_special_presentation_category
from reel_seattle.analysis.amc_wwm_release_audit import (
    extract_attribute_lists,
    extract_media_urls,
    classify_product_category,
)
from reel_seattle.normalize.dates import DEFAULT_TIMEZONE
from reel_seattle.source_catalog.amc import (
    CLASSIFIER_VERSION,
    MOVIES_FETCH_FAILED,
    MOVIES_FETCH_INVALID,
    MOVIES_FETCH_SUCCESS,
    SCHEMA_VERSION as CATALOG_SCHEMA_VERSION,
    SourceCatalogValidationError,
    update_amc_source_catalog,
    validate_amc_source_catalog_pair,
    validate_product_catalog,
    write_amc_source_catalog,
)

SCHEMA_VERSION = "1.0.0"
SOURCE = "amc"
OBSERVATIONS_FILENAME = "amc_source_catalog_observations.json"

POLICY_ALL_ACTIVE = "all-active"
POLICY_NEW_ONLY = "new-only"
POLICY_STALE = "stale"
REFRESH_POLICIES = frozenset({POLICY_ALL_ACTIVE, POLICY_NEW_ONLY, POLICY_STALE})

FAILURE_REQUEST = "request_failed"
FAILURE_HTTP = "http_error"
FAILURE_INVALID_SHAPE = "response_invalid"
FAILURE_ID_MISMATCH = "id_mismatch"
FAILURE_MISSING_FIXTURE = "missing_fixture"

DISCOVERY_SCRAPE_LOG = "scrape-log"
DISCOVERY_SHOWTIMES = "showtimes-current"


class RefreshStageError(ValueError):
    """Raised for structural refresh-stage failures."""


@dataclass(frozen=True)
class DiscoveredProduct:
    source_film_id: str
    observed_title: str | None
    occurrence_count: int


@dataclass(frozen=True)
class DiscoveryResult:
    source_path: str
    source_kind: str
    observed_at: str
    raw_records: int
    products: tuple[DiscoveredProduct, ...]

    @property
    def active_ids(self) -> list[str]:
        return [item.source_film_id for item in self.products]


@dataclass(frozen=True)
class RefreshSelection:
    policy: str
    stale_after_hours: float | None
    selected_ids: tuple[str, ...]
    skipped_ids: tuple[str, ...]
    known_ids: tuple[str, ...]
    new_ids: tuple[str, ...]


def _id_sort_key(value: str) -> tuple[int, int | str]:
    text = str(value)
    if text.isdigit():
        return (0, int(text))
    return (1, text)


def _optional_str(value: object | None) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: object | None) -> int | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _optional_bool(value: object | None) -> bool | None:
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


def _now_pacific_iso() -> str:
    return datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).isoformat(timespec="seconds")


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(DEFAULT_TIMEZONE))
    return parsed


def _label_for_path(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def _plans_to_discovery(
    plan: SourcePlan,
    *,
    source_kind: str,
    observed_at: str | None,
) -> DiscoveryResult:
    products = tuple(
        DiscoveredProduct(
            source_film_id=item.amc_movie_id,
            observed_title=item.source_title,
            occurrence_count=item.occurrence_count,
        )
        for item in sorted(plan.plans, key=lambda p: _id_sort_key(p.amc_movie_id))
    )
    if not products:
        raise RefreshStageError(
            f"no usable AMC source_film_id values found in {plan.source_artifact}"
        )
    stamp = observed_at
    if not stamp:
        if plan.source_artifact_date:
            stamp = f"{plan.source_artifact_date}T00:00:00-07:00"
        else:
            stamp = _now_pacific_iso()
    return DiscoveryResult(
        source_path=plan.source_artifact,
        source_kind=source_kind,
        observed_at=stamp,
        raw_records=plan.raw_amc_records,
        products=products,
    )


def _observed_at_from_payload(payload: Mapping[str, Any], fallback_date: str | None) -> str:
    generated = payload.get("generated_at")
    if isinstance(generated, str) and generated.strip():
        return generated.strip()
    if fallback_date:
        return f"{fallback_date}T00:00:00-07:00"
    return _now_pacific_iso()


def discover_from_payload(
    payload: Mapping[str, Any],
    *,
    source_label: str,
) -> DiscoveryResult:
    """Discover active AMC products from an already-loaded discovery payload."""
    if "records" in payload:
        plan = extract_movie_plans_from_scrape_log(payload, source_label=source_label)
        return _plans_to_discovery(
            plan,
            source_kind=DISCOVERY_SCRAPE_LOG,
            observed_at=_observed_at_from_payload(payload, plan.source_artifact_date),
        )
    if "showtimes" in payload:
        plan = extract_movie_plans_from_showtimes_current(
            payload, source_label=source_label
        )
        return _plans_to_discovery(
            plan,
            source_kind=DISCOVERY_SHOWTIMES,
            observed_at=_observed_at_from_payload(payload, plan.source_artifact_date),
        )
    raise RefreshStageError(f"unrecognized discovery artifact shape: {source_label}")


def discover_active_products(
    discovery_source: str,
    *,
    repo_root: Path | str = ".",
    logs_dir: Path | str = "data/daily_logs",
    showtimes_path: Path | str = "public/data/showtimes_current.json",
) -> DiscoveryResult:
    """Discover active AMC products from a path, ``auto``, or named source kinds.

    ``auto`` precedence: newest ``data/daily_logs/*_amc.json``, else
    ``public/data/showtimes_current.json``.
    """
    root = Path(repo_root)
    source = (discovery_source or "").strip()
    if not source:
        raise RefreshStageError("discovery source is required")

    if source == "auto":
        latest = find_latest_amc_scrape_log(root / logs_dir)
        if latest is not None:
            payload = json.loads(latest.read_text(encoding="utf-8"))
            return discover_from_payload(
                payload, source_label=_label_for_path(latest, root)
            )
        path = root / showtimes_path
        if not path.is_file():
            raise RefreshStageError(
                "auto discovery found no AMC scrape log and showtimes_current is missing"
            )
        payload = json.loads(path.read_text(encoding="utf-8"))
        return discover_from_payload(payload, source_label=_label_for_path(path, root))

    if source == "scrape-log":
        latest = find_latest_amc_scrape_log(root / logs_dir)
        if latest is None:
            raise RefreshStageError(f"no AMC scrape logs found under {logs_dir}")
        payload = json.loads(latest.read_text(encoding="utf-8"))
        return discover_from_payload(
            payload, source_label=_label_for_path(latest, root)
        )

    if source == "showtimes-current":
        path = root / showtimes_path
        if not path.is_file():
            raise RefreshStageError(f"showtimes artifact not found: {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        return discover_from_payload(payload, source_label=_label_for_path(path, root))

    path = Path(source)
    if not path.is_file():
        path = root / source
    if not path.is_file():
        raise RefreshStageError(f"discovery source not found: {discovery_source}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise RefreshStageError(f"discovery source is not a JSON object: {path}")
    return discover_from_payload(payload, source_label=_label_for_path(path, root))


def load_existing_products(path: Path | str | None) -> dict[str, Any] | None:
    """Load and validate an existing durable product catalog, if provided."""
    if path is None:
        return None
    catalog_path = Path(path)
    if not catalog_path.is_file():
        raise RefreshStageError(f"existing products not found: {catalog_path}")
    try:
        payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RefreshStageError(f"existing products JSON invalid: {exc}") from exc
    if not isinstance(payload, Mapping):
        raise RefreshStageError("existing products must be a JSON object")
    try:
        validate_product_catalog(payload)
    except SourceCatalogValidationError as exc:
        raise RefreshStageError(f"existing products failed validation: {exc}") from exc
    return dict(payload)


def _products_by_id(catalog: Mapping[str, Any] | None) -> dict[str, Mapping[str, Any]]:
    if catalog is None:
        return {}
    out: dict[str, Mapping[str, Any]] = {}
    for product in catalog.get("products") or []:
        if not isinstance(product, Mapping):
            continue
        film_id = _optional_str(product.get("source_film_id"))
        if film_id:
            out[film_id] = product
    return out


def select_refresh_targets(
    discovery: DiscoveryResult,
    existing_catalog: Mapping[str, Any] | None,
    *,
    policy: str,
    stale_after_hours: float | None = None,
    as_of: str | None = None,
) -> RefreshSelection:
    """Deterministically select which discovered IDs require a Movies refresh."""
    name = (policy or POLICY_ALL_ACTIVE).strip()
    if name not in REFRESH_POLICIES:
        raise RefreshStageError(f"unsupported refresh policy: {policy!r}")

    active_ids = discovery.active_ids
    by_id = _products_by_id(existing_catalog)
    known = tuple(sorted((fid for fid in active_ids if fid in by_id), key=_id_sort_key))
    new = tuple(sorted((fid for fid in active_ids if fid not in by_id), key=_id_sort_key))

    if name == POLICY_ALL_ACTIVE:
        selected = tuple(active_ids)
        skipped: tuple[str, ...] = ()
    elif name == POLICY_NEW_ONLY:
        selected = new
        skipped = known
    else:
        if stale_after_hours is None:
            raise RefreshStageError("stale policy requires --stale-after-hours")
        if stale_after_hours < 0:
            raise RefreshStageError("stale-after-hours must be >= 0")
        as_of_dt = _parse_timestamp(as_of) or datetime.now(ZoneInfo(DEFAULT_TIMEZONE))
        threshold = timedelta(hours=float(stale_after_hours))
        selected_list: list[str] = []
        skipped_list: list[str] = []
        for film_id in active_ids:
            product = by_id.get(film_id)
            if product is None:
                selected_list.append(film_id)
                continue
            lifecycle = product.get("lifecycle") or {}
            last_success = _parse_timestamp(
                _optional_str(lifecycle.get("last_successful_refresh_at"))
            )
            if last_success is None:
                selected_list.append(film_id)
                continue
            age = as_of_dt - last_success.astimezone(as_of_dt.tzinfo)
            if age > threshold:
                selected_list.append(film_id)
            else:
                skipped_list.append(film_id)
        selected = tuple(selected_list)
        skipped = tuple(skipped_list)

    return RefreshSelection(
        policy=name,
        stale_after_hours=stale_after_hours if name == POLICY_STALE else None,
        selected_ids=selected,
        skipped_ids=skipped,
        known_ids=known,
        new_ids=new,
    )


def normalize_movies_metadata(body: Mapping[str, Any]) -> dict[str, Any]:
    """Map an AMC Movies response body to durable-catalog observation metadata."""
    codes, _names = extract_attribute_lists(body)
    codes = sorted({str(code).strip() for code in codes if str(code).strip()})
    media_raw = extract_media_urls(body)
    source_title = _optional_str(body.get("name"))
    preferred = _optional_str(body.get("preferredMediaType") or body.get("preferred_media_type"))
    category = classify_product_category(
        name=source_title,
        source_title=source_title,
        attribute_codes=codes,
        attribute_names=[],
        preferred_media_type=preferred,
    )
    release_raw = body.get("wwmReleaseNumber")
    if release_raw in (None, ""):
        source_release_id = None
    else:
        source_release_id = str(release_raw).strip() or None

    return {
        "source_title": source_title,
        "sortable_title": _optional_str(body.get("sortableName") or body.get("sortable_title")),
        "source_release_id": source_release_id,
        "runtime_min": _optional_int(body.get("runTime") or body.get("runtime_min")),
        "release_date_utc": _optional_str(body.get("releaseDateUtc") or body.get("release_date_utc")),
        "earliest_showing_utc": _optional_str(
            body.get("earliestShowingUtc") or body.get("earliest_showing_utc")
        ),
        "online_ticket_availability_date_utc": _optional_str(
            body.get("onlineTicketAvailabilityDateUtc")
            or body.get("online_ticket_availability_date_utc")
        ),
        "has_scheduled_showtimes": _optional_bool(
            body.get("hasScheduledShowtimes")
            if "hasScheduledShowtimes" in body
            else body.get("has_scheduled_showtimes")
        ),
        "genre": _optional_str(body.get("genre")),
        "mpaa_rating": _optional_str(body.get("mpaaRating") or body.get("mpaa_rating")),
        "starring_actors_raw": _optional_str(
            body.get("starringActors") or body.get("starring_actors_raw")
        ),
        "directors_raw": _optional_str(body.get("directors") or body.get("directors_raw")),
        "synopsis": _optional_str(body.get("synopsis")),
        "distributor_id": (
            str(body.get("distributorId")).strip()
            if body.get("distributorId") not in (None, "")
            else _optional_str(body.get("distributor_id"))
        ),
        "distributor_code": _optional_str(
            body.get("distributorCode") or body.get("distributor_code")
        ),
        "preferred_media_type": preferred,
        "available_for_a_list": _optional_bool(
            body.get("availableForAList")
            if "availableForAList" in body
            else body.get("available_for_a_list")
        ),
        "slug": _optional_str(body.get("slug")),
        "website_url": _optional_str(body.get("websiteUrl") or body.get("website_url")),
        "showtimes_url": _optional_str(body.get("showtimesUrl") or body.get("showtimes_url")),
        "attribute_codes": codes,
        "media": {
            "poster_url": _optional_str(media_raw.get("posterDynamic")),
            "hero_desktop_url": _optional_str(media_raw.get("heroDesktopDynamic")),
            "hero_mobile_url": _optional_str(media_raw.get("heroMobileDynamic")),
            "trailer_hd_url": _optional_str(media_raw.get("trailerHd")),
            "trailer_mp4_url": _optional_str(media_raw.get("trailerMp4")),
        },
        "presentation": {
            "category": category,
            "is_special_presentation": is_special_presentation_category(category),
            "classifier_version": CLASSIFIER_VERSION,
        },
    }


def _failure_observation(
    *,
    film_id: str,
    observed_title: str | None,
    observed_at: str,
    attempted_at: str,
    status: str,
    http_status: int | None,
    failure_category: str,
    error: str | None,
) -> dict[str, Any]:
    return {
        "source": SOURCE,
        "source_film_id": film_id,
        "observed_title": observed_title,
        "observed_at": observed_at,
        "movies_fetch": {
            "attempted_at": attempted_at,
            "status": status,
            "http_status": http_status,
            "failure_category": failure_category,
            "error": sanitize_error_message(error),
            "metadata": None,
        },
    }


def observation_from_lookup(
    plan: MovieIdPlan,
    *,
    http_status: int | None,
    body: Mapping[str, Any] | None,
    error: str | None,
    observed_at: str,
    attempted_at: str,
) -> dict[str, Any]:
    """Convert one Movies lookup result into a P-14A observation record."""
    film_id = plan.amc_movie_id
    title = plan.source_title

    if http_status is None:
        return _failure_observation(
            film_id=film_id,
            observed_title=title,
            observed_at=observed_at,
            attempted_at=attempted_at,
            status=MOVIES_FETCH_FAILED,
            http_status=None,
            failure_category=FAILURE_REQUEST,
            error=error or "request failed",
        )

    if http_status == 404 and (error or "").casefold().startswith("http 404"):
        category = FAILURE_MISSING_FIXTURE if "fixture" in (error or "").casefold() else FAILURE_HTTP
        # load_offline_fixture_fetch returns error "HTTP 404" for missing fixtures
        if error == "HTTP 404":
            # Ambiguous between live 404 and missing fixture; treat as http_error.
            category = FAILURE_HTTP
        return _failure_observation(
            film_id=film_id,
            observed_title=title,
            observed_at=observed_at,
            attempted_at=attempted_at,
            status=MOVIES_FETCH_FAILED,
            http_status=http_status,
            failure_category=category,
            error=error or f"HTTP {http_status}",
        )

    if http_status != 200:
        return _failure_observation(
            film_id=film_id,
            observed_title=title,
            observed_at=observed_at,
            attempted_at=attempted_at,
            status=MOVIES_FETCH_FAILED,
            http_status=http_status,
            failure_category=FAILURE_HTTP,
            error=error or f"HTTP {http_status}",
        )

    if not isinstance(body, Mapping):
        return _failure_observation(
            film_id=film_id,
            observed_title=title,
            observed_at=observed_at,
            attempted_at=attempted_at,
            status=MOVIES_FETCH_INVALID,
            http_status=http_status,
            failure_category=FAILURE_INVALID_SHAPE,
            error=error or "response is not a JSON object",
        )

    response_id = body.get("id")
    if response_id not in (None, ""):
        if str(response_id).strip() != film_id:
            return _failure_observation(
                film_id=film_id,
                observed_title=title,
                observed_at=observed_at,
                attempted_at=attempted_at,
                status=MOVIES_FETCH_INVALID,
                http_status=http_status,
                failure_category=FAILURE_ID_MISMATCH,
                error=(
                    f"response id {response_id!r} does not match requested "
                    f"source_film_id {film_id!r}"
                ),
            )

    if "name" not in body and "wwmReleaseNumber" not in body and "id" not in body:
        return _failure_observation(
            film_id=film_id,
            observed_title=title,
            observed_at=observed_at,
            attempted_at=attempted_at,
            status=MOVIES_FETCH_INVALID,
            http_status=http_status,
            failure_category=FAILURE_INVALID_SHAPE,
            error="movie payload missing expected fields",
        )

    metadata = normalize_movies_metadata(body)
    if metadata.get("source_title") is None and title:
        metadata["source_title"] = title

    return {
        "source": SOURCE,
        "source_film_id": film_id,
        "observed_title": title or metadata.get("source_title"),
        "observed_at": observed_at,
        "movies_fetch": {
            "attempted_at": attempted_at,
            "status": MOVIES_FETCH_SUCCESS,
            "http_status": http_status,
            "failure_category": None,
            "error": None,
            "metadata": metadata,
        },
    }


def _observation_for_skipped(
    product: DiscoveredProduct,
    *,
    observed_at: str,
) -> dict[str, Any]:
    """Presence-only observation for active IDs skipped by the refresh policy."""
    return {
        "source": SOURCE,
        "source_film_id": product.source_film_id,
        "observed_title": product.observed_title,
        "observed_at": observed_at,
        "movies_fetch": {
            "attempted_at": None,
            "status": "skipped",
            "http_status": None,
            "failure_category": None,
            "error": None,
            "metadata": None,
        },
    }


def build_fetch_movie(
    *,
    fixture_dir: Path | str | None = None,
    live: bool = False,
    timeout_seconds: float = 30.0,
    max_retries: int = 2,
    session: Any | None = None,
) -> FetchMovieFn:
    """Build a Movies fetch callable for fixture or live mode."""
    if fixture_dir is not None:
        return load_offline_fixture_fetch(fixture_dir)
    if not live:
        raise RefreshStageError("either fixture_dir or live mode is required")
    api_key = os.environ.get("AMC_API_KEY")
    if not api_key:
        raise RefreshStageError(
            "AMC_API_KEY environment variable is required for live refresh mode. "
            "Use --fixture-responses for offline runs."
        )
    import requests

    sess = session or requests.Session()
    sess.headers.update(build_amc_headers(api_key))
    return make_requests_fetch_movie(
        sess, timeout_seconds=timeout_seconds, max_retries=max_retries
    )


def run_amc_catalog_refresh(
    *,
    discovery: DiscoveryResult,
    selection: RefreshSelection,
    fetch_movie: FetchMovieFn,
    generated_at: str,
    attempted_at: str | None = None,
    sleep_seconds: float = 0.0,
    include_skipped_presence: bool = True,
) -> dict[str, Any]:
    """Execute selected Movies lookups and build the normalized observations artifact."""
    stamp = generated_at
    attempt_stamp = attempted_at or generated_at
    by_id = {item.source_film_id: item for item in discovery.products}
    selected_plans = [
        MovieIdPlan(
            amc_movie_id=film_id,
            source_title=(by_id[film_id].observed_title if film_id in by_id else None),
            occurrence_count=(
                by_id[film_id].occurrence_count if film_id in by_id else 0
            ),
        )
        for film_id in selection.selected_ids
    ]

    def classify(
        plan: MovieIdPlan,
        *,
        http_status: int | None,
        body: Mapping[str, Any] | None,
        error: str | None = None,
    ) -> dict[str, Any]:
        return observation_from_lookup(
            plan,
            http_status=http_status,
            body=body,
            error=error,
            observed_at=discovery.observed_at,
            attempted_at=attempt_stamp,
        )

    fetched = run_movie_lookups(
        selected_plans,
        fetch_movie,
        classify,
        sleep_seconds=sleep_seconds,
    )

    observations: list[dict[str, Any]] = list(fetched)
    if include_skipped_presence:
        skipped_set = set(selection.skipped_ids)
        for product in discovery.products:
            if product.source_film_id in skipped_set:
                observations.append(
                    _observation_for_skipped(product, observed_at=discovery.observed_at)
                )

    observations.sort(key=lambda item: _id_sort_key(str(item["source_film_id"])))

    success = sum(
        1
        for item in observations
        if (item.get("movies_fetch") or {}).get("status") == MOVIES_FETCH_SUCCESS
    )
    failed = sum(
        1
        for item in observations
        if (item.get("movies_fetch") or {}).get("status") == MOVIES_FETCH_FAILED
    )
    invalid = sum(
        1
        for item in observations
        if (item.get("movies_fetch") or {}).get("status") == MOVIES_FETCH_INVALID
    )
    skipped = sum(
        1
        for item in observations
        if (item.get("movies_fetch") or {}).get("status") == "skipped"
    )

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "source": SOURCE,
        "discovery": {
            "source_path": discovery.source_path,
            "source_kind": discovery.source_kind,
            "observed_at": discovery.observed_at,
            "raw_records": discovery.raw_records,
            "active_product_ids": len(discovery.products),
        },
        "policy": {
            "name": selection.policy,
            "stale_after_hours": selection.stale_after_hours,
            "selected_ids": list(selection.selected_ids),
            "skipped_ids": list(selection.skipped_ids),
            "known_ids": list(selection.known_ids),
            "new_ids": list(selection.new_ids),
        },
        "stats": {
            "selected": len(selection.selected_ids),
            "skipped": len(selection.skipped_ids),
            "success": success,
            "failed": failed,
            "invalid": invalid,
            "skipped_presence": skipped,
        },
        "observations": observations,
    }
    assert_no_secret_leakage(artifact)
    return artifact


def observations_for_merge(artifact: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Project refresh artifact observations into the P-14A merge input shape."""
    rows = artifact.get("observations")
    if not isinstance(rows, list):
        raise RefreshStageError("observations artifact missing observations array")
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, Mapping):
            raise RefreshStageError("observation rows must be objects")
        fetch = row.get("movies_fetch") or {}
        if not isinstance(fetch, Mapping):
            raise RefreshStageError("movies_fetch must be an object")
        out.append(
            {
                "source_film_id": row.get("source_film_id"),
                "observed_title": row.get("observed_title"),
                "observed_at": row.get("observed_at"),
                "movies_fetch": {
                    "attempted_at": fetch.get("attempted_at"),
                    "status": fetch.get("status"),
                    "metadata": fetch.get("metadata"),
                },
            }
        )
    return out


def write_observations_artifact(
    artifact: Mapping[str, Any],
    output_dir: Path | str,
) -> Path:
    """Write the sanitized observations intermediate artifact."""
    assert_no_secret_leakage(artifact)
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    path = out / OBSERVATIONS_FILENAME
    path.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def refresh_and_optional_update(
    *,
    discovery_source: str,
    existing_products_path: Path | str | None,
    policy: str,
    stale_after_hours: float | None,
    output_dir: Path | str,
    generated_at: str,
    fixture_dir: Path | str | None = None,
    live: bool = False,
    update_catalog: bool = False,
    sleep_seconds: float = 0.0,
    as_of: str | None = None,
    repo_root: Path | str = ".",
    include_skipped_presence: bool = True,
) -> dict[str, Any]:
    """Run discovery → selection → fetch → observations (+ optional catalog update)."""
    discovery = discover_active_products(discovery_source, repo_root=repo_root)
    existing = load_existing_products(existing_products_path)
    selection = select_refresh_targets(
        discovery,
        existing,
        policy=policy,
        stale_after_hours=stale_after_hours,
        as_of=as_of or generated_at,
    )
    fetch_movie = build_fetch_movie(fixture_dir=fixture_dir, live=live)
    artifact = run_amc_catalog_refresh(
        discovery=discovery,
        selection=selection,
        fetch_movie=fetch_movie,
        generated_at=generated_at,
        sleep_seconds=sleep_seconds,
        include_skipped_presence=include_skipped_presence,
    )
    observations_path = write_observations_artifact(artifact, output_dir)
    result: dict[str, Any] = {
        "observations_path": observations_path,
        "observations_artifact": artifact,
        "discovery": discovery,
        "selection": selection,
        "products_path": None,
        "releases_path": None,
    }

    if update_catalog:
        products, releases = update_amc_source_catalog(
            existing_products=existing,
            observations=observations_for_merge(artifact),
            active_ids=discovery.active_ids,
            generated_at=generated_at,
            as_of=as_of or generated_at,
        )
        validate_amc_source_catalog_pair(products, releases)
        paths = write_amc_source_catalog(products, releases, output_dir)
        result["products_path"] = paths["products"]
        result["releases_path"] = paths["releases"]
        result["products"] = products
        result["releases"] = releases

    return result


def count_product_errors(artifact: Mapping[str, Any]) -> int:
    """Count failed/invalid Movies fetch outcomes in an observations artifact."""
    count = 0
    for row in artifact.get("observations") or []:
        status = ((row or {}).get("movies_fetch") or {}).get("status")
        if status in {MOVIES_FETCH_FAILED, MOVIES_FETCH_INVALID}:
            count += 1
    return count


# Re-export catalog schema version for docs/tests clarity.
CATALOG_CONTRACT_VERSION = CATALOG_SCHEMA_VERSION
