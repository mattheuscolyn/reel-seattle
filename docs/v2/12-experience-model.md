# 12 — Experience Model

**Status:** Philosophy documented (D-6); channel and continuity mechanics still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Core concepts](./02-core-concepts.md) · [Discovery model](./03-discovery-model.md) · [Information architecture](./04-information-architecture.md) · [Opportunity model](./10-opportunity-model.md) · [Film lifecycle](./11-film-lifecycle.md) · [Navigation](./05-navigation.md) · [Context & significance](./13-context-and-significance.md) · [Editorial design language](./15-editorial-design-language.md) · [Entity expression](./16-entity-expression.md) · [Canonical Profile / Settings](./specs/profile-settings.md)

This document describes **how people use Reel Seattle over time** — why they open it, what a session is for, and how the product should respond.

It is **not** navigation design, information architecture, or screen specification. Those concerns remain in their own docs; this one is about **session intent and ongoing relationship**.

---

## Purpose

The experience model answers: *What kinds of visits do people make, and how should Reel Seattle behave so each visit advances confident moviegoing without reinventing the product?*

| Related doc | What it owns instead |
|-------------|----------------------|
| [Information architecture](./04-information-architecture.md) | How meaning is layered (overview → comparison → reference) |
| [Navigation](./05-navigation.md) | How people move through progressive depth (inline vs dedicated) and cross-cutting Interaction Model |
| [Screen specifications](./08-screen-specifications.md) | Per-surface product behavior (Home / Discovery, Film Detail, Theater, Planner; other surfaces deferred) |
| **Experience model (this doc)** | Why the session started and how emphasis should adapt across visits |

Reel Seattle should feel like a continuous companion to Seattle cinema, not a one-off schedule lookup ([Product philosophy](./01-product-philosophy.md) — reduce moviegoing regret over time).

---

## Session Types

Representative session types below are **conceptual**. They are not a complete taxonomy, not mutually exclusive, and not labels the product must display.

| Session type | Character of the visit |
|--------------|------------------------|
| **Time Awareness** | “What changed?” — catch up on the landscape since last look; notice newness, endings, and one-offs. |
| **Active Discovery** | “What’s worth my attention?” — seek extraordinary or timely opportunities under a lens. |
| **Planning** | “Can I make this happen?” — fit an opportunity into a real evening or week; move toward commitment. |
| **Research** | “Help me understand.” — deepen knowledge about a film, presentation, or context beyond the headline story. |
| **Theater Exploration** | “What’s happening where I care about?” — explore by venue affinity or place in the city. |

A single visit may shift types (discover → decide → plan). The product model stays the same; the **emphasis** of the session changes.

---

## Session Goals

Each session begins with a **user question or objective**. Goals are the human side of session types.

Illustrative goals (not exhaustive):

* “What changed since I last looked?”
* “What’s worth seeing tonight?”
* “Where should I see this?”
* “Can I fit this into my evening?”
* “What’s special about this presentation?”

Goals map naturally onto IA question groups ([Information architecture](./04-information-architecture.md) — Discovery, Decision, Planning, Knowledge, Exploration) without requiring a one-to-one pairing for every visit.

---

## Product Behavior

### Consistent model, adaptive emphasis

Across all session types, Reel Seattle keeps one underlying model:

```text
Film → Opportunity → Plan
```

(with **Knowledge** as reference depth when understanding is the goal)

Different sessions **surface different aspects** of that same model:

| Session emphasis | What comes forward |
|------------------|--------------------|
| Time Awareness | Lifecycle-aware change: newly available, leaving, one-night spikes ([Film lifecycle](./11-film-lifecycle.md)) |
| Active Discovery | Primary stories, signals, lenses ([Discovery model](./03-discovery-model.md), [Opportunity model](./10-opportunity-model.md)) |
| Planning | Opportunities as commitments-in-waiting; fit and Plan ([Core concepts](./02-core-concepts.md)) |
| Research | Supporting context and reference depth; honest picture beyond the headline |
| Theater Exploration | Place and venue as the path into films and opportunities — still grouped by film identity |

### Behavioral principles

* **Respond to the goal** without pretending the rest of Seattle disappeared (highlight without hiding).
* **Prefer progressive disclosure** — overview first; comparison and reference when the goal needs them.
* **Do not invent a different product per session** — same concepts, different emphasis.
* **Keep urgency on opportunities**, not on film identity as such.

Exact detection of session type, defaults, and UI adaptation are out of scope here.

---

## Continuity

Reel Seattle should support an **ongoing relationship with moviegoing**, not only isolated visits.

Continuity means the product remembers and reconnects meaning across time so users feel oriented rather than starting from zero each open.

Illustrative continuity ideas (philosophy only — no mechanics):

* **Remembering dismissed films** — de-emphasize what the user has set aside without erasing citywide cinema ([canonical Profile / Settings](./specs/profile-settings.md); [canonical Explore / Search](./specs/explore-search.md)).
* **Surfacing newly relevant opportunities** — when a film’s Seattle presence changes, bring back attention if it matters again.
* **Maintaining plans** — commitments persist so Planning sessions resume rather than rebuild ([canonical Planner](./specs/planner.md); Profile as plan-history entry).
* **Preserving historical context** — finished and archived presence remains available as knowledge, supporting “I knew what was worth considering.”

Continuity serves the emotional goal: fewer missed extraordinary chances, more confident passes ([Product philosophy](./01-product-philosophy.md)).

---

## Future topics

Placeholders only — no behavior defined yet:

### Onboarding

*(TBD — how first sessions teach lenses, stories, and progressive depth without a tour of every feature.)*

### Notifications

*(TBD — how timely notice supports Time Awareness and Planning without manufacturing panic. Product-control surface for notification preferences: [canonical Profile / Settings](./specs/profile-settings.md); infrastructure remains future-facing.)*

### Newsletters

*(TBD — how curated storytelling fits between sessions.)*

### Reminders

*(TBD — how Plans and leaving/one-night opportunities might prompt return visits.)*

### Calendar integration

*(TBD — how external calendars might relate to Plans; product relationship only.)*

---

## Intentionally out of scope

* Screens, wireframes, components
* Navigation structure
* Algorithms for session detection or ranking
* Data schemas or production behavior

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — mission, promise, emotional goal
* [02 — Core concepts](./02-core-concepts.md) — Film, Opportunity, Plan, Lens
* [03 — Discovery model](./03-discovery-model.md) — funnel, signals, lenses
* [04 — Information architecture](./04-information-architecture.md) — intents and information layers
* [10 — Opportunity model](./10-opportunity-model.md) — primary story, supporting context
* [11 — Film lifecycle](./11-film-lifecycle.md) — evolving Seattle presence
* [13 — Context & significance](./13-context-and-significance.md) — context vs recommendation; kinds of significance
