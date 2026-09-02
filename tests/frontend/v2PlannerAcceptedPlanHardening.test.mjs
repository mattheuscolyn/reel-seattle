import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCEPTED_PLANS_STORAGE_KEY,
  acceptPlan,
  getAcceptedPlanById,
  getAcceptedPlans,
  removePerformanceFromAcceptedPlan,
  setAcceptedPlanPerformanceTicketsPurchased,
} from '../../v2/stores/acceptedPlansStore.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import {
  diffLocalAcceptedPlanMaps,
  localPlanToRecord,
  mergeAcceptedPlanPair,
  recordToLocalPlan,
} from '../../v2/auth/acceptedPlanSnapshot.js';
import { resolvePlannedScreeningPresentation } from '../../v2/planner/resolvePlannedScreeningPresentation.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function liveFilm(overrides = {}) {
  return {
    type: 'film',
    title: 'Alpha',
    theaterId: 'theater-a',
    theaterName: 'Theater A',
    localDate: '2026-08-20',
    date: '2026-08-20',
    localTime: '19:00',
    time: '19:00',
    runtimeMin: 90,
    runtime: 90,
    format: '35mm',
    filmKey: 'alpha',
    filmId: 'tmdb:1',
    source: 'fixture-test',
    sourceShowtimeId: 'oa1',
    opportunityKey: 'oa1',
    provenance: 'live',
    ...overrides,
  };
}

function acceptTwoFilmPlan(storage) {
  return acceptResultsPlan(
    {
      id: 'live-double',
      provenance: 'live',
      source: 'live',
      date: '2026-08-20',
      items: [
        liveFilm({
          title: 'Saltwater Road',
          filmKey: 'salt',
          filmId: 'tmdb:2',
          localTime: '14:00',
          time: '14:00',
          sourceShowtimeId: 'sw-1',
          opportunityKey: 'sw-1',
        }),
        liveFilm({
          title: 'Blue Hour',
          filmKey: 'blue',
          filmId: 'tmdb:3',
          localTime: '19:40',
          time: '19:40',
          sourceShowtimeId: 'bh-1',
          opportunityKey: 'bh-1',
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
}

test('legacy v1 accepted plans without ticketsPurchased still load', () => {
  const storage = memoryStorage({
    [ACCEPTED_PLANS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      items: [
        {
          planId: 'accepted:2026-08-20:legacy-key',
          acceptedAt: '2026-08-01T00:00:00.000Z',
          label: 'Legacy',
          date: '2026-08-20',
          timezone: 'America/Los_Angeles',
          provenance: 'live',
          performances: [
            {
              performanceKey: 'legacy-key',
              filmId: 'tmdb:1',
              filmKey: 'alpha',
              title: 'Alpha',
              theaterId: 'theater-a',
              theaterName: 'Theater A',
              source: 'fixture-test',
              sourceShowtimeId: 'oa1',
              localDate: '2026-08-20',
              localTime: '19:00',
              startsAt: '2026-08-20T19:00:00-07:00',
              expectedEndsAt: '2026-08-20T20:30:00-07:00',
              runtimeMin: 90,
              format: '35mm',
              ticketUrl: null,
              posterUrl: null,
              addressLabel: null,
            },
          ],
          settingsSnapshot: null,
        },
      ],
    }),
  });
  const plan = getAcceptedPlans(storage)[0];
  assert.equal(plan.performances[0].ticketsPurchased, undefined);
  const resolved = resolvePlannedScreeningPresentation({
    planId: plan.planId,
    performanceKey: plan.performances[0].performanceKey,
    storage,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.screening.ticketsPurchased, false);
});

test('ticketsPurchased survives local write and reload', () => {
  const storage = memoryStorage();
  const accepted = acceptPlan(storage, {
    provenance: 'live',
    date: '2026-08-20',
    performances: [liveFilm()],
  });
  const planId = accepted.plan.planId;
  const perfKey = accepted.plan.performances[0].performanceKey;
  setAcceptedPlanPerformanceTicketsPurchased(storage, planId, perfKey, true);
  const raw = JSON.parse(storage.getItem(ACCEPTED_PLANS_STORAGE_KEY));
  assert.equal(raw.items[0].performances[0].ticketsPurchased, true);
  const reloaded = getAcceptedPlanById(storage, planId);
  assert.equal(reloaded.performances[0].ticketsPurchased, true);
});

test('ticketsPurchased cloud upload round-trip via localPlanToRecord and recordToLocalPlan', () => {
  const storage = memoryStorage();
  const accepted = acceptPlan(storage, {
    provenance: 'live',
    date: '2026-08-20',
    performances: [liveFilm()],
  });
  const plan = getAcceptedPlanById(storage, accepted.plan.planId);
  setAcceptedPlanPerformanceTicketsPurchased(
    storage,
    plan.planId,
    plan.performances[0].performanceKey,
    true,
  );
  const updated = getAcceptedPlanById(storage, plan.planId);
  const rec = localPlanToRecord(updated, '2026-08-09T12:00:00.000Z');
  assert.equal(
    rec.plan_snapshot.performances[0].ticketsPurchased,
    true,
  );
  const roundTrip = recordToLocalPlan(rec);
  assert.equal(roundTrip.performances[0].ticketsPurchased, true);
});

test('merge prefers union ticketsPurchased when cloud snapshot omits the field', () => {
  const local = localPlanToRecord(
    {
      planId: 'accepted:2026-08-20:test',
      acceptedAt: '2026-08-01T00:00:00.000Z',
      label: 'Plan',
      date: '2026-08-20',
      timezone: 'America/Los_Angeles',
      provenance: 'live',
      performances: [
        {
          performanceKey: 'perf-a',
          filmId: 'tmdb:1',
          filmKey: 'alpha',
          title: 'Alpha',
          theaterId: 'theater-a',
          theaterName: 'Theater A',
          source: 'fixture-test',
          sourceShowtimeId: 'oa1',
          localDate: '2026-08-20',
          localTime: '19:00',
          startsAt: '2026-08-20T19:00:00-07:00',
          expectedEndsAt: '2026-08-20T20:30:00-07:00',
          runtimeMin: 90,
          format: null,
          ticketUrl: null,
          posterUrl: null,
          addressLabel: null,
          ticketsPurchased: true,
        },
      ],
      settingsSnapshot: null,
    },
    '2026-08-09T12:00:00.000Z',
  );
  const cloud = {
    ...local,
    updated_at: '2026-08-10T12:00:00.000Z',
    plan_snapshot: {
      ...local.plan_snapshot,
      performances: [
        {
          ...local.plan_snapshot.performances[0],
          ticketsPurchased: undefined,
        },
      ],
    },
  };
  const merged = mergeAcceptedPlanPair(local, cloud, { phase: 'ongoing' });
  assert.equal(merged.plan_snapshot.performances[0].ticketsPurchased, true);
});

test('diffLocalAcceptedPlanMaps detects ticketsPurchased snapshot changes', () => {
  const storage = memoryStorage();
  const accepted = acceptPlan(storage, {
    provenance: 'live',
    date: '2026-08-20',
    performances: [liveFilm()],
  });
  const plan = getAcceptedPlans(storage)[0];
  const prev = new Map([[plan.planId, localPlanToRecord(plan)]]);
  setAcceptedPlanPerformanceTicketsPurchased(
    storage,
    plan.planId,
    plan.performances[0].performanceKey,
    true,
  );
  const nextPlan = getAcceptedPlans(storage)[0];
  const next = new Map([[nextPlan.planId, localPlanToRecord(nextPlan)]]);
  const changes = diffLocalAcceptedPlanMaps(
    prev,
    next,
    '2026-08-09T12:00:00.000Z',
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].plan_id, plan.planId);
  assert.equal(changes[0].is_active, true);
  assert.equal(changes[0].updated_at, '2026-08-09T12:00:00.000Z');
  assert.equal(changes[0].plan_snapshot.performances[0].ticketsPurchased, true);
});

test('removing sibling performance preserves ticketsPurchased on remaining screening', () => {
  const storage = memoryStorage();
  const accepted = acceptTwoFilmPlan(storage);
  const plan = getAcceptedPlanById(storage, accepted.plan.planId);
  const keepKey = plan.performances[1].performanceKey;
  setAcceptedPlanPerformanceTicketsPurchased(storage, plan.planId, keepKey, true);
  const removeKey = plan.performances[0].performanceKey;
  removePerformanceFromAcceptedPlan(storage, plan.planId, removeKey);
  const updated = getAcceptedPlanById(storage, plan.planId);
  assert.equal(updated.planId, plan.planId);
  assert.equal(updated.performances.length, 1);
  assert.equal(updated.performances[0].performanceKey, keepKey);
  assert.equal(updated.performances[0].ticketsPurchased, true);
});

test('partial performance removal preserves planId for cloud upsert stability', () => {
  const storage = memoryStorage();
  const accepted = acceptTwoFilmPlan(storage);
  const planId = accepted.plan.planId;
  const removeKey = accepted.plan.performances[0].performanceKey;
  removePerformanceFromAcceptedPlan(storage, planId, removeKey);
  const updated = getAcceptedPlanById(storage, planId);
  assert.ok(updated);
  assert.equal(updated.planId, planId);
  const prev = new Map([[planId, localPlanToRecord(accepted.plan)]]);
  const next = new Map([[planId, localPlanToRecord(updated)]]);
  const changes = diffLocalAcceptedPlanMaps(
    prev,
    next,
    '2026-08-09T12:00:00.000Z',
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].plan_id, planId);
  assert.equal(changes[0].is_active, true);
  assert.equal(changes.some((c) => c.is_active === false), false);
});

test('false ticketsPurchased is not persisted as a stored flag', () => {
  const storage = memoryStorage();
  const accepted = acceptPlan(storage, {
    provenance: 'live',
    date: '2026-08-20',
    performances: [liveFilm()],
  });
  const planId = accepted.plan.planId;
  const perfKey = accepted.plan.performances[0].performanceKey;
  setAcceptedPlanPerformanceTicketsPurchased(storage, planId, perfKey, true);
  setAcceptedPlanPerformanceTicketsPurchased(storage, planId, perfKey, false);
  const plan = getAcceptedPlanById(storage, planId);
  assert.notEqual(plan.performances[0].ticketsPurchased, true);
});
