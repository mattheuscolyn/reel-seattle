# Beacon minimal alignment (P-19A)

**Status:** Complete (production accepted)  
**Date:** 2026-07-17  
**Scope:** Exact title preservation, requested-window year inference, program/showtime identity, Astro markup discovery — without rewriting Beacon onto IndependentSourceResult.

## Implementation commits

| Commit | Purpose |
|--------|---------|
| `00dba32` | Align Beacon title identity and dates |
| `dc02ce2` | Prefer scrape date for anniversary year ambiguity (365-day inclusive window) |

## Production validation

| Run | Workflow | Generated-data | Result |
|-----|----------|----------------|--------|
| Attempt 1 (unsafe) | [29560097433](https://github.com/mattheuscolyn/reel-seattle/actions/runs/29560097433) | `a579a5f` | `restate_safe=false` — Jul 17 month/day ambiguous in inclusive 365-day window; futures retained |
| First safe | [29560435915](https://github.com/mattheuscolyn/reel-seattle/actions/runs/29560435915) | `e622867` | Success; future restated; exact titles + IDs |
| Second safe | [29560665893](https://github.com/mattheuscolyn/reel-seattle/actions/runs/29560665893) | `f82ac24` | Success; slug/ID sets identical; no history churn |

### First safe run metrics (2026-07-17)

* Requested window: `2026-07-17` … `2027-07-17`
* Discovered programs: 39; pages fetched: 39 (once each)
* Accepted records: 84
* `source_film_id` (slug): 84/84 (39 unique)
* `source_showtime_id` (inventory): 82 non-null, 2 null (no invented IDs)
* Duplicate inventory IDs / composites: none
* `restate_safe=true`, warnings empty
* Pipeline: Beacon `status=success`, `last_successful_run=2026-07-17`

### Exact-title correction

* Before: future history still had mutated titles such as `Welcome Ii The Terrordome`, `Exorcist Ii: The Heretic`, `Mikey And Nicky`.
* After first safe restatement: those future rows use exact source casing (`WELCOME II THE TERRORDOME`, etc.) with slugs/inventory IDs.
* Past rows were not rewritten (none of the known `Ii` future mutations remained as past-only samples in the audited slice).
* Public `source_title` carries exact casing; display `film_title` may still use existing emit normalization (no new `.title()` adapter mutations; no `Ii` artifacts).

### Second run

* 84 records; 39 slugs; 82 inventory IDs; 2 nulls — identical to first safe run
* History CSV unchanged in the second generated-data commit (restatement stable, not append)
* CI green on implementation pushes; validators OK in workflow; Pages deploy green for implementation commits

## Why this change

P-16A documented Beacon drift. Live evidence after mid-July 2026 also showed the public site had moved to Astro markup, so the legacy discovery regex and `showtime_item` parser returned empty scrapes even though the calendar still listed films.

## Corrections

### Exact source title

* Removed destructive `.title()`.
* Prefer `<h1>` text; fall back to document title split on `|` / em dash.
* Cleanup is limited to HTML unescape, trim, and whitespace collapse via `normalize_exact_source_title`.
* Live source titles are often all-caps (e.g. `WELCOME II THE TERRORDOME`); that casing is preserved in raw/history/`source_title`.

### Year / date inference

* Stopped assigning the scraper run year unconditionally.
* Shared helper: `reel_seattle.normalize.year_window.infer_year_for_month_day` (also used by Central).
* Explicit source year wins when valid.
* Omitted year → unique in-window candidate; if multiple candidates and `scrape_date` itself is one of them, prefer scrape date (needed for inclusive ~365-day windows whose end shares the run month/day).
* Otherwise ambiguous / malformed / unresolvable dates warn and block restatement.
* Outside-window dates are skipped (not guessed) and do not count as valid-empty proof.

### Requested window

* Production still passes `build_default_indie_fetch_context` (~run date through +365 days) into Beacon.
* Year inference uses that window; the adapter does not silently infer from run date alone (except the scrape-date preference above when it is an in-window candidate).
* Narrower production windows remain a future cleanup; documented as a remaining architectural limitation.

### Program identity

* `source_program_id` / history `source_film_id` = canonical `/calendar/movie/{slug}`.
* Canonical URL preserved on `source_film_url` and in attributes.
* Identity does not depend on title.

### Showtime identity

* **Found:** stable source-owned IDs on current film pages as `data-inventory-id` (matches calendar `?showtime=` query values).
* Mapped to nullable history `source_showtime_id` for new/future rows.
* Some program pages (e.g. special events) expose a showtime label **without** a buy button / inventory id — `source_showtime_id` stays null; no ID is invented. Live production: 2 of 84 rows.
* Legacy `data-value` (old markup) is retained only as `attributes.beacon_data_value` evidence and is **not** promoted to `source_showtime_id`.
* No positional or title-derived IDs are invented.
* Public emit continues to leave `source_showtime_id` null on showtimes (existing Identity-B emit behavior; not newly exposed).

### Markup / discovery (necessary for production)

* Calendar discovery accepts relative `/calendar/movie/{slug}` hrefs (and legacy absolute URLs), canonicalized without query strings.
* Film authority parses `.showtime-row` / `data-inventory-id` (with legacy `showtime_exists` fallback).
* Duplicate calendar links to the same slug fetch once.
* Astro discovery recovered production from multi-day empty scrapes.

## Completeness / restatement (unchanged policy)

* Beacon remains **source-wide**.
* Safe success → future restatement proceeds; past rows untouched.
* Unsafe / partial / suspicious empty → stale futures retained (demonstrated by attempt 1).
* Valid empty still requires all discovered program pages OK with zero showtimes and no unresolved in-scope occurrence failures.
* Title or year defects are never reclassified as valid empty.

## History / public

* No public schema shape change.
* No pipeline-report schema change.
* New/future Beacon rows get exact titles, corrected dates, `source_film_id`, and `source_showtime_id` when present.
* Historical past rows are not rewritten in this task.
* Stale **future** mutated titles were replaced on the first safe restatement after deploy.

## Remaining gaps

* Beacon is not on the full IndependentSourceResult / Option C envelope.
* Restatement remains source-wide (not theater-/program-slice).
* Production requested window remains a broad ~365-day `FetchContext` argument.
* Two current live rows lack source-owned showtime IDs (null retained).
* Past historical title mutations (if any outside the restated future window) remain unchanged by design.
* SIFF alignment is a separate task.
* Poster / ticket URL capture still minimal (buy buttons use `href="#"`).

## Validation

See tests in `tests/adapters/test_beacon.py` and completeness/restate coverage in `tests/test_indie_restate_completeness.py`.
