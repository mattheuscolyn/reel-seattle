"""Shared pytest fixtures for Reel Seattle."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
THEATERS_REGISTRY_PATH = PROJECT_ROOT / "data" / "theaters.json"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="session")
def project_root() -> Path:
    """Repository root directory."""
    return PROJECT_ROOT


@pytest.fixture(scope="session")
def fixtures_dir(project_root: Path) -> Path:
    """Root directory for test fixtures (HTML, JSON samples, etc.)."""
    return FIXTURES_DIR


@pytest.fixture(scope="session")
def theaters_registry_path(project_root: Path) -> Path:
    """Path to the canonical theater registry."""
    return project_root / "data" / "theaters.json"


@pytest.fixture(scope="session")
def theaters_registry(theaters_registry_path: Path) -> dict:
    """Parsed contents of data/theaters.json."""
    with theaters_registry_path.open(encoding="utf-8") as f:
        return json.load(f)
