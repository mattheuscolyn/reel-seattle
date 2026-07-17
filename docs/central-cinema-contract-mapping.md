# Central Cinema Contract → Indie Mapping

**Status:** Implemented offline foundation (P-17C) — **not** production collection  
**Module:** `reel_seattle.ingestion.central_cinema_mapping`  
**CLI:** `scripts/map_central_cinema_contract_to_indie.py` (offline only)  
**Design:** [central-cinema-production-integration-design.md](./central-cinema-production-integration-design.md)  
**Last updated:** 2026-07-16 (P-17C)

## Purpose

Convert a validated Central Cinema `IndependentSourceResult` v1.0.0 into:

1. Legacy-compatible `RawShowtime` records
2. A production-shaped Option C scrape-log envelope (contract + records + mapping diagnostics)
3. A final `restate_safe` recommendation for a future processor (not invoked here)

No HTML parsing, HTTP requests, history writes, or restatement occur in this module.

## Registry

Canonical entry in `data/theaters.json` (synced byte-for-byte to `public/data/theaters.json`):

| Field | Value |
|-------|--------|
| `id` | `central-cinema` |
| `name` | `Central Cinema` |
| `aliases` | `Central Cinema` |
| `source` | `central_cinema` |
| `type` | `indie` |
| `enabled` | `true` |
| `neighborhood` | `Central District` |
| `timezone` | `America/Los_Angeles` |

One venue only — no screens, auditoriums, or off-site theater entries.

### Schema

* `schema/theaters/v1.0.0.json` — `source` enum includes `central_cinema`
* `schema/showtimes_current/v1.0.0.json` — **theater_snapshot** `source` enum includes `central_cinema` so the registered theater validates in public registry copies
* Showtime-record `source`, `sources_included`, and pipeline-report source enums include `central_cinema` (P-17E)

## Site-scoped venue proof

Central movie pages often omit per-showtime location labels. Acceptance is **affirmative site/page proof**, not a silent missing-location default.

An observation may resolve to `central-cinema` when all of the following hold:

* `source = central_cinema`
* program URL host is `central-cinema.com` or `www.central-cinema.com`
* program path is canonical `/movie/{slug}`
* ticket URL is canonical `/checkout/showing/{slug}/{numeric_id}`
* contract `structural_validation.passed` is true
* no raw venue evidence of off-site, virtual, partner, or ambiguous location

Reject (completeness-affecting):

* external / unapproved hosts
* checkout slug ≠ program slug
* checkout numeric ID ≠ `source_showtime_id`
* missing ticket URL
* off-site / partner / virtual / ambiguous / unknown explicit venue labels
* missing structural venue proof

## Program identity

| Concept | Rule |
|---------|------|
| Program ID | Canonical `/movie/` slug → `attributes.source_film_id` / `source_program_id` |
| Title | Exact schema.org / occurrence title → `title_raw` only; never identity |
| Program URL | Preserved on `source_film_url` and in the full contract |

Title changes, punctuation, and capitalization do not alter the slug.

## Showtime identity

| Concept | Rule |
|---------|------|
| Showing ID | Mandatory numeric checkout ID → `RawShowtime.source_showtime_id` + attributes |
| Duplicate key | `(source, source_showtime_id)` |
| Exact duplicate | Same ID + same program/theater/date/time/ticket → keep first |
| Conflicting ID | Different program/date/time/theater facts for one ID → unsafe; do not emit either as separate performances (contract validation also rejects cross-key conflicts) |
| Same date/time, different IDs | Retain both |
| Composite fallback | **Never** generated |

Recover with `source_showtime_id_from_raw` (`reel_seattle.source_identity`).

## Field mapping

| Contract field | Mapped destination |
|----------------|-------------------|
| `source` | log `source` = `central_cinema` |
| `source_program_id` | `attributes.source_film_id` / `source_program_id` |
| `source_showtime_id` | `source_showtime_id` + attributes |
| `source_title` | `title_raw` (conservative whitespace only) |
| `source_program_url` | `source_film_url` |
| `source_occurrence_url` | attributes + occurrence context |
| `ticket_url` | `ticket_url_raw` + attributes (not public emit) |
| `theater_id` | must be `central-cinema`; raw theater name `Central Cinema` |
| `local_date` | `date_raw` (`mm/dd/yyyy`) |
| `local_time` | unambiguous `h:mm AM/PM` via `format_time_display` |
| `timezone` | must be `America/Los_Angeles` |
| runtime | `runtime_raw` when valid positive minutes |
| credible `release_year` / `copyrightYear` (via contract raw) | `attributes.release_year` |
| `dateCreated` | contract-only — **never** year |
| description / cast / directors / genre / presentation prose | contract-only |
| windows / structural checks | Option C diagnostics |

## Option C log envelope

```text
schema_version, generated_at, source
independent_source_result   ← full sanitized contract
mapping                     ← status, restate_safe, warnings, rejects
records[]                   ← RawShowtime dicts
stats / warnings / errors   ← scrape-log compatible
```

Deterministic serialization: `serialize_central_cinema_mapping_log`.  
This task does **not** write `data/daily_logs/`.

### Mapping statuses (internal)

* `success`
* `success_with_warnings`
* `unsafe`
* `failure`

## Final restatement safety

```text
final_restate_safe =
  contract.restate_safe
  AND mapping completed (not failure)
  AND no completeness-affecting venue / showing-ID rejects
  AND no conflicting showing-ID duplicate
  AND accepted records serialize correctly
```

Rules:

* Unsafe contract remains unsafe (mapping never upgrades)
* Mapping may downgrade safe → unsafe
* Optional metadata omissions (runtime, year, `dateCreated`) do not downgrade safety
* Missing / malformed showing IDs and screening-like venue rejects do downgrade safety

Restatement is **not** invoked by P-17C.

## Parser compatibility

Existing indie scrape-log loader reads `records[]` from the Option C envelope.  
`raw_showtime_to_legacy_row` converts mapped records without history writes.  
`central_cinema` is not yet added to `raw_showtimes_to_legacy_rows` production source dispatch (P-17D/E).

## Offline CLI

```bash
python scripts/map_central_cinema_contract_to_indie.py \
  --input tests/fixtures/ingestion/independent_contract/central_success.json \
  --output local-output/central-cinema-mapping/central_cinema_log.json
```

No network. Explicit output path. No Git operations. Do not default to production log paths.

## Non-production status

P-17E enables scheduled Central collection. Manual CLI/workflow remain available for audits.

Tracked daily logs: `data/daily_logs/YYYY-MM-DD_central_cinema.json`.

## Prerequisites for P-17E

Complete.

## History source_showtime_id

Additive nullable history column (P-17E). Central rows receive the numeric checkout ID. Existing sources remain empty unless already available on the scrape path (e.g. AMC going forward). No guessed backfills.
