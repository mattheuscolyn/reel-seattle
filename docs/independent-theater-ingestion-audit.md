# Independent Theater Ingestion Audit (P-16A)

**Status:** Complete (read-only)  
**Track:** Data Foundation · Independent-theater ingestion  
**Last updated:** 2026-07-15 (P-16B follow-up)  
**Guiding principle:** Different extraction strategies, one explicit ingestion contract.  
**Related:** [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [SCRAPING_README.md](../SCRAPING_README.md) · [data-artifact-inventory.md](./data-artifact-inventory.md)

This document began as a read-only audit (P-16A). **P-16B** implemented the partial-failure / structural-empty restatement guard described below; it did **not** implement the full shared source-observation contract, NWFF/Central scrapers, or theater-slice restatement.

---

## Executive summary

SIFF and The Beacon share a loose legacy indie path (HTML discovery → film pages → `RawShowtime` → daily JSON log → source-wide today+future history restatement → public emit). They do **not** share an explicit ingestion contract.

Confirmed strengths:

* Source-scoped restatement isolates SIFF from Beacon.
* Empty incoming scrapes with existing future history skip restatement (stale retention).
* SIFF correctly resolves three registry theaters when venue names match.
* Exact-ish titles reach history via `title_raw` / `source_title` (with Beacon mutation noted below).
* `source_film_url` is retained in scrape logs.

Confirmed drift and risks:

1. **No source program or showtime IDs** — identity collapses to title + theater + date + time.
2. **`source_film_url` is dropped** before history/CSV (`raw_showtime_to_legacy_row`).
3. **Forward window is unused** — adapters ignore `FetchContext.window_*`; public emit truncates to 14 days independently.
4. **Year handling is unsafe** — Beacon always uses run year; SIFF falls back to the first `\d{4}` anywhere on the page when the date header omits a year.
5. **Beacon mutates titles** with `.title()` (e.g. `II` → `Ii` in live logs).
6. **Empty vs failure vs broken page are not distinguished** — Beacon has returned **0 records with 0 warnings** for multiple consecutive days while pipeline report still shows `success` from preserved history.
7. **Partial film-page failure still restated** (P-16A) — **mitigated in P-16B** via `restate_safe=false` on any failed SIFF program page.
8. **Restatement is source-wide, not theater-scoped** — one SIFF wipe covers Downtown + Uptown + Film Center together (**still true**; P-16B retains conservatively).
9. **SIFF `screening-*` HTML IDs and Beacon `data-value` are discarded** — natural showtime identity candidates unused.
10. **No adapter-level dedup**; structural validation is minimal (P-16B adds listing/calendar structure checks + completeness stats only).

**P-16B shipped:** restatement eligibility from scrape completeness metadata.  
**P-16C shipped:** shared observation contract v1.0.0 — see [independent-source-observation-contract.md](./independent-source-observation-contract.md).  
**Recommended next:** prototype Northwest Film Forum against the contract (fixtures + live read-only validation), without production integration.

---

## P-16B restatement-safety rule (implemented)

> A source may replace future rows only when `stats.restate_safe` is true.

### SIFF

* Counts: `discovered_programs`, `program_pages_succeeded`, `program_pages_failed`, `failed_program_urls`.
* **Any** failed discovered program page → `scrape_status=partial_failure`, `restate_safe=false`.
* Parsed rows may still appear in the daily JSON log for inspection.
* Later complete scrapes (`restate_safe=true`) resume normal restatement.

### Beacon

* Calendar structure markers required; zero showtimes with **zero discovered movie links** is **suspicious empty** (not valid empty).
* Valid empty requires structure present, discovered > 0, all pages succeeded, zero showtimes.
* Suspicious empty / structural / request failure → retain prior futures.

### Shared

* Source-wide scope unchanged.
* Past rows never removed.
* SIFF/Beacon isolation unchanged.
* Old JSON without `restate_safe` → conservative skip when future history exists.
* CSV-only path → legacy empty-incoming guard only.
* Pipeline diagnostics derive incompleteness warnings; publish freshness may still show retained rows as `success` until they age out of the window — incomplete scrapes do not advance history `last_updated` via restatement.

---

## Registry identities

| Registry `id` | Display name | `source` | Notes |
|---------------|--------------|----------|-------|
| `siff-cinema-downtown` | SIFF Cinema Downtown | `siff` | No aliases |
| `siff-cinema-uptown` | SIFF Cinema Uptown | `siff` | No aliases |
| `siff-film-center` | SIFF Film Center | `siff` | No aliases |
| `the-beacon` | The Beacon | `beacon` | Alias: `Beacon` |

Source organization IDs in pipeline/history: `siff`, `beacon`.

---

## Module map

| Role | SIFF | Beacon | Shared |
|------|------|--------|--------|
| Adapter | `reel_seattle/adapters/siff.py` | `reel_seattle/adapters/beacon.py` | `base.py`, `indie_legacy.py`, `scrape_log.py` |
| CLI / orchestration | `webscrapetheaters.py` → `run_daily_scraping.py` | same | |
| Restatement | `daily_processor.process_indie_csv_data` | same loop, independent source | `INDIE_RESTATE_SOURCES = ("siff", "beacon")` |
| Theater resolve | at history enrich / emit | same | `normalize/theaters.py` |
| Freshness / report | `source_freshness.py` → `pipeline_report.py` | same | statuses: `success` / `stale` / `empty` |
| Tests | `tests/adapters/test_siff.py` | `tests/adapters/test_beacon.py` | `test_daily_processor_indie_restate.py`, `test_indie_legacy.py` |
| Fixtures | `tests/fixtures/adapters/siff_*.html` | `beacon_*.html` | |
| Logs | `data/daily_logs/*_siff.json` | `*_beacon.json` | |

---

## End-to-end path

```text
source page/API (HTML only)
    ↓ discovery (listing / calendar)
film/program detail HTML  ← showtime authority
    ↓ parse → RawShowtime
daily scrape JSON log (+ optional legacy indie CSV)
    ↓
history restatement (today+future, per source)
    ↓
public showtimes_current (14-day window) + pipeline_report
```

Neither source uses a showtimes API. Neither writes into the AMC source-catalog path.

---

## Behavior matrix

| Topic | SIFF | Beacon | Drift / concern | Proposed shared rule |
|-------|------|--------|-----------------|----------------------|
| Discovery method | GET `/cinema/in-theaters`; harvest `/cinema/in-theaters/*` and `/programs-and-events/*` links | GET `/calendar`; regex-extract `/calendar/movie/...` URLs from HTML/JS strings | Different HTML strategies (OK) | Allow source-specific discovery; require explicit discovery vs authority roles |
| Showtime authority | Film/program page `div.day` / `a[id^=screening-]` | Film page `div.showtime_item...showtime_exists` + `data-value` | Both detail-page authoritative | Declare showtime authority explicitly; do not merge calendar+detail occurrences without conflict rules |
| Program/detail authority | Same film page (title, runtime, poster, schedule) | Same film page (title, runtime, schedule; no poster) | Beacon drops poster | Separate metadata authority; preserve URL |
| Source organization ID | `siff` | `beacon` | Aligned | Required `source` |
| Source program ID | **None** (URL only in scrape log) | **None** (URL only in scrape log) | Both lack durable program ID | Require `source_program_id` (slug/URL path when no numeric ID) |
| Source showtime ID | **None** (`screening-*` discarded) | **None** (`data-value` discarded) | Both discard candidates | Prefer source-owned ID when present; else nullable + composite fallback |
| Exact source title | `soup.title.string` as-is | `title.split(" \| ")[0].title()` | Beacon mutates casing | Preserve exact displayed title; normalize only for display keys |
| Source page URL | `source_film_url` in logs | same | Dropped before history | Required on observations; survive into source-observation layer |
| Ticket URL | Not extracted | Not extracted | Both missing | Optional nullable `ticket_url` |
| Canonical theater resolution | Venue string from page → resolve at history/emit | Hardcoded `The Beacon` | SIFF unknown → `Unknown Venue` → unresolved | Require resolved `theater_id` before production accept |
| Local timezone | Wall-clock Pacific assumed; registry TZ | same | No explicit TZ on rows | Require `America/Los_Angeles` local date/time fields |
| Forward-window behavior | Context sets 365d; **adapter ignores it** | same | Over-fetch everything on film pages | Return `requested_window` + `inspected_window` proof |
| Year rollover | Header year if present; else first page `\d{4}` or run year | **Always run year** | Beacon Dec→Jan unsafe; SIFF release-year confusion | Shared rollover tests; never use release year as show year |
| Duplicate detection | None in adapter | None | Restate full replace | Source showtime ID first; else composite key |
| Valid empty schedule | Indistinguishable from soft failure | Recent logs: 0 rows, 0 warnings for multiple days | Critical | Empty erase only with structural+window proof |
| Broken-page detection | Listing HTTP fail → warning + 0 rows | Calendar HTTP fail → warning + 0 rows | Success with empty structure unmarked | Structural checks required |
| Partial failure | Failed film URL → warn + continue; restate still runs | same | **Can wipe missing films** | Partial failure must not erase uninspected slices |
| Stale-data retention | Skip restate if incoming future=0 and existing future>0 | same | Also blocks true valid-empty clears | Explicit statuses; valid_empty vs failure |
| Future-window restatement | Source-wide today+future for all SIFF theaters | Source-wide for Beacon | SIFF venue failure not isolated | Prefer theater-scoped or slice-scoped restate |
| Warnings | Film fetch failures | Film fetch failures | Empty Beacon often silent | Always emit structural/empty diagnostics |
| Pipeline source status | Derived from **current artifact** counts, not scrape emptiness | same — can show `success` while scrape is empty | Reporting lag (`last_successful_run` may lag) | Report scrape status separately from publish freshness |
| Raw metadata preservation | runtime, poster, URL in logs | runtime, URL; poster usually null | History loses URL | Source-observation layer keeps raw blob |
| Program/event handling | Listing includes programs-and-events URLs | Calendar movies only | SIFF mixes programs/events into same path | Allow non-feature types; do not force film identity |

---

## Identity findings

### Source organization

Stable: registry `source` field and restatement keys `siff` / `beacon`.

### Source program identity

| | Current | Origin | Stability | Risk |
|-|---------|--------|-----------|------|
| SIFF | *(empty `source_film_id`)* | URL path available as `source_film_url` in logs only | URL slug likely stable | Lost after log → history |
| Beacon | *(empty)* | `/calendar/movie/{slug}` in logs only | Slug likely stable | Lost after log; `.title()` titles used for keys |

`source_film_id_from_raw` only reads AMC-oriented attribute keys. Indie adapters never set `attributes`.

**Normalized title is effectively the primary film key** for public cards (`showtime_film_key`), not a source-owned program ID. Distinct programs with similar titles can collide after normalization; series/event wording may be stripped for parent inference elsewhere in film-identity analysis (not at scrape time).

### Source showtime identity

| | Candidate in HTML | Stored? | Public ID |
|-|-------------------|---------|-----------|
| SIFF | `a[id^=screening-…]` | No — used only to find time text | Hash of theater+date+time+film_key |
| Beacon | `data-value` on showtime div | No | Same synthetic hash |

Canceled/updated performances cannot retain vendor identity because none is captured.

### Title identity stress

Observed SIFF titles that stress conventional film identity (2026-07-16 log): restorations/formats (`The American Astronaut (35mm)`), festivals (`Emerald City Short Film Festival`, `CatVideoFest 2026`), NT Live events, shorts programs. These flow through as ordinary showtimes with no program-type field.

Observed Beacon titles (2026-07-12 last non-empty): `.title()` artifacts (`Welcome Ii The Terrordome`, `Take Care Of My Cat`, `Mikey And Nicky`) and venue rental (`Rent The Beacon`).

---

## Exact source title audit

| Stage | SIFF | Beacon |
|-------|------|--------|
| Page title | Document `<title>` | Document `<title>` before `\|` |
| Mutation | None | `.title()` — **destructive for acronyms/Roman numerals** |
| Scrape log `title_raw` | Exact | Mutated |
| History `Film` / `source_title` | From `title_raw` | Mutated |
| Public `film_title` / `source_title` | Normalized display + source_title | Same pipeline |

Recommendation: stop mutating at parse time (future alignment task). Preserve exact title on the observation; apply display normalization only downstream.

---

## Source-native metadata survival

| Field | Scrape log | History | Public current |
|-------|------------|---------|----------------|
| Exact/mutated title | yes | yes | yes |
| Runtime | yes | yes | yes |
| Poster | SIFF often; Beacon rare | yes if present | yes |
| `source_film_url` | **yes** | **no** | **no** |
| `source_showtime_id` | null | empty | null |
| `source_film_id` | n/a | empty | null |
| Ticket URL | no | no | no |
| Description / director / series / accessibility | no | no | no |
| Format / event notes | only if embedded in title | title only | title only |
| Screening HTML id / data-value | discarded | — | — |

**Future source-observation layer should preserve:** exact title, program URL/slug as `source_program_id`, optional showtime id, theater_id, local date/time, ticket URL, raw HTML-derived metadata blob, scrape/validation status. Do not dump all of this into current history CSV.

---

## Showtime authority recommendation

| Role | SIFF | Beacon | Future NWFF/Central |
|------|------|--------|---------------------|
| Discovery | In-theaters listing | Calendar HTML | Calendar (planned) |
| Showtime authority | Film/program page | Film page | NWFF: calendar occurrence; Central: movie page |
| Metadata authority | Film/program page | Film page | Detail page |
| Validation/fallback | *(none)* | *(none)* | NWFF: detail schedule validates calendar |

Do not combine multiple authorities into one occurrence without recording disagreements.

---

## Theater resolution

* Happens at **history enrichment / emit**, not during HTML parse.
* SIFF: venue string must match registry names exactly (casefold). `SUPPORTED_SIFF_VENUES` is documentation/tests only — **not enforced as an allowlist** during scrape.
* Unknown / `Unknown Venue` → unresolved `theater_id` → skipped from public current; does not delete other venues’ history (unresolved rows lack source mapping for broad delete).
* Beacon: constant `"The Beacon"` → `the-beacon`.

**Shared rule:** observations accepted for production restatement should carry a resolved canonical `theater_id` (or be rejected with a warning). Unknown venues must not silently enter the public artifact.

---

## Time, date, and forward window

* Dates stored as `mm/dd/yyyy` + 12h time strings from pages.
* Timezone: assumed Pacific wall clock; no UTC conversion of showtimes.
* `build_default_indie_fetch_context`: `window_end = run_date + 365 days` — **unused by both adapters**.
* Restatement keeps all today+future (no upper bound).
* Public emit window: **14 days**.

**Year rollover:** no adapter tests for December→January. Normalize-layer year inference exists elsewhere but is **not used** by SIFF/Beacon parsers.

**Shared test requirements (future):**

* December scrape containing January showtimes assigns correct year.
* Date header with explicit year wins over release year on page.
* Requested window filtering (or inspected-window proof when over-fetching).

Conceptual coverage object (not implemented):

```json
{
  "requested_window": { "start": "2026-07-16", "end": "2026-07-30" },
  "inspected_window": { "start": "2026-07-16", "end": "2026-07-30", "complete": true }
}
```

---

## Empty schedule and failure semantics

| Case | Adapter signal today | Restatement | Pipeline report |
|------|----------------------|-------------|-----------------|
| Listing/calendar HTTP non-200 | warning + 0 records | Skip if history has future rows | Current artifact may still `success` from stale history |
| Listing OK, 0 links / 0 showtimes | often **0 warnings** | same skip | same |
| Some film pages fail | warnings + partial records | **Restates** — wipes missing films | may still `success` |
| True valid empty (site open, no shows) | indistinguishable from soft empty | cannot clear futures | stale history remains |

**Confirmed live evidence:** Beacon logs `2026-07-14` … `2026-07-16` have `records: []` and `warnings: []`. Last non-empty Beacon log: `2026-07-12`. Pipeline report (2026-07-15) still lists Beacon `status: success` with showtimes and `last_successful_run: 2026-07-12`.

**Recommended rule (contract):**

> An empty parser result must not erase future showtimes unless the adapter proves that the expected page structure loaded and the requested date range was successfully inspected.

Evidence adapters should provide:

* HTTP success for discovery page(s).
* Expected structural markers present (listing cards / calendar movie URL pattern / showtime container).
* `inspected_window.complete == true` (or explicit incomplete + partial_failure).
* Distinct status: `valid_empty` vs `structural_failure` vs `request_failure` vs `partial_failure`.

Do not change existing status enums in this audit task.

---

## Structural validation (current vs proposed)

**Current:** HTTP 200 check only; no container/card/pagination assertions; no malformed-row rate; `errors` list rarely used.

**Minimum shared validation result (conceptual):**

```json
{
  "passed": true,
  "checks": [
    { "name": "discovery_http_ok", "passed": true },
    { "name": "discovery_structure_present", "passed": true },
    { "name": "inspected_window_complete", "passed": true }
  ]
}
```

Distinguish row-level warnings, partial source failure, and structural source failure.

---

## Duplicate handling

* No dedup in adapters or scrape logs.
* Restatement replaces the entire source future set.
* Public synthetic IDs collide for identical theater/date/time/title rows (duplicate history rows can share an id).

**Recommend:** prefer source-owned performance identity; else stable composite `(theater_id, source_program_id, local_date, local_time)` with explicit duplicate diagnostics.

---

## Partial failure and SIFF multi-venue

SIFF is one source organization → three theater IDs. Restatement is **source-wide**.

Risks:

* One venue’s parse issues affect the shared wipe/replace for all SIFF theaters.
* Failed film pages drop that program’s showtimes for **all** venues on that page.
* Successful theaters/programs overwrite; failed slices are erased rather than retained.

**Recommend (future):** theater-scoped or program-scoped restatement slices; or skip restatement when `failed_film_pages / discovered_film_pages` exceeds a threshold / when warnings indicate incomplete inspection.

---

## Future-window restatement

For each of `siff`, `beacon` independently (`process_indie_csv_data`):

1. Load day’s JSON log (preferred) or filter legacy CSV.
2. If existing future > 0 and incoming future == 0 → **skip** (preserve).
3. Else delete all history rows for that source with `Date >= today`.
4. Re-add all scrape rows with `Date >= today`.
5. Past rows never removed.

Beacon failure does not block SIFF restatement (and vice versa) — covered by tests.

**Gap:** no “valid empty clear”; no partial-failure guard; not theater-scoped for SIFF.

---

## Stale-on-failure vs reporting

| Layer | Behavior |
|-------|----------|
| Restatement | Empty incoming preserves future history |
| Freshness metadata | Based on **published current-window showtimes**, not today’s scrape emptiness |
| Result | Empty Beacon scrape + preserved history → pipeline still `success` |

Recommended conceptual statuses (do not implement here):  
`success`, `success_with_warnings`, `valid_empty`, `partial_failure`, `structural_failure`, `request_failure`.

---

## Pipeline reporting differences

| Field | SIFF | Beacon |
|-------|------|--------|
| Adapter stats | `records_fetched`, `film_pages_scraped`, `venues_found` | `records_fetched`, `film_pages_scraped` |
| Report status | from current artifact | same |
| Scrape warnings | surfaced when present in daily log | often empty even when scrape empty |
| Theater count | 3 when healthy | 1 |

Minimum shared reporting fields (conceptual): `source`, scrape `status`, `requested_window`, `inspected_window`, `observations`, `accepted_showtimes`, `rejected_rows`, `warnings`, `structural_validation`, `stale_data_retained`.

---

## Proposed shared source-observation contract

Smallest useful contract — **required** vs **optional**.

### Required

| Field | Notes |
|-------|-------|
| `source` | Stable org id (`siff`, `beacon`, …) |
| `source_program_id` | Slug/path/numeric; **not** normalized title |
| `exact_source_title` | Unmutated |
| `source_program_url` | Detail/canonical program URL |
| `theater_id` | Canonical registry id (resolved) |
| `local_date` / `local_time` | `America/Los_Angeles` |
| `timezone` | Explicit |
| `scrape_timestamp` | |
| `requested_window` / `inspected_window` | With `complete` flag |
| `status` | Adapter-level outcome |
| `structural_validation` | Pass/fail + checks |
| `warnings` | |
| `raw` | Source-native metadata object |

### Required when available / nullable

| Field | Notes |
|-------|-------|
| `source_showtime_id` | Prefer over composites |
| `ticket_url` | Showtime-specific when possible |
| `source_occurrence_url` | |
| `runtime_minutes` | |
| `poster_url` | |
| `program_kind` | feature / shorts / event / rental / unknown |
| `rejected_rows` | Diagnostics |

### Explicitly not required

* Canonical Reel Seattle `film_id`, TMDB/IMDb IDs  
* Normalized title as identity  
* Release year / director for every program  

**Policy split**

* **Required contract behavior:** identity fields, window proof, empty/failure semantics, theater resolution before accept, stale rules, reporting fields.  
* **Recommended:** theater-scoped restate for multi-venue orgs, ticket URLs, program_kind.  
* **Source-specific:** HTML selectors, schema.org vs calendar JS, pagination.

---

## Shared policy recommendations

1. **Forward window:** adapters must either filter to the requested window or prove over-fetch + filter with `inspected_window`.  
2. **Year rollover:** shared tests; show date year ≠ release year.  
3. **Timezone:** store local Pacific wall times with explicit TZ.  
4. **Duplicates:** source showtime ID first; else composite; log duplicate counts.  
5. **Valid empty:** only clear futures with structural + window proof.  
6. **Structural failure / request failure:** never restate wipe; retain stale.  
7. **Partial failure:** do not erase uninspected programs/venues; prefer slice restate or skip.  
8. **Restatement granularity:** at least per `source`; for SIFF, plan per `theater_id` or per program slice.  
9. **Diagnostics:** scrape status ≠ publish freshness; surface both.

---

## SIFF-specific findings

* One org → three theater IDs; program pages can list multiple venues.  
* Program IDs should span venues (same film URL at Downtown and Uptown).  
* Listing includes `/programs-and-events/` — events already mixed in.  
* `screening-*` IDs are strong unused showtime identity candidates.  
* Venue allowlist not enforced; unknown venues become unresolved.  
* Needs later alignment: program ID from URL, showtime ID from screening anchors, title unchanged (already good), year header preference without page-wide year fallback, theater-scoped or partial-safe restate.

---

## Beacon-specific findings

* Calendar = discovery; film page = authority (aligned with planned Central pattern).  
* Slug in `/calendar/movie/...` is a natural `source_program_id`.  
* **P-19A:** site moved to Astro markup — relative `/calendar/movie/{slug}` hrefs; showtimes on `.showtime-row` with stable `data-inventory-id` (matches calendar `?showtime=`). Legacy `data-value` is no longer authoritative.  
* **P-19A fixed:** `.title()` mutation removed; exact titles preserved.  
* **P-19A fixed:** run-year dating replaced with requested-window year inference (`normalize.year_window`).  
* **P-19A fixed:** slug → `source_film_id`; inventory id → `source_showtime_id` on new/future rows.  
* Pre-P-19A silent empty scrapes came from discovery/parser drift; P-16B stale guard retained futures.  
* Remaining: not on full IndependentSourceResult; theater-slice restate still Planned; production window still ~365-day `FetchContext`.  
* Detail: [beacon-minimal-alignment.md](./beacon-minimal-alignment.md).

---

## Northwest Film Forum fit

Planned model fits the contract cleanly:

| Planned NWFF behavior | Contract field / policy |
|-----------------------|-------------------------|
| Calendar discovery + showtime authority | discovery vs authority roles |
| `/films/` slug as program ID | `source_program_id` |
| One metadata fetch per film | metadata authority |
| Calendar occurrence = showtime | nullable `source_showtime_id` or composite |
| Detail schedule validation | validation/fallback + mismatch warnings |
| Exact title | `exact_source_title` |
| Category exclusions | `program_kind` / reject diagnostics |

**Extra vs today’s SIFF/Beacon:** inspected multi-page calendar coverage; explicit disagreement warnings; category-aware exclusion. Contract should include `inspected_window` across paginated calendars and a `rejected_rows` channel for non-film categories.

---

## Central Cinema fit

| Planned Central behavior | Contract field / policy |
|--------------------------|-------------------------|
| Calendar discovers `/movie/` pages | discovery |
| Movie page authority | showtime + metadata authority |
| Movie slug as program ID | `source_program_id` |
| Checkout numeric segment as showing ID | `source_showtime_id` |
| schema.org by `itemprop` | `raw` metadata |
| Year rollover explicit | shared year policy |
| Description sanitization | `raw` + safe derived fields |
| Screening prose without classification | keep in `raw` / notes |

**Extra vs today’s SIFF/Beacon:** strong native showtime IDs; schema.org; description sanitization policy. Contract should allow rich `raw` without requiring presentation-attribute extraction initially.

---

## Confirmed drift summary

SIFF and Beacon share an **implicit** indie CSV/log pipeline but have drifted in:

* title fidelity (exact vs `.title()`),  
* year inference,  
* venue handling (multi vs single),  
* stats/reporting detail,  
* discovery robustness (Beacon silent empty).

They already share: `RawShowtime` shape, scrape-log envelope, source-wide restate + empty guard, theater resolve timing, lack of program/showtime IDs, unused fetch windows.

---

## Proposed implementation sequence

1. **P-16A** — this audit (`Complete`).  
2. **Dangerous-behavior spike (recommended next):** partial-failure restatement guard (and optionally Beacon structural-empty warnings) — production-safe, narrow.  
3. **Define + test shared source-observation contract** (schemas/fixtures only).  
4. Prototype NWFF against the contract.  
5. Align Beacon only where necessary (title, year, IDs, structure).  
6. Prototype Central.  
7. Align SIFF carefully (IDs, year fallback, theater-scoped restate).  
8. Integrate one new source at a time.

Do **not** start NWFF/Central scrapers in this task.

---

## Log inventory evidence (manual sample)

| Source | Files sampled | Notes |
|--------|---------------|-------|
| SIFF | `2026-07-14`…`16_siff.json` | ~183–191 records/day; all three venues; 100% `source_film_url`; 0 `source_showtime_id` |
| Beacon | `2026-07-14`…`16_beacon.json` | 0 records, 0 warnings |
| Beacon | `2026-07-12_beacon.json` | Last non-empty (~106 rows); title casing artifacts present |

Optional CLI: `python scripts/audit_independent_ingestion.py` writes a gitignored JSON summary under `audit-output/`.

---

## Production impact

No production scraper, restatement, registry, history, public schema, pipeline-report schema, cockpit, frontend, or Pages behavior was changed by this audit.
