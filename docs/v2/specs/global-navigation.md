# Global Navigation — Canonical Specification

**Status:** Canonical product specification (D-26); aligned with Global Navigation Design Review v1  
**Authority:** Authoritative for Reel Seattle’s global navigation  
**Supersedes:** Deferred primary-destination / chrome notes in [05 — Navigation](../05-navigation.md), and “global navigation unresolved” statements in surface specs where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Home](./home.md) · [Canonical Explore / Search](./explore-search.md) · [Canonical Film Detail](./film-detail.md) · [Canonical Theater](./theater.md) · [Canonical Planner](./planner.md) · [Canonical Profile / Settings](./profile-settings.md) · [Canonical Opportunity expression](./opportunity-expression.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications](../08-screen-specifications.md) · [Experience model](../12-experience-model.md) · [Entity expression](../16-entity-expression.md) · [Editorial design language](../15-editorial-design-language.md) · [Data foundation roadmap](../../data-foundation-roadmap.md)

---

## Status and authority

This document is the **canonical product specification for Reel Seattle’s global navigation**.

It governs:

* primary destinations
* secondary-destination access
* responsive adaptation
* navigation state
* deep-link and back behavior

It is **implementation-independent**. It does **not** prescribe:

* exact pixels, final icons, colors, typography, or animation
* routing libraries or production component APIs
* URL schemas or browser-history implementation details

**Written specifications are authoritative.** Design-review imagery is supporting evidence only.

Conceptual philosophy in [05 — Navigation](../05-navigation.md) remains useful background (progressive depth, expand-before-navigate, interaction model). Where that document and this one diverge on **primary destinations and chrome**, **this specification wins**.

**Current evidence:** The live public site navigates primarily between Showtimes (`/`) and Planner (`/planner`) ([`src/appNav.js`](../../../src/appNav.js)). This v2 specification defines the approved navigation model without requiring immediate production UI changes.

Do **not** mark navigation implementation, Profile persistence, Search utilities, alerts, or deep-link restoration as complete unless the repository proves otherwise.

---

## Decision goal

Global navigation should help users move quickly among Reel Seattle’s four core jobs:

* understand what **deserves attention**
* **investigate** what is available
* **build and manage** movie plans
* manage **personal moviegoing context**

Primary navigation is **not** a complete site map.

---

## Approved primary mobile navigation

> **Authoritative for v2 Home chrome (I-04C):** **Home · Explore · Planner · Profile**.
> Movies and Theaters are **not** primary tabs. “Me” is not used — use **Profile**.
> A temporary five-tab experiment (I-04M) was reversed by product-owner correction.

The D-26 canonical mobile primary destinations are:

1. **Home**
2. **Explore**
3. **Planner**
4. **Profile**

Approved conceptual order:

> **Home · Explore · Planner · Profile**

### Film Detail and origin

Film Detail is a **contextual deep surface**, not a child of Explore. When opened from Home, **Home remains the active primary**. When opened from Search or another Explore surface, **Explore remains active**. When opened from Planner, **Planner remains active**. Back restores the originating destination and, where captured, prior query/filters/expansion/scroll state.

**I-06FD implementation note:** Designed Film Detail uses origin-aware header Back labels (Home / Explore / Search / Planner) and keeps Opportunity Detail + showtimes views as scaffolds only.

### Home

**Primary question:** “What deserves my attention?”

**Role:** shared editorial awareness; current Seattle cinema briefing; notable and time-sensitive opportunities; entry into Film Detail, Theater, Planner, and Explore ([canonical Home](./home.md)).

### Explore

**Primary question:** “What movies, theaters, formats, and experiences match what I care about?”

**Role:** comprehensive user-directed discovery; search; filtering; browse-by pathways; Theater discovery; Formats and Experiences; Collections; Coming Soon; Special Events ([canonical Explore / Search](./explore-search.md)).

**I-05E / I-05E2 landing (implementation note):** Explore is the home for Movies, Theaters, Formats, Collections, Coming Soon, Special Events, Search, Suggested Starts, and Film Activity (Seen / Not interested). Those are Explore-associated surfaces (scaffolds today), not primary tabs. Landing order: Search → Quick Start → Browse By → Suggested Starts → Your Film Activity → Recent Searches. Film Detail opened from Explore keeps Explore active and remains a contextual surface. Recent searches, Seen, and Not interested are device-local until a synced Profile system exists.

### Planner

**Primary question:** “What’s the best movie day I can make?”

**Role:** constraint-based plan generation; candidate comparison; Stage 2 plan sculpting; saved or committed plan management ([canonical Planner](./planner.md)).

### Profile

**Primary question:** “What does Reel Seattle know about my moviegoing life, and what can I do with it?”

**Role:** Seen; Not interested; Saved; plans; favorites; memberships; preferences; recent activity; entry to Settings ([canonical Profile / Settings](./profile-settings.md)).

---

## Why four destinations

* each destination represents a distinct high-frequency user job
* the mental models do not materially overlap
* four destinations preserve clarity and one-hand usability
* the structure balances shared editorial discovery with personal context
* Planner remains prominent as a signature product capability
* the model leaves room for secondary destinations without crowding primary navigation
* fewer strong destinations are preferable to adding a fifth item merely to fill space

Do **not** add Movies, Theaters, or Me as permanent primary mobile tabs.

---

## Secondary destinations

Theater, Saved, Search, and Settings remain important destinations or capabilities. They are reached **contextually** from the four primary destinations rather than occupying permanent mobile navigation slots.

### Theater

Reached through: Explore browse-by; search; Home venue-oriented opportunities; Film Detail; Planner venue context; shared links.

Theater remains a **canonical product surface** ([canonical Theater](./theater.md)) but is **not** a permanent mobile-navigation tab.

**Rationale:** A dedicated Theater tab would duplicate Explore’s role and privilege one browse category over Formats, Collections, and Events.

### Search

Search is a **mode and power action within Explore**.

Rules:

* Explore must make search immediately discoverable
* Search may also be exposed through a global utility action on larger screens or future mobile treatments
* Search does **not** require a separate permanent mobile tab
* Search state belongs to Explore

### Saved

Saved is managed primarily through Profile and may also appear contextually within Film Detail, Explore, Theater, and Planner.

Rules:

* Saved is **not** a permanent mobile-navigation destination in the canonical baseline
* This does not diminish Saved as a product capability
* If future evidence shows Saved is a frequent independent destination, the navigation decision may be revisited **deliberately**
* Do not preemptively add a fifth tab

### Settings

Settings is reached from Profile ([canonical Profile / Settings](./profile-settings.md)).

Rules:

* Settings is nested and secondary
* Settings does **not** receive a permanent navigation tab
* Returning from Settings should preserve Profile context

### Film Detail

Reached contextually from Home, Explore, Theater, Planner, and shared links.

Film Detail is a **deep decision surface**, not a global destination ([canonical Film Detail](./film-detail.md)).

### Opportunity

Opportunity is **not** a standalone navigation destination.

It is expressed contextually within canonical surfaces ([canonical Opportunity expression](./opportunity-expression.md)).

### Formats and Experiences

Reached through Explore and contextual links from Home, Film Detail, Theater, or opportunity expressions.

### Collections

Reached through Explore, Home editorial modules, Film Detail, Profile Saved/Favorites where supported, and shared links.

### Coming Soon and Special Events

Reached primarily through Explore and relevant Home modules.

---

## Global actions versus destinations

| Kind | Meaning |
|------|---------|
| **Destinations** | Stable product areas (the four primary tabs) |
| **Global actions** | Utilities that may be available from multiple destinations |

Potential global actions: Search; alerts or notifications; messages or collaboration if ever supported; account/avatar access; location or city context; create/add action where later justified.

Rules:

* Global actions must not be confused with permanent destinations
* Do not include future actions in baseline navigation merely because they appeared in exploratory mockups
* Search is currently the only strongly justified cross-product utility; its baseline home remains Explore
* Alerts and messages are **future-facing** unless repository evidence supports them
* Global utility placement remains an implementation and responsive-design question

---

## Mobile navigation behavior

The mobile primary navigation should use a **stable bottom navigation** pattern unless later implementation evidence requires another accessible solution.

Product-level behavior:

* the four destination labels remain stable across all canonical screens
* destination order remains stable: Home · Explore · Planner · Profile
* the active destination is clearly indicated
* the user can move between primary destinations with one action
* labels should remain **visible** rather than relying on icons alone
* deep screens may preserve the bottom navigation where it does not create ambiguity or crowding
* modal, focused, transactional, or nested settings states may temporarily reduce or hide global navigation where appropriate
* hiding global navigation must **not** strand the user

Planner occupies a prominent central position conceptually because it is a signature capability.

Do **not** prescribe exact widths, icon positions, or visual emphasis.

---

## Navigation persistence across deep surfaces

### Film Detail

* Preserve the originating primary destination when possible
* Back returns to the prior Home, Explore, Theater, Planner, or Profile context
* The active primary destination may remain the **origin** destination rather than treating Film Detail as its own tab
* Direct deep links require a sensible default global-navigation state

### Theater

* Usually belongs to **Explore** context when reached through browsing
* May preserve Home, Planner, or Film Detail origin in back behavior
* Not assigned its own permanent tab

### Settings

* Belongs under **Profile**
* Back returns to Profile
* Profile remains the active primary destination

### Planner stages

* Generate Plans, Candidate Plans / Sculpt Mode, and My Plan all remain within Planner
* The active destination does **not** change between stages

### Film Activity management

* Seen, Not interested, Saved, Favorites, Plans, and preferences management belong under **Profile**
* Contextual status actions may occur elsewhere without changing the primary destination

---

## Deep links

Direct links may open: Film Detail; Theater; Planner plan or fixed-showtime state; Explore query or filter state; Profile management subsection where authentication and persistence later permit; contextual Opportunity state.

Rules:

* Deep links should open the relevant **canonical surface**, not invent new navigation destinations
* Provide a clear route back to an appropriate primary destination
* Deep-link entry must not imply a nonexistent prior navigation stack
* If context is unavailable, choose a defensible default parent:
  * Film Detail → Explore or Home (exact default open)
  * Theater → Explore
  * Settings → Profile
  * Opportunity → Film Detail or other canonical context ([opportunity expression](./opportunity-expression.md))
  * Plan → Planner
* Exact routing implementation is out of scope

---

## Back behavior

* Back should return the user to the prior **meaningful** context
* Search terms, filters, sort, selected date, scroll position, and expanded state should be preserved where practical
* Back should not unexpectedly reset Explore or Planner work
* Nested Settings should return to the prior Settings list or Profile
* A user entering from a deep link should not be sent to an unrelated or nonexistent prior screen
* Browser and platform back conventions should be respected

---

## State restoration

Each primary destination should preserve useful working context during a session.

| Destination | Preserve (session) |
|-------------|-------------------|
| **Home** | Reasonable scroll; current Top Opportunity selection where practical; refresh stale content per data-health rules |
| **Explore** | Query; filters; sort; result position; entity path |
| **Planner** | Stage 1 inputs; candidate selection; Stage 2 sculpting state; current plan; unsaved changes where feasible |
| **Profile** | Selected subsection; management filters; Settings return point |

Do **not** define persistence technology.

---

## Re-entry behavior

When a user taps the already-active destination, potential behavior may include: return to destination root; scroll to top; preserve current nested state; show a contextual root action.

Exact behavior remains **open**. Do not invent inconsistent behavior by destination. Capture as an implementation decision requiring later usability validation.

---

## Responsive adaptation

### Mobile

* stable four-item bottom navigation
* labels and icons
* one-hand reach
* no hidden overflow for primary destinations
* clear active state

### Tablet

May use: bottom navigation in portrait; top navigation; compact rail; responsive hybrid.

Rules:

* preserve the same four primary destinations
* do not introduce extra primary destinations solely because more space exists
* secondary utilities may become more visible

### Desktop

Use top-level navigation expressing the same four destinations: Home · Explore · Planner · Profile.

Desktop may additionally expose utility actions such as: Search; location context; account/avatar; future alerts.

Rules:

* the information architecture remains the same
* desktop must **not** canonize Theater, Saved, Collections, or Settings as peers merely because space is available
* secondary destinations may appear in contextual menus, side navigation, Explore modules, or Profile navigation
* active state remains visible
* content width and navigation chrome should preserve the editorial design language

---

## Profile without accounts

Profile remains a canonical destination even before authentication or durable personal data exists.

* Profile may begin as a **local personal hub**
* it should not be an empty account shell
* it may show locally available Planner state, statuses, preferences, or invitations to begin using the product
* unsupported counts or histories must not be fabricated
* sign-in should only be emphasized when it offers a real benefit
* the navigation decision does **not** require accounts to ship simultaneously

If Profile cannot provide meaningful baseline value in an early implementation slice, it may be temporarily staged behind a feature flag or simplified treatment, but the **canonical navigation direction remains unchanged**.

Do not define rollout behavior beyond product-level caution.

---

## Planner prominence

Planner remains primary because:

* it is a signature differentiator
* it serves a distinct user job not covered by Home or Explore
* it converts discovery into action
* its three-stage experience benefits from direct re-entry
* burying Planner inside Explore would weaken the product model

---

## Navigation labels

Canonical working labels:

* **Home** (not “Showtimes” as the v2 primary label)
* **Explore** (not “Movies”)
* **Planner**
* **Profile** (not “Me”)

### Explore versus “Movies”

Explore includes films, theaters, formats, collections, events, search, and filters. “Movies” would understate its scope.

### Profile versus “Me”

Profile is clearer and more conventional; it communicates activity, preferences, plans, memberships, and settings. “Me” was used inconsistently in exploratory designs and is not canonical.

Treat these labels as approved for canonical product documentation. Final microcopy and localization remain implementation concerns, but future design artifacts should use these names consistently unless a later scoped decision changes them.

---

## Accessibility

* visible text labels
* no active destination conveyed by color alone
* keyboard-accessible desktop navigation
* screen-reader announcement of active destination
* suitable touch targets
* logical focus order
* support for text scaling
* no critical destination hidden in gesture-only interactions
* reduced-motion support
* consistent placement
* clear deep-screen back navigation
* understandable distinction between destinations and global actions

Navigation should remain usable when: text is enlarged; icons fail to load; Profile has no account; Search is unavailable; one destination has limited data.

---

## States and resilience

| State | Behavior |
|-------|----------|
| **Loading destination** | Navigation chrome remains stable; switching destinations should not produce misleading active states; avoid blank full-screen transitions where possible |
| **Destination unavailable** | Do not remove or reorder navigation dynamically without strong reason; show useful unavailable/retry state; preserve access to other destinations |
| **Offline or stale data** | Navigation remains functional; each destination handles data limitations per its canonical spec |
| **Profile unavailable or not configured** | Show a meaningful local or introductory Profile state; do not relabel or replace the tab inconsistently |
| **Planner unsaved changes** | Navigation away may preserve draft state; warn only when actual loss is likely; do not interrupt unnecessarily |
| **Authentication boundary** | Sign-out must not silently erase local-only data without clear explanation; exact account behavior is out of scope |

---

## Data dependencies

Minimal direct data dependencies. Classification uses repository evidence.

| Dependency | Role | Classification |
|------------|------|----------------|
| Existing public routes / nav patterns | Live Showtimes + Planner shell | **Currently available** (subset of v2 model) |
| Browser history | Back behavior | **Currently available** |
| Static theater / showtime data | Destination content | **Currently available** |
| Stable deep links | Entry to Film/Theater/Planner/Explore | **Partial** |
| Planner URL state restoration | Planner session continuity | **Partial** (URL filters; not full stage state) |
| Route-level scroll / filter restoration | Explore / Home continuity | **Partial** |
| Responsive navigation chrome for four destinations | v2 shell | **Future-facing** (not implemented) |
| Profile data | Profile destination content | **Future-facing** |
| Durable Saved state | Profile / contextual Save | **Future-facing** |
| Accounts | Auth-aware Profile | **Future-facing** |
| Notifications / messages | Global utility actions | **Future-facing** |
| Cross-device navigation state | Sync | **Future-facing** |
| Deep links into personal subsections | Profile management | **Future-facing** |

Do not guess.

---

## Implementation boundaries

D-26 does **not** define:

* router library
* navigation component API
* icon set
* exact tab-bar dimensions
* animations
* URL schema
* browser-history implementation
* authentication
* alerts
* messages
* Saved persistence
* Profile persistence
* feature flags
* analytics instrumentation

---

## Future enhancements

*(Must not alter the four-destination mental model without a future deliberate product decision.)*

* Contextual global search action
* Alerts or notification center
* Collaboration or messages
* Location switching
* Adaptive shortcuts
* Recently used destinations
* Command palette on desktop
* Account avatar menu
* Installable-app conventions
* Platform-specific navigation enhancements

---

## Explicit non-goals

This specification does **not**:

* Implement navigation or modify the public site
* Lock final iconography
* Add a fifth tab
* Implement Search as a separate destination
* Make Theater, Saved, or Settings a global tab
* Define authentication or Profile persistence
* Define exact responsive breakpoints
* Redesign canonical screens
* Define route implementation or analytics

---

## Open questions

| Topic | Status |
|-------|--------|
| Whether tapping the active tab returns to root or scrolls to top | Open |
| Whether Film Detail deep links default to Home or Explore parent context | Open |
| Whether mobile exposes a separate global Search utility | Open — Explore remains Search’s home |
| When global navigation hides on focused or modal screens | Open |
| Whether tablet uses bottom navigation, rail, or top navigation | Open — same four destinations |
| Exact desktop utility actions | Open |
| Profile early-rollout behavior before durable personal data | Open — canonical destination unchanged |
| Whether Saved eventually proves frequent enough to revisit navigation | Open — deliberate revisit only |
| Alert placement if notifications ship | Open |
| Location-switching behavior | Open |
| Route and state restoration details | Open |
| Final iconography | Open |

---

## Spec format note

Follows the canonical screen-spec pattern. Complements [05 — Navigation](../05-navigation.md) (interaction philosophy) by locking **primary destinations and access paths** without prescribing chrome implementation.
