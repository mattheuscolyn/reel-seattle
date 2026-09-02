#!/usr/bin/env python3
"""Validate public/data JSON artifacts before daily scrape commit."""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reel_seattle.enrichment.validate import (  # noqa: E402
    validate_film_enrichment_document,
)
from reel_seattle.film_identity.public_emit import (  # noqa: E402
    assert_public_film_id_attach_not_regressed,
)
from reel_seattle.validate import (  # noqa: E402
    SchemaValidationError,
    validate_leaving_soon_current,
    validate_newly_added_current,
    validate_opening_this_week_current,
    validate_pipeline_report,
    validate_showtimes_current,
    validate_theaters_registry,
)

REQUIRED_ARTIFACTS: tuple[str, ...] = (
    "public/data/showtimes_current.json",
    "public/data/pipeline_report.json",
    "public/data/newly_added_current.json",
    "public/data/leaving_soon_current.json",
    "public/data/opening_this_week_current.json",
    "public/data/theaters.json",
    "public/data/film_enrichment_current.json",
)

CANONICAL_THEATERS = "data/theaters.json"
PUBLIC_THEATERS = "public/data/theaters.json"

OBSOLETE_PATHS: tuple[str, ...] = (
    "public/data/showtimes_history.csv",
    "public/data/daily_logs",
)

VALIDATORS: dict[str, Callable[[dict[str, Any]], None]] = {
    "public/data/showtimes_current.json": validate_showtimes_current,
    "public/data/pipeline_report.json": validate_pipeline_report,
    "public/data/newly_added_current.json": validate_newly_added_current,
    "public/data/leaving_soon_current.json": validate_leaving_soon_current,
    "public/data/opening_this_week_current.json": validate_opening_this_week_current,
    "public/data/theaters.json": validate_theaters_registry,
    "public/data/film_enrichment_current.json": validate_film_enrichment_document,
}


def validate_public_data_artifacts(root: Path | None = None) -> list[str]:
    """Run all public-data checks. Returns actionable error messages (empty if OK)."""
    project_root = root or PROJECT_ROOT
    errors: list[str] = []

    for rel in REQUIRED_ARTIFACTS:
        path = project_root / rel
        if not path.is_file():
            errors.append(f"missing required file: {rel}")
            continue

        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON in {rel}: {exc.msg}")
            continue
        except OSError as exc:
            errors.append(f"could not read {rel}: {exc}")
            continue

        validator = VALIDATORS[rel]
        try:
            validator(document)
        except SchemaValidationError as exc:
            errors.append(str(exc))
        except Exception as exc:  # pragma: no cover - defensive guard for unexpected failures
            errors.append(f"validation failed for {rel}: {exc}")

    canonical_path = project_root / CANONICAL_THEATERS
    public_path = project_root / PUBLIC_THEATERS
    if canonical_path.is_file() and public_path.is_file():
        canonical_bytes = canonical_path.read_bytes()
        public_bytes = public_path.read_bytes()
        if canonical_bytes != public_bytes:
            errors.append(
                "public/data/theaters.json is out of sync with data/theaters.json "
                "— run python daily_processor.py or reel_seattle.registry_sync.sync_public_theaters_registry()"
            )
    elif canonical_path.is_file() and not public_path.is_file():
        errors.append(f"missing deployed theater registry copy: {PUBLIC_THEATERS}")
    elif not canonical_path.is_file() and public_path.is_file():
        errors.append(f"missing canonical theater registry: {CANONICAL_THEATERS}")

    for rel in OBSOLETE_PATHS:
        path = project_root / rel
        if path.exists():
            if rel.endswith(".csv"):
                errors.append(
                    f"obsolete path exists: {rel} — remove it; canonical history is data/history/showtimes_history.csv"
                )
            else:
                errors.append(
                    f"obsolete path exists: {rel}/ — remove it; scrape JSON logs belong in data/daily_logs/"
                )

    # T-FILMID-02 gate: confirmed catalog matches must not silently detach in public emit.
    try:
        assert_public_film_id_attach_not_regressed(project_root)
    except ValueError as exc:
        errors.append(str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        errors.append(f"public film_id attach gate failed: {exc}")

    return errors


def main() -> int:
    errors = validate_public_data_artifacts()
    if errors:
        print("validate_public_data_artifacts: FAILED", file=sys.stderr)
        print(f"  ({len(errors)} error{'s' if len(errors) != 1 else ''})", file=sys.stderr)
        for message in errors:
            print(f"  - {message}", file=sys.stderr)
        return 1

    print("validate_public_data_artifacts: OK")
    print(f"  - {len(REQUIRED_ARTIFACTS)} JSON artifacts present and schema-valid")
    print(f"  - {CANONICAL_THEATERS} matches {PUBLIC_THEATERS}")
    print("  - no obsolete public/data paths")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
