/**
 * Friends list context: batched RPC semantics and adaptive cards.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRIENDS_COPY, friendDisplayLabel } from '../../v2/friends/friendsCopy.js';
import { sqlMirrorListFriendsListContext } from '../../v2/friends/friendsListContextSqlMirror.js';
import {
  FRIENDS_LIST_PLAN_CAP,
  buildFriendsListCards,
  mutualSavedLabel,
  normalizeFriendsListContext,
} from '../../v2/friends/friendsListContextModel.js';
import {
  createInitialNavState,
  navigateBack,
  openFriendDetail,
  openProfileFriends,
  stampFriendsListReturn,
} from '../../v2/navigation/navState.js';
import { captureListPosition } from '../../v2/navigation/listPositionRestore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SQL = readFileSync(
  join(ROOT, 'supabase/migrations/20261002000000_friends_list_context.sql'),
  'utf8',
);
const SURFACE = readFileSync(join(ROOT, 'v2/friends/FriendsSurface.jsx'), 'utf8');
const EMPTY = readFileSync(join(ROOT, 'v2/friends/FriendsEmptyState.jsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');

const TODAY = '2026-09-29';

function viewerSaved(filmId) {
  return {
    filmRef: {
      filmId,
      showtimeFilmKey: `showtime-${filmId}`,
    },
  };
}

test('list_friends_list_context is one authenticated read with Friend Detail plan rules', () => {
  assert.match(SQL, /create or replace function public\.list_friends_list_context\(\)/);
  assert.match(SQL, /security definer/);
  assert.match(SQL, /set search_path = public, pg_temp/);
  assert.match(SQL, /revoke all on function public\.list_friends_list_context\(\) from anon/);
  assert.match(SQL, /grant execute on function public\.list_friends_list_context\(\) to authenticated/);
  assert.match(SQL, /share_film_activity_with_friends/);
  assert.match(SQL, /prefs\.is_active = true/);
  assert.match(SQL, /prefs\.preference_type = 'saved'/);
  assert.match(SQL, /are_accepted_friends/);
  assert.match(SQL, /can_view_shared_plan/);
  assert.match(SQL, /America\/Los_Angeles/);
  assert.match(SQL, /p\.plan_type is distinct from 'decided'/);
  assert.match(SQL, /least\(count\(distinct plan_id\), 6\)/);
  assert.equal(SQL.includes("'seen'"), false);
  assert.equal(SQL.includes('not_interested'), false);
  assert.equal(SURFACE.includes('OpenInvitesSection'), false);
  assert.equal(SURFACE.includes('listSharedFilmActivityForFriend'), false);
  assert.equal(SURFACE.includes('listFriendPlanSignals'), false);
  assert.match(SURFACE, /useFriendsListContext/);
  assert.match(SURFACE, /data-friends-list="empty"/);
  assert.match(EMPTY, /data-friends-empty-art="placeholder"/);
  assert.match(EMPTY, /FRIENDS_COPY\.emptyPoints/);
  assert.equal(FRIENDS_COPY.emptyPoints[0].title, "See what they're interested in");
  assert.equal(FRIENDS_COPY.emptyPoints[0].body, 'Find films you both want to watch.');
  assert.equal(FRIENDS_COPY.emptyPoints[1].title, 'Make plans together');
  assert.match(APP, /stampFriendsListReturn/);
});

test('context keeps only accepted friends and hides Saved films when sharing is off', () => {
  const result = sqlMirrorListFriendsListContext({
    viewerId: 'me',
    friendships: [
      ['me', 'shelley'],
      ['me', 'alex'],
    ],
    shareByUserId: { shelley: true, alex: false, stranger: true },
    preferences: [
      { user_id: 'shelley', film_key: 'tmdb:1', film_id: 'tmdb:1', preference_type: 'saved', is_active: true },
      { user_id: 'shelley', film_key: 'tmdb:2', film_id: 'tmdb:2', preference_type: 'saved', is_active: false },
      { user_id: 'shelley', film_key: 'tmdb:3', film_id: 'tmdb:3', preference_type: 'seen', is_active: true },
      { user_id: 'alex', film_key: 'tmdb:9', film_id: 'tmdb:9', preference_type: 'saved', is_active: true },
      { user_id: 'stranger', film_key: 'tmdb:8', film_id: 'tmdb:8', preference_type: 'saved', is_active: true },
    ],
    plans: [],
    today: TODAY,
  });

  assert.deepEqual(
    result.friends.map((friend) => friend.friend_user_id),
    ['alex', 'shelley'],
  );
  const shelley = result.friends.find((friend) => friend.friend_user_id === 'shelley');
  const alex = result.friends.find((friend) => friend.friend_user_id === 'alex');
  assert.equal(shelley.shares_activity, true);
  assert.deepEqual(shelley.saved_films.map((film) => film.film_key), ['tmdb:1']);
  assert.equal(alex.shares_activity, false);
  assert.deepEqual(alex.saved_films, []);
  assert.equal(JSON.stringify(result).includes('tmdb:9'), false);
  assert.equal(JSON.stringify(result).includes('tmdb:8'), false);
  assert.equal(JSON.stringify(result).includes('tmdb:3'), false);
});

test('sharing on with no active Saved films stays distinct from sharing off', () => {
  const result = sqlMirrorListFriendsListContext({
    viewerId: 'me',
    friendships: [['me', 'jordan']],
    shareByUserId: { jordan: true },
    preferences: [
      { user_id: 'jordan', film_key: 'tmdb:4', film_id: 'tmdb:4', preference_type: 'saved', is_active: false },
    ],
    plans: [],
    today: TODAY,
  });
  assert.equal(result.friends.length, 1);
  assert.equal(result.friends[0].shares_activity, true);
  assert.deepEqual(result.friends[0].saved_films, []);
});

test('plan count and nearest plan follow Friend Detail attendance', () => {
  const result = sqlMirrorListFriendsListContext({
    viewerId: 'me',
    friendships: [['me', 'shelley']],
    shareByUserId: { shelley: true },
    preferences: [],
    today: TODAY,
    plans: [
      {
        planId: 'later',
        ownerId: 'me',
        visibility: 'private',
        planType: 'decided',
        planDate: '2026-11-02',
        performances: [
          {
            filmKey: 'tmdb:20',
            filmId: 'tmdb:20',
            title: 'Later Film',
            localDate: '2026-11-02',
            localTime: '19:00',
            theaterName: 'AMC Pacific Place',
          },
        ],
        members: [{ userId: 'shelley', response: 'going' }],
      },
      {
        planId: 'nearest',
        ownerId: 'me',
        visibility: 'private',
        planType: 'decided',
        planDate: '2026-10-01',
        performances: [
          {
            filmKey: 'tmdb:9',
            filmId: 'tmdb:9',
            title: 'A Bay of Blood',
            posterUrl: 'https://example.com/bay.jpg',
            localDate: '2026-10-01',
            localTime: '19:30',
            theaterName: 'SIFF Cinema Downtown',
          },
        ],
        members: [{ userId: 'shelley', response: 'going' }],
      },
      {
        planId: 'interested-decided',
        ownerId: 'me',
        visibility: 'private',
        planType: 'decided',
        planDate: '2026-10-02',
        performances: [{ title: 'Needs Going', localDate: '2026-10-02', localTime: '12:00' }],
        members: [{ userId: 'shelley', response: 'interested' }],
      },
      {
        planId: 'past',
        ownerId: 'me',
        visibility: 'private',
        planType: 'decided',
        planDate: '2026-09-01',
        performances: [{ title: 'Past', localDate: '2026-09-01', localTime: '19:00' }],
        members: [{ userId: 'shelley', response: 'going' }],
      },
      {
        planId: 'private-other',
        ownerId: 'stranger',
        visibility: 'private',
        planType: 'decided',
        planDate: '2026-10-03',
        performances: [{ title: 'Secret', localDate: '2026-10-03', localTime: '19:00' }],
        members: [{ userId: 'shelley', response: 'going' }],
      },
    ],
  });

  const shelley = result.friends[0];
  assert.equal(shelley.upcoming_plan_count, 2);
  assert.equal(shelley.nearest_plan.plan_id, 'nearest');
  assert.equal(shelley.nearest_plan.title, 'A Bay of Blood');
  assert.equal(shelley.nearest_plan.poster_url, 'https://example.com/bay.jpg');
  assert.equal(shelley.nearest_plan.theater_name, 'SIFF Cinema Downtown');
  assert.equal(shelley.nearest_plan.response, 'going');
  assert.equal(JSON.stringify(shelley).includes('Secret'), false);
  assert.equal(JSON.stringify(shelley).includes('Past'), false);
});

test('plan count caps at the Friend Detail card limit', () => {
  const plans = Array.from({ length: 8 }, (_, index) => ({
    planId: `plan-${index}`,
    ownerId: 'me',
    visibility: 'private',
    planType: 'proposal',
    planDate: `2026-10-${String(index + 1).padStart(2, '0')}`,
    performances: [
      {
        title: `Film ${index}`,
        localDate: `2026-10-${String(index + 1).padStart(2, '0')}`,
        localTime: '18:00',
      },
    ],
    members: [{ userId: 'shelley', response: 'interested' }],
  }));
  const result = sqlMirrorListFriendsListContext({
    viewerId: 'me',
    friendships: [['me', 'shelley']],
    shareByUserId: { shelley: true },
    preferences: [],
    plans,
    today: TODAY,
  });
  assert.equal(FRIENDS_LIST_PLAN_CAP, 6);
  assert.equal(result.friends[0].upcoming_plan_count, 6);
  assert.equal(result.friends[0].nearest_plan.plan_id, 'plan-0');
});

test('normalizer drops Saved films when sharing is off', () => {
  const friends = normalizeFriendsListContext({
    ok: true,
    friends: [
      {
        friend_user_id: 'alex',
        shares_activity: false,
        saved_films: [{ film_key: 'tmdb:9', film_id: 'tmdb:9' }],
        upcoming_plan_count: 0,
        nearest_plan: null,
      },
    ],
  });
  assert.equal(friends[0].sharesActivity, false);
  assert.deepEqual(friends[0].savedFilms, []);
});

test('cards join context by friend id and intersect Saved films', () => {
  const context = normalizeFriendsListContext({
    friends: [
      {
        friend_user_id: 'shelley',
        shares_activity: true,
        saved_films: [
          { film_key: 'tmdb:1', film_id: 'tmdb:1', showtime_film_key: 'showtime-tmdb:1' },
          { film_key: 'tmdb:2', film_id: 'tmdb:2', showtime_film_key: 'showtime-tmdb:2' },
        ],
        upcoming_plan_count: 1,
        nearest_plan: {
          plan_id: 'bay',
          film_key: 'tmdb:9',
          film_id: 'tmdb:9',
          title: 'A Bay of Blood',
          poster_url: 'https://example.com/bay.jpg',
          local_date: '2026-09-29',
          local_time: '19:30',
          theater_name: 'SIFF Cinema Downtown',
          response: 'going',
          viewer_can_join: false,
        },
      },
      {
        friend_user_id: 'taylor',
        shares_activity: true,
        saved_films: [
          { film_key: 'tmdb:2', film_id: 'tmdb:2' },
          {
            film_key: 'tmdb:5',
            film_id: 'tmdb:5',
            showtime_film_key: 'showtime-tmdb:5',
          },
        ],
        upcoming_plan_count: 0,
        nearest_plan: null,
      },
      {
        friend_user_id: 'jordan',
        shares_activity: true,
        saved_films: [],
        upcoming_plan_count: 2,
        nearest_plan: {
          plan_id: 'marty',
          title: 'Marty Supreme',
          local_date: '2026-10-10',
          local_time: '20:00',
          response: 'going',
        },
      },
      {
        friend_user_id: 'casey',
        shares_activity: true,
        saved_films: [{ film_key: 'tmdb:8', film_id: 'tmdb:8' }],
        upcoming_plan_count: 0,
        nearest_plan: null,
      },
      {
        friend_user_id: 'alex',
        shares_activity: false,
        saved_films: [],
        upcoming_plan_count: 1,
        nearest_plan: {
          plan_id: 'battle',
          title: 'One Battle After Another',
          local_date: '2026-10-04',
          local_time: '16:00',
          response: 'maybe',
        },
      },
    ],
  });

  const cards = buildFriendsListCards({
    friends: [
      { userId: 'shelley', displayName: 'Shelley!', avatarUrl: null },
      { userId: 'taylor', displayName: 'Taylor', avatarUrl: null },
      { userId: 'jordan', displayName: 'Jordan', avatarUrl: null },
      { userId: 'casey', displayName: 'Casey', avatarUrl: null },
      { userId: 'alex', displayName: 'Alex', avatarUrl: null },
    ],
    contextFriends: context,
    viewerSaved: [viewerSaved('tmdb:1'), viewerSaved('tmdb:5')],
    homeData: {
      films: [
        { filmKey: 'showtime-tmdb:5', filmId: 'tmdb:5', title: 'Look Back', posterUrl: 'https://example.com/look.jpg' },
      ],
    },
  });

  assert.equal(cards.length, 5);
  assert.equal(friendDisplayLabel(cards[0].displayName), 'Shelley!');
  assert.equal(cards[0].mutualCount, 1);
  assert.equal(cards[0].mutualLabel, '1 film you both saved');
  assert.equal(cards[0].planLabel, '1 upcoming plan');
  assert.equal(cards[0].preview, 'plan');
  assert.equal(cards[0].plan.title, 'A Bay of Blood');
  assert.equal(cards[0].plan.posterUrl, 'https://example.com/bay.jpg');
  assert.equal(cards[0].posters.length, 0);
  assert.equal(JSON.stringify(cards[0]).includes("Shelley!'s"), false);

  assert.equal(cards[1].preview, 'posters');
  assert.equal(cards[1].mutualCount, 1);
  assert.equal(cards[1].planLabel, null);
  assert.equal(cards[1].posters[0].key, 'tmdb:5');
  assert.equal(cards[1].posters[0].posterUrl, 'https://example.com/look.jpg');

  assert.equal(cards[2].preview, 'plan');
  assert.equal(cards[2].mutualCount, 0);
  assert.equal(cards[2].mutualLabel, null);
  assert.equal(cards[2].planLabel, '2 upcoming plans');

  assert.equal(cards[3].preview, 'none');
  assert.equal(cards[3].mutualCount, 0);
  assert.equal(cards[3].mutualLabel, null);
  assert.equal(cards[3].planLabel, null);

  assert.equal(cards[4].mutualState, 'hidden');
  assert.equal(cards[4].mutualCount, null);
  assert.equal(cards[4].mutualLabel, null);
  assert.equal(cards[4].preview, 'plan');
  assert.equal(mutualSavedLabel(0), null);
});

test('a Saved film the viewer has only Seen is not saved together', () => {
  const context = normalizeFriendsListContext({
    friends: [
      {
        friend_user_id: 'shelley',
        shares_activity: true,
        saved_films: [{ film_key: 'tmdb:1465063', film_id: 'tmdb:1465063' }],
        upcoming_plan_count: 0,
        nearest_plan: null,
      },
    ],
  });
  const cards = buildFriendsListCards({
    friends: [{ userId: 'shelley', displayName: 'Shelley!' }],
    contextFriends: context,
    viewerSaved: [],
  });
  assert.equal(cards[0].mutualCount, 0);
  assert.equal(cards[0].preview, 'none');
});

test('one friend and a pending context omit counts', () => {
  const cards = buildFriendsListCards({
    friends: [{ userId: 'shelley', displayName: 'Shelley!' }],
    contextFriends: null,
    viewerSaved: [viewerSaved('tmdb:1')],
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].mutualState, 'pending');
  assert.equal(cards[0].mutualLabel, null);
  assert.equal(cards[0].planLabel, null);
  assert.equal(cards[0].preview, 'none');
});

test('Back from Friend Detail restores the Friends list row', () => {
  let nav = openProfileFriends(createInitialNavState(), { originPrimary: 'profile' });
  const position = captureListPosition(
    { itemKey: 'shelley', scrollY: 240 },
    { window: { scrollY: 240 } },
  );
  const returnSurface = stampFriendsListReturn(nav.surface, 'shelley', position);
  nav = openFriendDetail(nav, {
    friendUserId: 'shelley',
    originPrimary: 'profile',
    returnSurface,
  });
  assert.equal(nav.surface.type, 'friend-detail');
  const back = navigateBack(nav);
  assert.equal(back.surface.type, 'profile-friends');
  assert.equal(back.surface.focusUserId, 'shelley');
  assert.equal(back.surface.listRestore.itemKey, 'shelley');
  assert.equal(back.surface.listRestore.scrollY, 240);
  assert.equal(back.primaryDestinationId, 'profile');
});
