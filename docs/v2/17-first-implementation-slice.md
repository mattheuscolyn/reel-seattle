# 17 — First v2 Implementation Slice

**Status:** Decision recorded (D-27); **I-05E Explore landing** — discovery hub scaffolds; I-04C Home interaction retained  
**Authority:** Authoritative for the *first* v2 implementation slice; product-owner corrections in I-04C/I-05E supersede temporary five-tab / fixture-default directions  
**Related:** [Implementation roadmap](./09-implementation-roadmap.md) · [v2 README](./README.md) · [Canonical Home](./specs/home.md) · [Canonical Explore / Search](./specs/explore-search.md) · [Canonical Global navigation](./specs/global-navigation.md) · [Canonical Film Detail](./specs/film-detail.md) · [Data foundation roadmap](../data-foundation-roadmap.md)

---

## Decision

**Recommended first slice:** Isolated **v2 Home editorial baseline** with honest data wiring and contextual Film Detail.

### Product corrections (I-04C) — supersede I-04M nav/fixture defaults

| Topic | Authoritative now |
|-------|-------------------|
| Primary nav | **Home · Explore · Planner · Profile** (four tabs) |
| Movies / Theaters / Me | **Not** primary tabs — Movies/Theaters live under Explore concepts |
| Top Opportunity | Real `selectTopOpportunities(HomeData)` — not fictional fixtures |
| Ordinary film cards | **Inline expand** first (“Is this worth investigating?”) |
| Top Opportunity card | Opens **contextual Film Detail** (Home stays active origin) |
| More details | Opens Film Detail; Back restores Home scroll/expansion when captured |
| See all | Dedicated Explore-associated collection surfaces (not Explore landing) |
| Explore More rows | All open **Explore landing** for now |
| Opening This Week | No approved opening-week classifier — provisional **newly_added** with honesty banner, or unavailable |
| Leaving Soon | **Gated** — unavailable shell; artifact not allowlisted |
| Visual fixtures | `v2/fixtures/homeVisualFixtures.js` — **visual-test only**, not normal Home |

### Explore landing (I-05E / I-05E2 correction)

| Topic | Authoritative now |
|-------|-------------------|
| Purpose | Discovery hub — choose a path; not an exhaustive movie list |
| Primary nav | Still **Home · Explore · Planner · Profile**; Explore active on landing + Explore sub-surfaces |
| Theaters / Saved / Me | **Not** primary tabs |
| Regions (order) | Intro + search → Quick Start → Browse By → **Suggested Starts** → **Your Film Activity** → Recent Searches |
| Suggested Starts | Everything / Today / This Week / Weekend — date-scope shortcuts (not personalized film recs) |
| This Week semantics | **Rolling 7-day Pacific window** (today through today+6) — not a calendar Mon–Sun week; product question logged if label is confusing |
| Weekend semantics | Pacific **Friday–Sunday**; if today is Fri–Sun, use the current weekend |
| Film Activity | Device-local **Seen** + **Not interested** summaries; Manage → Film Activity scaffold |
| Not interested | User-facing label for the dismissed-film store; entry via Film Activity (no Hidden poster shelf on landing) |
| Recent searches | Device-local; placed **below** Film Activity |
| Search | Title + theater keyword only; placeholder may say “person”; **no** person/cast matching |
| Sub-surfaces | Modest scaffolds only — **not** final page designs |
| Film Detail | Remains contextual; Explore origin stays active when entered from Explore |

**Surfaces that still require dedicated human-reviewed mockups before final implementation:** Movies, Theaters, Formats & Experiences, Collections, Coming Soon, Special Events, Suggested Starts destination pages, final Film Activity / Seen / Not interested management, final Opportunity Detail, final showtimes-focused page, and full Planner flows. **Film Detail** and **Search Results** have approved mockup implementations (I-06FD / I-05S) — do not treat remaining scaffolds as designed.

Film Detail is a **contextual deep surface**, reachable from Home / Explore / Theater / Planner / shared link — not a child page owned exclusively by Explore.

**Implementation progress:**

→ **I-01–I-03** complete (shell, adapter, selector)  
→ **I-04M** visual composition (violet tokens, Home regions) — partially superseded by I-04C for nav/data/interaction  
→ **I-04C** — four-tab nav; real Top Opportunity; inline expansion; contextual Film Detail scaffold; honest Opening/Leaving states  
→ **I-05E** — Explore landing + honest destination scaffolds; local recent/hidden stores  
→ **I-05E2** — Suggested Starts + Film Activity; Recent Searches reordered; Hidden preview removed from landing  
→ **I-05S in review** — designed Search Results (film-first, inline expand, restrained violet); scaffolds elsewhere unchanged  
→ **I-06FD in review** — designed Film Detail (cinematic hero, actions, Why See It, Best Way, Today’s showtimes, Planner-start sheet)  
→ **I-06FDV / I-06FDV2 in progress** — compact cinematic hero; attached action row; square evidence-card grid; Best Way facts row; structured Today’s Showtimes; `?fdVisual=1` fixture QC  

### Search Results (I-05S)

| Topic | Authority |
|-------|-----------|
| Design | Attached revised mockup with **restrained violet** (active filters, Explore back, More details, nav) |
| Architecture | Film-first grouped results; Theater and Format sections when matches exist |
| Expansion | One inline expand at a time — “Is this worth investigating?”; More details → contextual Film Detail |
| Filters | Type: All/Movies/Theaters/Formats; Time: Playing now / Today / This week; sheet: theater + format (honest subset) |
| Playing now | Films with showtimes on/after today through rolling week (Pacific) — **not** minute-level live status |
| This week | Rolling 7-day Pacific window (unchanged) |
| Ordering | Exact title → prefix → contains → sourceTitle → next showtime → alpha |
| Search fields | Titles, theaters, formats only — **no** person/cast/director |
| Save | Omitted / unavailable (no approved Save store) |
| Not interested | Writes dismissed-film store; removes from results with Undo |
| Back | Explore landing from Search; Film Detail Back restores Search query/filters/expansion via `returnSurface` + `searchUi` |

### Film Detail (I-06FD)

| Topic | Authority |
|-------|-----------|
| Design | Approved Film Detail mockup (no ticket-purchase CTA; Add to planner in action row) |
| Origin | Contextual deep surface; originating primary stays active |
| Why See It | Database-derived factual signals only |
| Synopsis | Omitted until enrichment; More expand ready when synopsis exists; no thematic invention tags |
| Best Way | Emphasized entry opportunity when valid; opens Opportunity Detail scaffold |
| Today’s showtimes | Pacific today; See all → film-prefiltered showtimes scaffold |
| Planner entry | Two-choice sheet → Planner seed (single calendar vs Build a movie day) |
| Ticketing | No checkout; external ticket links only on Opportunity scaffold |

**Still requiring dedicated mockups (not complete):** Suggested Starts destination pages; Everything/Today/This Week/Weekend pages; Film Activity Manage / Seen / Not interested final designs; final Opportunity Detail; final showtimes page; full Planner; Movies; Theaters; Formats; Collections; Coming Soon; Special Events; person-search data; account sync; Save system.

**Search Results visual-polish backlog (logged):** reduce excessive heavy typography; simplify nested borders; lighten filter density; improve expanded-result hierarchy; improve long-title handling; remove pipeline-like user-facing wording.

---

## Repository audit

### Frontend and deployment (current)

| Area | Finding |
|------|---------|
| **Entry** | `index.html` → `src/main.jsx`; Vite `vite.config.js`; `base: '/'` |
| **Routes** | `/` Showtimes, `/recently-added`, `/planner`, legacy redirects (`src/App.jsx`) |
| **Nav** | Showtimes + Planner only (`src/appNav.js`) — not v2 Home · Explore · Planner · Profile |
| **Styling** | Global CSS vars in `src/index.css`; large `src/App.css`; **no** CSS modules |
| **Components** | `src/pages/`, `src/components/`, hooks, adapters — production Showtimes/Planner oriented |
| **Tests** | `npm run test:frontend` → Node test runner on `tests/frontend/*.test.mjs` |
| **Deploy** | `npm run build` → `dist/` → GitHub Pages (`.github/workflows/deploy.yml`); `check:dist` gates artifacts |
| **Cockpit** | Proven **second Vite app**: `vite.cockpit.config.js`, root `cockpit/`, `dist-cockpit`, localhost hostname gate, **forbidden** from public `dist/` |
| **Feature flags** | **None** in the public SPA |

### Isolation options grounded in the repo

| Strategy | Status |
|----------|--------|
| Second Vite app, separate outDir, never ship to Pages (cockpit pattern) | **Proven** — preferred for first v2 UI |
| Selective artifact gating (`leaving_soon` not shipped) | Proven for data; not a UI shell |
| Feature-flagged production routes | **Not present** — invent if chosen later |
| Separate Pages project / subdomain | **Not present** |

### Data readiness by canonical surface

| Surface | Available now | Partial | Unavailable (must omit / not fake) |
|---------|---------------|---------|-------------------------------------|
| **Home** | Titles, posters, theaters, showtimes, pipeline health; newly-added (`newly_added_current`) | Format tags (source-dependent); Opening This Week ≈ newly-added (different semantics); Leaving Soon artifact exists but **not shipped** | Landscape artwork; relevance/signal engine; cultural significance; personalization |
| **Explore** | Title substring search; date + theater filters (live Showtimes) | Format display tags; parent/variant grouping | Full entity search; Seen/Saved; rich metadata filters |
| **Film Detail** | Title, poster, runtime, showtimes by film key; parent grouping | Format tags | Synopsis, year, director, cultural signals, Best Opportunity ranking, film page route |
| **Theater** | `id`, `name`, `type`, `city`, `neighborhood` (partial), timezone; program via showtimes | Neighborhood coverage incomplete | Address, venue imagery, amenities |
| **Planner** | Same-theater multi-film generation; URL share; required/preferred/exclude | — | Stage 2 sculpting; travel; pricing; durable My Plan store |
| **Profile** | — | Legacy Marathon `localStorage` / URL state only | Accounts; Seen/Saved/Not interested; memberships; preferences |
| **Opportunity** | Time, theater, film key; some `format_tags` | `status` in JSON unused by UI; `ticket_url` schema-empty in practice | Auditorium; durable Opportunity identity; reliable tickets |

Sources: `public/data/showtimes_current.json`, `newly_added_current.json`, `theaters.json`, `pipeline_report.json`; `leaving_soon_current.json` review-only; schemas under `schema/`; adapters in `src/showtimesAdapter.js`.

---

## Candidate comparison

| ID | Candidate | User value | Data ready? | Arch value | Visual review | Public-site risk | Throwaway risk | Size | Verdict |
|----|-----------|------------|-------------|------------|---------------|------------------|----------------|------|---------|
| **A** | v2 shell + canonical nav only | Low alone | N/A | High | Medium (empty) | Low if isolated | Medium if overbuilt | Small | Necessary **first task**, not the whole slice |
| **B** | Home editorial baseline | **High** — proves v2 editorial product | **Yes** for honest scarce Home | High (featured Opportunity expression) | **High** | Low if isolated | Low if honest | Medium | **Recommended slice** |
| **C** | Explore baseline | Medium–high | Strong overlap with Showtimes | Medium | Medium | Higher if near production | Medium | Medium | Wait — Home differentiates v2 more clearly |
| **D** | Film Detail baseline | Medium | **Thin** without synopsis/year/director | Medium | Low without inventing copy | Low if isolated | High (hollow page) | Medium | Wait for identity/enrichment or accept extremely thin MVP later |
| **E** | Theater baseline | Medium | Registry + program OK; no imagery/address | Medium | Medium | Low | Medium | Medium | Strong **second** surface after Home patterns exist |
| **F** | Planner visual re-skin | Medium | Engine exists | Low–medium | Medium | **High** if touching production Planner | **High** | Large | Wait — do not couple to live Planner |
| **G** | Opportunity primitives only | Low alone | Partial formats | High | Low | Low | Medium | Small | Absorb into Home featured/secondary expressions |
| **H** | Cockpit-as-v2 | Low | N/A | Confusing | Low | Low | High | — | Reject — cockpit is data inspection, not product |

---

## Why B wins

1. **Proves the defining v2 design:** full-width, one-at-a-time Top Opportunities ([Home](./specs/home.md) D-22).
2. **Honest with current data:** scarce editorial selection can use explainable, rule-light or curated fixtures from existing showtimes / formats / newly-added — **without** claiming a signal engine.
3. **Establishes reusable patterns:** isolated Vite app (from A), featured Opportunity expression ([opportunity-expression.md](./specs/opportunity-expression.md)), dark cinematic Home mood ([15](./15-editorial-design-language.md)), stub nav destinations ([global-navigation.md](./specs/global-navigation.md)).
4. **Low risk to reelseattle.com:** second Vite root, never shipped to Pages (cockpit pattern).
5. **Unlocks next slices:** Explore and Theater can reuse shell, tokens, and Opportunity components.

### Why leading alternatives wait

* **A alone** — infrastructure without product review value.
* **C** — valuable, but closer to today’s Showtimes; less unique as first proof of v2.
* **D** — would force fabricated synopsis/cultural content or feel empty.
* **E** — good follow-on after Home expression patterns exist.
* **F** — endangers the stable public Planner.
* **G alone** — no destination to review.

---

## Scope

### In scope (first slice)

* Isolated local-only v2 Vite application (separate root/outDir; not in public `dist/`)
* Shell expressing **Home · Movies · Theaters · Planner · Me**; only **Home** is implemented
* Movies / Theaters / Planner / Me as **labeled stubs**
* Home regions (mockup order):
  * Header + editorial orientation
  * Top Opportunity — one-at-a-time feature card (~3 items; fixture-backed for visual slice)
  * Opening This Week — compact poster shelf (**design fixture**; not `newly_added` rebranding)
  * Leaving Soon — compact poster shelf (**design fixture**; not gated artifact)
  * Build a Movie Day + Explore More stub CTAs
* Violet accent tokens in `v2/v2.css`; stacked REEL SEATTLE wordmark
* Mobile-first layout; centered max-width shell at larger widths
* Frontend tests for destinations, fixtures, and retained adapters
* Smoke path for the v2 app (local)

### Explicit exclusions

* Shipping v2 to GitHub Pages / replacing `/`
* Real Movies / Theaters / Planner / Me destinations
* Signal/ranking engine; Best Opportunity algorithm
* Consuming gated `leaving_soon_current` as production Home data
* Presenting fixtures as live Opening/Leaving classifications
* Fabricated Seen/Saved counts or accounts
* Ticket purchase flows
* Production CSS/token refactor of the live site
* Final desktop layout

---

## Current data contract

| Artifact | Use in slice |
|----------|----------------|
| `public/data/showtimes_current.json` | Opportunities, theaters, times, format_tags, posters |
| `public/data/theaters.json` | Venue names / type / city / neighborhood |
| `public/data/newly_added_current.json` | Supporting “recently added” awareness module |
| `public/data/pipeline_report.json` | Optional freshness honesty (non-developer tone) |
| `public/data/leaving_soon_current.json` | **Do not consume** in this slice (not a Pages artifact; gated) |

Adapter: prefer a **v2-local read model** (new module under the v2 app) that maps public JSON → Home view models. Do not silently change `src/showtimesAdapter.js` production behavior. Reuse types/helpers only when safe and tested.

**Honesty rules (mandatory):**

* No fabricated synopsis or cultural significance
* No fake Best Opportunity ranking language
* No pretend personalization or Seen/Saved counts
* No invented theater amenities
* No unsupported Leaving Soon claims
* No assumed canonical `film_id` beyond `showtime_film_key` / parent keys
* Placeholder fixture JSON allowed only if labeled as **design fixture / test data**, never as production truth

---

## Isolation strategy

**Preferred:** Cockpit-pattern second Vite application.

**I-01 decided shape:**

* App root: `v2/`
* Config: `vite.v2.config.js`
* OutDir: `dist-v2` (gitignored; never deployed)
* Scripts: `npm run v2`, `npm run build:v2`, `npm run smoke:v2`
* Dev URL: http://127.0.0.1:5175/
* Hostname allowlist: `localhost`, `127.0.0.1`, `[::1]` (mirror cockpit)
* `check:dist` forbids v2 / `dist-v2` paths in production `dist/`
* Data serving: allowlisted `/data/*` via `vite.v2.config.js` middleware (`publicDir: false` preserved)
* Leaving Soon is **not** allowlisted and must not enter HomeData (`leavingSoonExcluded: true`)

### I-02 Home data adapter

| Item | Location / behavior |
|------|---------------------|
| Pure transform | `v2/adapters/buildHomeData.js` |
| Opportunity identity | `v2/adapters/opportunityIdentity.js` |
| Loader | `v2/data/loadHomeData.js` |
| Allowlist | `v2/data/allowedDataRoutes.js` |
| Inputs | `showtimes_current`, `theaters`, `newly_added_current`, optional `pipeline_report` |
| Outputs | `HomeData` with `films`, `opportunities`, `theatersById`, `newlyAdded`, `opportunityCandidates`, `warnings`, `sourceHealth` |
| Identity | Film = `showtime_film_key`; opportunity dedupe prefers `source`+`source_showtime_id`, else showtime `id`, else composite |
| Selection | `opportunityCandidates` are mechanical inputs only — not recommendations |
| Integration proof | Home shows development data status under a `<details>` control (moved from dedicated `HomeDataStatus` component in I-03) |

**Do not** invent a monorepo or new framework. Stay on React 19 + Vite already in the repo.

---

## Testing strategy

* Unit tests for v2 data adapter (Node test runner, same style as `tests/frontend/`)
* Component/behavior tests for Top Opportunity finite set and navigation between stories
* Accessibility smoke: keyboard control for Top Opportunities; no color-only active state
* `npm run test:frontend` must keep passing for production suite
* Local smoke for v2 app; **no** Pages deploy of v2
* Do not regenerate public data

---

## Accessibility expectations

Inherit [Home](./specs/home.md) and [Global navigation](./specs/global-navigation.md): visible labels; keyboard story controls; reduced motion; readable contrast over imagery; focus management; stub destinations clearly announced as unavailable.

---

## Risk controls

| Risk | Control |
|------|---------|
| Accidental Pages ship | Separate outDir + `check:dist` forbid + no deploy workflow change |
| Fabricated editorial claims | Honesty rules + code review checklist |
| Scope creep into Explore/Film Detail | Explicit exclusions; stub destinations only |
| Throwaway styling | Follow [15](./15-editorial-design-language.md) + Home canonical hierarchy; keep CSS scoped to v2 app |
| Coupling to live Showtimes CSS | Do not edit production `App.css` for v2 look |

---

## Follow-up task sequence

| ID | Name | Objective | Boundaries | Dependencies | Completion evidence |
|----|------|-----------|------------|--------------|---------------------|
| **I-01** | Isolated v2 Vite shell | Second Vite app boots locally; empty Home placeholder; not shippable | No Home content yet; no production route changes | D-27 | **Done** — `v2/`, port 5175, `dist-v2`, hostname gate, four-destination placeholders, tests |
| **I-02** | v2 data adapter | Map showtimes / theaters / newly_added → Home view models | No UI polish; no ranking engine | I-01 | **Done** — `buildHomeData`, allowlisted `/data`, adapter + loader tests, Home data-status proof |
| **I-03** | Top Opportunities region | One-at-a-time featured stories (~3) with honest reasons | No Leaving Soon; no Film Detail route (tap may no-op or stub) | I-02 | **Done** — `selectTopOpportunities`, one-at-a-time UI, bounded Prev/Next, inline details |
| **I-04** | Supporting Home regions | Orientation + newly-added module + stub CTAs | No Explore/Planner/Profile implementation | I-03 | Hierarchy matches Home spec order |
| **I-05** | Nav chrome stubs | Four labels; Home active; others stub screens | No real routing to production pages | I-01 | Matches Global navigation labels |
| **I-06** | Responsive + a11y pass | Mobile-first; desktop hierarchy preserved | No new features | I-03–I-05 | Checklist against Home/Global nav a11y |
| **I-07** | QC + docs reconcile | Record slice status; note learnings | Docs only + fixes | I-06 | Roadmap updated; clean tree |

Tasks may be slightly reordered (e.g. I-05 with I-01) if that reduces thrash — keep each independently reviewable.

---

## Definition of done (slice)

* Local-only v2 app demonstrates scarce Top Opportunities + supporting newly-added awareness
* Canonical Home hierarchy and one-at-a-time rule are visibly followed
* No production UI/data/deploy changes
* Honesty rules satisfied
* Frontend production tests still pass
* Slice status recorded in [09 — Implementation roadmap](./09-implementation-roadmap.md)

---

## Local v2 app commands (I-01 / I-02)

| Item | Value |
|------|-------|
| App directory | `v2/` |
| Dev | `npm run v2` → http://127.0.0.1:5175/ |
| Build | `npm run build:v2` → `dist-v2/` |
| Smoke | `npm run smoke:v2` |
| Status | **Local-only** — excluded from `npm run build`, GitHub Pages, and `check:dist` |
| Data | Allowlisted `/data/showtimes_current.json`, `/data/theaters.json`, `/data/newly_added_current.json`, `/data/pipeline_report.json` (Leaving Soon not served) |
| Adapter | `v2/adapters/buildHomeData.js` (pure); `v2/data/loadHomeData.js` (fetch) |

Destination switching uses in-memory state (no URL deep links yet). That is intentional for I-01.

---

## Next executable follow-up

**After I-04M visual approval:** wire honest data where fixtures currently stand (Opening / Leaving semantics; optional Top Opportunity from I-02/I-03 adapters), or polish remaining mockup deltas. Do not mark fixture regions data-complete.

### I-03 Top Opportunities selection (mechanical)

| Item | Value |
|------|-------|
| Selector | `v2/adapters/selectTopOpportunities.js` (retained; not driving current Home UI) |
| UI | `v2/home/TopOpportunityFeature.jsx` via fixture array |
| Default / hard max | 3 / 5 |
| Unit | One film per selection; representative = earliest chronological candidate |
| Fill order | Newly added → special format → limited listings (≤2 showtimes) → chronological fill with theater diversity on equal times |
| Reason labels | Newly added · Special format · Limited current listings · Available at multiple theaters · Showing soon |
| Film Detail | Not routed — key facts overlaid on the stage (I-03R); no Film Detail page yet |
| Dev status | Collapsed `<details>` beneath the region |
| Artwork | Sharp `object-fit: cover` backdrop/poster; dark lower gradient; Featured badge + pagination dots per mockup |
| Visual foundation | `v2/v2.css` only — violet accent; **no** production CSS inheritance; I-03R2 gold accent **superseded** |
| Fixtures | `v2/fixtures/homeVisualFixtures.js` — Top Opportunity, Opening This Week, Leaving Soon |
| Visual publish | **Human visual review required** before pushing |

---

## Open questions

| Topic | Status |
|-------|--------|
| Exact directory / package script names for the v2 app | **Resolved in I-01** — `v2/`, `npm run v2`, `dist-v2`, port 5175 |
| Primary nav labels for Home chrome | **Superseded by mockup** — Home · Movies · Theaters · Planner · Me |
| Top Opportunity for visual slice | **Fixture-backed** three-item array; I-03 selector retained for later |
| Opening This Week | **Design fixture** until production classification exists — do not equate to `newly_added` |
| Leaving Soon visual region | **Design fixture** — gated artifact still not consumed |
| When Leaving Soon production data becomes eligible | After product + data gate to ship `leaving_soon_current` |
| Full rewrite of global-navigation.md D-26 | Open — Home chrome supersession recorded in this doc; canonical nav doc pending dedicated update |
