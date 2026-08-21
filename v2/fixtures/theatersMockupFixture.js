/**
 * Theaters list MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Matches Canonical Mockup Images/Theaters Page.png.
 * Not production theater registry / showtimes. Does not import stores.
 *
 * Discrepancy vs theater-data audit: mockup shows addresses, screen counts,
 * formats, descriptions, and imagery that production registry lacks (D06).
 * Stage 1 preserves mockup fields as fixture-only.
 */

import {
  PLACEHOLDER_POSTERS,
  PLACEHOLDER_THEATER_THUMBS,
} from './placeholderMedia.js';

export const THEATERS_SECTION_ORDER = Object.freeze([
  'header',
  'controls',
  'theaterList',
]);

/**
 * @returns {Readonly<object>}
 */
export function getTheatersMockupPresentation() {
  return THEATERS_MOCKUP_FIXTURE;
}

/**
 * @type {Readonly<object>}
 */
export const THEATERS_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  pageTitle: 'Theaters',
  pageTagline: 'Seattle theaters showing the films you love.',
  countLabel: '8 theaters',
  filtersLabel: 'Filters',
  nowShowingLabel: 'Now showing',
  viewAllLabel: 'View all',
  moreDetailsLabel: 'More details',
  favoriteLabel: 'Favorite',
  theaters: Object.freeze([
    Object.freeze({
      id: 'fixture-siff-downtown',
      name: 'SIFF Cinema Downtown',
      addressLabel: '2100 4th Ave, Seattle, WA 98121',
      neighborhood: 'Belltown',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.siffDowntown,
      screensLabel: '3 screens',
      formatsLabel: 'Digital, 70mm, IMAX',
      description:
        "Seattle's flagship nonprofit cinema in the heart of Belltown. Premieres, festivals, and the best in independent and international film.",
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([
        Object.freeze({
          filmKey: 'fixture-theater-blue-hour',
          title: 'Blue Hour',
          detailLabel: 'May 23',
          posterUrl: PLACEHOLDER_POSTERS.blueHour,
        }),
        Object.freeze({
          filmKey: 'fixture-theater-memories',
          title: 'Memories of Murder',
          detailLabel: 'May 24',
          posterUrl: PLACEHOLDER_POSTERS.memories,
        }),
        Object.freeze({
          filmKey: 'fixture-theater-budapest',
          title: 'The Grand Budapest Hotel',
          detailLabel: 'May 25',
          posterUrl: PLACEHOLDER_POSTERS.budapest,
        }),
        Object.freeze({
          filmKey: 'fixture-theater-perfect-blue',
          title: 'Perfect Blue',
          detailLabel: 'May 26',
          posterUrl: PLACEHOLDER_POSTERS.perfectBlue,
        }),
        Object.freeze({
          filmKey: 'fixture-theater-rashomon',
          title: 'Rashomon',
          detailLabel: 'May 24',
          posterUrl: PLACEHOLDER_POSTERS.rashomon,
        }),
      ]),
    }),
    Object.freeze({
      id: 'fixture-beacon',
      name: 'The Beacon Cinema',
      addressLabel: '4405 Rainier Ave S, Seattle, WA 98118',
      neighborhood: 'Columbia City',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.beacon,
      screensLabel: '2 screens',
      formatsLabel: '35mm, Digital',
      description: null,
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([]),
    }),
    Object.freeze({
      id: 'fixture-central',
      name: 'Central Cinema',
      addressLabel: '1411 21st Ave, Seattle, WA 98122',
      neighborhood: 'Central District',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.central,
      screensLabel: '2 screens',
      formatsLabel: 'Digital, 35mm',
      description: null,
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([]),
    }),
    Object.freeze({
      id: 'fixture-nwff',
      name: 'Northwest Film Forum',
      addressLabel: '1515 12th Ave, Seattle, WA 98122',
      neighborhood: 'Capitol Hill',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.nwff,
      screensLabel: '2 screens',
      formatsLabel: 'Digital, 16mm',
      description: null,
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([]),
    }),
    Object.freeze({
      id: 'fixture-grand-illusion',
      name: 'Grand Illusion Cinema',
      addressLabel: '1403 NE 50th St, Seattle, WA 98105',
      neighborhood: 'University District',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.grandIllusion,
      screensLabel: '1 screen',
      formatsLabel: 'Digital',
      description: null,
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([]),
    }),
    Object.freeze({
      id: 'fixture-siff-uptown',
      name: 'SIFF Cinema Uptown',
      addressLabel: '511 Queen Anne Ave N, Seattle, WA 98109',
      neighborhood: 'Queen Anne',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.siffUptown,
      screensLabel: '3 screens',
      formatsLabel: 'Digital, 70mm, IMAX',
      description: null,
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([]),
    }),
    Object.freeze({
      id: 'fixture-egyptian',
      name: 'SIFF Cinema Egyptian',
      addressLabel: '805 E Pine St, Seattle, WA 98122',
      neighborhood: 'Capitol Hill',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.egyptian,
      screensLabel: '1 screen',
      formatsLabel: 'Digital, 70mm',
      description: null,
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([]),
    }),
    Object.freeze({
      id: 'fixture-pacific-place',
      name: 'AMC Pacific Place 11',
      addressLabel: '600 Pine St, Seattle, WA 98101',
      neighborhood: 'Downtown',
      imageUrl: PLACEHOLDER_THEATER_THUMBS.pacificPlace,
      screensLabel: '11 screens',
      formatsLabel: 'Digital, Dolby',
      description: null,
      favorite: false,
      initiallyExpanded: false,
      nowShowing: Object.freeze([]),
    }),
  ]),
});

/**
 * Stage 1 always returns the mockup fixture for the designed page by default.
 * Live HomeData path: `resolveTheatersPagePresentation` with forceMode/theaterLive.
 * @returns {ReturnType<typeof getTheatersMockupPresentation>}
 */
export function resolveTheatersPresentation() {
  return getTheatersMockupPresentation();
}
