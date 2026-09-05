import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acceptFriendInvite,
  createFriendInvite,
  listFriends,
  lookupFriendInvite,
  removeFriend,
  revokeFriendInvite,
} from '../../v2/friends/friendsApi.js';
import {
  FRIEND_INVITE_PUBLIC_ORIGIN,
  FRIEND_RPC,
  buildFriendInviteUrl,
  compareFriendSummaries,
  normalizeFriendInvite,
  normalizeFriendRpcFailure,
  normalizeFriendSummary,
  omitPrivateAccountFields,
  parseInviteTokenFromPath,
} from '../../v2/friends/friendsModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_PATH = join(
  ROOT,
  'supabase/migrations/20260904000000_friendships_and_invites.sql',
);
const MIGRATION = readFileSync(MIGRATION_PATH, 'utf8');

function allMigrationSql() {
  const dir = join(ROOT, 'supabase/migrations');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');
}

function functionBody(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = MIGRATION.match(
    new RegExp(
      `create or replace function public\\.${escaped}[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    ),
  );
  assert.ok(match, `expected function ${name}`);
  return match[1];
}

function createRpcClient({ session = null, handler }) {
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

// ---------------------------------------------------------------------------
// Migration / constraints
// ---------------------------------------------------------------------------

test('1. friendship canonical pair is unique and ordered user_low < user_high', () => {
  assert.match(MIGRATION, /T-FRIENDS-INVITES-01/);
  assert.match(MIGRATION, /Do not edit prior migrations/);
  assert.match(MIGRATION, /create table if not exists public\.friendships/);
  assert.match(MIGRATION, /constraint friendships_pair_unique\s+unique \(user_low, user_high\)/);
  assert.match(MIGRATION, /constraint friendships_canonical_order\s+check \(user_low < user_high\)/);
});

test('2. self-friendship is rejected', () => {
  assert.match(MIGRATION, /constraint friendships_not_self\s+check \(user_low <> user_high\)/);
  const accept = functionBody('accept_friend_invite');
  assert.match(accept, /cannot_friend_self/);
  assert.match(accept, /inviter_id = v_me/);
});

test('3. negative share_interaction_count is rejected', () => {
  assert.match(
    MIGRATION,
    /constraint friendships_share_count_nonnegative\s+check \(share_interaction_count >= 0\)/,
  );
  assert.match(MIGRATION, /share_interaction_count integer not null default 0/);
});

test('4. invite token is unique and nonempty', () => {
  assert.match(MIGRATION, /constraint friend_invites_token_unique unique \(token\)/);
  assert.match(MIGRATION, /constraint friend_invites_token_nonempty\s+check \(char_length\(token\) >= 32\)/);
});

test('5. short code is unique when present', () => {
  assert.match(MIGRATION, /constraint friend_invites_short_code_unique unique \(short_code\)/);
  assert.match(MIGRATION, /constraint friend_invites_short_code_format/);
  assert.match(MIGRATION, /short_code = upper\(short_code\)/);
});

test('6. invite status allows only pending/accepted/revoked/expired', () => {
  assert.match(
    MIGRATION,
    /check \(status in \('pending', 'accepted', 'revoked', 'expired'\)\)/,
  );
});

// ---------------------------------------------------------------------------
// Create invite
// ---------------------------------------------------------------------------

test('7-12. create_friend_invite auth, inviter, expiry, token, multiples', () => {
  assert.match(MIGRATION, /grant execute on function public\.create_friend_invite\(\) to authenticated/);
  assert.match(MIGRATION, /revoke all on function public\.create_friend_invite\(\) from anon/);
  const body = functionBody('create_friend_invite');
  assert.match(body, /not_authenticated/);
  assert.match(body, /v_inviter uuid := auth\.uid\(\)/);
  assert.equal(/p_inviter|inviter_id\s+uuid/.test(body), false);
  assert.match(body, /now\(\) \+ interval '14 days'/);
  assert.match(body, /friend_invite_generate_token/);
  assert.match(MIGRATION, /encode\((?:extensions\.)?gen_random_bytes\(32\), 'hex'\)/);
  assert.match(body, /status,\s+expires_at/);
  assert.match(MIGRATION, /Multiple pending invites per inviter are allowed/);
  assert.equal(/revoke other pending|delete from public\.friend_invites/.test(body), false);
});

test('11. token generation is cryptographically random, not user-derived', () => {
  const gen = functionBody('friend_invite_generate_token');
  assert.match(gen, /gen_random_bytes\(32\)/);
  assert.equal(/auth\.uid|email|user_id/.test(gen), false);
  assert.equal(/md5|row_number|nextval/.test(MIGRATION), false);
});

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

test('13-19. lookup_friend_invite limited projection and unavailable states', () => {
  assert.match(
    MIGRATION,
    /grant execute on function public\.lookup_friend_invite\(text\) to anon, authenticated/,
  );
  const body = functionBody('lookup_friend_invite');
  assert.match(body, /invite_not_found/);
  assert.match(body, /invite_revoked/);
  assert.match(body, /invite_accepted/);
  assert.match(body, /invite_expired/);
  assert.match(body, /set status = 'expired'/);
  assert.match(body, /display_name/);
  assert.match(body, /avatar_url/);
  assert.match(body, /already_friends/);
  assert.equal(/\bemail\b/.test(body), false);
  assert.equal(/is_admin/.test(body), false);
  assert.equal(/auth\.users/.test(body), false);
  assert.match(body, /token = lower\(v_key\)/);
  assert.match(body, /short_code = upper\(v_key\)/);
  assert.match(body, /char_length\(v_key\) <= 8 and v_me is null/);
  assert.match(body, /not_authenticated/);
});

test('14. lookup and list do not select private profile columns', () => {
  const lookup = functionBody('lookup_friend_invite');
  const list = functionBody('list_friends');
  for (const body of [lookup, list]) {
    assert.equal(/p\.email|u\.email|raw_user_meta|is_admin/.test(body), false);
    assert.match(body, /p\.display_name/);
    assert.match(body, /p\.avatar_url/);
  }
});

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

test('20-31. accept_friend_invite transaction, canonical pair, idempotency', () => {
  assert.match(MIGRATION, /revoke all on function public\.accept_friend_invite\(text\) from anon/);
  assert.match(
    MIGRATION,
    /grant execute on function public\.accept_friend_invite\(text\) to authenticated/,
  );
  const body = functionBody('accept_friend_invite');
  assert.match(body, /v_me uuid := auth\.uid\(\)/);
  assert.match(body, /not_authenticated/);
  assert.match(body, /for update/);
  assert.match(body, /cannot_friend_self/);
  assert.match(body, /invite_revoked/);
  assert.match(body, /invite_expired/);
  assert.match(body, /invite_accepted/);
  assert.match(body, /least\(rec\.inviter_id, v_me\)/);
  assert.match(body, /greatest\(rec\.inviter_id, v_me\)/);
  assert.match(body, /initiated_by/);
  assert.match(body, /rec\.inviter_id/);
  assert.match(body, /on conflict \(user_low, user_high\) do nothing/);
  assert.match(body, /used_by = v_me/);
  assert.match(body, /accepted_at = now\(\)/);
  assert.match(body, /status = 'accepted'/);
  assert.match(body, /rec\.status = 'accepted' and rec\.used_by = v_me/);
  assert.equal(/p_inviter|initiated_by\s*:?=/.test(body.split('insert')[0]), false);
});

test('23. initiated_by is the inviter, not the recipient', () => {
  const body = functionBody('accept_friend_invite');
  assert.match(
    body,
    /insert into public\.friendships \([\s\S]*initiated_by[\s\S]*values \([\s\S]*rec\.inviter_id/,
  );
});

test('30. duplicate friendship remains one row; cross-invites are not cancelled', () => {
  const body = functionBody('accept_friend_invite');
  assert.match(body, /on conflict \(user_low, user_high\) do nothing/);
  assert.equal(/delete from public\.friend_invites/.test(body), false);
  assert.equal(/set status = 'revoked'/.test(body), false);
});

// ---------------------------------------------------------------------------
// Friend access / list / remove
// ---------------------------------------------------------------------------

test('32-35. list_friends own rows, limited fields, ordering', () => {
  const body = functionBody('list_friends');
  assert.match(body, /not_authenticated/);
  assert.match(body, /f\.user_low = v_me\s+or f\.user_high = v_me/);
  assert.match(body, /share_interaction_count desc/);
  assert.match(body, /created_at desc/);
  assert.match(body, /friend_user_id/);
  assert.equal(/\bemail\b/.test(body), false);
  assert.equal(/friend_invites/.test(body), false);
  assert.match(MIGRATION, /revoke all on function public\.list_friends\(\) from anon/);
});

test('36-38. remove_friend is member-only, idempotent, preserves invites', () => {
  const body = functionBody('remove_friend');
  assert.match(body, /least\(v_me, friend_user_id\)/);
  assert.match(body, /greatest\(v_me, friend_user_id\)/);
  assert.match(body, /delete from public\.friendships/);
  assert.match(body, /'removed', v_deleted > 0/);
  assert.equal(/delete from public\.friend_invites/.test(body), false);
  assert.equal(/update public\.friend_invites/.test(body), false);
  assert.match(MIGRATION, /revoke all on function public\.remove_friend\(uuid\) from anon/);
});

test('revoke_friend_invite is inviter-only and does not delete the row', () => {
  const body = functionBody('revoke_friend_invite');
  assert.match(body, /inviter_id is distinct from v_me/);
  assert.match(body, /invite_not_found/);
  assert.match(body, /invite_not_pending/);
  assert.match(body, /status = 'revoked'/);
  assert.match(body, /revoked_at = now\(\)/);
  assert.equal(/delete from public\.friend_invites/.test(body), false);
});

// ---------------------------------------------------------------------------
// Security / RLS / no public search
// ---------------------------------------------------------------------------

test('39. client cannot directly forge a friendship row', () => {
  assert.match(MIGRATION, /alter table public\.friendships enable row level security/);
  assert.match(MIGRATION, /grant select on table public\.friendships to authenticated/);
  assert.equal(/grant insert on table public\.friendships/i.test(MIGRATION), false);
  assert.equal(/grant update on table public\.friendships/i.test(MIGRATION), false);
  assert.equal(/grant delete on table public\.friendships/i.test(MIGRATION), false);
  assert.equal(/\bfor insert\b/i.test(MIGRATION), false);
  assert.equal(/friendships_insert/i.test(MIGRATION), false);
  assert.match(MIGRATION, /revoke all on table public\.friendships from anon/);
});

test('40. client cannot mutate share_interaction_count', () => {
  assert.equal(/update public\.friendships/i.test(MIGRATION), false);
  assert.equal(/share_interaction_count\s*=\s*share_interaction_count\s*\+/i.test(MIGRATION), false);
  assert.equal(/increment_share/i.test(MIGRATION), false);
  const api = readFileSync(join(ROOT, 'v2/friends/friendsApi.js'), 'utf8');
  assert.equal(/share_interaction_count/.test(api), false);
  assert.equal(/incrementShare/.test(api), false);
});

test('41. no public profile search or broadened profiles SELECT', () => {
  const allSql = allMigrationSql();
  assert.equal(/search_users/i.test(allSql), false);
  assert.equal(/profiles_select_public|profiles_select_all/i.test(allSql), false);
  assert.equal(/grant select on table public\.profiles to anon/i.test(allSql), false);
  assert.equal(/create policy.*profiles.*to anon/i.test(allSql), false);
  assert.match(MIGRATION, /Does not expose email, is_admin/);
  assert.equal(/create policy[\s\S]*on public\.profiles/i.test(MIGRATION), false);
  const api = readFileSync(join(ROOT, 'v2/friends/friendsApi.js'), 'utf8');
  assert.equal(/searchUsers|from\('profiles'\)/.test(api), false);
});

test('42. no arbitrary profile fetch RPC; friend API is pair- or token-scoped', () => {
  assert.equal(/get_friend_profile|get_profile_by_id|read_profile\(/.test(MIGRATION), false);
  const list = functionBody('list_friends');
  assert.match(list, /user_low = v_me\s+or f\.user_high = v_me/);
  const lookup = functionBody('lookup_friend_invite');
  assert.match(lookup, /token = lower\(v_key\)/);
});

test('SECURITY DEFINER RPCs pin search_path and restrict grants', () => {
  const creates = [
    'create_friend_invite()',
    'lookup_friend_invite(token_or_code text)',
    'accept_friend_invite(token_or_code text)',
    'revoke_friend_invite(invite_id uuid)',
    'list_friends()',
    'remove_friend(friend_user_id uuid)',
  ];
  for (const name of creates) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      MIGRATION,
      new RegExp(
        `create or replace function public\\.${escaped}[\\s\\S]{0,180}?security definer\\s+set search_path = public, pg_temp`,
      ),
    );
  }
  const grants = [
    'create_friend_invite()',
    'lookup_friend_invite(text)',
    'accept_friend_invite(text)',
    'revoke_friend_invite(uuid)',
    'list_friends()',
    'remove_friend(uuid)',
  ];
  for (const name of grants) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      MIGRATION,
      new RegExp(`revoke all on function public\\.${escaped} from public`),
    );
  }
  assert.match(
    MIGRATION,
    /revoke all on function public\.friend_invite_generate_token\(\) from anon, authenticated/,
  );
  assert.match(
    MIGRATION,
    /revoke all on function public\.friend_invite_generate_short_code\(\) from anon, authenticated/,
  );
});

test('friend_invites RLS is inviter-only SELECT; no broad pending SELECT', () => {
  assert.match(MIGRATION, /alter table public\.friend_invites enable row level security/);
  assert.match(MIGRATION, /friend_invites_select_own/);
  assert.match(MIGRATION, /using \(auth\.uid\(\) = inviter_id\)/);
  assert.match(MIGRATION, /revoke all on table public\.friend_invites from anon/);
  assert.equal(/grant insert on table public\.friend_invites/i.test(MIGRATION), false);
  assert.equal(/friend_invites_select_pending/i.test(MIGRATION), false);
});

test('indexes exist for pair members, token, short code, and pending inviter', () => {
  assert.match(MIGRATION, /friendships_user_low_idx/);
  assert.match(MIGRATION, /friendships_user_high_idx/);
  assert.match(MIGRATION, /friend_invites_inviter_pending_idx/);
  assert.match(MIGRATION, /unique \(token\)/);
  assert.match(MIGRATION, /unique \(short_code\)/);
});

test('no plan IDs on friendships and no friend IDs in plan snapshots', () => {
  assert.match(MIGRATION, /create table if not exists public\.friendships/);
  assert.equal(/plan_id|accepted_plan|user_accepted_plans/.test(MIGRATION), false);
  assert.equal(
    /follower_id|following_id|blocked_at|blocked_users|is_blocked/.test(MIGRATION),
    false,
  );
});

test('Slice 1 friends API stays unused by Home/Explore/Planner', () => {
  const uiFiles = [
    'v2/HomeDestination.jsx',
    'v2/explore/ExploreDestination.jsx',
    'v2/planner/PlannerDestination.jsx',
    'v2/profile/profileSettingsRows.js',
  ];
  for (const rel of uiFiles) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.equal(src.includes('friendsApi'), false, rel);
    assert.equal(src.includes('listFriends'), false, rel);
    assert.equal(src.includes('createFriendInvite'), false, rel);
  }
});

test('friends client never references service role', () => {
  const api = readFileSync(join(ROOT, 'v2/friends/friendsApi.js'), 'utf8');
  const model = readFileSync(join(ROOT, 'v2/friends/friendsModel.js'), 'utf8');
  assert.equal(/SERVICE_ROLE|service_role|service-role/i.test(api), false);
  assert.equal(/SERVICE_ROLE|service_role/i.test(model), false);
});

// ---------------------------------------------------------------------------
// Client wrappers
// ---------------------------------------------------------------------------

test('43. DB rows normalize to canonical FriendSummary / FriendInvite', () => {
  const friend = normalizeFriendSummary({
    friendship_id: 'f-1',
    friend_user_id: 'u-2',
    display_name: 'Ada',
    avatar_url: 'https://example.test/a.png',
    created_at: '2026-09-04T00:00:00.000Z',
    share_interaction_count: 0,
    email: 'secret@example.com',
  });
  assert.deepEqual(friend, {
    friendshipId: 'f-1',
    userId: 'u-2',
    displayName: 'Ada',
    avatarUrl: 'https://example.test/a.png',
    createdAt: '2026-09-04T00:00:00.000Z',
    shareInteractionCount: 0,
  });
  assert.equal('email' in friend, false);

  const invite = normalizeFriendInvite({
    invite_id: 'inv-1',
    token: 'abc123token',
    short_code: 'AB23DE45',
    expires_at: '2026-09-18T00:00:00.000Z',
    status: 'pending',
    inviter: {
      user_id: 'u-1',
      display_name: 'Ada',
      avatar_url: null,
      email: 'hidden@example.com',
    },
  });
  assert.equal(invite.inviteId, 'inv-1');
  assert.equal(invite.token, 'abc123token');
  assert.equal(invite.shortCode, 'AB23DE45');
  assert.equal(invite.inviter.userId, 'u-1');
  assert.equal(invite.inviter.displayName, 'Ada');
  assert.equal('email' in invite.inviter, false);
});

test('44. signed-out and RPC auth errors normalize without leaking internals', () => {
  assert.equal(
    normalizeFriendRpcFailure({ message: 'not_authenticated' }),
    'not_authenticated',
  );
  assert.equal(
    normalizeFriendRpcFailure(null, { ok: false, reason: 'invite_expired' }),
    'invite_expired',
  );
  assert.equal(
    normalizeFriendRpcFailure({ message: 'JWT expired in secret stack' }),
    'rpc_failed',
  );
});

test('createFriendInvite and listFriends require a session', async () => {
  const client = createRpcClient({
    session: null,
    handler: () => {
      throw new Error('rpc should not run while signed out');
    },
  });
  const created = await createFriendInvite({ getClient: () => client });
  assert.deepEqual(created, { ok: false, reason: 'not_authenticated' });
  const listed = await listFriends({ getClient: () => client });
  assert.deepEqual(listed, { ok: false, reason: 'not_authenticated' });
  const accepted = await acceptFriendInvite('token', { getClient: () => client });
  assert.deepEqual(accepted, { ok: false, reason: 'not_authenticated' });
});

test('lookupFriendInvite does not require a session for long tokens', async () => {
  const token = 'a'.repeat(64);
  const client = createRpcClient({
    session: null,
    handler: async (name, args) => {
      assert.equal(name, FRIEND_RPC.lookup);
      assert.equal(args.token_or_code, token);
      return {
        data: {
          ok: true,
          invite_id: 'inv-1',
          expires_at: '2026-09-18T12:00:00.000Z',
          status: 'pending',
          already_friends: false,
          inviter: {
            user_id: 'u-ada',
            display_name: 'Ada',
            avatar_url: 'https://example.test/a.png',
          },
        },
        error: null,
      };
    },
  });
  const result = await lookupFriendInvite(token, { getClient: () => client });
  assert.equal(result.ok, true);
  assert.equal(result.invite.inviteId, 'inv-1');
  assert.equal(result.invite.inviter.displayName, 'Ada');
  assert.equal(result.invite.token, undefined);
});

test('lookupFriendInvite requires a session for short codes', async () => {
  const client = createRpcClient({
    session: null,
    handler: () => {
      throw new Error('short-code lookup must not hit RPC while signed out');
    },
  });
  const result = await lookupFriendInvite('AB23KMPQ', { getClient: () => client });
  assert.deepEqual(result, { ok: false, reason: 'not_authenticated' });
});

test('lookup strips email if a raw row ever included it', async () => {
  const client = createRpcClient({
    session: null,
    handler: async () => ({
      data: {
        ok: true,
        invite_id: 'inv-2',
        expires_at: '2026-09-18T12:00:00.000Z',
        status: 'pending',
        email: 'nope@example.com',
        inviter: {
          user_id: 'u-ada',
          display_name: 'Ada',
          avatar_url: null,
          email: 'nope@example.com',
          is_admin: true,
        },
      },
      error: null,
    }),
  });
  const result = await lookupFriendInvite('c'.repeat(64), { getClient: () => client });
  assert.equal(result.ok, true);
  const stripped = omitPrivateAccountFields(result.invite);
  assert.equal(JSON.stringify(stripped).includes('nope@'), false);
  assert.equal(JSON.stringify(stripped).includes('is_admin'), false);
});

test('45. createFriendInvite response can construct the future invite URL', async () => {
  const token = 'a'.repeat(64);
  const client = createRpcClient({
    session: { user: { id: 'u-1' } },
    handler: async (name) => {
      assert.equal(name, FRIEND_RPC.create);
      return {
        data: {
          ok: true,
          invite_id: 'inv-9',
          token,
          short_code: 'AB23KMPQ',
          expires_at: '2026-09-18T12:00:00.000Z',
          status: 'pending',
        },
        error: null,
      };
    },
  });
  const result = await createFriendInvite({ getClient: () => client });
  assert.equal(result.ok, true);
  assert.equal(result.invite.shortCode, 'AB23KMPQ');
  assert.equal(
    result.inviteUrl,
    `${FRIEND_INVITE_PUBLIC_ORIGIN}/invite/${token}`,
  );
  assert.equal(buildFriendInviteUrl(token), result.inviteUrl);
  assert.equal(parseInviteTokenFromPath(`/invite/${token}`), token);
});

test('revoked/expired/invalid lookup reasons surface to the client', async () => {
  const token = 'b'.repeat(64);
  const client = createRpcClient({
    session: null,
    handler: async () => ({
      data: { ok: false, reason: 'invite_revoked', status: 'revoked' },
      error: null,
    }),
  });
  const result = await lookupFriendInvite(token, { getClient: () => client });
  assert.deepEqual(result, {
    ok: false,
    reason: 'invite_revoked',
    status: 'revoked',
  });
});

test('acceptFriendInvite maps canonical success fields', async () => {
  const client = createRpcClient({
    session: { user: { id: 'u-b' } },
    handler: async (name, args) => {
      assert.equal(name, FRIEND_RPC.accept);
      assert.equal(args.token_or_code, 'tok');
      return {
        data: {
          ok: true,
          friendship_id: 'fs-1',
          friend_user_id: 'u-a',
          already_friends: false,
          status: 'accepted',
        },
        error: null,
      };
    },
  });
  const result = await acceptFriendInvite('tok', { getClient: () => client });
  assert.deepEqual(result, {
    ok: true,
    friendshipId: 'fs-1',
    friendUserId: 'u-a',
    alreadyFriends: false,
  });
});

test('listFriends normalizes and stably re-sorts share count then created_at', async () => {
  const client = createRpcClient({
    session: { user: { id: 'u-me' } },
    handler: async () => ({
      data: {
        ok: true,
        friends: [
          {
            friendship_id: 'f-old',
            friend_user_id: 'u-b',
            display_name: 'Bea',
            avatar_url: null,
            created_at: '2026-09-01T00:00:00.000Z',
            share_interaction_count: 0,
          },
          {
            friendship_id: 'f-new',
            friend_user_id: 'u-c',
            display_name: 'Cam',
            avatar_url: null,
            created_at: '2026-09-03T00:00:00.000Z',
            share_interaction_count: 0,
          },
          {
            friendship_id: 'f-shared',
            friend_user_id: 'u-a',
            display_name: 'Ada',
            avatar_url: null,
            created_at: '2026-08-01T00:00:00.000Z',
            share_interaction_count: 2,
          },
        ],
      },
      error: null,
    }),
  });
  const result = await listFriends({ getClient: () => client });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.friends.map((f) => f.userId),
    ['u-a', 'u-c', 'u-b'],
  );
});

test('compareFriendSummaries uses share count, then created_at, then userId', () => {
  const rows = [
    {
      friendshipId: '1',
      userId: 'b',
      displayName: 'B',
      avatarUrl: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      shareInteractionCount: 0,
    },
    {
      friendshipId: '2',
      userId: 'a',
      displayName: 'A',
      avatarUrl: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      shareInteractionCount: 0,
    },
    {
      friendshipId: '3',
      userId: 'c',
      displayName: 'C',
      avatarUrl: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      shareInteractionCount: 1,
    },
  ];
  const sorted = [...rows].sort(compareFriendSummaries);
  assert.deepEqual(
    sorted.map((r) => r.userId),
    ['c', 'a', 'b'],
  );
});

test('removeFriend and revokeFriendInvite call the expected RPCs', async () => {
  const calls = [];
  const client = createRpcClient({
    session: { user: { id: 'u-me' } },
    handler: async (name, args) => {
      calls.push({ name, args });
      return { data: { ok: true, removed: true, invite_id: args.invite_id }, error: null };
    },
  });
  const removed = await removeFriend('u-other', { getClient: () => client });
  assert.deepEqual(removed, { ok: true, removed: true });
  const revoked = await revokeFriendInvite('inv-1', { getClient: () => client });
  assert.equal(revoked.ok, true);
  assert.deepEqual(calls[0], {
    name: FRIEND_RPC.remove,
    args: { friend_user_id: 'u-other' },
  });
  assert.deepEqual(calls[1], {
    name: FRIEND_RPC.revoke,
    args: { invite_id: 'inv-1' },
  });
});

test('unconfigured supabase returns supabase_unconfigured', async () => {
  const result = await createFriendInvite({ getClient: () => null });
  assert.deepEqual(result, { ok: false, reason: 'supabase_unconfigured' });
});
