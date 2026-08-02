/**
 * Opening This Week MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Matches Canonical Mockup Images/Opening This Week Page.png.
 * Not an opening-week classifier. Does not import or write stores.
 * Home shelf continues to use buildOpeningThisWeekShelf (provisional recently-added path).
 */

import { PLACEHOLDER_POSTERS } from './placeholderMedia.js';

export const OPENING_THIS_WEEK_SECTION_ORDER = Object.freeze([
  'header',
  'controls',
  'filmList',
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
  countLabel: '18 films opening in theaters across Seattle.',
  sortLabel: 'Sort by',
  sortValue: 'Opening date',
  filtersLabel: 'Filters',
  films: Object.freeze([
    Object.freeze({
      filmKey: 'fixture-opening-long-horizon',
      title: 'The Long Horizon',
      badge: 'NEW',
      metaLine: '2025 • 2h 20m • Drama, Western',
      synopsis:
        'A lone traveler crosses a changing frontier in search of a place to call home.',
      posterUrl: PLACEHOLDER_POSTERS.longHorizon,
      dateLabel: 'Fri, May 23',
      theaterName: 'Paramount Theatre',
      timeLabel: 'Fri 7:00pm',
      formatLabel: '70MM',
      whySeeIt: 'Shot on 70mm across breathtaking landscapes.',
      alsoPlaying: Object.freeze({
        theaterName: 'SIFF Cinema Uptown',
        detailLabel: 'May 23 • 7:15pm',
      }),
      initiallyExpanded: true,
    }),
    Object.freeze({
      filmKey: 'fixture-opening-quiet-city',
      title: 'Quiet City',
      badge: 'NEW',
      metaLine: '2025 • 1h 45m • Documentary',
      synopsis:
        'An intimate portrait of a town learning to adapt to a changing world.',
      posterUrl: PLACEHOLDER_POSTERS.quietCity,
      dateLabel: 'Fri, May 23',
      theaterName: 'SIFF Cinema Downtown',
      timeLabel: null,
      formatLabel: 'DCP',
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
    }),
    Object.freeze({
      filmKey: 'fixture-opening-blue-hour',
      title: 'Blue Hour',
      badge: 'NEW',
      metaLine: '2025 • 1h 50m • Drama',
      synopsis:
        'A photographer returns to his hometown and confronts his past.',
      posterUrl: PLACEHOLDER_POSTERS.blueHour,
      dateLabel: 'Fri, May 23',
      theaterName: 'The Beacon Cinema',
      timeLabel: null,
      formatLabel: '35MM',
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
    }),
    Object.freeze({
      filmKey: 'fixture-opening-last-rehearsal',
      title: 'The Last Rehearsal',
      badge: 'NEW',
      metaLine: '2025 • 1h 38m • Comedy',
      synopsis: "A theater director's final chance at opening night glory.",
      posterUrl: PLACEHOLDER_POSTERS.lastRehearsal,
      dateLabel: 'Sat, May 24',
      theaterName: 'Central Cinema',
      timeLabel: null,
      formatLabel: 'DCP',
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
    }),
    Object.freeze({
      filmKey: 'fixture-opening-saltwater-road',
      title: 'Saltwater Road',
      badge: 'NEW',
      metaLine: '2025 • 1h 42m • Drama',
      synopsis:
        "Two estranged brothers take a road trip to scatter their father's ashes.",
      posterUrl: PLACEHOLDER_POSTERS.saltwaterRoad,
      dateLabel: 'Sat, May 24',
      theaterName: 'SIFF Cinema Uptown',
      timeLabel: null,
      formatLabel: 'DCP',
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
    }),
  ]),
});

/**
 * Stage 1 mockup fixture for designed Opening This Week page (visual QC).
 * Live enriched presentation is built in OpeningThisWeekSurface when homeData is provided.
 * @returns {ReturnType<typeof getOpeningThisWeekMockupPresentation>}
 */
export function resolveOpeningThisWeekPresentation() {
  return getOpeningThisWeekMockupPresentation();
}
