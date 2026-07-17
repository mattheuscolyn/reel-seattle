# SIFF minimal alignment (P-20B)

**Status:** Implementation complete — production rollout is P-20C  
**Date:** 2026-07-17  
**Scope:** Exact title preservation, canonical program-path identity, Elevent ShowtimeId capture, requested-window year inference, venue allowlist enforcement, and tighter valid-empty proof — without migrating SIFF onto IndependentSourceResult / Option C.

## Implementation

| Area | Behavior |
|------|----------|
| Adapter | `reel_seattle/adapters/siff.py` |
| Completeness | `decide_siff_completeness(..., affirmative_empty_proof=)` in `indie_completeness.py` |
| Year helper | Shared `reel_seattle.normalize.year_window.infer_year_for_month_day` |
| Docs design | [siff-minimal-alignment-design.md](./siff-minimal-alignment-design.md) |
| Tests | `tests/adapters/test_siff.py`, completeness cases in `tests/test_indie_restate_completeness.py` |

## Corrections

### Exact source title

* Prefer `<h1>`; fall back to document title only with a warning.
* Cleanup is limited to HTML unescape, trim, and whitespace collapse via `normalize_exact_source_title`.
* No `.title()` mutation; punctuation, series wording, format language, numerals, and acronyms are preserved.

### Program identity

* `source_film_id` / `source_program_id` = canonical path without leading slash (e.g. `cinema/in-theaters/wild-inside`, `programs-and-events/cold-war-summer/atomic-blonde`).
* Scheme, host, query, and fragment are stripped; trailing slash normalized.
* Nested event paths are retained in full (not reduced to the final slug).
* Identity does not depend on title. Multi-venue programs share one program ID.

### Showtime identity

* Elevent `ShowtimeId` from `data-screening` and/or `screening-{id}` → nullable `source_showtime_id`.
* Matching dual evidence is accepted; conflicting IDs on one anchor → occurrence failure / unsafe.
* Missing real ID → `null` with a warning; **no synthetic fallback**.
* Identical duplicate DOM observations dedupe by ShowtimeId; conflicting facts under one ID are unsafe.

### Date / year

* Date-header year wins when structurally present.
* **Never** scan the page for the first `\d{4}` (film release / copyright years are ignored).
* Omitted year → shared window helper with scrape-date preference for inclusive ~365-day anniversary ambiguity.
* Malformed / outside-window / ambiguous dates with in-scope screenings → structured warning + occurrence failure → `restate_safe=false`.

### Requested window

* Production still uses `build_default_indie_fetch_context` (~run date through +365 days).
* P-20B does not narrow that window; broad-window anniversary ambiguity remains a documented limitation.

### Venue allowlist

* Accept only registry names: SIFF Cinema Downtown, SIFF Cinema Uptown, SIFF Film Center.
* Strip trailing `House N` suffixes from labels; map to theater IDs `siff-cinema-downtown` / `siff-cinema-uptown` / `siff-film-center` in raw attributes.
* Unknown, off-site, partner, virtual, or missing venue labels reject with occurrence failure (no silent default).

### Valid empty / completeness

* Zero discovered programs requires **affirmative empty listing proof** (explicit empty-schedule copy) — bare empty selectors are structural failure.
* All discovered program pages OK with zero showtimes → valid empty (source-wide clear).
* Parent/series `programs-and-events/*` pages with no `div.day` are classified `parent_event` (not a failure).
* Occurrence failures (venue/date/ID) force `restate_safe=false` even when program GETs succeeded.
* Restatement remains **source-wide** (unchanged P-16B Option A).

## Non-production live validation (2026-07-17)

Two consecutive live fetches (no tracked log write, no history restatement):

| Metric | Run 1 | Run 2 |
|--------|-------|-------|
| `restate_safe` | true | true |
| `scrape_status` | success | success |
| Discovered programs | 67 | 67 |
| Accepted records | 198 | 198 |
| Unique program IDs with showtimes | 40 | 40 |
| Elevent ShowtimeIds | 198 / 198 | 198 / 198 |
| Null showtime IDs | 0 | 0 |
| Venues | Downtown, Uptown, Film Center | same |
| Parent event pages | 9 | 9 |
| Program-page failures | 0 | 0 |
| Occurrence failures | 0 | 0 |

Observed:

* Multi-venue: `cinema/in-theaters/wild-inside`
* Nested event paths: Art House Theater Day / Cold War Summer children
* Format/series titles preserved (e.g. `Cold War Summer: GoldenEye (35mm)`, `BFDI & Inanimate Insanity 2026 Tour`)
* Repeated-run film ID sets, ShowtimeId counts, venues, and record counts identical

## History / public (expected at P-20C)

* No public schema or pipeline-report schema change in P-20B.
* When production restates safely: future SIFF rows receive `source_film_id`, `source_showtime_id` (when present), exact titles, corrected dates, and allowlisted venues.
* Past history is not backfilled in this task.
* Source program paths and Elevent IDs are not newly exposed on public showtimes.

## Remaining gaps / rollout risks

* SIFF is still not on IndependentSourceResult / Option C.
* Restatement remains source-wide (not venue- or program-slice).
* Broad ~365-day indie window retained.
* ShowtimeId longevity across schedule edits must be confirmed on the first two production days (P-20C).
* House-only labels (if SIFF stops emitting parent venue names) would need alias expansion.
* Production rollout and acceptance are **P-20C** — this task did not change scheduled workflow outputs or tracked production artifacts.

## Validation

```text
python -m pytest tests/adapters/test_siff.py tests/test_indie_restate_completeness.py -q
```
