"""Tests for AMC Showtimes field-population and attribute-taxonomy audit."""

from __future__ import annotations

import json
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from reel_seattle.analysis.amc_showtimes_field_audit import (
    ATTR_ACCESSIBILITY,
    ATTR_EVENT,
    ATTR_FORMAT,
    ATTR_LANGUAGE,
    ATTR_UNKNOWN,
    build_showtimes_field_audit,
    classify_attribute,
    list_amc_scrape_logs,
    write_audit_outputs,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "analysis" / "amc_showtimes_field_audit"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
GENERATED_AT = "2026-07-16T12:00:00-07:00"


def _load_api_payloads() -> list[dict]:
    payload = json.loads((FIXTURES / "api_showtimes.json").read_text(encoding="utf-8"))
    return list(payload["showtimes"])


def test_multiple_logs_load_deterministically(tmp_path: Path):
    report_a = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day1.json", FIXTURES / "log_day2.json"],
        api_payloads=_load_api_payloads(),
        generated_at=GENERATED_AT,
    )
    report_b = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day2.json", FIXTURES / "log_day1.json"],
        api_payloads=_load_api_payloads(),
        generated_at=GENERATED_AT,
    )
    # Counts should match regardless of input path order for the same set.
    assert report_a["counts"]["raw_showtime_records"] == report_b["counts"]["raw_showtime_records"]
    paths = write_audit_outputs(report_a, tmp_path / "a")
    write_audit_outputs(report_b, tmp_path / "b")
    assert paths["json"].read_bytes() == (tmp_path / "b" / "amc_showtimes_field_audit.json").read_bytes()


def test_field_population_null_vs_empty_and_nested():
    report = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day1.json"],
        generated_at=GENERATED_AT,
    )
    by_path = {row["api_path"]: row for row in report["field_population"]}
    assert by_path["id"]["capture_status"] == "captured_in_scrape_log"
    assert by_path["id"]["non_empty_count"] == 5  # one null id in fixture
    # P-18A maps attributes[] → attributes.amc_attributes; pre-expansion fixtures have present_count 0.
    assert by_path["attributes"]["capture_status"] == "captured_in_scrape_log"
    assert by_path["attributes"]["present_count"] == 0
    assert by_path["attributes"]["non_empty_count"] == 0
    assert by_path["movieId"]["non_empty_count"] == 6
    assert by_path["premiumFormat"]["non_empty_count"] >= 3
    assert by_path["languages"]["present_count"] == 0
    assert by_path["ticketPrices"]["present_count"] == 0
    assert by_path["performanceNumber"]["present_count"] == 0
    assert by_path["sortableMovieName"]["capture_status"] == "not_captured_in_scrape_log"


def test_attribute_classification_rules():
    assert classify_attribute(code="IMAX", name="IMAX")["category"] == ATTR_FORMAT
    assert classify_attribute(code="OPENCAPTION", name="Open Caption")["category"] == ATTR_ACCESSIBILITY
    oc = classify_attribute(code="OPENCAPTION", name="Open Caption")
    cc = classify_attribute(code="CLOSEDCAPTION", name="Closed Caption")
    assert oc["category"] == ATTR_ACCESSIBILITY
    assert cc["category"] == ATTR_ACCESSIBILITY
    assert "OPENCAPTION".casefold() in oc["evidence"].casefold() or "open" in oc["evidence"].casefold()
    assert "CLOSEDCAPTION".casefold() in cc["evidence"].casefold() or "closed" in cc["evidence"].casefold()
    assert classify_attribute(code="SENSORYFRIENDLY", name="Sensory Friendly")["category"] == ATTR_ACCESSIBILITY
    assert classify_attribute(code="DUBBED", name="Dubbed")["category"] == ATTR_LANGUAGE
    assert classify_attribute(code="INPERSNQA", name="In-Person Q&A")["category"] == ATTR_EVENT
    unknown = classify_attribute(code="ZZZUNK99", name="Unclassified Token")
    assert unknown["category"] == ATTR_UNKNOWN
    assert unknown["review_status"] == "needs_review"


def test_attribute_inventory_and_language_signals():
    report = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day1.json"],
        api_payloads=_load_api_payloads(),
        generated_at=GENERATED_AT,
    )
    attrs = report["attribute_taxonomy"]["attributes"]
    codes = {row["code"] for row in attrs}
    assert "OPENCAPTION" in codes
    assert "CLOSEDCAPTION" in codes
    assert "IMAX" in codes
    assert "INPERSNQA" in codes
    assert report["attribute_taxonomy"]["category_counts"][ATTR_FORMAT] >= 1
    assert report["attribute_taxonomy"]["category_counts"][ATTR_ACCESSIBILITY] >= 2
    assert report["language_analysis"]["dubbed_over_distinct"]
    assert report["language_analysis"]["subtitle_distinct"]


def test_premium_format_and_identity():
    report = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day1.json", FIXTURES / "log_day2.json"],
        generated_at=GENERATED_AT,
    )
    premium = report["premium_format_analysis"]
    assert premium["conflicts_format_vs_attr"] == 0
    assert premium["both_equal_nonempty"] >= 1
    identity = report["identity_analysis"]
    cand_a = identity["candidates"][0]
    assert cand_a["available_in_logs"] is True
    # day1 has duplicate dup-1
    assert cand_a["duplicate_keys_same_day_files"]["log_day1.json"] >= 1
    assert identity["candidates"][1]["available_in_logs"] is False
    assert "source_showtime_id" in identity["recommendation"]


def test_outputs_sanitized_no_network(tmp_path: Path, monkeypatch):
    def _block(*_a, **_k):
        raise AssertionError("network access attempted")

    monkeypatch.setattr(socket, "create_connection", _block)
    report = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day1.json"],
        api_payloads=_load_api_payloads(),
        generated_at=GENERATED_AT,
    )
    paths = write_audit_outputs(report, tmp_path)
    blob = paths["json"].read_text(encoding="utf-8")
    assert "AMC_API_KEY" not in blob
    assert "X-AMC-Vendor-Key" not in blob
    assert "records\": [" not in blob  # no full scrape dump
    assert paths["markdown"].is_file()
    assert paths["field_csv"].is_file()
    assert paths["attribute_csv"].is_file()
    assert paths["identity_csv"].is_file()
    assert "presentation_attributes" in paths["markdown"].read_text(encoding="utf-8")
    assert "Capture gap" in paths["markdown"].read_text(encoding="utf-8")


def test_cli_end_to_end(tmp_path: Path):
    out = tmp_path / "out"
    result = subprocess.run(
        [
            sys.executable,
            str(PROJECT_ROOT / "scripts" / "audit_amc_showtimes_fields.py"),
            "--log-files",
            str(FIXTURES / "log_day1.json"),
            str(FIXTURES / "log_day2.json"),
            "--api-payloads",
            str(FIXTURES / "api_showtimes.json"),
            "--output-dir",
            str(out),
            "--generated-at",
            GENERATED_AT,
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert (out / "amc_showtimes_field_audit.json").is_file()


def test_list_logs_selects_newest(tmp_path: Path):
    logs = tmp_path / "data" / "daily_logs"
    logs.mkdir(parents=True)
    for name in ("2026-07-01_amc.json", "2026-07-10_amc.json", "2026-07-16_amc.json"):
        (logs / name).write_text(
            (FIXTURES / "log_day2.json").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
    selected = list_amc_scrape_logs(logs, max_logs=2)
    assert [p.name for p in selected] == ["2026-07-10_amc.json", "2026-07-16_amc.json"]


def test_pricing_auditorium_embargo_sections():
    report = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day1.json"],
        api_payloads=_load_api_payloads(),
        generated_at=GENERATED_AT,
    )
    assert report["pricing_analysis"]["available_in_logs"] is False
    assert report["pricing_analysis"]["fixture_summary"]["payloads_with_ticket_prices"] >= 1
    assert report["auditorium_analysis"]["available_in_logs"] is False
    assert report["embargo_availability_analysis"]["isCanceled_captured"] is True
    assert report["embargo_availability_analysis"]["isSoldOut_captured"] is False
    assert "presentation_attributes" in report["future_architecture"]["presentation_attributes_direction"]["collection"]


def test_malformed_attribute_and_conflicting_types_do_not_crash():
    payloads = _load_api_payloads() + [
        {
            "id": "bad-1",
            "movieId": 1,
            "movieName": "Broken",
            "attributes": [None, "IMAX", {"code": None, "name": ""}],
            "ticketPrices": "not-an-array",
            "languages": "English",
        }
    ]
    report = build_showtimes_field_audit(
        log_paths=[FIXTURES / "log_day1.json"],
        api_payloads=payloads,
        generated_at=GENERATED_AT,
    )
    assert report["attribute_taxonomy"]["malformed_attribute_items"] >= 1
    assert isinstance(report["pricing_analysis"]["fixture_summary"], dict)


def test_existing_amc_adapter_and_catalog_unaffected():
    # Smoke: import production adapter mapping still present and unchanged by audit package.
    from reel_seattle.adapters import amc as amc_adapter

    assert callable(amc_adapter.api_showtime_to_raw)


def test_workflow_yaml_is_manual_readonly():
    path = PROJECT_ROOT / ".github" / "workflows" / "amc_showtimes_field_audit.yml"
    text = path.read_text(encoding="utf-8")
    assert "workflow_dispatch" in text
    assert "schedule:" not in text
    assert "contents: read" in text
    assert "AMC_API_KEY" not in text
    assert "audit_amc_showtimes_fields.py" in text

