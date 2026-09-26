/**
 * Friend film activity — model, privacy, Film Detail / Friend Detail wiring.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRIEND_ACTIVITY_NAME_INLINE_LIMIT,
  buildFromYourFriendsPresentation,
  buildFriendActivityCollectionRows,
  canExposeFriendActivity,
  formatFriendNameOverflow,
  getFriendActivityForFilm,
  getSharedFilmActivityForFriend,
  normalizeFriendSharedActivityPayload,
  resolveFriendActivityCatalogKey,
} from '../../v2/friends/friendFilmActivityModel.js';
import {
  FRIEND_ACTIVITY_PRIVACY_STORAGE_KEY,
  getFriendActivityPrivacy,
  updateFriendActivityPrivacy,
} from '../../v2/friends/friendActivityPrivacyStore.js';
import {
  pullShareFilmActivityPreference,
  setShareFilmActivityWithFriends,
} from '../../v2/friends/friendFilmActivityApi.js';
import {
  sqlMirrorListFriendFilmStates,
  sqlMirrorListFriendSharedFilmActivity,
} from '../../v2/friends/friendFilmActivitySqlMirror.js';
import {
  normalizeFriendFilmUserState,
  syntheticShowtimeKeyForCanonicalFilmId,
} from '../../v2/filmState/filmUserStateModel.js';
import { filmPreferenceKeyFromRef } from '../../v2/auth/filmPreferenceIdentity.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openFriendDetail,
  openProfileFriends,
} from '../../v2/navigation/navState.js';
import { resolveHeaderBackLabel } from '../../v2/destinations.js';
import { FRIEND_DETAIL_SURFACE_TYPE } from '../../v2/friends/friendsIds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = readFileSync(
  join(ROOT, 'supabase/migrations/20260927000000_friend_film_activity_privacy.sql'),
  'utf8',
);
const FILM_DETAIL = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const FRIEND_DETAIL = readFileSync(
  join(ROOT, 'v2/friends/FriendDetailSurface.jsx'),
  'utf8',
);
const SETTINGS = readFileSync(
  join(ROOT, 'v2/profile/settings/ProfileSettingsSurface.jsx'),
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

function friend(overrides = {}) {
  return {
    friendshipId: overrides.friendshipId ?? `fs-${overrides.userId}`,
    userId: overrides.userId,
    displayName: overrides.displayName ?? null,
    avatarUrl: null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    shareInteractionCount: overrides.shareInteractionCount ?? 0,
  };
}

const friends = [
  friend({
    userId: 'u-jamie',
    displayName: 'Jamie Lee',
    shareInteractionCount: 5,
    createdAt: '2026-02-01T00:00:00.000Z',
  }),
  friend({
    userId: 'u-alex',
    displayName: 'Alex Rivera',
    shareInteractionCount: 3,
    createdAt: '2026-02-02T00:00:00.000Z',
  }),
  friend({
    userId: 'u-chris',
    displayName: 'Chris Park',
    shareInteractionCount: 2,
    createdAt: '2026-02-03T00:00:00.000Z',
  }),
  friend({
    userId: 'u-taylor',
    displayName: 'Taylor Quinn',
    shareInteractionCount: 1,
    createdAt: '2026-02-04T00:00:00.000Z',
  }),
  friend({
    userId: 'u-sam',
    displayName: 'Sam Ortiz',
    shareInteractionCount: 0,
    createdAt: '2026-02-05T00:00:00.000Z',
  }),
];

const filmKey = 'tmdb:1001';

function activityRow(userId, states) {
  return {
    user_id: userId,
    film_key: filmKey,
    film_id: 'tmdb:1001',
    showtime_film_key: 'fk-alpha',
    states,
  };
}

test('1 Film Detail shows Saved friend names', () => {
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [
      activityRow('u-jamie', { saved: true, seen: false, not_interested: false }),
      activityRow('u-alex', { saved: true, seen: false, not_interested: false }),
    ],
  });
  const presentation = buildFromYourFriendsPresentation(activity);
  assert.ok(presentation);
  assert.equal(presentation.lines[0].state, 'saved');
  assert.match(presentation.lines[0].text, /^Saved by Jamie, Alex$/);
});

test('2 Film Detail shows Seen friend names', () => {
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [
      activityRow('u-chris', { saved: false, seen: true, not_interested: false }),
    ],
  });
  const presentation = buildFromYourFriendsPresentation(activity);
  assert.equal(presentation.lines[0].text, 'Seen by Chris');
});

test('3 Film Detail shows Not Interested friend names', () => {
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [
      activityRow('u-taylor', {
        saved: false,
        seen: false,
        not_interested: true,
      }),
    ],
  });
  const presentation = buildFromYourFriendsPresentation(activity);
  assert.equal(presentation.lines[0].text, 'Not interested: Taylor');
});

test('4 overflow names collapse to +N', () => {
  assert.equal(FRIEND_ACTIVITY_NAME_INLINE_LIMIT, 2);
  assert.equal(
    formatFriendNameOverflow(['Jamie', 'Alex', 'Chris', 'Sam']),
    'Jamie, Alex +2',
  );
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [
      activityRow('u-jamie', { saved: true, seen: false, not_interested: false }),
      activityRow('u-alex', { saved: true, seen: false, not_interested: false }),
      activityRow('u-chris', { saved: true, seen: false, not_interested: false }),
      activityRow('u-sam', { saved: true, seen: false, not_interested: false }),
    ],
  });
  const presentation = buildFromYourFriendsPresentation(activity);
  assert.match(presentation.lines[0].text, /Saved by Jamie, Alex \+2/);
});

test('5 empty friend activity omits the section', () => {
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [],
  });
  assert.equal(activity.hasAny, false);
  assert.equal(buildFromYourFriendsPresentation(activity), null);
  assert.equal(
    buildFromYourFriendsPresentation(
      getFriendActivityForFilm({ filmKey: null, friends, activityRows: [] }),
    ),
    null,
  );
});

test('6 sharing-disabled friend is excluded', () => {
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [
      activityRow('u-jamie', { saved: true, seen: false, not_interested: false }),
      activityRow('u-alex', { saved: true, seen: false, not_interested: false }),
    ],
    sharingByUserId: { 'u-jamie': false, 'u-alex': true },
  });
  assert.equal(activity.saved.length, 1);
  assert.equal(activity.saved[0].userId, 'u-alex');
  assert.equal(
    canExposeFriendActivity('u-jamie', {
      acceptedFriendIds: ['u-jamie'],
      sharingByUserId: { 'u-jamie': false },
    }),
    false,
  );
});

test('7 non-friend activity is excluded', () => {
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [
      activityRow('stranger', { saved: true, seen: false, not_interested: false }),
      activityRow('u-chris', { saved: false, seen: true, not_interested: false }),
    ],
  });
  assert.equal(activity.saved.length, 0);
  assert.equal(activity.seen.length, 1);
  assert.equal(activity.seen[0].userId, 'u-chris');
});

test('8 Friend Detail shows Saved / Seen / Not Interested sections', () => {
  const detail = getSharedFilmActivityForFriend({
    friendId: 'u-jamie',
    friends,
    friendSharesActivity: true,
    activityRows: [
      {
        user_id: 'u-jamie',
        film_key: 'tmdb:1001',
        film_id: 'tmdb:1001',
        states: { saved: true, seen: false, not_interested: false },
        updated_at: '2026-03-01T00:00:00.000Z',
      },
      {
        user_id: 'u-jamie',
        film_key: 'tmdb:1002',
        film_id: 'tmdb:1002',
        states: { saved: false, seen: true, not_interested: false },
        updated_at: '2026-03-02T00:00:00.000Z',
      },
      {
        user_id: 'u-jamie',
        film_key: 'tmdb:1003',
        film_id: 'tmdb:1003',
        states: { saved: false, seen: false, not_interested: true },
        updated_at: '2026-03-03T00:00:00.000Z',
      },
    ],
  });
  assert.equal(detail.saved.length, 1);
  assert.equal(detail.seen.length, 1);
  assert.equal(detail.notInterested.length, 1);
  assert.match(FRIEND_DETAIL, /Saved/);
  assert.match(FRIEND_DETAIL, /Seen/);
  assert.match(FRIEND_DETAIL, /Not Interested/);
  assert.match(FRIEND_DETAIL, /data-friend-activity=\{stateId\}/);
  assert.match(FRIEND_DETAIL, /stateId="saved"/);
});

test('9 Friend Detail film tap opens Film Detail via identity payload', () => {
  const rows = buildFriendActivityCollectionRows([
    {
      filmKey: 'tmdb:1001',
      filmId: 'tmdb:1001',
      showtimeFilmKey: 'fk-alpha',
      updatedAt: '2026-03-01T00:00:00.000Z',
      states: { saved: true, seen: false, not_interested: false },
    },
  ]);
  assert.equal(rows[0].filmId, 'tmdb:1001');
  assert.ok(rows[0].filmKey);
  assert.match(FRIEND_DETAIL, /onOpenFilm/);
  assert.match(FRIEND_DETAIL, /PersonalCollectionFilmRow/);
});

test('10 back navigation restores Friend Detail', () => {
  let nav = createInitialNavState();
  nav = openProfileFriends(nav, { originPrimary: 'profile' });
  nav = openFriendDetail(nav, {
    friendUserId: 'u-jamie',
    originPrimary: 'profile',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, FRIEND_DETAIL_SURFACE_TYPE);
  nav = openFilmDetail(nav, {
    filmKey: 'fk-alpha',
    filmId: 'tmdb:1001',
    originPrimary: 'profile',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(
    resolveHeaderBackLabel(nav),
    'Friend',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, FRIEND_DETAIL_SURFACE_TYPE);
  assert.equal(nav.surface.friendUserId, 'u-jamie');
});

test('11 global share preference defaults OFF (opt-in)', () => {
  const storage = memoryStorage();
  assert.equal(
    getFriendActivityPrivacy(storage).shareFilmActivityWithFriends,
    false,
  );
  const updated = updateFriendActivityPrivacy(storage, {
    shareFilmActivityWithFriends: true,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.settings.shareFilmActivityWithFriends, true);
  assert.ok(storage.getItem(FRIEND_ACTIVITY_PRIVACY_STORAGE_KEY));
  assert.match(MIGRATION, /share_film_activity_with_friends boolean not null default false/);
  assert.match(MIGRATION, /set_share_film_activity_with_friends/);
  assert.match(
    MIGRATION,
    /coalesce\(p\.share_film_activity_with_friends, false\) = true/,
  );
  assert.match(SETTINGS, /share-film-activity/);
  assert.match(
    readFileSync(
      join(ROOT, 'v2/profile/settings/profileSettingsCopy.js'),
      'utf8',
    ),
    /Off by default/,
  );
});

test('12 canonical film identity is used, not title matching', () => {
  const activity = getFriendActivityForFilm({
    filmKey: 'tmdb:1001',
    friends,
    activityRows: [
      {
        user_id: 'u-jamie',
        film_key: 'tmdb:1001',
        film_id: 'tmdb:1001',
        states: { saved: true, seen: false, not_interested: false },
      },
      {
        user_id: 'u-alex',
        film_key: 'tmdb:9999',
        film_id: 'tmdb:9999',
        states: { saved: true, seen: false, not_interested: false },
      },
    ],
  });
  assert.equal(activity.saved.length, 1);
  assert.equal(activity.saved[0].userId, 'u-jamie');
  assert.match(FILM_DETAIL, /useFriendActivityForFilm/);
  assert.match(FILM_DETAIL, /FromYourFriendsSection/);
  // Aggregation keys on filmPreferenceKey / filmKey, never title text.
  const model = readFileSync(
    join(ROOT, 'v2/friends/friendFilmActivityModel.js'),
    'utf8',
  );
  assert.match(model, /row\.filmKey !== filmKey/);
  assert.match(model, /filmPreferenceKeyFromRef/);
});

test('13 duplicate friend activity rows do not duplicate names', () => {
  const activity = getFriendActivityForFilm({
    filmKey,
    friends,
    activityRows: [
      activityRow('u-jamie', { saved: true, seen: false, not_interested: false }),
      activityRow('u-jamie', { saved: true, seen: true, not_interested: false }),
      activityRow('u-jamie', { saved: true, seen: false, not_interested: false }),
    ],
  });
  assert.equal(activity.saved.length, 1);
  assert.equal(activity.seen.length, 1);
  const presentation = buildFromYourFriendsPresentation(activity);
  assert.equal(presentation.lines.filter((l) => l.state === 'saved').length, 1);
});

test('14 empty Friend Detail categories render gracefully', () => {
  const detail = getSharedFilmActivityForFriend({
    friendId: 'u-jamie',
    friends,
    friendSharesActivity: true,
    activityRows: [],
  });
  assert.deepEqual(detail.saved, []);
  assert.deepEqual(detail.seen, []);
  assert.deepEqual(detail.notInterested, []);
  assert.match(FRIEND_DETAIL, /No shared Saved films/);
  assert.match(FRIEND_DETAIL, /data-friend-activity-empty/);
});

test('15 unfriend / relationship removal prevents stale activity visibility', () => {
  const withoutJamie = friends.filter((f) => f.userId !== 'u-jamie');
  const activity = getFriendActivityForFilm({
    filmKey,
    friends: withoutJamie,
    activityRows: [
      activityRow('u-jamie', { saved: true, seen: false, not_interested: false }),
      activityRow('u-alex', { saved: true, seen: false, not_interested: false }),
    ],
  });
  assert.equal(activity.saved.length, 1);
  assert.equal(activity.saved[0].userId, 'u-alex');

  const detail = getSharedFilmActivityForFriend({
    friendId: 'u-jamie',
    friends: withoutJamie,
    friendSharesActivity: true,
    activityRows: [
      {
        user_id: 'u-jamie',
        film_key: filmKey,
        states: { saved: true, seen: false, not_interested: false },
      },
    ],
  });
  assert.equal(detail.isFriend, false);
  assert.deepEqual(detail.saved, []);
});

test('16 existing Film Detail behavior is unaffected when there is no friend activity', () => {
  assert.match(FILM_DETAIL, /FromYourFriendsSection/);
  assert.match(FILM_DETAIL, /data-fd-slot="why-see-it"/);
  // Section component returns null when presentation is empty.
  const section = readFileSync(
    join(ROOT, 'v2/friends/FromYourFriendsSection.jsx'),
    'utf8',
  );
  assert.match(section, /if \(!presentation\?\.lines\?\.length\) return null/);
});

test('migration defines friend-keyed activity RPC and privacy gate', () => {
  assert.match(MIGRATION, /list_friend_shared_film_activity/);
  assert.match(MIGRATION, /are_accepted_friends/);
  assert.match(MIGRATION, /share_film_activity_with_friends/);
});

test('Friend Detail film ordering prefers recent updatedAt then filmKey', () => {
  const detail = getSharedFilmActivityForFriend({
    friendId: 'u-jamie',
    friends,
    friendSharesActivity: true,
    activityRows: [
      {
        user_id: 'u-jamie',
        film_key: 'tmdb:1001',
        states: { saved: true, seen: false, not_interested: false },
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        user_id: 'u-jamie',
        film_key: 'tmdb:1002',
        states: { saved: true, seen: false, not_interested: false },
        updated_at: '2026-03-01T00:00:00.000Z',
      },
    ],
  });
  assert.equal(detail.saved[0].filmKey, 'tmdb:1002');
  assert.equal(detail.saved[1].filmKey, 'tmdb:1001');
});

test('cloud privacy mutation: successful ON and OFF', async () => {
  const storage = memoryStorage();
  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'me' } } } }),
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          ok: true,
          share_film_activity_with_friends: args.p_enabled === true,
        },
        error: null,
      };
    },
  };
  const on = await setShareFilmActivityWithFriends(true, {
    storage,
    getClient: () => client,
  });
  assert.equal(on.ok, true);
  assert.equal(on.synced, true);
  assert.equal(on.source, 'cloud');
  assert.equal(on.settings.shareFilmActivityWithFriends, true);
  assert.equal(getFriendActivityPrivacy(storage).shareFilmActivityWithFriends, true);

  const off = await setShareFilmActivityWithFriends(false, {
    storage,
    getClient: () => client,
  });
  assert.equal(off.ok, true);
  assert.equal(off.synced, true);
  assert.equal(off.settings.shareFilmActivityWithFriends, false);
  assert.equal(getFriendActivityPrivacy(storage).shareFilmActivityWithFriends, false);
  assert.equal(calls.length, 2);
});

test('cloud privacy mutation: failed OFF rolls back to confirmed ON', async () => {
  const storage = memoryStorage();
  updateFriendActivityPrivacy(storage, { shareFilmActivityWithFriends: true });
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'me' } } } }),
    },
    rpc: async () => ({
      data: null,
      error: { message: 'rpc_failed' },
    }),
  };
  const result = await setShareFilmActivityWithFriends(false, {
    storage,
    getClient: () => client,
  });
  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, true);
  assert.equal(result.settings.shareFilmActivityWithFriends, true);
  assert.equal(getFriendActivityPrivacy(storage).shareFilmActivityWithFriends, true);
});

test('cloud privacy mutation: failed ON rolls back to confirmed OFF', async () => {
  const storage = memoryStorage();
  assert.equal(getFriendActivityPrivacy(storage).shareFilmActivityWithFriends, false);
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'me' } } } }),
    },
    rpc: async () => ({
      data: null,
      error: { message: 'rpc_failed' },
    }),
  };
  const result = await setShareFilmActivityWithFriends(true, {
    storage,
    getClient: () => client,
  });
  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, true);
  assert.equal(result.settings.shareFilmActivityWithFriends, false);
  assert.equal(getFriendActivityPrivacy(storage).shareFilmActivityWithFriends, false);
});

test('pullShareFilmActivityPreference overwrites stale local with server value', async () => {
  const storage = memoryStorage();
  updateFriendActivityPrivacy(storage, { shareFilmActivityWithFriends: true });
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'me' } } } }),
    },
    from() {
      return {
        select() {
          return {
            maybeSingle: async () => ({
              data: { share_film_activity_with_friends: false },
              error: null,
            }),
          };
        },
      };
    },
  };
  const result = await pullShareFilmActivityPreference({
    storage,
    getClient: () => client,
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'cloud');
  assert.equal(result.settings.shareFilmActivityWithFriends, false);
  assert.equal(getFriendActivityPrivacy(storage).shareFilmActivityWithFriends, false);
});

test('SQL mirror: film→friends includes Jamie, excludes Alex OFF and Taylor non-friend', () => {
  const prefs = [
    {
      user_id: 'jamie',
      film_key: 'tmdb:1001',
      preference_type: 'saved',
      is_active: true,
    },
    {
      user_id: 'jamie',
      film_key: 'tmdb:1001',
      preference_type: 'seen',
      is_active: true,
    },
    {
      user_id: 'alex',
      film_key: 'tmdb:1001',
      preference_type: 'saved',
      is_active: true,
    },
    {
      user_id: 'taylor',
      film_key: 'tmdb:1001',
      preference_type: 'saved',
      is_active: true,
    },
    {
      user_id: 'viewer',
      film_key: 'tmdb:1001',
      preference_type: 'saved',
      is_active: true,
    },
  ];
  const rows = sqlMirrorListFriendFilmStates(prefs, {
    viewerId: 'viewer',
    filmKey: 'tmdb:1001',
    friendships: [
      ['viewer', 'jamie'],
      ['viewer', 'alex'],
    ],
    shareByUserId: { jamie: true, alex: false, taylor: true },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, 'jamie');
  assert.deepEqual(rows[0].states, {
    saved: true,
    seen: true,
    not_interested: false,
  });
});

test('SQL mirror: friend→films respects sharing OFF and non-friend', () => {
  const prefs = [
    {
      user_id: 'jamie',
      film_key: 'tmdb:1001',
      preference_type: 'saved',
      is_active: true,
      updated_at: '2026-03-01T00:00:00.000Z',
    },
    {
      user_id: 'alex',
      film_key: 'tmdb:1002',
      preference_type: 'seen',
      is_active: true,
      updated_at: '2026-03-02T00:00:00.000Z',
    },
    {
      user_id: 'taylor',
      film_key: 'tmdb:1003',
      preference_type: 'saved',
      is_active: true,
      updated_at: '2026-03-03T00:00:00.000Z',
    },
  ];
  const friendships = [
    ['viewer', 'jamie'],
    ['viewer', 'alex'],
  ];
  const jamie = sqlMirrorListFriendSharedFilmActivity(prefs, {
    viewerId: 'viewer',
    friendId: 'jamie',
    friendships,
    shareByUserId: { jamie: true, alex: false },
  });
  assert.equal(jamie.is_friend, true);
  assert.equal(jamie.shares_activity, true);
  assert.equal(jamie.films.length, 1);

  const alex = sqlMirrorListFriendSharedFilmActivity(prefs, {
    viewerId: 'viewer',
    friendId: 'alex',
    friendships,
    shareByUserId: { jamie: true, alex: false },
  });
  assert.equal(alex.is_friend, true);
  assert.equal(alex.shares_activity, false);
  assert.deepEqual(alex.films, []);

  const taylor = sqlMirrorListFriendSharedFilmActivity(prefs, {
    viewerId: 'viewer',
    friendId: 'taylor',
    friendships,
    shareByUserId: { taylor: true },
  });
  assert.equal(taylor.is_friend, false);
  assert.deepEqual(taylor.films, []);
});

test('SQL mirror: friendship removal and sharing ON→OFF remove access', () => {
  const prefs = [
    {
      user_id: 'jamie',
      film_key: 'tmdb:1001',
      preference_type: 'saved',
      is_active: true,
    },
  ];
  const share = { jamie: true };
  const before = sqlMirrorListFriendFilmStates(prefs, {
    viewerId: 'viewer',
    filmKey: 'tmdb:1001',
    friendships: [['viewer', 'jamie']],
    shareByUserId: share,
  });
  assert.equal(before.length, 1);

  const afterUnfriend = sqlMirrorListFriendFilmStates(prefs, {
    viewerId: 'viewer',
    filmKey: 'tmdb:1001',
    friendships: [],
    shareByUserId: share,
  });
  assert.deepEqual(afterUnfriend, []);

  const afterOff = sqlMirrorListFriendFilmStates(prefs, {
    viewerId: 'viewer',
    filmKey: 'tmdb:1001',
    friendships: [['viewer', 'jamie']],
    shareByUserId: { jamie: false },
  });
  assert.deepEqual(afterOff, []);

  const friendDetailOff = sqlMirrorListFriendSharedFilmActivity(prefs, {
    viewerId: 'viewer',
    friendId: 'jamie',
    friendships: [['viewer', 'jamie']],
    shareByUserId: { jamie: false },
  });
  assert.equal(friendDetailOff.shares_activity, false);
  assert.deepEqual(friendDetailOff.films, []);
});

test('SECURITY DEFINER RPCs pin search_path and restrict grants', () => {
  assert.match(MIGRATION, /security definer/i);
  assert.match(MIGRATION, /set search_path = public, pg_temp/);
  assert.match(
    MIGRATION,
    /revoke all on function public\.list_friend_shared_film_activity\(uuid\) from anon/,
  );
  assert.match(
    MIGRATION,
    /grant execute on function public\.list_friend_shared_film_activity\(uuid\) to authenticated/,
  );
  assert.match(MIGRATION, /auth\.uid\(\)/);
  assert.match(MIGRATION, /are_accepted_friends\(v_uid, v_friend\)/);
});

test('TMDB synthetic catalog key is deterministic and preference-key compatible', () => {
  const a = normalizeFriendFilmUserState({
    user_id: 'u-jamie',
    film_key: 'tmdb:4242',
    film_id: 'tmdb:4242',
    states: { saved: true, seen: false, not_interested: false },
  });
  const b = normalizeFriendFilmUserState({
    user_id: 'u-jamie',
    film_key: 'tmdb:4242',
    film_id: 'tmdb:4242',
    states: { saved: true, seen: false, not_interested: false },
  });
  assert.ok(a);
  assert.equal(a.filmRef.showtimeFilmKey, syntheticShowtimeKeyForCanonicalFilmId('tmdb:4242'));
  assert.equal(a.filmRef.showtimeFilmKey, b.filmRef.showtimeFilmKey);
  assert.equal(a.filmKey, 'tmdb:4242');
  assert.equal(resolveFriendActivityCatalogKey('tmdb:4242'), 'tmdb:4242');
  assert.equal(
    filmPreferenceKeyFromRef(a.filmRef),
    resolveFriendActivityCatalogKey('tmdb:4242'),
  );
  // Not derived from mutable title text.
  assert.notEqual(a.filmRef.showtimeFilmKey, 'Some Movie Title');
});

test('Friend Detail privacy-hidden signal when sharing OFF', () => {
  assert.match(FRIEND_DETAIL, /data-friend-activity-privacy="hidden"/);
  assert.match(FRIEND_DETAIL, /isn.t sharing film activity/);
  const payload = normalizeFriendSharedActivityPayload({
    ok: true,
    is_friend: true,
    shares_activity: false,
    films: [
      {
        user_id: 'u-alex',
        film_key: 'tmdb:1',
        states: { saved: true, seen: false, not_interested: false },
      },
    ],
  });
  assert.equal(payload.sharesActivity, false);
  assert.deepEqual(payload.films, []);
});
