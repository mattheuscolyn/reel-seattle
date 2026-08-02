-- T-AUTH-01: profiles foundation + RLS
-- Apply with Supabase CLI (`supabase db push`) or SQL editor.
-- Does not migrate local browser stores.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text null,
  display_name text null,
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Reel Seattle user profile (T-AUTH-01). Minimal identity only; cloud sync of local stores is deferred.';

comment on column public.profiles.username is
  'Optional public username. Uniqueness deferred until profile editing ships.';

create index if not exists profiles_username_idx
  on public.profiles (username)
  where username is not null;

-- Keep updated_at current on row changes.
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
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

-- Create a profile row when a new auth user is inserted.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
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
    -- Never block auth.users insert because optional profile metadata failed.
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;

-- Anonymous users: no access (no policies for anon).
-- Authenticated users: own row only.

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

-- Intentionally no delete policy for end users in T-AUTH-01.
-- Account deletion / cascade remains an auth.users concern (on delete cascade).

comment on policy "profiles_select_own" on public.profiles is
  'Users may read only their own profile row (auth.uid() = id).';

comment on policy "profiles_insert_own" on public.profiles is
  'Users may insert only their own profile row; preferred path is the auth.users trigger.';

comment on policy "profiles_update_own" on public.profiles is
  'Users may update only their own profile row.';
