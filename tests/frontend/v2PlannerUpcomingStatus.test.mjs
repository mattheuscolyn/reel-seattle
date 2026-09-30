import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import { mergeSharedPlansIntoPlannerLanding } from '../../v2/planner/mergeSharedPlansIntoPlannerLanding.js';
import {
  formatPlanInvitesSummary,
  formatUpcomingScheduleLine,
  listUpcomingAttendees,
  planInvitesNavigation,
  upcomingAttendance,
  upcomingTicketLabel,
} from '../../v2/planner/plannerUpcomingStatus.js';
import {
  getAcceptedPlans,
  setAcceptedPlanPerformanceTicketsPurchased,
} from '../../v2/stores/acceptedPlansStore.js';
import { createSharedPlan } from '../../v2/sharedPlans/sharedPlanModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function invite(planId, ownerId, name) {
  return {
    plan: { planId },
    owner: { userId: ownerId, displayName: name },
  };
}

test('Plan invites summary names outstanding invitations and hides an empty list', () => {
  assert.equal(formatPlanInvitesSummary([]), null);
  assert.equal(formatPlanInvitesSummary(null), null);

  const summary = formatPlanInvitesSummary([
    invite('shared:1', 'shelley', 'Shelley!'),
    invite('shared:2', 'alex', 'Alex'),
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.title, 'Plan invites');
  assert.equal(summary.subtitle, 'Shelley! and Alex invited you to plans.');
  assert.deepEqual(summary.planIds, ['shared:1', 'shared:2']);
});

test('one invitation uses singular copy and opens that plan', () => {
  const summary = formatPlanInvitesSummary([
    invite('shared:only', 'shelley', 'Shelley!'),
  ]);
  assert.equal(summary.count, 1);
  assert.equal(summary.subtitle, 'Shelley! invited you to a plan.');
  assert.deepEqual(planInvitesNavigation(summary), {
    kind: 'plan',
    planId: 'shared:only',
  });
});

test('several invitations open the existing invite list', () => {
  const summary = formatPlanInvitesSummary([
    invite('shared:1', 'shelley', 'Shelley!'),
    invite('shared:2', 'alex', 'Alex'),
  ]);
  assert.deepEqual(planInvitesNavigation(summary), {
    kind: 'list',
    planIds: ['shared:1', 'shared:2'],
  });
});

test('Planner invites card reuses plan detail and the invite list', () => {
  assert.match(PLANNER_SRC, /data-planner-section="plan-invites"/);
  assert.match(PLANNER_SRC, /openPlanInvites/);
  assert.match(PLANNER_SRC, /planInvitesNavigation/);
  assert.match(PLANNER_SRC, /openSharedPlanDetail\(target\.planId\)/);
  assert.match(PLANNER_SRC, /data-plan-invites-list/);
  assert.match(PLANNER_SRC, /openReviewOptions\(item\)/);
  assert.match(PLANNER_SRC, /role="tablist"/);
  assert.match(PLANNER_SRC, /Saved films|saved-films/);
  assert.match(PLANNER_SRC, /id="v2-planner-saved-panel"|v2-planner-saved-panel/);
});

test('friend attendance uses people icon and avatars; solo uses Going solo', () => {
  const friends = listUpcomingAttendees({
    owner: { userId: 'shelley', displayName: 'Shelley!', avatarUrl: null },
    viewerId: 'you',
    planType: 'decided',
    companions: [
      { userId: 'alex', displayName: 'Alex', response: 'going', avatarUrl: null },
      { userId: 'pat', displayName: 'Pat', response: 'pending', avatarUrl: null },
    ],
  });
  assert.deepEqual(
    friends.map((person) => person.displayName),
    ['Shelley!', 'Alex'],
  );
  const attendance = upcomingAttendance(friends);
  assert.equal(attendance.mode, 'friends');
  assert.equal(attendance.people.length, 2);
  assert.equal(attendance.overflow, 0);

  const solo = upcomingAttendance([]);
  assert.equal(solo.mode, 'solo');
  assert.match(PLANNER_SRC, /IconPeople/);
  assert.match(PLANNER_SRC, /Going solo/);
  assert.match(PLANNER_SRC, /IconPerson/);
});

test('ticket labels stay needed or purchased without a new model', () => {
  assert.equal(upcomingTicketLabel(false), 'Tickets needed');
  assert.equal(upcomingTicketLabel(true), 'Tickets purchased');
  assert.match(PLANNER_SRC, /upcomingTicketLabel\(purchased\)/);
  assert.match(PLANNER_SRC, /is-needed/);
  assert.match(PLANNER_SRC, /is-purchased/);
});

test('solo and friend cards share one fixed status-row grid', () => {
  assert.match(
    CSS,
    /\.v2-planner-status-row\s*\{[^}]*grid-template-columns:\s*var\(--v2-planner-attendance-width\)\s+1px\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(CSS, /--v2-planner-attendance-width:\s*7\.5rem/);
  assert.equal(
    (PLANNER_SRC.match(/v2-planner-status-row/g) || []).length >= 1,
    true,
  );
  assert.equal(PLANNER_SRC.includes('v2-planner-status-row-solo'), false);
  assert.equal(PLANNER_SRC.includes('v2-planner-status-row-friends'), false);
});

test('schedule line uses a real runtime and ticket state stays per screening', () => {
  assert.equal(
    formatUpcomingScheduleLine({
      timeLabel: '7:30 PM',
      startsAt: '2026-09-29T19:30:00-07:00',
      runtimeMin: 102,
      timeFormatId: '12h',
    }),
    '7:30 PM \u2013 9:12 PM (1h 42m)',
  );
  assert.equal(
    formatUpcomingScheduleLine({
      timeLabel: '7:00 PM',
      startsAt: '2026-10-01T19:00:00-07:00',
      runtimeMin: 0,
    }),
    '7:00 PM',
  );

  const storage = memoryStorage();
  acceptResultsPlan(
    {
      id: 'live-ticket',
      provenance: 'live',
      source: 'live',
      date: '2026-10-01',
      items: [
        {
          type: 'film',
          localDate: '2026-10-01',
          date: '2026-10-01',
          localTime: '19:00',
          time: '19:00',
          title: 'Moonlight',
          filmKey: 'src:nwff:moonlight',
          filmId: 'tmdb:376867',
          source: 'nwff',
          sourceShowtimeId: 'st-moon',
          theaterId: 'nwff',
          theaterName: 'Northwest Film Forum',
          runtimeMin: 111,
          runtime: 111,
          format: 'Digital',
        },
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  const plan = getAcceptedPlans(storage)[0];
  const key = plan.performances[0].performanceKey;
  const before = composePlannerLandingFromAcceptedPlans({
    storage,
    now: new Date('2026-09-29T12:00:00-07:00'),
  });
  const beforeRow = before.upcoming.dateGroups[0].items[0];
  assert.equal(beforeRow.ticketsPurchased, false);
  assert.equal(beforeRow.formatLabel, 'Digital');
  assert.match(beforeRow.scheduleLabel, /7:00 PM/);
  assert.match(beforeRow.scheduleLabel, /1h 51m/);

  setAcceptedPlanPerformanceTicketsPurchased(storage, plan.planId, key, true);
  const after = composePlannerLandingFromAcceptedPlans({
    storage,
    now: new Date('2026-09-29T12:00:00-07:00'),
  });
  assert.equal(after.upcoming.dateGroups[0].items[0].ticketsPurchased, true);
});

test('shared upcoming cards carry friend attendees and pending invites stay summarized', () => {
  const plan = createSharedPlan({
    ownerId: 'shelley',
    type: 'decided',
    visibility: 'invited',
    date: '2026-09-30',
    screenings: [
      {
        performanceKey: 'perf-pm2',
        title: 'Practical Magic 2',
        theaterId: 'amc-alderwood',
        theaterName: 'AMC Alderwood Mall 16',
        localDate: '2026-09-30',
        localTime: '19:45',
        startsAt: '2026-09-30T19:45:00-07:00',
        expectedEndsAt: '2026-09-30T21:35:00-07:00',
        runtimeMin: 110,
        format: 'IMAX',
        ticketsPurchased: false,
      },
    ],
    planId: 'shared:pm2',
  }).plan;

  const landing = mergeSharedPlansIntoPlannerLanding({
    landing: {
      needsAttention: { sectionTitle: 'NEEDS ATTENTION', items: [], count: 0 },
      upcoming: { dateGroups: [], sectionTitle: 'UPCOMING' },
      summary: {},
    },
    pendingInvitations: [
      {
        plan,
        member: { inviteMessage: 'Come with us' },
        owner: { userId: 'shelley', displayName: 'Shelley!' },
      },
      {
        plan: { ...plan, planId: 'shared:alex' },
        member: {},
        owner: { userId: 'alex', displayName: 'Alex' },
      },
    ],
    activeSharedPlans: [
      {
        plan,
        member: { response: 'going', userId: 'you' },
        owner: { userId: 'shelley', displayName: 'Shelley!', avatarUrl: null },
        companions: [
          { userId: 'alex', displayName: 'Alex', response: 'going', avatarUrl: null },
        ],
      },
    ],
    viewerId: 'you',
  });

  assert.equal(landing.planInvites.count, 2);
  assert.equal(
    landing.planInvites.subtitle,
    'Shelley! and Alex invited you to plans.',
  );
  assert.equal(landing.needsAttention.items[0].kind, 'plan-invite');

  const group = landing.upcoming.dateGroups
    .flatMap((day) => day.items)
    .find((item) => item.kind === 'shared-plan-group');
  assert.ok(group);
  assert.deepEqual(
    group.members[0].attendees.map((person) => person.displayName),
    ['Shelley!', 'Alex'],
  );
  assert.equal(group.members[0].ticketsPurchased, false);
  assert.equal(group.members[0].formatLabel, 'IMAX');
});
