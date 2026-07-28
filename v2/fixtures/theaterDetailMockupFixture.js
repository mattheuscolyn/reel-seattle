/**
 * Theater Detail MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Content matches Canonical Mockup Images/Theater Detail Page.png (Beacon).
 * Not production theater registry / showtimes. Does not import stores.
 */

import {
  PLACEHOLDER_POSTERS,
  PLACEHOLDER_THEATER_THUMBS,
} from './placeholderMedia.js';

export const THEATER_DETAIL_SECTION_ORDER = Object.freeze([
  'hero',
  'stats',
  'amenities',
  'pricingHours',
  'nowShowing',
  'todaysShowtimes',
]);

/** Default Stage 1 theater for QC seam and Theaters list wiring. */
export const THEATER_DETAIL_DEFAULT_THEATER_ID = 'fixture-beacon';

/**
 * @param {string} [theaterId]
 * @returns {Readonly<object>}
 */
export function resolveTheaterDetailPresentation(theaterId = THEATER_DETAIL_DEFAULT_THEATER_ID) {
  if (theaterId === THEATER_DETAIL_DEFAULT_THEATER_ID) {
    return THEATER_DETAIL_MOCKUP_FIXTURE;
  }
  return THEATER_DETAIL_MOCKUP_FIXTURE;
}

/**
 * @returns {Readonly<object>}
 */
export function getTheaterDetailMockupPresentation() {
  return THEATER_DETAIL_MOCKUP_FIXTURE;
}

/**
 * @type {Readonly<object>}
 */
export const THEATER_DETAIL_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  theaterId: THEATER_DETAIL_DEFAULT_THEATER_ID,
  backLabel: 'Theaters',
  name: 'The Beacon Cinema',
  favoriteBadgeLabel: 'Favorite',
  heroImageUrl: PLACEHOLDER_THEATER_THUMBS.beacon,
  addressLabel: '4405 Rainier Ave S, Seattle, WA 98118',
  websiteLabel: 'Website',
  websiteUrl: 'https://example.com/beacon-stage1',
  directionsLabel: 'Directions',
  directionsUrl: 'https://maps.example.com/beacon-stage1',
  descriptionPreview:
    "Seattle's neighborhood nonprofit cinema in Columbia City. First-run films, repertory series, and community programming in a cozy two-screen venue.",
  descriptionFull:
    "Seattle's neighborhood nonprofit cinema in Columbia City. First-run films, repertory series, and community programming in a cozy two-screen venue. The Beacon has been a South Seattle staple for decades, known for 35mm presentations and filmmaker events.",
  readMoreLabel: 'Read more',
  readLessLabel: 'Read less',
  shareLabel: 'Share theater',
  favoriteLabel: 'Favorite theater',
  stats: Object.freeze([
    Object.freeze({
      id: 'screens',
      icon: 'monitor',
      value: '2',
      label: 'SCREENS',
    }),
    Object.freeze({
      id: 'film',
      icon: 'film',
      value: '35mm',
      label: 'FILM CAPABLE',
    }),
    Object.freeze({
      id: 'digital',
      icon: 'projector',
      value: 'Digital',
      label: 'PROJECTION',
    }),
    Object.freeze({
      id: 'seats',
      icon: 'seat',
      value: '220',
      label: 'SEATS PER SCREEN',
    }),
  ]),
  amenitiesTitle: 'Amenities',
  amenities: Object.freeze([
    Object.freeze({ id: 'concessions', icon: 'popcorn', label: 'Concessions' }),
    Object.freeze({ id: 'beer', icon: 'wine', label: 'Beer & Wine' }),
    Object.freeze({ id: 'accessible', icon: 'accessibility', label: 'Accessible' }),
    Object.freeze({
      id: 'restroom',
      icon: 'people',
      label: 'All-Gender Restroom',
    }),
    Object.freeze({ id: 'ac', icon: 'wind', label: 'Air Conditioning' }),
  ]),
  pricing: Object.freeze({
    title: 'Pricing',
    rows: Object.freeze([
      Object.freeze({ label: 'General Admission', value: '$14.00' }),
      Object.freeze({ label: 'Senior (62+)', value: '$11.00' }),
      Object.freeze({ label: 'Student', value: '$11.00' }),
      Object.freeze({ label: 'Matinee (before 5pm)', value: '$11.00' }),
    ]),
    linkLabel: 'View full pricing',
  }),
  hours: Object.freeze({
    title: 'Hours',
    rows: Object.freeze([
      Object.freeze({ label: 'Mon', value: 'Closed' }),
      Object.freeze({ label: 'Tue – Thu', value: '2:00pm – 11:00pm' }),
      Object.freeze({ label: 'Fri', value: '2:00pm – 12:00am' }),
      Object.freeze({ label: 'Sat', value: '11:00am – 12:00am' }),
      Object.freeze({ label: 'Sun', value: '11:00am – 10:00pm' }),
    ]),
    linkLabel: 'View calendar',
  }),
  nowShowing: Object.freeze({
    title: 'Now showing',
    viewAllLabel: 'View all',
    films: Object.freeze([
      Object.freeze({
        filmKey: 'fixture-theater-long-horizon',
        title: 'The Long Horizon',
        detailLabel: 'Today • 7:00pm',
        formatLabel: '70MM',
        posterUrl: PLACEHOLDER_POSTERS.longHorizon,
        badge: 'NEW',
      }),
      Object.freeze({
        filmKey: 'fixture-theater-classic-comedy',
        title: 'Classic Comedies Night',
        detailLabel: 'Tomorrow • 5:45pm',
        formatLabel: '35MM',
        posterUrl: PLACEHOLDER_POSTERS.budapest,
        badge: null,
      }),
      Object.freeze({
        filmKey: 'fixture-theater-scifi',
        title: 'Sci-Fi Thriller Series',
        detailLabel: 'Tomorrow • 9:30pm',
        formatLabel: 'Digital',
        posterUrl: PLACEHOLDER_POSTERS.perfectBlue,
        badge: null,
      }),
      Object.freeze({
        filmKey: 'fixture-theater-romance',
        title: 'Romance Matinee',
        detailLabel: 'Sun • 2:00pm',
        formatLabel: '35MM',
        posterUrl: PLACEHOLDER_POSTERS.perfect,
        badge: null,
      }),
    ]),
  }),
  todaysShowtimes: Object.freeze({
    title: "Today's showtimes",
    viewWeekLabel: 'View 7 days',
    filtersLabel: 'Filters',
    screenTabs: Object.freeze([
      Object.freeze({ id: 'all', label: 'All Screens' }),
      Object.freeze({ id: 'screen-1', label: 'Screen 1' }),
      Object.freeze({ id: 'screen-2', label: 'Screen 2' }),
    ]),
    featuredFilm: Object.freeze({
      filmKey: 'fixture-theater-long-horizon',
      title: 'The Long Horizon',
      metaLabel: '2025 • 2h 20m • Drama, Western',
      formatLabel: '70MM',
      posterUrl: PLACEHOLDER_POSTERS.longHorizon,
      seatingNote: 'Reserved seating',
    }),
    screens: Object.freeze([
      Object.freeze({
        id: 'screen-1',
        label: 'Screen 1',
        seatingNote: 'Reserved seating',
        times: Object.freeze([
          Object.freeze({ id: 's1-130', label: '1:30pm' }),
          Object.freeze({ id: 's1-400', label: '4:00pm' }),
          Object.freeze({ id: 's1-700', label: '7:00pm', selected: true }),
          Object.freeze({ id: 's1-945', label: '9:45pm' }),
        ]),
      }),
      Object.freeze({
        id: 'screen-2',
        label: 'Screen 2',
        seatingNote: 'Reserved seating',
        times: Object.freeze([
          Object.freeze({ id: 's2-215', label: '2:15pm' }),
          Object.freeze({ id: 's2-445', label: '4:45pm' }),
          Object.freeze({ id: 's2-730', label: '7:30pm' }),
          Object.freeze({ id: 's2-1015', label: '10:15pm' }),
        ]),
      }),
    ]),
  }),
  deferredMessages: Object.freeze({
    share: 'Shareable Theater Detail URLs are not available in this Stage 1 shell yet.',
    viewAll: 'Full theater program view is deferred in Stage 1.',
    viewWeek: '7-day schedule view is deferred in Stage 1.',
    filters: 'Showtime filters are deferred in Stage 1.',
    showtime: 'Ticket links are deferred in Stage 1.',
    pricing: 'Full pricing details are deferred in Stage 1.',
    hours: 'Calendar hours view is deferred in Stage 1.',
  }),
});

/** Query seam for Stage 1 QC / tests. */
export const THEATER_DETAIL_QUERY = 'theaterDetail';

/**
 * @returns {boolean}
 */
export function isTheaterDetailQueryOpen() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(THEATER_DETAIL_QUERY);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}
