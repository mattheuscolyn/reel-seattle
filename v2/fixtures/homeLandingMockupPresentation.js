/**
 * Home Landing Page mockup presentation (visual QC / `?homeMockup=1`).
 *
 * Content matches Canonical Mockup Images/Home Landing Page.png.
 * Never used as the production Home default.
 */

import {
  PLACEHOLDER_BACKDROPS,
  PLACEHOLDER_POSTERS,
} from './placeholderMedia.js';

export const HOME_MOCKUP_QUERY = 'homeMockup';
export const HOME_MOCKUP_STORAGE_KEY = 'reel-seattle.v2.homeMockup';

/**
 * @returns {boolean}
 */
export function isHomeMockupMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(HOME_MOCKUP_QUERY) === '1') return true;
    if (params.get(HOME_MOCKUP_QUERY) === '0') return false;
    return window.localStorage?.getItem(HOME_MOCKUP_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Quick Paths rows — canonical Home mockup labels. */
export const HOME_QUICK_PATH_ROWS = Object.freeze([
  Object.freeze({
    id: 'saved',
    label: 'Saved',
    description: 'Your saved films and upcoming picks',
    icon: 'bookmark',
  }),
  Object.freeze({
    id: 'seen',
    label: 'Seen',
    description: 'Your watch history',
    icon: 'check',
  }),
  Object.freeze({
    id: 'theaters',
    label: 'Theaters',
    description: 'Explore venues and what’s showing',
    icon: 'building',
  }),
  Object.freeze({
    id: 'formats',
    label: 'Formats & Experiences',
    description: 'Discover special presentations',
    icon: 'ticket',
  }),
  Object.freeze({
    id: 'search',
    label: 'Search',
    description: 'Find a movie, theater, or anything',
    icon: 'search',
  }),
]);

/**
 * Top Opportunity selections shaped like selectTopOpportunities output.
 */
export const HOME_MOCKUP_TOP_OPPORTUNITIES = Object.freeze([
  Object.freeze({
    film: Object.freeze({
      filmKey: 'fixture-top-1',
      title: 'The Long Horizon',
      posterUrl: PLACEHOLDER_POSTERS.longHorizon,
      backdropUrl: PLACEHOLDER_BACKDROPS.horizon,
      runtimeMin: 134,
      genre: 'Drama',
      showtimeCount: 3,
      theaterCount: 1,
    }),
    representativeOpportunity: Object.freeze({
      opportunityKey: 'fixture-opp-top-1',
      filmKey: 'fixture-top-1',
      theaterId: 'siff-cinema-downtown',
      theaterName: 'SIFF Downtown',
      // localDate omitted so showing line is "SIFF Downtown · Tonight 7:00pm"
      localDate: null,
      localTime: '19:00',
      timeDisplay: 'Tonight 7:00pm',
      sortableLocalDateTime: '2026-05-16T19:00',
      formatLabels: ['70mm'],
      ticketUrl: null,
    }),
    selectionReasonCode: 'special_format',
    selectionReasonLabel:
      '70mm roadshow. Limited engagement. 3 showtimes this week.',
    supportingFacts: Object.freeze([]),
    additionalShowtimeCount: 2,
    candidateIndex: 0,
    chronologicalKey: '2026-05-16T19:00|fixture-opp-top-1',
  }),
  Object.freeze({
    film: Object.freeze({
      filmKey: 'fixture-top-2',
      title: 'Night Ferry',
      posterUrl: null,
      backdropUrl: PLACEHOLDER_BACKDROPS.nocturne,
      runtimeMin: 112,
      showtimeCount: 2,
      theaterCount: 1,
    }),
    representativeOpportunity: Object.freeze({
      opportunityKey: 'fixture-opp-top-2',
      filmKey: 'fixture-top-2',
      theaterId: 'siff-cinema-uptown',
      theaterName: 'SIFF Cinema Uptown',
      localDate: '2026-05-17',
      localTime: '20:15',
      timeDisplay: 'Fri 8:15pm',
      sortableLocalDateTime: '2026-05-17T20:15',
      formatLabels: [],
      ticketUrl: null,
    }),
    selectionReasonCode: 'showing_soon',
    selectionReasonLabel: 'A rare single-screen evening with a post-film conversation.',
    supportingFacts: Object.freeze([]),
    additionalShowtimeCount: 1,
    candidateIndex: 1,
    chronologicalKey: '2026-05-17T20:15|fixture-opp-top-2',
  }),
  Object.freeze({
    film: Object.freeze({
      filmKey: 'fixture-top-3',
      title: 'Saltwater Archive',
      posterUrl: null,
      backdropUrl: PLACEHOLDER_BACKDROPS.estuary,
      runtimeMin: 98,
      showtimeCount: 1,
      theaterCount: 1,
    }),
    representativeOpportunity: Object.freeze({
      opportunityKey: 'fixture-opp-top-3',
      filmKey: 'fixture-top-3',
      theaterId: 'northwest-film-forum',
      theaterName: 'Northwest Film Forum',
      localDate: '2026-05-18',
      localTime: '17:30',
      timeDisplay: 'Sat 5:30pm',
      sortableLocalDateTime: '2026-05-18T17:30',
      formatLabels: [],
      ticketUrl: null,
    }),
    selectionReasonCode: 'limited_listings',
    selectionReasonLabel: 'Limited run with filmmaker notes unique to this engagement.',
    supportingFacts: Object.freeze([]),
    additionalShowtimeCount: 0,
    candidateIndex: 2,
    chronologicalKey: '2026-05-18T17:30|fixture-opp-top-3',
  }),
]);

export const HOME_MOCKUP_OPENING_SHELF = Object.freeze({
  status: 'ready',
  reason: null,
  semantics: 'home-mockup-opening',
  films: Object.freeze([
    Object.freeze({
      id: 'fixture-open-1',
      filmKey: 'fixture-open-1',
      title: 'Quiet City',
      genre: 'Drama',
      metaLabel: '1h 42m',
      posterUrl: PLACEHOLDER_POSTERS.quietCity,
      runtimeMin: 102,
      nextOpportunityKey: 'fixture-opp-open-1',
      surfaceReason: 'opening',
      surfaceReasonLabel: null,
      source: 'design-fixture',
    }),
    Object.freeze({
      id: 'fixture-open-2',
      filmKey: 'fixture-open-2',
      title: 'Blue Hour',
      genre: 'Drama',
      metaLabel: '2h 05m',
      posterUrl: PLACEHOLDER_POSTERS.blueHour,
      runtimeMin: 125,
      nextOpportunityKey: 'fixture-opp-open-2',
      surfaceReason: 'best_current',
      surfaceReasonLabel: 'Best current opportunity',
      source: 'design-fixture',
    }),
    Object.freeze({
      id: 'fixture-open-3',
      filmKey: 'fixture-open-3',
      title: 'The Last Rehearsal',
      genre: 'Comedy',
      metaLabel: '1h 37m',
      posterUrl: PLACEHOLDER_POSTERS.lastRehearsal,
      runtimeMin: 97,
      nextOpportunityKey: 'fixture-opp-open-3',
      surfaceReason: 'opening',
      surfaceReasonLabel: null,
      source: 'design-fixture',
    }),
    Object.freeze({
      id: 'fixture-open-4',
      filmKey: 'fixture-open-4',
      title: 'Saltwater Road',
      genre: 'Drama',
      metaLabel: '2h 47m',
      posterUrl: PLACEHOLDER_POSTERS.saltwaterRoad,
      runtimeMin: 167,
      nextOpportunityKey: 'fixture-opp-open-4',
      surfaceReason: 'opening',
      surfaceReasonLabel: null,
      source: 'design-fixture',
    }),
  ]),
});

export const HOME_MOCKUP_LEAVING_SHELF = Object.freeze({
  status: 'ready',
  reason: null,
  semantics: 'home-mockup-leaving',
  films: Object.freeze([
    Object.freeze({
      id: 'fixture-leave-1',
      filmKey: 'fixture-leave-1',
      title: 'Perfect Moment',
      genre: 'Drama',
      metaLabel: '1h 29m',
      posterUrl: PLACEHOLDER_POSTERS.perfect,
      runtimeMin: 89,
      nextOpportunityKey: null,
      surfaceReason: 'leaving',
      surfaceReasonLabel: null,
      source: 'design-fixture',
    }),
    Object.freeze({
      id: 'fixture-leave-2',
      filmKey: 'fixture-leave-2',
      title: 'Winter Light',
      genre: 'Drama',
      metaLabel: '1h 44m',
      posterUrl: PLACEHOLDER_POSTERS.winter,
      runtimeMin: 104,
      nextOpportunityKey: null,
      surfaceReason: 'leaving',
      surfaceReasonLabel: null,
      source: 'design-fixture',
    }),
    Object.freeze({
      id: 'fixture-leave-3',
      filmKey: 'fixture-leave-3',
      title: 'After the Storm',
      genre: 'Drama',
      metaLabel: '1h 56m',
      posterUrl: PLACEHOLDER_POSTERS.afterStorm,
      runtimeMin: 116,
      nextOpportunityKey: null,
      surfaceReason: 'leaving',
      surfaceReasonLabel: null,
      source: 'design-fixture',
    }),
    Object.freeze({
      id: 'fixture-leave-4',
      filmKey: 'fixture-leave-4',
      title: 'Goodbye Yesterday',
      genre: 'Drama',
      metaLabel: '2h 22m',
      posterUrl: PLACEHOLDER_POSTERS.goodbyeYesterday,
      runtimeMin: 142,
      nextOpportunityKey: null,
      surfaceReason: 'leaving',
      surfaceReasonLabel: null,
      source: 'design-fixture',
    }),
  ]),
});

/** Synthetic HomeData so inline detail builders resolve fixture films. */
export function getHomeMockupHomeData() {
  const opening = HOME_MOCKUP_OPENING_SHELF.films;
  const leaving = HOME_MOCKUP_LEAVING_SHELF.films;
  const top = HOME_MOCKUP_TOP_OPPORTUNITIES;
  const films = [
    ...top.map((row) => ({
      filmKey: row.film.filmKey,
      title: row.film.title,
      posterUrl: row.film.posterUrl,
      backdropUrl: row.film.backdropUrl,
      runtimeMin: row.film.runtimeMin,
      showtimeCount: row.film.showtimeCount,
      theaterCount: row.film.theaterCount,
      filmId: null,
    })),
    ...opening.map((film) => ({
      filmKey: film.filmKey,
      title: film.title,
      posterUrl: film.posterUrl,
      runtimeMin: film.runtimeMin,
      showtimeCount: 2,
      theaterCount: 1,
      filmId: null,
    })),
    ...leaving.map((film) => ({
      filmKey: film.filmKey,
      title: film.title,
      posterUrl: film.posterUrl,
      runtimeMin: film.runtimeMin,
      showtimeCount: 1,
      theaterCount: 1,
      filmId: null,
    })),
  ];

  const opportunities = [
    ...top.map((row) => ({ ...row.representativeOpportunity })),
    Object.freeze({
      opportunityKey: 'fixture-opp-open-1',
      filmKey: 'fixture-open-1',
      theaterId: 'siff-cinema-downtown',
      theaterName: 'SIFF Downtown',
      localDate: '2026-05-16',
      localTime: '19:00',
      timeDisplay: '7:00pm',
      sortableLocalDateTime: '2026-05-16T19:00',
      formatLabels: [],
      ticketUrl: null,
    }),
    Object.freeze({
      opportunityKey: 'fixture-opp-open-2',
      filmKey: 'fixture-open-2',
      theaterId: 'siff-cinema-uptown',
      theaterName: 'SIFF Cinema Uptown',
      localDate: '2026-05-18',
      localTime: '19:30',
      timeDisplay: '7:30pm',
      sortableLocalDateTime: '2026-05-18T19:30',
      formatLabels: [],
      ticketUrl: null,
    }),
    Object.freeze({
      opportunityKey: 'fixture-opp-open-3',
      filmKey: 'fixture-open-3',
      theaterId: 'the-beacon',
      theaterName: 'The Beacon',
      localDate: '2026-05-18',
      localTime: '20:00',
      timeDisplay: '8:00pm',
      sortableLocalDateTime: '2026-05-18T20:00',
      formatLabels: [],
      ticketUrl: null,
    }),
    Object.freeze({
      opportunityKey: 'fixture-opp-open-4',
      filmKey: 'fixture-open-4',
      theaterId: 'northwest-film-forum',
      theaterName: 'Northwest Film Forum',
      localDate: '2026-05-19',
      localTime: '17:00',
      timeDisplay: '5:00pm',
      sortableLocalDateTime: '2026-05-19T17:00',
      formatLabels: [],
      ticketUrl: null,
    }),
  ];

  return {
    generatedAt: '2026-05-16T12:00:00Z',
    leavingSoonExcluded: true,
    source: 'home-landing-mockup',
    films,
    opportunities,
    newlyAdded: opening.map((film) => ({
      filmKey: film.filmKey,
      title: film.title,
      posterUrl: film.posterUrl,
      firstObservedAt: '2026-05-16',
    })),
    opportunityCandidates: [],
  };
}

/**
 * Inline detail for Blue Hour matching the canonical Home mockup.
 */
export function getHomeMockupBlueHourDetail() {
  return {
    filmKey: 'fixture-open-2',
    filmId: null,
    title: 'Blue Hour',
    posterUrl: PLACEHOLDER_POSTERS.blueHour,
    synopsis:
      'A solitary musician returns to his hometown for one night, where the past and present collide.',
    rating: null,
    year: 2024,
    genre: 'Drama',
    metaLine: '2h 05m · Drama · 2024',
    opportunityKey: 'fixture-opp-open-2',
    showingLine: 'SIFF Cinema Uptown · Fri 5/18 · 7:30pm',
    ticketUrl: null,
    surfaceReasonLabel: 'Best current opportunity',
    alsoPlayingLabel: null,
    hasEnrichment: false,
  };
}

/**
 * Full mockup page presentation for Home Landing QC.
 */
export function getHomeLandingMockupPresentation() {
  return {
    source: 'home-landing-mockup',
    topOpportunities: HOME_MOCKUP_TOP_OPPORTUNITIES,
    openingShelf: HOME_MOCKUP_OPENING_SHELF,
    leavingShelf: HOME_MOCKUP_LEAVING_SHELF,
    quickPaths: HOME_QUICK_PATH_ROWS,
    homeData: getHomeMockupHomeData(),
    /** Canonical comparison state: first Top Opp + second Opening film expanded. */
    initialTopOppIndex: 0,
    initialExpanded: Object.freeze({
      shelfId: 'v2-opening',
      filmKey: 'fixture-open-2',
    }),
    blueHourDetail: getHomeMockupBlueHourDetail(),
  };
}
