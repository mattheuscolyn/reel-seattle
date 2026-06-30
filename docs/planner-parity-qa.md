# Planner Legacy Parity QA Audit (PR 66A / updated PR 67A)

**Audit date:** 2026-06-27  
**Data artifact:** `public/data/showtimes_current.json`  
**Generated at:** 2026-06-27T13:38:45-07:00 (America/Los_Angeles)  
**Window:** 2026-06-27 → 2026-07-11 (15 days)  
**Showtimes:** 4,939 | **Films:** 68 | **Theaters:** 13  
**Sources:** AMC, Beacon, SIFF

**Historical note:** This audit originally compared the unified `/planner` against legacy Double Feature and Marathon tools before PR 66 redirects. As of **PR 67B**, the Double Feature UI, engine, and utility modules (`doubleFeatureUrlState.js`, `doubleFeatureDisplay.js`) have been removed. Planner is the source of truth; `/double-feature` remains as a redirect with migration helpers in `legacyDoubleFeatureUrlMigration.js` and `plannerUrlState.js`.

Automated discovery: `node scripts/lib/plannerParityScenarios.mjs` (via `discoverPlannerParityScenarios`)  
Full parity QA: `node scripts/qa_planner_parity.mjs http://localhost:5173`  
Browser QA: `node scripts/qa_planner_browser.mjs http://localhost:5173`

---

## 1. Reliable test scenarios (current data)

Discovered from live `showtimes_current.json` on 2026-06-27:

| Scenario | Date | Theater | Film count | Min results | Notes |
|----------|------|---------|------------|-------------|-------|
| 2-film Planner | 2026-06-28 | AMC Southcenter 16 | 2 | 194 | Browser-eligible |
| 3-film Planner | 2026-06-27 | AMC Alderwood Mall 16 | 3 | 200 | Engine cap at 200 |
| 4-film Planner | 2026-06-27 | AMC Alderwood Mall 16 | 4 | 200 | Top schedule has 4 films |
| Max mode | 2026-06-27 | AMC Alderwood Mall 16 | max | 200 | Top schedule has **7 films** |
| Marathon AMC | 2026-06-27 | AMC Alderwood Mall 16 | max | 200 | Marathon JSON default theater is Pacific Place |
| Non-AMC | 2026-06-28 | SIFF Cinema Uptown | 2 | 5 | `source: siff` |
| Pagination | 2026-06-27 | (all theaters) | 2 | 200 | Exercises Show More when UI renders >20 cards |

Scenarios are **discovered dynamically** from `showtimes_current.json` (prefers today-or-future dates for browser QA). Re-run `node scripts/qa_planner_parity.mjs --data-only` after data refresh.

Marathon iframe defaults (`marathon_showtimes.json`, **removed PR 66B-2**): historically **AMC Pacific Place 11** on **06/27/2026**.

---

## 2. Double Feature migration (redirect-only, PR 67A)

Legacy Double Feature UI and `doubleFeatureEngine.js` have been removed. `/double-feature` redirects to `/planner?count=2` via `buildPlannerPathFromDoubleFeature()`.

### Verified

| Check | Result |
|-------|--------|
| Planner 2-film schedules valid | Pass — deduplicated lineups with default max gap ≤ 59 min |
| Migration link preserves `date`, `theaters`, `start`, `movies`, `exclude`, `count=2` | Pass — `buildPlannerPathFromDoubleFeature()` tested |
| `end` not mapped to `finish` | Pass — documented; DF `end` filtered individual showtime end times |
| Result cards: theater, films, times, timeline, poster | Pass — Planner cards meet or exceed legacy card info |

### Known gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| DF `end` filter | Medium | Not migrated to Planner `finish`. Users relying on `end` must manually set Planner advanced filters after redirect. |
| Mode-only `filter=whitelist\|blacklist` without film lists | Low | Redirect drops filter mode when no `movies`/`exclude` values are present. |

**Double Feature migration verdict:** Redirect is safe for most shared links. Document the `end` param exception.

---

## 3. Marathon parity

### Verified

| Check | Result |
|-------|--------|
| `/marathon` React redirect | Pass — `/planner?count=max&from=marathon` |
| Static stub `/marathon/index.html` | Pass — redirects to Planner; optional localStorage migration |
| Planner max mode long schedules | Pass — 7-film schedule at AMC Alderwood; 6 films at Pacific Place |
| Planner `finish by` filter | Pass — basic filter works on long schedules (browser QA) |
| Excluded movies | Pass — Planner advanced `exclude` approximates Marathon blacklist |
| Required movies | Pass — Planner `include` requires **all** listed films |
| Preferred movies | Pass — Planner `preferred` requires **≥1** (Marathon parity) |
| Long schedule cards/timeline | Pass — timeline readable for multi-film results |
| Share long-schedule URL | Pass — copy share link + shared URL restore |
| Share lineup (PR 70) | Pass — per-card text + filter URL via Web Share or clipboard |

### Known gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Preferred vs required semantics | **Resolved (Phase C)** — Planner advanced panel exposes `preferred` (OR) separate from required `movies` (AND) |
| Result ordering | Low | Exact ordering need not match; Marathon has preferred-count boost |
| Alternate showtime counts | Low | Marathon shows alternate start times per film; Planner shows one lineup per card |
| Hero “longest day” | Low | Marathon iframe highlights longest span; Planner uses sort modes instead |
| Auto-recompute | Low | Marathon recomputes on filter change; Planner uses manual Find plans + shared URL prompt |
| AMC-only Marathon data | N/A | By design — Planner advantage for non-AMC |

**Marathon parity verdict:** **Ready for soft migration** (banner + max-mode link). Preferred-film UX parity is now covered in Planner; Marathon **deletion** can wait for iframe UX gaps (hero summary, alternates, auto-recompute) or explicit sign-off.

---

## 4. Non-AMC Planner advantage

| Theater | Source | 2-film results (2026-06-27) |
|---------|--------|----------------------------|
| SIFF Cinema Uptown | siff | 3 schedules |
| The Beacon | beacon | (fewer showtimes; verify on future dates) |

**Planner uses `showtimes_current.json` and supports all current sources (AMC, SIFF, Beacon).**  
**Marathon (post PR 66B-2):** Redirect-only; Planner max mode uses full `showtimes_current.json` (AMC + SIFF + Beacon).

This is the primary long-term reason to replace Marathon with Planner.

---

## 5. QA automation (PR 66A)

### New / updated scripts

| Script | Purpose |
|--------|---------|
| `scripts/lib/plannerParityScenarios.mjs` | Discovers stable scenarios from current JSON (not hardcoded dates) |
| `scripts/qa_planner_parity.mjs` | Data audit + browser parity checks |
| `scripts/qa_planner_browser.mjs` | Updated to use discovered scenarios for 2/3/4/max mode and pagination |

### Browser checks covered

1. `/planner` loads with discovered scenario results  
2. 2-film and max-mode cards + timeline  
3. Show More when >20 results  
4. Shared URL restore  
5. `/double-feature` redirect to Planner with mapped params  
6. `/marathon` redirect to Planner max mode  
7. No forbidden fetches  

---

## 6. Recommendation gate

### Ready for redirect?

**Yes** — `/double-feature` → `/planner?count=2` via `buildPlannerPathFromDoubleFeature()` is safe for most users. Document the `end` param exception.

### Ready for deletion?

**Done (PR 66B-2)** — Legacy Marathon iframe app, `marathon_showtimes.json` export, and related tests removed. `/marathon` redirects to Planner; static stub remains at `public/marathon/index.html`.

**Done (PR 67A)** — Legacy Double Feature page, result card, `doubleFeatureEngine.js`, and related tests removed. `/double-feature` redirect and migration helpers remain.

**Done (PR 67B)** — Removed `doubleFeatureUrlState.js` and `doubleFeatureDisplay.js`; migration decode in `legacyDoubleFeatureUrlMigration.js`; display formatters in `plannerDisplay.js`.

**Done (PR 68)** — Renamed Planner UI CSS from `.double-feature-*` to `.planner-*`; renamed `TWO_FILM_EXCLUSIVE_GAP_CEILING_MINUTES` constant.

### Needs another polish PR?

**Optional v2 polish** — alternate showtime counts per lineup, hero “longest day” highlight, auto-recompute on filter change, share a specific Planner lineup deep link. PR 69 (Recently Added) and PR 70 (Share lineup) are complete.

---

## 7. Suggested PR 66 final action

**PR 66 (done):** Redirect Double Feature; hide legacy nav; keep Marathon iframe.

**PR 66B-1 (done):** `/marathon` → `/planner?count=max` with localStorage filter migration.

**PR 66B-2 (done):** Deleted legacy Marathon assets; stopped `marathon_showtimes.json` generation; kept redirect stub.

**PR 67A (done):** Deleted legacy Double Feature UI/engine; kept `/double-feature` redirect and migration helpers.

After PR 67A, monitor shared Double Feature links with `end` param.

---

## 8. Manual QA checklist

- [ ] Run `npm run check:data-freshness` before audit
- [ ] Run `node scripts/qa_planner_parity.mjs http://localhost:5173`
- [ ] Run `node scripts/qa_planner_browser.mjs http://localhost:5173`
- [ ] Spot-check Double Feature shared URL with `end=` redirects to Planner without `finish` (legacy `end` is not migrated)
- [ ] Spot-check SIFF 2-film search in Planner

See also [frontend-smoke-check.md](./frontend-smoke-check.md).
