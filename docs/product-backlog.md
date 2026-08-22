# Reel Seattle Product Backlog

This document is the canonical list of outstanding product, UX, logic, and polish work for Reel Seattle.

## How to use this backlog

- Treat this file as the source of truth for outstanding product work.
- New notes should be added here before they are considered tracked.
- When work starts, update `Status` from `Outstanding` to `In Progress`.
- When work is shipped and verified, update `Status` to `Done` rather than deleting the row immediately.
- Prefer quick wins first, but do not spend time polishing surfaces that are likely to be replaced by larger redesigns.

### Status values

`Outstanding` · `Ready` · `In Progress` · `Blocked` · `Done`

### Effort guide

`XS` = very small fix · `S` = small · `M` = medium · `L` = large · `XL` = major product/data work

---

# Current recommended order

1. Quick-win broken interactions and visible polish
2. Shared top bar / back button / bottom nav consistency
3. Film activity consolidation: Saved + Seen + Not Interested
4. Browse All Showtimes redesign and shared filter model
5. Film-specific showtimes + theater-context behavior
6. Home / Opening This Week logic and card semantics
7. Film Detail "Why See It Now" logic audit
8. Profile / Settings information architecture
9. My Schedule / Planner full UX audit
10. Leaving Soon data model and longer-term personalization/ranking work

---

# Quick wins / broken behavior

| ID | Area | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|---|
| QW-01 | Film Detail | "Why See It Now" → "See all" does nothing | Bug | High | XS-S | Done | Inline expand/collapse when more than preview signals exist. |
| QW-02 | Film Detail | "Best Way To See It" showtime card visually bleeds outside its container | Visual bug | High | XS-S | Done | CSS/layout containment issue. |
| QW-03 | Film Detail / Showtimes | Audio Description is listed under every showtime for some films | Data/UI correctness | High | S-M | Done | Theater-row chip union fixed to shared-only labels. |
| QW-04 | Film Detail | Newly Added tag is cut off | Visual bug | High | XS | Done | Badge/container clipping. |
| QW-05 | Opening This Week | First film card starts in the expanded/"opened" interaction state | Bug | High | XS | Done | Initial state should be collapsed. |
| QW-06 | Opening This Week | Sort button does not work | Bug | High | S | Done | Opening date / Title A–Z / Most showtimes / Most theaters. |
| QW-07 | Opening This Week | Filter button does not work | Bug | High | S | Done | Theater / format / opening day filters. |
| QW-08 | Theaters | First theater card starts expanded on page load | Bug | High | XS | Done | Initial state should be collapsed. |
| QW-09 | Theaters | "View all" under Now Showing does not work | Bug | High | S | Done | Opens showtimes browse with theaterIds preselected. |
| QW-10 | Theaters | Remove Save button | Cleanup | Medium | XS | Done | Favorite is the intended theater-level action. |
| QW-11 | Theaters | Favorite button does not work | Bug | High | S-M | Done | Uses device-local favoriteTheatersStore. |
| QW-12 | Profile | Settings gear in top-right does nothing | Cleanup | Medium | XS | Done | Probably remove because settings navigation already exists on page. |
| QW-13 | Explore | Remove gradients from Seen and Not Interested buttons | Visual polish | Medium | XS | Done | Replace with normal Reel Seattle surface/button styling. |
| QW-14 | Explore | Copy says "Activity stays on this device" even though accounts/sync now exist | Copy correctness | High | XS | Done | Rewrite to reflect current behavior accurately. |
| QW-15 | Overall | TMDB data credit looks awkward/unprofessional where it appears | Visual system | Medium | S | Done | Shared muted TmdbAttribution treatment. |
| QW-16 | Browse All Showtimes | Theater name link underline feels sloppy in expanded detail | Visual polish | Medium | XS-S | Done | Accent link without default underline; hover underline + focus ring. |
| QW-17 | Browse All Showtimes | Showtime pills do nothing on click | Interaction bug | High | S-M | Outstanding | At minimum expose Add to Calendar / Add to My Schedule / Tickets actions. |

---

# Shared navigation and shell consistency

| ID | Area | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|---|
| SYS-01 | Overall | Back button styling is inconsistent across pages | Design system | High | M | Outstanding | Create one canonical back-button component/variant set. |
| SYS-02 | Overall | Bottom navigation bar is inconsistent | Design system / navigation | High | M | Outstanding | Every child page should declare its owning root destination. |
| SYS-03 | Overall | Top bar is inconsistent | Design system | High | M | Outstanding | Standardize root vs child page headers. |
| SYS-04 | Opening This Week | Explore tab is highlighted even though back goes to Home | Navigation bug | High | S | Done | Opening uses originPrimary for active nav. |

---

# Home Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| HOME-01 | Implement the actual designed ranking for Top Opportunity | Logic / ranking | High | M-L | Outstanding | Needs a formal scoring/ranking model rather than arbitrary ordering. |
| HOME-02 | Correct Opening This Week logic | Logic / data definition | High | M | Outstanding | Define what "opening this week" means: Seattle first screening, theatrical release, theater-specific opening, repertory return, etc. |
| HOME-03 | Create a real Leaving Soon data model | Data model | High | XL | Outstanding | Should not be arbitrary dates; likely ties to booking cadence / survival-risk work. |
| HOME-04 | Find a real location/role for Browse All Showtimes instead of the current lazy button | IA / design | High | M | Outstanding | May change after Browse All Showtimes becomes a first-class power surface. |
| HOME-05 | Rework Quick Paths at bottom | IA / design | High | M | Outstanding | Decide what is missing, what can consolidate, and what is redundant. |
| HOME-06 | Consolidate Saved + Seen + Not Interested rather than exposing them as separate concepts | IA | High | M | Outstanding | Track with ACT-01. |
| HOME-07 | Reconsider Search as a Quick Path because it may be redundant | IA | Medium | S-M | Outstanding | Decide after global search and showtimes navigation are reviewed. |

---

# Film Detail Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| FILM-01 | Perform a formal review of "Why See It Now" logic | Logic / product | High | M-L | Outstanding | Define allowed reasons, evidence thresholds, priority, copy, confidence, and whether reasons stack. |
| FILM-02 | Fix "Why See It Now" See All behavior | Bug | High | XS-S | Done | Same as QW-01. |
| FILM-03 | Fix "Best Way To See It" card visual bleed | Visual bug | High | XS-S | Done | Same as QW-02. |
| FILM-04 | Fix Audio Description being shown on inappropriate showtimes | Data/UI correctness | High | S-M | Done | Same as QW-03. |
| FILM-05 | Fix Newly Added badge clipping | Visual bug | High | XS | Done | Same as QW-04. |
| FILM-06 | When arriving from a Theater page, adapt Film Detail to emphasize that theater's showtimes | Contextual navigation / product | High | M | Outstanding | Preserve origin context; offer broaden-to-all-Seattle option rather than silently losing theater intent. |

---

# Specific Film Showtimes Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| FSHOW-01 | Replace "before noon / afternoon" style filters with specific start/end time controls | UX / filter model | High | M | Outstanding | Should include Any time/no-filter state. Align with Browse All Showtimes filter model. |
| FSHOW-02 | Add to Calendar should account for Reel Seattle Planner/My Schedule | Feature / UX | High | M | Outstanding | Could be separate actions or one action sheet with both "Add to My Schedule" and device calendar. |
| FSHOW-03 | Limit initially visible showtimes and provide expand/collapse | UX | Medium | S-M | Outstanding | Avoid excessively long pages while preserving access to all performances. |

---

# Opening This Week Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| OPEN-01 | First film card is expanded by default | Bug | High | XS | Done | Same as QW-05. |
| OPEN-02 | Sort button does not work | Bug | High | S | Done | Same as QW-06. |
| OPEN-03 | Filter button does not work | Bug | High | S | Done | Same as QW-07. |
| OPEN-04 | Film cards show only one theater/showtime and therefore look like a single-screening advertisement | UX / card semantics | High | M | Outstanding | Card represents a film. Prefer summary such as "4 theaters · 17 showtimes" plus optional next screening. |
| OPEN-05 | Explore tab is highlighted although page behaves as a Home child | Navigation | High | S | Done | Same as SYS-04. |
| OPEN-06 | Review opening-this-week business logic | Logic | High | M | Outstanding | Same as HOME-02. |
| OPEN-07 | Opening card Save and Not interested actions are still stubs | Bug | Medium | S | Done | Wired to savedFilmsStore / notInterestedFilmsStore. |
| OPEN-08 | Opening card “Also playing at” theater jump is still a stub | Bug | Medium | S | Outstanding | Should open Theater Detail or showtimes for that venue. |

---

# Leaving Soon Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| LEAVE-01 | Remove weird scaffold text | Polish | High | XS-S | Done | Removed “Explore · scaffold”; honest gated Leaving Soon copy. |
| LEAVE-02 | Match the visual design/pattern of Opening This Week even before the data model is fully powered | Design consistency | High | S-M | Outstanding | Reuse shared film-card/surface design. |
| LEAVE-03 | Build a real Leaving Soon data model | Data model | High | XL | Outstanding | Same as HOME-03; likely separate data-science track. |

---

# Browse All Showtimes Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| SHOW-01 | Redesign Browse All Showtimes as the ultimate customizable way to find a screening | Major redesign | High | L-XL | Outstanding | This should become a core reusable query/filter surface. |
| SHOW-02 | Add specific-date selection | Filter | High | M | Outstanding | Current page cannot even browse a chosen date. |
| SHOW-03 | Add theater multiselect | Filter | High | M | Outstanding | Shared filter model. |
| SHOW-04 | Add start/end time filtering | Filter | High | M | Outstanding | Prefer true time range over coarse dayparts. |
| SHOW-05 | Add genre multiselect | Filter | Medium | M | Outstanding | Requires dependable metadata coverage. |
| SHOW-06 | Add rating multiselect | Filter | Medium | M | Outstanding | Clarify whether MPAA/content rating. |
| SHOW-07 | Consider format/experience/event filters | Filter | Medium | M | Outstanding | 35mm/70mm/IMAX/Dolby/accessibility/special-event flags. |
| SHOW-08 | Improve expanded-detail design | UX | High | M | Outstanding | Includes sloppy theater link and dead showtime pills. |
| SHOW-09 | Showtime pill should expose useful screening actions | Interaction | High | S-M | Outstanding | Add to My Schedule, Add to Calendar, Tickets; possibly details. |
| SHOW-10 | Reuse this page as the destination for scaffold/quick-link categories with pre-applied filters | Architecture / IA | High | M-L | Outstanding | Key dependency for Explore cleanup, Coming Soon, Special Events, some Collections. |

---

# Theaters Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| THEATER-01 | First theater card starts expanded | Bug | High | XS | Done | Same as QW-08. |
| THEATER-02 | Now Showing "View all" does nothing | Bug | High | S | Done | Same as QW-09. |
| THEATER-03 | Remove Save button | Cleanup | Medium | XS | Done | Same as QW-10. |
| THEATER-04 | Favorite button does not work | Bug | High | S-M | Done | Same as QW-11. |
| THEATER-05 | Film Detail opened from a theater should stay theater-contextual | Contextual navigation | High | M | Outstanding | Same as FILM-06. |
| THEATER-06 | Theater Detail “View all” is still a stub | Bug | High | S | Done | Same helper as list: showtimes browse with theaterIds + returnSurface. |
| THEATER-07 | Theater list Filters control is still a stub | Bug | Medium | S | Outstanding | Implement bounded theater filters or remove until ready. |

---

# Explore Page

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| EXP-01 | Quick Start section looks unprofessional | Visual redesign | High | S-M | Outstanding | Revisit after deciding which quick starts should remain. |
| EXP-02 | Quick links currently lead to scaffold placeholders | IA / routing | High | M | Outstanding | Where possible route to Browse All Showtimes with filters pre-applied. |
| EXP-03 | Suggested Starts feels duplicative of Quick Start | IA | High | S | Done | Removed from Explore landing; EXP-04 keeps future personalized version. |
| EXP-04 | Long-term: Suggested Starts should be powered by user behavior/preferences | Personalization | Low / future | XL | Outstanding | Could use saved genres, favorite theaters, clicked films, time preferences, seen history, etc. |
| EXP-05 | Seen and Not Interested gradients feel embarrassing / overly AI-styled | Visual polish | Medium | XS | Done | Same as QW-13. |
| EXP-06 | "Seen films can still appear... Activity stays on this device" copy is outdated | Copy correctness | High | XS | Done | Same as QW-14. |
| EXP-07 | Your Film Activity → Manage leads to a weird scaffold page | IA / routing | High | M | Outstanding | Resolve through unified Your Films destination. |
| EXP-08 | Seen / Saved / Not Interested structure needs to become one coherent concept | IA | High | M | Outstanding | Same as ACT-01. |
| EXP-09 | Collections "Browse by" has no content | Placeholder | Medium | M-L | Outstanding | Decide whether Collections is a real editorial/product layer or just saved filter presets. |
| EXP-10 | Coming Soon page has no content | Placeholder | High | M | Outstanding | Likely route into Browse All Showtimes with future-date/upcoming filter rather than bespoke page initially. |
| EXP-11 | Special Events page has no content | Placeholder | High | M | Outstanding | Likely route into Browse All Showtimes with event/presentation filter. |

---

# Film Activity / Your Films

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| ACT-01 | Unify Saved, Seen, and Not Interested into one coherent "Your Films" / Film Activity destination | Information architecture | High | M-L | Outstanding | Likely tabs/filters within one destination. |
| ACT-02 | Consolidate Home/Explore quick paths around unified film activity | IA | High | M | Outstanding | Depends on ACT-01. |
| ACT-03 | Replace Profile Activity Snapshot dead boxes with navigation/overlay interactions | Interaction / IA | Medium | S-M | Outstanding | Best resolved after ACT-01. |
| ACT-04 | Replace weird Film Activity Manage scaffold page | Routing / IA | High | S-M | Outstanding | Depends on ACT-01. |
| ACT-05 | Decide canonical location for activity management | Product / IA | High | M | Outstanding | Likely Profile → Your Films, with shortcuts elsewhere. |

---

# My Schedule

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| SCHED-01 | Perform a full in-depth My Schedule UX/product audit | Audit / redesign | High | L-XL | Outstanding | User considers this probably the least polished feature overall; audit instead of patching isolated symptoms first. |
| SCHED-02 | Review timeline scale, scrolling, film-card layout, conflicts, plan grouping, empty/past states, deletion, navigation, and calendar behavior | Audit scope | High | L | Outstanding | Child scope of SCHED-01. |

---

# Build a Plan

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| PLAN-01 | Audit Build a Plan for whether users truly have full control over output | Product audit | High | M-L | Outstanding | Largely addressed by PLAN-06–11; keep open until Results Lock (RESULT-03) and any residual control gaps are reviewed. |
| PLAN-02 | Replace weird plan-size range presets with a better range selector / min-max control | UX | High | M | Done | Replaced by Exact / Range / As many plan-size control (PLAN-06). |
| PLAN-03 | "When?" time-window filter needs full control | UX | High | M | Outstanding | Explicit start/end controls. |
| PLAN-04 | Add a "no time filter / any time is fine" option | UX | High | S | Outstanding | Required for unconstrained planning. |
| PLAN-05 | "What?" selector has Add Another only for Must Include | UX consistency | Medium | S-M | Done | Locked showtimes + film buckets each have add/manage affordances. |
| PLAN-06 | Exact plan size (e.g. exactly 4 films) via domain min/max | Feature / solver | High | M | Done | Domain `{ min, max }` + Exact/Range/As many UI. |
| PLAN-07 | Locked showtimes / locked performances as hard constraints | Feature / solver | High | L | Done | Locks can be created from Build a Plan and from Results (RESULT-03). Seeded solver + session draft state. |
| PLAN-08 | Constraint-aware film picker (date / theater / time window eligibility) | Feature / UX | High | M | Done | Candidate eligibility under hard constraints; selected-but-ineligible films retained + flagged. |
| PLAN-09 | Separate film-level vs performance-level “What?” pickers and copy | UX / IA | High | M | Done | Film picker uses “N eligible showtimes”; performance picker shows exact screening metadata. |
| PLAN-10 | Pre-generation conflict validation for locked + film constraints | Feature / UX | High | M | Done | Structured conflicts surfaced near Generate and on incompatible rows. |
| PLAN-11 | Locked-showtime picker (“Add a showtime”) under What? | Feature / UX | High | M | Done | `build-plan-showtime-manage` performance catalog under hard constraints. |

---

# Your Movie Day Results

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| RESULT-01 | Single-film plans have too much blank space | Layout | Medium | S-M | Outstanding | Need responsive plan-size-aware composition. |
| RESULT-02 | "Add to My Schedule" design is sloppy | Visual / interaction design | High | M | Outstanding | Revisit hierarchy and action treatment. |
| RESULT-03 | Lock / Unlock this showtime from Results film overlay | Feature / UX | High | M | Done | Extends AdjustFilmInPlansOverlay; reuses Build-a-Plan lock helpers; regenerates Results in place from draft session. |

---

# Plan Details

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| DETAIL-01 | Plan Details feels sloppy and needs a dedicated polish/redesign pass | Redesign | High | M | Outstanding | Treat as a surface-level audit rather than isolated CSS tweaks. |

---

# Profile / Settings

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| PROF-01 | Remove or repurpose dead top-right settings gear | Cleanup | Medium | XS | Done | Likely remove. |
| PROF-02 | Nest Time Format under a real settings category | IA | Medium | S-M | Outstanding | Depends on settings structure. |
| PROF-03 | None of the Settings link buttons lead anywhere | Bug / IA | High | M | Outstanding | Requires deciding which settings categories actually exist. |
| PROF-04 | Define settings categories and where settings should live | Information architecture | High | M | Outstanding | Candidate categories: Preferences, Notifications, Account, Data & Privacy. |
| PROF-05 | Activity Snapshot boxes need interactions | UX | Medium | S-M | Outstanding | Link to filtered Your Films views or overlays. Depends on ACT-01. |
| PROF-06 | Account section contains too much sync information and occupies too much space | Content / layout | High | S-M | Outstanding | Reduce to concise account status; move detailed sync/privacy info elsewhere if needed. |

---

# Placeholder / consolidation decisions

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| CONS-01 | Decide which placeholder pages should be removed in favor of Browse All Showtimes with pre-applied filters | Architecture / IA | High | M | Outstanding | Coming Soon, Special Events, some Quick Starts, possibly some Collections. |
| CONS-02 | Decide whether Collections deserves a standalone product surface | Product decision | Medium | M | Outstanding | Could instead be editorial/saved filter presets. |
| CONS-03 | Remove Suggested Starts until it is truly personalized | Product cleanup | High | S | Done | Same as EXP-03. |

---

# Longer-term / data-model work

| ID | Outstanding item | Type | Priority | Effort | Status | Notes / dependencies |
|---|---|---|---|---|---|---|
| DATA-01 | Formal Leaving Soon model | Data science / data model | High | XL | Outstanding | Likely uses historical booking/showtime cadence, remaining screenings, theater behavior, uncertainty. |
| DATA-02 | Formal Top Opportunity ranking model | Ranking / personalization | High | L-XL | Outstanding | May combine urgency, rarity, availability, user interest, favorite theaters, format, and schedule feasibility. |
| DATA-03 | Personalized Suggested Starts | Personalization | Future | XL | Outstanding | Only after enough user behavior/preferences exist and there is a clear value proposition. |

---

# Notes preserved from the original audit

These product judgments should not be lost when implementation details change:

- Quick wins should be tackled first, but not if they polish a surface likely to be replaced by a larger redesign.
- Saved, Seen, and Not Interested should be thought of as one user-film relationship system rather than three disconnected destinations.
- Search may be redundant as a Home Quick Path.
- Browse All Showtimes should become the most powerful/customizable way to find exactly the right screening.
- Opening This Week film cards should read as films with multiple options, not as advertisements for a single showtime.
- Leaving Soon should visually align with Opening This Week even before its real data model is ready.
- Theater-origin navigation should preserve theater intent when opening Film Detail.
- Suggested Starts should not pretend to be personalized before it actually is.
- Coming Soon, Special Events, Quick Starts, and some Collections may be better expressed as pre-filtered Browse All Showtimes states instead of separate thin pages.
- My Schedule is likely best handled via a full audit/redesign rather than by accumulating isolated micro-fixes.
- Build a Plan needs truly unconstrained/precise controls where appropriate, including an explicit "Any time" state.
- Account/sync messaging should be concise and accurate now that user accounts exist.
