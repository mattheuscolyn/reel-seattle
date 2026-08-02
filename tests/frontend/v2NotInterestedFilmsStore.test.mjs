import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  NOT_INTERESTED_FILMS_VERSION,
  clearFilmNotInterested,
  clearNotInterestedFilms,
  emptyNotInterestedFilmsStore,
  getNotInterestedFilms,
  isFilmNotInterested,
  markFilmNotInterested,
  migrateLegacyNotInterestedFilmKeys,
  readNotInterestedFilmsStore,
  toggleFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  dismissFilm,
  loadDismissedFilmKeys,
  saveDismissedFilmKeys,
  undismissFilm,
} from '../../v2/explore/dismissedFilmsStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
  saveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  SEEN_FILMS_STORAGE_KEY,
  getSeenFilms,
  markFilmSeen,
} from '../../v2/stores/seenFilmsStore.js';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const STORE_SRC = readFileSync(
  join(ROOT, 'v2/stores/notInterestedFilmsStore.js'),
  'utf8',
);

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

function fixedNow(iso) {
  return () => new Date(iso);
}

test('missing key returns empty v1 store', () => {
  const storage = memoryStorage();
  const read = readNotInterestedFilmsStore(storage);
  assert.equal(read.status, 'empty');
  assert.deepEqual(read.store, emptyNotInterestedFilmsStore());
  assert.deepEqual(getNotInterestedFilms(storage), []);
  assert.equal(isFilmNotInterested(storage, 'alpha'), false);
});

test('mark / isNotInterested / clear / toggle / clearAll', () => {
  const storage = memoryStorage();
  const marked = markFilmNotInterested(
    storage,
    { showtimeFilmKey: 'alpha', title: 'Alpha' },
    { now: fixedNow('2026-07-24T20:00:00.000Z') },
  );
  assert.equal(marked.ok, true);
  assert.equal(marked.changed, true);
  assert.equal(marked.store.version, NOT_INTERESTED_FILMS_VERSION);
  assert.equal(isFilmNotInterested(storage, 'alpha'), true);
  assert.equal(getNotInterestedFilms(storage)[0].markedAtSource, 'user-recorded');
  assert.equal(getNotInterestedFilms(storage)[0].reason, null);
  assert.equal(getNotInterestedFilms(storage)[0].title, 'Alpha');

  const again = markFilmNotInterested(storage, 'alpha', {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(getNotInterestedFilms(storage)[0].markedAt, '2026-07-24T20:00:00.000Z');
  assert.equal(getNotInterestedFilms(storage).length, 1);

  markFilmNotInterested(storage, 'beta', {
    now: fixedNow('2026-07-24T22:00:00.000Z'),
  });
  assert.deepEqual(
    getNotInterestedFilms(storage).map((item) => item.filmRef.showtimeFilmKey),
    ['beta', 'alpha'],
  );

  const toggledOff = toggleFilmNotInterested(storage, 'beta');
  assert.equal(toggledOff.notInterested, false);
  assert.equal(isFilmNotInterested(storage, 'beta'), false);

  const toggledOn = toggleFilmNotInterested(storage, 'beta', {
    now: fixedNow('2026-07-24T23:00:00.000Z'),
  });
  assert.equal(toggledOn.notInterested, true);

  const clearedOne = clearFilmNotInterested(storage, 'beta');
  assert.equal(clearedOne.ok, true);
  assert.equal(isFilmNotInterested(storage, 'beta'), false);

  const cleared = clearNotInterestedFilms(storage);
  assert.equal(cleared.ok, true);
  assert.deepEqual(getNotInterestedFilms(storage), []);
});

test('parent/variant identity follows shared filmRef helper', () => {
  const storage = memoryStorage();
  const imax = filmRefFromHomeFilm({
    filmKey: 'dune-imax',
    parentFilmKey: 'dune',
    title: 'Dune',
  });
  markFilmNotInterested(storage, imax, {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  const digital = filmRefFromHomeFilm({
    filmKey: 'dune-digital',
    parentFilmKey: 'dune',
  });
  assert.equal(isFilmNotInterested(storage, digital), true);
  assert.equal(getNotInterestedFilms(storage).length, 1);
  assert.equal(getNotInterestedFilms(storage)[0].filmRef.showtimeFilmKey, 'dune');
});

test('rejects empty identity and does not use performance ids', () => {
  const storage = memoryStorage();
  const bad = markFilmNotInterested(storage, { title: 'No Key' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'invalid_ref');
  const item = markFilmNotInterested(
    storage,
    {
      showtimeFilmKey: 'alpha',
      opportunityKey: 'opp-1',
      sourceShowtimeId: 'perf-1',
    },
    { now: fixedNow('2026-07-24T20:00:00.000Z') },
  );
  assert.equal(item.ok, true);
  assert.equal(item.store.items[0].filmRef.showtimeFilmKey, 'alpha');
  assert.notEqual(item.store.items[0].filmRef.showtimeFilmKey, 'opp-1');
});

test('distinct remakes stay distinct; filmId precedes when both present', () => {
  const storage = memoryStorage();
  markFilmNotInterested(
    storage,
    { showtimeFilmKey: 'dune-1984', title: 'Dune' },
    { now: fixedNow('2026-07-24T20:00:00.000Z') },
  );
  markFilmNotInterested(
    storage,
    { showtimeFilmKey: 'dune-2021', title: 'Dune' },
    { now: fixedNow('2026-07-24T21:00:00.000Z') },
  );
  assert.equal(getNotInterestedFilms(storage).length, 2);

  markFilmNotInterested(
    storage,
    { filmId: 'tmdb:1', showtimeFilmKey: 'a' },
    { now: fixedNow('2026-07-24T22:00:00.000Z') },
  );
  assert.equal(
    isFilmNotInterested(storage, { filmId: 'tmdb:1', showtimeFilmKey: 'b' }),
    true,
  );
});

test('does not invent reason values', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  assert.equal(getNotInterestedFilms(storage)[0].reason, null);
  assert.equal(STORE_SRC.includes('dislike'), false);
  assert.equal(STORE_SRC.includes('boring'), false);
});

test('legacy string array migrates in memory without rewriting until write', () => {
  const legacy = ['alpha', 'beta', 'alpha', '  ', 3];
  const storage = memoryStorage({
    [NOT_INTERESTED_FILMS_STORAGE_KEY]: JSON.stringify(legacy),
  });
  const read = readNotInterestedFilmsStore(storage, {
    migratedAt: '2026-07-24T12:00:00.000Z',
  });
  assert.equal(read.status, 'legacy_migrated');
  assert.equal(read.store.items.length, 2);
  assert.equal(read.store.items[0].markedAtSource, 'migrated-unknown');
  assert.equal(read.store.items[0].markedAt, '2026-07-24T12:00:00.000Z');
  assert.equal(read.store.items[0].reason, null);
  assert.equal(read.store.items[0].filmRef.filmId, null);
  assert.equal(
    storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY),
    JSON.stringify(legacy),
  );

  const written = markFilmNotInterested(storage, 'gamma', {
    now: fixedNow('2026-07-24T13:00:00.000Z'),
  });
  assert.equal(written.ok, true);
  const persisted = JSON.parse(
    storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY),
  );
  assert.equal(persisted.version, NOT_INTERESTED_FILMS_VERSION);
  assert.ok(Array.isArray(persisted.items));
  assert.equal(persisted.items.length, 3);
});

test('migrateLegacyNotInterestedFilmKeys helper collapses duplicates', () => {
  const items = migrateLegacyNotInterestedFilmKeys(['a', 'b', 'a'], {
    migratedAt: '2026-07-01T00:00:00.000Z',
  });
  assert.deepEqual(
    items.map((item) => item.filmRef.showtimeFilmKey),
    ['a', 'b'],
  );
});

test('unsupported future version is not overwritten', () => {
  const future = { version: 9, items: [{ filmRef: { showtimeFilmKey: 'x' } }] };
  const storage = memoryStorage({
    [NOT_INTERESTED_FILMS_STORAGE_KEY]: JSON.stringify(future),
  });
  const attempt = markFilmNotInterested(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  assert.equal(attempt.ok, false);
  assert.match(String(attempt.error), /unsupported_version/);
  assert.equal(
    storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY),
    JSON.stringify(future),
  );
});

test('corrupt JSON and write failures are controlled', () => {
  const bad = memoryStorage({ [NOT_INTERESTED_FILMS_STORAGE_KEY]: '{nope' });
  assert.equal(readNotInterestedFilmsStore(bad).status, 'corrupt');
  assert.deepEqual(getNotInterestedFilms(bad), []);

  const failing = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
  const result = markFilmNotInterested(failing, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'quota_exceeded');
});

test('compatibility key helpers still work and persist versioned payload', () => {
  const storage = memoryStorage();
  let keys = dismissFilm('alpha', []);
  keys = dismissFilm('beta', keys);
  assert.deepEqual(keys, ['beta', 'alpha']);
  assert.equal(
    saveDismissedFilmKeys(storage, keys, {
      now: fixedNow('2026-07-24T20:00:00.000Z'),
    }),
    true,
  );
  assert.deepEqual(loadDismissedFilmKeys(storage), ['beta', 'alpha']);
  const raw = JSON.parse(storage.getItem(DISMISSED_FILMS_STORAGE_KEY));
  assert.equal(raw.version, NOT_INTERESTED_FILMS_VERSION);
  assert.equal(raw.items.length, 2);
  assert.equal(raw.items[0].reason, null);
  keys = undismissFilm('beta', keys);
  saveDismissedFilmKeys(storage, keys);
  assert.deepEqual(loadDismissedFilmKeys(storage), ['alpha']);
});

test('Not Interested does not modify Saved or Seen', () => {
  const storage = memoryStorage();
  saveFilm(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  markFilmSeen(storage, 'beta', {
    now: fixedNow('2026-07-24T20:30:00.000Z'),
  });
  markFilmNotInterested(storage, 'gamma', {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.deepEqual(loadDismissedFilmKeys(storage), ['gamma']);
  assert.ok(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(SEEN_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY));
});

test('fixture isolation: store module has no fixture imports or seed', () => {
  assert.equal(STORE_SRC.includes('filmDetailMockup'), false);
  assert.equal(STORE_SRC.includes('filmDetailVisual'), false);
  assert.equal(STORE_SRC.includes('2001'), false);
  assert.deepEqual(emptyNotInterestedFilmsStore().items, []);
});

test('clear then remake creates a new timestamp', () => {
  const storage = memoryStorage();
  markFilmNotInterested(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  clearFilmNotInterested(storage, 'alpha');
  markFilmNotInterested(storage, 'alpha', {
    now: fixedNow('2026-07-24T22:00:00.000Z'),
  });
  assert.equal(
    getNotInterestedFilms(storage)[0].markedAt,
    '2026-07-24T22:00:00.000Z',
  );
});
