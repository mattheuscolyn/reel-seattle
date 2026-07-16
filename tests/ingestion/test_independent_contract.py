"""Tests for the independent-source observation contract (P-16C)."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest

from reel_seattle.ingestion.independent_contract import (
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    IndependentContractError,
    STATUS_PARTIAL_FAILURE,
    STATUS_REQUEST_FAILURE,
    STATUS_STRUCTURAL_FAILURE,
    STATUS_SUCCESS,
    STATUS_VALID_EMPTY,
    assert_valid_independent_source_result,
    dedupe_identical_programs,
    fixture_theater_ids,
    load_result_fixture,
    load_theater_ids_from_registry,
    normalize_exact_source_title,
    serialize_independent_source_result,
    validate_independent_source_result,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "ingestion" / "independent_contract"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def theater_ids():
    return fixture_theater_ids(include_planned=True)


def test_valid_successful_and_empty_results(theater_ids):
    success = load_result_fixture(FIXTURES / "siff_success.json")
    assert validate_independent_source_result(success, theater_ids=theater_ids) == []
    empty = load_result_fixture(FIXTURES / "beacon_valid_empty.json")
    assert validate_independent_source_result(empty, theater_ids=theater_ids) == []


def test_unsafe_statuses_cannot_be_restate_safe(theater_ids):
    for status in (
        STATUS_PARTIAL_FAILURE,
        STATUS_STRUCTURAL_FAILURE,
        STATUS_REQUEST_FAILURE,
    ):
        payload = load_result_fixture(FIXTURES / "siff_partial.json")
        payload["status"] = status
        payload["restate_safe"] = True
        payload["inspected_window"]["complete"] = False
        issues = validate_independent_source_result(payload, theater_ids=theater_ids)
        assert any(issue.code == "status_restate_mismatch" for issue in issues)


def test_success_requires_complete_inspected_window(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["inspected_window"]["complete"] = False
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "incomplete_inspected_window" for issue in issues)


def test_valid_empty_requires_affirmative_proof(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_valid_empty.json")
    payload.pop("valid_empty_evidence")
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "valid_empty_unproven" for issue in issues)


def test_unknown_theater_id_fails(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["showtimes"][0]["theater_id"] = "not-a-real-theater"
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "unknown_theater_id" for issue in issues)


def test_siff_three_theater_ids_validate_against_registry():
    registry_ids = load_theater_ids_from_registry(PROJECT_ROOT / "data" / "theaters.json")
    for theater_id in (
        "siff-cinema-downtown",
        "siff-cinema-uptown",
        "siff-film-center",
    ):
        assert theater_id in registry_ids
    payload = load_result_fixture(FIXTURES / "siff_success.json")
    assert validate_independent_source_result(payload, theater_ids=registry_ids) == []


def test_program_id_required_and_normalized_title_flag_forbidden(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["programs"][0].pop("source_program_id")
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "missing_field" for issue in issues)

    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["programs"][0]["identity_is_normalized_title"] = True
    payload["programs"][0]["source_program_id"] = (
        normalize_exact_source_title(payload["programs"][0]["source_title"])
        .casefold()
        .replace(" ", "-")
    )
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "normalized_title_identity_forbidden" for issue in issues)


def test_null_and_owned_showtime_ids(theater_ids):
    beacon = load_result_fixture(FIXTURES / "beacon_success.json")
    assert beacon["showtimes"][0]["source_showtime_id"] is None
    assert validate_independent_source_result(beacon, theater_ids=theater_ids) == []

    central = load_result_fixture(FIXTURES / "central_success.json")
    assert central["showtimes"][0]["source_showtime_id"] == "3387540"
    assert validate_independent_source_result(central, theater_ids=theater_ids) == []


def test_orphan_showtime_fails(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["showtimes"][0]["source_program_id"] = "missing-program"
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "orphan_showtime" for issue in issues)


def test_duplicate_program_conflict_and_identical_dedupe(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    duplicate = copy.deepcopy(payload["programs"][0])
    duplicate["source_title"] = "Different Title"
    payload["programs"].append(duplicate)
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "conflicting_duplicate_program" for issue in issues)

    identical = [
        copy.deepcopy(payload["programs"][0]),
        copy.deepcopy(payload["programs"][0]),
    ]
    deduped = dedupe_identical_programs(identical)
    assert len(deduped) == 1


def test_conflicting_duplicate_showtime_id_fails(theater_ids):
    payload = load_result_fixture(FIXTURES / "central_success.json")
    twin = copy.deepcopy(payload["showtimes"][0])
    twin["local_time"] = "21:00"
    payload["showtimes"].append(twin)
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "conflicting_duplicate_showtime_id" for issue in issues)


def test_local_date_time_timezone_rules(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["showtimes"][0]["local_date"] = "07/18/2026"
    payload["showtimes"][0]["local_time"] = "7:00 PM"
    payload["showtimes"][0]["timezone"] = "UTC"
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    codes = {issue.code for issue in issues}
    assert "invalid_date" in codes
    assert "invalid_time" in codes
    assert "invalid_timezone" in codes
    assert DEFAULT_TIMEZONE == "America/Los_Angeles"


def test_raw_varies_and_rejects_html(theater_ids):
    nwff = load_result_fixture(FIXTURES / "nwff_mismatch_warning.json")
    central = load_result_fixture(FIXTURES / "central_success.json")
    assert "directors" in nwff["programs"][0]["raw"]
    assert "schema_org" in central["programs"][0]["raw"]
    assert "dateCreated" in central["programs"][0]["raw"]
    assert central["programs"][0]["raw"].get("release_year") is None

    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["programs"][0]["raw"] = {"html": "<html><body>nope</body></html>"}
    issues = validate_independent_source_result(payload, theater_ids=theater_ids)
    assert any(issue.code == "raw_contains_html" for issue in issues)


def test_warning_and_rejected_completeness(theater_ids):
    payload = load_result_fixture(FIXTURES / "nwff_mismatch_warning.json")
    assert payload["warnings"][0]["code"] == "detail_schedule_mismatch"
    rejected = payload["rejected_observations"][0]
    assert rejected["affects_completeness"] is False
    assert validate_independent_source_result(payload, theater_ids=theater_ids) == []


def test_deterministic_serialization_is_byte_stable(theater_ids):
    payload = load_result_fixture(FIXTURES / "siff_success.json")
    assert_valid_independent_source_result(payload, theater_ids=theater_ids)
    first = serialize_independent_source_result(payload)
    shuffled = copy.deepcopy(payload)
    shuffled["showtimes"] = list(reversed(shuffled["showtimes"]))
    shuffled["programs"] = list(reversed(shuffled["programs"]))
    second = serialize_independent_source_result(shuffled)
    assert first == second
    assert '"contract_version": "1.0.0"' in first


def test_all_source_fixtures_validate(theater_ids):
    names = [
        "siff_success.json",
        "siff_partial.json",
        "beacon_success.json",
        "beacon_suspicious_empty.json",
        "beacon_valid_empty.json",
        "nwff_mismatch_warning.json",
        "central_success.json",
    ]
    for name in names:
        payload = load_result_fixture(FIXTURES / name)
        issues = validate_independent_source_result(payload, theater_ids=theater_ids)
        assert issues == [], f"{name}: {issues}"


def test_fixture_status_expectations(theater_ids):
    partial = load_result_fixture(FIXTURES / "siff_partial.json")
    assert partial["status"] == STATUS_PARTIAL_FAILURE
    assert partial["restate_safe"] is False

    suspicious = load_result_fixture(FIXTURES / "beacon_suspicious_empty.json")
    assert suspicious["status"] == STATUS_STRUCTURAL_FAILURE
    assert suspicious["restate_safe"] is False

    valid_empty = load_result_fixture(FIXTURES / "beacon_valid_empty.json")
    assert valid_empty["status"] == STATUS_VALID_EMPTY
    assert valid_empty["restate_safe"] is True

    central = load_result_fixture(FIXTURES / "central_success.json")
    assert central["showtimes"][0]["local_date"] == "2026-01-03"
    assert central["programs"][0]["raw"]["dateCreated"] == "2024-03-01"


def test_assert_raises_on_invalid(theater_ids):
    payload = load_result_fixture(FIXTURES / "beacon_success.json")
    payload["contract_version"] = "0.0.1"
    with pytest.raises(IndependentContractError):
        assert_valid_independent_source_result(payload, theater_ids=theater_ids)


def test_contract_version_constant():
    assert CONTRACT_VERSION == "1.0.0"
    assert STATUS_SUCCESS == "success"
