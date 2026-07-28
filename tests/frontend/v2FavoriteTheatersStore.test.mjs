import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  FAVORITE_THEATERS_VERSION,
  clearFavoriteTheaters,
  emptyFavoriteTheatersStore,
  favoriteTheater,
  favoriteTheaterRefsEqual,
  getFavoriteTheaters,
  isTheaterFavorite,
  migrateFavoriteTheatersPayload,
  normalizeFavoriteTheaterRef,
  normalizeTheaterId,
  readFavoriteTheatersStore,
  toggleFavoriteTheater,
  unfavoriteTheater,
} from '../../v2/stores/favoriteTheatersStore.js';
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
import {
  NOT_INTERESTED_FILMS_STORAGE_KEY,
  getNotInterestedFilms,
  markFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const STORE_SRC = readFileSync(
  join(ROOT, 'v2/stores/favoriteTheatersStore.js'),
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
  const read = readFavoriteTheatersStore(storage);
  assert.equal(read.status, 'empty');
  assert.deepEqual(read.store, emptyFavoriteTheatersStore());
  assert.deepEqual(getFavoriteTheaters(storage), []);
  assert.equal(isTheaterFavorite(storage, 'the-beacon'), false);
});

test('normalizeFavoriteTheaterRef requires theaterId; rejects name/auditorium alone', () => {
  assert.deepEqual(normalizeFavoriteTheaterRef('  the-beacon  '), {
    theaterId: 'the-beacon',
    sourceTheaterId: null,
    source: null,
  });
  assert.equal(normalizeTheaterId(''), null);
  assert.deepEqual(
    normalizeFavoriteTheaterRef({
      id: 'siff-cinema-uptown',
      source: 'siff',
      source_external_id: 'uptown',
      name: 'SIFF Cinema Uptown',
    }),
    {
      theaterId: 'siff-cinema-uptown',
      sourceTheaterId: 'uptown',
      source: 'siff',
    },
  );
  assert.equal(normalizeFavoriteTheaterRef({ name: 'The Beacon' }), null);
  assert.equal(
    normalizeFavoriteTheaterRef({ auditoriumId: 'beacon-screen-1' }),
    null,
  );
  assert.equal(normalizeFavoriteTheaterRef(null), null);
  assert.equal(normalizeFavoriteTheaterRef('   '), null);
});

test('favorite / isFavorite / unfavorite / toggle / clear', () => {
  const storage = memoryStorage();
  const first = favoriteTheater(
    storage,
    { theaterId: 'the-beacon', name: 'The Beacon', neighborhood: 'Capitol Hill' },
    { now: fixedNow('2026-07-24T20:00:00.000Z') },
  );
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(first.store.version, FAVORITE_THEATERS_VERSION);
  assert.equal(isTheaterFavorite(storage, 'the-beacon'), true);
  assert.equal(getFavoriteTheaters(storage)[0].name, 'The Beacon');
  assert.equal(getFavoriteTheaters(storage)[0].neighborhood, 'Capitol Hill');

  const again = favoriteTheater(storage, 'the-beacon', {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(
    getFavoriteTheaters(storage)[0].favoritedAt,
    '2026-07-24T20:00:00.000Z',
  );
  assert.equal(getFavoriteTheaters(storage).length, 1);

  favoriteTheater(storage, 'northwest-film-forum', {
    now: fixedNow('2026-07-24T22:00:00.000Z'),
  });
  assert.deepEqual(
    getFavoriteTheaters(storage).map((item) => item.theaterRef.theaterId),
    ['northwest-film-forum', 'the-beacon'],
  );

  const toggledOff = toggleFavoriteTheater(storage, 'northwest-film-forum');
  assert.equal(toggledOff.favorite, false);
  assert.equal(isTheaterFavorite(storage, 'northwest-film-forum'), false);

  const toggledOn = toggleFavoriteTheater(storage, 'northwest-film-forum', {
    now: fixedNow('2026-07-24T23:00:00.000Z'),
  });
  assert.equal(toggledOn.favorite, true);

  const removed = unfavoriteTheater(storage, 'northwest-film-forum');
  assert.equal(removed.ok, true);
  assert.equal(removed.changed, true);

  const noop = unfavoriteTheater(storage, 'northwest-film-forum');
  assert.equal(noop.ok, true);
  assert.equal(noop.changed, false);

  const cleared = clearFavoriteTheaters(storage);
  assert.equal(cleared.ok, true);
  assert.deepEqual(getFavoriteTheaters(storage), []);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
});

test('SIFF locations remain distinct; name alone is not identity', () => {
  const storage = memoryStorage();
  favoriteTheater(storage, 'siff-cinema-downtown', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  favoriteTheater(storage, 'siff-cinema-uptown', {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  favoriteTheater(storage, 'siff-film-center', {
    now: fixedNow('2026-07-24T22:00:00.000Z'),
  });
  assert.equal(getFavoriteTheaters(storage).length, 3);
  assert.equal(isTheaterFavorite(storage, 'siff-cinema-downtown'), true);
  assert.equal(isTheaterFavorite(storage, 'siff-cinema-uptown'), true);
  assert.equal(isTheaterFavorite(storage, 'siff-film-center'), true);
  assert.equal(
    favoriteTheaterRefsEqual('siff-cinema-downtown', 'siff-cinema-uptown'),
    false,
  );

  const byName = favoriteTheater(storage, { name: 'SIFF Cinema Uptown' });
  assert.equal(byName.ok, false);
  assert.equal(byName.error, 'invalid_ref');
  assert.equal(getFavoriteTheaters(storage).length, 3);
});

test('unfavorite then favorite creates a new timestamp; caller objects not mutated', () => {
  const storage = memoryStorage();
  const input = {
    theaterId: 'central-cinema',
    source: 'central_cinema',
    name: 'Central Cinema',
  };
  const snapshot = structuredClone(input);
  favoriteTheater(storage, input, {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  unfavoriteTheater(storage, 'central-cinema');
  favoriteTheater(storage, input, {
    now: fixedNow('2026-07-24T22:00:00.000Z'),
  });
  assert.equal(
    getFavoriteTheaters(storage)[0].favoritedAt,
    '2026-07-24T22:00:00.000Z',
  );
  assert.deepEqual(input, snapshot);
});

test('unsupported future version is not overwritten', () => {
  const future = {
    version: 9,
    items: [{ theaterRef: { theaterId: 'x' }, favoritedAt: '2026-01-01T00:00:00.000Z' }],
  };
  const storage = memoryStorage({
    [FAVORITE_THEATERS_STORAGE_KEY]: JSON.stringify(future),
  });
  const attempt = favoriteTheater(storage, 'the-beacon', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  assert.equal(attempt.ok, false);
  assert.match(String(attempt.error), /unsupported_version/);
  assert.equal(
    storage.getItem(FAVORITE_THEATERS_STORAGE_KEY),
    JSON.stringify(future),
  );
});

test('corrupt JSON and write failures are controlled', () => {
  const bad = memoryStorage({ [FAVORITE_THEATERS_STORAGE_KEY]: '{nope' });
  assert.equal(readFavoriteTheatersStore(bad).status, 'corrupt');
  assert.deepEqual(getFavoriteTheaters(bad), []);

  const noVersion = memoryStorage({
    [FAVORITE_THEATERS_STORAGE_KEY]: JSON.stringify({
      items: [{ theaterId: 'the-beacon' }],
    }),
  });
  assert.equal(readFavoriteTheatersStore(noVersion).status, 'corrupt');

  const failing = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
  const result = favoriteTheater(failing, 'the-beacon', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'quota_exceeded');
});

test('invalid items dropped; duplicates collapse keeping newer favoritedAt', () => {
  const payload = {
    version: 1,
    items: [
      {
        theaterRef: { theaterId: 'the-beacon' },
        favoritedAt: '2026-07-24T10:00:00.000Z',
        name: 'Older',
      },
      {
        theaterRef: { theaterId: 'the-beacon' },
        favoritedAt: 'not-a-date',
      },
      {
        theaterRef: { theaterId: 'the-beacon' },
        favoritedAt: '2026-07-24T12:00:00.000Z',
        name: 'Newer',
      },
      { theaterRef: {}, favoritedAt: '2026-07-24T13:00:00.000Z' },
      {
        theaterRef: { theaterId: 'central-cinema' },
        favoritedAt: '2026-07-24T11:00:00.000Z',
      },
    ],
  };
  const migrated = migrateFavoriteTheatersPayload(payload);
  assert.equal(migrated.status, 'ok');
  assert.deepEqual(
    migrated.store.items.map((item) => [
      item.theaterRef.theaterId,
      item.favoritedAt,
      item.name ?? null,
    ]),
    [
      ['the-beacon', '2026-07-24T12:00:00.000Z', 'Newer'],
      ['central-cinema', '2026-07-24T11:00:00.000Z', null],
    ],
  );
});

test('favoriting does not alter Saved, Seen, or Not Interested', () => {
  const storage = memoryStorage();
  saveFilm(storage, 'alpha', {
    now: fixedNow('2026-07-24T20:00:00.000Z'),
  });
  markFilmSeen(storage, 'beta', {
    now: fixedNow('2026-07-24T20:30:00.000Z'),
  });
  markFilmNotInterested(storage, 'gamma', {
    now: fixedNow('2026-07-24T20:45:00.000Z'),
  });
  favoriteTheater(storage, 'the-beacon', {
    now: fixedNow('2026-07-24T21:00:00.000Z'),
  });
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.equal(getNotInterestedFilms(storage).length, 1);
  assert.equal(getFavoriteTheaters(storage).length, 1);
  assert.ok(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(SEEN_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY));
});

test('fixture isolation: store module has no fixture imports or seed', () => {
  assert.equal(STORE_SRC.includes('filmDetailMockup'), false);
  assert.equal(STORE_SRC.includes('filmDetailVisual'), false);
  assert.equal(STORE_SRC.includes('Profile'), false);
  assert.equal(STORE_SRC.includes('2001'), false);
  assert.deepEqual(emptyFavoriteTheatersStore().items, []);
  assert.match(STORE_SRC, /first persisted format/i);
});
