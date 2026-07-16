# Northwest Film Forum Ingestion Prototype

**Status:** Non-production prototype (P-16D)  
**Contract:** Independent source observation contract `v1.0.0`  
**Package:** `reel_seattle.prototypes.nwff`  
**CLI:** `scripts/prototype_nwff_ingestion.py`  
**Last updated:** 2026-07-15 (P-16E)

## Purpose

Prove that Northwest Film Forum (NWFF) calendar + `/films/` pages can emit a contract-compliant `IndependentSourceResult` without touching production history, the theater registry, SIFF/Beacon adapters, or the daily workflow.

Guiding principle: different extraction strategies, one explicit ingestion contract.

## Source strategy

| Concern | Authority |
|---------|-----------|
| Discovery | NWFF calendar pages (`/calendar/?start=YYYY-MM-DD`) |
| Showtimes | Calendar occurrences only |
| Program identity | Canonical `/films/{slug}/` |
| Program metadata | Each distinct film page, fetched once |
| Detail schedules | Validation / diagnostics only (never unioned) |

## Calendar traversal

Live NWFF calendar pages are **week views**. A `start` query lands on the week containing that date. Headings look like `Jul 14 - 20` or `Jul 28 - Aug 3`.

Prototype behavior:

1. Request weekly starts covering the inclusive requested window (advance by 7 days).
2. Parse each page’s represented date span from the heading and/or occurrence dates.
3. Deduplicate overlapping occurrences across pages.
4. Filter accepted showtimes to the exact requested window.
5. Set `inspected_window.complete=true` only when every requested day is covered and no required calendar page failed.

## Program identity

* `source_program_id` = `/films/` slug (example: `asco-without-permission`)
* Normalize protocol, host, trailing slash; strip query/fragment
* Reject film-classified rows without a canonical `/films/` URL
* Never use normalized title as identity

## Showtime identity

NWFF does not expose a stable source-owned performance ID in the inspected HTML.

* `source_showtime_id = null`
* Fallback strategy: `composite_program_theater_datetime`  
  (`program_id + theater_id + local_date + local_time`)
* Collisions retain both rows, store a discriminator in `raw`, and emit a warning

## Exact titles

* Showtime `source_title` = calendar-displayed title (whitespace only)
* Program `source_title` = film-page title
* Material mismatches set `raw.title_differs_from_program=true` and emit a warning
* Prefixes such as `Staff Selects -` are preserved

## Classification

* Accept film / shorts / special presentation calendar items with `/films/` links
* Reject workshops when source classification (or `/education/workshops/` path) is reliable
* Do not auto-reject unknown categories that still resolve to `/films/`

## Locations / theater ID

Planned non-production theater ID:

```text
northwest-film-forum
```

This ID is **not** in `data/theaters.json`. Validation uses the contract’s planned fixture theater set. Unknown/off-site location labels are rejected (completeness-affecting) and are never silently mapped to NWFF.

## Completeness / status

| Status | When |
|--------|------|
| `success` | Full calendar coverage, structure OK, material program pages OK, accepted showtimes present, `restate_safe=true` |
| `valid_empty` | Full coverage + structure OK + zero accepted screenings + `valid_empty_evidence.proven=true` |
| `partial_failure` | Missing page, incomplete coverage, program-page failure, or completeness-affecting reject |
| `structural_failure` | Expected calendar structure absent |
| `request_failure` | Initial required calendar request fails |

Detail/calendar schedule mismatches warn but do not by themselves mark the scrape unsafe when calendar coverage is otherwise complete.

## CLI

### Fixture (offline)

```bash
python scripts/prototype_nwff_ingestion.py \
  --start-date 2026-07-14 \
  --end-date 2026-07-20 \
  --fixture-dir tests/fixtures/adapters/nwff \
  --output-dir local-output/nwff-prototype
```

### Live (read-only)

```bash
python scripts/prototype_nwff_ingestion.py \
  --start-date 2026-07-15 \
  --end-date 2026-07-28 \
  --live \
  --output-dir local-output/nwff-prototype
```

Writes only under the requested ignored output directory:

* `nwff_independent_source_result.json`
* `nwff_prototype_summary.json`

## Known limitations

* Theater ID is planned / non-production only
* No production restatement path
* Auditorium-level screens not modeled if NWFF later exposes them
* Detail prose schedule parsing is best-effort diagnostics
* Live HTML markup drift can cause structural or partial failure

## Production-integration design

Design complete: [nwff-production-integration-design.md](./nwff-production-integration-design.md) (P-16E).

Summary of chosen direction:

* One registry theater: `northwest-film-forum`
* Accept main venue only; reject off-site/online
* Contract → validated scrape log (full result + RawShowtime records) → indie restatement
* Slug identity via history `source_film_id`; no history-schema change for v1
* 14-day Pacific window; source-wide restatement when `restate_safe`
* First implementation: **P-16F** (registry + mapping; no daily workflow)

## Production-integration prerequisites

Before production NWFF ship (see design for details):

1. Add `northwest-film-forum` and extend theaters `source` enum with `nwff`
2. Confirm off-site exclusion (product default: exclude)
3. Keep calendar as sole showtime authority
4. Wire pipeline_report / showtimes `source` enums for `nwff`
5. Soft-fail isolation + stale retention

Do **not** treat this prototype alone as production-ready ingestion.
