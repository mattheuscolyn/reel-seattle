import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVED_FILMS_STORAGE_KEY,
  SAVED_FILMS_VERSION,
  clearSavedFilms,
  emptySavedFilmsStore,
  getSavedFilms,
  isFilmSaved,
  migrateSavedFilmsPayload,
  normalizeSavedFilmRef,
  normalizeShowtimeFilmKey,
  readSavedFilmsStore,
  saveFilm,
  savedFilmRefsEqual,
  toggleSavedFilm,
  unsaveFilm,
} from '../../v2/stores/savedFilmsStore.js';

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
    _map: map,
  };
}

function fixedNow(iso) {
  return () => new Date(iso);
}

test('empty store returns versioned payload with no items', () => {
  const storage = memoryStorage();
  const read = readSavedFilmsStore(storage);
  assert.equal(read.status, 'empty');
  assert.deepEqual(read.store, emptySavedFilmsStore());
  assert.deepEqual(getSavedFilms(storage), []);
  assert.equal(isFilmSaved(storage, 'alpha'), false);
});

test('normalizeSavedFilmRef accepts string or filmKey alias', () => {
  assert.deepEqual(normalizeSavedFilmRef('  alpha  '), {
    filmId: null,
    showtimeFilmKey: 'alpha',
    sourceFilmId: null,
    source: null,
  });
  assert.equal(normalizeShowtimeFilmKey(''), null);
  assert.deepEqual(
    normalizeSavedFilmRef({
      filmKey: 'beta',
      source: 'amc',
      sourceFilmId: '123',
      filmId: null,
    }),
    {
      filmId: null,
      showtimeFilmKey: 'beta',
      sourceFilmId: '123',
      source: 'amc',
    },
  );
  assert.equal(normalizeSavedFilmRef({ title: 'No Key' }), null);
  assert.equal(normalizeSavedFilmRef(null), null);
});

test('save is idempotent and newest-first', () => {
  const storage = memoryStorage();
  const first = saveFilm(
    storage,
    { showtimeFilmKey: 'alpha', title: 'Alpha' },
    { now: fixedNow('2026-07-24T10:00:00.000Z') },
  );
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.equal(first.store.items.length, 1);
  assert.equal(first.store.version, SAVED_FILMS_VERSION);

  const second = saveFilm(
    storage,
    { showtimeFilmKey: 'beta', title: 'Beta' },
    { now: fixedNow('2026-07-24T11:00:00.000Z') },
  );
  assert.equal(second.ok, true);
  assert.deepEqual(
    second.store.items.map((item) => item.filmRef.showtimeFilmKey),
    ['beta', 'alpha'],
  );

  const again = saveFilm(
    storage,
    { showtimeFilmKey: 'alpha', title: 'Alpha' },
    { now: fixedNow('2026-07-24T12:00:00.000Z') },
  );
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(again.store.items.length, 2);
  const alpha = again.store.items.find(
    (item) => item.filmRef.showtimeFilmKey === 'alpha',
  );
  assert.equal(alpha.savedAt, '2026-07-24T10:00:00.000Z');
  assert.equal(alpha.title, 'Alpha');
  assert.equal(isFilmSaved(storage, 'alpha'), true);
  assert.equal(isFilmSaved(storage, { filmKey: 'beta' }), true);
});

test('unsave and toggle round-trip', () => {
  const storage = memoryStorage();
  saveFilm(storage, 'alpha', { now: fixedNow('2026-07-24T10:00:00.000Z') });
  saveFilm(storage, 'beta', { now: fixedNow('2026-07-24T11:00:00.000Z') });

  const removed = unsaveFilm(storage, 'alpha');
  assert.equal(removed.ok, true);
  assert.equal(removed.changed, true);
  assert.equal(isFilmSaved(storage, 'alpha'), false);
  assert.equal(isFilmSaved(storage, 'beta'), true);

  const noop = unsaveFilm(storage, 'alpha');
  assert.equal(noop.ok, true);
  assert.equal(noop.changed, false);

  const toggledOn = toggleSavedFilm(storage, 'alpha', {
    now: fixedNow('2026-07-24T12:00:00.000Z'),
  });
  assert.equal(toggledOn.ok, true);
  assert.equal(toggledOn.saved, true);
  assert.equal(isFilmSaved(storage, 'alpha'), true);

  const toggledOff = toggleSavedFilm(storage, 'alpha');
  assert.equal(toggledOff.ok, true);
  assert.equal(toggledOff.saved, false);
  assert.equal(isFilmSaved(storage, 'alpha'), false);
});

test('clear empties the store', () => {
  const storage = memoryStorage();
  saveFilm(storage, 'alpha', { now: fixedNow('2026-07-24T10:00:00.000Z') });
  const cleared = clearSavedFilms(storage);
  assert.equal(cleared.ok, true);
  assert.deepEqual(getSavedFilms(storage), []);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
});

test('corrupt JSON and missing version fail safely to empty', () => {
  const badJson = memoryStorage({ [SAVED_FILMS_STORAGE_KEY]: '{not-json' });
  const corrupt = readSavedFilmsStore(badJson);
  assert.equal(corrupt.status, 'corrupt');
  assert.deepEqual(corrupt.store.items, []);

  const noVersion = memoryStorage({
    [SAVED_FILMS_STORAGE_KEY]: JSON.stringify({ items: [{ showtimeFilmKey: 'x' }] }),
  });
  assert.equal(readSavedFilmsStore(noVersion).status, 'corrupt');

  const badItems = memoryStorage({
    [SAVED_FILMS_STORAGE_KEY]: JSON.stringify({ version: 1, items: 'nope' }),
  });
  assert.equal(readSavedFilmsStore(badItems).status, 'corrupt');
});

test('unsupported future version does not destroy data on write', () => {
  const futurePayload = {
    version: 99,
    items: [
      {
        filmRef: { showtimeFilmKey: 'future-film', filmId: null },
        savedAt: '2026-07-24T10:00:00.000Z',
      },
    ],
  };
  const storage = memoryStorage({
    [SAVED_FILMS_STORAGE_KEY]: JSON.stringify(futurePayload),
  });
  const read = readSavedFilmsStore(storage);
  assert.equal(read.status, 'unsupported_version');
  assert.deepEqual(read.store.items, []);

  const saveAttempt = saveFilm(storage, 'alpha', {
    now: fixedNow('2026-07-24T12:00:00.000Z'),
  });
  assert.equal(saveAttempt.ok, false);
  assert.match(String(saveAttempt.error), /unsupported_version/);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), JSON.stringify(futurePayload));
});

test('invalid items are dropped; duplicates collapse keeping earliest savedAt', () => {
  const payload = {
    version: 1,
    items: [
      {
        filmRef: { showtimeFilmKey: 'alpha' },
        savedAt: '2026-07-24T10:00:00.000Z',
        title: 'Older',
      },
      { filmRef: { showtimeFilmKey: 'alpha' }, savedAt: 'not-a-date' },
      {
        filmRef: { showtimeFilmKey: 'alpha' },
        savedAt: '2026-07-24T12:00:00.000Z',
        title: 'Newer',
      },
      { filmRef: {}, savedAt: '2026-07-24T13:00:00.000Z' },
      {
        filmRef: { showtimeFilmKey: 'beta' },
        savedAt: '2026-07-24T11:00:00.000Z',
      },
    ],
  };
  const migrated = migrateSavedFilmsPayload(payload);
  assert.equal(migrated.status, 'ok');
  assert.equal(migrated.store.version, SAVED_FILMS_VERSION);
  assert.deepEqual(
    migrated.store.items.map((item) => [
      item.filmRef.showtimeFilmKey,
      item.savedAt,
      item.title ?? null,
    ]),
    [
      ['beta', '2026-07-24T11:00:00.000Z', null],
      ['alpha', '2026-07-24T10:00:00.000Z', 'Newer'],
    ],
  );
});

test('filmId equality takes precedence when both sides have filmId', () => {
  assert.equal(
    savedFilmRefsEqual(
      { filmId: 'tmdb:1', showtimeFilmKey: 'a' },
      { filmId: 'tmdb:1', showtimeFilmKey: 'b' },
    ),
    true,
  );
  assert.equal(
    savedFilmRefsEqual(
      { filmId: 'tmdb:1', showtimeFilmKey: 'a' },
      { filmId: 'tmdb:2', showtimeFilmKey: 'a' },
    ),
    false,
  );
  assert.equal(
    savedFilmRefsEqual(
      { filmId: null, showtimeFilmKey: 'a' },
      { filmId: 'tmdb:1', showtimeFilmKey: 'a' },
    ),
    true,
  );
  assert.equal(
    savedFilmRefsEqual(
      { filmId: 'f1', showtimeFilmKey: 'a' },
      { filmId: 'f1', showtimeFilmKey: 'b' },
    ),
    false,
  );
});

test('canonical filmId upgrades legacy key and collapses cross-source duplicates', () => {
  const storage = memoryStorage();
  saveFilm(
    storage,
    { showtimeFilmKey: 'amc-sinners', title: 'Sinners' },
    { now: fixedNow('2026-07-24T10:00:00.000Z') },
  );
  saveFilm(
    storage,
    {
      filmId: 'tmdb:1133620',
      showtimeFilmKey: 'amc-sinners',
      title: 'Sinners',
    },
    { now: fixedNow('2026-07-24T11:00:00.000Z') },
  );
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSavedFilms(storage)[0].filmRef.filmId, 'tmdb:1133620');
  assert.equal(
    getSavedFilms(storage)[0].savedAt,
    '2026-07-24T10:00:00.000Z',
  );

  saveFilm(
    storage,
    {
      filmId: 'tmdb:1133620',
      showtimeFilmKey: 'siff-sinners',
      title: 'Sinners',
    },
    { now: fixedNow('2026-07-24T12:00:00.000Z') },
  );
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(
    isFilmSaved(storage, {
      filmId: 'tmdb:1133620',
      showtimeFilmKey: 'siff-sinners',
    }),
    true,
  );
  assert.equal(isFilmSaved(storage, 'amc-sinners'), true);
  const aliases = getSavedFilms(storage)[0].filmRef.aliasKeys ?? [];
  assert.ok(
    aliases.includes('amc-sinners') ||
      getSavedFilms(storage)[0].filmRef.showtimeFilmKey === 'amc-sinners',
  );
});

test('variants with different showtimeFilmKeys stay distinct', () => {
  const storage = memoryStorage();
  saveFilm(
    storage,
    {
      showtimeFilmKey: 'film:parent:imax',
      source: 'amc',
      sourceFilmId: '1',
    },
    { now: fixedNow('2026-07-24T10:00:00.000Z') },
  );
  saveFilm(
    storage,
    {
      showtimeFilmKey: 'film:parent:digital',
      source: 'amc',
      sourceFilmId: '1',
    },
    { now: fixedNow('2026-07-24T11:00:00.000Z') },
  );
  assert.equal(getSavedFilms(storage).length, 2);
  assert.equal(isFilmSaved(storage, 'film:parent:imax'), true);
  assert.equal(isFilmSaved(storage, 'film:parent'), false);
});

test('save recovers from corrupt payload without requiring UI fixtures', () => {
  const storage = memoryStorage({
    [SAVED_FILMS_STORAGE_KEY]: '{broken',
  });
  const result = saveFilm(storage, 'alpha', {
    now: fixedNow('2026-07-24T10:00:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.store.items.length, 1);
  assert.equal(isFilmSaved(storage, 'alpha'), true);
});

test('storage write failure returns ok:false without throwing', () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
  const result = saveFilm(storage, 'alpha', {
    now: fixedNow('2026-07-24T10:00:00.000Z'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'quota_exceeded');
  assert.equal(result.changed, false);
});

test('null storage is unavailable', () => {
  assert.equal(readSavedFilmsStore(null).status, 'storage_unavailable');
  const save = saveFilm(null, 'alpha', {
    now: fixedNow('2026-07-24T10:00:00.000Z'),
  });
  assert.equal(save.ok, false);
  assert.equal(save.error, 'storage_unavailable');
});

test('persisted shape matches versioned contract', () => {
  const storage = memoryStorage();
  saveFilm(
    storage,
    {
      showtimeFilmKey: 'alpha',
      source: 'siff',
      sourceFilmId: 'sf-1',
      title: 'Alpha',
      posterUrl: 'https://example.com/a.jpg',
    },
    { now: fixedNow('2026-07-24T10:00:00.000Z') },
  );
  const raw = JSON.parse(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.equal(raw.version, SAVED_FILMS_VERSION);
  assert.equal(raw.items.length, 1);
  assert.deepEqual(raw.items[0].filmRef, {
    filmId: null,
    showtimeFilmKey: 'alpha',
    sourceFilmId: 'sf-1',
    source: 'siff',
  });
  assert.equal(raw.items[0].savedAt, '2026-07-24T10:00:00.000Z');
  assert.equal(raw.items[0].title, 'Alpha');
  assert.equal(raw.items[0].posterUrl, 'https://example.com/a.jpg');
});
