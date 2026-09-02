/**
 * Opening This Week fixtures — mixed categories for visual QC and tests.
 *
 * Uses the same presentation fields as the live artifact-backed surface.
 * Home shelf continues to use buildOpeningThisWeekShelf (provisional newly-added path).
 */

import { PLACEHOLDER_POSTERS } from './placeholderMedia.js';

export const OPENING_THIS_WEEK_SECTION_ORDER = Object.freeze([
  'header',
  'categories',
  'controls',
  'filmList',
]);

const MIXED_FILMS = Object.freeze([
  Object.freeze({
    filmKey: 'fixture-opening-long-horizon',
    title: 'The Long Horizon',
    badge: 'New',
    categoryId: 'new',
    sectionLabel: 'New',
    metaLine: '2025 • 2h 20m • Drama, Western',
    synopsis:
      'A lone traveler crosses a changing frontier in search of a place to call home.',
    posterUrl: PLACEHOLDER_POSTERS.longHorizon,
    openingDate: '2025-05-23',
    dateLabel: 'Opens Fri, May 23',
    availabilityLabel: null,
    theaterId: 'paramount-theatre',
    theaterName: 'Paramount Theatre',
    timeLabel: 'Fri 7:00pm',
    formatLabel: '70MM',
    formatLabels: Object.freeze(['70MM']),
    showtimeCount: 8,
    visibleShowtimeCount: 8,
    theaterCount: 2,
    hasUpcomingShowtimes: true,
    whySeeIt: 'Shot on 70mm across breathtaking landscapes.',
    alsoPlaying: Object.freeze({
      theaterName: 'SIFF Cinema Uptown',
      detailLabel: 'May 23 • 7:15pm',
    }),
    initiallyExpanded: false,
  }),
  Object.freeze({
    filmKey: 'fixture-opening-cabinet',
    title: 'The Cabinet of Dr. Caligari',
    badge: 'Revival',
    categoryId: 'revival',
    sectionLabel: 'Revivals',
    metaLine: '1920 • 1h 17m • Horror',
    synopsis: 'A landmark of German Expressionist cinema.',
    posterUrl: PLACEHOLDER_POSTERS.quietCity,
    openingDate: '2025-05-24',
    dateLabel: 'Opened Sat, May 24',
    availabilityLabel: null,
    theaterId: 'the-beacon-cinema',
    theaterName: 'The Beacon Cinema',
    timeLabel: null,
    formatLabel: '35MM',
    formatLabels: Object.freeze(['35MM']),
    showtimeCount: 2,
    visibleShowtimeCount: 2,
    theaterCount: 1,
    hasUpcomingShowtimes: true,
    whySeeIt: null,
    alsoPlaying: null,
    initiallyExpanded: false,
  }),
  Object.freeze({
    filmKey: 'fixture-opening-screen-unseen',
    title: 'AMC Screen Unseen: May 23',
    badge: 'Special Event',
    categoryId: 'event',
    sectionLabel: 'Special Events',
    metaLine: '2025 • Mystery screening',
    synopsis: null,
    posterUrl: PLACEHOLDER_POSTERS.blueHour,
    openingDate: '2025-05-23',
    dateLabel: 'One night · Fri, May 23',
    availabilityLabel: null,
    theaterId: 'amc-pacific-place-11',
    theaterName: 'AMC Pacific Place 11',
    timeLabel: null,
    formatLabel: 'DCP',
    formatLabels: Object.freeze(['DCP']),
    showtimeCount: 1,
    visibleShowtimeCount: 1,
    theaterCount: 1,
    hasUpcomingShowtimes: true,
    engagementDays: 1,
    whySeeIt: null,
    alsoPlaying: null,
    initiallyExpanded: false,
  }),
  Object.freeze({
    filmKey: 'fixture-opening-ended-run',
    title: 'Harry Potter And The Half Blood Prince',
    badge: 'Revival',
    categoryId: 'revival',
    sectionLabel: 'Revivals',
    metaLine: '2009 • 2h 33m • Fantasy',
    synopsis: null,
    posterUrl: PLACEHOLDER_POSTERS.lastRehearsal,
    openingDate: '2025-05-21',
    dateLabel: 'Opened Wed, May 21',
    availabilityLabel: 'No upcoming showtimes',
    theaterId: 'amc-southcenter-16',
    theaterName: 'AMC Southcenter 16',
    timeLabel: null,
    formatLabel: null,
    formatLabels: Object.freeze([]),
    showtimeCount: 0,
    visibleShowtimeCount: 0,
    theaterCount: 0,
    hasUpcomingShowtimes: false,
    noCurrentShowtimes: true,
    whySeeIt: null,
    alsoPlaying: null,
    initiallyExpanded: false,
  }),
]);

/**
 * @returns {Readonly<object>}
 */
export function getOpeningThisWeekMockupPresentation() {
  return OPENING_THIS_WEEK_MOCKUP_FIXTURE;
}

/**
 * @type {Readonly<object>}
 */
export const OPENING_THIS_WEEK_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  pageTitle: 'Opening This Week',
  pageSubtitle: 'Films opening in Seattle this week',
  countLabel: 'Films opening in Seattle this week · 4',
  sortLabel: 'Sort',
  sortValue: 'Opening date',
  filtersLabel: 'Filters',
  films: MIXED_FILMS,
  sections: Object.freeze([
    Object.freeze({ id: 'new', label: 'New', films: [MIXED_FILMS[0]] }),
    Object.freeze({ id: 'revival', label: 'Revivals', films: [MIXED_FILMS[1], MIXED_FILMS[3]] }),
    Object.freeze({
      id: 'event',
      label: 'Special Events',
      films: [MIXED_FILMS[2]],
    }),
  ]),
  categoryChips: Object.freeze([
    Object.freeze({ id: 'all', label: 'All' }),
    Object.freeze({ id: 'new', label: 'New' }),
    Object.freeze({ id: 'revival', label: 'Revivals' }),
    Object.freeze({ id: 'event', label: 'Special Events' }),
  ]),
  showCategoryChips: true,
  activeCategoryId: 'all',
  totalCount: 4,
  week: Object.freeze({
    startDate: '2025-05-19',
    endDate: '2025-05-25',
  }),
});

export const OPENING_THIS_WEEK_UNAVAILABLE_FIXTURE = Object.freeze({
  source: 'live-unavailable',
  pageTitle: 'Opening This Week',
  pageSubtitle: 'Films opening in Seattle this week',
  countLabel: null,
  unavailableTitle: 'Opening This Week isn’t available right now.',
  unavailableBody: 'Check back later or browse current showtimes.',
  sortLabel: 'Sort',
  filtersLabel: 'Filters',
  films: Object.freeze([]),
  sections: Object.freeze([]),
  categoryChips: Object.freeze([]),
  showCategoryChips: false,
  activeCategoryId: 'all',
  totalCount: 0,
  week: null,
});

export const OPENING_THIS_WEEK_EMPTY_FIXTURE = Object.freeze({
  source: 'live-empty',
  pageTitle: 'Opening This Week',
  pageSubtitle: 'Films opening in Seattle this week',
  countLabel: null,
  emptyTitle: 'Nothing opening in Seattle this week.',
  emptyBody: 'Browse current showtimes to see what’s playing.',
  sortLabel: 'Sort',
  filtersLabel: 'Filters',
  films: Object.freeze([]),
  sections: Object.freeze([]),
  categoryChips: Object.freeze([]),
  showCategoryChips: false,
  activeCategoryId: 'all',
  totalCount: 0,
  week: Object.freeze({
    startDate: '2025-05-19',
    endDate: '2025-05-25',
  }),
});

export const OPENING_THIS_WEEK_SPARSE_FIXTURE = Object.freeze({
  ...OPENING_THIS_WEEK_MOCKUP_FIXTURE,
  source: 'mockup-fixture-sparse',
  countLabel: 'Films opening in Seattle this week · 1',
  films: Object.freeze([MIXED_FILMS[2]]),
  sections: Object.freeze([
    Object.freeze({ id: 'event', label: 'Special Events', films: [MIXED_FILMS[2]] }),
  ]),
  categoryChips: Object.freeze([]),
  showCategoryChips: false,
  totalCount: 1,
});

/**
 * Stage 1 mockup fixture for designed Opening This Week page (visual QC).
 * Live enriched presentation is built in OpeningThisWeekSurface when homeData is provided.
 * @returns {ReturnType<typeof getOpeningThisWeekMockupPresentation>}
 */
export function resolveOpeningThisWeekPresentation() {
  return getOpeningThisWeekMockupPresentation();
}
