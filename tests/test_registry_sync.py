"""Tests for canonical -> public theater registry sync."""

from __future__ import annotations

import json

import pytest

from reel_seattle.registry_sync import sync_public_theaters_registry
from reel_seattle.validate import SchemaValidationError


def test_sync_creates_public_copy_when_missing(tmp_path, theaters_registry):
    canonical = tmp_path / "data" / "theaters.json"
    public = tmp_path / "public" / "data" / "theaters.json"
    payload = json.dumps(theaters_registry, indent=2) + "\n"
    canonical.parent.mkdir(parents=True)
    canonical.write_text(payload, encoding="utf-8")

    result = sync_public_theaters_registry(canonical, public)

    assert result.action == "updated"
    assert public.read_bytes() == canonical.read_bytes()
    assert canonical.read_bytes() == public.read_bytes()


def test_sync_updates_stale_public_copy(tmp_path, theaters_registry):
    canonical = tmp_path / "data" / "theaters.json"
    public = tmp_path / "public" / "data" / "theaters.json"
    canonical.parent.mkdir(parents=True)
    public.parent.mkdir(parents=True)

    canonical.write_text(json.dumps(theaters_registry, indent=2), encoding="utf-8")
    public.write_text('{"stale": true}', encoding="utf-8")
    canonical_bytes_before = canonical.read_bytes()

    result = sync_public_theaters_registry(canonical, public)

    assert result.action == "updated"
    assert public.read_bytes() == canonical_bytes_before
    assert canonical.read_bytes() == canonical_bytes_before


def test_sync_leaves_canonical_unchanged(tmp_path, theaters_registry):
    canonical = tmp_path / "data" / "theaters.json"
    public = tmp_path / "public" / "data" / "theaters.json"
    payload = json.dumps(theaters_registry)
    canonical.parent.mkdir(parents=True)
    canonical.write_text(payload, encoding="utf-8")
    before = canonical.read_bytes()

    sync_public_theaters_registry(canonical, public)

    assert canonical.read_bytes() == before


def test_sync_reports_unchanged_when_already_current(tmp_path, theaters_registry):
    canonical = tmp_path / "data" / "theaters.json"
    public = tmp_path / "public" / "data" / "theaters.json"
    payload = json.dumps(theaters_registry)
    canonical.parent.mkdir(parents=True)
    canonical.write_text(payload, encoding="utf-8")
    public.parent.mkdir(parents=True)
    public.write_bytes(canonical.read_bytes())

    result = sync_public_theaters_registry(canonical, public)

    assert result.action == "unchanged"


def test_sync_rejects_invalid_json(tmp_path):
    canonical = tmp_path / "data" / "theaters.json"
    public = tmp_path / "public" / "data" / "theaters.json"
    canonical.parent.mkdir(parents=True)
    canonical.write_text("{not json", encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid theater registry JSON"):
        sync_public_theaters_registry(canonical, public)

    assert not public.exists()


def test_sync_rejects_invalid_registry_schema(tmp_path, theaters_registry):
    canonical = tmp_path / "data" / "theaters.json"
    public = tmp_path / "public" / "data" / "theaters.json"
    broken = dict(theaters_registry)
    del broken["updated_at"]
    canonical.parent.mkdir(parents=True)
    canonical.write_text(json.dumps(broken), encoding="utf-8")

    with pytest.raises(SchemaValidationError):
        sync_public_theaters_registry(canonical, public)

    assert not public.exists()


def test_sync_fails_when_canonical_missing(tmp_path):
    canonical = tmp_path / "data" / "theaters.json"
    public = tmp_path / "public" / "data" / "theaters.json"

    with pytest.raises(FileNotFoundError, match="Theater registry not found"):
        sync_public_theaters_registry(canonical, public)
