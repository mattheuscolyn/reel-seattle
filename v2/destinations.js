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
      'User-directed discovery — search, Quick Start, Browse By, Film Activity, and recent searches.',
  }),
  Object.freeze({
    id: 'planner',
    label: 'Planner',
    title: 'Planner',
    description:
      'Planner landing — Upcoming / Saved films shell aligned to Planner Main Page Upcoming mockup. Build a Plan, conflicts, and accepted-plan screenings.',
  }),
  Object.freeze({
    id: 'profile',
    label: 'Profile',
    title: 'Profile',
    description:
      'Personal hub — identity, Your Films, favorite theaters, and settings.',
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
    nav.surface?.type === 'format-detail' ||
    nav.surface?.type === 'experience-detail' ||
    nav.surface?.type === 'compare-formats' ||
    nav.surface?.type === 'format-recommendation'
  ) {
    return 'explore';
  }
  if (
    nav.surface?.type === 'film-detail' ||
    nav.surface?.type === 'opportunity-detail' ||
    nav.surface?.type === 'showtimes' ||
    nav.surface?.type === 'showtimes-browse' ||
    nav.surface?.type === 'build-plan' ||
    nav.surface?.type === 'build-plan-results' ||
    nav.surface?.type === 'build-plan-film-manage' ||
    nav.surface?.type === 'build-plan-showtime-manage' ||
    nav.surface?.type === 'build-plan-plan-details' ||
    nav.surface?.type === 'theater-detail' ||
    nav.surface?.type === 'admin-tmdb-review' ||
    nav.surface?.type === 'profile-settings'
  ) {
    return resolveDestinationId(nav.surface.originPrimary ?? primary);
  }
  if (nav.surface?.type === 'collection') {
    if (nav.surface.collectionId === 'opening-this-week') {
      return resolveDestinationId(nav.surface.originPrimary ?? primary);
    }
    const origin = resolveDestinationId(nav.surface.originPrimary ?? primary);
    if (origin === 'profile') return 'profile';
    return 'explore';
  }
  return primary;
}

/**
 * Chrome back label for a nested surface's origin primary.
 * Home/Explore/Planner/Profile only — never invent a fifth destination.
 *
 * @param {string | null | undefined} originPrimary
 * @param {string} [fallback]
 */
export function originBackLabel(originPrimary, fallback = 'Explore') {
  const origin = resolveDestinationId(originPrimary);
  if (origin === 'home') return 'Home';
  if (origin === 'profile') return 'Profile';
  if (origin === 'planner') return 'Planner';
  return fallback;
}
