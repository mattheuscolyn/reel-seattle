/**
 * Friend Detail redesign state: mutual counts, plans, watch-together, tabs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFriendDetailFilmCards,
  buildFriendDetailModel,
  formatFriendsSinceLabel,
  friendActivityEmptyCopy,
  planCardAvatars,
  selectMutualFilms,
  watchTogetherEmptyCopy,
} from '../../v2/friends/friendDetailPresentation.js';
import { getSharedFilmActivityForFriend } from '../../v2/friends/friendFilmActivityModel.js';
import { buildFriendPlanCards } from '../../v2/social/socialPlanContext.js';
import { normalizeFriendPlanSignal } from '../../v2/social/socialPlanContext.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFriendDetail,
  openProfileFriends,
  openSharedPlanDetail,
} from '../../v2/navigation/navState.js';
import { resolveHeaderBackLabel } from '../../v2/destinations.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE = readFileSync(
  join(ROOT, 'v2/friends/FriendDetailSurface.jsx'),
  'utf8',
);
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');

const NOW = new Date('2026-09-29T19:00:00.000Z');

function friend(overrides = {}) {
  return {
    friendshipId: 'fs-shelley',
    userId: 'u-shelley',
    displayName: 'Shelley',
    avatarUrl: null,
    createdAt: '2026-09-02T18:00:00.000Z',
    shareInteractionCount: 1,
    ...overrides,
  };
}

function activityFilm(filmKey, states, extra = {}) {
  return {
    filmKey,
    filmId: extra.filmId ?? filmKey,
    showtimeFilmKey: extra.showtimeFilmKey ?? `showtime-${filmKey}`,
    updatedAt: extra.updatedAt ?? '2026-09-01T00:00:00.000Z',
    states,
  };
}

function viewerItem(filmId, title = 'Untitled') {
  return {
    title,
    filmRef: {
      filmId,
      showtimeFilmKey: `showtime-${filmId}`,
    },
  };
}

function homeData() {
  return {
    films: [
      {
        filmKey: 'showtime-tmdb:1',
        filmId: 'tmdb:1',
        title: 'The Mastermind',
        posterUrl: 'https://example.com/mastermind.jpg',
      },
      {
        filmKey: 'showtime-tmdb:2',
        filmId: 'tmdb:2',
        title: 'Look Back',
        posterUrl: 'https://example.com/lookback.jpg',
      },
    ],
    opportunities: [
      {
        filmKey: 'showtime-tmdb:1',
        filmId: 'tmdb:1',
        opportunityKey: 'opp-1a',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-10-02',
        localTime: '19:30',
        status: 'scheduled',
      },
      {
        filmKey: 'showtime-tmdb:1',
        filmId: 'tmdb:1',
        opportunityKey: 'opp-1b',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-10-03',
        localTime: '16:00',
        status: 'scheduled',
      },
      {
        filmKey: 'showtime-tmdb:2',
        filmId: 'tmdb:2',
        opportunityKey: 'opp-2',
        theaterName: 'Grand Illusion Cinema',
        localDate: '2026-10-10',
        localTime: '19:00',
        status: 'scheduled',
      },
    ],
    leavingSoon: {
      entries: [
        {
          filmKey: 'showtime-tmdb:1',
          bucket: 'leaving_soon',
          bucketLabel: 'Leaving soon',
        },
      ],
    },
    openingThisWeek: {
      entries: [
        {
          filmKey: 'showtime-tmdb:2',
          showtimeFilmKey: 'showtime-tmdb:2',
          openingDate: '2026-10-02',
          engagementDays: 7,
        },
      ],
    },
  };
}

function signal(overrides = {}) {
  return normalizeFriendPlanSignal({
    friend_id: 'u-shelley',
    friend_name: 'Shelley',
    avatar_url: 'https://example.com/shelley.jpg',
    plan_id: 'shared:bay',
    plan_type: 'decided',
    visibility: 'friends',
    response: 'going',
    film_key: 'showtime-tmdb:9',
    film_id: 'tmdb:9',
    title: 'A Bay of Blood',
    local_date: '2026-09-29',
    local_time: '19:30',
    theater_name: 'SIFF Cinema Downtown',
    viewer_can_join: false,
    ...overrides,
  });
}

function activityFor(rows, shares = true) {
  return getSharedFilmActivityForFriend({
    friendId: 'u-shelley',
    friends: [friend()],
    friendSharesActivity: shares,
    activityRows: rows.map((row) => ({
      user_id: 'u-shelley',
      film_key: row.filmKey,
      film_id: row.filmId,
      showtime_film_key: row.showtimeFilmKey,
      updated_at: row.updatedAt,
      states: row.states,
    })),
  });
}

test('friends since uses the friendship date and omits a missing date', () => {
  assert.equal(formatFriendsSinceLabel('2026-09-02T18:00:00.000Z'), 'Friends since Sep 2026');
  assert.equal(formatFriendsSinceLabel(''), null);
  assert.equal(formatFriendsSinceLabel(null), null);
  assert.equal(formatFriendsSinceLabel('not-a-date'), null);
});

test('mutual counts use film identity, not title', () => {
  const friendFilms = [
    activityFilm('tmdb:1', { saved: true, seen: false, not_interested: false }, {
      filmId: 'tmdb:1',
    }),
    activityFilm('tmdb:2', { saved: true, seen: true, not_interested: false }, {
      filmId: 'tmdb:2',
    }),
  ];
  const mutual = selectMutualFilms(friendFilms, [
    viewerItem('tmdb:1', 'Completely Different Title'),
    viewerItem('tmdb:9', 'The Mastermind'),
  ]);
  assert.equal(mutual.length, 1);
  assert.equal(mutual[0].filmKey, 'tmdb:1');
});

test('rich state: plans, mutual saves, and friend activity stay distinct', () => {
  const rows = [
    activityFilm('tmdb:1', { saved: true, seen: false, not_interested: false }),
    activityFilm('tmdb:2', { saved: true, seen: false, not_interested: false }),
    activityFilm('tmdb:3', { saved: false, seen: true, not_interested: false }),
    activityFilm('tmdb:4', { saved: false, seen: false, not_interested: true }),
  ];
  const model = buildFriendDetailModel({
    friend: friend(),
    sharesActivity: true,
    activity: activityFor(rows),
    viewerSaved: [viewerItem('tmdb:1'), viewerItem('tmdb:8')],
    viewerSeen: [viewerItem('tmdb:3'), viewerItem('tmdb:1')],
    viewerNotInterested: [viewerItem('tmdb:4')],
    planCards: buildFriendPlanCards([signal()]),
    homeData: homeData(),
    now: NOW,
  });
  assert.equal(model.summary.savedTogether, 1);
  assert.equal(model.summary.upcomingPlans, 1);
  assert.equal(model.summary.seenTogether, 1);
  assert.equal(model.summary.notInterestedTogether, 1);
  assert.equal(model.watchTogether.length, 1);
  assert.equal(model.watchTogether[0].title, 'The Mastermind');
  assert.equal(model.watchTogether[0].badge, 'Leaving soon');
  assert.equal(model.watchTogether[0].venue, 'AMC Pacific Place');
  assert.match(model.watchTogether[0].availability, /showtime/i);
  assert.equal(model.activity.saved.length, 2);
  assert.equal(model.activity.seen.length, 1);
  assert.equal(model.activity.notInterested.length, 1);
  assert.equal(model.plans[0].theaterName, 'SIFF Cinema Downtown');
  assert.match(model.plans[0].when, /Sep 29/);
  assert.match(model.plans[0].when, /7:30/);
  assert.equal(model.plans[0].posterUrl, null);
  assert.equal(model.watchTogether[0].badge === 'Both saved', false);
});

test('plans without mutual saves still produce plan cards and an empty watch list', () => {
  const model = buildFriendDetailModel({
    friend: friend(),
    sharesActivity: true,
    activity: activityFor([
      activityFilm('tmdb:2', { saved: true, seen: false, not_interested: false }),
    ]),
    viewerSaved: [],
    viewerSeen: [],
    viewerNotInterested: [],
    planCards: buildFriendPlanCards([signal()]),
    homeData: homeData(),
    now: NOW,
  });
  assert.equal(model.summary.savedTogether, 0);
  assert.equal(model.summary.upcomingPlans, 1);
  assert.equal(model.plans.length, 1);
  assert.deepEqual(model.watchTogether, []);
  assert.equal(model.activity.saved.length, 1);
  assert.equal(model.activity.saved[0].badge?.startsWith('Opens'), true);
});

test('mutual saves without plans omit the plan list', () => {
  const model = buildFriendDetailModel({
    friend: friend(),
    sharesActivity: true,
    activity: activityFor([
      activityFilm('tmdb:1', { saved: true, seen: false, not_interested: false }),
    ]),
    viewerSaved: [viewerItem('tmdb:1')],
    viewerSeen: [],
    viewerNotInterested: [],
    planCards: [],
    homeData: homeData(),
    now: NOW,
  });
  assert.equal(model.summary.upcomingPlans, 0);
  assert.equal(model.plans.length, 0);
  assert.equal(model.watchTogether.length, 1);
});

test('neither plans nor mutual saves is a zero summary with empty watch and activity tabs', () => {
  const model = buildFriendDetailModel({
    friend: friend({ createdAt: '' }),
    sharesActivity: true,
    activity: activityFor([]),
    viewerSaved: [viewerItem('tmdb:1')],
    viewerSeen: [],
    viewerNotInterested: [],
    planCards: [],
    now: NOW,
  });
  assert.equal(model.friendsSinceLabel, null);
  assert.deepEqual(model.summary, {
    savedTogether: 0,
    upcomingPlans: 0,
    seenTogether: 0,
    notInterestedTogether: 0,
  });
  assert.deepEqual(model.watchTogether, []);
  assert.deepEqual(model.activity.saved, []);
  assert.deepEqual(model.activity.seen, []);
  assert.deepEqual(model.activity.notInterested, []);
  assert.match(friendActivityEmptyCopy('saved', 'Shelley'), /hasn’t saved/);
  assert.match(friendActivityEmptyCopy('seen', 'Shelley'), /seen/);
  assert.match(friendActivityEmptyCopy('not-interested', 'Shelley'), /not interested/);
  assert.equal(watchTogetherEmptyCopy('Shelley').title, 'No films saved together yet');
  assert.equal(watchTogetherEmptyCopy('Shelley').action, 'Browse films');
});

test('hidden activity does not invent mutual film counts', () => {
  const model = buildFriendDetailModel({
    friend: friend(),
    sharesActivity: false,
    activity: activityFor(
      [activityFilm('tmdb:1', { saved: true, seen: true, not_interested: true })],
      false,
    ),
    viewerSaved: [viewerItem('tmdb:1')],
    viewerSeen: [viewerItem('tmdb:1')],
    viewerNotInterested: [viewerItem('tmdb:1')],
    planCards: buildFriendPlanCards([signal()]),
    now: NOW,
  });
  assert.equal(model.summary, null);
  assert.equal(model.watchTogether.length, 0);
  assert.equal(model.activity.saved.length, 0);
  assert.equal(model.plans.length, 1);
});

test('plan avatars include the viewer only when they are already on the plan', () => {
  const onPlan = buildFriendPlanCards([signal({ viewer_can_join: false })])[0];
  const open = buildFriendPlanCards([signal({ viewer_can_join: true })])[0];
  const viewer = { displayName: 'You', avatarUrl: null };
  assert.equal(planCardAvatars(onPlan, viewer).length, 2);
  assert.equal(planCardAvatars(onPlan, viewer)[0].key, 'viewer');
  assert.equal(planCardAvatars(open, viewer).length, 1);
  assert.equal(planCardAvatars(open, viewer)[0].key, 'u-shelley');
});

test('catalog context collapses when the film is not in home data', () => {
  const cards = buildFriendDetailFilmCards(
    [activityFilm('tmdb:99', { saved: true, seen: false, not_interested: false })],
    { homeData: homeData(), now: NOW },
  );
  assert.equal(cards[0].badge, null);
  assert.equal(cards[0].venue, null);
  assert.equal(cards[0].availability, null);
});

test('browse films returns to Friend Detail, and plans open the shared plan', () => {
  let nav = createInitialNavState();
  nav = openProfileFriends(nav, { originPrimary: 'profile' });
  nav = openFriendDetail(nav, {
    friendUserId: 'u-shelley',
    originPrimary: 'profile',
    returnSurface: nav.surface,
  });
  const friendSurface = nav.surface;
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.allMovies,
    originPrimary: 'profile',
    returnSurface: friendSurface,
  });
  assert.equal(nav.surface.collectionId, 'all-movies');
  assert.equal(resolveHeaderBackLabel(nav), 'Friend');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'friend-detail');
  assert.equal(nav.surface.friendUserId, 'u-shelley');

  nav = openSharedPlanDetail(nav, {
    planId: 'shared:bay',
    originPrimary: 'profile',
    returnSurface: nav.surface,
  });
  assert.equal(resolveHeaderBackLabel(nav), 'Friend');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'friend-detail');
});

test('Friend Detail surface keeps loading, privacy, and in-place tabs', () => {
  assert.match(SURFACE, /Loading activity…/);
  assert.match(SURFACE, /Couldn’t load shared film activity/);
  assert.match(SURFACE, /data-friend-activity-privacy="hidden"/);
  assert.match(SURFACE, /data-friend-watch-empty/);
  assert.match(SURFACE, /data-friend-plans/);
  assert.match(SURFACE, /planCards\.length > 0/);
  assert.match(SURFACE, /onOpenSharedPlan/);
  assert.match(SURFACE, /onBrowseFilms/);
  assert.match(SURFACE, /setActivityTab/);
  assert.doesNotMatch(SURFACE, /View all/);
  assert.doesNotMatch(SURFACE, /Both saved/);
  assert.match(APP, /COLLECTION_IDS\.allMovies/);
  assert.match(APP, /onBrowseFilms/);
});
