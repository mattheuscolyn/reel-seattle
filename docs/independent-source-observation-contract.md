# Independent Source Observation Contract

**Status:** Internal contract definition (non-production)  
**Version:** `1.0.0`  
**Track:** Data Foundation · Independent-theater ingestion  
**Last updated:** 2026-07-15 (P-16G)  
**Package:** `reel_seattle.ingestion.independent_contract`  
**Schema (optional):** `schema/ingestion/independent_source_observations/v1.0.0.json`

**Guiding principle:** Different extraction strategies, one explicit ingestion contract.

## Purpose and scope

This contract standardizes what independent-theater adapters **should produce** after source-specific discovery and parsing:

* SIFF
* The Beacon
* Northwest Film Forum (prototype emitter: [nwff-ingestion-prototype.md](./nwff-ingestion-prototype.md))
* Central Cinema (planned)

It does **not**:

* rewrite current SIFF/Beacon production adapters,
* change restatement or `daily_processor.py`,
* emit public artifacts,
* introduce canonical film IDs,
* implement a generic HTML scraper.

Future pipeline shape:

```text
source-specific discovery and parsing
    ↓
shared independent-source observation contract  ← P-16C
    ↓
source-observation validation
    ↓
canonical normalization
    ↓
history / public artifact emission
```

## Grains

### Program observation

Exact source-owned film, event, series entry, or program page.

Required: `contract_version`, `source`, `source_program_id`, `source_title`, `source_program_url`, `observed_at`, `raw`.

Optional: `program_kind`, description/runtime/year/creators/etc. via `raw` or future optional fields.

Rules:

* `source_program_id` is source-owned or derived from a stable canonical URL/slug.
* Normalized title must not be the program ID.
* `source_title` preserves the displayed title (whitespace normalize only).
* Non-feature programs are allowed.
* Missing year/runtime/director is valid.

### Showtime observation

One source occurrence.

Required: `contract_version`, `source`, `source_program_id`, nullable `source_showtime_id`, `source_title`, `theater_id`, `local_date`, `local_time`, `timezone`, `source_occurrence_url`, nullable `ticket_url`, `observed_at`, `raw`.

Rules:

* Timezone for these sources is `America/Los_Angeles`.
* Date and time are separate (`YYYY-MM-DD`, `HH:MM` or `HH:MM:SS`).
* UTC conversion is a later normalization concern.
* `theater_id` must resolve against `data/theaters.json` (fixtures may inject planned IDs for NWFF/Central).
* Source-owned showtime IDs take priority when present.
* Ticket URL is showtime-specific when available; program page URL is not automatically a ticket URL.

### Source scrape result

One adapter run containing programs, showtimes, completeness, and diagnostics.

Required top-level fields include windows, `status`, `restate_safe`, `identity`, `structural_validation`, `stats`, `warnings`, `rejected_observations`, `programs`, `showtimes`.

**Date window inclusivity:** `requested_window.end` and `inspected_window.end` are **inclusive** calendar dates in Pacific local time.

## Status and `restate_safe` invariants

Aligned with P-16B:

| Status | `restate_safe` | Notes |
|--------|----------------|-------|
| `success` | `true` | Structure passed; inspected window complete |
| `valid_empty` | `true` | Zero showtimes + `valid_empty_evidence.proven=true` |
| `partial_failure` | `false` | Material uninspected slices |
| `structural_failure` | `false` | Expected structure missing |
| `request_failure` | `false` | Required request failed |

Contradictory combinations are validation errors.

## Inspected window and structural validation

* `inspected_window.complete=true` means the adapter proved coverage for the requested scope (over-fetch allowed).
* Missing/incomplete coverage defaults to restatement-unsafe.
* Structural checks have `code`, `passed`, `severity` (`info`/`warning`/`error`), optional `message`.
* Restatement-safe runs require ≥1 structural check and no failed error-level checks.

## Identity strategies

Declare on the result:

```json
{
  "identity": {
    "program_strategy": "canonical_url_slug",
    "showtime_strategy": "source_showing_id"
  }
}
```

Program strategies: `canonical_url_slug`, `canonical_detail_url`, `source_numeric_id`.

Showtime strategies: `source_showing_id`, `screening_anchor_id`, `composite_program_theater_datetime`, `nullable_absent`.

Fallback composites must not use normalized title when a program ID exists.

## Duplicates

* Programs keyed by `(source, source_program_id)`. Identical duplicates may dedupe; conflicting duplicates fail.
* Showtimes with `source_showtime_id` conflict when the same ID maps to different occurrence facts.

## Raw metadata

Per-source `raw` objects: JSON-serializable, no full HTML, no secrets. Keys are not shared across sources.

## Fixture mappings

| Fixture | Demonstrates |
|---------|--------------|
| `siff_success.json` | Three SIFF theaters; shared program; screening anchors in `raw` |
| `siff_partial.json` | Partial page failure; `restate_safe=false` |
| `beacon_success.json` | Exact unmutated title; nullable showtime ID |
| `beacon_suspicious_empty.json` | Structural empty; unsafe |
| `beacon_valid_empty.json` | Affirmative empty proof; safe clear |
| `nwff_mismatch_warning.json` | Calendar authority; detail mismatch warning; category reject |
| `central_success.json` | Checkout showtime ID; `dateCreated` raw-only; Jan rollover local date |

Fixtures live under `tests/fixtures/ingestion/independent_contract/`.

## Migration plan (future)

Documented target entry points (not implemented in P-16C):

```python
fetch_siff_observations(...) -> IndependentSourceResult
fetch_beacon_observations(...) -> IndependentSourceResult
fetch_nwff_observations(...) -> IndependentSourceResult
fetch_central_cinema_observations(...) -> IndependentSourceResult
```

Suggested sequence:

1. Prototype NWFF against this contract (fixtures + live read-only validation) — **Complete (P-16D)**.
2. Design NWFF production integration — **Complete (P-16E)**; see [nwff-production-integration-design.md](./nwff-production-integration-design.md).
3. **P-16F:** registry entry + contract→indie mapping (no daily workflow) — **Complete**.
4. **P-16G:** production-compatible adapter/raw log + manual workflow validation — **Complete**.
5. **P-16H:** daily restatement + pipeline_report/showtimes source enums.
6. Align Beacon (title/year/IDs/structure) where evidence requires.
7. Prototype Central Cinema.
8. Align SIFF carefully (screening IDs, theater-slice restatement later).

Current production SIFF/Beacon adapters and P-16B restatement guards remain unchanged until an explicit migration task. The NWFF prototype lives under `reel_seattle.prototypes.nwff` and must not be imported by production adapters until an intentional promotion PR.

## Validation API

```python
from reel_seattle.ingestion import (
    validate_independent_source_result,
    assert_valid_independent_source_result,
    serialize_independent_source_result,
    fixture_theater_ids,
)
```
