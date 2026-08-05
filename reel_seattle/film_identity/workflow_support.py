"""Helpers for live TMDB match workflow packaging and guards (T-FILMID-01D)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from reel_seattle.film_identity.constants import (
    CATALOG_REL,
    COVERAGE_REL,
    DECISIONS_REL,
    REVIEW_QUEUE_REL,
    SCHEMA_VERSION,
)
from reel_seattle.film_identity.decisions import validate_decisions_document
from reel_seattle.film_identity.io_util import atomic_write_json
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage
from reel_seattle.validate import PROJECT_ROOT, validate_against_schema

ALLOWED_GENERATED_RELS = (
    CATALOG_REL,
    REVIEW_QUEUE_REL,
    COVERAGE_REL,
    "data/audits/tmdb_film_identity_match_summary.md",
)

PROTECTED_RELS = (
    DECISIONS_REL,
)

DISALLOWED_PREFIXES = (
    "public/",
    "v2/",
    "cockpit/",
    "src/",
    "reel_seattle/",
    "schema/",
    ".github/",
    "data/cache/",
    "data/theaters.json",
    "data/source_catalog/",
)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_repo_rel(path: str | Path, *, root: Path | None = None) -> str:
    base = (root or PROJECT_ROOT).resolve()
    resolved = Path(path)
    if not resolved.is_absolute():
        resolved = (base / resolved).resolve()
    try:
        rel = resolved.relative_to(base)
    except ValueError as exc:
        raise ValueError(f"path outside repository: {path}") from exc
    return rel.as_posix()


def assert_allowed_changed_paths(
    changed_paths: Sequence[str],
    *,
    root: Path | None = None,
) -> list[str]:
    """Return normalized allowed paths; raise if any disallowed/protected path changed."""
    allowed = set(ALLOWED_GENERATED_RELS)
    protected = set(PROTECTED_RELS)
    normalized: list[str] = []
    unexpected: list[str] = []
    for raw in changed_paths:
        text = str(raw).strip()
        if not text or text.startswith("data/cache/"):
            # Cache must never be treated as a reviewable generated change.
            if text.startswith("data/cache/"):
                unexpected.append(text)
            continue
        rel = normalize_repo_rel(text, root=root)
        if rel in protected:
            unexpected.append(rel)
            continue
        if rel not in allowed:
            if any(rel == prefix.rstrip("/") or rel.startswith(prefix) for prefix in DISALLOWED_PREFIXES):
                unexpected.append(rel)
            elif rel not in allowed:
                unexpected.append(rel)
            continue
        normalized.append(rel)
    if unexpected:
        raise ValueError(
            "unexpected film-identity match path changes: "
            + ", ".join(sorted(set(unexpected)))
        )
    return sorted(set(normalized))


def build_match_summary_markdown(
    coverage: Mapping[str, Any],
    *,
    changed_paths: Sequence[str] | None = None,
    auth_mode: str | None = None,
) -> str:
    by_source = coverage.get("by_source") or {}
    lines = [
        "# Film identity live match summary",
        "",
        f"- schema_version: `{coverage.get('schema_version') or SCHEMA_VERSION}`",
        f"- generated_at: `{coverage.get('generated_at')}`",
        f"- total_unique_source_identities: **{coverage.get('total_unique_source_identities', 0)}**",
        f"- confirmed_automatic: **{coverage.get('confirmed_automatic', 0)}**",
        f"- confirmed_manual: **{coverage.get('confirmed_manual', 0)}**",
        f"- review_required: **{coverage.get('review_required', 0)}**",
        f"- unmatched: **{coverage.get('unmatched', 0)}**",
        f"- non_film: **{coverage.get('non_film', 0)}**",
        f"- deferred: **{coverage.get('deferred', 0)}**",
        f"- rejected: **{coverage.get('rejected', 0)}**",
        f"- errors: **{coverage.get('errors', 0)}**",
        f"- fallback_usage: **{coverage.get('fallback_usage', 0)}**",
        f"- review_queue_size: **{coverage.get('review_queue_size', 0)}**",
    ]
    if auth_mode:
        lines.append(f"- tmdb_auth_mode: `{auth_mode}`")
    lines.extend(["", "## Coverage by source", ""])
    if not by_source:
        lines.append("_No per-source rows._")
    else:
        lines.append("| source | total | auto | manual | review | unmatched | non_film | errors |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|")
        for source in sorted(by_source):
            row = by_source[source] or {}
            lines.append(
                "| {source} | {total} | {auto} | {manual} | {review} | {unmatched} | {non_film} | {errors} |".format(
                    source=source,
                    total=row.get("total", 0),
                    auto=row.get("confirmed_automatic", 0),
                    manual=row.get("confirmed_manual", 0),
                    review=row.get("review_required", 0),
                    unmatched=row.get("unmatched", 0),
                    non_film=row.get("non_film", 0),
                    errors=row.get("error", row.get("errors", 0)),
                )
            )
    lines.extend(["", "## Generated path changes", ""])
    if changed_paths:
        for path in changed_paths:
            lines.append(f"- `{path}`")
    else:
        lines.append("_No path list provided._")
    lines.extend(
        [
            "",
            "## Explicit non-actions",
            "",
            "- Public identity emission enabled (`T-FILMID-02`); store migration deferred (`T-FILMID-03`)",
            "- No enrichment / UI activation (`T-ENR-01`)",
            "- No local-store migration (`T-FILMID-03`)",
            "- Authored decisions file was not modified by this matcher run",
            "",
        ]
    )
    return "\n".join(lines)


def validate_generated_package(
    *,
    catalog_path: Path,
    review_queue_path: Path,
    coverage_path: Path,
    decisions_path: Path | None = None,
    root: Path | None = None,
) -> None:
    base = root or PROJECT_ROOT
    catalog = _load_json(catalog_path)
    review = _load_json(review_queue_path)
    coverage = _load_json(coverage_path)
    validate_against_schema(
        catalog,
        base / "schema/film_identity/film_identity_catalog/v1.0.0.json",
        label="film_identity_catalog",
    )
    validate_against_schema(
        review,
        base / "schema/film_identity/tmdb_match_review_queue/v1.0.0.json",
        label="tmdb_match_review_queue",
    )
    assert_no_tmdb_secret_leakage(catalog)
    assert_no_tmdb_secret_leakage(review)
    assert_no_tmdb_secret_leakage(coverage)
    if decisions_path is not None and decisions_path.exists():
        validate_decisions_document(_load_json(decisions_path))
    film_count = len(catalog.get("films") or [])
    if coverage.get("total_unique_source_identities") not in (None, film_count):
        raise ValueError(
            "coverage total_unique_source_identities does not match catalog film count"
        )
    queue_count = len(review.get("items") or [])
    if coverage.get("review_queue_size") not in (None, queue_count):
        raise ValueError("coverage review_queue_size does not match review queue items")


def import_generated_artifacts(
    source_dir: Path,
    *,
    root: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Import a downloaded match artifact package into the repo."""
    base = root or PROJECT_ROOT
    mapping = {
        "film_identity_catalog.json": base / CATALOG_REL,
        "tmdb_match_review_queue.json": base / REVIEW_QUEUE_REL,
        "tmdb_film_identity_coverage.json": base / COVERAGE_REL,
        "tmdb_film_identity_match_summary.md": base
        / "data/audits/tmdb_film_identity_match_summary.md",
    }
    found: dict[str, Path] = {}
    for name, dest in mapping.items():
        candidate = source_dir / name
        if candidate.exists():
            found[name] = candidate
    required = {
        "film_identity_catalog.json",
        "tmdb_match_review_queue.json",
        "tmdb_film_identity_coverage.json",
    }
    missing = sorted(required - set(found))
    if missing:
        raise ValueError(f"missing required artifact files: {', '.join(missing)}")

    # Reject authored decisions if present in the import dir.
    for banned in ("tmdb_match_decisions.json",):
        if (source_dir / banned).exists():
            raise ValueError(
                f"refusing to import authored decisions artifact: {banned}"
            )

    catalog = _load_json(found["film_identity_catalog.json"])
    review = _load_json(found["tmdb_match_review_queue.json"])
    coverage = _load_json(found["tmdb_film_identity_coverage.json"])
    validate_against_schema(
        catalog,
        base / "schema/film_identity/film_identity_catalog/v1.0.0.json",
        label="film_identity_catalog",
    )
    validate_against_schema(
        review,
        base / "schema/film_identity/tmdb_match_review_queue/v1.0.0.json",
        label="tmdb_match_review_queue",
    )
    assert_no_tmdb_secret_leakage(catalog)
    assert_no_tmdb_secret_leakage(review)
    assert_no_tmdb_secret_leakage(coverage)

    planned = [mapping[name].as_posix() for name in found]
    summary = {
        "dry_run": dry_run,
        "imported": sorted(found),
        "destinations": planned,
        "coverage": {
            "total_unique_source_identities": coverage.get(
                "total_unique_source_identities"
            ),
            "confirmed_automatic": coverage.get("confirmed_automatic"),
            "review_required": coverage.get("review_required"),
            "unmatched": coverage.get("unmatched"),
            "non_film": coverage.get("non_film"),
            "errors": coverage.get("errors"),
        },
    }
    if dry_run:
        return summary

    atomic_write_json(mapping["film_identity_catalog.json"], catalog)
    atomic_write_json(mapping["tmdb_match_review_queue.json"], review)
    atomic_write_json(mapping["tmdb_film_identity_coverage.json"], coverage)
    summary_src = found.get("tmdb_film_identity_match_summary.md")
    if summary_src is not None:
        text = summary_src.read_text(encoding="utf-8")
        assert_no_tmdb_secret_leakage({"summary": text})
        dest = mapping["tmdb_film_identity_match_summary.md"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        tmp.write_text(text if text.endswith("\n") else text + "\n", encoding="utf-8")
        tmp.replace(dest)
    return summary


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"expected object JSON: {path}")
    return data
