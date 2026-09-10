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
      'Curated Home — Top Opportunity and film shelves (Leaving Soon, Special Presentations, Opening This Week, Just Announced).',
  }),
  Object.freeze({
    id: 'explore',
    label: 'Explore',
    title: 'Explore',
    description:
      'User-directed discovery — search, Quick Start, Browse By, and recent searches.',
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
      'Personal hub — identity, Your Films, Friends, favorite theaters, and settings.',
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
    nav.surface?.type === 'profile-settings' ||
    nav.surface?.type === 'profile-friends' ||
    nav.surface?.type === 'friend-invite-landing'
  ) {
    return resolveDestinationId(nav.surface.originPrimary ?? primary);
  }
  if (nav.surface?.type === 'collection') {
    if (
      nav.surface.collectionId === 'opening-this-week' ||
      nav.surface.collectionId === 'leaving-soon' ||
      nav.surface.collectionId === 'just-announced' ||
      nav.surface.collectionId === 'special-presentations'
    ) {
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

const HEADER_BACK_EXCLUDED = new Set([
  'admin-tmdb-review',
  'build-plan-theater-manage',
]);

/**
 * Destination label for the shared header back control.
 * Returns null when the header should not show Back.
 *
 * @param {{
 *   primaryDestinationId?: string,
 *   surface?: {
 *     type?: string,
 *     originPrimary?: string,
 *     collectionId?: string,
 *     returnSurface?: { type?: string } | null,
 *   } | null,
 * }} nav
 * @param {{ filmBackLabel?: string | null }} [options]
 * @returns {string | null}
 */
export function resolveHeaderBackLabel(nav, options = {}) {
  const surface = nav?.surface;
  if (!surface?.type || HEADER_BACK_EXCLUDED.has(surface.type)) {
    return null;
  }

  if (surface.type === 'film-detail') {
    return options.filmBackLabel || originBackLabel(surface.originPrimary);
  }
  if (surface.type === 'showtimes') return 'Film';
  if (surface.type === 'showtimes-browse') {
    return originBackLabel(surface.originPrimary);
  }
  if (surface.type === 'opportunity-detail') {
    return originBackLabel(surface.originPrimary);
  }
  if (surface.type === 'theater-detail') {
    if (surface.returnSurface?.type === 'collection') return 'Theaters';
    return originBackLabel(surface.originPrimary);
  }
  if (surface.type === 'build-plan-plan-details') {
    return surface.returnSurface?.type === 'build-plan-results'
      ? 'Results'
      : 'Planner';
  }
  if (
    surface.type === 'build-plan' ||
    surface.type === 'build-plan-results' ||
    surface.type === 'build-plan-film-manage' ||
    surface.type === 'build-plan-showtime-manage'
  ) {
    return 'Planner';
  }
  if (
    surface.type === 'profile-settings' ||
    surface.type === 'profile-friends'
  ) {
    return originBackLabel(surface.originPrimary);
  }
  if (surface.type === 'friend-invite-landing') {
    return originBackLabel(surface.originPrimary, 'Home');
  }
  if (
    surface.type === 'format-detail' ||
    surface.type === 'experience-detail' ||
    surface.type === 'compare-formats' ||
    surface.type === 'format-recommendation'
  ) {
    return 'Explore';
  }
  if (surface.type === 'collection') {
    if (surface.collectionId === 'search-results') return 'Explore';
    return originBackLabel(surface.originPrimary);
  }
  return originBackLabel(surface.originPrimary);
}
