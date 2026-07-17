# 13 — Context & Significance

**Status:** Philosophy documented (D-8); sources, voice, and explainability still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Discovery model](./03-discovery-model.md) · [Information architecture](./04-information-architecture.md) · [Opportunity model](./10-opportunity-model.md) · [Film lifecycle](./11-film-lifecycle.md) · [Experience model](./12-experience-model.md)

This document defines the kinds of **context** Reel Seattle should provide so people can quickly understand **why a film or opportunity may be worth their attention**.

It is a **product philosophy** document. It does not define algorithms, data sources, badges, UI, or metadata schemas.

---

## Purpose

Reel Seattle helps users make **informed decisions** by providing context — not by replacing their judgment.

The product promise is that extraordinary Seattle cinema is hard to miss ([Product philosophy](./01-product-philosophy.md)). Context reduces the effort required to understand *why* a film or screening might matter, so users can decide with confidence whether to investigate, plan, attend, or knowingly pass.

Context serves curiosity and clarity. It does not exist to pressure taste or manufacture urgency beyond what the opportunity itself warrants ([Film lifecycle](./11-film-lifecycle.md) — urgency belongs to opportunities).

---

## Context vs Recommendation

| | **Context** | **Taste recommendation** |
|---|-------------|---------------------------|
| Aim | Explain why something is **notable** | Predict whether **this user will like** it |
| Stance | Inform judgment | Substitute for judgment |
| Success | “I understand what this is and why it stands out” | “The product knew I’d enjoy this” |

**Reel Seattle should primarily provide context rather than make taste-based recommendations.**

Personalization may change *emphasis* ([Discovery model](./03-discovery-model.md), [Experience model](./12-experience-model.md)) — for example membership or favorite theaters — without turning the product into a “you will love this” engine. Highlight without hiding still applies: context and emphasis must not erase the citywide landscape.

---

## Types of Context

Representative categories below are **conceptual**. They are not exhaustive, not mutually exclusive, and not an engineering taxonomy.

| Category | What it helps convey |
|----------|----------------------|
| **Historical significance** | Why this work matters in cinema history or cultural memory. |
| **Notable filmmakers** | Creators, collaborators, or performers that give the work standing. |
| **Critical reception** | How the work has been received — as orientation, not as a score to obey. |
| **Festival history** | Festival presence or recognition that situates the work. |
| **Presentation significance** | Why *this showing* is special — 35mm, IMAX, restoration, accessibility modes, and similar. |
| **Rarity or uniqueness of the opportunity** | Scarcity of the chance itself — one-night, leaving window, indie-only, hard to catch elsewhere. |
| **Cultural relevance** | Why it resonates in a broader cultural or local moment. |
| **Relationships to other works** | Connections that help someone place the film among things they already know. |

Opportunity stories and signals ([Opportunity model](./10-opportunity-model.md), [Discovery model](./03-discovery-model.md)) often *point* at these kinds of meaning. Context deepens them when the user needs more than a headline.

---

## Decision Support

Context should help users quickly answer questions such as:

* What is this?
* Why is it notable?
* Why is this opportunity special?
* Should I investigate further?

It should **not** imply that Reel Seattle decides for them. The product supports judgment; the user retains it.

This aligns with progressive disclosure ([Information architecture](./04-information-architecture.md)): overview may surface a primary story; comparison and reference layers can carry richer context when the user chooses to go deeper — without dumping everything into Discovery.

---

## Relationship to Discovery

Discovery surfaces **what deserves attention now** — film-grouped opportunities, primary stories, signals, lenses.

**Context & significance** help users **investigate unfamiliar opportunities** once attention is caught: understanding without overwhelm.

| Discovery | Context & significance |
|-----------|-------------------------|
| Orient and emphasize | Explain and situate |
| “Why should I care *right now*?” | “What is this, and why might it matter?” |
| Keeps cognitive load low on browse | Available as depth when curiosity or decision needs it |

Together they support the emotional goal: people know which opportunities were worth considering, even when they choose not to attend.

Research-shaped sessions ([Experience model](./12-experience-model.md)) lean more on context; Time Awareness and Active Discovery lean on stories and signals first, with context on demand.

---

## Future topics

Placeholders only — no behavior defined yet:

### Editorial voice

*(TBD — how Reel Seattle speaks when providing context: tone, restraint, local point of view.)*

### External metadata

*(TBD — which outside facts may inform context; product role only, not schemas or vendors.)*

### User personalization

*(TBD — how preference changes which context is emphasized without becoming taste prediction.)*

### Community signals

*(TBD — whether and how shared attention or local conversation appears as context.)*

### Explainability

*(TBD — how users understand why something was highlighted or contextualized; related to recommendation transparency in Discovery.)*

---

## Intentionally out of scope

* Ranking or scoring formulas
* Recommendation algorithms
* UI components, badges, or layouts
* Metadata schemas or data pipelines
* Production-site behavior

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — mission, promise, emotional goal
* [03 — Discovery model](./03-discovery-model.md) — signals, lenses, highlight without hiding
* [04 — Information architecture](./04-information-architecture.md) — overview / comparison / reference
* [10 — Opportunity model](./10-opportunity-model.md) — primary story and supporting context
* [11 — Film lifecycle](./11-film-lifecycle.md) — evolving presence; opportunity-bound urgency
* [12 — Experience model](./12-experience-model.md) — Research and Discovery session emphasis
