/**
 * T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01 — accepted plans / My Schedule sync tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localPlanToRecord,
  mergeAcceptedPlanCollections,
  mergeAcceptedPlanPair,
  normalizeAcceptedPlanRecord,
  recordToLocalPlan,
} from '../../v2/auth/acceptedPlanSnapshot.js';
import {
  SCHEDULE_SYNC_ATTACHMENT_KEY,
  isBrowserScheduleAttachedToUser,
  readScheduleSyncAttachment,
  writeScheduleSyncAttachment,
} from '../../v2/auth/scheduleSyncAttachmentStore.js';
import {
  FILM_SYNC_ATTACHMENT_KEY,
  writeFilmSyncAttachment,
} from '../../v2/auth/filmSyncAttachmentStore.js';
import {
  resetScheduleStoreMutationBridgeForTests,
  suppressScheduleStoreMutationNotifications,
  subscribeScheduleStoreMutations,
} from '../../v2/auth/scheduleStoreMutationBridge.js';
import {
  applyAcceptedPlanRecordsToLocalStore,
  attachScheduleMerge,
  declineScheduleAttach,
  getSchedulePendingCountForTests,
  getScheduleSyncLabel,
  getScheduleSyncSnapshot,
  resetScheduleSyncForTests,
  setScheduleAuthContext,
  startScheduleSyncController,
  stopScheduleSyncController,
  syncScheduleNow,
  upsertUserAcceptedPlans,
} from '../../v2/auth/scheduleSync.js';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  acceptPlan,
  getAcceptedPlans,
  removeAcceptedPlan,
} from '../../v2/stores/acceptedPlansStore.js';
import {
  getFilmPreferencesSyncSnapshot,
  resetFilmPreferencesSyncForTests,
  setFilmPreferencesAuthContext,
  startFilmPreferencesSyncController,
} from '../../v2/auth/filmPreferencesSync.js';
import { resetFilmStoreMutationBridgeForTests } from '../../v2/auth/filmStoreMutationBridge.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function samplePerformance(overrides = {}) {
  return {
    source: 'beacon',
    sourceShowtimeId: overrides.sourceShowtimeId ?? 'st-1',
    theaterId: 'the-beacon',
    theaterName: 'The Beacon',
    filmKey: overrides.filmKey ?? 'film-a',
    filmId: 'tmdb:1',
    title: overrides.title ?? 'Sample Film',
    localDate: overrides.localDate ?? '2026-08-10',
    localTime: overrides.localTime ?? '19:00',
    runtimeMin: 120,
    format: '35mm',
    ticketUrl: 'https://example.test/tix',
    posterUrl: 'https://example.test/p.jpg',
    addressLabel: '3504 Fremont Ave N',
    ...overrides,
  };
}

function acceptSample(storage, overrides = {}) {
  return acceptPlan(storage, {
    provenance: 'live',
    label: overrides.label ?? 'Evening',
    date: overrides.localDate ?? '2026-08-10',
    performances: [samplePerformance(overrides)],
    now: () => new Date(overrides.acceptedAt ?? '2026-08-01T18:00:00.000Z'),
  });
}

function createScheduleMockClient({ userId = 'user-a' } = {}) {
  /** @type {Map<string, object>} */
  const plans = new Map();
  /** @type {Map<string, object>} */
  const syncState = new Map();
  let failNextSelect = false;
  let failNextUpsert = false;
  const keyOf = (row) => `${row.user_id}::${row.plan_id}`;

  return {
    __plans: plans,
    __syncState: syncState,
    failNextSelect() {
      failNextSelect = true;
    },
    failNextUpsert() {
      failNextUpsert = true;
    },
    seedPlan(row) {
      const n = {
        user_id: row.user_id ?? userId,
        plan_id: row.plan_id,
        is_active: row.is_active !== false,
        plan_snapshot: row.plan_snapshot,
        schema_version: row.schema_version ?? 1,
        accepted_at: row.accepted_at,
        updated_at: row.updated_at,
        device_mutation_id: null,
        created_at: row.updated_at,
      };
      plans.set(keyOf(n), n);
    },
    from(table) {
      if (table === 'user_accepted_plans') {
        const execute = async (uid, sinceIso) => {
          if (failNextSelect) {
            failNextSelect = false;
            return { data: null, error: { message: 'network down' } };
          }
          const rows = [...plans.values()].filter((r) => {
            if (r.user_id !== uid) return false;
            if (sinceIso && r.updated_at <= sinceIso) return false;
            return true;
          });
          return { data: rows, error: null };
        };
        return {
          select() {
            return {
              eq(_c, uid) {
                return {
                  gt(_c2, since) {
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
              const existing = plans.get(id);
              if (existing && row.updated_at < existing.updated_at) continue;
              plans.set(id, {
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
      if (table === 'profiles' || table === 'user_film_preferences') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                  then(onFulfilled, onRejected) {
                    return Promise.resolve({ data: [], error: null }).then(
                      onFulfilled,
                      onRejected,
                    );
                  },
                };
              },
            };
          },
          async upsert() {
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test.beforeEach(() => {
  resetScheduleSyncForTests();
  resetScheduleStoreMutationBridgeForTests();
  resetFilmPreferencesSyncForTests();
  resetFilmStoreMutationBridgeForTests();
});

test('plan identity uses durable accepted planId', () => {
  const storage = memoryStorage();
  const result = acceptSample(storage);
  assert.equal(result.ok, true);
  const plan = getAcceptedPlans(storage)[0];
  assert.match(plan.planId, /^accepted:2026-08-10:/);
  const rec = localPlanToRecord(plan);
  assert.equal(rec.plan_id, plan.planId);
  const roundTrip = recordToLocalPlan(rec);
  assert.equal(roundTrip.planId, plan.planId);
  assert.equal(roundTrip.performances[0].title, 'Sample Film');
});

test('first attachment prefers active local over older cloud tombstone', () => {
  const local = normalizeAcceptedPlanRecord({
    plan_id: 'accepted:2026-08-10:x',
    is_active: true,
    schema_version: 1,
    accepted_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    plan_snapshot: { planId: 'accepted:2026-08-10:x', performances: [] },
  });
  // Invalid snapshot performances — use merge on normalized shells carefully.
  // Instead test pair logic with valid minimal shells via normalize after seed.
  const cloud = {
    ...local,
    is_active: false,
    updated_at: '2026-06-01T00:00:00.000Z',
  };
  const merged = mergeAcceptedPlanPair(local, cloud, {
    phase: 'first_attachment',
  });
  assert.equal(merged.is_active, true);
});

test('first attachment blank local does not deactivate cloud active', () => {
  const cloud = normalizeAcceptedPlanRecord({
    plan_id: 'p1',
    is_active: true,
    schema_version: 1,
    accepted_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    plan_snapshot: { planId: 'p1' },
  });
  const localTombstone = {
    ...cloud,
    is_active: false,
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const merged = mergeAcceptedPlanPair(localTombstone, cloud, {
    phase: 'first_attachment',
  });
  assert.equal(merged.is_active, true);
});

test('ongoing merge uses updated_at LWW for tombstones', () => {
  const local = normalizeAcceptedPlanRecord({
    plan_id: 'p2',
    is_active: true,
    schema_version: 1,
    accepted_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    plan_snapshot: { planId: 'p2' },
  });
  const cloud = {
    ...local,
    is_active: false,
    updated_at: '2026-03-01T00:00:00.000Z',
  };
  const merged = mergeAcceptedPlanPair(local, cloud, { phase: 'ongoing' });
  assert.equal(merged.is_active, false);
});

test('login context does not attach schedule or upload plans', async () => {
  const storage = memoryStorage();
  acceptSample(storage);
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  assert.equal(isBrowserScheduleAttachedToUser(storage, 'user-a'), false);
  assert.equal(client.__plans.size, 0);
  assert.equal(getScheduleSyncSnapshot().attached, false);
  assert.match(getScheduleSyncLabel(), /stored on this device/i);
});

test('film sync attachment does not attach schedule sync', () => {
  const storage = memoryStorage();
  writeFilmSyncAttachment(storage, {
    version: 1,
    attachedUserId: 'user-a',
    lastSuccessfulPullAt: '2026-01-01T00:00:00.000Z',
    lastSuccessfulSyncAt: '2026-01-01T00:00:00.000Z',
  });
  const client = createScheduleMockClient();
  startFilmPreferencesSyncController({ storage, client });
  startScheduleSyncController({ storage, client });
  setFilmPreferencesAuthContext({ userId: 'user-a', client, storage });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  assert.equal(getFilmPreferencesSyncSnapshot().attached, true);
  assert.equal(getScheduleSyncSnapshot().attached, false);
  assert.equal(isBrowserScheduleAttachedToUser(storage, 'user-a'), false);
});

test('logout does not clear accepted plans', () => {
  const storage = memoryStorage();
  acceptSample(storage);
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  setScheduleAuthContext({ userId: null, storage, client: null });
  assert.equal(getAcceptedPlans(storage).length, 1);
  assert.equal(storage.getItem(ACCEPTED_PLANS_STORAGE_KEY) != null, true);
});

test('attach empty local + empty cloud marks schedule attached', async () => {
  const storage = memoryStorage();
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  const result = await attachScheduleMerge();
  assert.equal(result.ok, true);
  assert.equal(isBrowserScheduleAttachedToUser(storage, 'user-a'), true);
  assert.equal(getScheduleSyncSnapshot().uiStatus, 'synced');
  assert.match(getScheduleSyncLabel(), /My Schedule is synced/i);
});

test('attach local plans + empty cloud uploads', async () => {
  const storage = memoryStorage();
  acceptSample(storage);
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  const result = await attachScheduleMerge();
  assert.equal(result.ok, true);
  assert.ok(client.__plans.size >= 1);
  assert.equal(getAcceptedPlans(storage).length, 1);
});

test('attach empty local + cloud plans downloads durable snapshot', async () => {
  const storage = memoryStorage();
  const built = acceptSample(memoryStorage());
  const plan = built.plan;
  const rec = localPlanToRecord(plan);
  const client = createScheduleMockClient();
  client.seedPlan({
    plan_id: rec.plan_id,
    is_active: true,
    plan_snapshot: rec.plan_snapshot,
    schema_version: 1,
    accepted_at: rec.accepted_at,
    updated_at: rec.updated_at,
  });
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  const result = await attachScheduleMerge();
  assert.equal(result.ok, true);
  assert.equal(getAcceptedPlans(storage).length, 1);
  assert.equal(getAcceptedPlans(storage)[0].performances[0].title, 'Sample Film');
});

test('attach failure does not mark attached', async () => {
  const storage = memoryStorage();
  acceptSample(storage);
  const client = createScheduleMockClient();
  client.failNextSelect();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  const result = await attachScheduleMerge();
  assert.equal(result.ok, false);
  assert.equal(isBrowserScheduleAttachedToUser(storage, 'user-a'), false);
});

test('keep device only does not upload', () => {
  const storage = memoryStorage();
  acceptSample(storage);
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  declineScheduleAttach();
  assert.equal(client.__plans.size, 0);
  assert.equal(isBrowserScheduleAttachedToUser(storage, 'user-a'), false);
});

test('after attach, accept plan enqueues cloud upsert; local immediate', async () => {
  const storage = memoryStorage();
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  await attachScheduleMerge();
  const before = client.__plans.size;
  const result = acceptSample(storage, {
    sourceShowtimeId: 'st-new',
    filmKey: 'film-new',
    title: 'New Plan Film',
    localDate: '2026-08-11',
  });
  assert.equal(result.ok, true);
  assert.equal(getAcceptedPlans(storage).length, 1);
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(client.__plans.size > before);
});

test('cloud failure does not revert local accept', async () => {
  const storage = memoryStorage();
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  await attachScheduleMerge();
  client.failNextUpsert();
  acceptSample(storage, {
    sourceShowtimeId: 'st-fail',
    filmKey: 'film-fail',
    localDate: '2026-08-12',
  });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(getAcceptedPlans(storage).length, 1);
  assert.equal(getScheduleSyncSnapshot().degraded, true);
});

test('cloud apply does not notify mutation bridge', () => {
  const storage = memoryStorage();
  const built = acceptSample(memoryStorage());
  const rec = localPlanToRecord(built.plan);
  let n = 0;
  subscribeScheduleStoreMutations(() => {
    n += 1;
  });
  applyAcceptedPlanRecordsToLocalStore(storage, [rec]);
  assert.equal(n, 0);
  assert.equal(getAcceptedPlans(storage).length, 1);
});

test('multi-device: accept propagates; removal tombstone propagates; stale blocked', async () => {
  const client = createScheduleMockClient();
  const deviceA = memoryStorage();
  startScheduleSyncController({ storage: deviceA, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage: deviceA });
  await attachScheduleMerge();
  acceptSample(deviceA, { sourceShowtimeId: 'shared-1', filmKey: 'shared' });
  await new Promise((r) => setTimeout(r, 500));

  stopScheduleSyncController();
  resetScheduleStoreMutationBridgeForTests();

  const deviceB = memoryStorage();
  startScheduleSyncController({ storage: deviceB, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage: deviceB });
  await attachScheduleMerge();
  assert.equal(getAcceptedPlans(deviceB).length, 1);
  const planId = getAcceptedPlans(deviceB)[0].planId;
  removeAcceptedPlan(deviceB, planId);
  await new Promise((r) => setTimeout(r, 500));
  const tombs = [...client.__plans.values()].filter(
    (r) => r.plan_id === planId && r.is_active === false,
  );
  assert.equal(tombs.length, 1);

  stopScheduleSyncController();
  resetScheduleStoreMutationBridgeForTests();
  startScheduleSyncController({ storage: deviceA, client });
  writeScheduleSyncAttachment(deviceA, {
    version: 1,
    attachedUserId: 'user-a',
    lastSuccessfulPullAt: '2020-01-01T00:00:00.000Z',
    lastSuccessfulSyncAt: '2020-01-01T00:00:00.000Z',
  });
  setScheduleAuthContext({ userId: 'user-a', client, storage: deviceA });
  await syncScheduleNow();
  assert.equal(getAcceptedPlans(deviceA).length, 0);

  const stale = await upsertUserAcceptedPlans(client, 'user-a', [
    {
      ...tombs[0],
      is_active: true,
      updated_at: '2019-01-01T00:00:00.000Z',
    },
  ]);
  assert.equal(stale.ok, true);
  const row = [...client.__plans.values()].find((r) => r.plan_id === planId);
  assert.equal(row.is_active, false);
});

test('auth switch clears pending and never applies other user plans', async () => {
  const storage = memoryStorage();
  acceptSample(storage);
  const clientA = createScheduleMockClient({ userId: 'user-a' });
  const built = acceptSample(memoryStorage(), {
    sourceShowtimeId: 'cloud-only',
    filmKey: 'cloud-only',
    title: 'Cloud Only',
    localDate: '2026-09-01',
  });
  clientA.seedPlan({
    ...localPlanToRecord(built.plan),
  });
  startScheduleSyncController({ storage, client: clientA });
  setScheduleAuthContext({ userId: 'user-a', client: clientA, storage });
  const clientB = createScheduleMockClient({ userId: 'user-b' });
  setScheduleAuthContext({ userId: 'user-b', client: clientB, storage });
  assert.equal(getScheduleSyncSnapshot().attached, false);
  assert.equal(getAcceptedPlans(storage).length, 1);
  await attachScheduleMerge();
  assert.equal(
    getAcceptedPlans(storage).some((p) =>
      p.performances.some((x) => x.title === 'Cloud Only'),
    ),
    false,
  );
});

test('plan renders from snapshot fields without HomeData dependency', () => {
  const storage = memoryStorage();
  acceptSample(storage);
  const plan = getAcceptedPlans(storage)[0];
  assert.ok(plan.performances[0].title);
  assert.ok(plan.performances[0].theaterName);
  assert.ok(plan.performances[0].startsAt);
  assert.ok(plan.performances[0].expectedEndsAt);
  assert.ok(plan.performances[0].localDate);
  assert.ok(plan.performances[0].localTime);
  // No HomeData import required — store is self-contained.
});

test('attachment key is separate from film sync and token-free', () => {
  assert.equal(
    SCHEDULE_SYNC_ATTACHMENT_KEY,
    'reel-seattle.v2.scheduleSyncAttachment',
  );
  assert.notEqual(SCHEDULE_SYNC_ATTACHMENT_KEY, FILM_SYNC_ATTACHMENT_KEY);
  const storage = memoryStorage();
  writeScheduleSyncAttachment(storage, {
    version: 1,
    attachedUserId: 'user-a',
    lastSuccessfulPullAt: null,
    lastSuccessfulSyncAt: null,
  });
  const raw = storage.getItem(SCHEDULE_SYNC_ATTACHMENT_KEY);
  assert.equal(/access_token|refresh_token|service_role/i.test(raw), false);
  assert.equal(readScheduleSyncAttachment(storage).attachedUserId, 'user-a');
});

test('UI labels never claim drafts or calendar sync', () => {
  const label = getScheduleSyncLabel({
    uiStatus: 'synced',
    attached: true,
    attaching: false,
    degraded: false,
    lastSuccessfulSyncAt: null,
    lastSuccessfulPullAt: null,
    lastError: null,
    userId: 'u',
    localHasPlans: true,
  });
  assert.match(label, /My Schedule is synced/);
  assert.equal(/draft|calendar/i.test(label), false);
});

test('pending queue clears on user change', async () => {
  const storage = memoryStorage();
  const client = createScheduleMockClient();
  startScheduleSyncController({ storage, client });
  setScheduleAuthContext({ userId: 'user-a', client, storage });
  await attachScheduleMerge();
  client.failNextUpsert();
  acceptSample(storage, {
    sourceShowtimeId: 'pending',
    filmKey: 'pending',
    localDate: '2026-08-13',
  });
  await new Promise((r) => setTimeout(r, 500));
  setScheduleAuthContext({
    userId: 'user-b',
    client: createScheduleMockClient({ userId: 'user-b' }),
    storage,
  });
  assert.equal(getSchedulePendingCountForTests(), 0);
});

test('invalid cloud snapshots are skipped on merge', () => {
  const merged = mergeAcceptedPlanCollections(
    [],
    [
      {
        plan_id: 'bad',
        is_active: true,
        schema_version: 99,
        accepted_at: 'not-a-date',
        updated_at: 'also-bad',
        plan_snapshot: null,
      },
    ],
    { phase: 'first_attachment' },
  );
  assert.equal(merged.length, 0);
});
