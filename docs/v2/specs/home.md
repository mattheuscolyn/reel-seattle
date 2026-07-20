# Home — Canonical Screen Specification

**Status:** Canonical product specification (D-17)  
**Authority:** Authoritative for Home product behavior  
**Supersedes for Home implementation decisions:** Conceptual Home section in [08 — Screen specifications](../08-screen-specifications.md) where this document is more specific  
**Related:** [v2 README](../README.md) · [Discovery model](../03-discovery-model.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Experience model](../12-experience-model.md) · [Editorial design language](../15-editorial-design-language.md) · [Entity expression](../16-entity-expression.md) · [Opportunity model](../10-opportunity-model.md) · [Film lifecycle](../11-film-lifecycle.md) · [Context & significance](../13-context-and-significance.md)

---

## Status and authority

This document is the **canonical product specification for Home** in Reel Seattle v2.

It describes:

* product behavior
* information hierarchy
* states
* interaction rules

It does **not** prescribe:

* exact pixels, CSS, or typography tokens
* component file structure or production APIs
* implementation technology

**Written specifications are authoritative.** Design-review images (if retained later) are supporting references only; they do not override this document.

Conceptual philosophy in [08 — Screen specifications](../08-screen-specifications.md) remains useful background. Where that document and this one diverge on Home behavior, **this specification wins**.

Cursor must implement agreed specifications; it must not invent Home UX to fill gaps ([Development operating model](../../development-operating-model.md#v2-product-design-workflow)).

---

## Purpose

Home is Reel Seattle’s **editorial front page** and **awareness surface**.

It helps users understand the **current state of Seattle cinema** while layering meaningful change and urgency on top.

Home must **not** behave as merely a “what’s new today” feed. Important films and opportunities should remain visible across multiple visits when they are still relevant. Editorial relevance is not synonymous with recency ([Film lifecycle](../11-film-lifecycle.md); continuity below).

This continues Discovery-before-reference and highlight-without-hiding ([Discovery model](../03-discovery-model.md), [Product philosophy](../01-product-philosophy.md)).

---

## Primary user question

> “What deserves my attention in Seattle cinema right now?”

Supporting awareness questions (secondary, not a competing primary job):

* What is the current state of Seattle cinema this week?
* What changed in a meaningful way since I last looked?
* Which opportunities are extraordinary, scarce, or time-sensitive?

**Reconciliation note:** Earlier conceptual language asked “What opportunities exist this week?” as a primary framing ([08](../08-screen-specifications.md)). That remains a useful *outcome* of awareness. The **approved primary question** for Home is attention-worthiness *now*, not exhaustive weekly inventory and not a pure novelty feed.

---

## Product role

Home primarily supports **awareness**, with a **lighter planning** role.

| Role | Meaning |
|------|---------|
| **Primary — awareness** | Orient to what deserves attention; build confidence that extraordinary chances are hard to miss |
| **Secondary — light planning** | Optional quick actions (e.g. add to Planner) from appropriate secondary expressions — not a planning workspace |

### Should feel like

* An editorial publication
* A weekly or current cinema briefing
* Calm, selective, confident, and culturally informed ([Editorial design language](../15-editorial-design-language.md))

### Should not feel like

* A streaming-service catalog
* An infinite recommendation feed
* A ticketing marketplace
* A dense filter dashboard
* A social feed

---

## Entry points

Representative entry paths (conceptual — not route inventory):

* Default / first destination for many sessions (Time Awareness and Active Discovery; [Experience model](../12-experience-model.md))
* Return visits seeking orientation or “what changed that still matters”
* Deep links that restore enough Home context when shared (exact deep-link behavior deferred)
* Exit from other surfaces back to overview without losing citywide orientation ([Navigation](../05-navigation.md))

---

## Exit paths

Representative exits:

| Destination | Why the user leaves Home |
|-------------|--------------------------|
| **Film Detail** | Investigate a film / opportunity after notice (featured tap or secondary continue) |
| **Theater** | Explore a venue’s identity and programming |
| **Planner** | Optimize logistics for opportunities already cared about |
| **Explore / reference destinations** | Answer a self-directed question with browse/filter (see Filtering boundary) |
| **Search** | Recognition-led find (when available) |

Home surfaces interest; it does not duplicate Film Detail’s full decision experience or Planner’s optimization workflow.

---

## Information hierarchy

Approved high-level hierarchy (product order of attention — not a pixel layout):

1. **Editorial orientation / current-state framing** — situate the user in Seattle cinema *now*
2. **A grand, scarce Top Opportunities presentation** — few genuinely important chances
3. **Supporting sections** that broaden awareness without flattening everything into equal cards
4. **A clear transition into deeper exploration** — mode shift toward reference
5. **Reference-oriented destinations** — browse and filter comprehensively *after* leaving Home’s editorial mode

This maps conceptually to earlier attention tiers (high urgency / newly relevant / ongoing / reference) without requiring those tier labels in the UI ([08](../08-screen-specifications.md)).

---

## Major content regions

### 1. Editorial orientation

Brief framing that answers: *What is the state of Seattle cinema right now?* May include change awareness when meaningful. Must not overwhelm or become a news ticker of every update.

### 2. Top Opportunities

Featured, scarce, cinematic presentation of selected opportunities (rules below).

### 3. Supporting awareness sections

Additional editorial groupings that broaden the briefing — still selective, still unequal emphasis. Exact section inventory is open (see Open questions); principles: do not flatten to equal cards; do not become an infinite catalog.

### 4. Transition to exploration

A deliberate bridge from editorial briefing to comprehensive browse/filter destinations (see Filtering and exploration boundary).

### 5. Beyond Home (not Home regions)

Films / Everything Playing, Theaters, Formats and Experiences, Search / Explore — **reference destinations**, not Home filter chrome.

---

## Top Opportunities

The featured opportunity treatment is intentionally **large and cinematic**.

**Purpose:** make selected screenings or film opportunities feel like **distinct experiences**, not generic film listings.

### Rules

* **Editorial scarcity is essential.**
* The section should contain only a **small number** of genuinely important opportunities.
* It must **not** become an infinite horizontal streaming row.
* **Default conceptual target:** approximately **three** featured opportunities.
* **Upper editorial limit:** approximately **five** — an editorial ceiling, not a hard technical constraint.
* Prominence should communicate that each item **earned its place**.
* Selection must eventually be **explainable** through opportunity, cultural, urgency, and personal signals — not opaque recommendation logic ([Context & significance](../13-context-and-significance.md), [Discovery model](../03-discovery-model.md)).

Films remain the identity users recognize; reasons to care remain rooted in **opportunities** ([Core concepts](../02-core-concepts.md), [Entity expression](../16-entity-expression.md)).

---

## Entity expressions used

On Home, entities emphasize awareness facets ([Entity expression](../16-entity-expression.md)):

| Entity | Home emphasis |
|--------|----------------|
| **Film** | Significance, rarity, editorial importance |
| **Opportunity** | Significance — why this chance deserves attention now |
| **Theater** | Destination / programming identity when place is part of the story |
| **Plan** | Light touch only — optional quick planning actions, not plan workspace |

Expression depth on Home centers on **Recognition → Orientation**, with light **Understanding**; full Evaluation / Decision / Commitment belong downstream.

---

## Interaction behavior

Aligned with expand-before-navigate and progressive understanding ([Navigation — Interaction Model](../05-navigation.md#interaction-model)).

### Featured-card behavior (Top Opportunities)

The large featured expression is already **high-information**.

Therefore:

* Activating the featured card **navigates directly to Film Detail**.
* It should **not** expand substantially inline.
* The destination should feel like opening the **feature article** from an editorial front page — not entering an unrelated database.

### Secondary-card behavior

Smaller supporting opportunities may use **expand-before-navigate**.

A secondary expression may reveal concise contextual information such as:

* why it is highlighted
* upcoming showtimes
* notable formats or events
* quick planning actions

The user can then continue to **Film Detail** for the complete decision experience.

Exact controls may vary by expression depth, but behavior should remain **predictable**: featured = go deeper off Home; secondary = light inline, then optional navigate.

### Add to Planner

May be available from appropriate **secondary** expressions. Home must **not** become a planning form or optimization workspace ([Planner conceptual behavior](../08-screen-specifications.md#planner); future Planner canonical spec TBD).

---

## Editorial selection principles

* Highlight without hiding — premium attention without erasing the city
* Prioritize rather than remove
* Awareness over engagement
* Context over opinion / taste prediction
* Opportunities drive decision meaning; films summarize identity
* Prominence is earned and eventually explainable (rarity, urgency, presentation, cultural/critical significance, discovery value, exclusivity, limited availability, first/last chances)
* Relevance ≠ recency alone
* Do not invent ranking formulas in implementation from this document

Selection engines and signal pipelines are **future-facing**; early UI must not fabricate them.

---

## Filtering and exploration boundary

**Do not place the full filtering system on Home.**

Home is the editorial briefing, not the comprehensive browsing workspace.

Provide a **strong and deliberate transition** into the reference side of the product.

Approved conceptual transition purpose (label illustrative — final copy open):

> Continue Exploring

or another editorially appropriate label that clearly introduces destinations such as:

* Films / Everything Playing
* Theaters
* Formats and Experiences
* Search / Explore

This specification defines the **purpose** of the transition, not final interface copy.

| Mode | User stance |
|------|-------------|
| **Home** | “Tell me what matters.” |
| **Explore / reference** | “Help me answer my own question.” |

Filtering belongs on deeper exploration surfaces after the user has explicitly changed modes.

**Reconciliation note:** Conceptual Tier 4 in [08](../08-screen-specifications.md) said reference remains accessible via browsing, search, filters, theater pages, and film pages. That remains true as a product principle. This specification **narrows** Home itself: filters live on those destinations, not as Home’s primary chrome.

---

## Continuity across visits

Editorial relevance is **not** synonymous with recency.

A film or opportunity should **not** disappear merely because the user viewed Home yesterday.

Home content may be informed by:

* current cultural significance
* presentation rarity
* event status
* limited availability
* first or last chances
* current Seattle exclusivity
* meaningful changes since the prior visit
* future personalization (emphasis only; citywide landscape preserved)

Balance **stable relevance** with **change awareness**. Continuity supports Time Awareness sessions without turning Home into a novelty-only feed ([Experience model](../12-experience-model.md)).

---

## Relationship to Film Detail and Planner

Approved product narrative:

| Surface | Primary question |
|---------|------------------|
| **Home** | “What deserves my attention?” |
| **Film Detail** | “Should I see this?” |
| **Planner** | “What’s the best movie day I can make?” |

* Home **surfaces** opportunities and establishes interest.
* Film Detail supports **confidence and opportunity comparison**.
* Planner **optimizes logistics** for opportunities the user already cares about.

Home must not duplicate either complete experience.

---

## Loading states

Product-level expectations:

* Show that Home is preparing the briefing without implying total failure.
* Prefer preserving hierarchy (orientation → featured → supporting) as content arrives when practical.
* Do not flash misleading empty “featured” shells that look like editorial scarcity when data is still loading.
* Avoid layout thrash that destroys orientation (implementation detail deferred; principle stands).

---

## Empty or low-content states

* **Valid empty / sparse Seattle week:** explain calm scarcity honestly — not as system failure.
* **Fewer than ~3 earned Top Opportunities:** show fewer; do **not** pad with weak items to fill a quota. Scarcity over filler.
* **Missing section content:** collapse or adapt the region rather than display empty decorative shells.
* **No personalization:** still fully useful via shared Seattle-wide relevance.

---

## Error and stale-data behavior

Aligned with existing data-health principles; **do not define new pipeline behavior** here.

* Home should remain useful when **one source** is stale or unavailable.
* **Valid-empty** source results must not be presented as system failure.
* Prefer partial, honest briefing over a blank error wall when any authoritative subset remains usable.
* Surface freshness / source-health only in ways that support trust — not as a developer console.
* Reference existing pipeline report / freshness concepts in data-foundation docs; do not invent new schemas in this task.

---

## Mobile behavior

* Mobile-first ([Product philosophy](../01-product-philosophy.md)).
* Preserve editorial hierarchy: orientation, scarce featured opportunities, supporting sections, explore transition.
* Featured expressions remain high-information and navigate to Film Detail; do not invent a different product model for small screens.
* Density with breathing room — information-dense without equal-weight clutter ([Editorial design language](../15-editorial-design-language.md)).
* Exact breakpoints and chrome deferred.

---

## Tablet / desktop adaptation

* Same product hierarchy and interaction rules (featured vs secondary).
* Additional width may support clearer editorial rhythm — not a second Home that becomes a filter dashboard or infinite poster wall.
* Do not use extra space to violate scarcity (e.g. stuffing many equal featured items).
* Exact layouts deferred.

---

## Accessibility considerations

Product-level (not a full a11y audit checklist):

* Hierarchy and emphasis must remain understandable without relying on color alone.
* Featured vs secondary behaviors must be operable via keyboard / assistive tech when implemented.
* Imagery is supporting evidence — text and structure carry meaning when artwork is missing ([Editorial design language](../15-editorial-design-language.md)).
* Explainable emphasis: reasons for prominence should be available to users, not only visual weight.
* Detailed WCAG targets and component patterns deferred to later visual/component specs.

---

## Data dependencies

Conceptual dependencies — **not schemas**:

| Dependency | Role on Home | Maturity note |
|------------|--------------|---------------|
| Canonical **Film** identity | Recognition and grouping | Future-facing completeness; must not be fabricated in early UI |
| Current **Opportunities** and showtimes | Decision meaning and timing | Core current data |
| **Theater** identity | Place / programming stories | Core current data |
| Presentation and event attributes | Rarity, formats, Q&A, etc. | Partial / evolving by source |
| Urgency and availability signals | Leaving, one-night, limited | Partial; do not invent engines |
| Cultural relevance signals | Editorial significance | Future-facing |
| Pipeline freshness / source health | Trust and partial-degrade behavior | Existing pipeline artifacts |
| Optional personalization signals | Emphasis only | Future-facing |

Early UI implementation must **not** fabricate missing signal engines, cultural graphs, or identity resolution. Prefer honest shared Seattle relevance with graceful degradation.

---

## Future enhancements

*(Not in scope for early implementation.)*

* Full explainable selection / signal engine
* Preference-aware prioritization (membership, favorites, dismissed films)
* Richer change-awareness storytelling between visits
* Notifications / newsletters tied to Home-worthy moments
* Canonical [Planner](./planner.md) exists (D-19); Theater canonical spec still future
* Stage 2 direct plan sculpting approved in product spec — not marked shipped on public Planner
* Component mappings for featured vs secondary expressions
* Final explore-destination information architecture

---

## Explicit non-goals

This specification does **not**:

* Choose exact typography, colors, or pixel dimensions
* Define production component APIs
* Define ranking formulas or build the signal engine
* Lock final editorial copy (including the explore transition label)
* Implement the page or change production UI
* Resolve canonical film identity
* Redesign navigation globally
* Place full filtering on Home
* Turn Home into Film Detail, Planner, ticketing, or a streaming catalog

---

## Open questions

| Topic | Status |
|-------|--------|
| Exact supporting-section inventory beyond Top Opportunities | Open — PO + ChatGPT |
| Final label for explore transition (“Continue Exploring” vs alternatives) | Open — purpose fixed |
| How strongly change-awareness appears in orientation vs supporting sections | Open |
| Precise rules for when secondary expand offers Add to Planner | Open |
| How many supporting items per section before “see explore” | Open — scarcity principle applies |
| Relationship of lenses to Top Opportunities selection | Deferred with Discovery lens catalog |
| Artwork / poster treatment details | → [Editorial design language](../15-editorial-design-language.md) / future visual language |
| Canonical Film Detail and Planner specs | Future D-tasks |

---

## Spec format note (for subsequent screen specs)

This document establishes the **screen-specification format** for Reel Seattle v2: status/authority, purpose, questions, hierarchy, regions, entity expression, interactions, states, data dependencies, non-goals, and open questions — implementation-independent.

Subsequent canonical specs (Film Detail, Planner, Theater, etc.) should follow the same pattern under `docs/v2/specs/`.
