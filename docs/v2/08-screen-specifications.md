# 08 — Screen Specifications

**Status:** Home / Discovery conceptual behavior authored (D-10); other surfaces still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Discovery model](./03-discovery-model.md) · [Information architecture](./04-information-architecture.md) · [Opportunity model](./10-opportunity-model.md) · [Film lifecycle](./11-film-lifecycle.md) · [Experience model](./12-experience-model.md) · [Context & significance](./13-context-and-significance.md) · [Navigation](./05-navigation.md) · [Component system](./06-component-system.md)

This document records **per-surface product behavior** for Reel Seattle v2 — what each experience exists to accomplish and how it should feel when successful.

It is **not** a UI specification. Do not invent layouts, cards, chrome, interactions, wireframes, or algorithms from these sections.

---

## Document scope

| Surface | Completeness |
|---------|--------------|
| **Home / Discovery** | Conceptual behavior (D-10) |
| Film detail | Placeholder |
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

## Remaining surfaces (placeholders)

### Film detail

*(TBD — dedicated depth for a single film’s opportunities, context, and planning path.)*

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
