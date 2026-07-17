# 05 — Navigation & Interaction Model

**Status:** Philosophy expanded (D-7); chrome, routes, and UI still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Discovery model](./03-discovery-model.md) · [Information architecture](./04-information-architecture.md) · [Experience model](./12-experience-model.md) · [Screen specifications](./08-screen-specifications.md)

This document defines how users **move through** Reel Seattle v2 — the philosophy of interaction and progressive depth.

It is **not** a sitemap, tab bar spec, wireframe set, or component inventory. Do not invent bottom navigation, page layouts, or production routes from these sections.

---

## Purpose

Navigation exists to **progressively answer user questions**, not to expose a catalog of pages.

People open Reel Seattle with intents ([Experience model](./12-experience-model.md), [Information architecture](./04-information-architecture.md)). Movement through the product should deepen or shift that answer — overview → decision → commitment → knowledge — while preserving context whenever practical.

Navigation is successful when the user feels closer to “I know what matters and what I’ll do,” not when they have visited more destinations.

This continues inline-exploration preference and Discovery-before-reference from [Product philosophy](./01-product-philosophy.md) and [Discovery model](./03-discovery-model.md).

---

## Progressive Depth

Users move through **increasing levels of detail** as their question requires it — not because the product demands a tour.

Conceptual progressions (semantic, not screen stacks):

```text
Overview
   ↓
Comparison
   ↓
Reference
```

```text
Film
   ↓
Opportunity
   ↓
Planning
```

| Progression | Meaning |
|-------------|---------|
| Overview → Comparison → Reference | Aligns with IA information layers: orient, weigh, deepen. |
| Film → Opportunity → Planning | Aligns with the product model: identity → decision unit → commitment. |

These progressions may overlap in one session. They do **not** require a fixed number of page transitions. Depth can unfold inline when that answers the question faster.

---

## Inline vs Navigation

### Philosophy

**Information should remain inline whenever practical.** Expanding, comparing, and clarifying in place reduces interruption and supports dense, interactive Discovery.

**Dedicated destinations** should exist only when they provide **meaningful additional depth** that inline expansion cannot fairly hold — for example sustained planning work, rich reference, or a distinct mode of exploration that would overwhelm overview.

| Prefer inline when… | Prefer a dedicated destination when… |
|---------------------|--------------------------------------|
| The answer is a small step deeper on the same film or opportunity | The user needs a sustained workspace or a different kind of breadth |
| Context would be lost by leaving | Depth itself *is* the destination (e.g. archival knowledge) |
| The question is still Discovery- or Decision-shaped | The question has clearly become Planning- or Research-shaped at scale |

“Dedicated destination” is conceptual. It does not prescribe routes, modals, or tabs.

---

## Primary Destinations

The product is expected to have a small set of **persistent destination kinds** — lasting homes for major intents — without locking a final navigation structure.

Conceptual destination kinds (illustrative, not a menu design):

* **Discovery / overview** — citywide orientation; film-grouped opportunities and stories.
* **Planning** — commitments and fit into real time.
* **Knowledge / reference** — deeper understanding and historical presence when sought.
* **Personal context** *(optional conceptual home)* — preferences, dismissals, membership/venue affinity as they affect emphasis — without hiding the city.

Exact labels, count, and arrangement are deferred. Destinations serve intents; they are not an inventory of every possible screen.

---

## Contextual Navigation

Interactions should **reveal context** rather than interrupt exploration.

* Opening comparison or supporting detail should feel like staying with the same film and question.
* Moving to planning should carry the opportunity the user was evaluating.
* Returning to overview should not feel like starting over if continuity can be preserved ([Experience model](./12-experience-model.md)).

Context loss is a navigation failure even when the destination is “correct.” Preserve orientation: which film, which opportunity story, which session goal.

---

## Interaction Principles

Agreed principles for movement and interaction:

1. **Every interaction answers a question** — or clearly advances toward one. Avoid decorative navigation.
2. **Avoid unnecessary page transitions** — prefer inline depth when it serves the goal.
3. **Progressively reveal complexity** — overview first; comparison and reference on demand ([Information architecture](./04-information-architecture.md)).
4. **Preserve user context whenever possible** — film, opportunity, lens, and session intent should travel with the user.
5. **Highlight without hiding** — navigation and expansion change emphasis; they do not erase Seattle cinema.
6. **Inline exploration over scavenger hunts** — users should rarely leave Reel Seattle to finish a cinema question.

---

## Future topics

Placeholders only — no behavior defined yet:

### Global search

*(TBD — how search enters Discovery vs reference without becoming a parallel product.)*

### Planner interactions

*(TBD — how Planning destinations and inline commit actions relate.)*

### Cross-linking

*(TBD — how related films, venues, and opportunities connect without forced hops.)*

### Deep links

*(TBD — shareable entry into a film, opportunity, or plan while restoring enough context.)*

### Onboarding

*(TBD — how first-run movement teaches progressive depth without a feature tour; see [Experience model](./12-experience-model.md).)*

---

## Intentionally out of scope

* Bottom tabs, top bars, or concrete chrome
* Page layouts, wireframes, components
* Production-site routes or URL schemes
* Algorithms for path recommendation

Do not treat this document as permission to change the live public site’s navigation.

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — principles (inline exploration, discovery before reference)
* [03 — Discovery model](./03-discovery-model.md) — funnel and discovery principles
* [04 — Information architecture](./04-information-architecture.md) — intents and overview / comparison / reference
* [12 — Experience model](./12-experience-model.md) — session types and continuity
* [08 — Screen specifications](./08-screen-specifications.md) — per-surface specs once destinations are designed (placeholder)
* [06 — Component system](./06-component-system.md) — reusable building blocks (placeholder)
