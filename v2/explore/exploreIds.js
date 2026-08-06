/**
 * Explore collection / directory identifiers.
 * Movies & Theaters are Explore concepts — never primary tabs.
 */

export const COLLECTION_IDS = Object.freeze({
  openingThisWeek: 'opening-this-week',
  leavingSoon: 'leaving-soon',
  allMovies: 'all-movies',
  today: 'today',
  thisWeek: 'this-week',
  weekend: 'weekend',
  imax: 'imax',
  thirtyFiveMm: '35mm',
  searchResults: 'search-results',
  theaters: 'theaters',
  formats: 'formats',
  collections: 'collections',
  comingSoon: 'coming-soon',
  specialEvents: 'special-events',
  suggestedStarts: 'suggested-starts',
  filmActivity: 'film-activity',
  saved: 'saved',
  seen: 'seen',
  /** Internal id; user-facing label is “Not interested”. */
  hidden: 'hidden',
});

/** @type {ReadonlySet<string>} */
export const EXPLORE_SURFACE_IDS = new Set(Object.values(COLLECTION_IDS));

export const COLLECTION_TITLES = Object.freeze({
  [COLLECTION_IDS.openingThisWeek]: 'Opening This Week',
  [COLLECTION_IDS.leavingSoon]: 'Leaving Soon',
  [COLLECTION_IDS.allMovies]: 'All Movies',
  [COLLECTION_IDS.today]: 'Today',
  [COLLECTION_IDS.thisWeek]: 'This Week',
  [COLLECTION_IDS.weekend]: 'Weekend',
  [COLLECTION_IDS.imax]: 'IMAX',
  [COLLECTION_IDS.thirtyFiveMm]: '35mm',
  [COLLECTION_IDS.searchResults]: 'Search',
  [COLLECTION_IDS.theaters]: 'Theaters',
  [COLLECTION_IDS.formats]: 'Formats & Experiences',
  [COLLECTION_IDS.collections]: 'Collections',
  [COLLECTION_IDS.comingSoon]: 'Coming Soon',
  [COLLECTION_IDS.specialEvents]: 'Special Events',
  [COLLECTION_IDS.suggestedStarts]: 'Suggested Starts',
  [COLLECTION_IDS.filmActivity]: 'Film Activity',
  [COLLECTION_IDS.saved]: 'Saved',
  [COLLECTION_IDS.seen]: 'Seen',
  [COLLECTION_IDS.hidden]: 'Not interested',
});

/**
 * Format tags treated as IMAX in current public artifacts.
 * @type {readonly string[]}
 */
export const IMAX_FORMAT_TAGS = Object.freeze(['imax', 'imax-at-amc']);

/**
 * Format tags treated as 35mm. Empty in current showtimes sample —
 * shortcut remains visible but results are honest-unavailable until data exists.
 * @type {readonly string[]}
 */
export const THIRTY_FIVE_MM_FORMAT_TAGS = Object.freeze(['35mm', '35-mm']);
