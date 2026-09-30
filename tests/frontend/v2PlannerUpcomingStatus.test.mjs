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
  upcomingPlanPositionLabel,
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

  const card = landing.upcoming.dateGroups
    .flatMap((day) => day.items)
    .find((item) => item.origin === 'shared-plan');
  assert.ok(card);
  assert.equal(card.kind, 'screening');
  assert.deepEqual(
    card.attendees.map((person) => person.displayName),
    ['Shelley!', 'Alex'],
  );
  assert.equal(card.ticketsPurchased, false);
  assert.equal(card.formatLabel, 'IMAX');
  assert.equal(card.planFilmCount, null);
});

function upcomingFilm(overrides) {
  return {
    type: 'film',
    localDate: '2026-09-30',
    date: '2026-09-30',
    source: 'amc',
    theaterId: 'amc-alderwood',
    theaterName: 'AMC Alderwood Mall 16',
    runtimeMin: 110,
    runtime: 110,
    format: 'Digital',
    ...overrides,
  };
}

function acceptUpcomingPlan(storage, id, films) {
  return acceptResultsPlan(
    {
      id,
      provenance: 'live',
      source: 'live',
      date: films[0].date,
      items: films,
    },
    [],
    { storage, provenance: 'live' },
  );
}

test('multi-film plans flatten to standalone cards with chronological X of N', () => {
  assert.equal(upcomingPlanPositionLabel({ planFilmCount: 1, planFilmIndex: 1 }), null);
  assert.equal(upcomingPlanPositionLabel({ planFilmCount: null }), null);
  assert.equal(
    upcomingPlanPositionLabel({ planFilmCount: 3, planFilmIndex: 2 }),
    '2 of 3',
  );

  const storage = memoryStorage();
  const multi = acceptUpcomingPlan(storage, 'live-two', [
    upcomingFilm({
      title: 'Avengers: Endgame',
      filmKey: 'src:amc:endgame',
      sourceShowtimeId: 'endgame',
      localTime: '22:00',
      time: '22:00',
      runtimeMin: 181,
      runtime: 181,
    }),
    upcomingFilm({
      title: 'Practical Magic 2',
      filmKey: 'src:amc:practical',
      sourceShowtimeId: 'practical',
      localTime: '19:45',
      time: '19:45',
    }),
  ]);
  acceptUpcomingPlan(storage, 'live-three', [
    upcomingFilm({
      title: 'Gamma',
      filmKey: 'src:amc:gamma',
      sourceShowtimeId: 'gamma',
      localTime: '16:30',
      time: '16:30',
      date: '2026-10-02',
      localDate: '2026-10-02',
    }),
    upcomingFilm({
      title: 'Alpha',
      filmKey: 'src:amc:alpha',
      sourceShowtimeId: 'alpha',
      localTime: '12:00',
      time: '12:00',
      date: '2026-10-02',
      localDate: '2026-10-02',
    }),
    upcomingFilm({
      title: 'Beta',
      filmKey: 'src:amc:beta',
      sourceShowtimeId: 'beta',
      localTime: '14:15',
      time: '14:15',
      date: '2026-10-02',
      localDate: '2026-10-02',
    }),
  ]);
  const solo = acceptUpcomingPlan(storage, 'live-solo', [
    upcomingFilm({
      title: 'Moonlight',
      filmKey: 'src:nwff:moonlight',
      source: 'nwff',
      sourceShowtimeId: 'moon',
      theaterId: 'nwff',
      theaterName: 'Northwest Film Forum',
      localTime: '18:00',
      time: '18:00',
    }),
  ]);

  const landing = composePlannerLandingFromAcceptedPlans({
    storage,
    now: new Date('2026-09-29T12:00:00-07:00'),
  });
  const sep30 = landing.upcoming.dateGroups.find(
    (group) => group.dateKey === '2026-09-30',
  );
  const oct2 = landing.upcoming.dateGroups.find(
    (group) => group.dateKey === '2026-10-02',
  );
  assert.ok(sep30);
  assert.ok(oct2);

  const sepItems = sep30.items;
  assert.equal(sepItems.length, 3);
  assert.equal(sepItems.some((item) => item.kind === 'plan-group'), false);
  assert.deepEqual(
    sepItems.map((item) => item.title),
    ['Moonlight', 'Practical Magic 2', 'Avengers: Endgame'],
  );
  assert.equal(upcomingPlanPositionLabel(sepItems[0]), null);
  assert.equal(sepItems[0].planId, solo.plan.planId);
  assert.equal(upcomingPlanPositionLabel(sepItems[1]), '1 of 2');
  assert.equal(upcomingPlanPositionLabel(sepItems[2]), '2 of 2');
  assert.equal(sepItems[1].planId, multi.plan.planId);
  assert.equal(sepItems[2].planId, multi.plan.planId);
  assert.equal(sepItems[1].planFilmCount, 2);
  assert.equal(sepItems[2].planFilmCount, 2);
  assert.deepEqual(
    sepItems.map((item) => upcomingAttendance(item.attendees).mode),
    ['solo', 'solo', 'solo'],
  );

  assert.deepEqual(
    oct2.items.map((item) => [
      item.title,
      upcomingPlanPositionLabel(item),
      item.planFilmIndex,
    ]),
    [
      ['Alpha', '1 of 3', 1],
      ['Beta', '2 of 3', 2],
      ['Gamma', '3 of 3', 3],
    ],
  );
  assert.equal(oct2.items.every((item) => item.planFilmCount === 3), true);
  assert.equal(oct2.items.every((item) => item.kind === 'screening'), true);
});

test('shared multi-film plans stay one planId across standalone cards', () => {
  const plan = createSharedPlan({
    ownerId: 'shelley',
    type: 'decided',
    visibility: 'invited',
    date: '2026-09-30',
    screenings: [
      {
        performanceKey: 'perf-late',
        title: 'Avengers: Endgame',
        theaterId: 'amc-alderwood',
        theaterName: 'AMC Alderwood Mall 16',
        localDate: '2026-09-30',
        localTime: '22:00',
        startsAt: '2026-09-30T22:00:00-07:00',
        expectedEndsAt: '2026-10-01T01:01:00-07:00',
        runtimeMin: 181,
        ticketsPurchased: true,
      },
      {
        performanceKey: 'perf-early',
        title: 'Practical Magic 2',
        theaterId: 'amc-alderwood',
        theaterName: 'AMC Alderwood Mall 16',
        localDate: '2026-09-30',
        localTime: '19:45',
        startsAt: '2026-09-30T19:45:00-07:00',
        expectedEndsAt: '2026-09-30T21:35:00-07:00',
        runtimeMin: 110,
        ticketsPurchased: false,
      },
    ],
    planId: 'shared:double',
  }).plan;

  const landing = mergeSharedPlansIntoPlannerLanding({
    landing: {
      needsAttention: { sectionTitle: 'NEEDS ATTENTION', items: [], count: 0 },
      upcoming: { dateGroups: [], sectionTitle: 'UPCOMING' },
      summary: {},
    },
    pendingInvitations: [
      {
        plan: { ...plan, planId: 'shared:invite' },
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

  assert.equal(landing.planInvites.count, 1);
  assert.equal(landing.planInvites.subtitle, 'Alex invited you to a plan.');
  const cards = landing.upcoming.dateGroups.flatMap((day) => day.items);
  assert.equal(cards.length, 2);
  assert.equal(cards.some((item) => item.kind === 'shared-plan-group'), false);
  assert.deepEqual(
    cards.map((item) => [
      item.title,
      upcomingPlanPositionLabel(item),
      item.planId,
      item.sharedPlanId,
      item.origin,
      item.ticketsPurchased,
    ]),
    [
      ['Practical Magic 2', '1 of 2', 'shared:double', 'shared:double', 'shared-plan', false],
      ['Avengers: Endgame', '2 of 2', 'shared:double', 'shared:double', 'shared-plan', true],
    ],
  );
  assert.deepEqual(cards[0].attendees.map((person) => person.displayName), [
    'Shelley!',
    'Alex',
  ]);
  assert.deepEqual(cards[1].attendees.map((person) => person.displayName), [
    'Shelley!',
    'Alex',
  ]);
});

test('Upcoming cards keep the link indicator, status row, invites, and saved films', () => {
  assert.match(PLANNER_SRC, /upcomingPlanPositionLabel/);
  assert.match(PLANNER_SRC, /IconLink/);
  assert.match(PLANNER_SRC, /data-plan-position/);
  assert.match(PLANNER_SRC, /data-plan-id=\{screening\.planId\}/);
  assert.match(PLANNER_SRC, /sharedPlanId: screening\.sharedPlanId/);
  assert.match(PLANNER_SRC, /Going solo/);
  assert.match(PLANNER_SRC, /FriendAvatar/);
  assert.match(PLANNER_SRC, /data-planner-section="plan-invites"/);
  assert.match(PLANNER_SRC, /PlannerSavedFilmsPanel/);
  assert.equal(PLANNER_SRC.includes('PlanGroupCard'), false);
  assert.equal(PLANNER_SRC.includes('v2-planner-plan-group'), false);
  assert.match(CSS, /\.v2-planner-plan-position\b/);
  assert.match(
    CSS,
    /\.v2-planner-status-row\s*\{[^}]*grid-template-columns:\s*var\(--v2-planner-attendance-width\)\s+1px\s+minmax\(0,\s*1fr\)/,
  );
  assert.equal(CSS.includes('.v2-planner-plan-group'), false);
});
