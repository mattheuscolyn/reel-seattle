"""Authored TMDB match decisions — load, validate, apply."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4

from reel_seattle.film_identity.constants import (
    DECISION_CONFIRM,
    DECISION_DEFER,
    DECISION_NON_FILM,
    DECISION_REJECT_CANDIDATE,
    DECISION_UNMAPPED,
    DECISIONS,
    DECISIONS_REL,
    SCHEMA_VERSION,
)
from reel_seattle.film_identity.security import assert_no_tmdb_secret_leakage
from reel_seattle.validate import PROJECT_ROOT, validate_against_schema

DECISIONS_SCHEMA = (
    PROJECT_ROOT / "schema" / "film_identity" / "tmdb_match_decisions" / "v1.0.0.json"
)


def decisions_path(root: Path | None = None) -> Path:
    return (root or PROJECT_ROOT) / DECISIONS_REL


def empty_decisions_document(*, updated_at: str | None = None) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "updated_at": updated_at or _now_iso(),
        "decisions": [],
    }


def load_decisions(path: Path | None = None) -> dict[str, Any]:
    target = path or decisions_path()
    if not target.exists():
        return empty_decisions_document()
    with target.open(encoding="utf-8") as handle:
        doc = json.load(handle)
    validate_decisions_document(doc)
    return doc


def validate_decisions_document(doc: Mapping[str, Any]) -> None:
    validate_against_schema(doc, DECISIONS_SCHEMA, label="tmdb_match_decisions")
    assert_no_tmdb_secret_leakage(doc)
    _validate_semantics(doc)


def active_decisions_by_source_key(doc: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """Map stable source key → latest active decision."""
    active: dict[str, dict[str, Any]] = {}
    for decision in doc.get("decisions") or []:
        if decision.get("active") is False:
            continue
        key = source_identity_key(decision.get("source_identity") or {})
        # Later decisions in file order win; document should keep stable sort.
        active[key] = decision
    return active


def source_identity_key(source_identity: Mapping[str, Any]) -> str:
    source = str(source_identity.get("source") or "").strip()
    sid = source_identity.get("source_film_id")
    key = source_identity.get("showtime_film_key")
    if sid not in (None, ""):
        return f"{source}|id|{sid}"
    return f"{source}|key|{key}"


def rejected_tmdb_ids_for(source_identity: Mapping[str, Any], doc: Mapping[str, Any]) -> set[int]:
    key = source_identity_key(source_identity)
    rejected: set[int] = set()
    for decision in doc.get("decisions") or []:
        if source_identity_key(decision.get("source_identity") or {}) != key:
            continue
        if decision.get("decision") == DECISION_REJECT_CANDIDATE:
            tid = decision.get("tmdb_id")
            if isinstance(tid, int):
                rejected.add(tid)
            for extra in decision.get("rejected_tmdb_ids") or []:
                if isinstance(extra, int):
                    rejected.add(extra)
        for extra in decision.get("rejected_tmdb_ids") or []:
            if isinstance(extra, int):
                rejected.add(extra)
    return rejected


def apply_decision_patch(
    doc: Mapping[str, Any],
    patch: Mapping[str, Any],
    *,
    reviewed_by: str = "developer",
) -> dict[str, Any]:
    """Return a new decisions document with *patch* applied atomically (in memory)."""
    next_doc = deepcopy(dict(doc))
    if next_doc.get("schema_version") != SCHEMA_VERSION:
        next_doc["schema_version"] = SCHEMA_VERSION

    source_identity = dict(patch.get("source_identity") or {})
    decision_name = str(patch.get("decision") or "").strip()
    if decision_name not in DECISIONS:
        raise ValueError(f"unsupported decision: {decision_name!r}")

    tmdb_id = patch.get("tmdb_id")
    if decision_name == DECISION_CONFIRM:
        if not isinstance(tmdb_id, int) or tmdb_id < 1:
            raise ValueError("confirm requires positive integer tmdb_id")
    if decision_name == DECISION_REJECT_CANDIDATE:
        if not isinstance(tmdb_id, int) or tmdb_id < 1:
            raise ValueError("reject_candidate requires positive integer tmdb_id")

    key = source_identity_key(source_identity)
    # Deactivate prior active decisions for this source identity.
    for existing in next_doc.get("decisions") or []:
        if source_identity_key(existing.get("source_identity") or {}) == key:
            if existing.get("active", True):
                existing["active"] = False

    new_decision = {
        "decision_id": str(patch.get("decision_id") or f"dec_{uuid4().hex[:12]}"),
        "source_identity": {
            "source": source_identity.get("source"),
            "source_film_id": source_identity.get("source_film_id"),
            "showtime_film_key": source_identity.get("showtime_film_key"),
        },
        "decision": decision_name,
        "tmdb_id": tmdb_id if isinstance(tmdb_id, int) else None,
        "rejected_tmdb_ids": list(patch.get("rejected_tmdb_ids") or []),
        "reason": patch.get("reason") or "manual-review",
        "notes": patch.get("notes"),
        "reviewed_at": str(patch.get("reviewed_at") or _now_iso()),
        "reviewed_by": str(patch.get("reviewed_by") or reviewed_by),
        "supersedes_decision_id": patch.get("supersedes_decision_id"),
        "active": True,
    }
    if decision_name == DECISION_REJECT_CANDIDATE and new_decision["tmdb_id"]:
        ids = set(new_decision["rejected_tmdb_ids"])
        ids.add(new_decision["tmdb_id"])
        new_decision["rejected_tmdb_ids"] = sorted(ids)

    decisions = list(next_doc.get("decisions") or [])
    decisions.append(new_decision)
    next_doc["decisions"] = _stable_sort_decisions(decisions)
    next_doc["updated_at"] = _now_iso()
    validate_decisions_document(next_doc)
    return next_doc


def _validate_semantics(doc: Mapping[str, Any]) -> None:
    seen_ids: set[str] = set()
    active_keys: dict[str, str] = {}
    for decision in doc.get("decisions") or []:
        did = decision.get("decision_id")
        if not did or did in seen_ids:
            raise ValueError(f"duplicate or missing decision_id: {did!r}")
        seen_ids.add(did)
        name = decision.get("decision")
        if name not in DECISIONS:
            raise ValueError(f"invalid decision: {name!r}")
        if name == DECISION_CONFIRM:
            tid = decision.get("tmdb_id")
            if not isinstance(tid, int) or tid < 1:
                raise ValueError(f"confirm decision {did} missing tmdb_id")
        if name in {DECISION_UNMAPPED, DECISION_NON_FILM, DECISION_DEFER}:
            # Distinct states — confirm they are not overloaded.
            pass
        if decision.get("active", True):
            key = source_identity_key(decision.get("source_identity") or {})
            if key in active_keys:
                raise ValueError(
                    f"multiple active decisions for {key}: "
                    f"{active_keys[key]} and {did}"
                )
            active_keys[key] = did


def _stable_sort_decisions(decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        decisions,
        key=lambda d: (
            source_identity_key(d.get("source_identity") or {}),
            str(d.get("reviewed_at") or ""),
            str(d.get("decision_id") or ""),
        ),
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
