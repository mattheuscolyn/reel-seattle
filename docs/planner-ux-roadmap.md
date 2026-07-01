# Planner UX Roadmap

**Status:** Living document — update as items ship or priorities change  
**Related:** [product-roadmap.md](./product-roadmap.md) (master tracker) · [unified-planner-design.md](./unified-planner-design.md) (engine & URL contract)  
**Audience:** Implementers and agents working on Planner / Showtimes UI

This file splits Planner UX work into **work on now** (approved, high-impact, fits current architecture) and **future improvements** (valuable but deferrable). Agents and contributors should read this before starting Planner UI work so effort stays aligned with product intent.

---

## Why this document exists

- **Single source of truth** for UX direction without re-deriving context each session.
- **Clear scope boundary** between “ship next” and “idea backlog.”
- **Composable with the technical design** — `unified-planner-design.md` covers engine/URL; this doc covers how filters should *feel* and behave.

When an item in **Work on now** ships, move it to a short **Completed** note at the bottom (or link the PR) and pull the next priority forward.

---

## Work on now

_All items below shipped on main._

## Completed (work on now)

| Item | Status |
|------|--------|
| Film multi-select from showtime data (`FilmMultiSelect`) | Shipped |
| Pre-search film validation (`PlannerFilmValidation`) | Shipped |
| Film single-select for first / last (`FilmSingleSelect`) | Shipped |
| Time picker for Start after / Finish by (`PlannerTimePicker`) | Shipped |
| Filter layout restructure (films promoted, More options for gaps/sort) | Shipped |
| “Plan this film” deep link from Showtimes | Shipped |
| Date labels, theater Select all/Clear, manual title fallback | Shipped |

---

## Work on now (archived spec)

These items were approved after the raw-text input fixes (PR #1). They address the main frustration: film filters require exact titles while the app already knows which films are playing.

### 1. Film multi-select from showtime data (highest priority)

**Replace** comma-separated text for Required, Preferred, and Excluded movies with a searchable multi-select built from loaded showtime rows.

| Aspect | Spec |
|--------|------|
| Component | New `FilmMultiSelect` (pattern: existing `DropdownMultiSelect` for theaters) |
| Option source | Films on **selected date** in **selected theaters** (all theaters if none selected) |
| Option display | Title + optional poster thumbnail + theater count |
| Selection UI | Chips/tags for chosen films below or inside the control |
| Stored value | `showtime_film_key` in URL (stable); display title for UI only |
| Picker search | Client-side partial match on title while typing in the dropdown |

**Semantics (unchanged engine behavior):**

- **Required** — every selected film must appear in the plan.
- **Preferred** — at least one selected film must appear.
- **Excluded** — none of the selected films may appear.

**URL:** Prefer repeatable `movies=<key>` params (or a documented key format). Keep backward compatibility for legacy title strings where practical.

**Files likely touched:** `PlannerPage.jsx`, new `FilmMultiSelect.jsx`, `plannerUrlState.js`, `plannerDisplay.js`, `App.css`.

---

### 2. Pre-search film validation

Before or when the user clicks **Find plans**, show match status for each selected film:

- ✓ *Sinners* — playing at 3 theaters on this date  
- ✗ *The Dark Knigt* — no match on this date  

Optional: “Did you mean *The Dark Knight*?” for near-miss titles (picker search only; do not loosen engine matching without an explicit decision).

Surface unmatched films in empty-state copy when search returns zero results.

---

### 3. Film single-select for first / last movie

Replace free-text **Preferred first movie** and **Preferred last movie** with a single-select combobox from the same film list as §1.

- Disable the other field’s option when it would conflict (same film as first and last in a short plan).
- Store `showtime_film_key` in URL `first` / `last` params where possible.

---

### 4. Time picker for Start after / Finish by

Replace compact free-text (`2:00PM`) with a control that always emits valid compact times:

**Recommended:** Hour + minute + AM/PM selects (no keystroke parsing).

**Alternative:** Slot list (15- or 30-minute increments) scoped to typical showtime hours.

Keep URL format `start` / `finish` as compact times for share links. Validate on blur if any text fallback remains.

---

### 5. Restructure filter layout

Promote film constraints out of “Advanced” — they are core to Marathon-style planning.

**Suggested layout:**

```
Primary:   Date · Theaters · # of movies · Start after · Finish by
Films:     Required · Preferred · Excluded
Optional:  First film · Last film · Gap limits · [More ▾]
```

Advanced toggle can retain gap + sort until sort moves to results (see future §).

---

### 6. “Plan with this film” from Showtimes

Add an action on Showtimes film cards (e.g. **Plan this film**) that deep-links to `/planner` with:

- Selected date/theater when inferable from context  
- Preferred or Required film pre-filled via film key  

Reduces duplicate data entry and teaches the Planner entry point.

---

### 7. Small polish bundled with the above

| Filter | Change |
|--------|--------|
| **Date** | Format as `Fri, Jun 27`; badge Today / Tomorrow |
| **Theaters** | Select all / Clear all in `DropdownMultiSelect` menu |
| **Manual fallback** | Collapsed “Enter title manually” under film pickers for edge cases; show match status on blur |

---

## Work in progress

### UX-1 — Compact time picker (Phase 1, in progress)

**Status:** Implemented on branch — pending commit/QA

**Scope:** Smaller scroll-wheel columns (32px rows vs 40px), tighter header/actions, mobile 2-column layout for Start after / Finish by. URL/state behavior unchanged.

**Files:** `PlannerTimePicker.jsx`, `plannerTimePicker.js`, `App.css`

**Remaining Phase 1:** UX-2 collapsible filter panel, UX-3 scroll retention, UX-4 midnight audit, UX-5 result card density.

### Mock plan preview (filter constraint visualization)

**Status:** Implementation complete, pending production deployment

**Concept:** Use the existing plan result visual (`PlannerResultCard` / `PlannerTimeline` — films as blocks, gaps between) as a **hypothetical preview** of the user's current filters *before* running a search.

See **`docs/mock-plan-preview-implementation.md`** for full implementation details.

**Implementation complete:**
- ✓ Core preview logic (`plannerConstraintPreview.js`)
- ✓ Visual timeline component (`PlannerConstraintTimeline.jsx`)
- ✓ Container with disclaimer (`PlannerConstraintPreview.jsx`)
- ✓ Integration into PlannerPage
- ✓ Responsive design (375px, 768px, 1200px)
- ✓ Impossible constraint warnings
- ✓ Unit tests (26 test cases)
- ✓ CSS animations and polish

**Value delivered:**
- Makes abstract filters tangible before searching
- Helps users spot impossible combinations early
- Shows relationship between film count, time windows, and gaps
- Progressive disclosure (only shows when meaningful constraints are set)

---

## Future improvements / ideas

Defer until **Work in progress** items ship. These are approved directions, not committed sprint work.

### Filter & results UX

| Idea | Notes |
|------|--------|
| **Sort in results header** | Sort affects output, not search inputs. Move sort next to results (like Showtimes `SortDropdown`) instead of Advanced. |
| **Film count segmented control** | `2 \| 3 \| 4 \| Max` pills instead of `<select>` — faster scanning. |
| **Gap presets** | Chips for min gap (0, 15, 30, 45); “Use default (59 min)” button for 2-film max gap. |
| **Theater grouping** | Group options by chain (AMC, SIFF, Beacon) in theater multi-select. |
| **Loosen text matching (engine)** | Normalized partial match as safety net for manual entry only; picker remains source of truth. Risk: false positives on short tokens. |

### Mock plan preview (filter constraint visualization)

**Concept:** Use the existing plan result visual (`PlannerResultCard` / `PlannerTimeline` — films as blocks, gaps between) as a **hypothetical preview** of the user’s current filters *before* running a search.

| Constraint | Preview behavior |
|------------|------------------|
| **Film count** | Show that many slots (e.g. 3 blocks) |
| **Required films** | Fill slots with known titles/posters in order or labeled “Required 1”, “Required 2” |
| **Preferred films** | Show as optional slots or dashed “one of these” group |
| **First / last film** | Anchor first and/or last slot with selected title |
| **Start after** | Label timeline start or offset first slot |
| **Finish by** | Label timeline end or cap last slot |
| **Min / max gap** | Show example gap sizes between placeholders (or range band) |
| **Unknown** | Blank slot, `?`, or muted “Any film” |

**Not a real schedule** — no showtime API call required for v1; clarify in UI: *“Preview of your constraints — click Find plans for real showtimes.”*

**Value:** Makes abstract filters tangible; helps users notice impossible combos (e.g. 4 films + finish by 3 PM) before searching.

**Implementation sketch:** `PlannerConstraintPreview` component; reuse timeline layout CSS; props from decoded planner URL state + film metadata from showtime rows.

### Discovery & onboarding

- Empty-state suggestions tied to unmatched films  
- Inline examples in collapsed Advanced (“e.g. start after first evening show”)  
- Recently planned / saved filter presets (localStorage or URL favorites)

### Showtimes ↔ Planner parity

- Shared film search component between Showtimes search and Planner film picker  
- Consistent poster + title presentation across pages  

---

## Completed

| Item | PR / note |
|------|-----------|
| Fix dropdown z-index on Showtimes filter bar | PR #1 |
| Fix planner time/film text inputs clearing while typing | PR #1 |
| Film pickers, time picker, validation, layout, Showtimes plan link | Main |

---

## Agent instructions

1. Prefer **Work on now** items in order unless the user scopes a subset.  
2. When implementing film pickers, store **`showtime_film_key`** in URLs; resolve titles from showtime data at render time.  
3. Do not expand scope into **Future improvements** without explicit user approval.  
4. After shipping a **Work on now** item, update the **Completed** table and trim or move sections as needed.  
5. For engine behavior changes, update `unified-planner-design.md` and tests in `tests/frontend/planner*.test.mjs`.
