"""Tests for the durable performance identity registry."""

import pytest

from reel_seattle.performance_identity.catalog import (
    PerformanceIdentityError,
    PerformanceIdentityRegistry,
    empty_registry,
    load_registry,
    save_registry,
    validate_registry,
)


def _row(performance_id: str, alias: str) -> dict:
    return {
        "performance_id": performance_id,
        "theater_id": "siff-film-center",
        "local_date": "2026-09-20",
        "local_time": "18:30",
        "film_id": None,
        "parent_film_key": "the-hole",
        "film_keys": ["parent:the-hole"],
        "aliases": [alias],
        "first_seen_at": "2026-09-20",
        "last_seen_at": "2026-09-20",
    }


def test_registry_roundtrip_save_and_load(tmp_path):
    path = tmp_path / "performance_identity.json"
    registry = PerformanceIdentityRegistry(empty_registry(generated_at="2026-09-20T12:00:00"))
    registry.upsert(
        performance_id="id:abc12345",
        theater_id="siff-film-center",
        local_date="2026-09-20",
        local_time="18:30",
        aliases=["public_showtime:abc12345"],
        parent_film_key="the-hole",
        film_keys={"parent:the-hole"},
        seen_on="2026-09-20",
    )

    save_registry(registry.payload, path)

    assert load_registry(path) == registry.payload


def test_alias_collision_rejected_during_validation():
    payload = empty_registry()
    payload["performances"] = [
        _row("id:abc12345", "grand_illusion:occ-1"),
        _row("id:def67890", "grand_illusion:occ-1"),
    ]

    with pytest.raises(PerformanceIdentityError, match="alias collision"):
        validate_registry(payload)


def test_registry_refuses_alias_rebind_to_different_performance_id():
    registry = PerformanceIdentityRegistry()
    kwargs = {
        "theater_id": "siff-film-center",
        "local_date": "2026-09-20",
        "local_time": "18:30",
        "aliases": ["grand_illusion:occ-1"],
        "film_keys": {"parent:the-hole"},
    }
    registry.upsert(performance_id="id:abc12345", **kwargs)

    with pytest.raises(PerformanceIdentityError, match="refusing to rebind"):
        registry.upsert(performance_id="id:def67890", **kwargs)
