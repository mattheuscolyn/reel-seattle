import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEEN_FILMS_STORAGE_KEY,
  SEEN_FILMS_VERSION,
  clearSeenFilms,
  emptySeenFilmsStore,
  getSeenFilms,
  isFilmSeen,
  markFilmSeen,
  markFilmUnseen,
  migrateLegacySeenFilmKeys,
  normalizeSeenShowtimeRef,
  readSeenFilmsStore,
  toggleFilmSeen,
} from '../../v2/stores/seenFilmsStore.js';
import {
  loadSeenFilmKeys,
  markFilmSeen as markSeenKeyList,
  saveSeenFilmKeys,
  unmarkFilmSeen,
} from '../../v2/explore/seenFilmsStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
  saveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  DISMISSED_FILMS_STORAGE_KEY,
  dismissFilm,
  loadDismissedFilmKeys,
  saveDismissedFilmKeys,
} from '../../v2/explore/dismissedFilmsStore.js';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const STORE_SRC = readFileSync(
  join(ROOT, 'v2/stores/seenFilmsStore.js'),
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
  const read = readSeenFilmsStore(storage);
  assert.equal(read.status, 'empty');
  assert.deepEqual(read.store, emptySeenFilmsStore());
  assert.deepEqual(getSeenFilms(storage), []);
  assert.equal(isFilmSeen(storage, 'alpha'), false);
});

test('mark / isSeen / unmark / toggle / clear', () => {
  const storage = memoryStorage();
  const marked = markFilmSeen(
    storage,
    { showtimeFilmKey: 'alpha', title: 'Alpha' },
    { now: fixedNow('2026-07-24T20:00:00.000Z') },
  );
  assert.equal(marked.ok, true);
  assert.equal(marked.changed, true);
  assert.equal(marked.store.version, SEEN_FILMS_VERSION);
  assert.equal(isFilmSeen(storage, 'alpha'), true);
  assert.equal(getSeenFilms(storage)[0].seenAtSource, 'user-recorded');
  assert.equal(getSeenFilms(storage)[0].showtimeRef ?? null, null);

  const again = markFilmSeen(
    storage,
    'alpha',
    { now: fixedNow('2026-07-24T21:00:00.000Z') },
  );
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(getSeenFilms(storage)[0].seenAt, '2026-07-24T20:00:00.000Z');
  assert.equal(getSeenFilms(storage).length, 1);

  markFilmSeen(storage, 'beta', {
    now: fixedNow('2026-07-24T22:00:00.000Z'),
  });
  assert.deepEqual(
    getSeenFilms(storage).map((item) => item.filmRef.showtimeFilmKey),
    ['beta', 'alpha'],
  );

  const toggledOff = toggleFilmSeen(storage, 'beta');
  assert.equal(toggledOff.seen, false);
  assert.equal(isFilmSeen(storage, 'beta'), false);

  const toggledOn = toggleFilmSeen(storage, 'beta', {
    now: fixedNow('2026-07-24T23:00:00.000Z'),
  });
  assert.equal(toggledOn.seen, true);

  const cleared = clearSeenFilms(storage);
  assert.equal(cleared.ok, true);
  assert.deepEqual(getSeenFilms(storage), []);
});

test('parent/variant identity follows shared filmRef helper', () => {
  const storage = memoryStorage();
  const imax = filmRefFromHomeFilm({
    filmKey: 'dune-imax',
    parentFilmKey: 'dune',
    title: 'Dune',
  });
  markFilmSeen(storage, imax, {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  const digital = filmRefFromHomeFilm({
    filmKey: 'dune-digital',
    parentFilmKey: 'dune',
  });
  assert.equal(isFilmSeen(storage, digital), true);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage)[0].filmRef.showtimeFilmKey, 'dune');
});

test('rejects empty identity and does not use performance ids', () => {
  const storage = memoryStorage();
  const bad = markFilmSeen(storage, { title: 'No Key' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'invalid_ref');
  const item = markFilmSeen(
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
  markFilmSeen(storage, { showtimeFilmKey: 'dune-1984', title: 'Dune' }, {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  markFilmSeen(storage, { showtimeFilmKey: 'dune-2021', title: 'Dune' }, {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  assert.equal(getSeenFilms(storage).length, 2);

  markFilmSeen(
    storage,
    { filmId: 'f1', showtimeFilmKey: 'a' },
    { now: fixedNow('2026-07-24T22:00:00.000Z') },
  );
  assert.equal(
    isFilmSeen(storage, { filmId: 'f1', showtimeFilmKey: 'b' }),
    true,
  );
});

test('explicit showtimeRef retained; generic toggle stores null', () => {
  assert.equal(normalizeSeenShowtimeRef({}), null);
  assert.equal(normalizeSeenShowtimeRef(null), null);
  const ref = normalizeSeenShowtimeRef({
    publicShowtimeId: 'pub-1',
    sourceShowtimeId: 'src-1',
    theaterId: 't1',
    startsAt: '2026-07-24T19:00:00.000Z',
  });
  assert.deepEqual(ref, {
    publicShowtimeId: 'pub-1',
    sourceShowtimeId: 'src-1',
    theaterId: 't1',
    startsAt: '2026-07-24T19:00:00.000Z',
  });

  const storage = memoryStorage();
  markFilmSeen(
    storage,
    'alpha',
    {
      now: fixedNow('2026-07-24T20:00:00.000Z'),
      showtimeRef: ref,
    },
  );
  assert.deepEqual(getSeenFilms(storage)[0].showtimeRef, ref);
  assert.equal(getSeenFilms(storage)[0].filmRef.showtimeFilmKey, 'alpha');
});

test('legacy string array migrates in memory without rewriting until write', () => {
  const legacy = ['alpha', 'beta', 'alpha', '  ', 3];
  const storage = memoryStorage({
    [SEEN_FILMS_STORAGE_KEY]: JSON.stringify(legacy),
  });
  const read = readSeenFilmsStore(storage, {
    migratedAt: '2026-07-24T12:00:00.000Z',
  });
  assert.equal(read.status, 'legacy_migrated');
  assert.equal(read.store.items.length, 2);
  assert.equal(read.store.items[0].seenAtSource, 'migrated-unknown');
  assert.equal(read.store.items[0].seenAt, '2026-07-24T12:00:00.000Z');
  assert.equal(read.store.items[0].showtimeRef ?? null, null);
  assert.equal(read.store.items[0].filmRef.filmId, null);
  // Raw legacy still on disk until intentional write.
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), JSON.stringify(legacy));

  const written = markFilmSeen(storage, 'gamma', {
    now: fixedNow('2026-07-24T13:00:00.000Z'),
  });
  assert.equal(written.ok, true);
  const persisted = JSON.parse(storage.getItem(SEEN_FILMS_STORAGE_KEY));
  assert.equal(persisted.version, 1);
  assert.ok(Array.isArray(persisted.items));
  assert.equal(persisted.items.length, 3);
});

test('migrateLegacySeenFilmKeys helper collapses duplicates', () => {
  const items = migrateLegacySeenFilmKeys(['a', 'b', 'a'], {
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
    [SEEN_FILMS_STORAGE_KEY]: JSON.stringify(future),
  });
  const attempt = markFilmSeen(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  assert.equal(attempt.ok, false);
  assert.match(String(attempt.error), /unsupported_version/);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY), JSON.stringify(future));
});

test('corrupt JSON and write failures are controlled', () => {
  const bad = memoryStorage({ [SEEN_FILMS_STORAGE_KEY]: '{nope' });
  assert.equal(readSeenFilmsStore(bad).status, 'corrupt');
  assert.deepEqual(getSeenFilms(bad), []);

  const failing = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
  const result = markFilmSeen(failing, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'quota_exceeded');
});

test('compatibility key helpers still work and persist versioned payload', () => {
  const storage = memoryStorage();
  let keys = markSeenKeyList('alpha', []);
  keys = markSeenKeyList('beta', keys);
  assert.deepEqual(keys, ['beta', 'alpha']);
  assert.equal(saveSeenFilmKeys(storage, keys, {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  }), true);
  assert.deepEqual(loadSeenFilmKeys(storage), ['beta', 'alpha']);
  const raw = JSON.parse(storage.getItem(SEEN_FILMS_STORAGE_KEY));
  assert.equal(raw.version, 1);
  assert.equal(raw.items.length, 2);
  keys = unmarkFilmSeen('beta', keys);
  saveSeenFilmKeys(storage, keys);
  assert.deepEqual(loadSeenFilmKeys(storage), ['alpha']);
});

test('Seen does not modify Saved or Not Interested', () => {
  const storage = memoryStorage();
  saveFilm(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  saveDismissedFilmKeys(storage, dismissFilm('beta', []));
  markFilmSeen(storage, 'alpha', {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  assert.equal(getSavedFilms(storage).length, 1);
  assert.deepEqual(loadDismissedFilmKeys(storage), ['beta']);
  assert.ok(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(DISMISSED_FILMS_STORAGE_KEY));
});

test('fixture isolation: store module has no fixture imports or seed', () => {
  assert.equal(STORE_SRC.includes('filmDetailMockup'), false);
  assert.equal(STORE_SRC.includes('filmDetailVisual'), false);
  assert.equal(STORE_SRC.includes('2001'), false);
  assert.deepEqual(emptySeenFilmsStore().items, []);
});

test('unseen then seen creates a new timestamp', () => {
  const storage = memoryStorage();
  markFilmSeen(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  markFilmUnseen(storage, 'alpha');
  markFilmSeen(storage, 'alpha', {
    now: fixedNow('2026-07-24T22:00:00.000Z'),
  });
  assert.equal(getSeenFilms(storage)[0].seenAt, '2026-07-24T22:00:00.000Z');
});
