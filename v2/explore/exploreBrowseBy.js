/**
 * Explore Browse By directory row definitions (data only).
 */

import { COLLECTION_IDS } from './exploreIds.js';

/** Browse By Showtimes destination (opens showtimes-browse, not a collection). */
export const BROWSE_SHOWTIMES_ID = 'showtimes';

/** Browse By directory row definitions (data only). */
export const BROWSE_ROWS = Object.freeze([
  Object.freeze({
    id: BROWSE_SHOWTIMES_ID,
    label: 'Showtimes',
    description: 'Browse what’s playing now',
    tone: 'blue',
    icon: 'showtimes',
    kind: 'showtimes',
  }),
  Object.freeze({
    id: COLLECTION_IDS.allMovies,
    label: 'Movies',
    description: 'Everything playing in Seattle',
    tone: 'cyan',
    icon: 'film',
    kind: 'browse',
  }),
  Object.freeze({
    id: COLLECTION_IDS.theaters,
    label: 'Theaters',
    description: 'See what’s playing where',
    tone: 'green',
    icon: 'building',
    kind: 'browse',
  }),
  Object.freeze({
    id: COLLECTION_IDS.formats,
    label: 'Formats & Experiences',
    description: 'IMAX, 70mm, 35mm, Dolby & more',
    tone: 'violet',
    icon: 'formats',
    kind: 'browse',
  }),
  Object.freeze({
    id: COLLECTION_IDS.collections,
    label: 'Collections',
    description: 'Curated lists and themes',
    tone: 'orange',
    icon: 'grid',
    kind: 'browse',
  }),
  Object.freeze({
    id: COLLECTION_IDS.comingSoon,
    label: 'Coming Soon',
    description: 'What’s on the way',
    tone: 'gold',
    icon: 'timer',
    kind: 'browse',
  }),
  Object.freeze({
    id: COLLECTION_IDS.specialEvents,
    label: 'Special Events',
    description: 'Q&As, early access, marathons',
    tone: 'pink',
    icon: 'badge',
    kind: 'browse',
  }),
]);

export function isBrowseShowtimesId(id) {
  return id === BROWSE_SHOWTIMES_ID;
}
