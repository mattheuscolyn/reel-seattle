# AMC Showtimes Field Audit

**Status:** Provisional P-18B research (incomplete — temporal limit)  
**Track:** Data Foundation  
**Last updated:** 2026-07-17  
**Related:** [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [amc-source-catalog.md](./amc-source-catalog.md)

## Purpose

Measure which documented AMC Showtimes API fields are retained in committed Reel Seattle scrape logs, inventory attribute taxonomy from real or fixture payloads, and recommend a future `presentation_attributes[]` contract — without changing public schemas.

## Inputs

* Preferred: newest N committed `data/daily_logs/*_amc.json` (default 7; P-18B provisional used all 19).
* Optional: synthetic full Showtimes API payloads:

  ```text
  tests/fixtures/analysis/amc_showtimes_field_audit/api_showtimes.json
  ```

No live AMC API calls. No `AMC_API_KEY`.

## Capture status (P-18A)

`api_showtime_to_raw` retains high-value fields under `record.attributes`, including `amc_attributes`, languages, identity fallbacks, ticket prices, auditorium/layout, and availability flags.

See [amc-showtimes-raw-capture.md](./amc-showtimes-raw-capture.md).

## P-18B provisional result (2026-07-17)

**Temporal limitation:** only **1** distinct expanded calendar date (`2026-07-17`). Eighteen legacy dates remain. Two same-day workflow reruns for 2026-07-17 are **not** separate temporal evidence.

| Metric | Value |
|--------|-------|
| Logs examined | 19 |
| Expanded records | 3,502 |
| Legacy records | 67,111 |
| Unique attribute codes (expanded day) | 35 |
| Category sketch | format 7 · accessibility 4 · language 4 · event 1 · ticketing 1 · unknown 18 |
| Languages nonempty | **0** (objects present but empty) |
| Avg expanded log size | 12.58 MB (legacy ~2.96 MB) |
| Readiness decision | **more_observation_required** |

Do **not** finalize taxonomy or implement `presentation_attributes[]` until **3–5** distinct expanded dates accumulate.

### Notable provisional observations

* `RESERVEDSEATING` / `RECLINERSEATING` are common and currently `unknown` in the audit classifier.
* Format attributes often appear **without** a matching `premiumFormat` string (Laser/IMAX/etc. in `amc_attributes`).
* `performance_number` + `theatre_id` are fully populated on the expanded day; cross-day stability not yet measurable.
* Ticket prices are universal on the expanded day (Adult/Child/Senior); largest size drivers with `amc_attributes`.
* Embargo boolean keys were absent in this sample; visibility timestamps and sold-out flags are present.

## Manual workflow

GitHub Actions → **AMC Showtimes Field Audit** (`workflow_dispatch` only).

```bash
python scripts/audit_amc_showtimes_fields.py \
  --logs-dir data/daily_logs \
  --max-logs 19 \
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
| Temporal coverage | Distinct expanded vs legacy calendar dates; provisional flag |
| Readiness | `ready` / `more_observation_required` / `capture_adjustment_required` |
| Field population | Coverage for mapped log paths |
| Attribute taxonomy | Prefer scrape-log `amc_attributes` when present |
| Identity | `source_showtime_id` plus optional `performance_number` / `theatre_id` |
| Log volume | Size growth and largest nested contributors |

## Non-production status

* Does not modify daily scraping beyond reading committed logs.
* Does not implement `presentation_attributes[]`.
* Does not commit live audit artifacts.
