/**
 * Canonical primary destinations for the isolated v2 shell.
 *
 * Product correction: four-tab chrome — Home · Explore · Planner · Profile.
 * Movies and Theaters are Explore concepts, not primary tabs.
 * “Me” is not a primary label; use Profile.
 */

export { COLLECTION_IDS, COLLECTION_TITLES } from './explore/exploreIds.js';

export const PRIMARY_DESTINATIONS = Object.freeze([
  Object.freeze({
    id: 'home',
    label: 'Home',
    title: 'Home',
    description:
      'Editorial Home — Top Opportunity, supporting shelves, Planner entry, and Explore More.',
  }),
  Object.freeze({
    id: 'explore',
    label: 'Explore',
    title: 'Explore',
    description:
      'User-directed discovery — search, Quick Start, Browse By, Suggested Starts, Film Activity, and recent searches.',
  }),
  Object.freeze({
    id: 'planner',
    label: 'Planner',
    title: 'Planner',
    description:
      'Stage 1 Planner landing — fixture-backed visual replica of the canonical Planner Landing mockup. Build a Plan config is Stage 1 local-state; Results / Schedule / persistence deferred.',
  }),
  Object.freeze({
    id: 'profile',
    label: 'Profile',
    title: 'Profile',
    description:
      'Stage 1 Profile hub — fixture-backed visual replica of the canonical Profile mockup. Local-store production wiring deferred.',
  }),
]);

export const INITIAL_DESTINATION_ID = 'home';

/** Labels that must not appear as primary navigation items. */
export const REJECTED_PRIMARY_NAV_LABELS = Object.freeze([
  'Movies',
  'Theaters',
  'Me',
  'Saved',
  'Settings',
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

/**
 * Primary nav highlight reflects the originating top-level destination.
 * Film Detail and Explore sub-surfaces keep Explore active when appropriate.
 *
 * @param {{
 *   primaryDestinationId: string,
 *   surface: null | { type: string, originPrimary?: string },
 * }} nav
 */
export function resolveActivePrimaryId(nav) {
  const primary = resolveDestinationId(nav.primaryDestinationId);
  if (
    nav.surface?.type === 'film-detail' ||
    nav.surface?.type === 'opportunity-detail' ||
    nav.surface?.type === 'showtimes' ||
    nav.surface?.type === 'showtimes-browse' ||
    nav.surface?.type === 'about-my-schedule' ||
    nav.surface?.type === 'build-plan' ||
    nav.surface?.type === 'build-plan-results' ||
    nav.surface?.type === 'build-plan-film-manage' ||
    nav.surface?.type === 'build-plan-plan-details' ||
    nav.surface?.type === 'my-schedule-week' ||
    nav.surface?.type === 'my-schedule-month' ||
    nav.surface?.type === 'schedule-settings' ||
    nav.surface?.type === 'theater-detail'
  ) {
    return resolveDestinationId(nav.surface.originPrimary ?? primary);
  }
  if (nav.surface?.type === 'collection') {
    return 'explore';
  }
  return primary;
}
