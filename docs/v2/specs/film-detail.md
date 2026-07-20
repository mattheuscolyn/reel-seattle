# Film Detail — Canonical Screen Specification

**Status:** Canonical product specification (D-18)  
**Authority:** Authoritative for Film Detail product behavior  
**Supersedes for Film Detail implementation decisions:** Conceptual Film Detail section in [08 — Screen specifications](../08-screen-specifications.md) where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Home](./home.md) · [Discovery model](../03-discovery-model.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Opportunity model](../10-opportunity-model.md) · [Film lifecycle](../11-film-lifecycle.md) · [Experience model](../12-experience-model.md) · [Editorial design language](../15-editorial-design-language.md) · [Entity expression](../16-entity-expression.md) · [Context & significance](../13-context-and-significance.md) · [Film identity normalization](../../film-identity-normalization.md) · [Data foundation roadmap — film identity](../../data-foundation-roadmap.md#planned-film-identity-and-enrichment)

---

## Status and authority

This document is the **canonical product specification for Film Detail** in Reel Seattle v2.

It governs:

* product behavior and responsibilities
* information hierarchy
* states
* interaction rules

It does **not** prescribe:

* exact pixels, CSS, typography tokens, or final colors
* component architecture or production APIs
* implementation technology

**Written specifications are authoritative.** Visual design-review images (if retained later) are supporting references only; they do not override this document.

Conceptual philosophy in [08 — Screen specifications](../08-screen-specifications.md) remains useful background. Where that document and this one diverge on Film Detail behavior, **this specification wins**.

Cursor must implement agreed specifications; it must not invent Film Detail UX to fill gaps ([Development operating model](../../development-operating-model.md#v2-product-design-workflow)).

---

## Purpose

Film Detail is a **decision-support experience**, not a movie-database record.

It combines:

* cultural and contextual significance
* what the film is and what it feels like
* the best current Seattle opportunity (when defensible)
* all available Seattle showtimes
* clear next actions

Users arrive after choosing to investigate a film. Film Detail helps them reach confidence — attend, plan, defer, or knowingly pass ([Core concepts](../02-core-concepts.md)).

---

## Primary user question

> “Should I see this?”

Supporting questions (secondary):

* What is this film?
* Why might it be worth attention (culturally or practically)?
* What is the best current Seattle way to see it?
* What other showtimes and presentations exist?
* What should I do next (save, plan, ticket, pass)?

**Reconciliation note:** Conceptual D-11 framed Film Detail as “Why is this worth considering, and what is the best way to experience it?” ([08](../08-screen-specifications.md)). That remains the *substance* of the decision. The **approved central question** for this canonical spec is the shorter decision form: **“Should I see this?”**

---

## Product role

Approved product narrative:

| Surface | Primary question |
|---------|------------------|
| **Home** | “What deserves my attention?” ([canonical Home](./home.md)) |
| **Film Detail** | “Should I see this?” |
| **Planner** | “What’s the best movie day I can make?” |

The transition from a featured Home opportunity to Film Detail should feel like opening the **feature article** from an editorial front page — not entering an unrelated database ([canonical Home](./home.md)).

Film Detail should **preserve**:

* the film’s identity
* the opportunity context that caused the user to open it (when available)

Context may change **emphasis**, not underlying truth ([Entity expression](../16-entity-expression.md)).

Film Detail sits at the **comparison** layer of IA, with **reference** depth available on demand ([Information architecture](../04-information-architecture.md)). It supports Decision and Research session intents ([Experience model](../12-experience-model.md)).

---

## Entry points

Representative entries (conceptual — not route inventory):

* Featured Home opportunity
* Secondary Home opportunity
* Explore / Search result
* Theater page
* Format or Experience hub
* Collection
* Shared link
* Saved item
* Planner candidate or committed plan

### Entry-context emphasis examples

| Entry | Initial emphasis may favor |
|-------|----------------------------|
| 70mm (or other rare format) feature from Home | That presentation opportunity |
| Theater page | Venue context among opportunities |
| Planner | Selected showing and feasible alternatives |
| Generic search / explore | Film identity first, then Seattle opportunities |

Entry context reframes what leads. It does not invent alternate film identities or hide alternatives.

---

## Exit paths

Representative exits:

| Destination | Why |
|-------------|-----|
| **Back** to prior context | Preserve orientation (Home, Theater, Explore, Planner) |
| **Planner** | Required / preferred film or specific showtime as planning input |
| **Tickets** (external) | Act on a chosen opportunity via source ticket URL |
| **Theater** | Deepen venue identity |
| **Related / reference destinations** | Collections, filmmaker, related films (when available) |
| **Share** | Film or specific opportunity |

Film Detail must not become the full planning optimizer ([08 — Planner](../08-screen-specifications.md#planner); future Planner canonical spec TBD).

---

## Information hierarchy

Approved decision flow (order of understanding — not a locked visual layout):

1. **Cinematic film identity and orientation**
2. **“Why see it” evidence**
3. **“What it’s about”**
4. **Best Opportunity**
5. **All Showtimes**
6. **Deeper reference information and related exploration**
7. **Planning, saving, sharing, and ticketing actions** as appropriate

Exact visual arrangement may adapt by viewport; this **decision sequence** should remain intact.

**Reconciliation note:** Conceptual D-11 hierarchy was identity → why it matters → opportunities → supporting context → reference. This canonical hierarchy **narrows and names** the decision sections (Why see it, What it’s about, Best Opportunity, All Showtimes) while keeping reference below decision-oriented material.

---

## Major content regions

### 1. Cinematic hero (identity and orientation)

The opening expression should:

* establish the film immediately
* feel cinematic and editorial ([Editorial design language](../15-editorial-design-language.md))
* use landscape or backdrop imagery when reliable imagery is available
* support graceful degradation to poster art, neutral artwork, or typography-led presentation
* include essential identity facts without becoming a dense metadata header

Conceptual identity facts may include (not a locked field list):

* exact display title
* release year
* runtime
* rating or content classification where available
* broad genre or experience labels
* relevant format or presentation context when the user entered through a specific opportunity

The hero is already a **high-information** expression. Film Detail itself is the expanded destination; it should **not** require another large introductory expansion before becoming useful.

### 2. “Why see it”

Working section title: **Why see it** (final interface copy subject to later editorial review).

This is a **structured, evidence-based** section — not a required AI-written editorial essay.

**Purpose:** help the user rapidly understand what makes the film or its current Seattle availability worth attention.

#### Durable film signals (illustrative)

* Major awards or nominations
* Festival recognition
* Canonical polls or rankings
* Preservation or registry status
* Notable collections
* Critical or historical recognition
* Filmmaker-related significance
* Other curated cultural datasets

#### Dynamic Seattle opportunity signals (illustrative)

* Rare presentation format
* Exclusive venue
* Limited run
* First or last chance
* One-night event
* Q&A or live component
* Restoration or special cut
* Remaining-performance scarcity
* Current availability or urgency
* Future personalization

#### Rules

* Present concise, **explainable** evidence
* Do **not** imply handcrafted prose exists for every film
* Do **not** require AI-generated summaries
* AI-written synthesis may be a **future** enhancement; structured signals must remain sufficient alone
* Do **not** pretend every film is culturally exceptional
* A film may have only practical or availability-oriented signals
* Signal provenance should be supportable conceptually (detailed attribution UI deferred)
* Internal relevance ranking may combine signals, but the interface should expose **understandable reasons**, not only an opaque score
* Align with context-over-taste-recommendation ([Context & significance](../13-context-and-significance.md))

### 3. “What it’s about”

Helps users judge **personal interest**.

May combine:

* concise synopsis
* experiential descriptors
* themes, tone, pacing, genre
* audience-fit information
* runtime and practical commitment

Experiential descriptors (e.g. “mind-bending,” “slow-paced,” “funny,” “intense,” “visually iconic”) may be useful, but:

* they must be sourced, curated, or otherwise defensible
* early implementation must **not** fabricate them
* this specification does **not** define a generation pipeline

The section should help answer both:

* What happens?
* What kind of viewing experience is this?

### 4. Best Opportunity

**Best Opportunity** is a central Reel Seattle concept.

It answers:

> “If I decide to see this film, which current Seattle opportunity should I choose?”

#### Requirements

* Surface **one clearly preferred** current opportunity when sufficient evidence exists
* **Explain why** it is preferred
* Remain **advisory**, not exclusive
* **Never hide** the complete set of alternatives
* Preserve user control
* **Degrade gracefully** when no defensible recommendation can be made

#### Possible reasons (illustrative — not a formula)

* Superior or rarer presentation format
* Filmmaker-intended or premium presentation
* Special event or Q&A
* Venue exclusivity
* Limited availability
* Best remaining schedule
* Accessibility or language fit
* Convenience
* Price or membership fit
* Future personalization

Do **not** define a final ranking formula. Do **not** assume the technically highest-spec format is always best.

Where ranking evidence is incomplete, use **neutral language** (e.g. featured or notable opportunity) rather than claiming objective superiority.

### 5. All Showtimes

Below Best Opportunity, users must inspect **all relevant current Seattle showtimes** without leaving the film context.

Conceptually support:

* theater
* local date and time
* presentation format
* event or accessibility attributes
* ticket availability or status
* source or ticket link
* comparison between venues and presentations
* useful **film-specific** filtering where appropriate

#### Film-specific filtering (appropriate here)

Unlike Home’s editorial briefing ([canonical Home](./home.md)), Film Detail filtering is **within one film’s opportunities**.

Potential filters (not a locked inventory):

* date
* theater
* format
* event type
* accessibility
* language
* availability status

### 6. Deeper reference and related exploration

May include cast and crew, director, release year, country, language, runtime, rating, reviews or rating summaries, trailer, background, related films, collections, filmmaker pages, restoration or version notes.

Reference must remain available **without** outranking decision-oriented sections. Avoid an IMDb-style reference-first hierarchy.

### 7. Actions

Planning, saving, sharing, and ticketing as appropriate (see Interaction behavior and Planner relationship).

---

## Film vs Opportunity

Preserve the product distinction ([Core concepts](../02-core-concepts.md), [Opportunity model](../10-opportunity-model.md), [Entity expression](../16-entity-expression.md)):

| Concept | Meaning |
|---------|---------|
| **Film** | Stable cultural work / identity users recognize |
| **Opportunity** | Specific Seattle way to experience that film — presentation + venue + time context |

Film Detail is **film-centered** but **opportunity-aware**.

Must **not** collapse:

* a film into a single showtime
* all presentations into one interchangeable listing
* source-specific records into assumed canonical identity without adequate confidence

Urgency belongs to opportunities, not film identity as such ([Film lifecycle](../11-film-lifecycle.md)).

---

## Entity expressions used

| Entity | Film Detail emphasis |
|--------|----------------------|
| **Film** | Complete understanding — context, synopsis, creators, significance |
| **Opportunity** | Viewing choices, comparison, Best Opportunity vs alternatives |
| **Theater** | Viewing opportunity — where/how this film can be seen |
| **Plan** | Transition to commitment — film or showtime as planning input |

Expression depth spans Understanding → Evaluation → Decision, with Commitment beginning via Planner handoff ([Entity expression](../16-entity-expression.md)).

---

## Interaction behavior

Product-level rules (aligned with [Navigation — Interaction Model](../05-navigation.md#interaction-model)):

* **Back navigation** preserves prior context whenever practical
* **Save / bookmark** the film
* **Add to Planner** may distinguish (wording not locked; not all required in first implementation):
  * film as required
  * film as preferred
  * specific showtime
  * save for later
* **Share** film or specific opportunity
* **Open ticket links** for a chosen opportunity
* **Switch** between Best Opportunity and All Showtimes
* **Expand** deeper reference within the page
* **Compare** relevant opportunities without leaving film context

**Progressive disclosure:** Film Detail is already the deep destination. Prefer disclosure **within the page** over unnecessary additional page changes. Smaller upstream expressions may expand before navigation; this screen should not demand another large intro expand before usefulness.

---

## Planner relationship

A user who decides “yes, I should see this” should have a clear route to:

* save the film
* add it as required or preferred Planner input
* add a specific showtime
* inspect Best Opportunity
* proceed to tickets when ready

Film Detail **supports the transition** from deciding to planning. It is **not** the logistics optimizer.

---

## Canonical identity and signal-engine dependency

Canonical Film identity is a **critical dependency** for cultural signals, clean grouping, and confident Best Opportunity stories across sources.

The signal engine may eventually join:

* source-owned film identifiers
* AMC movie identifiers
* SIFF, Beacon, NWFF, Central Cinema, and other source identities
* IMDb ID, TMDB ID
* Letterboxd slug or other durable references
* curated award, festival, poll, registry, and collection datasets

However:

* this Film Detail spec **does not** design the identity-resolution pipeline
* external IDs are **source evidence**, not casually assumed primary keys
* **title-only matching must not silently merge films**
* remakes, rereleases, alternate cuts, restorations, year-bearing titles, and version differences require cautious handling
* **low-confidence identity must not fabricate cultural signals**

Authoritative roadmap / research:

* [Data foundation roadmap — Planned film identity and enrichment](../../data-foundation-roadmap.md#planned-film-identity-and-enrichment)
* [Film identity normalization](../../film-identity-normalization.md)

Do **not** mark identity resolution, signal ingestion, or Best Opportunity ranking as implemented.

---

## Loading states

* Preserve overall hierarchy
* Avoid excessive layout shift
* Show identity and opportunity areas progressively when possible
* Do not flash false Best Opportunity claims before evidence is ready

---

## Empty, missing, and edge states

| Situation | Expectation |
|-----------|-------------|
| **Missing artwork** | Poster, neutral treatment, or typography-led fallback; do not collapse into a broken shell |
| **No current showtimes** | Film may remain a useful cultural/reference object; clearly distinguish “no current Seattle opportunities” from system failure; offer save / follow / related exploration when supported |
| **Valid-empty source** | Do not label a legitimate empty schedule as pipeline failure |
| **No “Why see it” signals** | Omit or adapt gracefully; do not fabricate significance; still work via synopsis (when available), opportunities, and practical context |
| **No defensible Best Opportunity** | Show all showtimes without claiming a winner; optionally surface neutral notable opportunities when supported |
| **Sold out / nearly sold out** | Preserve opportunity for context; display status clearly; do not recommend unavailable showings without explanation |
| **Past / completed opportunity** | Not actionable; historical context only if broader product later supports it |

---

## Error and stale-data behavior

* Remain useful when one source is stale or unavailable
* Avoid overconfident urgency or Best Opportunity claims under weak data
* Reflect data-health limitations appropriately
* Prefer partial honest decision support over a blank failure wall
* **Do not** define new stale-preservation pipeline behavior in this task — reference existing data-foundation / pipeline-report principles

---

## Mobile behavior

Mobile is the **primary** design target ([Product philosophy](../01-product-philosophy.md)).

* Preserve the decision sequence
* Keep the cinematic opening
* Favor single-column progressive disclosure
* Keep primary actions accessible without permanently obscuring content
* Make showtime comparison usable without dense desktop-style tables

---

## Tablet / desktop adaptation

Same hierarchy and product rules. Possible adaptations:

* wider hero treatment
* two-column relationships between editorial context and opportunities
* persistent opportunity summary
* broader comparison views

Do **not** turn desktop into a fundamentally different product (e.g. IMDb-first reference dump).

---

## Accessibility

Product-level expectations:

* Readable contrast over cinematic imagery
* Non-image title and identity text
* Descriptive alternative text for meaningful artwork
* No signal conveyed by color alone
* Accessible labels for format, urgency, sold-out status, and recommendations
* Keyboard navigation on desktop
* Screen-reader-friendly hierarchy
* Touch targets suitable for mobile
* Reduced-motion behavior
* Clear distinction between film-level and showtime-level actions
* Understandable recommendation explanations

Detailed WCAG targets and component patterns deferred to later visual/component specs.

---

## Data dependencies

Conceptual only — **not schemas**. Classification uses repository evidence (current `showtimes_current` / theater artifacts, pipeline health docs, and planned identity work).

| Dependency | Role | Maturity |
|------------|------|----------|
| Title, runtime, poster URL | Identity / hero fallback | **Currently available** (coverage varies) |
| Current showtimes (date, time, theater, source) | All Showtimes | **Currently available** |
| Theater identity (id, name, city, type) | Venue comparison | **Currently available** (registry subset) |
| Format tags / attributes | Presentation distinction | **Partial** (source-dependent; often sparse) |
| Ticket / source URLs | External action | **Partial** (`ticket_url` often null) |
| Screening variant / parent film keys | Variant caution | **Partial** (analysis-oriented; not full canonical identity) |
| Pipeline freshness / source health | Trust, degrade behavior | **Currently available** (pipeline report / related artifacts) |
| Leaving-soon / newly-added style urgency artifacts | Dynamic opportunity signals | **Partial** |
| Canonical Reel Seattle `film_id` | Stable cross-source identity | **Future-facing** ([roadmap](../../data-foundation-roadmap.md#planned-film-identity-and-enrichment)) |
| Source↔canonical confidence mappings | Safe merges | **Future-facing** |
| Release year, rating, synopsis, genre, filmmaker metadata | Hero / What it’s about / reference | **Future-facing** (not in current public film objects) |
| Landscape / backdrop artwork | Cinematic hero | **Future-facing** (posters exist; reliable landscape not established) |
| Cultural signals (awards, festivals, polls, registries) | Why see it | **Future-facing** |
| IMDb / TMDB / Letterboxd identifiers with provenance | Enrichment evidence | **Future-facing** (AMC IMDb audit showed poor Showtimes-path coverage; not production identity) |
| Accessibility / language attributes | Opportunity fit | **Partial / future** (planned theater expansion; showtime attributes sparse) |
| Reviews, collections, personalization | Reference / Why see it / ranking | **Future-facing** |
| Best Opportunity ranking engine | Preferred opportunity | **Future-facing** — do not invent in early UI |
| Experiential descriptors (“tone” tags) | What it’s about | **Future-facing** — do not fabricate |

Early UI must prefer honest available data and graceful omission over fabricated significance, synopsis, or Best Opportunity superiority.

---

## Future enhancements

Clearly separated from the canonical baseline:

* Personalized “Why see it” signals
* Optional AI-written signal synthesis (never required)
* Friend activity or recommendations
* Critic excerpts where licensing permits
* Richer version / restoration comparison
* Price and membership-aware opportunity ranking
* Accessibility preferences
* Notifications for new or last-chance opportunities
* Deeper filmmaker and collection relationships

---

## Explicit non-goals

This specification does **not**:

* Lock exact visual styling or final copy
* Define exact signal weights or the final Best Opportunity algorithm
* Implement film-identity resolution or external metadata ingestion
* Require AI-generated editorial copy
* Design production schemas
* Build the page or modify current public-site behavior
* Design Planner (canonical Planner spec TBD)
* Globally redesign navigation
* Mark identity, signal engine, or ranking as complete

---

## Open questions

| Topic | Status |
|-------|--------|
| Final working title for “Why see it” | Open — working title approved for now |
| Initial trustworthy signal inventory for v1 | Open |
| Source-attribution presentation | Open |
| Best Opportunity when several choices are genuinely equivalent | Open |
| Ratings / review summaries above vs below decision sections | Open |
| Final mobile action treatment | Open |
| Representation of versions, cuts, restorations, rereleases | Open — caution required; see identity docs |
| Exact Planner add semantics (required / preferred / showtime) | Open |
| Which external cultural datasets are sustainable to maintain | Open |
| Opportunity Detail as a separate surface vs inline only | Deferred ([08](../08-screen-specifications.md)) |

---

## Spec format note

Follows the canonical screen-spec pattern established by [Home](./home.md) (D-17): authority, purpose, hierarchy, regions, interactions, states, data dependencies, non-goals, open questions.
