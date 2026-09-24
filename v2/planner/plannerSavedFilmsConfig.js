export const PLANNER_SAVED_SORT_OPTIONS = Object.freeze([
  { id: 'urgent', label: 'Leaving Soon' },
  { id: 'recent', label: 'Recently saved' },
  { id: 'title', label: 'Title (A–Z)' },
]);

/**
 * Saved Films no longer ships a secondary Filter control.
 * Urgency is expressed via sort ("Leaving Soon") and row badges — not as a
 * fake theater/category filter. Kept as an empty allowlist so older
 * `filterId` values still normalize safely.
 */
export const PLANNER_SAVED_FILTER_OPTIONS = Object.freeze([
  { id: 'all', label: 'All' },
]);

export const PLANNER_SAVED_SHEET_VISIBLE = 5;
