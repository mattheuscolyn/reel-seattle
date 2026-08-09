# v2 Stage 1 Completion Audit

**Status:** Living Stage 1 coverage audit (updated 2026-07-27)  
**Acceptance:** [v2-stage-1-acceptance-report.md](./v2-stage-1-acceptance-report.md) — **17/17 verified accepted** (2026-07-27); Stage 4 continues with **`T-THEA-01`** (theater) — **`T-FILMID-01`** identity foundation is already complete  
**Question:** Which canonical mockup pages/states already exist in the isolated v2 shell, which are partial, and which are still missing?

**Canonical visual SoT:** [`Canonical Mockup Images/`](../../Canonical%20Mockup%20Images/) (17 PNGs)  
**Implementation target:** local v2 app (`npm run v2`, `v2/`) — not the public Showtimes/Planner site.

**Terminology note:** “Stage 1” here means **mockup-page coverage in the v2 shell** (first implementation slice / designed surfaces). It is **not** Planner-spec “Stage 1 — Generate Plans,” and it is **not** Stage 4 data/integration work.

**Related:** [17 — First implementation slice](./17-first-implementation-slice.md) · [09 — Implementation roadmap](./09-implementation-roadmap.md) · [v2 README](./README.md) · surface specs under [`specs/`](./specs/)

---

## Executive summary

| Metric | Count |
|--------|------:|
| Canonical mockup files | **17** |
| Fully implemented (designed surface matches mockup regions) | **17** |
| Partially implemented (exists but scaffold / incomplete vs mockup) | **0** |
| Missing (placeholder only or no designed surface) | **0** |

**Fully (17):** Home Landing · Home inline film overlay · Explore Home · Search Results · Film Detail · Profile hub · Planner Landing · About My Schedule · Opening This Week · Theaters list · **Theater Detail** · Build a Plan · Build a Plan Results · **Results film-click sheet** · **My Schedule (week)** · **My Schedule (month)** · **Schedule Settings**  

**Partial (0):** —  

**Missing (0):** —  

**Bottom line:** All **17** canonical mockup pages/states now have designed Stage 1 surfaces in the v2 shell. Independently verified in the [acceptance report](./v2-stage-1-acceptance-report.md). Stage 4 data depth (registry visit meta, real showtimes, calendar sync, plan persistence) remains deferred.

**Recommended next Stage 1 page:** — (mockup coverage complete)

**Recommended next Stage 4 task:** **`T-THEA-01`** (theater visit schema per D06)

**Estimated prompts to finish Stage 1 mockup coverage:** **0**

---

## Navigation & routing reality

| Concept | v2 today |
|---------|----------|
| Primary destinations | `home` · `explore` · `planner` · `profile` (`destinations.js`) — **in-memory nav**, not URL routes |
| Deep surfaces | `film-detail`, `opportunity-detail`, `showtimes`, `collection` (+ Search / Opening / **Theaters** designed), **`theater-detail`**, **`about-my-schedule`**, **`build-plan`**, **`build-plan-results`**, **`my-schedule-week`**, **`my-schedule-month`**, **`schedule-settings`** |
| Planner / Profile | Designed Stage 1 destinations (`PlannerDestination`, `ProfileDestination`) — fixture-backed |
| About My Schedule | Deep surface via `openAboutMySchedule` / `?aboutSchedule=1` (also from Schedule Settings) |
| Build a Plan | Deep surface via `openBuildPlan` from Planner entry / + |
| Build a Plan Results | Deep surface via `openBuildPlanResults` from Build a Plan CTA; film-click sheet opens over Results |
| My Schedule week | Deep surface via `openMyScheduleWeek` / `?myScheduleWeek=1` from Planner entry |
| My Schedule month | Deep surface via `openMyScheduleMonth` / `?myScheduleMonth=1` from Planner entry |
| Schedule Settings | Sheet surface via `openScheduleSettings` / `?scheduleSettings=1` over Week or Month |
| Theater Detail | Deep surface via `openTheaterDetail` / `?theaterDetail=1` from Theaters list (Beacon) |
| Rejected primary tabs | Movies, Theaters, Me, Saved (mockup chrome obsolete) |

There is **no** React Router path map; “Route” below means **nav surface / destination id**.

---

## Master page checklist

| Feature | Mockup file | Exists? | Route / surface | Visual fidelity | Production status | Notes |
|---------|-------------|---------|-----------------|-----------------|-------------------|-------|
| Home | `Home Landing Page.png` | Yes | `home` | **High** (structure) / Med (enrichment) | **Production-backed** | Top Opp, Opening/Leaving shelves, Planner CTA, Explore More. Leaving = unavailable shell; Opening = provisional/honesty. Nav corrected to 4 tabs (mockup often shows 5). |
| Home · inline expand | *(separate overlay PNG retired; see `Home Landing Page.png` + production `InlineQuickDetail`)* | n/a | Home + `InlineQuickDetail` | **Medium–High** | **Production-backed** | Expand-first on shelves; Save/NI/meta thinner than mockup (enrichment suppressed). |
| Opening This Week | `Opening This Week Page.png` | Yes | `collection:opening-this-week` → `OpeningThisWeekSurface` | **High** | **Fixture-backed (Stage 1)** — not opening-week classifier | Designed list + expand, sort/filters stubs, Save/NI stubs (no store writes). More details → Film Detail. Home shelf remains provisional `newly_added`. QC: `scripts/capture_opening_this_week_qc.mjs`. |
| Explore | `Explore Home Page.png` | Yes | `explore` | **Medium–High** | **Production-backed** | Search, Quick Start, Browse By, Suggested Starts, Film Activity, Recent Searches. Destination targets mostly scaffolds. |
| Search | `Search Results Page.png` | Yes | `collection:search-results` | **High** | **Production-backed** | Film-first, expand, filters sheet, restrained violet. Person search absent (honest). Enrichment fields suppressed. |
| Film Detail | `Film Detail Page.png` | Yes | `film-detail` | **High** (QC fixture) / **Medium** (prod) | **Dual:** production HomeData + suppress; `?fdMockup=1` / `?fdVisual=1` fixtures | Designed regions present; Letterboxd/distance/enrichment suppressed in production. |
| Theaters list | `Theaters Page.png` | Yes | `collection:theaters` → `TheatersSurface` | **High** | **Fixture-backed (Stage 1)** — not registry/showtimes | Inline expand; Now showing strip; Beacon **More details** → Theater Detail; other theaters stub. List Favorite remains stub. QC: `scripts/capture_theaters_qc.mjs`. |
| Theater Detail | `Theater Detail Page.png` | Yes | `theater-detail` → `TheaterDetailSurface` | **High** | **Fixture-backed (Stage 1)** — Beacon visit meta + program | Hero, stats, amenities, pricing/hours, Now showing, Today's showtimes + screen tabs. Favorite uses `favoriteTheatersStore`. QC: `scripts/capture_theater_detail_qc.mjs`. |
| Planner landing | `Planner Landing Page.png` | Yes | `planner` → `PlannerDestination` | **High** | **Fixture-backed (Stage 1)** — not production plans | Upcoming plans, My Schedule / Build a Plan entry cards, Recent activity; Build a Plan opens config; My Schedule opens week view. Film Detail seed note retained. QC: `scripts/capture_planner_landing_qc.mjs`. |
| Build a Plan | `Build a Plan Page.png` | Yes | `build-plan` → `BuildPlanSurface` | **High** | **Fixture-backed + local form state (Stage 1)** | Presets, When/What/Where/Fine tuning, Clear all, summary CTA → Results. No generation/persistence. QC: `scripts/capture_build_plan_qc.mjs`. |
| Build a Plan Results | `Build a Plan Results Page.png` | Yes | `build-plan-results` → `BuildPlanResultsSurface` | **High** | **Fixture itineraries + local sort/selection (Stage 1)** | Sort chips, plan cards, breaks, refine panel; Share / Add to My Schedule stubs. Walk miles fixture-only. Ellipsis omitted. QC: `scripts/capture_build_plan_results_qc.mjs`. |
| Results · film click | `Build a Plan Results Page Film Interaction.png` | Yes | Results + `PlanFilmInteractionSheet` | **High** | **Local preference state only** | Must include / Would love / Neutral / Not interested; Replace / Film details / showtime stubs; focus trap + Escape + backdrop. No recomputation / NI store. QC: `scripts/capture_plan_film_interaction_qc.mjs`. |
| My Schedule · week | `My Schedule Main Page.png` | Yes | `my-schedule-week` → `MyScheduleWeekSurface` | **High** | **Fixture timeline + local week nav (Stage 1)** | Week picker, Next Up, horizontal timeline (12 PM–10 PM), film blocks, breaks, multi-movie grouping, empty days, July at a glance. Search is an **honest deferred stub** (does not open Search Results; day/time prefilter deferred). Settings opens sheet; Month toggles month view. No persistence/calendar. QC: `scripts/capture_my_schedule_week_qc.mjs`. |
| My Schedule · month | `My Schedule Main Page Month Selected.png` | Yes | `my-schedule-month` → `MyScheduleMonthSurface` | **High** | **Fixture-backed (Stage 1)** — heatmap + local day selection (no persistence) | QC: `scripts/capture_my_schedule_month_qc.mjs`. Settings opens sheet. |
| Schedule Settings | `My Schedule Main Page Settings Interaction.png` | Yes | `schedule-settings` → `ScheduleSettingsSurface` | **High** | **Fixture-backed sheet (Stage 1)** — local prefs only | Bottom sheet over Week/Month; Display / Sync / Preferences / About. Calendar sync Off stub; Clear all stub; About opens About page. No persistence. QC: `scripts/capture_schedule_settings_qc.mjs`. |
| About My Schedule | `About My Schedule Page.png` | Yes | `about-my-schedule` | **High** | **Fixture-backed (Stage 1)** — static copy | `AboutMyScheduleSurface` + `aboutMyScheduleMockupFixture`. Seam: `?aboutSchedule=1` / `openAboutMySchedule` / Schedule Settings. Link/FAQ stubs only. No stores. QC: `scripts/capture_about_my_schedule_qc.mjs`. D09 sync-copy revision deferred. |
| Profile | `Profile Page.png` | Yes | `profile` → `ProfileDestination` | **High** | **Fixture-backed (Stage 1)** — not production store-wired | Canonical sections: identity, activity snapshot, Up Next, Membership, Favorite theaters, Settings rows. Header gear = Stage 1 stub. Nested settings / management deferred. QC: `scripts/capture_profile_qc.mjs`. |

### Non-mockup surfaces (for completeness)

| Surface | Status | Notes |
|---------|--------|-------|
| Opportunity Detail | Scaffold | Opened from Film Detail Best Way; not in canonical mockup set |
| Showtimes (film-scoped) | Scaffold | “See all” from Film Detail |
| Explore collections (All Movies, Today, Formats, …) | Scaffold | Specs call out need for dedicated mockups before “final” UI |
| Leaving Soon shelf | Honest unavailable | Gated artifact |
| Onboarding | None | Not in mockup set |
| Global error / empty | Partial | Home load error; Search empty; collection unavailable copy |

---

## By feature

### Home

| Item | Status | Major gaps |
|------|--------|------------|
| Landing composition | **Fully** (designed) | Genre/enrichment on cards; Leaving real data; Opening classifier |
| Top Opportunity | **Fully** (real selector) | Ticket CTA not on live card by design; distance N/A |
| Opening shelf | **Partial** | Honesty / newly_added provisional |
| Leaving shelf | **Partial** | Unavailable shell only |
| Inline quick detail | **Fully** (interaction) | Mockup-level synopsis/year/Save parity |
| Planner CTA | **Fully** | Opens designed Planner landing (fixture plans) |
| Explore More | **Partial** | Routes to Explore landing, not rich rows |
| Opening This Week **page** | **Fully** (designed Stage 1 fixture) | Opening-week classifier; production list wiring |

### Explore

| Item | Status | Major gaps |
|------|--------|------------|
| Landing | **Fully** | Person promise removed; destination pages unfinished |
| Quick Start / Browse By | **Partial** | Open scaffolds |
| Suggested Starts | **Partial** | Chips → scaffolds, not designed pages |
| Film Activity | **Partial** | Summary + manage scaffold |
| Recent searches | **Fully** (local) | — |

### Search

| Item | Status | Major gaps |
|------|--------|------------|
| Results page | **Fully** (designed) | Enrichment display; person results (deferred) |
| Filters sheet | **Fully** | Subset of mockup filters |
| Inline expand → Film Detail | **Fully** | — |

### Film Detail

| Item | Status | Major gaps |
|------|--------|------------|
| Designed page | **Fully** (structure) | Production enrichment / Letterboxd / miles |
| Actions Save/Seen/NI | **Fully** (local) | Profile counts not shown elsewhere yet |
| Add to planner sheet | **Partial** | Seeds placeholder Planner |
| Why See It | **Partial** | Schedule-safe / suppress cultural |
| Best Way → Opp scaffold | **Partial** | Opp not designed |
| Today’s showtimes | **Partial** | A-List badges etc. |

### Theater

| Item | Status | Major gaps |
|------|--------|------------|
| List (mockup) | **Fully** (Stage 1 fixture) | Production registry; list Favorite wiring |
| Detail (mockup) | **Fully** (Stage 1 fixture) | Production visit meta + real program |

### Planner

| Item | Status | Major gaps |
|------|--------|------------|
| Landing | **Fully** (Stage 1 fixture) | Real plans; navigation into Schedule / Build |
| Build a Plan | **Fully** (Stage 1 local form) | Generation / persistence |
| Results + film sheet | **Fully** (Stage 1 fixtures + local prefs) | Engine presentation + travel honesty |

### Schedule

| Item | Status | Major gaps |
|------|--------|------------|
| Week | **Fully** (Stage 1 fixture) | Persistence / calendar |
| Month | **Fully** (Stage 1 fixture) | Persistence / calendar |
| Settings | **Fully** (Stage 1 sheet) | Persistence / calendar sync |
| About | **Fully** (Stage 1 fixture) | D09 sync copy |

### Profile / Settings

| Item | Status | Major gaps |
|------|--------|------------|
| Profile hub | **Fully** (Stage 1 fixture) | Production counts from stores; nested Settings pages; membership integration; favorite persistence UI |
| Nested Settings | **Missing** | Spec exists; rows are Stage 1 stubs only |
| Schedule Settings | **Fully** (Stage 1 sheet) | Separate mockup under Schedule — local prefs only |

---

## Component reuse

### Already reusable

| Component / pattern | Location | Useful for |
|---------------------|----------|------------|
| `AppHeader` / brand | `v2/home/AppHeader.jsx` | Most pages |
| `PrimaryNav` | `v2/PrimaryNav.jsx` | All primary destinations |
| `FilmShelf` / `FilmShelfCard` | `v2/home/*` | Opening page, collections, Profile Up Next |
| `InlineQuickDetail` | `v2/home/InlineQuickDetail.jsx` | Opening page, theater Now Showing expand |
| `TopOpportunityFeature` | `v2/home/TopOpportunityFeature.jsx` | Home only (pattern for featured cards) |
| Search filters / chips / sheet | `SearchResultsSurface.jsx` | Schedule filters, Planner refine |
| Film Detail action row + sheets | `FilmDetailSurface.jsx` | Profile actions, Planner film sheet patterns |
| Collection list scaffold | `CollectionSurface.jsx` | Temporary until designed pages |
| Icons | `v2/icons.jsx` | Global |
| Local stores | saved / seen / NI / favorites / recent | Profile, favorites on Theaters |

### Mostly missing (new UI) — Stage 1 shells now exist; production depth deferred

| Need | Notes |
|------|-------|
| Theater cards (address/thumb/amenities) | Stage 1 fixture cards exist; no production visit meta |
| Calendar / week timeline | Stage 1 fixture timeline exists; no persistence |
| Month heatmap | Stage 1 fixture heatmap exists; no persistence |
| Planner config form | Stage 1 `BuildPlanSurface` exists; no generation |
| Planner result cards + walk UI | Stage 1 Results exist; suppress miles until travel |
| Profile identity / membership cards | Stage 1 fixture hub; stores not wired |
| Settings groups | Schedule Settings sheet exists; nested Profile settings deferred |

**Assemble-from-existing estimate**

| Missing / partial page | Mostly assemble? |
|------------------------|------------------|
| About My Schedule | **Yes** — static sections |
| Profile hub | **Mostly** — counts from stores + lists |
| Planner landing | **Mostly** — CTAs + empty states |
| Opening This Week designed | **Mostly** — FilmShelf + expand + filters pattern from Search |
| Theaters list | **Fully** — designed TheatersSurface + mockup fixture |
| Build a Plan config | **Fully** — BuildPlanSurface + local form state + fixture |
| Build a Plan Results | **Fully** — BuildPlanResultsSurface + fixture itineraries |
| Results film-click sheet | **Fully** — PlanFilmInteractionSheet + local prefs |
| My Schedule week | **Fully** — MyScheduleWeekSurface + fixture timeline |
| My Schedule month | **Fully** — fixture heatmap + local day selection |
| Schedule Settings | **Fully** — ScheduleSettingsSurface sheet + local prefs |
| Theater Detail | **Fully** — TheaterDetailSurface + Beacon fixture |

---

## Missing pages (easiest → hardest)

_All canonical mockup pages are implemented. Remaining work is Stage 4 data fidelity and polish._

---

## Recommended implementation order (smallest Stage 1 finish sequence)

Goal: close **designed mockup coverage** without pretending Stage 4 data/travel/accounts are done.

| # | Prompt focus | Mockups closed | Depends on |
|---|--------------|----------------|------------|
| ✓ | **Profile hub (fixture)** | Profile | Done 2026-07-26 — Stage 1 visual; stores not wired |
| ✓ | **Planner Landing shell** | Planner Landing | Done 2026-07-26 — fixture plans; Build opens config |
| ✓ | **About My Schedule** | About | Done 2026-07-26 — static fixture; Settings entry deferred |
| ✓ | **Opening This Week designed collection** | Opening page | Done 2026-07-26 — fixture cards; Home shelf still provisional |
| ✓ | **Theaters list honest v1** | Theaters list | Done 2026-07-26 — fixture list + expand |
| ✓ | **Build a Plan config v1** | Build a Plan | Done 2026-07-26 — local form; opens Results |
| ✓ | **Build a Plan results v1** | Results | Done 2026-07-26 — fixture itineraries |
| ✓ | **Results film-click sheet** | Film click interaction | Done 2026-07-26 — local prefs; no recomputation |
| ✓ | **My Schedule week v1** | Schedule week | Done 2026-07-26 — fixture timeline; no persistence |
| ✓ | **My Schedule month v1** | Schedule month | Done 2026-07-26 — fixture heatmap; no persistence |
| ✓ | **Schedule Settings sheet** | Settings | Done 2026-07-26 — local prefs; About wired; sync Off stub |
| ✓ | **Theater Detail program-first** | Theater Detail | Done 2026-07-27 — Beacon fixture; favorite store wired on Detail |
| — | Polish pass | Home/Search/FD/Profile/Planner fidelity | Ongoing |

**Do not block Stage 1 page shells on:** AMC enrichment, theater amenities, walk matrix, accounts, Letterboxd.

**Parallel data (not Stage 1 UI):** `T-THEA-01` schema · `T-ENR-01` · plan persistence — unlock fidelity, not first paint of placeholders.

### Estimated prompts

| Scope | Prompts |
|-------|--------:|
| **Remaining to claim Stage 1 mockup coverage** | **0** |

---

## What “Stage 1 complete” should mean

Stage 1 mockup coverage is **complete** when:

1. All **17** canonical mockup pages/states have a designed v2 surface (not `placeholder` / not “scaffold” eyebrow), **or** an explicit product deferral recorded for that mockup.  
2. Unsupported facts remain **suppressed** (honesty over fixture leakage).  
3. Primary nav remains Home · Explore · Planner · Profile.  
4. Theater Detail / Schedule / Planner may still lack Stage 4 data depth, but **layout slots** exist and empty honestly.

Today: **17 / 17** meet that bar; **0 / 17** partial; **0 / 17** missing.

---

## Explicit non-actions (this audit)

- No Stage 4 implementation  
- No redesign of approved mockups  

---

## Completion report (machine-readable summary)

1. **Mockups found:** 17  
2. **Fully implemented:** 17  
3. **Partially implemented:** 0  
4. **Missing:** 0  
5. **Recommended next page:** — (mockup coverage complete)  
6. **Estimated prompts to finish Stage 1:** 0  
7. **Acceptance:** Verified 2026-07-27 — see [v2-stage-1-acceptance-report.md](./v2-stage-1-acceptance-report.md)  
8. **Recommended next Stage 4 task:** `T-THEA-01`  

