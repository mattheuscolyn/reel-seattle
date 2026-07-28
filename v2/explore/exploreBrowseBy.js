import { COLLECTION_IDS } from './exploreIds.js';

/** Browse By directory row definitions (data only). */
export const BROWSE_ROWS = Object.freeze([
  Object.freeze({
    id: COLLECTION_IDS.allMovies,
    label: 'Movies',
    description: 'Everything playing in Seattle',
    tone: 'cyan',
    icon: 'film',
  }),
  Object.freeze({
    id: COLLECTION_IDS.theaters,
    label: 'Theaters',
    description: 'See what’s playing where',
    tone: 'green',
    icon: 'building',
  }),
  Object.freeze({
    id: COLLECTION_IDS.formats,
    label: 'Formats & Experiences',
    description: 'IMAX, 70mm, 35mm, Dolby & more',
    tone: 'violet',
    icon: 'formats',
  }),
  Object.freeze({
    id: COLLECTION_IDS.collections,
    label: 'Collections',
    description: 'Curated lists and themes',
    tone: 'orange',
    icon: 'grid',
  }),
  Object.freeze({
    id: COLLECTION_IDS.comingSoon,
    label: 'Coming Soon',
    description: 'What’s on the way',
    tone: 'gold',
    icon: 'timer',
  }),
  Object.freeze({
    id: COLLECTION_IDS.specialEvents,
    label: 'Special Events',
    description: 'Q&As, early access, marathons',
    tone: 'pink',
    icon: 'badge',
  }),
]);
