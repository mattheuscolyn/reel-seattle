# AMC Showtimes Field Audit

**Status:** Manual / read-only measurement  
**Track:** Data Foundation  
**Last updated:** 2026-07-17  
**Related:** [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [amc-source-catalog.md](./amc-source-catalog.md)

## Purpose

Measure which documented AMC Showtimes API fields are retained in committed Reel Seattle scrape logs, inventory attribute taxonomy from real or fixture payloads, and recommend a future `presentation_attributes[]` contract — without changing public schemas.

## Inputs

* Preferred: newest N committed `data/daily_logs/*_amc.json` (default 7).
* Optional: synthetic full Showtimes API payloads:

  ```text
  tests/fixtures/analysis/amc_showtimes_field_audit/api_showtimes.json
  ```

No live AMC API calls. No `AMC_API_KEY`.

## Capture status (P-18A)

`api_showtime_to_raw` now retains high-value fields under `record.attributes`, including:

* `amc_attributes` (source `attributes[]`)
* `languages` (`spoken` / `dubbed_over` / `subtitle`)
* `performance_number`, `theatre_id`, `wwm_release_number`
* `ticket_prices`, auditorium/layout IDs
* `is_sold_out`, embargo/visibility flags

See [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md) for the full mapping table.

Pre-P-18A logs remain readable; population counts stay zero for expanded fields until new daily logs land.

## Manual workflow

GitHub Actions → **AMC Showtimes Field Audit** (`workflow_dispatch` only).

```bash
python scripts/audit_amc_showtimes_fields.py \
  --logs-dir data/daily_logs \
  --max-logs 7 \
  --api-payloads tests/fixtures/analysis/amc_showtimes_field_audit/api_showtimes.json \
  --output-dir audit-output/amc-showtimes-field-audit
```

Outputs (gitignored under `audit-output/`):

* `amc_showtimes_field_audit.json`
* `amc_showtimes_field_population.csv`
* `amc_showtime_attributes.csv`
* `amc_showtime_identity_candidates.csv`
* `amc_showtimes_field_audit.md`

## Interpreting results

| Section | Meaning |
|---------|---------|
| Capture gap | Documented API fields still without adapter log paths (or absent in the sample) |
| Field population | Coverage for mapped log paths |
| Attribute taxonomy | Prefer scrape-log `amc_attributes` when present; else API fixtures |
| Identity | `source_showtime_id` plus optional `performance_number` / `theatre_id` |
| Future architecture | Proposed `presentation_attributes[]` direction |

Taxonomy categories are audit-only (`format`, `accessibility`, `language`, `event`, …). Unknown codes stay `needs_review`.

## Non-production status

* Does not modify daily scraping beyond reading committed logs.
* Does not implement `presentation_attributes[]`.
* Does not commit live audit artifacts.

Accumulate **at least two** expanded production logs before taxonomy conclusions.
