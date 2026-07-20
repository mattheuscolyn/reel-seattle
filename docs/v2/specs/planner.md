# Planner — Canonical Screen Specification

**Status:** Canonical product specification (D-19)  
**Authority:** Authoritative for Planner product behavior  
**Supersedes for Planner implementation decisions:** Conceptual Planner section in [08 — Screen specifications](../08-screen-specifications.md) where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Home](./home.md) · [Canonical Film Detail](./film-detail.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Experience model](../12-experience-model.md) · [Entity expression](../16-entity-expression.md) · [Editorial design language](../15-editorial-design-language.md) · [Unified planner design (legacy/current engine)](../../unified-planner-design.md) · [Planner UX roadmap](../../planner-ux-roadmap.md)

---

## Status and authority

This document is the **canonical product specification for Planner** in Reel Seattle v2.

It governs:

* purpose and product definition
* hierarchy and three-stage model
* behavior, states, and interaction rules

It is **implementation-independent**. It does **not** prescribe:

* exact pixels, CSS, typography, or colors
* component architecture or production APIs
* optimization algorithms, scoring weights, or schemas

**Written specifications are authoritative.** Visual design-review images (if retained later) are supporting references only.

Conceptual philosophy in [08 — Screen specifications](../08-screen-specifications.md) remains useful background. Historical and current production engine notes live in [unified-planner-design.md](../../unified-planner-design.md) and [planner-ux-roadmap.md](../../planner-ux-roadmap.md). Where those documents and this one diverge on **v2 product behavior**, **this specification wins** for the Next Public Site track. This document does **not** silently redesign or require immediate changes to the live public Planner.

Cursor must implement agreed specifications; it must not invent Planner UX to fill gaps ([Development operating model](../../development-operating-model.md#v2-product-design-workflow)).

---

## Purpose

Planner answers:

> “What’s the best movie day I can make?”

Approved product narrative:

| Surface | Primary question |
|---------|------------------|
| **Home** | “What deserves my attention?” ([canonical Home](./home.md)) |
| **Film Detail** | “Should I see this?” ([canonical Film Detail](./film-detail.md)) |
| **Planner** | “What’s the best movie day I can make?” |

Planner converts interest into a **feasible, exciting, user-controlled** itinerary. It **optimizes logistics** — it does not decide taste ([08 — Planner](../08-screen-specifications.md#planner)).

---

## Core product definition

Planner is a **constraint-driven movie-day generator and refinement experience**.

**Primary unit:** a **single day** containing one or more **compatible movie opportunities**.

### Original core intent (preserved)

The following must remain intact:

1. The user selects a **date** and planning **constraints**.
2. The engine generates **every valid plan** that satisfies the **hard constraints** (within disclosed scope / limits).
3. The user **compares** candidate plans.
4. The user may choose a plan immediately or **refine** an almost-right plan.
5. The selected plan becomes a **saved or committed** itinerary.

### Must not be redefined primarily as

* a weekly calendar
* a generic watchlist
* a manual scheduling tool / task manager
* a single opaque recommended itinerary
* a simple list of saved showtimes

**Reconciliation note:** The live public Planner ([unified-planner-design.md](../../unified-planner-design.md)) already implements same-day, multi-film, constraint-driven generation of valid plans (historically same-theater chains). v2 preserves that core and adds approved Stage 2 **direct plan sculpting**, clearer stage structure, and broader future capability (e.g. travel-aware multi-venue) without abandoning generate-all-valid-plans semantics.

---

## Three-stage model

Planner is three **connected** stages — continuous, not three unrelated tools.

### Stage 1 — Generate Plans

**Question:** “What constraints and preferences define the movie day I want?”

**Purpose:** Collect enough user intent to generate viable plans without feeling administrative.

### Stage 2 — Candidate Plans / Sculpt Mode

**Question:** “Which viable plan is closest to what I want, and how can I improve it?”

**Purpose:** Show generated plans, explain tradeoffs, and allow **direct refinement** of individual plan elements.

### Stage 3 — My Plan

**Question:** “What exactly am I doing, and what do I need next?”

**Purpose:** Present the selected itinerary clearly; support saving, sharing, adjusting, and proceeding to tickets.

Stage names are working labels (see Open questions).

---

## Planning philosophy

| Principle | Meaning |
|-----------|---------|
| **Optimize, do not dictate** | Arrange and fit; do not invent taste |
| **User defines the goal** | Constraints and preferences come from the user |
| **Hard constraints must be respected** | Never silently ignore them to force a result |
| **Preferences guide ranking and refinement** | Soft factors among valid plans |
| **Preserve existing choices** | Change only what is necessary |
| **Explain changes** | Users understand why recommendations or modifications occurred |
| **Surface all valid options** | Not only one opaque answer |
| **Exciting, not administrative** | Anticipation of the movie day |
| **User ownership** | Adjust, save, share, or abandon |
| **Prevent impossible plans** | Prefer prevention over late warnings |

Aligns with Interaction Model stability and guidance-over-interruption ([Navigation](../05-navigation.md#interaction-model)).

---

## Constraints versus preferences

| Kind | Role |
|------|------|
| **Hard constraints** | Every generated plan **must** satisfy |
| **Preferences** | Rank valid plans or guide refinement **without** making a plan invalid |

### Hard constraints (illustrative — not final inventory)

* Selected date
* Start-after / finish-by times
* Required films
* Required showtimes where explicitly fixed
* Required theaters
* Excluded films / theaters
* Minimum or maximum number of films
* Maximum budget (when supported)
* Accessibility requirements (when supported)
* Required formats (when supported)
* Required travel feasibility (when supported)

### Preferences (illustrative)

* Preferred films / theaters / formats
* Shorter gaps, less travel, lower cost
* Earlier finish / later start
* Same-theater plans
* Meal-break preference
* Presentation quality / membership value
* Preferred plan length

**Rules:**

* Clearly label mandatory vs preference inputs
* Do not assume all examples are currently supported
* A preference never licenses an infeasible schedule

**Current production semantics to preserve where applicable** ([planner-ux-roadmap.md](../../planner-ux-roadmap.md)):

* **Required** — every selected film must appear
* **Preferred** — at least one selected preferred film must appear (engine boost / requirement as implemented)
* **Excluded** — none of the selected films may appear

Canonical v2 may refine preferred semantics (influence ranking without requiring appearance) only with explicit product agreement; until then, document both the live behavior and the Film Detail handoff intent carefully (see Film Detail handoff).

---

## Stage 1 — Generate Plans

### Hierarchy of inputs (conceptual)

1. When
2. Must-haves
3. Preferences
4. Time and flow
5. Budget, travel, or other optional constraints
6. Optimization priority
7. Generate action

### Potential inputs (illustrative)

Date; earliest start; latest finish; required / preferred / excluded films; required / preferred / excluded theaters; formats; desired film count; max/min gap; meal-break preference; travel tolerance; spending limit; accessibility or language needs; optimization objective.

### Rules

* Mobile-first; progressive disclosure
* Common inputs easy; advanced constraints do not dominate first use
* Primary generate action clear and persistent where appropriate
* Users understand returned plans satisfy hard constraints
* Setup feels like describing the desired movie day — not a technical form
* Remembered constraints / preferences are **future-facing** unless already supported (e.g. URL-shareable state today)

---

## Generation semantics

Conceptually, the engine should:

* Enumerate **all viable plans** within the selected scope (and disclosed limits)
* Reject combinations that violate hard constraints
* Preserve source-local date and time correctness
* Account for runtime and required transition time
* Avoid overlapping performances
* Distinguish **valid-empty** results from system failure
* Avoid claiming completeness when source data is stale or incomplete
* Rank or group plans using **explainable** preference criteria
* **Not** silently discard valid plans merely because they rank poorly

**Do not** define the algorithm, complexity limits, graph models, or schemas in this document.

**Reconciliation note:** Current public engine generates same-theater multi-film chains with result limits (`maxResults`, `maxChainDepth`). v2 product expectation remains “all valid within scope,” with honest disclosure when search limits or data coverage bound completeness.

---

## Candidate-plan content

Each candidate should communicate at a glance:

* Included films and selected showtimes
* Theaters, formats / special presentation attributes
* Start and end time; breaks; travel or venue transitions
* Estimated cost where supportable
* Plan size
* Key advantages and meaningful tradeoffs
* Why it is ranked or labeled as it is

### Explainable labels (examples — not final taxonomy)

* Best overall fit
* Shortest day
* Lowest cost
* Best formats
* Least travel
* Best use of membership benefits

The **complete set of valid plans** must remain accessible (progressive loading / summarization allowed; hiding forever is not).

---

## Stage 2 — Direct plan sculpting

**Defining Planner interaction** (approved for v2; design work tracked historically as Planner-R1 in [planner-ux-roadmap.md](../../planner-ux-roadmap.md) — not yet shipped on the public site).

### Principle

Users should refine **parts** of a candidate plan — not only accept or reject the whole plan.

A user with an almost-right plan should **not** need to:

* return to Stage 1
* reconstruct all filters
* start over
* manually inspect every remaining candidate

### Interactive elements (illustrative)

Film; specific showtime; break/gap; theater; theater transition; travel segment; plan start/finish; presentation format; estimated cost; other explainable attributes.

### Contextual refinement actions (illustrative — not a commitment to ship all initially)

| Element | Example actions |
|---------|-----------------|
| **Film** | Exclude; replace; prefer; require; keep fixed |
| **Showtime** | Keep this showing; find another time / venue / format |
| **Break** | Shorten gap; lengthen break; require meal break; avoid transition |
| **Travel / venue** | Prefer same theater; reduce travel; keep / replace venue |
| **Overall plan** | Finish earlier; start later; lower cost; improve formats; change film count |

### Refinement semantics

When the user expresses Stage 2 feedback:

* Treat feedback as a new **constraint or preference**
* **Preserve** unaffected parts of the plan where possible
* Re-optimize **only what needs to change**
* Feel like a **revision** of the selected plan, not an unrelated replacement
* **Never** silently discard a user-fixed film or showing
* **Explain** what changed and why
* Support **undo** of the latest refinement
* Preserve access to other valid candidates
* Avoid trapping the user in a local optimum — broader alternatives remain reachable

### Illustrative refinement scenario (fictional films)

A candidate contains Film A, Film B, a long break, then Film C. The user excludes Film C and prefers a shorter gap. The revised candidate may preserve A and B, replace C, reduce the break, explain both changes, and record the new exclusion and gap preference.

### Constraint promotion

Stage 2 feedback may modify the planning model:

* “Exclude this film” → session-level exclusion
* “Keep this showing” → hard constraint for current refinement
* “Prefer a shorter gap” → preference or adjusted max-gap constraint
* “Prefer this theater” → ranking influence without invalidating alternatives

Users need not learn optimizer terminology; consequences should be understandable in plain language.

---

## Plan comparison

Support:

* Recommendation plus explanation
* Concise differences and consistent facts
* Ranking labels
* Optional side-by-side comparison on larger screens
* Preservation of the current candidate while exploring another

Do **not** imply the top-ranked plan is objectively correct. Represent equivalent or near-equivalent plans honestly.

---

## Stage 3 — My Plan

Once selected, a candidate becomes **My Plan**.

### Default presentation

* Vertical chronological **timeline** (primary mobile expression)
* Clear start and end
* Films, showtimes, breaks, travel/transitions, theaters, formats
* Estimated cost where reliable
* Actionable next steps

Timeline communicates sequence, gaps, and feasibility clearly.

### Optional alternate views

* **List**
* **Calendar** (secondary spatial visualization)

Calendar must **not** redefine Planner as calendar-first.

A **week-level** view may show multiple separately planned movie days as an overview/organizer, but:

* **single-day optimization remains primary**
* week view must not replace the per-day generation model

---

## Plan states

Reconcile with [Entity expression — Plan](../16-entity-expression.md):

| State | Character |
|-------|-----------|
| **Idea** | Interest forming; not yet structured |
| **Candidate** | Generated viable itinerary under consideration |
| **Refined** | Candidate after Stage 2 sculpting |
| **Selected** | Chosen as My Plan (session) |
| **Saved** | Persisted for return (when persistence exists) |
| **Committed** | Intent to act / preparedness |
| **Completed** | After the movie day |
| **Expired / no longer viable** | Underlying showtimes or constraints no longer hold |

Avoid duplicate competing lifecycles. UI need not display every state label.

---

## Plan stability

Preserve user work when circumstances change:

* Retain the plan whenever possible
* Identify the affected portion
* Suggest **targeted repairs**
* Avoid rebuilding the entire plan without consent
* Explain modifications
* Preserve notes, fixed items, and stated preferences

Example disruptions: showtime removed; ticket status changed; source data updated; runtime changed; theater unavailable; time constraint now violated.

Do **not** define monitoring or notification implementation in this task.

---

## Film Detail handoff

Film Detail may add to Planner at different levels ([canonical Film Detail](./film-detail.md)):

| Handoff | Planner meaning |
|---------|-----------------|
| **Film as required** | Appears in every generated plan |
| **Film as preferred** | Influences ranking / preferred semantics (see Open questions vs live engine) |
| **Specific showtime** | Hard constraint around that exact opportunity |
| **Save for later** | Idea / watchlist-like persistence without forcing generation |

Preserve the distinction. Final copy and defaults remain open.

---

## Home relationship

Home may surface **quick** planning actions but must **not** become the constraint builder ([canonical Home](./home.md)).

* Home → awareness  
* Film Detail → decision  
* Planner → generation, comparison, refinement, commitment  

---

## Sharing and collaboration

**Baseline** (partially present today via shareable planner URLs):

* Save (where persistence exists)
* Share / copy link
* Export or open ticket links
* Adjust plan

**Future collaboration:** invite others; collect preferences; compare availability; vote; co-edit — **future-facing**. Baseline must work for one user without social features.

---

## Tickets and commitment

Support the path from plan to attendance:

* Open ticket links per showing
* Indicate which tickets remain unpurchased (when status known)
* Mark tickets obtained (future / optional)
* Preserve source-owned ticket URLs
* Share itinerary
* Add to external calendar (future)

Reel Seattle does **not** own ticket transactions. Do not implement purchasing, calendar integrations, or booking state in this task.

---

## States and resilience

| Situation | Expectation |
|-----------|-------------|
| **Loading** | Preserve stage context; show progress; do not imply inputs were lost |
| **No valid plans** | Valid-empty ≠ system failure; explain restrictive constraints where supportable; allow one-tap relaxation; never silently ignore hard constraints |
| **Partial / stale data** | Disclose limits; avoid claiming complete enumeration; preserve plans where possible; no new pipeline behavior |
| **Plan becomes invalid** | Identify affected film/showing; propose focused repairs; preserve unaffected items |
| **Too many candidates** | Rank and summarize; keep access to full valid set |
| **Only one valid plan** | Present confidently; explain limited options |
| **Generation failure** | Preserve inputs; allow retry; distinguish from valid-empty |
| **Estimates unavailable** | Omit or qualify cost/travel; do not fabricate precision |
| **Hard accessibility needs** | Treat as constraints where supported; do not recommend incompatible plans |

---

## Mobile behavior

Mobile is primary.

* **Stage 1:** single-column progressive form; readable collapsed summaries; prominent generate
* **Stage 2:** stacked candidate cards; tap itinerary elements; contextual refinement without dense menus; clear undo; no hover dependence
* **Stage 3:** vertical timeline; clear gaps/transitions; non-obstructive next actions; optional calendar/list

---

## Tablet / desktop adaptation

Larger screens may show constraints beside candidates, side-by-side comparison, plan details beside sculpt controls, broader calendar visualization, persistent summaries.

Desktop must preserve the **same three-stage mental model** — not a different power-user application.

---

## Editorial design language

Consistent with Home and Film Detail ([Editorial design language](../15-editorial-design-language.md)):

**Should feel:** bright, editorial, cinematic, confident, approachable, anticipatory.

**Should not feel:** dark administrative dashboard; enterprise scheduling; tax form; generic calendar app.

Mechanics may be structured; the emotional outcome is excitement about the movie day.

---

## Accessibility

* Labels for required vs preferred inputs
* No constraint status by color alone
* Screen-reader-friendly plan sequence
* Keyboard-accessible refinement on desktop
* Adequate touch targets and focus behavior
* Accessible error explanations; reduced-motion support
* Readable local date/time; explicit timezone handling
* Understandable travel, gaps, and conflicts
* Undo support for destructive refinements

---

## Data dependencies

Conceptual only — classification from repository evidence (current Planner + `showtimes_current`).

| Dependency | Role | Maturity |
|------------|------|----------|
| Showtimes (date, time, theater, film key, runtime) | Generation input | **Currently available** |
| Theater identity | Venue selection / same-theater plans | **Currently available** |
| Client-side plan generation (valid chains) | Enumerate valid plans | **Currently available** (same-theater; result limits) |
| Required / preferred / excluded film filters | Constraints | **Currently available** |
| Start-after / finish-by / gaps / film count | Constraints | **Currently available** |
| Shareable URL state | Share / restore filters | **Currently available** |
| Format tags / presentation attributes | Ranking / display | **Partial** |
| Ticket URLs | Commitment actions | **Partial** |
| Parent/variant film grouping in pickers | Identity hygiene | **Partial** (Showtimes grouping exists; Planner Identity-E2 not started) |
| Multi-theater / travel-aware plans | Cross-venue days | **Future-facing** (engine is same-theater today) |
| Durable saved-plan persistence beyond URL | Saved / Committed | **Future-facing** / partial (URL share ≠ durable My Plan store) |
| Travel-time / distance estimates | Soft or hard travel constraints | **Future-facing** |
| Pricing / membership | Cost ranking | **Future-facing** |
| Accessibility / language attributes | Hard constraints | **Partial / future** |
| Stage 2 sculpt implementation | Direct refinement | **Future-facing** (approved product; not shipped) |
| Canonical `film_id` | Cross-source identity | **Future-facing** |
| Collaboration / notifications / calendar export | Social & sync | **Future-facing** |
| Plan provenance / revision history | Undo depth, audits | **Future-facing** |

Do **not** mark optimizer internals, travel providers, pricing, identity, or durable persistence as implemented unless the repository proves it.

---

## Optimizer boundaries

This task does **not** define:

* Optimization algorithm or scoring weights
* Route-planning or travel-time provider
* Pricing calculation
* Persistence schema
* Constraint-solving library or AI planner
* Ranking thresholds or maximum search-space behavior

Observable behavior and user expectations only.

---

## Future enhancements

Separate from baseline:

* Preference learning; A-List / membership-aware optimization
* Group planning, friend availability, collaborative voting, co-edit
* Dynamic re-optimization; real-time sold-out awareness
* Restaurant / meal-break suggestions; transit-aware plans
* Personalized format preferences
* Notifications when a saved plan becomes invalid
* Recurring weekly planning; plan history; automatic calendar export

---

## Explicit non-goals

* Implementing or modifying the current public Planner in this task
* Defining optimizer internals or production schemas
* Implementing travel calculations, ticketing, calendar, or group planning
* Finalizing every Stage 1 filter or ranking label
* Exact visual styling or copy
* Redesigning Home or Film Detail
* Global navigation redesign

---

## Open questions

| Topic | Status |
|-------|--------|
| Final names for the three stages | Open |
| Which Stage 1 constraints appear by default | Open |
| Minimum viable Stage 2 sculpt action set | Open |
| Session-only vs durable preference updates from Stage 2 | Open |
| Candidate count before progressive loading | Open |
| Grouping equivalent plans | Open |
| Required vs preferred Film Detail handoff vs live preferred semantics | Open |
| Travel-time calculation approach | Open |
| Explicit meal-break modeling | Open |
| Trustworthiness of pricing / membership for ranking | Open |
| Week-view scope | Open |
| Saved vs committed semantics | Open |
| Plan expiration and historical retention | Open |
| Undo depth / refinement history | Open |
| Communicating incomplete source coverage | Open |
| Initial collaboration boundary | Open |
| When/whether multi-theater generation becomes baseline | Open |

---

## Spec format note

Follows the canonical screen-spec pattern from [Home](./home.md) (D-17) and [Film Detail](./film-detail.md) (D-18).
