# 08 — Screen Specifications

**Status:** Home / Discovery (D-10) and Film Detail (D-11) conceptual behavior authored; other surfaces still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Core concepts](./02-core-concepts.md) · [Discovery model](./03-discovery-model.md) · [Information architecture](./04-information-architecture.md) · [Opportunity model](./10-opportunity-model.md) · [Film lifecycle](./11-film-lifecycle.md) · [Experience model](./12-experience-model.md) · [Context & significance](./13-context-and-significance.md) · [Navigation](./05-navigation.md) · [Component system](./06-component-system.md)

This document records **per-surface product behavior** for Reel Seattle v2 — what each experience exists to accomplish and how it should feel when successful.

It is **not** a UI specification. Do not invent layouts, cards, chrome, interactions, wireframes, or algorithms from these sections.

---

## Document scope

| Surface | Completeness |
|---------|--------------|
| **Home / Discovery** | Conceptual behavior (D-10) |
| **Film Detail** | Conceptual behavior (D-11) |
| Opportunity detail | Placeholder |
| Plan surfaces | Placeholder |
| Settings / preferences (if any) | Placeholder |

---

# Home / Discovery

---

## Purpose

The Home / Discovery experience helps users **quickly build an accurate mental model of Seattle cinema over the coming week**.

Its objective is **awareness first**, decision support second.

It should help users answer:

> “What opportunities exist this week?”

while also helping them understand:

> “What changed since the last time I looked?”

Home is the primary **overview** surface for Discovery ([Information architecture](./04-information-architecture.md), [Discovery model](./03-discovery-model.md)). It orients people to the city’s actionable landscape — extraordinary, time-sensitive, and newly relevant chances — without pretending to be an exhaustive database of every listing.

This serves the product promise and emotional goal: extraordinary Seattle cinema is hard to miss, and users know what was worth considering in time to act ([Product philosophy](./01-product-philosophy.md)).

---

## Primary User Outcome

After using the Home experience for a short period, users should feel:

> “I know what’s happening this week, I know which opportunities deserve my attention, and I’m confident I’m not going to miss something important.”

Emphasize **confidence**, not recommendation.

Success is orientation and trust — not that the product chose for them, predicted their taste, or filled their calendar. Users may still pass on every opportunity; they should feel they *knew* what mattered.

Home supports both **Time Awareness** (“what changed?”) and **Active Discovery** (“what’s worth my attention?”) session intents ([Experience model](./12-experience-model.md)) without becoming a different product for each visit.

---

## Editorial Philosophy

Home influences **attention**. It should rarely **restrict access** to information.

Agreed principles for this surface:

| Principle | Meaning on Home |
|-----------|-----------------|
| **Highlight without hiding** | Premium attention promotes what deserves notice now; the rest of Seattle cinema remains reachable. |
| **Prioritize rather than remove** | Emphasis changes order and salience; it does not erase titles or opportunities from the city. |
| **Awareness over engagement** | The job is accurate orientation, not maximizing clicks, dwell, or forced decisions. |
| **Context over opinion** | Help users understand why something is notable; do not substitute taste prediction for judgment ([Context & significance](./13-context-and-significance.md)). |
| **Opportunities over films** | Films remain the identity users scan; reasons to care live in opportunities and their stories ([Opportunity model](./10-opportunity-model.md)). |

Home may re-weight what rises first under lenses or future personalization, but a personalized Home still represents **Seattle**, not a private bubble that deletes the citywide landscape ([Discovery model](./03-discovery-model.md)).

---

## Editorial Hierarchy

Home should communicate a **conceptual attention hierarchy** — tiers of prominence, not ranking algorithms or scores.

Representative tiers below illustrate *kinds* of attention. They are not exhaustive, not mutually exclusive, and not entry/exit rules for engineering.

### Tier 1 — High urgency

Chances that are scarce, time-bound, or presentation-distinctive — easy to miss if overlooked.

Illustrative examples:

* 35mm / 70mm (and similarly rare presentation)
* Leaving soon
* One-night screenings
* Q&A and guest events
* Limited engagements

### Tier 2 — Newly relevant

Things that recently became part of the actionable landscape and deserve fresh awareness.

Illustrative examples:

* Newly announced rereleases
* Major releases
* Notable new indies
* Newly scheduled repertory titles

### Tier 3 — Ongoing opportunities

Still available and part of the week’s mental model, but less defined by urgency or newness alone.

Illustrative examples:

* Continuing theatrical runs
* Films still expected to remain available

### Tier 4 — Reference

Everything else remains **accessible** through browsing, search, filters, theater pages, and film pages — and through progressive depth when the user wants more than overview ([Information architecture](./04-information-architecture.md)).

Home does **not** define how competing items within a tier are ordered. Ordering philosophy remains deferred ([Discovery model](./03-discovery-model.md) — ranking placeholder).

---

## Editorial Signals

Items that occupy **premium attention** on Home should have a **clear reason** for that prominence.

Signals answer: *Why does this deserve notice among everything else playing in Seattle?*

Illustrative kinds of reason (not a scoring system):

* **Rarity** — hard to catch elsewhere or again
* **Urgency** — the chance is ending or one-off
* **Presentation** — format or screening mode that changes the experience
* **Cultural significance** — situates the work in a broader moment
* **Critical significance** — reception as orientation, not obedience
* **Discovery value** — newly actionable or easy to overlook without a nudge

These align with Discovery signals and opportunity stories ([Discovery model](./03-discovery-model.md), [Opportunity model](./10-opportunity-model.md)) and with context that explains notability without taste recommendation ([Context & significance](./13-context-and-significance.md)).

Do **not** invent weights, formulas, or badge inventories here. The principle is explainable attention: prominence should feel earned, not arbitrary.

---

## Evolution

Prominence on Home should **evolve naturally** as a film’s Seattle opportunities change ([Film lifecycle](./11-film-lifecycle.md)).

Urgency belongs to **opportunities**, not to film identity as such. The same title may move through different attention tiers as its local chances appear, settle, and end.

### Representative arcs

**Major theatrical release**

* May begin highly prominent (newly available / opening energy).
* Gradually become more routine as the run establishes.
* Later regain prominence as it approaches the end of its run (leaving window).

**Newly announced repertory screening**

* Rises when announced (newly relevant).
* Remains visible while the chance is actionable.
* Disappears from Home’s actionable emphasis after the opportunity passes — while the film may remain available as reference or archive.

Home should track **lifecycle reality** in its primary stories: what deserves attention *this week* may differ from last week for the same film, without treating every title as permanently urgent.

---

## Non-goals

Home / Discovery should **not**:

* become an **exhaustive database view** of every listing by default;
* **recommend every film equally** as if all chances were the same;
* attempt to **justify every listing** with the same depth of story or context;
* **overwhelm** users with identical levels of emphasis across the entire schedule.

Overview first; comparison and reference when the user needs them. Exhaustive lookup belongs to reference modes and deeper surfaces, not to Home’s primary job.

---

## Future Personalization

*(Placeholder — philosophy only; no behavior or implementation defined.)*

Home may eventually adapt emphasis using personal state while still representing the citywide landscape. Illustrative future concepts:

* **Watched films** — de-emphasize what the user has already seen, without erasing citywide presence
* **Resolved opportunities** — reduce noise around chances the user has already decided on or passed
* **Saved films** — keep interest visible across visits
* **Preference-aware prioritization** — membership, favorite theaters, preferred formats, and similar dimensions that re-weight attention

Personalization changes **emphasis**. It must not hide Seattle cinema or turn Home into a taste-recommendation engine. Continuity ideas in [Experience model](./12-experience-model.md) and personalization philosophy in [Discovery model](./03-discovery-model.md) apply.

---

## Intentionally deferred for Home

| Topic | Why deferred |
|-------|----------------|
| Layout, cards, density, chrome | → [Component system](./06-component-system.md), [Visual language](./07-visual-language.md) |
| Navigation structure and labels | → [Navigation](./05-navigation.md) |
| Interaction flows and controls | Later design agreement |
| Ranking / scoring algorithms | Explicitly out of scope |
| Exact personalization rules | Future Product Owner + ChatGPT sessions |

---

# Film Detail

---

## Purpose

The Film Detail experience is where **curiosity becomes confidence**.

Home answers:

> “What deserves my attention?”

Film Detail answers:

> “Why is this worth considering, and what is the best way to experience it?”

Users arrive after choosing to investigate a film. Film Detail deepens that investigation: it clarifies identity and notability, surfaces the film’s current Seattle opportunities, and supports choosing among those opportunities — or knowingly passing ([Core concepts](./02-core-concepts.md), [Opportunity model](./10-opportunity-model.md)).

It sits at the **comparison** layer of information architecture, with **reference** depth available when understanding requires more than a decision ([Information architecture](./04-information-architecture.md)). It may support Active Discovery moving into Decision or Research session intents ([Experience model](./12-experience-model.md)).

Film Detail is **not** a page layout or destination inventory. It is the conceptual behavior of film-centered decision support after overview.

---

## Primary User Questions

Representative questions Film Detail exists to answer (illustrative, not exhaustive):

* What is this film?
* Why is it notable?
* Why is Seattle showing it now?
* What opportunities currently exist?
* Which opportunity best matches my interests?
* How urgent is my decision?

These questions progress from identity and significance toward opportunity comparison and timing ([Film lifecycle](./11-film-lifecycle.md) — urgency belongs to opportunities).

---

## Information Hierarchy

Film Detail should reveal meaning in a **conceptual progression** — order of understanding, not visual layout.

Representative order:

1. **Film identity** — the stable title-level entity the user recognizes
2. **Why it matters** — notability and the reason this film deserves consideration *now*
3. **Current opportunities** — specific ways to experience it in Seattle while chances remain
4. **Supporting context** — enough honest detail that the primary story stays fair
5. **Reference information** — deeper knowledge when the user wants more than the decision requires

Users should not encounter every layer at once by default. Progressive disclosure still applies: lead with what supports judgment; keep depth reachable ([Information architecture](./04-information-architecture.md)).

---

## Opportunity-Centered Decision Support

Film Detail should help users **compare opportunities**, not merely list showtimes.

Showtimes alone answer *when*. Opportunities answer *how and why this way of seeing matters*: format, venue, event framing, scarcity, and timing relative to the run.

Representative differences users may need to weigh:

* **Presentation format** — e.g. 35mm, 70mm, IMAX, restoration, accessibility modes
* **Theater** — where in the city the chance lives
* **Event status** — Q&A, festival framing, guests, special programming
* **Urgency** — one-night, leaving window, limited engagement
* **Rarity** — hard to catch elsewhere or again
* **Remaining availability** — how much of the chance is still ahead

The film remains the **identity** frame; opportunities remain the **decision units** ([Core concepts](./02-core-concepts.md)). How comparison is presented (inline vs dedicated, controls, density) is deferred — not defined here.

---

## Context

Context on Film Detail helps users **exercise their own judgment**. It does not replace that judgment with taste prediction ([Context & significance](./13-context-and-significance.md)).

Representative kinds of context (illustrative; no required external source):

* Director
* Release year
* Synopsis
* Historical significance
* Festival history
* Notable collaborators
* Critical or community reception
* Relationships to other works

Context should stay **relevant to the decision or curiosity at hand**. Dumping every available fact is not the goal. Overview and comparison may surface a concise “why it matters”; richer reference stays available when Research-shaped needs arise.

Do **not** require any particular metadata vendor, pipeline, or field list in this specification.

---

## Explainability

Whenever Film Detail **emphasizes** an opportunity, users should be able to understand **why**.

Emphasis should feel earned — aligned with Discovery’s explainable-attention principle — not arbitrary or opaque.

Representative reasons for emphasis (not recommendation language, not a scoring system):

* Rare presentation
* Limited engagement
* Newly announced
* Critically significant
* Culturally significant

Avoid “you will love this” framing. Prefer “this stands out because…” so users can agree, disagree, or pass with confidence ([Context & significance](./13-context-and-significance.md) — context vs recommendation).

---

## Decision Outcomes

Film Detail should support **confident decisions in any direction** — attend, defer, compare further, or walk away.

Representative outcomes:

* Buy tickets (or otherwise act on a chosen opportunity externally)
* Save for later
* Compare opportunities
* Decide not to pursue
* Continue researching

Success is not conversion to attendance. Success is that the user knows what the film is, why it might matter, what Seattle chances exist, and what they will do next — including knowingly doing nothing.

Plans and commitment persistence remain conceptual downstream ([Core concepts](./02-core-concepts.md) — Plan; Planning surfaces still deferred).

---

## Non-goals

Film Detail should **not**:

* become an **encyclopedia** of cinema knowledge by default;
* **overwhelm** users with metadata unrelated to the current decision;
* present **context without relevance** — facts that do not help judgment or understanding;
* **recommend solely on popularity or ratings** as a substitute for opportunity meaning and user judgment.

Reference depth may exist; it must not crowd out opportunity-centered decision support.

---

## Future Placeholders

*(Philosophy only — no behavior or implementation defined.)*

Illustrative future concepts that may later attach to Film Detail:

* Watched status
* Reviews
* Cast exploration
* Related films
* Personalized notes
* Collection management

These must not redefine Film Detail’s primary job (identity → notability → opportunity comparison → confident outcome) or turn the surface into a taste-recommendation engine.

---

## Intentionally deferred for Film Detail

| Topic | Why deferred |
|-------|----------------|
| Page layout, tabs, cards, density | → [Component system](./06-component-system.md), [Visual language](./07-visual-language.md) |
| Navigation behavior and chrome | → [Navigation](./05-navigation.md) |
| Interaction flows and controls | Later design agreement |
| Recommendation / ranking algorithms | Explicitly out of scope |
| Opportunity Detail as a separate surface | Still a placeholder below |
| Exact personalization and collection rules | Future Product Owner + ChatGPT sessions |

---

## Remaining surfaces (placeholders)

### Opportunity detail

*(TBD — decision-focused depth for a specific way to experience a film.)*

### Plan surfaces

*(TBD — commitment, fit, and ongoing plans.)*

### Settings / preferences (if any)

*(TBD — only if later design requires explicit preference management.)*

---

## Non-goals for this document

* Mockups, wireframes, or pixel hierarchy
* React / CSS / production UI changes
* Algorithms, schemas, or recommendation systems
* Inventing screens beyond agreed conceptual surfaces
