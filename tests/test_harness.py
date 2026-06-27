"""Verify the test harness and shared fixtures (PR 2 scaffold)."""


def test_theaters_registry_loads(theaters_registry: dict) -> None:
    assert theaters_registry["schema_version"]
    assert len(theaters_registry["theaters"]) >= 1


def test_fixtures_dir_exists(fixtures_dir) -> None:
    assert fixtures_dir.name == "fixtures"
