# AMC Showtimes Field Audit

**Status:** Manual / read-only measurement  
**Track:** Data Foundation  
**Last updated:** 2026-07-15  
**Related:** [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [amc-source-catalog.md](./amc-source-catalog.md)

## Purpose

Measure which documented AMC Showtimes API fields are retained in committed Reel Seattle scrape logs, inventory attribute taxonomy (via fixtures until production capture expands), and recommend a future `presentation_attributes[]` contract — without changing production scraping or public schemas.

## Inputs

* Preferred: newest N committed `data/daily_logs/*_amc.json` (default 7).
* Optional: synthetic full Showtimes API payloads for attributes/languages/pricing classifiers:

  ```text
  tests/fixtures/analysis/amc_showtimes_field_audit/api_showtimes.json
  ```

No live AMC API calls. No `AMC_API_KEY`.

## Important limitation

`api_showtime_to_raw` stores a **subset** of the Showtimes API object. In particular, production logs do **not** retain:

* `attributes[]`
* `languages`
* `ticketPrices`
* `performanceNumber`
* `theatreId`
* `auditorium` / layout fields
* several availability flags (`isSoldOut`, embargo/visibility, …)

The audit treats that capture gap as a first-class finding.

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
| Capture gap | Which documented API fields never reach scrape logs |
| Field population | Coverage for fields that *are* mapped |
| Attribute taxonomy | Fixture/API-payload classification until logs retain `attributes[]` |
| Identity | `source_showtime_id` vs unavailable `performanceNumber` composites |
| Future architecture | Proposed `presentation_attributes[]` direction + blocker |

Taxonomy categories are audit-only (`format`, `accessibility`, `language`, `event`, …). Unknown codes stay `needs_review`.

## Non-production status

* Does not modify daily scraping, history, public JSON, cockpit, or SPA.
* Does not implement `presentation_attributes[]`.
* Does not commit live audit artifacts.
