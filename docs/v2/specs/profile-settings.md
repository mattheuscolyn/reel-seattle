# Profile / Settings — Canonical Screen Specification

**Status:** Canonical product specification (D-25); aligned with Profile / Settings Design Review v1  
**Authority:** Authoritative for Profile and Settings product behavior  
**Supersedes:** The Settings / preferences placeholder in [08 — Screen specifications](../08-screen-specifications.md) and related TBD notes where this document is more specific  
**Related:** [v2 README](../README.md) · [Canonical Home](./home.md) · [Canonical Explore / Search](./explore-search.md) · [Canonical Film Detail](./film-detail.md) · [Canonical Theater](./theater.md) · [Canonical Planner](./planner.md) · [Canonical Opportunity expression](./opportunity-expression.md) · [Discovery model](../03-discovery-model.md) · [Information architecture](../04-information-architecture.md) · [Navigation & Interaction Model](../05-navigation.md) · [Screen specifications (conceptual)](../08-screen-specifications.md) · [Experience model](../12-experience-model.md) · [Entity expression](../16-entity-expression.md) · [Editorial design language](../15-editorial-design-language.md) · [Data artifact inventory](../../data-artifact-inventory.md) · [Data foundation roadmap](../../data-foundation-roadmap.md)

---

## Status and authority

This document is the **canonical product specification for Profile and Settings** in Reel Seattle v2.

It governs:

* product purpose and role for Profile and Settings
* information hierarchy
* behavior, states, and interaction boundaries

It is **implementation-independent**. It does **not** prescribe:

* exact pixels, CSS, final colors, or typography
* component APIs
* persistence technology
* authentication provider
* production schemas

**Written specifications are authoritative.** Design-review imagery (including Profile / Settings Design Review v1) is **supporting evidence**, not the source of truth.

There is **no Profile or Settings destination** on the current public site. This spec defines v2 product behavior without requiring immediate production UI changes ([Development operating model](../../development-operating-model.md#v2-product-design-workflow)).

Do **not** mark user accounts, status persistence, memberships, preferences, notifications, sync, or Profile UI as implemented unless the repository proves otherwise.

---

## Core separation

Document the approved distinction prominently.

| Surface | Answers |
|---------|---------|
| **Profile** | “What does Reel Seattle know about my moviegoing life, and what can I do with it?” |
| **Settings** | “How should Reel Seattle behave for me?” |

**Profile** is about:

* activity
* status
* plans
* favorites
* memberships
* taste
* preferences
* identity within the product

**Settings** is about:

* notifications
* accessibility defaults
* appearance
* privacy and data
* account and security
* connected services
* technical or application behavior

**Settings should be reachable from Profile.**

**Settings should not compete with Profile as a primary product destination.**

---

## Product role

Profile should feel like a **personal moviegoing hub**, not a generic account page.

It should help users understand and manage:

* what they have seen
* what they saved
* what they marked Not interested
* upcoming and past plans
* favorite theaters
* memberships
* preferences
* recent activity

Profile should support **re-engagement** by connecting personal history to current opportunities.

Settings should remain **clear, conventional, and secondary**.

---

## Approved high-level hierarchy

### Profile

1. Personal orientation
2. Activity snapshot
3. Upcoming plan
4. Memberships
5. Favorite theaters or other favorites
6. Film activity
7. Preferences
8. Recent activity
9. Entry to Settings

### Settings

1. Notifications and alerts
2. Accessibility
3. Appearance
4. Privacy and data
5. Account and security
6. Connected services
7. About Reel Seattle

Exact order may adapt by viewport or implementation maturity. Profile should **lead with meaningful moviegoing content** rather than settings controls.

---

## Profile regions

### Personal orientation

Restrained user orientation. Potential elements:

* display name
* initials or avatar
* city or region
* edit-profile action
* Settings entry

Rules:

* Do not make account identity dominate the screen
* Profile exists primarily to reflect **moviegoing activity**
* Baseline may work without rich social identity
* Do not require public usernames, bios, follower counts, or social graphs
* If no authenticated account system exists, Profile may begin as a **local personal hub** with limited identity treatment

Do **not** define authentication behavior in this task.

### Activity snapshot

Summarize meaningful user states such as:

* Seen count
* Not interested count
* Saved count
* Plans count

Rules:

* Counts must reflect actual durable or local state
* Do **not** show fabricated statistics
* Each summary should lead to a focused management view
* Seen and Not interested remain **separate** states
* Do **not** introduce a separate Hidden category
* Counts should remain understandable if storage is local to one device

### Upcoming plan

Surface the next relevant saved or committed plan where supported.

Potential content: date; films; first showtime; venue; time until plan; status; route to My Plan / Planner.

Rules:

* Do not duplicate the full Planner timeline
* If there is no upcoming plan, omit or replace gracefully
* Profile must **not** become a second Planner
* Disrupted or invalid plans should reflect Planner stability and repair principles ([canonical Planner](./planner.md))

### Plans

A dedicated Profile pathway may support:

* upcoming plans
* saved plans
* past plans
* expired or disrupted plans, if retained

Planner remains the canonical generation and refinement surface. Profile is the **management and history entry point**.

### Memberships

Memberships may materially affect moviegoing decisions.

Potential examples: AMC Stubs A-List; theater memberships; festival passes; loyalty programs; discount programs.

Memberships may eventually influence: estimated cost; Planner optimization; opportunity recommendations; ticketing context; remaining credits or benefits where reliable.

Rules:

* Do **not** assume membership APIs or live balances exist
* User-entered membership state may be sufficient initially
* Benefit usage or renewal dates require reliable data or explicit user input
* Do **not** fabricate credit balances, renewal dates, or savings
* Memberships should inform decisions without becoming advertisements
* Sensitive account credentials must **never** be stored in plain product-profile data

Do **not** design membership integrations in this task.

### Favorites

Favorites may include: theaters; films; filmmakers; collections; formats; recurring series.

The approved baseline should **prioritize favorite theaters** where useful — venues are central to Reel Seattle.

Rules:

* Do not require every favorite entity type initially
* Favorite status should be distinct from Saved where meaning differs
* A favorite theater may influence Explore, Home, Planner, and alerts in the future
* Profile provides management without duplicating full Theater or Film Detail content

### Film activity

Durable management of film statuses (aligned with [canonical Explore / Search](./explore-search.md)).

Approved statuses:

| Status | Meaning |
|--------|---------|
| **Seen** | “I have watched this film.” |
| **Not interested** | “Stop surfacing this to me.” |
| **Saved / interested** | Where supported — “I want to remember or consider this.” |
| **No status** | Default |

#### Seen

* Remain searchable
* May be de-emphasized in normal discovery
* May resurface for strong contextual reasons (rare formats, restorations, Q&As, anniversaries, last-chance rewatches, preferred theaters, planning with another person)
* Renewed relevance should be **explained**
* User may remove or correct Seen status

Potential future distinctions (not required in baseline): seen in theaters / elsewhere / through Reel Seattle; date seen; specific Opportunity seen.

#### Not interested

* Suppress from Home and normal Explore
* Keep reachable through explicit management
* Allow restore or status change
* Do not generate recommendation, urgency, or rewatch messaging
* Direct explicit-search treatment remains governed by Explore/Search open questions

#### Saved

* Should **not** automatically mean required in Planner
* Should **not** be conflated with favorite
* May later include films, Opportunities, plans, theaters, or searches depending on scope
* Baseline inventory limited to entity types the repository can support reliably
* Do **not** lock Saved as a global-navigation destination in this task

#### Cross-status rules

* Seen and Not interested remain separately managed
* A film should not casually hold contradictory active statuses
* Transitions should be understandable and reversible
* Strong suppressive actions should support confirmation or undo

**Current evidence:** No product Seen / Not interested / Saved status feature exists on the public site today. Behavior above is approved product direction; persistence is future-facing.

### Preferences

Preferences describe how the user generally likes to discover and attend films.

Potential groups:

* **Taste and discovery** — genres, filmmakers, tones, eras, countries, programming types, classics / new releases / repertory / events / festivals
* **Formats** — IMAX, 70mm, 35mm, Dolby Cinema, standard digital, other presentation preferences
* **Theaters** — favorite or preferred venues, acceptable travel range, chain vs independent preference
* **Accessibility** — open captions, audio description, wheelchair access, seating needs, other supported requirements
* **Language** — spoken-language preference, dubbed/subtitled, subtitle requirements
* **Rewatch behavior** — whether seen films are normally hidden, de-emphasized, or resurfaced; repertory / special-format rewatch interest
* **Planner defaults** — usual time windows, preferred film count, maximum gap, same-theater preference, travel tolerance, budget preference, preferred formats, meal-break preference

Rules:

* Hard accessibility needs must **not** be treated as mere ranking preferences where supported
* Avoid overwhelming preference setup
* Baseline product must work **without** completing a preference profile
* Preferences should be editable and explain how they influence the product
* Do not expose unsupported controls
* Learned preferences must not silently replace explicit preferences
* Personalization remains advisory and explainable ([Discovery model](../03-discovery-model.md))

### Recent activity

May include: marked Seen; saved film; created or adjusted plan; changed status; viewed Theater; recent search; membership update.

Rules:

* Aid continuity and recovery — not a surveillance-like exhaustive log
* User should understand what is stored
* Retention and deletion controls belong under Privacy and Data
* Do **not** require cross-device sync in the baseline

---

## Settings regions

### Notifications and alerts

Potential categories: newly added opportunities; leaving soon; saved-search matches; followed theater updates; plan changes; canceled or changed showtimes; ticket reminders; upcoming plan reminders.

Rules:

* Require **explicit consent**
* Fine-grained controls where notifications exist
* Do not treat marketing as product-critical alerts
* Baseline Profile must work **without** notifications
* Saved-search alerts remain **future-facing** unless separately supported

### Accessibility

Application-level defaults may include: text size; reduced motion; increased contrast; caption-related defaults; screen-reader optimizations; time-format preference; other supported assistive behavior.

Rules:

* Respect platform-level accessibility settings by default
* Do not require unnecessary duplication of OS settings
* Accessibility settings should not be hidden under generic preferences
* Hard moviegoing accessibility needs may also affect Explore and Planner constraints

### Appearance

Potential controls: system; light; dark; text density; artwork intensity or reduced imagery if later justified.

Rules:

* Do not assume the approved dark cinematic product direction eliminates appearance choice
* Exact theme system is not defined here
* Appearance must not compromise readability or accessibility

**Current evidence:** No theme toggle or appearance settings UI on the public site today (`prefers-reduced-motion` is respected in CSS).

### Privacy and data

Potential controls: what activity is stored; local vs account sync; export data; clear Seen / Not interested / recent searches; delete plans; delete account; personalization controls; analytics consent; location permissions.

Rules:

* Privacy should be understandable and user-controlled
* Avoid dark patterns
* Seen and Not interested data may materially shape discovery and must be manageable
* Do not claim advertiser sharing or third-party practices not established by the product
* Do not define legal policy language in this task

### Account and security

Potential controls: email; password; sign-in method; devices; session management; account deletion.

Rules:

* Only expose controls supported by the eventual account model
* Do not require an account for all baseline functionality unless separately approved
* Local-only mode remains a possible product direction
* Authentication implementation is **out of scope**

### Connected services

Potential future integrations: calendar; ticketing providers; Letterboxd; IMDb; AMC or theater memberships; maps; email; notification providers.

Rules:

* Future-facing unless repository evidence proves otherwise
* Integration must be explicit and revocable
* Do not imply access to third-party watch history or membership balances without real integration
* External IDs used for Film identity are **not** automatically user-account integrations

### About Reel Seattle

May include: product information; version; data sources; attribution; support; feedback; privacy policy; terms; open-source or repository information where appropriate.

Do not define legal copy in this task.

---

## Profile versus Settings routing

* Profile is the **primary personal hub**
* Settings is reached from Profile through a clear Settings action
* Settings should use a conventional nested navigation model
* Returning from Settings should preserve Profile context
* Deep links may open a specific Settings section where appropriate
* Settings does **not** need its own global-navigation destination

---

## Global-navigation implication

→ **Resolved by [canonical Global navigation](./global-navigation.md)** (D-26).

* Primary destinations: **Home · Explore · Planner · Profile**
* Profile is a **primary** mobile destination
* Saved, Theater, and Settings are **not** permanent bottom-navigation tabs
* Settings remains nested under Profile

Chrome, icons, and routes remain implementation-deferred; destination membership is canonical.

---

## Relationship to other surfaces

### Home

Profile may influence Home through: Seen de-emphasis; Not interested suppression; favorite theaters; saved items; memberships; future preferences and personalization.

Home remains a **shared editorial surface** and must work without Profile data. Personalization must not erase common Seattle-wide editorial judgment ([canonical Home](./home.md)).

### Explore / Search

Explore owns discovery and comprehensive status interaction. Profile owns **management and overview** of those statuses.

Examples: mark Seen from an Explore result; manage all Seen films in Profile; mark Not interested from a result; restore it in Profile; save in Explore; review Saved in Profile.

Do not duplicate the entire Explore experience inside Profile ([canonical Explore / Search](./explore-search.md)).

### Planner

Profile may provide: upcoming / past plans; Planner defaults; memberships; preferred theaters and formats; accessibility needs.

Planner remains responsible for: generating valid plans; candidate comparison; Stage 2 sculpting; committed itinerary detail ([canonical Planner](./planner.md)).

Profile should route into Planner rather than reproduce its workflows.

### Theater and Film Detail

Profile may manage favorite theaters, saved films, Seen, Not interested, and recently viewed entities. Deep content still belongs in [canonical Theater](./theater.md) and [canonical Film Detail](./film-detail.md).

---

## States and resilience

| State | Behavior |
|-------|----------|
| **No personal data** | Remain useful and inviting; explain how activity will appear; do not display empty dashboards full of zeros; provide clear routes to Explore and Planner |
| **Local-only data** | Explain that data is stored on this device where relevant; do not imply cross-device sync |
| **Signed-out** | Preserve available local functionality; offer sign-in only where it provides real benefit; do not block baseline discovery unnecessarily |
| **Partial sync** | Identify which data is local vs synced; avoid silently overwriting newer user activity |
| **Loading** | Preserve section hierarchy; load activity cards progressively; avoid fabricating counts |
| **Missing membership details** | Show only user-entered or verified facts; do not fabricate balances |
| **No upcoming plan** | Omit or replace with a Planner invitation |
| **Deleted or unavailable entities** | Preserve status history carefully where possible; identify unavailable films/theaters without broken cards; allow cleanup |
| **Persistence failure** | Retain attempted change visibly until confirmed; provide retry; avoid falsely claiming success |
| **Privacy-disabled personalization** | Preserve full baseline product usefulness; do not nag repeatedly |

---

## Mobile behavior

Mobile is the primary design target.

**Profile:** single-column overview; concise activity cards; clear Settings access; upcoming plan near the top when present; memberships and favorites scannable; deeper lists via focused management views.

**Settings:** conventional stacked rows; clear section labels; progressive detail; no dense dashboard; destructive controls separated and confirmed.

No interaction should depend on hover.

---

## Desktop and tablet adaptation

Larger screens may support: Profile side navigation; overview dashboard; activity and membership panels side by side; persistent Settings section navigation; broader favorite-theater and recent-activity views.

Desktop should preserve the same conceptual hierarchy and **not** become an administrative console.

---

## Editorial design language

Profile should inherit Reel Seattle’s approved language ([Editorial design language](../15-editorial-design-language.md)):

* dark
* cinematic
* personal
* calm
* editorial
* actionable
* clear

It should feel like the user’s **personal Seattle-cinema journal and control center**.

It should **not** feel like: a generic social-media profile; an analytics dashboard; a loyalty-program advertisement; an enterprise settings console; a cluttered account page.

Settings may be visually quieter and more conventional than Profile while remaining part of the same product.

Do **not** turn this into exact color or styling requirements.

---

## Accessibility

Product-level expectations:

* accessible heading hierarchy
* clear labels for Seen, Not interested, Saved, and Plans
* no status conveyed by color alone
* keyboard-accessible desktop navigation
* mobile touch targets
* screen-reader-friendly counts and activity summaries
* explicit confirmation for destructive actions
* undo where appropriate
* readable contrast
* reduced-motion support
* accessible notification controls
* accessible theme and text-size behavior
* preservation of focus after status changes
* clear indication of local versus synced state

Do **not** prescribe implementation details.

---

## Data dependencies

Conceptual dependencies — **not schemas**. Classification uses repository evidence.

| Dependency | Role | Classification |
|------------|------|----------------|
| Theater registry | Favorite theaters, referenced venues | **Currently available** |
| Film / Opportunity / showtime data | Render referenced items when activity exists | **Currently available** |
| Shareable Planner URL filter state | Plan-related share continuity (not a Profile store) | **Currently available** |
| Shareable Showtimes URL filter state | Browse continuity (not a Profile store) | **Currently available** |
| `prefers-reduced-motion` CSS respect | Accessibility baseline | **Currently available** (platform preference; not a Settings UI) |
| Theme / appearance Settings UI | Appearance section | **Future-facing** (no theme toggle in public UI today) |
| Marathon legacy `localStorage` filter migration | Historical Planner redirect only | **Partial** (not a Profile persistence model) |
| Parent / variant film grouping | Cleaner film-status behavior | **Partial** |
| Stable links to Film / Theater entities | Activity and favorite management | **Partial** (IDs exist; durable personal links future) |
| Durable user identity / accounts | Account and security | **Future-facing** |
| Cross-device sync | Multi-device Profile | **Future-facing** |
| Durable Seen / Not interested / Saved / favorite persistence | Film activity, favorites | **Future-facing** |
| Membership model | Memberships section | **Future-facing** |
| Preference model | Preferences section | **Future-facing** |
| Notification infrastructure | Notifications settings | **Future-facing** |
| Plan history beyond URL share | Plans / upcoming plan | **Future-facing** |
| Activity history | Recent activity | **Future-facing** |
| Connected services | Connected services settings | **Future-facing** |
| Privacy controls / data export / deletion | Privacy and data | **Future-facing** |
| Personalization / preference learning | Home / Explore influence | **Future-facing** |
| Canonical Film identity | Reliable status across sources | **Future-facing** |

Do **not** guess. Do **not** mark accounts, status persistence, memberships, preferences, notifications, sync, or Profile UI as complete.

---

## Data-foundation boundaries

This task does **not** define:

* user-profile schema
* account model
* authentication provider
* persistence technology
* synchronization
* membership integrations
* preference-learning algorithms
* recommendation models
* notification service
* privacy-policy language
* activity-event schema
* connected-service APIs
* canonical Film identity

Refer to existing [data foundation roadmap](../../data-foundation-roadmap.md) work rather than creating competing architecture. Personal-data and persistence dependencies belong on that roadmap when scheduled — not as duplicate items invented here.

---

## Future enhancements

*(Separated from baseline.)*

* Cross-device sync
* Letterboxd import or export
* Deeper viewing history
* Rewatch frequency preferences
* Annual moviegoing summaries
* Favorite filmmakers
* Friend or household planning
* Shared memberships
* Collaborative plans
* Notification center
* Account-free encrypted backup
* Ticket-history imports
* Personal statistics
* Optional public profile
* Data export

---

## Explicit non-goals

This specification does **not**:

* Implement Profile or Settings
* Modify current public UI
* Lock global navigation
* Define authentication or production schemas
* Implement status persistence, memberships, notifications, personalization, or connected services
* Build social features
* Choose exact visual styling or final interface copy
* Redesign other canonical surfaces

---

## Open questions

| Topic | Status |
|-------|--------|
| Minimum viable Profile without accounts | Open — local personal hub is allowed |
| Local-only versus account-backed baseline | Open |
| Initial Profile sections for MVP | Open — hierarchy above is guidance |
| Whether Saved includes films only or multiple entity types | Open |
| Favorite versus saved semantics | Open — keep distinct where meaning differs |
| Minimum viable preference inventory | Open |
| Planner-default persistence | Open |
| Membership entry and verification | Open — no fabricated balances |
| Seen granularity | Open — deeper fields future |
| Recent-activity retention | Open |
| Profile empty state copy and routes | Open |
| Notification scope | Open — future-facing infrastructure |
| Cross-device sync | Open |
| Privacy and data-deletion behavior | Open |
| Connected-service priorities | Open |
| Whether public or social identity ever belongs in Profile | Open — baseline does not require it |
| Final global-navigation decision | **Resolved (D-26):** Home · Explore · Planner · Profile — see [global-navigation.md](./global-navigation.md) |

---

## Spec format note

Follows the canonical screen-spec pattern from prior D-17–D-24 work. Profile and Settings are specified together because Settings is a **nested secondary surface** reached from Profile, not a competing primary destination.
