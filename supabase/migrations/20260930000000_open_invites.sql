-- T-OPEN-INVITES-01: Friends-visible discoverability + opt-in membership
-- Forward-only. Same SharedPlan row — joining never clones a plan.
--
-- Declined members stay members and do not reappear in Open Invites.
-- Rejoin is intentionally out of scope for v1.

-- ---------------------------------------------------------------------------
-- Owner visibility change. Does not delete or rewrite membership.
-- ---------------------------------------------------------------------------
create or replace function public.set_shared_plan_visibility(
  p_plan_id text,
  p_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id text := nullif(trim(coalesce(p_plan_id, '')), '');
  v_visibility text := nullif(trim(coalesce(p_visibility, '')), '');
  v_row public.shared_plans%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;
  if v_visibility is null or v_visibility not in ('private', 'invited', 'friends') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.shared_plans
  where plan_id = v_plan_id;

  if v_row.plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;
  if v_row.owner_id <> v_uid then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  if v_row.visibility is distinct from v_visibility then
    update public.shared_plans
      set visibility = v_visibility,
          updated_at = now()
      where plan_id = v_plan_id
      returning * into v_row;
  end if;

  return public.shared_plan_row_to_jsonb(v_row);
end;
$$;

revoke all on function public.set_shared_plan_visibility(text, text) from public;
revoke all on function public.set_shared_plan_visibility(text, text) from anon;
grant execute on function public.set_shared_plan_visibility(text, text) to authenticated;

comment on function public.set_shared_plan_visibility(text, text) is
  'Owner-only discoverability change (private / invited / friends). Existing members are preserved. Non-owners cannot call this.';

-- ---------------------------------------------------------------------------
-- Opt in to a friends-visible plan. Same canonical plan_id.
-- Proposal → participant + interested. Decided → participant + going.
-- ---------------------------------------------------------------------------
create or replace function public.join_open_shared_plan(p_plan_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id text := nullif(trim(coalesce(p_plan_id, '')), '');
  v_row public.shared_plans%rowtype;
  v_response text;
  v_member public.shared_plan_members%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  select * into v_row
  from public.shared_plans
  where plan_id = v_plan_id;

  if v_row.plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;
  if v_row.owner_id = v_uid then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  if v_row.visibility <> 'friends' then
    raise exception 'visibility_forbidden' using errcode = 'P0001';
  end if;
  if not public.are_accepted_friends(v_row.owner_id, v_uid) then
    raise exception 'not_friend' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.shared_plan_members m
    where m.plan_id = v_plan_id
      and m.user_id = v_uid
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  v_response := case
    when v_row.plan_type = 'decided' then 'going'
    else 'interested'
  end;

  insert into public.shared_plan_members (
    plan_id,
    user_id,
    role,
    response,
    invited_by,
    invite_message,
    joined_at,
    updated_at
  ) values (
    v_plan_id,
    v_uid,
    'participant',
    v_response,
    null,
    null,
    now(),
    now()
  )
  returning * into v_member;

  return jsonb_build_object(
    'plan', public.shared_plan_row_to_jsonb(v_row),
    'member', public.shared_plan_member_to_jsonb(v_member)
  );
end;
$$;

revoke all on function public.join_open_shared_plan(text) from public;
revoke all on function public.join_open_shared_plan(text) from anon;
grant execute on function public.join_open_shared_plan(text) to authenticated;

comment on function public.join_open_shared_plan(text) is
  'Accepted friend opts into a friends-visible SharedPlan. Inserts one participant row on the existing plan_id. Proposal → interested; decided → going. Rejects private/invited plans, non-friends, owners, and duplicate membership (including declined). Does not clone an AcceptedPlan.';

-- ---------------------------------------------------------------------------
-- Open Invites list: friends visibility, upcoming, not already a member.
-- Safe companion summaries only (positive RSVP). No invite_message.
-- ---------------------------------------------------------------------------
create or replace function public.list_open_friend_shared_plans()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  return coalesce(
    (
      select jsonb_agg(item order by item -> 'plan' ->> 'date' asc nulls last, item -> 'plan' ->> 'updated_at' desc)
      from (
        select jsonb_build_object(
          'plan', public.shared_plan_row_to_jsonb(p),
          'owner', jsonb_build_object(
            'user_id', pr.id,
            'display_name', pr.display_name,
            'avatar_url', pr.avatar_url
          ),
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
                and cm.user_id <> p.owner_id
                and cm.response in ('interested', 'maybe', 'going')
            ),
            '[]'::jsonb
          )
        ) as item
        from public.shared_plans p
        left join public.profiles pr on pr.id = p.owner_id
        where p.visibility = 'friends'
          and p.owner_id <> v_uid
          and public.are_accepted_friends(p.owner_id, v_uid)
          and (p.plan_date is null or p.plan_date >= v_today)
          and not exists (
            select 1
            from public.shared_plan_members m
            where m.plan_id = p.plan_id
              and m.user_id = v_uid
          )
      ) open_plans
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_open_friend_shared_plans() from public;
revoke all on function public.list_open_friend_shared_plans() from anon;
grant execute on function public.list_open_friend_shared_plans() to authenticated;

comment on function public.list_open_friend_shared_plans() is
  'Open Invites for the caller: friends-visible, upcoming (plan_date >= America/Los_Angeles today, or undated), owned by an accepted friend, and not already a member. Excludes private, invited-only, own plans, and any existing membership including declined. Companion list is positive RSVPs only — no invite messages, pending, or declined.';

-- ---------------------------------------------------------------------------
-- Detail payload: members stay private to owner/members.
-- Discoverers get owner profile + positive companions only.
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_plan(p_plan_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id text := nullif(trim(coalesce(p_plan_id, '')), '');
  v_row public.shared_plans%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_companions jsonb := '[]'::jsonb;
  v_owner jsonb := null;
  v_is_member boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_plan_id is null or not public.can_view_shared_plan(v_plan_id, v_uid) then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  select * into v_row from public.shared_plans where plan_id = v_plan_id;
  if v_row.plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.shared_plan_members m
    where m.plan_id = v_plan_id
      and m.user_id = v_uid
  )
  into v_is_member;

  select jsonb_build_object(
    'user_id', pr.id,
    'display_name', pr.display_name,
    'avatar_url', pr.avatar_url
  )
  into v_owner
  from public.profiles pr
  where pr.id = v_row.owner_id;

  if v_row.owner_id = v_uid or v_is_member then
    select coalesce(
      jsonb_agg(
        public.shared_plan_member_to_jsonb(m)
        order by m.created_at
      ),
      '[]'::jsonb
    )
    into v_members
    from public.shared_plan_members m
    where m.plan_id = v_plan_id;
  end if;

  -- Positive participants only. No invite_message, invited_by, or pending/declined.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', cm.user_id,
        'display_name', cpr.display_name,
        'avatar_url', cpr.avatar_url,
        'response', cm.response
      )
      order by cm.created_at
    ),
    '[]'::jsonb
  )
  into v_companions
  from public.shared_plan_members cm
  left join public.profiles cpr on cpr.id = cm.user_id
  where cm.plan_id = v_plan_id
    and cm.user_id <> v_row.owner_id
    and cm.response in ('interested', 'maybe', 'going');

  return jsonb_build_object(
    'plan', public.shared_plan_row_to_jsonb(v_row),
    'members', v_members,
    'owner', v_owner,
    'public_companions', v_companions
  );
end;
$$;

revoke all on function public.get_shared_plan(text) from public;
revoke all on function public.get_shared_plan(text) from anon;
grant execute on function public.get_shared_plan(text) to authenticated;

comment on function public.get_shared_plan(text) is
  'Canonical plan detail. Owner and members receive full membership (including invite notes). Discovering friends receive the itinerary, owner profile, and positive companions only — never pending, declined, or invite_message.';
