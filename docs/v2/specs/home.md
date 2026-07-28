# Home — Canonical Screen Specification

**Status:** Canonical product specification (D-17); reconciled with Home Design Review v3 (D-22)  
**Authority:** Authoritative for Home product behavior  
**Supersedes for Home implementation decisions:** Conceptual Home section in [08 — Screen specifications](../08-screen-specifications.md) where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Film Detail](./film-detail.md) · [Canonical Planner](./planner.md) · [Canonical Theater](./theater.md) · [Discovery model](../03-discovery-model.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Experience model](../12-experience-model.md) · [Editorial design language](../15-editorial-design-language.md) · [Entity expression](../16-entity-expression.md) · [Opportunity model](../10-opportunity-model.md) · [Film lifecycle](../11-film-lifecycle.md) · [Context & significance](../13-context-and-significance.md)

---

## Status and authority

This document is the **canonical product specification for Home** in Reel Seattle v2.

It governs:

* product purpose and role
* information hierarchy
* behavior, states, and interaction rules

It is **implementation-independent**. It does **not** prescribe:

* exact pixels, CSS, typography, or colors
* component architecture or production APIs
* implementation technology
* carousel library choice or exact gesture mechanics

**Written specifications are authoritative.** Design-review imagery (including Home Design Review v3) is **supporting evidence**, not the source of truth. Imagery does not override this document.

Conceptual philosophy in [08 — Screen specifications](../08-screen-specifications.md) remains useful background. Where that document and this one diverge on Home behavior, **this specification wins**.

Cursor must implement agreed specifications; it must not invent Home UX to fill gaps ([Development operating model](../../development-operating-model.md#v2-product-design-workflow)).

**D-22 note:** This specification was reconciled with the approved Home Design Review v3 direction. The defining presentation change is **full-width, one-opportunity-at-a-time Top Opportunities**, plus approved supporting editorial regions and a darker cinematic mood at the product-intent level.

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
| **Secondary — light planning** | Optional quick actions and a clear Planner entry — not a planning workspace or constraint form |

Home is **not** a comprehensive filtering surface.

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
* A Netflix-style poster strip

---

## Visual and emotional direction

Approved product-level mood (Home Design Review v3):

* **dark**
* **cinematic**
* **editorial**
* **grand**
* **selective**
* **calm rather than busy**
* visually distinct from a generic streaming catalog

This is **product intent**, not a color system or styling token list.

Capture:

* cinematic imagery should create **emotional significance**
* featured opportunities should feel like **singular experiences**
* hierarchy should communicate **editorial judgment**
* darker presentation may support cinematic mood, but **accessibility and readable contrast remain mandatory**

Do **not** treat this section as exact colors, typography, or component styling.

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
| **Film Detail** | Investigate a film / opportunity after notice (Top Opportunity tap or secondary continue) |
| **Theater** | Explore a venue’s identity and programming ([canonical Theater](./theater.md)) |
| **Planner** | Begin a movie day (Stage 1) or carry light planning intent ([canonical Planner](./planner.md)) |
| **Explore / reference destinations** | Answer a self-directed question with browse/filter (see Explore More) |
| **Search** | Recognition-led find (when available; may live in global navigation) |

Home surfaces interest; it does not duplicate Film Detail’s full decision experience, Theater’s venue profile, or Planner’s optimization workflow.

---

## Information hierarchy

Approved high-level hierarchy (product order of attention — not a locked pixel layout):

1. **Editorial orientation** — situate the user in Seattle cinema *now*
2. **Full-width, one-at-a-time Top Opportunity** — the defining featured presentation
3. **Supporting awareness** such as **Opening This Week**
4. **Time-sensitive** section such as **Leaving Soon**
5. **Build a Movie Day** / Planner entry
6. **Explore More** — deliberate transition from editorial briefing to comprehensive exploration
7. **Global navigation and reference destinations** — browse/filter *after* leaving Home’s editorial mode

Exact supporting-section order may remain open where product has not finalized it. Top Opportunities’ one-at-a-time treatment is **not** open — it is approved canonical behavior.

This maps conceptually to earlier attention tiers (high urgency / newly relevant / ongoing / reference) without requiring those tier labels in the UI ([08](../08-screen-specifications.md)).

---

## Major content regions

### 1. Editorial orientation

Brief framing that answers: *What is the state of Seattle cinema right now?* May include change awareness when meaningful. Must not overwhelm or become a news ticker of every update.

### 2. Top Opportunities

Full-width, one-at-a-time featured presentation of a small curated set (rules below). This is the defining Home presentation.

### 3. Opening This Week

Supporting awareness of meaningful new arrivals (approved conceptual region — final copy open).

### 4. Leaving Soon

Time-sensitive opportunities that require action soon (approved conceptual region — final copy open).

### 5. Build a Movie Day

Clear editorial entry into Planner Stage 1 (approved conceptual region — final copy open).

### 6. Explore More

Deliberate transition from curated briefing to user-directed discovery (approved conceptual region — final label open).

### 7. Beyond Home (not Home filter chrome)

Films / Everything Playing, Theaters, Formats and Experiences, Collections, Search / Explore, Planner — **reference and planning destinations**, not Home’s comprehensive filter UI.

These supporting regions are **approved conceptual regions**, not necessarily final copy or an exhaustive section inventory. Additional selective supporting sections may appear later without flattening hierarchy.

---

## Top Opportunities

### Defining presentation (approved v3)

Top Opportunities must be presented as:

* **full-width** within the active content area
* **one opportunity at a time**
* **visually dominant**
* **scarce and intentionally curated**

The section must **not** become:

* a row of equally weighted poster cards
* a Netflix-style strip
* a multi-column grid of featured items
* an infinite carousel

### Why this treatment is essential

Full-width, one-at-a-time presentation is **not incidental decoration**. It is essential because it:

* makes the opportunity feel **singular**
* preserves **editorial scarcity**
* gives artwork and context **enough space**
* prevents neighboring items from competing equally
* distinguishes Reel Seattle from a **generic film catalog**

### Editorial scarcity

* Default conceptual target: approximately **three** featured opportunities
* Upper editorial ceiling: approximately **five** — an editorial limit, not a hard technical constraint
* Users intentionally move between stories
* Restrained pagination or navigation communicates that a **small, finite** number of additional stories exist
* Each opportunity receives enough room for cinematic artwork, title, venue, timing, and a concise editorial reason
* Prominence should communicate that each item **earned its place**
* Selection must eventually be **explainable** through opportunity, cultural, urgency, and personal signals — not opaque recommendation logic ([Context & significance](../13-context-and-significance.md), [Discovery model](../03-discovery-model.md))

Films remain the identity users recognize; reasons to care remain rooted in **opportunities** ([Core concepts](../02-core-concepts.md), [Entity expression](../16-entity-expression.md)).

### Featured opportunity content

The active Top Opportunity should conceptually support:

* cinematic artwork
* film title
* theater
* date or relative timing
* format or event context where relevant
* one concise, **explainable** reason for prominence
* finite-position context such as “1 of 3” where appropriate

Do **not** lock exact fields or layout.

Do **not** fabricate signals during early implementation.

Content should **degrade gracefully** when some metadata is unavailable.

### Featured-card behavior

* Activating the featured opportunity **navigates directly to Film Detail**
* There is **no substantial inline expansion** for the active featured item
* Preserve the opportunity context that caused the user to open Film Detail
* The destination should feel like opening the **feature article** / **cover story** from an editorial front page — not entering an unrelated database

---

## Supporting Home sections

### Opening This Week

**Purpose:**

* surface meaningful new arrivals
* broaden awareness beyond Top Opportunities
* help users recognize fresh additions without making Home a novelty-only feed

**Rules:**

* do not imply every new film deserves equal prominence
* keep hierarchy **below** Top Opportunities
* allow concise film expressions
* route to Film Detail or deeper browsing as appropriate

### Leaving Soon

**Purpose:**

* surface time-sensitive opportunities
* reduce FOMO
* help users understand which films or presentations require action soon

**Rules:**

* urgency must be **data-backed**
* stale or incomplete data must not produce overconfident claims
* absence of a leaving-soon signal must **not** imply indefinite availability
* the section may **collapse** when no defensible items exist

**Data note:** A `leaving_soon_current` artifact exists as review-only pipeline output and is **not shipped** to the public site today ([Data artifact inventory](../../data-artifact-inventory.md)). Treat Leaving Soon presentation as **partial / gated** until product and data gates allow shipping.

### Build a Movie Day

**Purpose:**

* provide a clear editorial entry into Planner
* make planning feel like building an experience, not filling out a form

**Rules:**

* Home does **not** host the full constraint builder
* the action transitions to **Planner Stage 1** ([canonical Planner](./planner.md))
* when launched from an opportunity, preserve required, preferred, or fixed-showtime intent as appropriate
* when launched generally, begin with an open single-day planning flow

### Explore More

This is the deliberate transition from editorial briefing to comprehensive exploration ([canonical Explore / Search](./explore-search.md)).

It should conceptually provide routes to:

* Films / Everything Playing
* Theaters
* Formats and Experiences
* Collections
* Search
* Planner where appropriate

Exact label remains open (illustrative: “Explore More”, “Continue Exploring”).

The section should communicate:

* everything above was **curated**
* everything below leads into **user-directed discovery**

No comprehensive filters should appear directly on Home.

No global search bar is required inside the Home content area if global navigation already provides search access.

| Mode | User stance |
|------|-------------|
| **Home** | “Tell me what matters.” |
| **Explore / reference** | “Help me answer my own question.” |

**Reconciliation note:** Conceptual Tier 4 in [08](../08-screen-specifications.md) said reference remains accessible via browsing, search, filters, theater pages, and film pages. That remains true as a product principle. This specification **narrows** Home itself: filters live on those destinations, not as Home’s primary chrome.

---

## Entity expressions used

On Home, entities emphasize awareness facets ([Entity expression](../16-entity-expression.md)):

| Entity | Home emphasis |
|--------|----------------|
| **Film** | Significance, rarity, editorial importance |
| **Opportunity** | Significance — why this chance deserves attention now |
| **Theater** | Destination / programming identity when place is part of the story |
| **Plan** | Light touch only — Build a Movie Day and optional quick planning actions, not plan workspace |

Expression depth on Home centers on **Recognition → Orientation**, with light **Understanding**; full Evaluation / Decision / Commitment belong downstream.

---

## Interaction behavior

Aligned with expand-before-navigate and progressive understanding ([Navigation — Interaction Model](../05-navigation.md#interaction-model)).

### Top Opportunities navigation

Users intentionally move between the small set of featured stories:

* restrained pagination, previous/next, selectors, and/or swipe (exact controls open)
* only one opportunity dominates at a time
* selecting another opportunity **replaces** the active story
* finite-set indication (e.g. position of total) when appropriate

### Featured vs secondary

| Expression | Behavior |
|------------|----------|
| **Top Opportunity (featured)** | Direct navigation to Film Detail; no substantial inline expansion |
| **Secondary / supporting** | May expand-before-navigate; then optional Film Detail |

A secondary expression may reveal concise contextual information such as:

* why it is highlighted
* notable showtimes
* format
* event or urgency context
* quick planning action

Film Detail remains the deep destination.

Exact controls may vary by expression depth, but behavior should remain **predictable**: featured = go deeper off Home; secondary = light inline, then optional navigate.

### Approved routing behavior

| From Home | Typical destination |
|-----------|---------------------|
| Top Opportunity | **Film Detail** (preserve opportunity context) |
| Theater-oriented discovery | **Theater** |
| Build a Movie Day / Planner CTA | **Planner Stage 1** |
| Supporting film opportunity | Inline context where appropriate, then **Film Detail** |
| Explore More | Reference and browsing surfaces |

### Planner handoff

Home may pass planning intent at different levels:

* **required film**
* **preferred film**
* **fixed showtime**

Preserve this distinction in product behavior.

Do **not** finalize exact interface copy.

Do **not** imply that every Home expression must expose all three options simultaneously.

Product-level guidance:

* quick actions should remain **subordinate** to editorial reading
* intent should be **preserved** when the user chooses to plan
* Home itself must **not** become a constraint form ([canonical Planner](./planner.md))

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

Before a signal engine exists, Home may use honest, explainable, manually curated or rule-light prominence — still scarce, still one-at-a-time — without claiming algorithmic judgment it does not have.

---

## Continuity across visits

**Relevance is not the same as recency.**

A featured opportunity may remain prominent across multiple visits while it is still culturally, locally, or practically relevant.

Do **not** remove important opportunities merely because the user saw them yesterday.

Home may layer change awareness through:

* new additions
* leaving-soon items
* last chances
* schedule changes
* future personalization

Balance **stable relevance** with **change awareness**. Continuity supports Time Awareness sessions without turning Home into a novelty-only feed ([Experience model](../12-experience-model.md)).

---

## Relationship to other surfaces

Approved product narrative:

| Surface | Primary question |
|---------|------------------|
| **Home** | “What deserves my attention?” |
| **Film Detail** | “Should I see this?” ([canonical Film Detail](./film-detail.md)) |
| **Planner** | “What’s the best movie day I can make?” ([canonical Planner](./planner.md)) |
| **Theater** | “What is distinctive about seeing movies here, and what can I see here now?” ([canonical Theater](./theater.md)) |

* Home **surfaces** opportunities and establishes interest.
* Film Detail supports **confidence and opportunity comparison**.
* Planner **optimizes logistics** for opportunities the user already cares about.
* Theater provides **venue identity and that venue’s program**.

Home must not duplicate any of those complete experiences.

---

## Loading states

Product-level expectations:

* Preserve hierarchy (orientation → featured → supporting) as content arrives when practical.
* Avoid flashing **multiple equal placeholders** in Top Opportunities.
* Represent **one active featured story skeleton** at a time.
* Do not flash misleading empty “featured” shells that look like editorial scarcity when data is still loading.
* Avoid layout thrash that destroys orientation (implementation detail deferred; principle stands).

---

## Empty, sparse, and adaptive states

* **No supported Top Opportunities:** do not fabricate prominence; adapt the opening section; route users toward Opening This Week, Explore More, or other useful editorial areas.
* **Only one Top Opportunity:** present it confidently **without** misleading carousel controls that imply additional stories.
* **Fewer than ~3 earned Top Opportunities:** show fewer; do **not** pad with weak items to fill a quota. Scarcity over filler.
* **No Opening This Week or Leaving Soon:** collapse the section cleanly; do not show empty shells.
* **Valid empty / sparse Seattle week:** explain calm scarcity honestly — not as system failure.
* **Missing artwork:** use poster, neutral visual treatment, or typography-led fallback; **preserve the full-width editorial hierarchy**.
* **No personalization:** still fully useful via shared Seattle-wide relevance.

---

## Error and stale-data behavior

Aligned with existing data-health principles; **do not define new pipeline behavior** here.

* Prefer keeping **non-affected sections** useful; use non-blocking recovery where possible.
* Home should remain useful when **one source** is stale or unavailable.
* **Valid-empty** source results must not be presented as system failure.
* Prefer partial, honest briefing over a blank error wall when any authoritative subset remains usable.
* Avoid overconfident urgency or recommendation language when data is stale or partial.
* Surface freshness / source-health only in ways that support trust — not as a developer console.
* Reference existing pipeline report / freshness concepts in data-foundation docs; do not invent new schemas in this task.

---

## Mobile behavior

Mobile is the primary design target.

On mobile:

* **one Top Opportunity** should occupy essentially the **full content width**
* only the **active** opportunity should read as the primary story
* a **minimal glimpse** of the next item may be allowed solely as a discoverability affordance
* the next item must **not** be visually strong enough to compete with the active one
* touch gestures and explicit controls should **both** be considered
* pagination should indicate a **small, finite** set
* tapping the active featured opportunity navigates **directly to Film Detail**
* there is **no substantial inline expansion** for the active featured item

The feature should feel like moving between **editorial cover stories**, not browsing a poster strip.

Preserve editorial hierarchy: orientation, scarce featured opportunity, supporting sections, Build a Movie Day, Explore More.

---

## Tablet and desktop adaptation

Desktop and tablet must preserve the **same one-story-at-a-time principle**.

Do **not** translate Top Opportunities into three equal cards.

A larger viewport may support:

* a wider cinematic hero
* restrained thumbnail, title, or numbered selectors
* previous and next controls
* supporting navigation beside the active hero

However:

* **only one opportunity should dominate**
* secondary selectors must remain **subordinate**
* selecting another opportunity **replaces** the active story
* the desktop version must preserve the **same editorial hierarchy** as mobile

Additional width may support clearer editorial rhythm — not a second Home that becomes a filter dashboard or infinite poster wall.

---

## Accessibility considerations

Product-level expectations for the approved Top Opportunities interaction:

* carousel / story controls must be **keyboard accessible**
* swipe must **not** be the only navigation method
* active position and total count should be conveyed accessibly when a multi-story set exists
* focus must move **predictably**
* **auto-rotation should be avoided** or fully controllable if ever considered
* **reduced-motion** preferences must be respected
* overlaid text must maintain **readable contrast** (including over dark cinematic imagery)
* artwork must not carry essential information without text
* card labels and Film Detail destination must be understandable to screen readers
* hierarchy and emphasis must remain understandable without relying on color alone
* Featured vs secondary behaviors must be operable via assistive tech when implemented

Do **not** prescribe implementation details. Detailed WCAG targets and component patterns deferred to later visual/component specs.

---

## Data dependencies

Conceptual dependencies — **not schemas**. Classification uses repository evidence.

| Dependency | Role on Home | Classification |
|------------|--------------|----------------|
| Film titles | Recognition | **Currently available** |
| Poster artwork | Featured / supporting imagery | **Currently available** (portrait posters; not landscape hero art) |
| Runtimes | Supporting context where shown | **Currently available** where present |
| Theater identity | Venue in featured/supporting expressions | **Currently available** |
| Showtimes / opportunities | Timing and decision meaning | **Currently available** |
| Pipeline freshness / source health | Trust and partial-degrade behavior | **Currently available** |
| Format / presentation attributes | Rarity and event context | **Partial** (source-dependent; often sparse) |
| Ticket URLs | Downstream action (usually via Film Detail / Opportunity scaffold) | **Available when present** (nullable; live Home Top Opportunity has no ticket CTA by design) |
| Parent / variant film grouping | Cleaner recognition | **Partial** |
| Leaving-soon urgency | Leaving Soon section | **Partial** (review-only artifact exists; not shipped to Pages) |
| Consistent multi-source coverage | Citywide briefing confidence | **Partial** |
| Canonical film identity | Stable recognition across sources | **Future-facing** |
| Landscape / cinematic hero artwork | Full-bleed featured mood | **Future-facing** |
| Cultural / critical significance signals | Explainable prominence | **Future-facing** |
| Explainable Home relevance / signal engine | Selection and reasons | **Future-facing** |
| Experiential descriptors | Richer opportunity stories | **Future-facing** |
| Richer opportunity identity | Distinct presentation stories | **Future-facing** |
| Personalization | Emphasis only; citywide landscape preserved | **Future-facing** |

Early UI implementation must **not** fabricate missing signal engines, cultural graphs, landscape art, or identity resolution. Prefer honest shared Seattle relevance with graceful degradation.

Do **not** mark Home implementation, signal ranking, or landscape-art ingestion as complete.

---

## Future enhancements

*(Not in scope for early implementation.)*

* Full explainable selection / signal engine
* Preference-aware prioritization (membership, favorites, dismissed films)
* Richer change-awareness storytelling between visits
* Notifications / newsletters tied to Home-worthy moments
* Landscape artwork ingestion and rights
* Shipped Leaving Soon product surface (gated by data + product readiness)
* Component mappings for featured vs secondary expressions
* Final explore-destination information architecture

Canonical [Film Detail](./film-detail.md), [Planner](./planner.md), and [Theater](./theater.md) already exist as destination specs.

---

## Explicit non-goals

This specification does **not**:

* Implement Home or change current public-site behavior
* Choose exact carousel library or gesture mechanics
* Require or specify autoplay / auto-rotation
* Define ranking formulas or build the signal engine
* Resolve canonical film identity
* Choose exact colors, typography, or dimensions
* Lock final section labels or interface copy
* Place comprehensive filtering on Home
* Redesign global navigation
* Build Film Detail, Planner, or Theater
* Mark Home UI, ranking, or landscape-art ingestion as complete

---

## Open questions

| Topic | Status |
|-------|--------|
| Exact number of Top Opportunities under different data conditions | Open — scarcity principle and ~3 / ~5 guidance apply |
| Whether a minimal next-card peek is desirable on mobile | Open — peek allowed only as weak discoverability affordance |
| Selector treatment on desktop (thumbnails, numbers, titles) | Open — must remain subordinate |
| Whether manual arrows and swipe are both shown on mobile | Open — both methods should be considered; swipe not sole method |
| Final Explore More label and iconography | Open — purpose fixed |
| Exact ordering of Opening This Week and Leaving Soon | Open — both below Top Opportunities |
| Initial explainable reasons displayed on featured opportunities | Open — must remain honest; no fabricated signals |
| How Home behaves before a signal engine exists | Open in detail; principle: scarce, explainable, non-fabricated curation |
| Whether Top Opportunities can feature a theater or event rather than only a film-centered opportunity | Open |
| Future personalization without weakening shared editorial judgment | Open — philosophy in Discovery / Experience models |
| How strongly change-awareness appears in orientation vs supporting sections | Open |
| Precise rules for when secondary expand offers Add to Planner | Open |
| How many supporting items per section before “see explore” | Open — scarcity principle applies |
| Relationship of lenses to Top Opportunities selection | Deferred with Discovery lens catalog |

---

## Spec format note (for subsequent screen specs)

This document established the **screen-specification format** for Reel Seattle v2: status/authority, purpose, questions, hierarchy, regions, entity expression, interactions, states, data dependencies, non-goals, and open questions — implementation-independent.

Subsequent canonical specs (Film Detail, Planner, Theater, etc.) follow the same pattern under `docs/v2/specs/`.
