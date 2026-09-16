"""JSON Schema validation for Reel Seattle artifacts."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from jsonschema.validators import validator_for

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = PROJECT_ROOT / "schema"

THEATERS_SCHEMA_PATH = SCHEMA_DIR / "theaters" / "v1.1.0.json"
SHOWTIMES_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "showtimes_current" / "v1.0.0.json"
PIPELINE_REPORT_SCHEMA_PATH = SCHEMA_DIR / "pipeline_report" / "v1.0.0.json"
NEWLY_ADDED_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "newly_added_current" / "v1.0.0.json"
LEAVING_SOON_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "leaving_soon_current" / "v1.1.0.json"
OPENING_THIS_WEEK_CURRENT_SCHEMA_PATH = (
    SCHEMA_DIR / "opening_this_week_current" / "v1.1.0.json"
)
COLLECTIONS_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "collections_current" / "v1.0.0.json"
COMING_SOON_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "coming_soon_current" / "v1.0.0.json"

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
    schema_path: Path = LEAVING_SOON_CURRENT_SCHEMA_PATH,
) -> None:
    """Validate a leaving_soon_current artifact."""
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

    Beyond the schema this enforces the production inclusion rule: every
    expected release date sits inside the declared window, no currently
    available film is emitted, visibility matches classification, and the
    collapsed identity produces one entry per film.
    """
    validate_against_schema(artifact, schema_path, label="coming_soon_current")

    window = artifact.get("window") or {}
    try:
        start_date = date.fromisoformat(str(window.get("start_date")))
        end_date = date.fromisoformat(str(window.get("end_date")))
        cutoff = date.fromisoformat(str(window.get("current_availability_cutoff")))
    except ValueError as exc:
        raise ValueError(f"coming_soon_current: invalid window dates ({window})") from exc

    days = int(window.get("days") or 0)
    if end_date != start_date + timedelta(days=days):
        raise ValueError(
            "coming_soon_current: window.end_date must be window.start_date plus "
            f"window.days ({days})"
        )
    cutoff_days = int(window.get("current_availability_days") or 0)
    if cutoff != start_date + timedelta(days=cutoff_days):
        raise ValueError(
            "coming_soon_current: window.current_availability_cutoff must be "
            "window.start_date plus window.current_availability_days"
        )
    if cutoff > end_date:
        raise ValueError(
            "coming_soon_current: current availability cutoff must fall inside the window"
        )

    entries = artifact.get("entries") or []
    join_keys: set[str] = set()
    film_ids: set[str] = set()
    user_visible = 0
    previous_sort_key: tuple[str, str] | None = None

    for entry in entries:
        title = str(entry.get("title"))
        expected = date.fromisoformat(str(entry.get("expected_release_date")))
        if not (start_date <= expected <= end_date):
            raise ValueError(
                f"coming_soon_current: {title!r} expected_release_date {expected} "
                f"falls outside the {start_date}..{end_date} window"
            )

        classification = str(entry.get("classification"))
        expected_visible = classification in {"confirmed_local", "amc_announced"}
        if bool(entry.get("user_visible")) != expected_visible:
            raise ValueError(
                f"coming_soon_current: {title!r} user_visible does not match "
                f"classification {classification!r}"
            )
        if expected_visible:
            user_visible += 1

        first_local = entry.get("first_local_screening_date")
        if first_local is not None:
            first_local_date = date.fromisoformat(str(first_local))
            if first_local_date <= cutoff:
                raise ValueError(
                    f"coming_soon_current: {title!r} is currently available "
                    f"(local screening {first_local_date} on or before cutoff {cutoff})"
                )

        evidence = entry.get("evidence") or {}
        if classification == "confirmed_local" and first_local is None:
            raise ValueError(
                f"coming_soon_current: {title!r} is confirmed_local without a "
                "first_local_screening_date"
            )
        if classification == "amc_announced" and not evidence.get("amc_coming_soon_catalog"):
            raise ValueError(
                f"coming_soon_current: {title!r} is amc_announced without AMC "
                "Coming Soon catalog evidence"
            )
        if classification == "tmdb_only":
            if evidence.get("amc_coming_soon_catalog"):
                raise ValueError(
                    f"coming_soon_current: {title!r} is tmdb_only but has AMC "
                    "catalog evidence"
                )
            if not evidence.get("tmdb_us_theatrical"):
                raise ValueError(
                    f"coming_soon_current: {title!r} is tmdb_only without TMDB evidence"
                )

        join_key = str(entry.get("join_key"))
        if join_key in join_keys:
            raise ValueError(
                f"coming_soon_current: duplicate join_key after collapse: {join_key!r}"
            )
        join_keys.add(join_key)

        film_id = entry.get("film_id")
        if film_id:
            if str(film_id) in film_ids:
                raise ValueError(
                    f"coming_soon_current: duplicate film_id after collapse: {film_id!r}"
                )
            film_ids.add(str(film_id))

        sort_key = (str(entry.get("expected_release_date")), title.casefold())
        if previous_sort_key is not None and sort_key < previous_sort_key:
            raise ValueError(
                "coming_soon_current: entries must be sorted by "
                "expected_release_date then title"
            )
        previous_sort_key = sort_key

    stats = artifact.get("stats") or {}
    if int(stats.get("entry_count") or 0) != len(entries):
        raise ValueError("coming_soon_current: stats.entry_count does not match entries")
    if int(stats.get("user_visible_count") or 0) != user_visible:
        raise ValueError(
            "coming_soon_current: stats.user_visible_count does not match entries"
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
