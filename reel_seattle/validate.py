"""JSON Schema validation for Reel Seattle artifacts."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Mapping

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from jsonschema.validators import validator_for

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = PROJECT_ROOT / "schema"

THEATERS_SCHEMA_PATH = SCHEMA_DIR / "theaters" / "v1.1.0.json"
SHOWTIMES_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "showtimes_current" / "v1.0.0.json"
PIPELINE_REPORT_SCHEMA_PATH = SCHEMA_DIR / "pipeline_report" / "v1.0.0.json"
NEWLY_ADDED_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "newly_added_current" / "v1.0.0.json"
LEAVING_SOON_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "leaving_soon_current" / "v1.2.0.json"
LEAVING_SOON_CURRENT_SCHEMA_DIR = SCHEMA_DIR / "leaving_soon_current"
OPENING_THIS_WEEK_CURRENT_SCHEMA_PATH = (
    SCHEMA_DIR / "opening_this_week_current" / "v1.1.0.json"
)
COLLECTIONS_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "collections_current" / "v1.0.0.json"
COMING_SOON_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "coming_soon_current" / "v1.4.0.json"
COMING_SOON_CANDIDATES_SCHEMA_PATH = (
    SCHEMA_DIR / "audits" / "coming_soon_candidates_current" / "v1.2.0.json"
)

_VALIDATOR_CACHE: dict[Path, Draft202012Validator] = {}


@dataclass
class SchemaValidationError(Exception):
    """Raised when a document fails JSON Schema validation."""

    schema_path: Path
    errors: list[ValidationError]

    def __str__(self) -> str:
        lines = [f"JSON schema validation failed ({self.schema_path}):"]
        for error in self.errors:
            lines.append(f"  {self._json_path(error)}: {error.message}")
        if len(self.errors) > 1:
            lines.append(f"  ({len(self.errors)} validation errors total)")
        return "\n".join(lines)

    @staticmethod
    def _json_path(error: ValidationError) -> str:
        if not error.absolute_path:
            return "$"
        return "$." + ".".join(str(part) for part in error.absolute_path)


def resolve_schema_path(relative_path: str) -> Path:
    """Resolve a path under ``schema/`` (e.g. ``showtimes_current/v1.0.0.json``)."""
    return SCHEMA_DIR / relative_path


def load_schema(schema_path: Path | str) -> dict[str, Any]:
    """Load a JSON Schema document from disk."""
    path = Path(schema_path)
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _validator_for_schema(schema_path: Path) -> Draft202012Validator:
    cached = _VALIDATOR_CACHE.get(schema_path)
    if cached is not None:
        return cached

    schema = load_schema(schema_path)
    validator_cls = validator_for(schema)
    validator_cls.check_schema(schema)
    validator = validator_cls(schema)
    _VALIDATOR_CACHE[schema_path] = validator
    return validator


def validate_against_schema(
    instance: Any,
    schema_path: Path | str,
    *,
    label: str | None = None,
) -> None:
    """Validate *instance* against the schema at *schema_path*.

    Raises
    ------
    SchemaValidationError
        When validation fails. The exception message includes the schema path
        and JSON pointer paths for each error.
    FileNotFoundError
        When *schema_path* does not exist.
    """
    path = Path(schema_path)
    validator = _validator_for_schema(path)
    errors = sorted(validator.iter_errors(instance), key=lambda err: list(err.path))
    if errors:
        if label:
            for error in errors:
                error.message = f"{label}: {error.message}"
        raise SchemaValidationError(path, errors)


def validate_theaters_registry(
    registry: dict[str, Any],
    *,
    schema_path: Path = THEATERS_SCHEMA_PATH,
) -> None:
    """Validate a theater registry document."""
    validate_against_schema(registry, schema_path, label="theaters registry")


def validate_showtimes_current(
    artifact: dict[str, Any],
    *,
    schema_path: Path = SHOWTIMES_CURRENT_SCHEMA_PATH,
) -> None:
    """Validate a showtimes_current artifact."""
    validate_against_schema(artifact, schema_path, label="showtimes_current")


def validate_pipeline_report(
    report: dict[str, Any],
    *,
    schema_path: Path = PIPELINE_REPORT_SCHEMA_PATH,
) -> None:
    """Validate a pipeline_report artifact."""
    validate_against_schema(report, schema_path, label="pipeline_report")


def validate_newly_added_current(
    artifact: dict[str, Any],
    *,
    schema_path: Path = NEWLY_ADDED_CURRENT_SCHEMA_PATH,
) -> None:
    """Validate a newly_added_current artifact."""
    validate_against_schema(artifact, schema_path, label="newly_added_current")


def validate_leaving_soon_current(
    artifact: dict[str, Any],
    *,
    schema_path: Path | None = None,
) -> None:
    """Validate a leaving_soon_current artifact.

    Chooses schema by ``schema_version`` when present (1.0.0 / 1.1.0 / 1.2.0+).
    """
    version = str(artifact.get("schema_version") or "")
    if schema_path is None:
        if version.startswith("1.0."):
            schema_path = LEAVING_SOON_CURRENT_SCHEMA_DIR / "v1.0.0.json"
        elif version.startswith("1.1."):
            schema_path = LEAVING_SOON_CURRENT_SCHEMA_DIR / "v1.1.0.json"
        else:
            schema_path = LEAVING_SOON_CURRENT_SCHEMA_PATH
    validate_against_schema(artifact, schema_path, label="leaving_soon_current")


def validate_collections_current(
    artifact: dict[str, Any],
    *,
    schema_path: Path = COLLECTIONS_CURRENT_SCHEMA_PATH,
) -> None:
    """Validate a collections_current artifact."""
    validate_against_schema(artifact, schema_path, label="collections_current")


def validate_opening_this_week_current(
    artifact: dict[str, Any],
    *,
    schema_path: Path = OPENING_THIS_WEEK_CURRENT_SCHEMA_PATH,
) -> None:
    """Validate an opening_this_week_current artifact."""
    validate_against_schema(artifact, schema_path, label="opening_this_week_current")
    week = artifact.get("week") or {}
    start = week.get("start_date")
    end = week.get("end_date")
    if not isinstance(start, str) or not isinstance(end, str):
        return
    try:
        start_date = date.fromisoformat(start)
        end_date = date.fromisoformat(end)
    except ValueError as exc:
        raise ValueError(
            f"opening_this_week_current: invalid week dates ({start!r}, {end!r})"
        ) from exc
    if end_date < start_date:
        raise ValueError(
            "opening_this_week_current: week.end_date must be >= week.start_date"
        )
    if start_date.weekday() != 0:
        raise ValueError(
            "opening_this_week_current: week.start_date must be a Monday"
        )
    if (end_date - start_date).days != 6:
        raise ValueError(
            "opening_this_week_current: week must be an inclusive Monday–Sunday span"
        )


def validate_coming_soon_current(
    artifact: dict[str, Any],
    *,
    schema_path: Path = COMING_SOON_CURRENT_SCHEMA_PATH,
) -> None:
    """Validate a coming_soon_current artifact plus its window invariants.

    The public artifact is the browser film calendar: curated Recommended rows
    plus a broader All releases slice. Special programming, local repertory,
    and TMDB-only candidates remain analysis-only. Expected dates sit inside
    the declared window, and canonical film_id is only present when
    identity.film_id_confirmed.
    """
    validate_against_schema(artifact, schema_path, label="coming_soon_current")
    _validate_coming_soon_invariants(artifact, public=True)


def validate_coming_soon_candidates(
    artifact: dict[str, Any],
    *,
    schema_path: Path = COMING_SOON_CANDIDATES_SCHEMA_PATH,
) -> None:
    """Validate the analysis Coming Soon candidate dump."""
    validate_against_schema(
        artifact, schema_path, label="coming_soon_candidates_current"
    )
    _validate_coming_soon_invariants(artifact, public=False)


def _validate_coming_soon_invariants(
    artifact: Mapping[str, Any],
    *,
    public: bool,
) -> None:
    label = "coming_soon_current" if public else "coming_soon_candidates_current"
    window = artifact.get("window") or {}
    try:
        start_date = date.fromisoformat(str(window.get("start_date")))
        end_date = date.fromisoformat(str(window.get("end_date")))
        cutoff = date.fromisoformat(str(window.get("current_availability_cutoff")))
    except ValueError as exc:
        raise ValueError(f"{label}: invalid window dates ({window})") from exc

    days = int(window.get("days") or 0)
    if end_date != start_date + timedelta(days=days):
        raise ValueError(
            f"{label}: window.end_date must be window.start_date plus "
            f"window.days ({days})"
        )
    cutoff_days = int(window.get("current_availability_days") or 0)
    if cutoff != start_date + timedelta(days=cutoff_days):
        raise ValueError(
            f"{label}: window.current_availability_cutoff must be "
            "window.start_date plus window.current_availability_days"
        )
    if cutoff > end_date:
        raise ValueError(
            f"{label}: current availability cutoff must fall inside the window"
        )

    entries = artifact.get("entries") or []
    join_keys: set[str] = set()
    film_ids: set[str] = set()
    user_visible = 0
    previous_sort_key: tuple | None = None
    public_kinds = {"film", "rerelease", "other"}
    public_relevance = {
        "confirmed_local",
        "locally_announced",
        "strongly_expected",
    }
    all_releases_relevance = public_relevance | {"weak_national_only"}

    for entry in entries:
        title = str(entry.get("title"))
        expected = date.fromisoformat(str(entry.get("expected_release_date")))
        if not (start_date <= expected <= end_date):
            raise ValueError(
                f"{label}: {title!r} expected_release_date {expected} "
                f"falls outside the {start_date}..{end_date} window"
            )

        classification = str(entry.get("classification"))
        relevance = entry.get("relevance_tier")
        visible = bool(entry.get("user_visible"))
        identity = entry.get("identity") or {}
        presentation = entry.get("presentation") or {}
        kind = str(presentation.get("kind") or "")

        if public:
            in_recommended = entry.get("in_recommended")
            if not isinstance(in_recommended, bool):
                raise ValueError(
                    f"{label}: {title!r} missing boolean in_recommended"
                )
            if relevance not in all_releases_relevance:
                raise ValueError(
                    f"{label}: {title!r} relevance_tier {relevance!r} "
                    "is not allowed in the public artifact"
                )
            if classification not in {"confirmed_local", "amc_announced"}:
                raise ValueError(
                    f"{label}: {title!r} classification {classification!r} "
                    "is not allowed in the public artifact"
                )
            if kind not in public_kinds:
                raise ValueError(
                    f"{label}: {title!r} presentation.kind {kind!r} is not "
                    "allowed in the public artifact"
                )
            if in_recommended:
                if relevance not in public_relevance:
                    raise ValueError(
                        f"{label}: {title!r} in_recommended with relevance_tier "
                        f"{relevance!r}"
                    )
            elif relevance != "weak_national_only":
                raise ValueError(
                    f"{label}: {title!r} All-releases-only row requires "
                    "relevance_tier weak_national_only"
                )
            if not visible:
                raise ValueError(f"{label}: {title!r} is not user_visible")
            if relevance == "confirmed_local" and classification != "confirmed_local":
                raise ValueError(
                    f"{label}: {title!r} relevance confirmed_local requires "
                    "classification confirmed_local"
                )
            if relevance == "strongly_expected" and classification != "amc_announced":
                raise ValueError(
                    f"{label}: {title!r} strongly_expected requires "
                    "classification amc_announced"
                )
            if relevance == "weak_national_only" and classification != "amc_announced":
                raise ValueError(
                    f"{label}: {title!r} weak_national_only requires "
                    "classification amc_announced"
                )
        else:
            if classification == "tmdb_only" and visible:
                raise ValueError(f"{label}: {title!r} tmdb_only must not be user_visible")
            if visible and relevance not in public_relevance:
                raise ValueError(
                    f"{label}: {title!r} user_visible with relevance_tier "
                    f"{relevance!r}"
                )
            if visible and kind not in public_kinds:
                raise ValueError(
                    f"{label}: {title!r} user_visible with presentation.kind {kind!r}"
                )
            if not visible and entry.get("visibility_reason") in (None, ""):
                raise ValueError(
                    f"{label}: {title!r} hidden row missing visibility_reason"
                )
        if visible:
            user_visible += 1

        film_id = entry.get("film_id")
        confirmed = bool(identity.get("film_id_confirmed"))
        if film_id and not confirmed:
            raise ValueError(
                f"{label}: {title!r} emits film_id without film_id_confirmed"
            )
        if confirmed and not film_id:
            raise ValueError(
                f"{label}: {title!r} film_id_confirmed is true without film_id"
            )
        inferred = bool(identity.get("tmdb_id_inferred"))
        tmdb_id = entry.get("tmdb_id")
        if inferred and confirmed:
            raise ValueError(
                f"{label}: {title!r} cannot be both film_id_confirmed and tmdb_id_inferred"
            )
        if inferred and tmdb_id is None:
            raise ValueError(
                f"{label}: {title!r} tmdb_id_inferred is true without tmdb_id"
            )

        first_local = entry.get("first_local_screening_date")
        if first_local is not None:
            first_local_date = date.fromisoformat(str(first_local))
            if first_local_date <= cutoff:
                raise ValueError(
                    f"{label}: {title!r} is currently available "
                    f"(local screening {first_local_date} on or before cutoff {cutoff})"
                )

        evidence = entry.get("evidence") or {}
        if classification == "confirmed_local" and first_local is None:
            raise ValueError(
                f"{label}: {title!r} is confirmed_local without a "
                "first_local_screening_date"
            )
        if classification == "amc_announced" and not evidence.get("amc_coming_soon_catalog"):
            raise ValueError(
                f"{label}: {title!r} is amc_announced without AMC "
                "Coming Soon catalog evidence"
            )
        if relevance == "strongly_expected":
            if not evidence.get("amc_coming_soon_catalog"):
                raise ValueError(
                    f"{label}: {title!r} strongly_expected without AMC catalog evidence"
                )
            if not evidence.get("tmdb_us_theatrical"):
                raise ValueError(
                    f"{label}: {title!r} strongly_expected without TMDB theatrical evidence"
                )
        if classification == "tmdb_only":
            if evidence.get("amc_coming_soon_catalog"):
                raise ValueError(
                    f"{label}: {title!r} is tmdb_only but has AMC catalog evidence"
                )
            if not evidence.get("tmdb_us_theatrical"):
                raise ValueError(
                    f"{label}: {title!r} is tmdb_only without TMDB evidence"
                )

        join_key = str(entry.get("join_key"))
        if join_key in join_keys:
            raise ValueError(
                f"{label}: duplicate join_key after collapse: {join_key!r}"
            )
        join_keys.add(join_key)

        if film_id:
            if str(film_id) in film_ids:
                raise ValueError(
                    f"{label}: duplicate film_id after collapse: {film_id!r}"
                )
            film_ids.add(str(film_id))

        sort_key = (
            str(entry.get("expected_release_date")),
            {
                "confirmed_local": 0,
                "locally_announced": 1,
                "strongly_expected": 2,
                "weak_national_only": 3,
            }.get(relevance, 99),
            title.casefold(),
        )
        if previous_sort_key is not None and sort_key < previous_sort_key:
            raise ValueError(
                f"{label}: entries must be sorted by expected_release_date, "
                "relevance_tier, then title"
            )
        previous_sort_key = sort_key

    stats = artifact.get("stats") or {}
    if int(stats.get("entry_count") or 0) != len(entries):
        raise ValueError(f"{label}: stats.entry_count does not match entries")
    if int(stats.get("user_visible_count") or 0) != user_visible:
        raise ValueError(f"{label}: stats.user_visible_count does not match entries")
    if public and int(stats.get("hidden_count") or 0) != 0:
        raise ValueError(f"{label}: public hidden_count must be 0")
    if public:
        recommended = sum(1 for entry in entries if entry.get("in_recommended"))
        rec_stat = stats.get("recommended_count")
        if rec_stat is None or int(rec_stat) != recommended:
            raise ValueError(
                f"{label}: stats.recommended_count does not match entries"
            )
        all_stat = stats.get("all_releases_count")
        if all_stat is None or int(all_stat) != len(entries):
            raise ValueError(
                f"{label}: stats.all_releases_count does not match entries"
            )


def validate_theaters_registry_file(
    registry_path: Path | str = PROJECT_ROOT / "data" / "theaters.json",
    *,
    schema_path: Path = THEATERS_SCHEMA_PATH,
) -> dict[str, Any]:
    """Load and validate ``data/theaters.json``."""
    path = Path(registry_path)
    with path.open(encoding="utf-8") as handle:
        registry = json.load(handle)
    validate_theaters_registry(registry, schema_path=schema_path)
    return registry
