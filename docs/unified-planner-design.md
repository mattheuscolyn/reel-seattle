# Unified Planner — Technical Design

**Status:** Approved design (PR 60)  
**Codebase reference:** `c042f21`  
**Audience:** Implementers of PRs 61–66

This document defines how Reel Seattle will replace the separate **Double Feature** and **Marathon** tools with one **unified planner**. It is implementation-oriented: PR 61 should be able to build the pure engine from this spec without product ambiguity.

---

## 1. Product goal

### User-facing goal

One planner covers both “find me a double feature” and “plan a movie marathon.” The default experience uses a small set of filters; advanced constraints live behind an optional panel.

Users should not need to choose between two overlapping tools or understand AMC-only vs all-theater data paths.

### Example requests the planner should eventually satisfy

| User intent | Planner interpretation (v1+) |
|-------------|--------------------------------|
| “I want to see 2 movies tonight.” | `filmCount = 2`, date = tonight, optional theater |
| “I want to be at the theater from 2 PM to 10 PM.” | `startAfterMin` ≈ 14:00, `finishByMin` ≈ 22:00 |
| “I want to start with Toy Story and end with Jackass.” | `firstFilm`, `lastFilm` anchors (advanced v1) |
| “I want as many movies as possible at AMC Pacific Place.” | `filmCount = max`, theater = AMC Pacific Place 11 |

### Design principles

1. **Simple by default** — date, theater(s), film count, start/finish window, Find plans.
2. **Power without intimidation** — gap, include/exclude, anchors, sort modes in Advanced filters.
3. **Single data path** — same `showtimes_current.json` artifact as Showtimes and Double Feature.
4. **Safe migration** — legacy routes remain until parity is verified in production.

---

## 2. Current tool summary

### Double Feature (`/double-feature`)

| Aspect | Current behavior |
|--------|------------------|
| Architecture | **React-native** (`DoubleFeaturePage.jsx`, `doubleFeatureEngine.js`) |
| Data | `public/data/showtimes_current.json` via `useShowtimesData()` → `rowsFromShowtimesCurrent()` |
| Sources | **AMC, SIFF, Beacon** (all theaters in current window) |
| Film count | **Exactly 2** — pair enumeration, not chain search |
| Gap rule | Hardcoded **max gap &lt; 60 minutes** (`MAX_DOUBLE_FEATURE_GAP_MINUTES`) |
| Time filters | Earliest start; “earliest end” filters individual showtimes (not schedule finish-by) |
| Movie filters | Whitelist / blacklist (multi-select) |
| URL state | **Shareable** — `date`, `theaters`, `start`, `end`, `movies`, `exclude` |
| Results | Polished React cards (`DoubleFeatureResultCard.jsx`) with posters, gap badges, total time |
| Search UX | Manual **Find Double Features** click; shared URLs prompt **Run search** (no auto-run) |
| Sort | Popularity → gap → title (fixed) |

**Strengths:** Multi-source, shareable, integrated with app shell.  
**Limitations:** Pair-only, fixed max gap, no finish-by, no 3+ film plans, no timeline bar.

### Marathon (`/marathon`) — **retired (PR 66B-2)**

`/marathon` redirects to `/planner?count=max`. Static stub: `public/marathon/index.html`. Former behavior (historical):

| Aspect | Former behavior |
|--------|-----------------|
| Architecture | React shell + standalone iframe (`MarathonPage.jsx` → `public/marathon/index.html` + `marathon.js`) |
| Data | `marathon_showtimes.json` (AMC subset); **Planner now uses `showtimes_current.json`** |
| Sources | **AMC only** |
| Film count | **2+** — DFS chain search; min-movies selector (2 … max) |
| Gap rule | No explicit max gap; any non-overlapping chain with unique films |
| Time filters | **Finish-by** (end of last film); no start-after |
| Movie filters | Blacklist + preferred (≥1 must appear); stored in localStorage + Python export constants |
| URL state | **Not shareable** — filters in DOM + localStorage only |
| Results | Rich timeline UX: day bar, hero “longest day”, pagination, alternate showtime counts |
| Search UX | **Recompute** on filter change (in iframe) |
| Sort | Span / gap / count; preferred-count boost when multiple preferred titles |

**Strengths:** Chain algorithm, finish-by, min/max film count, timeline visualization.  
**Limitations:** AMC-only, iframe isolation, duplicate data pipeline, no share URLs, not React-native.

### Why unify

Marathon already produces **2-film schedules** as a subset of longer chains. Double Feature adds multi-source coverage and share URLs but duplicates partial functionality with stricter gap rules. A unified engine with `filmCount = 2` subsumes Double Feature; with `filmCount = max` and finish-by it subsumes Marathon.

---

## 3. Data source decision

### Decision

```text
The unified planner MUST use public/data/showtimes_current.json through the existing React showtimes data provider (useShowtimesData / ShowtimesDataProvider).
```

### Rationale

| Reason | Detail |
|--------|--------|
| One artifact | AMC, SIFF, and Beacon in a single 14-day window |
| Already loaded | `loadShowtimesArtifactOnce()` caches one fetch per session |
| Normalized keys | `theater_id`, `showtime_film_key`, `format_tags`, `runtime_min`, `status` |
| No second fetch | Avoids iframe-specific JSON and export lag |
| Consistency | Same rows as Showtimes and Double Feature after adapter mapping |

Row shape for the engine: legacy adapter rows from `rowsFromShowtimesCurrent()` (see `src/showtimesAdapter.js`), optionally augmented with a thin `plannerRowAdapter` if the engine prefers explicit minute fields at parse time.

### Legacy marathon artifact — removed (PR 66B-2)

`marathon_showtimes.json` and `find_marathons.py` export have been removed. The unified React planner reads `showtimes_current.json` only.

### No new planner JSON artifact (v1)

Current window size (~5k showtimes, ~3 MB JSON) is acceptable for client-side search per date/theater. Revisit a precomputed artifact only if profiling shows unacceptable latency on low-end devices.

---

## 4. Engine decision

### Decision

```text
Create a new pure src/utils/plannerEngine.js (plus plannerDisplay.js and plannerUrlState.js in later PRs).
```

### Rationale

| Alternative | Why not |
|-------------|---------|
| Extend `doubleFeatureEngine.js` | Pair-specific (O(films²) pairs), hardcoded 60 min gap, not chain search |
| Port `marathon.js` wholesale | IIFE, DOM-coupled, AMC assumptions, not unit-testable as-is |
| Keep both tools | Duplicate UX, data paths, and maintenance forever |

### Port strategy

Extract **algorithms**, not files:

- From **Marathon:** bounded DFS chain building, dedupe by film lineup, chain summarization (span, gaps, runtime).
- From **Double Feature:** row filtering patterns, URL encode/decode conventions, result card field semantics.

Engine must be **pure** (no DOM, no fetch, no React). All behavior validated in `tests/frontend/plannerEngine.test.mjs` before UI lands.

---

## 5. Engine input contract

### Function signature (proposed)

```js
/**
 * @param {object} options
 * @param {LegacyShowtimeRow[]} options.rows - From rowsFromShowtimesCurrent(); canceled rows pre-filtered by caller or engine
 * @param {PlannerFilters} options.filters
 * @param {PlannerSortMode} [options.sort='earliest_start']
 * @param {PlannerLimits} [options.limits]
 * @returns {PlannerResult}
 */
export function findSchedules({ rows, filters, sort, limits }) {}
```

### `PlannerFilters`

```js
{
  date: string,              // required, MM/DD/YYYY (adapter Date field)
  theaters: string[],        // display names; empty = all theaters with rows on date
  filmCount: 2 | 3 | 4 | 'max',  // 'max' = longest chains (marathon maximal mode)

  startAfterMin: number | null,   // minutes since midnight; null = no limit
  finishByMin: number | null,     // last film end must be <= this; null = no limit

  minGapMin: number | null,       // min gap between consecutive films; default 0
  maxGapMin: number | null,       // max gap; default null (no limit). Double Feature used 60.

  includeFilms: string[],         // all must appear (by showtime_film_key or title fallback)
  excludeFilms: string[],
  firstFilm: string | null,       // anchor first slot (key or title)
  lastFilm: string | null,        // anchor last slot
  preferredFilms: string[],       // ≥1 must appear (marathon semantics); boosts sort when set

  allowRepeatFilms: false,        // v1: always false; same film twice disallowed
}
```

### Clarifications

| Topic | Rule |
|-------|------|
| `rows` source | `useShowtimesData().rows` or test fixtures mapped through adapter |
| Film matching | Prefer **`showtime_film_key`**; fall back to normalized title if key missing |
| Theater matching | Prefer **`theater_id`** internally; filter UI may use display names mapped via artifact theaters list |
| Theater scope | **Single-theater plans only** — each schedule belongs to one theater; v1 searches selected theaters independently |
| Repeat films | **Disallowed in v1** (`allowRepeatFilms: false`) |
| Canceled showtimes | Exclude rows where `isShowtimeCanceled(row)` or equivalent |
| Invalid runtime/time | Skip rows where `parseRuntimeMinutes` or `parseTimeToMinutes` returns null (same as Double Feature) |

### `PlannerLimits` (defaults)

```js
{
  maxResults: 200,        // per search invocation (after sort/truncate)
  maxChainDepth: 8,       // max films in one chain
  maxRawCombinations: 50000, // optional early abort for DFS; implementation detail
}
```

---

## 6. Engine output contract

### `PlannerResult`

```js
{
  schedules: PlannerSchedule[],
  meta: {
    candidateShowtimeCount: number,  // rows considered after date/theater/time pre-filter
    rawCombinationCount: number,   // chains found before dedupe/truncate
    truncated: boolean,              // true if maxResults or safety cap hit
    theatersSearched: string[],
  },
}
```

### `PlannerSchedule`

```js
{
  theater: string,           // display name
  theater_id: string,
  filmCount: number,
  films: string[],           // display titles in order
  movies: PlannerMovie[],
  totalSpanMin: number,      // last.endMin - first.startMin
  filmRuntimeMin: number,    // sum of runtimes
  gapTimeMin: number,        // totalSpanMin - filmRuntimeMin
  startMin: number,
  endMin: number,
  startLabel: string,        // e.g. "2:00 PM" — formatted for display layer
  endLabel: string,
  preferredMatchCount: number,
  alternateCount: number,      // optional: distinct showtime-id combos for same film lineup (v1 may omit or set 1)
}
```

### `PlannerMovie`

```js
{
  film: string,              // display title
  showtime_film_key: string,
  date: string,              // MM/DD/YYYY
  time: string,              // compact display time (adapter Time field)
  startMin: number,
  endMin: number,
  runtime: number,           // minutes
  poster: string | null,
  formatTags: string[],      // from premiumFormat / format_tags if available
  theater_id: string,
}
```

Display formatting (labels, gap badges, duration strings) belongs in **`plannerDisplay.js`**, not the engine.

---

## 7. Filter matrix

| Filter | Data support | UI tier | v1? | Notes |
|--------|--------------|---------|-----|-------|
| Date | Yes (`Date` / ISO in artifact) | **Default** | Yes | Required; default to first today-or-future date |
| Theater(s) | Yes (`Theater`, `theater_id`) | **Default** | Yes | Multi-select; empty = all; each theater searched separately |
| Number of movies | Logic | **Default** | Yes | `2`, `3`, `4`, `max` (as many as possible) |
| Start after | Yes (`Time` → minutes) | **Default** | Yes | Replaces Double Feature “earliest start” |
| Finish by | Computed from chain end | **Default** | Yes | Marathon parity; end of **last** film |
| Find plans button | — | **Default** | Yes | Manual run v1 (match Double Feature share-link behavior) |
| Min gap | Computed | **Advanced** | Yes | Default 0 |
| Max gap | Computed | **Advanced** | Yes | Default null; Double Feature equivalent ≈ 60 |
| Required movies | Yes (keys/titles) | **Advanced** | Yes | Maps to `includeFilms` / whitelist |
| Excluded movies | Yes | **Advanced** | Yes | Maps to `excludeFilms` |
| Preferred first movie | Yes | **Advanced** | Yes | `firstFilm` anchor |
| Preferred last movie | Yes | **Advanced** | Yes | `lastFilm` anchor |
| Preferred movies (≥1) | Yes | **Advanced** | Yes — **exposed in UI (Phase C)** | Marathon `preferredFilms`; URL param `preferred`; affects sort when multiple listed |
| Sort mode | Logic | **Advanced** | Yes | See §9 |
| Full preferred order | Yes | **Deferred** | No | e.g. A → B → C constraint satisfaction; v2 |
| Format filters | Partial (`format_tags`) | **Deferred** | No | Sparse; add when data quality improves |
| Runtime constraints | Yes (`runtime_min`) | **Deferred** | No | e.g. “each film &lt; 120 min” |
| Allow repeat films | Logic | **Deferred** | No | Default false forever unless requested |
| Cross-theater chains | N/A | **Deferred** | No | Out of scope — no travel time modeling |

---

## 8. Algorithm outline

High-level flow for `findSchedules`:

```
1. PRE-FILTER ROWS
   - date === filters.date
   - theater in filters.theaters (or all if empty)
   - not canceled; valid runtime and start time
   - start >= startAfterMin (if set)
   - film not in excludeFilms
   - optional: row-level filters for include/preferred feasibility

2. GROUP BY THEATER
   - Build Map<theater_id, ShowtimeCandidate[]>
   - Each candidate: { row, startMin, endMin, runtime, filmKey, filmTitle, ... }

3. FOR EACH THEATER
   a. Sort candidates by startMin asc, then filmKey, then id
   b. DFS/BACKTRACKING (port from marathon.js findAllMarathons):
      - Path = ordered list of candidates
      - Extend if: next.startMin >= last.endMin
      - Extend if: next.filmKey not in filmsSeen (no repeats)
      - Extend if: gap between films satisfies minGap/maxGap
      - Stop extending if: endMin > finishByMin (when set)
      - Stop if: path.length >= maxChainDepth
      - Record chain when path.length >= minFilmCount
        where minFilmCount = filmCount or 2 when filmCount === 'max'
   c. FILTER CHAINS
      - filmCount exact: keep only chains where length === N
      - filmCount 'max': keep only chains with length === max achievable (optional maximal-only mode) OR keep all >= 2 and sort by count (product: use Marathon maximal semantics for 'max')
      - includeFilms: all must appear in chain
      - preferredFilms: at least one must appear (if non-empty)
      - firstFilm / lastFilm: anchor first/last slot by key or title
      - finishByMin: last.endMin <= finishByMin
   d. DEDUPE (optional v1, recommended)
      - By ordered film keys: keep tightest totalSpanMin per lineup (Marathon dedupeByFilmLineup)
   e. SUMMARIZE each chain → PlannerSchedule

4. MERGE schedules across theaters

5. SORT (see §9)

6. TRUNCATE to limits.maxResults; set meta.truncated if capped

7. RETURN { schedules, meta }
```

### Performance guardrails

| Guardrail | Value / rule |
|-----------|--------------|
| Search scope | **Per theater, per date** — never cross-theater in one chain |
| Max chain depth | Default 8 |
| Max results returned | Default 200 |
| Raw combination cap | Abort or sample if DFS exceeds `maxRawCombinations` |
| Truncation flag | `meta.truncated = true` when capped |
| Busy AMC days | Acceptable because search is per theater (~ hundreds of showtimes), not full 5k window at once |

### `filmCount` semantics

| Value | Behavior |
|-------|----------|
| `2`, `3`, `4` | Return chains of **exactly** that length (after anchors/filters) |
| `'max'` | Return **maximal** chains: only schedules with the largest film count achievable under constraints (Marathon “maximal only” default for this mode); hero UI may highlight longest |

Exact behavior for `'max'` vs “≥ N films” must match Marathon user expectations; default to **maximal-only** for `'max'`.

---

## 9. Sorting / ranking

### Sort modes (`PlannerSortMode`)

| Mode | Primary key | Secondary |
|------|-------------|-----------|
| `earliest_start` | `startMin` asc | `totalSpanMin` asc |
| `shortest_span` | `totalSpanMin` asc | `startMin` asc |
| `longest_span` | `totalSpanMin` desc | `filmCount` desc |
| `most_films` | `filmCount` desc | `totalSpanMin` asc |
| `smallest_gaps` | `gapTimeMin` asc | `totalSpanMin` asc |
| `latest_finish` | `endMin` desc | `filmCount` desc |

When `preferredFilms.length > 1`, apply **preferredMatchCount desc** before user sort (Marathon behavior).

### Default sort

```text
If filmCount === 'max': most_films, then shortest_span.
Otherwise: earliest_start, then shortest_span.
```

---

## 10. URL state strategy

Route: **`/planner`**

### Query parameters

| Param | Type | Maps to |
|-------|------|---------|
| `date` | string | `filters.date` (MM/DD/YYYY) |
| `theaters` | repeatable | `filters.theaters` |
| `count` | `2`\|`3`\|`4`\|`max` | `filters.filmCount` |
| `start` | compact time | `startAfterMin` (via `normalizePlannerTime`) |
| `finish` | compact time or minutes | `finishByMin` — **use compact time in URL** for shareability; decode to minutes |
| `mingap` | integer minutes | `minGapMin` |
| `maxgap` | integer minutes | `maxGapMin` |
| `movies` | repeatable | `includeFilms` (whitelist) |
| `exclude` | repeatable | `excludeFilms` |
| `first` | string | `firstFilm` |
| `last` | string | `lastFilm` |
| `preferred` | repeatable | `preferredFilms` |
| `sort` | enum | `sort` |

Omit params when equal to defaults (same pattern as `encodeDoubleFeatureFilters`).

### Behavior

- **Copy share link** copies current filter URL (like Double Feature).
- **Share lineup** (PR 70) on each result card shares a human-readable schedule summary plus the current filter URL via Web Share or clipboard. **Do not** encode individual lineups in the URL.
- **Do not** encode result schedules in the URL.
- **v1:** Shared links restore controls and show **Run search** prompt — **do not auto-run** (consistent with Double Feature unless explicitly changed later).
- Reuse `intersectWithOptions` pattern to prune stale date/theater/film params on load.

### Legacy param mapping (PR 65)

| Double Feature | Unified planner |
|----------------|-----------------|
| `date` | `date` |
| `theaters` | `theaters` |
| `start` | `start` |
| `end` | **Do not map 1:1** — DF `end` filtered showtimes, not finish-by. Document in redirect page or drop with migration note |
| `movies` / `exclude` | `movies` / `exclude` |
| (implicit 2 films) | `count=2` |

---

## 11. Legacy route migration

| Phase | Route / asset | Action |
|-------|---------------|--------|
| PR 62 | `/planner` | **Launch** new page; add nav entry (“Planner” or “Planner (new)”) |
| PR 62–64 | `/double-feature` | **Keep** unchanged |
| PR 62–64 | `/marathon` | **Keep** iframe |
| PR 65 | `/double-feature` | **Soft banner** + “Try Planner for 2 movies” link; route and shared URLs preserved (no auto-redirect) |
| PR 65 | `/marathon` | **Soft banner** + “Try Planner” link to `count=max`; iframe remains |
| PR 65 | Old DF share URLs | `buildPlannerPathFromDoubleFeature()` maps `date`, `theaters`, `start`, `movies`, `exclude`; **`end` not mapped** (semantic mismatch) |
| Transition | `/marathon/index.html` | **Remain accessible** for bookmarks |
| Transition | `marathon_showtimes.json` | **Keep emitting** while iframe exists |
| PR 66 | `public/marathon/` | **Delete** after parity QA: 2-film AMC, 4+ film day, finish-by, blacklist/preferred, SIFF 2-film day |
| PR 66 | `doubleFeatureEngine.js`, DF page | Remove or thin redirect-only shell |
| PR 66 | `find_marathons.py` export | Stop or gate after iframe removal |

### Parity QA checklist (before PR 66)

- [ ] Same date/theater: unified 2-film results ⊇ Double Feature results (modulo max gap default change — document if default max gap becomes unlimited)
- [ ] AMC busy day: `count=max` ≥ Marathon hero film count
- [ ] Finish-by filters match Marathon
- [ ] Blacklist / preferred / include behavior match
- [ ] SIFF or Beacon 2-film plan findable (regression vs Marathon — Marathon cannot do this today; **new capability**)

---

## 12. Proposed PR sequence

### PR 61 — Pure `plannerEngine.js` + tests

**Scope:** Engine only; no UI, no routes.

Acceptance criteria:

- [ ] `src/utils/plannerEngine.js` exports `findSchedules` per input/output contract above
- [ ] `tests/frontend/plannerEngine.test.mjs` with ≥20 cases: 2-film parity, 3-film chain, finish-by prune, max gap, include/exclude, first/last anchors, empty results, truncation flag
- [ ] No changes to `/double-feature` or `/marathon` routes
- [ ] Frontend test suite passes

### PR 62 — New `/planner` React page (basic filters)

**Scope:** Default-visible filters only; uses `useShowtimesData`.

Acceptance criteria:

- [ ] Route `/planner` registered in `App.jsx`; nav link added (legacy links remain)
- [ ] Filters: date, theaters, film count, start after, finish by, Find plans
- [ ] Results list (minimal cards OK); no advanced panel yet
- [ ] `npm run test:frontend`, `smoke:frontend` pass
- [ ] Manual QA on `/`, `/double-feature`, `/marathon` unchanged

### PR 63 — Advanced filters + URL state

**Scope:** Advanced panel + share URL.

Acceptance criteria:

- [ ] `plannerUrlState.js` encode/decode with tests
- [ ] Advanced: min/max gap, include/exclude, first/last, preferred, sort
- [ ] Copy share link + Run search from URL (no auto-run)
- [ ] URL round-trip tests

### PR 64 — Planner result UX polish

**Scope:** Timeline bar, pagination, hero summary, posters.

Acceptance criteria:

- [ ] Day timeline or per-film connector (parity with Marathon visual quality)
- [ ] Responsive at 375 / 768 / 1200 px
- [ ] Empty / truncated states with clear copy
- [ ] Optional: alternate showtime count badge

### PR 65 — Legacy route migration prep (soft banners)

**Scope:** Nav consolidation, legacy banners, Double Feature → Planner URL helper. **No automatic redirects.**

Acceptance criteria:

- [x] Nav shows **Planner** as primary; legacy tools labeled in nav
- [x] `/double-feature` and `/marathon` show migration banners with Try Planner links
- [x] `buildPlannerPathFromDoubleFeature()` tested; `end` param intentionally omitted
- [x] Existing Double Feature share URLs unchanged on legacy page

### PR 66A — Parity QA audit (checkpoint, no deletion)

**Scope:** Document parity evidence; dynamic scenario discovery; expanded QA scripts. **No redirects or deletions.**

Acceptance criteria:

- [x] `docs/planner-parity-qa.md` with scenarios, gaps, and recommendation
- [x] `scripts/lib/plannerParityScenarios.mjs` discovers scenarios from current data
- [x] `scripts/qa_planner_parity.mjs` data + browser audit
- [x] Browser QA uses discovered scenarios (not brittle hardcoded dates)

See [planner-parity-qa.md](./planner-parity-qa.md) for **Option 2** recommendation: hide legacy nav + DF redirect, keep routes, no deletion.

### PR 66 — Legacy route migration (redirect / hide nav; no deletion)

**Scope:** Redirect Double Feature; hide legacy nav; keep Marathon iframe and all legacy code/assets.

Acceptance criteria:

- [x] Redirect `/double-feature` → `buildPlannerPathFromDoubleFeature()` mapped `/planner?count=2`
- [x] Nav: Showtimes + Planner only (legacy routes direct-access)
- [x] Keep `/marathon` iframe + banner (superseded by 66B-1 redirect)
- [ ] **Do not** delete `public/marathon/`, engines, or stop JSON generation (deferred to 66B-2)

### PR 66B-1 — Redirect Marathon into Planner

**Scope:** Redirect `/marathon` to Planner max mode; migrate localStorage filters; keep legacy files.

Acceptance criteria:

- [x] `/marathon` redirects to `/planner?count=max` via `MarathonRedirect`
- [x] Migrate `marathon-planner-filters` localStorage to `preferred` / `exclude` params
- [x] Planner arrival notice when `from=marathon`
- [x] `public/marathon/index.html` static redirect stub (GH Pages `/marathon/` path)
- [ ] **Do not** delete `marathon.js`, `marathon_showtimes.json`, or pipeline export

### PR 66B-2 — Remove obsolete standalone marathon assets

**Scope:** Delete iframe stack and pipeline export; keep redirect stub.

Acceptance criteria:

- [x] Remove `public/marathon/marathon.js`, `marathon_showtimes.json`, dead React pages
- [x] Stop `marathon_showtimes.json` emit in `daily_processor.py`
- [x] Remove Marathon JSON from dist artifact checks
- [x] Keep `public/marathon/index.html` redirect stub for GitHub Pages
- [x] Remove `doubleFeatureEngine.js` / `DoubleFeaturePage` (PR 67A)

### PR 67A — Remove legacy Double Feature UI/engine

**Scope:** Delete orphaned Double Feature page, card, engine, and legacy-only CSS. Keep redirect and migration helpers.

Acceptance criteria:

- [x] Delete `DoubleFeaturePage.jsx`, `DoubleFeatureResultCard.jsx`, `LegacyToolBanner.jsx`, `doubleFeatureEngine.js`
- [x] Keep `/double-feature` → `DoubleFeatureRedirect` + `buildPlannerPathFromDoubleFeature()`
- [x] Update parity QA to treat Planner as source of truth (no legacy engine comparison)
- [x] Deferred utility deletion to PR 67B (completed)

### PR 67B — Decouple and delete legacy Double Feature utility modules

**Scope:** Move redirect migration and display formatters into Planner-owned modules; delete `doubleFeatureUrlState.js` and `doubleFeatureDisplay.js`.

Acceptance criteria:

- [x] `decodeDoubleFeatureFilters` in `legacyDoubleFeatureUrlMigration.js`
- [x] `normalizePlannerTime` in `plannerUrlState.js`
- [x] Display formatters in `plannerDisplay.js`
- [x] `intersectWithOptions` from `showtimesUrlState.js` in PlannerPage
- [x] Delete `doubleFeatureUrlState.js` and `doubleFeatureDisplay.js`
- [x] Migrate tests into `plannerUrlState.test.mjs` and `plannerDisplay.test.mjs`
- [x] CSS rename `.double-feature-*` → `.planner-*` (PR 68)

### PR 68 — Rename Planner CSS and neutral terminology

**Scope:** Cosmetic rename of Planner UI classes and gap constant. No behavior changes.

Acceptance criteria:

- [x] Planner JSX/CSS use `.planner-*` class names only
- [x] QA scripts updated to new selectors
- [x] `TWO_FILM_EXCLUSIVE_GAP_CEILING_MINUTES` replaces `DEFAULT_DOUBLE_FEATURE_MAX_GAP_MINUTES`
- [x] `/double-feature` redirect/migration naming preserved

### Independent: dist CSV cleanup

Excluding `movies_announcements.csv` and `newly_announced.csv` from `dist/` (~517 KB) is **orthogonal**. Can land anytime via `vite.config.js` `PUBLIC_SKIP_FILES` — see `docs/frontend-smoke-check.md`.

---

## 13. Non-goals for v1

- **No cross-theater travel chains** — each plan is one venue, same day
- **No external APIs** — client-side search on committed artifacts only
- **No new JSON artifact** unless profiling proves client search too slow
- **No deletion of legacy tools** before parity QA (Double Feature + Marathon stay until PR 65/66)
- **No full preferred-order constraint** in engine v1 (first/last anchors only)
- **No repeat-film plans** (`allowRepeatFilms` stays false)
- **No auto-run on shared URLs** in v1 (match Double Feature)
- **No multi-day plans**

---

## 14. Risks and open questions

| Risk / question | Mitigation / decision |
|-----------------|----------------------|
| **DFS explosion** on busy AMC days | Per-theater scope; depth cap; result cap; optional raw combo abort |
| **Filter overload** | Strict default vs advanced split; sensible defaults (`maxGap` null, not 60) |
| **First/last vs full order** | v1: anchors only; full order deferred to v2 with explicit UX |
| **Double Feature `end` param** | Do not map to `finish`; document in PR 65 redirect; `end` was showtime-level filter |
| **Default max gap change** | DF used 60 min; unified default null (unlimited). Consider advanced default 60 or migration note |
| **SIFF/Beacon sparse schedules** | Empty results OK; copy: “Try another date or theater” |
| **Title collisions** | Match on `showtime_film_key` internally |
| **Marathon iframe parity** | Side-by-side QA on same date/theater before PR 66 |
| **History CSV 78 MB on GitHub** | Unrelated to planner; clone size warning only |
| **When remove `marathon_showtimes.json`** | PR 66 after iframe removed |
| **Kennewick / unresolved theater_id** | Skip rows without resolvable theater_id in engine pre-filter |
| **Canceled showtimes** | Exclude consistently (adapter + engine) |

### Open question for PR 62 (product)

Should **`count=max`** show only longest chains (Marathon maximal) or all chains ≥ 2 sorted by count? **Recommendation:** maximal-only when `count=max`, matching Marathon hero behavior.

---

## Appendix A — File map (future)

| File | Purpose |
|------|---------|
| `src/utils/plannerEngine.js` | Pure search (PR 61) |
| `src/utils/plannerDisplay.js` | Formatting helpers (PR 62+) |
| `src/utils/plannerUrlState.js` | URL encode/decode (PR 63) |
| `src/pages/PlannerPage.jsx` | UI (PR 62+) |
| `src/components/PlannerResultCard.jsx` | Result card (PR 62/64) |
| `tests/frontend/plannerEngine.test.mjs` | Engine tests (PR 61) |
| `tests/frontend/plannerUrlState.test.mjs` | URL tests (PR 63) |

## Appendix B — Related docs

- PR 59 audit (conversation / handoff)
- `scripts/marathon/README.md` — legacy iframe behavior
- `docs/frontend-smoke-check.md` — QA checklists
- `schema/showtimes_current/v1.0.0.json` — artifact fields

---

**Next PR:** **PR 61 — Pure `plannerEngine.js` + tests** (no UI).
