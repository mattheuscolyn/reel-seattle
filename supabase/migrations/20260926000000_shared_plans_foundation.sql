-- T-SHARED-PLANS-01: Shared social-planning foundation
-- Forward-only. Do not edit prior migrations.
--
-- One SharedPlan model supports solo private plans, proposals, decided outings,
-- direct invites, and friend-visible open invites. Membership is distinct from
-- visibility. Exact screening identity lives in plan_snapshot.performances
-- (AcceptedPlanPerformance / performanceKey contract).
--
-- Personal user_accepted_plans and local acceptedPlansStore remain the solo
-- Planner source of truth. Shared plans are an additive network layer.

-- ---------------------------------------------------------------------------
-- public.shared_plans
-- ---------------------------------------------------------------------------
create table if not exists public.shared_plans (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan_type text not null,
  visibility text not null,
  label text null,
  plan_date date null,
  timezone text not null default 'America/Los_Angeles',
  plan_snapshot jsonb not null,
  source_accepted_plan_id text null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_plans_plan_id_unique unique (plan_id),
  constraint shared_plans_plan_id_nonempty
    check (char_length(trim(plan_id)) > 0),
  constraint shared_plans_type_check
    check (plan_type in ('proposal', 'decided')),
  constraint shared_plans_visibility_check
    check (visibility in ('private', 'invited', 'friends')),
  constraint shared_plans_snapshot_object
    check (jsonb_typeof(plan_snapshot) = 'object'),
  constraint shared_plans_schema_version_supported
    check (schema_version >= 1 and schema_version <= 10)
);

comment on table public.shared_plans is
  'Canonical shared social plans (T-SHARED-PLANS-01). One identity for proposals, decided outings, direct invites, and friend-visible open invites.';

comment on column public.shared_plans.plan_id is
  'Stable shared plan identity (client-facing). Members and invites reference this id.';

comment on column public.shared_plans.plan_snapshot is
  'Durable itinerary snapshot. performances[] use AcceptedPlanPerformance / performanceKey identity — never title-only.';

comment on column public.shared_plans.visibility is
  'Discoverability: private (owner/members), invited (members), friends (accepted friends of owner may discover). Does not auto-add friends as members.';

create index if not exists shared_plans_owner_updated_idx
  on public.shared_plans (owner_id, updated_at desc);

create index if not exists shared_plans_visibility_friends_idx
  on public.shared_plans (owner_id, updated_at desc)
  where visibility = 'friends';

alter table public.shared_plans enable row level security;

revoke all on table public.shared_plans from anon;
revoke all on table public.shared_plans from public;
-- No direct client writes. Reads go through SECURITY DEFINER RPCs so visibility
-- rules (friendship, membership) stay authoritative.
revoke all on table public.shared_plans from authenticated;

-- ---------------------------------------------------------------------------
-- public.shared_plan_members
-- ---------------------------------------------------------------------------
create table if not exists public.shared_plan_members (
  plan_id text not null references public.shared_plans (plan_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  response text not null,
  invited_by uuid null references auth.users (id) on delete set null,
  joined_at timestamptz null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint shared_plan_members_pkey primary key (plan_id, user_id),
  constraint shared_plan_members_role_check
    check (role in ('owner', 'invitee', 'participant')),
  constraint shared_plan_members_response_check
    check (response in ('pending', 'interested', 'maybe', 'going', 'declined'))
);

comment on table public.shared_plan_members is
  'Membership + RSVP for shared plans. Distinct from discoverability (shared_plans.visibility).';

comment on column public.shared_plan_members.role is
  'owner = authoritative editor; invitee = directly invited; participant = joined (e.g. open invite) or remaining member.';

comment on column public.shared_plan_members.response is
  'RSVP. Proposal uses pending/interested/maybe/declined; decided uses pending/going/declined (historical interested/maybe retained after proposal→decided).';

create index if not exists shared_plan_members_user_updated_idx
  on public.shared_plan_members (user_id, updated_at desc);

alter table public.shared_plan_members enable row level security;

revoke all on table public.shared_plan_members from anon;
revoke all on table public.shared_plan_members from public;
revoke all on table public.shared_plan_members from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.are_accepted_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a is not null
    and b is not null
    and a <> b
    and exists (
      select 1
      from public.friendships f
      where f.user_low = least(a, b)
        and f.user_high = greatest(a, b)
    );
$$;

revoke all on function public.are_accepted_friends(uuid, uuid) from public;
revoke all on function public.are_accepted_friends(uuid, uuid) from anon;
grant execute on function public.are_accepted_friends(uuid, uuid) to authenticated;

comment on function public.are_accepted_friends(uuid, uuid) is
  'True when an accepted symmetric friendship exists between two users.';

create or replace function public.can_view_shared_plan(p_plan_id text, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_visibility text;
begin
  if p_viewer is null or p_plan_id is null then
    return false;
  end if;

  select owner_id, visibility
    into v_owner, v_visibility
  from public.shared_plans
  where plan_id = p_plan_id;

  if v_owner is null then
    return false;
  end if;

  if v_owner = p_viewer then
    return true;
  end if;

  if exists (
    select 1
    from public.shared_plan_members m
    where m.plan_id = p_plan_id
      and m.user_id = p_viewer
  ) then
    return true;
  end if;

  if v_visibility = 'friends' and public.are_accepted_friends(v_owner, p_viewer) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_view_shared_plan(text, uuid) from public;
revoke all on function public.can_view_shared_plan(text, uuid) from anon;
grant execute on function public.can_view_shared_plan(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Friend film activity (Saved / Seen / Not Interested) for one film key
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

  -- Aggregate per-friend first, then wrap in a single jsonb array.
  -- A bare SELECT jsonb_agg(...) ... GROUP BY in a scalar subquery fails when
  -- multiple friends match (PostgreSQL: more than one row returned by a subquery
  -- used as an expression).
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
        where prefs.film_key = v_key
          and prefs.is_active = true
          and prefs.user_id <> v_uid
          and public.are_accepted_friends(v_uid, prefs.user_id)
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

revoke all on function public.list_friend_film_states(text) from public;
revoke all on function public.list_friend_film_states(text) from anon;
grant execute on function public.list_friend_film_states(text) to authenticated;

comment on function public.list_friend_film_states(text) is
  'Returns accepted friends'' active Saved/Seen/Not Interested states for one film_key. Never returns non-friends.';

-- ---------------------------------------------------------------------------
-- Shared plan RPCs (minimal foundation surface)
-- ---------------------------------------------------------------------------
create or replace function public.create_shared_plan(
  p_plan_id text,
  p_plan_type text,
  p_visibility text,
  p_label text,
  p_plan_date date,
  p_timezone text,
  p_plan_snapshot jsonb,
  p_source_accepted_plan_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id text := nullif(trim(coalesce(p_plan_id, '')), '');
  v_type text := nullif(trim(coalesce(p_plan_type, '')), '');
  v_visibility text := nullif(trim(coalesce(p_visibility, '')), '');
  v_row public.shared_plans%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_plan_id is null then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if v_type is null or v_type not in ('proposal', 'decided') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if v_visibility is null or v_visibility not in ('private', 'invited', 'friends') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if p_plan_snapshot is null or jsonb_typeof(p_plan_snapshot) <> 'object' then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_plan_snapshot -> 'performances') is distinct from 'array'
     or jsonb_array_length(p_plan_snapshot -> 'performances') < 1 then
    raise exception 'empty_screenings' using errcode = 'P0001';
  end if;

  insert into public.shared_plans (
    plan_id,
    owner_id,
    plan_type,
    visibility,
    label,
    plan_date,
    timezone,
    plan_snapshot,
    source_accepted_plan_id,
    schema_version
  ) values (
    v_plan_id,
    v_uid,
    v_type,
    v_visibility,
    nullif(trim(coalesce(p_label, '')), ''),
    p_plan_date,
    coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'America/Los_Angeles'),
    p_plan_snapshot,
    nullif(trim(coalesce(p_source_accepted_plan_id, '')), ''),
    1
  )
  returning * into v_row;

  insert into public.shared_plan_members (
    plan_id,
    user_id,
    role,
    response,
    invited_by,
    joined_at
  ) values (
    v_plan_id,
    v_uid,
    'owner',
    case when v_type = 'decided' then 'going' else 'interested' end,
    null,
    now()
  );

  return jsonb_build_object(
    'plan_id', v_row.plan_id,
    'owner_id', v_row.owner_id,
    'type', v_row.plan_type,
    'visibility', v_row.visibility,
    'label', v_row.label,
    'date', v_row.plan_date,
    'timezone', v_row.timezone,
    'source_accepted_plan_id', v_row.source_accepted_plan_id,
    'schema_version', v_row.schema_version,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'plan_snapshot', v_row.plan_snapshot
  );
end;
$$;

revoke all on function public.create_shared_plan(text, text, text, text, date, text, jsonb, text) from public;
revoke all on function public.create_shared_plan(text, text, text, text, date, text, jsonb, text) from anon;
grant execute on function public.create_shared_plan(text, text, text, text, date, text, jsonb, text) to authenticated;

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

  -- Visibility controls discoverability. Membership controls access to
  -- invite/RSVP metadata. Non-member friends who can discover a friends-visible
  -- plan receive the plan body with an empty members array (no invitee /
  -- declined / invited_by leakage).
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
        jsonb_build_object(
          'plan_id', m.plan_id,
          'user_id', m.user_id,
          'role', m.role,
          'response', m.response,
          'invited_by', m.invited_by,
          'joined_at', m.joined_at,
          'updated_at', m.updated_at
        )
        order by m.created_at
      ),
      '[]'::jsonb
    )
    into v_members
    from public.shared_plan_members m
    where m.plan_id = v_plan_id;
  end if;

  return jsonb_build_object(
    'plan', jsonb_build_object(
      'plan_id', v_row.plan_id,
      'owner_id', v_row.owner_id,
      'type', v_row.plan_type,
      'visibility', v_row.visibility,
      'label', v_row.label,
      'date', v_row.plan_date,
      'timezone', v_row.timezone,
      'source_accepted_plan_id', v_row.source_accepted_plan_id,
      'schema_version', v_row.schema_version,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'plan_snapshot', v_row.plan_snapshot
    ),
    'members', v_members
  );
end;
$$;

revoke all on function public.get_shared_plan(text) from public;
revoke all on function public.get_shared_plan(text) from anon;
grant execute on function public.get_shared_plan(text) to authenticated;

create or replace function public.list_open_friend_shared_plans()
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
      select jsonb_agg(
        jsonb_build_object(
          'plan_id', p.plan_id,
          'owner_id', p.owner_id,
          'type', p.plan_type,
          'visibility', p.visibility,
          'label', p.label,
          'date', p.plan_date,
          'timezone', p.timezone,
          'updated_at', p.updated_at,
          'plan_snapshot', p.plan_snapshot
        )
        order by p.updated_at desc
      )
      from public.shared_plans p
      where p.visibility = 'friends'
        and p.owner_id <> v_uid
        and public.are_accepted_friends(p.owner_id, v_uid)
        and not exists (
          select 1
          from public.shared_plan_members m
          where m.plan_id = p.plan_id
            and m.user_id = v_uid
        )
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_open_friend_shared_plans() from public;
revoke all on function public.list_open_friend_shared_plans() from anon;
grant execute on function public.list_open_friend_shared_plans() to authenticated;

comment on function public.list_open_friend_shared_plans() is
  'Friend-visible open plans the caller may discover. Excludes private/invited-only plans and plans where the caller is already a member. Does not auto-add friends as members.';
