-- T-ACCOUNT-CLOUD-SYNC-FILMS-01: Saved / Seen / Not Interested cloud sync
-- Forward-only. Do not edit prior migrations.
-- Tombstones use is_active=false (no routine DELETE). Own-row RLS only.

-- ---------------------------------------------------------------------------
-- user_film_preferences
-- ---------------------------------------------------------------------------
create table if not exists public.user_film_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  film_key text not null,
  preference_type text not null,
  is_active boolean not null default true,
  film_id text null,
  showtime_film_key text null,
  alias_keys jsonb not null default '[]'::jsonb,
  title_snapshot text null,
  year_snapshot integer null,
  poster_url_snapshot text null,
  preference_at timestamptz null,
  preference_meta jsonb not null default '{}'::jsonb,
  device_mutation_id text null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_film_preferences_pkey
    primary key (user_id, film_key, preference_type),
  constraint user_film_preferences_type_check
    check (preference_type in ('saved', 'seen', 'not_interested')),
  constraint user_film_preferences_film_key_nonempty
    check (char_length(trim(film_key)) > 0)
);

comment on table public.user_film_preferences is
  'Per-user Saved / Seen / Not Interested preferences (T-ACCOUNT-CLOUD-SYNC-FILMS-01). Soft-delete via is_active=false tombstones.';

comment on column public.user_film_preferences.film_key is
  'Deterministic sync identity: canonical tmdb:<id> when present, else showtime:<showtimeFilmKey>.';

comment on column public.user_film_preferences.is_active is
  'false = tombstone. Removals update this flag so stale devices cannot resurrect rows.';

create index if not exists user_film_preferences_user_updated_idx
  on public.user_film_preferences (user_id, updated_at desc);

create index if not exists user_film_preferences_user_active_idx
  on public.user_film_preferences (user_id, preference_type)
  where is_active = true;

-- Keep updated_at current on row changes (client may also set explicitly).
-- Stale writers with older updated_at must not overwrite newer tombstones/actives.
create or replace function public.set_user_film_preferences_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Ownership is immutable.
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_film_preferences.user_id cannot be reassigned';
  end if;

  -- Last-write-wins: ignore stale upserts (prevents tombstone resurrection).
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;

  if new.updated_at is null then
    new.updated_at = now();
  end if;
  if tg_op = 'UPDATE' and new.updated_at is not distinct from old.updated_at then
    -- Identical timestamps: allow metadata refresh but bump clock slightly
    -- only when payload actually changes beyond updated_at.
    if new is not distinct from old then
      return null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_film_preferences_set_updated_at
  on public.user_film_preferences;
create trigger user_film_preferences_set_updated_at
  before update on public.user_film_preferences
  for each row
  execute function public.set_user_film_preferences_updated_at();

alter table public.user_film_preferences enable row level security;

drop policy if exists "user_film_preferences_select_own"
  on public.user_film_preferences;
create policy "user_film_preferences_select_own"
  on public.user_film_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_film_preferences_insert_own"
  on public.user_film_preferences;
create policy "user_film_preferences_insert_own"
  on public.user_film_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_film_preferences_update_own"
  on public.user_film_preferences;
create policy "user_film_preferences_update_own"
  on public.user_film_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No DELETE policy: routine sync uses tombstones (is_active=false).
-- No anon / public grants.

revoke all on table public.user_film_preferences from anon;
revoke all on table public.user_film_preferences from public;
grant select, insert, update on table public.user_film_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- user_sync_state (account-level attachment / last sync markers)
-- ---------------------------------------------------------------------------
create table if not exists public.user_sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  film_preferences_attached_at timestamptz null,
  film_preferences_last_synced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_sync_state is
  'Account-level sync markers. Does not force every browser to attach; each browser keeps its own local attachment record.';

create or replace function public.set_user_sync_state_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_sync_state.user_id cannot be reassigned';
  end if;
  return new;
end;
$$;

drop trigger if exists user_sync_state_set_updated_at on public.user_sync_state;
create trigger user_sync_state_set_updated_at
  before update on public.user_sync_state
  for each row
  execute function public.set_user_sync_state_updated_at();

alter table public.user_sync_state enable row level security;

drop policy if exists "user_sync_state_select_own" on public.user_sync_state;
create policy "user_sync_state_select_own"
  on public.user_sync_state
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_sync_state_insert_own" on public.user_sync_state;
create policy "user_sync_state_insert_own"
  on public.user_sync_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_sync_state_update_own" on public.user_sync_state;
create policy "user_sync_state_update_own"
  on public.user_sync_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.user_sync_state from anon;
revoke all on table public.user_sync_state from public;
grant select, insert, update on table public.user_sync_state to authenticated;
