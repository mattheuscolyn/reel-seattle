"""Tests for NWFF registry support and contract→indie mapping (P-16F)."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest

from reel_seattle.ingestion.independent_contract import (
    assert_valid_independent_source_result,
    serialize_independent_source_result,
)
from reel_seattle.ingestion.nwff_mapping import (
    MAPPING_STATUS_FAILURE,
    MAPPING_STATUS_SUCCESS,
    MAPPING_STATUS_SUCCESS_WITH_WARNINGS,
    MAPPING_STATUS_UNSAFE,
    NWFF_THEATER_ID,
    NwffMappingError,
    map_nwff_contract_to_indie,
    normalize_location_label,
    resolve_nwff_main_venue,
    serialize_nwff_mapping_log,
)
from reel_seattle.normalize.theaters import build_theater_index, resolve_theater
from reel_seattle.source_identity import source_film_id_from_raw
from reel_seattle.validate import SchemaValidationError, validate_theaters_registry
from tests.ingestion.nwff_mapping_fixtures import (
    base_result,
    clone,
    program,
    safe_success,
    shorts_program,
    showtime,
)

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "ingestion" / "nwff_mapping"
THEATER_IDS = {NWFF_THEATER_ID, "the-beacon", "siff-cinema-uptown"}


@pytest.fixture(scope="module")
def registry(theaters_registry):
    return theaters_registry


def test_nwff_registry_entry_validates(registry):
    validate_theaters_registry(registry)
    entry = next(t for t in registry["theaters"] if t["id"] == NWFF_THEATER_ID)
    assert entry["source"] == "nwff"
    assert entry["enabled"] is True
    assert entry["type"] == "indie"
    assert "NWFF" in entry["aliases"]
    assert "Northwest Film Forum" in entry["aliases"]


def test_nwff_source_accepted_unknown_rejected(registry):
    validate_theaters_registry(registry)
    broken = deepcopy(registry)
    broken["theaters"][0]["source"] = "not-a-source"
    with pytest.raises(SchemaValidationError):
        validate_theaters_registry(broken)


def test_existing_sources_remain_valid(registry):
    sources = {t["source"] for t in registry["theaters"]}
    assert {"amc", "siff", "beacon", "nwff"} <= sources
    validate_theaters_registry(registry)


def test_nwff_aliases_resolve(registry):
    index = build_theater_index(registry)
    for label in ("Northwest Film Forum", "NWFF", "  nwff  ", "northwest  film forum"):
        resolved = resolve_theater(label, index)
        assert resolved is not None
        assert resolved.theater_id == NWFF_THEATER_ID


def test_main_venue_helpers():
    assert resolve_nwff_main_venue("Northwest Film Forum")
    assert resolve_nwff_main_venue("NWFF")
    assert resolve_nwff_main_venue("  northwest   film forum ")
    assert not resolve_nwff_main_venue("Central Library")
    assert not resolve_nwff_main_venue("")
    assert not resolve_nwff_main_venue(None)
    assert normalize_location_label("  A  B ") == "a b"


def test_valid_result_maps_success():
    mapped = map_nwff_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.mapping_status == MAPPING_STATUS_SUCCESS_WITH_WARNINGS or mapped.mapping_status == MAPPING_STATUS_SUCCESS
    # workshop reject carried; may be success with no mapping warnings
    assert mapped.restate_safe is True
    assert len(mapped.records) == 3
    assert all(source_film_id_from_raw(r) == "asco-without-permission" for r in mapped.records)
    assert all(r.title_raw.startswith("Staff Selects") for r in mapped.records)
    assert all(r.theater_name_raw == "Northwest Film Forum" for r in mapped.records)


def test_slug_identity_survives_title_change():
    result = safe_success()
    result["showtimes"][0]["source_title"] = "Completely Different Display Title"
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert source_film_id_from_raw(mapped.records[0]) == "asco-without-permission"
    assert mapped.records[0].title_raw == "Completely Different Display Title"
    assert mapped.records[0].attributes["source_program_id"] == "asco-without-permission"


def test_wrong_source_fails():
    result = safe_success()
    result["source"] = "beacon"
    # Contract validation may fail first for theater ids / source consistency
    with pytest.raises(NwffMappingError):
        map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS | {"the-beacon"})


def test_wrong_version_fails():
    result = safe_success()
    result["contract_version"] = "0.9.0"
    with pytest.raises(NwffMappingError):
        map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)


def test_invalid_result_fails_before_mapping():
    with pytest.raises(NwffMappingError):
        map_nwff_contract_to_indie({"source": "nwff"}, theater_ids=THEATER_IDS)


def test_unsafe_contract_remains_unsafe():
    result = safe_success()
    result["status"] = "partial_failure"
    result["restate_safe"] = False
    result["inspected_window"]["complete"] = False
    result["structural_validation"]["passed"] = False
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.mapping_status == MAPPING_STATUS_UNSAFE


def test_exact_duplicate_deduplicates():
    result = base_result()
    result["programs"] = [program()]
    row = showtime(ticket_url="https://nwfilmforum.eventive.org/tickets/same")
    result["showtimes"] = [row, clone(row)]
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert len(mapped.records) == 1
    assert any(w.code == "exact_duplicate_deduped" for w in mapped.warnings)
    assert mapped.restate_safe is True


def test_ticket_url_distinguishes_collision():
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [
        showtime(ticket_url="https://nwfilmforum.eventive.org/tickets/a", start_iso="2026-07-19T19:00:00"),
        showtime(ticket_url="https://nwfilmforum.eventive.org/tickets/b", start_iso="2026-07-19T19:00:01"),
    ]
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert len(mapped.records) == 2
    assert mapped.restate_safe is True
    assert any(w.code == "identity_collision_distinguished" for w in mapped.warnings)
    tickets = {r.ticket_url_raw for r in mapped.records}
    assert tickets == {
        "https://nwfilmforum.eventive.org/tickets/a",
        "https://nwfilmforum.eventive.org/tickets/b",
    }


def test_unresolved_collision_makes_unsafe():
    result = base_result()
    result["programs"] = [program()]
    a = showtime(ticket_url=None, start_iso=None)
    b = showtime(ticket_url=None, start_iso=None)
    a["raw"].pop("start_iso", None)
    b["raw"].pop("start_iso", None)
    a["raw"].pop("occurrence_discriminator", None)
    b["raw"].pop("occurrence_discriminator", None)
    result["showtimes"] = [a, b]
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.mapping_status == MAPPING_STATUS_UNSAFE
    assert any(r.code == "unresolved_identity_collision" for r in mapped.rejected)
    assert mapped.records == []


def test_offsite_and_missing_and_online_reject():
    for location, code in [
        ("Central Library", "unknown_location"),
        (None, "missing_location"),
        ("Online screening", "online_or_virtual_location"),
    ]:
        result = base_result()
        result["programs"] = [program()]
        st = showtime()
        if location is None:
            st["raw"].pop("location_name", None)
        else:
            st["raw"]["location_name"] = location
        result["showtimes"] = [st]
        mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
        assert mapped.restate_safe is False
        assert any(r.code == code and r.affects_completeness for r in mapped.rejected)
        assert mapped.records == []


def test_nwff_alias_location_accepted():
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [showtime(location_name="NWFF")]
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert len(mapped.records) == 1
    assert mapped.restate_safe is True


def test_unknown_theater_id_rejects():
    result = base_result()
    result["programs"] = [program()]
    # Use a planned ID that validates in contract fixtures but is wrong for NWFF policy
    st = showtime(theater_id="central-cinema")
    result["showtimes"] = [st]
    mapped = map_nwff_contract_to_indie(
        result,
        theater_ids=THEATER_IDS | {"central-cinema"},
    )
    assert mapped.restate_safe is False
    assert any(r.code == "unknown_theater_id" for r in mapped.rejected)


def test_workshop_reject_does_not_unsafer_alone():
    mapped = map_nwff_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert any(r.code == "non_film_category" and not r.affects_completeness for r in mapped.rejected)
    assert mapped.restate_safe is True


def test_runtime_and_year_mapping_conservative():
    mapped = map_nwff_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.records[0].runtime_raw == "90"
    assert mapped.records[0].attributes["release_year"] == 2024

    nullish = shorts_program()
    mapped2 = map_nwff_contract_to_indie(nullish, theater_ids=THEATER_IDS)
    assert mapped2.records[0].runtime_raw is None
    assert "release_year" not in (mapped2.records[0].attributes or {})


def test_no_year_inferred_from_scrape_date():
    result = shorts_program()
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert "release_year" not in (mapped.records[0].attributes or {})


def test_ticket_and_urls_preserved():
    mapped = map_nwff_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    with_ticket = next(r for r in mapped.records if r.ticket_url_raw)
    assert "eventive" in with_ticket.ticket_url_raw
    assert with_ticket.source_film_url.endswith("/asco-without-permission/")
    assert with_ticket.attributes["program_page_ticket_url"]
    assert with_ticket.attributes["calendar_ticket_url"] == with_ticket.ticket_url_raw


def test_program_title_preserved_in_contract_and_attributes():
    mapped = map_nwff_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.contract["programs"][0]["source_title"] == "ASCO: Without Permission"
    assert mapped.records[0].attributes["program_page_title"] == "ASCO: Without Permission"
    assert mapped.records[0].title_raw.startswith("Staff Selects")


def test_log_envelope_contract_plus_records_deterministic():
    mapped = map_nwff_contract_to_indie(
        safe_success(),
        theater_ids=THEATER_IDS,
        generated_at="2026-07-18T12:00:00-07:00",
    )
    envelope = mapped.log_envelope
    assert envelope["source"] == "nwff"
    assert envelope["independent_source_result"]["contract_version"] == "1.0.0"
    assert envelope["mapping"]["restate_safe"] is True
    assert len(envelope["records"]) == 3
    text = serialize_nwff_mapping_log(envelope)
    assert text == serialize_nwff_mapping_log(json.loads(text))
    assert "<html" not in text.casefold()
    assert "restate_safe" in envelope["stats"]


def test_mapping_cannot_upgrade_unsafe_contract():
    result = safe_success()
    result["status"] = "structural_failure"
    result["restate_safe"] = False
    result["structural_validation"]["passed"] = False
    result["inspected_window"]["complete"] = False
    result["showtimes"] = []
    result["programs"] = []
    mapped = map_nwff_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False


def test_fallback_components_preserved():
    mapped = map_nwff_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    attrs = mapped.records[0].attributes
    assert attrs["fallback_identity"] == "composite_program_theater_datetime"
    assert attrs["theater_id"] == NWFF_THEATER_ID
    assert attrs["local_date"]
    assert attrs["local_time"]
    assert mapped.records[0].source_showtime_id is None


def test_cli_offline(tmp_path, monkeypatch, project_root):
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    input_path = FIXTURE_DIR / "safe_success.json"
    input_path.write_text(serialize_independent_source_result(safe_success()), encoding="utf-8")
    out = tmp_path / "nwff_log.json"

    calls: list[str] = []

    def blocked(url, *args, **kwargs):  # noqa: ANN001
        calls.append(str(url))
        raise AssertionError("network forbidden")

    monkeypatch.setattr("urllib.request.urlopen", blocked)
    from scripts.map_nwff_contract_to_indie import main

    code = main(["--input", str(input_path), "--output", str(out), "--registry", str(project_root / "data" / "theaters.json")])
    assert code == 0
    assert calls == []
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["source"] == "nwff"
    assert payload["records"]


def test_public_and_canonical_registry_match(project_root):
    canonical = (project_root / "data" / "theaters.json").read_bytes()
    public = (project_root / "public" / "data" / "theaters.json").read_bytes()
    assert canonical == public
