# Mock Plan Preview — Implementation Plan

**Feature:** Constraint visualization preview (pre-search)  
**Status:** Planning  
**Related:** [planner-ux-roadmap.md](./planner-ux-roadmap.md) § Future improvements  
**Parent design:** [unified-planner-design.md](./unified-planner-design.md)

---

## 1. Feature Overview

### Goal

Show users a **visual preview** of their filter constraints *before* running a search, using the existing planner timeline/result visual style. This makes abstract filters tangible and helps users spot impossible combinations (e.g., 4 films + finish by 3 PM) before clicking Find plans.

### Key Principles

- **Not a real schedule** — no actual showtime API call; purely derived from current filter state
- **Reuses existing visual components** — leverage `PlannerTimeline` and result card layout patterns
- **Shows constraint relationships** — how film count, required films, time windows, and gaps interact
- **Progressive disclosure** — appears when enough filters are set to be meaningful

---

## 2. Visual Design Concept

### Layout Position

**Option A (Recommended):** Display preview **between filters and "Find plans" button**

```
┌─────────────────────────────────┐
│ Primary Filters                 │
│ (date, theaters, count, times)  │
├─────────────────────────────────┤
│ Film Filters                    │
│ (required, preferred, excluded) │
├─────────────────────────────────┤
│ ╔═══════════════════════════════╗│
│ ║ Preview of your constraints   ║│
│ ║ [Mock timeline visualization] ║│
│ ║ Click Find plans for real...  ║│
│ ╚═══════════════════════════════╝│
├─────────────────────────────────┤
│ [Find plans] button             │
└─────────────────────────────────┘
```

**Option B:** Collapsible panel in Advanced section (less discoverable)

**Decision:** Option A for maximum visibility and onboarding value.

---

## 3. Constraint Preview Mapping

How each filter constraint should appear in the mock preview:

| Filter | Preview Behavior |
|--------|------------------|
| **Film count (2/3/4)** | Show exact number of placeholder slots |
| **Film count (max)** | Show 4–5 slots with "..." indicator (conceptual) |
| **Required films** | Fill slots with actual titles + posters (from showtime data) |
| **Preferred films** | Show as dashed/"optional" visual with "≥1 of these" label |
| **Excluded films** | Not shown in preview (negative constraint) |
| **First film** | Anchor first slot with selected title |
| **Last film** | Anchor last slot with selected title |
| **Start after** | Label timeline start or show clock icon at start boundary |
| **Finish by** | Label timeline end or show finish-line marker |
| **Min gap** | Show minimum gap distance between slots (e.g., "≥15 min") |
| **Max gap** | Show maximum gap band or cap label (e.g., "≤60 min") |
| **No constraints** | Empty placeholder slots with "?" or "Any film" |

---

## 4. Component Architecture

### New Components

#### `PlannerConstraintPreview.jsx`

**Purpose:** Top-level preview container that orchestrates the mock visualization.

**Props:**
```js
{
  filters: PlannerFilters,          // Current filter state
  availableFilms: Film[],           // From showtime data (for posters/titles)
  isVisible: boolean,               // Show/hide based on filter completeness
}
```

**Responsibilities:**
- Compute mock timeline slots from filters
- Determine which films fill which slots (required, first/last anchors)
- Pass computed mock data to `PlannerConstraintTimeline`
- Show disclaimer text ("Preview of constraints — not real showtimes")

---

#### `PlannerConstraintTimeline.jsx`

**Purpose:** Visual timeline renderer for mock constraints (reuses patterns from `PlannerTimeline.jsx`).

**Props:**
```js
{
  mockSlots: MockFilmSlot[],        // Ordered slots with constraint info
  startAfterMin: number | null,
  finishByMin: number | null,
  minGapMin: number | null,
  maxGapMin: number | null,
}
```

**MockFilmSlot schema:**
```js
{
  type: 'required' | 'first' | 'last' | 'preferred' | 'any',
  film: { title, poster, showtime_film_key } | null,
  position: number,                 // 0-indexed slot position
  isAnchored: boolean,              // true for first/last
  estimatedDurationMin: number | null,  // avg runtime if known
}
```

**Responsibilities:**
- Render film slots as blocks (similar to `PlannerTimeline` but mock style)
- Show gap indicators between slots
- Render time boundary markers (start/finish)
- Use visual styling to distinguish mock from real results (dashed borders, muted colors, "?" for unknown)

---

### Modified Components

#### `PlannerPage.jsx`

**Changes:**
- Import and render `PlannerConstraintPreview` above "Find plans" button
- Compute `isPreviewVisible` based on filter state (e.g., show when `filmCount` and `date` are set)
- Pass current `filters` and `availableFilms` from showtime data

---

## 5. Data Flow

```
PlannerPage (current filter state)
    ↓
  filters + showtime rows
    ↓
PlannerConstraintPreview
    ↓
  compute mockSlots from filters
    ↓
PlannerConstraintTimeline
    ↓
  render mock visual blocks
```

**Key functions:**

- `buildMockSlotsFromFilters(filters, availableFilms)` — converts filter state to mock slot array
- `getAverageRuntimeForFilm(filmKey, showtimeRows)` — estimate duration for known films
- `shouldShowPreview(filters)` — visibility logic (e.g., filmCount && date set)

---

## 6. Visibility Rules

Show preview when:

1. **Film count** is selected (2/3/4/max)
2. **Date** is selected
3. At least one of:
   - Required films selected
   - First/last film selected
   - Start after or Finish by set
   - Min/max gap set

Hide preview when:
- No filters set (empty state)
- Only date selected (too minimal)

---

## 7. Visual Styling

### Distinguish Mock from Real Results

| Aspect | Real Results | Mock Preview |
|--------|--------------|--------------|
| Border | Solid | Dashed |
| Background | White/light | Very light gray or subtle pattern |
| Film blocks | Full color posters | Muted/grayscale posters or placeholder icons |
| Text | Normal | Slightly muted or labeled "Example" |
| Unknown slots | N/A | "?" or ghost placeholder |

### CSS Classes

- `.planner-constraint-preview` — container
- `.planner-constraint-preview-timeline` — timeline area
- `.planner-constraint-preview-slot` — individual film slot
- `.planner-constraint-preview-slot--required` — required film styling
- `.planner-constraint-preview-slot--any` — unknown film placeholder
- `.planner-constraint-preview-disclaimer` — text disclaimer

---

## 8. Implementation Steps

### Phase 1: Core Preview Logic (Foundation)

**Goal:** Build data layer and visibility logic without UI.

- [ ] Create `src/utils/plannerConstraintPreview.js`
- [ ] Implement `buildMockSlotsFromFilters(filters, availableFilms)`
  - Handle film count (exact and max)
  - Map required films to slots
  - Apply first/last anchors
  - Create placeholder slots for unknowns
- [ ] Implement `shouldShowPreview(filters)`
- [ ] Write tests in `tests/frontend/plannerConstraintPreview.test.mjs`
  - Test 2-film with required films
  - Test 3-film with first anchor
  - Test max mode (show 4–5 slots)
  - Test empty filters (should not show)
  - Test time boundaries in mock data

---

### Phase 2: Timeline Component (Visual)

**Goal:** Create the mock timeline renderer.

- [ ] Create `src/components/PlannerConstraintTimeline.jsx`
- [ ] Render mock film slots as blocks
  - Use placeholder styling (dashed border, muted bg)
  - Show film title + poster for known films
  - Show "?" or "Any film" for unknowns
- [ ] Render gap indicators between slots
  - Show gap constraints (min/max) as labels or bands
- [ ] Render time boundary markers
  - Start after: clock icon or label at timeline start
  - Finish by: finish flag or label at timeline end
- [ ] Add CSS for `.planner-constraint-preview-timeline` and slot styles

---

### Phase 3: Container Component (Integration)

**Goal:** Wrap timeline in container with disclaimer and orchestration.

- [ ] Create `src/components/PlannerConstraintPreview.jsx`
- [ ] Accept `filters` and `availableFilms` props
- [ ] Call `buildMockSlotsFromFilters` to compute mock data
- [ ] Render `PlannerConstraintTimeline` with computed slots
- [ ] Add disclaimer text above/below timeline:
  - "Preview of your constraints — click Find plans for real showtimes."
- [ ] Handle edge cases:
  - No required films: show all placeholders
  - Preferred films: show dashed/"optional" visual
  - Impossible constraints: show warning (e.g., "4 films + finish by 3 PM may be difficult")

---

### Phase 4: PlannerPage Integration

**Goal:** Add preview to Planner page UI.

- [ ] Import `PlannerConstraintPreview` in `PlannerPage.jsx`
- [ ] Compute `isPreviewVisible = shouldShowPreview(filters)`
- [ ] Render preview between film filters and "Find plans" button
- [ ] Pass current `filters` and derive `availableFilms` from showtime data
  - Use `useShowtimesData().rows` filtered by selected date/theaters
  - Extract unique films with metadata (title, key, poster, avg runtime)
- [ ] Test visibility toggling as filters change

---

### Phase 5: Polish & Edge Cases

**Goal:** Refine UX and handle edge cases.

- [ ] **Responsive layout:** Test at 375px, 768px, 1200px
- [ ] **Animation:** Smooth show/hide transition for preview panel
- [ ] **Preferred films visualization:**
  - Show as separate section or dashed boxes
  - Label "≥1 of these must appear"
- [ ] **Impossible constraint warnings:**
  - Detect: 4 films + finish by too early
  - Show inline warning: "⚠️ This combination may have few or no results"
- [ ] **Max mode:** Show 4–5 slots with "... and more" indicator
- [ ] **Gap visualization:** Show gap bands between slots with min/max labels
- [ ] **Empty state:** When no films selected, show generic placeholder slots
- [ ] **Accessibility:** Add ARIA labels, keyboard nav if interactive

---

### Phase 6: Testing & Documentation

**Goal:** Ensure quality and maintainability.

- [ ] Add unit tests for `buildMockSlotsFromFilters`:
  - Required films + first/last anchors
  - Preferred films handling
  - Max mode slot count
  - Time boundary calculations
- [ ] Add integration tests for `PlannerConstraintPreview`:
  - Visibility toggling
  - Mock data rendering
  - Disclaimer text
- [ ] Manual QA:
  - Test all filter combinations
  - Test with real showtime data (various dates/theaters)
  - Test on mobile and desktop
- [ ] Update `docs/frontend-smoke-check.md` with preview checks
- [ ] Update `docs/planner-ux-roadmap.md`:
  - Move "Mock plan preview" from Future to Completed
  - Add PR reference

---

## 9. File Checklist

### New Files

- `src/utils/plannerConstraintPreview.js` — data logic
- `src/components/PlannerConstraintPreview.jsx` — container component
- `src/components/PlannerConstraintTimeline.jsx` — timeline renderer
- `tests/frontend/plannerConstraintPreview.test.mjs` — unit tests

### Modified Files

- `src/pages/PlannerPage.jsx` — integrate preview
- `src/App.css` — add preview styles (or new `PlannerConstraintPreview.css`)
- `docs/frontend-smoke-check.md` — add QA checks
- `docs/planner-ux-roadmap.md` — mark completed

---

## 10. Acceptance Criteria

- [ ] Preview appears when film count + date are selected
- [ ] Preview hides when filters are too minimal
- [ ] Required films show with actual titles + posters
- [ ] First/last anchors position correctly in timeline
- [ ] Unknown films show as placeholders ("?" or "Any film")
- [ ] Time boundaries (start after, finish by) render as markers
- [ ] Gap constraints visible between slots (min/max labels or bands)
- [ ] Disclaimer text clearly distinguishes mock from real
- [ ] Visual styling (dashed border, muted colors) distinct from real results
- [ ] Responsive on mobile (375px) and desktop (1200px)
- [ ] No performance impact (< 50ms render time)
- [ ] Unit tests pass for all mock data scenarios
- [ ] Manual QA confirms preview accuracy for common filter combos

---

## 11. Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| **Preview confuses users (looks too real)** | Use distinct styling (dashed, muted, disclaimer text); user test if needed |
| **Complexity creep (too many edge cases)** | Start simple (required films + count only); iterate based on feedback |
| **Performance (recalc on every filter change)** | Memoize `buildMockSlotsFromFilters` with `useMemo`; debounce if needed |
| **Preferred films visualization ambiguity** | Use dashed boxes + "≥1 of these" label; defer complex visual if unclear |
| **Impossible constraint detection** | Start with simple heuristics (e.g., filmCount × 90min > finishBy window); improve later |

---

## 12. Future Enhancements (Post-v1)

- **Interactive preview:** Click slot to change film (quick-edit filters)
- **Estimated timeline:** Use average runtimes to show approximate total span
- **Real-time feasibility check:** Light API call to check if any results exist (without full search)
- **Saved presets:** Show preview for recently used filter combos
- **Onboarding tooltip:** First-time user sees "This is a preview..." tooltip

---

## 13. Agent Workflow

1. **Start with Phase 1** — build and test data layer first
2. **Phase 2** — create timeline component in isolation
3. **Phase 3** — wrap in container with disclaimer
4. **Phase 4** — integrate into PlannerPage
5. **Phase 5** — polish and edge cases
6. **Phase 6** — test, document, ship

After each phase:
- Run `npm run test:frontend` to ensure no regressions
- Manually test in browser (`npm run dev`)
- Commit incremental progress

---

## 14. Success Metrics (Post-Launch)

- **User feedback:** "Preview helped me understand filters" (qualitative)
- **Reduced empty searches:** % of searches with zero results decreases
- **Faster filter iteration:** Time from page load to first search decreases
- **Feature discovery:** % of users who adjust filters after seeing preview

---

**Next step:** Begin Phase 1 — implement `buildMockSlotsFromFilters` and visibility logic.
