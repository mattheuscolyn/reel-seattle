-- T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01: My Schedule / accepted plans cloud sync
-- Forward-only. Do not edit prior migrations.
-- Tombstones use is_active=false. Own-row RLS only. Separate from film prefs.

-- ---------------------------------------------------------------------------
-- user_accepted_plans
-- ---------------------------------------------------------------------------
create table if not exists public.user_accepted_plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null,
  is_active boolean not null default true,
  plan_snapshot jsonb not null,
  schema_version integer not null default 1,
  accepted_at timestamptz not null,
  device_mutation_id text null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_accepted_plans_pkey
    primary key (user_id, plan_id),
  constraint user_accepted_plans_plan_id_nonempty
    check (char_length(trim(plan_id)) > 0),
  constraint user_accepted_plans_snapshot_object
    check (jsonb_typeof(plan_snapshot) = 'object'),
  constraint user_accepted_plans_schema_version_supported
    check (schema_version >= 1 and schema_version <= 10)
);

comment on table public.user_accepted_plans is
  'Per-user accepted planner plans / My Schedule (T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01). Durable snapshots; soft-delete via is_active=false.';

comment on column public.user_accepted_plans.plan_snapshot is
  'Self-contained AcceptedPlanItem snapshot (schema_version). Readable without live showtimes_current.';

comment on column public.user_accepted_plans.is_active is
  'false = tombstone. Removals update this flag so stale devices cannot resurrect plans.';

create index if not exists user_accepted_plans_user_updated_idx
  on public.user_accepted_plans (user_id, updated_at desc);

create index if not exists user_accepted_plans_user_active_idx
  on public.user_accepted_plans (user_id)
  where is_active = true;

create or replace function public.set_user_accepted_plans_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_accepted_plans.user_id cannot be reassigned';
  end if;

  -- Last-write-wins: ignore stale upserts (prevents tombstone resurrection).
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;

  if new.updated_at is null then
    new.updated_at = now();
  end if;
  if tg_op = 'UPDATE' and new.updated_at is not distinct from old.updated_at then
    if new is not distinct from old then
      return null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_accepted_plans_set_updated_at
  on public.user_accepted_plans;
create trigger user_accepted_plans_set_updated_at
  before update on public.user_accepted_plans
  for each row
  execute function public.set_user_accepted_plans_updated_at();

alter table public.user_accepted_plans enable row level security;

drop policy if exists "user_accepted_plans_select_own"
  on public.user_accepted_plans;
create policy "user_accepted_plans_select_own"
  on public.user_accepted_plans
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_accepted_plans_insert_own"
  on public.user_accepted_plans;
create policy "user_accepted_plans_insert_own"
  on public.user_accepted_plans
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_accepted_plans_update_own"
  on public.user_accepted_plans;
create policy "user_accepted_plans_update_own"
  on public.user_accepted_plans
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.user_accepted_plans from anon;
revoke all on table public.user_accepted_plans from public;
grant select, insert, update on table public.user_accepted_plans to authenticated;

-- ---------------------------------------------------------------------------
-- Extend user_sync_state with schedule markers (idempotent)
-- ---------------------------------------------------------------------------
alter table public.user_sync_state
  add column if not exists schedule_attached_at timestamptz null;

alter table public.user_sync_state
  add column if not exists schedule_last_synced_at timestamptz null;

comment on column public.user_sync_state.schedule_attached_at is
  'Account-level marker that schedule sync has been used. Each browser still attaches locally.';

comment on column public.user_sync_state.schedule_last_synced_at is
  'Last successful schedule preference sync timestamp (account-level).';
