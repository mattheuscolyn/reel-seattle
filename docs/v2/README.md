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
| [08 — Screen specifications](./08-screen-specifications.md) | Per-surface conceptual behavior (philosophy) | Conceptual (D-10–D-13); Home details → [specs/home.md](./specs/home.md) |
| [09 — Implementation roadmap](./09-implementation-roadmap.md) | Ordered build plan (after design) | Placeholder |
| [Canonical screen specs](./specs/) | Implementation-authoritative per-surface specs | Home canonical (D-17); other surfaces TBD |

### Canonical screen specifications

| Spec | Status |
|------|--------|
| [Home](./specs/home.md) | Canonical (D-17) |
| Film Detail | Not yet authored |
| Planner | Not yet authored |
| Theater | Not yet authored |

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
