# Theater — Canonical Screen Specification

**Status:** Canonical product specification (D-20)  
**Authority:** Authoritative for Theater product behavior  
**Supersedes for Theater implementation decisions:** Conceptual Theater section in [08 — Screen specifications](../08-screen-specifications.md) where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Home](./home.md) · [Canonical Film Detail](./film-detail.md) · [Canonical Planner](./planner.md) · [Discovery model](../03-discovery-model.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Experience model](../12-experience-model.md) · [Entity expression](../16-entity-expression.md) · [Editorial design language](../15-editorial-design-language.md) · [Opportunity model](../10-opportunity-model.md) · [Data artifact inventory](../../data-artifact-inventory.md) · [Data foundation roadmap — theater expansion](../../data-foundation-roadmap.md#planned-theater-model-expansion)

---

## Status and authority

This document is the **canonical product specification for the Theater screen** in Reel Seattle v2.

It governs:

* product purpose and role
* information hierarchy
* behavior, states, and interaction rules

It is **implementation-independent**. It does **not** prescribe:

* exact pixels, CSS, typography, or colors
* component architecture or production APIs
* implementation technology

**Written specifications are authoritative.** Visual design-review materials (if retained later) are supporting references only.

Conceptual philosophy in [08 — Screen specifications](../08-screen-specifications.md) remains useful background. Where that document and this one diverge on Theater behavior, **this specification wins**.

There is **no dedicated Theater page** on the current public site; this spec defines v2 product behavior without requiring immediate production UI changes ([Development operating model](../../development-operating-model.md#v2-product-design-workflow)).

---

## Purpose

The Theater screen expresses a venue as **more than a location or showtime container**.

It helps users understand:

* the theater’s **identity**
* what kind of **programming** it tends to offer
* what is **currently playing**
* which current **opportunities** are especially notable
* **practical** considerations for attending
* how to continue into **Film Detail** or **Planner**

It must **not** be merely:

* an address page
* an unstructured showtime list
* a generic theater-chain profile
* a source scraper diagnostic
* a static venue encyclopedia entry

---

## Primary user question

> “What is distinctive about seeing movies here, and what can I see here now?”

The screen supports both:

* **practical venue understanding**
* **editorial discovery** through the theater’s current programming

**Reconciliation note:** Conceptual D-12 also asked “Why would I choose this theater instead of another?” ([08](../08-screen-specifications.md)). That remains a useful *comparison* outcome. The **approved central question** pairs **distinctiveness** with **current program**.

---

## Product role

Theater sits between **editorial discovery** and **reference exploration**.

| Surface | Primary question |
|---------|------------------|
| **Home** | “What deserves my attention?” ([canonical Home](./home.md)) |
| **Theater** | “What is distinctive about seeing movies here, and what can I see here now?” |
| **Film Detail** | “Should I see this?” ([canonical Film Detail](./film-detail.md)) |
| **Planner** | “What’s the best movie day I can make?” ([canonical Planner](./planner.md)) |

Theater is the primary surface for **Theater Exploration** sessions ([Experience model](../12-experience-model.md)) — place as a path into films and opportunities.

---

## Theater as an entity

Preserve the distinction:

| Concept | Meaning |
|---------|---------|
| **Theater** | Stable **venue identity** (canonical registry entry) |
| **Screen / auditorium** | Physical or virtual presentation space **within** the venue |
| **Opportunity** | Specific film presentation at a venue and time |
| **Source** | Upstream owner or website that supplies observations |

The Theater screen is centered on **stable venue identity** while expressing current opportunities associated with it.

### Do not assume

* one source equals one theater (e.g. AMC operates many distinct venues)
* one theater equals one screen
* source naming is canonical
* all theaters share the same programming model
* every venue has complete descriptive metadata

**Canonical theater identity** must remain grounded in the theater registry (`data/theaters.json` → `public/data/theaters.json`) and existing data-foundation rules ([Data artifact inventory](../../data-artifact-inventory.md)). Do **not** change the registry or define new schemas in this task.

---

## Entry points

Representative entries:

* Home (featured or secondary opportunity)
* Explore / Search
* Film Detail (venue opportunity)
* Formats and Experiences hub
* Planner (theater-constrained planning)
* Map or nearby-theater view (future)
* Shared link
* Operator or related-venue navigation (future)

### Entry-context emphasis examples

| Entry | Initial emphasis may favor |
|-------|----------------------------|
| From a film | That film’s showtimes at this venue |
| From a format hub | Relevant presentations at the venue |
| From Planner | Selected date; theater already constrained |
| From Home | Featured opportunity at this venue |

Context changes **emphasis**, not underlying truth ([Entity expression](../16-entity-expression.md)).

---

## Exit paths

Representative exits:

* **Film Detail** (preserve theater context)
* **Ticket link** (source-owned URL)
* **Planner** (required/preferred film, specific showtime, or theater-constrained day)
* Related theater; format or series hub
* Explore / Search
* Map or directions provider (future)
* Official venue website (when reliable)

---

## Information hierarchy

Approved high-level order (decision flow — not a locked layout):

1. **Venue identity and editorial orientation**
2. **What is distinctive about the theater**
3. **Current notable opportunities**
4. **Complete current program / showtimes**
5. **Practical visit information**
6. **Deeper venue reference information**
7. **Routes into Film Detail, Planner, tickets, and broader exploration**

Visual arrangement may adapt by viewport; this hierarchy should remain **stable**.

---

## Major content regions

### 1. Venue identity and hero

The opening expression should establish:

* canonical theater **name**
* **neighborhood** or geographic orientation where reliable
* **venue type** or programming identity where defensible (e.g. from registry `type`: chain, rep, indie)
* strong visual recognition through venue, architectural, or marquee imagery — or a **restrained fallback**
* current relevance **without** turning the hero into a showtime table

Potential supporting facts (illustrative — not a locked field list):

* independent / nonprofit / repertory / multiplex category
* number of screens (when known)
* accessibility or amenity summaries (when sourced)
* operator or parent organization (where useful, without collapsing distinct venues)
* address; transit or parking context
* membership or ticketing context

The hero is a **high-information** venue introduction, not a second program listing.

### 2. What is distinctive about the theater

Working section title: **“What makes this theater distinctive”** or **“Why go here”** (final copy open).

See [Programming as character](#programming-as-character) below.

### 3. Current notable opportunities

Editorially **scarce** selection of opportunities particularly relevant **at this venue**.

See [Current notable opportunities](#current-notable-opportunities-1) below.

### 4. Complete current program

Full browsable schedule for the selected time scope.

See [Complete current program](#complete-current-program-1) below.

### 5. Practical visit information

Attendance-oriented facts when reliable and sourced.

See [Practical visit information](#practical-visit-information-1) below.

### 6. Deeper reference

Optional durable venue reference (history, operator pages, related venues) without outranking programming and schedule.

### 7. Actions and routes

Film Detail, Planner, tickets, share, explore — see [Interaction behavior](#interaction-behavior).

---

## Programming as character

A core Theater responsibility is communicating the venue’s **programming personality**.

May be expressed through:

* current and recent programming patterns
* recurring series; repertory vs first-run focus
* local or regional filmmaking; festivals
* special formats; filmmaker events; community programming
* midnight, family, or genre emphasis
* curated seasonal programs

### Rules

* Programming character should be **evidence-based**
* Current programming can express identity, but **short-term anomalies** must not be mistaken for permanent character
* Durable editorial descriptions may eventually be **curated manually** (future data requirement)
* **AI-generated venue summaries must not be foundational**
* Early implementation must **omit** unsupported claims rather than invent personality
* Distinguish **stable venue facts** from **inferred or current programming signals**

Registry `type` (chain / rep / indie) and source patterns may inform character **only** where defensible — not as a substitute for evidence.

---

## Current notable opportunities

Surface a **small number** of opportunities especially relevant within this venue.

Illustrative kinds:

* special-format presentations
* one-night events; Q&As; filmmaker appearances
* rare screenings; series entries
* opening or closing nights; last chances; exclusive engagements
* unusually strong same-theater double-feature possibilities
* opportunities that **exemplify** the theater’s identity

### Rules

* **Editorial scarcity** — not every film equally prominent
* Recommendations must be **explainable** (venue-specific reason may differ from Home’s global reason)
* Must **not** duplicate Home mechanically
* Tapping a notable opportunity normally opens **Film Detail** with **theater context preserved**
* Specific-showtime action may add to **Planner** where appropriate

Do **not** define a ranking formula or build a signal engine in this task.

### Theater-specific editorial signals (illustrative)

* Only at this theater
* Part of a current series
* Best format at this venue
* A strong double-feature pairing
* Last chance here
* Recently added to the schedule

---

## Complete current program

Users must inspect the theater’s **complete current program** for the selected time scope.

Conceptually support:

* grouping by **date**
* grouping or distinguishing by **screen** where known
* film title; showtime
* presentation format; event attributes
* accessibility and language attributes (when available)
* ticket status; ticket link
* sold-out or nearly sold-out status where reliable
* transitions into **Film Detail**

Theater-specific **filtering** is appropriate (unlike Home’s editorial briefing — [canonical Home](./home.md)).

Potential controls (not a locked inventory):

* date; film; format; series; event type; accessibility; screen or auditorium

Must remain **scannable** on mobile without becoming a raw schedule export.

Films remain the identity users scan; opportunities remain the decision units ([Core concepts](../02-core-concepts.md)).

---

## Default time scope

Prioritize **current and near-future** opportunities.

May support: Today; This week; forward window; later dates; calendar selection.

**Reconcile with data:** Current `showtimes_current.json` exposes a dated `window` (typically on the order of **two weeks** forward from generation). Do **not** promise dates beyond reliable source coverage. Do **not** redefine ingestion windows in this task.

---

## Practical visit information

Make attendance easier when data supports it.

Potential information (illustrative):

* address; map or directions link
* neighborhood; transit; parking; bike access
* accessibility; box office; concessions
* age restrictions; membership; ticket policies
* seating or screen information; arrival guidance
* official website; contact information

### Rules

* Only display **reliable, sourced** information
* Distinguish durable facts from potentially **stale** operating details
* Do **not** fabricate amenities
* Do **not** require equal metadata depth for every theater
* Operational facts that change frequently need freshness/source consideration
* Do **not** create a new manual maintenance burden without recording it as a future data requirement

---

## Screens and auditoriums

Where data supports it, the Theater screen may describe individual screens or auditoriums (name/number, capacity, projection, sound, accessibility, virtual auditorium identity).

However:

* screen-level data is **partial and future-facing** ([Data foundation roadmap — theater expansion](../../data-foundation-roadmap.md#planned-theater-model-expansion))
* source auditorium labels must **not** be assumed canonical
* virtual auditoriums or source-specific room IDs may differ from physical screens
* do **not** design a screen-identity pipeline in this task

If screen is unknown: display the opportunity without inventing an auditorium; preserve raw source information only where product-appropriate.

---

## Theater grouping and operators

Some operators manage **multiple distinct venues** (e.g. AMC, SIFF).

Preserve:

* canonical **venue** identity per registry `id`
* operator relationship where useful — without merging pages
* distinct addresses, programs, practical information, screen inventories

Do **not** collapse multiple venues into one Theater page because they share a source or brand. Related venues may be **linked** separately.

---

## Entity expressions used

| Entity | Theater emphasis |
|--------|------------------|
| **Theater** | Identity, programming philosophy, amenities, history, practical information |
| **Film** | Availability, presentations, showtimes — what this venue offers for the title |
| **Opportunity** | Venue-specific significance; format; time; ticket path |
| **Plan** | Theater-constrained or same-theater movie-day input |

Expression depth: Recognition → Orientation → Understanding for venue; Evaluation toward Film Detail / Planner ([Entity expression](../16-entity-expression.md)).

---

## Relationship to Home

| Home | Theater |
|------|---------|
| “What deserves my attention?” (citywide) | “What is distinctive here, and what can I see here now?” |
| Scarce Top Opportunities | Venue-scarce notable opportunities |
| Explore transition to reference | Full venue program + character |

Home may feature a venue-specific opportunity and route to Film Detail or Theater. Theater provides **deeper venue context** and the **full current program**. It must **not** reproduce Home’s editorial hierarchy with only a venue filter applied.

---

## Relationship to Film Detail

Film Detail remains the primary destination for **whether to see a film** ([canonical Film Detail](./film-detail.md)).

Theater should:

* **preserve venue context** when opening Film Detail
* emphasize the **relevant venue opportunity**
* allow **return navigation** to prior theater/date context
* **avoid** duplicating full “Why see it” and all-venue comparison

Film Detail shows **all Seattle** opportunities; Theater shows **this venue’s** program and character.

---

## Relationship to Planner

Theater may support ([canonical Planner](./planner.md)):

* add film as **required** or **preferred**
* add a **specific showtime**
* constrain Planner to **this theater**
* begin a **same-theater movie-day** plan

### “Build a movie day here” (approved direction)

A particularly useful theater-level action — conceptually similar to opening Planner with this theater pre-selected and an appropriate date. Aligns with current public Planner’s same-theater multi-film generation ([unified-planner-design.md](../../unified-planner-design.md)).

**Future-facing** for full v2 handoff UX; document as approved product direction. Do **not** implement in this task.

---

## Interaction behavior

Product-level rules:

* **Date switching** within reliable window
* **Expand** schedule detail inline where practical
* **Navigate to Film Detail** with theater context preserved
* **Add to Planner** (film / showtime / theater constraint — semantics per Planner + Film Detail open questions)
* **Open ticket links** (source-owned)
* **Share** theater or specific opportunity
* **Explore** series or format (when destinations exist)
* **Back navigation** preserves filters and scroll position when practical
* **View practical details** via progressive disclosure
* Distinguish **venue-level** vs **showtime-level** actions clearly

Avoid unnecessary page changes when concise detail can expand inline. Film Detail remains the deep destination for complete film-level understanding ([Navigation — Interaction Model](../05-navigation.md#interaction-model)).

---

## Continuity across visits

Theater should remain useful across repeated visits.

Potential continuity (future unless already supported):

* preserve selected date
* highlight newly added opportunities
* identify changed or canceled showtimes
* remember followed or favorite theaters
* show recently viewed programming
* alerts for notable additions

**Baseline:** shared, non-personalized Theater screen must remain **complete and useful** without personalization.

---

## States and resilience

| Situation | Expectation |
|-----------|-------------|
| **Loading** | Preserve venue identity and hierarchy; progressive reveal; avoid excessive layout shift |
| **No current showtimes** | Valid-empty ≠ failure; retain identity and practical info; later-date exploration when reliable; do not imply permanent closure |
| **Partial source failure** | Preserve known venue facts; show program per existing stale-data principles; communicate limits; no new pipeline behavior |
| **Stale program** | Avoid overconfident urgency, sold-out, or “last chance” claims |
| **Missing artwork** | Architecture-neutral, typography-led, or restrained fallback; do not collapse hero |
| **Missing venue metadata** | Omit facts; no empty amenity grids or placeholder claims |
| **Unknown screen** | Show opportunity without inventing auditorium |
| **Valid-empty source** | Not pipeline failure |
| **Duplicate listings** | Avoid obvious duplicate showtimes; do not silently merge uncertain venue identities |
| **Closed / relocated venue** | Represent only when reliably supported; separate historical identity from actionability if future scope requires |

---

## Mobile behavior

Mobile is primary.

* Strong but compact venue identity opening
* Single-column hierarchy
* Easy-to-reach date controls
* Readable schedule groupings; avoid dense tables
* Distinct Film Detail vs ticket actions
* Practical details progressively disclosed
* Understandable theater-level Planner actions
* No hover dependence
* Complete program remains **scannable** with many films/showtimes

---

## Tablet / desktop adaptation

May support venue information beside program, persistent date navigation, wider imagery, richer screen/amenity info, side-by-side practical details and schedule, broader weekly views.

Desktop must preserve the **same product hierarchy** — not an administrative schedule tool.

---

## Editorial design language

Consistent with Home, Film Detail, and Planner ([Editorial design language](../15-editorial-design-language.md)):

**Should feel:** calm, confident, cinematic, selective, culturally informed, information-led — a venue profile within a trusted cinema publication.

**Should not feel:** generic business directory; raw scraped calendar; enterprise venue dashboard; ticket marketplace; undifferentiated chain locator.

---

## Accessibility

* Accessible heading hierarchy
* Readable contrast over venue imagery
* Text alternatives for meaningful images
* No status, format, or urgency by color alone
* Keyboard accessibility on desktop; adequate touch targets
* Screen-reader-friendly showtime grouping
* Clear distinction between Film Detail, ticket, and Planner actions
* Accessible date controls; explicit local timezone
* Usable directions and address text
* Reduced-motion support
* Practical accessibility information presented clearly where available

---

## Data dependencies

Conceptual only — classification from repository evidence (`data/theaters.json`, `showtimes_current.json`, pipeline health). Do **not** guess.

| Dependency | Role | Maturity |
|------------|------|----------|
| Canonical theater `id` and `name` | Identity | **Currently available** (registry) |
| `type` (chain / rep / indie), `city`, `neighborhood`, `timezone` | Orientation, character hints | **Currently available** (registry; neighborhood not on all entries) |
| `source`, `aliases`, `enabled` | Provenance, filtering inactive venues | **Currently available** |
| Current showtimes at theater | Program, notable opportunities | **Currently available** |
| Film identity (`showtime_film_key`, title, runtime, poster) | Program display | **Currently available** |
| Format tags / attributes | Presentation distinction | **Partial** (source-dependent; often sparse) |
| Ticket URLs | External action | **Partial** (`ticket_url` often null) |
| Showtime `window` / `generated_at` | Time scope, freshness | **Currently available** |
| Pipeline / source health | Stale-data behavior | **Currently available** (pipeline report) |
| Address, coordinates | Practical visit, maps | **Future-facing** (roadmap: Planned) |
| Number of screens, auditoriums | Screen grouping, capability | **Future-facing** (roadmap: Planned / Research) |
| Accessibility / format capabilities (venue-level) | Practical + character | **Future-facing** (roadmap: Planned) |
| Venue imagery | Hero | **Future-facing** |
| Editorial venue descriptions | Durable “distinctive” copy | **Future-facing** (manual curation) |
| Programming-character inference | Distinctive section beyond registry type | **Future-facing** |
| Series / recurring-program metadata | Notable opportunities, filters | **Future-facing** |
| Sold-out / availability status | Status display | **Partial / future** |
| Membership, pricing, transit, parking | Practical visit | **Future-facing** |
| User follow / favorite | Continuity | **Partial** — versioned local Favorite Theaters store (T-FAV-01); UI wiring / Profile management deferred |
| Geocoding, directions integration | Maps | **Future-facing** |

Early UI must **omit** unsupported venue facts rather than fabricate personality, amenities, or notable-opportunity claims.

---

## Data-foundation boundaries

This task does **not** define:

* new theater registry schemas
* operator identity models
* screen or auditorium resolution
* geocoding; amenity ingestion; venue-image ingestion
* schedule scraping; theater-description generation
* programming-character inference pipelines
* travel-time or ticket-pricing ingestion

Reference [Planned theater model expansion](../../data-foundation-roadmap.md#planned-theater-model-expansion). Do **not** create competing architecture. Do **not** change `data/theaters.json`.

---

## Future enhancements

Separate from baseline:

* Follow or favorite theater; new-program notifications
* Personalized venue recommendations
* “Build a movie day here” Planner entry (full UX)
* Venue-specific double-feature suggestions
* Nearby restaurant or transit guidance
* Richer screen and projection details; seat layouts
* Member pricing; operator pages; editorial venue essays
* Historic programming views; community accessibility notes
* Venue collections and recurring-series destinations

---

## Explicit non-goals

* Implementing the Theater **Detail** screen or modifying the public website
* Redesigning Home, Film Detail, or Planner
* Building theater ingestion; changing `data/theaters.json`
* Defining new theater schemas; resolving screens or auditoriums
* Generating venue descriptions; implementing maps, travel, or pricing
* Finalizing filters, visual styling, or copy
* Global navigation redesign
* Marking venue metadata, screen identity, geocoding, or Theater Detail UI as complete

---

## Implementation status (Stage 1 Theaters list — 2026-07-26)

* **Theaters list** → `v2/theaters/TheatersSurface.jsx`.
* **Live default (T-THEA-10):** HomeData-backed presentation. Explicit mockup: `?theaterMockup=1`.
* **Canonical fixture (QC):** `v2/fixtures/theatersMockupFixture.js` — matches `Canonical Mockup Images/Theaters Page.png`.
* **Inline expand/collapse:** one theater expanded at a time; Now showing from showtimes (next 7 days); **More details** opens Theater Detail for every live venue.
* **Favorite / Save / Filters / View all** on the list remain stubs — no Favorite Theater store writes on the list.
* QC: `scripts/capture_theaters_qc.mjs`. Tests: `tests/frontend/v2TheatersList.test.mjs`.
* Stage 4: **`T-THEA-01` + `T-THEA-10` complete**.

## Implementation status (Stage 4 theater foundation — T-THEA-01 / T-THEA-10)

* Registry schema: `schema/theaters/v1.1.0.json` — optional D06 visit fields. Pricing/hours **not** in schema.
* Curated (2026-07-28): address + website for all 13 enabled venues; coords where verified; AMC `source_external_id`; phones for Beacon/NWFF/Central; factual short descriptions; screen_count only when verified. Amenities empty (not invented). **Imagery (`T-TIMG-01` / `WS-TIMG`):** shared resolver + `/theater-images/` staging exists; live registry `image_*` fields remain null until rights-cleared venue photos are curated (SIFF JPGs under `Theater Data/` stay uncleared / unpublished).
* Evidence: `docs/v2/research/theater-visit-curation-audit.json`.
* Shared resolver + live-default mode. Now Showing = next seven local days (filmId dedupe). Search/Explore reuse resolver.
* Tests: `tests/frontend/v2TheaterPresentation.test.mjs`.

## Implementation status (Stage 1 Theater Detail — 2026-07-27)

* **Theater Detail** → `v2/theaters/TheaterDetailSurface.jsx` — **live default**; mockup QC via `?theaterMockup=1`.
* Unknown/disabled IDs: honest not-found (no mockup fallback). Empty visit sections suppressed; pricing/hours never invented.
* **Favorite** heart uses `favoriteTheatersStore` on Detail.
* QC: `scripts/capture_theater_detail_qc.mjs`. Tests: `tests/frontend/v2TheaterDetail.test.mjs`.

---

## Open questions

| Topic | Status |
|-------|--------|
| Final central-question wording | Open — working form approved |
| Initial venue identity fields in hero | Open |
| Source and maintenance for editorial venue descriptions | Open |
| Establishing programming character without overgeneralizing | Open |
| Initial notable-opportunity signal inventory | Open |
| Default schedule window vs user date picker | Open |
| Screen/auditorium representation when partial | Open |
| Operator and related-venue linking | Open |
| Venue imagery sourcing and rights | Open — pipeline ready (`T-TIMG-01`); per-venue clearance pending |
| Practical-information freshness policy | Open |
| Map and directions integration | Open |
| Same-theater Planner handoff (exact UX) | Open — direction approved |
| Membership and ticket-policy presentation | Open |
| Temporarily closed or relocated venues | Open |
| Recurring series as own destinations | Open |

---

## Spec format note

Follows the canonical screen-spec pattern from [Home](./home.md) (D-17), [Film Detail](./film-detail.md) (D-18), and [Planner](./planner.md) (D-19).
