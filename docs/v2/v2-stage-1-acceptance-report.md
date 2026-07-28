# v2 Stage 1 Acceptance Report

**Status:** Accepted (with documented minor issues)  
**Date:** 2026-07-27  
**Authority:** Final Stage 1 mockup-coverage acceptance — audit / documentation only  
**Canonical visual SoT:** [`Canonical Mockup Images/`](../../Canonical%20Mockup%20Images/) (17 PNGs)  
**Living coverage audit:** [v2-stage-1-completion-audit.md](./v2-stage-1-completion-audit.md)  
**Related:** [v2-front-back-integration-roadmap.md](./v2-front-back-integration-roadmap.md) §28 · [theater-data-audit.md](./research/theater-data-audit.md) · [data-foundation-roadmap.md](../data-foundation-roadmap.md)

This report independently verifies whether the repository’s claimed **17 fully / 0 partial / 0 missing** Stage 1 mockup coverage is trustworthy before Stage 4 data integration resumes.

**No Stage 4 implementation was performed in this packet.**

---

## 1. Executive summary

| Metric | Result |
|--------|--------|
| Canonical mockups | **17** |
| Independently verified designed surfaces | **17 / 17** |
| Partial / missing (vs mockup coverage bar) | **0 / 0** |
| Material visual Fail | **0** |
| Stage 1 remediation required before Stage 4 | **No** (optional polish only) |
| Recommended first Stage 4 task | **`T-THEA-01`** (theater visit schema) |

**Verdict:** Stage 1 mockup-page coverage is **accepted**. All 17 canonical mockup pages/states have designed v2 surfaces with honest stubs, fixture separation, and working primary navigation. Remaining gaps are Stage 4 data depth, intentional stubs, process coverage (Home QC script), and a few stale documentation rows (reconciled in the living audit).

**Postscript (2026-07-27, after acceptance):** Canonical film identity foundation **`T-FILMID-01`** has since been implemented (matcher/decisions/cockpit). That does **not** reopen Stage 1 mockup coverage. Theater production wiring still waits on **`T-THEA-01`**; public film-id emission remains **`T-FILMID-02`**.

---

## 2. Final status

| Classification | Count | Notes |
|----------------|------:|-------|
| Pass | 14 | Structure regions match mockup; stubs honest |
| Pass with minor issues | 3 | Documented below — not coverage failures |
| Fail | 0 | — |

**Pass with minor issues:** Home (no dedicated QC script; Home shelf Opening still provisional), My Schedule week (Search is deferred stub — audit previously overclaimed navigation), Theaters list (Favorite remains stub while Detail uses store — intentional asymmetry).

**17 / 17 retained.** No surface was downgraded to Partial or Missing.

---

## 3. Surface-by-surface matrix

| # | Surface | Mockup | Implementation | Visual | Data mode | QC script |
|---|---------|--------|----------------|--------|-----------|-----------|
| 1 | Home Landing | `Home Landing Page.png` | `HomeDestination` | Pass (minor) | Production HomeData | — (no `capture_home_qc.mjs`) |
| 2 | Home inline overlay | `Film Detail Overlay Example on Home Screen.png` | `InlineQuickDetail` | Pass | Production + suppress | Covered via Home / Explore / Search flows |
| 3 | Explore | `Explore Home Page.png` | `ExploreDestination` | Pass | Production | `capture_explore_qc.mjs` |
| 4 | Search Results | `Search Results Page.png` | `SearchResultsSurface` | Pass | Production | `capture_search_qc.mjs` |
| 5 | Opening This Week | `Opening This Week Page.png` | `OpeningThisWeekSurface` | Pass | Fixture | `capture_opening_this_week_qc.mjs` |
| 6 | Film Detail | `Film Detail Page.png` | `FilmDetailSurface` | Pass | Dual (prod + `?fdMockup=1`) | `capture_film_detail_qc.mjs` |
| 7 | Profile | `Profile Page.png` | `ProfileDestination` | Pass | Fixture | `capture_profile_qc.mjs` |
| 8 | Theaters list | `Theaters Page.png` | `TheatersSurface` | Pass (minor) | Fixture | `capture_theaters_qc.mjs` |
| 9 | Theater Detail | `Theater Detail Page.png` | `TheaterDetailSurface` | Pass | Fixture (Beacon) | `capture_theater_detail_qc.mjs` |
| 10 | Planner Landing | `Planner Landing Page.png` | `PlannerDestination` | Pass | Fixture | `capture_planner_landing_qc.mjs` |
| 11 | Build a Plan | `Build a Plan Page.png` | `BuildPlanSurface` | Pass | Fixture + local form | `capture_build_plan_qc.mjs` |
| 12 | Build a Plan Results | `Build a Plan Results Page.png` | `BuildPlanResultsSurface` | Pass | Fixture itineraries | `capture_build_plan_results_qc.mjs` |
| 13 | Results film-click | `…Film Click Interaction.png` | `PlanFilmInteractionSheet` | Pass | Local prefs only | `capture_plan_film_interaction_qc.mjs` |
| 14 | My Schedule week | `My Schedule Main Page.png` | `MyScheduleWeekSurface` | Pass (minor) | Fixture timeline | `capture_my_schedule_week_qc.mjs` |
| 15 | My Schedule month | `…Month Selected.png` | `MyScheduleMonthSurface` | Pass | Fixture heatmap | `capture_my_schedule_month_qc.mjs` |
| 16 | Schedule Settings | `…Settings Interaction.png` | `ScheduleSettingsSurface` | Pass | Local prefs (no persist) | `capture_schedule_settings_qc.mjs` |
| 17 | About My Schedule | `About My Schedule Page.png` | `AboutMyScheduleSurface` | Pass | Static fixture | `capture_about_my_schedule_qc.mjs` |

---

## 4. Navigation matrix

| Path | Expected | Observed | Status |
|------|----------|----------|--------|
| Primary tabs Home · Explore · Planner · Profile | Switch destinations; clear deep surfaces | Works | Pass |
| Home → Top Opp / More details → Film Detail | Home tab active; Back restores Home | `originPrimary: 'home'` | Pass |
| Home → Opening See All | Opening page; Back → Home | `originPrimary: 'home'` | Pass |
| Home → Leaving See All | Leaving collection (scaffold) | Forces Explore highlight (collection rule) | Pass (known rule) |
| Explore → Search → Film Detail | Explore active; Back restores search UI | Works | Pass |
| Explore → Theaters → Beacon More details → Theater Detail | Explore active; Back → Theaters list | Works | Pass |
| Theater Detail Favorite | Persist via `favoriteTheatersStore` | Works | Pass |
| Planner → Build a Plan → Results → film sheet | Planner active; sheet Close; Back chain | Works | Pass |
| Planner → My Schedule week ↔ month | Toggle; Planner tab | Works | Pass |
| Week/Month → Settings sheet → About → Back | Restore under Week/Month | Works | Pass |
| Week/Month Search | Honest deferred (no silent fail) | Announces stub; does **not** open Search | Pass (honesty) / doc overclaim fixed |
| QC query seams | `?fdMockup=1`, `?aboutSchedule=1`, `?myScheduleWeek=1`, `?myScheduleMonth=1`, `?scheduleSettings=1`, `?theaterDetail=1` | Present | Pass |
| Dead ends / wrong tab / stale overlays | None material | None found | Pass |

There is **no** React Router path map; navigation is in-memory (`navState.js`).

---

## 5. Interaction-honesty inventory

### Fully functional Stage 1 local behavior

| Control | Surfaces |
|---------|----------|
| Primary nav / Back / origin restore | Global |
| Inline expand / collapse | Home, Opening, Search, Theaters |
| Search query + filters sheet (subset) | Search |
| Save / Seen / Not interested (local stores) | Film Detail (production path) |
| Build a Plan form + Clear all + CTA → Results | Build a Plan |
| Results sort / plan selection / refine panel (local) | Results |
| Film preference chips on Results sheet (local, non-persisted) | Film-click sheet |
| Week/Month local day/week navigation | Schedule |
| Schedule Settings local toggles (session only) | Settings sheet |
| Theater Detail Favorite toggle | Detail (`favoriteTheatersStore`) |
| Website / Directions (external URLs) | Theater Detail |

### Honest stubs (announce deferred; no silent fail)

| Control | Surfaces | Notes |
|---------|----------|-------|
| List Favorite | Theaters list | Intentional vs Detail store asymmetry |
| Save / NI on Opening / Theaters expand | Opening, Theaters | No store writes |
| Filters / Sort / View all (various) | Opening, Theaters, Month | Stub status |
| Share / Add to My Schedule | Results | Stub |
| Replace / Film details / showtime swap | Film-click sheet | Stub |
| Calendar sync / Clear all | Schedule Settings | Sync Off honest |
| Profile gear / Settings rows / membership manage | Profile | Stub |
| About FAQ / external links | About | Stub |
| My Schedule Search | Week / Month | Deferred prefilter — does not navigate |
| Ticket CTA when URL null | Film Detail prod | Suppressed honestly |

### Stage 4-backed already implemented (partial)

| Capability | Evidence |
|------------|----------|
| HomeData Top Opportunity / shelves | Production adapter |
| Film Detail production path | `T-FIX-FD-01` |
| Ticket URL when present | `T-EMIT-02/03` |
| Favorite Theaters store | `T-FAV-01` (Detail wired; list deferred) |
| Buffer policy / ICS contract | `T-BUF-01` / `T-CAL-01` (UI deferred) |

### Broken or silent

**None found** among visible Stage 1 controls audited.

---

## 6. Fixture-schema inventory

| Fixture module | Surface | Coupling notes |
|----------------|---------|----------------|
| `filmDetailMockupFixture.js` | Film Detail QC | QC-only (`?fdMockup=1`); not production default |
| `filmDetailVisualFixtures.js` | FD visual QC | `?fdVisual=1` |
| `homeVisualFixtures.js` | Home visual helpers | Not production SoT |
| `openingThisWeekMockupFixture.js` | Opening page | Separated from Home shelf `newly_added` |
| `theatersMockupFixture.js` | Theaters list | Visit meta idealized |
| `theaterDetailMockupFixture.js` | Theater Detail | Beacon; registry identity-compatible id |
| `plannerLandingMockupFixture.js` | Planner | Plans not persisted |
| `buildPlanMockupFixture.js` | Build a Plan | Labels/presets |
| `buildPlanResultsMockupFixture.js` | Results | Itineraries; walk miles fixture-only |
| `myScheduleWeekMockupFixture.js` | Week | Timeline events |
| `myScheduleMonthMockupFixture.js` | Month | Heatmap aggregates |
| `scheduleSettingsMockupFixture.js` | Settings | Copy/structure |
| `aboutMyScheduleMockupFixture.js` | About | Static copy (D09 sync wording still mockup-faithful) |
| `profileMockupFixture.js` | Profile | Counts not live stores |

**Consistency flags (Stage 4 risk, not Stage 1 fails):**

- Theater visit fields exist only in fixtures — registry public emit is identity-only until `T-THEA-01`/`T-THEA-10`.
- Opening page fixture ≠ Home Opening shelf classifier.
- Profile activity counts are fixture numbers, not store-derived.
- Results walk miles must stay suppressed in production until travel aids exist.

No fixture imports from production stores were found on Stage 1-only surfaces.

---

## 7. Persistence / store audit

| Store / key | Intentional writes from Stage 1 UI? |
|-------------|-------------------------------------|
| Saved / Seen / NI films | Yes — Film Detail production actions |
| Favorite Theaters | Yes — Theater Detail Favorite only |
| Recent searches | Yes — Explore/Search |
| Build a Plan form | No — React state only |
| Results selection / film prefs | No — session local only |
| Schedule week/month/settings | No — no `localStorage` for prefs |
| Profile fixture hub | No |
| Planner landing / About / Opening / Theaters list | No (list Favorite stub) |

**Cross-surface mutation:** Favoriting Beacon on Detail persists and can affect future Profile wiring; list Favorite does not write. No surprising Stage 1-only page persistence found.

---

## 8. Responsive findings

QC scripts capture **320 / ~393 (iPhone 15 Pro) / 430** for Stage 1 surfaces that have scripts. After fixing three stale Planner QC scripts, all Stage 1 QC scripts in this audit run completed successfully.

| Finding | Severity | Notes |
|---------|----------|-------|
| No dedicated Home QC viewport suite | Low (process) | Home still covered by smoke + interaction tests |
| Timeline / heatmap / sheets | Pass at QC widths | No material overflow reported by scripts |

---

## 9. Accessibility findings

| Finding | Severity | Surfaces |
|---------|----------|----------|
| Dialog/sheet focus trap + Escape + backdrop | Pass | Settings, film-click, filters |
| Inert underlays while sheets open | Pass | Schedule Settings, Results sheet |
| Stub announcements via `role="status"` / `aria-live` | Pass | Schedule, Theaters, Profile |
| Selected / pressed semantics on toggles | Pass | Favorites, prefs, sort chips |
| Touch targets generally adequate | Pass | Minor density on timeline blocks (expected) |
| Color-only meaning | Low watch | Month heatmap uses intensity — labels accompany |

No Critical a11y blockers found for Stage 1 acceptance.

---

## 10. Copy findings

| Term | Consistency | Flags |
|------|-------------|-------|
| Primary nav labels | Consistent | Mockups sometimes show obsolete 5-tab chrome — implementation correctly uses 4 |
| Save / Seen / Not interested | Consistent | Opening/Theaters stubs do not imply store writes |
| Favorite | Asymmetric | List stub vs Detail real — acceptable Stage 1 |
| More details / Now showing | Consistent | — |
| Opening This Week / Leaving Soon | Consistent | Leaving honesty shell retained |
| My Schedule / Build a Plan | Consistent | — |
| About calendar sync copy | Mockup-faithful | D09 production copy revision still deferred |
| Search from Schedule | Honest deferred message | Do not claim day/time prefilter |

No copy found that silently promises working production calendar sync, multi-theater miles, or accounts.

---

## 11. Test / QC coverage matrix

| Surface | Focused test(s) | QC script | Query seam |
|---------|-----------------|-----------|------------|
| Home | `v2Home*.test.mjs`, Top Opp, adapter | — | `/` |
| Explore | `v2ExploreLanding.test.mjs` | `capture_explore_qc.mjs` | Explore tab |
| Search | `v2SearchResults.test.mjs`, copy | `capture_search_qc.mjs` | collection search |
| Opening | `v2OpeningThisWeek.test.mjs` | `capture_opening_this_week_qc.mjs` | See All / collection |
| Film Detail | `v2FilmDetail.test.mjs`, Save/Seen/NI | `capture_film_detail_qc.mjs` | `?fdMockup=1` |
| Profile | `v2ProfileHub.test.mjs` | `capture_profile_qc.mjs` | Profile tab |
| Theaters | `v2TheatersList.test.mjs` | `capture_theaters_qc.mjs` | Explore → Theaters |
| Theater Detail | `v2TheaterDetail.test.mjs` | `capture_theater_detail_qc.mjs` | `?theaterDetail=1` |
| Planner | `v2PlannerLanding.test.mjs` | `capture_planner_landing_qc.mjs` | Planner tab |
| Build a Plan | `v2BuildPlan.test.mjs` | `capture_build_plan_qc.mjs` | from landing |
| Results | `v2BuildPlanResults.test.mjs` | `capture_build_plan_results_qc.mjs` | from CTA |
| Film sheet | `v2PlanFilmInteractionSheet.test.mjs` | `capture_plan_film_interaction_qc.mjs` | from Results |
| Schedule week | `v2MyScheduleWeek.test.mjs` | `capture_my_schedule_week_qc.mjs` | `?myScheduleWeek=1` |
| Schedule month | `v2MyScheduleMonth.test.mjs` | `capture_my_schedule_month_qc.mjs` | `?myScheduleMonth=1` |
| Settings | `v2ScheduleSettings.test.mjs` | `capture_schedule_settings_qc.mjs` | `?scheduleSettings=1` |
| About | `v2AboutMySchedule.test.mjs` | `capture_about_my_schedule_qc.mjs` | `?aboutSchedule=1` |

**Coverage gap:** Home lacks a dedicated visual-QC capture script (process), not a missing page.

---

## 12. Issue ledger

| ID | Surface | Severity | Description | Evidence | Recommended fix | Stage |
|----|---------|----------|-------------|----------|-----------------|-------|
| A-01 | My Schedule week/month | Low | Living audit previously implied Search opens Results; wiring is deferred stub | `handleOpenScheduleSearch` in `V2App.jsx` | Doc honesty only (done in this packet) | Stage 1 remediation (docs) |
| A-02 | Home | Low | No `capture_home_qc.mjs` | Script inventory | Optional add Home QC script | Deferred / polish |
| A-03 | Theaters list vs Detail | Info | List Favorite stub; Detail uses store | Surface comments + store | Wire list Favorite in Stage 4 UI pass | Stage 4 integration |
| A-04 | Completion audit (Planner By feature) | Low | Build a Plan / Results still marked **Missing** while exec summary said 17/17 | Pre-audit doc rows | Reconcile (done) | Stage 1 remediation (docs) |
| A-05 | Home By feature | Low | Planner CTA still described as placeholder | Stale row | Reconcile (done) | Stage 1 remediation (docs) |
| A-06 | Opening / Home shelf | Info | Home Opening shelf still provisional `newly_added` | Home honesty + Opening fixture page | Opening classifier | Stage 4 integration |
| A-07 | Theater production | Info | Registry visit meta empty; fixtures idealized | theater-data-audit | `T-THEA-01` then `T-THEA-10` | Stage 4 integration |
| A-08 | About / Settings | Info | Sync copy still mockup-faithful vs D09 | About fixture | Copy revision with `T-CAL-02` | Deferred |

No Critical or High Stage 1 visual Failures.

---

## 13. Known gaps (not Stage 1 coverage failures)

- Production theater visit metadata, real Now Showing, addresses/imagery
- Opening-week classifier; Leaving Soon artifact
- Plan generation/persistence; Schedule persistence; calendar sync UI
- Profile store-wired counts; nested Settings pages
- Travel/walk miles; person search; enrichment republish
- Explore destination scaffolds beyond designed landings

---

## 14. Recommended remediation order

1. **Docs only (this packet):** Keep 17/17; fix stale audit rows; annotate roadmaps.  
2. **Optional Stage 1 polish:** Add `capture_home_qc.mjs`; wire Theaters list Favorite to existing store (small, optional).  
3. **Do not block Stage 4 on polish.**

---

## 15. Stage 4 readiness assessment

| Question | Answer |
|----------|--------|
| Is mockup coverage a trustworthy baseline? | **Yes** |
| Can Theater Detail production be wired now? | **No** — visit schema/curation missing |
| Correct first Stage 4 task? | **`T-THEA-01`** (theater visit schema per D06) |
| Why not showtimes wiring / list Favorite first? | Research audit + roadmap §28: public registry is identity-only; Detail production without schema would force fixture leakage or empty slots. `T-THEA-10` curation follows schema. List Favorite is UI-only and does not unlock visit meta. |
| Next after `T-THEA-01` | **`T-THEA-10`** (curate enabled venues), then honest Theater production activation |

---

## 16. Commands and results (this audit)

| Command | Result |
|---------|--------|
| `npm run test:frontend` | **699/699 pass** |
| `npm run build:v2` | Pass |
| `npm run smoke:v2` | Pass |
| Stage 1 QC batch (15 scripts) | Initially **12 pass / 3 fail** (stale Planner scripts) |
| After QC script fixes: `capture_planner_landing_qc.mjs`, `capture_build_plan_qc.mjs`, `capture_build_plan_results_qc.mjs` | **All three pass** |
| Re-verified Planner QC trio | Pass (320 / iPhone15Pro / 430) |

**QC script fixes (audit-only):** Updated stale expectations so scripts match shipped Stage 1 behavior (landing stubs before Build navigation; Results CTA opens Results; film row opens interaction sheet).

---

## 17. Explicit non-actions

- No Stage 4 schema, pipeline, or production wiring  
- No redesign of approved mockups  
- No new persistence  
- No production data contract changes  

---

## Completion checklist (prompt)

1. All 17 surfaces independently verified — **Yes**  
2. Major navigation paths tested — **Yes**  
3. Visible controls classified — **Yes**  
4. Fixture schemas inventoried — **Yes**  
5. Persistence boundaries verified — **Yes**  
6. Responsive QC at target widths — **Yes** (via scripts; Home script gap noted)  
7. Accessibility assessed — **Yes**  
8. Copy consistency assessed — **Yes**  
9. Test/QC coverage mapped — **Yes**  
10. Completion audit reconciled — **Yes**  
11. Roadmaps annotated — **Yes**  
12. First Stage 4 task recommended — **`T-THEA-01`**  
13. No Stage 4 implementation — **Confirmed**
