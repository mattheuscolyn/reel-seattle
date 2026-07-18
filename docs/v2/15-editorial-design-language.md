# 15 — Editorial Design Language

**Status:** Philosophy documented (D-15); systems and tokens still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Information architecture](./04-information-architecture.md) · [Navigation & Interaction Model](./05-navigation.md) · [Screen specifications](./08-screen-specifications.md) · [Experience model](./12-experience-model.md) · [Context & significance](./13-context-and-significance.md) · [Visual language](./07-visual-language.md) · [Component system](./06-component-system.md) · [Entity expression](./16-entity-expression.md)

This document describes the **editorial visual philosophy** of Reel Seattle v2 — principles that should guide future visual design.

It sits **between product philosophy and eventual UI design**. It is **not** a style guide, component library, branding kit, or permission to change production CSS.

Do not invent colors, fonts, spacing values, grids, layouts, components, animations, or assets from these sections.

---

## Purpose

Visual design should not simply present information.

It should help users understand the **Seattle cinema landscape** with clarity, confidence, and appropriate emphasis.

Visual design exists to **support understanding rather than decoration**. Hierarchy, imagery, type, and space earn their place when they make opportunities easier to notice, judge, and act on — aligned with the product promise and emotional goal ([Product philosophy](./01-product-philosophy.md)).

This philosophy informs later [Visual language](./07-visual-language.md) and [Component system](./06-component-system.md) work; it does not replace them.

---

## Editorial Rather Than Algorithmic

Reel Seattle should feel closer to an **editorial publication** than an infinite content feed.

Clarify that:

* **Importance is communicated through presentation** — what matters now looks like it matters.
* **Prioritization is visible** — emphasis is readable, not buried in an opaque rank.
* **Nothing meaningful is hidden** — highlight without hiding still applies visually ([Discovery model](./03-discovery-model.md), Home editorial philosophy in [Screen specifications](./08-screen-specifications.md)).
* **Users remain free to explore everything** — presentation guides attention; it does not wall off the city.

The product communicates **significance** without dictating **taste** ([Context & significance](./13-context-and-significance.md)). Visual emphasis should feel editorial and explainable, not like a feed optimizing for engagement.

---

## Calm Confidence

Desired emotional tone — without specifying colors or fonts:

| Characteristic | Meaning |
|----------------|---------|
| **Thoughtful** | Considered presentation; nothing feels accidental |
| **Restrained** | Quiet strength over spectacle |
| **Trustworthy** | Reliable orientation to Seattle cinema |
| **Culturally informed** | Respect for film culture and local moviegoing |
| **Confident without being loud** | Clarity over hype |
| **Contemporary without chasing trends** | Current and durable, not fashion-forward for its own sake |

Tone should support confidence (“I know what matters”) rather than urgency theater or novelty addiction ([Product philosophy](./01-product-philosophy.md) — emotional goal).

---

## Visual Hierarchy

Hierarchy is conceptual — not a layout system.

Representative principles:

* The most significant opportunities receive the most visual attention
* Routine information recedes naturally
* Emphasis should feel **earned** (aligned with editorial signals and explainable guidance)
* Hierarchy should **reduce scanning effort**

This continues Home’s attention tiers and the Interaction Model’s progressive understanding ([Screen specifications](./08-screen-specifications.md), [Navigation](./05-navigation.md)) without prescribing columns, cards, or pixel weights.

---

## Posters as Supporting Evidence

Film imagery aids **recognition** and establishes **identity**. Posters are valuable — and secondary.

Principles:

* Posters should **support** editorial structure
* Posters should **not dominate** every surface
* **Typography and information architecture** remain the primary communication tools

The product should never feel like a **wall of posters**. Imagery serves the film identity layer; opportunity stories, signals, and logistics carry decision meaning ([Core concepts](./02-core-concepts.md), [Opportunity model](./10-opportunity-model.md)).

---

## Typography as Structure

Typography should carry much of the **information hierarchy**.

Representative roles (no fonts or sizes):

* Establishing importance
* Separating sections
* Improving scanability
* Creating rhythm
* Supporting editorial presentation

Type is a structural tool for meaning — not decoration applied after layout. Exact type systems belong in later [Visual language](./07-visual-language.md) work.

---

## Whitespace and Rhythm

Spacing is an **editorial tool**, not empty leftover area.

Representative ideas:

* Allow important items to breathe
* Avoid visual clutter
* Reduce cognitive load
* Support deliberate browsing
* Communicate confidence through restraint

Dense information is part of the product principles ([Product philosophy](./01-product-philosophy.md) — information-dense). Density and breathing room coexist: density of *meaning*, not clutter of equal-weight noise.

---

## Information Before Decoration

Visual styling should always **reinforce meaning**.

Representative examples:

* Emphasis should indicate importance
* Badges should communicate useful distinctions
* Icons should clarify rather than decorate
* Color should reinforce understanding

Avoid ornamental design without informational value. If removing a visual flourish does not hurt understanding or interaction, it likely does not belong — consistent with product-wide restraint and explainable guidance ([Navigation — Interaction Model](./05-navigation.md#interaction-model)).

---

## Recognition Before Detail

Visual presentation should naturally encourage progressive understanding:

```text
Notice
   ↓
Recognize
   ↓
Understand
   ↓
Investigate
   ↓
Commit
```

| Stage | Visual job (conceptual) |
|-------|-------------------------|
| **Notice** | Something deserves attention |
| **Recognize** | Identity is clear (film, venue, opportunity kind) |
| **Understand** | Why it matters / what differs |
| **Investigate** | Deeper context available without dumping it first |
| **Commit** | Path to plan or action is clear |

This parallels Interaction Model progressive understanding and IA progressive disclosure ([Navigation](./05-navigation.md), [Information architecture](./04-information-architecture.md), [Experience model](./12-experience-model.md)).

---

## Human Editorial Voice

The interface should feel **intentionally assembled** rather than mechanically generated.

Representative characteristics:

* Coherent
* Considered
* Curated in **presentation**
* Transparent in **reasoning**

This refers to **how meaning is presented** — not to filtering the city, hiding opportunities, or making taste recommendations. Editorial voice in presentation pairs with highlight-without-hiding and explainable emphasis ([Context & significance](./13-context-and-significance.md)).

---

## Non-goals

The design language should **not** resemble:

* An infinite social feed
* A streaming-service catalog
* A dense database
* An enterprise dashboard
* A nostalgic retro film website

The visual language should feel **contemporary and editorial** — a guide to Seattle cinema opportunities, not a scrapbook, spreadsheet, or infinite scroll of thumbnails.

---

## Future Placeholders

*(Systems not defined yet — later Product Owner + ChatGPT design.)*

Reserve future work for:

* Typography system
* Color philosophy
* Motion principles
* Iconography
* Photography and poster treatment
* Spacing system
* Accessibility considerations
* Component expression

Exact tokens, values, and assets belong in [Visual language](./07-visual-language.md) and [Component system](./06-component-system.md) after this philosophy is agreed — not in this document.

---

## Intentionally out of scope

* Colors, fonts, spacing values, grids
* Layouts, components, animations
* Branding assets, logos, mockups
* Production CSS or UI implementation

---

## Relationship to other v2 docs

* [01 — Product philosophy](./01-product-philosophy.md) — mission, promise, emotional goal, product principles
* [04 — Information architecture](./04-information-architecture.md) — progressive disclosure of meaning
* [05 — Navigation](./05-navigation.md) — Interaction Model (progressive understanding, explainable guidance)
* [08 — Screen specifications](./08-screen-specifications.md) — per-surface behavior this language must serve
* [12 — Experience model](./12-experience-model.md) — session tone and continuity
* [13 — Context & significance](./13-context-and-significance.md) — significance without taste prescription
* [07 — Visual language](./07-visual-language.md) — future tokens and concrete visual systems (placeholder)
* [06 — Component system](./06-component-system.md) — future building blocks (placeholder)
