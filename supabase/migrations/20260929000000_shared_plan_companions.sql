-- T-SHARED-PLAN-DETAIL-01: Companion summaries for Planner "With …" lines
-- Forward-only. Extends list_my_shared_plans without changing invite/RSVP rules.

create or replace function public.list_my_shared_plans()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  return coalesce(
    (
      select jsonb_agg(item order by item -> 'plan' ->> 'updated_at' desc)
      from (
        select jsonb_build_object(
          'plan', public.shared_plan_row_to_jsonb(p),
          'member', public.shared_plan_member_to_jsonb(m),
          'owner', jsonb_build_object(
            'user_id', pr.id,
            'display_name', pr.display_name,
            'avatar_url', pr.avatar_url
          ),
          -- Positive non-owner companions for Planner "With Jamie +N".
          -- Excludes the caller; detail page still uses get_shared_plan for full people list.
          'companions', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'user_id', cm.user_id,
                  'display_name', cpr.display_name,
                  'avatar_url', cpr.avatar_url,
                  'response', cm.response
                )
                order by cm.created_at
              )
              from public.shared_plan_members cm
              left join public.profiles cpr on cpr.id = cm.user_id
              where cm.plan_id = p.plan_id
                and cm.user_id <> v_uid
                and cm.user_id <> p.owner_id
                and cm.response in ('interested', 'maybe', 'going')
            ),
            '[]'::jsonb
          )
        ) as item
        from public.shared_plan_members m
        join public.shared_plans p on p.plan_id = m.plan_id
        left join public.profiles pr on pr.id = p.owner_id
        where m.user_id = v_uid
          and (
            m.role = 'owner'
            or m.response in ('interested', 'maybe', 'going')
          )
      ) mine
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_my_shared_plans() from public;
revoke all on function public.list_my_shared_plans() from anon;
grant execute on function public.list_my_shared_plans() to authenticated;

comment on function public.list_my_shared_plans() is
  'Shared plans the caller owns or has positively/maybe responded to, plus companion summaries for Planner With-lines. Same canonical plan_id — never a recipient-owned clone. Declined excluded.';
