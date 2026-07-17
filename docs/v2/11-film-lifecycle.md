# 11 — Film Lifecycle

**Status:** Philosophy documented (D-4); stage criteria and systems still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Core concepts](./02-core-concepts.md) · [Discovery model](./03-discovery-model.md) · [Opportunity model](./10-opportunity-model.md) · [Information architecture](./04-information-architecture.md) · [Context & significance](./13-context-and-significance.md)

This document describes how a film’s **presence within Seattle moviegoing** evolves over time, from a product perspective.

It is **not** a data model. Do not read schemas, APIs, state machines, or ranking rules into these sections.

---

## Purpose

A **film** has a **stable identity**. People keep recognizing the same title across weeks, venues, and formats.

What changes is the film’s **relationship to Seattle opportunities**: when it can be seen, how it can be seen, how rare those chances are, and whether they are still ahead or already gone.

The **film lifecycle** names that evolving relationship. It helps Discovery tell a coherent primary story as opportunities appear, shift, and disappear — without treating the film itself as temporary.

This continues [Core concepts](./02-core-concepts.md) (Film vs Opportunity) and [Opportunity model](./10-opportunity-model.md) (stories change as opportunities change).

---

## Lifecycle Philosophy

Agreed principles:

* **Films persist.** Identity outlives any single screening week.
* **Opportunities appear and disappear.** Availability, presentation, events, and exclusivity come and go.
* **Discovery changes as opportunities evolve.** What deserves attention today may differ from last week for the same film.
* **Urgency belongs to opportunities, not films.** A title is not “urgent”; a last screening, one-night event, or leaving window can be.
* **Archives remain valuable.** When active opportunities end, the film can still matter as history, memory, and reference — supporting the emotional goal of knowing what was worth considering ([Product philosophy](./01-product-philosophy.md)).

Lifecycle is descriptive product language, not a requirement that every title march through identical phases.

---

## Lifecycle Stages

Representative stages below are **conceptual**. They illustrate kinds of presence — not a required sequence, not entry/exit rules, and not a complete catalog.

| Stage | Conceptual meaning |
|-------|--------------------|
| **Coming Soon** | Anticipation before meaningful local chances to see it. |
| **Newly Available** | Fresh presence in the city — opening energy, first chances to act. |
| **Established Run** | Ongoing availability; still relevant, less defined by newness alone. |
| **Special Event** | Presence shaped by a distinctive event opportunity (guest, festival framing, rare presentation), which may sit alongside or apart from a regular run. |
| **Leaving Soon** | Active chances are winding down; time sensitivity rises at the opportunity layer. |
| **Finished** | No remaining forward opportunities in the current landscape — the run (or event) has ended. |
| **Archived** | Retained as historical presence: what played, what mattered, what someone might still want to remember or research. |

Not every film visits every stage. Some arrive only as a one-night event. Some return after finishing. Some linger in established runs without a sharp “leaving” beat. Stages help designers talk about *kinds* of moments; they do not force a single path.

---

## Opportunity Evolution

Different opportunity patterns create different lifecycle shapes. Illustrative only:

| Pattern | How presence tends to feel |
|---------|----------------------------|
| **Blockbuster theatrical runs** | Longer arc: coming soon → newly available → established run → leaving → finished → archive. Many opportunities across venues and formats. |
| **Repertory screenings** | Often short or intermittent presence; may skip “established run” and lean on rarity, format, or venue story. |
| **One-night-only events** | Spike of attention around a single chance; urgency is extreme and opportunity-bound; then finished/archived quickly. |
| **Recurring special screenings** | Identity stays continuous while opportunities reappear; lifecycle may feel cyclic rather than one-way. |
| **Festivals** | Clustered, time-bounded presence; event and exclusivity meanings often dominate the primary story for a short window. |

The same film might move through more than one pattern over a year (theatrical run later followed by a repertory night). Lifecycle describes the **current relationship to Seattle opportunities**, not a permanent label stamped on the title forever.

---

## Discovery Implications

Lifecycle shapes **what kind of attention** Discovery should favor — still without ranking formulas.

* **Opening / newly available** deserves awareness so extraordinary starts are not missed.
* **One-night and special events** deserve emphasis while the chance still exists; urgency lives on the opportunity.
* **Final / leaving windows** deserve time-sensitive clarity so “I never knew it was the last chance” becomes rare.
* **Established runs** still belong in the landscape; they may need less “newness” energy and more honest supporting context when something distinctive appears (premium format, guest, indie-only).
* **Archived films** remain discoverable as **historical reference** — overview-first Discovery may de-emphasize them for “what’s actionable now,” without erasing them from the city’s cinema memory.

This aligns with Discovery principles: highlight without hiding; overview first, reference second; reduce moviegoing regret ([Discovery model](./03-discovery-model.md)).

Primary stories ([Opportunity model](./10-opportunity-model.md)) should track lifecycle reality: the headline meaning for a film should reflect the opportunities that define *this moment* in Seattle, with enough supporting context to stay truthful.

---

## Future topics

Placeholders only — no behavior defined yet:

### Notifications

*(TBD — how lifecycle moments might warrant timely notice without manufacturing panic.)*

### Newsletters

*(TBD — how weekly or curated storytelling might reflect opening, event, and leaving rhythms.)*

### Planner interactions

*(TBD — how Plans relate to newly available, one-night, and leaving opportunities.)*

### Archival browsing

*(TBD — how finished and archived presence is explored as reference, separate from live Discovery emphasis.)*

### Historical analytics

*(TBD — what we might learn from past opportunity arcs; product questions only, not metrics implementation.)*

---

## Intentionally out of scope

* Exact stage entry/exit criteria
* Schemas, APIs, state machines
* Ranking or scoring algorithms
* UI, navigation, or production-site behavior

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — mission, promise, emotional goal
* [02 — Core concepts](./02-core-concepts.md) — Film vs Opportunity vs Plan
* [03 — Discovery model](./03-discovery-model.md) — funnel, signals, lenses, principles
* [10 — Opportunity model](./10-opportunity-model.md) — categories, primary story, supporting context
* [04 — Information architecture](./04-information-architecture.md) — intents and progressive disclosure
* [13 — Context & significance](./13-context-and-significance.md) — context vs recommendation; kinds of significance
