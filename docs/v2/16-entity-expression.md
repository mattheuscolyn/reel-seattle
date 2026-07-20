# 16 — Entity Expression

**Status:** Philosophy documented (D-16); component mappings still deferred  
**Related:** [README](./README.md) · [Core concepts](./02-core-concepts.md) · [Navigation & Interaction Model](./05-navigation.md) · [Screen specifications](./08-screen-specifications.md) · [Experience model](./12-experience-model.md) · [Editorial design language](./15-editorial-design-language.md) · [Opportunity model](./10-opportunity-model.md) · [Canonical Opportunity expression](./specs/opportunity-expression.md) · [Component system](./06-component-system.md)

This document describes how Reel Seattle’s **core entities** should be expressed across different contexts throughout the product.

It answers:

> How does the same underlying entity reveal different facets depending on the user’s current task?

It is **not** a component specification, layout specification, or visual design guide. The focus is **conceptual expression of information**.

Do not invent cards, rows, grids, interactions, or styling from these sections.

---

## Purpose

**Entity Expression** is the bridge between the conceptual data model ([Core concepts](./02-core-concepts.md)) and future interface design ([Component system](./06-component-system.md), [Visual language](./07-visual-language.md)).

Entities remain **consistent** throughout the product. The information **emphasized** changes according to user intent ([Experience model](./12-experience-model.md), [Screen specifications](./08-screen-specifications.md)).

The object remains the same.

The user’s question changes.

---

## Core Principle

> Every entity maintains a consistent identity while expressing different facets in different contexts.

Users should always feel they are interacting with the **same** film, theater, opportunity, or plan — even though different experiences emphasize different information.

Identity is stable. Facets are contextual. Expression never invents a second, conflicting version of the entity.

---

## Expression Depth

Entity expression becomes **progressively richer** as the user’s question deepens — aligned with Interaction Model progressive understanding and editorial recognition-before-detail ([Navigation](./05-navigation.md), [Editorial design language](./15-editorial-design-language.md)).

Representative progression (semantic — not UI):

```text
Recognition
     ↓
Orientation
     ↓
Understanding
     ↓
Evaluation
     ↓
Decision
     ↓
Commitment
```

| Depth | What expression answers |
|-------|-------------------------|
| **Recognition** | What is this? |
| **Orientation** | Why might it matter in this context? |
| **Understanding** | What do I need to know to judge fairly? |
| **Evaluation** | How do options or facets compare? |
| **Decision** | What will I choose (or knowingly pass)? |
| **Commitment** | What am I prepared to do? |

Each level should answer the user’s **next question** without exposing unnecessary complexity. Deeper expression elaborates; it does not redefine.

---

## Film Expression

A **Film** is the canonical identity users recognize ([Core concepts](./02-core-concepts.md)). The Film itself never changes. Only the **emphasized information** changes by context.

| Context | Emphasized facets (illustrative) |
|---------|----------------------------------|
| **Home** | Significance, rarity, editorial importance — why notice this title *now* |
| **Search** | Recognition and identity — find the right film quickly |
| **Theater** | Availability, presentations, showtimes — what this venue offers for the title |
| **Planner** | Schedule fit, logistical compatibility — can this film’s opportunities work in a plan |
| **Film Detail** | Complete understanding — context, synopsis, creators, significance |

Home surfaces awareness; Film Detail builds confidence; Planner asks fit; Theater expresses venue character and program; Explore/Search supports user-directed investigation. Opportunities are expressed contextually across those surfaces ([canonical Opportunity expression](./specs/opportunity-expression.md)) — **not** as a standalone Opportunity Detail page. All still refer to one Film. Canonical surfaces: [Home](./specs/home.md), [Film Detail](./specs/film-detail.md), [Planner](./specs/planner.md), [Theater](./specs/theater.md), [Explore / Search](./specs/explore-search.md), [Opportunity expression](./specs/opportunity-expression.md).

---

## Theater Expression

A **Theater** is a first-class venue identity ([Screen specifications — Theater](./08-screen-specifications.md#theater)). The Theater remains one entity across the product.

| Context | Emphasized facets (illustrative) |
|---------|----------------------------------|
| **Home** | Destination, programming identity — place as a reason to notice |
| **Film Detail** | Viewing opportunity — where/how this film can be seen |
| **Planner** | Logistical constraint, travel — can this venue fit the plan |
| **Theater Experience** | Identity, programming philosophy, amenities, history, practical information |

Programming character on the Theater surface and logistics in Planner are complementary expressions of the same venue — not separate “types” of theater.

---

## Opportunity Expression

An **Opportunity** is the primary unit of decision-making ([Core concepts](./02-core-concepts.md), [Opportunity model](./10-opportunity-model.md)).

**Canonical cross-surface behavior:** [specs/opportunity-expression.md](./specs/opportunity-expression.md) (D-24). Opportunity is expressed at compact / summary / featured / focused contextual depth **within** Home, Film Detail, Theater, Explore, and Planner. There is **no** standalone Opportunity Detail page — navigation stops at the Opportunity grain.

Conceptually, Opportunity is the intersection of:

```text
Film
  + Presentation
  + Venue
  + Time
```

| Context | Emphasized facets (illustrative) |
|---------|----------------------------------|
| **Home** | Significance — why this chance deserves attention now |
| **Film** (Film Detail) | Viewing choices — how ways to see the film differ |
| **Planner** | Feasibility — timing, travel, conflicts, fit |
| **Comparison** | Tradeoffs — meaningful differences between opportunities or plans |
| **Theater / Explore** | Venue- or query-scoped relevance — see [Opportunity expression](./specs/opportunity-expression.md) |

Urgency and rarity live on opportunities, not on film identity as such ([Film lifecycle](./11-film-lifecycle.md)). Expression should keep that truth stable while changing which facet leads.

---

## Plan Expression

A **Plan** is commitment ([Core concepts](./02-core-concepts.md)) — an **evolving** entity rather than a static itinerary dump.

Representative stages (conceptual — not a state machine schema):

```text
Idea
  ↓
Candidate
  ↓
Refined Plan
  ↓
Committed Plan
  ↓
Completed Experience
```

| Stage | Character |
|-------|-----------|
| **Idea** | Interest forming; not yet structured |
| **Candidate** | Opportunities under consideration for fit |
| **Refined Plan** | Constraints and preferences shaping a practical schedule |
| **Committed Plan** | Intent to act; preparedness |
| **Completed Experience** | After the fact — memory and continuity |

**Refinement preserves identity** rather than replacing the plan ([canonical Planner](./specs/planner.md); Interaction Model stability). Users should feel they are improving *the same plan*, not starting a new product each adjustment.

---

## Expression Consistency

Principles that should hold across all entities and surfaces:

* **Entity identity remains stable** — same Film, Theater, Opportunity, or Plan
* **Terminology remains consistent** — words mean the same thing everywhere
* **Users retain orientation** — they know what they are looking at
* **Increasing detail never contradicts earlier summaries** — deeper views stay honest
* **Deeper views elaborate rather than redefine** — progressive disclosure, not revisionism

Consistency of expression supports highlight-without-hiding and explainable guidance ([Navigation](./05-navigation.md), [Editorial design language](./15-editorial-design-language.md)).

---

## Context Changes Emphasis

**Context changes priority — not truth.**

The same film can simultaneously be:

* Important on Home
* Logistical in Planner
* Educational on Film Detail
* Searchable in Search

These are **complementary expressions** of one entity. A Home story that a film is “leaving soon” must not become a contradictory story elsewhere; Film Detail and Planner may emphasize different facets of the same leaving window.

Context reframes what leads. It does not invent alternate realities.

---

## Information Continuity

Desired user perception:

> “I am learning more about the same thing.”

rather than:

> “I am entering a completely different system.”

Moving from Home → Film Detail → Planner (or Theater Exploration → Film → Plan) should feel like deepening one relationship with Seattle cinema entities — continuous companion behavior ([Experience model](./12-experience-model.md)), not disconnected mini-apps.

---

## Non-goals

This document does **not** define:

* Cards, rows, grids, or layouts
* Interactions, gestures, or animations
* Components or styling
* Schemas, APIs, or field inventories

Those belong to later documentation ([Component system](./06-component-system.md), [Visual language](./07-visual-language.md), implementation track).

---

## Future Placeholders

*(Philosophy only — no implementation.)*

Reserve future work for:

* Component mappings (how expression depths map to reusable units)
* Responsive expression
* Accessibility adaptations
* Density variations
* Personalization (emphasis changes without identity changes)
* Multi-window experiences
* Future platforms

---

## Intentionally out of scope

* Visual components, layouts, card designs
* Animations, gestures, interaction mechanics
* Implementation details or production UI changes

---

## Relationship to other v2 docs

* [02 — Core concepts](./02-core-concepts.md) — Film, Opportunity, Plan, Lens definitions
* [05 — Navigation](./05-navigation.md) — progressive understanding; expand before navigate
* [08 — Screen specifications](./08-screen-specifications.md) — per-surface questions each expression serves
* [10 — Opportunity model](./10-opportunity-model.md) — stories and supporting context
* [11 — Film lifecycle](./11-film-lifecycle.md) — evolving presence; urgency on opportunities
* [12 — Experience model](./12-experience-model.md) — session intent that selects facets
* [15 — Editorial design language](./15-editorial-design-language.md) — how presentation supports recognition and hierarchy
* [06 — Component system](./06-component-system.md) — future expression → component mapping (placeholder)
