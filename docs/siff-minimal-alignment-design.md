# SIFF Minimal Alignment Design (P-20A)

**Status:** Design complete — implemented in P-20B (see [siff-minimal-alignment.md](./siff-minimal-alignment.md)); production rollout is P-20C  
**Track:** Data Foundation · Independent-theater ingestion  
**Date:** 2026-07-17  
**Depends on:** P-16A/B/C, P-19A Beacon production acceptance  
**Next:** P-20C (production rollout + acceptance)

## 1. Executive recommendation

Align SIFF the same way Beacon was aligned in P-19A: **minimal field and safety corrections on the existing legacy indie path**, not a full IndependentSourceResult / Option C migration.

| Decision | Choice |
|----------|--------|
| Architecture | Keep listing → program pages → `RawShowtime` → daily JSON → source-wide restate |
| Contract | **Minimal field alignment only** (not full Option C now) |
| Restatement | **Preserve source-wide** restatement (Option A) with P-16B guards |
| Program ID | Canonical program URL path → `source_film_id` |
| Showtime ID | Elevent `ShowtimeId` from `data-screening` / `screening-{id}` → `source_showtime_id` |
| Titles | Prefer `<h1>`; exact source casing; no destructive normalization |
| Year | Date-header year wins; **never** first page-wide `\d{4}`; window helper if year omitted |
| Venue | Allowlist three registry theaters; reject unknown/off-site; no screen entities |
| Completeness unit | Source-wide: one listing + every discovered program page |
| Valid empty | Tighten toward Beacon-style affirmative proof (do not treat zero discovered links alone as valid empty) |

Do **not** implement theater-slice or program-slice restatement until discovery can independently prove those slices. Current SIFF discovery is a single org-wide listing; one program page can span multiple venues.

---

## 2. Current production architecture

```text
GET /cinema/in-theaters                    ← discovery (single page; no pagination observed)
    ↓ extract /cinema/in-theaters/* and /programs-and-events/*
GET each program/detail page               ← showtime + venue + metadata authority
    ↓ parse div.day / screening-* anchors
RawShowtime[] (legacy fields)
    ↓ write_scrape_daily_log → data/daily_logs/YYYY-MM-DD_siff.json
indie CSV merge (webscrapetheaters.py)
    ↓
daily_processor process_indie_csv_data
    ↓ source-wide today+future restatement when stats.restate_safe
history CSV → public showtimes_current.json → pipeline_report
```

| Role | Current behavior |
|------|------------------|
| Discovery authority | `/cinema/in-theaters` listing HTML |
| Showtime authority | Program/detail page `div.day` blocks |
| Metadata authority | Same detail page (title, runtime, poster) |
| Index pages | **One** listing URL; no pagination in current adapter |
| Date-range / window | `FetchContext` ~run…run+365 via `build_default_indie_fetch_context` (same as Beacon); **not used for SIFF year logic today** |
| Failures | Failed GETs → `failed_program_urls`; `decide_siff_completeness` |
| Partial detection | `program_pages_failed > 0` → `partial_failure`, `restate_safe=false` |
| Fetch once | Discovered URLs sorted set; each fetched once |
| Raw-log shape | Legacy scrape-log envelope (`schema_version` 1.0.0) + `RawShowtime` records |

Production evidence (`2026-07-17_siff.json`):

* `restate_safe=true`, `scrape_status=success`
* `discovered_programs=68`, `records=198`, `program_pages_failed=0`
* Venues: Uptown 103 / Downtown 66 / Film Center 29
* Unique program URLs with showtimes: 40 (other discovered pages returned zero showtimes)
* Window recorded: `2026-07-17` … `2027-07-17`
* `source_showtime_id` / `attributes` / history `source_film_id`: all empty

---

## 3. Current drift findings (verified 2026-07-17)

| Concern | Still true? | Evidence |
|---------|-------------|----------|
| Partial page failure can wipe futures | **Mitigated** | P-16B: any failed SIFF program page → `restate_safe=false` |
| Source-wide restatement | **Yes** | `INDIE_RESTATE_SOURCES` + `process_indie_csv_data` clears all SIFF theaters together |
| Program URL dropped before history identity | **Yes** | Log has `source_film_url`; history `source_film_id` blank for future SIFF rows |
| Title `.title()` mutation | **No** | Adapter uses `soup.title.string` as-is; live titles match `<h1>` |
| Weak year fallback | **Yes** | `movie_year = first \d{4} on page` when header omits year; live meta years include film years (e.g. Faust `1926`, Car Wash `1976`) while show dates are 2026 |
| Screening IDs discarded | **Yes** | Anchors `id="screening-{ShowtimeId}"` + JSON `data-screening.ShowtimeId` unused |
| Venue allowlist not enforced | **Yes** | `SUPPORTED_SIFF_VENUES` tests-only; unknown → `"Unknown Venue"` → unresolved theater |
| Valid empty too loose vs Beacon | **Yes** | SIFF treats `discovered==0` or `record_count==0` as valid empty; Beacon requires discovered pages + all succeeded |
| Empty results need conservatism | **Partially** | Success path is fine; zero-discovered valid-empty still too weak |
| Three venues complicate completeness | **Yes** | One org listing; multi-venue programs (e.g. Wild Inside) |

---

## 4. Venue model

| Theater ID | Registry name | Aliases | Enabled |
|------------|---------------|---------|---------|
| `siff-cinema-downtown` | SIFF Cinema Downtown | none | yes |
| `siff-cinema-uptown` | SIFF Cinema Uptown | none | yes |
| `siff-film-center` | SIFF Film Center | none | yes |

All `source: "siff"`, `type: "rep"`, timezone `America/Los_Angeles`.

### Discovery and labeling

* Venues are **not** discovered separately; they appear as labels on program pages.
* Page UI label (e.g. `SIFF Cinema Uptown`) is what the adapter stores.
* Elevent JSON may use screen-qualified names (`SIFF Cinema Uptown House 1`) — **do not** create screen entities; continue mapping the page venue label to the three registry IDs.

### Multi-venue programs

* Confirmed live: **Wild Inside** lists showtimes at **Uptown and Film Center** on one program URL.
* Same program identity must span venues; venue is an attribute of the showtime, not of the program ID.

### Ambiguity / rejection targets

Reject (completeness-affecting when in-scope) rather than silently default:

* `Unknown Venue` / missing venue label
* Off-site / partner venue strings not in the allowlist
* Virtual / online-only labels
* Malformed venue text that does not resolve via registry (casefold exact name)

Optional later: alias map for minor label variants — not required while live labels match registry names exactly (2026-07-17 log had **zero** unknown venues).

---

## 5. Title strategy

### Current

* Uses document `<title>` text; no `.title()`.
* Live titles generally match `<h1>` and preserve series/event wording.
* Observed title-tag trailing space (`Bernstein's Wall `) — prefer `<h1>`.

### Recommendation (narrow)

1. Prefer `<h1>` text; fall back to `<title>`.
2. Apply only `normalize_exact_source_title` + HTML unescape (trim / collapse whitespace).
3. Preserve series prefixes, format suffixes, punctuation, ampersands, apostrophes, years in titles.
4. Do not strip “Community Screening:”, “Cold War Summer:”, “Art House Theater Day:”, “(35mm)”, Q&A/hosted wording.
5. Public `film_title` may still pass through existing emit `normalize_film_title`; keep exact text in history `Film` / `source_title` (Beacon precedent).

Examples from production/live:

* `Cold War Summer: GoldenEye (35mm)`
* `Art House Theater Day: Car Wash`
* `Faust with The Invincible Czars`
* `BFDI & Inanimate Insanity 2026 Tour`
* `40 Years of F'in Up: a film by NOFX`

---

## 6. Program identity

### Strongest stable ID

**Canonical program URL path** (no query), e.g.:

* `cinema/in-theaters/wild-inside`
* `programs-and-events/art-house-theater-day-2026/car-wash`

Rationale:

* Already present as `source_film_url` on every accepted record.
* Stable across venues on the same page.
* Nested event paths need the **full path**, not only the final segment (`car-wash`), to avoid collisions with unrelated programs.
* Elevent `EventUrlName` exists in `data-screening` but differs from URL slugs; treat as raw evidence, not primary ID.

### Mapping

* `attributes.source_program_id` / `attributes.source_film_id` = path id  
* History `source_film_id` via existing `source_film_id_from_raw` (no schema change)
* Title must not be identity; venue must not be identity

### Distinctness

* Same title on different program URLs → different IDs  
* Same URL at multiple venues → same program ID, different showtimes/venues

---

## 7. Showtime identity

### Finding: durable source-owned ID **exists**

Live program pages expose Elevent screening buttons:

* DOM: `id="screening-{ShowtimeId}"`
* Attribute: `data-screening` JSON with `"ShowtimeId":"{id}"` (matches DOM suffix)
* Also includes venue capacity, sold-out %, reserved seating, etc. (raw-only initially)

Examples: `ftNrmybhM9`, `WjGM06vCSt`, `3Bk4ht5sqS`.

### Recommendation

* Set `source_showtime_id` = `ShowtimeId` string (without requiring the `screening-` prefix; either form is fine if consistent).
* Preserve full `data-screening` object (or selected keys) under `attributes` for diagnostics.
* Ticket `href` is currently `javascript:;` — **no** ticket URL to store; do not invent one.
* Null only when a time is accepted without screening id (should be rare); do not invent positional IDs.

### Stability notes

* IDs are unique per performance in live samples; multi-venue programs use distinct IDs per venue/time.
* Not present in today’s daily logs (discarded) — cannot prove multi-day stability from committed logs yet; first implementation should fixture + live spot-check across two scrapes.
* If showtime time changes, expect a new ShowtimeId (source-owned semantics).

---

## 8. Date and year strategy

### Current

* Date header form: `Friday, July 11, 2025` (live headers include year).
* If year omitted: uses first `\d{4}` anywhere on the page, else run year — **unsafe**.

### Recommendation

1. Explicit header year wins when valid.
2. If year omitted: `infer_year_for_month_day` with requested window + scrape date (shared helper; includes scrape-date preference for ~365-day anniversary ambiguity).
3. **Never** use page-wide / release-year `\d{4}` as show year.
4. Malformed / ambiguous / unresolvable in-scope → structured warning, count as occurrence failure, block restatement (Beacon pattern).
5. Outside-window showtimes: skip without treating as valid empty.

### Window risk

Production SIFF still uses the indie ~365-day `FetchContext`. Same anniversary ambiguity Beacon hit is possible if a header omits year. Prefer fixing year logic rather than narrowing the window in the SIFF alignment task. Window harmonization remains a separate architectural cleanup.

Timezone: Pacific wall times as today; no TZ field change required for this alignment.

---

## 9. Completeness model

### Completeness unit: **source-wide SIFF**

Required proof for `restate_safe=true`:

1. Listing request succeeds.
2. Listing structure markers present (`/cinema/in-theaters/` or `/programs-and-events/` or equivalent).
3. Every discovered program URL is fetched successfully (`program_pages_failed == 0`).
4. No completeness-affecting occurrence failures (unknown venue, malformed in-scope date, missing screening identity policy as defined in implementation).
5. Optional metadata (poster/runtime) missing does **not** fail completeness.

### Not independently completable today

* **Venue-slice:** discovery is not per-venue; one page feeds multiple venues.
* **Program-slice restatement:** possible in theory for successful pages, but missing/failed pages would leave stale futures inconsistently; **out of scope** until explicitly designed with per-program tombstones.

### Zero results

| Case | Recommended status |
|------|--------------------|
| Listing request fail | `request_failure`, unsafe |
| Structure missing | `structural_failure`, unsafe |
| Any program page fail | `partial_failure`, unsafe |
| Discovered ≥ 1, all pages OK, zero showtimes | `valid_empty`, safe (affirmative empty schedule) |
| Discovered = 0 with structure present | **unsafe / structural** until stronger empty proof exists (tighten vs current SIFF) |
| Discovered = 0 without structure | `structural_failure`, unsafe |

Duplicate listing links: keep set-dedupe (already).

Programs outside window: still fetch discovered detail pages (listing does not filter by window); filter showtimes at parse time.

---

## 10. Restatement recommendation

### Choose **Option A — Preserve source-wide restatement**

Justification:

* Completeness is proven only at org/listing + program-page granularity.
* Multi-venue programs make venue-slice restatement unsafe without venue-scoped discovery.
* Program-slice restatement needs additional tombstone semantics not present today.
* P-16B already blocks destructive restatement on partial failure.

### Options rejected for now

* **B Venue-slice** — not evidentially supportable.
* **C Program-slice** — desirable later; not the smallest safe change.

---

## 11. Contract and log-format decision

### Choose **minimal field alignment only**

Keep legacy SIFF scrape-log envelope. Add optional `attributes` / `source_showtime_id` / populated identity fields on records (backward compatible). Do **not** require Option C for SIFF in P-20B/C.

### Why not full IndependentSourceResult now

* Existing path already participates in daily production successfully.
* Beacon P-19A proved minimal alignment + P-16B is sufficient for identity/title/year fixes.
* Full migration duplicates NWFF/Central work without unlocking a completeness unit SIFF cannot already express.

### Staged contract migration

Optional later (not required for alignment): emit contract-compatible diagnostics alongside legacy logs. Defer unless implementation discovers the legacy envelope cannot carry page-level rejects cleanly.

---

## 12. Failure semantics

| Case | Behavior |
|------|----------|
| Listing request failure | Unsafe; retain futures; warn |
| Listing structure failure | Unsafe; retain futures |
| One program page failure | Partial; unsafe; may log partial rows for diagnostics only; no restate |
| Malformed in-scope showtime/date | Reject + occurrence failure → unsafe |
| Unknown / off-site venue | Reject + completeness-affecting → unsafe |
| Missing optional poster/runtime | Safe |
| Missing ShowtimeId on otherwise valid row | Prefer reject/unsafe if screening-like; do not invent ID |
| Zero showtimes with affirmative empty proof | Valid empty; may clear futures |
| Zero discovered without strong proof | Unsafe; retain futures |

---

## 13. History / public implications

### History (forward-only)

* Exact title → `Film` / `source_title`
* `source_film_id` from program path
* `source_showtime_id` from ShowtimeId when present
* Canonical `theater_id` via existing enrich
* No history schema shape change expected

### Public

* Schema-compatible; existing Identity-B fields may populate `source_film_id` when history has it
* `source_title` preserves exact casing; display title may still normalize
* Do not newly expose ticket URLs (none available) or require showtime ID in public if emit still nulls it (Beacon precedent)

### Grouping risks to watch

* Same program across venues (should share `source_film_id`, different showtimes)
* Series-prefixed titles vs bare film titles on different URLs
* Year-bearing / festival program titles
* Nested Art House Theater Day child URLs vs parent event URL

---

## 14. Pipeline-report implications

Current SIFF stats already expose `restate_safe`, `scrape_status`, page counts, windows, and warnings.

Narrow needs only:

* Ensure occurrence/venue rejection warnings surface in the existing warnings list.
* Do not redesign pipeline-report schema.
* `last_successful_run` should advance only on safe success / valid empty (existing semantics).

---

## 15. Fixture / test plan

### Existing coverage

* Basic parse, multi-venue fixture, runtime/poster, listing link extract, adapter fetch smoke.
* Completeness / restate isolation tests in `tests/test_indie_restate_completeness.py`.

### Gaps / stale risk

* Fixture titles lack series/event stress cases.
* Screening IDs present in fixture but unused by assertions.
* No year-omission / release-year hazard tests.
* No unknown-venue rejection tests.
* No `source_film_id` / `source_showtime_id` mapping tests.
* Valid-empty discovered=0 behavior under-tested vs Beacon.

### Minimum new fixtures (HTML snippets, not live dumps)

1. Exact mixed title + series prefix + `(35mm)`.
2. Multi-venue one program (`Wild Inside`-shaped).
3. Nested `/programs-and-events/.../...` child program.
4. Explicit header year.
5. Header without year + misleading release year on page.
6. December/January window cases (shared helper).
7. `data-screening` ShowtimeId present.
8. Missing ShowtimeId.
9. Unknown venue label.
10. Duplicate listing links to same program.
11. Suspicious empty / valid empty / partial page failure.
12. Title whitespace / h1 vs title-tag divergence.

### Focused tests

Exact title; program path → `source_film_id`; ShowtimeId → `source_showtime_id`; null ID policy; venue allowlist; multi-venue same program ID; year header vs release-year; window inference; partial failure unsafe; valid empty tightened; stale retention; SIFF failure does not affect Beacon/NWFF/Central/AMC.

---

## 16. Production rollout sequence

### P-20B — SIFF minimal alignment implementation

* Adapter + fixtures + tests + docs.
* Title / program ID / showtime ID / year / venue reject / valid-empty tighten.
* No requirement to change scheduled workflow shape if log envelope stays compatible.
* Local/manual validation against live SIFF before enabling confidence for rollout.

### P-20C — Production rollout and acceptance

* Push implementation; run normal daily workflow twice.
* Confirm exact titles, IDs, restatement, isolation, validators, CI/Pages.
* Record production evidence; mark SIFF minimally aligned.

If P-20B stays small (Beacon-sized), do **not** insert a separate “manual-only log format” phase unless Option C is unexpectedly required.

---

## 17. Remaining risks / open questions

1. **ShowtimeId longevity** across schedule edits — confirm on first two production days.
2. **House/screen labels** if page UI starts showing `House 1` instead of parent venue — need alias map then.
3. **Parent event URLs** that list no showtimes vs child film URLs — already zero-row successes; ensure they do not weaken valid-empty proof.
4. **~365-day window** still broad; anniversary ambiguity handled only when year omitted and scrape_date preference applies.
5. **Full contract migration** still deferred.

---

## 18. Explicit non-goals

* Full IndependentSourceResult / Option C migration for SIFF
* Theater- or program-slice restatement implementation
* Screen/auditorium entities
* Public schema changes / ticket URL exposure
* Presentation-attribute extraction
* Narrowing the indie 365-day window (separate task)
* Rewriting historical past SIFF rows
* Changes to Beacon, NWFF, Central, or AMC
* Cockpit / frontend work

---

## Live research summary (2026-07-17)

* Listing: HTTP 200; **68** discovered links (38 `in-theaters`, 30 `programs-and-events`).
* Inspected ≥10 detail pages across Downtown, Uptown, Film Center.
* Multi-venue: Wild Inside (Uptown + Film Center).
* Special/series: Art House Theater Day child pages; Faust with Invincible Czars; BFDI tour; Cold War Summer / format titles in production log.
* Titles: h1 ≈ title; exact punctuation preserved; trailing space risk on title tags.
* Dates: headers include year in sampled showtimes; meta release years differ (1926/1976/2025).
* Identity: `ShowtimeId` in `data-screening` matches `screening-*` ids; ticket href `javascript:;`.
* No sensory/caption/Q&A-specific URLs matched by keyword on that day’s listing (series/event wording still present in titles).

---

## References

* [independent-theater-ingestion-audit.md](./independent-theater-ingestion-audit.md)
* [independent-source-observation-contract.md](./independent-source-observation-contract.md)
* [beacon-minimal-alignment.md](./beacon-minimal-alignment.md)
* [nwff-production-integration-design.md](./nwff-production-integration-design.md)
* [central-cinema-production-integration-design.md](./central-cinema-production-integration-design.md)
* Adapter: `reel_seattle/adapters/siff.py`
* Completeness: `reel_seattle/adapters/indie_completeness.py`
