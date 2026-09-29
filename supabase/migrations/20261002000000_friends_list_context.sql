-- Friends list context: one read for every accepted friend.
-- Does not change tables, friendship rules, privacy defaults, or RLS.
-- Saved identities are returned only when share_film_activity_with_friends
-- is true, so sharing off stays distinct from sharing on with an empty Saved list.
-- Inactive preference rows are excluded. Seen and Not Interested are not read.
-- Plans follow list_friend_plan_signals visibility, plus Friend Detail attendance
-- (a decided plan counts only when the friend is Going). Distinct plans are
-- capped at 6 so the count matches buildFriendPlanCards.

create or replace function public.list_friends_list_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today text := ((now() at time zone 'America/Los_Angeles')::date)::text;
  v_friends jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  with friend_rows as (
    select
      case
        when f.user_low = v_uid then f.user_high
        else f.user_low
      end as friend_user_id,
      coalesce(p.share_film_activity_with_friends, false) as shares_activity
    from public.friendships f
    left join public.profiles p
      on p.id = case
        when f.user_low = v_uid then f.user_high
        else f.user_low
      end
    where f.user_low = v_uid
       or f.user_high = v_uid
  ),
  qualifying_perfs as (
    select
      m.user_id as friend_user_id,
      p.plan_id,
      m.response,
      coalesce(perf ->> 'filmKey', perf ->> 'film_key') as film_key,
      coalesce(perf ->> 'filmId', perf ->> 'film_id') as film_id,
      perf ->> 'title' as title,
      nullif(coalesce(perf ->> 'posterUrl', perf ->> 'poster_url'), '') as poster_url,
      coalesce(perf ->> 'localDate', p.plan_date::text) as local_date,
      perf ->> 'localTime' as local_time,
      perf ->> 'theaterName' as theater_name,
      coalesce(perf ->> 'localDate', p.plan_date::text, v_today) as sort_date,
      (
        p.visibility = 'friends'
        and p.owner_id <> v_uid
        and not exists (
          select 1
          from public.shared_plan_members mine
          where mine.plan_id = p.plan_id
            and mine.user_id = v_uid
        )
      ) as viewer_can_join
    from public.shared_plans p
    join public.shared_plan_members m
      on m.plan_id = p.plan_id
    join friend_rows fr
      on fr.friend_user_id = m.user_id
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(p.plan_snapshot -> 'performances') = 'array'
          then p.plan_snapshot -> 'performances'
        else '[]'::jsonb
      end
    ) perf
    where m.user_id <> v_uid
      and m.response in ('interested', 'maybe', 'going')
      and (
        p.plan_type is distinct from 'decided'
        or m.response = 'going'
      )
      and public.are_accepted_friends(v_uid, m.user_id)
      and public.can_view_shared_plan(p.plan_id, v_uid)
      and coalesce(perf ->> 'localDate', p.plan_date::text, v_today) >= v_today
  ),
  plan_counts as (
    select
      friend_user_id,
      least(count(distinct plan_id), 6) as upcoming_plan_count
    from qualifying_perfs
    group by friend_user_id
  ),
  nearest as (
    select distinct on (friend_user_id)
      friend_user_id,
      plan_id,
      response,
      film_key,
      film_id,
      title,
      poster_url,
      local_date,
      local_time,
      theater_name,
      viewer_can_join
    from qualifying_perfs
    order by friend_user_id, sort_date asc, local_time asc nulls last, plan_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'friend_user_id', fr.friend_user_id,
        'shares_activity', fr.shares_activity,
        'saved_films',
          case
            when fr.shares_activity then coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'film_key', prefs.film_key,
                  'film_id', prefs.film_id,
                  'showtime_film_key', prefs.showtime_film_key
                )
                order by prefs.film_key
              )
              from public.user_film_preferences prefs
              where prefs.user_id = fr.friend_user_id
                and prefs.is_active = true
                and prefs.preference_type = 'saved'
            ), '[]'::jsonb)
            else '[]'::jsonb
          end,
        'upcoming_plan_count', coalesce(pc.upcoming_plan_count, 0),
        'nearest_plan',
          case
            when n.plan_id is null then null
            else jsonb_build_object(
              'plan_id', n.plan_id,
              'film_key', n.film_key,
              'film_id', n.film_id,
              'title', n.title,
              'poster_url', n.poster_url,
              'local_date', n.local_date,
              'local_time', n.local_time,
              'theater_name', n.theater_name,
              'response', n.response,
              'viewer_can_join', n.viewer_can_join,
              'viewer_can_open', true
            )
          end
      )
      order by fr.friend_user_id
    ),
    '[]'::jsonb
  )
  into v_friends
  from friend_rows fr
  left join plan_counts pc
    on pc.friend_user_id = fr.friend_user_id
  left join nearest n
    on n.friend_user_id = fr.friend_user_id;

  v_friends := coalesce(v_friends, '[]'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'friends', v_friends
  );
end;
$$;

revoke all on function public.list_friends_list_context() from public;
revoke all on function public.list_friends_list_context() from anon;
grant execute on function public.list_friends_list_context() to authenticated;

comment on function public.list_friends_list_context() is
  'One Friends-list read for the caller''s accepted friends: share flag, active Saved identities only when sharing is on, and upcoming plan count plus nearest plan using Friend Detail signal rules. Does not return Seen or Not Interested.';
