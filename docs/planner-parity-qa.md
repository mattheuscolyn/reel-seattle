# Planner Legacy Parity QA Audit (PR 66A)

**Audit date:** 2026-06-27  
**Data artifact:** `public/data/showtimes_current.json`  
**Generated at:** 2026-06-27T13:38:45-07:00 (America/Los_Angeles)  
**Window:** 2026-06-27 → 2026-07-11 (15 days)  
**Showtimes:** 4,939 | **Films:** 68 | **Theaters:** 13  
**Sources:** AMC, Beacon, SIFF

This audit compares the unified `/planner` against legacy **Double Feature** (`/double-feature`) and **Marathon** (`/marathon`) before any redirects or deletions in PR 66.

Automated discovery: `node scripts/lib/plannerParityScenarios.mjs` (via `discoverPlannerParityScenarios`)  
Full parity QA: `node scripts/qa_planner_parity.mjs http://localhost:5173`  
Browser QA: `node scripts/qa_planner_browser.mjs http://localhost:5173`

---

## 1. Reliable test scenarios (current data)

Discovered from live `showtimes_current.json` on 2026-06-27:

| Scenario | Date | Theater | Film count | Min results | Notes |
|----------|------|---------|------------|-------------|-------|
| 2-film Planner | 2026-06-28 | AMC Southcenter 16 | 2 | 194 | Browser-eligible; DF parity reference |
| Double Feature parity | 2026-06-28 | AMC Southcenter 16 | 2 | 194 (Planner) / 437 (DF pairs) | Same date/theater; counts differ by design |
| 3-film Planner | 2026-06-27 | AMC Alderwood Mall 16 | 3 | 200 | Engine cap at 200 |
| 4-film Planner | 2026-06-27 | AMC Alderwood Mall 16 | 4 | 200 | Top schedule has 4 films |
| Max mode | 2026-06-27 | AMC Alderwood Mall 16 | max | 200 | Top schedule has **7 films** |
| Marathon AMC | 2026-06-27 | AMC Alderwood Mall 16 | max | 200 | Marathon JSON default theater is Pacific Place |
| Non-AMC | 2026-06-28 | SIFF Cinema Uptown | 2 | 5 | `source: siff` |
| Pagination | 2026-06-27 | (all theaters) | 2 | 200 | Exercises Show More when UI renders >20 cards |

Scenarios are **discovered dynamically** from `showtimes_current.json` (prefers today-or-future dates for browser QA). Re-run `node scripts/qa_planner_parity.mjs --data-only` after data refresh.

Marathon iframe defaults (`marathon_showtimes.json`): **AMC Pacific Place 11** on **06/27/2026** with 4,802 AMC showtimes.

---

## 2. Double Feature parity

### Verified

| Check | Result |
|-------|--------|
| Same date/theater search | Pass — both tools search AMC Alderwood Mall 16 on 2026-06-27 |
| Planner 2-film schedules valid | Pass — 141 deduplicated lineups |
| 59-minute default max gap | Pass — all inter-film gaps ≤ 59 min (Planner uses 59; DF uses gap &lt; 60) |
| Migration link preserves `date`, `theaters`, `start`, `movies`, `exclude`, `count=2` | Pass — `buildPlannerPathFromDoubleFeature()` tested |
| `end` not mapped to `finish` | Pass — documented; DF `end` filters individual showtime end times |
| Old DF shared links load legacy page | Pass — no auto-redirect in PR 65/66A |
| Result cards: theater, films, times, gap, poster, share URL | Pass — Planner cards + timeline meet or exceed DF card info |

### Known gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| `buildPlannerSearchFilters` date field mismatch (fixed PR 66A) | **High (fixed)** | `PlannerPage` passed `selectedDate` but helper expected `date`, causing empty browser searches. Fixed via alias support. |
| Result count differs | Low | DF returns more **showtime-level pairs**; Planner returns fewer **deduplicated lineups**. Functional parity, not count parity. |
| Sort order differs | Low | DF: popularity → gap → title. Planner: earliest start by default; advanced sort available. |
| DF `end` filter | Medium | Not migrated to Planner `finish`. Users relying on `end` must stay on Double Feature or manually adjust. |
| Popularity ranking | Low | DF boosts popular films; Planner has no popularity sort yet. |

**Double Feature parity verdict:** **Ready for redirect** with documented `end` exception. Planner is a superset for 2-film planning except the `end` semantic.

---

## 3. Marathon parity

### Verified

| Check | Result |
|-------|--------|
| Marathon iframe loads | Pass — `/marathon/index.html` + `marathon_showtimes.json` |
| Planner max mode long schedules | Pass — 7-film schedule at AMC Alderwood; 6 films at Pacific Place |
| Planner `finish by` filter | Pass — basic filter works on long schedules (browser QA) |
| Excluded movies | Pass — Planner advanced `exclude` approximates Marathon blacklist |
| Required movies | Partial — Planner `include` requires **all** listed films; Marathon **preferred** requires **≥1** |
| Long schedule cards/timeline | Pass — timeline readable for multi-film results |
| Share long-schedule URL | Pass — copy share link + shared URL restore |
| Marathon iframe multi-film | Pass — iframe loads with current AMC data |

### Known gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Preferred vs required semantics | Medium | Marathon preferred (OR) ≠ Planner include (AND). Engine supports `preferredFilms` but UI does not expose it. |
| Result ordering | Low | Exact ordering need not match; Marathon has preferred-count boost |
| Alternate showtime counts | Low | Marathon shows alternate start times per film; Planner shows one lineup per card |
| Hero “longest day” | Low | Marathon iframe highlights longest span; Planner uses sort modes instead |
| Auto-recompute | Low | Marathon recomputes on filter change; Planner uses manual Find plans + shared URL prompt |
| AMC-only Marathon data | N/A | By design — Planner advantage for non-AMC |

**Marathon parity verdict:** **Ready for soft migration** (banner + max-mode link). Not ready for Marathon **deletion** until preferred-film UX parity or documented workaround.

---

## 4. Non-AMC Planner advantage

| Theater | Source | 2-film results (2026-06-27) |
|---------|--------|----------------------------|
| SIFF Cinema Uptown | siff | 3 schedules |
| The Beacon | beacon | (fewer showtimes; verify on future dates) |

**Planner uses `showtimes_current.json` and supports all current sources (AMC, SIFF, Beacon).**  
**Marathon remains AMC-only** while iframe-backed on `marathon_showtimes.json`.

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
5. Legacy banners on DF and Marathon  
6. Double Feature search still runs  
7. Marathon iframe loads  
8. No forbidden fetches  

---

## 6. Recommendation gate

### Ready for redirect?

**Yes** — `/double-feature` → `/planner?count=2` via `buildPlannerPathFromDoubleFeature()` is safe for most users. Document the `end` param exception.

### Ready for deletion?

**No** — Marathon iframe still adds value for preferred-film UX and AMC power users. Double Feature fallback remains useful for `end` filter users.

### Needs another polish PR?

**Optional, not blocking** — expose Marathon-style **preferred movies** (OR semantics) in Planner advanced panel using existing `preferredFilms` engine support.

---

## 7. Suggested PR 66 final action

**Recommendation: Option 2 — Redirect + hide legacy nav, keep direct legacy routes, no deletion.**

| Action | Include in PR 66? |
|--------|-------------------|
| Redirect `/double-feature` → mapped `/planner?count=2` | Yes |
| Hide “Legacy:” nav items (routes remain direct-access) | Yes |
| Keep `/marathon` with banner (no redirect) | Yes |
| Delete `public/marathon/`, DF page, engines | **No** — defer until preferred-film parity or explicit product sign-off |
| Stop `marathon_showtimes.json` generation | **No** |

After PR 66, monitor shared Double Feature links with `end` param and Marathon preferred-movie users before full deletion PR.

---

## 8. Manual QA checklist

- [ ] Run `npm run check:data-freshness` before audit
- [ ] Run `node scripts/qa_planner_parity.mjs http://localhost:5173`
- [ ] Run `node scripts/qa_planner_browser.mjs http://localhost:5173`
- [ ] Spot-check Double Feature shared URL with `end=` still works on legacy page
- [ ] Spot-check Marathon iframe finds multi-film schedule at Pacific Place on today’s date
- [ ] Spot-check SIFF 2-film search in Planner (Marathon cannot do this)

See also [frontend-smoke-check.md](./frontend-smoke-check.md).
