/**
 * Canonical primary destinations for the isolated v2 shell (D-26 / I-01).
 * Labels and order are product-authoritative; chrome implementation is minimal.
 */

export const PRIMARY_DESTINATIONS = Object.freeze([
  Object.freeze({
    id: 'home',
    label: 'Home',
    title: 'Home',
    description:
      'Editorial Home baseline — Top Opportunities region (I-03). Supporting regions follow later.',
  }),
  Object.freeze({
    id: 'explore',
    label: 'Explore',
    title: 'Explore',
    description: 'Not included in this slice. Placeholder only.',
  }),
  Object.freeze({
    id: 'planner',
    label: 'Planner',
    title: 'Planner',
    description:
      'Not included in this slice. Placeholder only — not the live public Planner.',
  }),
  Object.freeze({
    id: 'profile',
    label: 'Profile',
    title: 'Profile',
    description:
      'Not included in this slice. Local-only placeholder — no accounts, counts, or preferences.',
  }),
]);

export const INITIAL_DESTINATION_ID = 'home';

/** Labels that must not appear as primary navigation items. */
export const REJECTED_PRIMARY_NAV_LABELS = Object.freeze([
  'Movies',
  'Theaters',
  'Saved',
  'Settings',
  'Me',
  'Showtimes',
]);

/**
 * @param {string} destinationId
 * @returns {{ id: string, label: string, title: string, description: string } | null}
 */
export function getDestinationById(destinationId) {
  return PRIMARY_DESTINATIONS.find((item) => item.id === destinationId) ?? null;
}

/**
 * @param {string} destinationId
 * @returns {string}
 */
export function resolveDestinationId(destinationId) {
  return getDestinationById(destinationId)?.id ?? INITIAL_DESTINATION_ID;
}

/**
 * @param {readonly string[]} labels
 * @returns {boolean}
 */
export function containsRejectedPrimaryNavLabel(labels) {
  const rejected = new Set(REJECTED_PRIMARY_NAV_LABELS);
  return labels.some((label) => rejected.has(label));
}
