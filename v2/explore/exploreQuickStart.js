import { COLLECTION_IDS } from './exploreIds.js';

/** Quick Start shortcut definitions (data only). */
export const QUICK_START = Object.freeze([
  Object.freeze({
    id: COLLECTION_IDS.allMovies,
    label: 'All Movies',
    icon: 'ticket',
  }),
  Object.freeze({
    id: 'all-showtimes',
    label: 'All showtimes',
    icon: 'showtimes',
  }),
  Object.freeze({
    id: COLLECTION_IDS.today,
    label: 'Today',
    icon: 'today',
  }),
  Object.freeze({
    id: COLLECTION_IDS.thisWeek,
    label: 'This Week',
    icon: 'week',
  }),
  Object.freeze({
    id: COLLECTION_IDS.theaters,
    label: 'Theaters',
    icon: 'pin',
  }),
  Object.freeze({
    id: COLLECTION_IDS.imax,
    label: 'IMAX',
    icon: 'imax',
  }),
  Object.freeze({
    id: COLLECTION_IDS.thirtyFiveMm,
    label: '35mm',
    icon: 'reel',
  }),
]);
