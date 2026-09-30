/**
 * Canonical Plan Detail — one page for single-screening and multi-film plans.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveCanonicalPlanDetail } from '../../v2/planner/deriveCanonicalPlanDetail.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openFriendDetail,
  openPlanDetail,
  openSharedPlanDetail,
} from '../../v2/navigation/navState.js';
import { resolveHeaderBackLabel } from '../../v2/destinations.js';
import { PLAN_DETAIL_SURFACE_TYPE } from '../../v2/sharedPlans/sharedPlanCopy.js';
import { FRIEND_DETAIL_SURFACE_TYPE } from '../../v2/friends/friendsIds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const DETAIL_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlanDetailSurface.jsx'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');

function screening(overrides = {}) {
  return {
    performanceKey: overrides.performanceKey ?? `perf-${overrides.title ?? 'film'}`,
    filmId: overrides.filmId ?? 'tmdb:1',
    filmKey: overrides.filmKey ?? 'fk-film',
    title: overrides.title ?? 'A Bay of Blood',
    theaterId: overrides.theaterId ?? 'beacon',
    theaterName: overrides.theaterName ?? 'The Beacon',
    source: 'fixture',
    sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
    opportunityKey: overrides.opportunityKey ?? 'opp-1',
    localDate: overrides.localDate ?? '2026-09-29',
    localTime: overrides.localTime ?? '7:30 PM',
    startsAt: overrides.startsAt ?? '2026-09-30T02:30:00.000Z',
    expectedEndsAt: overrides.expectedEndsAt ?? '2026-09-30T04:12:00.000Z',
    runtimeMin: overrides.runtimeMin ?? 102,
    format: overrides.format ?? null,
    ticketUrl: overrides.ticketUrl ?? null,
    addressLabel: null,
    posterUrl: overrides.posterUrl ?? null,
    ticketsPurchased: overrides.ticketsPurchased === true,
  };
}

function detail(overrides = {}) {
  return deriveCanonicalPlanDetail({
    planId: 'accepted:2026-09-29:one',
    source: 'accepted',
    date: '2026-09-29',
    screenings: [screening()],
    viewerRole: 'solo',
    viewerSignedIn: true,
    localPlanId: 'accepted:2026-09-29:one',
    canToggleTickets: true,
    planType: 'decided',
    visibility: 'private',
    ...overrides,
  });
}

test('single private plan stays compact and uses the film title', () => {
  const view = detail();
  assert.equal(view.title, 'A Bay of Blood');
  assert.equal(view.isMulti, false);
  assert.equal(view.showMovieDay, false);
  assert.equal(view.filmCountLabel, null);
  assert.equal(view.peopleMode, 'compact');
  assert.equal(view.people.length, 1);
  assert.equal(view.people[0].displayName, 'You');
  assert.equal(view.people[0].responseLabel, 'Going');
  assert.equal(view.theaterSummary, 'The Beacon');
  assert.equal(view.sharing.label, 'Only you can see this plan');
  assert.equal(view.permissions.canRemove, true);
  assert.equal(view.permissions.canInvite, true);
  assert.equal(view.itinerary.filter((row) => row.kind === 'film').length, 1);
  assert.match(view.dateLabel, /September 29, 2026/);
  assert.equal(view.addScreening.available, false);
  assert.match(DETAIL_SRC, /Invite friends/);
  assert.match(DETAIL_SRC, /view\.showMovieDay/);
  assert.doesNotMatch(DETAIL_SRC, /Add another movie/);
  assert.doesNotMatch(DETAIL_SRC, /1-film plan/);
});

test('single shared plan shows participants and sharing without a second response card', () => {
  const view = detail({
    planId: 'shared:bay',
    source: 'shared',
    visibility: 'invited',
    viewerRole: 'owner',
    people: [
      {
        userId: 'me',
        displayName: 'You',
        response: 'going',
        isSelf: true,
        isOwner: true,
      },
      {
        userId: 'shelley',
        displayName: 'Shelley',
        response: 'going',
        isSelf: false,
      },
    ],
  });
  assert.equal(view.peopleMode, 'list');
  assert.deepEqual(
    view.people.map((person) => [person.displayName, person.responseLabel]),
    [
      ['You', 'Going'],
      ['Shelley', 'Going'],
    ],
  );
  assert.equal(view.sharing.label, 'Specific friends can see this plan');
  assert.equal(view.permissions.canManageSharing, true);
  assert.equal(view.permissions.canRespond, false);
  assert.match(DETAIL_SRC, /canRespond && view\.permissions\.rsvpOptions/);
});

test('multi-film plan uses Movie Day naming, elapsed time, and one theater only when true', () => {
  const view = detail({
    planId: 'accepted:day',
    label: null,
    screenings: [
      screening({
        title: 'Practical Magic 2',
        filmKey: 'pm2',
        performanceKey: 'a',
        theaterName: 'AMC Alderwood',
        theaterId: 'amc',
      }),
      screening({
        title: 'Avengers: Endgame',
        filmKey: 'endgame',
        filmId: 'tmdb:2',
        performanceKey: 'b',
        sourceShowtimeId: 'show-2',
        localTime: '10:00 PM',
        startsAt: '2026-09-30T05:00:00.000Z',
        expectedEndsAt: '2026-09-30T08:01:00.000Z',
        runtimeMin: 181,
        theaterName: 'AMC Alderwood',
        theaterId: 'amc',
        format: 'Dolby Cinema',
      }),
    ],
  });
  assert.equal(view.showMovieDay, true);
  assert.equal(view.title, 'Your Movie Day Plan');
  assert.equal(view.filmCountLabel, '2 films');
  assert.equal(view.theaterSummary, 'AMC Alderwood');
  assert.match(view.statsLine, /2 films/);
  assert.match(view.scheduleLine, /total/);
  const namedView = deriveCanonicalPlanDetail({
    planId: 'accepted:named',
    date: '2026-09-29',
    label: 'Saturday double',
    screenings: [
      screening({ title: 'One', performanceKey: 'a' }),
      screening({
        title: 'Two',
        performanceKey: 'b',
        filmKey: 'two',
        startsAt: '2026-09-30T05:00:00.000Z',
        expectedEndsAt: '2026-09-30T07:00:00.000Z',
      }),
    ],
    viewerRole: 'solo',
    localPlanId: 'accepted:named',
    canToggleTickets: true,
  });
  assert.equal(namedView.title, 'Saturday double');
});

test('multi-film plan keeps a break between screenings', () => {
  const view = detail({
    screenings: [
      screening({
        title: 'First',
        performanceKey: 'a',
        startsAt: '2026-10-01T02:00:00.000Z',
        expectedEndsAt: '2026-10-01T04:00:00.000Z',
        runtimeMin: 120,
      }),
      screening({
        title: 'Second',
        performanceKey: 'b',
        filmKey: 'second',
        filmId: 'tmdb:2',
        startsAt: '2026-10-01T04:30:00.000Z',
        expectedEndsAt: '2026-10-01T06:20:00.000Z',
        runtimeMin: 110,
      }),
    ],
  });
  assert.deepEqual(
    view.itinerary.map((row) => row.kind),
    ['film', 'break', 'film'],
  );
  assert.equal(view.breakCount, 1);
  assert.match(view.statsLine, /1 break/);
  assert.match(view.itinerary[1].breakLabel, /Break/);
  assert.match(DETAIL_SRC, /data-itinerary="break"/);
});

test('participant statuses and owner vs non-owner permissions', () => {
  const people = [
    {
      userId: 'owner',
      displayName: 'Alex',
      response: 'going',
      isOwner: true,
      isSelf: false,
    },
    {
      userId: 'me',
      displayName: 'You',
      response: 'maybe',
      isSelf: true,
    },
    {
      userId: 'sam',
      displayName: 'Sam',
      response: 'pending',
      isSelf: false,
    },
  ];
  const participant = detail({
    planId: 'shared:p',
    source: 'shared',
    visibility: 'invited',
    planType: 'proposal',
    viewerRole: 'participant',
    localPlanId: null,
    canToggleTickets: false,
    people,
  });
  assert.deepEqual(
    participant.people.map((person) => person.responseLabel),
    ['Going', 'Maybe', 'Pending'],
  );
  assert.equal(participant.permissions.canRespond, true);
  assert.equal(participant.permissions.canRemove, false);
  assert.equal(participant.permissions.canInvite, false);
  assert.equal(participant.permissions.canToggleTickets, false);
  assert.deepEqual(
    participant.permissions.rsvpOptions.map((option) => option.id),
    ['interested', 'maybe', 'declined'],
  );
  assert.match(DETAIL_SRC, /view\.permissions\.canRemove \?/);
  assert.match(DETAIL_SRC, /view\.permissions\.canInvite && onInvite/);
  assert.match(DETAIL_SRC, /view\.sharing\.canManage && onInvite/);

  const discoverer = detail({
    planId: 'shared:open',
    source: 'shared',
    visibility: 'friends',
    planType: 'decided',
    viewerRole: 'discoverer',
    viewerSignedIn: true,
    localPlanId: null,
    canToggleTickets: false,
    people: [
      {
        userId: 'owner',
        displayName: 'Alex',
        responseLabel: 'Organizer',
        isOwner: true,
      },
    ],
  });
  assert.equal(discoverer.permissions.canJoin, true);
  assert.equal(discoverer.permissions.canRemove, false);
  assert.equal(discoverer.permissions.joinLabel, 'Join');
  assert.match(DETAIL_SRC, /view\.permissions\.joinLabel/);
});

test('tickets stay per screening, and missing urls are omitted', () => {
  const view = detail({
    canToggleTickets: true,
    screenings: [
      screening({
        title: 'First',
        performanceKey: 'a',
        ticketsPurchased: true,
        ticketUrl: 'https://tickets.example/first',
      }),
      screening({
        title: 'Second',
        performanceKey: 'b',
        filmKey: 'second',
        ticketsPurchased: false,
        ticketUrl: null,
        startsAt: '2026-09-30T05:00:00.000Z',
        expectedEndsAt: '2026-09-30T07:00:00.000Z',
      }),
    ],
  });
  assert.equal(view.tickets.scope, 'screening');
  assert.equal(view.tickets.purchased, undefined);
  assert.equal(view.tickets.rows.length, 2);
  assert.equal(view.tickets.rows[0].ticketsPurchased, true);
  assert.equal(view.tickets.rows[1].ticketsPurchased, false);
  assert.equal(view.tickets.rows[1].ticketUrl, null);
  assert.equal(view.tools.ticketUrl, null);
  assert.equal(view.tickets.rows[0].ticketUrl, 'https://tickets.example/first');
  assert.match(DETAIL_SRC, /externalTicketLinkProps/);
  assert.match(DETAIL_SRC, /Tickets purchased/);
  assert.match(DETAIL_SRC, /Not marked as purchased/);

  const noUrl = detail({
    viewerRole: 'participant',
    canToggleTickets: false,
    localPlanId: null,
    screenings: [screening({ ticketUrl: 'not-a-url', ticketsPurchased: false })],
  });
  assert.equal(noUrl.tools.ticketUrl, null);
  assert.equal(noUrl.tickets.rows.length, 0);
  assert.equal(noUrl.permissions.canToggleTickets, false);
});

test('calendar and film tools render only when the data can support them', () => {
  const ready = detail({
    screenings: [
      screening({
        format: '35mm',
        ticketUrl: 'https://tickets.example/bay',
        posterUrl: null,
      }),
    ],
  });
  assert.equal(ready.tools.canCalendar, true);
  assert.equal(ready.tags[0], '35MM');
  assert.equal(ready.tools.ticketUrl, 'https://tickets.example/bay');
  assert.ok(ready.tools.filmDetail?.filmKey);
  assert.equal(ready.posters.length, 0);
  assert.match(DETAIL_SRC, /Add to calendar/);
  assert.match(DETAIL_SRC, /View film details/);
  assert.match(DETAIL_SRC, /Get tickets/);
  assert.match(DETAIL_SRC, /v2-plan-detail-poster-fallback/);
  assert.match(DETAIL_SRC, /view\.tools\.canCalendar && onCalendar/);
  assert.match(DETAIL_SRC, /view\.tools\.filmDetail && onOpenFilm/);

  const incomplete = detail({
    screenings: [
      screening({
        runtimeMin: 0,
        filmKey: '',
        ticketUrl: '',
      }),
    ],
  });
  assert.equal(incomplete.tools.canCalendar, false);
  assert.equal(incomplete.tools.filmDetail, null);
  assert.equal(incomplete.tools.ticketUrl, null);
  assert.equal(incomplete.addScreening.available, false);
  assert.doesNotMatch(DETAIL_SRC, /Add another movie/);
});

test('a plan spanning theaters does not claim one venue', () => {
  const view = detail({
    screenings: [
      screening({
        title: 'Uptown',
        performanceKey: 'a',
        theaterName: 'SIFF Cinema Uptown',
        theaterId: 'uptown',
      }),
      screening({
        title: 'Beacon',
        performanceKey: 'b',
        filmKey: 'beacon-film',
        theaterName: 'The Beacon',
        theaterId: 'beacon',
        startsAt: '2026-09-30T06:00:00.000Z',
        expectedEndsAt: '2026-09-30T08:00:00.000Z',
      }),
    ],
  });
  assert.equal(view.spansMultipleTheaters, true);
  assert.equal(view.theaterSummary, null);
  assert.deepEqual(
    view.itinerary.filter((row) => row.kind === 'film').map((row) => row.theater),
    ['SIFF Cinema Uptown', 'The Beacon'],
  );
  assert.match(DETAIL_SRC, /view\.theaterSummary \?/);
});

test('Planner and Friend Detail open the same Plan Detail, and back restores the source', () => {
  let fromPlanner = openPlanDetail(createInitialNavState(), {
    planId: 'accepted:one',
    originPrimary: 'planner',
    returnSurface: null,
  });
  assert.equal(fromPlanner.surface.type, PLAN_DETAIL_SURFACE_TYPE);
  assert.equal(resolveHeaderBackLabel(fromPlanner), 'Planner');
  fromPlanner = navigateBack(fromPlanner);
  assert.equal(fromPlanner.surface, null);
  assert.equal(fromPlanner.primaryDestinationId, 'planner');

  let fromFriend = openFriendDetail(createInitialNavState(), {
    friendUserId: 'u-shelley',
    originPrimary: 'profile',
    returnSurface: null,
  });
  const friendSurface = fromFriend.surface;
  fromFriend = openSharedPlanDetail(fromFriend, {
    planId: 'shared:bay',
    originPrimary: 'profile',
    returnSurface: friendSurface,
  });
  assert.equal(fromFriend.surface.type, PLAN_DETAIL_SURFACE_TYPE);
  assert.equal(fromFriend.surface.type, openPlanDetail(createInitialNavState(), {
    planId: 'accepted:one',
  }).surface.type);
  assert.equal(resolveHeaderBackLabel(fromFriend), 'Friend');
  fromFriend = navigateBack(fromFriend);
  assert.equal(fromFriend.surface.type, FRIEND_DETAIL_SURFACE_TYPE);
  assert.equal(fromFriend.surface.friendUserId, 'u-shelley');

  assert.match(PLANNER_SRC, /openSavedPlan\(planId\)/);
  assert.match(APP_SRC, /PlanDetailSurface/);
  assert.match(APP_SRC, /openPlanDetail/);
});

test('Film Detail opened from the itinerary returns to Plan Detail', () => {
  const plan = openPlanDetail(createInitialNavState(), {
    planId: 'accepted:one',
    originPrimary: 'planner',
    returnSurface: null,
  });
  const film = openFilmDetail(plan, {
    filmKey: 'fk-film',
    filmId: 'tmdb:1',
    opportunityKey: 'opp-1',
    originPrimary: 'planner',
    returnSurface: plan.surface,
  });
  assert.equal(film.surface.type, 'film-detail');
  assert.equal(film.surface.returnSurface.type, PLAN_DETAIL_SURFACE_TYPE);
  assert.equal(resolveHeaderBackLabel(film), 'Plan');
  const back = navigateBack(film);
  assert.equal(back.surface.type, PLAN_DETAIL_SURFACE_TYPE);
  assert.equal(back.surface.planId, 'accepted:one');
  assert.match(DETAIL_SRC, /onOpenFilmDetail/);
  assert.match(DETAIL_SRC, /Remove from Planner/);
});
