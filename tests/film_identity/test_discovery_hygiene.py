"""Tests for discovery/hygiene tranche: Local Sightings prefix + mojibake repair."""

from __future__ import annotations

from reel_seattle.film_identity.presentation import extract_match_title
from reel_seattle.film_identity.title_rules import (
    apply_program_series_prefix,
    clear_title_rules_cache,
)
from reel_seattle.normalize.encoding import repair_utf8_mojibake


def setup_function() -> None:
    clear_title_rules_cache()


def test_local_sightings_year_pattern_strips_for_nwff_search_only():
    extracted = extract_match_title(
        "Local Sightings 2026 – Assets & Liabilities",
        source="nwff",
    )
    assert extracted.base_title == "Assets & Liabilities"
    assert extracted.program_series == "Local Sightings 2026"
    assert extracted.original_title == "Local Sightings 2026 – Assets & Liabilities"
    assert any(rule.startswith("program_series:local-sightings") for rule in extracted.applied_rules)

    # Not hard-coded to 2026.
    extracted_2027 = extract_match_title(
        "Local Sightings 2027 – Beau Ideal",
        source="nwff",
    )
    assert extracted_2027.base_title == "Beau Ideal"
    assert extracted_2027.program_series == "Local Sightings 2027"


def test_local_sightings_rule_is_source_scoped():
    hit = apply_program_series_prefix(
        "Local Sightings 2026 – Sugarfly",
        source="amc",
    )
    assert hit is None
    extracted = extract_match_title(
        "Local Sightings 2026 – Sugarfly",
        source="amc",
    )
    assert extracted.base_title == "Local Sightings 2026 – Sugarfly"


def test_local_sightings_does_not_generic_dash_strip():
    extracted = extract_match_title(
        "Life in The Sound – Director Cut",
        source="nwff",
    )
    assert extracted.base_title == "Life in The Sound – Director Cut"


def test_repair_utf8_mojibake_beacon_titles():
    assert repair_utf8_mojibake("SAMBA TRAORÃ\x89") == "SAMBA TRAORÉ"
    assert repair_utf8_mojibake("VHS Ã\x9cBER ALLES PRESENTS") == "VHS ÜBER ALLES PRESENTS"
    # Already-correct Unicode is left alone.
    assert repair_utf8_mojibake("SAMBA TRAORÉ") == "SAMBA TRAORÉ"
    assert repair_utf8_mojibake("VHS ÜBER ALLES PRESENTS") == "VHS ÜBER ALLES PRESENTS"


def test_extract_match_title_repairs_mojibake_before_normalize():
    extracted = extract_match_title("SAMBA TRAORÃ\x89", source="beacon")
    assert extracted.base_title == "Samba Traoré"
    assert "Ã" not in (extracted.base_title or "")
