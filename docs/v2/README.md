# Reel Seattle v2 — Design Specification

**Status:** Living specification (intentionally incomplete)  
**Track:** Next Public Site / v2 product design  
**Audience:** Product owner, ChatGPT (Product Lead / UX Architect), Cursor (implementation)

This directory is the **canonical source of truth** for Reel Seattle v2 product design.

---

## How to read this

1. The **existing public site** (GitHub Pages legacy app) remains the production experience.
2. The v2 specification is a **parallel effort**. It does not replace or silently reshape the live site.
3. **Implementation follows the specification**, not the reverse. Cursor should implement agreed specs rather than invent UX, navigation, or product behavior.
4. Documents here are **intentionally incomplete** and will evolve through Product Owner + ChatGPT design conversations.
5. **Canonical screen specs** under [`specs/`](./specs/) are authoritative for implementation decisions on those surfaces. Conceptual docs (e.g. [08](./08-screen-specifications.md)) provide philosophy; where they conflict with a canonical screen spec, the screen spec wins.

---

## Document map

| Doc | Purpose | Completeness |
|-----|---------|--------------|
| [01 — Product philosophy](./01-product-philosophy.md) | Mission, promise, principles | Seeded from agreed direction |
| [02 — Core concepts](./02-core-concepts.md) | Film, Opportunity, Plan, Lens | High-level seed only |
| [03 — Discovery model](./03-discovery-model.md) | How opportunities are surfaced (funnel, signals, lenses) | Philosophy expanded (D-2); catalogs/algorithms deferred |
| [10 — Opportunity model](./10-opportunity-model.md) | Opportunity categories, primary story, supporting context | Philosophy documented (D-3) |
| [11 — Film lifecycle](./11-film-lifecycle.md) | How a film’s Seattle presence evolves over time | Philosophy documented (D-4) |
| [04 — Information architecture](./04-information-architecture.md) | User intents, information layers, progressive disclosure | Philosophy expanded (D-5); navigation deferred |
| [12 — Experience model](./12-experience-model.md) | Session types, goals, continuity over time | Philosophy documented (D-6) |
| [13 — Context & significance](./13-context-and-significance.md) | Context vs recommendation; kinds of significance | Philosophy documented (D-8) |
| [14 — Specification review](./14-specification-review.md) | Holistic editorial audit of the v2 constitution | Complete (D-9) |
| [15 — Editorial design language](./15-editorial-design-language.md) | Editorial visual philosophy (between product & UI) | Philosophy documented (D-15); systems deferred |
| [16 — Entity expression](./16-entity-expression.md) | How entities reveal facets by context | Philosophy documented (D-16); component mappings deferred |
| [05 — Navigation](./05-navigation.md) | Progressive depth, destinations, cross-cutting Interaction Model | Philosophy (D-7) + Interaction Model (D-14); chrome/UI deferred |
| [06 — Component system](./06-component-system.md) | Reusable UI building blocks | Placeholder |
| [07 — Visual language](./07-visual-language.md) | Visual direction and tokens | Placeholder (guided by [15](./15-editorial-design-language.md)) |
| [08 — Screen specifications](./08-screen-specifications.md) | Per-surface conceptual behavior (philosophy) | Conceptual (D-10–D-13); canonical specs in [specs/](./specs/) |
| [09 — Implementation roadmap](./09-implementation-roadmap.md) | Ordered build plan (after design) | Active; **I-06FDM** Film Detail mockup visual replica |
| [17 — First implementation slice](./17-first-implementation-slice.md) | Decision record for first v2 UI slice | Decision (D-27); I-05E Explore landing + I-04C Home |
| [Stage 2 — Data & backend needs audit](./v2-data-and-backend-needs-audit.md) | Mockup→data inventory, gaps, sources (Stage 2 only) | Validation pass complete 2026-07-24; roadmap §14; not Stage 3 |
| [Stage 3 — Product decision packet](./v2-stage-3-product-decisions.md) | PO decisions D01–D17 | **Approved** 2026-07-24 |
| [Stage 3 — Front–back integration roadmap](./v2-front-back-integration-roadmap.md) | Connect fixtures→real data while preserving designs | Authoritative Stage 3; Stage 4 executes tasks |
| [Film identity contract (T-FILMID-01)](./film-identity-contract.md) | Namespaced `film_id`, TMDB matching, review workflow | Foundation complete 2026-07-27; public emit deferred |
| [Canonical screen specs](./specs/) | Implementation-authoritative per-surface specs | Home, Film Detail, Planner, Theater, Explore/Search (D-17–D-20, D-23); Opportunity expression (D-24); Profile/Settings (D-25); Global navigation (D-26); Home reconciled with Design Review v3 (D-22) |

### Canonical screen specifications

| Spec | Status |
|------|--------|
| [Home](./specs/home.md) | Canonical (D-17); reconciled with Design Review v3 (D-22) |
| [Film Detail](./specs/film-detail.md) | Canonical (D-18) |
| [Planner](./specs/planner.md) | Canonical (D-19) |
| [Theater](./specs/theater.md) | Canonical (D-20) |
| [Explore / Search](./specs/explore-search.md) | Canonical (D-23) |
| [Opportunity expression](./specs/opportunity-expression.md) | Canonical (D-24) — cross-surface; **not** a standalone page |
| [Profile / Settings](./specs/profile-settings.md) | Canonical (D-25) |
| [Global navigation](./specs/global-navigation.md) | Canonical (D-26) — Home · Explore · Planner · Profile |

---

## Local v2 application (I-01 / I-02)

Isolated Vite app (cockpit pattern). **Not** part of production `dist/` or GitHub Pages.

| | |
|--|--|
| Directory | `v2/` |
| Dev | `npm run v2` → http://127.0.0.1:5175/ |
| Build | `npm run build:v2` → `dist-v2/` (gitignored) |
| Smoke | `npm run smoke:v2` |
| Primary nav (I-04C) | Home · Explore · Planner · Profile |
| Home composition | Header, editorial intro, Top Opportunity (real selector), Opening This Week (provisional newly_added or unavailable), Leaving Soon (gated unavailable), Planner CTA, Explore More |
| Explore landing (I-05E2) | Intro + search, Quick Start, Browse By, Suggested Starts, Film Activity, Recent Searches |
| Search Results (I-05S) | Designed film-first results with inline expand, type/time filters, Filters sheet; restrained violet |
| Film Detail | Fixture-first mockup visual replica (authoritative mockup content); real-data mapping deferred |
| Fixtures | `v2/fixtures/homeVisualFixtures.js` — visual-test only |
| Accent | Violet (`--v2-accent`) |
| CSS | Isolated `v2/v2.css` only — does not import production styles |
| Local data | Allowlisted `/data/*.json` from `public/data` (not Leaving Soon) |

---

## Related repository docs

* [Development operating model](../development-operating-model.md) — collaboration roles and v2 design workflow
* [Data foundation roadmap](../data-foundation-roadmap.md) — data/source work (parallel track)
* [Product roadmap](../product-roadmap.md) — broader product backlog

---

## Non-goals for this folder

These docs are **not**:

* a React / CSS codebase;
* mockups or wireframes (unless later attached by explicit design decision);
* permission to change production UI or public schemas;
* a substitute for data-foundation evidence gates.
