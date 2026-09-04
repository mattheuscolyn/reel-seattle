-- T-FRIENDS-INVITES-01: friendship + invite-only friend establishment
-- Forward-only. Do not edit prior migrations.
--
-- Product model: friends are invite-only. No public directory, no display-name /
-- email / username search, no follower graph. Plan sharing is a later phase and
-- must not live on these rows.
--
-- Token generation uses pgcrypto. On Supabase, the extension lives in
-- `extensions`, not `public`, so generators must schema-qualify
-- gen_random_bytes. Tokens are the authorization secret. Short codes are
-- convenience lookup only.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- public.friendships
-- Canonical symmetric pair: user_low < user_high. One row per friendship.
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users (id) on delete cascade,
  user_high uuid not null references auth.users (id) on delete cascade,
  initiated_by uuid not null references auth.users (id) on delete cascade,
  share_interaction_count integer not null default 0,
  share_interaction_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint friendships_not_self
    check (user_low <> user_high),
  constraint friendships_canonical_order
    check (user_low < user_high),
  constraint friendships_initiated_by_pair
    check (initiated_by = user_low or initiated_by = user_high),
  constraint friendships_share_count_nonnegative
    check (share_interaction_count >= 0),
  constraint friendships_pair_unique
    unique (user_low, user_high)
);

comment on table public.friendships is
  'Symmetric Reel Seattle friendship. Exactly one row per unordered user pair. Created only via accept_friend_invite. share_interaction_count is Phase C internal state; clients may read it but cannot increment it.';

comment on column public.friendships.user_low is
  'Lower UUID of the friend pair. Always strictly less than user_high.';

comment on column public.friendships.user_high is
  'Higher UUID of the friend pair. Always strictly greater than user_low.';

comment on column public.friendships.initiated_by is
  'auth.users id of the inviter. Must be user_low or user_high. Set by accept_friend_invite, never by the client.';

comment on column public.friendships.share_interaction_count is
  'Internal shared-plan interaction count. Default 0. Read-only to clients. Future Phase C RPC increments this; no client mutation in T-FRIENDS-INVITES-01.';

create index if not exists friendships_user_low_idx
  on public.friendships (user_low);

create index if not exists friendships_user_high_idx
  on public.friendships (user_high);

alter table public.friendships enable row level security;

revoke all on table public.friendships from anon;
revoke all on table public.friendships from public;
-- Members may read their own rows. Inserts/updates/deletes go through RPCs
-- (SECURITY DEFINER as table owner). No client UPDATE of share_interaction_count.
grant select on table public.friendships to authenticated;

drop policy if exists "friendships_select_member" on public.friendships;
create policy "friendships_select_member"
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = user_low or auth.uid() = user_high);

comment on policy "friendships_select_member" on public.friendships is
  'A signed-in user may read friendship rows they belong to. No INSERT/UPDATE/DELETE policies — forging pairs or mutating share counts must go through RPCs.';

-- ---------------------------------------------------------------------------
-- public.friend_invites
-- Single-use invite links. Invitee id is unknown until accept.
-- ---------------------------------------------------------------------------
create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  short_code text null,
  status text not null,
  expires_at timestamptz not null,
  used_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  constraint friend_invites_token_unique unique (token),
  constraint friend_invites_short_code_unique unique (short_code),
  constraint friend_invites_token_nonempty
    check (char_length(token) >= 32),
  constraint friend_invites_short_code_format
    check (
      short_code is null
      or (
        char_length(short_code) between 6 and 8
        and short_code = upper(short_code)
      )
    ),
  constraint friend_invites_status_check
    check (status in ('pending', 'accepted', 'revoked', 'expired'))
);

comment on table public.friend_invites is
  'Invite-only friend establishment. Token is the secret. Short code is optional convenience lookup, never sufficient on its own if the token is unknown. Multiple pending invites per inviter are allowed.';

comment on column public.friend_invites.token is
  'Cryptographically unpredictable URL-safe secret (64 hex chars from gen_random_bytes(32)). Canonical invite credential.';

comment on column public.friend_invites.short_code is
  'Optional 8-character uppercase Crockford-like code for typed entry. Unique. Case-insensitive lookup. Not the authorization secret.';

create index if not exists friend_invites_inviter_pending_idx
  on public.friend_invites (inviter_id)
  where status = 'pending';

alter table public.friend_invites enable row level security;

revoke all on table public.friend_invites from anon;
revoke all on table public.friend_invites from public;
grant select on table public.friend_invites to authenticated;

drop policy if exists "friend_invites_select_own" on public.friend_invites;
create policy "friend_invites_select_own"
  on public.friend_invites
  for select
  to authenticated
  using (auth.uid() = inviter_id);

comment on policy "friend_invites_select_own" on public.friend_invites is
  'Inviters may read their own invite rows. Recipients resolve pending invites only through lookup_friend_invite (limited projection). No client INSERT/UPDATE/DELETE.';

-- ---------------------------------------------------------------------------
-- Internal helpers. Execute is revoked from anon/authenticated/public.
-- ---------------------------------------------------------------------------
create or replace function public.friend_invite_generate_token()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

comment on function public.friend_invite_generate_token() is
  '64-character hex token from 32 random bytes. URL-safe. Unpredictable. Not sequential.';

create or replace function public.friend_invite_generate_short_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea;
  i int;
  out text := '';
begin
  -- 32-char alphabet; 8 bytes; get_byte % 32 is unbiased (256 % 32 = 0).
  bytes := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end;
$$;

comment on function public.friend_invite_generate_short_code() is
  '8-character uppercase unambiguous code (no 0/O/1/I/L). Convenience lookup only.';

revoke all on function public.friend_invite_generate_token() from public;
revoke all on function public.friend_invite_generate_token() from anon, authenticated;
revoke all on function public.friend_invite_generate_short_code() from public;
revoke all on function public.friend_invite_generate_short_code() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_friend_invite
-- ---------------------------------------------------------------------------
create or replace function public.create_friend_invite()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inviter uuid := auth.uid();
  v_token text;
  v_code text;
  v_expires timestamptz := now() + interval '14 days';
  v_id uuid;
  attempt int;
begin
  if v_inviter is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  for attempt in 1..8 loop
    v_token := public.friend_invite_generate_token();
    v_code := public.friend_invite_generate_short_code();
    begin
      insert into public.friend_invites (
        inviter_id,
        token,
        short_code,
        status,
        expires_at
      )
      values (
        v_inviter,
        v_token,
        v_code,
        'pending',
        v_expires
      )
      returning id into v_id;
      return jsonb_build_object(
        'ok', true,
        'invite_id', v_id,
        'token', v_token,
        'short_code', v_code,
        'expires_at', v_expires,
        'status', 'pending'
      );
    exception
      when unique_violation then
        if attempt = 8 then
          return jsonb_build_object('ok', false, 'reason', 'invite_create_failed');
        end if;
    end;
  end loop;

  return jsonb_build_object('ok', false, 'reason', 'invite_create_failed');
end;
$$;

comment on function public.create_friend_invite() is
  'Create a pending single-use friend invite for auth.uid(). Multiple pending invites are allowed. Inviter is forced to auth.uid().';

revoke all on function public.create_friend_invite() from public;
revoke all on function public.create_friend_invite() from anon;
grant execute on function public.create_friend_invite() to authenticated;

-- ---------------------------------------------------------------------------
-- lookup_friend_invite
-- Token is the capability: anon + authenticated may call with a valid secret.
-- Returns only display_name + avatar_url for the inviter. Never email/is_admin.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_friend_invite(token_or_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := nullif(trim(coalesce(token_or_code, '')), '');
  rec public.friend_invites%rowtype;
  v_me uuid := auth.uid();
  v_already boolean := false;
  v_inviter jsonb;
begin
  if v_key is null then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  -- Tokens are 64 hex chars (unguessable capability → anon ok).
  -- Short codes are 6–8 chars; require auth so they cannot be stuffed anonymously.
  if char_length(v_key) <= 8 and v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select *
    into rec
  from public.friend_invites
  where token = lower(v_key)
     or short_code = upper(v_key)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  if rec.status = 'revoked' then
    return jsonb_build_object('ok', false, 'reason', 'invite_revoked', 'status', 'revoked');
  end if;

  if rec.status = 'accepted' then
    return jsonb_build_object('ok', false, 'reason', 'invite_accepted', 'status', 'accepted');
  end if;

  if rec.status = 'expired' or rec.expires_at <= now() then
    if rec.status = 'pending' then
      update public.friend_invites
         set status = 'expired'
       where id = rec.id
         and status = 'pending';
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_expired', 'status', 'expired');
  end if;

  if rec.status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  select jsonb_build_object(
           'user_id', rec.inviter_id,
           'display_name', p.display_name,
           'avatar_url', p.avatar_url
         )
    into v_inviter
  from public.profiles p
  where p.id = rec.inviter_id;

  if v_inviter is null then
    v_inviter := jsonb_build_object(
      'user_id', rec.inviter_id,
      'display_name', null,
      'avatar_url', null
    );
  end if;

  if v_me is not null then
    v_already := exists (
      select 1
      from public.friendships f
      where f.user_low = least(v_me, rec.inviter_id)
        and f.user_high = greatest(v_me, rec.inviter_id)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'invite_id', rec.id,
    'expires_at', rec.expires_at,
    'status', rec.status,
    'already_friends', v_already,
    'inviter', v_inviter
  );
end;
$$;

comment on function public.lookup_friend_invite(text) is
  'Resolve a pending unexpired invite by token or short code. Returns limited inviter projection (display_name, avatar_url) only. Long tokens may be looked up anonymously (token is the capability). Short-code lookup requires auth. Does not expose email, is_admin, or other profile columns.';

revoke all on function public.lookup_friend_invite(text) from public;
grant execute on function public.lookup_friend_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- accept_friend_invite
-- ---------------------------------------------------------------------------
create or replace function public.accept_friend_invite(token_or_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_key text := nullif(trim(coalesce(token_or_code, '')), '');
  rec public.friend_invites%rowtype;
  v_low uuid;
  v_high uuid;
  v_friendship_id uuid;
  v_already boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if v_key is null then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  select *
    into rec
  from public.friend_invites
  where token = lower(v_key)
     or short_code = upper(v_key)
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  -- Same recipient re-accepting an already-consumed invite: idempotent success.
  if rec.status = 'accepted' and rec.used_by = v_me then
    v_low := least(v_me, rec.inviter_id);
    v_high := greatest(v_me, rec.inviter_id);
    select f.id
      into v_friendship_id
    from public.friendships f
    where f.user_low = v_low
      and f.user_high = v_high;
    return jsonb_build_object(
      'ok', true,
      'friendship_id', v_friendship_id,
      'friend_user_id', rec.inviter_id,
      'already_friends', true,
      'status', 'accepted'
    );
  end if;

  if rec.status = 'revoked' then
    return jsonb_build_object('ok', false, 'reason', 'invite_revoked', 'status', 'revoked');
  end if;

  if rec.status = 'accepted' then
    return jsonb_build_object('ok', false, 'reason', 'invite_accepted', 'status', 'accepted');
  end if;

  if rec.status = 'expired' or rec.expires_at <= now() then
    if rec.status = 'pending' then
      update public.friend_invites
         set status = 'expired'
       where id = rec.id
         and status = 'pending';
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_expired', 'status', 'expired');
  end if;

  if rec.status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  if rec.inviter_id = v_me then
    return jsonb_build_object('ok', false, 'reason', 'cannot_friend_self');
  end if;

  v_low := least(rec.inviter_id, v_me);
  v_high := greatest(rec.inviter_id, v_me);

  insert into public.friendships (
    user_low,
    user_high,
    initiated_by
  )
  values (
    v_low,
    v_high,
    rec.inviter_id
  )
  on conflict (user_low, user_high) do nothing
  returning id into v_friendship_id;

  if v_friendship_id is null then
    v_already := true;
    select f.id
      into v_friendship_id
    from public.friendships f
    where f.user_low = v_low
      and f.user_high = v_high;
  end if;

  update public.friend_invites
     set status = 'accepted',
         used_by = v_me,
         accepted_at = now()
   where id = rec.id
     and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'friendship_id', v_friendship_id,
    'friend_user_id', rec.inviter_id,
    'already_friends', v_already,
    'status', 'accepted'
  );
end;
$$;

comment on function public.accept_friend_invite(text) is
  'Accept a pending invite as auth.uid(). Inserts the canonical friendship (initiated_by = inviter) or no-ops if the pair already exists, then consumes the invite. Self-accept rejected. Other pending cross-invites are left untouched.';

revoke all on function public.accept_friend_invite(text) from public;
revoke all on function public.accept_friend_invite(text) from anon;
grant execute on function public.accept_friend_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- revoke_friend_invite
-- ---------------------------------------------------------------------------
create or replace function public.revoke_friend_invite(invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  rec public.friend_invites%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if invite_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  select *
    into rec
  from public.friend_invites
  where id = invite_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  -- Do not leak whether another user's invite id exists.
  if rec.inviter_id is distinct from v_me then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  if rec.status is distinct from 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_pending', 'status', rec.status);
  end if;

  update public.friend_invites
     set status = 'revoked',
         revoked_at = now()
   where id = rec.id
     and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'invite_id', rec.id,
    'status', 'revoked'
  );
end;
$$;

comment on function public.revoke_friend_invite(uuid) is
  'Inviter-only revoke of a pending invite. Row is retained with status=revoked. Non-owners receive invite_not_found.';

revoke all on function public.revoke_friend_invite(uuid) from public;
revoke all on function public.revoke_friend_invite(uuid) from anon;
grant execute on function public.revoke_friend_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_friends
-- ---------------------------------------------------------------------------
create or replace function public.list_friends()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_friends jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'friendship_id', q.friendship_id,
               'friend_user_id', q.friend_user_id,
               'display_name', q.display_name,
               'avatar_url', q.avatar_url,
               'created_at', q.created_at,
               'share_interaction_count', q.share_interaction_count
             )
             order by
               q.share_interaction_count desc,
               q.created_at desc,
               q.friend_user_id
           ),
           '[]'::jsonb
         )
    into v_friends
  from (
    select
      f.id as friendship_id,
      case
        when f.user_low = v_me then f.user_high
        else f.user_low
      end as friend_user_id,
      p.display_name,
      p.avatar_url,
      f.created_at,
      f.share_interaction_count
    from public.friendships f
    left join public.profiles p
      on p.id = case
        when f.user_low = v_me then f.user_high
        else f.user_low
      end
    where f.user_low = v_me
       or f.user_high = v_me
  ) q;

  return jsonb_build_object('ok', true, 'friends', v_friends);
end;
$$;

comment on function public.list_friends() is
  'Current user''s friends with limited profile projection (display_name, avatar_url). Ordered by share_interaction_count DESC, created_at DESC, friend_user_id. Does not return email, is_admin, or invite history.';

revoke all on function public.list_friends() from public;
revoke all on function public.list_friends() from anon;
grant execute on function public.list_friends() to authenticated;

-- ---------------------------------------------------------------------------
-- remove_friend
-- ---------------------------------------------------------------------------
create or replace function public.remove_friend(friend_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_deleted int := 0;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if friend_user_id is null or friend_user_id = v_me then
    return jsonb_build_object('ok', true, 'removed', false);
  end if;

  delete from public.friendships f
  where f.user_low = least(v_me, friend_user_id)
    and f.user_high = greatest(v_me, friend_user_id);

  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'removed', v_deleted > 0);
end;
$$;

comment on function public.remove_friend(uuid) is
  'Delete the friendship between auth.uid() and friend_user_id if it exists. Idempotent. Does not delete invite history, plans, or other users'' rows.';

revoke all on function public.remove_friend(uuid) from public;
revoke all on function public.remove_friend(uuid) from anon;
grant execute on function public.remove_friend(uuid) to authenticated;
