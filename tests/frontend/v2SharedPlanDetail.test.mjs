/**
 * Shared Plan Detail destination tests (post #105).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';
import {
  createSharedPlan,
} from '../../v2/sharedPlans/sharedPlanModel.js';
import {
  formatSharedPlanWithLine,
  formatSharedPlanResponseLabel,
  sharedPlanStateBadge,
  sharedPlanRsvpOptions,
  sharedPlanDisplayTitle,
  SHARED_PLAN_DETAIL_SURFACE_TYPE,
} from '../../v2/sharedPlans/sharedPlanCopy.js';
import {
  createInitialNavState,
  openSharedPlanDetail,
  navigateBack,
} from '../../v2/navigation/navState.js';
import { resolveHeaderBackLabel } from '../../v2/destinations.js';
import { mergeSharedPlansIntoPlannerLanding } from '../../v2/planner/mergeSharedPlansIntoPlannerLanding.js';
import { isAuthSensitiveSurfaceType } from '../../v2/navigation/primaryTabSessions.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DETAIL_SRC = readFileSync(
  join(ROOT, 'v2/sharedPlans/SharedPlanDetailSurface.jsx'),
  'utf8',
);
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/20260929000000_shared_plan_companions.sql'),
  'utf8',
);

function screening(overrides = {}) {
  return {
    performanceKey: buildPerformanceKey({
      source: overrides.source ?? 'siFF',
      sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
      theaterId: overrides.theaterId ?? 'theater-a',
      filmKey: overrides.filmKey ?? 'fk-alpha',
      localDate: overrides.localDate ?? '2026-10-10',
      localTime: overrides.localTime ?? '16:00',
    }),
    filmId: overrides.filmId ?? 'tmdb:1001',
    filmKey: overrides.filmKey ?? 'fk-alpha',
    title: overrides.title ?? 'Movie A',
    theaterId: overrides.theaterId ?? 'theater-a',
    theaterName: overrides.theaterName ?? 'SIFF Cinema Uptown',
    source: overrides.source ?? 'siFF',
    sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
    opportunityKey: null,
    localDate: overrides.localDate ?? '2026-10-10',
    localTime: overrides.localTime ?? '16:00',
    startsAt: overrides.startsAt ?? '2026-10-10T23:00:00.000Z',
    expectedEndsAt: overrides.expectedEndsAt ?? '2026-10-11T01:00:00.000Z',
    runtimeMin: 120,
    format: overrides.format ?? null,
    ticketUrl: null,
    addressLabel: null,
    posterUrl: overrides.posterUrl ?? null,
    ...overrides,
  };
}

test('1–2 owner and member open same canonical planId surface', () => {
  const nav = openSharedPlanDetail(createInitialNavState(), {
    planId: 'shared:abc',
    originPrimary: 'planner',
  });
  assert.equal(nav.surface.type, SHARED_PLAN_DETAIL_SURFACE_TYPE);
  assert.equal(nav.surface.planId, 'shared:abc');
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(resolveHeaderBackLabel(nav), 'Planner');
  assert.equal(isAuthSensitiveSurfaceType(SHARED_PLAN_DETAIL_SURFACE_TYPE), true);
});

test('3–4 single and multi-film titles / itinerary order preserved in model', () => {
  const single = createSharedPlan({
    ownerId: 'owner',
    type: 'proposal',
    screenings: [screening()],
    planId: 'shared:one',
  });
  assert.equal(sharedPlanDisplayTitle(single.plan), 'Movie A');

  const multi = createSharedPlan({
    ownerId: 'owner',
    type: 'decided',
    screenings: [
      screening({ sourceShowtimeId: 'a', localTime: '16:00', title: 'Movie A' }),
      screening({
        sourceShowtimeId: 'b',
        localTime: '18:30',
        title: 'Movie B',
        filmKey: 'fk-b',
        filmId: 'tmdb:2',
      }),
      screening({
        sourceShowtimeId: 'c',
        localTime: '21:15',
        title: 'Movie C',
        filmKey: 'fk-c',
        filmId: 'tmdb:3',
      }),
    ],
    planId: 'shared:multi',
  });
  assert.deepEqual(
    multi.plan.screenings.map((s) => s.title),
    ['Movie A', 'Movie B', 'Movie C'],
  );
  assert.equal(sharedPlanDisplayTitle(multi.plan), 'Movie A + 2 more');
  assert.match(multi.plan.screenings[0].performanceKey, /^src:/);
});

test('5–6 proposal vs decided vocabulary', () => {
  assert.equal(sharedPlanStateBadge('proposal'), 'Proposal');
  assert.equal(sharedPlanStateBadge('decided'), 'Going');
  assert.deepEqual(
    sharedPlanRsvpOptions('proposal').map((o) => o.id),
    ['interested', 'maybe', 'declined'],
  );
  assert.deepEqual(
    sharedPlanRsvpOptions('decided').map((o) => o.id),
    ['going', 'declined'],
  );
  assert.equal(
    formatSharedPlanResponseLabel('interested', 'decided'),
    'Needs response',
  );
  assert.equal(formatSharedPlanResponseLabel('going', 'decided'), 'Going');
});

test('7–9 RSVP options exclude invalid plan-type responses', () => {
  assert.equal(
    sharedPlanRsvpOptions('proposal').some((o) => o.id === 'going'),
    false,
  );
  assert.equal(
    sharedPlanRsvpOptions('decided').some((o) => o.id === 'maybe'),
    false,
  );
  assert.match(DETAIL_SRC, /respondToSharedPlanRemote/);
  assert.match(DETAIL_SRC, /sharedPlanRsvpOptions/);
});

test('10–12 organizer note + people section present in detail surface', () => {
  assert.match(DETAIL_SRC, /organizerNote/);
  assert.match(DETAIL_SRC, /People/);
  assert.match(DETAIL_SRC, /Itinerary/);
  assert.match(DETAIL_SRC, /Invite more friends/);
});

test('13–14 Planner opens shared-plan detail (not invite sheet)', () => {
  assert.match(PLANNER_SRC, /onOpenSharedPlan/);
  assert.match(PLANNER_SRC, /openSharedPlanDetail/);
  assert.equal(PLANNER_SRC.includes('SharedPlanInviteDetailSheet'), false);
  assert.match(APP_SRC, /SharedPlanDetailSurface/);
  assert.match(APP_SRC, /openSharedPlanDetail/);
});

test('15 With Jamie +N excludes owner, self, pending, declined', () => {
  const line = formatSharedPlanWithLine({
    ownerId: 'owner',
    viewerId: 'viewer',
    members: [
      { userId: 'owner', role: 'owner', response: 'going', displayName: 'Owner' },
      {
        userId: 'viewer',
        role: 'invitee',
        response: 'interested',
        displayName: 'You',
      },
      {
        userId: 'jamie',
        role: 'invitee',
        response: 'interested',
        displayName: 'Jamie',
      },
      {
        userId: 'alex',
        role: 'invitee',
        response: 'maybe',
        displayName: 'Alex',
      },
      {
        userId: 'chris',
        role: 'invitee',
        response: 'declined',
        displayName: 'Chris',
      },
      {
        userId: 'pat',
        role: 'invitee',
        response: 'pending',
        displayName: 'Pat',
      },
    ],
  });
  assert.equal(line, 'With Jamie +1');

  const fromCompanions = formatSharedPlanWithLine({
    ownerId: 'owner',
    viewerId: 'owner',
    companions: [
      { userId: 'jamie', displayName: 'Jamie', response: 'interested' },
      { userId: 'alex', displayName: 'Alex', response: 'going' },
      { userId: 'chris', displayName: 'Chris', response: 'going' },
    ],
  });
  assert.equal(fromCompanions, 'With Jamie +2');
});

test('16 merge attaches With line to shared-plan-group without cloning AcceptedPlan', () => {
  const plan = createSharedPlan({
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'invited',
    screenings: [screening()],
    planId: 'shared:with',
  }).plan;
  const landing = mergeSharedPlansIntoPlannerLanding({
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
          response: 'interested',
          invitedBy: 'owner',
          inviteMessage: null,
          joinedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        companions: [
          { userId: 'alex', displayName: 'Alex', response: 'interested' },
        ],
        owner: { userId: 'owner', displayName: 'Owner' },
      },
    ],
    viewerId: 'jamie',
  });
  const group = landing.upcoming.dateGroups
    .flatMap((g) => g.items)
    .find((item) => item.kind === 'shared-plan-group');
  assert.ok(group);
  assert.equal(group.sharedPlanId, 'shared:with');
  assert.equal(group.metaLine, 'With Alex');
  assert.equal(group.origin, 'shared-plan');
});

test('17 navigateBack restores Planner from shared-plan detail', () => {
  const opened = openSharedPlanDetail(createInitialNavState(), {
    planId: 'shared:back',
    originPrimary: 'planner',
  });
  const back = navigateBack(opened);
  assert.equal(back.surface, null);
  assert.equal(back.primaryDestinationId, 'planner');
});

test('18–20 migration companions + no plan clone architecture', () => {
  assert.match(MIGRATION, /companions/);
  assert.match(MIGRATION, /list_my_shared_plans/);
  assert.match(DETAIL_SRC, /getSharedPlanRemote/);
  assert.equal(DETAIL_SRC.includes('acceptPlan'), false);
  assert.equal(DETAIL_SRC.includes('buildAcceptedPlanItem'), false);
});
