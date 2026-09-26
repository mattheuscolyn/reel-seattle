/**
 * Shared social-planning foundation tests (T-SHARED-PLANS-01).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAcceptedPlanItem,
  ACCEPTED_PLANS_STORAGE_KEY,
} from '../../v2/stores/acceptedPlansStore.js';
import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';
import {
  createSharedPlan,
  createSharedPlanId,
  transitionSharedPlanType,
  transitionSharedPlanVisibility,
  canViewerSeeSharedPlan,
  isFriendVisibleOpenPlan,
} from '../../v2/sharedPlans/sharedPlanModel.js';
import {
  createSharedPlanRepository,
  markFriends,
  repoCreateSharedPlan,
  repoInviteFriend,
  repoJoinOpenPlan,
  repoListInvitationsForUser,
  repoListOpenFriendVisiblePlans,
  repoMarkPlanDecided,
  repoRespondToPlan,
  repoSetPlanVisibility,
  repoLeavePlan,
  repoCanViewerSeePlan,
  getSharedPlan,
  listPlanMembers,
} from '../../v2/sharedPlans/sharedPlanRepository.js';
import {
  sharedPlanFromAcceptedPlan,
  loadSoloAcceptedPlansUnchanged,
} from '../../v2/sharedPlans/acceptedPlanAdapter.js';
import {
  getLocalFilmUserState,
  filterFilmStatesToAcceptedFriends,
  normalizeFriendFilmUserState,
} from '../../v2/filmState/filmUserStateModel.js';
import {
  markFilmSeen,
  SEEN_FILMS_STORAGE_KEY,
} from '../../v2/stores/seenFilmsStore.js';
import {
  saveFilm,
  SAVED_FILMS_STORAGE_KEY,
} from '../../v2/stores/savedFilmsStore.js';
import {
  markFilmNotInterested,
  NOT_INTERESTED_FILMS_STORAGE_KEY,
} from '../../v2/stores/notInterestedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/20260926000000_shared_plans_foundation.sql'),
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

function screening(overrides = {}) {
  return {
    performanceKey: buildPerformanceKey({
      source: 'siFF',
      sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
      theaterId: overrides.theaterId ?? 'theater-a',
      filmKey: overrides.filmKey ?? 'fk-alpha',
      localDate: overrides.localDate ?? '2026-10-01',
      localTime: overrides.localTime ?? '19:00',
    }),
    filmId: 'tmdb:1001',
    filmKey: overrides.filmKey ?? 'fk-alpha',
    title: overrides.title ?? 'Alpha',
    theaterId: overrides.theaterId ?? 'theater-a',
    theaterName: 'Theater A',
    source: 'siFF',
    sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
    opportunityKey: null,
    localDate: overrides.localDate ?? '2026-10-01',
    localTime: overrides.localTime ?? '19:00',
    startsAt: '2026-10-01T19:00:00.000Z',
    expectedEndsAt: '2026-10-01T21:00:00.000Z',
    runtimeMin: 120,
    format: null,
    ticketUrl: null,
    addressLabel: null,
    posterUrl: null,
    ...overrides,
  };
}

test('1 solo one-screening plan can be represented', () => {
  const created = createSharedPlan({
    ownerId: 'user-a',
    type: 'decided',
    visibility: 'private',
    screenings: [screening()],
  });
  assert.equal(created.ok, true);
  assert.equal(created.plan.screenings.length, 1);
  assert.equal(created.plan.visibility, 'private');
  assert.equal(created.ownerMember.role, 'owner');
});

test('2 multi-screening plan can be represented', () => {
  const created = createSharedPlan({
    ownerId: 'user-a',
    screenings: [
      screening({ sourceShowtimeId: 'show-1', localTime: '17:00' }),
      screening({
        sourceShowtimeId: 'show-2',
        localTime: '20:00',
        filmKey: 'fk-beta',
        title: 'Beta',
        filmId: 'tmdb:1002',
      }),
    ],
  });
  assert.equal(created.ok, true);
  assert.equal(created.plan.screenings.length, 2);
});

test('3 plan has stable canonical ID', () => {
  const id = createSharedPlanId({
    randomUUID: () => '11111111-2222-3333-4444-555555555555',
  });
  assert.equal(id, 'shared:11111111-2222-3333-4444-555555555555');
  const created = createSharedPlan({
    ownerId: 'user-a',
    planId: id,
    screenings: [screening()],
  });
  assert.equal(created.plan.planId, id);
});

test('4 proposal and decided share one plan type', () => {
  const created = createSharedPlan({
    ownerId: 'user-a',
    type: 'proposal',
    screenings: [screening()],
  });
  const decided = transitionSharedPlanType(created.plan, 'decided');
  assert.equal(decided.ok, true);
  assert.equal(decided.plan.planId, created.plan.planId);
  assert.equal(decided.plan.type, 'decided');
  // Reverse transition is not allowed in v1.
  const reverse = transitionSharedPlanType(decided.plan, 'proposal');
  assert.equal(reverse.ok, false);
});

test('5–7 direct invite + open friends visibility without auto-membership; join keeps canonical id', () => {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'user-a', 'user-b');
  markFriends(repo, 'user-a', 'user-c');

  const created = repoCreateSharedPlan(repo, {
    ownerId: 'user-a',
    type: 'proposal',
    visibility: 'private',
    screenings: [screening()],
  });
  assert.equal(created.ok, true);
  const planId = created.plan.planId;

  const invited = repoInviteFriend(repo, planId, 'user-a', 'user-b');
  assert.equal(invited.ok, true);
  assert.equal(invited.member.role, 'invitee');
  assert.equal(invited.member.response, 'pending');

  // Opening to friends does not auto-add friend C.
  const opened = repoSetPlanVisibility(repo, planId, 'user-a', 'friends');
  assert.equal(opened.ok, true);
  assert.equal(listPlanMembers(repo, planId).length, 2);

  const openFeed = repoListOpenFriendVisiblePlans(repo, 'user-c');
  assert.equal(openFeed.length, 1);
  assert.equal(openFeed[0].planId, planId);

  // Private plans never appear for non-members.
  const privateOnly = createSharedPlanRepository();
  markFriends(privateOnly, 'owner', 'viewer');
  repoCreateSharedPlan(privateOnly, {
    ownerId: 'owner',
    visibility: 'private',
    screenings: [screening({ sourceShowtimeId: 'p1' })],
  });
  assert.deepEqual(repoListOpenFriendVisiblePlans(privateOnly, 'viewer'), []);

  const joined = repoJoinOpenPlan(repo, planId, 'user-c');
  assert.equal(joined.ok, true);
  assert.equal(joined.plan.planId, planId);
  assert.equal(getSharedPlan(repo, planId).planId, planId);
  assert.equal(
    listPlanMembers(repo, planId).filter((m) => m.userId === 'user-c').length,
    1,
  );
  // After joining, no longer in open feed.
  assert.equal(repoListOpenFriendVisiblePlans(repo, 'user-c').length, 0);
});

test('8 exact performance identity is preserved', () => {
  const key = buildPerformanceKey({
    source: 'amc',
    sourceShowtimeId: 'abc',
    theaterId: 't1',
  });
  assert.match(key, /^src:amc:t1:abc$/);
  const created = createSharedPlan({
    ownerId: 'user-a',
    screenings: [
      screening({
        performanceKey: key,
        source: 'amc',
        sourceShowtimeId: 'abc',
        theaterId: 't1',
      }),
    ],
  });
  assert.equal(created.plan.screenings[0].performanceKey, key);
});

test('9 existing solo Planner behavior still works via adapter', () => {
  const storage = memoryStorage();
  const built = buildAcceptedPlanItem({
    performances: [screening()],
    provenance: 'live',
    date: '2026-10-01',
    now: () => new Date('2026-09-26T12:00:00.000Z'),
  });
  assert.equal(built.ok, true);
  storage.setItem(
    ACCEPTED_PLANS_STORAGE_KEY,
    JSON.stringify({ version: 1, items: [built.plan] }),
  );
  const loaded = loadSoloAcceptedPlansUnchanged(storage);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].planId, built.plan.planId);

  const shared = sharedPlanFromAcceptedPlan(built.plan, {
    ownerId: 'user-a',
    visibility: 'private',
    type: 'decided',
  });
  assert.equal(shared.ok, true);
  assert.equal(shared.plan.sourceAcceptedPlanId, built.plan.planId);
  assert.notEqual(shared.plan.planId, built.plan.planId);
});

test('10 film-user state distinguishes saved / seen / not interested', () => {
  const storage = memoryStorage();
  const ref = {
    filmId: 'tmdb:1001',
    showtimeFilmKey: 'fk-alpha',
    sourceFilmId: null,
    source: null,
  };
  saveFilm(storage, ref, { title: 'Alpha' });
  markFilmSeen(storage, ref, { title: 'Alpha' });
  const state = getLocalFilmUserState(storage, ref, { userId: 'user-a' });
  assert.equal(state.states.saved, true);
  assert.equal(state.states.seen, true);
  assert.equal(state.states.not_interested, false);

  markFilmNotInterested(storage, {
    filmId: 'tmdb:1002',
    showtimeFilmKey: 'fk-beta',
    sourceFilmId: null,
    source: null,
  });
  const ni = getLocalFilmUserState(
    storage,
    { filmKey: 'fk-beta', filmId: 'tmdb:1002' },
    { userId: 'user-a' },
  );
  assert.equal(ni.states.not_interested, true);
  assert.ok(storage.getItem(SAVED_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(SEEN_FILMS_STORAGE_KEY));
  assert.ok(storage.getItem(NOT_INTERESTED_FILMS_STORAGE_KEY));
});

test('11 friend film activity filters out non-friends', () => {
  const rows = [
    normalizeFriendFilmUserState({
      user_id: 'friend-1',
      film_key: 'tmdb:1001',
      film_id: 'tmdb:1001',
      showtime_film_key: 'fk-alpha',
      states: { saved: true, seen: false, not_interested: false },
    }),
    normalizeFriendFilmUserState({
      user_id: 'stranger',
      film_key: 'tmdb:1001',
      film_id: 'tmdb:1001',
      showtime_film_key: 'fk-alpha',
      states: { saved: true, seen: false, not_interested: false },
    }),
  ].filter(Boolean);
  const filtered = filterFilmStatesToAcceptedFriends(rows, ['friend-1']);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].userId, 'friend-1');
});

test('12 private plans are not exposed through friend-visible queries', () => {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'owner', 'friend');
  repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    visibility: 'private',
    screenings: [screening()],
  });
  repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    visibility: 'invited',
    screenings: [screening({ sourceShowtimeId: 'inv-1' })],
  });
  assert.deepEqual(repoListOpenFriendVisiblePlans(repo, 'friend'), []);
  assert.equal(repoCanViewerSeePlan(repo, getSharedPlan(repo, [...repo.plans.keys()][0]).planId, 'friend'), false);
});

test('invitations, responses, leave, and visibility narrowing preserve members', () => {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'a', 'b');
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'a',
    type: 'proposal',
    visibility: 'invited',
    screenings: [screening()],
  });
  repoInviteFriend(repo, created.plan.planId, 'a', 'b');
  assert.equal(repoListInvitationsForUser(repo, 'b').length, 1);

  const responded = repoRespondToPlan(
    repo,
    created.plan.planId,
    'b',
    'interested',
  );
  assert.equal(responded.ok, true);
  assert.equal(responded.member.response, 'interested');

  repoMarkPlanDecided(repo, created.plan.planId, 'a', 'decided');
  // Historical interested remains after proposal→decided.
  assert.equal(
    listPlanMembers(repo, created.plan.planId).find((m) => m.userId === 'b')
      .response,
    'interested',
  );

  repoSetPlanVisibility(repo, created.plan.planId, 'a', 'private');
  assert.equal(listPlanMembers(repo, created.plan.planId).length, 2);

  const left = repoLeavePlan(repo, created.plan.planId, 'b');
  assert.equal(left.ok, true);
  assert.equal(listPlanMembers(repo, created.plan.planId).length, 1);
});

test('open invite discoverability requires friendship', () => {
  const plan = createSharedPlan({
    ownerId: 'owner',
    visibility: 'friends',
    screenings: [screening()],
  }).plan;
  assert.equal(
    isFriendVisibleOpenPlan(plan, 'stranger', {
      isFriendOfOwner: false,
      isMember: false,
    }),
    false,
  );
  assert.equal(
    canViewerSeeSharedPlan(plan, [], 'stranger', { isFriendOfOwner: false }),
    false,
  );
});

test('migration defines shared plan tables, privacy RPCs, and friend film states', () => {
  assert.match(MIGRATION, /create table if not exists public\.shared_plans/);
  assert.match(MIGRATION, /create table if not exists public\.shared_plan_members/);
  assert.match(MIGRATION, /list_friend_film_states/);
  assert.match(MIGRATION, /list_open_friend_shared_plans/);
  assert.match(MIGRATION, /are_accepted_friends/);
  assert.match(MIGRATION, /visibility = 'friends'/);
  assert.match(MIGRATION, /revoke all on table public\.shared_plans from authenticated/);
});
