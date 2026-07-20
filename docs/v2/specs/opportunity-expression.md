# Opportunity Expression and Interaction — Canonical Specification

**Status:** Canonical product specification (D-24)  
**Authority:** Authoritative for how Opportunities are expressed and interacted with across Reel Seattle  
**Supersedes:** The standalone “Opportunity detail” placeholder in [08 — Screen specifications](../08-screen-specifications.md); deferred Opportunity Detail notes in surface specs where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Home](./home.md) · [Canonical Film Detail](./film-detail.md) · [Canonical Planner](./planner.md) · [Canonical Theater](./theater.md) · [Canonical Explore / Search](./explore-search.md) · [Opportunity model](../10-opportunity-model.md) · [Core concepts](../02-core-concepts.md) · [Entity expression](../16-entity-expression.md) · [Navigation & Interaction Model](../05-navigation.md) · [Information architecture](../04-information-architecture.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Editorial design language](../15-editorial-design-language.md) · [Experience model](../12-experience-model.md) · [Data artifact inventory](../../data-artifact-inventory.md) · [Data foundation roadmap](../../data-foundation-roadmap.md)

---

## Status and authority

This document is the **canonical product specification for Opportunity expression and interaction** in Reel Seattle v2.

It governs:

* cross-surface Opportunity behavior
* information hierarchy within an Opportunity expression
* interaction depth (compact → featured → focused contextual)
* actions and routing from an Opportunity
* states and resilience for Opportunity presentation

It is **implementation-independent**. It does **not** prescribe:

* exact pixels, CSS, animation, or typography
* component APIs or a single universal visual component
* production schemas or ingestion contracts
* ranking formulas

**Written specifications are authoritative.** Design-review artifacts may support interpretation; they do not override this document.

Conceptual philosophy in [10 — Opportunity model](../10-opportunity-model.md) and [16 — Entity expression](../16-entity-expression.md) remains useful background. Where those documents and this one diverge on Opportunity *expression and interaction*, **this specification wins**.

---

## Core product decision

> **An Opportunity is already the fully specified actionable choice. Navigation stops at the Opportunity grain; from there, users act, compare, or move to broader Film, Theater, or Planner context rather than opening a deeper Opportunity Detail page.**

Reel Seattle must **not** introduce a general-purpose **Opportunity Detail** route as a primary destination.

### Why not a standalone Opportunity Detail page

* Opportunity is already the **finest actionable grain**
* A separate page would **duplicate** Film Detail, Theater, and Planner
* It would add navigation depth **without a new user question**
* It risks chains such as Explore → Opportunity Detail → Film Detail, or Theater → Opportunity Detail → Planner
* It would make the system feel more **database-like** and less direct

A direct or shared Opportunity URL may still exist technically, but its **product behavior** should resolve into an existing canonical context, such as:

* Film Detail with the Opportunity selected and emphasized
* Theater with the film and showtime emphasized
* Planner with the Opportunity fixed
* another contextually appropriate destination

Do **not** define routing implementation in this task.

---

## Opportunity definition

Preserve the approved model ([Core concepts](../02-core-concepts.md), [Opportunity model](../10-opportunity-model.md)):

**Opportunity** =

* **Film**
* **Theater**
* **Showtime** (exact local date and time)
* **Presentation context**

Presentation context may include, where reliable:

* format
* auditorium or screen
* event type
* accessibility attributes
* language attributes
* ticket status
* ticket URL
* urgency or availability
* source-native attributes

This task does **not** redefine the underlying data model or schema.

---

## Opportunity versus related entities

| Concept | Meaning |
|---------|---------|
| **Film** | Stable cultural work / identity users recognize |
| **Theater** | Stable venue identity |
| **Opportunity** | A specific **actionable** way to experience the film |
| **Plan** | A user-selected sequence of one or more Opportunities |
| **Source observation** | Upstream evidence from which an Opportunity is constructed |

Do **not** collapse:

* Film into one Opportunity
* Theater into one source
* Opportunity into a generic showtime string
* source observation into assumed canonical truth
* Plan into one Opportunity

---

## Primary question

Opportunity expressions should answer:

> “What exactly is this way of seeing the film, and what can I do with it?”

They should **not** attempt to answer the complete Film Detail question:

> “Should I see this film?”

They should **not** duplicate the complete Theater question:

> “What is distinctive about seeing movies here, and what can I see here now?”

---

## Information hierarchy

Conceptual Opportunity information hierarchy (amount shown depends on expression depth and surface):

1. Film identity
2. Exact date and local time
3. Theater
4. Presentation or event context
5. Availability or urgency
6. Accessibility and language attributes
7. Ticket action
8. Planner action
9. Explainable reason for prominence, where applicable
10. Routes to Film or Theater context

---

## Expression depth

Reusable depth model — **not** a requirement for one universal component across surfaces.

### Compact expression

Used when space is constrained or many Opportunities are scanned.

May include:

* time
* theater or screen context
* format
* availability status
* one primary action

Examples: Film Detail showtime row; Theater program row; Planner itinerary item; compact Explore result.

### Summary expression

Used when the Opportunity deserves more context.

May include:

* film title and artwork
* theater
* date and time
* format / event
* concise reason for relevance
* ticket or Planner action

Examples: secondary Home opportunity; Explore result; Theater notable opportunity; Planner candidate plan element.

### Featured expression

Used for a scarce, editorially selected Opportunity.

May include:

* cinematic artwork
* film title
* exact or relative timing
* theater
* presentation / event context
* one explainable reason for prominence
* direct route to Film Detail

Examples: Home Top Opportunity; Film Detail Best Opportunity.

**Featured expression does not create a deeper Opportunity Detail page.**

### Focused contextual expression

Used when a user explicitly selects or shares a specific Opportunity.

May appear as:

* expanded row
* bottom sheet
* side panel
* anchored Film Detail section
* focused Planner state
* selected state within Theater

It may expose the fullest available Opportunity information, but it remains **embedded** in a canonical Film, Theater, Explore, or Planner context.

---

## Cross-surface behavior

### Home ([canonical Home](./home.md))

**Top Opportunity**

* featured expression
* one dominant story at a time
* tapping navigates to Film Detail
* the originating Opportunity is selected or emphasized
* no substantial inline expansion

**Secondary Opportunity**

* summary expression
* may expand inline for concise context
* may offer quick Planner action
* Film Detail remains the deep destination

### Explore / Search ([canonical Explore / Search](./explore-search.md))

Opportunity-aware results should:

* preserve search and filter context
* show the most relevant current Opportunity where useful
* route film-centered results to Film Detail
* route theater-centered context to Theater where appropriate
* permit fixed-showtime Planner handoff
* avoid requiring a separate Opportunity page

### Film Detail ([canonical Film Detail](./film-detail.md))

**Best Opportunity**

* featured or prominent expression
* advisory and explainable
* never hides alternatives
* can be added to Planner as a fixed showing
* can open the ticket source when a reliable URL exists

**All Showtimes**

* compact or summary expressions
* allow film-specific comparison
* may expand for contextual detail
* remain within Film Detail

### Theater ([canonical Theater](./theater.md))

**Notable Opportunities**

* summary or featured expressions
* emphasize venue-specific relevance
* route to Film Detail while preserving Theater context

**Complete program**

* compact expressions
* grouped by date and possibly screen
* support tickets and Planner
* do not duplicate Film Detail

### Planner ([canonical Planner](./planner.md))

**Stage 1**

* a specific Opportunity may enter as a fixed-showtime constraint

**Stage 2**

* Opportunity is an editable plan element
* users may keep, replace, exclude, or change it
* direct sculpting operates on the Opportunity without navigating away unnecessarily

**Stage 3**

* Opportunity is a chronological itinerary item
* actions focus on tickets, schedule, sharing, and targeted repair

---

## Shared links and deep links

A shared Opportunity should preserve enough identity to restore the intended context.

Potential product behavior:

* open Film Detail with the exact Opportunity highlighted
* display a focused Opportunity panel within Film Detail
* show unavailable or changed status if the showing is no longer actionable
* provide nearby alternatives when appropriate

### Rules

* Do **not** pretend an expired Opportunity is still actionable
* Preserve historical context only where product scope supports it
* Do **not** silently redirect to a different showing as though it were the original
* Explain if the exact Opportunity changed or disappeared

Durable shareable Opportunity identity is **future-facing** unless repository evidence proves otherwise.

---

## Interaction behavior

Potential Opportunity actions:

* Open Film Detail
* Open Theater
* Add as fixed showtime to Planner
* Add film as required
* Add film as preferred
* Open ticket link
* Share Opportunity
* Compare alternatives
* Keep this showing
* Replace this showing
* Exclude this showing or film in Planner context

### Rules

* Do **not** expose every action simultaneously
* Actions should reflect the current surface and user intent
* Film-level and Opportunity-level actions must be distinguishable
* Theater-level and ticket-level actions must be distinguishable
* A ticket link should not be confused with Film Detail navigation
* Destructive or suppressive actions should support confirmation or undo where appropriate

---

## Expand versus navigate

Preserve the approved interaction rule ([Navigation — Interaction Model](../05-navigation.md#interaction-model)):

* smaller expressions may **expand before navigate**
* high-information featured expressions may **navigate directly**
* contextual Opportunity detail should expand **within** the current canonical surface
* a new page should **not** be introduced solely to show attributes already available

---

## Navigation rule

> **Navigate upward or sideways to broader context; do not navigate downward beneath Opportunity.**

Examples:

* Opportunity → Film Detail for film context
* Opportunity → Theater for venue context
* Opportunity → Planner for scheduling context
* Opportunity → ticket source for transaction
* Opportunity → inline comparison for alternatives

**No Opportunity → Opportunity Detail route is required.**

---

## Comparison behavior

Opportunity comparison may include:

* time
* theater
* format
* event
* accessibility
* language
* travel or schedule fit
* price where reliable
* ticket status
* urgency

Comparison belongs primarily within:

* Film Detail
* Planner
* Theater where scoped to that venue
* Explore where filtering or sorting is active

Do **not** define ranking formulas.

**Best Opportunity** must remain advisory and explainable ([canonical Film Detail](./film-detail.md)).

---

## Availability and lifecycle

Conceptual Opportunity states (reconcile terminology with repository evidence; do not invent schemas):

* Upcoming
* On sale
* Available
* Almost sold out
* Sold out
* Canceled
* Changed
* Completed
* Expired
* Unknown or stale

**Current evidence:** Public `showtimes_current` includes `status` of `active` | `sold_out` (sparse sold-out population). Live UI does not fully consume ticket URL or sold-out presentation. Treat richer lifecycle vocabulary as **product language** that must map only to reliable data when implemented.

### Rules

* Do **not** fabricate availability
* Do **not** recommend a sold-out Opportunity without explanation
* Canceled or removed Opportunities should not remain actionable
* Stale data should weaken certainty
* Valid-empty schedules are not failures
* Opportunity lifecycle does **not** replace source-observation history

---

## Changed Opportunities

If an Opportunity changes:

* preserve the original user context where possible
* identify what changed
* avoid silently mutating a committed plan
* offer alternatives
* preserve unaffected Planner items
* explain whether time, venue, format, or availability changed

Do **not** define monitoring implementation.

---

## Presentation and source fidelity

Opportunity expressions should preserve exact source facts where product-relevant:

* source-owned title evidence
* local date and time
* theater identity
* source or ticket URL
* format
* event attributes
* accessibility and language
* source status

Canonical display may normalize presentation, but uncertain source distinctions must **not** be erased.

Do **not** define ingestion contracts here; reference the [data foundation roadmap](../../data-foundation-roadmap.md).

---

## States and resilience

| State | Behavior |
|-------|----------|
| **Loading** | Preserve parent surface hierarchy; avoid blocking the entire screen for one Opportunity; progressively reveal attributes |
| **Missing format** | Show the Opportunity without inventing a format |
| **Unknown auditorium** | Omit or use clearly labeled source text; do not fabricate a screen |
| **Missing ticket URL** | Preserve Film Detail, Theater, or Planner actions; do not render a broken ticket action |
| **Stale data** | Qualify availability and urgency; avoid overconfident recommendation language |
| **Canceled or removed** | Clearly mark non-actionable; preserve alternatives where available |
| **Expired shared link** | Explain that the exact showing has passed or disappeared; retain film and theater context where resolvable; offer current alternatives without pretending they are the same Opportunity |
| **Duplicate source observations** | Do not expose obvious duplicates; do not silently merge uncertain distinct presentations |
| **Partial identity** | Preserve source context; do not attach cultural or film-level claims without adequate Film identity confidence |

Do **not** invent new pipeline or stale-preservation behavior in this task.

---

## Accessibility

Product-level expectations:

* clear date and time text
* explicit local timezone where ambiguity may exist
* screen-reader-readable film, theater, time, and format grouping
* no status conveyed by color alone
* accessible labels distinguishing Film Detail, Theater, Planner, and ticket actions
* keyboard-accessible expansion and comparison
* suitable touch targets
* focus preservation when an Opportunity expands
* reduced-motion behavior
* understandable sold-out, canceled, stale, and changed states

Do **not** prescribe implementation details.

---

## Data dependencies

Conceptual dependencies — **not schemas**. Classification uses repository evidence.

| Dependency | Role | Classification |
|------------|------|----------------|
| Source film / showtime keys | Construct Opportunity grain | **Currently available** |
| Film title | Identity in expressions | **Currently available** |
| Theater ID / name | Venue in expressions | **Currently available** |
| Local date and time | Showtime grain | **Currently available** |
| Runtime | Supporting context | **Currently available** where present |
| Poster | Summary / featured expressions | **Currently available** |
| Showtime source data + pipeline health | Freshness, partial degrade | **Currently available** |
| Format tags / presentation attributes | Presentation context | **Partial** (present for a subset of showtimes) |
| Ticket URL | Ticket action | **Partial** (schema supports; public data often null; live UI does not surface) |
| Sold-out / `status` | Availability | **Partial** (sparse; limited UI consumption) |
| Auditorium / screen | Presentation context | **Partial / future** (not in public showtimes artifact; source audits only) |
| Language / accessibility attributes | Presentation context | **Partial / future** (sparse or empty in source audits) |
| Parent / variant film grouping | Cleaner film identity | **Partial** |
| Urgency / leaving-soon | Prominence reason | **Partial** (review-only leaving-soon; not shipped) |
| Stable cross-surface Opportunity identity | Share, deep link, plan repair | **Future-facing** / **partial** (no durable product identity today) |
| Canonical Film identity | Confident cultural claims | **Future-facing** |
| Canonical cross-source Opportunity identity | Deduped grain across sources | **Future-facing** |
| Reliable pricing | Comparison | **Future-facing** |
| Travel context | Comparison / Planner | **Future-facing** |
| Richer availability lifecycle | On sale / almost sold out / changed | **Future-facing** |
| Revision history | Changed Opportunity explanation | **Future-facing** |
| Durable shared Opportunity links | Share restore | **Future-facing** |
| Cultural / personalized relevance signals | Explainable prominence | **Future-facing** |

Do **not** mark Opportunity identity, shared links, availability lifecycle, or UI implementation as complete.

---

## Data-foundation boundaries

This task does **not** define:

* Opportunity schema
* source-observation contract
* identity resolution
* deduplication algorithm
* availability ingestion
* ticket-status ingestion
* auditorium resolution
* URL persistence implementation
* ranking
* stale-preservation policy
* plan repair engine

Refer to existing [data foundation roadmap](../../data-foundation-roadmap.md) items (showtime identity observations, presentation-attribute architecture, film identity, theater expansion) rather than creating competing architecture.

---

## Future enhancements

*(Separated from baseline.)*

* Durable shareable Opportunity links
* Price-aware comparison
* Seat-map or auditorium context
* Real-time availability
* Automatic Planner repair
* Friend sharing
* Ticket-acquired state
* Calendar export
* Personalized Opportunity explanations
* Alternative showing recommendations
* Notifications for changed or canceled Opportunities

---

## Explicit non-goals

This specification does **not**:

* Create a standalone Opportunity Detail page or new Opportunity route
* Implement Opportunity UI or change the public site
* Define schemas, ranking, ingestion, or deduplication
* Implement ticket purchase
* Choose exact visual styling or final interface copy
* Redesign canonical surfaces
* Lock global navigation

---

## Open questions

| Topic | Status |
|-------|--------|
| Exact stable Opportunity identifier requirements | Open — future data-foundation |
| Shared-link behavior before durable identity exists | Open — resolve into Film/Theater/Planner context |
| Minimum compact-expression fields | Open — hierarchy above is guidance |
| Which attributes justify expansion | Open |
| Initial Planner quick actions on Opportunity expressions | Open |
| How changed showtimes are represented | Open |
| Expired Opportunity retention | Open |
| Auditorium display under partial data | Open — omit/label; do not fabricate |
| Comparison behavior when formats are uncertain | Open |
| Source attribution visibility | Open |
| Exact treatment of sold-out Best Opportunities | Open — must not recommend without explanation |
| Whether event-level identity sometimes differs from showtime identity | Open |

---

## Spec format note

Follows the canonical screen-spec pattern, adapted for a **cross-surface expression** rather than a primary destination page. Complements [Home](./home.md), [Film Detail](./film-detail.md), [Planner](./planner.md), [Theater](./theater.md), and [Explore / Search](./explore-search.md).
