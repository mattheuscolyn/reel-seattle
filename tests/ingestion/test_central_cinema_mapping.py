"""Tests for Central Cinema registry support and contract→indie mapping (P-17C)."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest

from reel_seattle.adapters.indie_legacy import raw_showtime_to_legacy_row
from reel_seattle.adapters.scrape_log import load_scrape_daily_log_payload
from reel_seattle.ingestion.central_cinema_mapping import (
    CENTRAL_THEATER_ID,
    MAPPING_STATUS_SUCCESS,
    MAPPING_STATUS_SUCCESS_WITH_WARNINGS,
    MAPPING_STATUS_UNSAFE,
    CentralCinemaMappingError,
    canonicalize_central_url,
    map_central_cinema_contract_to_indie,
    parse_checkout_url,
    parse_movie_url,
    serialize_central_cinema_mapping_log,
    site_scoped_venue_ok,
)
from reel_seattle.ingestion.independent_contract import serialize_independent_source_result
from reel_seattle.normalize.theaters import build_theater_index, resolve_theater
from reel_seattle.normalize.times import parse_time
from reel_seattle.source_identity import source_film_id_from_raw, source_showtime_id_from_raw
from reel_seattle.validate import SchemaValidationError, validate_theaters_registry
from tests.ingestion.central_cinema_mapping_fixtures import (
    base_result,
    clone,
    multi_program,
    program,
    safe_success,
    showtime,
)

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "ingestion" / "central_cinema_mapping"
CONTRACT_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "ingestion"
    / "independent_contract"
    / "central_success.json"
)
THEATER_IDS = {CENTRAL_THEATER_ID, "the-beacon", "northwest-film-forum", "siff-cinema-uptown"}


@pytest.fixture(scope="module")
def registry(theaters_registry):
    return theaters_registry


# --- Registry / schema ---


def test_central_registry_entry_validates(registry):
    validate_theaters_registry(registry)
    entry = next(t for t in registry["theaters"] if t["id"] == CENTRAL_THEATER_ID)
    assert entry["source"] == "central_cinema"
    assert entry["enabled"] is True
    assert entry["type"] == "indie"
    assert entry["aliases"] == ["Central Cinema"]
    assert entry["neighborhood"] == "Central District"
    assert "screens" not in entry
    assert "address" not in entry


def test_central_cinema_source_accepted_unknown_rejected(registry):
    """Theater schema enum accepts central_cinema; unknown sources remain invalid."""
    validate_theaters_registry(registry)
    broken = deepcopy(registry)
    broken["theaters"][0]["source"] = "not-a-source"
    with pytest.raises(SchemaValidationError):
        validate_theaters_registry(broken)


def test_existing_sources_remain_valid(registry):
    sources = {t["source"] for t in registry["theaters"]}
    assert {"amc", "siff", "beacon", "nwff", "central_cinema"} <= sources
    validate_theaters_registry(registry)


def test_central_alias_resolves(registry):
    index = build_theater_index(registry)
    resolved = resolve_theater("Central Cinema", index)
    assert resolved is not None
    assert resolved.theater_id == CENTRAL_THEATER_ID


def test_no_screen_or_offsite_entries(registry):
    centralish = [t for t in registry["theaters"] if "central" in t["id"]]
    assert len(centralish) == 1
    assert centralish[0]["id"] == CENTRAL_THEATER_ID


def test_theater_snapshot_schema_accepts_central_source(project_root):
    """Embedded theater_snapshot source enum includes central_cinema for registry sync.

    Showtime-record and sources_included enums intentionally omit central_cinema until
    production showtimes are enabled (P-17E).
    """
    schema = json.loads(
        (project_root / "schema" / "showtimes_current" / "v1.0.0.json").read_text(encoding="utf-8")
    )
    snapshot_enum = schema["$defs"]["theater_snapshot"]["properties"]["source"]["enum"]
    assert "central_cinema" in snapshot_enum
    assert "central_cinema" not in schema["properties"]["sources_included"]["items"]["enum"]
    showtime_enum = schema["$defs"]["showtime_record"]["properties"]["source"]["enum"]
    assert "central_cinema" not in showtime_enum


def test_public_and_canonical_registry_match(project_root):
    canonical = (project_root / "data" / "theaters.json").read_bytes()
    public = (project_root / "public" / "data" / "theaters.json").read_bytes()
    assert canonical == public


# --- Preconditions ---


def test_valid_result_maps_success():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.mapping_status in {MAPPING_STATUS_SUCCESS, MAPPING_STATUS_SUCCESS_WITH_WARNINGS}
    assert mapped.restate_safe is True
    assert len(mapped.records) == 2
    assert all(source_film_id_from_raw(r) == "faceslashoff" for r in mapped.records)
    assert all(r.theater_name_raw == "Central Cinema" for r in mapped.records)


def test_contract_fixture_maps():
    payload = json.loads(CONTRACT_FIXTURE.read_text(encoding="utf-8"))
    mapped = map_central_cinema_contract_to_indie(payload, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is True
    assert len(mapped.records) == 1
    assert source_showtime_id_from_raw(mapped.records[0]) == "3387540"


def test_wrong_source_fails():
    result = safe_success()
    result["source"] = "nwff"
    with pytest.raises(CentralCinemaMappingError):
        map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)


def test_wrong_version_fails():
    result = safe_success()
    result["contract_version"] = "0.9.0"
    with pytest.raises(CentralCinemaMappingError):
        map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)


def test_invalid_result_fails_before_emission():
    with pytest.raises(CentralCinemaMappingError):
        map_central_cinema_contract_to_indie({"source": "central_cinema"}, theater_ids=THEATER_IDS)


def test_unsafe_contract_cannot_become_safe():
    result = safe_success()
    result["status"] = "partial_failure"
    result["restate_safe"] = False
    result["inspected_window"]["complete"] = False
    result["structural_validation"]["passed"] = False
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.mapping_status == MAPPING_STATUS_UNSAFE


# --- Program identity ---


def test_slug_maps_to_source_film_id():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert source_film_id_from_raw(mapped.records[0]) == "faceslashoff"
    assert mapped.records[0].attributes["source_program_id"] == "faceslashoff"
    assert mapped.records[0].source_film_url.endswith("/movie/faceslashoff/")


def test_title_change_does_not_alter_program_identity():
    result = safe_success()
    result["showtimes"][0]["source_title"] = "FACE / OFF (Special Presentation)"
    result["showtimes"][0]["raw"]["title_differs_from_program"] = True
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert source_film_id_from_raw(mapped.records[0]) == "faceslashoff"
    assert mapped.records[0].title_raw == "FACE / OFF (Special Presentation)"


def test_distinct_slugs_remain_distinct():
    mapped = map_central_cinema_contract_to_indie(multi_program(), theater_ids=THEATER_IDS)
    ids = {source_film_id_from_raw(r) for r in mapped.records}
    assert ids == {"faceslashoff", "the-rock"}


def test_similar_titles_distinct_slugs():
    result = base_result()
    result["programs"] = [
        program(slug="face-off", title="Face Off"),
        program(slug="faceslashoff", title="Face/Off"),
    ]
    result["showtimes"] = [
        showtime(slug="face-off", showing_id="1", title="Face Off"),
        showtime(slug="faceslashoff", showing_id="2", title="Face/Off"),
    ]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert {source_film_id_from_raw(r) for r in mapped.records} == {"face-off", "faceslashoff"}


# --- Showtime identity ---


def test_numeric_showing_id_preserved_and_recoverable():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    ids = sorted(source_showtime_id_from_raw(r) for r in mapped.records)
    assert ids == ["3387540", "3387541"]
    assert all(r.source_showtime_id for r in mapped.records)
    assert all(r.attributes["source_showtime_id"] == r.source_showtime_id for r in mapped.records)


def test_missing_showing_id_unsafe():
    result = base_result()
    result["programs"] = [program()]
    st = showtime(showing_id="3387540")
    st["source_showtime_id"] = None
    st["ticket_url"] = "https://www.central-cinema.com/checkout/showing/faceslashoff/3387540"
    result["showtimes"] = [st]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.records == []
    assert any(r.code == "missing_or_malformed_showing_id" for r in mapped.rejected)


def test_malformed_showing_id_unsafe():
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [showtime(showing_id="abc")]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.records == []
    assert any(r.code == "missing_or_malformed_showing_id" for r in mapped.rejected)


def test_checkout_url_id_mismatch_unsafe():
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [
        showtime(
            showing_id="3387540",
            ticket_url="https://www.central-cinema.com/checkout/showing/faceslashoff/9999999",
        )
    ]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.records == []
    assert any(r.code == "checkout_url_id_mismatch" for r in mapped.rejected)


def test_exact_duplicate_deduplicates():
    result = base_result()
    result["programs"] = [program()]
    row = showtime(showing_id="3387540")
    result["showtimes"] = [row, clone(row)]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert len(mapped.records) == 1
    assert any(w.code == "exact_duplicate_deduped" for w in mapped.warnings)
    assert mapped.restate_safe is True


def test_conflicting_showing_id_unsafe_emits_neither():
    """Conflicting duplicate IDs fail validation before emission (no silent choice)."""
    result = base_result()
    result["programs"] = [program(), program(slug="the-rock", title="The Rock")]
    a = showtime(showing_id="3387540", slug="faceslashoff", title="Face/Off")
    b = showtime(showing_id="3387540", slug="the-rock", title="The Rock")
    b["ticket_url"] = "https://www.central-cinema.com/checkout/showing/the-rock/3387540"
    result["showtimes"] = [a, b]
    with pytest.raises(CentralCinemaMappingError, match="conflicting_duplicate_showtime_id"):
        map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)


def test_mapper_level_ticket_conflict_for_same_showing_id():
    """Trailing-slash ticket variants canonicalize and exact-dedupe."""
    result = base_result()
    result["programs"] = [program()]
    a = showtime(showing_id="3387540")
    b = deepcopy(a)
    b["ticket_url"] = "https://www.central-cinema.com/checkout/showing/faceslashoff/3387540/"
    result["showtimes"] = [a, b]
    assert len(result["showtimes"]) == 2
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert len(mapped.contract["showtimes"]) == 2
    assert len(mapped.records) == 1
    assert mapped.restate_safe is True
    assert any(w.code == "exact_duplicate_deduped" for w in mapped.warnings)


def test_same_datetime_distinct_ids_retained():
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [
        showtime(showing_id="111", local_time="19:00"),
        showtime(showing_id="222", local_time="19:00"),
    ]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert len(mapped.records) == 2
    assert {source_showtime_id_from_raw(r) for r in mapped.records} == {"111", "222"}
    assert mapped.restate_safe is True


def test_no_composite_fallback_generated():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    for record in mapped.records:
        assert record.attributes.get("showtime_identity") == "source_showing_id"
        assert "fallback_identity" not in (record.attributes or {})
        assert source_showtime_id_from_raw(record).isdigit()


# --- Venue ---


def test_site_scoped_venue_proof_resolves():
    ok, code = site_scoped_venue_ok(
        program_url="https://central-cinema.com/movie/faceslashoff/",
        ticket_url="https://www.central-cinema.com/checkout/showing/faceslashoff/3387540",
        program_slug="faceslashoff",
        structural_passed=True,
        venue_evidence=None,
    )
    assert ok is True
    assert code is None
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert all(r.attributes["venue_proof"] == "canonical_central_site_page" for r in mapped.records)


def test_www_and_non_www_hosts():
    assert canonicalize_central_url("https://www.central-cinema.com/movie/x/")
    assert canonicalize_central_url("https://central-cinema.com/movie/x/")
    _, slug = parse_movie_url("https://www.central-cinema.com/movie/faceslashoff/")
    assert slug == "faceslashoff"
    ticket, tslug, tid = parse_checkout_url(
        "https://central-cinema.com/checkout/showing/faceslashoff/1"
    )
    assert ticket and tslug == "faceslashoff" and tid == "1"

    result = base_result()
    result["programs"] = [program(host="www.central-cinema.com")]
    result["showtimes"] = [
        showtime(host="central-cinema.com", program_host="www.central-cinema.com")
    ]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is True
    assert len(mapped.records) == 1


def test_external_host_rejects():
    assert canonicalize_central_url("https://evil.example/movie/faceslashoff/") is None
    result = base_result()
    result["programs"] = [program()]
    st = showtime()
    st["ticket_url"] = "https://evil.example/checkout/showing/faceslashoff/3387540"
    result["showtimes"] = [st]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.records == []


def test_offsite_virtual_ambiguous_venue_reject():
    for location, code in [
        ("Grand Illusion", "offsite_or_partner_location"),
        ("Online screening", "online_or_virtual_location"),
        ("TBA", "ambiguous_venue"),
        ("Partner venue", "offsite_or_partner_location"),
        ("SIFF Cinema Uptown", "unknown_location"),
    ]:
        result = base_result()
        result["programs"] = [program()]
        result["showtimes"] = [showtime(location_name=location)]
        mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
        assert mapped.restate_safe is False
        assert any(r.code == code and r.affects_completeness for r in mapped.rejected)
        assert mapped.records == []


def test_no_generic_missing_location_default():
    """Acceptance requires canonical site/page proof, not a silent Central default."""
    ok, code = site_scoped_venue_ok(
        program_url="https://central-cinema.com/somewhere-else/",
        ticket_url="https://www.central-cinema.com/checkout/showing/faceslashoff/1",
        program_slug="faceslashoff",
        structural_passed=True,
        venue_evidence=None,
    )
    assert ok is False
    assert code == "invalid_program_url"


def test_venue_rejection_affects_safety():
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [showtime(location_name="Virtual Zoom event")]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.restate_safe is False
    assert mapped.mapping_status == MAPPING_STATUS_UNSAFE


# --- Titles / metadata ---


def test_exact_title_and_slash_punctuation_survive():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.records[0].title_raw == "Face/Off"
    assert mapped.contract["programs"][0]["source_title"] == "Face/Off"


def test_calendar_and_program_titles_in_contract():
    result = safe_success()
    result["programs"][0]["raw"]["calendar_title"] = "Face/Off (Calendar)"
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert mapped.contract["programs"][0]["raw"]["calendar_title"] == "Face/Off (Calendar)"
    assert mapped.records[0].attributes["calendar_title"] == "Face/Off (Calendar)"
    assert mapped.records[0].attributes["program_page_title"] == "Face/Off"


def test_runtime_and_year_mapping():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.records[0].runtime_raw == "138"
    assert mapped.records[0].attributes["release_year"] == 1997

    no_meta = base_result()
    no_meta["programs"] = [program(runtime_min=None, release_year=None)]
    no_meta["showtimes"] = [showtime()]
    mapped2 = map_central_cinema_contract_to_indie(no_meta, theater_ids=THEATER_IDS)
    assert mapped2.records[0].runtime_raw is None
    assert "release_year" not in (mapped2.records[0].attributes or {})


def test_date_created_never_maps_to_year():
    result = base_result()
    result["programs"] = [
        program(
            release_year=None,
            date_created="2026-01-15",
            extra_raw={"schema_org": {"name": "Face/Off", "dateCreated": "2026-01-15"}},
        )
    ]
    result["showtimes"] = [showtime()]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert "release_year" not in (mapped.records[0].attributes or {})
    assert mapped.contract["programs"][0]["raw"]["dateCreated"] == "2026-01-15"
    assert mapped.restate_safe is True


def test_invalid_year_stays_null_with_warning():
    result = base_result()
    result["programs"] = [program(release_year=999)]
    result["showtimes"] = [showtime()]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    assert "release_year" not in (mapped.records[0].attributes or {})
    assert any(w.code == "invalid_release_year" for w in mapped.warnings)
    assert mapped.restate_safe is True


def test_description_credits_presentation_remain_contract_only():
    result = safe_success()
    result["programs"][0]["raw"]["presentation_note"] = "Hecklevision screening tonight!"
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    attrs = mapped.records[0].attributes or {}
    assert "description_paragraphs" not in attrs
    assert "directors" not in attrs
    assert "cast" not in attrs
    assert "presentation_note" not in attrs
    assert mapped.contract["programs"][0]["raw"]["presentation_note"] == "Hecklevision screening tonight!"
    assert mapped.contract["programs"][0]["raw"]["directors"] == ["John Woo"]


def test_ticket_url_preserved_not_public_enum():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert "checkout/showing/faceslashoff/3387540" in (mapped.records[0].ticket_url_raw or "")
    assert mapped.records[0].attributes["ticket_url"]


# --- Date/time ---


def test_local_date_and_unambiguous_time_map():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.records[0].date_raw == "07/18/2026"
    parsed = parse_time(mapped.records[0].time_raw)
    assert parsed.time_24h == "19:00"


def test_noon_and_midnight_legacy_compatible():
    result = base_result()
    result["programs"] = [program()]
    result["showtimes"] = [
        showtime(showing_id="1", local_time="12:00"),
        showtime(showing_id="2", local_time="00:00"),
    ]
    mapped = map_central_cinema_contract_to_indie(result, theater_ids=THEATER_IDS)
    times = {r.time_raw for r in mapped.records}
    assert "12:00 PM" in times
    assert "12:00 AM" in times
    assert parse_time("12:00 PM").time_24h == "12:00"
    assert parse_time("12:00 AM").time_24h == "00:00"


def test_original_display_date_preserved():
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    assert mapped.records[0].attributes["source_display_date"] == "July 18"


# --- Log envelope ---


def test_log_envelope_contract_plus_records_deterministic():
    mapped = map_central_cinema_contract_to_indie(
        safe_success(),
        theater_ids=THEATER_IDS,
        generated_at="2026-07-16T12:00:00-07:00",
    )
    envelope = mapped.log_envelope
    assert envelope["source"] == "central_cinema"
    assert envelope["independent_source_result"]["contract_version"] == "1.0.0"
    assert envelope["mapping"]["restate_safe"] is True
    assert len(envelope["records"]) == 2
    text = serialize_central_cinema_mapping_log(envelope)
    assert text == serialize_central_cinema_mapping_log(json.loads(text))
    assert "<html" not in text.casefold()
    assert "C:\\\\" not in text
    assert "/Users/" not in text
    assert "secret" not in text.casefold()


# --- Parser compatibility ---


def test_indie_loader_and_legacy_conversion_without_history():
    mapped = map_central_cinema_contract_to_indie(
        safe_success(),
        theater_ids=THEATER_IDS,
        generated_at="2026-07-16T12:00:00-07:00",
    )
    fetch = load_scrape_daily_log_payload(mapped.log_envelope)
    assert len(fetch.records) == 2
    rows = [raw_showtime_to_legacy_row(r) for r in fetch.records]
    assert all(row["source_film_id"] == "faceslashoff" for row in rows)
    assert all(row["Film"] == "Face/Off" for row in rows)
    assert all(row["Theater"] == "Central Cinema" for row in rows)
    assert all(source_showtime_id_from_raw(r) for r in fetch.records)
    # No history/restatement invocation in this offline path.
    assert mapped.stats.get("stale_retention_recommended") is False


def test_canonical_theater_resolves_from_mapped_name(registry):
    mapped = map_central_cinema_contract_to_indie(safe_success(), theater_ids=THEATER_IDS)
    index = build_theater_index(registry)
    resolved = resolve_theater(mapped.records[0].theater_name_raw, index)
    assert resolved is not None
    assert resolved.theater_id == CENTRAL_THEATER_ID


# --- CLI ---


def test_cli_offline(tmp_path, monkeypatch, project_root):
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    input_path = FIXTURE_DIR / "safe_success.json"
    input_path.write_text(serialize_independent_source_result(safe_success()), encoding="utf-8")
    out = tmp_path / "central_cinema_log.json"

    calls: list[str] = []

    def blocked(url, *args, **kwargs):  # noqa: ANN001
        calls.append(str(url))
        raise AssertionError("network forbidden")

    monkeypatch.setattr("urllib.request.urlopen", blocked)
    from scripts.map_central_cinema_contract_to_indie import main

    code = main(
        [
            "--input",
            str(input_path),
            "--output",
            str(out),
            "--registry",
            str(project_root / "data" / "theaters.json"),
        ]
    )
    assert code == 0
    assert calls == []
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["source"] == "central_cinema"
    assert payload["records"]
    assert payload["independent_source_result"]
