# 04 — Information Architecture

**Status:** Philosophy expanded (D-5); navigation and surfaces still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Core concepts](./02-core-concepts.md) · [Discovery model](./03-discovery-model.md) · [Opportunity model](./10-opportunity-model.md) · [Canonical Opportunity expression](./specs/opportunity-expression.md) · [Canonical Profile / Settings](./specs/profile-settings.md) · [Film lifecycle](./11-film-lifecycle.md) · [Experience model](./12-experience-model.md) · [Navigation](./05-navigation.md) · [Context & significance](./13-context-and-significance.md)

This document defines the **conceptual organization** of Reel Seattle v2 around **user intent**.

It is **not** a sitemap, screen inventory, or navigation design. Do not invent pages, routes, or components from these sections.

---

## Purpose

Information architecture answers: *How should meaning be arranged so people can get from “what’s happening in Seattle cinema?” to a confident decision—without drowning in detail?*

IA organizes the product around **user questions and intents**, not around a menu of destinations. Navigation may later express this architecture; it must not redefine it.

This continues Discovery-before-reference, group-by-film, and “rarely leave Reel Seattle to answer cinema questions” from [Product philosophy](./01-product-philosophy.md) and [Discovery model](./03-discovery-model.md).

---

## Primary User Questions

People arrive with different intents. Representative questions below are grouped **conceptually**. The list is illustrative, not exhaustive.

### Discovery

*Orient to what matters now.*

* What’s worth noticing in Seattle cinema right now?
* What extraordinary or time-sensitive chances am I about to miss?
* What’s newly available, leaving soon, or only here tonight?

### Decision

*Choose among ways to experience a film.*

* Why should I care about this film *right now*?
* Is this a special way to see it (format, event, venue exclusivity)?
* How does this opportunity compare to others for the same film?

### Planning

*Turn interest into commitment.*

* Can I make this fit my week?
* Which opportunity am I committing to?
* What have I already planned?

### Knowledge

*Understand without losing the thread.*

* What is this film? Who made it? What’s the context?
* What’s the honest picture beyond the headline story?
* What already played, and what was worth knowing historically?

### Exploration

*Follow curiosity across the city.*

* What’s playing at places I care about?
* What’s happening in formats or communities I follow?
* What else is related once I’ve found something interesting?

These categories can overlap in a single session. IA should support moving between them without forcing a scavenger hunt.

---

## Information Layers

Reel Seattle progressively reveals meaning through three conceptual layers:

| Layer | Role |
|-------|------|
| **Overview** | Orient quickly. Answer “what deserves attention?” with film-grouped Discovery meaning — primary stories, signals, lifecycle-aware emphasis. |
| **Comparison** | Weigh options. Clarify opportunities under a film — formats, venues, timing, rarity — so a decision can form. |
| **Reference** | Deepen understanding. Provide durable knowledge, history, and detail when the user wants more than the decision requires. |

Users should **not** encounter all three layers at once by default. Overview first; comparison when deciding; reference when learning or looking back ([Discovery model](./03-discovery-model.md): overview first, reference second).

Layers describe **depth of information**, not a hierarchy of screens.

---

## Progressive Disclosure

### Philosophy

* **Discovery minimizes cognitive load.** Lead with one primary story per film and enough supporting context to stay honest ([Opportunity model](./10-opportunity-model.md)).
* **Details remain available.** Comparison and reference stay reachable when the user wants them — ideally without leaving Reel Seattle.
* **Users should rarely need to leave** to answer cinema-related questions. External hops should be exceptions, not the default path to understanding.

Progressive disclosure is about **when** information appears, not about hiding the city. Highlight without hiding still applies: emphasis is layered; the landscape is not erased.

### Relation to lifecycle

As a film’s Seattle presence evolves ([Film lifecycle](./11-film-lifecycle.md)), which layer matters most may change — e.g. overview urgency for one-night events, reference value for archived titles — without inventing ranking rules here.

---

## Relationships

Conceptual flow of meaning (not a screen stack):

```text
Film
  ↓
Opportunity
  ↓
Plan
  ↓
Knowledge
```

| Concept | Architectural role |
|---------|-------------------|
| **Film** | Stable identity and grouping unit for overview. |
| **Opportunity** | Decision unit; what comparison is about. |
| **Plan** | Commitment after decision; planning intent. |
| **Knowledge** | Reference depth — context, history, understanding that outlives a single chance. |

Discovery **summarizes opportunities through films**. Plans attach to chosen opportunities. Knowledge surrounds films and opportunities without replacing them as the decision layer.

This relationship is **semantic**. It does not prescribe which surface owns which concept, how many stops a user takes, or how navigation is labeled. Navigation chrome remains deferred ([Navigation](./05-navigation.md)); Home / Discovery, Film Detail, Theater, and Planner conceptual behavior begin in [Screen specifications](./08-screen-specifications.md).

---

## Future topics

Placeholders only — no behavior defined yet:

### Navigation

See [Navigation & interaction model](./05-navigation.md) — progressive depth, inline vs dedicated destinations, and cross-cutting Interaction Model (chrome and layouts still deferred).

### Search

→ **[Canonical Explore / Search](./specs/explore-search.md)** (D-23) — Search is a mode within Explore; opportunity-aware results and comprehensive filtering live there. Discovery vs reference: Home remains editorial overview; Explore is user-directed reference browsing.

### Onboarding

*(TBD — how new users learn lenses, stories, and progressive depth; see also [Experience model](./12-experience-model.md).)*

### Personalization

*(TBD — how emphasis changes across layers without hiding the citywide landscape.)*

### Notifications

*(TBD — how timely notice maps to Discovery and Planning intents; see also [Experience model](./12-experience-model.md).)*

---

## Intentionally out of scope

* Screen layouts, wireframes, component inventories
* Navigation chrome, routes, or IA-as-sitemap
* Ranking algorithms or data schemas
* Production-site structure

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — mission, promise, principles
* [02 — Core concepts](./02-core-concepts.md) — Film, Opportunity, Plan, Lens
* [03 — Discovery model](./03-discovery-model.md) — funnel, signals, lenses, principles
* [10 — Opportunity model](./10-opportunity-model.md) — primary story, supporting context
* [11 — Film lifecycle](./11-film-lifecycle.md) — evolving Seattle presence
* [12 — Experience model](./12-experience-model.md) — session types and continuity over time
* [05 — Navigation](./05-navigation.md) — progressive depth and interaction principles
* [13 — Context & significance](./13-context-and-significance.md) — context vs recommendation; kinds of significance
