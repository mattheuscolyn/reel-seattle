# 09 — Implementation Roadmap

**Status:** Active (I-06FDM Film Detail mockup visual replica; I-05S Search Results retained)  
**Related:** [README](./README.md) · [First implementation slice](./17-first-implementation-slice.md) · [Product philosophy](./01-product-philosophy.md) · [Data foundation roadmap](../data-foundation-roadmap.md) · [Development operating model](../development-operating-model.md#v2-product-design-workflow)

## Purpose

Order v2 **implementation** work after design specification. Design leads; code follows. Keep reelseattle.com stable while v2 grows in isolation.

---

## Design / specification gates (complete)

Canonical product specifications exist and are published:

| Spec | Role |
|------|------|
| [Home](./specs/home.md) | Editorial awareness (D-17; Design Review v3 in D-22) |
| [Film Detail](./specs/film-detail.md) | Decision support (D-18) |
| [Planner](./specs/planner.md) | Movie-day generation + Stage 2 direction (D-19) |
| [Theater](./specs/theater.md) | Venue identity + program (D-20) |
| [Explore / Search](./specs/explore-search.md) | User-directed discovery (D-23) |
| [Opportunity expression](./specs/opportunity-expression.md) | Cross-surface Opportunity grain (D-24) |
| [Profile / Settings](./specs/profile-settings.md) | Personal hub + nested Settings (D-25) |
| [Global navigation](./specs/global-navigation.md) | **Home · Explore · Planner · Profile** (D-26) |

These gates authorize **planning** and **isolated** implementation. They do **not** authorize replacing the production site.

**Still deferred (not blockers for an honest Home baseline):** chrome pixel specs, icon set, ranking/signal engines, canonical film identity, landscape art, Leaving Soon shipping, Stage 2 Planner, Profile persistence, accounts.

---

## First implementation slice (D-27)

> Full decision record: **[17 — First implementation slice](./17-first-implementation-slice.md)**

### Chosen slice

**Isolated v2 Home editorial baseline** — local-only v2 app with stub four-destination nav and an honest scarce Home using current showtimes / theaters / newly-added / posters.

### Product question

Can Reel Seattle present a calm, one-opportunity-at-a-time editorial Home without inventing ranking, cultural metadata, landscape art, or personalization?

### Isolation

Second Vite application (cockpit pattern): separate root and outDir; never shipped via `check:dist` / Pages deploy.

### Explicit non-prerequisites

The following are **not** required before starting the first slice:

* Film identity / TMDB enrichment
* Leaving Soon on Pages
* Ticket URL population
* Stage 2 Planner
* Profile accounts or status persistence
* Production feature-flag framework

### Implementation progress

| Task | Status |
|------|--------|
| **I-01** Isolated v2 Vite shell | **Complete** — `v2/`, `npm run v2` → http://127.0.0.1:5175/, `dist-v2/` |
| **I-02** v2 Home data adapter | **Complete** — `v2/adapters/buildHomeData.js` + allowlisted `/data` |
| **I-03** Top Opportunities region | **Complete** — selector retained for later honest wiring |
| **I-03R / I-03R2** Prior visual foundation | **Superseded** by Home mockup direction (violet + five-tab + full composition) |
| **I-04M** Home mockup visual composition | Superseded in part by I-04C (nav/data/interaction); violet visual tokens retained |
| **I-04C** Interaction + data correction | Complete for Home — four-tab nav; real Top Opp; inline expand; Film Detail context; honest shelves |
| **I-05E** Explore landing | Corrected by I-05E2 — Quick Start / Browse By / search / recent; scaffolds |
| **I-05E2** Explore landing correction | Complete for lower-page IA — Suggested Starts + Film Activity; Recent below activity |
| **I-05S** Search Results design | **In review** — film-first list, inline expand, restrained violet, honest filters |
| **I-06FD** Film Detail design | Structure + actions + scaffolds established |
| **I-06FDM** Film Detail mockup visual replica | **In progress / authoritative visual pass** — fixture-first mockup content; real-data mapping deferred |
| **I-06FDV** Film Detail visual fidelity (prior) | Superseded by I-06FDM mockup-first approach |
| **Stage 1 Profile hub** | **Complete (visual / fixture)** — `ProfileDestination` + `profileMockupFixture`; store wiring deferred |
| **Stage 1 Planner landing** | **Complete (visual / fixture)** — `PlannerDestination` + `plannerLandingMockupFixture`; Build/Schedule deferred |
| I-06–I-07 | Pending |

See [17 — Follow-up task sequence](./17-first-implementation-slice.md#follow-up-task-sequence).

---

## Later slices (ordered directionally, not scheduled)

1. **Explore destination pages (require dedicated human-reviewed mockups first)** — Movies, Theaters, Formats, Collections, Coming Soon, Special Events, Suggested Starts destination pages (Everything/Today/This Week/Weekend), final Film Activity / Seen / Not interested management — Search Results list/expand design is established by I-05S; do not treat remaining scaffolds as designed
2. **Final Opportunity Detail + showtimes-focused page designs** — Film Detail (I-06FD) opens scaffolds only; not final Opportunity/showtimes UIs
3. **Full Planner flow** — Film Detail Add to planner starts a two-choice sheet (single-film calendar vs Build a movie day); calendar write / itinerary engine deferred
4. **Save system** — deferred; mockup visual pass uses local toggle only (not persistence)
5. **Theater baseline** — registry + program; omit address/imagery until data exists
6. **Opportunity expression reuse** across Explore / Film Detail / Theater (reconcile scaffold Opportunity Detail with D-24)
7. **Planner v2 presentation** — prefer isolated surface; do not silently re-skin production Planner
8. **Profile local hub** — only after status persistence approach is decided
9. **Person / cast / crew search data** — not available in public artifacts
10. **Account-level preference synchronization** — deferred
11. **Production cutover planning** — separate gated program; never accidental

Exact sequencing may change after Home slice learnings.

---

## Parallelism with data foundation

v2 implementation and data foundation proceed in parallel ([data-foundation roadmap](../data-foundation-roadmap.md)).

| Data work | Relationship to first slice |
|-----------|------------------------------|
| Film identity / enrichment | **Not a blocker** for Home baseline |
| Theater address / geocoding / imagery | Needed for richer Theater later |
| Leaving Soon ship gate | Needed before Home Leaving Soon region |
| Presentation-attribute consistency | Improves honest format reasons on Home |
| Ticket URL population | Needed before ticket actions |

Do **not** turn every v2 feature into a data-foundation blocker. Prefer smaller honest baselines.

---

## Relationship to the stable production site

| Production today | v2 first slice |
|------------------|----------------|
| Showtimes `/`, Recently Added, Planner | Isolated Home prototype |
| Nav: Showtimes · Planner | Labels: Home · Explore · Planner · Profile (stubs) |
| Deployed `dist/` on Pages | `dist-v2` (or equivalent) **not** deployed |

Rules:

* Do not couple v2 work to silent legacy refactors
* Do not change production routes in the first slice
* Cursor implements agreed specs; it does not invent UX to fill gaps

---

## Rules

* Do not schedule UI from incomplete specs for that surface
* Do not fabricate unavailable data
* Do not mark navigation implementation, Profile persistence, ranking, or accounts complete without evidence
* Prefer small, reversible, independently testable tasks (I-01…)
* Design-review imagery supports interpretation; written specs are authoritative

---

## See also

* [17 — First implementation slice](./17-first-implementation-slice.md)
* [Development operating model — v2 design workflow](../development-operating-model.md#v2-product-design-workflow)
* [Canonical screen specs](./specs/)
