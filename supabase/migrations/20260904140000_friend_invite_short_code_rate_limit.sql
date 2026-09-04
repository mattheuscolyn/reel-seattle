-- T-FRIENDS-INVITES-02: short-code lookup rate limit
-- Forward-only. Do not edit 20260904000000_friendships_and_invites.sql.
--
-- Protects authenticated 8-character code stuffing. Long invite tokens are
-- unguessable capabilities and are NOT counted. Failed attempts are stored
-- without the guessed code. Throttled callers receive rate_limited without
-- a row lookup, so existence is not leaked.

create table if not exists public.friend_invite_code_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

comment on table public.friend_invite_code_attempts is
  'Failed authenticated short-code invite lookups/accepts. Internal rate-limit ledger; not client readable.';

create index if not exists friend_invite_code_attempts_user_time_idx
  on public.friend_invite_code_attempts (user_id, attempted_at desc);

alter table public.friend_invite_code_attempts enable row level security;

revoke all on table public.friend_invite_code_attempts from anon;
revoke all on table public.friend_invite_code_attempts from public;
revoke all on table public.friend_invite_code_attempts from authenticated;

create or replace function public.friend_invite_short_code_rate_limited()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      select count(*)::int
      from public.friend_invite_code_attempts a
      where a.user_id = auth.uid()
        and a.attempted_at > now() - interval '10 minutes'
    ) >= 10;
$$;

comment on function public.friend_invite_short_code_rate_limited() is
  'True when auth.uid() has 10 or more failed short-code attempts in the last 10 minutes.';

create or replace function public.friend_invite_record_short_code_failure()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.friend_invite_code_attempts (user_id)
  values (auth.uid());
end;
$$;

revoke all on function public.friend_invite_short_code_rate_limited() from public;
revoke all on function public.friend_invite_short_code_rate_limited() from anon, authenticated;
revoke all on function public.friend_invite_record_short_code_failure() from public;
revoke all on function public.friend_invite_record_short_code_failure() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace lookup_friend_invite with short-code throttling.
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
  v_is_code boolean := false;
begin
  if v_key is null then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  v_is_code := char_length(v_key) <= 8;

  if v_is_code and v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if v_is_code and public.friend_invite_short_code_rate_limited() then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select *
    into rec
  from public.friend_invites
  where token = lower(v_key)
     or short_code = upper(v_key)
  limit 1;

  if not found then
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  if rec.status = 'revoked' then
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_revoked', 'status', 'revoked');
  end if;

  if rec.status = 'accepted' then
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_accepted', 'status', 'accepted');
  end if;

  if rec.status = 'expired' or rec.expires_at <= now() then
    if rec.status = 'pending' then
      update public.friend_invites
         set status = 'expired'
       where id = rec.id
         and status = 'pending';
    end if;
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_expired', 'status', 'expired');
  end if;

  if rec.status is distinct from 'pending' then
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
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
  'Resolve a pending unexpired invite by token or short code. Short-code lookups require auth and are rate-limited (10 failed attempts / 10 minutes). Long tokens remain anonymous capabilities. Does not expose email or is_admin.';

revoke all on function public.lookup_friend_invite(text) from public;
grant execute on function public.lookup_friend_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace accept_friend_invite with the same short-code throttle.
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
  v_is_code boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if v_key is null then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  v_is_code := char_length(v_key) <= 8;

  if v_is_code and public.friend_invite_short_code_rate_limited() then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select *
    into rec
  from public.friend_invites
  where token = lower(v_key)
     or short_code = upper(v_key)
  limit 1
  for update;

  if not found then
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

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
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_revoked', 'status', 'revoked');
  end if;

  if rec.status = 'accepted' then
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_accepted', 'status', 'accepted');
  end if;

  if rec.status = 'expired' or rec.expires_at <= now() then
    if rec.status = 'pending' then
      update public.friend_invites
         set status = 'expired'
       where id = rec.id
         and status = 'pending';
    end if;
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invite_expired', 'status', 'expired');
  end if;

  if rec.status is distinct from 'pending' then
    if v_is_code then
      perform public.friend_invite_record_short_code_failure();
    end if;
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
  'Accept a pending invite as auth.uid(). Short-code accepts share the lookup rate limit. Long-token accepts are unaffected.';

revoke all on function public.accept_friend_invite(text) from public;
revoke all on function public.accept_friend_invite(text) from anon;
grant execute on function public.accept_friend_invite(text) to authenticated;
