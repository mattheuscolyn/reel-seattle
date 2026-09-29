/**
 * Open Invites: friends-visible discoverability on the same SharedPlan.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';
import {
  buildOpenJoinMember,
  transitionSharedPlanVisibility,
} from '../../v2/sharedPlans/sharedPlanModel.js';
import {
  createSharedPlanRepository,
  getSharedPlan,
  listPlanMembers,
  markFriends,
  repoCreateSharedPlan,
  repoGetSharedPlanForViewer,
  repoInviteFriend,
  repoJoinOpenPlan,
  repoListActiveSharedPlansForUser,
  repoListOpenFriendVisiblePlans,
  repoRespondToPlan,
  repoSetPlanVisibility,
} from '../../v2/sharedPlans/sharedPlanRepository.js';
import { projectSharedPlanMembersForViewer } from '../../v2/sharedPlans/sharedPlansRpcModel.js';
import {
  formatOpenInviteCardSummary,
  formatOpenInviteSocialLine,
  isSharedPlanUpcoming,
  sharedPlanSharingLabel,
} from '../../v2/sharedPlans/sharedPlanCopy.js';
import {
  createInitialNavState,
  openProfileFriends,
  openSharedPlanDetail,
  navigateBack,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/20260930000000_open_invites.sql'),
  'utf8',
);
const FRIENDS_SRC = readFileSync(join(ROOT, 'v2/friends/FriendsSurface.jsx'), 'utf8');
const OPEN_SRC = readFileSync(join(ROOT, 'v2/sharedPlans/OpenInvitesSection.jsx'), 'utf8');
const DETAIL_SRC = readFileSync(
  join(ROOT, 'v2/sharedPlans/SharedPlanDetailSurface.jsx'),
  'utf8',
);
const SHEET_SRC = readFileSync(
  join(ROOT, 'v2/sharedPlans/InviteFriendsToPlanSheet.jsx'),
  'utf8',
);

function screening(overrides = {}) {
  return {
    performanceKey: buildPerformanceKey({
      source: 'siFF',
      sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
      theaterId: overrides.theaterId ?? 'theater-a',
      filmKey: overrides.filmKey ?? 'fk-a',
    }),
    filmId: 'tmdb:1',
    filmKey: overrides.filmKey ?? 'fk-a',
    title: overrides.title ?? 'Early Summer',
    theaterId: overrides.theaterId ?? 'theater-a',
    theaterName: overrides.theaterName ?? 'SIFF Cinema Uptown',
    source: 'siFF',
    sourceShowtimeId: overrides.sourceShowtimeId ?? 'show-1',
    opportunityKey: null,
    localDate: overrides.localDate ?? '2026-10-10',
    localTime: overrides.localTime ?? '19:10',
    startsAt: '2026-10-11T02:10:00.000Z',
    expectedEndsAt: '2026-10-11T04:10:00.000Z',
    runtimeMin: 120,
    format: null,
    ticketUrl: null,
    addressLabel: null,
    posterUrl: null,
  };
}

function setup() {
  const repo = createSharedPlanRepository();
  markFriends(repo, 'owner', 'alex');
  markFriends(repo, 'owner', 'jamie');
  return repo;
}

test('1–5 owner visibility transitions preserve members; non-owner cannot change', () => {
  const repo = setup();
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'private',
    date: '2026-10-10',
    screenings: [screening()],
  });
  const planId = created.plan.planId;
  repoInviteFriend(repo, planId, 'owner', 'jamie');
  assert.equal(listPlanMembers(repo, planId).length, 2);

  const invited = repoSetPlanVisibility(repo, planId, 'owner', 'invited');
  assert.equal(invited.ok, true);
  assert.equal(getSharedPlan(repo, planId).visibility, 'invited');
  assert.equal(listPlanMembers(repo, planId).length, 2);

  const friends = repoSetPlanVisibility(repo, planId, 'owner', 'friends');
  assert.equal(friends.ok, true);
  assert.equal(listPlanMembers(repo, planId).length, 2);

  const back = repoSetPlanVisibility(repo, planId, 'owner', 'private');
  assert.equal(back.ok, true);
  assert.equal(getSharedPlan(repo, planId).visibility, 'private');
  assert.equal(listPlanMembers(repo, planId).map((m) => m.userId).sort().join(), 'jamie,owner');

  const denied = transitionSharedPlanVisibility(getSharedPlan(repo, planId), 'friends', {
    actorId: 'alex',
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'not_owner');
  assert.equal(sharedPlanSharingLabel('friends'), 'All friends can join');
  assert.equal(sharedPlanSharingLabel('invited'), 'Specific friends');
  assert.equal(sharedPlanSharingLabel('private'), 'Just you');
});

test('6–11 open feed filters visibility, friendship, self, and existing members', () => {
  const repo = setup();
  const friendsPlan = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    visibility: 'friends',
    date: '2026-10-10',
    screenings: [screening({ sourceShowtimeId: 'open-1' })],
  });
  const privatePlan = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    visibility: 'private',
    date: '2026-10-11',
    screenings: [screening({ sourceShowtimeId: 'priv-1' })],
  });
  const invitedPlan = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    visibility: 'invited',
    date: '2026-10-12',
    screenings: [screening({ sourceShowtimeId: 'inv-1' })],
  });
  repoInviteFriend(repo, invitedPlan.plan.planId, 'owner', 'jamie');

  const stranger = createSharedPlanRepository();
  repoCreateSharedPlan(stranger, {
    ownerId: 'stranger-owner',
    visibility: 'friends',
    planId: 'shared:stranger',
    date: '2026-10-10',
    screenings: [screening({ sourceShowtimeId: 'str-1' })],
  });

  const alexFeed = repoListOpenFriendVisiblePlans(repo, 'alex').map((p) => p.planId);
  assert.ok(alexFeed.includes(friendsPlan.plan.planId));
  assert.equal(alexFeed.includes(privatePlan.plan.planId), false);
  assert.equal(alexFeed.includes(invitedPlan.plan.planId), false);
  assert.deepEqual(repoListOpenFriendVisiblePlans(repo, 'owner'), []);
  assert.deepEqual(repoListOpenFriendVisiblePlans(stranger, 'alex'), []);

  const joined = repoJoinOpenPlan(repo, friendsPlan.plan.planId, 'alex');
  assert.equal(joined.ok, true);
  assert.equal(
    repoListOpenFriendVisiblePlans(repo, 'alex').some((p) => p.planId === friendsPlan.plan.planId),
    false,
  );
});

test('12–18 join response, canonical id, and rejection rules', () => {
  const repo = setup();
  const proposal = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'friends',
    date: '2026-10-10',
    screenings: [screening(), screening({
      sourceShowtimeId: 'show-2',
      title: 'Movie B',
      localTime: '21:30',
      filmKey: 'fk-b',
    })],
  });
  const decided = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'decided',
    visibility: 'friends',
    date: '2026-10-11',
    screenings: [screening({ sourceShowtimeId: 'dec-1', title: 'Early Summer' })],
  });

  const interested = repoJoinOpenPlan(repo, proposal.plan.planId, 'alex');
  assert.equal(interested.ok, true);
  assert.equal(interested.member.role, 'participant');
  assert.equal(interested.member.response, 'interested');
  assert.equal(interested.plan.planId, proposal.plan.planId);
  assert.equal(getSharedPlan(repo, proposal.plan.planId).planId, proposal.plan.planId);
  assert.equal(listPlanMembers(repo, proposal.plan.planId).filter((m) => m.userId === 'alex').length, 1);

  const going = repoJoinOpenPlan(repo, decided.plan.planId, 'jamie');
  assert.equal(going.member.role, 'participant');
  assert.equal(going.member.response, 'going');
  assert.equal(going.plan.planId, decided.plan.planId);

  const strangerJoin = buildOpenJoinMember(proposal.plan, 'stranger', {
    isFriendOfOwner: false,
  });
  assert.equal(strangerJoin.ok, false);
  assert.equal(strangerJoin.reason, 'not_friend');

  const privateJoin = buildOpenJoinMember(
    { ...proposal.plan, visibility: 'private' },
    'alex',
    { isFriendOfOwner: true },
  );
  assert.equal(privateJoin.reason, 'visibility_forbidden');
  const invitedJoin = buildOpenJoinMember(
    { ...proposal.plan, visibility: 'invited' },
    'alex',
    { isFriendOfOwner: true },
  );
  assert.equal(invitedJoin.reason, 'visibility_forbidden');

  const duplicate = repoJoinOpenPlan(repo, proposal.plan.planId, 'alex');
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'already_member');
});

test('19–21 joined plan is active for recipient; owner sees participant; declined stays out of Open Invites', () => {
  const repo = setup();
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'friends',
    date: '2026-10-10',
    screenings: [screening()],
  });
  repoJoinOpenPlan(repo, created.plan.planId, 'alex');
  const active = repoListActiveSharedPlansForUser(repo, 'alex');
  assert.equal(active.length, 1);
  assert.equal(active[0].plan.planId, created.plan.planId);
  assert.equal(repoListOpenFriendVisiblePlans(repo, 'alex').length, 0);

  const ownerView = repoGetSharedPlanForViewer(repo, created.plan.planId, 'owner');
  assert.ok(ownerView.members.some((m) => m.userId === 'alex' && m.response === 'interested'));

  repoRespondToPlan(repo, created.plan.planId, 'alex', 'declined');
  assert.equal(repoListActiveSharedPlansForUser(repo, 'alex').length, 0);
  assert.equal(repoListOpenFriendVisiblePlans(repo, 'alex').length, 0);
  assert.equal(listPlanMembers(repo, created.plan.planId).some((m) => m.userId === 'alex'), true);
});

test('22–25 discoverer projection hides private membership; multi-film card is not one title', () => {
  const repo = setup();
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    type: 'proposal',
    visibility: 'friends',
    date: '2026-10-10',
    screenings: [
      screening({ localTime: '16:00', title: 'Movie A' }),
      screening({ sourceShowtimeId: 'b', localTime: '21:30', title: 'Movie B', filmKey: 'fk-b' }),
      screening({ sourceShowtimeId: 'c', localTime: '23:00', title: 'Movie C', filmKey: 'fk-c' }),
    ],
  });
  repoInviteFriend(repo, created.plan.planId, 'owner', 'jamie');
  const members = listPlanMembers(repo, created.plan.planId);
  const discoverer = projectSharedPlanMembersForViewer(created.plan, members, 'alex');
  assert.deepEqual(discoverer, []);
  const owner = projectSharedPlanMembersForViewer(created.plan, members, 'owner');
  assert.ok(owner.some((m) => m.userId === 'jamie' && m.response === 'pending'));

  const before = repoGetSharedPlanForViewer(repo, created.plan.planId, 'alex');
  assert.equal(before.ok, true);
  assert.deepEqual(before.members, []);

  repoJoinOpenPlan(repo, created.plan.planId, 'alex');
  const after = repoGetSharedPlanForViewer(repo, created.plan.planId, 'alex');
  assert.ok(after.members.some((m) => m.userId === 'alex'));

  const card = formatOpenInviteCardSummary(created.plan);
  assert.equal(card.title, '3-film plan');
  assert.equal(card.filmCount, 3);
  assert.match(card.timeLabel, /16:00/);
  assert.match(card.timeLabel, /23:00/);
  assert.equal(card.title.includes('Movie A'), false);

  const line = formatOpenInviteSocialLine({
    ownerName: 'Jamie',
    companionCount: 2,
    planType: 'decided',
  });
  assert.equal(line, 'Jamie +2 are going');
  assert.equal(
    formatOpenInviteSocialLine({ ownerName: 'Jamie', companionCount: 0, planType: 'decided' }),
    null,
  );
  assert.equal(isSharedPlanUpcoming({ date: '2020-01-01' }, new Date('2026-09-26T12:00:00Z')), false);
  assert.equal(isSharedPlanUpcoming({ date: '2026-10-10' }, new Date('2026-09-26T12:00:00Z')), true);
});

test('26–28 direct invite path, detail destination, and migration contracts stay in place', () => {
  const repo = setup();
  const created = repoCreateSharedPlan(repo, {
    ownerId: 'owner',
    visibility: 'private',
    date: '2026-10-10',
    screenings: [screening()],
  });
  const invited = repoInviteFriend(repo, created.plan.planId, 'owner', 'jamie', {
    inviteMessage: 'Saturday?',
  });
  assert.equal(invited.ok, true);
  assert.equal(invited.member.response, 'pending');
  assert.equal(getSharedPlan(repo, created.plan.planId).visibility, 'invited');

  const friendsNav = openProfileFriends(createInitialNavState(), { originPrimary: 'profile' });
  const detail = openSharedPlanDetail(friendsNav, {
    planId: created.plan.planId,
    originPrimary: 'profile',
    returnSurface: friendsNav.surface,
  });
  assert.equal(detail.surface.type, 'shared-plan-detail');
  assert.equal(detail.surface.planId, created.plan.planId);
  const back = navigateBack(detail);
  assert.equal(back.surface.type, 'profile-friends');

  assert.match(SHEET_SRC, /Who can join\?/);
  assert.match(SHEET_SRC, /Just me/);
  assert.match(SHEET_SRC, /Specific friends/);
  assert.match(SHEET_SRC, /All friends/);
  assert.match(SHEET_SRC, /promoteAcceptedPlanAndInvite/);
  assert.equal(FRIENDS_SRC.includes('OpenInvitesSection'), false);
  assert.match(OPEN_SRC, /No open invites right now/);
  assert.match(OPEN_SRC, /joinOpenSharedPlanRemote/);
  assert.match(OPEN_SRC, /View plan/);
  assert.match(DETAIL_SRC, /isDiscoverer/);
  assert.match(DETAIL_SRC, /joinOpenSharedPlanRemote/);
  assert.match(DETAIL_SRC, /organizerNote && !isDiscoverer/);

  assert.match(MIGRATION, /join_open_shared_plan/);
  assert.match(MIGRATION, /set_shared_plan_visibility/);
  assert.match(MIGRATION, /visibility_forbidden/);
  assert.match(MIGRATION, /already_member/);
  assert.match(MIGRATION, /participant/);
  assert.match(MIGRATION, /interested/);
  assert.match(MIGRATION, /going/);
  assert.match(MIGRATION, /plan_date >= v_today/);
  assert.match(MIGRATION, /visibility = 'friends'/);
  assert.equal(MIGRATION.includes('delete from public.shared_plan_members'), false);
  assert.match(MIGRATION, /not exists/);
  assert.match(MIGRATION, /public_companions/);
  assert.match(MIGRATION, /if v_row.owner_id = v_uid or v_is_member/);
});
