# Beacon minimal alignment (P-19A)

**Status:** Complete  
**Date:** 2026-07-17  
**Scope:** Exact title preservation, requested-window year inference, program/showtime identity, Astro markup discovery — without rewriting Beacon onto IndependentSourceResult.

## Why this change

P-16A documented Beacon drift. Live evidence after mid-July 2026 also showed the public site had moved to Astro markup, so the legacy discovery regex and `showtime_item` parser returned empty scrapes even though the calendar still listed films.

## Corrections

### Exact source title

* Removed destructive `.title()`.
* Prefer `<h1>` text; fall back to document title split on `|` / em dash.
* Cleanup is limited to HTML unescape, trim, and whitespace collapse via `normalize_exact_source_title`.
* Live source titles are often all-caps (e.g. `WELCOME II THE TERRORDOME`); that casing is preserved.

### Year / date inference

* Stopped assigning the scraper run year unconditionally.
* Shared helper: `reel_seattle.normalize.year_window.infer_year_for_month_day` (also used by Central).
* Explicit source year wins when valid.
* Omitted year → unique in-window candidate only; ambiguous / malformed / unresolvable dates warn and block restatement.
* Outside-window dates are skipped (not guessed) and do not count as valid-empty proof.

### Requested window

* Production still passes `build_default_indie_fetch_context` (~run date through +365 days) into Beacon.
* Year inference uses that window; the adapter does not silently infer from run date alone.
* Narrower production windows remain a future cleanup; documented here only.

### Program identity

* `source_program_id` / history `source_film_id` = canonical `/calendar/movie/{slug}`.
* Canonical URL preserved on `source_film_url` and in attributes.
* Identity does not depend on title.

### Showtime identity

* **Found:** stable source-owned IDs on current film pages as `data-inventory-id` (matches calendar `?showtime=` query values).
* Mapped to nullable history `source_showtime_id` for new/future rows.
* Some program pages (e.g. special events) expose a showtime label **without** a buy button / inventory id — `source_showtime_id` stays null; no ID is invented.
* Legacy `data-value` (old markup) is retained only as `attributes.beacon_data_value` evidence and is **not** promoted to `source_showtime_id`.
* No positional or title-derived IDs are invented.

### Markup / discovery (necessary for production)

* Calendar discovery accepts relative `/calendar/movie/{slug}` hrefs (and legacy absolute URLs), canonicalized without query strings.
* Film authority parses `.showtime-row` / `data-inventory-id` (with legacy `showtime_exists` fallback).
* Duplicate calendar links to the same slug fetch once.

## Completeness / restatement (unchanged policy)

* Beacon remains **source-wide**.
* Safe success → future restatement proceeds; past rows untouched.
* Unsafe / partial / suspicious empty → stale futures retained.
* Valid empty still requires all discovered program pages OK with zero showtimes and no unresolved in-scope occurrence failures.
* Title or year defects are never reclassified as valid empty.

## History / public

* No public schema shape change.
* No pipeline-report schema change.
* New/future Beacon rows get exact titles, corrected dates, `source_film_id`, and `source_showtime_id` when present.
* Historical past rows are not rewritten in this task.
* Stale **future** mutated titles (e.g. `Welcome Ii The Terrordome`) are replaced on the first safe restatement after deploy.

## Remaining gaps

* Beacon is not on the full IndependentSourceResult / Option C envelope.
* Theater-/program-slice restatement still Planned.
* Production requested window remains a broad ~365-day `FetchContext` argument.
* SIFF alignment is a separate task.
* Poster / ticket URL capture still minimal (buy buttons use `href="#"`).

## Validation

See tests in `tests/adapters/test_beacon.py` and completeness/restate coverage in `tests/test_indie_restate_completeness.py`.
