import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  buildPersonalCollectionModel,
  collectionIdFromPersonalSegment,
  dedupePreferenceItemsByIdentity,
  isPersonalCollectionId,
  personalCollectionSegmentId,
  resolveHomeFilmForPreferenceRef,
  buildHomeFilmIdentityIndex,
  PERSONAL_COLLECTION_COPY,
} from '../../v2/collections/personalCollectionModel.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
  saveFilm,
  readSavedFilmsStore,
} from '../../v2/stores/savedFilmsStore.js';
import {
  markFilmSeen,
  getSeenFilms,
} from '../../v2/stores/seenFilmsStore.js';
import {
  markFilmNotInterested,
  clearFilmNotInterested,
  getNotInterestedFilms,
  isFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';
import {
  localSavedItemToRecord,
  recordToLocalSavedItem,
} from '../../v2/auth/filmPreferenceMerge.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Frozen clock before sampleHome showtimes (2026-05-17). */
const COLLECTION_NOW = new Date('2026-05-10T12:00:00-07:00');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function sampleHome() {
  return {
    films: [
      {
        filmKey: 'nosferatu',
        filmId: 'tmdb:426063',
        title: 'Nosferatu',
        posterUrl: 'https://example.test/nos.jpg',
        year: 2024,
        identityAliases: ['nosferatu-2024'],
      },
      {
        filmKey: 'seed-of-the-sacred-fig',
        filmId: 'tmdb:1106739',
        title: 'The Seed of the Sacred Fig',
        posterUrl: 'https://example.test/seed.jpg',
        year: 2024,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-nos-1',
        filmKey: 'nosferatu',
        theaterName: 'SIFF Cinema Egyptian',
        timeDisplay: 'Today at 7:00 PM',
        sortableLocalDateTime: '2026-05-17T19:00:00',
        formatLabels: ['2D'],
      },
    ],
  };
}

test('personal collection ids map to shared surface segments', () => {
  assert.equal(isPersonalCollectionId(COLLECTION_IDS.saved), true);
  assert.equal(isPersonalCollectionId(COLLECTION_IDS.seen), true);
  assert.equal(isPersonalCollectionId(COLLECTION_IDS.hidden), true);
  assert.equal(isPersonalCollectionId(COLLECTION_IDS.thisWeek), false);
  assert.equal(personalCollectionSegmentId(COLLECTION_IDS.saved), 'saved');
  assert.equal(personalCollectionSegmentId(COLLECTION_IDS.seen), 'seen');
  assert.equal(
    personalCollectionSegmentId(COLLECTION_IDS.hidden),
    'not-interested',
  );
  assert.equal(
    collectionIdFromPersonalSegment('not-interested'),
    COLLECTION_IDS.hidden,
  );
});

test('Saved renders a normal local catalog film under Available to watch', () => {
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: sampleHome(),
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
    ],
  });
  assert.equal(model.totalCount, 1);
  assert.equal(model.sections.length, 1);
  assert.equal(model.sections[0].id, 'available');
  assert.equal(model.sections[0].rows[0].watching, false);
  assert.equal(model.sections[0].rows[0].origin, 'catalog');
  assert.match(model.sections[0].rows[0].showtimeLine || '', /SIFF/);
  assert.equal(model.sections[0].rows[0].showWatchingBadge, false);
});

test('Saved renders tmdb-only film absent from HomeData via snapshot', () => {
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: sampleHome(),
    savedItems: [
      {
        filmRef: {
          filmId: 'tmdb:999001',
          showtimeFilmKey: 'tmdb:999001',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-02T12:00:00.000Z',
        title: 'Spider-Man: Beyond the Spider-Verse',
        posterUrl: 'https://example.test/spidey.jpg',
        year: 2027,
      },
    ],
  });
  assert.equal(model.totalCount, 1);
  assert.equal(model.sections[0].id, 'watching');
  const row = model.sections[0].rows[0];
  assert.equal(row.origin, 'snapshot');
  assert.equal(row.watching, true);
  assert.equal(row.showWatchingBadge, true);
  assert.equal(row.title, 'Spider-Man: Beyond the Spider-Verse');
  assert.equal(row.year, 2027);
  assert.equal(row.statusLine, 'No Seattle showtimes yet');
  assert.equal(row.filmId, 'tmdb:999001');
});

test('TMDB-only Saved item survives store rehydration with year snapshot', () => {
  const storage = memoryStorage();
  const written = saveFilm(
    storage,
    {
      filmId: 'tmdb:888',
      showtimeFilmKey: 'tmdb:888',
      title: 'Future Epic',
      posterUrl: 'https://example.test/epic.jpg',
      year: 2028,
    },
    { now: () => new Date('2026-05-10T08:00:00.000Z') },
  );
  assert.equal(written.ok, true);
  const raw = storage.getItem(SAVED_FILMS_STORAGE_KEY);
  assert.ok(raw);
  const storage2 = memoryStorage({ [SAVED_FILMS_STORAGE_KEY]: raw });
  const items = getSavedFilms(storage2);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Future Epic');
  assert.equal(items[0].year, 2028);
  assert.equal(items[0].filmRef.filmId, 'tmdb:888');
  const read = readSavedFilmsStore(storage2);
  assert.equal(read.status, 'ok');
});

test('Saved upgrades by filmId/alias when showtimes appear without duplicates', () => {
  const home = sampleHome();
  const index = buildHomeFilmIdentityIndex(home);
  const savedOnAlias = {
    filmRef: {
      filmId: 'tmdb:426063',
      showtimeFilmKey: 'nosferatu-2024',
      sourceFilmId: null,
      source: null,
      aliasKeys: [],
    },
    savedAt: '2026-04-01T00:00:00.000Z',
    title: 'Nosferatu',
  };
  const hit = resolveHomeFilmForPreferenceRef(savedOnAlias.filmRef, index);
  assert.equal(hit?.filmKey, 'nosferatu');

  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: home,
    savedItems: [
      savedOnAlias,
      {
        // Same logical film via primary key — must collapse
        filmRef: {
          filmId: 'tmdb:426063',
          showtimeFilmKey: 'nosferatu',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-01T00:00:00.000Z',
        title: 'Nosferatu',
      },
    ],
  });
  assert.equal(model.totalCount, 1);
  assert.equal(model.rows[0].watching, false);
  assert.equal(model.rows[0].origin, 'catalog');
  assert.equal(model.rows[0].filmKey, 'nosferatu');
});

test('Watching for showtimes is derived, not persisted', () => {
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: sampleHome(),
    savedItems: [
      {
        filmRef: {
          filmId: 'tmdb:1106739',
          showtimeFilmKey: 'seed-of-the-sacred-fig',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-03T00:00:00.000Z',
        title: 'The Seed of the Sacred Fig',
      },
      {
        filmRef: {
          filmId: 'tmdb:1',
          showtimeFilmKey: 'tmdb:1',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-04T00:00:00.000Z',
        title: 'Only On Snapshot',
        year: 2026,
      },
    ],
  });
  const available = model.sections.find((s) => s.id === 'available');
  const watching = model.sections.find((s) => s.id === 'watching');
  // Seed has no opportunity → watching; Nosferatu not in this list
  assert.equal(available, undefined);
  assert.equal(watching?.rows.length, 2);
  assert.ok(watching.rows.every((r) => r.watching === true));
  assert.ok(watching.rows.every((r) => !('watchForShowtimes' in (r.filmRef || {}))));
});

test('Available vs Watching grouping is correct with mixed Saved', () => {
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: sampleHome(),
    savedItems: [
      {
        filmRef: {
          filmId: 'tmdb:426063',
          showtimeFilmKey: 'nosferatu',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-01T00:00:00.000Z',
        title: 'Nosferatu',
      },
      {
        filmRef: {
          filmId: 'tmdb:42',
          showtimeFilmKey: 'tmdb:42',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-02T00:00:00.000Z',
        title: 'Waiting Film',
        year: 2026,
      },
    ],
  });
  assert.equal(model.sections.length, 2);
  assert.equal(model.sections[0].id, 'available');
  assert.equal(model.sections[0].rows[0].title, 'Nosferatu');
  assert.equal(model.sections[1].id, 'watching');
  assert.equal(model.sections[1].rows[0].title, 'Waiting Film');
});

test('Saved TMDB-only row opens Film Detail via tmdb filmId key', () => {
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: { films: [], opportunities: [] },
    savedItems: [
      {
        filmRef: {
          filmId: 'tmdb:777',
          showtimeFilmKey: 'tmdb:777',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-05T00:00:00.000Z',
        title: 'Open Me',
      },
    ],
  });
  const row = model.rows[0];
  assert.equal(row.origin, 'snapshot');
  assert.equal(row.filmId, 'tmdb:777');
  assert.equal(row.filmKey, 'tmdb:777');
});

test('Seen still renders existing state with marked date metadata', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, { showtimeFilmKey: 'nosferatu', filmId: 'tmdb:426063' });
  const items = getSeenFilms(storage);
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.seen,
    homeData: sampleHome(),
    seenItems: items,
  });
  assert.equal(model.totalCount, 1);
  assert.equal(model.title, 'Seen');
  assert.equal(model.rows[0].showRemove, false);
  assert.match(model.rows[0].statusLine || '', /Marked/);
});

test('Not Interested still renders and Remove clears only that preference', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, {
    showtimeFilmKey: 'nosferatu',
    filmId: 'tmdb:426063',
    title: 'Nosferatu',
  });
  assert.equal(isFilmNotInterested(storage, 'nosferatu'), true);
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.hidden,
    homeData: sampleHome(),
    notInterestedItems: getNotInterestedFilms(storage),
  });
  assert.equal(model.totalCount, 1);
  assert.equal(model.title, 'Not Interested');
  assert.equal(model.rows[0].showRemove, true);
  assert.match(model.rows[0].statusLine || '', /Added/);

  clearFilmNotInterested(storage, model.rows[0].filmRef);
  assert.equal(isFilmNotInterested(storage, 'nosferatu'), false);
  assert.equal(getNotInterestedFilms(storage).length, 0);
});

test('empty states and auth-aware privacy copy', () => {
  const emptyLocal = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: sampleHome(),
    savedItems: [],
    signedIn: false,
  });
  assert.equal(emptyLocal.totalCount, 0);
  assert.equal(emptyLocal.emptyTitle, 'No saved films yet');
  assert.match(emptyLocal.privacyNote, /this device/i);
  assert.doesNotMatch(emptyLocal.privacyNote, /syncs across your devices/i);

  const signedIn = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: sampleHome(),
    savedItems: [],
    signedIn: true,
  });
  assert.match(signedIn.privacyNote, /syncs across your devices/i);

  const emptySeen = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.seen,
    homeData: sampleHome(),
    seenItems: [],
  });
  assert.equal(emptySeen.emptyTitle, PERSONAL_COLLECTION_COPY[COLLECTION_IDS.seen].emptyTitle);

  const emptyNi = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.hidden,
    homeData: sampleHome(),
    notInterestedItems: [],
  });
  assert.equal(emptyNi.emptyTitle, 'Nothing here yet');
});

test('long titles and missing posters remain presentable in the model', () => {
  const longTitle =
    'An Extremely Long Film Title That Should Still Render Without Breaking The Personal Collection Row Layout Completely';
  const model = buildPersonalCollectionModel({
    now: COLLECTION_NOW,
    collectionId: COLLECTION_IDS.saved,
    homeData: { films: [], opportunities: [] },
    savedItems: [
      {
        filmRef: {
          filmId: 'tmdb:55',
          showtimeFilmKey: 'tmdb:55',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-05-06T00:00:00.000Z',
        title: longTitle,
        posterUrl: null,
      },
    ],
  });
  assert.equal(model.rows[0].title, longTitle);
  assert.equal(model.rows[0].posterUrl, null);
});

test('year snapshot round-trips through preference merge helpers', () => {
  const item = {
    filmRef: {
      filmId: 'tmdb:9',
      showtimeFilmKey: 'tmdb:9',
      sourceFilmId: null,
      source: null,
    },
    savedAt: '2026-05-07T00:00:00.000Z',
    title: 'Snapshot Year',
    year: 2030,
    posterUrl: 'https://example.test/y.jpg',
  };
  const record = localSavedItemToRecord(item, item.savedAt);
  assert.equal(record.year_snapshot, 2030);
  const back = recordToLocalSavedItem(record);
  assert.equal(back.year, 2030);
  assert.equal(back.title, 'Snapshot Year');
});

test('dedupePreferenceItemsByIdentity keeps one row for shared filmId', () => {
  const items = dedupePreferenceItemsByIdentity(
    [
      {
        filmRef: {
          filmId: 'tmdb:1',
          showtimeFilmKey: 'a',
          sourceFilmId: null,
          source: null,
        },
        savedAt: '2026-01-01T00:00:00.000Z',
        title: 'A',
      },
      {
        filmRef: {
          filmId: 'tmdb:1',
          showtimeFilmKey: 'b',
          sourceFilmId: null,
          source: null,
          aliasKeys: ['a'],
        },
        savedAt: '2026-02-01T00:00:00.000Z',
        title: 'B',
        year: 2025,
      },
    ],
    (i) => i.savedAt,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'B');
  assert.equal(items[0].year, 2025);
});

test('shared surface components and CSS are wired for personal collections', () => {
  const surface = readFileSync(
    join(ROOT, 'v2/collections/PersonalFilmCollectionSurface.jsx'),
    'utf8',
  );
  const app = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
  const css = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
  assert.match(surface, /PersonalCollectionSegmentedControl/);
  assert.match(surface, /PersonalCollectionFilmRow/);
  assert.match(app, /PersonalFilmCollectionSurface/);
  assert.match(app, /isPersonalCollection/);
  assert.match(css, /\.v2-pfc-segment-active/);
  assert.match(css, /\.v2-pfc-watching-badge/);
});

test('mockup fixture covers Saved mixed, Seen, Not Interested, and empty', async () => {
  const {
    getPersonalCollectionsMockupPresentation,
    PERSONAL_COLLECTIONS_VIEWPORT_WIDTH,
    PERSONAL_COLLECTIONS_MOCKUP_STATES,
  } = await import('../../v2/fixtures/personalCollectionsMockupFixture.js');
  assert.equal(PERSONAL_COLLECTIONS_VIEWPORT_WIDTH, 393);
  assert.deepEqual([...PERSONAL_COLLECTIONS_MOCKUP_STATES], [
    'saved-mixed',
    'seen-populated',
    'not-interested-populated',
    'saved-empty',
  ]);
  const mixed = getPersonalCollectionsMockupPresentation('saved-mixed');
  assert.equal(mixed.sections.map((s) => s.id).join(','), 'available,watching');
  assert.ok(mixed.sections[0].rows.length >= 1);
  assert.ok(mixed.sections[1].rows.length >= 1);
  const seen = getPersonalCollectionsMockupPresentation('seen-populated');
  assert.equal(seen.kind, 'seen');
  assert.ok(seen.totalCount >= 1);
  const ni = getPersonalCollectionsMockupPresentation('not-interested-populated');
  assert.equal(ni.kind, 'hidden');
  assert.ok(ni.totalCount >= 1);
  const empty = getPersonalCollectionsMockupPresentation('saved-empty');
  assert.equal(empty.totalCount, 0);
});
