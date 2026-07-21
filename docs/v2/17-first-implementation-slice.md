# 17 — First v2 Implementation Slice

**Status:** Decision recorded (D-27); **I-03 complete** — next **I-04**  
**Authority:** Authoritative for the *first* v2 implementation slice only; does not replace canonical screen specs  
**Related:** [Implementation roadmap](./09-implementation-roadmap.md) · [v2 README](./README.md) · [Canonical Home](./specs/home.md) · [Canonical Global navigation](./specs/global-navigation.md) · [Canonical Opportunity expression](./specs/opportunity-expression.md) · [Editorial design language](./15-editorial-design-language.md) · [Data foundation roadmap](../data-foundation-roadmap.md) · [Development operating model](../development-operating-model.md#v2-product-design-workflow) · [Data artifact inventory](../data-artifact-inventory.md)

---

## Decision

**Recommended first slice:** Isolated **v2 Home editorial baseline** — a local-only v2 app shell with canonical four-destination navigation chrome (non-functional stubs for Explore / Planner / Profile) and an honest Home briefing using only currently trustworthy public data.

**Product question this slice proves:**

> Can Reel Seattle present a calm, scarce, one-opportunity-at-a-time editorial Home that feels like a cinema publication — without inventing ranking, cultural metadata, landscape art, or personalization?

**Implementation progress:**

→ **I-01 complete** (isolated v2 Vite shell)  
→ **I-02 complete** (Home data adapter + allowlisted `/data`)  
→ **I-03 complete** (Top Opportunities region)  
→ **Next: I-04 — Supporting Home regions**  
See [Follow-up task sequence](#follow-up-task-sequence) and [Local v2 app commands](#local-v2-app-commands-i-01).

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
* Minimal shell expressing **Home · Explore · Planner · Profile** labels; only **Home** is implemented
* Explore / Planner / Profile as **labeled stubs** (placeholder screens stating “not in this slice”)
* Home regions implementable with current data:
  * Editorial orientation (honest, minimal)
  * Top Opportunities — full-width, one-at-a-time (~3 curated/scarce items)
  * Supporting awareness using **newly_added** as Opening/newly-aware module (label honestly; do not claim “Opening This Week” if semantics differ)
  * Explore More / Build a Movie Day as **non-functional or stub CTAs** where destinations do not exist yet
* Featured Opportunity expression (artwork = poster with typography-led fallback; title; theater; timing; one **honest** reason string derived from available facts, e.g. format tag, newly added, limited remaining showtimes — never invented culture)
* Mobile-first layout; basic desktop adaptation of the same hierarchy
* Accessibility baseline for Home carousel/story navigation ([Home](./specs/home.md))
* Frontend tests for data adapter + critical Home behavior
* Smoke path for the v2 app (local)

### Explicit exclusions

* Shipping v2 to GitHub Pages / replacing `/`
* Real Explore, Film Detail, Theater, Planner Stage 2, or Profile
* Signal/ranking engine; Best Opportunity algorithm
* Landscape hero art ingestion
* Leaving Soon section (artifact not shipped; do not invent)
* Fabricated synopsis, director, cultural significance, fake Seen/Saved counts
* Ticket purchase flows (ticket URLs empty in practice)
* Accounts, persistence, personalization, notifications
* Production CSS/token refactor of the live site
* Fifth nav tab; Theater/Saved/Settings as tabs

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

**I-04 — Supporting Home regions**

Add orientation / newly-added awareness and stub CTAs beneath Top Opportunities. No Explore/Planner/Profile implementation. Governed by this document and [home.md](./specs/home.md).

### I-03 Top Opportunities selection (mechanical)

| Item | Value |
|------|-------|
| Selector | `v2/adapters/selectTopOpportunities.js` |
| UI | `v2/topOpportunities/*` via `HomeDestination` |
| Default / hard max | 3 / 5 |
| Unit | One film per selection; representative = earliest chronological candidate |
| Fill order | Newly added → special format → limited listings (≤2 showtimes) → chronological fill with theater diversity on equal times |
| Reason labels | Newly added · Special format · Limited current listings · Available at multiple theaters · Showing soon |
| Film Detail | Not routed — inline “Showing details” panel only |
| Dev status | Collapsed `<details>` beneath the region |

---

## Open questions

| Topic | Status |
|-------|--------|
| Exact directory / package script names for the v2 app | **Resolved in I-01** — `v2/`, `npm run v2`, `dist-v2`, port 5175 |
| Top Opportunity selection: checked-in editorial fixture vs rule-light heuristic | **Resolved for I-03** — rule-light deterministic heuristic in `selectTopOpportunities` |
| Tapping a Top Opportunity: no-op, stub Film Detail, or placeholder | **Resolved for I-03** — inline showing-details panel; no Film Detail route |
| Newly-added module label (“Recently added” vs “Opening This Week”) | Open — prefer honest semantics (`newlyAdded` in adapter) |
| When Leaving Soon becomes eligible | After product + data gate to ship `leaving_soon_current` |
