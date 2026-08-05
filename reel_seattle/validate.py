"""JSON Schema validation for Reel Seattle artifacts."""

from __future__ import annotations

import json
from dataclasses import dataclass
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
LEAVING_SOON_CURRENT_SCHEMA_PATH = SCHEMA_DIR / "leaving_soon_current" / "v1.0.0.json"

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
