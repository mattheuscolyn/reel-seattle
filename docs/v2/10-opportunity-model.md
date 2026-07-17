# 10 — Opportunity Model

**Status:** Philosophy documented (D-3); taxonomies and prioritization still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Core concepts](./02-core-concepts.md) · [Discovery model](./03-discovery-model.md) · [Film lifecycle](./11-film-lifecycle.md) · [Information architecture](./04-information-architecture.md) · [Context & significance](./13-context-and-significance.md) · [Screen specifications](./08-screen-specifications.md)

This document defines how Reel Seattle thinks about **moviegoing opportunities** as a product concept.

It is **not** a schema, API guide, ranking guide, or UI specification. Avoid reading engineering structure into these sections.

---

## Purpose

### Why opportunities—not films—are the primary unit of decision-making

People recognize **films**. They decide on **opportunities**.

A film answers *what* something is. An opportunity answers *how and why it matters to go now*: tonight only, in a rare format, with a guest, about to leave town, available in a way that fits how someone already goes to the movies.

If Discovery spoke only in film titles, users would know the landscape of titles but not which chances are extraordinary, fleeting, or worth rearranging a week for. Opportunity is the layer that turns “something is playing” into “this is a reason to act—or to knowingly pass.”

Films remain the **canonical identity** presented and remembered. Opportunities remain the **decision unit**. Discovery **summarizes opportunities through films** so the mind stays organized by title while the reasons to care stay rooted in experience.

This continues [Product philosophy](./01-product-philosophy.md) and [Core concepts](./02-core-concepts.md), and pairs with how Discovery surfaces meaning in [Discovery model](./03-discovery-model.md).

---

## Opportunity Categories

Categories are a **conceptual vocabulary** for kinds of meaning an opportunity can carry. They are not an exhaustive taxonomy, not mutually exclusive labels, and not a product checklist for engineering.

| Category | What kind of meaning it holds |
|----------|-------------------------------|
| **Availability** | Whether and when the chance exists — newness, scarcity, last chances, limited runs. |
| **Presentation** | How the film is shown — format, accessibility features, special screening modes. |
| **Event** | What surrounds the screening beyond the film itself — guests, conversations, festival framing. |
| **Exclusivity** | Where the chance lives in the city — indie-only, single-venue, hard-to-find elsewhere. |
| **Personal relevance** | Why it matters *to this person* — membership fit, favorite venues, preferred ways of seeing — without erasing the citywide landscape. |

A single opportunity may speak in more than one category at once. Categories help designers talk about *kinds* of stories; they do not prescribe which story wins.

---

## Opportunity Stories

### Philosophy

For each film in Discovery, Reel Seattle should communicate a **single primary story** — one clear answer to *Why should I care right now?*

That story is drawn from the film’s opportunities and signals. It is the headline meaning, not a dump of every attribute.

The primary story should feel like something a knowledgeable friend would say first, not a list of tags.

### Illustrative stories

Examples of the *kind* of primary story Discovery might lead with. This list is **not** complete and does **not** define selection rules:

* New this week
* Tonight in 35mm
* Leaving soon
* Director Q&A
* Only at indie theaters

### What is not defined here

* How the primary story is chosen when several compete
* Priority between categories
* Exact wording rules or length limits

Those decisions wait for later Product Owner + ChatGPT agreement. This document only locks that Discovery aims for **one primary story per film**, not a flat pile of equal facts.

---

## Supporting Context

### Highlight without hiding

The primary story should be accompanied by **enough supporting context** that users are not misled.

Highlighting one reason to care must not imply that reason is the *only* truth when the full picture is broader. Emphasis is allowed; oversimplification that creates false exclusivity or false scarcity is not.

### Illustrative contrast

| Misleading emphasis | Honest supporting context |
|---------------------|---------------------------|
| “Now in IMAX” *(when other premium formats also exist and matter)* | “Now in IMAX and other premium formats” |

The first line may still be the **primary story** when IMAX is the most distinctive hook. Supporting context keeps the story **true**.

Supporting context is philosophical here: *say enough so the highlight remains fair.* Richer significance (history, filmmakers, presentation meaning) is developed in [Context & significance](./13-context-and-significance.md). Layout, density, and interaction patterns are deferred to later design docs.

---

## Relationship to signals and lenses

* **Signals** ([Discovery model](./03-discovery-model.md)) are concise reasons an opportunity deserves attention. Stories often *express* signals in human language.
* **Lenses** change which stories and opportunities feel salient; they do not redefine what an opportunity *is*.
* **Personal relevance** may shape which story leads for someone without hiding opportunities that remain part of Seattle cinema.

---

## Future topics

Placeholders only — no behavior defined yet:

### Film lifecycle

See [Film lifecycle](./11-film-lifecycle.md) — how a film’s opportunity story evolves across Seattle presence (philosophy documented; stage criteria still deferred).

### Opportunity prioritization

*(TBD — how competing stories and opportunities are ordered under a lens without becoming a hidden score.)*

### Signal taxonomy

*(TBD — a fuller catalog of signals beyond illustrative examples; keep aligned with Discovery.)*

### Personalization interactions

*(TBD — how membership, favorite theaters, preferred formats, and dismissed films reshape emphasis while highlighting without hiding.)*

---

## Intentionally out of scope

* Schemas, field lists, APIs
* Ranking formulas or weights
* UI components, wireframes, navigation
* Production-site behavior

Implementation follows this philosophy later; it must not invent opportunity meaning ahead of Product Owner + ChatGPT design.
