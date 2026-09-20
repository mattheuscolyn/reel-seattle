"""Grand Illusion Option C mapping tests."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from reel_seattle.adapters.grand_illusion import fetch_grand_illusion_from_fixture_dir
from reel_seattle.ingestion.grand_illusion_mapping import (
    GI_PARTNER_THEATER_IDS,
    map_grand_illusion_contract_to_indie,
)
from reel_seattle.source_identity import source_film_id_from_raw, source_showtime_id_from_raw

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "prototypes" / "grand_illusion"


def test_mapping_multi_venue_and_identities():
    result = fetch_grand_illusion_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 9, 20),
        date(2026, 10, 31),
        scraped_at="2026-09-20T12:00:00-07:00",
        generated_at="2026-09-20T12:05:00-07:00",
    )
    assert result.restate_safe is True
    theaters = {
        (raw.attributes or {}).get("theater_id") for raw in result.records
    }
    assert theaters <= GI_PARTNER_THEATER_IDS
    assert "siff-film-center" in theaters
    assert "central-cinema" in theaters
    for raw in result.records:
        assert source_film_id_from_raw(raw)
        assert source_showtime_id_from_raw(raw)
        assert (raw.attributes or {}).get("presenters")
        assert "|" in str(source_showtime_id_from_raw(raw))


def test_mapping_rejects_non_partner_registry_theater():
    result = fetch_grand_illusion_from_fixture_dir(
        FIXTURE_DIR,
        date(2026, 9, 20),
        date(2026, 9, 20),
        scraped_at="2026-09-20T12:00:00-07:00",
        generated_at="2026-09-20T12:05:00-07:00",
    )
    contract = dict(result.contract)
    # amc-* is in the registry but not a GI partner allowlist venue.
    sample = dict(contract["showtimes"][0])
    sample["theater_id"] = "amc-pacific-place-11"
    sample["source_showtime_id"] = "x|amc-pacific-place-11|2026-09-20|12:00"
    contract["showtimes"] = list(contract.get("showtimes") or []) + [sample]
    mapped = map_grand_illusion_contract_to_indie(contract)
    assert mapped.restate_safe is False
    assert any(i.code == "unknown_theater_id" for i in mapped.rejected)
