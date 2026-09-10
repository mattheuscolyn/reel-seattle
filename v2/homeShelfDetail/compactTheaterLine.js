/**
 * Compact theater-line formatting for Home shelf-detail pages.
 * Shared by Opening This Week, Leaving Soon, Just Announced, Special Presentations,
 * and future full-list shelves.
 */

/** Max theaters shown by name before “+N more”. */
export const SHELF_DETAIL_THEATER_LIST_MAX_VISIBLE = 2;

/**
 * Compact theater line for shelf-detail cards.
 * Examples: "AMC · SIFF" or "AMC · SIFF · +3 more"
 *
 * @param {string[]} theaterNames unique names in display order
 * @param {{ maxVisible?: number }} [options]
 * @returns {string | null}
 */
export function formatCompactTheaterLine(theaterNames, options = {}) {
  const names = (Array.isArray(theaterNames) ? theaterNames : [])
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);
  if (names.length === 0) return null;
  const maxVisible =
    options.maxVisible ?? SHELF_DETAIL_THEATER_LIST_MAX_VISIBLE;
  if (names.length <= maxVisible) {
    return names.join(' · ');
  }
  const visible = names.slice(0, maxVisible);
  const overflowCount = names.length - maxVisible;
  return `${visible.join(' · ')} · +${overflowCount} more`;
}

/**
 * Unique theaters from opportunity-like rows, preserving first-seen order.
 *
 * @param {Array<{ theaterId?: string | null, theaterName?: string | null }>} rows
 * @returns {{ id: string | null, name: string }[]}
 */
export function aggregateTheatersFromRows(rows) {
  /** @type {{ id: string | null, name: string }[]} */
  const theaters = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const id =
      typeof row?.theaterId === 'string' && row.theaterId.trim()
        ? row.theaterId.trim()
        : null;
    const name =
      typeof row?.theaterName === 'string' ? row.theaterName.trim() : '';
    if (!name) continue;
    const key = id ? `id:${id}` : `name:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    theaters.push({ id, name });
  }

  return theaters;
}
