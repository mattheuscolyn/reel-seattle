# 03 — Discovery Model

**Status:** Philosophy expanded (D-2); catalog and algorithms still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Core concepts](./02-core-concepts.md) · [Opportunity model](./10-opportunity-model.md) · [Film lifecycle](./11-film-lifecycle.md) · [Information architecture](./04-information-architecture.md) · [Experience model](./12-experience-model.md)

This document is the **canonical product specification** for how Reel Seattle surfaces moviegoing opportunities in v2.

It records **agreed philosophy**, not implementation. Do not treat anything here as ranking formulas, database schemas, component specs, or screen layouts.

---

## Purpose

### What is Discovery trying to accomplish?

Discovery helps people notice **worthwhile ways to see films in Seattle** while those chances still exist.

It exists so that:

* extraordinary or time-sensitive cinema is hard to miss;
* users can decide with confidence, even when they choose not to attend;
* moviegoing regret is reduced — “I never knew” becomes rare.

Discovery is **not** a complete reference catalog first. Reference depth may exist elsewhere; Discovery’s job is to make the right opportunities visible **in time to act**.

This aligns with the product promise and emotional goal in [Product philosophy](./01-product-philosophy.md).

---

## Discovery Funnel

Discovery moves attention from the full city schedule toward commitment:

```text
Entire Seattle schedule
        ↓
Discovery Lens
        ↓
Relevant opportunities
        ↓
Compare
        ↓
Commit
        ↓
Plan
```

| Stage | Meaning (philosophy only) |
|-------|---------------------------|
| **Entire Seattle schedule** | The raw landscape of what’s playing — too large to absorb as equal items. |
| **Discovery Lens** | A perspective that emphasizes what matters for a given way of looking at the city. |
| **Relevant opportunities** | Specific ways to experience films that the lens has made salient. |
| **Compare** | The user weighs options — formats, venues, timing, rarity — without leaving the discovery mindset. |
| **Commit** | The user decides an opportunity is worth acting on. |
| **Plan** | Commitment is recorded ([Core concepts — Plan](./02-core-concepts.md)). |

Later stages must not erase awareness of the wider landscape. Emphasis changes; the city does not disappear.

---

## Film vs Opportunity

Reel Seattle keeps a clear split between **identity** and **decision**:

* **Films** remain the **canonical identity** users recognize and talk about.
* **Opportunities** are the **unit of decision-making** — a specific way to experience a film.
* **Discovery summarizes opportunities through films.** Users scan films; what they evaluate are the opportunities those films carry.

```text
Film (identity presented to users)
  ← summarizes —
Opportunity (what they decide on)
  → may become →
Plan (commitment)
```

Grouping by film prevents a flat list of showtimes from becoming the primary mental model. The card or row the user sees is about a **film**, but the reason to care is rooted in its **opportunities** and **signals**.

See also [Core concepts](./02-core-concepts.md).

---

## Opportunity Signals

### What is a signal?

A **signal** is a concise reason an opportunity (or the set of opportunities under a film) deserves attention **right now**.

Signals answer: *Why should I care about this, given everything else playing in Seattle?*

They are product meaning, not database flags. How signals are detected, ranked, or displayed is out of scope here.

### Illustrative examples

These examples clarify the *kind* of meaning signals carry. This list is **not** exhaustive and is **not** a final taxonomy:

* new release
* leaving soon
* one-night-only
* premium format
* repertory screening
* Q&A
* festival
* only at indie theaters

Future design may add, rename, or refine signals. Discovery should remain coherent as the set grows.

### Urgency (as meaning, not mechanics)

Some signals express **time sensitivity** — chances that will soon be gone. Urgency should support the emotional goal (act in time) without manufacturing panic or regret theater. Exact presentation is deferred.

---

## Discovery Lenses

### Philosophy

A **Discovery Lens** is a **perspective for understanding Seattle cinema**, not a traditional filter checklist.

Filters typically narrow a list by matching attributes. Lenses **reframe** what stands out across the same citywide landscape: what is emphasized, what is secondary, and what “relevant” means for this way of looking.

Lenses help users ask different questions of the same schedule — for example, urgency, venue affinity, or membership context — without pretending those are the only films that exist.

### What is not defined yet

* The full lens catalog
* Default lens vs. user-chosen lenses
* How lenses interact with one another
* Any UI for switching lenses

Those decisions belong in later Product Owner + ChatGPT sessions. This document only locks the **role** of lenses in the funnel.

---

## Personalization

### Philosophy

Personalization **changes emphasis**. It does **not** hide the citywide cinema landscape.

A personalized Discovery still represents Seattle. Preferences re-weight what rises first or what is highlighted — they do not create a private bubble that erases everything else.

### Illustrative preference dimensions

Named for future design only; behavior undefined:

* AMC membership
* Favorite theaters
* Preferred formats
* Dismissed films

**Dismissed films** are a personalization concern: users should be able to de-emphasize titles they do not want to keep seeing, without treating dismissal as deleting those films from the city’s schedule for everyone (or forever) unless later design explicitly says so.

### Recommendation transparency (placeholder)

Users should eventually understand **why** something was emphasized. Exact transparency patterns are TBD; the principle is that Discovery should feel explainable, not arbitrary.

---

## Discovery Principles

Agreed product principles for Discovery:

1. **One card per film** — Discovery presents films as the grouping unit; opportunities and signals live under that identity.
2. **Every card answers “Why should I care right now?”** — If nothing about the film’s opportunities is notable in context, Discovery has failed that card’s job.
3. **Highlight without hiding** — Emphasis and lenses promote relevance; they do not erase the rest of Seattle cinema.
4. **Discovery should reduce moviegoing regret** — Success is knowing what mattered in time, whether or not the user attended.
5. **Overview first, reference second** — Discovery prioritizes orientation and decision support; exhaustive lookup is a secondary mode.
6. **Opportunities drive decisions; films summarize them** — Consistent with [Product philosophy](./01-product-philosophy.md).
7. **Inline exploration over unnecessary navigation** — Compare and understand without forcing a scavenger hunt across disconnected pages (IA details deferred).

---

## Ranking philosophy (placeholder)

How competing films or opportunities are ordered under a lens is **not** specified here.

What *is* agreed:

* Ordering should serve Discovery’s purpose (visibility before disappearance, reduced regret).
* Ordering is a consequence of lenses, signals, and personalization emphasis — not a separate “black box score” defined in this document.
* No formulas, weights, or algorithms belong in this specification until Product Owner and ChatGPT explicitly add them.

---

## Intentionally deferred

| Topic | Why deferred |
|-------|----------------|
| Full signal taxonomy | Needs more design + evidence conversations |
| Full lens catalog | Philosophy first |
| Ranking formulas / scores | Implementation-agnostic by design |
| UI components / wireframes | → [Component system](./06-component-system.md), [Screen specifications](./08-screen-specifications.md) |
| Navigation flows | → [Navigation](./05-navigation.md) |
| Data schemas / APIs | Data-foundation and later implementation tracks |

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — mission, promise, emotional goal, principles
* [02 — Core concepts](./02-core-concepts.md) — Film, Opportunity, Plan, Lens definitions
* [10 — Opportunity model](./10-opportunity-model.md) — categories, primary story, supporting context
* [11 — Film lifecycle](./11-film-lifecycle.md) — evolving Seattle presence; urgency on opportunities
* [04 — Information architecture](./04-information-architecture.md) — user intents, overview / comparison / reference layers
* [12 — Experience model](./12-experience-model.md) — session types and continuity
* [09 — Implementation roadmap](./09-implementation-roadmap.md) — build order after design (placeholder)
