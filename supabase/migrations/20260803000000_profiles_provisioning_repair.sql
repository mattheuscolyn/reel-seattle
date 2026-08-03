-- T-ACCOUNT-PROFILE-PROVISION-01: repair profile signup trigger + backfill
-- Forward-only. Do not edit 20260729000000_profiles_foundation.sql.
-- Idempotent: safe to re-run. Does not overwrite existing profile values.

-- Ensure table exists (no-op if foundation already applied).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text null,
  display_name text null,
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx
  on public.profiles (username)
  where username is not null;

-- updated_at helper (idempotent replace)
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

-- Signup provisioning: SECURITY DEFINER with pinned search_path.
-- Reads only NEW from auth.users trigger; never trusts client-supplied IDs.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta_name text;
  meta_avatar text;
begin
  meta_name := nullif(
    trim(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        new.raw_user_meta_data ->> 'display_name',
        ''
      )
    ),
    ''
  );
  meta_avatar := nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '');

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, meta_name, meta_avatar)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Never block auth.users insert if optional profile creation fails.
    raise warning 'handle_new_user_profile failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public;
revoke all on function public.handle_new_user_profile() from anon, authenticated;
-- Trigger executes as definer; no direct execute needed for end users.

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

-- Backfill missing profiles for existing auth users (no overwrite).
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  nullif(
    trim(
      coalesce(
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name',
        u.raw_user_meta_data ->> 'display_name',
        ''
      )
    ),
    ''
  ),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'avatar_url', '')), '')
from auth.users u
on conflict (id) do nothing;

-- Preserve / re-assert own-row RLS (idempotent).
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

comment on function public.handle_new_user_profile() is
  'T-ACCOUNT-PROFILE-PROVISION-01: create public.profiles row for new auth.users (idempotent).';
