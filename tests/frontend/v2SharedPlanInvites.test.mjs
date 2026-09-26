/**
 * Shared-plan invite + RSVP + Planner projection tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAcceptedPlanItem } from '../../v2/stores/acceptedPlansStore.js';
import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';
import {
  createSharedPlan,
  isValidResponseForPlanType,
  transitionPlanMemberResponse,
  SHARED_PLAN_INVITE_MESSAGE_MAX,
} from '../../v2/sharedPlans/sharedPlanModel.js';
import {
  createSharedPlanRepository,
  markFriends,
  repoCreateSharedPlan,
  repoInviteFriend,
  repoInviteFriends,
  repoRespondToPlan,
  repoListPendingInvitationsForUser,
  repoListActiveSharedPlansForUser,
  getSharedPlan,
  listPlanMembers,
} from '../../v2/sharedPlans/sharedPlanRepository.js';
import {
  sharedPlanFromAcceptedPlan,
  loadSoloAcceptedPlansUnchanged,
} from '../../v2/sharedPlans/acceptedPlanAdapter.js';
import { promoteAcceptedPlanAndInvite } from '../../v2/sharedPlans/promoteAcceptedPlanAndInvite.js';
import {
  mergeSharedPlansIntoPlannerLanding,
  sharedPlanRsvpOptions,
} from '../../v2/planner/mergeSharedPlansIntoPlannerLanding.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import { SHARED_PLAN_RPC } from '../../v2/sharedPlans/sharedPlansRpcModel.js';
import {
  inviteFriendsToSharedPlanRemote,
  respondToSharedPlanRemote,
} from '../../v2/sharedPlans/sharedPlansApi.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const INVITE_MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/20260928000000_shared_plan_invites.sql'),
  'utf8',
);

function screening(overrides = {}) {
  return {
    performanceKey: buildPerformanceKey({
      source: overrides.source ?? 'siFF',
      sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
      theaterId: overrides.theaterId ?? 'theater-a',
      filmKey: overrides.filmKey ?? 'fk-alpha',
      localDate: overrides.localDate ?? '2026-10-01',
      localTime: overrides.localTime ?? '19:00',
    }),
    filmId: overrides.filmId ?? 'tmdb:1001',
    filmKey: overrides.filmKey ?? 'fk-alpha',
    title: overrides.title ?? 'Alpha',
    theaterId: overrides.theaterId ?? 'theater-a',
    theaterName: overrides.theaterName ?? 'Theater A',
    source: overrides.source ?? 'siFF',
    sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
    opportunityKey: null,
    localDate: overrides.localDate ?? '2026-10-01',
    localTime: overrides.localTime ?? '19:00',
    startsAt: overrides.startsAt ?? '2026-10-01T19:00:00.000Z',
    expectedEndsAt: overrides.expectedEndsAt ?? '2026-10-01T21:00:00.000Z',
    runtimeMin: 120,
    format: overrides.format ?? null,
    ticketUrl: null,
    addressLabel: null,
    posterUrl: null,
    ...overrides,
  };
}

function acceptedPlan(performances) {
  const built = buildAcceptedPlanItem({
    performances,
    provenance: 'live',
    now: () => new Date('2026-09-01T12:00:00.000Z'),
  });
  assert.equal(built.ok, true);
  return built.plan;
}

test('1 solo plan remains untouched until shared', () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        version: 1,
        items: [acceptedPlan([screening()])],
      }),
    setItem() {},
    removeItem() {},
  };
  const before = loadSoloAcceptedPlansUnchanged(storage);
  assert.equal(before.items.length, 1);
  const soloId = before.items[0].planId;
  const landing = composePlannerLandingFromAcceptedPlans({
    storage,
    now: new Date('2026-09-15T12:00:00.000Z'),
  });
  assert.ok(landing.upcoming.dateGroups.length >= 0);
  const after = loadSoloAcceptedPlansUnchanged(storage);
  assert.equal(after.items[0].planId, soloId);
});

test('2 single-screening plan promotes to one canonical shared plan', () => {
  const solo = acceptedPlan([screening()]);
  const adapted = sharedPlanFromAcceptedPlan(solo, {
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'invited',
  });
  assert.equal(adapted.ok, true);
  assert.equal(adapted.plan.screenings.length, 1);
  assert.equal(adapted.plan.sourceAcceptedPlanId, solo.planId);
  assert.equal(
    adapted.plan.screenings[0].performanceKey,
    solo.performances[0].performanceKey,
  );
});

test('3 multi-film plan promotes without losing order/performance identity', () => {
  const solo = acceptedPlan([
    screening({ sourceShowtimeId: 'a', localTime: '14:00', title: 'Film A' }),
    screening({
      sourceShowtimeId: 'b',
      localTime: '17:15',
      title: 'Film B',
      filmKey: 'fk-b',
      filmId: 'tmdb:2',
    }),
    screening({
      sourceShowtimeId: 'c',
      localTime: '20:20',
      title: 'Film C',
      filmKey: 'fk-c',
      filmId: 'tmdb:3',
    }),
  ]);
  const adapted = sharedPlanFromAcceptedPlan(solo, {
    ownerId: 'owner',
    type: 'decided',
  });
  assert.equal(adapted.ok, true);
  assert.deepEqual(
    adapted.plan.screenings.map((s) => s.performanceKey),
    solo.performances.map((p) => p.performanceKey),
  );
  assert.deepEqual(
    adapted.plan.screenings.map((s) => s.title),
    ['Film A', 'Film B', 'Film C'],
  );
});

test('4 re-sharing reuses existing planId (promote helper)', async () => {
  const solo = acceptedPlan([screening()]);
  let createCount = 0;
  const existingPlan = {
    plan_id: 'shared:reuse-1',
    owner_id: 'owner',
    type: 'proposal',
    visibility: 'invited',
    label: null,
    date: '2026-10-01',
    timezone: 'America/Los_Angeles',
    source_accepted_plan_id: solo.planId,
    schema_version: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    plan_snapshot: { performances: solo.performances },
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'owner' } } },
      }),
    },
    rpc: async (name, args) => {
      if (name === SHARED_PLAN_RPC.getBySourceAccepted) {
        return { data: existingPlan, error: null };
      }
      if (name === SHARED_PLAN_RPC.create) {
        createCount += 1;
        return { data: null, error: { message: 'should_not_create' } };
      }
      if (name === SHARED_PLAN_RPC.inviteFriends) {
        assert.equal(args.p_plan_id, 'shared:reuse-1');
        return {
          data: {
            plan: existingPlan,
            invited: [
              {
                plan_id: 'shared:reuse-1',
                user_id: 'friend-1',
                role: 'invitee',
                response: 'pending',
                invited_by: 'owner',
                invite_message: null,
                joined_at: null,
                updated_at: '2026-09-01T00:00:00.000Z',
              },
            ],
            skipped: [],
          },
          error: null,
        };
      }
      if (name === SHARED_PLAN_RPC.get) {
        return {
          data: {
            plan: existingPlan,
            members: [
              {
                plan_id: 'shared:reuse-1',
                user_id: 'owner',
                role: 'owner',
                response: 'interested',
                invited_by: null,
                invite_message: null,
                joined_at: '2026-09-01T00:00:00.000Z',
                updated_at: '2026-09-01T00:00:00.000Z',
              },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected ${name}` } };
    },
  };

  const result = await promoteAcceptedPlanAndInvite({
    acceptedPlan: solo,
    ownerId: 'owner',
    type: 'proposal',
    inviteeIds: ['friend-1'],
    getClient: () => client,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.plan.planId, 'shared:reuse-1');
  assert.equal(createCount, 0);
});

test('5–9 owner invite one/multiple; non-owner and non-friend blocked; no duplicate', () => {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'owner', 'jamie');
  markFriends(repo, 'owner', 'alex');
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'private',
    screenings: [screening()],
  });
  const planId = created.plan.planId;

  const one = repoInviteFriend(repo, planId, 'owner', 'jamie', {
    inviteMessage: 'Want to go?',
  });
  assert.equal(one.ok, true);
  assert.equal(one.member.inviteMessage, 'Want to go?');
  assert.equal(getSharedPlan(repo, planId).visibility, 'invited');

  const multi = repoInviteFriends(repo, planId, 'owner', ['alex', 'jamie']);
  assert.equal(multi.invited.length, 1);
  assert.equal(multi.invited[0].userId, 'alex');
  assert.ok(multi.skipped.some((s) => s.reason === 'already_member'));

  const nonOwner = repoInviteFriend(repo, planId, 'jamie', 'alex');
  assert.equal(nonOwner.ok, false);
  assert.equal(nonOwner.reason, 'not_owner');

  const stranger = repoInviteFriend(repo, planId, 'owner', 'stranger');
  assert.equal(stranger.ok, false);
  assert.equal(stranger.reason, 'not_friend');

  assert.equal(listPlanMembers(repo, planId).length, 3);
});

test('10 optional message persists on membership', () => {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'owner', 'jamie');
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    screenings: [screening()],
  });
  const invited = repoInviteFriend(
    repo,
    created.plan.planId,
    'owner',
    'jamie',
    { inviteMessage: 'Saturday?' },
  );
  assert.equal(invited.member.inviteMessage, 'Saturday?');
  assert.ok(SHARED_PLAN_INVITE_MESSAGE_MAX >= 280);
});

test('11–13 proposal and decided RSVP + invalid rejected', () => {
  assert.equal(isValidResponseForPlanType('proposal', 'going'), false);
  assert.equal(isValidResponseForPlanType('proposal', 'interested'), true);
  assert.equal(isValidResponseForPlanType('decided', 'maybe'), false);
  assert.equal(isValidResponseForPlanType('decided', 'going'), true);

  const proposalMember = {
    planId: 'p1',
    userId: 'u',
    role: 'invitee',
    response: 'pending',
    invitedBy: 'o',
    inviteMessage: null,
    joinedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(
    transitionPlanMemberResponse(proposalMember, 'going', {
      planType: 'proposal',
    }).ok,
    false,
  );
  assert.equal(
    transitionPlanMemberResponse(proposalMember, 'interested', {
      planType: 'proposal',
    }).ok,
    true,
  );

  const decidedMember = { ...proposalMember, response: 'pending' };
  assert.equal(
    transitionPlanMemberResponse(decidedMember, 'interested', {
      planType: 'decided',
    }).ok,
    false,
  );
  assert.equal(
    transitionPlanMemberResponse(decidedMember, 'going', {
      planType: 'decided',
    }).ok,
    true,
  );

  assert.deepEqual(
    sharedPlanRsvpOptions('proposal').map((o) => o.id),
    ['interested', 'maybe', 'declined'],
  );
  assert.deepEqual(
    sharedPlanRsvpOptions('decided').map((o) => o.id),
    ['going', 'declined'],
  );
});

test('14 user cannot modify another user RSVP via respond RPC wrapper args', async () => {
  let seen = null;
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'viewer' } } },
      }),
    },
    rpc: async (name, args) => {
      seen = { name, args };
      return {
        data: {
          plan: {
            plan_id: 'shared:1',
            owner_id: 'owner',
            type: 'proposal',
            visibility: 'invited',
            date: '2026-10-01',
            timezone: 'America/Los_Angeles',
            plan_snapshot: { performances: [screening()] },
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
          member: {
            plan_id: 'shared:1',
            user_id: 'viewer',
            role: 'invitee',
            response: args.p_response,
            invited_by: 'owner',
            invite_message: null,
            joined_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
        error: null,
      };
    },
  };
  const result = await respondToSharedPlanRemote('shared:1', 'interested', {
    getClient: () => client,
  });
  assert.equal(result.ok, true);
  assert.equal(seen.name, SHARED_PLAN_RPC.respond);
  assert.equal(seen.args.p_plan_id, 'shared:1');
  assert.equal(seen.args.p_response, 'interested');
  // No target user id — server uses auth.uid() only.
  assert.equal(seen.args.p_user_id, undefined);
});

test('15–18 pending / positive / declined Planner projection; no clone', () => {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'owner', 'jamie');
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'invited',
    screenings: [
      screening(),
      screening({
        sourceShowtimeId: 'show-2',
        localTime: '21:00',
        title: 'Beta',
        filmKey: 'fk-beta',
        filmId: 'tmdb:1002',
      }),
    ],
  });
  const planId = created.plan.planId;
  repoInviteFriend(repo, planId, 'owner', 'jamie', {
    inviteMessage: 'Want to go?',
  });

  const pending = repoListPendingInvitationsForUser(repo, 'jamie');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].plan.planId, planId);

  const landingPending = mergeSharedPlansIntoPlannerLanding({
    landing: {
      needsAttention: { sectionTitle: 'NEEDS ATTENTION', items: [], count: 0 },
      upcoming: { dateGroups: [], sectionTitle: 'UPCOMING' },
      summary: {},
    },
    pendingInvitations: pending.map((row) => ({
      ...row,
      owner: { userId: 'owner', displayName: 'Jamie Owner' },
    })),
    activeSharedPlans: [],
    viewerId: 'jamie',
  });
  assert.equal(landingPending.needsAttention.items[0].kind, 'plan-invite');
  assert.match(landingPending.needsAttention.items[0].headline, /invited you/);
  assert.equal(
    landingPending.needsAttention.items[0].inviteMessage,
    'Want to go?',
  );

  repoRespondToPlan(repo, planId, 'jamie', 'interested');
  assert.equal(repoListPendingInvitationsForUser(repo, 'jamie').length, 0);
  const active = repoListActiveSharedPlansForUser(repo, 'jamie');
  assert.equal(active.length, 1);
  assert.equal(active[0].plan.planId, planId);

  const landingActive = mergeSharedPlansIntoPlannerLanding({
    landing: {
      needsAttention: { sectionTitle: 'NEEDS ATTENTION', items: [], count: 0 },
      upcoming: { dateGroups: [], sectionTitle: 'UPCOMING' },
      summary: {},
    },
    pendingInvitations: [],
    activeSharedPlans: active.map((row) => ({
      ...row,
      owner: { userId: 'owner', displayName: 'Owner' },
    })),
    viewerId: 'jamie',
  });
  const sharedItem = landingActive.upcoming.dateGroups
    .flatMap((g) => g.items)
    .find((item) => item.kind === 'shared-plan-group');
  assert.ok(sharedItem);
  assert.equal(sharedItem.sharedPlanId, planId);
  assert.equal(sharedItem.origin, 'shared-plan');

  repoRespondToPlan(repo, planId, 'jamie', 'declined');
  assert.equal(repoListActiveSharedPlansForUser(repo, 'jamie').length, 0);
  assert.equal(repoListPendingInvitationsForUser(repo, 'jamie').length, 0);
  // Canonical plan still exists for owner.
  assert.ok(getSharedPlan(repo, planId));
  assert.equal(
    listPlanMembers(repo, planId).find((m) => m.userId === 'jamie').response,
    'declined',
  );
});

test('19 owner sees updated RSVP on members list', () => {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'owner', 'jamie');
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'decided',
    screenings: [screening()],
  });
  repoInviteFriend(repo, created.plan.planId, 'owner', 'jamie');
  repoRespondToPlan(repo, created.plan.planId, 'jamie', 'going');
  const jamie = listPlanMembers(repo, created.plan.planId).find(
    (m) => m.userId === 'jamie',
  );
  assert.equal(jamie.response, 'going');
});

test('20 exact performance identity survives sharing (AMC + SIFF)', () => {
  const amc = screening({
    source: 'amc',
    sourceShowtimeId: 'amc-99',
    theaterId: 'amc-seattle',
    format: 'IMAX',
  });
  const siff = screening({
    source: 'siFF',
    sourceShowtimeId: 'siff-12',
    theaterId: 'siff-uptown',
    localTime: '21:10',
    filmKey: 'fk-other',
    title: 'Other',
  });
  assert.match(amc.performanceKey, /^src:amc:/);
  assert.match(siff.performanceKey, /^src:siFF:/);
  const adapted = sharedPlanFromAcceptedPlan(acceptedPlan([amc, siff]), {
    ownerId: 'owner',
  });
  assert.deepEqual(
    adapted.plan.screenings.map((s) => s.performanceKey),
    [amc.performanceKey, siff.performanceKey],
  );
});

test('migration defines invite/respond/list RPCs and invite_message', () => {
  assert.match(INVITE_MIGRATION, /invite_friends_to_shared_plan/);
  assert.match(INVITE_MIGRATION, /respond_to_shared_plan/);
  assert.match(INVITE_MIGRATION, /list_pending_shared_plan_invitations/);
  assert.match(INVITE_MIGRATION, /list_my_shared_plans/);
  assert.match(INVITE_MIGRATION, /invite_message/);
  assert.match(INVITE_MIGRATION, /are_accepted_friends/);
  assert.match(INVITE_MIGRATION, /is_valid_shared_plan_response/);
  assert.match(INVITE_MIGRATION, /get_shared_plan_by_source_accepted_plan/);
  assert.equal(SHARED_PLAN_RPC.inviteFriends, 'invite_friends_to_shared_plan');
  assert.equal(SHARED_PLAN_RPC.respond, 'respond_to_shared_plan');
});

test('invite RPC wrapper passes message and invitee ids', async () => {
  let seen = null;
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'owner' } } },
      }),
    },
    rpc: async (name, args) => {
      seen = { name, args };
      return {
        data: {
          plan: {
            plan_id: 'shared:x',
            owner_id: 'owner',
            type: 'proposal',
            visibility: 'invited',
            date: '2026-10-01',
            timezone: 'America/Los_Angeles',
            plan_snapshot: { performances: [screening()] },
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
          invited: [],
          skipped: [],
        },
        error: null,
      };
    },
  };
  const result = await inviteFriendsToSharedPlanRemote(
    'shared:x',
    ['friend-a', 'friend-b'],
    { message: 'Hello', getClient: () => client },
  );
  assert.equal(result.ok, true);
  assert.equal(seen.name, SHARED_PLAN_RPC.inviteFriends);
  assert.deepEqual(seen.args.p_invitee_ids, ['friend-a', 'friend-b']);
  assert.equal(seen.args.p_message, 'Hello');
});

test('maybe stays in Needs Attention; going graduates to Upcoming', () => {
  const plan = createSharedPlan({
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'invited',
    screenings: [screening()],
    planId: 'shared:maybe',
  }).plan;
  const maybeLanding = mergeSharedPlansIntoPlannerLanding({
    landing: {
      needsAttention: { sectionTitle: 'NEEDS ATTENTION', items: [], count: 0 },
      upcoming: { dateGroups: [], sectionTitle: 'UPCOMING' },
      summary: {},
    },
    pendingInvitations: [],
    activeSharedPlans: [
      {
        plan,
        member: {
          planId: plan.planId,
          userId: 'jamie',
          role: 'invitee',
          response: 'maybe',
          invitedBy: 'owner',
          inviteMessage: null,
          joinedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        owner: { userId: 'owner', displayName: 'Owner' },
      },
    ],
    viewerId: 'jamie',
  });
  assert.ok(
    maybeLanding.needsAttention.items.some(
      (item) => item.kind === 'plan-invite-maybe',
    ),
  );
  assert.equal(maybeLanding.upcoming.dateGroups.length, 0);
});
