"""Tests for leaving_soon_current.json emission (PR E)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from reel_seattle.emit.leaving_soon import (
    RULE_NAME,
    build_leaving_soon_current,
    is_event_like_title,
    passes_visible_dates_le_1,
    write_leaving_soon_current,
)
from reel_seattle.validate import validate_leaving_soon_current, validate_theaters_registry_file

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "emit"


@pytest.fixture
def leaving_soon_current_artifact() -> dict:
    path = FIXTURES / "leaving_soon_showtimes_current.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def theaters_registry(project_root: Path) -> dict:
    return validate_theaters_registry_file(project_root / "data" / "theaters.json")


def test_passes_visible_dates_le_1():
    assert passes_visible_dates_le_1(1) is True
    assert passes_visible_dates_le_1(0) is True
    assert passes_visible_dates_le_1(2) is False


def test_is_event_like_title():
    assert is_event_like_title("Met Opera: La Traviata") is True
    assert is_event_like_title("Sinners") is False


def test_build_leaving_soon_current_flags_single_date_only(
    leaving_soon_current_artifact, theaters_registry
):
    artifact = build_leaving_soon_current(
        leaving_soon_current_artifact,
        registry=theaters_registry,
    )

    assert artifact["schema_version"] == "1.0.0"
    assert artifact["source"] == "amc"
    assert artifact["method"]["name"] == RULE_NAME
    assert "not a guarantee" in artifact["method"]["evaluation_note"].lower()

    film_keys = {item["film_key"] for item in artifact["items"]}
    assert film_keys == {"sinners"}
    assert artifact["stats"]["candidate_film_count"] == 3
    assert artifact["stats"]["flagged_film_count"] == 1

    sinners = artifact["items"][0]
    assert sinners["risk_level"] == "high"
    assert sinners["visible_show_date_count"] == 1
    assert sinners["has_primetime"] is True
    assert sinners["has_weekend_show"] is True
    assert sinners["poster_url"] == "https://example.com/sinners.jpg"
    assert sinners["runtime_min"] == 137

    validate_leaving_soon_current(artifact)


def test_build_leaving_soon_current_can_include_event_like(
    leaving_soon_current_artifact, theaters_registry
):
    artifact = build_leaving_soon_current(
        leaving_soon_current_artifact,
        registry=theaters_registry,
        exclude_event_like=False,
    )
    film_keys = {item["film_key"] for item in artifact["items"]}
    assert film_keys == {"sinners", "opera-event"}


def test_write_leaving_soon_current(tmp_path, leaving_soon_current_artifact, theaters_registry):
    output_path = tmp_path / "leaving_soon_current.json"
    artifact = write_leaving_soon_current(
        leaving_soon_current_artifact,
        registry=theaters_registry,
        output_path=output_path,
    )
    assert output_path.is_file()
    on_disk = json.loads(output_path.read_text(encoding="utf-8"))
    assert on_disk == artifact
    validate_leaving_soon_current(artifact)
