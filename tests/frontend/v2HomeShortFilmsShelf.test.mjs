import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  buildShortFilmsShelf,
  buildShortInlineQuickDetail,
  buildLiveShortFilmsPresentation,
  diversifyShortsAcrossPrograms,
  isShortShelfFilm,
  listEligibleHomeShortContexts,
  rankEligibleHomeShortFilms,
  resolveNearestFutureProgramContext,
  SHORT_FILMS_ENTITY_KIND,
} from '../../v2/shortsPrograms/composeHomeShortFilms.js';
import { indexShortsProgramsArtifact } from '../../v2/shortsPrograms/shortsProgramsModel.js';
import { COLLECTION_IDS } from '../../v2/destinations.js';
import {
  createInitialNavState,
  openCollection,
  openFilmDetail,
  openShortDetail,
  navigateBack,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HOME_SRC = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
const SHELF_SRC = readFileSync(join(ROOT, 'v2/home/FilmShelf.jsx'), 'utf8');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const INLINE_SRC = readFileSync(join(ROOT, 'v2/home/InlineQuickDetail.jsx'), 'utf8');

const NOW = new Date('2026-09-13T12:00:00-07:00');
const PAST = new Date('2026-10-01T12:00:00-07:00');

function buildFixture() {
  const homeData = {
    timezone: 'America/Los_Angeles',
    films: [
      {
        filmKey: 'program-a',
        title: 'Program A (Shorts)',
        theaterCount: 1,
        showtimeCount: 1,
      },
      {
        filmKey: 'program-b',
        title: 'Program B (Shorts)',
        theaterCount: 1,
        showtimeCount: 1,
      },
      {
        filmKey: 'program-past',
        title: 'Program Past (Shorts)',
        theaterCount: 1,
        showtimeCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-a',
        filmKey: 'program-a',
        theaterName: 'NWFF',
        theaterId: 'nwff',
        localDate: '2026-09-19',
        timeDisplay: '7:30 PM',
        sortableLocalDateTime: '2026-09-19T19:30:00',
        ticketUrl: 'https://example.com/a',
      },
      {
        opportunityKey: 'opp-b',
        filmKey: 'program-b',
        theaterName: 'NWFF',
        theaterId: 'nwff',
        localDate: '2026-09-20',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-09-20T19:00:00',
        ticketUrl: 'https://example.com/b',
      },
      {
        opportunityKey: 'opp-past',
        filmKey: 'program-past',
        theaterName: 'NWFF',
        theaterId: 'nwff',
        localDate: '2026-09-01',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-09-01T19:00:00',
        ticketUrl: 'https://example.com/past',
      },
    ],
  };

  const artifact = {
    shortsPrograms: [
      {
        shortsProgramId: 'prog:a',
        title: 'Like a Local (Shorts)',
        showtimeFilmKey: 'program-a',
      },
      {
        shortsProgramId: 'prog:b',
        title: 'Ways of Seeing (Shorts)',
        showtimeFilmKey: 'program-b',
      },
      {
        shortsProgramId: 'prog:past',
        title: 'Past Program (Shorts)',
        showtimeFilmKey: 'program-past',
      },
    ],
    shorts: [
      {
        shortId: 'short:a1',
        title: "Dick's-A-Thon",
        directors: ['Dylan Young'],
        year: 2025,
        runtimeMin: 18,
        canonicalFilmId: 'tmdb:1669215',
        description: 'A wacky run.',
        imageUrl: null,
      },
      {
        shortId: 'short:a2',
        title: 'Aurora Ave: Sunrise to Sunset',
        directors: ['Dina Michelle Hercules Cruz'],
        year: 2026,
        runtimeMin: 17,
        canonicalFilmId: 'tmdb:1758936',
        description: 'A day on Aurora.',
        imageUrl: null,
      },
      {
        shortId: 'short:b1',
        title: 'Late Shift',
        directors: ['Britta Johnson'],
        year: 2026,
        runtimeMin: 8,
        canonicalFilmId: null,
        description: 'Night work.',
        imageUrl: 'https://example.com/late-shift-source.jpg',
      },
      {
        shortId: 'short:b2',
        title: 'Facing The Sun',
        directors: ['Mathew Cerf'],
        year: 2025,
        runtimeMin: 12,
        canonicalFilmId: null,
        imageUrl: null,
      },
      {
        shortId: 'short:multi',
        title: 'Shared Short',
        directors: ['Ada'],
        year: 2026,
        runtimeMin: 10,
        canonicalFilmId: null,
      },
      {
        shortId: 'short:past-only',
        title: 'Only Past Program',
        directors: ['Past'],
        year: 2024,
        runtimeMin: 9,
        canonicalFilmId: null,
      },
      {
        shortId: 'short:orphan',
        title: 'Orphan Short',
        directors: ['Nobody'],
        year: 2026,
        runtimeMin: 5,
      },
    ],
    memberships: [
      { shortsProgramId: 'prog:a', shortId: 'short:a1', position: 1 },
      { shortsProgramId: 'prog:a', shortId: 'short:a2', position: 2 },
      { shortsProgramId: 'prog:a', shortId: 'short:multi', position: 3 },
      { shortsProgramId: 'prog:b', shortId: 'short:b1', position: 1 },
      { shortsProgramId: 'prog:b', shortId: 'short:b2', position: 2 },
      { shortsProgramId: 'prog:b', shortId: 'short:multi', position: 3 },
      { shortsProgramId: 'prog:past', shortId: 'short:past-only', position: 1 },
    ],
  };

  const enrichmentIndex = {
    status: 'ready',
    imageConfig: {
      secureBaseUrl: 'https://image.tmdb.org/t/p/',
      posterSize: 'w500',
      backdropSize: 'w780',
    },
    byFilmId: new Map([
      [
        'tmdb:1669215',
        {
          film_id: 'tmdb:1669215',
          display_title: "Dick's-A-Thon",
          poster: {
            path: '/dicks.jpg',
            url: 'https://image.tmdb.org/t/p/w500/dicks.jpg',
          },
          runtime_minutes: 18,
          overview: 'TMDB overview',
        },
      ],
      [
        'tmdb:1758936',
        {
          film_id: 'tmdb:1758936',
          display_title: 'Aurora Ave: Sunrise to Sunset',
          poster: {
            path: '/aurora.jpg',
            url: 'https://image.tmdb.org/t/p/w500/aurora.jpg',
          },
          runtime_minutes: 17,
        },
      ],
    ]),
  };

  return {
    homeData,
    shortsIndex: indexShortsProgramsArtifact(artifact),
    enrichmentIndex,
  };
}

describe('Home Short Films shelf', () => {
  test('Home wires SHORT FILMS between Opening This Week and Just Announced', () => {
    const opening = HOME_SRC.indexOf('id="v2-opening"');
    const shorts = HOME_SRC.indexOf('id="v2-short-films"');
    const announced = HOME_SRC.indexOf('id="v2-announced"');
    assert.ok(opening > 0);
    assert.ok(shorts > opening);
    assert.ok(announced > shorts);
    assert.match(HOME_SRC, /title="Short Films"/);
    assert.match(HOME_SRC, /COLLECTION_IDS\.shortFilms/);
    assert.match(HOME_SRC, /showShortFilmsShelf/);
  });

  test('eligible Short with future program screening is included', () => {
    const { homeData, shortsIndex } = buildFixture();
    const rows = listEligibleHomeShortContexts({
      shortsIndex,
      homeData,
      now: NOW,
    });
    assert.ok(rows.some((row) => row.shortId === 'short:a1'));
    assert.ok(rows.some((row) => row.shortId === 'short:b1'));
  });

  test('Short whose only program screening is past is excluded', () => {
    const { homeData, shortsIndex } = buildFixture();
    const rows = listEligibleHomeShortContexts({
      shortsIndex,
      homeData,
      now: NOW,
    });
    assert.equal(
      rows.some((row) => row.shortId === 'short:past-only'),
      false,
    );
  });

  test('orphan Short without membership is excluded', () => {
    const { homeData, shortsIndex } = buildFixture();
    const rows = listEligibleHomeShortContexts({
      shortsIndex,
      homeData,
      now: NOW,
    });
    assert.equal(
      rows.some((row) => row.shortId === 'short:orphan'),
      false,
    );
  });

  test('eligibility uses program showtimes, not Short-owned showtimes', () => {
    const { homeData, shortsIndex } = buildFixture();
    const context = resolveNearestFutureProgramContext({
      shortId: 'short:a1',
      shortsIndex,
      homeData,
      now: NOW,
    });
    assert.ok(context);
    assert.equal(context.programFilmKey, 'program-a');
    assert.equal(context.nextOpportunity.filmKey, 'program-a');
    assert.notEqual(context.nextOpportunity.filmKey, 'short:a1');
    assert.equal(
      homeData.opportunities.some((opp) => opp.filmKey === 'short:a1'),
      false,
    );
  });

  test('Home shelf omits empty SHORT FILMS shelf payload', () => {
    const { homeData, shortsIndex } = buildFixture();
    const empty = buildShortFilmsShelf(homeData, shortsIndex, null, {
      now: PAST,
    });
    assert.equal(empty.films.length, 0);
    assert.equal(empty.status, 'unavailable');
    assert.match(HOME_SRC, /shortFilmsShelf\.films\.length > 0/);
  });

  test('Home shelf renders eligible Short IDs, never ShortsProgram cards', () => {
    const { homeData, shortsIndex, enrichmentIndex } = buildFixture();
    const shelf = buildShortFilmsShelf(homeData, shortsIndex, enrichmentIndex, {
      now: NOW,
    });
    assert.ok(shelf.films.length > 0);
    for (const film of shelf.films) {
      assert.equal(film.entityKind, SHORT_FILMS_ENTITY_KIND);
      assert.ok(String(film.shortId).startsWith('short:'));
      assert.equal(film.filmKey, film.shortId);
      assert.equal(String(film.filmKey).includes('prog:'), false);
      assert.notEqual(film.title, 'Like a Local');
      assert.notEqual(film.title, 'Ways of Seeing');
    }
  });

  test('matched Short uses TMDB poster enrichment', () => {
    const { homeData, shortsIndex, enrichmentIndex } = buildFixture();
    const cards = rankEligibleHomeShortFilms(
      homeData,
      shortsIndex,
      enrichmentIndex,
      { now: NOW, maxCards: null },
    );
    const dicks = cards.find((card) => card.shortId === 'short:a1');
    assert.ok(dicks);
    assert.equal(dicks.filmId, 'tmdb:1669215');
    assert.equal(dicks.posterUrl, 'https://image.tmdb.org/t/p/w500/dicks.jpg');
    assert.equal(dicks.hasEnrichment, true);
  });

  test('unresolved Short with source image still presents safely', () => {
    const { homeData, shortsIndex, enrichmentIndex } = buildFixture();
    const cards = rankEligibleHomeShortFilms(
      homeData,
      shortsIndex,
      enrichmentIndex,
      { now: NOW, maxCards: null },
    );
    const late = cards.find((card) => card.shortId === 'short:b1');
    assert.ok(late);
    assert.equal(late.filmId, null);
    assert.equal(late.posterUrl, 'https://example.com/late-shift-source.jpg');
    const detail = buildShortInlineQuickDetail(homeData, late, enrichmentIndex);
    assert.ok(detail);
    assert.equal(detail.hideFilmActions, true);
    assert.match(detail.surfaceReasonLabel, /Screens as part of/);
  });

  test('unresolved Short with no poster does not crash', () => {
    const { homeData, shortsIndex } = buildFixture();
    const cards = rankEligibleHomeShortFilms(homeData, shortsIndex, null, {
      now: NOW,
      maxCards: null,
    });
    const facing = cards.find((card) => card.shortId === 'short:b2');
    assert.ok(facing);
    assert.equal(facing.posterUrl, null);
    const detail = buildShortInlineQuickDetail(homeData, facing, null);
    assert.equal(detail.posterUrl, null);
    assert.equal(detail.title, 'Facing The Sun');
  });

  test('diversification first pass is one Short per program', () => {
    const { homeData, shortsIndex } = buildFixture();
    const ranked = diversifyShortsAcrossPrograms(
      listEligibleHomeShortContexts({
        shortsIndex,
        homeData,
        now: NOW,
      }),
    );
    const firstPass = ranked.slice(0, 2);
    assert.equal(firstPass.length, 2);
    assert.equal(
      new Set(firstPass.map((row) => row.primaryProgramId)).size,
      2,
    );
    assert.ok(ranked.length > 2);
    assert.equal(
      ranked[2].primaryProgramId === 'prog:a' ||
        ranked[2].primaryProgramId === 'prog:b',
      true,
    );
  });

  test('ranking is deterministic across identical inputs', () => {
    const { homeData, shortsIndex, enrichmentIndex } = buildFixture();
    const a = rankEligibleHomeShortFilms(homeData, shortsIndex, enrichmentIndex, {
      now: NOW,
      maxCards: null,
    }).map((card) => card.shortId);
    const b = rankEligibleHomeShortFilms(homeData, shortsIndex, enrichmentIndex, {
      now: NOW,
      maxCards: null,
    }).map((card) => card.shortId);
    assert.deepEqual(a, b);
  });

  test('multi-program Short appears once with nearest future program context', () => {
    const { homeData, shortsIndex } = buildFixture();
    const rows = listEligibleHomeShortContexts({
      shortsIndex,
      homeData,
      now: NOW,
    });
    const shared = rows.filter((row) => row.shortId === 'short:multi');
    assert.equal(shared.length, 1);
    assert.equal(shared[0].primaryProgramId, 'prog:a');
    assert.equal(shared[0].primaryProgramTitle, 'Like a Local');
  });

  test('FilmShelf uses expanded-detail path for Shorts', () => {
    assert.match(SHELF_SRC, /buildShortInlineQuickDetail/);
    assert.match(SHELF_SRC, /isShortShelfFilm/);
    assert.match(SHELF_SRC, /hideFilmActions/);
    assert.match(INLINE_SRC, /hideFilmActions/);
  });

  test('Short expanded More details opens Short Detail, not Film Detail', () => {
    assert.match(HOME_SRC, /openShortFromHome/);
    assert.match(HOME_SRC, /onOpenShortDetail/);
    assert.match(APP_SRC, /isShortFilms/);
    assert.match(APP_SRC, /ShortFilmsSurface/);
    assert.equal(isShortShelfFilm({ entityKind: 'short', shortId: 'x' }), true);
  });

  test('See all opens Short Films shelf detail collection', () => {
    let nav = openCollection(createInitialNavState(), {
      collectionId: COLLECTION_IDS.shortFilms,
      originPrimary: 'home',
    });
    assert.equal(nav.surface?.type, 'collection');
    assert.equal(nav.surface.collectionId, 'short-films');
    assert.equal(COLLECTION_IDS.shortFilms, 'short-films');
  });

  test('Short Films shelf detail lists all eligible Shorts', () => {
    const { homeData, shortsIndex, enrichmentIndex } = buildFixture();
    const presentation = buildLiveShortFilmsPresentation(
      homeData,
      shortsIndex,
      enrichmentIndex,
      { now: NOW },
    );
    assert.equal(presentation.pageTitle, 'Short Films');
    assert.ok(presentation.films.length >= 5);
    assert.equal(
      presentation.films.some((film) => film.shortId === 'short:past-only'),
      false,
    );
    assert.equal(
      presentation.films.filter((film) => film.shortId === 'short:multi')
        .length,
      1,
    );
  });

  test('See all → Short Detail → Back restores Short Films collection', () => {
    let nav = openCollection(createInitialNavState(), {
      collectionId: COLLECTION_IDS.shortFilms,
      originPrimary: 'home',
    });
    nav = openShortDetail(nav, {
      shortId: 'short:a1',
      shortsProgramId: 'prog:a',
      originPrimary: 'home',
      returnSurface: nav.surface,
    });
    assert.equal(nav.surface?.type, 'short-detail');
    nav = navigateBack(nav);
    assert.equal(nav.surface?.type, 'collection');
    assert.equal(nav.surface.collectionId, 'short-films');
  });

  test('normal Film Home detail path remains unchanged', () => {
    let nav = openFilmDetail(createInitialNavState(), {
      filmKey: 'sinners',
      originPrimary: 'home',
    });
    assert.equal(nav.surface?.type, 'film-detail');
    assert.equal(nav.surface.filmKey, 'sinners');
  });
});
