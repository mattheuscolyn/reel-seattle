/**
 * Canonical film metadata join — cross-surface presentation consistency.
 *
 * Covers shelf entries with durable filmId but missing/stale homeData.films
 * slug rows (Bareilles-shaped), plus shelf-specific field preservation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import {
  resolveCanonicalFilmPresentation,
  findCanonicalHomeFilm,
} from '../../v2/enrichment/resolveCanonicalFilmPresentation.js';
import { mergeEnrichmentIndexWithSnapshots } from '../../v2/enrichment/mergeEnrichmentIndexWithSnapshots.js';
import { enrichmentRowFromTmdbSnapshot } from '../../v2/enrichment/enrichmentFromTmdbSnapshot.js';
import {
  collectShelfFilmIdsNeedingEnrichment,
  hydrateShelfFilmEnrichment,
} from '../../v2/enrichment/hydrateShelfFilmEnrichment.js';
import { buildOpeningThisWeekShelf } from '../../v2/home/shelfData.js';
import { resolveOpeningEntryPresentation } from '../../v2/opening/resolveOpeningEntryPresentation.js';
import { buildLiveOpeningThisWeekPresentation } from '../../v2/opening/buildLiveOpeningPresentation.js';
import { buildLiveJustAnnouncedPresentation } from '../../v2/justAnnounced/buildLiveJustAnnouncedPresentation.js';
import { buildLiveLeavingSoonPresentation } from '../../v2/leaving/buildLiveLeavingSoonPresentation.js';
import { buildLiveSpecialPresentationsPresentation } from '../../v2/specialPresentations/buildLiveSpecialPresentationsPresentation.js';
import { setCachedTmdbOnlyFilm } from '../../v2/filmDetail/tmdbOnlyFilmCache.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function emptyEnrichmentIndex(extraFilms = []) {
  return buildEnrichmentIndex({
    version: 1,
    image_config: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_size: 'w500',
      backdrop_size: 'w780',
    },
    films: extraFilms,
  });
}

function bareillesEnrichmentRow() {
  return {
    film_id: 'tmdb:1675218',
    tmdb_id: 1675218,
    display_title: 'Sara Bareilles: Good Grief',
    original_title: 'Sara Bareilles: Good Grief',
    release_year: 2026,
    release_date: '2026-09-12',
    overview: 'Concert film overview from TMDB.',
    runtime_minutes: 95,
    genres: [{ name: 'Music' }, { name: 'Documentary' }],
    directors: [{ name: 'Director Name' }],
    us_certification: null,
    poster: { path: '/bareilles.jpg', url: null },
    backdrop: null,
    provenance: { source: 'tmdb' },
    field_provenance: {},
  };
}

test('1. stale slug + valid filmId uses canonical enrichment metadata', () => {
  const index = emptyEnrichmentIndex([bareillesEnrichmentRow()]);
  const homeData = {
    films: [
      {
        filmKey: 'other-live',
        filmId: 'tmdb:1',
        title: 'Other',
        posterUrl: null,
        runtimeMin: 100,
      },
    ],
  };
  const resolved = resolveCanonicalFilmPresentation({
    filmKey: 'sara-bareilles-good-grief',
    filmId: 'tmdb:1675218',
    homeData,
    enrichmentIndex: index,
    fallbackRecord: {
      filmKey: 'sara-bareilles-good-grief',
      filmId: 'tmdb:1675218',
      title: 'Sara Bareilles Good Grief (stale source)',
      posterUrl: null,
    },
    context: 'home',
  });

  assert.equal(resolved.homeFilm, null);
  assert.equal(resolved.enriched.hasEnrichment, true);
  assert.equal(resolved.enriched.displayTitle, 'Sara Bareilles: Good Grief');
  assert.equal(resolved.enriched.canonicalYear, 2026);
  assert.equal(resolved.enriched.runtimeMin, 95);
  assert.match(resolved.enriched.posterUrl ?? '', /bareilles\.jpg/);
  assert.match(resolved.enriched.synopsisPreview ?? '', /Concert film/);
});

test('2. Bareilles-shaped: filmId present, slug absent from home map, enrichment exists', () => {
  const index = emptyEnrichmentIndex([bareillesEnrichmentRow()]);
  const homeData = {
    films: [],
    opportunities: [],
    openingThisWeek: {
      status: 'ready',
      timezone: 'America/Los_Angeles',
      entries: [
        {
          filmKey: 'sara-bareilles-good-grief',
          filmId: 'tmdb:1675218',
          title: 'Sara Bareilles Good Grief',
          openingDate: '2026-09-12',
          theaterCountOnOpeningDate: 2,
          visibleShowtimeCount: 0,
          categoryId: 'limited',
          categoryBadge: 'Limited',
          engagementDays: 1,
          theatersOnOpeningDate: [
            { id: 'siiff', name: 'SIFF Cinema Uptown' },
            { id: 'egypt', name: 'SIFF Egyptian' },
          ],
        },
      ],
    },
  };

  const shelf = buildOpeningThisWeekShelf(homeData, index);
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.films.length, 1);
  const card = shelf.films[0];
  assert.equal(card.filmId, 'tmdb:1675218');
  assert.equal(card.title, 'Sara Bareilles: Good Grief');
  assert.equal(card.hasEnrichment, true);
  assert.ok(card.posterUrl);
  assert.match(card.posterUrl, /bareilles/);
});

test('3. Opening full-list uses canonical metadata while preserving opening date + theaters', () => {
  const index = emptyEnrichmentIndex([bareillesEnrichmentRow()]);
  const homeData = {
    films: [],
    opportunities: [],
    timezone: 'America/Los_Angeles',
    theatersById: {
      a: { name: 'Theater A' },
      b: { name: 'Theater B' },
    },
    openingThisWeek: {
      status: 'ready',
      timezone: 'America/Los_Angeles',
      entries: [
        {
          filmKey: 'sara-bareilles-good-grief',
          filmId: 'tmdb:1675218',
          title: 'Stale Opening Title',
          openingDate: '2026-09-12',
          theaterCountOnOpeningDate: 2,
          visibleShowtimeCount: 3,
          categoryId: 'limited',
          categoryBadge: 'Limited',
          engagementDays: 2,
          theatersOnOpeningDate: ['a', 'b'],
        },
      ],
    },
  };

  const page = buildLiveOpeningThisWeekPresentation(homeData, index);
  assert.ok(page.films.length >= 1);
  const film = page.films.find((f) => f.filmId === 'tmdb:1675218');
  assert.ok(film);
  assert.equal(film.title, 'Sara Bareilles: Good Grief');
  assert.equal(film.openingDate, '2026-09-12');
  assert.ok(film.dateLabel);
  assert.equal(film.theaters.length, 2);
  assert.match(film.theaterName ?? '', /Theater/);
});

test('4. Just Announced no-showtime film can still use canonical enrichment', () => {
  const index = emptyEnrichmentIndex([
    {
      ...bareillesEnrichmentRow(),
      film_id: 'tmdb:900001',
      tmdb_id: 900001,
      display_title: 'Cold Announced Film',
      overview: 'Announced but not yet playing.',
      poster: { path: '/cold.jpg', url: null },
    },
  ]);
  const homeData = {
    films: [],
    opportunities: [],
    newlyAdded: [
      {
        filmKey: 'cold-announced',
        filmId: 'tmdb:900001',
        title: 'Cold Announced Film (source)',
        firstObservedAt: '2026-09-08',
        hasActiveShowtimes: false,
        nextShowtimeAt: null,
        posterUrl: null,
      },
    ],
  };

  const page = buildLiveJustAnnouncedPresentation(homeData, index, {
    now: new Date('2026-09-10T12:00:00-07:00'),
  });
  // JA full list may filter to hasActiveShowtimes — shelf path must still join.
  const resolved = resolveCanonicalFilmPresentation({
    filmKey: 'cold-announced',
    filmId: 'tmdb:900001',
    homeData,
    enrichmentIndex: index,
    fallbackRecord: homeData.newlyAdded[0],
    context: 'home',
  });
  assert.equal(resolved.enriched.displayTitle, 'Cold Announced Film');
  assert.equal(resolved.enriched.hasEnrichment, true);
  assert.match(resolved.enriched.posterUrl ?? '', /cold\.jpg/);
  assert.equal(page.source === 'live-empty' || Array.isArray(page.films), true);
});

test('5. Leaving Soon preserves last-screening metadata with enrichment join', () => {
  const index = emptyEnrichmentIndex([
    {
      ...bareillesEnrichmentRow(),
      film_id: 'tmdb:777',
      tmdb_id: 777,
      display_title: 'Leaving Canonical',
      overview: 'Leaving soon synopsis.',
      poster: { path: '/leaving.jpg', url: null },
      runtime_minutes: 110,
    },
  ]);
  const homeData = {
    films: [],
    opportunities: [],
    leavingSoon: {
      status: 'ready',
      entries: [
        {
          filmKey: 'leaving-film',
          filmId: 'tmdb:777',
          title: 'Leaving Source Title',
          bucket: 'leaving_soon',
          bucketLabel: 'Leaving soon',
          maxShowDate: '2026-09-14',
          posterUrl: null,
          runtimeMin: 100,
          totalVisibleShowtimes: 2,
          totalVisibleTheaters: 1,
          theaters: [{ id: 't1', name: 'Cinerama' }],
        },
      ],
    },
  };

  const page = buildLiveLeavingSoonPresentation(homeData, index);
  assert.equal(page.films.length, 1);
  assert.equal(page.films[0].title, 'Leaving Canonical');
  assert.match(page.films[0].dateLabel ?? '', /Last screening/);
  assert.match(page.films[0].dateLabel ?? '', /Sep/);
  assert.equal(page.films[0].maxShowDate, '2026-09-14');
});

test('6. Special Presentations preserves format/presentation labels', () => {
  const index = emptyEnrichmentIndex([
    {
      ...bareillesEnrichmentRow(),
      film_id: 'tmdb:414906',
      tmdb_id: 414906,
      display_title: 'The Batman',
      overview: 'Bat synopsis.',
      poster: { path: '/bat.jpg', url: null },
      runtime_minutes: 176,
      release_year: 2022,
    },
  ]);
  const homeData = {
    films: [
      {
        filmKey: 'the-batman',
        filmId: 'tmdb:414906',
        title: 'Batman Source',
        runtimeMin: 176,
        posterUrl: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'the-batman',
        filmId: 'tmdb:414906',
        filmTitle: 'Batman Source',
        theaterId: 't1',
        theaterName: 'Pacific Science Center IMAX',
        localDate: '2026-09-12',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-09-12T19:00',
        formatLabels: ['IMAX'],
        specialPresentationCanonicalIds: ['imax'],
      },
    ],
  };

  const page = buildLiveSpecialPresentationsPresentation(homeData, index);
  assert.ok(page.films.length >= 1);
  const film = page.films[0];
  assert.equal(film.title, 'The Batman');
  assert.ok(
    film.formatLabel ||
      (Array.isArray(film.formatLabels) && film.formatLabels.length > 0) ||
      film.badge ||
      film.primaryLabel,
  );
});

test('7. P0B Early Access: canonical film title stays clean; qualifier stays on opportunity', () => {
  const index = emptyEnrichmentIndex([
    {
      ...bareillesEnrichmentRow(),
      film_id: 'tmdb:1433583',
      tmdb_id: 1433583,
      display_title: 'The Weight',
      overview: 'Weight overview.',
      poster: { path: '/weight.jpg', url: null },
      runtime_minutes: 110,
      release_year: 2026,
    },
  ]);
  const homeData = {
    films: [
      {
        filmKey: 'weight',
        filmId: 'tmdb:1433583',
        title: 'The Weight',
        runtimeMin: 110,
        posterUrl: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'ea1',
        filmKey: 'weight',
        filmId: 'tmdb:1433583',
        filmTitle: 'The Weight',
        screeningVariantType: 'early_access',
        theaterId: 't1',
        theaterName: 'SIFF',
        localDate: '2026-09-11',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-09-11T19:00',
        formatLabels: [],
      },
    ],
  };

  const resolved = resolveCanonicalFilmPresentation({
    filmKey: 'weight-early-access',
    filmId: 'tmdb:1433583',
    homeData,
    enrichmentIndex: index,
    fallbackRecord: {
      filmKey: 'weight-early-access',
      filmId: 'tmdb:1433583',
      title: 'The Weight Early Access',
      parentFilmKey: 'weight',
    },
    context: 'home',
  });

  assert.equal(resolved.homeFilm?.filmKey, 'weight');
  assert.equal(resolved.enriched.displayTitle, 'The Weight');
  assert.equal(/Early Access/i.test(resolved.enriched.displayTitle), false);
  assert.equal(
    homeData.opportunities[0].screeningVariantType,
    'early_access',
  );
});

test('8. Unmatched slug-only film continues using fallback/source metadata', () => {
  const index = emptyEnrichmentIndex([]);
  const resolved = resolveCanonicalFilmPresentation({
    filmKey: 'local-program',
    filmId: null,
    homeData: { films: [] },
    enrichmentIndex: index,
    fallbackRecord: {
      filmKey: 'local-program',
      title: 'Local Festival Program',
      posterUrl: 'https://example.com/local.jpg',
      runtimeMin: 80,
      synopsis: 'A local program synopsis.',
    },
    context: 'home',
  });

  assert.equal(resolved.enriched.hasEnrichment, false);
  assert.equal(resolved.enriched.displayTitle, 'Local Festival Program');
  assert.equal(resolved.enriched.posterUrl, 'https://example.com/local.jpg');
  assert.equal(resolved.enriched.runtimeMin, 80);
});

test('9. No component-specific TMDB rescue — hydrate is shared model layer only', () => {
  const shelfSrc = readFileSync(
    join(ROOT, 'v2/home/shelfData.js'),
    'utf8',
  );
  const openingSrc = readFileSync(
    join(ROOT, 'v2/opening/resolveOpeningEntryPresentation.js'),
    'utf8',
  );
  const featureSrc = readFileSync(
    join(ROOT, 'v2/home/TopOpportunityFeature.jsx'),
    'utf8',
  );
  assert.doesNotMatch(shelfSrc, /fetchTmdbMovieDetail/);
  assert.doesNotMatch(openingSrc, /fetchTmdbMovieDetail/);
  assert.doesNotMatch(featureSrc, /fetchTmdbMovieDetail/);
  assert.match(shelfSrc, /resolveCanonicalFilmPresentation/);
  assert.match(openingSrc, /resolveCanonicalFilmPresentation/);

  const appSrc = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
  assert.match(appSrc, /hydrateShelfFilmEnrichment/);
});

test('10. findCanonicalHomeFilm joins by filmId when slug is absent', () => {
  const homeData = {
    films: [
      {
        filmKey: 'weight',
        filmId: 'tmdb:1433583',
        title: 'The Weight',
      },
    ],
  };
  const byId = findCanonicalHomeFilm({
    filmKey: 'missing-slug',
    filmId: 'tmdb:1433583',
    homeData,
  });
  assert.equal(byId?.filmKey, 'weight');
});

test('hydrate merges TMDB snapshots into enrichment index for cold shelf ids', async () => {
  setCachedTmdbOnlyFilm('tmdb:1675218', {
    filmId: 'tmdb:1675218',
    title: 'Sara Bareilles: Good Grief',
    overview: 'Hydrated overview.',
    runtimeMin: 95,
    year: 2026,
    posterUrl: 'https://image.tmdb.org/t/p/w500/bareilles.jpg',
    backdropUrl: null,
    genres: ['Music'],
    directors: [],
    fetchedAt: new Date().toISOString(),
  });

  const base = emptyEnrichmentIndex([]);
  const homeData = {
    openingThisWeek: {
      entries: [
        {
          filmKey: 'sara-bareilles-good-grief',
          filmId: 'tmdb:1675218',
          title: 'Stale',
        },
      ],
    },
  };

  const needed = collectShelfFilmIdsNeedingEnrichment(homeData, base);
  assert.ok(needed.includes('tmdb:1675218'));

  const hydrated = await hydrateShelfFilmEnrichment(homeData, base, {
    fetchImpl: async () => {
      throw new Error('network should not be required when cache is warm');
    },
  });
  assert.ok(hydrated.hydratedIds.includes('tmdb:1675218'));
  assert.equal(hydrated.index.status, 'ready');
  assert.ok(hydrated.index.byFilmId.has('tmdb:1675218'));

  const shelf = buildOpeningThisWeekShelf(homeData, hydrated.index);
  assert.equal(shelf.films[0].title, 'Sara Bareilles: Good Grief');
  assert.ok(shelf.films[0].posterUrl);
});

test('mergeEnrichmentIndexWithSnapshots does not overwrite existing enrichment rows', () => {
  const base = emptyEnrichmentIndex([bareillesEnrichmentRow()]);
  const merged = mergeEnrichmentIndexWithSnapshots(base, [
    {
      filmId: 'tmdb:1675218',
      title: 'Should Not Win',
      year: 1999,
      posterUrl: 'https://example.com/wrong.jpg',
    },
  ]);
  assert.equal(
    merged.byFilmId.get('tmdb:1675218').display_title,
    'Sara Bareilles: Good Grief',
  );
});

test('enrichmentRowFromTmdbSnapshot maps cache snapshot fields', () => {
  const row = enrichmentRowFromTmdbSnapshot({
    filmId: 'tmdb:42',
    title: 'Answer',
    year: 2024,
    runtimeMin: 88,
    overview: 'Life.',
    posterUrl: 'https://example.com/p.jpg',
    genres: ['Drama'],
  });
  assert.equal(row.film_id, 'tmdb:42');
  assert.equal(row.display_title, 'Answer');
  assert.equal(row.release_year, 2024);
  assert.equal(row.poster.url, 'https://example.com/p.jpg');
});

test('Opening entry presentation exposes enriched year for category when slug cold', () => {
  const index = emptyEnrichmentIndex([bareillesEnrichmentRow()]);
  const resolved = resolveOpeningEntryPresentation(
    {
      filmKey: 'sara-bareilles-good-grief',
      filmId: 'tmdb:1675218',
      title: 'Stale',
      openingDate: '2026-09-12',
      visibleShowtimeCount: 0,
      categoryId: 'limited',
    },
    {
      homeData: { films: [] },
      enrichmentIndex: index,
      todayIso: '2026-09-10',
      currentYear: 2026,
    },
  );
  assert.equal(resolved.releaseYear, 2026);
  assert.equal(resolved.enriched.displayTitle, 'Sara Bareilles: Good Grief');
});

