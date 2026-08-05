"""TMDB enrichment helpers (T-ENR-01A audit + T-ENR-01B pipeline)."""

from reel_seattle.enrichment.audit import (
    AUDIT_FIELDS,
    CATALOG_REL,
    COVERAGE_REL,
    build_coverage_report,
    confirmed_tmdb_films,
    extract_enrichment_fields,
    field_presence,
    load_catalog,
    validate_proposed_enrichment_record,
    write_coverage,
)
from reel_seattle.enrichment.constants import (
    PUBLIC_ARTIFACT_REL,
    REPORT_REL,
)
from reel_seattle.enrichment.pipeline import (
    build_enrichment_artifact,
    load_prior_artifact,
    write_enrichment_outputs,
)
from reel_seattle.enrichment.validate import validate_film_enrichment_document

__all__ = [
    "AUDIT_FIELDS",
    "CATALOG_REL",
    "COVERAGE_REL",
    "PUBLIC_ARTIFACT_REL",
    "REPORT_REL",
    "build_coverage_report",
    "build_enrichment_artifact",
    "confirmed_tmdb_films",
    "extract_enrichment_fields",
    "field_presence",
    "load_catalog",
    "load_prior_artifact",
    "validate_film_enrichment_document",
    "validate_proposed_enrichment_record",
    "write_coverage",
    "write_enrichment_outputs",
]
