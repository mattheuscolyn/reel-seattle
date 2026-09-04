import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInitialNavState,
  navigateBack,
  openFriendInviteLanding,
  openProfileFriends,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import {
  acceptFriendInvite,
  lookupFriendInvite,
} from '../../v2/friends/friendsApi.js';
import {
  FRIEND_ERROR_REASONS,
  FRIEND_INVITE_PUBLIC_ORIGIN,
  buildFriendInviteUrl,
  friendGivenName,
  isLikelyFriendInviteToken,
  normalizeFriendInviteCode,
  parseInviteTokenFromPath,
  previewSlotCount,
  restoreInvitePath,
  splitFriendsForPreview,
} from '../../v2/friends/friendsModel.js';
import {
  FRIENDS_COPY,
  alreadyFriendsCopy,
  buildInviteShareText,
  inviteFailureCopy,
  nowFriendsCopy,
  removeFriendTitle,
} from '../../v2/friends/friendsCopy.js';
import {
  copyInviteValue,
  shareOrCopyInviteLink,
} from '../../v2/friends/inviteShare.js';
import {
  PROFILE_FRIENDS_SURFACE_TYPE,
  FRIEND_INVITE_LANDING_SURFACE_TYPE,
} from '../../v2/friends/friendsIds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const RATE_PATH = join(
  ROOT,
  'supabase/migrations/20260904140000_friend_invite_short_code_rate_limit.sql',
);
const FOUNDATION_PATH = join(
  ROOT,
  'supabase/migrations/20260904000000_friendships_and_invites.sql',
);
const RATE_SQL = readFileSync(RATE_PATH, 'utf8');
const FOUNDATION_SQL = readFileSync(FOUNDATION_PATH, 'utf8');

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function allMigrationSql() {
  const dir = join(ROOT, 'supabase/migrations');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

function createRpcClient({ session = { user: { id: 'u-1' } }, handler }) {
  return {
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
    },
    async rpc(name, args) {
      return handler(name, args);
    },
  };
}

const PROFILE_SRC = read('v2/profile/ProfileDestination.jsx');
const PREVIEW_SRC = read('v2/friends/ProfileFriendsPreview.jsx');
const FRIENDS_SRC = read('v2/friends/FriendsSurface.jsx');
const INVITE_SRC = read('v2/friends/InviteFriendSheet.jsx');
const CODE_SRC = read('v2/friends/EnterFriendCodeSheet.jsx');
const LANDING_SRC = read('v2/friends/FriendInviteLandingSurface.jsx');
const APP_SRC = read('v2/V2App.jsx');
const MAIN_SRC = read('v2/main.jsx');
const VITE_SRC = read('vite.v2.config.js');
const DIST_CHECK = read('scripts/check_dist_v2_artifacts.mjs');
const PRIVACY_SRC = read('v2/profile/settings/profileSettingsCopy.js');
const SETTINGS_SRC = read('v2/profile/settings/ProfileSettingsSurface.jsx');
const SETTINGS_ROWS = read('v2/profile/profileSettingsRows.js');
const PLANNER_SRC = read('v2/planner/PlannerDestination.jsx');
const BROWSE_SRC = read('v2/surfaces/ShowtimesBrowseSurface.jsx');
const FILMS_SRC = read('v2/profile/ProfileDestination.jsx');

// ---------------------------------------------------------------------------
// Profile preview
// ---------------------------------------------------------------------------

test('1. Friends section appears between Your Films and Favorite Theaters', () => {
  const films = PROFILE_SRC.indexOf('data-profile-section="yourFilms"');
  const preview = PROFILE_SRC.indexOf('<ProfileFriendsPreview');
  const theaters = PROFILE_SRC.indexOf('data-profile-section="favoriteTheaters"');
  const settings = PROFILE_SRC.indexOf('data-profile-section="settings"');
  const admin = PROFILE_SRC.indexOf('data-profile-section="admin"');
  assert.ok(films > 0 && preview > films && theaters > preview);
  assert.ok(settings > theaters && admin > settings);
  assert.match(PREVIEW_SRC, /data-profile-section="friends"/);
});

test('2. signed-in zero friends shows Invite a friend, not a count', () => {
  assert.match(PREVIEW_SRC, /data-friends-preview="empty"/);
  assert.match(PREVIEW_SRC, /FRIENDS_COPY\.inviteFriend/);
  assert.match(PREVIEW_SRC, /FRIENDS_COPY\.emptyHelper/);
  assert.equal(PREVIEW_SRC.includes('0 friends'), false);
  assert.equal(PREVIEW_SRC.includes('friends.length} friend'), false);
  assert.equal(FRIENDS_COPY.inviteFriend, 'Invite a friend');
});

test('3. signed-out Friends section offers Continue with Google', () => {
  assert.match(PREVIEW_SRC, /data-friends-preview="signed-out"/);
  assert.match(PREVIEW_SRC, /FRIENDS_COPY\.signedOutTitle/);
  assert.match(PREVIEW_SRC, /FRIENDS_COPY\.signInLabel/);
  assert.match(PREVIEW_SRC, /signInWithGoogle/);
  assert.equal(FRIENDS_COPY.signInLabel, 'Continue with Google');
});

test('4-6. preview renders avatars/names, preserves order, and overflows with +X more', () => {
  assert.match(PREVIEW_SRC, /<FriendAvatar/);
  assert.match(PREVIEW_SRC, /friendGivenName/);
  assert.match(PREVIEW_SRC, /aria-label=\{full\}/);
  assert.match(PREVIEW_SRC, /splitFriendsForPreview/);
  assert.equal(friendGivenName('Sarah Bell'), 'Sarah');
  assert.equal(previewSlotCount(360), 4);
  assert.equal(previewSlotCount(390), 4);
  assert.equal(previewSlotCount(430), 4);
  const split = splitFriendsForPreview(
    [
      { userId: '1' },
      { userId: '2' },
      { userId: '3' },
      { userId: '4' },
      { userId: '5' },
    ],
    4,
  );
  assert.equal(split.visible.length, 3);
  assert.equal(split.overflow, 2);
  const exact = splitFriendsForPreview([{ userId: '1' }, { userId: '2' }], 4);
  assert.equal(exact.visible.length, 2);
  assert.equal(exact.overflow, 0);
  assert.match(PREVIEW_SRC, /\+\{overflow\}/);
  assert.match(PREVIEW_SRC, /FRIENDS_COPY\.moreLabel/);
});

test('7-8. View all and avatars open Friends; Profile stays selected', () => {
  assert.match(PREVIEW_SRC, /data-friends-action="view-all"/);
  assert.match(PREVIEW_SRC, /onOpenFriends/);
  let nav = selectPrimaryDestination(createInitialNavState(), 'profile');
  nav = openProfileFriends(nav, { originPrimary: 'profile', focusUserId: 'u-2' });
  assert.equal(nav.surface.type, PROFILE_FRIENDS_SURFACE_TYPE);
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(resolveActivePrimaryId(nav), 'profile');
  assert.equal(nav.surface.focusUserId, 'u-2');
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(resolveActivePrimaryId(nav), 'profile');
});

// ---------------------------------------------------------------------------
// Friends screen
// ---------------------------------------------------------------------------

test('9-17. Friends destination rows, invite, code, remove, empty, back', () => {
  assert.match(FRIENDS_SRC, /data-friends-surface=/);
  assert.match(FRIENDS_SRC, /data-friends-list="rows"/);
  assert.match(FRIENDS_SRC, /<FriendAvatar/);
  assert.match(FRIENDS_SRC, /v2-friends-row-name/);
  assert.match(FRIENDS_SRC, /data-friends-action="invite-friend"/);
  assert.match(FRIENDS_SRC, /data-friends-action="enter-code"/);
  assert.match(FRIENDS_SRC, /data-friends-action="row-menu"/);
  assert.match(FRIENDS_SRC, /data-friends-action="remove-friend"/);
  assert.match(FRIENDS_SRC, /data-friends-confirm="remove"/);
  assert.match(FRIENDS_SRC, /removeFriendTitle/);
  assert.match(FRIENDS_SRC, /FRIENDS_COPY\.removeConfirmBody/);
  assert.match(FRIENDS_SRC, /removeFriendAndRefresh/);
  assert.match(FRIENDS_SRC, /data-friends-list="empty"/);
  assert.equal(removeFriendTitle('John'), 'Remove John?');
  assert.equal(
    FRIENDS_COPY.removeConfirmBody,
    'You’ll no longer be connected on Reel Seattle.',
  );
  assert.match(APP_SRC, /openProfileFriends/);
  assert.match(APP_SRC, /isProfileFriends/);
  assert.equal(FRIENDS_SRC.includes('email'), false);
  assert.equal(FRIENDS_SRC.includes('shareInteractionCount'), false);
  assert.equal(FRIENDS_SRC.includes('Follow'), false);
});

// ---------------------------------------------------------------------------
// Create invite
// ---------------------------------------------------------------------------

test('18-28. invite is created on tap, then link/code/copy/share/revoke', () => {
  assert.equal(INVITE_SRC.includes('useEffect'), false);
  assert.match(INVITE_SRC, /data-friends-action="create-invite"/);
  assert.match(INVITE_SRC, /createFriendInvite\(\)/);
  assert.match(INVITE_SRC, /FRIENDS_COPY\.inviteLink/);
  assert.match(INVITE_SRC, /data-friends-invite-code=/);
  assert.match(INVITE_SRC, /data-friends-action="copy-link"/);
  assert.match(INVITE_SRC, /data-friends-action="copy-code"/);
  assert.match(INVITE_SRC, /data-friends-action="share-link"/);
  assert.match(INVITE_SRC, /shareOrCopyInviteLink/);
  assert.match(INVITE_SRC, /navigator\.share/);
  assert.match(INVITE_SRC, /data-friends-action="revoke-invite"/);
  assert.match(INVITE_SRC, /revokeFriendInvite/);
  assert.match(INVITE_SRC, /FRIENDS_COPY\.inviteCanceled/);
  assert.match(INVITE_SRC, /FRIENDS_COPY\.createNewInvite/);
  const url = buildFriendInviteUrl('abc'.repeat(21).slice(0, 64));
  assert.match(url, new RegExp(`^${FRIEND_INVITE_PUBLIC_ORIGIN}/invite/`));
  assert.equal(
    buildInviteShareText('https://www.reelseattle.com/invite/tok'),
    'Join me on Reel Seattle: https://www.reelseattle.com/invite/tok',
  );
});

test('copy uses Clipboard API; share falls back to copy', async () => {
  const writes = [];
  const copied = await copyInviteValue('hello', {
    writeText: async (value) => {
      writes.push(value);
    },
  });
  assert.deepEqual(copied, { ok: true });
  assert.deepEqual(writes, ['hello']);

  const shared = await shareOrCopyInviteLink('https://www.reelseattle.com/invite/t', {
    share: async () => {},
  });
  assert.deepEqual(shared, { ok: true, method: 'share' });

  const fallback = await shareOrCopyInviteLink(
    'https://www.reelseattle.com/invite/t',
    {
      share: null,
      clipboard: { writeText: async () => {} },
    },
  );
  assert.deepEqual(fallback, { ok: true, method: 'copy' });
});

// ---------------------------------------------------------------------------
// Code entry
// ---------------------------------------------------------------------------

test('29-36. code entry normalizes, confirms, accepts, and maps errors', () => {
  assert.equal(normalizeFriendInviteCode('ab 23km'), 'AB23KM');
  assert.equal(normalizeFriendInviteCode('abcdefghij'), 'ABCDEFGH');
  assert.match(CODE_SRC, /normalizeFriendInviteCode/);
  assert.match(CODE_SRC, /maxLength=\{8\}/);
  assert.match(CODE_SRC, /FRIENDS_COPY\.codeInvalidLength/);
  assert.match(CODE_SRC, /lookupFriendInvite/);
  assert.match(CODE_SRC, /data-friends-code="confirm"/);
  assert.match(CODE_SRC, /connectWithTitle/);
  assert.match(CODE_SRC, /data-friends-action="accept-code"/);
  assert.match(CODE_SRC, /acceptFriendInvite/);
  assert.match(CODE_SRC, /inviteFailureCopy/);
  assert.equal(
    inviteFailureCopy('rate_limited'),
    'Too many attempts. Try again in a few minutes.',
  );
  assert.equal(inviteFailureCopy('invite_not_found'), FRIENDS_COPY.landingInvalid);
  assert.equal(inviteFailureCopy('invite_expired'), FRIENDS_COPY.landingExpired);
  assert.equal(inviteFailureCopy('invite_revoked'), FRIENDS_COPY.landingRevoked);
  assert.match(FRIENDS_SRC, /signedIn \? \(/);
  assert.match(FRIENDS_SRC, /data-friends-action="enter-code"/);
});

test('short-code lookup still requires auth at the client boundary', async () => {
  const client = createRpcClient({
    session: null,
    handler: () => {
      throw new Error('must not lookup short codes signed out');
    },
  });
  const result = await lookupFriendInvite('AB23KMPQ', { getClient: () => client });
  assert.deepEqual(result, { ok: false, reason: 'not_authenticated' });
});

test('rate_limited is a normalized client error', async () => {
  assert.ok(FRIEND_ERROR_REASONS.includes('rate_limited'));
  const client = createRpcClient({
    handler: async () => ({
      data: { ok: false, reason: 'rate_limited' },
      error: null,
    }),
  });
  const result = await lookupFriendInvite('AB23KMPQ', { getClient: () => client });
  assert.deepEqual(result, { ok: false, reason: 'rate_limited' });
});

// ---------------------------------------------------------------------------
// Invite landing / routing
// ---------------------------------------------------------------------------

test('37-38. /invite/<token> is recognized; unrelated paths are ignored', () => {
  const token = 'a'.repeat(64);
  assert.equal(parseInviteTokenFromPath(`/invite/${token}`), token);
  assert.equal(parseInviteTokenFromPath('/invite/not-hex'), 'not-hex');
  assert.equal(isLikelyFriendInviteToken('not-hex'), false);
  assert.equal(isLikelyFriendInviteToken(token), true);
  assert.equal(parseInviteTokenFromPath('/planner'), null);
  assert.equal(parseInviteTokenFromPath('/invite'), null);
  assert.equal(parseInviteTokenFromPath('/film/abc'), null);
  assert.match(APP_SRC, /parseInviteTokenFromPath/);
  assert.match(APP_SRC, /isLikelyFriendInviteToken/);
  assert.match(APP_SRC, /openFriendInviteLanding/);
  assert.match(MAIN_SRC, /restoreSpaRedirectPath/);
  assert.match(VITE_SRC, /404\.html/);
  assert.match(DIST_CHECK, /'404\.html'/);
});

test('39-49. landing copy, Google continuation, accept, and error states', () => {
  assert.match(LANDING_SRC, /invitedYouCopy/);
  assert.match(LANDING_SRC, /data-friends-action="landing-google"/);
  assert.match(LANDING_SRC, /returnToInviteToken: token/);
  assert.match(APP_SRC, /consumeAuthReturnToInvite/);
  assert.match(APP_SRC, /restoreInvitePath/);
  assert.match(LANDING_SRC, /data-friends-action="accept-invite"/);
  assert.match(LANDING_SRC, /data-invite-landing="success"/);
  assert.match(LANDING_SRC, /nowFriendsCopy/);
  assert.match(LANDING_SRC, /data-invite-landing="already"/);
  assert.match(LANDING_SRC, /alreadyFriendsCopy/);
  assert.match(LANDING_SRC, /data-invite-landing="self"/);
  assert.match(LANDING_SRC, /FRIENDS_COPY\.landingSelf/);
  assert.match(LANDING_SRC, /data-invite-landing="error"/);
  assert.match(LANDING_SRC, /data-friends-action="retry-landing"/);
  assert.equal(nowFriendsCopy('John'), 'You’re now friends with John.');
  assert.equal(alreadyFriendsCopy('John'), 'You’re already friends with John.');
  const token = 'ab'.repeat(32);
  const replaced = [];
  restoreInvitePath(token, {
    pathname: '/',
    replaceState: (_d, _t, url) => replaced.push(url),
  });
  assert.deepEqual(replaced, [`/invite/${token}`]);
  let nav = openFriendInviteLanding(createInitialNavState(), {
    token,
    originPrimary: 'home',
  });
  assert.equal(nav.surface.type, FRIEND_INVITE_LANDING_SURFACE_TYPE);
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'home');
});

// ---------------------------------------------------------------------------
// Rate limit SQL
// ---------------------------------------------------------------------------

test('50-57. short-code rate limit is server-side and isolated', () => {
  assert.match(RATE_SQL, /T-FRIENDS-INVITES-02/);
  assert.match(RATE_SQL, /Do not edit 20260904000000/);
  assert.equal(/rate_limited/.test(FOUNDATION_SQL), false);
  assert.match(RATE_SQL, /create table if not exists public\.friend_invite_code_attempts/);
  assert.match(RATE_SQL, /revoke all on table public\.friend_invite_code_attempts from anon/);
  assert.match(RATE_SQL, /revoke all on table public\.friend_invite_code_attempts from authenticated/);
  assert.equal(/grant (select|insert|update|delete) on table public\.friend_invite_code_attempts/i.test(RATE_SQL), false);
  assert.match(RATE_SQL, /interval '10 minutes'/);
  assert.match(RATE_SQL, /\) >= 10;/);
  assert.match(RATE_SQL, /v_is_code := char_length\(v_key\) <= 8/);
  assert.match(RATE_SQL, /friend_invite_short_code_rate_limited\(\)/);
  assert.match(RATE_SQL, /'rate_limited'/);
  assert.match(RATE_SQL, /friend_invite_record_short_code_failure\(\)/);
  assert.match(
    RATE_SQL,
    /if v_is_code and v_me is null then[\s\S]*not_authenticated/,
  );
  const lookupStart = RATE_SQL.indexOf(
    'create or replace function public.lookup_friend_invite',
  );
  const lookup = RATE_SQL.slice(lookupStart, lookupStart + 4500);
  assert.ok(lookup.indexOf('rate_limited') < lookup.indexOf('from public.friend_invites'));
  assert.match(lookup, /if v_is_code then\s+perform public\.friend_invite_record_short_code_failure/);
  assert.match(RATE_SQL, /insert into public\.friend_invite_code_attempts \(user_id\)/);
  assert.equal(/attempted_code|guessed_code/.test(RATE_SQL), false);
  assert.match(RATE_SQL, /where a\.user_id = auth\.uid\(\)/);
  assert.match(RATE_SQL, /Long invite tokens are[\s\S]*NOT counted|long invite tokens[\s\S]*NOT counted/i);
});

test('accept short-code path shares the lookup throttle; long tokens do not', () => {
  const acceptStart = RATE_SQL.indexOf(
    'create or replace function public.accept_friend_invite',
  );
  const accept = RATE_SQL.slice(acceptStart);
  assert.match(accept, /v_is_code := char_length\(v_key\) <= 8/);
  assert.match(accept, /rate_limited/);
  assert.match(accept, /if v_is_code and public\.friend_invite_short_code_rate_limited/);
});

test('rate-limit helpers are not executable by clients', () => {
  assert.match(
    RATE_SQL,
    /revoke all on function public\.friend_invite_short_code_rate_limited\(\) from anon, authenticated/,
  );
  assert.match(
    RATE_SQL,
    /revoke all on function public\.friend_invite_record_short_code_failure\(\) from anon, authenticated/,
  );
});

// ---------------------------------------------------------------------------
// Security / regression
// ---------------------------------------------------------------------------

test('58-62. no public search, no email, share count unread/unwritable in UI', () => {
  const allSql = allMigrationSql();
  assert.equal(/search_users|list_public_profiles|people_search/i.test(allSql), false);
  assert.equal(PREVIEW_SRC.includes('email'), false);
  assert.equal(FRIENDS_SRC.includes('email'), false);
  assert.equal(LANDING_SRC.includes('email'), false);
  assert.equal(PREVIEW_SRC.includes('shareInteractionCount'), false);
  assert.equal(FRIENDS_SRC.includes('shareInteractionCount'), false);
  assert.equal(INVITE_SRC.includes('shareInteractionCount'), false);
  assert.equal(CODE_SRC.includes('shareInteractionCount'), false);
  assert.equal(LANDING_SRC.includes('shareInteractionCount'), false);
  assert.equal(/update public\.friendships/i.test(RATE_SQL), false);
  assert.equal(/share_interaction_count\s*=/i.test(RATE_SQL), false);
  assert.equal(/create policy[\s\S]*on public\.profiles/i.test(RATE_SQL), false);
});

test('63-68. Profile/Planner/Browse/Admin stay in place aside from Friends insert', () => {
  assert.match(FILMS_SRC, /data-profile-section="yourFilms"/);
  assert.match(FILMS_SRC, /data-profile-section="favoriteTheaters"/);
  assert.match(FILMS_SRC, /data-profile-section="settings"/);
  assert.match(SETTINGS_ROWS, /Privacy & Sharing/);
  assert.match(PRIVACY_SRC, /Friends on Reel Seattle connect through private invites/);
  assert.equal(PRIVACY_SRC.includes('Future Friends'), false);
  assert.match(PRIVACY_SRC, /does not offer public profile search/);
  assert.equal(SETTINGS_SRC.includes('Friends can send me plans'), false);
  assert.equal(PLANNER_SRC.includes('friendsApi'), false);
  assert.equal(PLANNER_SRC.includes('Invite friend'), false);
  assert.equal(BROWSE_SRC.includes('friendsApi'), false);
  assert.match(FILMS_SRC, /profileIsAdmin\(auth\.profile\)/);
  assert.equal(APP_SRC.includes('PlanInvitation'), false);
  assert.equal(FRIENDS_SRC.includes('share_interaction_count'), false);
});

test('v2 boot restores Pages SPA path before render', () => {
  const restoreAt = MAIN_SRC.indexOf('restoreSpaRedirectPath()');
  const renderAt = MAIN_SRC.indexOf('createRoot(document');
  assert.ok(restoreAt >= 0 && renderAt > restoreAt);
});

test('acceptFriendInvite maps rate_limited', async () => {
  const client = createRpcClient({
    handler: async () => ({
      data: { ok: false, reason: 'rate_limited' },
      error: null,
    }),
  });
  const result = await acceptFriendInvite('AB23KMPQ', { getClient: () => client });
  assert.deepEqual(result, { ok: false, reason: 'rate_limited' });
});
