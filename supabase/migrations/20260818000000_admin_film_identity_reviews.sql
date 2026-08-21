-- Admin TMDB match review: is_admin flag + film_identity_reviews.
-- Forward-only. Do not edit prior migrations.
--
-- Human setup after `supabase db push`:
--   1. Confirm your Google account has a public.profiles row.
--   2. In the SQL editor (postgres role), mark that row:
--        update public.profiles
--           set is_admin = true
--         where id = '<auth.users id for the admin account>';
--   3. Do not expose a client UI to toggle is_admin.
--
-- Profile recovery: client INSERT always stores is_admin=false. Client UPDATE
-- (including upsert-on-conflict) preserves the existing is_admin value and
-- ignores any client-supplied flag. If the profile row is deleted and later
-- re-inserted by the client, is_admin must be set again in SQL.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Internal Reel Seattle administrator. Set only from the dashboard / service role. Never client-writable.';

create or replace function public.guard_profiles_is_admin()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(auth.jwt() ->> 'role', '');

  -- authenticated/anon JWTs cannot grant or revoke admin.
  -- INSERT: always false (there is no prior row to preserve).
  -- UPDATE / upsert-on-conflict: keep the existing value, ignoring the payload.
  -- service_role JWT and postgres (empty jwt role) may set is_admin intentionally.
  if jwt_role in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    elsif tg_op = 'UPDATE' then
      new.is_admin := old.is_admin;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before insert or update on public.profiles
  for each row
  execute function public.guard_profiles_is_admin();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select p.is_admin
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.film_identity_reviews (
  id uuid primary key default gen_random_uuid(),
  source_identity_key text not null,
  source text not null,
  source_film_id text null,
  showtime_film_key text null,
  decision text not null
    check (decision in (
      'matched',
      'not_film',
      'multiple_shorts',
      'needs_follow_up'
    )),
  tmdb_id integer null check (tmdb_id is null or tmdb_id >= 1),
  admin_note text null,
  snapshot jsonb not null default '{}'::jsonb,
  reviewed_by uuid not null references auth.users (id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  active boolean not null default true,
  constraint film_identity_reviews_source_identity_key_key
    unique (source_identity_key),
  constraint film_identity_reviews_tmdb_id_matches_decision
    check (
      (decision = 'matched' and tmdb_id is not null)
      or (decision <> 'matched' and tmdb_id is null)
    )
);

comment on table public.film_identity_reviews is
  'Authoritative admin TMDB match decisions keyed by durable source_identity_key ({source}|id|{id} or {source}|key|{showtime_film_key}). Records are preserved; non-film and shorts programs are classified, never deleted.';

create index if not exists film_identity_reviews_decision_idx
  on public.film_identity_reviews (decision)
  where active;

create index if not exists film_identity_reviews_reviewed_at_idx
  on public.film_identity_reviews (reviewed_at desc);

create or replace function public.set_film_identity_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists film_identity_reviews_set_updated_at
  on public.film_identity_reviews;
create trigger film_identity_reviews_set_updated_at
  before update on public.film_identity_reviews
  for each row
  execute function public.set_film_identity_reviews_updated_at();

create or replace function public.guard_film_identity_reviews_writer()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$$;

drop trigger if exists film_identity_reviews_guard_writer
  on public.film_identity_reviews;
create trigger film_identity_reviews_guard_writer
  before insert or update on public.film_identity_reviews
  for each row
  execute function public.guard_film_identity_reviews_writer();

alter table public.film_identity_reviews enable row level security;

revoke all on table public.film_identity_reviews from anon;
revoke all on table public.film_identity_reviews from public;
grant select, insert, update on table public.film_identity_reviews to authenticated;
grant select, insert, update on table public.film_identity_reviews to service_role;
-- No DELETE: flagged and deferred identities must be preserved.

drop policy if exists "film_identity_reviews_select_admin"
  on public.film_identity_reviews;
create policy "film_identity_reviews_select_admin"
  on public.film_identity_reviews
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "film_identity_reviews_insert_admin"
  on public.film_identity_reviews;
create policy "film_identity_reviews_insert_admin"
  on public.film_identity_reviews
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "film_identity_reviews_update_admin"
  on public.film_identity_reviews;
create policy "film_identity_reviews_update_admin"
  on public.film_identity_reviews
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
