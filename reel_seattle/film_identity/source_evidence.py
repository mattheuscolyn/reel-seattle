"""Side-load trustworthy source metadata that never reached showtimes emit.

Daily scrape logs keep adapter ``attributes`` / NWFF program ``raw`` fields
(release_year, directors, runtime) that the CSV→emit path drops. Inventory joins
the newest log per source so the matcher can score with provenance-tracked
evidence without guessing missing values.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from reel_seattle.adapters.scrape_log import DEFAULT_DAILY_LOGS_DIR
from reel_seattle.normalize.runtime import parse_runtime_minutes
from reel_seattle.validate import PROJECT_ROOT

EVIDENCE_SOURCES = ("beacon", "nwff", "central_cinema", "siff", "amc")


@dataclass
class SourceEvidence:
    release_year: int | None = None
    runtime_min: int | None = None
    directors_raw: str | None = None
    external_ids: dict[str, str] = field(default_factory=dict)
    parent_display_title: str | None = None
    parent_film_key: str | None = None
    provenance: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "release_year": self.release_year,
            "runtime_min": self.runtime_min,
            "directors_raw": self.directors_raw,
            "external_ids": dict(self.external_ids),
            "parent_display_title": self.parent_display_title,
            "parent_film_key": self.parent_film_key,
            "provenance": dict(self.provenance),
        }


def find_latest_daily_log(source: str, *, logs_dir: Path) -> Path | None:
    pattern = f"*_{source}.json"
    matches = sorted(logs_dir.glob(pattern))
    return matches[-1] if matches else None


def load_source_evidence_index(
    *,
    root: Path | None = None,
    logs_dir: Path | None = None,
) -> dict[str, dict[str, SourceEvidence]]:
    """Return ``{source: {source_film_id: SourceEvidence}}`` from newest daily logs."""
    base = root or PROJECT_ROOT
    directory = logs_dir or (base / DEFAULT_DAILY_LOGS_DIR)
    out: dict[str, dict[str, SourceEvidence]] = {}
    if not directory.exists():
        return out
    for source in EVIDENCE_SOURCES:
        path = find_latest_daily_log(source, logs_dir=directory)
        if path is None:
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(doc, Mapping):
            continue
        bucket = out.setdefault(source, {})
        if source == "nwff":
            _ingest_nwff_log(doc, bucket, log_name=path.name)
        else:
            _ingest_records_log(doc, bucket, source=source, log_name=path.name)
    return out


def _ingest_records_log(
    doc: Mapping[str, Any],
    bucket: dict[str, SourceEvidence],
    *,
    source: str,
    log_name: str,
) -> None:
    for record in doc.get("records") or []:
        if not isinstance(record, Mapping):
            continue
        attrs = record.get("attributes") if isinstance(record.get("attributes"), Mapping) else {}
        sid = _opt_str(attrs.get("source_film_id")) or _opt_str(record.get("source_film_id"))
        if not sid:
            continue
        evidence = bucket.get(sid) or SourceEvidence()
        _merge_attr_evidence(evidence, attrs, runtime_raw=record.get("runtime_raw"), log_name=log_name)
        # AMC showtimes rarely carry film-level directors/year; leave gaps for products join.
        _ = source
        bucket[sid] = evidence


def _ingest_nwff_log(
    doc: Mapping[str, Any],
    bucket: dict[str, SourceEvidence],
    *,
    log_name: str,
) -> None:
    _ingest_records_log(doc, bucket, source="nwff", log_name=log_name)
    isr = doc.get("independent_source_result")
    if not isinstance(isr, Mapping):
        return
    for program in isr.get("programs") or []:
        if not isinstance(program, Mapping):
            continue
        sid = _opt_str(program.get("source_program_id"))
        if not sid:
            continue
        raw = program.get("raw") if isinstance(program.get("raw"), Mapping) else {}
        evidence = bucket.get(sid) or SourceEvidence()
        year = _opt_year(raw.get("release_year"))
        if year is not None and evidence.release_year is None:
            evidence.release_year = year
            provenance = raw.get("feature_credit_provenance")
            evidence.provenance["release_year"] = (
                f"nwff_program_raw:{provenance}" if provenance else f"nwff_program_raw:{log_name}"
            )
        runtime = _opt_int(raw.get("runtime_min"))
        if runtime is not None and evidence.runtime_min is None:
            evidence.runtime_min = runtime
            evidence.provenance["runtime_min"] = f"nwff_program_raw:{log_name}"
        directors = _directors_to_raw(raw.get("directors"))
        if directors and not evidence.directors_raw:
            evidence.directors_raw = directors
            provenance = raw.get("feature_credit_provenance")
            evidence.provenance["directors_raw"] = (
                f"nwff_program_raw:{provenance}"
                if provenance
                else f"nwff_program_raw:{log_name}"
            )
        bucket[sid] = evidence


def _merge_attr_evidence(
    evidence: SourceEvidence,
    attrs: Mapping[str, Any],
    *,
    runtime_raw: Any,
    log_name: str,
) -> None:
    year = _opt_year(attrs.get("release_year"))
    if year is not None and evidence.release_year is None:
        evidence.release_year = year
        evidence.provenance["release_year"] = f"daily_log_attributes:{log_name}"
    directors = _opt_str(attrs.get("directors_raw")) or _opt_str(attrs.get("director"))
    if directors and not evidence.directors_raw:
        evidence.directors_raw = directors
        provenance = _opt_str(attrs.get("directors_provenance")) or "daily_log_attributes"
        evidence.provenance["directors_raw"] = f"{provenance}:{log_name}"
    runtime = parse_runtime_minutes(runtime_raw)
    if runtime is None:
        runtime = _opt_int(attrs.get("runtime_min"))
    if runtime is not None and evidence.runtime_min is None:
        evidence.runtime_min = runtime
        evidence.provenance["runtime_min"] = f"daily_log:{log_name}"
    external = attrs.get("external_ids")
    if isinstance(external, Mapping):
        for key, value in external.items():
            text = _opt_str(value)
            if text and key not in evidence.external_ids:
                evidence.external_ids[str(key)] = text
                evidence.provenance[f"external_ids.{key}"] = f"daily_log_attributes:{log_name}"
    imdb = _opt_str(attrs.get("imdb_id"))
    if imdb and "imdb_id" not in evidence.external_ids:
        evidence.external_ids["imdb_id"] = imdb
        evidence.provenance["external_ids.imdb_id"] = f"daily_log_attributes:{log_name}"


def _directors_to_raw(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (list, tuple)):
        parts = [str(item).strip() for item in value if str(item).strip()]
        if not parts:
            return None
        if len(parts) == 1:
            return parts[0]
        return ", ".join(parts)
    return None


def _opt_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def _opt_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _opt_year(value: Any) -> int | None:
    year = _opt_int(value)
    if year is None or year < 1888 or year > 2100:
        return None
    return year
