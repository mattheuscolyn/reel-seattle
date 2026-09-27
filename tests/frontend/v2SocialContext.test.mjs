/**
 * Contextual friend/plan signals across Film Detail, Planner, and Friend Detail.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSharedPlanWithLine } from '../../v2/sharedPlans/sharedPlanCopy.js';
import {
  buildFilmPlanSocialLine,
  buildFriendPlanCards,
  buildInviteSuggestions,
  buildShowtimeSocialCue,
  isSameShowtime,
  normalizeFriendPlanSignal,
  showtimeAttendanceLabel,
} from '../../v2/social/socialPlanContext.js';
import { getFriendActivityForFilm, buildFromYourFriendsPresentation } from '../../v2/friends/friendFilmActivityModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SQL = readFileSync(
  join(ROOT, 'supabase/migrations/20261001000000_friend_plan_signals.sql'),
  'utf8',
);
const DETAIL = readFileSync(join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'), 'utf8');
const SHEET = readFileSync(join(ROOT, 'v2/sharedPlans/InviteFriendsToPlanSheet.jsx'), 'utf8');
const FRIEND = readFileSync(join(ROOT, 'v2/friends/FriendDetailSurface.jsx'), 'utf8');
const MERGE = readFileSync(
  join(ROOT, 'v2/planner/mergeSharedPlansIntoPlannerLanding.js'),
  'utf8',
);

function signal(overrides = {}) {
  return normalizeFriendPlanSignal({
    friend_id: 'alex',
    friend_name: 'Alex Kim',
    plan_id: 'shared:1',
    plan_type: 'decided',
    visibility: 'friends',
    response: 'going',
    performance_key: 'src:siFF:uptown:710',
    film_key: 'showtime:early',
    film_id: 'tmdb:100',
    title: 'Early Summer',
    local_date: '2026-10-10',
    local_time: '19:10',
    theater_name: 'SIFF Cinema Uptown',
    viewer_can_open: true,
    viewer_can_join: true,
    ...overrides,
  });
}

test('1–2 Saved names render and empty activity omits the section', () => {
  const activity = getFriendActivityForFilm({
    filmKey: 'tmdb:100',
    friends: [
      { userId: 'jamie', displayName: 'Jamie Lee' },
      { userId: 'alex', displayName: 'Alex Kim' },
    ],
    activityRows: [
      {
        user_id: 'jamie',
        film_key: 'tmdb:100',
        states: { saved: true, seen: false, not_interested: false },
      },
      {
        user_id: 'alex',
        film_key: 'tmdb:100',
        states: { saved: true, seen: false, not_interested: false },
      },
    ],
  });
  const presentation = buildFromYourFriendsPresentation(activity);
  assert.match(presentation.lines[0].text, /Jamie/);
  assert.match(presentation.lines[0].text, /Alex/);
  assert.equal(
    buildFromYourFriendsPresentation(
      getFriendActivityForFilm({ filmKey: 'tmdb:100', friends: [], activityRows: [] }),
    ),
    null,
  );
});

test('3–5 invite suggestions: Saved yes, Not Interested never, members excluded, Seen alone no', () => {
  const suggestions = buildInviteSuggestions({
    friends: [
      { userId: 'jamie', displayName: 'Jamie' },
      { userId: 'alex', displayName: 'Alex' },
      { userId: 'chris', displayName: 'Chris' },
      { userId: 'morgan', displayName: 'Morgan' },
      { userId: 'priya', displayName: 'Priya' },
    ],
    savedUserIds: ['jamie', 'chris'],
    notInterestedUserIds: ['chris'],
    seenUserIds: ['morgan'],
    memberUserIds: ['alex'],
    signals: [signal({ friend_id: 'priya', friend_name: 'Priya', response: 'interested', plan_type: 'proposal' })],
  });
  const ids = suggestions.map((row) => row.userId);
  assert.deepEqual(ids, ['jamie', 'priya']);
  assert.equal(suggestions[0].reason, 'Saved this movie');
  assert.equal(suggestions[1].reason, 'Interested in this film');
  assert.equal(ids.includes('chris'), false);
  assert.equal(ids.includes('alex'), false);
  assert.equal(ids.includes('morgan'), false);
});

test('6–7 same performance is attendance; different performance is another showtime', () => {
  const going = signal();
  const other = signal({
    friend_id: 'jamie',
    friend_name: 'Jamie',
    performance_key: 'src:siFF:uptown:1600',
    local_time: '16:00',
    plan_id: 'shared:other',
  });
  assert.equal(isSameShowtime(going, { performanceKey: 'src:siFF:uptown:710' }), true);
  assert.equal(isSameShowtime(going, { performanceKey: 'src:siFF:uptown:1600' }), false);
  const sameCue = buildShowtimeSocialCue({
    performanceKey: 'src:siFF:uptown:710',
    signals: [going, other],
  });
  assert.match(sameCue.text, /going to this showtime/);
  assert.equal(sameCue.kind, 'attendance');
  const otherCue = buildShowtimeSocialCue({
    performanceKey: 'src:siFF:uptown:2100',
    signals: [other],
  });
  assert.match(otherCue.text, /another showtime/);
  assert.doesNotMatch(otherCue.text, /going to this showtime/);
  assert.equal(showtimeAttendanceLabel([going], 'src:siFF:uptown:710'), 'Alex going');
  assert.equal(showtimeAttendanceLabel([going], 'src:siFF:uptown:1600'), null);
});

test('8–12 normalizer drops pending and declined; copy uses positive rows only', () => {
  assert.equal(normalizeFriendPlanSignal({ ...signal(), response: 'pending', friend_id: 'pat' }), null);
  assert.equal(
    normalizeFriendPlanSignal({
      friend_id: 'chris',
      friend_name: 'Chris',
      plan_id: 'shared:1',
      response: 'declined',
    }),
    null,
  );
  const line = buildFilmPlanSocialLine([
    signal(),
    signal({ friend_id: 'jamie', friend_name: 'Jamie', response: 'interested', plan_type: 'proposal' }),
  ]);
  assert.match(line.text, /Alex/);
  assert.equal(line.action, 'join');
  const privateShape = signal({ visibility: 'private', viewer_can_join: false, viewer_can_open: false });
  assert.equal(privateShape.viewerCanJoin, false);
});

test('13–15 With line: decided counts going only; proposal counts maybe; multi and single plans', () => {
  const people = [
    { userId: 'jamie', displayName: 'Jamie', response: 'going' },
    { userId: 'alex', displayName: 'Alex', response: 'maybe' },
    { userId: 'chris', displayName: 'Chris', response: 'declined' },
    { userId: 'pat', displayName: 'Pat', response: 'pending' },
  ];
  assert.equal(
    formatSharedPlanWithLine({
      ownerId: 'owner',
      viewerId: 'owner',
      planType: 'decided',
      companions: people,
    }),
    'With Jamie',
  );
  assert.equal(
    formatSharedPlanWithLine({
      ownerId: 'owner',
      viewerId: 'owner',
      planType: 'proposal',
      companions: people,
    }),
    'With Jamie +1',
  );
  const single = buildFilmPlanSocialLine([signal()]);
  assert.match(single.text, /Early Summer|Alex is going/);
  const multi = buildFriendPlanCards([
    signal({ title: 'Movie A', local_time: '16:00', response: 'interested', plan_type: 'proposal' }),
    signal({ title: 'Movie B', local_time: '18:30', performance_key: 'src:b', response: 'interested', plan_type: 'proposal' }),
    signal({ title: 'Movie C', local_time: '21:15', performance_key: 'src:c', response: 'interested', plan_type: 'proposal' }),
  ]);
  assert.equal(multi.length, 1);
  assert.match(multi[0].title, /Movie A/);
  assert.match(multi[0].title, /Movie B/);
  assert.match(multi[0].title, /Movie C/);
});

test('16–20 Friend Detail cards, open vs member actions, no clone path in SQL', () => {
  const cards = buildFriendPlanCards([
    signal({ viewer_can_join: false }),
    signal({
      plan_id: 'shared:hidden',
      visibility: 'private',
      response: 'going',
      friend_id: 'secret',
      friend_name: 'Secret',
    }),
  ]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].actionLabel, 'View plan');
  const open = buildFilmPlanSocialLine([signal({ viewer_can_join: true })]);
  assert.equal(open.actionLabel, 'Join plan');
  const member = buildFilmPlanSocialLine([signal({ viewer_can_join: false })]);
  assert.equal(member.actionLabel, 'View plan');
  assert.equal(SQL.includes('insert into public.user_accepted_plans'), false);
  assert.equal(SQL.includes('invite_message'), false);
  assert.match(FRIEND, /planCards.length > 0/);
  assert.match(FRIEND, /onOpenSharedPlan/);
});

test('21–23 existing surfaces keep Saved copy, detail, and planner With wiring', () => {
  assert.match(DETAIL, /FromYourFriendsSection/);
  assert.match(DETAIL, /buildFilmPlanSocialLine/);
  assert.match(DETAIL, /showtimeAttendanceLabel/);
  assert.match(SHEET, /Suggested/);
  assert.match(SHEET, /buildInviteSuggestions/);
  assert.match(SHEET, /promoteAcceptedPlanAndInvite/);
  assert.match(MERGE, /planType: plan.type/);
  assert.match(SQL, /can_view_shared_plan/);
  assert.match(SQL, /are_accepted_friends/);
  assert.match(SQL, /m.response in \('interested', 'maybe', 'going'\)/);
  assert.match(SQL, /list_friend_plan_signals/);
});
