# 05 — Navigation & Interaction Model

**Status:** Philosophy expanded (D-7); cross-cutting Interaction Model authored (D-14); chrome, routes, and UI still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Discovery model](./03-discovery-model.md) · [Information architecture](./04-information-architecture.md) · [Experience model](./12-experience-model.md) · [Opportunity model](./10-opportunity-model.md) · [Screen specifications](./08-screen-specifications.md) (Home / Discovery, Film Detail, Theater, Planner) · [Editorial design language](./15-editorial-design-language.md) · [Entity expression](./16-entity-expression.md)

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

These principles continue in the cross-cutting [Interaction Model](#interaction-model) below.

---

# Interaction Model

---

## Purpose

**Interaction** is how users progressively increase understanding — not merely how they move between destinations.

The objective is not navigation for its own sake. The objective is helping users answer **increasingly specific questions** while remaining oriented: which film, which opportunity, which constraint, which next step.

Navigation (destinations, inline vs dedicated depth) describes *where* meaning can live. The Interaction Model describes *how* understanding and decisions deepen across Home, Film Detail, Theater, Planner, and future surfaces ([Screen specifications](./08-screen-specifications.md)).

This is **not** a component specification, gesture specification, or page-flow map.

---

## Progressive Understanding

Core philosophy: each interaction should answer the user’s **next question**, rather than presenting all available information immediately.

Representative progression (semantic — not a required screen sequence):

```text
Discovery
    ↓
Recognition
    ↓
Understanding
    ↓
Decision
    ↓
Commitment
```

| Stage | What the user is doing |
|-------|------------------------|
| **Discovery** | Noticing what deserves attention in Seattle cinema |
| **Recognition** | Identifying a film, venue, or opportunity as relevant |
| **Understanding** | Grasping why it matters and what the options are |
| **Decision** | Choosing among opportunities, venues, or plans — or knowingly passing |
| **Commitment** | Forming a Plan and becoming prepared to act ([Core concepts](./02-core-concepts.md)) |

This aligns with IA layers (overview → comparison → reference) and session intents ([Information architecture](./04-information-architecture.md), [Experience model](./12-experience-model.md)) without prescribing pages. Progressive Understanding is about cognitive steps; Progressive Depth (above) is about information layers.

---

## Expand Before Navigate

Whenever practical:

* **Lightweight exploration should occur before full navigation** — satisfy a small curiosity in place.
* **Users should satisfy simple curiosity without context switching** — expand, clarify, compare lightly without losing orientation.
* **Dedicated experiences remain available** for deeper investigation — Film Detail, Theater, Planner, and reference depth when the question outgrows overview ([Inline vs Navigation](#inline-vs-navigation)).

Exact interaction patterns (taps, panels, modals) are **not** defined here. The principle is expand-before-navigate, not a widget inventory.

---

## Information Depth

The amount of information presented should match the user’s **likely intent**.

Representative principles:

* Never overwhelm immediately
* Never require unnecessary navigation
* Reveal additional context naturally
* Support both quick scanning and deep research

Overview-first Discovery and progressive disclosure from [Information architecture](./04-information-architecture.md) apply product-wide. Dense information is allowed; dumping every layer at once is not.

---

## Explainable Guidance

Whenever the product **recommends or emphasizes** something, users should understand **why**.

Guidance means explainable emphasis and logistics help — not opaque taste prediction ([Context & significance](./13-context-and-significance.md); Home and Film Detail explainability in [Screen specifications](./08-screen-specifications.md)).

Representative reasons (illustrative, not a scoring system):

* Better presentation
* Greater rarity
* Fewer schedule conflicts
* Less idle time
* Higher urgency

Avoid black-box recommendations. Preference-aware emphasis may change what rises first; it must remain intelligible ([Discovery model](./03-discovery-model.md)).

---

## Guidance Over Interruption

Interaction should **guide** more often than it **interrupts**.

Representative principles:

* Surface better alternatives instead of blocking users
* Prevent impossible plans where practical (especially in Planner logistics)
* Avoid unnecessary warnings
* Preserve user flow
* Interrupt only for genuinely exceptional situations

The Planner optimizes and adapts without becoming a scold ([Screen specifications — Planner](./08-screen-specifications.md#planner)). Warnings that manufacture panic or regret theater conflict with the emotional goal ([Product philosophy](./01-product-philosophy.md)).

---

## Stability

User intent should be **preserved whenever possible**.

Representative concepts:

* Minimize unnecessary changes
* Preserve existing plans
* Refine rather than replace
* Keep changes understandable

Whenever the system adjusts something — re-emphasis, plan adaptation, schedule shifts — users should be able to understand **what changed and why**. Stability supports continuity across visits ([Experience model](./12-experience-model.md)) and Planner adaptive planning without silent substitution of taste.

---

## Comparative Decision Support

Comparisons should help users understand **meaningful differences**, rather than declaring winners without explanation.

Representative comparisons include:

* Theaters
* Presentations
* Schedules
* Opportunities
* Plans

Recommendations (when the product suggests one option over another) should always be accompanied by **clear reasoning**. Film Detail compares opportunities; Theater supports venue judgment; Planner compares feasible schedules — each without a unexplained “best” badge ([Opportunity model](./10-opportunity-model.md), [Screen specifications](./08-screen-specifications.md)).

---

## Interaction Consistency

Principles that should remain true **across every experience**:

* Similar interactions behave similarly
* Information appears in predictable places
* Progressive disclosure is consistent
* Users retain orientation while moving deeper

Consistency is conceptual predictability — not a shared component library. Component behavior and visual styling belong later ([Component system](./06-component-system.md), [Visual language](./07-visual-language.md)).

---

## Non-goals (Interaction Model)

This Interaction Model does **not** define:

* Gestures
* Animations
* Visual styling
* Component behavior
* Platform-specific interactions

Those belong to later design and implementation phases.

---

## Future topics

Placeholders only — no behavior defined yet:

### Global search

*(TBD — how search enters Discovery vs reference without becoming a parallel product.)*

### Planner interactions

*(TBD — how Planning destinations and inline commit actions relate; see also [Planner](./08-screen-specifications.md#planner) and Stability / Guidance above.)*

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
* Gestures, animations, platform-specific interaction kits
* Production-site routes or URL schemes
* Algorithms for path recommendation or ranking

Do not treat this document as permission to change the live public site’s navigation.

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — principles (inline exploration, discovery before reference)
* [03 — Discovery model](./03-discovery-model.md) — funnel and discovery principles
* [04 — Information architecture](./04-information-architecture.md) — intents and overview / comparison / reference
* [10 — Opportunity model](./10-opportunity-model.md) — primary story and supporting context
* [12 — Experience model](./12-experience-model.md) — session types and continuity
* [13 — Context & significance](./13-context-and-significance.md) — context vs recommendation; explainability
* [08 — Screen specifications](./08-screen-specifications.md) — per-surface behavior that this Interaction Model cuts across
* [06 — Component system](./06-component-system.md) — reusable building blocks (placeholder)
* [07 — Visual language](./07-visual-language.md) — visual direction (placeholder)
