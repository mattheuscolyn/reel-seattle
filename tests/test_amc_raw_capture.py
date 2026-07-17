"""Tests for P-18A AMC Showtimes raw-log capture expansion."""

from __future__ import annotations

import json
from pathlib import Path

from reel_seattle.adapters.amc import api_showtime_to_raw, raw_showtime_to_legacy_row
from reel_seattle.adapters.amc_metadata import extract_showtime_raw_extensions
from reel_seattle.adapters.base import FetchResult
from reel_seattle.adapters.scrape_log import (
    SCRAPE_LOG_SCHEMA_VERSION,
    build_scrape_log_artifact,
    load_scrape_daily_log_payload,
    write_scrape_daily_log,
)
from reel_seattle.analysis.amc_showtimes_field_audit import build_showtimes_field_audit

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "adapters"
AUDIT_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "analysis" / "amc_showtimes_field_audit"
THEATER = "AMC Pacific Place 11"
GENERATED_AT = "2026-07-17T12:00:00-07:00"


def _full_payload() -> dict:
    return json.loads((FIXTURES / "amc_api_showtime_full.json").read_text(encoding="utf-8"))


def test_existing_captured_fields_remain_unchanged():
    payload = _full_payload()
    raw = api_showtime_to_raw(payload, THEATER)
    assert raw.source_showtime_id == "show-12345"
    assert raw.format_raw == "IMAX"
    assert raw.canceled is False
    assert raw.almost_sold_out is False
    assert raw.attributes["movie_id"] == "movie-abc123"
    assert raw.attributes["sell_until_utc"] == "2026-06-28T23:59:00Z"
    assert raw.attributes["has_trailers"] is True
    assert raw.attributes["maximum_intended_attendance"] == 150
    assert raw.attributes["genre"] == "Action"
    assert raw.attributes["mpaa_rating"] == "PG-13"


def test_old_shape_log_still_parses():
    envelope = json.loads((AUDIT_FIXTURES / "log_day1.json").read_text(encoding="utf-8"))
    result = load_scrape_daily_log_payload(envelope, label="log_day1.json")
    assert envelope["schema_version"] == "1.0.0"
    assert envelope["source"] == "amc"
    raw = result.records[0]
    assert raw.title_raw == "Standard Film"
    assert "amc_attributes" not in (raw.attributes or {})


def test_amc_attributes_preserved_distinctly():
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    attrs = raw.attributes["amc_attributes"]
    assert isinstance(attrs, list)
    assert attrs[0]["code"] == "IMAX"
    assert attrs[0]["name"] == "IMAX"
    assert attrs[0]["description"] == "IMAX presentation"
    assert attrs[0]["extraSourceField"] == "keep-me"
    assert attrs[1]["code"] == "OPENCAPTION"
    assert attrs[1]["description"] is None


def test_unknown_attribute_fields_do_not_crash():
    payload = _full_payload()
    payload["attributes"] = [{"code": "ZZZ", "name": "Z", "weird": {"nested": True}}]
    raw = api_showtime_to_raw(payload, THEATER)
    assert raw.attributes["amc_attributes"][0]["weird"]["nested"] is True


def test_languages_spoken_dubbed_subtitle_survive():
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    langs = raw.attributes["languages"]
    assert langs["spoken"] == "English"
    assert langs["dubbed_over"] is None
    assert langs["subtitle"] == []


def test_empty_language_arrays_distinct_from_missing():
    present = extract_showtime_raw_extensions(
        {"languages": {"spoken": [], "dubbedOver": None}}
    )
    assert present["languages"]["spoken"] == []
    assert present["languages"]["dubbed_over"] is None
    assert "subtitle" not in present["languages"]

    missing = extract_showtime_raw_extensions({"id": "x"})
    assert "languages" not in missing


def test_identity_and_relationship_fields_survive():
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    assert raw.attributes["performance_number"] == 987654
    assert raw.attributes["theatre_id"] == 601
    assert raw.attributes["wwm_release_number"] == 44001
    assert raw.attributes["internal_release_number"] == 88001
    assert raw.attributes["last_updated_utc"] == "2026-06-28T18:00:00Z"
    assert raw.source_showtime_id == "show-12345"


def test_sold_out_distinct_from_almost_sold_out():
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    assert raw.almost_sold_out is False
    assert raw.attributes["is_sold_out"] is False
    payload = _full_payload()
    payload["isSoldOut"] = True
    payload["isAlmostSoldOut"] = False
    raw2 = api_showtime_to_raw(payload, THEATER)
    assert raw2.almost_sold_out is False
    assert raw2.attributes["is_sold_out"] is True


def test_embargo_visibility_auditorium_pricing_survive():
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    assert raw.attributes["is_embargoed"] is False
    assert raw.attributes["embargoed"] is False
    assert raw.attributes["visibility_datetime_utc"] == "2026-06-01T00:00:00Z"
    assert raw.attributes["auditorium"] == 7
    assert raw.attributes["virtual_auditorium_id"] == "VA-601-7"
    assert raw.attributes["layout_id"] == "L-601-7"
    assert raw.attributes["layout_version_number"] == 3
    prices = raw.attributes["ticket_prices"]
    assert prices[0]["ticketType"] == "Adult"
    assert prices[0]["price"] == 18.99
    assert prices[0]["priceCode"] == "ADULT"
    assert prices[1]["ticketType"] == "Child"


def test_missing_optional_and_null_fields_remain_valid():
    minimal = {
        "showDateTimeLocal": "2026-06-28T20:00:00",
        "movieName": "Minimal",
        "id": "min-1",
        "isCanceled": None,
        "isAlmostSoldOut": None,
    }
    raw = api_showtime_to_raw(minimal, THEATER)
    assert raw.title_raw == "Minimal"
    assert "amc_attributes" not in (raw.attributes or {})
    assert "ticket_prices" not in (raw.attributes or {})


def test_malformed_optional_source_records_do_not_crash():
    payload = _full_payload()
    payload["attributes"] = "not-a-list"
    payload["languages"] = "English"
    payload["ticketPrices"] = {"bad": True}
    raw = api_showtime_to_raw(payload, THEATER)
    assert raw.attributes["amc_attributes"] == "not-a-list"
    assert raw.attributes["languages"]["_malformed"] == "English"
    assert raw.attributes["ticket_prices"] == {"bad": True}


def test_no_secrets_or_headers_in_extensions():
    payload = _full_payload()
    payload["headers"] = {"X-AMC-Vendor-Key": "secret"}
    payload["AMC_API_KEY"] = "secret"
    ext = extract_showtime_raw_extensions(payload)
    blob = json.dumps(ext)
    assert "X-AMC-Vendor-Key" not in blob
    assert "AMC_API_KEY" not in blob
    assert "secret" not in blob


def test_log_serialization_deterministic_and_schema_unchanged(tmp_path: Path):
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    result = FetchResult(records=[raw])
    a = build_scrape_log_artifact("amc", result, generated_at=GENERATED_AT)
    b = build_scrape_log_artifact("amc", result, generated_at=GENERATED_AT)
    assert a == b
    assert a["schema_version"] == SCRAPE_LOG_SCHEMA_VERSION == "1.0.0"
    path = tmp_path / "2026-07-17_amc.json"
    write_scrape_daily_log(path, "amc", result, generated_at=GENERATED_AT)
    loaded = load_scrape_daily_log_payload(
        json.loads(path.read_text(encoding="utf-8")),
        label=path.name,
    )
    assert loaded.records[0].attributes["performance_number"] == 987654
    assert loaded.records[0].attributes["amc_attributes"][0]["code"] == "IMAX"


def test_legacy_row_unaffected_by_expanded_attributes():
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    row = raw_showtime_to_legacy_row(raw)
    assert row["Film"] == "New Future AMC"
    assert row["source_showtime_id"] == "show-12345"
    assert "amc_attributes" not in row
    assert "ticket_prices" not in row


def test_audit_reads_expanded_and_old_logs():
    report_old = build_showtimes_field_audit(
        log_paths=[AUDIT_FIXTURES / "log_day1.json"],
        generated_at=GENERATED_AT,
    )
    by_old = {row["api_path"]: row for row in report_old["field_population"]}
    # Adapter maps the field, but pre-P-18A fixtures have zero present values.
    assert by_old["attributes"]["capture_status"] == "captured_in_scrape_log"
    assert by_old["attributes"]["present_count"] == 0
    assert report_old["pricing_analysis"]["available_in_logs"] is False
    assert report_old["embargo_availability_analysis"]["isSoldOut_captured"] is False

    report_new = build_showtimes_field_audit(
        log_paths=[AUDIT_FIXTURES / "log_expanded.json"],
        generated_at=GENERATED_AT,
    )
    by_new = {row["api_path"]: row for row in report_new["field_population"]}
    assert by_new["attributes"]["present_count"] >= 1
    assert by_new["languages.spoken"]["present_count"] >= 1
    assert by_new["performanceNumber"]["present_count"] >= 1
    assert by_new["isSoldOut"]["present_count"] >= 1
    assert report_new["attribute_taxonomy"]["unique_attributes"] >= 2
    assert "OPENCAPTION" in {row["code"] for row in report_new["attribute_taxonomy"]["attributes"]}
    assert report_new["language_analysis"]["spoken_distinct"]
    assert report_new["pricing_analysis"]["available_in_logs"] is True
    assert report_new["auditorium_analysis"]["available_in_logs"] is True
    assert report_new["embargo_availability_analysis"]["isSoldOut_captured"] is True
    assert report_new["identity_analysis"]["candidates"][1]["available_in_logs"] is True
    assert report_new["future_architecture"]["blocker"] is None

    mixed = build_showtimes_field_audit(
        log_paths=[AUDIT_FIXTURES / "log_day1.json", AUDIT_FIXTURES / "log_expanded.json"],
        generated_at=GENERATED_AT,
    )
    assert mixed["counts"]["raw_showtime_records"] == 8
    assert mixed["attribute_taxonomy"]["unique_attributes"] >= 2


def test_media_hero_not_captured_by_default():
    raw = api_showtime_to_raw(_full_payload(), THEATER)
    blob = json.dumps(raw.attributes)
    assert "hero-desktop" not in blob
    assert "heroDesktopDynamic" not in blob
