# Explore / Search — Canonical Screen Specification

**Status:** Canonical product specification (D-23); aligned with Explore/Search Design Review v3  
**Authority:** Authoritative for Explore/Search product behavior  
**Supersedes for Explore/Search implementation decisions:** Deferred Search / Explore notes in [04 — Information architecture](../04-information-architecture.md), [05 — Navigation](../05-navigation.md), and [08 — Screen specifications](../08-screen-specifications.md) where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Home](./home.md) · [Canonical Film Detail](./film-detail.md) · [Canonical Planner](./planner.md) · [Canonical Theater](./theater.md) · [Discovery model](../03-discovery-model.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Experience model](../12-experience-model.md) · [Entity expression](../16-entity-expression.md) · [Editorial design language](../15-editorial-design-language.md) · [Opportunity model](../10-opportunity-model.md) · [Data artifact inventory](../../data-artifact-inventory.md) · [Data foundation roadmap](../../data-foundation-roadmap.md)

---

## Status and authority

This document is the **canonical product specification for Explore/Search** in Reel Seattle v2.

It governs:

* product purpose and role
* information hierarchy
* behavior, states, and interaction rules

It is **implementation-independent**. It does **not** prescribe:

* exact pixels, CSS, final colors, or typography
* component architecture or production APIs
* search technology, indexing architecture, or ranking formulas
* global navigation chrome or tab-bar inventory

**Written specifications are authoritative.** Design-review imagery (including Explore/Search Design Review v3) is **supporting evidence**, not the source of truth.

Conceptual philosophy in parent `docs/v2/` documents remains useful background. Where those documents and this one diverge on Explore/Search behavior, **this specification wins**.

There is **no dedicated Explore/Search destination** on the current public site (live routes center on Showtimes `/`, Recently Added, and Planner). This spec defines v2 product behavior without requiring immediate production UI changes ([Development operating model](../../development-operating-model.md#v2-product-design-workflow)).

---

## Purpose

Explore/Search is the **comprehensive, user-directed discovery** surface.

It helps users:

* search directly
* browse suggested starting points
* browse by major category
* filter comprehensively
* compare results
* reach Film Detail, Theater, Planner, or other deep destinations
* manage film-status signals such as **Seen** and **Not interested**

It must **not** feel like:

* a raw database query tool
* a dense desktop filter dashboard squeezed onto mobile
* a generic streaming catalog
* a simple search box with no guidance
* a Home clone with more cards

---

## Primary user question

> “What movies, theaters, formats, and experiences match what I care about?”

---

## Product role

| Surface | Stance |
|---------|--------|
| **Home** | “Tell me what deserves attention.” ([canonical Home](./home.md)) |
| **Explore/Search** | “Let me investigate on my own.” |
| **Film Detail** | “Should I see this?” ([canonical Film Detail](./film-detail.md)) |
| **Theater** | “What is distinctive about seeing movies here, and what can I see here now?” ([canonical Theater](./theater.md)) |
| **Planner** | “What’s the best movie day I can make?” ([canonical Planner](./planner.md)) |

Explore/Search is the correct place for **comprehensive filtering**. Home remains editorially selective and must not host the full filter system ([canonical Home](./home.md) — Filtering and exploration boundary).

---

## Explore and Search relationship

Treat **Explore** and **Search** as **one connected experience**.

| Mode | Provides |
|------|----------|
| **Explore** | Open-ended discovery; browse-by routes; suggested searches; category-led entry; filtering and sorting |
| **Search** | Direct text input; matching on supported entities/fields; results within the same opportunity-aware surface |

**Search is a mode within Explore**, not necessarily a separate primary destination.

Do **not** lock global navigation in this task. Explore/Search must be **reachable as a primary discovery destination**; exact tab-bar membership remains open.

---

## Information hierarchy

Approved high-level order (product progression — not a locked pixel layout):

1. **Explore orientation**
2. **Search field**
3. **Quick starts**
4. **Browse-by pathways**
5. **Suggested starts**
6. **Results**
7. **Refinement and sorting**
8. **Film activity**
9. **Recent searches or saved searches** where supported
10. **Routes into deeper surfaces**

Exact order may adapt by viewport. Mobile should preserve a **simple, scannable progression**.

---

## Major content regions

### 1. Explore orientation

Brief framing that this surface is for **user-directed** investigation of Seattle cinema — comprehensive relative to Home’s editorial briefing, still curated in presentation language.

### 2. Search field

Primary text entry for direct matching (see [Search behavior](#search-behavior)).

### 3. Quick starts

Immediate common intents as predefined search/filter states (see [Quick starts](#quick-starts)).

### 4. Browse by

Category pathways into richer destinations or scoped Explore states (see [Browse by](#browse-by)).

### 5. Suggested starts

Helpful starts for users who do not know exactly what they want (see [Suggested starts](#suggested-starts)).

### 6. Results

Opportunity-aware result list/grid (see [Results model](#results-model)).

### 7. Refinement and sorting

Comprehensive filters and sort controls (see [Filtering](#filtering), [Sorting](#sorting)).

### 8. Film activity

Concise **Seen** / **Not interested** summaries and management entry (see [Film status model](#film-status-model)).

### 9. Recent searches

Optional recent queries or filter combinations — must not crowd the main flow.

### 10. Deeper routes

Film Detail, Theater, Planner, format/collection hubs, Coming Soon, and other reference destinations as appropriate.

---

## Search behavior

The search field should conceptually support matching on:

* film title
* person / filmmaker
* theater
* format
* series
* collection
* genre
* keyword
* other **supported** metadata

### Rules

* Search should lead to results with **relevant opportunities**, not generic film records alone
* Matching quality should be **explainable** where useful
* Do **not** imply support for entities or fields not yet available
* Search should work **alongside** filters
* Clearing search should **preserve** other selected filters unless the user explicitly resets all
* Recent searches may be retained where appropriate
* Search suggestions or autocomplete may be **future-facing** unless already supported
* Search should **degrade gracefully** when identity resolution or metadata coverage is incomplete

**Current evidence:** Live public Showtimes supports client-side **title substring** search plus theater/date filters — not a full Explore/Search destination or entity index. Early v2 implementation must not claim person, series, or collection search until data supports it.

---

## Quick starts

Conceptual examples (not a final inventory):

* All movies
* Today
* This week
* This weekend
* Theaters
* IMAX
* 35mm
* Special events

### Rules

* Reduce setup effort
* May apply a predefined search/filter state
* Active state should be visible and easy to clear
* Must **not** be confused with permanent navigation tabs

Omit quick starts that cannot be backed by reliable data.

---

## Browse by

Browse-by pathways may include:

* Movies
* Theaters
* Formats and Experiences
* Collections
* Coming Soon
* Special Events

Each pathway should lead into a richer destination or scoped Explore state.

**Theaters** remain a major Explore pathway even if Theater does not occupy permanent global navigation. Theater browsing routes into [canonical Theater](./theater.md) screens for venue depth.

Do **not** treat all categories as equivalent data types. Each destination may have its own canonical screen.

---

## Suggested starts

Potential examples:

* Everything
* Today
* This Week
* This Weekend
* Late Shows
* Family Friendly
* Open Captions
* Short Films
* 70mm
* Nearby

### Rules

* Feel useful and editorial, not random
* May reflect common intent, current availability, seasonality, or future personalization
* Baseline must work **without** personalization
* Do **not** fabricate categories unsupported by current data
* Keep the set **finite** and easy to scan

---

## Results model

Results should be **opportunity-aware**.

A result should help answer:

* what is this
* where and when can I see it
* why does this particular opportunity matter
* what action can I take next

Results should **not** be generic film records stripped of local context.

Potential result content (illustrative — exact card inventory open):

* title
* poster or artwork
* theater
* next or best relevant showtime
* format
* event attribute
* urgency
* accessibility or language attributes
* reason for relevance
* quick planning action
* film status such as Seen

**Film-centered** results may summarize the best current opportunity while allowing inspection of all other opportunities in Film Detail.

**Theater-centered** or **format-centered** searches may return appropriately scoped result expressions.

### Result interaction

* Tapping a film-centered result normally opens **Film Detail**
* Tapping a theater name or venue expression may open **Theater**
* Quick Planner actions may preserve **required**, **preferred**, or **fixed-showtime** intent
* Smaller result expressions may **expand inline** before navigation where useful
* Back navigation should preserve search, filters, sort, and scroll position
* Result cards should **not** expose every possible action simultaneously

---

## Filtering

Explore/Search is the correct place for **comprehensive filtering**.

### Potential filter groups (illustrative — not final inventory)

**Date:** all dates; today; this week; this weekend; custom range; later dates; late shows.

**Location:** all Seattle; neighborhood; theater; proximity; future map scope.

**Format:** IMAX; 70mm; 35mm; Dolby Cinema; laser; standard digital; other presentation attributes.

**Genre and experience:** genre; tone; mood; family-friendly; short runtime; other supported descriptors.

**Language:** spoken language; dubbed; subtitled; English; other supported language attributes.

**Accessibility:** open captions; closed captions; audio description; wheelchair/accessibility features where reliably available.

**Availability:** tickets available; almost sold out; sold out; leaving soon; coming soon.

**Other:** runtime; release year; rating; event type; director; cast; collection; series.

### Rules

* Do **not** finalize the complete inventory
* Do **not** expose filters for unsupported or unreliable fields
* Mobile should use **progressive disclosure**, not a permanently dense control panel
* Active filters should be visible as concise summaries or chips
* Users should clear one filter or reset all
* Filter state should persist while opening and returning from a result
* Filter semantics must be understandable
* No filter state should silently change another unrelated filter

**Current evidence:** Live Showtimes filters theaters and dates; formats display as tags but are not filter controls. Leaving-soon and many a11y/language fields are partial or future — omit from baseline UI until reliable.

---

## Sorting

Potential options (illustrative):

* relevance
* soonest
* date
* rating
* alphabetical
* runtime
* distance or proximity
* urgency

### Rules

* Relevance may be the default
* Relevance must **not** imply objective truth
* Do **not** define ranking formulas
* Sort availability should depend on trustworthy data
* Sorting should **not** hide valid results
* The active sort should be visible

---

## Result volume and progressive loading

Explore may return many results.

Support conceptually:

* clear result counts where reliable
* progressive loading or pagination
* preserving position when returning from detail
* no forced infinite-scroll requirement
* access to the full matching set
* clear indication when only a subset is loaded

Do **not** define implementation mechanics.

Under partial source coverage, prefer honest qualification over precise-looking counts that overstate completeness.

---

## Film status model

Approved user-facing distinction:

| Status | Meaning |
|--------|---------|
| **Seen** | “I have already watched this film.” |
| **Not interested** | “Stop surfacing this to me.” |
| **Saved / interested** | Where supported — light positive interest |
| **No status** | Default |

Do **not** use **Hidden** as a primary user-facing umbrella.

There is **no** separate overlapping Hidden shelf.

**Current evidence:** No product Seen / Not interested / Saved film-status feature exists on the public site today. Status behavior below is approved product direction; persistence and sync are future data/product work — do not mark complete.

### Seen

Seen does **not** mean permanently suppressed.

Seen films may still resurface for explainable reasons such as:

* rare format
* special event
* restoration
* Q&A
* anniversary
* last chance to rewatch
* planning with someone else
* strong personal relevance

Rules:

* Generally **de-emphasize** in normal discovery rather than remove
* When resurfaced, **explain why**
* Remain searchable and browsable
* User must be able to **unmark** Seen
* Deeper distinctions (seen in theaters / elsewhere / via Reel Seattle) are **future-facing** unless supported

### Not interested

Rules:

* Generally **suppress** from Home and normal Explore results
* Remain reachable through an explicit management view
* User must be able to **restore**
* Must not generate urgency, rewatch, or recommendation messaging
* Direct explicit search **may** still reveal them if the user deliberately searches for the title, with status remaining visible — exact inclusion behavior is an **open question**
* Stronger suppression than Seen; must not be triggered accidentally

### Your Film Activity

Explore/Search should include a concise Film Activity area summarizing:

* Seen
* Not interested

Each summary should open its own management list or a shared management destination with clear tabs — typically within or via [canonical Profile / Settings](./profile-settings.md) for durable overview management. Explore remains the place for in-flow marking.

Status summaries may show:

* counts
* recent examples
* contextual notices (e.g. “one seen film is leaving soon”)
* restore or manage actions

Seen and Not interested remain **independent** states with different behavior.

### Contextual resurfacing of Seen films

A seen film may re-enter editorial or Explore surfaces when there is a **distinct new reason** to care.

Example patterns:

* “Last chance to rewatch in theaters”
* “Returning in 70mm”
* “One-night Q&A”
* “New restoration”
* “Now playing at a preferred theater”

Explain the renewed relevance. Do **not** infer that every user wants to rewatch. Future personalization may learn rewatch preferences; baseline relies on **strong contextual signals**.

### Status actions on results

Result expressions may support quick actions such as:

* Mark seen
* Not interested
* Save
* Add to Planner

Rules:

* Do not overcrowd cards
* Provide feedback and undo where appropriate
* Not interested must not be accidental
* Status must not be conveyed by color alone
* Exact iconography and placement remain open

---

## Recent searches

Explore may retain recent searches or recent filter combinations.

Rules:

* User can rerun or clear them
* Privacy and device-sync behavior remain future questions
* Do **not** require account sync for baseline usefulness
* Must not crowd the main discovery flow

---

## Saved searches and alerts

Saved searches and alerts are **future enhancements** (e.g. notify when a 70mm screening appears).

Do **not** include them in the canonical baseline — repository evidence does not support shipped saved-search or alert infrastructure.

---

## Map exploration

Map-based discovery is a **future enhancement** (nearby theaters, neighborhood browsing, travel-aware options).

Do **not** make the baseline dependent on maps, geocoding, or location permissions.

---

## Relationship to Home

Home is editorially selective. Explore/Search is comprehensive and user-directed.

Home’s **Explore More** transition should route into this experience ([canonical Home](./home.md)).

When entering from Home:

* preserve any category or context where appropriate
* do not force default filters unless clearly implied by the entry action
* Home remains the source of shared editorial judgment
* Explore remains the source of broad investigation

---

## Relationship to Film Detail

Film Detail remains the deep destination for deciding whether to see a film.

Explore/Search should:

* preserve search and filter state on return
* pass entry context
* highlight the opportunity that caused navigation where relevant
* avoid duplicating the complete Film Detail decision experience

---

## Relationship to Theater

Theater browsing is a **major Explore path**.

Explore may support:

* all theaters
* neighborhood browsing
* theater search
* scoped theater results
* direct navigation into canonical Theater screens

Explore should **not** duplicate the complete venue-profile experience ([canonical Theater](./theater.md)).

Do **not** canonize Theater as a bottom-navigation tab in this task.

---

## Relationship to Planner

Explore may pass:

* required film
* preferred film
* fixed showtime
* theater constraint
* format preference

Exact UI need not expose all options on every result.

Planner remains responsible for generation and optimization ([canonical Planner](./planner.md)). Explore must **not** become a planning form.

---

## Global navigation boundary

→ **Resolved by [canonical Global navigation](./global-navigation.md)** (D-26).

Primary destinations: **Home · Explore · Planner · Profile**. Explore is a primary destination; Search is a mode within Explore (not a separate tab). Theater, Saved, and Settings are not permanent bottom-navigation tabs.

This specification still requires that Explore/Search make search immediately discoverable and remain the home of comprehensive filtering.

---

## States and resilience

| State | Behavior |
|-------|----------|
| **Loading** | Preserve search/browse hierarchy; avoid misleading result counts before data is ready; allow progressive section loading |
| **No search results** | Explain nothing matched; suggest broader terms; allow clearing filters; distinguish unsupported query from valid-empty |
| **No filter matches** | Show which filters constrain results; support one-tap relaxation or clearing; do not silently ignore filters |
| **No current showtimes** | Surface Coming Soon where available; distinguish no active opportunity from system failure |
| **Partial or stale source data** | Avoid claiming comprehensive coverage; qualify urgency/availability; preserve useful results; follow existing data-health principles |
| **Search failure** | Preserve query and filter state; allow retry; distinguish technical failure from zero matches |
| **Missing artwork** | Poster or typography-led fallback; preserve result hierarchy |
| **Unavailable metadata** | Omit unsupported filter options; do not fabricate descriptors, ratings, or relevance |
| **Not-interested direct search** | Preserve status visibility; exact inclusion behavior remains open |
| **Only seen results** | Show with appropriate de-emphasis and contextual explanation |

Do **not** invent new pipeline or stale-preservation behavior in this task.

---

## Mobile behavior

Mobile is the primary design target.

On mobile:

* search appears early
* filters are secondary and progressively disclosed
* quick starts are easy to scan
* browse-by pathways remain clear
* results use a single-column or compact grid appropriate to viewport
* active filters are visible
* Film Activity is concise
* no interaction depends on hover
* search, filter, and status controls use accessible touch targets

---

## Desktop and tablet adaptation

Larger screens may support:

* search and filters visible together
* denser result grids
* side-by-side refinement
* persistent filter summaries
* broader suggested-start layouts
* richer comparison views

Desktop must preserve the **same product hierarchy** and not become a separate expert tool.

---

## Editorial design language

Explore/Search should inherit the approved Reel Seattle language ([Editorial design language](../15-editorial-design-language.md); aligned with Home Design Review v3 mood):

* dark
* cinematic
* editorial
* confident
* comprehensive without feeling mechanical
* local and culturally informed

It should feel like exploring a trusted cinema publication’s **complete program**.

It should **not** feel like:

* an e-commerce facet sidebar
* an enterprise search tool
* a streaming-service catalog
* a raw scraped database

Do **not** turn this into exact color or styling requirements.

---

## Accessibility

Product-level expectations:

* accessible search labeling
* keyboard-accessible filters and results
* clear active-filter announcements
* screen-reader-friendly result hierarchy
* no state conveyed by color alone
* accessible Seen and Not interested actions
* confirmation and undo for status changes
* touch targets suitable for mobile
* local date and timezone clarity
* reduced-motion support
* accessible result counts
* preserving focus when filters update results
* clear distinction between film, theater, ticket, and Planner actions

Do **not** prescribe implementation details.

---

## Data dependencies

Conceptual dependencies — **not schemas**. Classification uses repository evidence.

| Dependency | Role | Classification |
|------------|------|----------------|
| Film titles | Search / results | **Currently available** |
| Poster artwork | Results | **Currently available** |
| Runtimes | Results / filters where shown | **Currently available** where present |
| Theater identity | Browse, filter, results | **Currently available** |
| Showtimes / opportunities | Opportunity-aware results | **Currently available** |
| Dates and local times | Date filters, timing | **Currently available** |
| Pipeline freshness / source health | Trust, partial degrade | **Currently available** |
| Title search (client substring) | Live Showtimes only | **Currently available** (limited; not full Explore) |
| Theater / date filters | Live Showtimes | **Currently available** (subset of Explore filters) |
| Format / presentation attributes | Format filter / tags | **Partial** (displayed; not systematically filterable; source-dependent) |
| Ticket URLs | Downstream action | **Partial** (often null; sparse UI use) |
| Sold-out / availability | Availability filters | **Partial / future** |
| Leaving soon | Availability / urgency | **Partial** (review-only artifact; not shipped to Pages) |
| Language / accessibility attributes | Filters / result badges | **Partial / future** (sparse or empty in source audits) |
| Parent / variant film grouping | Cleaner results | **Partial** |
| Newly added / recently added | Browse / suggested | **Currently available** as shipped artifact + `/recently-added` (maps into Explore pathways, not a full Explore surface) |
| Canonical film identity | Reliable multi-entity search | **Future-facing** |
| Canonical person / filmmaker identity | Person search | **Future-facing** |
| Cultural / experiential signals | Relevance explanations | **Future-facing** |
| Collections / series metadata | Browse / search | **Future-facing** |
| Durable Seen / Not interested persistence | Film Activity | **Future-facing** |
| Saved searches / alerts | Continuity | **Future-facing** |
| Personalization | Suggested starts, rewatch prefs | **Future-facing** |
| Geocoding / maps / proximity | Location filters, Nearby | **Future-facing** |
| Rich relevance / search index engine | Ranking, entity search | **Future-facing** |

Do **not** mark search infrastructure, status persistence, identity resolution, or personalization as complete.

---

## Data-foundation boundaries

This task does **not** define:

* search indexing architecture
* ranking algorithms
* canonical identity resolution
* person or filmmaker entity models
* metadata ingestion pipelines
* status persistence schemas
* personalization systems
* maps or geocoding
* alerts or saved-search infrastructure
* filter data contracts

Refer to existing [data foundation roadmap](../../data-foundation-roadmap.md) work (film identity, theater expansion, Leaving Soon gates) rather than creating competing architecture.

---

## Future enhancements

*(Separated from baseline.)*

* Saved searches and alerts
* Personalized suggested starts
* Rewatch preference learning
* Map exploration and nearby discovery
* Group discovery / friend activity
* Semantic or natural-language search
* Richer collection, series, and people pages
* Cross-device status sync
* Account-free local status storage
* Richer recommendation explanations

---

## Explicit non-goals

This specification does **not**:

* Implement Explore/Search or modify the current public site
* Define search technology or ranking formulas
* Finalize every filter
* Build semantic or AI search
* Build maps
* Build saved-search alerts
* Implement status persistence
* Lock global navigation
* Redesign Home, Film Detail, Planner, or Theater
* Choose exact visual styling or final interface copy
* Define production schemas

---

## Open questions

| Topic | Status |
|-------|--------|
| Final Explore/Search central question wording | Open — approved question above stands until revised |
| Initial search field scope (which entities at MVP) | Open — omit unsupported entities |
| Initial Quick Start inventory | Open — examples only |
| Final Browse By categories | Open — Theaters remains major |
| Default filters when entering from Home | Open — do not force unless entry implies |
| Exact result expression by entity type | Open |
| Whether explicit search should reveal Not interested titles | Open |
| How Seen films are de-emphasized (visual/sort rules) | Open — principle: de-emphasize, don’t remove |
| Minimum viable Film Activity management view | Open |
| Whether Saved belongs here or a future global destination | Open — do not lock nav |
| How recent searches persist | Open |
| When Coming Soon appears in empty/active states | Open |
| Whether result counts can be trusted under partial coverage | Open — prefer honest qualification |
| Initial sort options | Open |
| Map scope | Future |
| Mobile grid versus list defaults | Open |
| Future five-tab navigation decision | **Resolved against baseline (D-26):** four destinations; fifth tab only via deliberate future revisit — see [global-navigation.md](./global-navigation.md) |

---

## Spec format note

Follows the canonical screen-spec pattern from [Home](./home.md) (D-17/D-22), [Film Detail](./film-detail.md) (D-18), [Planner](./planner.md) (D-19), and [Theater](./theater.md) (D-20).
