/**
 * Personal film collections MOCKUP FIXTURE — visual QA authority (393px).
 *
 * Mirrors the canonical Saved / Not Interested mockups for design comparison.
 * Not production preference data. Prefer live stores in the app; use this for
 * docs/tests and side-by-side visual QA only.
 */

import { COLLECTION_IDS } from '../explore/exploreIds.js';
import { buildPersonalCollectionModel } from '../collections/personalCollectionModel.js';

export const PERSONAL_COLLECTIONS_VIEWPORT_WIDTH = 393;

export const PERSONAL_COLLECTIONS_MOCKUP_STATES = Object.freeze([
  'saved-mixed',
  'seen-populated',
  'not-interested-populated',
  'saved-empty',
]);

function poster(label, from = '#2a2140', to = '#0f0c14') {
  const safe = String(label).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <text x="20" y="560" fill="#f5f5f7" font-family="Georgia, serif" font-size="20">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const HOME = Object.freeze({
  films: [
    {
      filmKey: 'nosferatu',
      filmId: 'tmdb:426063',
      title: 'Nosferatu',
      posterUrl: poster('Nosferatu', '#3a2a1a', '#120c08'),
      year: 2024,
    },
    {
      filmKey: 'seed-of-the-sacred-fig',
      filmId: 'tmdb:1106739',
      title: 'The Seed of the Sacred Fig',
      posterUrl: poster('Sacred Fig', '#1a2a3a', '#080c12'),
      year: 2024,
    },
    {
      filmKey: 'young-washington',
      filmId: 'tmdb:1001',
      title: 'Young Washington',
      posterUrl: poster('Young Washington'),
      year: 2025,
    },
  ],
  opportunities: [
    {
      opportunityKey: 'opp-nos',
      filmKey: 'nosferatu',
      theaterName: 'SIFF Downtown',
      timeDisplay: 'Tonight 7:00 PM',
      sortableLocalDateTime: '2026-05-17T19:00:00',
      formatLabels: ['70mm'],
    },
    {
      opportunityKey: 'opp-seed',
      filmKey: 'seed-of-the-sacred-fig',
      theaterName: 'Grand Illusion Cinema',
      timeDisplay: 'Sat, May 24 at 4:30 PM',
      sortableLocalDateTime: '2026-05-24T16:30:00',
      formatLabels: ['35mm'],
    },
  ],
});

/**
 * @param {'saved-mixed' | 'seen-populated' | 'not-interested-populated' | 'saved-empty'} state
 * @param {{ signedIn?: boolean }} [options]
 */
export function getPersonalCollectionsMockupPresentation(
  state = 'saved-mixed',
  options = {},
) {
  const signedIn = Boolean(options.signedIn);
  if (state === 'saved-empty') {
    return buildPersonalCollectionModel({
      collectionId: COLLECTION_IDS.saved,
      homeData: HOME,
      savedItems: [],
      signedIn,
    });
  }
  if (state === 'seen-populated') {
    return buildPersonalCollectionModel({
      collectionId: COLLECTION_IDS.seen,
      homeData: HOME,
      seenItems: [
        {
          filmRef: {
            filmId: 'tmdb:426063',
            showtimeFilmKey: 'nosferatu',
            sourceFilmId: null,
            source: null,
          },
          seenAt: '2026-04-12T18:00:00.000Z',
          seenAtSource: 'user-recorded',
          title: 'Nosferatu',
        },
        {
          filmRef: {
            filmId: 'tmdb:1106739',
            showtimeFilmKey: 'seed-of-the-sacred-fig',
            sourceFilmId: null,
            source: null,
          },
          seenAt: '2026-03-01T18:00:00.000Z',
          seenAtSource: 'user-recorded',
          title: 'The Seed of the Sacred Fig',
        },
      ],
      signedIn,
    });
  }
  if (state === 'not-interested-populated') {
    return buildPersonalCollectionModel({
      collectionId: COLLECTION_IDS.hidden,
      homeData: HOME,
      notInterestedItems: [
        {
          filmRef: {
            filmId: 'tmdb:1001',
            showtimeFilmKey: 'young-washington',
            sourceFilmId: null,
            source: null,
          },
          markedAt: '2025-05-17T18:00:00.000Z',
          markedAtSource: 'user-recorded',
          title: 'Young Washington',
        },
        {
          filmRef: {
            filmId: 'tmdb:2002',
            showtimeFilmKey: 'tmdb:2002',
            sourceFilmId: null,
            source: null,
          },
          markedAt: '2025-05-10T18:00:00.000Z',
          markedAtSource: 'user-recorded',
          title: 'Moana (Live-Action)',
          year: 2026,
          posterUrl: poster('Moana'),
        },
      ],
      signedIn,
    });
  }

  // saved-mixed: Available + Watching
  return buildPersonalCollectionModel({
    collectionId: COLLECTION_IDS.saved,
    homeData: HOME,
    savedItems: [
      {
        filmRef: {
          filmId: 'tmdb:426063',
          showtimeFilmKey: 'nosferatu',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-01T12:00:00.000Z',
        title: 'Nosferatu',
      },
      {
        filmRef: {
          filmId: 'tmdb:1106739',
          showtimeFilmKey: 'seed-of-the-sacred-fig',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-02T12:00:00.000Z',
        title: 'The Seed of the Sacred Fig',
      },
      {
        filmRef: {
          filmId: 'tmdb:575264',
          showtimeFilmKey: 'tmdb:575264',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-03T12:00:00.000Z',
        title: 'Mission: Impossible – The Final Reckoning',
        year: 2025,
        posterUrl: poster('MI'),
      },
      {
        filmRef: {
          filmId: 'tmdb:1234',
          showtimeFilmKey: 'tmdb:1234',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-04T12:00:00.000Z',
        title: '28 Years Later',
        year: 2025,
        posterUrl: poster('28 Years'),
      },
    ],
    signedIn,
  });
}
