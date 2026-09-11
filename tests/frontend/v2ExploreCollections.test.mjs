import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSE_ROWS } from '../../v2/explore/exploreBrowseBy.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  resolveActivePrimaryId,
  resolveHeaderBackLabel,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openCollectionDetail,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { composeCollectionsIndex } from '../../v2/exploreCollections/composeCollectionsIndex.js';
import { composeCollectionDetail } from '../../v2/exploreCollections/composeCollectionDetail.js';
import { loadCollectionsCurrent } from '../../v2/exploreCollections/loadCollectionsCurrent.js';
import { isDefaultVisibleCollection } from '../../v2/exploreCollections/collectionsModel.js';
import { V2_DATA_ARTIFACTS } from '../../v2/data/allowedDataRoutes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const INDEX_SRC = readFileSync(
  join(ROOT, 'v2/exploreCollections/CollectionsSurface.jsx'),
  'utf8',
);
const DETAIL_SRC = readFileSync(
  join(ROOT, 'v2/exploreCollections/CollectionDetailSurface.jsx'),
  'utf8',
);
const LOADER_SRC = readFileSync(
  join(ROOT, 'v2/exploreCollections/loadCollectionsCurrent.js'),
  'utf8',
);

const NOW = new Date('2026-09-11T18:00:00-07:00');

function sampleArtifact() {
  return {
    schema_version: '1.0.0',
    generated_at: '2026-09-11T11:20:44-07:00',
    timezone: 'America/Los_Angeles',
    collections: [
      {
        collectionId: 'siff:nouvelles-femmes',
        productType: 'collection',
        source: 'siff',
        sourceCollectionType: 'series',
        title: 'Nouvelles Femmes: Modern Women of the 1960s French New Wave Cinema',
        description: 'A celebration of women filmmakers.',
        sourceUrl: 'https://www.siff.net/programs-and-events/nouvelles-femmes',
        imageUrl:
          'https://www.siff.net/images/CINEMA/2026/Nouvelles%20Femmes/hero.png',
        startDate: 'September 16',
        endDate: 'November 17, 2026',
        status: 'active',
        memberCount: 3,
        currentShowtimeCount: 2,
      },
      {
        collectionId: 'beacon:program:archive-only',
        productType: 'collection',
        source: 'beacon',
        sourceCollectionType: 'program',
        title: 'Archive Only',
        description: 'Past program with no current dates.',
        sourceUrl: 'https://thebeacon.film/programs/archive-only',
        imageUrl: null,
        startDate: null,
        endDate: null,
        status: 'active',
        memberCount: 2,
        currentShowtimeCount: 0,
      },
      {
        collectionId: 'nwff:current-series',
        productType: 'collection',
        source: 'nwff',
        sourceCollectionType: 'series',
        title: 'Pacific Visions',
        description: null,
        sourceUrl: 'https://nwfilmforum.org/series/pacific-visions',
        imageUrl: null,
        startDate: null,
        endDate: null,
        status: 'active',
        memberCount: 1,
        currentShowtimeCount: 1,
      },
      {
        collectionId: 'siff:missing-optional',
        productType: 'collection',
        source: 'siff',
        sourceCollectionType: 'program',
        title: 'Sparse Program',
        description: null,
        sourceUrl: 'https://www.siff.net/programs-and-events/sparse',
        imageUrl: null,
        startDate: null,
        endDate: null,
        status: 'active',
        memberCount: 1,
        currentShowtimeCount: 1,
      },
      {
        collectionId: 'siff:inactive-archive',
        productType: 'collection',
        source: 'siff',
        sourceCollectionType: 'program',
        title: 'Inactive Archive',
        description: 'Should stay out of the default index.',
        sourceUrl: 'https://www.siff.net/programs-and-events/inactive',
        imageUrl: null,
        startDate: 'January 1, 2024',
        endDate: 'January 31, 2024',
        status: 'inactive',
        memberCount: 1,
        currentShowtimeCount: 4,
      },
    ],
    memberships: [
      {
        collectionId: 'siff:nouvelles-femmes',
        source: 'siff',
        sourceFilmUrl:
          'https://www.siff.net/programs-and-events/nouvelles-femmes/breathless',
        sourceFilmId: 'programs-and-events/nouvelles-femmes/breathless',
        sourceListingKey:
          'siff|id|programs-and-events/nouvelles-femmes/breathless',
        canonicalFilmId: null,
        rawTitle: 'Nouvelles Femmes: Breathless',
        identityTitleCandidate: 'Breathless',
      },
      {
        collectionId: 'siff:nouvelles-femmes',
        source: 'siff',
        sourceFilmUrl:
          'https://www.siff.net/programs-and-events/nouvelles-femmes/jules-and-jim',
        sourceFilmId: 'programs-and-events/nouvelles-femmes/jules-and-jim',
        sourceListingKey:
          'siff|id|programs-and-events/nouvelles-femmes/jules-and-jim',
        canonicalFilmId: 'tmdb:1628',
        rawTitle: 'Nouvelles Femmes: Jules and Jim (35mm)',
        identityTitleCandidate: 'Jules and Jim',
      },
      {
        collectionId: 'siff:nouvelles-femmes',
        source: 'siff',
        sourceFilmUrl:
          'https://www.siff.net/programs-and-events/nouvelles-femmes/contempt',
        sourceFilmId: 'programs-and-events/nouvelles-femmes/contempt',
        sourceListingKey:
          'siff|id|programs-and-events/nouvelles-femmes/contempt',
        canonicalFilmId: null,
        rawTitle: 'Nouvelles Femmes: Contempt',
        identityTitleCandidate: 'Contempt',
      },
      {
        collectionId: 'beacon:program:archive-only',
        source: 'beacon',
        sourceFilmUrl: 'https://thebeacon.film/calendar/movie/excalibur',
        sourceFilmId: 'excalibur',
        sourceListingKey: 'beacon|id|excalibur',
        canonicalFilmId: null,
        rawTitle: 'EXCALIBUR 1981',
        identityTitleCandidate: null,
      },
      {
        collectionId: 'nwff:current-series',
        source: 'nwff',
        sourceFilmUrl: 'https://nwfilmforum.org/films/visions',
        sourceFilmId: 'visions',
        sourceListingKey: 'nwff|id|visions',
        canonicalFilmId: 'tmdb:99',
        rawTitle: 'Visions',
        identityTitleCandidate: 'Visions',
      },
      {
        collectionId: 'siff:missing-optional',
        source: 'siff',
        sourceFilmUrl: 'https://www.siff.net/programs-and-events/sparse/one',
        sourceFilmId: 'programs-and-events/sparse/one',
        sourceListingKey: 'siff|id|programs-and-events/sparse/one',
        canonicalFilmId: null,
        rawTitle: 'One',
        identityTitleCandidate: 'One',
      },
    ],
  };
}

function sampleHome() {
  return {
    films: [
      {
        filmKey: 'nouvelles-femmes-jules-and-jim-35mm',
        filmId: 'tmdb:1628',
        title: 'Jules and Jim',
        posterUrl: 'https://image.tmdb.org/t/p/w342/jules.jpg',
        sourceFilmId: 'programs-and-events/nouvelles-femmes/jules-and-jim',
      },
      {
        filmKey: 'nouvelles-femmes-breathless',
        filmId: null,
        title: 'Breathless',
        posterUrl: 'https://www.siff.net/breathless.png',
        sourceFilmId: 'programs-and-events/nouvelles-femmes/breathless',
      },
    ],
    opportunities: [
      {
        opportunityKey: 'nf-breathless-1',
        filmKey: 'nouvelles-femmes-breathless',
        filmId: null,
        source: 'siff',
        sourceFilmId: 'programs-and-events/nouvelles-femmes/breathless',
        theaterName: 'SIFF Cinema Uptown',
        localDate: '2026-09-12',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        formatLabels: [],
      },
      {
        opportunityKey: 'nf-jules-1',
        filmKey: 'nouvelles-femmes-jules-and-jim-35mm',
        filmId: 'tmdb:1628',
        source: 'siff',
        sourceFilmId: 'programs-and-events/nouvelles-femmes/jules-and-jim',
        theaterName: 'SIFF Cinema Uptown',
        localDate: '2026-09-29',
        localTime: '18:30',
        timeDisplay: '6:30 PM',
        formatLabels: ['35mm'],
      },
      {
        opportunityKey: 'jules-unrelated',
        filmKey: 'jules-and-jim-regular',
        filmId: 'tmdb:1628',
        source: 'siff',
        sourceFilmId: 'films/jules-and-jim',
        theaterName: 'SIFF Film Center',
        localDate: '2026-09-13',
        localTime: '20:00',
        timeDisplay: '8:00 PM',
        formatLabels: [],
      },
      {
        opportunityKey: 'nwff-visions-1',
        filmKey: 'visions',
        filmId: 'tmdb:99',
        source: 'nwff',
        sourceFilmId: 'visions',
        theaterName: 'NW Film Forum',
        localDate: '2026-09-14',
        localTime: '19:30',
        timeDisplay: '7:30 PM',
        formatLabels: [],
      },
      {
        opportunityKey: 'sparse-1',
        filmKey: 'sparse-one',
        source: 'siff',
        sourceFilmId: 'programs-and-events/sparse/one',
        theaterName: 'SIFF Cinema Downtown',
        localDate: '2026-09-20',
        localTime: '15:00',
        timeDisplay: '3:00 PM',
        formatLabels: [],
      },
    ],
  };
}

function sampleEnrichmentIndex() {
  return {
    status: 'ready',
    byFilmId: new Map([
      [
        'tmdb:1628',
        {
          display_title: 'Jules and Jim',
          release_year: 1962,
          directors: [{ name: 'François Truffaut' }],
          genres: [{ name: 'Drama' }, { name: 'Romance' }],
          poster: { url: 'https://image.tmdb.org/t/p/w342/jules.jpg' },
        },
      ],
    ]),
  };
}

test('Explore Collections row opens Collections index', () => {
  const row = BROWSE_ROWS.find((item) => item.id === COLLECTION_IDS.collections);
  assert.equal(row?.label, 'Collections');
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.collections,
    originPrimary: 'explore',
  });
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.surface?.collectionId, COLLECTION_IDS.collections);
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.match(APP_SRC, /isCollectionsList/);
  assert.match(APP_SRC, /CollectionsSurface/);
});

test('index consumes collections_current.json via allowlist and loader', () => {
  assert.ok(
    V2_DATA_ARTIFACTS.some(
      (artifact) => artifact.route === '/data/collections_current.json',
    ),
  );
  assert.match(LOADER_SRC, /\/data\/collections_current\.json/);
  assert.match(APP_SRC, /loadCollectionsCurrent/);
  const loaded = composeCollectionsIndex(sampleArtifact(), {
    homeData: sampleHome(),
    now: NOW,
  });
  assert.ok(loaded.collections.length > 0);
  assert.equal(loaded.totalArtifactCount, 5);
});

test('default index hides archive-only and inactive collections', () => {
  const index = composeCollectionsIndex(sampleArtifact(), {
    homeData: sampleHome(),
    now: NOW,
  });
  const ids = index.collections.map((row) => row.collectionId);
  assert.ok(ids.includes('siff:nouvelles-femmes'));
  assert.ok(ids.includes('nwff:current-series'));
  assert.equal(ids.includes('beacon:program:archive-only'), false);
  assert.equal(ids.includes('siff:inactive-archive'), false);
  assert.equal(
    isDefaultVisibleCollection(
      sampleArtifact().collections.find(
        (row) => row.collectionId === 'beacon:program:archive-only',
      ),
      { upcomingCount: 0, artifactShowtimeCount: 0, todayIso: '2026-09-11' },
    ),
    false,
  );
});

test('active collection card shows title, source, type, upcoming, and member count', () => {
  const index = composeCollectionsIndex(sampleArtifact(), {
    homeData: sampleHome(),
    now: NOW,
  });
  const card = index.collections.find(
    (row) => row.collectionId === 'siff:nouvelles-femmes',
  );
  assert.ok(card);
  assert.match(card.title, /Nouvelles Femmes/);
  assert.equal(card.sourceLabel, 'SIFF');
  assert.equal(card.typeLabel, 'Series');
  assert.equal(card.upcomingCount, 2);
  assert.equal(card.memberCount, 3);
  assert.match(INDEX_SRC, /upcoming/);
  assert.match(INDEX_SRC, /films/);
});

test('theater filter keeps only the selected source', () => {
  const index = composeCollectionsIndex(sampleArtifact(), {
    homeData: sampleHome(),
    now: NOW,
    filters: { sources: ['siff'] },
  });
  assert.ok(index.collections.length >= 1);
  assert.ok(index.collections.every((row) => row.source === 'siff'));
  assert.equal(
    index.collections.some((row) => row.collectionId === 'nwff:current-series'),
    false,
  );
});

test('collection detail renders title, source/type, description, image, source link, and stats', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:nouvelles-femmes',
    { homeData: sampleHome(), now: NOW },
  );
  assert.equal(detail.found, true);
  assert.match(detail.title, /Nouvelles Femmes/);
  assert.equal(detail.sourceLabel, 'SIFF');
  assert.equal(detail.typeLabel, 'Series');
  assert.equal(detail.description, 'A celebration of women filmmakers.');
  assert.ok(detail.imageUrl?.includes('Nouvelles'));
  assert.equal(
    detail.sourceUrl,
    'https://www.siff.net/programs-and-events/nouvelles-femmes',
  );
  assert.equal(detail.sourceLinkLabel, 'View on SIFF ↗');
  assert.equal(detail.upcomingCount, 2);
  assert.equal(detail.memberCount, 3);
  assert.equal(detail.dateRangeLabel, 'Sep 16 – Nov 17');
  assert.match(DETAIL_SRC, /sourceLinkLabel/);
  assert.match(DETAIL_SRC, /noopener noreferrer/);
});

test('upcoming section only shows collection-associated screenings', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:nouvelles-femmes',
    { homeData: sampleHome(), now: NOW },
  );
  const titles = detail.upcoming.map((row) => row.title);
  assert.ok(titles.includes('Breathless'));
  assert.ok(titles.includes('Jules and Jim'));
  assert.equal(detail.upcoming.length, 2);
  assert.ok(
    detail.upcoming.every((row) =>
      String(row.listingKey).includes('nouvelles-femmes'),
    ),
  );
});

test('same canonical film with an unrelated screening does not leak into the collection', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:nouvelles-femmes',
    { homeData: sampleHome(), now: NOW },
  );
  const jules = detail.upcoming.find((row) => row.filmId === 'tmdb:1628');
  assert.ok(jules);
  assert.equal(jules.theaterName, 'SIFF Cinema Uptown');
  assert.match(jules.nextWhenLabel, /Sep 29/);
  assert.equal(jules.nextWhenLabel.includes('Sep 13'), false);
  assert.equal(
    detail.upcoming.some((row) => row.theaterName === 'SIFF Film Center'),
    false,
  );
});

test('unresolved collection member still renders', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:nouvelles-femmes',
    { homeData: sampleHome(), now: NOW },
  );
  const breathless = detail.upcoming.find((row) => row.title === 'Breathless');
  assert.ok(breathless);
  assert.equal(breathless.unresolved, true);
  assert.equal(breathless.filmId, null);
  const contempt = detail.alsoInCollection.find((row) => row.title === 'Contempt');
  assert.ok(contempt);
  assert.equal(contempt.unresolved, true);
});

test('member with no future collection screening appears under Also in this collection', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:nouvelles-femmes',
    { homeData: sampleHome(), now: NOW },
  );
  assert.equal(detail.alsoInCollection.length, 1);
  assert.equal(detail.alsoInCollection[0].title, 'Contempt');
  assert.equal(detail.alsoInCollection[0].noUpcomingLabel, 'No upcoming screening');
  assert.match(DETAIL_SRC, /Also in this collection/);
});

test('canonical member uses existing film enrichment', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:nouvelles-femmes',
    {
      homeData: sampleHome(),
      enrichmentIndex: sampleEnrichmentIndex(),
      now: NOW,
    },
  );
  const jules = detail.upcoming.find((row) => row.filmId === 'tmdb:1628');
  assert.ok(jules);
  assert.equal(jules.title, 'Jules and Jim');
  assert.equal(jules.year, 1962);
  assert.equal(jules.directors, 'François Truffaut');
  assert.equal(jules.genreLine, 'Drama, Romance');
  assert.ok(jules.posterUrl);
});

test('film card click preserves durable filmId behavior', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:nouvelles-femmes',
    { homeData: sampleHome(), now: NOW },
  );
  const jules = detail.upcoming.find((row) => row.filmId === 'tmdb:1628');
  assert.equal(jules.canOpenFilmDetail, true);
  assert.equal(jules.filmId, 'tmdb:1628');
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.collections,
    originPrimary: 'explore',
  });
  nav = openCollectionDetail(nav, {
    collectionId: 'siff:nouvelles-femmes',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  nav = openFilmDetail(nav, {
    filmKey: jules.filmKey,
    filmId: jules.filmId,
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  assert.equal(nav.surface?.filmId, 'tmdb:1628');
  assert.match(APP_SRC, /filmId/);
  assert.match(DETAIL_SRC, /filmId: row\.filmId/);
});

test('back behavior is detail → Collections → Explore and Explore stays active', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.collections,
    originPrimary: 'explore',
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(resolveHeaderBackLabel(nav), 'Explore');

  nav = openCollectionDetail(nav, {
    collectionId: 'siff:nouvelles-femmes',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'collection-detail');
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(resolveHeaderBackLabel(nav), 'Collections');

  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.surface?.collectionId, COLLECTION_IDS.collections);
  assert.equal(resolveActivePrimaryId(nav), 'explore');

  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'explore');
  assert.equal(resolveActivePrimaryId(nav), 'explore');
});

test('missing optional image, description, and date does not crash', () => {
  const detail = composeCollectionDetail(
    sampleArtifact(),
    'siff:missing-optional',
    { homeData: sampleHome(), now: NOW },
  );
  assert.equal(detail.found, true);
  assert.equal(detail.imageUrl, null);
  assert.equal(detail.description, null);
  assert.equal(detail.dateRangeLabel, null);
  assert.equal(detail.upcomingCount, 1);
  assert.match(DETAIL_SRC, /detail\.description \?/);
  assert.match(DETAIL_SRC, /detail\.dateRangeLabel \?/);
});

test('loadCollectionsCurrent accepts a provided artifact and rejects invalid docs', async () => {
  const ready = await loadCollectionsCurrent({ artifact: sampleArtifact() });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.artifact.collections.length, 5);
  const missing = await loadCollectionsCurrent({ artifact: { nope: true } });
  assert.equal(missing.status, 'unavailable');
});

test('real collections_current.json default list is much smaller than the archive', async () => {
  const raw = JSON.parse(
    readFileSync(join(ROOT, 'public/data/collections_current.json'), 'utf8'),
  );
  const loaded = await loadCollectionsCurrent({ artifact: raw });
  assert.equal(loaded.status, 'ready');
  const index = composeCollectionsIndex(loaded.artifact, {
    now: NOW,
  });
  assert.ok(index.totalArtifactCount >= 90);
  assert.ok(index.collections.length < index.totalArtifactCount);
  assert.ok(index.collections.length <= 40);
  const nf = index.collections.find(
    (row) => row.collectionId === 'siff:nouvelles-femmes',
  );
  assert.ok(nf);
  assert.equal(nf.sourceLabel, 'SIFF');
  assert.equal(nf.typeLabel, 'Series');
});
