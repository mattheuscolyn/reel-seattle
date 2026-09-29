"""Daily source-inventory audit workflow regression."""

from __future__ import annotations

from pathlib import Path


def test_daily_workflow_refreshes_and_commits_source_inventory():
    text = Path(".github/workflows/daily_scraping.yml").read_text(encoding="utf-8")

    refresh_catalog = text.index("- name: Refresh AMC source catalog")
    refresh_inventory = text.index("- name: Refresh film identity source inventory")
    refresh_coming_soon = text.index("- name: Refresh Coming Soon")

    assert refresh_catalog < refresh_inventory < refresh_coming_soon
    assert "python scripts/inventory_film_identities.py" in text
    assert "git add data/audits/film_identity_source_inventory.json" in text
