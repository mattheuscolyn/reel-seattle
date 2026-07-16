"""Internal independent-theater ingestion contracts."""

from __future__ import annotations

from reel_seattle.ingestion.independent_contract import (
    ALLOWED_STATUSES,
    CONTRACT_VERSION,
    DEFAULT_TIMEZONE,
    IndependentContractError,
    KNOWN_SOURCES,
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
    validate_program_observation,
    validate_showtime_observation,
)

__all__ = [
    "ALLOWED_STATUSES",
    "CONTRACT_VERSION",
    "DEFAULT_TIMEZONE",
    "IndependentContractError",
    "KNOWN_SOURCES",
    "STATUS_PARTIAL_FAILURE",
    "STATUS_REQUEST_FAILURE",
    "STATUS_STRUCTURAL_FAILURE",
    "STATUS_SUCCESS",
    "STATUS_VALID_EMPTY",
    "assert_valid_independent_source_result",
    "dedupe_identical_programs",
    "fixture_theater_ids",
    "load_result_fixture",
    "load_theater_ids_from_registry",
    "normalize_exact_source_title",
    "serialize_independent_source_result",
    "validate_independent_source_result",
    "validate_program_observation",
    "validate_showtime_observation",
]
