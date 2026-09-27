-- T-SOCIAL-CONTEXT-01: Compact friend plan signals for Film Detail and Friend Detail.
-- Forward-only. Does not widen plan visibility. Pending/declined and invite notes stay out.

create or replace function public.list_friend_plan_signals(
  p_film_key text default null,
  p_friend_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := nullif(trim(coalesce(p_film_key, '')), '');
  v_today text := ((now() at time zone 'America/Los_Angeles')::date)::text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_key is null and p_friend_id is null then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_friend_id is not null and not public.are_accepted_friends(v_uid, p_friend_id) then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(item order by item ->> 'local_date' asc nulls last, item ->> 'local_time' asc nulls last)
      from (
        select jsonb_build_object(
          'friend_id', m.user_id,
          'friend_name', pr.display_name,
          'avatar_url', pr.avatar_url,
          'plan_id', p.plan_id,
          'plan_type', p.plan_type,
          'visibility', p.visibility,
          'response', m.response,
          'performance_key', perf ->> 'performanceKey',
          'film_key', coalesce(perf ->> 'filmKey', perf ->> 'film_key'),
          'film_id', coalesce(perf ->> 'filmId', perf ->> 'film_id'),
          'title', perf ->> 'title',
          'local_date', coalesce(perf ->> 'localDate', p.plan_date::text),
          'local_time', perf ->> 'localTime',
          'theater_name', perf ->> 'theaterName',
          'viewer_can_open', true,
          'viewer_can_join', (
            p.visibility = 'friends'
            and p.owner_id <> v_uid
            and not exists (
              select 1
              from public.shared_plan_members mine
              where mine.plan_id = p.plan_id
                and mine.user_id = v_uid
            )
          )
        ) as item
        from public.shared_plans p
        join public.shared_plan_members m on m.plan_id = p.plan_id
        left join public.profiles pr on pr.id = m.user_id
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(p.plan_snapshot -> 'performances') = 'array'
              then p.plan_snapshot -> 'performances'
            else '[]'::jsonb
          end
        ) perf
        where m.user_id <> v_uid
          and m.response in ('interested', 'maybe', 'going')
          and public.are_accepted_friends(v_uid, m.user_id)
          and public.can_view_shared_plan(p.plan_id, v_uid)
          and (p_friend_id is null or m.user_id = p_friend_id)
          and (
            v_key is null
            or perf ->> 'filmKey' = v_key
            or perf ->> 'filmId' = v_key
            or perf ->> 'film_key' = v_key
            or perf ->> 'film_id' = v_key
          )
          and coalesce(perf ->> 'localDate', p.plan_date::text, v_today) >= v_today
        order by coalesce(perf ->> 'localDate', p.plan_date::text), perf ->> 'localTime'
        limit 48
      ) signals
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_friend_plan_signals(text, uuid) from public;
revoke all on function public.list_friend_plan_signals(text, uuid) from anon;
grant execute on function public.list_friend_plan_signals(text, uuid) to authenticated;

comment on function public.list_friend_plan_signals(text, uuid) is
  'Upcoming positive plan attendance the caller may already see. Accepted friends only. Private and invited-only plans stay hidden unless the caller is a member. No invite notes, pending, or declined rows.';
