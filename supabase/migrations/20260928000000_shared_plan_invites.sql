-- T-SHARED-PLAN-INVITES-01: Invite friends to an existing Planner plan + RSVP
-- Forward-only. Extends shared-plan foundation (20260926000000).
--
-- Ownership:
-- - Owner invites accepted friends only (server-enforced).
-- - Recipients RSVP only their own membership.
-- - Itinerary remains owner-authored (no collaborative edit RPCs here).
-- - Friendship removal does NOT destroy existing membership; plan relationship survives.
-- - Solo AcceptedPlan stays local until Share / Invite promotes it.

-- ---------------------------------------------------------------------------
-- Optional invitation message (plain text, per membership)
-- ---------------------------------------------------------------------------
alter table public.shared_plan_members
  add column if not exists invite_message text null;

alter table public.shared_plan_members
  drop constraint if exists shared_plan_members_invite_message_len;

alter table public.shared_plan_members
  add constraint shared_plan_members_invite_message_len
  check (
    invite_message is null
    or char_length(invite_message) <= 280
  );

comment on column public.shared_plan_members.invite_message is
  'Optional plain-text invitation note from the inviting owner. Visible to that member (and owner). Max 280 chars. Not a chat/comments system.';

-- ---------------------------------------------------------------------------
-- Helpers: plan row → jsonb (with snapshot)
-- ---------------------------------------------------------------------------
create or replace function public.shared_plan_row_to_jsonb(p_row public.shared_plans)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'plan_id', p_row.plan_id,
    'owner_id', p_row.owner_id,
    'type', p_row.plan_type,
    'visibility', p_row.visibility,
    'label', p_row.label,
    'date', p_row.plan_date,
    'timezone', p_row.timezone,
    'source_accepted_plan_id', p_row.source_accepted_plan_id,
    'schema_version', p_row.schema_version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at,
    'plan_snapshot', p_row.plan_snapshot
  );
$$;

revoke all on function public.shared_plan_row_to_jsonb(public.shared_plans) from public;
revoke all on function public.shared_plan_row_to_jsonb(public.shared_plans) from anon;
grant execute on function public.shared_plan_row_to_jsonb(public.shared_plans) to authenticated;

create or replace function public.shared_plan_member_to_jsonb(p_row public.shared_plan_members)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'plan_id', p_row.plan_id,
    'user_id', p_row.user_id,
    'role', p_row.role,
    'response', p_row.response,
    'invited_by', p_row.invited_by,
    'invite_message', p_row.invite_message,
    'joined_at', p_row.joined_at,
    'updated_at', p_row.updated_at
  );
$$;

revoke all on function public.shared_plan_member_to_jsonb(public.shared_plan_members) from public;
revoke all on function public.shared_plan_member_to_jsonb(public.shared_plan_members) from anon;
grant execute on function public.shared_plan_member_to_jsonb(public.shared_plan_members) to authenticated;

-- Valid RSVP for plan type (tightened for invite PR)
create or replace function public.is_valid_shared_plan_response(
  p_plan_type text,
  p_response text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when p_response is null then false
      when p_plan_type = 'proposal' then p_response in ('interested', 'maybe', 'declined')
      when p_plan_type = 'decided' then p_response in ('going', 'declined')
      else false
    end;
$$;

revoke all on function public.is_valid_shared_plan_response(text, text) from public;
revoke all on function public.is_valid_shared_plan_response(text, text) from anon;
grant execute on function public.is_valid_shared_plan_response(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lookup existing shared plan by solo AcceptedPlan id (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_plan_by_source_accepted_plan(
  p_source_accepted_plan_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_source text := nullif(trim(coalesce(p_source_accepted_plan_id, '')), '');
  v_row public.shared_plans%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_source is null then
    return null;
  end if;

  select *
    into v_row
  from public.shared_plans
  where owner_id = v_uid
    and source_accepted_plan_id = v_source
  order by created_at asc
  limit 1;

  if v_row.plan_id is null then
    return null;
  end if;

  return public.shared_plan_row_to_jsonb(v_row);
end;
$$;

revoke all on function public.get_shared_plan_by_source_accepted_plan(text) from public;
revoke all on function public.get_shared_plan_by_source_accepted_plan(text) from anon;
grant execute on function public.get_shared_plan_by_source_accepted_plan(text) to authenticated;

comment on function public.get_shared_plan_by_source_accepted_plan(text) is
  'Owner lookup: returns the existing canonical shared plan for a solo AcceptedPlan id, or null. Prevents duplicate shared-plan copies on re-invite.';

-- ---------------------------------------------------------------------------
-- Invite accepted friends (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.invite_friends_to_shared_plan(
  p_plan_id text,
  p_invitee_ids uuid[],
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id text := nullif(trim(coalesce(p_plan_id, '')), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_row public.shared_plans%rowtype;
  v_invitee uuid;
  v_invited jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_member public.shared_plan_members%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;
  if v_message is not null and char_length(v_message) > 280 then
    raise exception 'invalid_message' using errcode = 'P0001';
  end if;
  if p_invitee_ids is null or cardinality(p_invitee_ids) < 1 then
    raise exception 'invalid_invitees' using errcode = 'P0001';
  end if;

  select * into v_row from public.shared_plans where plan_id = v_plan_id;
  if v_row.plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;
  if v_row.owner_id <> v_uid then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;

  -- Direct invites are member-scoped; promote private → invited without opening
  -- to all friends (open invites remain out of scope).
  if v_row.visibility = 'private' then
    update public.shared_plans
      set visibility = 'invited',
          updated_at = now()
    where plan_id = v_plan_id
    returning * into v_row;
  end if;

  foreach v_invitee in array p_invitee_ids loop
    if v_invitee is null or v_invitee = v_uid then
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('user_id', v_invitee, 'reason', 'cannot_invite_self')
      );
      continue;
    end if;

    if not public.are_accepted_friends(v_uid, v_invitee) then
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('user_id', v_invitee, 'reason', 'not_friend')
      );
      continue;
    end if;

    if exists (
      select 1
      from public.shared_plan_members m
      where m.plan_id = v_plan_id
        and m.user_id = v_invitee
    ) then
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('user_id', v_invitee, 'reason', 'already_member')
      );
      continue;
    end if;

    insert into public.shared_plan_members (
      plan_id,
      user_id,
      role,
      response,
      invited_by,
      invite_message,
      joined_at
    ) values (
      v_plan_id,
      v_invitee,
      'invitee',
      'pending',
      v_uid,
      v_message,
      null
    )
    returning * into v_member;

    v_invited := v_invited || jsonb_build_array(
      public.shared_plan_member_to_jsonb(v_member)
    );
  end loop;

  update public.shared_plans
    set updated_at = now()
  where plan_id = v_plan_id
  returning * into v_row;

  return jsonb_build_object(
    'plan', public.shared_plan_row_to_jsonb(v_row),
    'invited', v_invited,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.invite_friends_to_shared_plan(text, uuid[], text) from public;
revoke all on function public.invite_friends_to_shared_plan(text, uuid[], text) from anon;
grant execute on function public.invite_friends_to_shared_plan(text, uuid[], text) to authenticated;

comment on function public.invite_friends_to_shared_plan(text, uuid[], text) is
  'Owner invites accepted friends to a canonical shared plan. Duplicate / non-friend / self invites are skipped (not errors). Optional message stored per new membership.';

-- ---------------------------------------------------------------------------
-- RSVP (self only)
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_shared_plan(
  p_plan_id text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id text := nullif(trim(coalesce(p_plan_id, '')), '');
  v_response text := nullif(trim(coalesce(p_response, '')), '');
  v_plan public.shared_plans%rowtype;
  v_member public.shared_plan_members%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  select * into v_plan from public.shared_plans where plan_id = v_plan_id;
  if v_plan.plan_id is null then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  select * into v_member
  from public.shared_plan_members
  where plan_id = v_plan_id
    and user_id = v_uid;

  if v_member.user_id is null then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  if v_member.role = 'owner' and v_response = 'declined' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if not public.is_valid_shared_plan_response(v_plan.plan_type, v_response) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  update public.shared_plan_members
    set response = v_response,
        joined_at = case
          when v_response in ('interested', 'maybe', 'going')
            then coalesce(joined_at, now())
          else joined_at
        end,
        updated_at = now()
  where plan_id = v_plan_id
    and user_id = v_uid
  returning * into v_member;

  return jsonb_build_object(
    'plan', public.shared_plan_row_to_jsonb(v_plan),
    'member', public.shared_plan_member_to_jsonb(v_member)
  );
end;
$$;

revoke all on function public.respond_to_shared_plan(text, text) from public;
revoke all on function public.respond_to_shared_plan(text, text) from anon;
grant execute on function public.respond_to_shared_plan(text, text) to authenticated;

comment on function public.respond_to_shared_plan(text, text) is
  'Member updates own RSVP. Proposal: interested|maybe|declined. Decided: going|declined. Cannot modify another user''s RSVP.';

-- ---------------------------------------------------------------------------
-- Pending invitations for current user (Planner Needs Attention)
-- ---------------------------------------------------------------------------
create or replace function public.list_pending_shared_plan_invitations()
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
      select jsonb_agg(item order by item -> 'member' ->> 'updated_at' desc)
      from (
        select jsonb_build_object(
          'plan', public.shared_plan_row_to_jsonb(p),
          'member', public.shared_plan_member_to_jsonb(m),
          'owner', jsonb_build_object(
            'user_id', pr.id,
            'display_name', pr.display_name,
            'avatar_url', pr.avatar_url
          )
        ) as item
        from public.shared_plan_members m
        join public.shared_plans p on p.plan_id = m.plan_id
        left join public.profiles pr on pr.id = p.owner_id
        where m.user_id = v_uid
          and m.role = 'invitee'
          and m.response = 'pending'
      ) pending
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_pending_shared_plan_invitations() from public;
revoke all on function public.list_pending_shared_plan_invitations() from anon;
grant execute on function public.list_pending_shared_plan_invitations() to authenticated;

comment on function public.list_pending_shared_plan_invitations() is
  'Pending direct invitations for the caller. Does not include declined or already-responded memberships.';

-- ---------------------------------------------------------------------------
-- Active shared plans for Planner projection (no solo AcceptedPlan clone)
-- ---------------------------------------------------------------------------
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

  -- Owner always sees owned plans. Invitees/participants see positive /
  -- maybe responses so Planner can project the same canonical planId.
  -- Declined is excluded from active Planner surfaces.
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
  'Shared plans the caller owns or has positively/maybe responded to. Same canonical plan_id — never a recipient-owned clone. Declined excluded.';

-- ---------------------------------------------------------------------------
-- Update get_shared_plan member payload to include invite_message
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

  return jsonb_build_object(
    'plan', public.shared_plan_row_to_jsonb(v_row),
    'members', v_members
  );
end;
$$;

revoke all on function public.get_shared_plan(text) from public;
revoke all on function public.get_shared_plan(text) from anon;
grant execute on function public.get_shared_plan(text) to authenticated;
