# 08 — Screen Specifications

**Status:** Home / Discovery (D-10), Film Detail (D-11), Theater (D-12), and Planner (D-13) conceptual behavior authored; other surfaces still deferred  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Core concepts](./02-core-concepts.md) · [Discovery model](./03-discovery-model.md) · [Information architecture](./04-information-architecture.md) · [Opportunity model](./10-opportunity-model.md) · [Film lifecycle](./11-film-lifecycle.md) · [Experience model](./12-experience-model.md) · [Context & significance](./13-context-and-significance.md) · [Navigation](./05-navigation.md) (incl. Interaction Model) · [Component system](./06-component-system.md)

This document records **per-surface product behavior** for Reel Seattle v2 — what each experience exists to accomplish and how it should feel when successful.

It is **not** a UI specification. Do not invent layouts, cards, chrome, interactions, wireframes, or algorithms from these sections.

---

## Document scope

| Surface | Completeness |
|---------|--------------|
| **Home / Discovery** | Conceptual behavior (D-10) |
| **Film Detail** | Conceptual behavior (D-11) |
| **Theater** | Conceptual behavior (D-12) |
| **Planner** | Conceptual behavior (D-13) |
| Opportunity detail | Placeholder |
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

Plans and commitment persistence remain conceptual downstream ([Core concepts](./02-core-concepts.md) — Plan; [Planner](#planner) below).

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

# Theater

---

## Purpose

The Theater experience helps users understand both:

* the **identity** of a theater, and
* the **opportunities** that theater currently offers.

It should not stop at:

> “What’s playing here?”

It should answer:

> “Why would I choose this theater instead of another?”

Theater is the primary surface for **Theater Exploration** sessions — place and venue as a path into films and opportunities ([Experience model](./12-experience-model.md)). Schedules matter, but they matter because they express what kind of cinema this venue practices, not because a raw list of showtimes is the product.

Films remain the identity users recognize when scanning programming; opportunities remain the decision units attached to those films ([Core concepts](./02-core-concepts.md), [Opportunity model](./10-opportunity-model.md)). The Theater experience adds a **venue-centered** frame: why *this place* is a reason to go.

---

## Primary User Questions

Representative questions (illustrative, not exhaustive):

* What kind of theater is this?
* What experiences is it known for?
* What makes it unique?
* What is happening here this week?
* Is this somewhere I should visit?
* When would I choose this venue over another?

These questions move from enduring character toward current programming and confident venue choice — without requiring the user to reconstruct identity from showtimes alone.

---

## Theater Identity

Theaters are **first-class entities** with enduring identities, not disposable labels on a schedule.

Identity outlives any single week’s listings. Users return to venues the way they return to films: recognizing a place and what it stands for in Seattle cinema.

Representative characteristics of identity (conceptual — not implementation fields):

* Programming philosophy
* Presentation capabilities
* Formats
* Historical significance
* Neighborhood
* Audience expectations
* Recurring events

A Theater experience that only dumps today’s showtimes has failed identity. Users should leave with a clearer sense of *what this place is*, even if they do not attend this week.

---

## Current Opportunities

Current programming should be **interpreted through the theater’s identity**.

Schedules are meaningful because they **express the theater’s character** — what this venue tends to show, celebrate, and make possible — not merely because times exist on a calendar.

Illustrative kinds of programming that carry venue meaning:

* Repertory programming
* Premieres
* Festivals
* Themed series
* Film presentations (including distinctive formats)
* Community events

Opportunities listed under a theater still obey the product model: each is a specific way to experience a film. Film Detail compares opportunities for one film across the city; Theater gathers opportunities that share a **place**, so users can ask whether this venue’s week matches why they would go there.

Highlight without hiding still applies at the venue scale: emphasize what is distinctive about *this* theater’s week without pretending the rest of Seattle disappeared ([Discovery model](./03-discovery-model.md)).

---

## Comparison Philosophy

Users naturally compare venues when deciding where to go. Theater should support that mental comparison **conceptually** — not by prescribing a comparison UI.

Representative contrasts people already make in Seattle cinema:

* SIFF vs AMC
* Beacon vs Central Cinema
* IMAX vs neighborhood cinema
* Repertory vs first-run

Comparison is about **fit of place and programming**, not a ranked “best theater” score. Context and identity explain differences; the product does not substitute taste recommendation for judgment ([Context & significance](./13-context-and-significance.md)).

Do **not** define comparison interfaces, side-by-side layouts, or ranking algorithms here.

---

## Context

Supporting information helps users decide whether and when to visit — and understand why a film is playing *here*.

Representative examples (not required for every theater):

* Projection formats
* Screen characteristics
* Recurring programming
* Accessibility
* Food and beverage
* Seating
* Transportation
* Parking
* Neighborhood context

Context should stay **relevant to venue judgment**. Amenities matter when they shape the visit; they must not overshadow programming identity. Incomplete information is acceptable: not every venue needs every category filled in before the experience is useful.

Do **not** require particular data sources or field inventories in this specification.

---

## Decision Outcomes

Theater should support confident venue-related decisions in any direction.

Representative outcomes:

* Choose this venue
* Compare with another venue
* Plan a visit
* Discover future interest (this place is worth returning to)
* Understand why a film is playing here

Success is not forcing a visit tonight. Success is that the user understands the theater’s character, what it offers this week, and whether it fits how they want to go to the movies — including deciding another venue (or none) is better right now.

Planning and Plan persistence remain downstream ([Core concepts](./02-core-concepts.md) — Plan; [Planner](#planner) below).

---

## Non-goals

The Theater experience should **not**:

* become merely a **showtime list**;
* **duplicate Film Detail** — film-centered opportunity comparison and deep film context live there;
* **overwhelm** users with venue trivia unrelated to identity or visit judgment;
* **prioritize amenities over programming identity** — comfort and logistics support the visit; they do not replace what the theater stands for.

Theater Exploration still groups meaning by film identity when presenting opportunities ([Experience model](./12-experience-model.md)); the venue frame organizes *where*, without replacing *what*.

---

## Future Placeholders

*(Philosophy only — no behavior or implementation defined.)*

Illustrative future concepts that may later attach to Theater:

* Favorite theaters
* Attendance history
* Auditorium-level information
* Recurring series
* Venue notifications
* Neighborhood recommendations

These must not redefine Theater’s primary job (identity → current opportunities as character → confident venue judgment) or turn the surface into a generic local-business directory.

---

## Intentionally deferred for Theater

| Topic | Why deferred |
|-------|----------------|
| Page layout, tabs, cards, density | → [Component system](./06-component-system.md), [Visual language](./07-visual-language.md) |
| Navigation behavior and chrome | → [Navigation](./05-navigation.md) |
| Interaction flows and controls | Later design agreement |
| Ranking / “best venue” algorithms | Explicitly out of scope |
| Exact favorite-theater and notification rules | Future Product Owner + ChatGPT sessions |

---

# Planner

---

## Purpose

The Planner answers:

> “Given the opportunities I care about, what is the best plan?”

It is an **interactive schedule optimization workspace**. It is **not** an editorial recommendation engine, and it is **not** a curated “movie night.”

The Planner **optimizes logistics** — it does not decide taste. It begins **after discovery has already happened**: the user already cares about particular opportunities; the Planner helps turn that care into something practical and executable.

A **Plan** remains commitment in the product model ([Core concepts](./02-core-concepts.md)). The Planner is the operational surface where commitments take shape, fit real constraints, and become ready to act on ([Experience model](./12-experience-model.md) — Planning sessions; [Information architecture](./04-information-architecture.md) — Planning intent).

---

## Relationship to the Rest of the Product

Conceptual progression (not a forced page stack):

```text
Home
  ↓
Awareness
  ↓
Film Detail
  ↓
Confidence
  ↓
Planner
  ↓
Preparedness
```

| Stage | Role |
|-------|------|
| **Home** | Orient to what deserves attention this week |
| **Awareness** | Know the landscape and what changed |
| **Film Detail** | Understand why a film is worth considering and which opportunities matter |
| **Confidence** | Know enough to choose among opportunities — or knowingly pass |
| **Planner** | Fit chosen opportunities into real time and logistics |
| **Preparedness** | Leave ready to act, save, share, or postpone without regret |

Planning is the **operational stage** of the experience — not another discovery surface. Discovery and Film Detail (and Theater, when place is the path) create awareness and confidence. The Planner consumes that intent and produces executable structure.

Theater may feed venue preference into planning; it does not replace the Planner’s logistics job.

---

## Planning Philosophy

Agreed principles for this surface:

| Principle | Meaning |
|-----------|---------|
| **Optimize rather than recommend** | Arrange and fit opportunities the user already cares about; do not invent taste or curated nights by default. |
| **The user defines goals** | What to attempt, when, and what “good enough” means comes from the user. |
| **Satisfy constraints** | Hard limits (time, place, travel, availability) bound what is feasible. |
| **Users remain in control** | The Planner proposes and supports; it does not lock users into an opaque result. |
| **Refine rather than replace** | Plans improve through adjustment — priorities, assumptions, substitutions — not by discarding the user’s work and starting from zero. |

Do **not** read algorithms, solvers, or scoring systems into these principles. They describe product stance, not methods.

---

## Inputs

Planning draws on **representative inputs** the user (or prior session state) may bring. These are conceptual examples, not required controls or a schema.

Illustrative inputs:

* Selected opportunities
* Available time
* Desired date
* Theater preferences
* Presentation preferences
* Runtime constraints
* Travel preferences
* Budget considerations
* Social considerations

Inputs express goals and limits. Exact capture, defaults, and persistence are deferred.

---

## Constraints vs Preferences

The Planner should distinguish **hard constraints** from **soft preferences**.

| Kind | Role | Representative examples |
|------|------|-------------------------|
| **Constraints** | Bound feasibility; must be respected | Showtimes, runtime, theater, travel, ticket availability |
| **Preferences** | Shape tradeoffs when more than one plan is feasible | Presentation, critical reception, excitement, urgency, cost |

The Planner **balances preferences while respecting hard constraints**. A preference never licenses an infeasible schedule. When constraints conflict with goals, the surface should help the user see the conflict and adapt — not silently invent a different taste profile.

---

## Optimization Philosophy

Optimization here means producing **practical schedules** that serve the user’s stated goals under real constraints — not maximizing novelty, engagement, or editorial surprise.

Illustrative aims (conceptual — not methods):

* Minimize idle time
* Maximize feasible opportunities the user already cares about
* Reduce unnecessary travel
* Preserve user intent
* Produce practical schedules

How tradeoffs are computed, ranked, or displayed is **out of scope**. No solvers, weights, or recommendation engines belong in this specification.

---

## User Control

Users should be able to **inspect, modify, and refine** plans. The Planner supports iterative adjustment. It should **not** behave as a black box.

Representative control concepts (not interface controls):

* Adjusting priorities
* Changing assumptions
* Replacing individual opportunities
* Refining rather than restarting

Users should understand *why* a plan looks the way it does at a logistics level (fit, conflict, travel) — explainability of arrangement, not taste recommendation.

---

## Adaptive Planning

Plans should respond when circumstances change while **preserving user intent**.

Representative triggers:

* Sold-out performances
* Schedule changes
* User modifications
* Newly announced opportunities

Adaptation helps the user stay prepared when the city or their own choices shift. It does not silently substitute “something else you might like.” Continuity from [Experience model](./12-experience-model.md) — maintaining plans across visits — applies.

---

## Decision Outcomes

The Planner should support **confident commitment without requiring immediate purchase**.

Representative outcomes:

* Purchase tickets (or otherwise act externally on a planned opportunity)
* Save a plan
* Share a plan
* Compare alternatives
* Continue refining
* Postpone commitment

Success is preparedness: the user knows what they intend to do, whether it fits, and what to do next — including waiting.

---

## Non-goals

The Planner should **not**:

* **replace discovery** — awareness and “what deserves attention?” belong upstream (Home / Film Detail / Theater);
* **curate themed movie nights by default** — that is editorial recommendation, not logistics optimization;
* **make taste decisions** for users;
* **hide alternatives** — highlight without hiding still applies when multiple feasible plans or substitutions exist;
* **optimize for novelty** instead of user goals.

---

## Future Placeholders

*(Philosophy only — no behavior or implementation defined.)*

Illustrative future concepts that may later attach to the Planner:

* Collaborative planning
* Shared itineraries
* Recurring preferences
* Calendar integration
* Attendance history
* Optimization presets
* Saved planning sessions

These must not redefine the Planner’s primary job (user-defined goals → constraint-respecting logistics → inspectable, refinable preparedness) or turn it into a discovery or taste engine.

---

## Intentionally deferred for Planner

| Topic | Why deferred |
|-------|----------------|
| Layout, cards, density, chrome | → [Component system](./06-component-system.md), [Visual language](./07-visual-language.md) |
| Navigation behavior and chrome | → [Navigation](./05-navigation.md) |
| Interaction flows and controls | Later design agreement |
| Optimization / recommendation algorithms | Explicitly out of scope |
| Exact calendar, sharing, and collaboration rules | Future Product Owner + ChatGPT sessions |

---

## Remaining surfaces (placeholders)

### Opportunity detail

*(TBD — decision-focused depth for a specific way to experience a film.)*

### Settings / preferences (if any)

*(TBD — only if later design requires explicit preference management.)*

---

## Non-goals for this document

* Mockups, wireframes, or pixel hierarchy
* React / CSS / production UI changes
* Algorithms, schemas, or recommendation systems
* Inventing screens beyond agreed conceptual surfaces
