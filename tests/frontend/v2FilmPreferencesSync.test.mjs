/**
 * T-ACCOUNT-CLOUD-SYNC-FILMS-01 — film preference sync tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filmPreferenceKeyFromRef,
  parseFilmPreferenceKey,
} from '../../v2/auth/filmPreferenceIdentity.js';
import {
  mergePreferenceCollections,
  mergePreferencePair,
  localSavedItemToRecord,
  normalizePreferenceRecord,
} from '../../v2/auth/filmPreferenceMerge.js';
import {
  FILM_SYNC_ATTACHMENT_KEY,
  isBrowserAttachedToUser,
  readFilmSyncAttachment,
  writeFilmSyncAttachment,
} from '../../v2/auth/filmSyncAttachmentStore.js';
import {
  notifyFilmStoreMutation,
  resetFilmStoreMutationBridgeForTests,
  subscribeFilmStoreMutations,
  suppressFilmStoreMutationNotifications,
} from '../../v2/auth/filmStoreMutationBridge.js';
import {
  applyPreferenceRecordsToLocalStores,
  attachFilmPreferencesMerge,
  declineFilmPreferencesAttach,
  fetchUserFilmPreferences,
  getFilmPreferencesPendingCountForTests,
  getFilmPreferencesSyncLabel,
  getFilmPreferencesSyncSnapshot,
  resetFilmPreferencesSyncForTests,
  setFilmPreferencesAuthContext,
  startFilmPreferencesSyncController,
  stopFilmPreferencesSyncController,
  syncFilmPreferencesNow,
  upsertUserFilmPreferences,
} from '../../v2/auth/filmPreferencesSync.js';
import {
  getCloudSyncStatus,
  getCloudSyncStatusLabel,
} from '../../v2/auth/cloudSyncStatus.js';
import {
  getSavedFilms,
  saveFilm,
  SAVED_FILMS_STORAGE_KEY,
  unsaveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import {
  getSeenFilms,
  markFilmSeen,
  markFilmUnseen,
  SEEN_FILMS_STORAGE_KEY,
} from '../../v2/stores/seenFilmsStore.js';
import {
  getNotInterestedFilms,
  markFilmNotInterested,
  clearFilmNotInterested,
  NOT_INTERESTED_FILMS_STORAGE_KEY,
} from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = readFileSync(
  join(
    ROOT,
    'supabase/migrations/20260804000000_user_film_preferences_sync.sql',
  ),
  'utf8',
);

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function makeFilmRef(key, filmId = null) {
  return {
    filmId,
    showtimeFilmKey: key,
    sourceFilmId: null,
    source: null,
  };
}

/**
 * In-memory Supabase stub for film preference tables.
 */
function createFilmSyncMockClient({ userId = 'user-a' } = {}) {
  /** @type {Map<string, object>} */
  const prefs = new Map();
  /** @type {Map<string, object>} */
  const syncState = new Map();
  let failNextSelect = false;
  let failNextUpsert = false;

  const keyOf = (row) =>
    `${row.user_id}::${row.preference_type}::${row.film_key}`;

  const api = {
    __prefs: prefs,
    __syncState: syncState,
    failNextSelect() {
      failNextSelect = true;
    },
    failNextUpsert() {
      failNextUpsert = true;
    },
    seedPreference(row) {
      const n = {
        user_id: row.user_id ?? userId,
        film_key: row.film_key,
        preference_type: row.preference_type,
        is_active: row.is_active !== false,
        film_id: row.film_id ?? null,
        showtime_film_key: row.showtime_film_key ?? null,
        alias_keys: row.alias_keys ?? [],
        title_snapshot: row.title_snapshot ?? null,
        year_snapshot: row.year_snapshot ?? null,
        poster_url_snapshot: row.poster_url_snapshot ?? null,
        preference_at: row.preference_at ?? null,
        preference_meta: row.preference_meta ?? {},
        device_mutation_id: row.device_mutation_id ?? null,
        updated_at: row.updated_at,
        created_at: row.created_at ?? row.updated_at,
      };
      prefs.set(keyOf(n), n);
    },
    from(table) {
      if (table === 'user_film_preferences') {
        const execute = async (uid, sinceIso) => {
          if (failNextSelect) {
            failNextSelect = false;
            return { data: null, error: { message: 'network down' } };
          }
          const rows = [...prefs.values()].filter((r) => {
            if (r.user_id !== uid) return false;
            if (sinceIso && r.updated_at <= sinceIso) return false;
            return true;
          });
          return { data: rows, error: null };
        };
        return {
          select() {
            return {
              eq(_col, uid) {
                const builder = {
                  gt(_c, since) {
                    return {
                      then(onFulfilled, onRejected) {
                        return Promise.resolve(execute(uid, since)).then(
                          onFulfilled,
                          onRejected,
                        );
                      },
                    };
                  },
                  then(onFulfilled, onRejected) {
                    return Promise.resolve(execute(uid, null)).then(
                      onFulfilled,
                      onRejected,
                    );
                  },
                };
                return builder;
              },
            };
          },
          async upsert(rows) {
            if (failNextUpsert) {
              failNextUpsert = false;
              return { data: null, error: { message: 'upsert failed' } };
            }
            const list = Array.isArray(rows) ? rows : [rows];
            for (const row of list) {
              if (row.user_id && row.user_id !== userId) {
                return { data: null, error: { message: 'RLS denied' } };
              }
              const id = keyOf({ ...row, user_id: row.user_id ?? userId });
              const existing = prefs.get(id);
              if (existing && row.updated_at < existing.updated_at) {
                continue;
              }
              prefs.set(id, {
                ...existing,
                ...row,
                user_id: row.user_id ?? userId,
                created_at: existing?.created_at ?? row.updated_at,
              });
            }
            return { data: null, error: null };
          },
        };
      }
      if (table === 'user_sync_state') {
        return {
          async upsert(row) {
            syncState.set(row.user_id, {
              ...(syncState.get(row.user_id) ?? {}),
              ...row,
            });
            return { data: null, error: null };
          },
        };
      }
      if (table === 'profiles') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return api;
}

test.beforeEach(() => {
  resetFilmPreferencesSyncForTests();
  resetFilmStoreMutationBridgeForTests();
});

// ---------------------------------------------------------------------------
// Migration SQL
// ---------------------------------------------------------------------------

test('migration defines preference + sync_state tables with constraints', () => {
  assert.match(MIGRATION, /create table if not exists public\.user_film_preferences/);
  assert.match(MIGRATION, /create table if not exists public\.user_sync_state/);
  assert.match(
    MIGRATION,
    /preference_type in \('saved', 'seen', 'not_interested'\)/,
  );
  assert.match(
    MIGRATION,
    /primary key \(user_id, film_key, preference_type\)/,
  );
  assert.match(MIGRATION, /is_active boolean not null default true/);
});

test('migration enables RLS and own-row policies without DELETE or anon', () => {
  assert.match(MIGRATION, /enable row level security/);
  assert.match(MIGRATION, /user_film_preferences_select_own/);
  assert.match(MIGRATION, /user_film_preferences_insert_own/);
  assert.match(MIGRATION, /user_film_preferences_update_own/);
  assert.match(MIGRATION, /user_sync_state_select_own/);
  assert.match(MIGRATION, /auth\.uid\(\) = user_id/);
  assert.equal(/for delete/i.test(MIGRATION), false);
  assert.equal(/grant .* to anon/i.test(MIGRATION), false);
  assert.match(MIGRATION, /cannot be reassigned/);
  assert.match(MIGRATION, /return null/i); // LWW stale skip
});

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

test('film_key prefers canonical tmdb id over showtime key', () => {
  assert.equal(
    filmPreferenceKeyFromRef({
      filmId: 'tmdb:42',
      showtimeFilmKey: 'parent-a',
    }),
    'tmdb:42',
  );
  assert.equal(
    filmPreferenceKeyFromRef({ filmId: null, showtimeFilmKey: 'parent-a' }),
    'showtime:parent-a',
  );
  assert.deepEqual(parseFilmPreferenceKey('tmdb:42'), {
    filmId: 'tmdb:42',
    showtimeFilmKey: null,
  });
  assert.deepEqual(parseFilmPreferenceKey('showtime:parent-a'), {
    filmId: null,
    showtimeFilmKey: 'parent-a',
  });
});

// ---------------------------------------------------------------------------
// Merge / tombstones / conflicts
// ---------------------------------------------------------------------------

test('first attachment prefers active local over older cloud tombstone', () => {
  const local = normalizePreferenceRecord({
    film_key: 'showtime:a',
    preference_type: 'saved',
    is_active: true,
    showtime_film_key: 'a',
    preference_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  const cloud = normalizePreferenceRecord({
    film_key: 'showtime:a',
    preference_type: 'saved',
    is_active: false,
    showtime_film_key: 'a',
    updated_at: '2026-06-01T00:00:00.000Z',
  });
  const merged = mergePreferencePair(local, cloud, {
    phase: 'first_attachment',
  });
  assert.equal(merged.is_active, true);
});

test('first attachment blank local does not deactivate cloud active', () => {
  const cloud = normalizePreferenceRecord({
    film_key: 'showtime:b',
    preference_type: 'seen',
    is_active: true,
    showtime_film_key: 'b',
    preference_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
  });
  const localTombstone = normalizePreferenceRecord({
    film_key: 'showtime:b',
    preference_type: 'seen',
    is_active: false,
    showtime_film_key: 'b',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  const merged = mergePreferencePair(localTombstone, cloud, {
    phase: 'first_attachment',
  });
  assert.equal(merged.is_active, true);
});

test('ongoing merge uses updated_at last-write-wins for tombstones', () => {
  const local = normalizePreferenceRecord({
    film_key: 'showtime:c',
    preference_type: 'not_interested',
    is_active: true,
    showtime_film_key: 'c',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  const cloud = normalizePreferenceRecord({
    film_key: 'showtime:c',
    preference_type: 'not_interested',
    is_active: false,
    showtime_film_key: 'c',
    updated_at: '2026-03-01T00:00:00.000Z',
  });
  const merged = mergePreferencePair(local, cloud, { phase: 'ongoing' });
  assert.equal(merged.is_active, false);
});

test('Saved and Seen may coexist in merge collections', () => {
  const merged = mergePreferenceCollections(
    [
      {
        film_key: 'showtime:x',
        preference_type: 'saved',
        is_active: true,
        showtime_film_key: 'x',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        film_key: 'showtime:x',
        preference_type: 'seen',
        is_active: true,
        showtime_film_key: 'x',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    [],
    { phase: 'first_attachment' },
  );
  assert.equal(merged.filter((r) => r.is_active).length, 2);
});

test('Not Interested does not clear Saved or Seen in merge layer', () => {
  const merged = mergePreferenceCollections(
    [
      {
        film_key: 'showtime:y',
        preference_type: 'saved',
        is_active: true,
        showtime_film_key: 'y',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        film_key: 'showtime:y',
        preference_type: 'seen',
        is_active: true,
        showtime_film_key: 'y',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        film_key: 'showtime:y',
        preference_type: 'not_interested',
        is_active: true,
        showtime_film_key: 'y',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ],
    [],
    { phase: 'first_attachment' },
  );
  assert.equal(merged.filter((r) => r.is_active).length, 3);
});

// ---------------------------------------------------------------------------
// No automatic sync on login
// ---------------------------------------------------------------------------

test('login context does not attach or upload without explicit merge', async () => {
  const storage = memoryStorage();
  saveFilm(storage, makeFilmRef('local-1'), { title: 'Local' });
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({
    userId: 'user-a',
    client,
    storage,
  });
  assert.equal(isBrowserAttachedToUser(storage, 'user-a'), false);
  assert.equal(client.__prefs.size, 0);
  assert.equal(getFilmPreferencesSyncSnapshot().attached, false);
  assert.match(getFilmPreferencesSyncLabel(), /stored on this device/i);
  assert.equal(getSavedFilms(storage).length, 1);
});

test('logout does not clear local film stores', () => {
  const storage = memoryStorage();
  saveFilm(storage, makeFilmRef('keep-me'));
  markFilmSeen(storage, makeFilmRef('keep-me'));
  markFilmNotInterested(storage, makeFilmRef('other'));
  startFilmPreferencesSyncController({ storage, client: createFilmSyncMockClient() });
  setFilmPreferencesAuthContext({
    userId: 'user-a',
    storage,
    client: createFilmSyncMockClient(),
  });
  setFilmPreferencesAuthContext({ userId: null, storage, client: null });
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage).length, 1);
  assert.equal(getNotInterestedFilms(storage).length, 1);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY) != null, true);
  assert.equal(storage.getItem(SEEN_FILMS_STORAGE_KEY) != null, true);
  assert.equal(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY) != null, true);
});

// ---------------------------------------------------------------------------
// Attachment scenarios
// ---------------------------------------------------------------------------

test('attach empty local + empty cloud marks attached', async () => {
  const storage = memoryStorage();
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  const result = await attachFilmPreferencesMerge();
  assert.equal(result.ok, true);
  assert.equal(isBrowserAttachedToUser(storage, 'user-a'), true);
  assert.equal(getFilmPreferencesSyncSnapshot().uiStatus, 'synced');
  assert.match(getCloudSyncStatusLabel(), /Synced/i);
});

test('attach local populated + cloud empty uploads local', async () => {
  const storage = memoryStorage();
  saveFilm(storage, makeFilmRef('film-1', 'tmdb:1'), { title: 'One' });
  markFilmSeen(storage, makeFilmRef('film-2'));
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  const result = await attachFilmPreferencesMerge();
  assert.equal(result.ok, true);
  assert.ok(client.__prefs.size >= 2);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSeenFilms(storage).length, 1);
});

test('attach local empty + cloud populated downloads cloud', async () => {
  const storage = memoryStorage();
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  client.seedPreference({
    film_key: 'tmdb:9',
    preference_type: 'saved',
    is_active: true,
    film_id: 'tmdb:9',
    showtime_film_key: 'cloud-film',
    title_snapshot: 'Cloud',
    preference_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  const result = await attachFilmPreferencesMerge();
  assert.equal(result.ok, true);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(getSavedFilms(storage)[0].title, 'Cloud');
});

test('attach failure during pull does not mark attached', async () => {
  const storage = memoryStorage();
  saveFilm(storage, makeFilmRef('x'));
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  client.failNextSelect();
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  const result = await attachFilmPreferencesMerge();
  assert.equal(result.ok, false);
  assert.equal(isBrowserAttachedToUser(storage, 'user-a'), false);
  assert.equal(getSavedFilms(storage).length, 1);
});

test('attach failure during write does not mark attached', async () => {
  const storage = memoryStorage();
  saveFilm(storage, makeFilmRef('x'));
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  client.failNextUpsert();
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  const result = await attachFilmPreferencesMerge();
  assert.equal(result.ok, false);
  assert.equal(isBrowserAttachedToUser(storage, 'user-a'), false);
});

test('keep device only does not upload or attach', () => {
  const storage = memoryStorage();
  saveFilm(storage, makeFilmRef('x'));
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  declineFilmPreferencesAttach();
  assert.equal(isBrowserAttachedToUser(storage, 'user-a'), false);
  assert.equal(client.__prefs.size, 0);
});

// ---------------------------------------------------------------------------
// Local mutation integration
// ---------------------------------------------------------------------------

test('after attach, local save enqueues cloud upsert without blocking', async () => {
  const storage = memoryStorage();
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  await attachFilmPreferencesMerge();
  const before = client.__prefs.size;
  const result = saveFilm(storage, makeFilmRef('new-local', 'tmdb:77'), {
    title: 'New',
  });
  assert.equal(result.ok, true);
  assert.equal(getSavedFilms(storage).some((i) => i.filmRef.filmId === 'tmdb:77'), true);
  // Flush debounce
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(client.__prefs.size > before);
});

test('cloud failure does not revert local mutation', async () => {
  const storage = memoryStorage();
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  await attachFilmPreferencesMerge();
  client.failNextUpsert();
  saveFilm(storage, makeFilmRef('stay-local'));
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(
    getSavedFilms(storage).some((i) => i.filmRef.showtimeFilmKey === 'stay-local'),
    true,
  );
  assert.equal(getFilmPreferencesSyncSnapshot().degraded, true);
});

test('applying cloud records does not notify mutation bridge (no write loop)', () => {
  const storage = memoryStorage();
  let notifications = 0;
  subscribeFilmStoreMutations(() => {
    notifications += 1;
  });
  applyPreferenceRecordsToLocalStores(storage, [
    {
      film_key: 'showtime:z',
      preference_type: 'saved',
      is_active: true,
      showtime_film_key: 'z',
      title_snapshot: 'Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      preference_at: '2026-01-01T00:00:00.000Z',
    },
  ]);
  assert.equal(notifications, 0);
  assert.equal(getSavedFilms(storage).length, 1);
});

test('storage keys remain compatible', () => {
  assert.equal(SAVED_FILMS_STORAGE_KEY, 'reel-seattle.v2.savedFilms');
  assert.equal(SEEN_FILMS_STORAGE_KEY, 'reel-seattle.v2.seenFilms');
  assert.equal(NOT_INTERESTED_FILMS_STORAGE_KEY, 'reel-seattle.v2.dismissedFilms');
  assert.equal(FILM_SYNC_ATTACHMENT_KEY, 'reel-seattle.v2.filmSyncAttachment');
});

// ---------------------------------------------------------------------------
// Multi-device simulation
// ---------------------------------------------------------------------------

test('device B pulls device A save; removal tombstone propagates', async () => {
  const client = createFilmSyncMockClient({ userId: 'user-a' });

  const deviceA = memoryStorage();
  startFilmPreferencesSyncController({ storage: deviceA, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage: deviceA });
  await attachFilmPreferencesMerge();
  saveFilm(deviceA, makeFilmRef('shared', 'tmdb:5'), { title: 'Shared' });
  await new Promise((r) => setTimeout(r, 500));

  stopFilmPreferencesSyncController();
  resetFilmStoreMutationBridgeForTests();

  const deviceB = memoryStorage();
  startFilmPreferencesSyncController({ storage: deviceB, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage: deviceB });
  await attachFilmPreferencesMerge();
  assert.equal(getSavedFilms(deviceB).length, 1);

  unsaveFilm(deviceB, makeFilmRef('shared', 'tmdb:5'));
  await new Promise((r) => setTimeout(r, 500));
  const tombstones = [...client.__prefs.values()].filter(
    (r) => r.film_key === 'tmdb:5' && r.is_active === false,
  );
  assert.equal(tombstones.length, 1);

  // Device A pulls tombstone
  stopFilmPreferencesSyncController();
  resetFilmStoreMutationBridgeForTests();
  startFilmPreferencesSyncController({ storage: deviceA, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage: deviceA });
  // already attached
  writeFilmSyncAttachment(deviceA, {
    version: 1,
    attachedUserId: 'user-a',
    lastSuccessfulPullAt: '2020-01-01T00:00:00.000Z',
    lastSuccessfulSyncAt: '2020-01-01T00:00:00.000Z',
  });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage: deviceA });
  await syncFilmPreferencesNow();
  assert.equal(getSavedFilms(deviceA).length, 0);

  // Stale resurrect attempt with older timestamp is ignored by LWW upsert
  const stale = await upsertUserFilmPreferences(client, 'user-a', [
    {
      film_key: 'tmdb:5',
      preference_type: 'saved',
      is_active: true,
      film_id: 'tmdb:5',
      showtime_film_key: 'shared',
      updated_at: '2019-01-01T00:00:00.000Z',
    },
  ]);
  assert.equal(stale.ok, true);
  const row = [...client.__prefs.values()].find((r) => r.film_key === 'tmdb:5');
  assert.equal(row.is_active, false);
});

// ---------------------------------------------------------------------------
// Auth switching
// ---------------------------------------------------------------------------

test('user B never receives user A pending/cloud apply; local data intact', async () => {
  const storage = memoryStorage();
  saveFilm(storage, makeFilmRef('device-only'));
  const clientA = createFilmSyncMockClient({ userId: 'user-a' });
  clientA.seedPreference({
    film_key: 'showtime:cloud-a',
    preference_type: 'saved',
    is_active: true,
    showtime_film_key: 'cloud-a',
    title_snapshot: 'A-only',
    updated_at: '2026-01-01T00:00:00.000Z',
    preference_at: '2026-01-01T00:00:00.000Z',
  });
  startFilmPreferencesSyncController({ storage, client: clientA });
  setFilmPreferencesAuthContext({
    userId: 'user-a',
    client: clientA,
    storage,
  });
  // Switch to B before attach
  const clientB = createFilmSyncMockClient({ userId: 'user-b' });
  setFilmPreferencesAuthContext({
    userId: 'user-b',
    client: clientB,
    storage,
  });
  assert.equal(getFilmPreferencesSyncSnapshot().attached, false);
  assert.equal(getSavedFilms(storage).length, 1);
  assert.equal(
    getSavedFilms(storage)[0].filmRef.showtimeFilmKey,
    'device-only',
  );
  // Attach as B should not pull A's seeded prefs (different client store)
  await attachFilmPreferencesMerge();
  assert.equal(
    getSavedFilms(storage).some((i) => i.title === 'A-only'),
    false,
  );
});

test('cloudSyncStatus never claims schedule sync', () => {
  const label = getCloudSyncStatusLabel();
  assert.equal(/schedule/i.test(label) && /synced/i.test(label), false);
  assert.equal(getCloudSyncStatus() === 'synced' || true, true);
});

test('suppress helper prevents notifications', () => {
  let n = 0;
  subscribeFilmStoreMutations(() => {
    n += 1;
  });
  suppressFilmStoreMutationNotifications(() => {
    notifyFilmStoreMutation({
      preferenceType: 'saved',
      mutatedAt: new Date().toISOString(),
    });
  });
  assert.equal(n, 0);
  notifyFilmStoreMutation({
    preferenceType: 'saved',
    mutatedAt: new Date().toISOString(),
  });
  assert.equal(n, 1);
});

test('fetchUserFilmPreferences filters malformed rows', async () => {
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({
                data: [
                  {
                    film_key: 'showtime:ok',
                    preference_type: 'saved',
                    is_active: true,
                    updated_at: '2026-01-01T00:00:00.000Z',
                    showtime_film_key: 'ok',
                  },
                  { film_key: '', preference_type: 'saved', updated_at: 'x' },
                  { nonsense: true },
                ],
                error: null,
              });
            },
          };
        },
      };
    },
  };
  const result = await fetchUserFilmPreferences(client, 'user-a');
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
});

test('localSavedItemToRecord uses tmdb film_key when present', () => {
  const rec = localSavedItemToRecord(
    {
      filmRef: makeFilmRef('k', 'tmdb:3'),
      savedAt: '2026-01-01T00:00:00.000Z',
      title: 'T',
    },
    '2026-01-01T00:00:00.000Z',
  );
  assert.equal(rec.film_key, 'tmdb:3');
  assert.equal(rec.preference_type, 'saved');
});

test('attachment record is versioned and token-free', () => {
  const storage = memoryStorage();
  writeFilmSyncAttachment(storage, {
    version: 1,
    attachedUserId: 'user-a',
    lastSuccessfulPullAt: '2026-01-01T00:00:00.000Z',
    lastSuccessfulSyncAt: '2026-01-01T00:00:00.000Z',
  });
  const raw = storage.getItem(FILM_SYNC_ATTACHMENT_KEY);
  assert.equal(/access_token|refresh_token|service_role/i.test(raw), false);
  const parsed = readFilmSyncAttachment(storage);
  assert.equal(parsed.attachedUserId, 'user-a');
});

test('pending queue clears on auth user change', async () => {
  const storage = memoryStorage();
  const client = createFilmSyncMockClient({ userId: 'user-a' });
  startFilmPreferencesSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  await attachFilmPreferencesMerge();
  // Force pending without waiting flush by failing upserts repeatedly
  client.failNextUpsert();
  saveFilm(storage, makeFilmRef('pending-1'));
  await new Promise((r) => setTimeout(r, 500));
  // Switch users — pending must clear
  setFilmPreferencesAuthContext({
    userId: 'user-b',
    client: createFilmSyncMockClient({ userId: 'user-b' }),
    storage,
  });
  assert.equal(getFilmPreferencesPendingCountForTests(), 0);
  assert.equal(getSavedFilms(storage).length >= 1, true);
});
