"""Decision artifact semantics tests."""

from __future__ import annotations

import pytest

from reel_seattle.film_identity.decisions import (
    apply_decision_patch,
    empty_decisions_document,
    rejected_tmdb_ids_for,
    validate_decisions_document,
)
from reel_seattle.film_identity.matcher import match_source_identity


def test_manual_confirm_overrides_and_stable_validate():
    doc = empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00")
    doc = apply_decision_patch(
        doc,
        {
            "source_identity": {
                "source": "amc",
                "source_film_id": "72474",
                "showtime_film_key": "moana",
            },
            "decision": "confirm",
            "tmdb_id": 277355,
            "reason": "manual-review",
            "reviewed_at": "2026-07-27T01:00:00+00:00",
        },
    )
    validate_decisions_document(doc)
    result = match_source_identity(
        {
            "source": "amc",
            "source_film_id": "72474",
            "showtime_film_key": "moana",
            "source_title": "Moana",
            "normalized_title": "Moana",
            "eligibility": "eligible",
            "film_id_fallback": "source:amc:72474",
        },
        client=None,
        decisions_doc=doc,
    )
    assert result["match_status"] == "confirmed_manual"
    assert result["film_id"] == "tmdb:277355"


def test_reject_unmapped_non_film_defer():
    doc = empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00")
    source = {
        "source": "nwff",
        "source_film_id": "asco",
        "showtime_film_key": "asco",
    }
    doc = apply_decision_patch(
        doc,
        {
            "source_identity": source,
            "decision": "reject_candidate",
            "tmdb_id": 1,
            "reviewed_at": "2026-07-27T01:00:00+00:00",
        },
    )
    assert 1 in rejected_tmdb_ids_for(source, doc)

    for decision, status in (
        ("unmapped", "unmatched"),
        ("non_film", "non_film"),
        ("defer", "deferred"),
    ):
        doc2 = apply_decision_patch(
            empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00"),
            {
                "source_identity": source,
                "decision": decision,
                "reviewed_at": "2026-07-27T02:00:00+00:00",
            },
        )
        result = match_source_identity(
            {
                **source,
                "source_title": "Asco",
                "normalized_title": "Asco",
                "eligibility": "eligible",
                "film_id_fallback": "source:nwff:asco",
            },
            client=None,
            decisions_doc=doc2,
        )
        assert result["match_status"] == status


def test_duplicate_active_decisions_rejected_by_validator():
    doc = empty_decisions_document(updated_at="2026-07-27T00:00:00+00:00")
    doc["decisions"] = [
        {
            "decision_id": "a",
            "source_identity": {"source": "amc", "source_film_id": "1", "showtime_film_key": "x"},
            "decision": "defer",
            "tmdb_id": None,
            "rejected_tmdb_ids": [],
            "reason": "x",
            "notes": None,
            "reviewed_at": "2026-07-27T00:00:00+00:00",
            "reviewed_by": "developer",
            "supersedes_decision_id": None,
            "active": True,
        },
        {
            "decision_id": "b",
            "source_identity": {"source": "amc", "source_film_id": "1", "showtime_film_key": "x"},
            "decision": "defer",
            "tmdb_id": None,
            "rejected_tmdb_ids": [],
            "reason": "x",
            "notes": None,
            "reviewed_at": "2026-07-27T00:00:01+00:00",
            "reviewed_by": "developer",
            "supersedes_decision_id": None,
            "active": True,
        },
    ]
    with pytest.raises(ValueError, match="multiple active"):
        validate_decisions_document(doc)
