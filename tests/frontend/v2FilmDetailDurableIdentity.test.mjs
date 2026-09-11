import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialNavState,
  openFilmDetail,
} from '../../v2/navigation/navState.js';
import { resolveFilmDetailNavParams } from '../../v2/identity/filmIdentity.js';
import { resolveFilmDetailPresentation } from '../../v2/fixtures/resolveFilmDetailPresentation.js';
import { toFilmDetailView } from '../../v2/filmDetail/toFilmDetailView.js';
import { setCachedTmdbOnlyFilm } from '../../v2/filmDetail/tmdbOnlyFilmCache.js';
import { buildOpeningThisWeekShelf } from '../../v2/home/shelfData.js';

test('openFilmDetail preserves filmId and filmKey when both supplied', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'sara-bareilles-good-grief',
    filmId: 'tmdb:1675218',
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.type, 'film-detail');
  assert.equal(nav.surface.filmKey, 'sara-bareilles-good-grief');
  assert.equal(nav.surface.filmId, 'tmdb:1675218');
});

test('openFilmDetail stores null filmId when omitted', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'unmatched-local-program',
    originPrimary: 'explore',
  });
  assert.equal(nav.surface.filmKey, 'unmatched-local-program');
  assert.equal(nav.surface.filmId, null);
});

test('resolveFilmDetailNavParams returns durable filmId alongside filmKey', () => {
  const params = resolveFilmDetailNavParams({
    filmKey: 'weight-early-access',
    parentFilmKey: 'weight',
    filmId: 'tmdb:1433583',
    opportunityKey: 'opp-1',
  });
  assert.equal(params?.filmKey, 'weight');
  assert.equal(params?.filmId, 'tmdb:1433583');
  assert.equal(params?.opportunityKey, 'opp-1');
});

test('current film with slug + filmId resolves via live HomeData', () => {
  const homeData = {
    films: [
      {
        filmKey: 'sinners',
        filmId: 'tmdb:1133620',
        title: 'Sinners',
        runtimeMin: 120,
        showtimeCount: 2,
        theaterCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'sinners',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: '2026-09-12',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-09-12T19:00',
        formatLabels: [],
      },
    ],
  };
  const resolved = resolveFilmDetailPresentation({
    homeData,
    filmKey: 'sinners',
    filmId: 'tmdb:1133620',
    forceMode: 'production',
  });
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.source, 'home-data');
  assert.equal(resolved.presentation.displayTitle, 'Sinners');
});

test('missing current slug + durable filmId resolves via TMDB rescue (Bareilles shape)', () => {
  setCachedTmdbOnlyFilm('tmdb:1675218', {
    filmId: 'tmdb:1675218',
    title: 'Sara Bareilles: Good Grief',
    overview: 'A concert film.',
    runtimeMin: 95,
    year: 2026,
    posterUrl: 'https://example.com/bareilles.jpg',
    backdropUrl: null,
    genres: ['Music'],
    directors: ['Someone'],
    fetchedAt: new Date().toISOString(),
  });

  const homeData = {
    films: [
      {
        filmKey: 'other-film',
        filmId: 'tmdb:1',
        title: 'Other Film',
        runtimeMin: 100,
        showtimeCount: 1,
        theaterCount: 1,
      },
    ],
    opportunities: [],
  };

  const missingSlugOnly = resolveFilmDetailPresentation({
    homeData,
    filmKey: 'sara-bareilles-good-grief',
    forceMode: 'production',
  });
  assert.equal(missingSlugOnly.resolved, false);

  const withDurableId = resolveFilmDetailPresentation({
    homeData,
    filmKey: 'sara-bareilles-good-grief',
    filmId: 'tmdb:1675218',
    forceMode: 'production',
  });
  assert.equal(withDurableId.resolved, true);
  assert.equal(withDurableId.source, 'tmdb-live');
  assert.equal(
    withDurableId.presentation.displayTitle,
    'Sara Bareilles: Good Grief',
  );
  const view = toFilmDetailView(withDurableId);
  assert.equal(view.resolved, true);
  assert.notEqual(view.displayTitle, null);
});

test('slug-only unmatched film still fails closed without fabricating fixtures', () => {
  const homeData = { films: [], opportunities: [] };
  const missing = resolveFilmDetailPresentation({
    homeData,
    filmKey: 'local-unmatched-program',
    forceMode: 'production',
  });
  assert.equal(missing.resolved, false);
  assert.equal(missing.mode, 'production');
  const view = toFilmDetailView(missing);
  assert.equal(view.resolved, false);
  assert.notEqual(view.hero?.title, '2001: A Space Odyssey');
});

test('Film not found only when both slug and durable filmId fail', () => {
  const homeData = { films: [], opportunities: [] };
  const unresolved = resolveFilmDetailPresentation({
    homeData,
    filmKey: 'gone-slug',
    filmId: 'tmdb:999999001',
    forceMode: 'production',
    tmdbOnlySnapshot: null,
  });
  // Without a cache snapshot, TMDB rescue returns unresolved until fetch completes.
  assert.equal(unresolved.source, 'tmdb-live');
  assert.equal(unresolved.resolved, false);

  const bothMissing = resolveFilmDetailPresentation({
    homeData,
    filmKey: 'gone-slug',
    forceMode: 'production',
  });
  assert.equal(bothMissing.resolved, false);
  assert.notEqual(bothMissing.source, 'mockup-fixture');
});

test('Opening This Week shelf cards expose filmId for navigation', () => {
  const homeData = {
    films: [],
    opportunities: [],
    openingThisWeek: {
      status: 'ready',
      entries: [
        {
          filmKey: 'sara-bareilles-good-grief',
          filmId: 'tmdb:1675218',
          title: 'Sara Bareilles: Good Grief',
          openingDate: '2026-09-02',
          theaterCountOnOpeningDate: 3,
          visibleShowtimeCount: 0,
          categoryId: 'limited',
          categoryBadge: 'Limited',
          engagementDays: 1,
          theatersOnOpeningDate: [],
        },
      ],
    },
  };
  const shelf = buildOpeningThisWeekShelf(homeData, null);
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.films.length, 1);
  assert.equal(shelf.films[0].filmKey, 'sara-bareilles-good-grief');
  assert.equal(shelf.films[0].filmId, 'tmdb:1675218');
});

test('durable filmId maps to alternate in-window filmKey when slug misses', () => {
  const homeData = {
    films: [
      {
        filmKey: 'weight',
        filmId: 'tmdb:1433583',
        title: 'The Weight',
        runtimeMin: 110,
        showtimeCount: 2,
        theaterCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'w1',
        filmKey: 'weight',
        theaterId: 't1',
        theaterName: 'AMC',
        localDate: '2026-09-12',
        localTime: '20:00',
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: '2026-09-12T20:00',
        formatLabels: [],
      },
    ],
  };
  const resolved = resolveFilmDetailPresentation({
    homeData,
    filmKey: 'weight-early-access',
    filmId: 'tmdb:1433583',
    forceMode: 'production',
  });
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.source, 'home-data');
  assert.equal(resolved.presentation.displayTitle, 'The Weight');
});
