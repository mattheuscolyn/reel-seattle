import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVED_FILMS_STORAGE_KEY,
  SAVED_FILMS_VERSION,
  getSavedFilms,
  isFilmSaved,
  saveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  getSeenFilms,
  isFilmSeen,
  markFilmSeen,
} from '../../v2/stores/seenFilmsStore.js';
import {
  getNotInterestedFilms,
  isFilmNotInterested,
  markFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';
import {
  auditUserFilmStores,
  liveFilmRefsFromHomeData,
  reconcileUserFilmStores,
} from '../../v2/stores/reconcileUserFilmStores.js';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';

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

test('filmRefFromHomeFilm prefers canonical tmdb filmId', () => {
  const ref = filmRefFromHomeFilm({
    filmKey: 'sinners',
    filmId: 'tmdb:1133620',
    sourceFilmId: 'amc-sinners',
    source: 'amc',
    title: 'Sinners',
  });
  assert.equal(ref.filmId, 'tmdb:1133620');
  assert.equal(ref.showtimeFilmKey, 'sinners');
  assert.equal(
    filmRefFromHomeFilm({ filmKey: 'x', filmId: '123' })?.filmId,
    null,
  );
});

test('reconcile upgrades legacy Saved/Seen/NI keys from HomeData filmId', () => {
  const storage = memoryStorage();
  saveFilm(storage, 'sinners', {
    now: fixedNow('2026-07-24T10:00:00.000Z'),
  });
  markFilmSeen(storage, 'sinners', {
    now: fixedNow('2026-07-24T10:00:00.000Z'),
  });
  markFilmNotInterested(storage, 'indie-film', {
    now: fixedNow('2026-07-24T10:00:00.000Z'),
  });

  const homeData = {
    films: [
      {
        filmKey: 'sinners',
        filmId: 'tmdb:1133620',
        title: 'Sinners',
        source: 'amc',
        sourceFilmId: 'amc-1',
      },
      {
        filmKey: 'indie-film',
        filmId: null,
        title: 'Indie Film',
      },
    ],
  };

  const refs = liveFilmRefsFromHomeData(homeData);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].filmId, 'tmdb:1133620');

  const result = reconcileUserFilmStores(storage, homeData);
  assert.equal(result.upgraded >= 1, true);
  assert.equal(getSavedFilms(storage)[0].filmRef.filmId, 'tmdb:1133620');
  assert.equal(getSeenFilms(storage)[0].filmRef.filmId, 'tmdb:1133620');
  assert.equal(getNotInterestedFilms(storage)[0].filmRef.filmId, null);

  assert.equal(
    isFilmSaved(storage, {
      filmId: 'tmdb:1133620',
      showtimeFilmKey: 'siff-sinners',
    }),
    true,
  );
  assert.equal(
    isFilmSeen(storage, {
      filmId: 'tmdb:1133620',
      showtimeFilmKey: 'other-key',
    }),
    true,
  );
  assert.equal(isFilmNotInterested(storage, 'indie-film'), true);

  const again = reconcileUserFilmStores(storage, homeData);
  assert.equal(again.upgraded, 0);

  const audit = auditUserFilmStores(storage);
  assert.equal(audit.saved.canonical, 1);
  assert.equal(audit.saved.fallback, 0);
  assert.equal(JSON.parse(storage.getItem(SAVED_FILMS_STORAGE_KEY)).version, SAVED_FILMS_VERSION);
});

test('migration does not invent cross-store transitions', () => {
  const storage = memoryStorage();
  saveFilm(storage, {
    filmId: 'tmdb:1',
    showtimeFilmKey: 'a',
  }, { now: fixedNow('2026-07-24T10:00:00.000Z') });
  markFilmSeen(storage, {
    filmId: 'tmdb:1',
    showtimeFilmKey: 'a',
  }, { now: fixedNow('2026-07-24T10:00:00.000Z') });
  markFilmNotInterested(storage, {
    filmId: 'tmdb:1',
    showtimeFilmKey: 'a',
  }, { now: fixedNow('2026-07-24T10:00:00.000Z') });

  reconcileUserFilmStores(storage, {
    films: [{ filmKey: 'a', filmId: 'tmdb:1', title: 'A' }],
  });

  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.equal(getNotInterestedFilms(storage).length, 1);
});
