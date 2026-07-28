/**
 * VISUAL-TEST / DEMO FIXTURES ONLY.
 *
 * Normal Home rendering must not import film arrays from this module.
 * Explore More row labels are stable UI chrome (not film data) and may be used.
 *
 * Top Opportunity / Opening / Leaving film fixtures below are for isolated
 * visual regression or component demos — never as production Home defaults.
 */

import { PLACEHOLDER_BACKDROPS, PLACEHOLDER_POSTERS } from './placeholderMedia.js';

/** @typedef {'design-fixture'} FixtureSource */

/**
 * @typedef {object} TopOpportunityFixture
 * @property {string} id
 * @property {string} title
 * @property {string} theaterName
 * @property {string} showtimeLabel
 * @property {string} runtimeLabel
 * @property {string} genre
 * @property {string} reason
 * @property {string | null} backdropUrl
 * @property {string | null} posterUrl
 * @property {FixtureSource} source
 */

/**
 * @typedef {object} ShelfFilmFixture
 * @property {string} id
 * @property {string} title
 * @property {string | null} genre
 * @property {string} metaLabel
 * @property {string | null} posterUrl
 * @property {FixtureSource} source
 */

/** @type {readonly TopOpportunityFixture[]} */
export const TOP_OPPORTUNITY_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'fixture-top-1',
    title: 'The Long Horizon',
    theaterName: 'Paramount Theatre',
    showtimeLabel: 'Tonight 7:00pm',
    runtimeLabel: '2h 14m',
    genre: 'Drama',
    reason: 'Stunning 70mm cinematography in a new roadshow engagement.',
    backdropUrl: PLACEHOLDER_BACKDROPS.horizon,
    posterUrl: null,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-top-2',
    title: 'Night Ferry',
    theaterName: 'SIFF Cinema Uptown',
    showtimeLabel: 'Fri 8:15pm',
    runtimeLabel: '1h 52m',
    genre: 'Thriller',
    reason: 'A rare single-screen evening with a post-film conversation.',
    backdropUrl: PLACEHOLDER_BACKDROPS.nocturne,
    posterUrl: null,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-top-3',
    title: 'Saltwater Archive',
    theaterName: 'Northwest Film Forum',
    showtimeLabel: 'Sat 5:30pm',
    runtimeLabel: '1h 38m',
    genre: 'Documentary',
    reason: 'Limited run with filmmaker notes unique to this engagement.',
    backdropUrl: PLACEHOLDER_BACKDROPS.estuary,
    posterUrl: null,
    source: 'design-fixture',
  }),
]);

/**
 * Opening This Week — visual fixture only.
 * Not derived from newly_added_current.json.
 *
 * @type {readonly ShelfFilmFixture[]}
 */
export const OPENING_THIS_WEEK_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'fixture-open-1',
    title: 'Quiet City',
    genre: 'Documentary',
    metaLabel: 'Tonight',
    posterUrl: PLACEHOLDER_POSTERS.quietCity,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-open-2',
    title: 'Blue Hour',
    genre: 'Drama',
    metaLabel: 'Fri 5/18',
    posterUrl: PLACEHOLDER_POSTERS.blueHour,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-open-3',
    title: 'Harbor Light',
    genre: 'Comedy',
    metaLabel: 'Fri 5/18',
    posterUrl: PLACEHOLDER_POSTERS.harbor,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-open-4',
    title: 'Northbound',
    genre: 'Adventure',
    metaLabel: 'Sat 5/19',
    posterUrl: PLACEHOLDER_POSTERS.north,
    source: 'design-fixture',
  }),
]);

/**
 * Leaving Soon — visual fixture only.
 * Does NOT consume gated public/data/leaving_soon_current.json.
 *
 * @type {readonly ShelfFilmFixture[]}
 */
export const LEAVING_SOON_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'fixture-leave-1',
    title: 'Perfect Moment',
    genre: null,
    metaLabel: 'Ends May 19',
    posterUrl: PLACEHOLDER_POSTERS.perfect,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-leave-2',
    title: 'Winter Light',
    genre: null,
    metaLabel: 'Ends May 20',
    posterUrl: PLACEHOLDER_POSTERS.winter,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-leave-3',
    title: 'River Song',
    genre: null,
    metaLabel: 'Ends May 21',
    posterUrl: PLACEHOLDER_POSTERS.river,
    source: 'design-fixture',
  }),
  Object.freeze({
    id: 'fixture-leave-4',
    title: 'Midnight Run',
    genre: null,
    metaLabel: 'Ends May 22',
    posterUrl: PLACEHOLDER_POSTERS.midnight,
    source: 'design-fixture',
  }),
]);

/** Explore More directory rows — stub destinations for visual composition. */
export const EXPLORE_MORE_ROWS = Object.freeze([
  Object.freeze({
    id: 'movies',
    label: 'Movies',
    description: 'Browse all movies and what’s playing',
    icon: 'film',
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
    icon: 'spark',
  }),
  Object.freeze({
    id: 'collections',
    label: 'Collections',
    description: 'Curated lists and staff picks',
    icon: 'collection',
  }),
  Object.freeze({
    id: 'search',
    label: 'Search',
    description: 'Find a movie, theater, or anything',
    icon: 'search',
  }),
]);
