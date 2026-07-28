/**
 * Film Detail VISUAL-DEVELOPMENT fixtures ONLY.
 *
 * Used when `?fdVisual=1` (or localStorage flag) is active in the local v2 shell.
 * Never import these values into production selectors, stores, or analytics.
 * Normal Film Detail mode must remain data-honest and must not read this module
 * for default rendering.
 */

import { PLACEHOLDER_BACKDROPS } from './placeholderMedia.js';

function filmDetailPosterSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="55%" stop-color="#1a1630"/>
      <stop offset="100%" stop-color="#3a2458"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="35%" r="45%">
      <stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <circle cx="200" cy="210" r="120" fill="url(#r)"/>
  <circle cx="200" cy="210" r="28" fill="#0b1020" stroke="#d4a574" stroke-width="2"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const FILM_DETAIL_VISUAL_FLAG_QUERY = 'fdVisual';
export const FILM_DETAIL_VISUAL_STORAGE_KEY = 'reel-seattle.v2.fdVisual';

/**
 * @returns {boolean}
 */
export function isFilmDetailVisualFixtureMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(FILM_DETAIL_VISUAL_FLAG_QUERY) === '1') return true;
    if (window.localStorage?.getItem(FILM_DETAIL_VISUAL_STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** @typedef {'design-fixture'} FixtureSource */

/**
 * Fully populated Film Detail design fixture — layout/QC only.
 * Values are representative of the approved mockup composition, not production truth.
 */
export const FILM_DETAIL_DESIGN_FIXTURE = Object.freeze({
  source: /** @type {FixtureSource} */ ('design-fixture'),
  filmKey: 'fixture-film-detail',
  title: '2001: A Space Odyssey',
  longTitle: 'Everything Everywhere All at Once: The Ultimate Theatrical Cut',
  year: '1968',
  runtimeLabel: '2h 29m',
  rating: 'G',
  genres: 'Science Fiction · Adventure',
  director: 'Directed by Stanley Kubrick',
  posterUrl: filmDetailPosterSvg(),
  backdropUrl: PLACEHOLDER_BACKDROPS.nocturne,
  badges: Object.freeze([
    Object.freeze({ id: 'fmt', label: '70MM', tone: 'neutral' }),
    Object.freeze({ id: 'classic', label: 'CLASSIC', tone: 'neutral' }),
    Object.freeze({ id: 'rank', label: '#13 Top 250', tone: 'gold' }),
  ]),
  synopsis:
    'A mysterious monolith propels humankind’s journey from the dawn of man to a voyage among the stars. As a mission to Jupiter unfolds, a sentient computer and a crew of astronauts confront the limits of control, wonder, and survival.',
  tags: Object.freeze(['Mind-bending', 'Philosophical', 'Visually iconic']),
  signals: Object.freeze([
    Object.freeze({
      id: 'fixture-sig-70mm',
      type: 'special_format',
      primary: 'Rare 70mm presentation',
      secondary: 'Only 3 venues in Seattle',
      tone: 'violet',
      icon: 'spark',
    }),
    Object.freeze({
      id: 'fixture-sig-rank',
      type: 'reputation',
      primary: '#13 on Letterboxd Top 250',
      secondary: 'Design-fixture signal',
      tone: 'gold',
      icon: 'star',
    }),
    Object.freeze({
      id: 'fixture-sig-left',
      type: 'scarcity',
      primary: '3 screenings left',
      secondary: 'Ends May 19',
      tone: 'coral',
      icon: 'calendar',
    }),
    Object.freeze({
      id: 'fixture-sig-venue',
      type: 'limited_venue',
      primary: 'Only at SIFF Downtown',
      secondary: 'Premium format engagement',
      tone: 'cyan',
      icon: 'building',
    }),
  ]),
  bestWay: Object.freeze({
    opportunityKey: 'fixture-opp-best',
    filmKey: 'fixture-film-detail',
    formatLabel: '70MM',
    theaterName: 'SIFF Cinema Downtown',
    longTheaterName: 'SIFF Cinema Downtown at the Uptown Center Complex',
    presentationLabel: '70mm Film Presentation',
    whenLabel: 'Today, May 17 · 7:30 PM',
    facts: Object.freeze([
      Object.freeze({ id: 'premier', label: 'Premier format', icon: 'star' }),
      Object.freeze({
        id: 'audience',
        label: 'Best audience experience',
        icon: 'person',
      }),
      Object.freeze({ id: 'distance', label: '0.6 mi', icon: 'pin' }),
    ]),
    ticketUrl: null,
    sourceUrl: null,
  }),
  todayRows: Object.freeze([
    Object.freeze({
      theaterId: 'fixture-t1',
      theaterName: 'SIFF Cinema Downtown',
      venueMark: 'SIFF',
      accent: 'violet',
      formatChips: Object.freeze(['70MM', 'Premier format']),
      times: Object.freeze([
        Object.freeze({
          opportunityKey: 'fixture-t1-a',
          timeDisplay: '7:30 PM',
          emphasized: true,
        }),
      ]),
      extraTimeCount: 0,
    }),
    Object.freeze({
      theaterId: 'fixture-t2',
      theaterName: 'AMC Pacific Place 11',
      venueMark: 'AMC',
      accent: 'coral',
      formatChips: Object.freeze(['IMAX']),
      times: Object.freeze([
        Object.freeze({
          opportunityKey: 'fixture-t2-a',
          timeDisplay: '4:00 PM',
          emphasized: false,
        }),
        Object.freeze({
          opportunityKey: 'fixture-t2-b',
          timeDisplay: '7:15 PM',
          emphasized: false,
        }),
      ]),
      extraTimeCount: 0,
    }),
    Object.freeze({
      theaterId: 'fixture-t3',
      theaterName: 'SIFF Uptown',
      venueMark: 'SIFF',
      accent: 'violet',
      formatChips: Object.freeze(['Digital']),
      times: Object.freeze([
        Object.freeze({
          opportunityKey: 'fixture-t3-a',
          timeDisplay: '6:45 PM',
          emphasized: false,
        }),
        Object.freeze({
          opportunityKey: 'fixture-t3-b',
          timeDisplay: '9:15 PM',
          emphasized: false,
        }),
      ]),
      extraTimeCount: 0,
    }),
  ]),
});

/**
 * Marker strings that must never appear in normal (non-fixture) Film Detail UI.
 * Used by tests to catch fixture leakage.
 */
export const FILM_DETAIL_FIXTURE_MARKERS = Object.freeze([
  'fixture-film-detail',
  'fixture-opp-best',
  'Directed by Stanley Kubrick',
  '#13 on Letterboxd Top 250',
  'Mind-bending',
  'Visually iconic',
  'Design-fixture signal',
]);
