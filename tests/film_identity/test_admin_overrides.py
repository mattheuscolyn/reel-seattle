"""Admin overlay decisions beat authored JSON and pause auto-match."""

from __future__ import annotations

from pathlib import Path

from reel_seattle.film_identity.decisions import (
    apply_decision_patch,
    empty_decisions_document,
    load_admin_override_decisions,
    resolve_active_decision,
)
from reel_seattle.film_identity.matcher import match_source_identity

from scripts.export_admin_film_identity_reviews import reviews_to_decisions_document

SOURCE = {
    "source": "siff",
    "source_film_id": "shorts-love",
    "showtime_film_key": "seattle-shorts",
}


def _identity(**overrides):
    return {
        **SOURCE,
        "source_title": "Seattle Shorts: Love & Loss",
        "normalized_title": "Seattle Shorts: Love & Loss",
        "eligibility": "eligible",
        "film_id_fallback": "source:siff:shorts-love",
        **overrides,
    }


def test_missing_admin_overlay_is_noop(tmp_path: Path):
    missing = tmp_path / "admin_match_overrides.json"
    doc = load_admin_override_decisions(missing)
    assert doc["decisions"] == []


def test_admin_overlay_wins_over_authored_confirm():
    authored = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-01T00:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": 111,
            "reviewed_at": "2026-08-01T00:00:00+00:00",
        },
    )
    admin = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T00:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": 999001,
            "reviewed_at": "2026-08-17T00:00:00+00:00",
            "reason": "admin-review",
        },
    )
    active = resolve_active_decision(SOURCE, authored, admin)
    assert active["tmdb_id"] == 999001

    result = match_source_identity(
        _identity(),
        client=None,
        decisions_doc=authored,
        admin_decisions_doc=admin,
    )
    assert result["match_status"] == "confirmed_manual"
    assert result["film_id"] == "tmdb:999001"
    assert result["match_method"] == "manual"


def test_admin_not_film_overrides_authored_confirm_and_is_preserved():
    authored = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-01T00:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": 111,
            "reviewed_at": "2026-08-01T00:00:00+00:00",
        },
    )
    admin = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T00:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "non_film",
            "reviewed_at": "2026-08-17T00:00:00+00:00",
        },
    )
    result = match_source_identity(
        _identity(),
        client=None,
        decisions_doc=authored,
        admin_decisions_doc=admin,
    )
    assert result["match_status"] == "non_film"
    assert result["tmdb_id"] is None
    assert result["film_id"] == "source:siff:shorts-love"


def test_multiple_shorts_pauses_auto_match_and_preserves_identity():
    admin = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T00:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "multiple_shorts",
            "reviewed_at": "2026-08-17T00:00:00+00:00",
        },
    )
    result = match_source_identity(
        _identity(),
        client=None,
        decisions_doc=empty_decisions_document(),
        admin_decisions_doc=admin,
    )
    assert result["match_status"] == "multiple_shorts"
    assert result["tmdb_id"] is None
    assert result["film_id"] == "source:siff:shorts-love"
    assert result["match_method"] == "manual"


def test_needs_follow_up_maps_to_defer_and_pauses_auto_match():
    overlay = reviews_to_decisions_document(
        [
            {
                "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "source": "siff",
                "source_film_id": "shorts-love",
                "showtime_film_key": "seattle-shorts",
                "decision": "needs_follow_up",
                "tmdb_id": None,
                "admin_note": "Need to verify with theater page",
                "reviewed_by": "admin-1",
                "reviewed_at": "2026-08-17T00:00:00+00:00",
                "active": True,
            }
        ]
    )
    active = [row for row in overlay["decisions"] if row.get("active")]
    assert len(active) == 1
    assert active[0]["decision"] == "defer"
    result = match_source_identity(
        _identity(),
        client=None,
        decisions_doc=empty_decisions_document(),
        admin_decisions_doc=overlay,
    )
    assert result["match_status"] == "deferred"
    assert result["tmdb_id"] is None


def test_export_maps_admin_decisions_without_deleting_rows():
    overlay = reviews_to_decisions_document(
        [
            {
                "id": "1",
                "source": "siff",
                "source_film_id": "music-1",
                "showtime_film_key": "music-night",
                "decision": "not_film",
                "admin_note": "Music event, not a movie",
                "reviewed_at": "2026-08-17T00:00:00+00:00",
                "active": True,
            },
            {
                "id": "2",
                "source": "siff",
                "source_film_id": "shorts-love",
                "showtime_film_key": "seattle-shorts",
                "decision": "multiple_shorts",
                "reviewed_at": "2026-08-17T01:00:00+00:00",
                "active": True,
            },
            {
                "id": "3",
                "source": "amc",
                "source_film_id": "72474",
                "showtime_film_key": "sinners",
                "decision": "matched",
                "tmdb_id": 12321,
                "reviewed_at": "2026-08-17T02:00:00+00:00",
                "active": True,
            },
        ]
    )
    by_key = {
        f"{row['source_identity']['source']}|id|{row['source_identity']['source_film_id']}": row
        for row in overlay["decisions"]
        if row.get("active")
    }
    assert by_key["siff|id|music-1"]["decision"] == "non_film"
    assert by_key["siff|id|shorts-love"]["decision"] == "multiple_shorts"
    assert by_key["amc|id|72474"]["decision"] == "confirm"
    assert by_key["amc|id|72474"]["tmdb_id"] == 12321
    assert len(overlay["decisions"]) == 3


def test_export_drops_stale_tmdb_id_for_non_match_decisions():
    overlay = reviews_to_decisions_document(
        [
            {
                "id": "stale",
                "source": "siff",
                "source_film_id": "music-1",
                "showtime_film_key": "music-night",
                "decision": "not_film",
                "tmdb_id": 424242,
                "reviewed_at": "2026-08-17T00:00:00+00:00",
                "active": True,
            }
        ]
    )
    active = [row for row in overlay["decisions"] if row.get("active")]
    assert len(active) == 1
    assert active[0]["decision"] == "non_film"
    assert active[0]["tmdb_id"] is None


def test_replacing_admin_match_does_not_keep_previous_tmdb():
    matched = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T00:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": 111,
            "reviewed_at": "2026-08-17T00:00:00+00:00",
        },
    )
    replaced = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T01:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": 222,
            "reviewed_at": "2026-08-17T01:00:00+00:00",
        },
    )
    cleared = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T02:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "non_film",
            "reviewed_at": "2026-08-17T02:00:00+00:00",
        },
    )
    restored = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T03:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "confirm",
            "tmdb_id": 333,
            "reviewed_at": "2026-08-17T03:00:00+00:00",
        },
    )
    follow = apply_decision_patch(
        empty_decisions_document(updated_at="2026-08-17T04:00:00+00:00"),
        {
            "source_identity": SOURCE,
            "decision": "defer",
            "reviewed_at": "2026-08-17T04:00:00+00:00",
        },
    )
    authored = matched
    assert match_source_identity(
        _identity(), client=None, decisions_doc=authored, admin_decisions_doc=replaced
    )["film_id"] == "tmdb:222"
    not_film = match_source_identity(
        _identity(), client=None, decisions_doc=authored, admin_decisions_doc=cleared
    )
    assert not_film["match_status"] == "non_film"
    assert not_film["tmdb_id"] is None
    assert match_source_identity(
        _identity(), client=None, decisions_doc=authored, admin_decisions_doc=restored
    )["film_id"] == "tmdb:333"
    deferred = match_source_identity(
        _identity(), client=None, decisions_doc=authored, admin_decisions_doc=follow
    )
    assert deferred["match_status"] == "deferred"
    assert deferred["tmdb_id"] is None

