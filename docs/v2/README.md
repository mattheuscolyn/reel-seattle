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
| [05 — Navigation](./05-navigation.md) | Movement between surfaces | Placeholder |
| [06 — Component system](./06-component-system.md) | Reusable UI building blocks | Placeholder |
| [07 — Visual language](./07-visual-language.md) | Visual direction and tokens | Placeholder |
| [08 — Screen specifications](./08-screen-specifications.md) | Per-screen product specs | Placeholder |
| [09 — Implementation roadmap](./09-implementation-roadmap.md) | Ordered build plan (after design) | Placeholder |

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
