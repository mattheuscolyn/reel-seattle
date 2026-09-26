-- Friend film activity privacy + friend-keyed activity RPC (PR 2).
-- Forward-only. Does not edit 20260926000000_shared_plans_foundation.sql.
--
-- Privacy is opt-in: missing / unset preference means sharing OFF so existing
-- friendships do not retroactively expose Saved / Seen / Not Interested.

-- ---------------------------------------------------------------------------
-- Global share preference on profiles (default OFF — opt-in)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists share_film_activity_with_friends boolean not null default false;

-- If a prior draft of this migration added the column with default true, force
-- the table default to false going forward. Existing true values stay true.
alter table public.profiles
  alter column share_film_activity_with_friends set default false;

comment on column public.profiles.share_film_activity_with_friends is
  'Opt-in: when true, accepted friends may see this user''s Saved / Seen / Not Interested film activity. Default false. Single global switch; no per-film or per-type controls.';

-- ---------------------------------------------------------------------------
-- Own preference setter (authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.set_share_film_activity_with_friends(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  -- Null/missing → OFF (opt-in). Explicit true is required to share.
  v_enabled boolean := coalesce(p_enabled, false);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, share_film_activity_with_friends)
  values (v_uid, v_enabled)
  on conflict (id) do update
    set share_film_activity_with_friends = excluded.share_film_activity_with_friends,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'share_film_activity_with_friends', v_enabled
  );
end;
$$;

revoke all on function public.set_share_film_activity_with_friends(boolean) from public;
revoke all on function public.set_share_film_activity_with_friends(boolean) from anon;
grant execute on function public.set_share_film_activity_with_friends(boolean) to authenticated;

comment on function public.set_share_film_activity_with_friends(boolean) is
  'Sets the caller''s global Share my film activity with friends preference (opt-in).';

-- ---------------------------------------------------------------------------
-- Redefine list_friend_film_states to honor share preference (opt-in)
-- ---------------------------------------------------------------------------
create or replace function public.list_friend_film_states(p_film_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := nullif(trim(coalesce(p_film_key, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_key is null then
    return '[]'::jsonb;
  end if;

  -- Privacy + friendship enforced in-query. Client friend lists are not a
  -- security boundary. coalesce(..., false): unset preference = OFF.
  return coalesce(
    (
      select jsonb_agg(friend_obj order by friend_obj ->> 'user_id')
      from (
        select jsonb_build_object(
          'user_id', prefs.user_id,
          'film_key', prefs.film_key,
          'film_id', prefs.film_id,
          'showtime_film_key', prefs.showtime_film_key,
          'states', jsonb_build_object(
            'saved', bool_or(prefs.preference_type = 'saved'),
            'seen', bool_or(prefs.preference_type = 'seen'),
            'not_interested', bool_or(prefs.preference_type = 'not_interested')
          )
        ) as friend_obj
        from public.user_film_preferences prefs
        inner join public.profiles p
          on p.id = prefs.user_id
        where prefs.film_key = v_key
          and prefs.is_active = true
          and prefs.user_id <> v_uid
          and public.are_accepted_friends(v_uid, prefs.user_id)
          and coalesce(p.share_film_activity_with_friends, false) = true
        group by
          prefs.user_id,
          prefs.film_key,
          prefs.film_id,
          prefs.showtime_film_key
      ) per_friend
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.list_friend_film_states(text) is
  'Returns accepted friends'' active Saved/Seen/Not Interested states for one film_key when those friends have opted in to share film activity. Never returns non-friends, sharing-disabled friends, or the caller.';

-- ---------------------------------------------------------------------------
-- Friend Detail: all shared film activity for one accepted friend
-- Returns a structured object so the client can distinguish privacy OFF from
-- an empty history without leaking preference rows for non-friends.
-- ---------------------------------------------------------------------------
create or replace function public.list_friend_shared_film_activity(p_friend_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_friend uuid := p_friend_user_id;
  v_shares boolean := false;
  v_films jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_friend is null or v_friend = v_uid then
    return jsonb_build_object(
      'ok', true,
      'is_friend', false,
      'shares_activity', false,
      'films', '[]'::jsonb
    );
  end if;
  if not public.are_accepted_friends(v_uid, v_friend) then
    -- Do not reveal whether the target user has prefs or a share flag.
    return jsonb_build_object(
      'ok', true,
      'is_friend', false,
      'shares_activity', false,
      'films', '[]'::jsonb
    );
  end if;

  select coalesce(p.share_film_activity_with_friends, false)
    into v_shares
  from public.profiles p
  where p.id = v_friend;

  if v_shares is distinct from true then
    return jsonb_build_object(
      'ok', true,
      'is_friend', true,
      'shares_activity', false,
      'films', '[]'::jsonb
    );
  end if;

  select coalesce(
    (
      select jsonb_agg(film_obj order by film_obj ->> 'updated_at' desc nulls last, film_obj ->> 'film_key')
      from (
        select jsonb_build_object(
          'user_id', prefs.user_id,
          'film_key', prefs.film_key,
          'film_id', prefs.film_id,
          'showtime_film_key', prefs.showtime_film_key,
          'updated_at', max(prefs.updated_at),
          'states', jsonb_build_object(
            'saved', bool_or(prefs.preference_type = 'saved'),
            'seen', bool_or(prefs.preference_type = 'seen'),
            'not_interested', bool_or(prefs.preference_type = 'not_interested')
          )
        ) as film_obj
        from public.user_film_preferences prefs
        where prefs.user_id = v_friend
          and prefs.is_active = true
        group by
          prefs.user_id,
          prefs.film_key,
          prefs.film_id,
          prefs.showtime_film_key
      ) per_film
    ),
    '[]'::jsonb
  )
  into v_films;

  return jsonb_build_object(
    'ok', true,
    'is_friend', true,
    'shares_activity', true,
    'films', v_films
  );
end;
$$;

revoke all on function public.list_friend_shared_film_activity(uuid) from public;
revoke all on function public.list_friend_shared_film_activity(uuid) from anon;
grant execute on function public.list_friend_shared_film_activity(uuid) to authenticated;

comment on function public.list_friend_shared_film_activity(uuid) is
  'Returns structured shared film activity for one accepted friend when they opted in. Non-friends and sharing-off friends get empty films; non-friends do not learn share preference details beyond is_friend=false.';
