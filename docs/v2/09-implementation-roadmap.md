# 09 — Implementation Roadmap

**Status:** Active (I-03R2 visual foundation in review — human approval before publish; I-04 next after approval)  
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
| **I-03** Top Opportunities region | **Complete** — selector + one-at-a-time region |
| **I-03R** Approved design reconciliation | Superseded by I-03R2 |
| **I-03R2** Visual foundation + Top Opportunities fidelity | **In review** — sharp cover crop, shell reset; not pushed |
| **I-04** Supporting Home regions | **Next** after I-03R2 human visual approval |
| I-05–I-07 | Pending |

Canonical four-destination chrome (Home · Explore · Planner · Profile) with placeholders shipped in I-01; I-05 remains available for any later chrome polish beyond the shell.

See [17 — Follow-up task sequence](./17-first-implementation-slice.md#follow-up-task-sequence).

---

## Later slices (ordered directionally, not scheduled)

Do not start these until the first slice is done and reviewed:

1. **Explore baseline** (title/date/theater filters; opportunity-aware results) — reuse v2 shell
2. **Film Detail thin baseline** — only with honest fields; no fabricated synopsis
3. **Theater baseline** — registry + program; omit address/imagery until data exists
4. **Opportunity expression reuse** across Explore / Film Detail / Theater
5. **Planner v2 presentation** — prefer isolated surface; do not silently re-skin production Planner
6. **Profile local hub** — only after status persistence approach is decided
7. **Production cutover planning** — separate gated program; never accidental

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
